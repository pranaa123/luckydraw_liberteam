BEGIN;
ALTER TABLE doorprize.participants ADD COLUMN IF NOT EXISTS field_4 text;
ALTER TABLE doorprize.participants ADD COLUMN IF NOT EXISTS field_5 text;
ALTER TABLE doorprize.participants ADD COLUMN IF NOT EXISTS field_6 text;
ALTER TABLE doorprize.participants ADD COLUMN IF NOT EXISTS field_7 text;
ALTER TABLE doorprize.participants ADD COLUMN IF NOT EXISTS field_8 text;
ALTER TABLE doorprize.participants ADD COLUMN IF NOT EXISTS field_9 text;
ALTER TABLE doorprize.participants ADD COLUMN IF NOT EXISTS field_10 text;
ALTER TABLE doorprize.import_rows ADD COLUMN IF NOT EXISTS field_4 text;
ALTER TABLE doorprize.import_rows ADD COLUMN IF NOT EXISTS field_5 text;
ALTER TABLE doorprize.import_rows ADD COLUMN IF NOT EXISTS field_6 text;
ALTER TABLE doorprize.import_rows ADD COLUMN IF NOT EXISTS field_7 text;
ALTER TABLE doorprize.import_rows ADD COLUMN IF NOT EXISTS field_8 text;
ALTER TABLE doorprize.import_rows ADD COLUMN IF NOT EXISTS field_9 text;
ALTER TABLE doorprize.import_rows ADD COLUMN IF NOT EXISTS field_10 text;
ALTER TABLE doorprize.event_fields DROP CONSTRAINT IF EXISTS event_fields_slot_check;
ALTER TABLE doorprize.event_fields ADD CONSTRAINT event_fields_slot_check CHECK(slot BETWEEN 1 AND 10);
ALTER TABLE doorprize.events DROP CONSTRAINT IF EXISTS events_duplicate_keys_check;
ALTER TABLE doorprize.events ADD CONSTRAINT events_duplicate_keys_check CHECK(jsonb_typeof(duplicate_keys)='array' AND jsonb_array_length(duplicate_keys)<=11);
CREATE OR REPLACE FUNCTION doorprize.participant_data_quality(person_name text,field_1 text,field_2 text,field_3 text,field_4 text,field_5 text,field_6 text,field_7 text,field_8 text,field_9 text,field_10 text) RETURNS integer LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $quality$
BEGIN
  RETURN (CASE WHEN person_name ~ $pattern$^[[:alnum:][:space:]'.-]+$$pattern$ AND person_name !~ '[[:space:]]{2,}' THEN 1000 ELSE 0 END)
    + CASE WHEN person_name = initcap(person_name) AND person_name <> lower(person_name) THEN 300
      WHEN person_name <> lower(person_name) AND person_name <> upper(person_name) THEN 200
      WHEN person_name = upper(person_name) AND person_name <> lower(person_name) THEN 100 ELSE 0 END
    + 10 * (CASE WHEN btrim(COALESCE(person_name,''))<>'' THEN 1 ELSE 0 END
      + CASE WHEN btrim(COALESCE(field_1,''))<>'' THEN 1 ELSE 0 END
      + CASE WHEN btrim(COALESCE(field_2,''))<>'' THEN 1 ELSE 0 END
      + CASE WHEN btrim(COALESCE(field_3,''))<>'' THEN 1 ELSE 0 END
      + CASE WHEN btrim(COALESCE(field_4,''))<>'' THEN 1 ELSE 0 END
      + CASE WHEN btrim(COALESCE(field_5,''))<>'' THEN 1 ELSE 0 END
      + CASE WHEN btrim(COALESCE(field_6,''))<>'' THEN 1 ELSE 0 END
      + CASE WHEN btrim(COALESCE(field_7,''))<>'' THEN 1 ELSE 0 END
      + CASE WHEN btrim(COALESCE(field_8,''))<>'' THEN 1 ELSE 0 END
      + CASE WHEN btrim(COALESCE(field_9,''))<>'' THEN 1 ELSE 0 END
      + CASE WHEN btrim(COALESCE(field_10,''))<>'' THEN 1 ELSE 0 END);
END
$quality$;
DO $migration$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='doorprize.participants'::regclass AND a.attname='data_quality' AND pg_get_expr(d.adbin,d.adrelid) LIKE '%field_10%') THEN
DROP INDEX IF EXISTS doorprize.participants_duplicate_quality_idx;
ALTER TABLE doorprize.participants DROP COLUMN data_quality;
ALTER TABLE doorprize.participants ADD COLUMN data_quality integer GENERATED ALWAYS AS (doorprize.participant_data_quality(name,field_1,field_2,field_3,field_4,field_5,field_6,field_7,field_8,field_9,field_10)) STORED;
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='doorprize.import_rows'::regclass AND a.attname='data_quality' AND pg_get_expr(d.adbin,d.adrelid) LIKE '%field_10%') THEN
ALTER TABLE doorprize.import_rows DROP COLUMN data_quality;
ALTER TABLE doorprize.import_rows ADD COLUMN data_quality integer GENERATED ALWAYS AS (doorprize.participant_data_quality(name,field_1,field_2,field_3,field_4,field_5,field_6,field_7,field_8,field_9,field_10)) STORED;
END IF;
END $migration$;
CREATE INDEX IF NOT EXISTS participants_duplicate_quality_idx ON doorprize.participants(event_id,duplicate_key,data_quality DESC,id) WHERE duplicate_key IS NOT NULL;
DROP TRIGGER IF EXISTS participant_duplicate_key_prepare ON doorprize.participants;
CREATE TRIGGER participant_duplicate_key_prepare BEFORE INSERT OR UPDATE OF name,field_1,field_2,field_3,field_4,field_5,field_6,field_7,field_8,field_9,field_10 ON doorprize.participants FOR EACH ROW EXECUTE FUNCTION doorprize.prepare_participant_duplicate_key();
DROP TRIGGER IF EXISTS draw_filter_pool_change ON doorprize.participants;
CREATE TRIGGER draw_filter_pool_change AFTER INSERT OR UPDATE OF name,field_1,field_2,field_3,field_4,field_5,field_6,field_7,field_8,field_9,field_10,status,event_id ON doorprize.participants FOR EACH ROW EXECUTE FUNCTION doorprize.maintain_draw_filter_pool();
COMMIT;
