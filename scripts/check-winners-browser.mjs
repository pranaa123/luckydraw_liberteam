import { qaSession } from './browser-auth.mjs';
import assert from 'node:assert/strict';
import { readFile,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { openBrowser } from './browser-session.mjs';
const origin=process.env.DOORPRIZE_TEST_ORIGIN || 'http://127.0.0.1:8098';
const auth = await qaSession(origin);
const fetch = auth.fetch;
if(new URL(origin).port==='8091')throw Error('Gunakan database QA kosong.');
async function api(path,body){const r=await fetch(origin+'/api/'+path,{method:body?'POST':'GET',headers:{origin,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;}
assert.equal((await api('winners')).meta.total,0);assert.equal((await api('participants')).items.length,0);
const browser=await openBrowser('winners-qa'),requests=[],errors=[],downloads=[];
browser.onEvent(event=>{
 if(event.method==='Runtime.exceptionThrown')errors.push(event.params.exceptionDetails);
 if(event.method==='Network.requestWillBeSent')requests.push(event.params.request.url);
 if(event.method==='Browser.downloadWillBegin')downloads.push(event.params.suggestedFilename);
});
try {
 await browser.call('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:browser.cache,eventsEnabled:true});
  await auth.browser(browser);
 const page=await browser.page(origin+'/#history',1440,1000);await browser.call('Network.enable',{},page.sessionId);
 await page.wait(`document.querySelector('#winner-summary').textContent==='0 pemenang · 0 undian'`);
 assert.ok(await page.evaluate(`document.querySelector('#winners-export').disabled && document.querySelector('#winner-list').textContent.includes('Belum ada')`));
 assert.equal(requests.filter(url=>url.includes('/vendor/pdfmake/')).length,0,'PDF/font tidak dimuat saat startup');
 assert.equal(requests.filter(url=>url.includes('/api/history')).length,0,'Tab aktivitas belum dibaca');
 await page.click('#history-show-activity');await page.wait(`document.querySelector('#history-list').children.length>0`);
 await page.click('#history-show-winners');
 const fields=[];for(const label of ['No. Handphone','Departemen','Perusahaan'])fields.push(await api('fields',{action:'create',label}));
 let schema=fields.map(field=>`${field.id}:${field.slot}:${field.version}`).join(',');
 for(let index=1;index<=55;index++)await api('participants',{action:'create',name:index===1?'<img src=x onerror=alert(1)>':`José Peserta ${index}`,field_1:'00123456789',field_2:'Operasional',field_3:'PT Nusantara',field_schema:schema});
 const prize=await api('prizes',{action:'create',name:'Hadiah Awal',quantity:60});
 let settings=await api('settings');await api('settings',{...settings,action:'update',event_name:'Acara Demo',client_name:'Client Uji',event_at:'2026-11-13T19:30',visual:{...settings.visual,show_field_1:false}});
 async function draw(count,allocation=[]) {
  const state=await api('draws');const started=await api('draws',{action:'start',version:state.version,request_id:crypto.randomUUID(),winner_count:count,prize_mode:allocation.length?'selected':'none',allocation});
  await api('draws',{action:'stop',draw_id:started.draw.id});return api('draws',{action:'confirm',draw_id:started.draw.id});
 }
 const first=await draw(55,[{prize_id:prize.id,quantity:55}]);
 await api('prizes',{action:'update',id:prize.id,version:first.prize_updates[0].version,name:'Nama Hadiah Berubah',quantity:60});
 fields[1]=await api('fields',{action:'update',id:fields[1].id,version:fields[1].version,label:'Departemen Baru'});
 schema=fields.map(field=>`${field.id}:${field.slot}:${field.version}`).join(',');
 for(let index=1;index<=2;index++)await api('participants',{action:'create',name:`Peserta Baru ${index}`,field_1:'000999',field_2:'Administrasi',field_3:'PT Baru',field_schema:schema});
 await draw(2);await page.click('#draw-reload');
 await page.wait(`document.querySelector('#winner-summary').textContent==='57 pemenang · 2 undian' && document.querySelectorAll('#winner-list [data-winner-id]').length===50`);
 assert.equal(await page.evaluate(`document.querySelectorAll('#winner-list img, #winner-list script').length`),0);
 await page.click('#winners-next');await page.wait(`document.querySelector('#winners-page').textContent==='Halaman 2'`);
 assert.equal(await page.evaluate(`document.querySelectorAll('#winner-list [data-winner-id]').length`),7);
 assert.ok(await page.evaluate(`document.querySelector('#winner-list').textContent.includes('Departemen Baru') && document.querySelector('#winner-list').textContent.includes('Hadiah Awal')`));
 await page.click('#winners-previous');await page.wait(`document.querySelector('#winners-page').textContent==='Halaman 1'`);
 const before=requests.length;await page.click('#history-show-activity');await page.wait(`document.querySelector('#history-list').textContent.includes('Mengesahkan pemenang')`);await page.click('#history-show-winners');
 assert.equal(requests.slice(before).filter(url=>url.includes('/api/winners')).length,0,'Tab pemenang memakai cache');
 await page.evaluate(`document.querySelector('#winners-export').click();document.querySelector('#winners-export-cancel').click()`);
 await page.wait(`document.querySelector('#winners-feedback').textContent==='Export dibatalkan.' && !document.querySelector('#winners-export').disabled`);
 await page.click('#winners-export');
 await page.wait(`document.querySelector('#winners-feedback').textContent==='PDF berhasil diunduh.'`);
 const started=Date.now();let bytes;
 while(!bytes){try{bytes=await readFile(resolve(browser.cache,'pemenang-acara-demo.pdf'));}catch{if(Date.now()-started>15000)throw Error('Download PDF tidak selesai');await new Promise(r=>setTimeout(r,80));}}
 assert.equal(bytes.subarray(0,5).toString(),'%PDF-');assert.equal(downloads.length,1,'Cancel tidak mengunduh berkas');
 const document=await getDocument({data:new Uint8Array(bytes),isEvalSupported:false}).promise;
 let text='';try {
  assert.ok(document.numPages>1);
  for(let index=1;index<=document.numPages;index++){
   const pdfPage=await document.getPage(index),items=(await pdfPage.getTextContent()).items.filter(item=>item.str.trim());
   assert.ok(Math.abs(pdfPage.view[2]-841.89)<.1 && Math.abs(pdfPage.view[3]-595.28)<.1);
   assert.ok(items.every(item=>Math.hypot(item.transform[0],item.transform[1])>=11.99));
   const content=items.map(item=>item.str).join('').replace(/\s/gu,'');
   assert.ok(content.includes('AcaraDemo') && content.includes('ClientUji') && content.includes(`Halaman${index}/${document.numPages}`));text+=content;
  }
 } finally {await document.destroy();}
 assert.ok(text.includes('HadiahAwal') && !text.includes('NamaHadiahBerubah'),'PDF memakai snapshot hadiah');
 assert.ok(text.includes('DepartemenBaru') && text.includes('No.Handphone'),'Isian tersembunyi di visual tetap masuk laporan');
 const all=await api('winners?export=1');assert.equal(all.items.length,57);
 for(const item of all.items)assert.ok(text.includes(item.participant.name.replace(/\s/gu,'')),'Semua pemenang masuk PDF');
 await browser.call('Page.reload',{},page.sessionId);await page.wait(`document.querySelector('#winner-summary').textContent==='57 pemenang · 2 undian'`);
 const count=requests.filter(url=>url.includes('/api/winners')).length;await page.evaluate('new Promise(resolve=>setTimeout(resolve,900))');assert.equal(requests.filter(url=>url.includes('/api/winners')).length,count,'Tidak ada polling pemenang');
 await page.evaluate(`document.querySelector('#history-winners').scrollIntoView({block:'center'})`);
 await writeFile(resolve(browser.cache,'desktop.png'),Buffer.from((await browser.call('Page.captureScreenshot',{format:'png'},page.sessionId)).data,'base64'));
 await browser.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false},page.sessionId);
 assert.ok(await page.evaluate('document.documentElement.scrollWidth<=innerWidth'));
 await writeFile(resolve(browser.cache,'mobile.png'),Buffer.from((await browser.call('Page.captureScreenshot',{format:'png'},page.sessionId)).data,'base64'));
 assert.deepEqual(errors,[]);
 console.log('Browser pemenang: kosong/disahkan, paginasi/cache, tab aktivitas, snapshot, XSS, PDF/font lazy di worker, batal/retry/download PDF aktual, A4/font≥12/footer, refresh, mobile dan tanpa polling lulus.');
} finally {await browser.close();}
