import { connectAuthenticatedDatabase } from './auth-fixture.mjs';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { createPHP } from './php-runtime.mjs';
import { openLocalDatabase } from './local-database.mjs';
import { createParticipantTemplate } from '../public/assets/modules/excel-template.js';
import { cellText, assertWorkbookSize } from '../public/assets/modules/excel-values.js';

for (let count = 0; count <= 3; count++) {
  const fields = Array.from({ length: count }, (_, index) => ({ key: `field_${index + 1}`, label: ['Divisi', 'Nomor peserta', 'Kota'][index] }));
  const original = createParticipantTemplate(ExcelJS, { fields, client_name: 'Client', event_name: 'Acara' });
  const bytes = await original.xlsx.writeBuffer(); assertWorkbookSize(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const book = await new ExcelJS.Workbook().xlsx.load(bytes), sheet = book.getWorksheet('Peserta');
  assert.equal(book.worksheets.length, 2); assert.equal(sheet.views[0].ySplit, 6);
  assert.equal(sheet.getCell('A6').value, 'Nama'); assert.equal(sheet.getCell('A6').font.color.argb, 'FFFFFFFF');
  assert.equal(sheet.getCell('A7').numFmt, '@'); assert.equal(sheet.getCell('A7').value, null);
  assert.ok(sheet.getTable('DaftarPeserta')); assert.equal(sheet.pageSetup.orientation, 'landscape');
  assert.equal(sheet.columnCount, count + 1); assert.equal(sheet.getCell('A1').font.size, 17);
}
assert.equal(cellText({ value: 123, numFmt: '00000' }), '00123');
assert.equal(cellText({ value: { formula: 'A1', result: 'Alam' } }), 'Alam');
assert.throws(() => cellText({ value: { formula: 'A1' } }));
assert.throws(() => assertWorkbookSize(new ArrayBuffer(100)));
console.log('Template XLSX: 1–4 kolom, style, freeze, tabel kosong, format teks, Panduan, cetak dan pembacaan tipe sel lulus.');

const db = await openLocalDatabase('memory://'), php = await createPHP(), disconnect = await connectAuthenticatedDatabase(php, db);
async function request(path, payload, expected = 200) {
  const response = await php.run({ scriptPath: '/app/public/index.php', relativeUri: '/api/' + path, method: payload ? 'POST' : 'GET',
    headers: { host: '127.0.0.1:8091', origin: 'http://127.0.0.1:8091', 'content-type': 'application/json' },
    body: payload ? new TextEncoder().encode(JSON.stringify(payload)) : undefined });
  assert.equal(response.httpStatusCode, expected, `${path}: ${response.text}\n${response.errors}`); return JSON.parse(response.text);
}
const query = sql => db.query(sql).then(result => result.rows);
async function rules(keys) { const old = await request('duplicates'); return request('duplicates', { action: 'update', keys, version: old.version, field_schema: old.field_schema }); }
async function create(rows, keys) {
  const meta = await request('imports'), batch_id = crypto.randomUUID(), common = { batch_id };
  const payload = { ...common, action: 'create', filename: 'Peserta.xlsx', sheet_name: 'Peserta', field_schema: meta.field_schema, mapping: { name: 2, field_1: 1 }, keys, expected_rows: rows.length };
  await request('imports', payload); await request('imports', payload);
  for (let offset = 0, index = 0; offset < rows.length; offset += 100, index++) {
    const data = { ...common, action: 'chunk', chunk_number: index, rows: rows.slice(offset, offset + 100) };
    await request('imports', data); await request('imports', data);
  }
  const preview = await request('imports', { ...common, action: 'preview' });
  return { common, preview, payload };
}
try {
  await request('fields', { action: 'create', label: 'Divisi' });
  let meta = await request('imports');
  const old = await request('participants', { action: 'create', name: 'alam', field_1: 'A', field_schema: meta.field_schema });
  const data = [{ name: 'Alam', field_1: 'a' }, { name: 'ALAM', field_1: 'A' }, { name: 'Alam', field_1: 'B' }, { name: 'Alam' }, { name: 'alam' }, { name: 'al@m', field_1: 'A' }, { name: 'a_am', field_1: 'A' }, { name: '', field_1: 'B' }, { name: 'Terlalu panjang', field_1: 'X'.repeat(201) }, { name: 'Rumus', issue: 'Rumus tanpa hasil' }].map((row, index) => ({ ...row, row_number: index + 7 }));
  const batch = await create(data, ['name', 'field_1']);
  assert.deepEqual(batch.preview.summary, { available: 6, duplicates: 1, existing_changes: 1, existing_available_delta: -1, invalid: 3, valid: 7, total: 10, rule_changed: true });
  let rows = await request('imports', { ...batch.common, action: 'rows', after: 0 });
  assert.equal(rows.items[0].preview_status, 'available'); assert.equal(rows.items[1].keeper_name, 'Alam');
  assert.equal((await query('SELECT count(*)::int AS count FROM doorprize.participants'))[0].count, 1, 'Preview tidak boleh mengubah peserta');
  await request('imports', { ...batch.common, action: 'commit', preview_revision: 999 }, 409);
  let result = await request('imports', { ...batch.common, action: 'commit', preview_revision: batch.preview.preview_revision });
  assert.equal(result.summary.imported, 7);
  const audit = (await query('SELECT count(*)::int AS count FROM doorprize.audit_log'))[0].count;
  await request('imports', { ...batch.common, action: 'commit', preview_revision: batch.preview.preview_revision });
  assert.equal((await query('SELECT count(*)::int AS count FROM doorprize.audit_log'))[0].count, audit);
  assert.equal((await query('SELECT count(*)::int AS count FROM doorprize.import_rows'))[0].count, 0);
  let participants = (await request('participants')).items;
  assert.equal(participants.length, 8); assert.equal(participants.find(p => p.id === old.id).status, 'duplicate');
  assert.equal(participants.filter(p => p.status === 'available').length, 6);
  assert.equal((await query('SELECT count(*)::int AS count FROM doorprize.participant_pool'))[0].count, 6);
  // Memindahkan keeper mengembalikan keeper terbaik pada kelompok lama, bukan membaca semua peserta.
  const keeper = participants.find(p => p.name === 'Alam' && p.field_1 === 'a');
  await request('participants', { action: 'update', id: keeper.id, version: keeper.version, name: 'Budi', field_1: 'A', status: keeper.status, field_schema: meta.field_schema });
  participants = (await request('participants')).items;
  assert.equal(participants.find(p => p.name === 'ALAM').status, 'available');
  const promoted = participants.find(p => p.name === 'ALAM');
  await request('participants', { action: 'delete', id: promoted.id, version: promoted.version });
  participants = (await request('participants')).items;
  assert.equal(participants.find(p => p.id === old.id).status, 'available');
  // Winner dan eliminasi tetap jangkar, meskipun data baru lebih rapi.
  await db.query("UPDATE doorprize.participants SET status = 'winner' WHERE id = $1", [old.id]);
  const protectedBatch = await create([{ row_number: 2, name: 'Alam', field_1: 'A' }], ['name', 'field_1']);
  assert.equal(protectedBatch.preview.summary.duplicates, 1);
  await request('imports', { ...protectedBatch.common, action: 'commit', preview_revision: protectedBatch.preview.preview_revision });
  assert.equal((await query(`SELECT status FROM doorprize.participants WHERE id = ${old.id}`))[0].status, 'winner');
  // Perubahan peserta setelah preview menolak commit, lalu dapat dipratinjau ulang.
  const stale = await create([{ row_number: 2, name: 'Citra', field_1: 'C' }], ['name', 'field_1']);
  await request('participants', { action: 'create', name: 'Citra', field_1: 'C', field_schema: meta.field_schema });
  await request('imports', { ...stale.common, action: 'commit', preview_revision: stale.preview.preview_revision }, 409);
  const fresh = await request('imports', { ...stale.common, action: 'preview' }); assert.equal(fresh.summary.duplicates, 1);
  await request('imports', { ...stale.common, action: 'commit', preview_revision: fresh.preview_revision });
  await rules([]); assert.equal((await query("SELECT count(*)::int AS count FROM doorprize.participants WHERE status = 'duplicate'"))[0].count, 0);
  await rules(['name']);
  assert.ok((await query("SELECT count(*)::int AS count FROM doorprize.participants WHERE status = 'duplicate'"))[0].count > 0);
  // Edit massal rekonsiliasi kunci lama/baru, dan isian kunci tidak boleh dihapus.
  participants = (await request('participants')).items;
  const item = participants.find(p => p.status === 'available' && p.name === 'Budi');
  await request('participant-bulk', { action: 'update', field_schema: meta.field_schema, selection: { mode: 'ids', items: [{ id: item.id, version: item.version }] }, changes: { name: 'Alam' } });
  assert.equal((await query(`SELECT status FROM doorprize.participants WHERE id = ${item.id}`))[0].status, 'duplicate');
  await rules(['field_1']); const field = (await request('fields')).items[0];
  await request('fields', { action: 'delete', id: field.id, version: field.version }, 409);
  // Pending undian menolak commit atomik, cancel bersifat idempotent.
  const cancelled = await create([{ row_number: 2, name: 'Dewi' }], []);
  const pending = (await db.query("INSERT INTO doorprize.draws (event_id, sequence_number, prize_mode, requested_count, idempotency_key) VALUES (1, 1, 'none', 1, $1) RETURNING id", [crypto.randomUUID()])).rows[0];
  await request('imports', { ...cancelled.common, action: 'commit', preview_revision: cancelled.preview.preview_revision }, 409);
  await request('imports', { ...cancelled.common, action: 'cancel' }); await request('imports', { ...cancelled.common, action: 'cancel' });
  await db.query("UPDATE doorprize.draws SET status = 'cleared', resolved_at = now() WHERE id = $1", [pending.id]);
  // Snapshot skema lama ditolak dan potongan dengan isi berbeda tidak diterima.
  const invalidated = await create([{ row_number: 2, name: 'Erna', field_1: 'A' }], []);
  await request('imports', { ...invalidated.common, action: 'chunk', chunk_number: 0, rows: [{ row_number: 2, name: 'Berbeda' }] }, 409);
  await request('fields', { action: 'create', label: 'Kota' });
  await request('imports', { ...invalidated.common, action: 'commit', preview_revision: invalidated.preview.preview_revision }, 409);
  await request('imports', { ...invalidated.common, action: 'cancel' });
  await rules([]);
  const benchRows = Number(process.env.IMPORT_BENCH_ROWS || 1000);
  const generated = Array.from({ length: benchRows }, (_, index) => ({ row_number: index + 2, name: `Peserta ${index}`, field_1: `Divisi ${index % 10}` }));
  const start = performance.now(); const bench = await create(generated, ['name', 'field_1']); const stagedMs = performance.now() - start;
  const commitStart = performance.now(); await request('imports', { ...bench.common, action: 'commit', preview_revision: bench.preview.preview_revision });
  const commitMs = performance.now() - commitStart;
  console.log(`Import PHP/PostgreSQL: mapping, validasi, AND + kunci kosong, kualitas, keeper lama, status dilindungi, CRUD/massal, versi, rollback, idempotensi dan audit lulus. ${benchRows} baris: staging + preview ${Math.round(stagedMs)} ms (termasuk retry tes), commit ${Math.round(commitMs)} ms.`);
} finally { await disconnect(); php.exit(); await db.close(); }
