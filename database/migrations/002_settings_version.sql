ALTER TABLE doorprize.events ADD COLUMN IF NOT EXISTS settings_version bigint NOT NULL DEFAULT 1;
