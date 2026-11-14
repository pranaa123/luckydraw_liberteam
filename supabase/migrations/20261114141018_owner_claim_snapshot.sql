BEGIN;
-- current_setting sendiri menjadi initplan; normalisasi UUID tetap di luar.
-- Bentuk ini juga dikenali advisor Supabase yang mencocokkan SELECT current_setting.
ALTER POLICY owner_access ON doorprize.events
USING (owner_id = nullif((SELECT current_setting('doorprize.owner_id',true)),'')::uuid)
WITH CHECK (owner_id = nullif((SELECT current_setting('doorprize.owner_id',true)),'')::uuid);
COMMIT;
