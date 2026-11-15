BEGIN;
ALTER TABLE doorprize.google_sources ADD COLUMN IF NOT EXISTS reader_protocol smallint NOT NULL DEFAULT 1;
ALTER TABLE doorprize.google_sources ALTER COLUMN reader_protocol SET DEFAULT 2;
ALTER TABLE doorprize.google_rows ADD COLUMN IF NOT EXISTS reader_anchor text;
ALTER TABLE doorprize.google_rows ADD COLUMN IF NOT EXISTS reader_review boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS google_rows_reader_anchor_idx ON doorprize.google_rows(source_id,reader_anchor) WHERE reader_anchor IS NOT NULL AND NOT deleted;
CREATE INDEX IF NOT EXISTS google_rows_reader_position_idx ON doorprize.google_rows(source_id,row_number) WHERE NOT deleted;

CREATE TABLE IF NOT EXISTS doorprize.google_reader_snapshot_rows (
    source_id bigint NOT NULL,
    event_id bigint NOT NULL,
    snapshot_id uuid NOT NULL,
    row_number integer NOT NULL CHECK(row_number>0),
    data jsonb NOT NULL CHECK(jsonb_typeof(data)='object'),
    fingerprint text GENERATED ALWAYS AS (md5(data::text)) STORED,
    anchor text,
    issue text,
    row_key uuid,
    review boolean NOT NULL DEFAULT false,
    PRIMARY KEY(source_id,snapshot_id,row_number),
    FOREIGN KEY(source_id,event_id) REFERENCES doorprize.google_sources(source_id,event_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS google_reader_snapshot_fingerprint_idx ON doorprize.google_reader_snapshot_rows(source_id,snapshot_id,fingerprint,row_number);
CREATE UNIQUE INDEX IF NOT EXISTS google_reader_snapshot_identity_idx ON doorprize.google_reader_snapshot_rows(source_id,snapshot_id,row_key) WHERE row_key IS NOT NULL;
ALTER TABLE doorprize.google_reader_snapshot_rows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON doorprize.google_reader_snapshot_rows FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON doorprize.google_reader_snapshot_rows TO doorprize_app;
DO $migration$ BEGIN
IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='doorprize' AND tablename='google_reader_snapshot_rows' AND policyname='owner_access') THEN
    CREATE POLICY owner_access ON doorprize.google_reader_snapshot_rows TO doorprize_app
    USING(event_id IN(SELECT id FROM doorprize.events)) WITH CHECK(event_id IN(SELECT id FROM doorprize.events));
END IF;
END $migration$;
COMMIT;
