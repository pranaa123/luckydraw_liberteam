import { qaSession } from './browser-auth.mjs';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { projectRoot } from './php-runtime.mjs';

// Run against the isolated QA server, never against the everyday development database.
const origin = `http://127.0.0.1:${process.env.PORT || 8092}`;
const auth = await qaSession(origin);
const fetch = auth.fetch;
const cache = resolve(projectRoot, '.cache/management-qa');
await mkdir(cache, { recursive: true });
const profile = await mkdtemp(resolve(cache, 'profile-'));
const browser = spawn(process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
  '--disable-extensions', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
], { stdio: ['ignore', 'ignore', 'pipe'] });
let socket;
const pending = new Map();
let sequence = 0;
const timeout = setTimeout(() => { browser.kill(); socket?.close(); process.exitCode = 1; }, 45000);
try {
  const endpoint = await new Promise((resolve, reject) => {
    let log = '';
    browser.stderr.on('data', bytes => { log += bytes; const match = log.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) resolve(match[1]); });
    browser.on('error', reject); browser.on('exit', code => reject(new Error(`Chrome keluar: ${code}`)));
  });
  socket = new WebSocket(endpoint);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  socket.addEventListener('message', ({ data }) => {
    const result = JSON.parse(data); if (!result.id) return;
    const job = pending.get(result.id); pending.delete(result.id);
    result.error ? job.reject(new Error(JSON.stringify(result.error))) : job.resolve(result.result);
  });
  const call = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
  await auth.browser({call});
  const { targetId } = await call('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
  await call('Page.enable', {}, sessionId);
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const wait = async expression => {
    const start = Date.now();
    while (!await evaluate(expression)) {
      if (Date.now() - start > 8000) throw new Error(`Kondisi belum tercapai: ${expression}`);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  };
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const fill = values => evaluate(`(() => {for (const [name, value] of Object.entries(${JSON.stringify(values)})) document.querySelector('#record-form [name="' + name + '"]').value = value; document.querySelector('#record-form').requestSubmit();})()`);
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await call('Page.navigate', { url: `${origin}/#settings` }, sessionId);
  await wait('document.querySelector("#panel-settings").hidden === false');
  await click('[data-open-editor="field"]'); await wait('document.querySelector("#record-editor").open');
  await fill({ label: 'Instansi' }); await wait('!document.querySelector("#record-editor").open && document.querySelector("#field-list").textContent.includes("Instansi")');
  await click('[data-open-editor="field"]'); await wait('document.querySelector("#record-editor").open');
  await fill({ label: 'instansi' }); await wait('!document.querySelector("#editor-error").hidden');
  assert.match(await evaluate('document.querySelector("#editor-error").textContent'), /sudah digunakan/);
  await click('#record-editor [data-close-dialog]');
  await click('[data-tab="participants"]');
  await click('[data-open-editor="participant"]'); await wait('document.querySelector("#record-editor").open');
  await fill({ name: 'Alam QA', field_1: 'Panitia' }); await wait('!document.querySelector("#record-editor").open && document.querySelector("#participant-list").textContent.includes("Alam QA")');
  const toolbar = await evaluate('(() => {const a=document.querySelector("[data-open-editor=participant]").getBoundingClientRect(), b=document.querySelector(".import-actions").getBoundingClientRect();return {sameRow:Math.abs(a.y-b.y)<2,gap:b.x-a.right};})()');
  assert.equal(toolbar.sameRow, true); assert.ok(toolbar.gap >= 20);
  await call('Page.reload', {}, sessionId);
  await wait('document.querySelector("#participant-list")?.textContent.includes("Alam QA")');
  assert.match(await evaluate('document.querySelector("#participant-list").textContent'), /Panitia/);
  await click('#participant-list [data-record-action="edit"]'); await wait('document.querySelector("#record-editor").open');
  await fill({ name: 'Alam diedit' }); await wait('!document.querySelector("#record-editor").open && document.querySelector("#participant-list").textContent.includes("Alam diedit")');
  await click('[data-tab="draw"]');
  const controls = await evaluate('[...document.querySelectorAll(".start-button, .action-row .button")].map(node=>({width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height,text:node.textContent.trim()}))');
  assert.ok(Math.max(...controls.slice(1).map(item=>item.width))-Math.min(...controls.slice(1).map(item=>item.width))<1);
  assert.ok(Math.abs(controls[0].width-controls.slice(1).reduce((sum,item)=>sum+item.width,0)-16)<1);
  assert.equal(new Set(controls.map(item => item.height)).size, 1);
  assert.equal(controls[3].text, 'Kosongkan'); assert.ok(controls[0].width <= 412);
  assert.ok(await evaluate('document.querySelector(".quantity-card").getBoundingClientRect().height < 80'));
  await writeFile(resolve(cache, 'desktop.png'), Buffer.from((await call('Page.captureScreenshot', { format: 'png' }, sessionId)).data, 'base64'));
  for (const width of [390, 768, 1024, 1920]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `Tidak meluap pada ${width}px`);
    assert.equal(await evaluate('Math.abs(document.querySelector(".start-button").getBoundingClientRect().width-document.querySelector(".action-row").getBoundingClientRect().width)<1'), true);
  }
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await click('[data-tab="prizes"]'); await click('[data-open-editor="prize"]'); await wait('document.querySelector("#record-editor").open');
  await fill({ name: 'Tas QA', quantity: '4' }); await wait('!document.querySelector("#record-editor").open && document.querySelector("#prize-list").textContent.includes("Tas QA")');
  await click('#prize-list [data-record-action="edit"]'); await wait('document.querySelector("#record-editor").open');
  await fill({ name: 'Tas diedit', quantity: '2' }); await wait('!document.querySelector("#record-editor").open && document.querySelector("#prize-list").textContent.includes("Tas diedit")');
  assert.match(await evaluate('document.querySelector("#prize-summary").textContent'), /2 hadiah tersedia/);
  await click('#prize-list [data-record-action="delete"]'); await wait('document.querySelector("#record-delete").open');
  await evaluate('document.querySelector("#delete-form").requestSubmit()'); await wait('!document.querySelector("#record-delete").open && !document.querySelector("#prize-list [data-record-action]")');
  await click('[data-tab="participants"]'); await click('#participant-list [data-record-action="delete"]'); await wait('document.querySelector("#record-delete").open');
  await evaluate('document.querySelector("#delete-form").requestSubmit()'); await wait('!document.querySelector("#record-delete").open && !document.querySelector("#participant-list [data-record-action]")');
  await click('[data-tab="settings"]'); await click('#field-list [data-record-action="edit"]'); await wait('document.querySelector("#record-editor").open');
  await fill({ label: 'Organisasi' }); await wait('!document.querySelector("#record-editor").open && document.querySelector("#field-list").textContent.includes("Organisasi")');
  await click('#field-list [data-record-action="delete"]'); await wait('document.querySelector("#record-delete").open');
  await evaluate('document.querySelector("#delete-form").requestSubmit()'); await wait('!document.querySelector("#record-delete").open && !document.querySelector("#field-list [data-record-action]")');
  console.log('Browser: tambah/edit/hapus semua jenis, validasi formulir, refresh, toolbar kanan, tombol seragam, dan layout 390–1920px lulus.');
} finally {
  clearTimeout(timeout); socket?.close(); browser.kill();
  await new Promise(resolve => browser.once('exit', resolve));
  await rm(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
}
