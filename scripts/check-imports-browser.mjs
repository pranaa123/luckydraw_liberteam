import { qaSession } from './browser-auth.mjs';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openBrowser } from './browser-session.mjs';
import { projectRoot } from './php-runtime.mjs';
const origin = process.env.DOORPRIZE_TEST_ORIGIN || 'http://127.0.0.1:8098';
const auth = await qaSession(origin);
const fetch = auth.fetch;
const directory = resolve(projectRoot, '.cache/imports-qa'); await mkdir(directory, { recursive: true });
async function api(path, data) {
  const response = await fetch(origin + '/api/' + path, { method: data ? 'POST' : 'GET', headers: { origin, 'content-type': 'application/json' }, body: data ? JSON.stringify(data) : undefined });
  const result = await response.json(); assert.ok(response.ok, JSON.stringify(result)); return result;
}
let fields = (await api('fields')).items;
if (!fields.length) { await api('fields', { action: 'create', label: 'Divisi' }); await api('fields', { action: 'create', label: 'Nomor peserta' }); }
const book = new ExcelJS.Workbook(), sheet = book.addWorksheet('Data Form');
sheet.getCell('A1').value = 'DATA PESERTA ACARA'; sheet.getRow(3).values = ['Nomor peserta', 'Nama lengkap', 'Divisi'];
const entries = [[123, 'alam', 'A'], ['00123', 'Alam', 'a'], ['00099', '', 'A'], ['', 'Alam', 'A'], ['', 'alam', 'A'], ['00456', 'Budi', 'B'], ['00789', { formula: '"Citra"', result: 'Citra' }, 'B'], ['00999', { formula: '1+1' }, 'B'], ...Array.from({ length: 55 }, (_, index) => [String(index + 1000).padStart(5, '0'), `Peserta ${index}`, 'C'])];
entries.forEach((row, index) => { sheet.getRow(index + 4).values = row; sheet.getCell(index + 4, 1).numFmt = '00000'; });
const filename = resolve(directory, 'Data peserta.xlsx'); await book.xlsx.writeFile(filename);
const browser = await openBrowser('imports-qa'), errors = [];
browser.onEvent(event => { if (event.method === 'Runtime.exceptionThrown') errors.push(event.params.exceptionDetails); });
  await auth.browser(browser);
const page = await browser.page(origin + '/#participants', 1440, 1000);
const input = (selector, value, type = 'change') => page.evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); node.value = ${JSON.stringify(String(value))}; node.dispatchEvent(new Event(${JSON.stringify(type)}, { bubbles:true })); })()`);
try {
  await page.wait(`document.querySelector('#draw-capacity')?.textContent === '0 tersedia' && document.querySelector('#participant-matched')?.textContent.includes('hasil')`);
  await page.click('#participants-import-excel');
  await page.wait(`document.querySelector('#excel-dialog').open && !document.querySelector('#excel-template').disabled`);
  // Template benar-benar dibuat oleh worker yang sama, di bawah CSP aplikasi.
  await browser.call('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: directory });
  await page.click('#excel-template');
  await page.wait(`document.querySelector('#excel-status').textContent.includes('Template siap') || !document.querySelector('#excel-error').hidden`);
  assert.equal(await page.evaluate(`document.querySelector('#excel-error').textContent`), '');
  const { root } = await browser.call('DOM.getDocument', {}, page.sessionId);
  const { nodeId } = await browser.call('DOM.querySelector', { nodeId: root.nodeId, selector: '#excel-file' }, page.sessionId);
  await browser.call('DOM.setFileInputFiles', { nodeId, files: [filename] }, page.sessionId);
  await page.wait(`!document.querySelector('#excel-mapping-controls').hidden || !document.querySelector('#excel-error').hidden`);
  assert.equal(await page.evaluate(`document.querySelector('#excel-error').textContent`), '');
  assert.equal(await page.evaluate(`document.querySelector('#excel-header').value`), '3');
  assert.equal(await page.evaluate(`document.querySelector('[data-excel-field="name"]').value`), '2');
  assert.equal(await page.evaluate(`document.querySelector('[data-excel-field="field_1"]').value`), '3');
  assert.equal(await page.evaluate(`document.querySelector('[data-excel-field="field_2"]').value`), '1');
  await page.click('#excel-keys input[aria-label="Kunci duplikasi Nama"]');
  await page.click('#excel-keys input[aria-label="Kunci duplikasi Nomor peserta"]');
  await page.click('#excel-inspect');
  await page.wait(`!document.querySelector('#excel-preview').hidden && !document.querySelector('#excel-inspect').disabled || !document.querySelector('#excel-error').hidden`);
  assert.equal(await page.evaluate(`document.querySelector('#excel-error').textContent`), '');
  assert.equal((await api('participants')).items.length, 0);
  assert.match(await page.evaluate(`document.querySelector('#excel-summary').textContent`), /Tersedia · 60Duplikat · 1Tidak valid · 2/);
  assert.match(await page.evaluate(`document.querySelector('#excel-preview-table tbody').textContent`), /00123/);
  assert.equal(await page.evaluate(`document.querySelectorAll('#excel-preview-table tbody tr').length`), 50);
  await writeFile(resolve(directory, 'desktop.png'), Buffer.from((await browser.call('Page.captureScreenshot', { format: 'png' }, page.sessionId)).data, 'base64'));
  await page.click('#excel-next'); await page.wait(`document.querySelector('#excel-page').textContent === 'Halaman 2'`);
  assert.equal(await page.evaluate(`document.querySelectorAll('#excel-preview-table tbody tr').length`), 13);
  await page.click('#excel-previous'); await page.wait(`document.querySelector('#excel-page').textContent === 'Halaman 1'`);
  // Respons commit hilang: client mengulang batch yang sama tanpa insert/audit kedua.
  await page.evaluate(`(() => { const original = window.fetch; window.__commitResponseDropped = false; window.fetch = async (...args) => {
    const response = await original(...args);
    if (!window.__commitResponseDropped && args[0] === '/api/imports' && args[1]?.body && JSON.parse(args[1].body).action === 'commit') {
      window.__commitResponseDropped = true; throw new TypeError('Simulasi respons hilang setelah commit');
    } return response;
  }; })()`);
  await page.click('#excel-commit');
  await page.wait(`!document.querySelector('#excel-dialog').open && document.querySelector('#participant-summary').textContent.includes('Tersedia · 60')`);
  assert.equal(await page.evaluate('window.__commitResponseDropped'), true);
  assert.equal((await api('history')).items.filter(item => item.entity_type === 'participant_import').length, 1);
  const participants = await api('participants'); assert.equal(participants.summary.find(row => row.status === 'duplicate').count, 1);
  await page.wait(`document.querySelector('#draw-capacity').textContent === '60 tersedia'`);
  await page.click('#tab-settings'); await page.wait(`document.querySelectorAll('#duplicate-keys input').length === 3 && !document.querySelector('#duplicate-save').disabled`);
  assert.equal(await page.evaluate(`document.querySelector('#duplicate-keys input[aria-label="Kunci duplikasi Nama"]').checked`), true);
  await page.click('#duplicate-keys input[aria-label="Kunci duplikasi Nama"]'); await page.click('#duplicate-keys input[aria-label="Kunci duplikasi Nomor peserta"]'); await page.click('#duplicate-save');
  await page.wait(`document.querySelector('#duplicate-message').textContent === 'Aturan disimpan.'`);
  await page.wait(`document.querySelector('#draw-capacity').textContent === '61 tersedia'`);
  await page.click('#tab-participants'); await page.click('#participants-import-excel');
  await page.wait(`!document.querySelector('#excel-template').disabled`);
  await browser.call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false }, page.sessionId);
  assert.ok(await page.evaluate(`document.querySelector('#excel-dialog').getBoundingClientRect().right <= innerWidth`));
  assert.ok(await page.evaluate(`document.querySelector('#excel-dialog').scrollWidth <= document.querySelector('#excel-dialog').clientWidth`));
  await writeFile(resolve(directory, 'mobile.png'), Buffer.from((await browser.call('Page.captureScreenshot', { format: 'png' }, page.sessionId)).data, 'base64'));
  await page.click('#excel-close');
  // Respons sesi lama tidak boleh menimpa dialog baru sesudah batal/buka cepat.
  await page.evaluate(`(() => { const original = window.fetch; let delayed = false; window.fetch = async (...args) => {
    const response = await original(...args);
    if (!delayed && args[0] === '/api/imports' && !args[1]?.body) {
      delayed = true; const data = await response.json(); data.fields[0].label = 'Metadata lama';
      await new Promise(resolve => setTimeout(resolve, 300)); return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
    } return response;
  }; })()`);
  await page.click('#participants-import-excel'); await page.click('#excel-close'); await page.click('#participants-import-excel');
  await page.wait(`!document.querySelector('#excel-template').disabled`);
  await page.evaluate(`new Promise(resolve => setTimeout(resolve, 400))`);
  assert.equal(await page.evaluate(`Boolean(document.querySelector('#excel-keys input[aria-label="Kunci duplikasi Nama"]'))`), true);
  assert.equal(await page.evaluate(`document.querySelector('#excel-error').hidden`), true);
  await page.click('#excel-close');
  assert.deepEqual(errors, []);
  console.log('Browser Chrome: template worker + CSP, file XLSX, deteksi baris header, pemetaan otomatis, nol di depan, pratinjau/paginasi, import, refresh kelayakan, aturan duplikasi dan dialog mobile lulus.');
} finally { await browser.close(); }
