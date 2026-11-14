BEGIN;

-- Login diaktifkan terpisah melalui provisioning privat; password bukan migrasi.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='doorprize_server') THEN
    CREATE ROLE doorprize_server NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END $$;
GRANT doorprize_app TO doorprize_server;
GRANT USAGE ON SCHEMA doorprize_auth TO doorprize_server;
GRANT SELECT ON doorprize_auth.users TO doorprize_server;
GRANT SELECT, INSERT, DELETE ON doorprize_auth.sessions TO doorprize_server;
GRANT SELECT, INSERT, UPDATE, DELETE ON doorprize_auth.login_attempts TO doorprize_server;

DO $$ DECLARE item text; BEGIN
  FOREACH item IN ARRAY ARRAY['users','sessions','login_attempts'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='doorprize_auth' AND tablename=item AND policyname='server_access') THEN
      EXECUTE format('CREATE POLICY server_access ON doorprize_auth.%I TO doorprize_server USING (true) WITH CHECK (true)',item);
    END IF;
  END LOOP;
END $$;

ALTER TABLE doorprize.background_assets ADD COLUMN IF NOT EXISTS ready boolean NOT NULL DEFAULT true;
ALTER TABLE doorprize.background_assets ADD COLUMN IF NOT EXISTS expected_size integer CHECK (expected_size BETWEEN 1 AND 20971520);
ALTER TABLE doorprize.background_assets ADD COLUMN IF NOT EXISTS expected_mime text CHECK (expected_mime IN ('image/png','image/jpeg','image/webp'));

COMMIT;
