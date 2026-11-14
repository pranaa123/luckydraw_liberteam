import { randomBytes,randomUUID } from 'node:crypto';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { projectRoot } from './php-runtime.mjs';
import { generateSampleParticipants } from './sample-participants.mjs';
import { httpSession } from './http-session.mjs';

const origin = process.env.DOORPRIZE_SAMPLE_ORIGIN || 'http://127.0.0.1:8091';
const url = new URL(origin);
if (!['127.0.0.1','localhost'].includes(url.hostname) || url.protocol !== 'http:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error('Peserta contoh hanya boleh ditambahkan melalui server HTTP lokal.');
let credentials = {email:process.env.DOORPRIZE_SAMPLE_EMAIL,password:process.env.DOORPRIZE_SAMPLE_PASSWORD};
if (process.argv.includes('--stdin')) {
  const chunks=[]; let size=0;
  for await (const bytes of process.stdin) { size+=bytes.length; if(size>4096) throw Error('Data akun terlalu besar.'); chunks.push(bytes); }
  credentials=JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
if (!credentials.email || !credentials.password) throw Error('Gunakan --stdin dengan JSON email/password akun pemilik, atau DOORPRIZE_SAMPLE_EMAIL dan DOORPRIZE_SAMPLE_PASSWORD.');
const session = await httpSession(url.origin,credentials);
const directory = resolve(projectRoot,'.cache/sample-participants',url.port || '80');
await mkdir(directory,{ recursive: true });
const file = resolve(directory,'batch.json');
const api = async (path,body) => {
  const response = await session.fetch(url.origin + '/api/' + path,{ method: body ? 'POST' : 'GET',headers: { origin: url.origin,'content-type': 'application/json' },body: body ? JSON.stringify(body) : undefined });
  const data = await response.json();
  if (!response.ok) { const error = Error(data.error || 'Import contoh belum berhasil.'); error.status = response.status; throw error; }
  return data;
};
const persist = value => writeFile(file,JSON.stringify(value,null,2) + '\n');
let batch;
try { batch = JSON.parse(await readFile(file,'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (batch) {
  try {
    const committed = await api('imports',{ action: 'commit',batch_id: batch.payload.batch_id,preview_revision: batch.preview_revision });
    batch.summary = committed.summary; await persist(batch);
    console.log(`Batch contoh sudah tersimpan: ${committed.summary.imported} peserta. Tidak ada penambahan ulang.`); process.exit(0);
  } catch (error) { if (![404,409].includes(error.status)) throw error; }
}
const draw = await api('draws');
if (draw.draw?.status === 'pending') throw Error('Masih ada undian yang belum diselesaikan. Sahkan, eliminasi atau kosongkan hasil melalui operator sebelum menambahkan contoh.');
const meta = await api('imports');
if (!batch) {
  const fields = meta.fields.filter(field => field.key !== 'name'), seed = randomBytes(4).readUInt32LE();
  batch = { seed,payload: { action: 'create',batch_id: randomUUID(),filename: 'Peserta Contoh Lokal.xlsx',sheet_name: 'Peserta',field_schema: meta.field_schema,
    mapping: Object.fromEntries(meta.fields.map((field,index) => [field.key,index + 1])),keys: meta.keys,expected_rows: 500 },rows: generateSampleParticipants(fields,seed) };
  await persist(batch);
}
if (batch.payload.field_schema !== meta.field_schema || JSON.stringify(batch.payload.keys) !== JSON.stringify(meta.keys)) throw Error('Isian/aturan berubah sejak batch contoh dibuat. Batch tidak diterapkan; periksa pengaturan terlebih dahulu.');
await api('imports',batch.payload);
for (let offset = 0; offset < batch.rows.length; offset += 100) await api('imports',{ action: 'chunk',batch_id: batch.payload.batch_id,chunk_number: offset / 100,rows: batch.rows.slice(offset,offset + 100) });
const preview = await api('imports',{ action: 'preview',batch_id: batch.payload.batch_id });
if (preview.summary.valid !== 500 || preview.summary.invalid || preview.summary.rule_changed) throw Error('Pratinjau tidak sesuai 500 peserta atau aturan berubah. Tidak ada peserta yang ditambahkan.');
batch.preview_revision = preview.preview_revision; await persist(batch);
const result = await api('imports',{ action: 'commit',batch_id: batch.payload.batch_id,preview_revision: batch.preview_revision });
batch.summary = result.summary; await persist(batch);
console.log(JSON.stringify({ batch_id: batch.payload.batch_id,summary: result.summary,duplicate_keys: meta.keys }));
