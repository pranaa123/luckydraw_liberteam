import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createWinnerReport,winnerFilename } from '../public/assets/modules/winner-report.js';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { projectRoot } from './php-runtime.mjs';
const require=createRequire(import.meta.url),pdf=require('pdfmake/build/pdfmake.js');
pdf.addVirtualFileSystem(require('pdfmake/build/vfs_fonts.js'));
const fields=[{slot:1,label:'No. Handphone'},{slot:2,label:'Departemen'},{slot:3,label:'Perusahaan'}];
const rows=Array.from({length:130},(_,index)=>({fields:index<90?fields:[{slot:2,label:'Departemen Baru'}],participant:{name:`José Pratama ${index+1}`,field_1:'00123456789',field_2:index===20?'Operasional '.repeat(15):'Divisi Utama',field_3:index===21?'W'.repeat(200):'PT Nusantara'},prize_name:index%2?'Hadiah Spesial':'',sequence_number:index<90?3:7}));
const meta={client_name:'Client Uji',event_name:'Acara Tahunan',event_at:'2026-11-13T19:30:00+08:00',timezone:'Asia/Makassar',total:130,rounds:2};
const plain=value=>value.replace(/\s/gu,'');
async function inspect(data,meta,minimumPages=1) {
  const doc=await getDocument({data:new Uint8Array(data),isEvalSupported:false}).promise;
  try {
    assert.ok(doc.numPages>=minimumPages);let all='';
    for(let index=1;index<=doc.numPages;index++) {
      const page=await doc.getPage(index);assert.ok(Math.abs(page.view[2]-841.89)<.1 && Math.abs(page.view[3]-595.28)<.1,'A4 landscape');
      const items=(await page.getTextContent()).items.filter(item=>item.str.trim());
      const text=plain(items.map(item=>item.str).join(' '));all+=text;
      assert.ok(text.includes(`Halaman${index}/${doc.numPages}`),'Halaman / total halaman di setiap lembar');
      assert.ok(text.includes('Daftarpemenang'));
      for(const value of [meta.client_name,meta.event_name].filter(Boolean))assert.ok(text.includes(plain(value)),'Informasi umum berulang');
      if(meta.event_at)assert.ok(text.includes('13November2026'));
      assert.ok(items.every(item=>Math.hypot(item.transform[0],item.transform[1])>=11.99),'Seluruh font minimal 12 pt');
      assert.ok(items.every(item=>item.transform[4]>=20 && item.transform[4]+item.width<=page.view[2]-20 && item.transform[5]>=12 && item.transform[5]<=page.view[3]-12),'Tidak ada teks keluar kertas');
    }
    return {all,pages:doc.numPages};
  } finally {await doc.destroy();}
}
assert.throws(()=>createWinnerReport(meta,[]),/Belum ada/);
assert.equal(winnerFilename(meta),'pemenang-acara-tahunan.pdf');
const definition=createWinnerReport(meta,rows);
assert.equal(definition.content.length,2,'Label snapshot berbeda memakai tabel masing-masing');
assert.equal(definition.content[0].table.body[0][2].text,'Departemen');assert.equal(definition.content[1].table.body[0][1].text,'Departemen Baru');
const bytes=await new Promise(resolve=>pdf.createPdf(definition).getBuffer(resolve));
const result=await inspect(bytes,meta,3);
for(let index=1;index<=130;index++)assert.ok(result.all.includes(`JoséPratama${index}`),'Semua pemenang masuk laporan');
assert.ok(result.all.includes('00123456789'));assert.ok(result.all.includes('DepartemenBaru'));
const emptyMeta={timezone:'Asia/Makassar',total:1,rounds:1};
await inspect(await new Promise(resolve=>pdf.createPdf(createWinnerReport(emptyMeta,[{fields:[],participant:{name:'Alam'},prize_name:'',sequence_number:1}])).getBuffer(resolve)),emptyMeta);
const longMeta={...emptyMeta,client_name:'W'.repeat(200),event_name:'W'.repeat(200)};
const longRows=[{fields:[{slot:1,label:'W'.repeat(80)},{slot:2,label:'W'.repeat(80)},{slot:3,label:'W'.repeat(80)}],participant:{name:'W'.repeat(200),field_1:'W'.repeat(200),field_2:'W'.repeat(200),field_3:'W'.repeat(200)},prize_name:'W'.repeat(200),sequence_number:99}];
const longPdf=await new Promise(resolve=>pdf.createPdf(createWinnerReport(longMeta,longRows)).getBuffer(resolve));
await inspect(longPdf,longMeta);
await mkdir(resolve(projectRoot,'.cache/winner-pdf'),{recursive:true});await writeFile(resolve(projectRoot,'.cache/winner-pdf/report.pdf'),bytes);
console.log(`PDF: ${result.pages} halaman A4 landscape, semua font ≥12 pt, header/footer berulang, data lengkap, label historis, Unicode Latin, nol di depan, teks panjang dan metadata kosong lulus.`);
