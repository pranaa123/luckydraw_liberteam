BEGIN;
CREATE TABLE IF NOT EXISTS doorprize.google_sources (
  source_id bigint PRIMARY KEY,
  event_id bigint NOT NULL REFERENCES doorprize.events(id),
  connection_id uuid NOT NULL UNIQUE,
  endpoint text NOT NULL,
  encrypted_secret text,
  sheet_id integer,
  header_row integer NOT NULL DEFAULT 1 CHECK(header_row BETWEEN 1 AND 1048575),
  field_schema text NOT NULL DEFAULT '',
  header_hash text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  phase text NOT NULL DEFAULT 'draft' CHECK(phase IN ('draft','initial','live','paused','closed','disconnected')),
  version bigint NOT NULL DEFAULT 1,
  initial_complete boolean NOT NULL DEFAULT false,
  revision bigint NOT NULL DEFAULT 0,
  lease_id uuid,
  lease_until timestamptz,
  pending_job_id uuid,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  failure_count integer NOT NULL DEFAULT 0,
  error_code text,
  error_message text,
  synced_rows integer NOT NULL DEFAULT 0,
  invalid_rows integer NOT NULL DEFAULT 0,
  conflict_rows integer NOT NULL DEFAULT 0,
  last_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_id,event_id),
  FOREIGN KEY(source_id,event_id) REFERENCES doorprize.import_sources(id,event_id)
);
ALTER TABLE doorprize.google_sources ADD COLUMN IF NOT EXISTS initial_complete boolean NOT NULL DEFAULT false;
ALTER TABLE doorprize.google_sources ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0;
ALTER TABLE doorprize.google_sources ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS google_sources_event_idx ON doorprize.google_sources(event_id,source_id);
CREATE TABLE IF NOT EXISTS doorprize.google_rows (
  source_id bigint NOT NULL,
  event_id bigint NOT NULL,
  row_key uuid NOT NULL,
  row_number integer NOT NULL CHECK(row_number > 0),
  participant_id bigint,
  source_data jsonb NOT NULL CHECK(jsonb_typeof(source_data) = 'object'),
  source_hash text NOT NULL,
  incoming_data jsonb,
  incoming_hash text,
  seen_snapshot uuid,
  issue text,
  issue_message text,
  deleted boolean NOT NULL DEFAULT false,
  locally_removed boolean NOT NULL DEFAULT false,
  version bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(source_id,row_key),
  FOREIGN KEY(source_id,event_id) REFERENCES doorprize.google_sources(source_id,event_id),
  FOREIGN KEY(participant_id,event_id) REFERENCES doorprize.participants(id,event_id)
);
ALTER TABLE doorprize.google_rows ADD COLUMN IF NOT EXISTS issue_message text;
CREATE INDEX IF NOT EXISTS google_rows_participant_idx ON doorprize.google_rows(event_id,participant_id) WHERE participant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS google_rows_issue_idx ON doorprize.google_rows(event_id,source_id,row_key) WHERE issue IS NOT NULL;
ALTER TABLE doorprize.google_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE doorprize.google_rows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON doorprize.google_sources, doorprize.google_rows FROM PUBLIC;
COMMIT;
