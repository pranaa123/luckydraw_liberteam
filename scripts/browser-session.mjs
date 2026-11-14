import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { projectRoot } from './php-runtime.mjs';

export async function openBrowser(directory) {
  const cache = resolve(projectRoot, '.cache', directory);
  await mkdir(cache, { recursive: true });
  const profile = await mkdtemp(resolve(cache, 'profile-'));
  const browserProcess = spawn(process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-extensions', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  const endpoint = await new Promise((resolve, reject) => {
    let logs = '';
    browserProcess.stderr.on('data', bytes => { logs += bytes; const match = logs.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) resolve(match[1]); });
    browserProcess.on('error', reject);
    browserProcess.on('exit', code => reject(new Error(`Chrome keluar: ${code}`)));
  });
  const socket = new WebSocket(endpoint);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  const pending = new Map();
  const listeners = new Set();
  let sequence = 0;
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (!message.id) { for (const listener of listeners) listener(message); return; }
    const job = pending.get(message.id);
    if (!job) return;
    pending.delete(message.id); clearTimeout(job.timer);
    message.error ? job.reject(new Error(JSON.stringify(message.error))) : job.resolve(message.result);
  });
  const call = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 12000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
  async function page(url, width = 1440, height = 1000) {
    const { targetId } = await call('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
    await call('Page.enable', {}, sessionId);
    await call('Runtime.enable', {}, sessionId);
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
    const evaluate = async (expression, userGesture = false) => {
      const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture }, sessionId);
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    const wait = async expression => {
      const start = Date.now();
      while (!await evaluate(expression)) {
        if (Date.now() - start > 10000) throw new Error(`Kondisi belum tercapai: ${expression}`);
        await new Promise(resolve => setTimeout(resolve, 60));
      }
    };
    await call('Page.navigate', { url }, sessionId);
    return { targetId, sessionId, evaluate, wait, click: selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`, true) };
  }
  return {
    call, page, cache, onEvent: listener => listeners.add(listener),
    async close() {
      try { await call('Browser.close'); } catch { /* Browser mungkin sudah ditutup. */ }
      socket.close(); browserProcess.kill('SIGTERM');
      if (browserProcess.exitCode === null && browserProcess.signalCode === null) await new Promise(resolve => browserProcess.once('exit', resolve));
      for (const job of pending.values()) clearTimeout(job.timer);
      await rm(profile, { recursive: true, force: true });
    },
  };
}
