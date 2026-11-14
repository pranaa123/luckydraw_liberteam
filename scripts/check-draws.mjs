import { connectAuthenticatedDatabase } from './auth-fixture.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPHP, projectRoot } from './php-runtime.mjs';
import { openLocalDatabase } from './local-database.mjs';

await mkdir(resolve(projectRoot, '.cache'), { recursive: true });
const temporary = await mkdtemp(resolve(projectRoot, '.cache/draw-api-'));
const path = resolve(temporary, 'database');
let database = await openLocalDatabase(path);
let php = await createPHP();
let disconnect = await connectAuthenticatedDatabase(php, database);
async function restart() {
  disconnect(); php.exit(); await database.close();
  database = await openLocalDatabase(path); php = await createPHP(); disconnect = await connectAuthenticatedDatabase(php, database);
}
const headers = { host: '127.0.0.1:8091', origin: 'http://127.0.0.1:8091', 'content-type': 'application/json' };
const query = (sql, values = []) => database.query(sql, values);
async function request(resource, payload, expected = 200) {
  const response = await php.run({ scriptPath: '/app/public/index.php', relativeUri: `/api/${resource}`, method: payload ? 'POST' : 'GET', headers,
    body: payload ? new TextEncoder().encode(JSON.stringify(payload)) : undefined });
  assert.equal(response.httpStatusCode, expected, response.text + '\n' + response.errors);
  return JSON.parse(response.text);
}
let state;
async function start(count = 2, mode = 'none', allocation = [], expected = 200, overrides = {}) {
  return request('draws', { action: 'start', version: state.version, request_id: randomUUID(), winner_count: count, prize_mode: mode, allocation, ...overrides }, expected);
}
const action = (name, id = state.draw.id, expected = 200) => request('draws', { action: name, draw_id: id }, expected);
async function poolIsDense() {
  const { rows } = await query('SELECT count(*)::int AS count, COALESCE(max(position), 0)::int AS maximum FROM doorprize.participant_pool WHERE event_id = 1');
  assert.equal(rows[0].count, rows[0].maximum);
  const missing = await query("SELECT id FROM doorprize.participants p WHERE event_id = 1 AND (status = 'available') <> EXISTS (SELECT 1 FROM doorprize.participant_pool pool WHERE pool.event_id = p.event_id AND pool.participant_id = p.id) LIMIT 1");
  assert.equal(missing.rows.length, 0);
}
try {
  state = await request('draws');
  await start(1, 'none', [], 422);
  await query("INSERT INTO doorprize.participants (event_id, name, field_1, status) SELECT 1, 'Peserta ' || i, 'Divisi ' || i % 3, CASE WHEN i = 12 THEN 'duplicate' ELSE 'available' END FROM generate_series(1, 12) i");
  await request('fields', { action: 'create', label: 'Divisi' });
  const prizeA = await request('prizes', { action: 'create', name: 'Tas', quantity: 5 });
  const prizeB = await request('prizes', { action: 'create', name: 'Payung', quantity: 6 });
  const exhausted = await request('prizes', { action: 'create', name: 'Habis', quantity: 0 });
  state = await request('draws');
  assert.equal(state.available_count, 11);
  await start(12, 'none', [], 422);
  await start(2, 'selected', [{ prize_id: exhausted.id, quantity: 2 }], 422);
  await start(2, 'selected', [{ prize_id: prizeA.id, quantity: 1 }], 422);
  await start(1, 'none', [], 409, { version: -1 });

  const key = randomUUID();
  state = await start(2, 'selected', [{ prize_id: prizeA.id, quantity: 1 }, { prize_id: prizeB.id, quantity: 1 }], 200, { request_id: key });
  const id = state.draw.id;
  assert.equal(state.draw.phase, 'rolling');
  assert.equal(state.draw.sample_names.length,11,'Visual memakai nama peserta tersedia, bukan glyph buatan.');
  assert.ok(state.draw.sample_names.every(name=>name.startsWith('Peserta ')));
  assert.ok(!state.draw.sample_names.includes('Peserta 12'),'Peserta duplikat tidak masuk visual.');
  assert.equal(state.draw.entries.length, 0);
  await action('confirm', id, 409);
  await request('participants', { action: 'create', name: 'Ditolak', status: 'available' }, 409);
  assert.equal((await start(2, 'selected', [{ prize_id: prizeB.id, quantity: 1 }, { prize_id: prizeA.id, quantity: 1 }], 200, { request_id: key })).draw.id, id);
  await start(3, 'none', [], 409, { request_id: key });
  await start(1, 'none', [], 409);
  await restart();
  assert.deepEqual((await request('draws')).draw, state.draw, 'Putaran berputar harus pulih setelah restart.');
  state = await action('stop');
  assert.equal(state.draw.phase, 'result');
  assert.equal(new Set(state.draw.entries.map(item => item.participant_id)).size, 2);
  assert.equal(new Set(state.draw.entries.map(item => item.prize_id)).size, 2);
  await restart();
  assert.deepEqual((await request('draws')).draw.entries, state.draw.entries, 'Restart tidak mengacak ulang hasil.');
  assert.equal(state.draw.entries[0].participant.field_1.startsWith('Divisi'), true);
  assert.equal((await action('stop')).version, state.version);
  assert.equal((await request('prizes')).items.find(item => item.id === prizeA.id).remaining_quantity, 5);
  const confirmed = await action('confirm');
  assert.equal(confirmed.draw.status, 'confirmed');
  assert.equal(confirmed.available_count, 9);
  assert.equal(confirmed.participant_updates.every(item => item.status === 'winner'), true);
  assert.equal(confirmed.prize_updates.find(item => item.id === prizeA.id).remaining_quantity, 4);
  state = confirmed;
  await restart();
  assert.equal((await request('draws')).draw.status, 'confirmed');
  assert.equal((await action('confirm')).version, state.version);
  await action('eliminate', id, 409);
  await poolIsDense();
  state = await action('clear');
  assert.equal(state.draw, null);
  assert.equal((await query('SELECT status FROM doorprize.draws WHERE id = $1', [id])).rows[0].status, 'confirmed');

  // Membatalkan hasil berhadiah tidak mengesahkan hadiah atau mengubah peserta.
  state = await start(3, 'selected', [{ prize_id: prizeA.id, quantity: 3 }]);
  state = await action('stop');
  const clearedId = state.draw.id;
  const peopleBeforeClear = (await query('SELECT id,status,version FROM doorprize.participants WHERE event_id=1 ORDER BY id')).rows;
  const prizesBeforeClear = (await request('prizes')).items;
  state = await action('clear');
  assert.equal(state.draw, null);
  assert.deepEqual(state.participant_updates, []);
  assert.deepEqual(state.prize_updates, []);
  assert.deepEqual((await query('SELECT id,status,version FROM doorprize.participants WHERE event_id=1 ORDER BY id')).rows, peopleBeforeClear);
  assert.deepEqual((await request('prizes')).items, prizesBeforeClear);
  assert.equal((await query('SELECT status FROM doorprize.draws WHERE id=$1', [clearedId])).rows[0].status, 'cleared');
  await action('confirm', clearedId, 409);
  await action('eliminate', clearedId, 409);
  assert.equal(state.available_count, 9);
  state = await start(2, 'random');
  state = await action('stop');
  const eliminatedId = state.draw.id;
  const stockBefore = (await request('prizes')).items.map(item => item.remaining_quantity);
  state = await action('eliminate');
  assert.equal(state.draw, null);
  assert.equal(state.available_count, 7);
  assert.deepEqual((await request('prizes')).items.map(item => item.remaining_quantity), stockBefore);
  assert.equal((await action('eliminate', eliminatedId)).version, state.version);
  await poolIsDense();
  state = await start(1);
  assert.equal((await action('clear', clearedId)).draw.id, state.draw.id, 'Retry lama tidak menghapus putaran baru.');
  state = await action('clear');

  // Validasi stok/kelayakan ulang dan rollback: simulasikan perubahan di luar API.
  state = await start(2, 'selected', [{ prize_id: prizeA.id, quantity: 2 }]);
  state = await action('stop');
  await query('UPDATE doorprize.prizes SET remaining_quantity = 0 WHERE id = $1', [prizeA.id]);
  await action('confirm', state.draw.id, 409);
  assert.equal((await request('draws')).available_count, 7);
  await query('UPDATE doorprize.prizes SET remaining_quantity = 4 WHERE id = $1', [prizeA.id]);
  const changed = state.draw.entries[0].participant_id;
  await query("UPDATE doorprize.participants SET status = 'eliminated' WHERE id = $1", [changed]);
  await action('confirm', state.draw.id, 409);
  state = await action('clear');
  await poolIsDense();

  await query("INSERT INTO doorprize.events (owner_id) VALUES ('00000000-0000-4000-8000-000000000002')");
  await query("INSERT INTO doorprize.participants (event_id, name) VALUES (2, 'Acara lain')");
  assert.equal((await query('SELECT count(*)::int AS count FROM doorprize.participant_pool WHERE event_id = 2')).rows[0].count, 1);
  const available = (await query("SELECT id FROM doorprize.participants WHERE event_id = 1 AND status = 'available' LIMIT 1")).rows[0].id;
  await query('DELETE FROM doorprize.participants WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM doorprize.draw_entries WHERE participant_id = $1)', [available]);
  await poolIsDense();

  await query("INSERT INTO doorprize.participants (event_id, name) SELECT 1, 'Uji performa ' || i FROM generate_series(1, 50000) i");
  state = await request('draws');
  const timings = {};
  for (const [label, operation] of [['mulai', () => start(100)], ['stop', () => action('stop')], ['sahkan', () => action('confirm')]]) {
    const began = performance.now(); state = await operation(); timings[label] = Math.round(performance.now() - began);
  }
  assert.equal(state.draw.entries.length, 100);
  assert.equal(state.participant_updates.length, 100);
  await poolIsDense();
  assert(Object.values(timings).every(value => value < 1000), `Target 1 detik: ${JSON.stringify(timings)}`);
  assert((await query("SELECT count(*)::int AS count FROM doorprize.audit_log WHERE entity_type = 'draw'")).rows[0].count >= 15);
  const history = await request('history');
  assert(history.items.some(item => item.entity_type === 'draw' && item.action === 'confirm'));
  assert.equal(history.items[0].action, 'confirm');
  assert.equal(history.items[0].requested_count, 100);
  console.log(`Undian: pemilihan unik, status, stok, idempotensi, rollback, snapshot, isolasi dan indeks rapat lulus. 50.000+ peserta / 100 hasil: ${JSON.stringify(timings)} ms.`);
} finally { disconnect(); php.exit(); await database.close(); await rm(temporary, { recursive: true, force: true }); }
