import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {qaSession} from './browser-auth.mjs';
import {openBrowser} from './browser-session.mjs';

const origin=process.env.DOORPRIZE_TEST_ORIGIN||'http://127.0.0.1:8098';
assert.match(origin,/^http:\/\/127\.0\.0\.1:809[89]$/,'Gunakan QA terpisah');
let auth=await qaSession(origin);const directory=resolve('.cache/google-reader-browser');await mkdir(directory,{recursive:true});
const path=resolve(directory,'state.json'),id='1DoorprizeReaderBrowserFixture1234567890';
let fixture={id,version:1,headers:['Timestamp','Nama lengkap','Divisi'],rows:[[45000.1,'Alam','A'],[45000.2,'Budi','B']],deny:false,delay_ms:0};
async function save(){await writeFile(path+'.tmp',JSON.stringify(fixture));await rename(path+'.tmp',path);}
await save();await writeFile(path+'.requests.jsonl','');
async function api(name,payload){const r=await auth.fetch(origin+'/api/'+name,{method:payload?'POST':'GET',headers:{origin,'content-type':'application/json'},body:payload?JSON.stringify(payload):undefined});const v=await r.json();assert.equal(r.status,200,v.error);return v;}
const initial=await api('event-reset');if(initial.participants||(await api('fields')).items.length){await api('event-reset',{action:'reset',confirmation:'RESET',event_id:initial.event_id,version:initial.version});auth=await qaSession(origin);}
await api('fields',{action:'create',label:'Divisi'});
const browser=await openBrowser('google-reader-browser'),errors=[];
browser.onEvent(e=>{if(e.method==='Runtime.exceptionThrown')errors.push(e.params.exceptionDetails);});
try {
 await auth.browser(browser);const page=await browser.page(origin+'/#participants');
 const fill=(selector,value)=>page.evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});node.value=${JSON.stringify(String(value))};node.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 const open=async()=>{await page.click('#participants-google-sheets');await page.wait('document.querySelector("#google-dialog").open&&!document.querySelector("#google-prepare").disabled');};
 const inspect=async(url)=>{await fill('#google-url',url);await page.click('#google-prepare');await page.wait('!document.querySelector("#google-connect").hidden&&!document.querySelector("#google-connect").disabled');};
 await page.wait('document.readyState==="complete"');await open();
 assert.equal(await page.evaluate('document.querySelector("#google-dialog").textContent.includes("Apps Script")'),false);
 assert.equal(await page.evaluate('document.querySelector("#google-reader-email").value'),'reader@fixture-project.iam.gserviceaccount.com');
 const url=`https://docs.google.com/spreadsheets/d/${id}/edit#gid=0`;
 await inspect(url);assert.equal(await page.evaluate('document.querySelector("[data-google-field=name]").value'),'2');assert.equal(await page.evaluate('document.querySelector("#google-identity-label").hidden'),true);
 await page.click('#google-close');assert.equal((await api('google-sources')).items.length,0,'Periksa+batal bukan koneksi');
 await open();await inspect(url);await page.click('#google-connect');await page.wait('!document.querySelector("#google-dialog").open');
 await page.wait('document.querySelectorAll("#google-source-list .source-row").length===1&&document.querySelector("[data-source-phase]").textContent==="Aktif"');
 assert.equal((await api('participants')).items.length,2);
 await open();await inspect(url);await page.click('#google-connect');await page.wait('!document.querySelector("#google-dialog").open');await page.wait('document.querySelector("[data-source-phase]").textContent==="Aktif"');
 assert.equal((await api('participants')).items.length,2,'Pemetaan ulang tidak menambah peserta');
 // Gagal memeriksa pengganti tidak memutus sumber aktif.
 fixture.deny=true;await save();await open();await fill('#google-url',url.replace(id,id+'Other'));await page.click('#google-prepare');await page.wait('!document.querySelector("#google-error").hidden');
 assert.equal((await api('google-sources')).items[0].phase,'live');assert.equal(await page.evaluate('document.querySelectorAll("#google-source-list .source-row").length'),1);await page.click('#google-close');fixture.deny=false;await save();
 // Sumber lambat tidak menahan antrean kontrol WASM.
 fixture.delay_ms=1400;fixture.version++;fixture.rows.push([45000.3,'Citra','C']);await save();
 await page.click('[data-tab=draw]');
 const source=(await api('google-sources')).items[0];const waiting=api('google-sources',{action:'sync',id:Number(source.id)});await waiting;
 const began=performance.now();await page.click('#draw-start');await page.wait('document.querySelector("#draw-start").textContent.includes("Stop")');const startMs=Math.round(performance.now()-began);assert.ok(startMs<1000,'Mulai saat Google lambat '+startMs);
 await page.click('#draw-start');await page.wait('!document.querySelector("#draw-clear").disabled');await page.click('#draw-clear');fixture.delay_ms=0;await save();
 await page.click('[data-tab=participants]');await page.click('[data-source-action=disconnect]');await page.wait('document.querySelector("#google-source-list").hidden');
 assert.equal((await api('participants')).items.length,2,'Putus koneksi mempertahankan peserta');
 await open();await browser.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false},page.sessionId);assert.equal(await page.evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
 await writeFile(resolve(directory,'dialog.png'),Buffer.from((await browser.call('Page.captureScreenshot',{format:'png'},page.sessionId)).data,'base64'));
 assert.deepEqual(errors,[]);console.log(`Browser Google Reader: Viewer/link tanpa Apps Script, deteksi otomatis, batal tanpa daftar, satu koneksi, pemetaan ulang, pengganti gagal tidak memutus sumber, putus tanpa hapus peserta, mobile dan kontrol saat Google lambat (${startMs} ms) lulus.`);
}finally{await browser.close();}
