import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createPHP} from './php-runtime.mjs';
import {openLocalDatabase} from './local-database.mjs';
import {connectAuthenticatedDatabase} from './auth-fixture.mjs';

const db=await openLocalDatabase('memory://'),php=await createPHP(),queries=[];
const query=db.query.bind(db);db.query=(...args)=>{queries.push(args[0]);return query(...args);};
const id='1DoorprizeDirectReaderFixture1234567890';
let version=1,title='Respons',headers=['Timestamp','Nama lengkap','Divisi'],deny=false,bumpFinal=false,calls=[],rows=[[45000.123,'Alam','Divisi A'],[45000.124,'Budi','Divisi B']];
const env={GOOGLE_READER_EMAIL:'reader@fixture-project.iam.gserviceaccount.com',GOOGLE_READER_AUDIENCE:'//fixture',VERCEL_OIDC_TOKEN:'fixture-only'};
const detach=await connectAuthenticatedDatabase(php,db,{reader:async request=>{
  const url=new URL(request.url);calls.push(url.pathname+url.search);
  if(deny&&url.hostname==='sheets.googleapis.com')return{status:403,data:{}};
  if(url.hostname==='sts.googleapis.com')return{status:200,data:{access_token:'fixture-federated'}};
  if(url.hostname==='iamcredentials.googleapis.com')return{status:200,data:{accessToken:'fixture-readonly',expireTime:'2099-01-01T00:00:00Z'}};
  if(url.hostname==='www.googleapis.com'&&bumpFinal&&url.searchParams.get('fields')==='trashed,version,id'){version++;bumpFinal=false;}
  if(url.hostname==='www.googleapis.com')return{status:200,data:{id,version:String(version),trashed:false}};
  if(url.pathname.endsWith('/'+id)||url.pathname.endsWith('/'+id+'Other')){
    const ranges=url.searchParams.getAll('ranges');
    if(ranges.some(r=>r.includes('!')&&r.split('!')[0]!=="'"+title+"'"))return{status:400,data:{error:{}}};
    if(ranges.some(r=>Number(r.match(/(?:^|!)[A-Z]+(\d+)/)?.[1])>Math.max(3,rows.length+1)))return{status:400,data:{error:{}}};
    const table=[headers,...rows],blocks=url.searchParams.getAll('ranges').map(range=>{
      const m=range.match(/(?:^|!)([A-Z]+)(\d+):([A-Z]+)(\d+)$/);assert.ok(m,range);const col=s=>[...s].reduce((v,c)=>v*26+c.charCodeAt(0)-64,0)-1;
      return{startRow:Number(m[2])-1,startColumn:col(m[1]),rowData:table.slice(Number(m[2])-1,Number(m[4])).map(row=>({values:row.slice(col(m[1]),col(m[3])+1).map(v=>({formattedValue:String(v),effectiveValue:{[typeof v==='number'?'numberValue':'stringValue']:v}}))}))};
    });return{status:200,data:{spreadsheetId:id,sheets:[{properties:{sheetId:0,title,gridProperties:{rowCount:Math.max(3,rows.length+1),columnCount:3}},data:blocks}]}};
  }
  throw Error('Fixture URL tidak dikenal '+url.pathname);
}});
async function api(name,payload,expected=200){const r=await php.run({scriptPath:'/app/public/index.php',relativeUri:'/api/'+name,method:payload?'POST':'GET',env,headers:{origin:'http://127.0.0.1:8091','content-type':'application/json'},body:payload?Buffer.from(JSON.stringify(payload)):undefined});assert.equal(r.httpStatusCode,expected,r.text+'\n'+r.errors);return JSON.parse(r.text);}
async function inspect(url=`https://docs.google.com/spreadsheets/d/${id}/edit#gid=0`){let r,job;for(let i=0;i<30;i++){r=await api('google-sources',{action:'inspect',spreadsheet_url:url,header_row:1,...(job?{job_id:job}:{})});if(!r.pending)return r;job=r.job_id;}throw Error('Inspect belum selesai');}
let source;
async function step(){
 await db.query('UPDATE doorprize.google_sources SET next_attempt_at=now() WHERE source_id=$1',[source.id]);
 let result;
 for(let i=0;i<40;i++){
  result=await api('google-sources',{action:'sync',id:Number(source.id)});source=result.source;
  if(!result.pending)return result;
 }
 throw Error('Pekerjaan Google belum selesai');
}
async function settle(){
 const totals={inserted:0,updated:0,eliminated:0};
 for(let i=0;i<100;i++){
  const result=await step();assert.ok(!result.error,result.error);
  assert.ok((result.summary?.processed||0)<=200);
  for(const key of Object.keys(totals))totals[key]+=result.summary?.[key]||0;
  if(!result.more)return totals;
 }
 throw Error('Snapshot belum selesai');
}
async function connect(checked,current=source){
 const meta=await api('imports');return api('google-sources',{action:'connect',inspection:checked.inspection,connection_id:randomUUID(),current_id:current?Number(current.id):null,current_version:current?Number(current.version):null,field_schema:meta.field_schema,mapping:{name:2,field_1:3}});
}
const identityMap=async()=> (await db.query('SELECT row_key,participant_id FROM doorprize.google_rows WHERE source_id=$1 ORDER BY row_key',[source.id])).rows;
const updateRules=async keys=>{const rules=await api('duplicates');return api('duplicates',{action:'update',keys,version:rules.version,field_schema:rules.field_schema});};
try{
 await api('fields',{action:'create',label:'Divisi'});
 rows=[[45000.123,'alam','A'],[45000.123,'Alam','A'],['','Budi','B'],['','Budi','C'],[45000.123,'Alam','A']];
 const checked=await inspect();assert.ok(!('identity_column' in checked.metadata));
 await inspect();assert.equal((await db.query('SELECT count(*)::int AS n FROM doorprize.google_sources')).rows[0].n,0);
 source=await connect(checked);assert.equal((await api('google-sources')).items.length,1);
 assert.equal((await settle()).inserted,5,'Timestamp sama/kosong dan baris identik tetap diterima');
 let people=(await api('participants')).items;assert.equal(people.length,5);assert.equal(people.filter(p=>p.status==='available').length,5,'Tanpa switch semua entri tersedia');
 const original=await identityMap();assert.equal(new Set(original.map(r=>r.row_key)).size,5);
 await db.query("UPDATE doorprize.google_sources SET reader_protocol=1,phase='paused',error_code='configuration',error_message='Kolom identitas berisi nilai ganda. Pilih ID unik; aturan duplikasi peserta tetap terpisah.' WHERE source_id=$1",[source.id]);
 source=(await api('google-sources')).items[0];assert.equal(source.phase,'live');assert.equal(source.error_message,null);await settle();assert.deepEqual(await identityMap(),original,'Sumber lama yang gagal ID pulih tanpa menambah peserta');
 await db.query("UPDATE doorprize.google_sources SET reader_protocol=1,phase='paused',error_message=NULL WHERE source_id=$1",[source.id]);
 source=(await api('google-sources')).items[0];assert.equal(source.phase,'paused','Pause manual dipertahankan saat upgrade');
 source=await api('google-sources',{action:'resume',id:Number(source.id),version:Number(source.version)});await settle();
 await updateRules(['name','field_1']);people=(await api('participants')).items;assert.equal(people.filter(p=>p.status==='duplicate').length,2);assert.equal(people.filter(p=>p.status==='available').length,3);
 await updateRules(['name']);people=(await api('participants')).items;assert.equal(people.filter(p=>p.status==='duplicate').length,3);
 await updateRules(['name','field_1']);assert.deepEqual(await identityMap(),original,'Aturan duplikasi tidak mengubah UUID sinkronisasi');
 const eventVersion=(await db.query('SELECT version FROM doorprize.events WHERE id=1')).rows[0].version;queries.length=0;calls=[];
 const idle=await step();assert.equal(idle.state_changed,false);assert.equal(calls.length,1);assert.ok(!queries.some(q=>/doorprize\.(participants|participant_pool)\b/.test(q)));
 assert.equal((await db.query('SELECT version FROM doorprize.events WHERE id=1')).rows[0].version,eventVersion);
 version++;queries.length=0;await settle();assert.ok(!queries.some(q=>/doorprize\.(participants|participant_pool)\b/.test(q)),'Versi berubah tanpa perubahan isi tidak membaca ulang peserta');assert.deepEqual(await identityMap(),original);
 rows.reverse();version++;await settle();assert.deepEqual(await identityMap(),original,'Sortir mempertahankan seluruh UUID, termasuk salinan identik');
 const budi=(await api('participants')).items.find(p=>p.name==='Budi'&&p.field_1==='B'),meta=await api('imports');
 await api('participants',{action:'update',id:budi.id,version:budi.version,name:'Budi',field_1:'Operator',status:'available',field_schema:meta.field_schema});
 rows.find(r=>r[1]==='Budi'&&r[2]==='B')[2]='Sheets';version++;await settle();assert.equal(source.conflict_rows,1);assert.equal((await api('participants')).items.find(p=>p.id===budi.id).field_1,'Operator');
 let issue=(await api('google-sources',{action:'issues',id:Number(source.id)})).items[0];
 source=await api('google-sources',{action:'resolve',id:Number(source.id),version:Number(source.version),row_key:issue.row_key,row_version:issue.version,choice:'local'});await settle();assert.equal(source.conflict_rows,0);assert.equal((await api('participants')).items.find(p=>p.id===budi.id).field_1,'Operator');
 // Pergantian nama yang tidak pasti disimpan sebagai konflik, bukan ditimpa atau dijadikan ID baru diam-diam.
 rows.find(r=>r[1]==='Budi'&&r[2]==='C')[1]='Citra';version++;await settle();assert.equal(source.conflict_rows,1);assert.ok((await api('participants')).items.some(p=>p.name==='Budi'&&p.field_1==='C'));
 issue=(await api('google-sources',{action:'issues',id:Number(source.id)})).items[0];assert.ok(issue.issue_message.includes('dicocokkan'));
 source=await api('google-sources',{action:'resolve',id:Number(source.id),version:Number(source.version),row_key:issue.row_key,row_version:issue.version,choice:'remote'});await settle();assert.ok((await api('participants')).items.some(p=>p.name==='Citra'));
 let draw=await api('draws');draw=await api('draws',{action:'start',version:draw.version,request_id:randomUUID(),winner_count:1,prize_mode:'none',allocation:[],filters:{name:{mode:'include',values:['Alam']}}});
 draw=await api('draws',{action:'stop',draw_id:draw.draw.id});draw=await api('draws',{action:'confirm',draw_id:draw.draw.id});const winner=draw.draw.entries[0].participant_id;await api('draws',{action:'clear',draw_id:draw.draw.id});
 rows=rows.filter(r=>r[1].toLowerCase()!=='alam');version++;await settle();people=(await api('participants')).items;assert.equal(people.find(p=>p.id===winner).status,'winner');assert.ok(people.filter(p=>p.name.toLowerCase()==='alam'&&p.id!==winner).every(p=>p.status==='eliminated'));
 const before=people;deny=true;version++;assert.ok((await step()).error);assert.deepEqual((await api('participants')).items,before);deny=false;
 const again=await inspect();const same=await connect(again);assert.equal(same.id,source.id);source=same;await settle();assert.equal((await api('participants')).items.length,5);
 headers=['Keterangan','Nama lengkap','Divisi'];
 const other=await inspect(`https://docs.google.com/spreadsheets/d/${id}Other/edit#gid=0`);source=await connect(other);
 deny=true;assert.ok((await step()).error);assert.equal((await api('draws')).sync_pending,false);deny=false;
 rows=Array.from({length:1000},(_,i)=>[i%2?'':45000,'Peserta '+(i%20),'Unit '+(i%3)]);version++;
 const started=performance.now();assert.equal((await settle()).inserted,1000);const elapsed=Math.round(performance.now()-started);
 const large=await identityMap();assert.equal(large.length,1000);assert.equal(new Set(large.map(r=>r.row_key)).size,1000);
 const counts=(await db.query('SELECT p.status,count(*)::int AS n FROM doorprize.participants p WHERE source_id=$1 GROUP BY status',[source.id])).rows;
 assert.equal(counts.find(c=>c.status==='duplicate').n,940);assert.equal(counts.find(c=>c.status==='available').n,60);
 version++;queries.length=0;await settle();assert.ok(!queries.some(q=>/doorprize\.(participants|participant_pool)\b/.test(q)));assert.deepEqual(await identityMap(),large);
 rows.reverse();version++;await settle();assert.deepEqual(await identityMap(),large);
 const sample=large[0];rows=rows.filter(r=>r[1]!=='Peserta 0');version++;bumpFinal=true;await settle();
 assert.equal((await db.query('SELECT count(*)::int AS n FROM doorprize.google_rows WHERE source_id=$1 AND deleted',[source.id])).rows[0].n,0,'Versi berubah sebelum final tidak menghapus baris');
 await settle();assert.equal((await db.query('SELECT count(*)::int AS n FROM doorprize.google_rows WHERE source_id=$1 AND deleted',[source.id])).rows[0].n,50,'Penghapusan lintas halaman pada snapshot stabil');
 assert.equal((await db.query('SELECT participant_id FROM doorprize.google_rows WHERE source_id=$1 AND row_key=$2',[source.id,sample.row_key])).rows[0].participant_id,sample.participant_id);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM doorprize.google_reader_snapshot_rows')).rows[0].n,0,'Penampungan dibersihkan setelah selesai');
 console.log(`Google Reader otomatis: tanpa ID wajib, Timestamp kosong/ganda, semua salinan diterima, switch duplikasi satu/gabungan, UUID tetap saat ulang/sortir, edit operator/konflik/resolve, nama ambigu, pemenang/hapus/izin, satu koneksi, 1000 entri (${elapsed} ms seluruh pipeline fixture), versi tetap/perubahan kosong tanpa baca peserta dan cleanup lulus.`);
}finally{detach();php.exit();await db.close();}
