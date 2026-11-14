import assert from 'node:assert/strict';
import { resultLayout } from '../public/assets/modules/result-layout.js';
import { defaultNameSize,defaultStandbySize,shuffleTypography,resultSizeLimit } from '../public/assets/modules/output-typography.js';
const measure = { measureText: text => ({ width: text.length * 60 }) };
const fields = [1,2,3].map(slot => ({ slot,label: `Isian ${slot}` }));
for (const count of [1,7,20,100]) for (const [area_width,area_height] of [[1536,648],[700,1500],[7000,3900]]) {
  const entries = Array.from({ length: count },(_,index) => ({ participant_id: index + 1,participant: { name: index % 2 ? 'Nama Panjang Peserta Doorprize' : 'Alam',field_1: 'Divisi Operasional dan Layanan Pelanggan',field_2: 'Kota Makassar',field_3: 'DP-00001' },prize_name: 'Hadiah Spesial' }));
  const visual = { area_width,area_height,area_x: 80.5,area_y: 100.5 };
  const layout = resultLayout(entries,fields,visual,measure,value => value);
  assert.equal(layout.length,count);
  for (const item of layout) {
    const base = item.lines[0].size;
    assert.equal(item.lines[0].text,entries.find(entry=>entry.participant_id===item.id).participant.name,'Nama selalu satu baris utuh');
    assert.ok(base <= defaultNameSize(visual,measure),'Area yang lapang tidak boleh memperbesar teks melewati default');
    for (const [text,ratio] of [['Divisi Operasional dan Layanan Pelanggan',.5],['Kota Makassar',.25],['DP-00001',.25]]) assert.equal(item.lines.find(line => line.text === text).size,base * ratio);
    for (const line of item.lines) {
      const halfWidth = measure.measureText(line.text).width / 100 * line.size / 2;
      assert.ok(line.size > 0 && line.x - halfWidth >= visual.area_x && line.x + halfWidth <= visual.area_x + visual.area_width);
      assert.ok(line.y - line.size / 2 >= visual.area_y && line.y + line.size / 2 <= visual.area_y + visual.area_height);
    }
  }
  const hidden = resultLayout(entries,fields,{ ...visual,show_field_1: false },measure,value => value);
  assert.ok(hidden.every(item => !item.lines.some(line => line.text.startsWith('Divisi'))));
  for (const item of hidden) assert.equal(item.lines.find(line => line.text === 'Kota Makassar').size,item.lines[0].size * .25);
  const nameOnly = resultLayout(entries,fields,{ ...visual,show_field_1: false,show_field_2: false,show_field_3: false },measure,value => value);
  assert.ok(nameOnly.every(item => !item.lines.some(line => /Divisi|Kota|DP-/u.test(line.text))));
  assert.ok(nameOnly[0].lines[0].size >= layout[0].lines[0].size,'Isian tersembunyi tidak menyisakan ruang');
}
const shortName = [{ participant_id: 1,participant: { name: 'Alam' },prize_name: 'Tas' }];
const roomy = { canvas_width: 1920,canvas_height: 1080,area_width: 1536,area_height: 648,area_x: 0,area_y: 0 };
const layout = visual => resultLayout(shortName,[],visual,measure,value => value);
const reference = defaultNameSize(roomy,measure);
assert.equal(layout(roomy)[0].lines[0].size,reference);
assert.equal(defaultStandbySize(roomy,measure),reference * .68,'Standby lebih besar dengan acuan proporsional');
for (const factor of [.1,1,4,10]) {
  const visual = Object.fromEntries(Object.entries(roomy).map(([key,value]) => [key,value * factor]));
  assert.ok(Math.abs(layout(visual)[0].lines[0].size / factor - reference) < 1e-8,'Skala canvas/area mempertahankan proporsi');
  assert.equal(defaultNameSize(visual,measure),shuffleTypography(visual,measure).size);
  assert.equal(defaultStandbySize(visual,measure),defaultNameSize(visual,measure) * .68);
}
for (const name of ['Muhammad Rizky Pratama Aditya Nugraha Kusuma Wijaya','A'.repeat(160),'Ni Luh Ayu Puspita Dewi','👩🏽‍💻'.repeat(20),'é'.repeat(90)]) {
  const item = resultLayout([{participant_id:1,participant:{name}}],[],roomy,measure,value=>value)[0];
  assert.equal(item.lines.length,1,'Nama selalu satu baris');
  assert.equal(item.lines[0].text,name,'Seluruh karakter tetap utuh');
  assert.ok(measure.measureText(name).width / 100 * item.lines[0].size <= roomy.area_width * .92 + .001);
}
let previous = Infinity;
for (const count of [1,2,4,8,20,50,100]) {
  const entries = Array.from({length:count},(_,index)=>({participant_id:index+1,participant:{name:'Alam'}}));
  const items = resultLayout(entries,[],roomy,measure,value=>value);
  assert.ok(items[0].lines[0].size <= previous + .001,'Ukuran otomatis tidak bertambah ketika jumlah bertambah');
  assert.ok(items.every(item=>item.lines[0].size<=resultSizeLimit(reference,count)+.001));
  previous=items[0].lines[0].size;
}
const regular = Array.from({length:8},(_,index)=>({participant_id:index+1,participant:{name:'Alam'}}));
const normal = resultLayout([...regular,{participant_id:9,participant:{name:'Alam'}}],[],roomy,measure,value=>value);
const mixed = resultLayout([...regular,{participant_id:9,participant:{name:'W'.repeat(160)}}],[],roomy,measure,value=>value);
assert.ok(mixed[0].lines[0].size >= normal[0].lines[0].size * .9,'Nama ekstrem tidak mengecilkan seluruh pemenang');
assert.ok(mixed.at(-1).lines[0].size < mixed[0].lines[0].size,'Nama ekstrem menyesuaikan ukuran sendiri');
console.log('Layout hasil: satu baris utuh, skala jumlah 1–100, nama ekstrem terpisah, hierarki isian, standby dan skala canvas lulus.');
