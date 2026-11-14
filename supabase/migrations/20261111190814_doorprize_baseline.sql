-- Generated baseline: schema + migrations 001–005. SHA-256 4b5834832ff3bf9b5be68764139368d495abafce47cac352918eed6cd77ff785
-- Tidak mengubah skema yang sudah ada. Perubahan berikutnya memakai migrasi baru.
DO $doorprize_baseline$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'doorprize') THEN
    EXECUTE $doorprize_legacy_schema$
-- Skema awal PostgreSQL untuk database BARU. Belum diterapkan ke database mana pun.
-- Jalankan sekali pada database kosong; perubahan berikutnya menggunakan migrasi.

CREATE SCHEMA doorprize;
REVOKE ALL ON SCHEMA doorprize FROM PUBLIC;

CREATE TABLE doorprize.events (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    owner_id uuid NOT NULL,
    settings_version bigint NOT NULL DEFAULT 1,
    client_name text,
    event_name text,
    event_at timestamptz,
    show_event_info boolean NOT NULL DEFAULT false,
    winner_count integer NOT NULL DEFAULT 1 CHECK (winner_count > 0),
    prize_mode text NOT NULL DEFAULT 'none' CHECK (prize_mode IN ('none', 'random', 'selected')),
    duplicate_on_name boolean NOT NULL DEFAULT false,
    visual_settings jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(visual_settings) = 'object'),
    version bigint NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX events_owner_idx ON doorprize.events (owner_id, id DESC);

-- Nama selalu tersedia pada participants.name. Hanya tiga slot tambahan.
CREATE TABLE doorprize.event_fields (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id bigint NOT NULL REFERENCES doorprize.events(id),
    slot smallint NOT NULL CHECK (slot BETWEEN 1 AND 3),
    label text NOT NULL CHECK (length(trim(label)) > 0),
    use_for_duplicates boolean NOT NULL DEFAULT false,
    UNIQUE (event_id, slot),
    UNIQUE (event_id, label)
);

CREATE TABLE doorprize.import_sources (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id bigint NOT NULL REFERENCES doorprize.events(id),
    type text NOT NULL CHECK (type IN ('excel', 'google_sheets')),
    spreadsheet_id text,
    sheet_name text,
    column_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
    sync_enabled boolean NOT NULL DEFAULT false,
    closes_at timestamptz,
    disconnected_at timestamptz,
    sync_cursor jsonb NOT NULL DEFAULT '{}'::jsonb,
    last_synced_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id, event_id)
);
CREATE INDEX import_sources_event_idx ON doorprize.import_sources (event_id, id);

CREATE TABLE doorprize.participants (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id bigint NOT NULL REFERENCES doorprize.events(id),
    name text NOT NULL CHECK (length(trim(name)) > 0),
    field_1 text,
    field_2 text,
    field_3 text,
    status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'duplicate', 'eliminated', 'winner')),
    duplicate_of_id bigint,
    duplicate_key text,
    source_id bigint,
    source_row_key text,
    source_hash text,
    version bigint NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id, event_id),
    FOREIGN KEY (source_id, event_id) REFERENCES doorprize.import_sources(id, event_id),
    FOREIGN KEY (duplicate_of_id, event_id) REFERENCES doorprize.participants(id, event_id),
    CHECK (duplicate_of_id IS NULL OR duplicate_of_id <> id)
);
CREATE INDEX participants_status_page_idx ON doorprize.participants (event_id, status, id);
CREATE INDEX participants_available_idx ON doorprize.participants (event_id, id) WHERE status = 'available';
CREATE INDEX participants_duplicate_key_idx ON doorprize.participants (event_id, duplicate_key) WHERE duplicate_key IS NOT NULL;
CREATE UNIQUE INDEX participants_source_row_idx ON doorprize.participants (source_id, source_row_key) WHERE source_id IS NOT NULL AND source_row_key IS NOT NULL;
CREATE INDEX participants_duplicate_of_idx ON doorprize.participants (duplicate_of_id) WHERE duplicate_of_id IS NOT NULL;

CREATE TABLE doorprize.prizes (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id bigint NOT NULL REFERENCES doorprize.events(id),
    name text NOT NULL CHECK (length(trim(name)) > 0),
    initial_quantity integer NOT NULL CHECK (initial_quantity >= 0),
    remaining_quantity integer NOT NULL CHECK (remaining_quantity >= 0 AND remaining_quantity <= initial_quantity),
    sort_order integer NOT NULL DEFAULT 0,
    background_path text,
    version bigint NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id, event_id)
);
CREATE INDEX prizes_event_order_idx ON doorprize.prizes (event_id, sort_order, id);
CREATE INDEX prizes_available_idx ON doorprize.prizes (event_id, sort_order, id) WHERE remaining_quantity > 0;

CREATE TABLE doorprize.draws (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id bigint NOT NULL REFERENCES doorprize.events(id),
    sequence_number integer NOT NULL CHECK (sequence_number > 0),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'eliminated', 'cleared')),
    prize_mode text NOT NULL CHECK (prize_mode IN ('none', 'random', 'selected')),
    requested_count integer NOT NULL CHECK (requested_count > 0),
    filters jsonb NOT NULL DEFAULT '{}'::jsonb,
    idempotency_key uuid NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    resolved_at timestamptz,
    UNIQUE (event_id, sequence_number),
    UNIQUE (id, event_id),
    CHECK ((status = 'pending' AND resolved_at IS NULL) OR (status <> 'pending' AND resolved_at IS NOT NULL))
);
-- Satu hasil aktif per acara; cegah pengesahan ganda lewat beberapa tab operator.
CREATE UNIQUE INDEX draws_pending_event_idx ON doorprize.draws (event_id) WHERE status = 'pending';
CREATE INDEX draws_history_idx ON doorprize.draws (event_id, id DESC);

CREATE TABLE doorprize.draw_entries (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id bigint NOT NULL REFERENCES doorprize.events(id),
    draw_id bigint NOT NULL,
    participant_id bigint NOT NULL,
    prize_id bigint,
    position integer NOT NULL CHECK (position > 0),
    participant_snapshot jsonb NOT NULL CHECK (jsonb_typeof(participant_snapshot) = 'object'),
    prize_name_snapshot text,
    FOREIGN KEY (draw_id, event_id) REFERENCES doorprize.draws(id, event_id),
    FOREIGN KEY (participant_id, event_id) REFERENCES doorprize.participants(id, event_id),
    FOREIGN KEY (prize_id, event_id) REFERENCES doorprize.prizes(id, event_id),
    UNIQUE (draw_id, participant_id),
    UNIQUE (draw_id, position)
);
CREATE INDEX draw_entries_participant_idx ON doorprize.draw_entries (participant_id);
CREATE INDEX draw_entries_prize_idx ON doorprize.draw_entries (prize_id) WHERE prize_id IS NOT NULL;
CREATE INDEX draw_entries_event_idx ON doorprize.draw_entries (event_id, draw_id, position);

CREATE TABLE doorprize.audit_log (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id bigint NOT NULL REFERENCES doorprize.events(id),
    actor_id uuid NOT NULL,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id bigint,
    changes jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_event_page_idx ON doorprize.audit_log (event_id, id DESC);

-- Privat dan deny-by-default. Integrasi Auth harus menambahkan policy akses
-- pemilik sebelum role aplikasi non-owner diberi akses. Jangan buka Data API dulu.
ALTER TABLE doorprize.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE doorprize.event_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE doorprize.import_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE doorprize.participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE doorprize.prizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE doorprize.draws ENABLE ROW LEVEL SECURITY;
ALTER TABLE doorprize.draw_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE doorprize.audit_log ENABLE ROW LEVEL SECURITY;


ALTER TABLE doorprize.event_fields ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 1;

ALTER TABLE doorprize.events ADD COLUMN IF NOT EXISTS settings_version bigint NOT NULL DEFAULT 1;

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

$doorprize_legacy_schema$;
  END IF;
END
$doorprize_baseline$;
