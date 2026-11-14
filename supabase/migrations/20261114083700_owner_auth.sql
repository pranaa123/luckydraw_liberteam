BEGIN;

CREATE SCHEMA IF NOT EXISTS doorprize_auth;
REVOKE ALL ON SCHEMA doorprize_auth FROM PUBLIC;
CREATE TABLE IF NOT EXISTS doorprize_auth.users (
    id uuid PRIMARY KEY,
    email text NOT NULL UNIQUE CHECK (email = lower(trim(email))),
    password_hash text NOT NULL,
    enabled boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS doorprize_auth.sessions (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES doorprize_auth.users(id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON doorprize_auth.sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON doorprize_auth.sessions(expires_at);
CREATE TABLE IF NOT EXISTS doorprize_auth.login_attempts (
    key text PRIMARY KEY,
    attempts integer NOT NULL,
    started_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE doorprize_auth.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE doorprize_auth.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE doorprize_auth.login_attempts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS doorprize.background_assets (
    path text NOT NULL,
    event_id bigint NOT NULL REFERENCES doorprize.events(id),
    PRIMARY KEY(path, event_id)
);
CREATE INDEX IF NOT EXISTS background_assets_event_idx ON doorprize.background_assets(event_id);
ALTER TABLE doorprize.background_assets ENABLE ROW LEVEL SECURITY;
-- Pertahankan background yang sudah tersimpan sebelum login ditambahkan.
INSERT INTO doorprize.background_assets(path,event_id)
SELECT visual_settings->>'background_image', id FROM doorprize.events
WHERE visual_settings->>'background_image' ~ '^/assets/backgrounds/[a-f0-9]{32}\.(png|jpg|webp)$'
UNION
SELECT background_path,event_id FROM doorprize.prizes
WHERE background_path ~ '^/assets/backgrounds/[a-f0-9]{32}\.(png|jpg|webp)$'
ON CONFLICT DO NOTHING;

DO $migration$
DECLARE item record;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='doorprize_app') THEN
        CREATE ROLE doorprize_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
    END IF;
    EXECUTE format('GRANT doorprize_app TO %I', current_user);
    GRANT USAGE ON SCHEMA doorprize TO doorprize_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA doorprize TO doorprize_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA doorprize TO doorprize_app;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='doorprize' AND tablename='events' AND policyname='owner_access') THEN
        CREATE POLICY owner_access ON doorprize.events TO doorprize_app
        USING (owner_id = nullif(current_setting('doorprize.owner_id',true),'')::uuid)
        WITH CHECK (owner_id = nullif(current_setting('doorprize.owner_id',true),'')::uuid);
    END IF;
    FOR item IN SELECT tablename FROM pg_tables WHERE schemaname='doorprize' AND tablename<>'events' LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='doorprize' AND tablename=item.tablename AND policyname='owner_access') THEN
            IF item.tablename IN ('import_rows','import_chunks') THEN
                EXECUTE format('CREATE POLICY owner_access ON doorprize.%I TO doorprize_app USING (batch_id IN (SELECT id FROM doorprize.import_batches)) WITH CHECK (batch_id IN (SELECT id FROM doorprize.import_batches))',item.tablename);
            ELSE
                EXECUTE format('CREATE POLICY owner_access ON doorprize.%I TO doorprize_app USING (event_id IN (SELECT id FROM doorprize.events)) WITH CHECK (event_id IN (SELECT id FROM doorprize.events))',item.tablename);
            END IF;
        END IF;
    END LOOP;
END
$migration$;

COMMIT;
