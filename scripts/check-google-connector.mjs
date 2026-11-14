import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import vm from 'node:vm';
const reads = [];
class Range {
  constructor(sheet,row,col,height = 1,width = 1) { Object.assign(this,{ sheet,row,col,height,width }); }
  getValues() { reads.push({ sheet: this.sheet.name,row: this.row,height: this.height,width: this.width }); return Array.from({ length: this.height },(_,r) => Array.from({ length: this.width },(_,c) => this.sheet.rows[this.row + r - 1]?.[this.col + c - 1] ?? '')); }
  getDisplayValues() { return this.getValues().map(row => row.map(value => String(value))); }
  setValues(values) { values.forEach((row,r) => row.forEach((value,c) => { this.sheet.rows[this.row + r - 1] ||= []; this.sheet.rows[this.row + r - 1][this.col + c - 1] = value; })); return this; }
  setValue(value) { return this.setValues([[value]]); }
  getRow() { return this.row; } getLastRow() { return this.row + this.height - 1; } getSheet() { return this.sheet; }
}
class Sheet {
  constructor(name,id,rows = []) { Object.assign(this,{ name,id,rows,maxRows: 1000,maxCols: 26 }); }
  getRange(...args) { return new Range(this,...args); }
  getName() { return this.name; } getSheetId() { return this.id; }
  getLastRow() { let last = this.rows.length; while (last && !this.rows[last - 1]?.some(value => value !== '' && value !== null && value !== undefined)) last--; return last; }
  getLastColumn() { return Math.max(1,...this.rows.map(row => { let width = row?.length || 0; while (width && (row[width - 1] === '' || row[width - 1] === null || row[width - 1] === undefined)) width--; return width; })); }
  getMaxRows() { return this.maxRows; } getMaxColumns() { return this.maxCols; }
  insertRowsAfter(_after,count) { this.maxRows += count; } insertColumnAfter() { this.maxCols++; } hideColumns() {} hideSheet() {}
}
const source = new Sheet('Respons',12345,[['Divisi','Nama lengkap','Nomor'],...Array.from({ length: 450 },(_,index) => ['A',`Peserta ${index}`,String(index).padStart(5,'0')])]);
const sheets = [source], properties = new Map(), triggers = [];
let busy = false;
const book = { getSheets: () => sheets,getSheetById: id => sheets.find(sheet => sheet.id === id),getSheetByName: name => sheets.find(sheet => sheet.name === name),insertSheet: name => { const sheet = new Sheet(name,sheets.length); sheets.push(sheet); return sheet; },toast() {} };
const context = vm.createContext({ console,Set,Array,Number,JSON,Date,Error,Object,String,
  SpreadsheetApp: { openById: () => book,flush() {} },
  LockService: { getScriptLock: () => ({ tryLock: () => !busy,releaseLock() {} }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties.get(key) || null,setProperty: (key,value) => properties.set(key,value),deleteProperty: key => properties.delete(key),getProperties: () => Object.fromEntries(properties) }) },
  Utilities: { getUuid: randomUUID,newBlob: text => ({ getBytes: () => [...Buffer.from(text)] }),DigestAlgorithm: { SHA_256: 1 },Charset: { UTF_8: 1 },computeDigest: (_algorithm,text) => [...createHash('sha256').update(text).digest()] },
  ContentService: { MimeType: { JSON: 'application/json' },createTextOutput: text => ({ text,setMimeType() { return this; } }) },
  ScriptApp: { getProjectTriggers: () => [...triggers],deleteTrigger: trigger => triggers.splice(triggers.indexOf(trigger),1),newTrigger: name => ({ forSpreadsheet() { return this; },onFormSubmit() { return this; },onEdit() { return this; },onChange() { return this; },create() { triggers.push({ getHandlerFunction: () => name }); } }) },
});
const config = { connectorId: 'fixture',spreadsheetId: '1Fixture12345678901234567890',sheetId: null,headerRow: 1,secret: 'a'.repeat(64) };
const code = (await readFile(new URL('../resources/google-sheets/connector.gs',import.meta.url),'utf8')).replace('__DOORPRIZE_CONFIG__',JSON.stringify(config));
vm.runInContext(code,context);
function post(payload) { return JSON.parse(context.doPost({ postData: { contents: JSON.stringify({ secret: config.secret,...payload }) } }).text); }
assert.equal(post({ action: 'probe' }).error,'NOT_INSTALLED');
context.pasangDoorprize(); context.pasangDoorprize(); assert.equal(triggers.length,3);
assert.equal(source.rows[0][3],'_DOORPRIZE_ID');
assert.equal(post({ action: 'probe',secret: 'incorrect' }).error,'UNAUTHORIZED');
let probe = post({ action: 'probe' }); assert.equal(probe.sheet_id,12345); assert.equal(probe.headers.length,3); assert.equal(probe.sample[1][2],'00001');
let cursor = { after: 1,epoch: null,watermark: null }, keys = new Set();
let response;
do {
  response = post({ action: 'snapshot',columns: [1,2,3],header_hash: probe.header_hash,cursor,limit: 200 });
  assert.ok(!response.error,JSON.stringify(response)); response.events.forEach(event => keys.add(event.key));
  cursor = { after: response.after,epoch: response.epoch,watermark: response.watermark };
} while (!response.done);
assert.equal(keys.size,450); assert.equal(cursor.after,451);
cursor = { after: response.watermark,epoch: response.epoch };
reads.length = 0;
response = post({ action: 'changes',header_hash: probe.header_hash,cursor,limit: 200 });
assert.equal(response.events.length,0);
assert.ok(!reads.some(read => read.sheet === 'Respons' && read.row > 1),'Idle tidak membaca isi baris peserta');
source.rows.push(['B','Baru','00999']); context.doorprizeFormSubmit({ range: source.getRange(452,1,1,3) });
response = post({ action: 'changes',header_hash: probe.header_hash,cursor,limit: 200 });
assert.ok(response.events.some(event => event.values[2] === 'Baru')); assert.equal(new Set(response.events.map(event => event.key)).size,1,'Trigger + tail memakai ID sama');
cursor.after = response.after;
// Trigger gagal/busy tetap meninggalkan pointer; poll memulihkan hanya range itu.
busy = true; source.rows[1][1] = 'Nama diperbaiki'; context.doorprizeEdit({ range: source.getRange(2,2) }); busy = false;
reads.length = 0; response = post({ action: 'changes',header_hash: probe.header_hash,cursor,limit: 200 });
assert.ok(response.events.some(event => event.values[2] === 'Nama diperbaiki'));
assert.ok(!reads.some(read => read.sheet === 'Respons' && read.height > 1)); cursor.after = response.after;
// Form yang tidak menjalankan trigger tetap ditemukan melalui tail, bukan seluruh data.
source.rows.push(['C','Tanpa trigger','00000']); response = post({ action: 'changes',header_hash: probe.header_hash,cursor,limit: 200 });
assert.ok(response.events.some(event => event.values[2] === 'Tanpa trigger')); cursor.after = response.after;
// Paste besar menjadi pointer bertahap, tiap drain maksimal 200 baris.
for (let index = 1; index <= 450; index++) source.rows[index][0] = 'Divisi baru';
context.doorprizeEdit({ range: source.getRange(2,1,450,1) });
let total = 0;
do { response = post({ action: 'changes',header_hash: probe.header_hash,cursor,limit: 200 }); total += response.events.length; cursor.after = response.after; } while (response.more);
assert.equal(total,450);
const removedId = source.rows[2][3]; source.rows.splice(2,1); context.doorprizeChange({ changeType: 'REMOVE_ROW' });
response = post({ action: 'changes',header_hash: probe.header_hash,cursor,limit: 200 }); assert.equal(response.error,'RESET_REQUIRED');
const log = sheets.find(sheet => sheet.name.endsWith('_log')); assert.ok(log.rows.some(row => row[1] === removedId && row[2] === 'delete'));
source.rows[0][1] = 'Header berubah'; response = post({ action: 'changes',header_hash: probe.header_hash,cursor,limit: 200 }); assert.equal(response.error,'HEADER_CHANGED');
assert.ok(!context.doGet().text.includes('Peserta'));
console.log('Konektor Apps Script (simulasi API Google): pasang ulang, otorisasi, header, snapshot 450 baris, ID stabil, idle tanpa isi peserta, delta, tail recovery, antrean trigger gagal, paste bertahap, delete/epoch dan header berubah lulus.');
