BEGIN;
ALTER TABLE doorprize.events ADD COLUMN IF NOT EXISTS draw_version bigint NOT NULL DEFAULT 0;
ALTER TABLE doorprize.events ADD COLUMN IF NOT EXISTS display_draw_id bigint;
ALTER TABLE doorprize.events ADD COLUMN IF NOT EXISTS draw_allocation jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE doorprize.draws ADD COLUMN IF NOT EXISTS phase text NOT NULL DEFAULT 'result' CHECK (phase IN ('rolling', 'result'));
ALTER TABLE doorprize.draws ADD COLUMN IF NOT EXISTS animation_seed bigint NOT NULL DEFAULT 0;
ALTER TABLE doorprize.draws ADD COLUMN IF NOT EXISTS sample_names jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE doorprize.draws ADD COLUMN IF NOT EXISTS allocation jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE doorprize.draws ADD COLUMN IF NOT EXISTS field_definitions jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE doorprize.draws ADD COLUMN IF NOT EXISTS request_hash text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_display_draw_fk' AND conrelid = 'doorprize.events'::regclass) THEN
    ALTER TABLE doorprize.events ADD CONSTRAINT events_display_draw_fk FOREIGN KEY (display_draw_id, id) REFERENCES doorprize.draws(id, event_id);
  END IF;
  IF to_regclass('doorprize.participant_pool') IS NULL THEN
    CREATE TABLE doorprize.participant_pool (
      event_id bigint NOT NULL,
      participant_id bigint NOT NULL,
      position bigint NOT NULL CHECK (position > 0),
      PRIMARY KEY (event_id, position),
      UNIQUE (event_id, participant_id),
      FOREIGN KEY (participant_id, event_id) REFERENCES doorprize.participants(id, event_id)
    );
    ALTER TABLE doorprize.participant_pool ENABLE ROW LEVEL SECURITY;
    INSERT INTO doorprize.participant_pool (event_id, participant_id, position)
      SELECT event_id, id, row_number() OVER (PARTITION BY event_id ORDER BY id)
      FROM doorprize.participants WHERE status = 'available';
  END IF;
END $$;

-- Slot rapat membuat pengambilan acak memakai primary key, tanpa scan nama/OFFSET.
-- Penghapusan menukar slot terakhir ke slot kosong, tetap atomik bersama status.
CREATE OR REPLACE FUNCTION doorprize.maintain_participant_pool() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  workspace_id bigint;
  person_id bigint;
  removed_position bigint;
  last_position bigint;
  last_person bigint;
  was_available boolean;
  now_available boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.event_id <> NEW.event_id THEN
    RAISE EXCEPTION 'Acara peserta tidak dapat dipindah.';
  END IF;
  workspace_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.event_id ELSE NEW.event_id END;
  person_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  was_available := TG_OP <> 'INSERT' AND OLD.status = 'available';
  now_available := TG_OP <> 'DELETE' AND NEW.status = 'available';
  IF was_available = now_available THEN RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END; END IF;
  PERFORM id FROM doorprize.events WHERE id = workspace_id FOR UPDATE;
  IF now_available THEN
    SELECT COALESCE(maximum.position, 0) INTO last_position FROM
      (SELECT 1) anchor LEFT JOIN LATERAL
      (SELECT position FROM doorprize.participant_pool WHERE event_id = workspace_id ORDER BY position DESC LIMIT 1) maximum ON true;
    INSERT INTO doorprize.participant_pool (event_id, participant_id, position) VALUES (workspace_id, person_id, last_position + 1);
  ELSE
    DELETE FROM doorprize.participant_pool WHERE event_id = workspace_id AND participant_id = person_id RETURNING position INTO removed_position;
    SELECT position, participant_id INTO last_position, last_person FROM doorprize.participant_pool
      WHERE event_id = workspace_id ORDER BY position DESC LIMIT 1 FOR UPDATE;
    IF last_position > removed_position THEN
      UPDATE doorprize.participant_pool SET position = removed_position WHERE event_id = workspace_id AND participant_id = last_person;
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
DROP TRIGGER IF EXISTS participant_pool_change ON doorprize.participants;
CREATE TRIGGER participant_pool_change AFTER INSERT OR UPDATE OF status, event_id ON doorprize.participants FOR EACH ROW EXECUTE FUNCTION doorprize.maintain_participant_pool();
DROP TRIGGER IF EXISTS participant_pool_delete ON doorprize.participants;
CREATE TRIGGER participant_pool_delete BEFORE DELETE ON doorprize.participants FOR EACH ROW EXECUTE FUNCTION doorprize.maintain_participant_pool();
COMMIT;
