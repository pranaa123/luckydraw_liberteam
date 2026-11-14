import { connectAuthenticatedDatabase } from './auth-fixture.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createPHP } from './php-runtime.mjs';
import { openLocalDatabase } from './local-database.mjs';

const db = await openLocalDatabase('memory://'), php = await createPHP(), calls = [];
const rawQuery = db.query.bind(db); db.query = (sql,args=[])=>{calls.push({sql,args});return rawQuery(sql,args);};
const disconnect = await connectAuthenticatedDatabase(php,db);
async function api(path,body,expected=200) {
  const result = await php.run({scriptPath:'/app/public/index.php',relativeUri:'/api/'+path,method:body?'POST':'GET',
    headers:{host:'127.0.0.1:8091',origin:'http://127.0.0.1:8091','content-type':'application/json'},body:body?new TextEncoder().encode(JSON.stringify(body)):undefined});
  assert.equal(result.httpStatusCode,expected,result.text+'\n'+result.errors);return result.text ? JSON.parse(result.text) : null;
}
async function round(count,action='confirm',allocation=[]) {
  const state=await api('draws');
  const start=await api('draws',{action:'start',version:state.version,request_id:randomUUID(),winner_count:count,prize_mode:allocation.length?'selected':'none',allocation});
  await api('draws',{action:'stop',draw_id:start.draw.id});
  assert.equal((await api('winners')).meta.total,action==='first'?0:total);
  if(action!=='pending')return api('draws',{action:action==='first'?'confirm':action,draw_id:start.draw.id});
  return start;
}
let total=0;
try {
  const empty=await api('winners');assert.equal(empty.meta.total,0);assert.equal(empty.snapshot,0);assert.deepEqual(empty.items,[]);
  const fields=[];for(const label of ['No. Handphone','Departemen','Kota'])fields.push(await api('fields',{action:'create',label}));
  const schema=fields.map(field=>`${field.id}:${field.slot}:${field.version}`).join(',');
  for(let index=0;index<8;index++)await api('participants',{action:'create',name:`José Peserta ${index}`,field_1:'0012345',field_2:'Operasional',field_3:'Makassar',field_schema:schema});
  const prize=await api('prizes',{action:'create',name:'Hadiah Awal',quantity:5});
  const first=await round(2,'first',[{prize_id:prize.id,quantity:2}]);total=2;
  const frozen=await api('winners');assert.equal(frozen.meta.total,2);assert.equal(frozen.meta.rounds,1);
  const originalName=frozen.items[0].participant.name;assert.equal(frozen.items[0].prize_name,'Hadiah Awal');
  await db.query("UPDATE doorprize.participants SET name='Nama sesudah edit' WHERE id=$1",[first.draw.entries[0].participant_id]);
  await api('prizes',{action:'update',id:prize.id,version:first.prize_updates[0].version,name:'Hadiah Sesudah Edit',quantity:5});
  await api('fields',{action:'update',id:fields[1].id,version:fields[1].version,label:'Departemen Baru'});
  const second=await round(1);total=3;
  const current=await api('winners');assert.equal(current.items[0].participant.name,originalName);assert.equal(current.items[0].prize_name,'Hadiah Awal');
  assert.equal(current.items[0].fields[1].label,'Departemen');assert.equal(current.items.at(-1).fields[1].label,'Departemen Baru');
  assert.equal((await api(`winners?snapshot=${frozen.snapshot}`)).items.length,2,'Snapshot tidak mengambil pengesahan baru');
  await api('draws',{action:'clear',draw_id:second.draw.id});assert.equal((await api('winners')).meta.total,3,'Kosongkan layar tidak menghapus pemenang');
  const pending=await round(1,'pending');assert.equal((await api('winners')).meta.total,3);
  await api('draws',{action:'clear',draw_id:pending.draw.id});
  await round(1,'eliminate');assert.equal((await api('winners')).meta.total,3);
  await db.query("INSERT INTO doorprize.events(owner_id) VALUES('00000000-0000-4000-8000-000000000002')");
  const foreign=(await db.query("INSERT INTO doorprize.draws(event_id,sequence_number,status,prize_mode,requested_count,idempotency_key,resolved_at) VALUES(2,1,'confirmed','none',1,$1,now()) RETURNING id",[randomUUID()])).rows[0].id;
  await api(`winners?snapshot=${foreign}`,undefined,422);
  for(const query of ['snapshot=-1','snapshot=abc','after_draw=1','snapshot=0&after_draw=1&after_position=1','after_position=2147483648','export=2'])await api('winners?'+query,undefined,422);
  await api('winners',{action:'create'},405);
  const bulk=(await db.query("INSERT INTO doorprize.draws(event_id,sequence_number,status,prize_mode,requested_count,idempotency_key,resolved_at,field_definitions) VALUES(1,1000,'confirmed','none',1001,$1,now(),'[]') RETURNING id",[randomUUID()])).rows[0].id;
  await db.query("WITH p AS (INSERT INTO doorprize.participants(event_id,name,status) SELECT 1,'Pemenang '||i,'winner' FROM generate_series(1,1001)i RETURNING id,name) INSERT INTO doorprize.draw_entries(event_id,draw_id,participant_id,position,participant_snapshot) SELECT 1,$1,id,row_number() OVER(ORDER BY id),jsonb_build_object('name',name) FROM p",[bulk]);
  total=1004;
  const firstPage=await api('winners');assert.equal(firstPage.items.length,50);assert.equal(firstPage.meta.total,total);assert.ok(firstPage.next);
  const ids=firstPage.items.map(item=>item.id);let next=firstPage.next;
  while(next){const page=await api(`winners?snapshot=${firstPage.snapshot}&after_draw=${next.draw_id}&after_position=${next.position}`);assert.ok(!page.meta);ids.push(...page.items.map(item=>item.id));next=page.next;}
  assert.equal(ids.length,total);assert.equal(new Set(ids).size,total);
  const exportPage=await api('winners?export=1');assert.equal(exportPage.items.length,500);
  const later=(await db.query("INSERT INTO doorprize.draws(event_id,sequence_number,status,prize_mode,requested_count,idempotency_key,resolved_at) VALUES(1,1001,'confirmed','none',1,$1,now()) RETURNING id",[randomUUID()])).rows[0].id;
  const newPerson=(await db.query("INSERT INTO doorprize.participants(event_id,name,status) VALUES(1,'Pemenang Baru','winner') RETURNING id")).rows[0].id;
  await db.query("INSERT INTO doorprize.draw_entries(event_id,draw_id,participant_id,position,participant_snapshot) VALUES(1,$1,$2,1,'{\"name\":\"Pemenang Baru\"}')",[later,newPerson]);
  const report=[...exportPage.items];next=exportPage.next;
  while(next){const page=await api(`winners?export=1&snapshot=${exportPage.snapshot}&after_draw=${next.draw_id}&after_position=${next.position}`);report.push(...page.items);next=page.next;}
  assert.equal(report.length,total);assert.ok(report.every(item=>item.draw_id<=bulk));
  assert.equal((await api('winners')).meta.total,total+1);
  const huge=(await db.query("INSERT INTO doorprize.draws(event_id,sequence_number,status,prize_mode,requested_count,idempotency_key,resolved_at) VALUES(1,1002,'confirmed','none',50001,$1,now()) RETURNING id",[randomUUID()])).rows[0].id;
  await db.query("WITH p AS (INSERT INTO doorprize.participants(event_id,name,status) SELECT 1,'Data Besar '||i,'winner' FROM generate_series(1,50001)i RETURNING id,name) INSERT INTO doorprize.draw_entries(event_id,draw_id,participant_id,position,participant_snapshot) SELECT 1,$1,id,row_number() OVER(ORDER BY id),jsonb_build_object('name',name) FROM p",[huge]);
  await db.query('ANALYZE doorprize.draw_entries');calls.length=0;
  const start=performance.now();const deep=await api(`winners?snapshot=${huge}&after_draw=${huge}&after_position=49000`);const elapsed=performance.now()-start;
  assert.equal(deep.items.length,50);assert.equal(deep.items[0].position,49001);assert.ok(elapsed<1000,`Halaman dalam ${elapsed} ms`);
  assert.ok(!calls.some(call=>/FROM doorprize\.(participants|prizes|event_fields)/u.test(call.sql)),'Daftar tidak membaca data peserta/hadiah mutable');
  const query=calls.find(call=>call.sql.includes('FROM doorprize.draw_entries entry'));
  const plan=(await db.query('EXPLAIN (ANALYZE, FORMAT JSON) '+query.sql,query.args)).rows;
  assert.match(JSON.stringify(plan),/Index/);
  console.log(`Pemenang PHP/PostgreSQL: hanya disahkan, snapshot nama/hadiah/isian, isolasi acara, paginasi 50/500 stabil, export saat pengesahan baru, validasi dan 50.000+ hasil (${Math.round(elapsed)} ms halaman dalam) lulus.`);
} finally {disconnect();php.exit();await db.close();}
