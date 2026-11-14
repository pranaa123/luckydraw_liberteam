import { qaSession } from './browser-auth.mjs';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { openBrowser } from './browser-session.mjs';

// Fixture renderer di browser QA; tidak menulis undian/peserta ke database.
const origin = process.env.DOORPRIZE_TEST_ORIGIN || 'http://127.0.0.1:8098';
const auth = await qaSession(origin);
const fetch = auth.fetch;
if (!['127.0.0.1','localhost'].includes(new URL(origin).hostname) || new URL(origin).port === '8091') throw Error('Gunakan server QA lokal terpisah.');
const browser = await openBrowser('results-qa'), requests = [], errors = [];
browser.onEvent(event => {
  if (event.method === 'Runtime.exceptionThrown') errors.push(event.params.exceptionDetails);
  if (event.method === 'Network.requestWillBeSent' && event.params.request.url.includes('/api/')) requests.push(event.params.request.url);
});
try {
  await auth.browser(browser);
  const page = await browser.page(origin + '/output',1920,1080);
  await browser.call('Network.enable',{},page.sessionId);
  await page.wait(`document.querySelector('#visual-stage').dataset.settingsVersion && document.querySelector('#visual-stage').dataset.animation`);
  await page.evaluate(`(async () => {
    const { drawState } = await import('/assets/modules/draw-state.js');
    const { presentationState } = await import('/assets/modules/presentation-state.js');
    await drawState.load(); await presentationState.load();
    let version = drawState.state.version + 100;
    const fields = [1,2,3].map(slot => ({ slot,label: 'Isian ' + slot }));
    window.feedResult = (id,phase,count=1,status='pending') => {
      const entries = Array.from({ length: count },(_,index) => ({ participant_id: index + 1,participant: { name: window.fixtureNames?.[index] || (index ? 'Peserta ' + index : 'Nadia Ayu Lestari'),field_1: 'Operasional',field_2: 'Makassar',field_3: 'DP-00001' },prize_name: 'Tas' }));
      drawState.accept({ ...drawState.state,version: ++version,fields,draw: id === null ? null : { id,status,phase,allocation: [],fields,entries: phase === 'result' ? entries : [],seed: 42,started_at: Date.now() } });
    };
    window.setResultVisual = changes => {
      const state = structuredClone(presentationState.packet.state);
      Object.assign(state.visual,{ background_type: 'color',background_color: '#ffffff',font_color: '#172b4d',show_field_1: true,show_field_2: true,show_field_3: true },changes);
      presentationState.publish(state,true);
    };
    window.pauseResults = () => { const animations = [...document.querySelectorAll('#draw-results > g')].flatMap(node => node.getAnimations()); animations.forEach(animation => { animation.pause(); animation.currentTime = 0; }); return animations.length; };
    setResultVisual({ canvas_width: 1920,canvas_height: 1080,area_width: 1536,area_height: 648,area_x: 192,area_y: 216,area_anchor_x: 'left',area_anchor_y: 'top' });
  })()`);
  const initialStandby = await page.evaluate(`Number(document.querySelector('#standby-text').getAttribute('font-size'))`);
  requests.length = 0;
  const first = await page.evaluate(`(() => {
    feedResult(100,'rolling'); feedResult(100,'result'); pauseResults();
    window.resultNode = document.querySelector('#draw-results > g'); window.resultText = resultNode.firstElementChild; window.resultAnimation = resultNode.getAnimations()[0];
    const timing = resultAnimation.effect.getTiming();
    const sizes = [...resultNode.querySelectorAll('text')].map(node => Number(node.getAttribute('font-size')));
    const start = Number(getComputedStyle(resultNode).opacity);
    resultAnimation.currentTime = 190;
    return { duration: timing.duration,sizes,reference:parseFloat(document.querySelector('.shuffle-glyph').style.fontSize),start,middle: Number(getComputedStyle(resultNode).opacity),transform: getComputedStyle(resultNode).transform };
  })()`);
  assert.equal(first.duration,380); assert.ok(Math.abs(first.sizes[0]-first.reference)<.001,JSON.stringify(first)); assert.deepEqual(first.sizes.slice(1),[first.sizes[0]*.5,first.sizes[0]*.25,first.sizes[0]*.25,first.sizes[0]*.48]); assert.ok(Math.abs(initialStandby-first.sizes[0]*.68)<.001); assert.equal(first.start,0);
  assert.ok(first.middle > 0 && first.middle < 1 && first.transform !== 'none');
  assert.ok(await page.evaluate(`(() => {setResultVisual({font_color:'#164e63',area_width:1800,area_x:60});feedResult(100,'result',1,'confirmed');return resultNode===document.querySelector('#draw-results > g') && resultText===resultNode.firstElementChild && resultAnimation===resultNode.getAnimations()[0] && resultAnimation.currentTime===190;})()`),'Edit visual dan pengesahan tidak membuat node/animasi baru');
  assert.ok(await page.evaluate(`Math.abs(Number(resultText.getAttribute('font-size'))-parseFloat(document.querySelector('.shuffle-glyph').style.fontSize))<.001`),'Nama mengikuti acuan glyph setelah area berubah');
  await page.evaluate('resultAnimation.finish()'); await page.wait(`document.querySelector('#draw-results > g').getAnimations().length === 0`);
  assert.equal(await page.evaluate(`getComputedStyle(resultNode).opacity`),'1');
  assert.equal(await page.evaluate(`(() => {feedResult(100,'result',1,'confirmed');return resultNode.getAnimations().length;})()`),0,'Paket hasil ulang tidak mengulang transisi');
  await writeFile(browser.cache + '/single-result.png',Buffer.from((await browser.call('Page.captureScreenshot',{format:'png'},page.sessionId)).data,'base64'));
  const longNames = ['Muhammad Rizky Pratama Aditya Nugraha Kusuma Wijaya','ABCDEFGHIJKLMNOPQRSTUVWXYZ'.repeat(6),'Ni Luh Ayu Puspita Dewi'];
  await page.evaluate(`window.fixtureNames=${JSON.stringify(longNames)};setResultVisual({area_width:1536,area_x:192});feedResult(105,'rolling');feedResult(105,'result',3);for(const node of document.querySelectorAll('#draw-results > g'))for(const animation of node.getAnimations())animation.finish();`);
  const wrapped = await page.evaluate(`(() => {
    const area=document.querySelector('#result-clip-area').getBBox();
    const groups=[...document.querySelectorAll('#draw-results > g')];
    return groups.map(group=>{
      const lines=[...group.querySelectorAll('text')].slice(0,-4),box=group.getBBox();
      return {name:lines.map(line=>line.textContent).join('').replace(/\\s/gu,''),count:lines.length,inside:box.x>=area.x-1 && box.y>=area.y-1 && box.x+box.width<=area.x+area.width+1 && box.y+box.height<=area.y+area.height+1};
    });
  })()`);
  assert.equal(wrapped.length,longNames.length);
  for(const [index,item] of wrapped.entries()) {assert.equal(item.name.toLocaleLowerCase('id-ID'),longNames[index].replace(/\s/gu,'').toLocaleLowerCase('id-ID'));assert.ok(item.inside);}
  assert.ok(wrapped.every(item=>item.count===1),'Semua nama termasuk yang panjang tetap satu baris');
  assert.equal(wrapped[2].count,1,'Nama pendek tetap satu baris bersama nama panjang');
  await writeFile(browser.cache + '/long-names.png',Buffer.from((await browser.call('Page.captureScreenshot',{format:'png'},page.sessionId)).data,'base64'));
  await page.evaluate(`window.fixtureNames=Array.from({length:9},(_,index)=>index===8?'W'.repeat(160):'Alam');feedResult(106,'rolling');feedResult(106,'result',9);pauseResults();`);
  const isolated = await page.evaluate(`Array.from(document.querySelectorAll('#draw-results > g'),group=>Number(group.firstElementChild.getAttribute('font-size')))`);
  assert.equal(new Set(isolated.slice(0,8)).size,1,'Nama normal memakai ukuran yang seragam');
  assert.ok(isolated[8] < isolated[0],'Hanya blok nama ekstrem yang diperkecil');
  const density = [];
  for(const count of [1,2,4,8,20,100]) {
    density.push(await page.evaluate(`(() => {window.fixtureNames=Array.from({length:${count}},()=> 'Alam');feedResult(${200}+${count},'rolling');feedResult(${200}+${count},'result',${count});pauseResults();return Number(document.querySelector('#draw-results text').getAttribute('font-size'));})()`));
  }
  assert.ok(density.every((size,index)=>!index || size<=density[index-1]+.001),'Ukuran mengecil otomatis menurut jumlah');
  await page.evaluate(`feedResult(null,'');setResultVisual({area_width:1536,area_height:648,area_x:192,area_y:216});`);
  assert.ok(await page.evaluate(`(() => {const text=document.querySelector('#standby-text'),box=text.getBBox(),area=document.querySelector('#result-clip-area').getBBox();return text.getAttribute('font-weight')==='700' && text.textContent==='Bersiap untuk mengundi' && !text.querySelector('[dy]') && box.x>=area.x && box.y>=area.y && box.x+box.width<=area.x+area.width && box.y+box.height<=area.y+area.height;})()`),'Standby proporsional satu baris dan di dalam area');
  await writeFile(browser.cache+'/standby.png',Buffer.from((await browser.call('Page.captureScreenshot',{format:'png'},page.sessionId)).data,'base64'));
  await page.evaluate('delete window.fixtureNames');
  const many = await page.evaluate(`(() => {
    feedResult(101,'rolling');feedResult(101,'result',100);pauseResults();
    window.runningResults=[...document.querySelectorAll('#draw-results > g')].flatMap(node=>node.getAnimations());
    return { count:runningResults.length,end:Math.max(...runningResults.map(animation=>{const timing=animation.effect.getTiming();return timing.delay+timing.duration;})) };
  })()`);
  assert.equal(many.count,100); assert.equal(many.end,540);
  assert.ok(await page.evaluate(`(() => {feedResult(null,'');return document.querySelector('#draw-results').children.length===0 && runningResults.every(animation=>animation.playState==='idle');})()`),'Kosongkan membatalkan seluruh transisi');
  await browser.call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]},page.sessionId);
  const reduced = await page.evaluate(`(() => {
    feedResult(102,'rolling');feedResult(102,'result',7);pauseResults();
    return [...document.querySelectorAll('#draw-results > g')].flatMap(node=>node.getAnimations()).map(animation=>({duration:animation.effect.getTiming().duration,delay:animation.effect.getTiming().delay,moves:animation.effect.getKeyframes().some(frame=>frame.transform && frame.transform!=='none')}));
  })()`);
  assert.equal(reduced.length,7); assert.ok(reduced.every(item=>item.duration===120 && item.delay===0 && !item.moves));
  await page.evaluate(`for(const node of document.querySelectorAll('#draw-results > g')) for(const animation of node.getAnimations()) animation.finish()`);
  await page.wait(`document.querySelector('#draw-results > g').getAnimations().length===0`);
  await page.evaluate(`setResultVisual({canvas_width:7680,canvas_height:4320,area_width:7000,area_height:3900,area_x:340,area_y:210});feedResult(103,'rolling');feedResult(103,'result');pauseResults();`);
  assert.ok(await page.evaluate(`Math.abs(Number(document.querySelector('#draw-results text').getAttribute('font-size'))-parseFloat(document.querySelector('.shuffle-glyph').style.fontSize))<.001`),'8K mengikuti ukuran glyph');
  assert.ok(await page.evaluate(`Math.abs(Number(document.querySelector('#standby-text').getAttribute('font-size'))-Number(document.querySelector('#draw-results text').getAttribute('font-size'))*.68)<.001`),'Standby 8K mengikuti skala yang lebih besar');
  await page.evaluate(`feedResult(null,'');setResultVisual({canvas_width:320,canvas_height:180,area_width:300,area_height:160,area_x:10,area_y:10});feedResult(104,'rolling');feedResult(104,'result');pauseResults();`);
  assert.ok(await page.evaluate(`Math.abs(Number(document.querySelector('#draw-results text').getAttribute('font-size'))-parseFloat(document.querySelector('.shuffle-glyph').style.fontSize))<.001`),'Canvas kecil tetap mengikuti glyph');
  await page.evaluate(`setResultVisual({canvas_width:1920,canvas_height:1080,area_width:80,area_height:50,area_x:0,area_y:0});feedResult(null,'');`);
  assert.ok(await page.evaluate(`Number(document.querySelector('#standby-text').getAttribute('font-size')) < 54`),'Area sempit mengecilkan standby agar tetap muat');
  assert.deepEqual(requests,[],'Transisi, pengaturan visual dan fixture tidak membaca API');
  assert.deepEqual(errors,[]);
  console.log('Browser hasil: acuan glyph dan label hadiah, nama satu baris, skala jumlah, outlier terpisah, standby proporsional, kecil/8K, transisi opacity/gerak bertahap, node dipakai ulang, tanpa replay pada edit/pengesahan, cancel 100 nama, reduced motion dan tanpa request API lulus.');
} finally { await browser.close(); }
