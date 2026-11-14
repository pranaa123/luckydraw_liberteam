import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createPHP} from './php-runtime.mjs';
import {openLocalDatabase} from './local-database.mjs';
import {connectAuthenticatedDatabase} from './auth-fixture.mjs';
const db=await openLocalDatabase('memory://'),php=await createPHP(),detach=await connectAuthenticatedDatabase(php,db);
async function api(name,payload,expected=200){const r=await php.run({scriptPath:'/app/public/index.php',relativeUri:'/api/'+name,method:payload?'POST':'GET',headers:{origin:'http://127.0.0.1:8091','content-type':'application/json'},body:payload?Buffer.from(JSON.stringify(payload)):undefined});assert.equal(r.httpStatusCode,expected,r.text+'\n'+r.errors);return JSON.parse(r.text);}
const schema=async()=>(await api('imports')).field_schema;
async function rules(keys){const m=await api('duplicates');return api('duplicates',{action:'update',version:m.version,field_schema:m.field_schema,keys});}
try{
  const fields=[];for(let slot=1;slot<=10;slot++)fields.push(await api('fields',{action:'create',label:'Isian '+slot}));
  assert.equal(fields.at(-1).slot,10);await api('fields',{action:'create',label:'Kesebelas'},422);
  const values=Object.fromEntries(fields.map(f=>['field_'+f.slot,'Nilai '+f.slot]));
  await rules(['field_10']);
  const first=await api('participants',{action:'create',name:'Alam Saputra',...values,field_schema:await schema()});
  assert.equal(first.field_10,'Nilai 10');
  const duplicate=await api('participants',{action:'create',name:'alam saputra',...values,field_10:'nilai 10',field_9:'Berbeda',field_schema:await schema()});
  let list=await api('participants');assert.equal(list.items.find(v=>v.id===duplicate.id).status,'duplicate');
  await rules(['field_9','field_10']);list=await api('participants');assert.equal(list.items.find(v=>v.id===duplicate.id).status,'available');
  const meta=await api('imports'),batch=randomUUID();
  await api('imports',{action:'create',batch_id:batch,filename:'Sebelas kolom.xlsx',sheet_name:'Peserta',field_schema:meta.field_schema,keys:meta.keys,mapping:Object.fromEntries(meta.fields.map((f,i)=>[f.key,i+1])),expected_rows:1});
  await api('imports',{action:'chunk',batch_id:batch,chunk_number:0,rows:[{row_number:7,name:'Peserta Import',...values,field_10:'Khusus'}]});
  const preview=await api('imports',{action:'preview',batch_id:batch});assert.equal(preview.summary.invalid,0);await api('imports',{action:'commit',batch_id:batch,preview_revision:preview.preview_revision});
  list=await api('participants');const imported=list.items.find(p=>p.name==='Peserta Import');assert.equal(imported.field_10,'Khusus');
  const opts=await api('participant-filters',{action:'options',field:'field_10',scope:'available',filters:{},search:''});assert.ok(opts.items.includes('Khusus'));
  let state=await api('draws');state=await api('draws',{action:'start',version:state.version,request_id:randomUUID(),winner_count:1,prize_mode:'none',allocation:[],filters:{field_10:{mode:'include',values:['Khusus']}}});assert.deepEqual(state.draw.sample_names,['Peserta Import']);
  state=await api('draws',{action:'stop',draw_id:state.draw.id});assert.equal(state.draw.entries[0].participant.field_10,'Khusus');assert.equal(state.draw.fields.length,10);await api('draws',{action:'confirm',draw_id:state.draw.id});
  await rules([]);
  list=await api('participants');const editable=list.items.find(p=>p.id===first.id);
  await api('participant-bulk',{action:'update',field_schema:await schema(),changes:{field_10:'Diedit massal'},selection:{mode:'ids',items:[{id:editable.id,version:editable.version}]}});
  list=await api('participants');assert.equal(list.items.find(p=>p.id===first.id).field_10,'Diedit massal');
  const settings=await api('settings');await api('settings',{action:'update',...settings,event_at:'',visual:{...settings.visual,show_field_10:false}});assert.equal((await api('settings')).visual.show_field_10,false);
  const defs=await api('fields'),last=defs.items.find(f=>f.slot===10);await api('fields',{action:'delete',id:last.id,version:last.version});
  list=await api('participants');assert.ok(list.items.every(p=>p.field_10===null));const winners=await api('winners');assert.equal(winners.items[0].participant.field_10,'Khusus');assert.equal(winners.items[0].fields.length,10,'Snapshot riwayat tidak berubah ketika isian dihapus');
  const google=await php.run({code:`<?php require '/app/bootstrap/app.php'; $old=['row_key'=>'a','participant_id'=>1,'row_number'=>2,'source_data'=>['name'=>'Alam','field_10'=>'Lama'],'source_hash'=>'x','name'=>'Alam','field_10'=>'Edit operator','status'=>'available']; $event=['row_key'=>'a','row_number'=>2,'operation'=>'upsert','data'=>['name'=>'Alam','field_10'=>'Dari Google'],'hash'=>'y','issue'=>null]; $plan=App\\Modules\\Imports\\Google\\GoogleRowPlan::build([$event],['a'=>$old]); echo $plan['rows'][0]['issue'];`});assert.equal(google.text,'conflict',google.errors);
  console.log('Nama + 10 tambahan: batas/CRUD, duplikasi satu/gabungan kunci, import 11 kolom, filter slot 10, sample visual, snapshot undian/pemenang, edit massal, visibility, hapus dan konflik Google lulus.');
}finally{detach();php.exit();await db.close();}
