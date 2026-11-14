import { connectAuthenticatedDatabase } from './auth-fixture.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createPHP } from './php-runtime.mjs';
import { openLocalDatabase } from './local-database.mjs';

const db = await openLocalDatabase('memory://'), php = await createPHP();
const detach = await connectAuthenticatedDatabase(php, db);
if (process.env.FILTER_QUERY_TIMINGS) {
  const execute = db.query.bind(db);
  db.query = async (...args) => {
    const began = performance.now(); const result = await execute(...args); const ms = Math.round(performance.now()-began);
    if (ms>50) console.log('Query ms',ms,args[0].slice(0,300)); return result;
  };
}
const headers = { host: '127.0.0.1:8091', origin: 'http://127.0.0.1:8091', 'content-type': 'application/json' };
async function api(resource, payload, status = 200) {
  const response = await php.run({ scriptPath: '/app/public/index.php', relativeUri: `/api/${resource}`, method: payload ? 'POST' : 'GET', headers, body: payload ? new TextEncoder().encode(JSON.stringify(payload)) : undefined });
  assert.equal(response.httpStatusCode, status, response.text + '\n' + response.errors); return JSON.parse(response.text);
}
const include = (...values) => ({ mode: 'include', values });
const exclude = (...values) => ({ mode: 'exclude', values });
const list = (filters = {}, extra = {}) => api('participants', { action: 'query', after: 0, filters, ...extra });
const option = (field, filters = {}, extra = {}) => api('participant-filters', { action: 'options', field, filters, scope: 'all', ...extra });
let state;
async function start(filters, count = 2) {
  state = await api('draws');
  return api('draws', { action: 'start', version: state.version, request_id: randomUUID(), winner_count: count, prize_mode: 'none', filters });
}
const command = (action, id = state.draw.id) => api('draws', { action, draw_id: id });
async function dense() {
  for (const table of ['participant_pool', 'draw_filter_pool']) {
    const { rows } = await db.query(`SELECT count(*)::int AS count, COALESCE(max(position), 0)::int AS maximum FROM doorprize.${table} WHERE event_id = 1`);
    assert.equal(rows[0].count, rows[0].maximum, table);
  }
  assert.equal((await db.query(`SELECT count(*)::int AS count FROM doorprize.participants p JOIN doorprize.events e ON e.id = p.event_id WHERE p.event_id = 1 AND e.filter_pool_active AND
    ((p.status = 'available' AND doorprize.participant_matches_filter(to_jsonb(p), e.draw_filters)) <> EXISTS (SELECT 1 FROM doorprize.draw_filter_pool pool WHERE pool.event_id = 1 AND pool.participant_id = p.id))`)).rows[0].count, 0);
}
try {
  await api('draws');
  const first = await api('fields', { action: 'create', label: 'Divisi' });
  await api('fields', { action: 'create', label: 'Kota' });
  await db.exec("INSERT INTO doorprize.participants(event_id,name,field_1,field_2) SELECT 1, 'Peserta ' || i, CASE WHEN i <= 60 THEN 'A' ELSE 'B' END, CASE WHEN i % 2 = 0 THEN 'Timur' ELSE NULL END FROM generate_series(1,120) i");
  let meta = await api('participant-filters');
  assert.equal(meta.fields.length, 3);
  const filters = { field_1: include('A'), field_2: include('Timur') };
  let page = await list(filters);
  assert.equal(page.summary[0].count, 30);
  assert(page.items.every(item => item.field_1 === 'A' && item.field_2 === 'Timur'));
  assert.equal((await list({ field_1: include('A', 'B') })).summary[0].count, 120);
  assert.equal((await list({ field_1: include() })).items.length, 0);
  assert.equal((await list({ field_1: exclude('A') })).summary[0].count, 60);
  assert.equal((await list({ field_2: include('') })).summary[0].count, 60);
  assert.equal((await list({ field_1: exclude() })).summary[0].count, 120);
  assert.equal((await list({}, { status_filter: include() })).items.length, 0);
  assert.equal((await list({}, { status_filter: exclude() })).summary[0].count, 120);
  assert.equal((await list({}, { status_filter: exclude('available') })).items.length, 0);
  assert.deepEqual((await option('field_1', {}, { status_filter: include('winner') })).items, []);
  await api('participants', { action: 'query', after: 0, status_filter: include('invalid') }, 422);
  assert.equal((await list({}, { search: 'Peserta 1' })).summary[0].count, 32);
  assert.deepEqual((await option('field_2', { field_1: include('A') })).items, ['', 'Timur']);
  const options = await option('name');
  assert.equal(options.items.length, 50); assert(options.next);
  assert((await option('name', {}, { after: options.next })).items.every(value => !options.items.includes(value)));
  assert.equal((await option('name', {}, { search: 'Peserta %' })).items.length, 0);
  await api('participant-filters', { action: 'options', field: 'status', scope: 'all' }, 422);
  await api('participants', { action: 'query', after: 0, filters: { field_3: include('X') } }, 422);
  const firstPage = await list();
  const secondPage = await list({}, { after: firstPage.next, include_summary: false });
  assert.equal(secondPage.summary, null);
  assert(secondPage.items.every(item => !firstPage.items.some(old => old.id === item.id)));

  state = await start(filters, 4);
  assert.equal(state.eligible_count, 30);
  await dense();
  state = await command('stop');
  assert(state.draw.entries.every(item => item.participant.field_1 === 'A' && item.participant.field_2 === 'Timur'));
  state = await command('confirm');
  assert.equal(state.eligible_count, 26); await dense();
  await command('clear');
  const snapshots = (await db.query('SELECT position, participant_id FROM doorprize.draw_filter_pool ORDER BY position')).rows;
  state = await start(filters, 1);
  assert.deepEqual((await db.query('SELECT position, participant_id FROM doorprize.draw_filter_pool ORDER BY position')).rows, snapshots, 'Filter sama memakai ulang pool.');
  await command('clear');

  page = await list(filters, { statuses: ['available'] });
  const selection = { mode: 'query', query: { filters, statuses: ['available'] }, participants_version: Number(page.participants_version) };
  const result = await api('participant-bulk', { action: 'update', field_schema: meta.field_schema, selection, changes: { status: 'eliminated' } });
  assert.equal(result.updated_count, 26);
  assert.equal((await list(filters, { status_filter: include('available', 'eliminated') })).summary.reduce((sum, item) => sum + item.count, 0), 26);
  assert.equal((await list(filters, { status_filter: exclude('eliminated', 'winner') })).items.length, 0);
  assert.equal((await api('draws')).eligible_count, 0); await dense();
  await api('participant-bulk', { action: 'update', field_schema: meta.field_schema, selection, changes: { status: 'available' } }, 409);
  page = await list(filters, { statuses: ['eliminated'] });
  await api('participant-bulk', { action: 'update', field_schema: meta.field_schema, selection: { mode: 'query', query: { filters, statuses: ['eliminated'] }, participants_version: Number(page.participants_version) }, changes: { status: 'available', field_2: 'Baru' } });
  assert.equal((await api('draws')).eligible_count, 0); await dense();
  const ids = (await list({ field_2: include('Baru') })).items.slice(0, 2).map(({ id, version }) => ({ id, version }));
  await api('participant-bulk', { action: 'update', field_schema: meta.field_schema, selection: { mode: 'ids', items: ids }, changes: { field_2: 'Timur' } });
  assert.equal((await api('draws')).eligible_count, 2); await dense();
  await api('participant-bulk', { action: 'update', field_schema: meta.field_schema, selection: { mode: 'ids', items: ids }, changes: { status: 'eliminated' } }, 409);
  page = await list();
  await api('participant-bulk', { action: 'update', field_schema: meta.field_schema, selection: { mode: 'query', query: {}, participants_version: Number(page.participants_version) }, changes: { status: 'eliminated' } }, 409);
  state = await start(filters, 1);
  await api('participant-bulk', { action: 'update', field_schema: meta.field_schema, selection: { mode: 'ids', items: ids }, changes: { field_2: 'X' } }, 409);
  await command('clear');

  await db.exec("INSERT INTO doorprize.participants(event_id,name,field_1,field_2) VALUES(1,'Baru cocok','A','Timur')");
  assert.equal((await api('draws')).eligible_count, 3); await dense();
  await db.exec("DELETE FROM doorprize.participants WHERE name='Baru cocok'"); await dense();
  await api('fields', { action: 'delete', id: first.id, version: first.version });
  assert(!Object.hasOwn((await api('draws')).config.filters, 'field_1')); await dense();

  state = await start({ field_2: include('Timur') }, 1);
  await db.exec('UPDATE doorprize.draw_filter_pool SET participant_id = participant_id + 10000000');
  await api('draws', { action: 'stop', draw_id: state.draw.id }, 409);
  assert.equal((await api('draws')).draw.entries.length, 0, 'Cache yang tidak valid tidak boleh menghasilkan peserta palsu.');
  await command('clear');
  state = await start({}, 1); await command('clear');
  const volume = Number(process.env.FILTER_BENCH_ROWS || 50000);
  assert(Number.isInteger(volume) && volume > 0 && volume <= 50000);
  if (process.env.FILTER_QUERY_TIMINGS) console.log('Menyiapkan volume',volume,(await db.query('SELECT current_user')).rows[0]);
  await db.exec(`INSERT INTO doorprize.participants(event_id,name,field_1,field_2) SELECT 1,'Volume ' || i,'B','Timur' FROM generate_series(1,${volume}) i`);
  if (process.env.FILTER_QUERY_TIMINGS) console.log('Volume siap');
  const begin = performance.now(); state = await start({ field_2: include('Timur') }, 100); const firstMs = Math.round(performance.now() - begin);
  let began = performance.now(); state = await command('stop'); const stopMs = Math.round(performance.now() - began);
  await command('clear');
  began = performance.now(); state = await start({ field_2: include('Timur') }, 100); const repeatMs = Math.round(performance.now() - began);
  assert(state.draw && firstMs < 1000 && stopMs < 1000 && repeatMs < 1000, JSON.stringify({ firstMs, repeatMs, stopMs }));
  await command('clear');
  console.log(`Filter/edit massal: OR/AND, nilai kosong, semua/kecuali, paginasi, pilihan lintas halaman, versi, status terlindungi, pool incremental dan penghapusan isian: OK. ${volume}+: pertama ${firstMs} ms, ulang ${repeatMs} ms, Stop ${stopMs} ms.`);
} finally { detach(); php.exit(); await db.close(); }
