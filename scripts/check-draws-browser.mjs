import { qaSession } from './browser-auth.mjs';
import assert from 'node:assert/strict';
import { writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openBrowser } from './browser-session.mjs';
import { projectRoot } from './php-runtime.mjs';

const origin = `http://127.0.0.1:${process.env.PORT || 8096}`;
const auth = await qaSession(origin);
const fetch = auth.fetch;
assert(!origin.endsWith(':8091'), 'Gunakan database dan port QA terpisah.');
const uploads = [];
async function api(resource, payload) {
  const response = await fetch(`${origin}/api/${resource}`, payload ? { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) } : {});
  const data = await response.json();
  assert(response.ok, JSON.stringify(data));
  return data;
}
async function upload() {
  const form = new FormData();
  form.set('background', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=', 'base64')], { type: 'image/png' }), 'uji.png');
  const response = await fetch(`${origin}/api/backgrounds`, { method: 'POST', headers: { Origin: origin }, body: form });
  const data = await response.json(); assert(response.ok, JSON.stringify(data)); uploads.push(data.path); return data.path;
}
const initial = await api('draws');
assert(initial.available_count === 0 && initial.fields.length === 0 && !initial.draw, 'Gunakan database QA baru.');
await api('fields', { action: 'create', label: 'Divisi' });
await api('fields', { action: 'create', label: 'Nomor' });
const fields = (await api('fields')).items;
const schema = fields.map(field => `${field.id}:${field.slot}:${field.version}`).join(',');
const names = ['Ayu', 'Muhammad Rizky Pratama', 'Bima Saputra', 'Nadia Putri', 'Salsabila Maharani', 'Raka', 'José André', '<img src=x onerror=alert(1)>'];
for (let index = 0; index < 40; index++) await api('participants', { action: 'create', name: `${names[index % names.length]} ${index + 1}`, field_1: `Divisi ${index % 3 + 1}`, field_2: `DP-${index + 1}`, status: 'available', field_schema: schema });
const a = await api('prizes', { action: 'create', name: 'Tas', quantity: 20 });
const b = await api('prizes', { action: 'create', name: 'Payung', quantity: 20 });
const empty = await api('prizes', { action: 'create', name: 'Habis', quantity: 0 });
const main = await upload(), specific = await upload();
const settings = await api('settings');
await api('settings', { action: 'update', settings_version: settings.settings_version, client_name: '', event_name: 'Uji undian', event_at: '', show_event_info: true,
  visual: { ...settings.visual, background_type: 'image', background_image: main }, prize_backgrounds: [{ id: a.id, version: a.version, path: specific }] });

const browser = await openBrowser('draws-qa');
const requests = [], errors = [];
browser.onEvent(event => {
  if (event.method === 'Runtime.exceptionThrown') errors.push(event.params.exceptionDetails);
  if (event.method === 'Network.requestWillBeSent' && event.params.request.url.startsWith(`${origin}/api/`)) requests.push({ url: event.params.request.url, method: event.params.request.method });
});
const stateExpression = `(async () => (await import('/assets/modules/draw-state.js')).drawState.state)()`;
const setInput = (page, selector, value) => page.evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); node.value = ${JSON.stringify(String(value))}; node.dispatchEvent(new Event('input', { bubbles: true })); })()`);
try {
  await auth.browser(browser);
  const operator = await browser.page(origin, 1440, 1000);
  await browser.call('Network.enable', {}, operator.sessionId);
  await operator.wait(`document.querySelector('#draw-capacity')?.textContent === '40 tersedia' && !document.querySelector('#draw-start').disabled`);
  assert.equal(await operator.evaluate(`document.querySelector('#try-animation')`),null);
  assert.equal(await operator.evaluate(`document.querySelector('#visual-status').textContent`),'Siap mengundi');
  const controlsAligned = `(() => {
    const preview=document.querySelector('.preview-shell').getBoundingClientRect();
    const start=document.querySelector('#draw-start').getBoundingClientRect();
    const layout=document.querySelector('.draw-controls-layout').getBoundingClientRect();
    const row=document.querySelector('.action-row').getBoundingClientRect();
    const buttons=[...document.querySelectorAll('.action-row .button')].map(node=>node.getBoundingClientRect());
    return Math.abs(start.width-row.width)<1 && Math.abs(layout.x+layout.width/2-preview.x-preview.width/2)<1
      && Math.max(...buttons.map(box=>box.width))-Math.min(...buttons.map(box=>box.width))<1
      && buttons.every(box=>box.y===buttons[0].y) && document.documentElement.scrollWidth<=innerWidth;
  })()`;
  assert.equal(await operator.evaluate(controlsAligned),true,'Kontrol terpusat pada preview dan Mulai selebar tiga tombol');
  await operator.click('[data-tab="participants"]');
  await operator.wait(`document.querySelectorAll('#participant-list tbody tr').length === 40`);
  await operator.click('[data-tab="draw"]');
  await setInput(operator, '#winner-count', 6);
  await operator.click('#draw-with-prizes');
  await operator.click('#draw-random-prizes');
  await operator.wait(`document.querySelectorAll('#draw-prize-list input').length === 3`);
  assert(await operator.evaluate(`document.querySelector('[data-prize-id="${empty.id}"]').disabled`));
  for (const [id, quantity] of [[a.id, 3], [b.id, 3]]) await setInput(operator, `[data-prize-id="${id}"]`, quantity);
  await operator.click('#draw-start');
  await operator.wait(`document.querySelector('#draw-start span').textContent === 'Stop undian' && !document.querySelector('#draw-start').disabled`);
  assert(await operator.evaluate(`document.querySelector('#winner-count').disabled`));
  assert.equal(await operator.evaluate(`document.querySelector('#draw-session-status').dataset.state`),'rolling');
  assert.match(await operator.evaluate(`document.querySelector('#draw-lock-reason').textContent`),/selama pengundian/);
  const output = await browser.page(`${origin}/output`, 1920, 1080);
  await browser.call('Network.enable', {}, output.sessionId);
  await output.wait(`document.querySelector('#visual-stage')?.dataset.animation === 'running' && document.querySelectorAll('.shuffle-glyph').length > 0`);
  assert.equal((await operator.evaluate(stateExpression)).draw.id, (await output.evaluate(stateExpression)).draw.id);
  assert.equal(await output.evaluate(`document.querySelector('#stage-image').getAttribute('href')`), main, 'Beberapa hadiah memakai background utama.');
  requests.length = 0;
  await output.evaluate(`new Promise(resolve => setTimeout(resolve, 1200))`);
  assert.deepEqual(requests, [], 'Animasi nyata tidak boleh melakukan polling/request API.');
  assert.equal(await output.evaluate(`document.querySelectorAll('#draw-results > g').length`), 0, 'Nama terpilih tidak ditampilkan selama pengacakan.');
  await operator.click('#draw-start');
  await output.wait(`document.querySelectorAll('#draw-results > g').length === 6`);
  assert.equal(await output.evaluate(`document.querySelector('#shuffle-area').getAttribute('visibility')`), 'hidden', 'Stop menyembunyikan glyph acak sebelum menampilkan hasil.');
  await operator.wait(`!document.querySelector('#draw-confirm').disabled`);
  assert.equal(await operator.evaluate(`document.querySelector('#visual-status').textContent`),'Menunggu keputusan');
  assert.equal(await operator.evaluate(`document.querySelector('#draw-session-status').dataset.state`),'pending');
  assert.match(await operator.evaluate(`document.querySelector('#draw-lock-reason').textContent`),/sampai hasil diputuskan/);
  await browser.call('Page.reload',{},operator.sessionId);
  await operator.wait(`document.querySelector('#draw-session-status')?.dataset.state==='pending' && !document.querySelector('#draw-confirm').disabled`);
  assert.equal(await operator.evaluate(`document.querySelector('#draw-pending-message').hidden`),false,'Penyebab terkunci terlihat kembali setelah refresh');
  await writeFile(resolve(browser.cache,'pending-controls.png'),Buffer.from((await browser.call('Page.captureScreenshot',{format:'png'},operator.sessionId)).data,'base64'));
  let state = await operator.evaluate(stateExpression);
  const firstWinners = state.draw.entries.map(item => item.participant_id);
  assert.equal(new Set(firstWinners).size, 6);
  assert.deepEqual(state.draw.entries.reduce((totals, item) => ({ ...totals, [item.prize_name]: (totals[item.prize_name] || 0) + 1 }), {}), { Tas: 3, Payung: 3 });
  assert.equal(await output.evaluate(`document.querySelectorAll('#draw-results img, #draw-results script').length`), 0);
  const screenshot = await browser.call('Page.captureScreenshot', { format: 'png' }, output.sessionId);
  await writeFile(resolve(browser.cache, 'output.png'), Buffer.from(screenshot.data, 'base64'));
  requests.length = 0;
  await operator.click('#draw-confirm');
  await operator.wait(`document.querySelector('#visual-status').textContent === 'Disahkan' && !document.querySelector('#draw-start').disabled`);
  assert.equal(await operator.evaluate(`document.querySelector('#draw-lock-notice').hidden`),true);
  state = await operator.evaluate(stateExpression);
  assert.equal(state.available_count, 34);
  assert.equal((await api('prizes')).items.find(item => item.id === a.id).remaining_quantity, 17);
  assert.equal(requests.filter(item => item.url.includes('/api/participants')).length, 0, 'Pengesahan memperbarui baris/cache, bukan membaca ulang list peserta.');
  await operator.click('[data-tab="participants"]');
  await operator.wait(`document.querySelector('#participant-summary').textContent.includes('Pemenang · 6')`);
  assert.equal(await operator.evaluate(`document.querySelector('#participant-summary').textContent.includes('Pemenang · 6')`), true);
  assert.equal(await operator.evaluate(`Array.from(document.querySelectorAll('#participant-list tbody tr')).filter(row => row.textContent.includes('Pemenang')).length`), 6);
  await operator.click('[data-tab="draw"]');

  // Layar hasil dan konfigurasi pulih setelah operator direfresh.
  await browser.call('Page.reload', {}, operator.sessionId);
  await operator.wait(`document.querySelector('#visual-status')?.textContent === 'Disahkan' && !document.querySelector('#draw-start').disabled`);
  assert.equal(await operator.evaluate(`document.querySelector('#winner-count').value`), '6');
  await operator.click('#draw-clear');
  await output.wait(`document.querySelector('#visual-stage').dataset.animation === 'standby'`);
  await operator.wait(`!document.querySelector('#winner-count').disabled`);

  // Satu hadiah memakai background khusus. Kosongkan tidak mengubah kelayakan/stok.
  await setInput(operator, '#winner-count', 2);
  await operator.wait(`document.querySelectorAll('#draw-prize-list input').length === 3`);
  await setInput(operator, `[data-prize-id="${a.id}"]`, 2);
  await setInput(operator, `[data-prize-id="${b.id}"]`, 0);
  await operator.click('#draw-start');
  await output.wait(`document.querySelector('#visual-stage').dataset.animation === 'running'`);
  assert.equal(await output.evaluate(`document.querySelector('#stage-image').getAttribute('href')`), specific);
  await operator.wait(`!document.querySelector('#draw-start').disabled`);
  await operator.click('#draw-start');
  await operator.wait(`!document.querySelector('#draw-confirm').disabled`);
  state = await operator.evaluate(stateExpression);
  assert(state.draw.entries.every(item => !firstWinners.includes(item.participant_id)));
  await operator.click('#draw-clear');
  await operator.wait(`!document.querySelector('#draw-start').disabled`);
  assert.equal((await operator.evaluate(stateExpression)).available_count, 34);

  // Hadiah acak, eliminasi semua, stok tetap.
  await operator.click('#draw-random-prizes');
  await setInput(operator, '#winner-count', 3);
  await operator.click('#draw-start');
  await operator.wait(`document.querySelector('#draw-start span').textContent === 'Stop undian' && !document.querySelector('#draw-start').disabled`);
  await operator.click('#draw-start');
  await operator.wait(`!document.querySelector('#draw-eliminate').disabled`);
  await operator.click('#draw-eliminate');
  await operator.wait(`!document.querySelector('#draw-start').disabled`);
  assert.equal((await operator.evaluate(stateExpression)).available_count, 31);
  assert.equal((await api('prizes')).items.find(item => item.id === a.id).remaining_quantity, 17);
  await output.wait(`document.querySelectorAll('#draw-results > g').length === 0`);

  // Jumlah lebih besar: seluruh nama/isian tampil, area tidak beririsan/terpotong.
  await operator.click('#draw-with-prizes');
  await setInput(operator, '#winner-count', 20);
  await operator.click('#draw-start');
  await operator.wait(`document.querySelector('#draw-start span').textContent === 'Stop undian' && !document.querySelector('#draw-start').disabled`);
  await operator.click('#draw-start');
  await output.wait(`document.querySelectorAll('#draw-results > g').length === 20`);
  const geometry = await output.evaluate(`(() => {
    const area = document.querySelector('#result-clip-area').getBBox();
    const boxes = [...document.querySelectorAll('#draw-results > g')].map(group => group.getBBox());
    const outside = boxes.filter(box => box.x < area.x - 1 || box.y < area.y - 1 || box.x + box.width > area.x + area.width + 1 || box.y + box.height > area.y + area.height + 1).length;
    let overlaps = 0;
    boxes.forEach((box, i) => boxes.slice(i + 1).forEach(other => { if (box.x < other.x + other.width && box.x + box.width > other.x && box.y < other.y + other.height && box.y + box.height > other.y) overlaps++; }));
    return { outside, overlaps, count: boxes.length };
  })()`);
  assert.deepEqual(geometry, { outside: 0, overlaps: 0, count: 20 });
  const grid = await browser.call('Page.captureScreenshot', { format: 'png' }, output.sessionId);
  await writeFile(resolve(browser.cache, 'output-20.png'), Buffer.from(grid.data, 'base64'));
  await browser.call('Page.reload', {}, output.sessionId);
  await output.wait(`document.querySelectorAll('#draw-results > g').length === 20`);
  await operator.click('#draw-clear');
  await operator.wait(`!document.querySelector('#draw-start').disabled`);

  // Batalkan saat masih berputar, kemudian dua jendela mengirim Mulai bersamaan.
  await operator.click('#draw-start');
  await operator.wait(`document.querySelector('#draw-start span').textContent === 'Stop undian' && !document.querySelector('#draw-clear').disabled`);
  await operator.click('#draw-clear');
  await operator.wait(`!document.querySelector('#draw-start').disabled`);
  const current = await api('draws');
  const parallel = await Promise.all([1, 2].map(() => fetch(`${origin}/api/draws`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'start', version: current.version, winner_count: 1, prize_mode: 'none', allocation: [], request_id: crypto.randomUUID() }) })));
  assert.deepEqual(parallel.map(response => response.status).sort(), [200, 409]);
  const active = await api('draws'); await api('draws', { action: 'clear', draw_id: active.draw.id });
  await operator.click('#draw-reload');
  await operator.wait(`!document.querySelector('#draw-start').disabled`);

  // Respons hilang sesudah commit: pulihkan status, tanpa putaran/pengesahan ganda.
  await operator.click('[data-tab="participants"]');
  await operator.wait(`document.querySelectorAll('#participant-list tbody tr').length === 40`);
  await operator.click('[data-tab="draw"]');
  const faults = new Set(['start', 'confirm']);
  const injected = [];
  browser.onEvent(event => {
    if (event.method !== 'Fetch.requestPaused' || event.sessionId !== operator.sessionId) return;
    const { requestId, request } = event.params;
    let action;
    try { action = JSON.parse(request.postData || '{}').action; } catch {}
    const fail = faults.delete(action);
    if (fail) injected.push(action);
    browser.call(fail ? 'Fetch.failRequest' : 'Fetch.continueRequest', fail ? { requestId, errorReason: 'ConnectionReset' } : { requestId }, operator.sessionId).catch(error => errors.push(String(error)));
  });
  await browser.call('Fetch.enable', { patterns: [{ urlPattern: '*/api/draws', requestStage: 'Response' }] }, operator.sessionId);
  await setInput(operator, '#winner-count', 1);
  const sequenceBefore = (await api('history')).items.filter(item => item.entity_type === 'draw').reduce((max, item) => Math.max(max, item.sequence_number), 0);
  await operator.click('#draw-start');
  await operator.wait(`document.querySelector('#draw-start span').textContent === 'Stop undian' && !document.querySelector('#draw-start').disabled`);
  assert.equal((await api('draws')).draw.sequence_number, sequenceBefore + 1);
  await operator.click('#draw-start');
  await operator.wait(`!document.querySelector('#draw-confirm').disabled`);
  await operator.click('#draw-confirm');
  await operator.wait(`document.querySelector('#visual-status').textContent === 'Disahkan' && !document.querySelector('#draw-start').disabled`);
  assert.deepEqual(injected, ['start', 'confirm']);
  assert.equal((await api('draws')).available_count, 30);
  await browser.call('Fetch.disable', {}, operator.sessionId);
  await operator.click('[data-tab="participants"]');
  await operator.wait(`document.querySelector('#participant-summary').textContent.includes('Pemenang · 7')`);
  await operator.click('[data-tab="history"]');
  await operator.click('#history-show-activity');
  await operator.wait(`document.querySelector('#history-list').textContent.includes('Mengesahkan pemenang') && !document.querySelector('#history-next').disabled`);
  await operator.click('#history-next');
  await operator.wait(`document.querySelector('#history-page').textContent === 'Halaman 2'`);
  await operator.click('#history-previous');
  await operator.wait(`document.querySelector('#history-page').textContent === 'Halaman 1'`);
  await operator.click('[data-tab="draw"]');
  await operator.click('#draw-clear');
  await operator.wait(`!document.querySelector('#draw-start').disabled`);
  await browser.call('Page.bringToFront', {}, operator.sessionId);
  for(const width of [320,390,768,1024,1920]) {
    await browser.call('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:false},operator.sessionId);
    assert.equal(await operator.evaluate(controlsAligned),true,`Kontrol rapi pada ${width}px`);
  }
  await browser.call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false }, operator.sessionId);
  const mobile = await browser.call('Page.captureScreenshot', { format: 'png' }, operator.sessionId);
  await writeFile(resolve(browser.cache, 'mobile.png'), Buffer.from(mobile.data, 'base64'));
  assert.equal(errors.length, 0, JSON.stringify(errors));
  console.log('Browser undian: Mulai/Stop, hasil/isian, status/stok, hadiah/background, refresh, respons hilang, request paralel, riwayat/paginasi, cache tanpa polling, layout 20 nama dan mobile: OK.');
} finally {
  await browser.close();
  for (const path of uploads) await unlink(resolve(projectRoot, 'public', path.slice(1))).catch(() => {});
}
