import assert from 'node:assert/strict';
import { openBrowser } from './browser-session.mjs';
import { fixtureCredentials } from './auth-fixture.mjs';
import { unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { projectRoot } from './php-runtime.mjs';

const origin=process.env.DOORPRIZE_TEST_ORIGIN || 'http://127.0.0.1:8098';
if (new URL(origin).port==='8091') throw Error('Gunakan database QA terpisah.');
const browser=await openBrowser('auth-browser'),errors=[],requests=[];
const uploads=[];
browser.onEvent(event=>{
  if(event.method==='Runtime.exceptionThrown') errors.push(event.params.exceptionDetails);
  if(event.method==='Network.requestWillBeSent' && event.params.request.url.includes('/api/')) requests.push(event.params.request.url);
});
async function signIn(page) {
  await page.wait(`document.querySelector('#login-form')`);
  await page.evaluate(`document.querySelector('#login-email').value=${JSON.stringify(fixtureCredentials.email)};document.querySelector('#login-password').value=${JSON.stringify(fixtureCredentials.password)};document.querySelector('#login-form').requestSubmit();`);
  await page.wait(`location.pathname==='/' && document.querySelector('#draw-capacity')?.textContent.includes('tersedia')`);
}
try {
  const anonymous=await fetch(origin+'/output',{redirect:'manual'});assert.equal(anonymous.status,303);
  const page=await browser.page(origin,1440,1000);await browser.call('Network.enable',{},page.sessionId);
  await page.wait(`document.querySelector('#login-form')`);
  assert.equal(await page.evaluate(`document.querySelector('#login-email').autocomplete`),'username');
  await page.evaluate(`document.querySelector('#login-email').value='owner@example.test';document.querySelector('#login-password').value='salah';document.querySelector('#login-form').requestSubmit();`);
  await page.wait(`!document.querySelector('#login-feedback').hidden && !document.querySelector('#login-submit').disabled`);
  assert.match(await page.evaluate(`document.querySelector('#login-feedback').textContent`),/tidak sesuai/);
  await signIn(page);
  assert.equal(await page.evaluate(`document.cookie.includes('doorprize_baru_session')`),false,'Cookie login HttpOnly');
  await page.wait(`document.querySelector('iframe').contentDocument.querySelector('#visual-stage')?.dataset.settingsVersion`);
  const output=await browser.page(origin+'/output',1280,720);await browser.call('Network.enable',{},output.sessionId);
  await output.wait(`document.querySelector('#visual-stage')?.dataset.settingsVersion`);
  assert.equal(await page.evaluate(`document.querySelector('#try-animation')`),null);
  const before=await page.evaluate(`(async()=>{const {apiRequest}=await import('/assets/modules/api-client.js');const {drawState}=await import('/assets/modules/draw-state.js');const meta=await apiRequest('/api/imports');await apiRequest('/api/participants',{action:'create',name:'Peserta QA auth',field_schema:meta.field_schema});const state=await drawState.refresh();return drawState.command({action:'start',version:state.version,request_id:crypto.randomUUID(),winner_count:1,prize_mode:'none',filters:{}});})()`);
  await output.wait(`document.querySelector('#visual-stage').dataset.animation==='running'`);
  const count=requests.length;
  await output.evaluate(`new Promise(resolve=>setTimeout(resolve,650))`);
  assert.equal(requests.length,count,'Animasi tidak memanggil API sesi/peserta');
  await page.click('#draw-start');
  await page.wait(`document.querySelector('#draw-session-status').dataset.state==='pending'`);
  await browser.call('Page.reload',{},page.sessionId);
  await page.wait(`location.pathname==='/' && document.querySelector('#draw-capacity')?.textContent.includes('tersedia')`);
  // Upload dan pembacaan file harus melalui pemilik yang sedang login.
  const image=await page.evaluate(`(async()=>{const {apiRequest}=await import('/assets/modules/api-client.js');const form=new FormData();form.set('background',new Blob([Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII='),c=>c.charCodeAt(0))],{type:'image/png'}),'qa.png');return apiRequest('/api/backgrounds',form);})()`);
  uploads.push(image.path);
  assert.equal((await fetch(origin+image.path)).status,401,'File background tidak boleh diakses tanpa cookie');
  const imageStatus=await page.evaluate(`fetch(${JSON.stringify(image.path)}).then(r=>r.status)`);assert.equal(imageStatus,200);
  await page.click('#auth-logout');
  await page.wait(`location.pathname==='/login' && document.querySelector('#login-form')`);
  await output.wait(`location.pathname==='/login' && document.querySelector('#login-form')`);
  await signIn(page);
  const resumed=await page.evaluate(`import('/assets/modules/api-client.js').then(m=>m.apiRequest('/api/draws'))`);
  assert.equal(resumed.draw.id,before.draw.id,'Logout mempertahankan putaran pending');
  await page.evaluate(`import('/assets/modules/api-client.js').then(async m=>{const s=await m.apiRequest('/api/draws');await m.apiRequest('/api/draws',{action:'clear',draw_id:s.draw.id});})`);
  // Simulasikan sesi server kedaluwarsa ketika halaman kembali terlihat.
  await page.evaluate(`(async()=>{const headers={'X-Doorprize-Session':document.querySelector('meta[name="auth-scope"]').content,'X-CSRF-Token':document.querySelector('meta[name="csrf-token"]').content};await fetch('/api/logout',{method:'POST',headers});window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));})()`);
  await page.wait(`location.pathname==='/login' && document.querySelector('#login-form')`);
  await browser.call('Emulation.setDeviceMetricsOverride',{width:360,height:780,deviceScaleFactor:1,mobile:false},page.sessionId);
  assert.equal(await page.evaluate(`document.documentElement.scrollWidth<=innerWidth`),true);
  assert.deepEqual(errors,[]);
  console.log('Browser Auth: login/gagal/ingat setelah refresh, preview/output, animasi tanpa request, background privat, logout lintas jendela, pemulihan pending, BFCache dan login 360 px lulus.');
} finally { await browser.close(); for(const path of uploads) await unlink(resolve(projectRoot,'public','.'+path)).catch(()=>{}); }
