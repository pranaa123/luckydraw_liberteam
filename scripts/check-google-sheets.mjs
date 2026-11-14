import { connectAuthenticatedDatabase } from './auth-fixture.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createPHP } from './php-runtime.mjs';
import {  openLocalDatabase } from './local-database.mjs';
const database = await openLocalDatabase('memory://'), php = await createPHP();
const queries = [], originalQuery = database.query.bind(database);
database.query = (...args) => { queries.push(args[0]); return originalQuery(...args); };
const spreadsheet = '1DoorprizeGoogleSheetsFixture1234567890', endpoint = 'https://script.google.com/macros/s/AKfycbDoorprizeFixture1234567890/exec';
const ids = [crypto.randomUUID(),crypto.randomUUID(),crypto.randomUUID()];
const headers = [{ column: 1,label: 'Divisi' }, { column: 2,label: 'Nama lengkap' }];
const headerHash = createHash('sha256').update(JSON.stringify(headers)).digest('hex');
let calls = 0, secret, epoch = 1, fail = false;
let initial = ids.map((key,index) => ({ key,row_number: index + 2,operation: 'upsert',values: { 1: index < 2 ? 'A' : 'B',2: ['alam','Alam','Budi'][index] } }));
const changes = [];
const base = () => ({ protocol: 1,spreadsheet_id: spreadsheet,sheet_id: 3456 });
const disconnect = await connectAuthenticatedDatabase(php,database,{ google: async (_url,payload) => {
  calls++; assert.equal(payload.secret,secret);
  if (fail) throw new Error('Google belum merespons. Sinkronisasi akan dicoba kembali.');
  if (payload.action === 'probe') return { ...base(),headers,sheet_name: 'Respons formulir',header_row: 1,header_hash: headerHash,last_row: initial.length + 1,sample: [['A','alam']] };
  if (payload.cursor.epoch !== null && payload.cursor.epoch !== epoch) return { ...base(),error: 'RESET_REQUIRED' };
  if (payload.action === 'snapshot') {
    const rows = initial.filter(row => row.row_number > payload.cursor.after).slice(0,200);
    return { ...base(),header_hash: headerHash,events: rows,after: rows.at(-1)?.row_number || payload.cursor.after,epoch,watermark: changes.length,done: true,more: false };
  }
  const events = changes.slice(payload.cursor.after,payload.cursor.after + 200);
  return { ...base(),header_hash: headerHash,events,after: payload.cursor.after + events.length,epoch,watermark: changes.length,done: true,more: payload.cursor.after + events.length < changes.length };
}});
const env = { APP_ENCRYPTION_KEY: Buffer.alloc(32,7).toString('base64') };
async function request(path,payload,expected = 200) {
  const response = await php.run({ scriptPath: '/app/public/index.php',relativeUri: '/api/' + path,method: payload ? 'POST' : 'GET',env,
    headers: { host: '127.0.0.1:8091',origin: 'http://127.0.0.1:8091','content-type': 'application/json' },body: payload ? new TextEncoder().encode(JSON.stringify(payload)) : undefined });
  assert.equal(response.httpStatusCode,expected,response.text + '\n' + response.errors); return JSON.parse(response.text);
}
let source;
async function sync() {
  await database.query('UPDATE doorprize.google_sources SET next_attempt_at = now() WHERE source_id = $1',[source.id]);
  let result = await request('google-sources',{ action: 'sync',id: Number(source.id) });
  for (let attempt = 0; result.pending && attempt < 4; attempt++) result = await request('google-sources',{ action: 'sync',id: Number(source.id) });
  source = result.source; return result;
}
try {
  await request('fields',{ action: 'create',label: 'Divisi' });
  const rules = await request('duplicates'); await request('duplicates',{ action: 'update',keys: ['name','field_1'],version: rules.version,field_schema: rules.field_schema });
  await request('google-sources',{ action: 'prepare',connection_id: crypto.randomUUID(),spreadsheet_url: 'https://evil.example/spreadsheets/d/' + spreadsheet,header_row: 1 },422);
  const connection_id = crypto.randomUUID();
  const prepared = await request('google-sources',{ action: 'prepare',connection_id,spreadsheet_url: 'https://docs.google.com/spreadsheets/d/' + spreadsheet + '/edit',header_row: 1 });
  source = prepared.source; secret = JSON.parse(prepared.script.match(/const DOORPRIZE = (.*);/)[1]).secret;
  assert.equal(secret.length,64); assert.ok(!JSON.stringify((await request('google-sources')).items).includes(secret));
  assert.notEqual((await database.query('SELECT encrypted_secret FROM doorprize.google_sources')).rows[0].encrypted_secret,secret);
  const again = await request('google-sources',{ action: 'prepare',connection_id,spreadsheet_url: 'https://docs.google.com/spreadsheets/d/' + spreadsheet + '/edit',header_row: 1 }); assert.equal(again.source.id,source.id);
  await request('google-sources',{ action: 'probe',id: Number(source.id),version: Number(source.version),endpoint: 'http://127.0.0.1/private' },422);
  let probe = await request('google-sources',{ action: 'probe',id: Number(source.id),version: Number(source.version),endpoint }); source = probe.source;
  while (probe.pending) { probe = await request('google-sources',{ action: 'probe',id: Number(source.id),version: Number(source.version),endpoint }); source = probe.source; }
  assert.equal(probe.metadata.headers.length,2);
  let data = await request('imports');
  source = await request('google-sources',{ action: 'configure',id: Number(source.id),version: Number(source.version),mapping: { name: 2,field_1: 1 },header_hash: headerHash,field_schema: data.field_schema,closes_at: null });
  assert.equal(source.phase,'initial'); assert.equal((await request('draws')).sync_pending,true);
  const first = await sync(); assert.equal(first.summary.inserted,3); assert.equal(source.phase,'live'); assert.equal((await request('draws')).sync_pending,false);
  let people = (await request('participants')).items;
  assert.equal(people.filter(p => p.status === 'available').length,2); assert.equal(people.find(p => p.name === 'alam').status,'duplicate');
  const beforeCalls = calls; await request('google-sources',{ action: 'sync',id: Number(source.id) }); assert.equal(calls,beforeCalls,'Backoff mencegah pembacaan Google berulang');
  queries.length = 0; const idle = await sync(); assert.equal(idle.summary.processed,0);
  assert.ok(!queries.some(sql => /doorprize\.(participants|participant_pool)\b/.test(sql)),'Idle tidak membaca atau menulis tabel peserta/pool');
  const budi = people.find(p => p.name === 'Budi');
  await request('participants',{ action: 'update',id: budi.id,version: budi.version,name: 'Budi',field_1: 'Operator',status: 'available',field_schema: data.field_schema });
  changes.push({ key: ids[2],row_number: 4,operation: 'upsert',values: { 1: 'Sheets',2: 'Budi' } });
  const conflict = await sync(); assert.equal(source.conflict_rows,1); assert.equal(conflict.changed,false);
  people = (await request('participants')).items; assert.equal(people.find(p => p.name === 'Budi').field_1,'Operator');
  let issues = await request('google-sources',{ action: 'issues',id: Number(source.id) }); assert.equal(issues.items[0].issue,'conflict');
  let issue = issues.items[0];
  source = await request('google-sources',{ action: 'resolve',id: Number(source.id),version: Number(source.version),row_key: issue.row_key,row_version: issue.version,choice: 'local' });
  assert.equal(source.conflict_rows,0); assert.equal((await request('participants')).items.find(p => p.name === 'Budi').field_1,'Operator');
  changes.push({ key: ids[2],row_number: 4,operation: 'upsert',values: { 1: 'Sheets lagi',2: 'Budi' } }); await sync();
  issue = (await request('google-sources',{ action: 'issues',id: Number(source.id) })).items[0];
  source = await request('google-sources',{ action: 'resolve',id: Number(source.id),version: Number(source.version),row_key: issue.row_key,row_version: issue.version,choice: 'remote' });
  assert.equal((await request('participants')).items.find(p => p.name === 'Budi').field_1,'Sheets lagi');
  changes.push({ key: ids[1],row_number: 3,operation: 'delete',values: {} }); await sync();
  people = (await request('participants')).items; assert.equal(people.find(p => p.name === 'Alam').status,'eliminated');
  await database.query("UPDATE doorprize.participants SET status = 'winner' WHERE id = $1",[budi.id]);
  changes.push({ key: ids[2],row_number: 4,operation: 'delete',values: {} }); await sync();
  assert.equal((await request('participants')).items.find(p => p.id === budi.id).status,'winner');
  // Invalid baru tidak masuk pool; perbaikan berikutnya menjadi available.
  const invalidId = crypto.randomUUID(); changes.push({ key: invalidId,row_number: 5,operation: 'upsert',values: { 1: 'A',2: '' } }); await sync(); assert.equal(source.invalid_rows,1);
  changes.push({ key: invalidId,row_number: 5,operation: 'upsert',values: { 1: 'A',2: 'Citra' } }); await sync(); assert.equal(source.invalid_rows,0);
  // Manual delete dipertahankan dan sumber selanjutnya ditandai, bukan membuat peserta lagi.
  let citra = (await request('participants')).items.find(p => p.name === 'Citra');
  await request('participants',{ action: 'delete',id: citra.id,version: citra.version });
  changes.push({ key: invalidId,row_number: 5,operation: 'upsert',values: { 1: 'B',2: 'Citra' } }); await sync(); assert.equal(source.conflict_rows,1);
  assert.ok(!(await request('participants')).items.some(p => p.name === 'Citra'));
  // Selama pending draw tidak ada fetch/apply sumber, lalu cursor dilanjutkan.
  const pending = (await database.query("INSERT INTO doorprize.draws (event_id,sequence_number,prize_mode,requested_count,idempotency_key) VALUES (1,1,'none',1,$1) RETURNING id",[crypto.randomUUID()])).rows[0];
  const pendingCalls = calls; const deferred = await sync(); assert.equal(deferred.reason,'draw_pending'); assert.equal(calls,pendingCalls);
  source = await request('google-sources',{ action: 'schedule',id: Number(source.id),version: Number(source.version),closes_at: '2099-01-01T00:00:00Z' });
  source = await request('google-sources',{ action: 'pause',id: Number(source.id),version: Number(source.version) });
  source = await request('google-sources',{ action: 'resume',id: Number(source.id),version: Number(source.version) });
  assert.equal((await sync()).reason,'draw_pending');
  await database.query("UPDATE doorprize.draws SET status = 'cleared',resolved_at = now() WHERE id = $1",[pending.id]);
  // Waktu tutup diperiksa server; data baru tidak masuk sesudah deadline.
  source = await request('google-sources',{ action: 'schedule',id: Number(source.id),version: Number(source.version),closes_at: '2020-01-01T00:00:00Z' });
  const closed = await sync(); assert.equal(closed.reason,'closed'); assert.equal(source.phase,'closed');
  source = await request('google-sources',{ action: 'schedule',id: Number(source.id),version: Number(source.version),closes_at: null });
  source = await request('google-sources',{ action: 'resume',id: Number(source.id),version: Number(source.version) });
  fail = true; const failure = await sync(); assert.ok(failure.error); assert.equal(source.error_code,'connection');
  const failedCalls = calls; await request('google-sources',{ action: 'sync',id: Number(source.id) }); assert.equal(calls,failedCalls); fail = false;
  // Skema isian berubah: pause sebelum menulis data pada slot yang salah.
  await request('fields',{ action: 'create',label: 'Kota' }); const paused = await sync(); assert.equal(paused.reason,'schema_changed'); assert.equal(source.phase,'paused');
  source = await request('google-sources',{ action: 'disconnect',id: Number(source.id),version: Number(source.version) }); assert.equal(source.phase,'disconnected');
  assert.ok((await request('participants')).items.length > 0);
  console.log('Google Sheets PHP/PostgreSQL: konektor terenkripsi, URL, pemetaan, snapshot/delta, AND duplikasi, konflik 3 arah/resolve, penghapusan, winner, invalid, manual delete, pending draw, deadline, backoff dan putus koneksi lulus.');
} finally { await disconnect(); php.exit(); await database.close(); }
