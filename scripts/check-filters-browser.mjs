import { qaSession } from './browser-auth.mjs';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openBrowser } from './browser-session.mjs';

const origin = `http://127.0.0.1:${process.env.PORT || 8098}`;
const auth = await qaSession(origin);
const fetch = auth.fetch;
assert(!origin.endsWith(':8091'), 'Gunakan server/database QA terpisah.');
async function api(resource, payload) {
  const response = await fetch(`${origin}/api/${resource}`, payload ? { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) } : {});
  const data = await response.json(); assert(response.ok, JSON.stringify(data)); return data;
}
const initial = await api('draws'); assert(initial.available_count === 0 && !initial.fields.length, 'Gunakan database QA baru.');
await api('fields', { action: 'create', label: 'Divisi' }); await api('fields', { action: 'create', label: 'Kota' });
const fields = (await api('fields')).items, schema = fields.map(field => `${field.id}:${field.slot}:${field.version}`).join(',');
for (let index = 1; index <= 120; index++) await api('participants', { action: 'create', name: `Peserta ${String(index).padStart(3, '0')}`, field_1: index <= 60 ? 'A' : 'B', field_2: index % 2 ? 'Barat' : 'Timur', status: 'available', field_schema: schema });
const browser = await openBrowser('filters-qa');
let page;
const errors = [], requests = [];
browser.onEvent(event => {
  if (event.method === 'Runtime.exceptionThrown') errors.push(event.params.exceptionDetails);
  if (event.method === 'Network.requestWillBeSent' && event.params.request.url.includes('/api/')) requests.push(event.params.request.url);
});
const state = `(async () => (await import('/assets/modules/draw-state.js')).drawState.state)()`;
const input = (page, selector, value, event = 'input') => page.evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); node.value = ${JSON.stringify(String(value))}; node.dispatchEvent(new Event(${JSON.stringify(event)}, { bubbles: true })); })()`);
const group = (scope, key) => `#${scope}-filters [data-filter-field="${key}"]`;
async function openFilter(page,scope) {
  if (!await page.evaluate(`document.querySelector('#${scope}-filter-menu').open`)) await page.click(`#${scope}-filter-menu > summary`);
}
async function filter(page, scope, key, value) {
  await openFilter(page,scope);
  const selector = group(scope, key);
  await page.click(`${selector} .switch input`);
  await page.wait(`document.querySelector(${JSON.stringify(selector + ' .filter-values input[value="' + value + '"]')})`);
  await page.click(`${selector} .filter-check input[aria-label]`);
  await page.click(`${selector} .filter-values input[value="${value}"]`);
}
async function status(page, values) {
  await openFilter(page,'participant');
  const selector = group('participant', 'status');
  if (!await page.evaluate(`document.querySelector(${JSON.stringify(selector + ' .switch input')}).checked`)) await page.click(`${selector} .switch input`);
  const all = `${selector} .filter-check input[aria-label]`;
  if (!await page.evaluate(`document.querySelector(${JSON.stringify(all)}).checked`)) await page.click(all);
  await page.click(all);
  for (const value of values) await page.click(`${selector} .filter-values input[value="${value}"]`);
}
async function bulk(page, field, value) {
  await page.click('#participants-bulk-edit'); await page.wait(`document.querySelector('#participant-bulk-dialog').open`);
  await input(page, '#bulk-field', field, 'change'); await input(page, '#bulk-value', value, 'change'); await page.click('#bulk-save');
  await page.wait(`!document.querySelector('#participant-bulk-dialog').open && !document.querySelector('#bulk-save').disabled`);
}
try {
  await auth.browser(browser);
  page = await browser.page(origin, 1440, 1000); await browser.call('Network.enable', {}, page.sessionId);
  await page.wait(`document.querySelector('#draw-capacity')?.textContent === '120 tersedia' && !document.querySelector('#draw-start').disabled`);
  assert.equal(await page.evaluate(`document.querySelector('#draw-filters').closest('details').id`),'draw-filter-menu');
  assert.equal(await page.evaluate(`document.querySelector('#draw-filter-menu').dataset.filterActive`),'false');
  const initialRequests = requests.length;
  const beforePopup = await page.evaluate(`document.querySelector('#panel-draw .footnote').getBoundingClientRect().top`);
  await openFilter(page,'draw');
  await page.wait(`getComputedStyle(document.querySelector('#draw-filters')).position === 'fixed' && document.querySelector('#draw-filters').getBoundingClientRect().width > 0`);
  assert.equal(await page.evaluate(`document.querySelector('#panel-draw .footnote').getBoundingClientRect().top`),beforePopup,'Dropdown tidak memperpanjang halaman');
  await page.evaluate(`document.querySelector('#draw-filter-menu').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  assert.equal(await page.evaluate(`document.querySelector('#draw-filter-menu').open`),false);
  assert.equal(requests.length,initialRequests,'Buka/tutup dropdown tidak membaca data');
  await openFilter(page,'draw');
  await page.click(`${group('draw','field_1')} .switch input`);
  await page.wait(`document.querySelector(${JSON.stringify(group('draw','field_1')+' .filter-values input[value="A"]')})`);
  assert.equal(await page.evaluate(`document.querySelector('#draw-filter-menu').dataset.filterActive`),'false','Pilih semua tanpa pengecualian belum membatasi peserta');
  await page.click(`${group('draw','field_1')} .filter-check input[aria-label]`);
  await page.wait(`document.querySelector('#draw-capacity').textContent === '0 tersedia'`);
  assert.equal(await page.evaluate(`document.querySelector('#draw-filter-menu [data-filter-count]').textContent`),'1');
  await page.click('#draw-filter-menu + [data-clear-filters]');
  await page.wait(`document.querySelector('#draw-capacity').textContent === '120 tersedia'`);
  assert.equal(await page.evaluate(`document.querySelector('#draw-filter-menu').dataset.filterActive`),'false');
  assert.ok(await page.evaluate(`document.querySelector('#draw-filter-menu + [data-clear-filters]').hidden && !document.querySelector('#draw-filter-menu').open`));
  await page.evaluate(`(() => { window.__filterQueries = []; const original = window.fetch; window.fetch = async (...args) => {
    const response = await original(...args);
    if (args[0] === '/api/participants' && args[1]?.body) {
      const query = JSON.parse(args[1].body), data = await response.clone().json();
      if (query.action === 'query') window.__filterQueries.push({ query, summary: data.summary, version: data.participants_version });
    }
    return response;
  }; })()`);
  await page.click('[data-tab="participants"]'); await page.wait(`document.querySelectorAll('#participant-list tbody tr').length === 50 && !document.querySelector('#participants-next').disabled`);
  await page.click('#participant-page-select'); assert.equal(await page.evaluate(`document.querySelector('#participants-selected').textContent`), '50 dipilih');
  await page.click('#participants-next'); await page.wait(`document.querySelector('#participant-page').textContent === 'Halaman 2' && !document.querySelector('#participant-page-select').disabled`);
  await page.click('#participant-list tbody input[type="checkbox"]');
  assert.equal(await page.evaluate(`document.querySelector('#participants-selected').textContent`), '51 dipilih');
  await page.click('#participants-previous'); await page.wait(`document.querySelector('#participant-page').textContent === 'Halaman 1' && !document.querySelector('#participant-page-select').disabled`);
  assert(await page.evaluate(`document.querySelector('#participant-page-select').checked`));
  await page.evaluate(`document.querySelector('#participant-list .table-scroll').scrollTop = 180`);
  const scroll = await page.evaluate(`document.querySelector('#participant-list .table-scroll').scrollTop`);
  await page.click('#participant-list tbody input[type="checkbox"]');
  assert.equal(await page.evaluate(`document.querySelector('#participant-list .table-scroll').scrollTop`), scroll);
  await page.click('#participants-clear-selection');
  assert.equal(await page.evaluate(`document.querySelector('#participant-status')`), null, 'Status harus menyatu dalam filter bertingkat.');
  await page.click('.participant-filter-card summary');
  await status(page, []);
  await page.wait(`document.querySelector('#participant-matched').textContent === '0 hasil'`);
  await status(page, ['available']);
  await page.wait(`document.querySelector('#participant-matched').textContent === '120 hasil' && !document.querySelector('#participants-select-all').disabled`);
  const unified = await browser.call('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  await writeFile(resolve(browser.cache, 'participants-filter.png'), Buffer.from(unified.data, 'base64'));
  await filter(page, 'participant', 'field_1', 'A');
  await page.wait(`document.querySelector('#participant-matched').textContent === '60 hasil' && !document.querySelector('#participants-select-all').disabled`);
  await filter(page, 'participant', 'field_2', 'Timur');
  await page.wait(`document.querySelector('#participant-matched').textContent === '30 hasil' && !document.querySelector('#participants-select-all').disabled`);
  assert.equal(await page.evaluate(`document.querySelector('#participant-filter-menu [data-filter-count]').textContent`),'3','Status dan dua isian ditandai aktif');
  await page.click('#participants-select-all'); await page.click('#participant-list tbody input[type="checkbox"]');
  assert.equal(await page.evaluate(`document.querySelector('#participants-selected').textContent`), '29 dipilih');
  await bulk(page, 'status', 'eliminated');
  await page.wait(`document.querySelector('#participant-matched').textContent === '1 hasil'`);
  assert.equal((await api('draws')).available_count, 91);
  await status(page, ['available', 'eliminated']);
  await page.wait(`document.querySelector('#participant-matched').textContent === '30 hasil'`);
  await page.click(`${group('participant', 'status')} .filter-check input[aria-label]`);
  await page.click(`${group('participant', 'status')} .filter-values input[value="eliminated"]`);
  await page.wait(`document.querySelector('#participant-matched').textContent === '1 hasil'`);
  await status(page, ['eliminated']);
  await page.wait(`document.querySelector('#participant-matched').textContent === '29 hasil' && !document.querySelector('#participants-select-all').disabled`);
  await page.click('#participants-select-all'); await bulk(page, 'status', 'available');
  assert.equal((await api('draws')).available_count, 120);
  await page.click(`${group('participant', 'field_1')} .switch input`); await page.click(`${group('participant', 'field_2')} .switch input`);
  await page.click(`${group('participant', 'status')} .switch input`); await input(page, '#participant-search', 'Peserta 001');
  await page.wait(`document.querySelector('#participant-matched').textContent === '1 hasil' && !document.querySelector('#participants-select-all').disabled`);
  await page.click('#participants-select-all'); await bulk(page, 'field_2', 'Jakarta');
  assert.equal((await api('participants')).items[0].field_2, 'Jakarta');

  await page.click('[data-tab="draw"]');
  await filter(page, 'draw', 'field_1', 'A'); await filter(page, 'draw', 'field_2', 'Timur');
  assert.equal(await page.evaluate(`document.querySelector('#draw-filter-menu [data-filter-count]').textContent`),'2');
  await page.evaluate(`document.querySelector('#draw-start').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))`);
  assert.equal(await page.evaluate(`document.querySelector('#draw-filter-menu').open`),false,'Klik luar menutup dropdown');
  await page.wait(`document.querySelector('#draw-capacity').textContent === '30 tersedia' && !document.querySelector('#draw-start').disabled`);
  await input(page, '#winner-count', 2); await page.click('#draw-start');
  await page.wait(`document.querySelector('#draw-start span').textContent === 'Stop undian' && !document.querySelector('#draw-start').disabled`);
  assert(await page.evaluate(`document.querySelector(${JSON.stringify(group('draw', 'field_1') + ' .switch input')}).disabled`));
  assert.ok(await page.evaluate(`document.querySelector('#draw-filter-menu + [data-clear-filters]').disabled`),'Hapus filter dikunci selama undian');
  requests.length = 0; await page.evaluate(`new Promise(resolve => setTimeout(resolve, 400))`); assert.deepEqual(requests, []);
  await page.click('#draw-start'); await page.wait(`!document.querySelector('#draw-confirm').disabled`);
  assert((await page.evaluate(state)).draw.entries.every(entry => entry.participant.field_1 === 'A' && entry.participant.field_2 === 'Timur'));
  await page.click('#draw-confirm'); await page.wait(`document.querySelector('#draw-capacity').textContent === '28 tersedia' && !document.querySelector('#draw-start').disabled`);
  const desktop = await browser.call('Page.captureScreenshot', { format: 'png' }, page.sessionId); await writeFile(resolve(browser.cache, 'desktop.png'), Buffer.from(desktop.data, 'base64'));
  await browser.call('Page.reload', {}, page.sessionId);
  await page.wait(`document.querySelector('#draw-capacity')?.textContent === '28 tersedia' && !document.querySelector('#draw-start').disabled`);
  assert(await page.evaluate(`document.querySelector(${JSON.stringify(group('draw', 'field_1') + ' .switch input')}).checked`));
  assert.equal(await page.evaluate(`document.querySelector('#draw-filter-menu').dataset.filterActive`),'true','Penanda pulih bersama filter tersimpan');
  await page.click('#draw-filter-menu + [data-clear-filters]');
  await page.wait(`document.querySelector('#draw-capacity').textContent === '118 tersedia'`);
  await page.click('#draw-clear'); await page.wait(`!document.querySelector('#draw-start').disabled`);
  assert.equal(await page.evaluate(`document.querySelector('#draw-filter-menu').dataset.filterActive`),'false');
  assert.equal(await page.evaluate(`document.querySelector('#draw-capacity').textContent`),'118 tersedia','Kosongkan layar mempertahankan reset filter');
  await page.click('[data-tab="participants"]');
  await page.click('.participant-filter-card summary'); await status(page, ['winner']);
  await page.wait(`document.querySelector('#participant-matched').textContent === '2 hasil' && !document.querySelector('#participants-select-all').disabled`);
  await page.click('#participants-select-all'); await page.click('#participants-bulk-edit'); await page.wait(`document.querySelector('#participant-bulk-dialog').open`);
  await page.click('#bulk-save'); await page.wait(`!document.querySelector('#bulk-error').hidden`);
  assert((await page.evaluate(`document.querySelector('#bulk-error').textContent`)).includes('pemenang'));
  await page.click('#participant-bulk-close');
  await browser.call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false }, page.sessionId);
  assert(await page.evaluate(`document.documentElement.scrollWidth <= innerWidth`));
  await page.evaluate(`document.querySelector('#participant-filter-menu').scrollIntoView({block:'center'})`);
  await openFilter(page,'participant');
  await page.wait(`(() => {const rect=document.querySelector('#participant-filters').getBoundingClientRect();return rect.width>0 && rect.left>=0 && rect.right<=innerWidth && rect.top>=0 && rect.bottom<=innerHeight;})()`);
  const mobile = await browser.call('Page.captureScreenshot', { format: 'png' }, page.sessionId); await writeFile(resolve(browser.cache, 'mobile.png'), Buffer.from(mobile.data, 'base64'));
  await page.click('#participant-filter-menu + [data-clear-filters]');
  await page.wait(`document.querySelector('#participant-matched').textContent === '120 hasil'`);
  assert.ok(await page.evaluate(`document.querySelector('#participant-filter-menu').dataset.filterActive==='false' && document.querySelector('#participants-selected').textContent==='0 dipilih'`),'Reset filter peserta juga mengosongkan pilihan massal');
  await page.click('[data-tab="draw"]');
  await page.evaluate(`document.querySelector('#draw-filter-menu').scrollIntoView({block:'center'})`);
  await openFilter(page,'draw');
  await page.wait(`(() => {const rect=document.querySelector('#draw-filters').getBoundingClientRect();return rect.width>0 && rect.left>=0 && rect.right<=innerWidth && rect.top>=0 && rect.bottom<=innerHeight;})()`);
  await writeFile(resolve(browser.cache,'draw-mobile.png'),Buffer.from((await browser.call('Page.captureScreenshot',{format:'png'},page.sessionId)).data,'base64'));
  assert.equal(errors.length, 0, JSON.stringify(errors));
  console.log('Browser filter: dropdown tanpa mengubah tinggi halaman, penanda/filter efektif, hapus sekali klik, lock/restore, Escape/klik luar, pilihan massal, undian terfilter, viewport mobile dan tanpa polling: OK.');
} catch (error) {
  if (page) {
    console.error(await page.evaluate(`JSON.stringify({matched:document.querySelector('#participant-matched')?.textContent,feedback:document.querySelector('#management-feedback')?.textContent,queries:window.__filterQueries?.slice(-10)})`));
    const screenshot = await browser.call('Page.captureScreenshot', { format: 'png' }, page.sessionId);
    await writeFile(resolve(browser.cache, 'failure.png'), Buffer.from(screenshot.data, 'base64'));
  }
  throw error;
} finally { await browser.close(); }
