import { qaSession } from './browser-auth.mjs';
import assert from 'node:assert/strict';
import { writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openBrowser } from './browser-session.mjs';
import { projectRoot } from './php-runtime.mjs';

const port = process.env.PORT || '8093';
if (port === '8091') throw new Error('Gunakan server QA dan database terpisah.');
const origin = `http://127.0.0.1:${port}`;
const auth = await qaSession(origin);
const fetch = auth.fetch;
const browser = await openBrowser('settings-qa');
const uploads = [];
const errors = [];
browser.onEvent(message => { if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text + ': ' + message.params.exceptionDetails.exception?.description); });
try {
  await auth.browser(browser);
  const page = await browser.page(`${origin}/#settings`);
  const requests = [];
  await browser.call('Network.enable', {}, page.sessionId);
  browser.onEvent(message => {
    if (message.method === 'Network.requestWillBeSent' && message.params.request.url.startsWith(`${origin}/api/`)) requests.push(message.params.request.url);
  });
  await page.wait('document.querySelector("#settings-controls")?.disabled === false');
  await page.wait('document.querySelector(".preview-frame").contentDocument.querySelector("#visual-stage")?.dataset.settingsVersion');
  const beforeRequests = requests.length;
  const fill = async values => page.evaluate(`(() => {const form=document.querySelector('#settings-form');for(const [name,value] of Object.entries(${JSON.stringify(values)})){const input=form.elements[name];if(input.type==='checkbox')input.checked=value;else input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}})()`);
  await fill({ client_name: 'Client QA', event_name: 'Acara QA', event_at: '2026-11-14T19:30', show_event_info: true, font_color: '#123456', font_style: 'serif', text_case: 'uppercase', canvas_width: 2400, canvas_height: 1350 });
  await page.wait('document.querySelector(".preview-frame").contentDocument.querySelector("#stage-event-name").textContent === "ACARA QA"');
  assert.equal(await page.evaluate('document.querySelector(".preview-frame").contentDocument.querySelector("#visual-stage").getAttribute("viewBox")'), '0 0 2400 1350');
  assert.equal(await page.evaluate('document.querySelector(".preview-frame").contentDocument.querySelector("#standby-text").getAttribute("fill")'), '#123456');
  assert.equal(requests.length, beforeRequests, 'Perubahan visual tidak boleh memicu request data.');
  await page.click('#settings-save');
  await page.wait('document.querySelector("#settings-state").textContent === "Tersimpan"');
  await browser.call('Page.reload', {}, page.sessionId);
  await page.wait('document.querySelector("#settings-controls")?.disabled === false');
  assert.equal(await page.evaluate('document.querySelector("#settings-form").elements.event_name.value'), 'Acara QA');
  assert.equal(await page.evaluate('document.querySelector("#settings-form").elements.event_at.value'), '2026-11-14T19:30');

  // Halaman output lain menerima draft, tanpa reload atau pembacaan daftar peserta.
  const output = await browser.page(`${origin}/output`);
  await output.wait('document.querySelector("#stage-event-name").textContent === "ACARA QA"');
  await fill({ event_name: 'Berubah langsung' });
  await output.wait('document.querySelector("#stage-event-name").textContent === "BERUBAH LANGSUNG"');
  await page.click('#settings-reload');
  await page.wait('document.querySelector("#settings-form").elements.event_name.value === "Acara QA"');
  await output.wait('document.querySelector("#stage-event-name").textContent === "ACARA QA"');

  await page.click('[data-tab="prizes"]');
  const createPrize = async (name, quantity) => {
    await page.click('[data-open-editor="prize"]');
    await page.wait('document.querySelector("#record-editor").open');
    await page.evaluate(`(() => {const form=document.querySelector('#record-form');form.elements.name.value=${JSON.stringify(name)};form.elements.quantity.value=${quantity};form.requestSubmit();})()`);
    await page.wait(`!document.querySelector('#record-editor').open && document.querySelector('#prize-list').textContent.includes(${JSON.stringify(name)})`);
  };
  await createPrize('Tas QA Visual', 4);
  await createPrize('Payung QA Visual', 2);
  await page.click('#prize-list .record-row:nth-child(2) [data-prize-order="up"]');
  await page.wait('document.querySelector("#prize-list .record-row .record-name").textContent.includes("Payung QA Visual")');
  await page.click('[data-tab="settings"]');
  await fill({ background_type: 'image' });
  const fixture = resolve(browser.cache, 'background.png');
  const png = await page.evaluate('(() => {const canvas=document.createElement("canvas");canvas.width=960;canvas.height=540;const context=canvas.getContext("2d");context.fillStyle="#cfe0ff";context.fillRect(0,0,960,540);return canvas.toDataURL("image/png").split(",")[1];})()');
  await writeFile(fixture, Buffer.from(png, 'base64'));
  const setFile = async selector => {
    const { root } = await browser.call('DOM.getDocument', {}, page.sessionId);
    const { nodeId } = await browser.call('DOM.querySelector', { nodeId: root.nodeId, selector }, page.sessionId);
    await browser.call('DOM.setFileInputFiles', { files: [fixture], nodeId }, page.sessionId);
  };
  await setFile('#main-background-file');
  await page.wait('!document.querySelector("#main-background-preview").hidden');
  const mainPath = await page.evaluate('new URL(document.querySelector("#main-background-image").src).pathname'); uploads.push(mainPath);
  await page.wait('!document.querySelector("#settings-save").disabled');
  await setFile('#prize-background-file');
  await page.wait('document.querySelectorAll("#prize-background-list .background-row").length === 1');
  const prizePath = await page.evaluate('new URL(document.querySelector("#prize-background-list img").src).pathname'); uploads.push(prizePath);
  await page.wait('!document.querySelector("#settings-save").disabled');
  await page.click('#settings-save');
  await page.wait('document.querySelector("#settings-state").textContent === "Tersimpan"');
  await output.wait(`document.querySelector('#stage-image').getAttribute('href') === ${JSON.stringify(mainPath)}`);
  await page.evaluate('document.querySelector(".preview-frame").contentWindow.postMessage({type:"doorprize:prize-context",ids:[document.querySelector("#background-prize").value]},location.origin)');
  await page.wait(`document.querySelector('.preview-frame').contentDocument.querySelector('#stage-image').getAttribute('href') === ${JSON.stringify(prizePath)}`);
  await page.evaluate('document.querySelector(".preview-frame").contentWindow.postMessage({type:"doorprize:prize-context",ids:[...document.querySelector("#background-prize").options].map(option=>option.value)},location.origin)');
  await page.wait(`document.querySelector('.preview-frame').contentDocument.querySelector('#stage-image').getAttribute('href') === ${JSON.stringify(mainPath)}`);
  await browser.call('Page.reload', {}, page.sessionId);
  await page.wait('document.querySelector("#settings-controls")?.disabled === false');
  assert.equal(await page.evaluate('document.querySelector("#prize-background-list").children.length'), 1);
  assert.equal(await page.evaluate('new URL(document.querySelector("#main-background-image").src).pathname'), mainPath);
  await writeFile(resolve(browser.cache, 'desktop.png'), Buffer.from((await browser.call('Page.captureScreenshot', { format: 'png' }, page.sessionId)).data, 'base64'));
  for (const width of [390, 768, 1024]) {
    await browser.call('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false }, page.sessionId);
    assert.equal(await page.evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `Formulir tidak meluap pada ${width}px`);
  }
  await browser.call('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 1, mobile: true }, page.sessionId);
  await writeFile(resolve(browser.cache, 'mobile.png'), Buffer.from((await browser.call('Page.captureScreenshot', { format: 'png' }, page.sessionId)).data, 'base64'));
  assert.equal(errors.length, 0, errors.join('\n'));
  assert.equal(requests.some(url => url.includes('/api/participants')), false, 'Pengaturan visual tidak memuat daftar peserta.');
  console.log('Browser: edit/simpan/refresh, waktu lokal, preview dan output langsung, reorder hadiah, upload, background berdasarkan hadiah, serta layout responsif lulus.');
} finally {
  await browser.close();
  for (const path of uploads) await unlink(resolve(projectRoot, `public${path}`));
}
