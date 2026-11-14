BEGIN;
ALTER TABLE doorprize.events ADD COLUMN IF NOT EXISTS reset_generation bigint NOT NULL DEFAULT 0 CHECK(reset_generation>=0);
ALTER TABLE doorprize.events ADD COLUMN IF NOT EXISTS asset_cleanup jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(asset_cleanup)='array');

CREATE OR REPLACE FUNCTION doorprize.maintain_participant_pool() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
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
  -- Reset menghapus kedua pool secara set-based dalam transaksi yang sama.
  IF TG_OP = 'DELETE' AND current_setting('doorprize.reset_event',true) = workspace_id::text THEN RETURN OLD; END IF;
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


CREATE OR REPLACE FUNCTION doorprize.maintain_draw_filter_pool() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
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
  -- Reset menghapus kedua pool secara set-based dalam transaksi yang sama.
  IF TG_OP = 'DELETE' AND current_setting('doorprize.reset_event',true) = workspace_id::text THEN RETURN OLD; END IF;
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

COMMIT;
