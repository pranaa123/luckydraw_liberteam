BEGIN;
ALTER TABLE doorprize.events ADD COLUMN IF NOT EXISTS duplicate_keys jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(duplicate_keys) = 'array' AND jsonb_array_length(duplicate_keys) <= 4);
ALTER TABLE doorprize.events ADD COLUMN IF NOT EXISTS duplicate_rule_version bigint NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION doorprize.participant_duplicate_key(person jsonb, keys jsonb) RETURNS text LANGUAGE sql IMMUTABLE AS $function$
  WITH normalized AS (
    SELECT ordinality, btrim(COALESCE(person->>value, '')) AS text
    FROM jsonb_array_elements_text(keys) WITH ORDINALITY
  ) SELECT CASE WHEN count(*) = 0 OR bool_or(text = '') THEN NULL
    ELSE encode(sha256(convert_to(jsonb_build_array(keys, jsonb_agg(lower(text) ORDER BY ordinality))::text, 'UTF8')), 'hex') END FROM normalized
$function$;

CREATE OR REPLACE FUNCTION doorprize.participant_data_quality(person_name text, one text, two text, three text) RETURNS integer LANGUAGE sql IMMUTABLE AS $function$
  SELECT (CASE WHEN person_name ~ $pattern$^[[:alnum:][:space:]'.-]+$$pattern$ AND person_name !~ '[[:space:]]{2,}' THEN 1000 ELSE 0 END)
    + CASE WHEN person_name = initcap(person_name) AND person_name <> lower(person_name) THEN 300
      WHEN person_name <> lower(person_name) AND person_name <> upper(person_name) THEN 200
      WHEN person_name = upper(person_name) AND person_name <> lower(person_name) THEN 100 ELSE 0 END
    + 10 * (SELECT count(*)::integer FROM unnest(ARRAY[person_name, one, two, three]) value WHERE btrim(COALESCE(value, '')) <> '')
$function$;
ALTER TABLE doorprize.participants ADD COLUMN IF NOT EXISTS data_quality integer GENERATED ALWAYS AS (doorprize.participant_data_quality(name, field_1, field_2, field_3)) STORED;
CREATE INDEX IF NOT EXISTS participants_duplicate_quality_idx ON doorprize.participants(event_id, duplicate_key, data_quality DESC, id) WHERE duplicate_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS participants_import_source_idx ON doorprize.participants(event_id, source_id, duplicate_key) WHERE source_id IS NOT NULL;

CREATE OR REPLACE FUNCTION doorprize.prepare_participant_duplicate_key() RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE keys jsonb;
BEGIN
  SELECT duplicate_keys INTO keys FROM doorprize.events WHERE id = NEW.event_id FOR UPDATE;
  NEW.duplicate_key := doorprize.participant_duplicate_key(to_jsonb(NEW), keys);
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS participant_duplicate_key_prepare ON doorprize.participants;
CREATE TRIGGER participant_duplicate_key_prepare BEFORE INSERT OR UPDATE OF name, field_1, field_2, field_3 ON doorprize.participants FOR EACH ROW EXECUTE FUNCTION doorprize.prepare_participant_duplicate_key();

CREATE TABLE IF NOT EXISTS doorprize.import_batches (
  id uuid PRIMARY KEY,
  event_id bigint NOT NULL REFERENCES doorprize.events(id),
  filename text NOT NULL,
  sheet_name text NOT NULL,
  field_schema text NOT NULL,
  mapping jsonb NOT NULL CHECK (jsonb_typeof(mapping) = 'object'),
  duplicate_keys jsonb NOT NULL CHECK (jsonb_typeof(duplicate_keys) = 'array'),
  request_hash text NOT NULL,
  expected_rows integer NOT NULL CHECK (expected_rows BETWEEN 1 AND 100000),
  uploaded_rows integer NOT NULL DEFAULT 0,
  next_chunk integer NOT NULL DEFAULT 0,
  next_row integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'committed')),
  preview_revision integer NOT NULL DEFAULT 0,
  participants_version bigint,
  rule_version bigint,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_id bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id, event_id),
  FOREIGN KEY(source_id, event_id) REFERENCES doorprize.import_sources(id, event_id)
);
CREATE INDEX IF NOT EXISTS import_batches_event_idx ON doorprize.import_batches(event_id, created_at);
CREATE TABLE IF NOT EXISTS doorprize.import_chunks (
  batch_id uuid NOT NULL REFERENCES doorprize.import_batches(id) ON DELETE CASCADE,
  chunk_number integer NOT NULL,
  content_hash text NOT NULL,
  PRIMARY KEY(batch_id, chunk_number)
);
CREATE TABLE IF NOT EXISTS doorprize.import_rows (
  batch_id uuid NOT NULL REFERENCES doorprize.import_batches(id) ON DELETE CASCADE,
  row_number integer NOT NULL CHECK (row_number > 0),
  name text NOT NULL,
  field_1 text,
  field_2 text,
  field_3 text,
  issue text,
  duplicate_key text,
  data_quality integer GENERATED ALWAYS AS (doorprize.participant_data_quality(name, field_1, field_2, field_3)) STORED,
  preview_status text NOT NULL DEFAULT 'unchecked' CHECK(preview_status IN ('unchecked', 'invalid', 'available', 'duplicate')),
  keeper_name text,
  PRIMARY KEY(batch_id, row_number)
);
CREATE INDEX IF NOT EXISTS import_rows_key_idx ON doorprize.import_rows(batch_id, duplicate_key) WHERE issue IS NULL;
ALTER TABLE doorprize.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE doorprize.import_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE doorprize.import_rows ENABLE ROW LEVEL SECURITY;
COMMIT;
