import { qaSession } from './browser-auth.mjs';
// QA dengan layar virtual Chrome headless. Tidak menggantikan pengujian monitor fisik.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { projectRoot } from './php-runtime.mjs';

const origin = `http://127.0.0.1:${process.env.PORT || 8091}`;
const auth = await qaSession(origin);
const fetch = auth.fetch;
const chrome = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const cache = resolve(projectRoot, '.cache/output-qa');
await mkdir(cache, { recursive: true });
const profile = await mkdtemp(resolve(cache, 'profile-'));
const browser = spawn(chrome, ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-extensions', '--remote-debugging-port=0', `--user-data-dir=${profile}`], { stdio: ['ignore', 'ignore', 'pipe'] });
let socket;
let sequence = 0;
const pending = new Map();
const timeout = setTimeout(() => { console.error('QA browser melebihi 45 detik.'); browser.kill('SIGTERM'); process.exitCode = 1; socket?.close(); }, 45_000);

try {
  const endpoint = await new Promise((resolve, reject) => {
    let log = '';
    browser.stderr.on('data', (bytes) => { log += bytes; const match = log.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) resolve(match[1]); });
    browser.on('error', reject);
    browser.on('exit', (code) => reject(new Error(`Chrome keluar: ${code}`)));
  });
  socket = new WebSocket(endpoint);
  await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));
  socket.addEventListener('message', ({ data }) => {
    const result = JSON.parse(data);
    if (!result.id) return;
    const job = pending.get(result.id);
    pending.delete(result.id);
    result.error ? job.reject(new Error(JSON.stringify(result.error))) : job.resolve(result.result);
  });
  const call = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
  await auth.browser({call});
  const { targetId } = await call('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
  await call('Page.enable', {}, sessionId);
  const evaluate = async (expression, userGesture = false) => {
    const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture }, sessionId);
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const waitFor = async (expression) => {
    const start = Date.now();
    while (!(await evaluate(expression))) {
      if (Date.now() - start > 8000) throw new Error(`Kondisi belum tercapai: ${expression}`);
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
  };
  // Ubah izin layar saja; grantPermissions menolak semua izin lain yang tidak didaftarkan.
  await call('Browser.setPermission', { permission: { name: 'window-management' }, setting: 'granted', origin });
  const { screenInfo } = await call('Emulation.addScreen', { left: -1600, top: 0, width: 1600, height: 900, label: 'Proyektor Uji', isInternal: false }, sessionId);
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 800, deviceScaleFactor: 1, mobile: false }, sessionId);
  await call('Page.navigate', { url: origin }, sessionId);
  await waitFor('document.querySelector("#output-screen")?.options.length >= 2');
  assert.match(await evaluate('document.querySelector("#output-screen").selectedOptions[0].textContent'), /Proyektor Uji/);
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);

  const evaluateIn = async (session, expression, userGesture = false) => {
    const result = await call('Runtime.evaluate', {expression, awaitPromise:true, returnByValue:true, userGesture}, session);
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const waitIn = async (session, expression) => {
    const started = Date.now();
    while (!(await evaluateIn(session, expression))) {
      if (Date.now() - started > 8000) {
        console.log('Kondisi jendela:', await evaluateIn(session, 'JSON.stringify({host:document.body.classList.contains("is-output-host"),focus:document.hasFocus(),message:document.querySelector("#output-message")?.textContent,selected:document.querySelector("#output-screen")?.selectedOptions[0]?.textContent})'));
        throw new Error(`Kondisi belum tercapai: ${expression}`);
      }
      await new Promise(resolve => setTimeout(resolve, 80));
    }
  };

  await evaluate('document.querySelector("#open-output").click()', true);
  await waitFor('Boolean(document.fullscreenElement)');
  assert.equal(await evaluate('document.fullscreenElement === document.querySelector(".preview-frame")'), true);
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".app-header")).display'), 'none');
  console.log('Fullscreen langsung dari operator: aktif, tanpa izin fullscreen otomatis khusus.');

  let operator;
  for (let attempt = 0; attempt < 80 && !operator; attempt++) {
    operator = (await call('Target.getTargets')).targetInfos.find(target => target.openerId === targetId && target.url.includes('operator=1'));
    if (!operator) await new Promise(resolve => setTimeout(resolve, 80));
  }
  assert.ok(operator, 'Operator harus tersedia pada jendela terpisah.');
  const { sessionId: operatorSession } = await call('Target.attachToTarget', {targetId:operator.targetId, flatten:true});
  await call('Page.enable', {}, operatorSession);
  await call('Emulation.setDeviceMetricsOverride', {width:1440,height:800,deviceScaleFactor:1,mobile:false}, operatorSession);
  await waitIn(operatorSession, 'document.querySelector("#output-screen")?.options.length >= 2');
  await waitIn(operatorSession, 'document.querySelector("#output-message").textContent.includes("fullscreen aktif")');
  assert.equal(await evaluateIn(operatorSession, 'document.body.classList.contains("is-output-host")'), false);
  assert.equal(await evaluateIn(operatorSession, 'document.documentElement.scrollWidth <= innerWidth'), true);
  await evaluate('document.querySelector(".preview-frame").contentWindow.__qaPreserved = true');

  // Tampilkan berulang tidak mengulang output atau menambah jendela operator.
  await evaluateIn(operatorSession, 'document.querySelector("#open-output").click()', true);
  assert.equal(await evaluate('document.querySelector(".preview-frame").contentWindow.__qaPreserved'), true);
  assert.equal((await call('Target.getTargets')).targetInfos.filter(target => target.openerId === targetId && target.url.includes('operator=1')).length, 1);

  // Pergantian target tidak boleh mereset visual atau mengganti jendela operator.
  const { screenInfo: rightScreen } = await call('Emulation.addScreen', {left:1600,top:0,width:1920,height:1080,label:'Proyektor Kanan',isInternal:false}, sessionId);
  await waitIn(operatorSession, 'document.querySelector("#output-screen").options.length >= 3');
  await evaluateIn(operatorSession, '(() => {const select=document.querySelector("#output-screen");select.value=[...select.options].find(option=>option.textContent.includes("Proyektor Kanan")).value;select.dispatchEvent(new Event("change"));document.querySelector("#open-output").click();})()', true);
  await waitFor('document.body.dataset.outputScreen.includes("Proyektor Kanan")');
  assert.equal(await evaluate('document.querySelector(".preview-frame").contentWindow.__qaPreserved'), true);
  await evaluateIn(operatorSession, '(() => {const select=document.querySelector("#output-screen");select.value=[...select.options].find(option=>option.textContent.includes("Proyektor Uji")).value;select.dispatchEvent(new Event("change"));document.querySelector("#open-output").click();})()', true);
  await waitFor('document.body.dataset.outputScreen.includes("Proyektor Uji")');
  await call('Emulation.removeScreen', {screenId:rightScreen.id}, sessionId);

  // Operator boleh berpindah menu dan di-refresh tanpa mengganggu fullscreen.
  await evaluateIn(operatorSession, 'document.querySelector("#tab-settings").click(); window.__qaBeforeReload=true');
  await call('Page.reload', {}, operatorSession);
  await waitIn(operatorSession, '!window.__qaBeforeReload && document.querySelector("#output-message")?.textContent.includes("fullscreen aktif")');
  assert.equal(await evaluate('Boolean(document.fullscreenElement)'), true);
  assert.equal(await evaluate('document.querySelector(".preview-frame").contentWindow.__qaPreserved'), true);
  assert.equal(await evaluateIn(operatorSession, 'location.hash'), '#settings');

  const desktopShot = await call('Page.captureScreenshot', {format:'png'}, operatorSession);
  await writeFile(resolve(cache,'desktop.png'), Buffer.from(desktopShot.data,'base64'));
  await call('Emulation.setDeviceMetricsOverride', {width:390,height:844,deviceScaleFactor:1,mobile:true}, operatorSession);
  assert.equal(await evaluateIn(operatorSession, 'document.documentElement.scrollWidth <= innerWidth'), true);
  const mobileShot = await call('Page.captureScreenshot', {format:'png'}, operatorSession);
  await writeFile(resolve(cache,'mobile-selected.png'), Buffer.from(mobileShot.data,'base64'));
  await call('Emulation.setDeviceMetricsOverride', {width:1440,height:800,deviceScaleFactor:1,mobile:false}, operatorSession);

  // Esc menghentikan fullscreen, tetapi tidak menampilkan kontrol operator pada panggung.
  await evaluate('document.exitFullscreen()');
  assert.equal(await evaluate('document.body.classList.contains("is-output-host")'), true);
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".app-header")).display'), 'none');
  await waitIn(operatorSession, 'document.querySelector("#output-message").textContent.includes("berakhir")');

  // Aktifkan kembali dari operator melalui delegasi klik, tanpa mengganti panggung.
  await call('Target.activateTarget', { targetId: operator.targetId });
  await call('Page.bringToFront', {}, operatorSession);
  await new Promise(resolve => setTimeout(resolve, 1100));
  await evaluateIn(operatorSession, 'document.querySelector("#open-output").click()', true);
  await waitFor('Boolean(document.fullscreenElement)');
  await waitIn(operatorSession, 'document.querySelector("#output-message").textContent.includes("fullscreen aktif")');
  assert.equal(await evaluate('document.querySelector(".preview-frame").contentWindow.__qaPreserved'), true);
  assert.equal((await call('Target.getTargets')).targetInfos.filter(target => target.openerId === targetId && target.url.includes('operator=1')).length, 1);

  const activeOperator = operatorSession;

  await call('Emulation.removeScreen', {screenId:screenInfo.id}, sessionId);
  await waitIn(activeOperator, 'document.querySelector("#open-output").disabled');
  assert.match(await evaluateIn(activeOperator, 'document.querySelector("#output-message").textContent'), /terputus/);
  await call('Browser.setPermission', {permission:{name:'window-management'}, setting:'denied', origin});
  await waitIn(activeOperator, 'document.querySelector("#output-screen").hidden');
  assert.equal(await evaluateIn(activeOperator, 'document.querySelector("#open-output").disabled'), false);

  await call('Page.addScriptToEvaluateOnNewDocument', {source:'Object.defineProperty(window,"getScreenDetails",{value:undefined,configurable:true}); window.open=()=>null; window.__qaUnsupported=true;'}, activeOperator);
  await call('Page.reload', {}, activeOperator);
  await waitIn(activeOperator, 'window.__qaUnsupported===true && document.readyState === "complete"');
  assert.equal(await evaluateIn(activeOperator, 'document.querySelector("#choose-output-screen").hidden'), true);
  await evaluateIn(activeOperator, 'document.querySelector("#open-output").click()', true);
  assert.match(await evaluateIn(activeOperator, 'document.querySelector("#output-message").textContent'), /Izinkan popup/);
  console.log('Lulus: fullscreen satu klik, operator terpisah, pergantian target, penggunaan ulang, refresh, Esc dan aktif kembali, layar terputus, izin, fallback, serta layout ponsel.');
  await call('Browser.close');
} finally {
  clearTimeout(timeout);
  socket?.close();
  browser.kill('SIGTERM');
  if (browser.pid && browser.exitCode === null && browser.signalCode === null) await new Promise((resolve) => browser.once('exit', resolve));
  await rm(profile, { recursive: true, force: true });
}
