import { qaSession } from './browser-auth.mjs';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openBrowser } from './browser-session.mjs';
import { glyphAt, shuffleAlphabet } from '../public/assets/modules/shuffle-model.js';

for (const seed of [0, 17, 4294967295]) {
  for (const start of [0, 900, 3000, 60000, 86400000]) {
    const words = Array.from({ length: 16 }, (_, sample) => Array.from({ length: 14 }, (_, index) => glyphAt(seed, index, start + sample * 80, shuffleAlphabet).text).join(''));
    assert(new Set(words).size >= 14, 'Acak harus terus berubah, termasuk setelah lama berjalan.');
    assert.equal(words[0], Array.from({ length: 14 }, (_, index) => glyphAt(seed, index, start, shuffleAlphabet).text).join(''), 'Waktu/seed yang sama harus sinkron.');
  }
  for (let time = 0; time < 4000; time += 17) {
    const glyph = glyphAt(seed, 3, time, shuffleAlphabet);
    assert(shuffleAlphabet.includes(glyph.text) && Math.abs(glyph.angle) <= 90);
  }
}
assert.equal(glyphAt(17, 3, 50, shuffleAlphabet, true).angle, 0);

const browser = await openBrowser('animation-qa');
const origin = `http://127.0.0.1:${process.env.PORT || 8095}`;
const auth = await qaSession(origin);
const fetch = auth.fetch;
if (new URL(origin).port === '8091') throw Error('Gunakan database QA terpisah.');
const initial = await (await fetch(origin + '/api/draws')).json();
if (initial.draw?.status === 'pending') throw Error('Gunakan database QA tanpa undian pending.');
if (!initial.available_count) {
  const meta = await (await fetch(origin + '/api/imports')).json();
  const result = await fetch(origin + '/api/participants',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({action:'create',name:'Peserta QA animasi',field_schema:meta.field_schema})});
  assert.ok(result.ok,await result.text());
}
const errors = [], requests = [];
browser.onEvent(event => {
  if (event.method === 'Runtime.exceptionThrown') errors.push(event.params.exceptionDetails);
  if (event.method === 'Network.requestWillBeSent' && event.params.request.url.startsWith(`${origin}/api/`)) requests.push(event.params.request.url);
});
try {
  await auth.browser(browser);
  const operator = await browser.page(origin, 1440, 1000);
  await browser.call('Network.enable', {}, operator.sessionId);
  await operator.wait(`!document.querySelector('#draw-start').disabled && document.querySelector('iframe')?.contentDocument?.querySelector('#visual-stage')?.dataset.settingsVersion`);
  await operator.click('#draw-start');
  await operator.wait(`document.querySelector('iframe').contentDocument.querySelector('#visual-stage').dataset.animation === 'running'`);
  assert.equal(await operator.evaluate(`document.querySelector('#draw-start').textContent.trim()`), 'Stop undian');
  // Jendela output yang baru dibuka mengambil status yang sedang berjalan.
  const output = await browser.page(`${origin}/output`, 1920, 1080);
  await browser.call('Network.enable', {}, output.sessionId);
  await output.wait(`document.querySelector('#visual-stage')?.dataset.animation === 'running' && document.querySelectorAll('.shuffle-glyph').length > 0`);
  const packet = `(async () => {const {draw}= (await import('/assets/modules/draw-state.js')).drawState.state; return JSON.stringify({id:draw.id,seed:draw.seed,startedAt:draw.started_at});})()`;
  assert.equal(await operator.evaluate(packet), await output.evaluate(packet));
  const variants = await output.evaluate(`(async () => {
    const samples = new Set();
    for (let count = 0; count < 5; count++) {
      samples.add(document.querySelector('#shuffle-line').textContent);
      await new Promise(resolve => setTimeout(resolve, 120));
    }
    return samples.size;
  })()`);
  assert(variants > 1, 'Huruf harus berubah selama animasi.');
  requests.length = 0;
  const geometry = await output.evaluate(`(async () => {
    const lengths = new Set();
    const end = Date.now() + 4200;
    let outside = 0, maxNodes = 0;
    let previous = '', lastChange = performance.now(), longestHold = 0;
    while (Date.now() < end) {
      const area = document.querySelector('#shuffle-area').getBoundingClientRect();
      const nodes = [...document.querySelectorAll('.shuffle-glyph')];
      const text = document.querySelector('#shuffle-line').textContent;
      if (text !== previous) { previous = text; lastChange = performance.now(); }
      longestHold = Math.max(longestHold, performance.now() - lastChange);
      maxNodes = Math.max(maxNodes, nodes.length);
      lengths.add(nodes.length);
      for (const node of nodes) {
        const box = node.getBoundingClientRect();
        if (box.x < area.x - 1 || box.right > area.right + 1 || box.y < area.y - 1 || box.bottom > area.bottom + 1) outside++;
      }
      await new Promise(resolve => setTimeout(resolve, 45));
    }
    return { outside, maxNodes, lengths: lengths.size, longestHold };
  })()`);
  assert.equal(geometry.outside, 0, JSON.stringify(geometry));
  assert(geometry.maxNodes >= 10 && geometry.maxNodes <= 20 && geometry.lengths === 1, JSON.stringify(geometry));
  assert(geometry.longestHold < 200, 'Tidak boleh ada fase baris diam/membentuk nama: ' + JSON.stringify(geometry));
  assert.deepEqual(requests, [], 'Animasi tidak boleh melakukan request API.');
  const screenshot = await browser.call('Page.captureScreenshot', { format: 'png' }, output.sessionId);
  await writeFile(resolve(browser.cache, 'output.png'), Buffer.from(screenshot.data, 'base64'));

  await browser.call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, output.sessionId);
  await output.wait(`document.querySelectorAll('.shuffle-glyph').length && [...document.querySelectorAll('.shuffle-glyph')].every(node => node.style.transform.endsWith('rotateX(0deg)'))`);
  await browser.call('Page.reload', {}, output.sessionId);
  await output.wait(`document.querySelector('#visual-stage')?.dataset.animation === 'running' && document.querySelectorAll('.shuffle-glyph').length > 0`);
  assert.equal(await operator.evaluate(packet), await output.evaluate(packet));
  await operator.click('#draw-start');
  await operator.wait(`!document.querySelector('#draw-confirm').disabled`);
  await operator.click('#draw-clear');
  await output.wait(`document.querySelector('#visual-stage').dataset.animation === 'standby' && document.querySelector('#shuffle-area').getAttribute('visibility') === 'hidden'`);
  assert.equal(await output.evaluate(`document.querySelector('#standby-text').getAttribute('visibility')`), 'visible');
  await browser.call('Page.bringToFront', {}, operator.sessionId);
  await browser.call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false }, operator.sessionId);
  assert(await operator.evaluate(`document.documentElement.scrollWidth <= innerWidth`), 'UI operator tidak boleh overflow.');
  await operator.click('#draw-start');
  await operator.wait(`document.querySelector('iframe').contentDocument.querySelector('#visual-stage').dataset.animation === 'running'`);
  await operator.click('#draw-start');
  await operator.wait(`!document.querySelector('#draw-confirm').disabled`);
  await operator.click('#draw-clear');
  const mobile = await browser.call('Page.captureScreenshot', { format: 'png' }, operator.sessionId);
  await writeFile(resolve(browser.cache, 'mobile.png'), Buffer.from(mobile.data, 'base64'));
  assert.equal(errors.length, 0, JSON.stringify(errors));
  console.log('Animasi: glyph terus acak tanpa fase membentuk nama, batas area, sinkronisasi/refresh, stop, reduced motion, UI mobile, tanpa request data: OK.');
} finally {
  await browser.close();
}
