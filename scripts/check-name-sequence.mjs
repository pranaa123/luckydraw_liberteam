import assert from 'node:assert/strict';
import {NameSequence,nameInterval,reducedInterval} from '../public/assets/modules/shuffle-model.js';
const names=Array.from({length:512},(_,i)=>`Peserta Acak ${i+1}`);
for(const seed of [0,17,4294967295]){
  const a=new NameSequence(seed,names),b=new NameSequence(seed,names);
  for(const time of [0,250,3000,60000,86400000])assert.deepEqual(a.frame(time),b.frame(time),'Seed/waktu sama menyinkronkan output');
  for(let cycle=0;cycle<4;cycle++){const shown=Array.from({length:names.length},(_,i)=>a.at(cycle*names.length+i));assert.equal(new Set(shown).size,names.length);if(cycle)assert.notEqual(shown[0],a.at(cycle*names.length-1),'Tidak berulang pada pergantian siklus');}
  assert.notDeepEqual(a.order(0),a.order(1),'Urutan tidak memakai template siklus yang sama');
}
for(const size of [0,1,2,3]){const sequence=new NameSequence(17,names.slice(0,size));assert.doesNotThrow(()=>sequence.frame(86400000));if(size>1)for(let turn=1;turn<30;turn++)assert.notEqual(sequence.at(turn),sequence.at(turn-1));}
assert.equal(new NameSequence(1,['Alam Saputra','alam saputra',' Alam  Saputra ']).names.length,1);
assert.equal(new NameSequence(1,names).frame(reducedInterval,true).progress,0);
assert.equal(new NameSequence(1,names).frame(nameInterval*.5).progress,.5);
console.log('Nama acak: hanya peserta asli, 512 nama tanpa pengulangan/siklus, urutan berubah, lintas siklus, satu/dua peserta, 24 jam, sinkronisasi dan reduced motion lulus.');
