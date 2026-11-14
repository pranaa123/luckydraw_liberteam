import { connectAuthenticatedDatabase } from './auth-fixture.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPHP } from './php-runtime.mjs';
import {  openLocalDatabase } from './local-database.mjs';

const temporary = await mkdtemp(join(tmpdir(), 'doorprize-management-'));
const path = join(temporary, 'database');
let database = await openLocalDatabase(path);
let php = await createPHP();
let disconnect = await connectAuthenticatedDatabase(php, database);
async function request(resource, payload, expected = 200, headers = {}) {
  if (resource === 'participants' && payload && payload.action !== 'delete' && !Object.hasOwn(payload, 'field_schema')) {
    const fields = (await request('fields')).items;
    payload.field_schema = fields.map(field => `${field.id}:${field.slot}:${field.version}`).join(',');
  }
  const response = await php.run({ scriptPath: '/app/public/index.php', relativeUri: `/api/${resource}`, method: payload ? 'POST' : 'GET',
    headers: { host: '127.0.0.1:8091', origin: 'http://127.0.0.1:8091', 'content-type': 'application/json', ...headers },
    body: payload ? new TextEncoder().encode(JSON.stringify(payload)) : undefined,
  });
  assert.equal(response.httpStatusCode, expected, response.text + '\n' + response.errors);
  return JSON.parse(response.text);
}
try {
  await assert.rejects(openLocalDatabase(path), /sedang digunakan/);
  assert.deepEqual((await request('participants')).items, []);
  const alias = await request('prizes', { action: 'create', name: 'Alias localhost', quantity: 0 }, 200, { host: 'localhost:8091', origin: 'http://localhost:8091' });
  await request('prizes', { action: 'delete', id: alias.id, version: alias.version });
  await request('participants', { action: 'create', name: 'Ditolak' }, 403, { origin: 'https://situs-lain.example' });
  const field = await request('fields', { action: 'create', label: 'Instansi' });
  const second = await request('fields', { action: 'create', label: 'Kota' });
  const third = await request('fields', { action: 'create', label: 'Nomor' });
  const extraFields=[];
  for(let slot=4;slot<=10;slot++)extraFields.push(await request('fields',{action:'create',label:'Isian '+slot}));
  await request('fields', { action: 'create', label: 'Kesebelas' }, 422);
  await request('fields', { action: 'update', id: field.id, version: field.version, label: 'kota' }, 422);
  await request('fields', { action: 'create', label: 'Nama' }, 422);
  const participant = await request('participants', { action: 'create', name: '<script>Alam</script>', field_1: 'Panitia', field_2: 'Makassar' });
  await request('participants', { action: 'create', name: 'Formulir lama', field_1: 'Lama', field_schema: '' }, 409);
  await request('participants', { action: 'create', name: 'Tidak sah', status: 'winner' }, 422);
  const edited = await request('participants', { action: 'update', id: participant.id, version: participant.version, name: 'Alam', field_1: 'Panitia', field_2: 'Makassar', status: 'eliminated' });
  await request('participants', { action: 'update', id: participant.id, version: participant.version, name: 'Perubahan lama' }, 409);
  const prize = await request('prizes', { action: 'create', name: 'Tas', quantity: 3 });
  const prizeEdited = await request('prizes', { action: 'update', id: prize.id, version: prize.version, name: 'Tas acara', quantity: 5 });
  assert.equal(prizeEdited.remaining_quantity, 5);
  await request('prizes', { action: 'create', name: 'Tidak sah', quantity: -1 }, 422);
  await request('prizes', { action: 'create', name: '', quantity: 1 }, 422);
  const renamed = await request('fields', { action: 'update', id: field.id, version: field.version, label: 'Organisasi' });
  assert.equal(renamed.slot, field.slot);
  await request('fields', { action: 'delete', id: field.id, version: field.version }, 409);
  await request('fields', { action: 'delete', id: field.id, version: renamed.version });
  let participants = await request('participants');
  assert.equal(participants.items[0].field_1, null);
  assert.equal(participants.items[0].field_2, 'Makassar');
  assert.equal(participants.items[0].version, edited.version + 1);
  const replacement = await request('fields', { action: 'create', label: 'Telepon' });
  assert.equal(replacement.slot, 1);
  await request('participants', { action: 'delete', id: participant.id, version: edited.version }, 409);
  const countBefore = Number((await database.query('SELECT count(*) AS total FROM doorprize.audit_log')).rows[0].total);
  await request('fields', { action: 'create', label: 'Tidak boleh' }, 422);
  assert.equal(Number((await database.query('SELECT count(*) AS total FROM doorprize.audit_log')).rows[0].total), countBefore);
  // A different event cannot be addressed by changing an entity ID.
  const other = (await database.query("INSERT INTO doorprize.events (owner_id) VALUES ('00000000-0000-4000-8000-000000000002') RETURNING id")).rows[0];
  const foreign = (await database.query('INSERT INTO doorprize.participants (event_id, name) VALUES ($1, $2) RETURNING id, version', [other.id, 'Acara lain'])).rows[0];
  await request('participants', { action: 'delete', id: foreign.id, version: foreign.version }, 404);
  // Disk persistence survives closing both runtimes.
  await disconnect(); php.exit(); await database.close();
  database = await openLocalDatabase(path); php = await createPHP(); disconnect = await connectAuthenticatedDatabase(php, database);
  participants = await request('participants');
  assert.equal(participants.items[0].name, 'Alam');
  assert.equal((await request('prizes')).items[0].name, 'Tas acara');
  assert.equal((await request('fields')).items.length, 10);
  await request('participants', { action: 'delete', id: participant.id, version: participants.items[0].version });
  assert.equal((await request('participants')).items.length, 0);
  await request('prizes', { action: 'delete', id: prize.id, version: prizeEdited.version });
  assert.equal((await request('prizes')).items.length, 0);
  for (const record of [replacement, second, third,...extraFields]) await request('fields', { action: 'delete', id: record.id, version: record.version });
  // Keyset pagination returns one page without leaking the foreign event.
  await database.query("INSERT INTO doorprize.participants (event_id, name) SELECT 1, 'Peserta ' || n FROM generate_series(1, 51) AS n");
  const first = await request('participants');
  assert.equal(first.items.length, 50);
  assert.ok(first.next);
  const last = await request(`participants?after=${first.next}`);
  assert.equal(last.items.length, 1);
  assert.equal(last.next, null);
  assert.equal(first.summary.find(item => item.status === 'available').count, 51);
  // Existing results protect referenced data and already-used stock.
  const protectedPrize = await request('prizes', { action: 'create', name: 'Hadiah tercatat', quantity: 4 });
  await database.query('UPDATE doorprize.prizes SET remaining_quantity = 2 WHERE id = $1', [protectedPrize.id]);
  const protectedEdit = await request('prizes', { action: 'update', id: protectedPrize.id, version: protectedPrize.version, name: 'Hadiah tercatat', quantity: 5 });
  assert.equal(protectedEdit.remaining_quantity, 3);
  await request('prizes', { action: 'update', id: protectedEdit.id, version: protectedEdit.version, name: 'Tidak boleh', quantity: 1 }, 422);
  const draw = (await database.query("INSERT INTO doorprize.draws (event_id, sequence_number, prize_mode, requested_count, idempotency_key) VALUES (1, 1, 'selected', 1, '00000000-0000-4000-8000-000000000011') RETURNING id")).rows[0];
  await request('prizes', { action: 'create', name: 'Saat undian', quantity: 1 }, 409);
  await database.query("UPDATE doorprize.draws SET status = 'confirmed', resolved_at = now() WHERE id = $1", [draw.id]);
  const protectedParticipant = first.items[0];
  await database.query("INSERT INTO doorprize.draw_entries (event_id, draw_id, participant_id, prize_id, position, participant_snapshot) VALUES (1, $1, $2, $3, 1, '{\"name\":\"Snapshot\"}')", [draw.id, protectedParticipant.id, protectedEdit.id]);
  await request('participants', { action: 'delete', id: protectedParticipant.id, version: protectedParticipant.version }, 409);
  await request('prizes', { action: 'delete', id: protectedEdit.id, version: protectedEdit.version }, 409);
  console.log('Pengelolaan data: CRUD peserta/hadiah/isian, validasi, versi, rollback audit, isolasi acara, paginasi, dan persistensi setelah restart lulus.');
} finally {
  await disconnect(); php.exit(); await database.close(); await rm(temporary, { recursive: true, force: true });
}
