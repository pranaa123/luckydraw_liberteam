import assert from 'node:assert/strict';
import { createPHP } from './php-runtime.mjs';
import { fitGeometry,validGeometry,resolveNameArea,changeAnchor,centeredGeometry,centerOffsets,positionLimits,editGeometry } from '../public/assets/modules/canvas-geometry.js';
const original = { canvas_width: 1920,canvas_height: 1080,area_width: 1000,area_height: 500,area_x: 100,area_y: 150,area_anchor_x: 'left',area_anchor_y: 'top' };
const anchored = changeAnchor(changeAnchor(original,'area_anchor_x','right'),'area_anchor_y','bottom');
assert.equal(anchored.area_x,820); assert.equal(anchored.area_y,430);
assert.deepEqual(resolveNameArea(anchored),{ ...original,area_anchor_x: 'right',area_anchor_y: 'bottom' });
assert.deepEqual(changeAnchor(changeAnchor(anchored,'area_anchor_x','left'),'area_anchor_y','top'),original);
const pinned = fitGeometry({ ...anchored,area_x: 0,area_y: 0,canvas_width: 4000,canvas_height: 2000 });
assert.equal(resolveNameArea(pinned).area_x,3000); assert.equal(resolveNameArea(pinned).area_y,1500);
assert.equal(pinned.area_width,1000,'Memperbesar canvas tidak mengubah ukuran pixel area');
let seed = 73;
const random = max => { seed = (Math.imul(seed,1664525) + 1013904223) >>> 0; return seed % max; };
const cases = [original,anchored,pinned,fitGeometry({ ...original,canvas_width: 1,canvas_height: 1 }),fitGeometry({ ...original,canvas_width: 32768,canvas_height: 32768,area_width: 32768,area_height: 32768 })];
for (let i = 0; i < 500; i++) cases.push(fitGeometry({ ...original,canvas_width: random(40000) + 1,canvas_height: random(40000) + 1,area_width: random(50000) - 10,area_height: random(50000) - 10,area_x: random(50000) - 10,area_y: random(50000) - 10,area_anchor_x: i % 2 ? 'right' : 'left',area_anchor_y: i % 3 ? 'bottom' : 'top' }));
for (const geometry of cases) {
  assert.ok(validGeometry(geometry));
  const area = resolveNameArea(geometry);
  assert.ok(area.area_x >= 0 && area.area_y >= 0 && area.area_x + area.area_width <= area.canvas_width && area.area_y + area.area_height <= area.canvas_height);
}
const centered = centeredGeometry(anchored);
assert.equal(centered.area_x,100); assert.equal(centered.area_y,150);
assert.deepEqual(centerOffsets(centered),{ x: -360,y: -140 });
const resized = editGeometry(centered,'canvas_width',3840);
assert.equal(resized.area_width,3840); assert.equal(resized.area_x,0);
assert.equal(resized.area_height,500); assert.equal(resized.area_y,150);
assert.equal(positionLimits(resized).x,0);
const smaller = editGeometry(centered,'area_width',500);
assert.equal(smaller.area_x + smaller.area_width / 2,centered.area_x + centered.area_width / 2);
const odd = editGeometry(editGeometry(centered,'canvas_width',1921),'area_width',1000);
assert.equal(odd.area_x,460.5); assert.equal(centerOffsets(odd).x,0);
assert.equal(editGeometry(odd,'area_offset_x',9999).area_x,921);
assert.equal(editGeometry(odd,'area_offset_x',-9999).area_x,0);
assert.ok(!validGeometry({ ...odd,area_x: .25 }));
cases.push(odd,smaller,resized);
for (let index = 0; index < 500; index++) {
  let value = centeredGeometry(cases[index]);
  for (const key of ['canvas_width','canvas_height','area_width','area_height','area_offset_x','area_offset_y']) value = editGeometry(value,key,random(40000) - 10000);
  assert.ok(validGeometry(value)); cases.push(value);
}
const php = await createPHP();
try {
  const encoded = Buffer.from(JSON.stringify(cases)).toString('base64');
  const result = await php.run({ code: `<?php require '/app/bootstrap/app.php'; foreach (json_decode(base64_decode('${encoded}'),true) as $geometry) App\\Modules\\Events\\VisualSettings::validate($geometry); echo json_encode(App\\Modules\\Events\\CanvasGeometry::DEFAULTS);` });
  assert.equal(result.httpStatusCode,200,result.errors); const defaults = JSON.parse(result.text);
  assert.equal(defaults.canvas_width,1920); assert.equal(defaults.canvas_height,1080); assert.equal(defaults.area_anchor_x,'left');
} finally { php.exit(); }
console.log(`Canvas: ${cases.length} kombinasi kompatibilitas lama, pusat/slider, batas dinamis, perubahan ukuran, setengah pixel dan validasi JS/PHP lulus.`);
