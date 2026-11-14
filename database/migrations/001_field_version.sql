ALTER TABLE doorprize.event_fields ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 1;
