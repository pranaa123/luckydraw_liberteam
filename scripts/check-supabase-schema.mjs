import assert from 'node:assert/strict';
import { readFile,readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { baselineSQL } from './build-database-baseline.mjs';
const directory = new URL('../supabase/migrations/',import.meta.url), files = (await readdir(directory)).filter(file => file.endsWith('.sql')).sort();
const baseline = files.find(file => file.endsWith('_doorprize_baseline.sql'));
assert.equal(await readFile(new URL(baseline,directory),'utf8'),await baselineSQL(),'Baseline harus cocok dengan skema 001–005 yang sudah diuji.');
const database = new PGlite();
try {
  for (const file of files) await database.exec(await readFile(new URL(file,directory),'utf8'));
  const status = (await database.query("SELECT count(*)::int AS tables,bool_and(relrowsecurity) AS secured FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='doorprize' AND c.relkind='r'")).rows[0];
  assert.equal(status.tables,17); assert.equal(status.secured,true);
  await database.exec(`INSERT INTO doorprize.events(owner_id) VALUES('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
    INSERT INTO doorprize.import_sources(event_id,type,spreadsheet_id) VALUES(1,'google_sheets','fixture');
    INSERT INTO doorprize.google_sources(source_id,event_id,connection_id,endpoint) VALUES(1,1,'00000000-0000-4000-8000-000000000003','');
    INSERT INTO doorprize.google_reader_snapshot_rows(source_id,event_id,snapshot_id,row_number,data) VALUES(1,1,'00000000-0000-4000-8000-000000000004',2,'{}');
    INSERT INTO doorprize.participants(event_id,name) VALUES(2,'Acara lain');`);
  await assert.rejects(database.query("INSERT INTO doorprize.google_rows(source_id,event_id,row_key,row_number,participant_id,source_data,source_hash) VALUES(1,1,'00000000-0000-4000-8000-000000000004',2,1,'{}','fixture')"),error => error.code === '23503');
  await database.exec('CREATE ROLE qa_viewer; GRANT USAGE ON SCHEMA doorprize TO qa_viewer; GRANT SELECT ON doorprize.google_sources,doorprize.google_rows,doorprize.google_reader_snapshot_rows TO qa_viewer; SET ROLE qa_viewer;');
  assert.equal((await database.query('SELECT count(*)::int AS count FROM doorprize.google_sources')).rows[0].count,0,'RLS menolak data meski role diberi SELECT');
  assert.equal((await database.query('SELECT count(*)::int AS count FROM doorprize.google_reader_snapshot_rows')).rows[0].count,0,'Snapshot sumber juga dilindungi RLS');
  await database.exec('RESET ROLE');
  for (const file of files) await database.exec(await readFile(new URL(file,directory),'utf8'));
  assert.equal((await database.query('SELECT count(*)::int AS count FROM doorprize.participants')).rows[0].count,1,'Migrasi ulang mempertahankan data');
  console.log('Paket migrasi Supabase lokal: instalasi database kosong, baseline konsisten, 17 tabel RLS, FK antar-acara, role tanpa policy dan penerapan ulang tanpa menghapus data lulus.');
} finally { await database.close(); }
