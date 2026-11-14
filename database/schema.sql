-- Skema awal PostgreSQL untuk database BARU. Belum diterapkan ke database mana pun.
-- Jalankan sekali pada database kosong; perubahan berikutnya menggunakan migrasi.
BEGIN;

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

COMMIT;
