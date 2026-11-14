BEGIN;
ALTER TABLE doorprize.events ADD COLUMN IF NOT EXISTS participants_version bigint NOT NULL DEFAULT 1;
ALTER TABLE doorprize.events ADD COLUMN IF NOT EXISTS draw_filters jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(draw_filters) = 'object');
ALTER TABLE doorprize.events ADD COLUMN IF NOT EXISTS filter_pool_active boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS doorprize.draw_filter_pool (
  event_id bigint NOT NULL,
  participant_id bigint NOT NULL,
  position bigint NOT NULL CHECK (position > 0),
  PRIMARY KEY (event_id, position),
  UNIQUE (event_id, participant_id)
);
-- Cache turunan, bukan relasi hasil undian. Sumber/mutasi divalidasi di bawah lock acara;
-- Stop tetap join peserta kanonik + predikat. Hindari pemeriksaan FK per baris saat cache dibentuk.
ALTER TABLE doorprize.draw_filter_pool DROP CONSTRAINT IF EXISTS draw_filter_pool_participant_id_event_id_fkey;
ALTER TABLE doorprize.draw_filter_pool ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS participants_name_filter_idx ON doorprize.participants (event_id, name, id);
CREATE INDEX IF NOT EXISTS participants_field_1_filter_idx ON doorprize.participants (event_id, (COALESCE(field_1, '')), id);
CREATE INDEX IF NOT EXISTS participants_field_2_filter_idx ON doorprize.participants (event_id, (COALESCE(field_2, '')), id);
CREATE INDEX IF NOT EXISTS participants_field_3_filter_idx ON doorprize.participants (event_id, (COALESCE(field_3, '')), id);
CREATE INDEX IF NOT EXISTS participants_name_prefix_idx ON doorprize.participants (event_id, lower(name) text_pattern_ops);

CREATE OR REPLACE FUNCTION doorprize.participant_matches_filter(person jsonb, filters jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM jsonb_each(filters) item WHERE NOT (
      CASE item.value->>'mode'
        WHEN 'include' THEN (item.value->'values') @> jsonb_build_array(COALESCE(person->>item.key, ''))
        WHEN 'exclude' THEN NOT ((item.value->'values') @> jsonb_build_array(COALESCE(person->>item.key, '')))
        ELSE false
      END
    )
  )
$$;
CREATE OR REPLACE FUNCTION doorprize.maintain_draw_filter_pool() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  workspace_id bigint;
  person_id bigint;
  filters jsonb;
  active boolean;
  old_position bigint;
  last_position bigint;
  last_person bigint;
  matches boolean;
BEGIN
  workspace_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.event_id ELSE NEW.event_id END;
  person_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  SELECT draw_filters, filter_pool_active INTO filters, active FROM doorprize.events WHERE id = workspace_id FOR UPDATE;
  IF NOT active THEN RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END; END IF;
  SELECT position INTO old_position FROM doorprize.draw_filter_pool WHERE event_id = workspace_id AND participant_id = person_id;
  matches := TG_OP <> 'DELETE' AND NEW.status = 'available' AND doorprize.participant_matches_filter(to_jsonb(NEW), filters);
  IF matches AND old_position IS NULL THEN
    SELECT COALESCE(maximum.position, 0) INTO last_position FROM (SELECT 1) anchor LEFT JOIN LATERAL
      (SELECT position FROM doorprize.draw_filter_pool WHERE event_id = workspace_id ORDER BY position DESC LIMIT 1) maximum ON true;
    INSERT INTO doorprize.draw_filter_pool (event_id, participant_id, position) VALUES (workspace_id, person_id, last_position + 1);
  ELSIF NOT matches AND old_position IS NOT NULL THEN
    DELETE FROM doorprize.draw_filter_pool WHERE event_id = workspace_id AND participant_id = person_id;
    SELECT position, participant_id INTO last_position, last_person FROM doorprize.draw_filter_pool WHERE event_id = workspace_id ORDER BY position DESC LIMIT 1 FOR UPDATE;
    IF last_position > old_position THEN
      UPDATE doorprize.draw_filter_pool SET position = old_position WHERE event_id = workspace_id AND participant_id = last_person;
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
DROP TRIGGER IF EXISTS draw_filter_pool_change ON doorprize.participants;
CREATE TRIGGER draw_filter_pool_change AFTER INSERT OR UPDATE OF name, field_1, field_2, field_3, status, event_id ON doorprize.participants FOR EACH ROW EXECUTE FUNCTION doorprize.maintain_draw_filter_pool();
DROP TRIGGER IF EXISTS draw_filter_pool_delete ON doorprize.participants;
CREATE TRIGGER draw_filter_pool_delete BEFORE DELETE ON doorprize.participants FOR EACH ROW EXECUTE FUNCTION doorprize.maintain_draw_filter_pool();

CREATE OR REPLACE FUNCTION doorprize.touch_participants_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- API mengunci acara sebelum menulis. Versi berubah sekali per statement, bukan per peserta.
  IF TG_OP = 'INSERT' THEN
    UPDATE doorprize.events SET participants_version = participants_version + 1 WHERE id IN (SELECT DISTINCT event_id FROM new_participants);
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE doorprize.events SET participants_version = participants_version + 1 WHERE id IN (SELECT DISTINCT event_id FROM old_participants);
  ELSE
    UPDATE doorprize.events SET participants_version = participants_version + 1 WHERE id IN (SELECT event_id FROM new_participants UNION SELECT event_id FROM old_participants);
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS participants_version_insert ON doorprize.participants;
CREATE TRIGGER participants_version_insert AFTER INSERT ON doorprize.participants REFERENCING NEW TABLE AS new_participants FOR EACH STATEMENT EXECUTE FUNCTION doorprize.touch_participants_version();
DROP TRIGGER IF EXISTS participants_version_update ON doorprize.participants;
CREATE TRIGGER participants_version_update AFTER UPDATE ON doorprize.participants REFERENCING OLD TABLE AS old_participants NEW TABLE AS new_participants FOR EACH STATEMENT EXECUTE FUNCTION doorprize.touch_participants_version();
DROP TRIGGER IF EXISTS participants_version_delete ON doorprize.participants;
CREATE TRIGGER participants_version_delete AFTER DELETE ON doorprize.participants REFERENCING OLD TABLE AS old_participants FOR EACH STATEMENT EXECUTE FUNCTION doorprize.touch_participants_version();
COMMIT;
