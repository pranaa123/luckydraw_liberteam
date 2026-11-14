import { connectAuthenticatedDatabase } from './auth-fixture.mjs';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPHP, projectRoot } from './php-runtime.mjs';
import {  openLocalDatabase } from './local-database.mjs';

await mkdir(resolve(projectRoot, '.cache'), { recursive: true });
const temporary = await mkdtemp(resolve(projectRoot, '.cache/settings-api-'));
const directory = resolve(temporary, 'database');
let database = await openLocalDatabase(directory);
let php = await createPHP();
let disconnect = await connectAuthenticatedDatabase(php, database);
const uploads = [];
const headers = { host: '127.0.0.1:8091', origin: 'http://127.0.0.1:8091', 'content-type': 'application/json' };
async function request(resource, payload, expected = 200) {
  const response = await php.run({ scriptPath: '/app/public/index.php', relativeUri: `/api/${resource}`, method: payload ? 'POST' : 'GET', headers,
    body: payload ? new TextEncoder().encode(JSON.stringify(payload)) : undefined });
  assert.equal(response.httpStatusCode, expected, response.text + '\n' + response.errors);
  return JSON.parse(response.text);
}
async function upload(bytes, expected = 200) {
  const boundary = 'DoorprizeSettingsBoundary';
  const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="background"; filename="../../background.png"\r\nContent-Type: image/png\r\n\r\n`), bytes, Buffer.from(`\r\n--${boundary}--\r\n`)]);
  const response = await php.run({ scriptPath: '/app/public/index.php', relativeUri: '/api/backgrounds', method: 'POST',
    headers: { ...headers, 'content-type': `multipart/form-data; boundary=${boundary}` }, body });
  assert.equal(response.httpStatusCode, expected, response.text + '\n' + response.errors);
  const data = JSON.parse(response.text);
  if (data.path) uploads.push(data.path);
  return data;
}
function payload(state, changes = {}) {
  return { action: 'update', settings_version: state.settings_version, client_name: state.client_name, event_name: state.event_name,
    event_at: '', show_event_info: state.show_event_info, visual: state.visual, ...changes };
}
try {
  const initial = await request('settings');
  assert.equal(initial.settings_version, 1);
  assert.equal(initial.visual.canvas_width, 1920);
  assert.equal(initial.visual.show_field_1,true);
  const first = await request('prizes', { action: 'create', name: 'Tas', quantity: 4 });
  const second = await request('prizes', { action: 'create', name: 'Payung', quantity: 3 });
  const empty = await request('prizes', { action: 'create', name: 'Habis', quantity: 0 });
  const saved = await request('settings', payload(initial, { client_name: 'Client lokal', event_name: '<Acara> & malam', event_at: '2026-11-12T19:30', show_event_info: true,
    visual: { ...initial.visual, canvas_width: 4000, canvas_height: 2000, area_width: 2000, area_height: 1200, area_x: 1000.5, area_y: 400, area_anchor_x: 'right', area_anchor_y: 'bottom', background_fit: 'contain', font_color: '#123456', font_style: 'serif', text_case: 'uppercase',show_field_1: false } }));
  assert.equal(saved.settings_version, 2);
  assert.equal(saved.show_event_info, true);
  assert.equal(saved.event_at, '2026-11-12T19:30:00+08:00');
  assert.equal(saved.visual.area_x, 1000.5);
  assert.equal(saved.visual.show_field_1,false);
  assert.equal(saved.visual.area_anchor_x, 'right');
  assert.equal(saved.visual.background_fit, 'contain');
  await request('settings', payload(saved, { visual: { ...saved.visual, area_anchor_x: 'center' } }), 422);
  await request('settings', payload(saved, { visual: { ...saved.visual, background_fit: 'stretch' } }), 422);
  await request('settings', payload(saved, { visual: { ...saved.visual, area_width: 4001 } }), 422);
  await request('settings', payload(saved, { visual: { ...saved.visual, area_x: .25 } }), 422);
  await request('settings', payload(saved, { visual: { ...saved.visual, show_field_1: 'false' } }), 422);
  await request('settings', payload(initial), 409);
  await request('settings', payload(saved, { event_at: '2026-02-30T10:00' }), 422);
  await request('settings', payload(saved, { visual: { ...saved.visual, area_x: 3999 } }), 422);
  await request('settings', payload(saved, { visual: { ...saved.visual, font_style: 'unknown' } }), 422);
  await request('settings', payload(saved, { show_event_info: 'true' }), 422);

  const image = await upload(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=', 'base64'));
  assert.match(image.path, /^\/assets\/backgrounds\/[a-f0-9]{32}\.png$/);
  assert.equal(image.width, 1);
  await upload(Buffer.from('<svg><script>alert(1)</script></svg>'), 422);
  await request('settings', payload(saved, { visual: { ...saved.visual, background_type: 'image', background_image: '/etc/passwd' } }), 422);
  const withImage = await request('settings', payload(saved, { visual: { ...saved.visual, background_type: 'image', background_image: image.path },
    prize_backgrounds: [{ id: first.id, version: first.version, path: image.path }] }));
  assert.equal(withImage.visual.prize_backgrounds[String(first.id)].path, image.path);
  assert.equal(withImage.prize_updates[0].remaining_quantity, 4);

  // Kegagalan background kedua membatalkan perubahan pertama dalam transaksi yang sama.
  await request('settings', payload(withImage, { prize_backgrounds: [
    { id: second.id, version: second.version, path: image.path },
    { id: first.id, version: first.version, path: image.path },
  ] }), 409);
  const afterRollback = (await request('prizes')).items.find(item => item.id === second.id);
  assert.equal(afterRollback.background_path, null);
  assert.equal(afterRollback.version, second.version);
  assert.equal((await request('settings')).settings_version, withImage.settings_version);

  await request('prizes', { action: 'reorder', id: second.id, version: second.version, direction: 'up' });
  const order = (await request('prizes')).items;
  assert.deepEqual(order.map(item => item.id), [second.id, first.id, empty.id]);
  await request('prizes', { action: 'reorder', id: second.id, version: second.version, direction: 'down' }, 409);

  await database.query("INSERT INTO doorprize.draws (event_id, sequence_number, prize_mode, requested_count, idempotency_key) VALUES ($1, 1000, 'none', 1, '00000000-0000-4000-8000-000000000111')", [saved.id]);
  await request('settings', payload(withImage), 409);
  await database.exec("DELETE FROM doorprize.draws WHERE sequence_number = 1000");

  disconnect(); php.exit(); await database.close();
  database = await openLocalDatabase(directory);
  php = await createPHP(); disconnect = await connectAuthenticatedDatabase(php, database);
  const restored = await request('settings');
  assert.equal(restored.event_name, '<Acara> & malam');
  assert.equal(restored.visual.background_image, image.path);
  assert.equal(restored.visual.prize_backgrounds[String(first.id)].path, image.path);
  assert.deepEqual((await request('prizes')).items.map(item => item.id), [second.id, first.id, empty.id]);
  console.log('Persiapan/hadiah: waktu acara, visual, upload, versi terpisah, rollback, urutan, guard undian, dan persistensi setelah restart lulus.');
} finally {
  disconnect(); php.exit(); await database.close();
  for (const path of uploads) await unlink(resolve(projectRoot, `public${path}`));
  await rm(temporary, { recursive: true, force: true });
}
