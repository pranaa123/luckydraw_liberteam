// Hanya QA: dimuat eksplisit dengan node --import, tidak termasuk image produksi.
import { readFile, appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const fixture = process.env.DOORPRIZE_GOOGLE_FIXTURE_PATH;
if (!fixture) throw new Error('DOORPRIZE_GOOGLE_FIXTURE_PATH wajib untuk fixture QA.');
const fixturePath = resolve(fixture), actualFetch = globalThis.fetch;
process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32,19).toString('base64');
globalThis.fetch = async (input,options) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.hostname !== 'script.google.com') return actualFetch(input,options);
  const state = JSON.parse(await readFile(fixturePath,'utf8')), payload = JSON.parse(options.body);
  await appendFile(fixturePath + '.requests.jsonl',JSON.stringify({ action: payload.action,after: payload.cursor?.after,at: Date.now(),delay: state.delay_ms || 0 }) + '\n');
  if (state.delay_ms) await new Promise(resolve => setTimeout(resolve,state.delay_ms));
  const base = { protocol: 1,spreadsheet_id: state.spreadsheet_id,sheet_id: state.sheet_id || 0 };
  const hash = createHash('sha256').update(JSON.stringify(state.headers)).digest('hex');
  let reply;
  if (state.error) reply = { ...base,error: state.error };
  else if (payload.action === 'probe') reply = { ...base,headers: state.headers,sheet_name: 'Respons acara',header_row: 1,header_hash: hash,last_row: state.initial.length + 1,sample: state.initial.slice(0,5).map(row => state.headers.map(header => row.values[header.column] || '')) };
  else if (payload.action === 'snapshot') {
    const rows = state.initial.filter(row => row.row_number > payload.cursor.after).slice(0,200);
    reply = { ...base,header_hash: hash,events: rows,after: rows.at(-1)?.row_number || payload.cursor.after,epoch: 1,watermark: state.changes.length,done: true,more: false };
  } else {
    const events = state.changes.slice(payload.cursor.after,payload.cursor.after + 200);
    reply = { ...base,header_hash: hash,events,after: payload.cursor.after + events.length,epoch: 1,watermark: state.changes.length,done: true,more: payload.cursor.after + events.length < state.changes.length };
  }
  return new Response(JSON.stringify(reply),{ headers: { 'content-type': 'application/json' } });
};
