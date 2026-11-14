BEGIN;

-- Semua referensi tabel fungsi sudah memakai schema; transition table tetap
-- diselesaikan PostgreSQL di dalam statement pemicu, bukan melalui search_path.
ALTER FUNCTION doorprize.prepare_participant_duplicate_key() SET search_path = '';
ALTER FUNCTION doorprize.maintain_participant_pool() SET search_path = '';
ALTER FUNCTION doorprize.participant_matches_filter(jsonb,jsonb) SET search_path = '';
ALTER FUNCTION doorprize.maintain_draw_filter_pool() SET search_path = '';
ALTER FUNCTION doorprize.touch_participants_version() SET search_path = '';
ALTER FUNCTION doorprize.participant_duplicate_key(jsonb,jsonb) SET search_path = '';
ALTER FUNCTION doorprize.participant_data_quality(text,text,text,text) SET search_path = '';

-- Claim pemilik konstan selama transaksi; hitung sekali, bukan per baris.
ALTER POLICY owner_access ON doorprize.events
USING (owner_id = (SELECT nullif(current_setting('doorprize.owner_id',true),'')::uuid))
WITH CHECK (owner_id = (SELECT nullif(current_setting('doorprize.owner_id',true),'')::uuid));

COMMIT;
