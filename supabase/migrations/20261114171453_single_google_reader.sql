BEGIN;
ALTER TABLE doorprize.events ADD COLUMN IF NOT EXISTS google_reader_access text;
ALTER TABLE doorprize.events ADD COLUMN IF NOT EXISTS google_reader_expires_at timestamptz;
ALTER TABLE doorprize.google_sources ADD COLUMN IF NOT EXISTS connection_mode text NOT NULL DEFAULT 'script' CHECK(connection_mode IN ('script','reader'));
ALTER TABLE doorprize.google_sources ADD COLUMN IF NOT EXISTS identity_column integer CHECK(identity_column BETWEEN 1 AND 256);
-- Jangan memilih/memutus koneksi lama diam-diam jika instalasi memiliki beberapa sumber nyata.
DO $migration$ BEGIN
IF EXISTS(SELECT event_id FROM doorprize.google_sources WHERE phase IN ('initial','live','paused','closed') GROUP BY event_id HAVING count(*)>1) THEN
  RAISE EXCEPTION 'Pilih satu koneksi Google Sheets per acara sebelum menerapkan migrasi ini';
END IF;
END $migration$;
CREATE UNIQUE INDEX IF NOT EXISTS google_sources_one_connection_idx ON doorprize.google_sources(event_id) WHERE phase IN ('initial','live','paused','closed');
COMMIT;
