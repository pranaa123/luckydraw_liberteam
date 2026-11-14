import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createPHP} from './php-runtime.mjs';
import {openLocalDatabase} from './local-database.mjs';
import {connectAuthenticatedDatabase} from './auth-fixture.mjs';

const db=await openLocalDatabase('memory://'),php=await createPHP(),queries=[];
const query=db.query.bind(db);db.query=(...args)=>{queries.push(args[0]);return query(...args);};
const id='1DoorprizeDirectReaderFixture1234567890';
let version=1,title='Respons',deny=false,bumpFinal=false,calls=[],rows=[[45000.123,'Alam','Divisi A'],[45000.124,'Budi','Divisi B']];
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
    const table=[['Timestamp','Nama lengkap','Divisi'],...rows],blocks=url.searchParams.getAll('ranges').map(range=>{
      const m=range.match(/(?:^|!)([A-Z]+)(\d+):([A-Z]+)(\d+)$/);assert.ok(m,range);const col=s=>[...s].reduce((v,c)=>v*26+c.charCodeAt(0)-64,0)-1;
      return{startRow:Number(m[2])-1,startColumn:col(m[1]),rowData:table.slice(Number(m[2])-1,Number(m[4])).map(row=>({values:row.slice(col(m[1]),col(m[3])+1).map(v=>({formattedValue:String(v),effectiveValue:{[typeof v==='number'?'numberValue':'stringValue']:v}}))}))};
    });return{status:200,data:{spreadsheetId:id,sheets:[{properties:{sheetId:0,title,gridProperties:{rowCount:Math.max(3,rows.length+1),columnCount:3}},data:blocks}]}};
  }
  const values=[['Timestamp','Nama lengkap','Divisi'],...rows];
  function range(value){const m=value.match(/!([A-Z]+)(\d+):([A-Z]+)(\d+)$/);assert.ok(m,value);const col=s=>[...s].reduce((v,c)=>v*26+c.charCodeAt(0)-64,0)-1;return values.slice(Number(m[2])-1,Number(m[4])).map(row=>row.slice(col(m[1]),col(m[3])+1));}
  if(url.pathname.endsWith('/values:batchGet'))return{status:200,data:{valueRanges:url.searchParams.getAll('ranges').map(r=>({values:range(r)}))}};
  if(url.pathname.includes('/values/'))return{status:200,data:{values:range(decodeURIComponent(url.pathname.split('/values/')[1]))}};
  throw Error('Fixture URL tidak dikenal '+url.pathname);
}});
async function api(name,payload,expected=200){const r=await php.run({scriptPath:'/app/public/index.php',relativeUri:'/api/'+name,method:payload?'POST':'GET',env,headers:{origin:'http://127.0.0.1:8091','content-type':'application/json'},body:payload?Buffer.from(JSON.stringify(payload)):undefined});assert.equal(r.httpStatusCode,expected,r.text+'\n'+r.errors);return JSON.parse(r.text);}
async function inspect(url=`https://docs.google.com/spreadsheets/d/${id}/edit#gid=0`){let r,job;for(let i=0;i<30;i++){r=await api('google-sources',{action:'inspect',spreadsheet_url:url,header_row:1,...(job?{job_id:job}:{})});if(!r.pending)return r;job=r.job_id;}throw Error('Inspect belum selesai');}
let source;
async function sync(){await db.query('UPDATE doorprize.google_sources SET next_attempt_at=now() WHERE source_id=$1',[source.id]);let r;for(let i=0;i<30;i++){r=await api('google-sources',{action:'sync',id:Number(source.id)});source=r.source;if(!r.pending)return r;}throw Error('Sync belum selesai');}
async function connect(inspection,current=source){const schema=(await api('imports')).field_schema;return api('google-sources',{action:'connect',inspection:inspection.inspection,connection_id:randomUUID(),current_id:current?Number(current.id):null,current_version:current?Number(current.version):null,field_schema:schema,mapping:{name:2,field_1:3},identity_column:1});}
try{
 await api('fields',{action:'create',label:'Divisi'});
 const first=await inspect();assert.equal(first.metadata.identity_column,1);assert.equal(first.metadata.headers.length,3);
 await inspect();assert.equal((await db.query('SELECT count(*)::int AS n FROM doorprize.google_sources')).rows[0].n,0,'Periksa/batal tidak membuat koneksi');
 assert.ok(!(await api('google-sources')).items.length);
 source=await connect(first);assert.equal(source.connection_mode,'reader');assert.equal((await api('google-sources')).items.length,1);
 const initial=await sync();assert.equal(initial.summary.inserted,2);assert.equal(source.phase,'live');
 assert.ok(calls.filter(s=>s.includes('generateAccessToken')).length===1,'Token dibaca dari cache terenkripsi setelah diperoleh');
 const eventVersion=(await db.query('SELECT version FROM doorprize.events WHERE id=1')).rows[0].version;calls=[];queries.length=0;const idle=await sync();assert.equal(idle.state_changed,false);assert.equal((await db.query('SELECT version FROM doorprize.events WHERE id=1')).rows[0].version,eventVersion,'Idle tidak menginvalidasi state operator');assert.equal(idle.changed,false);assert.equal(calls.length,1,'Idle hanya membaca versi file');assert.ok(!queries.some(s=>/doorprize\.(participants|participant_pool)\b/.test(s)),'Idle tidak membaca peserta/pool');
 let people=(await api('participants')).items;const budi=people.find(p=>p.name==='Budi');const schema=(await api('imports')).field_schema;
 await api('participants',{action:'update',id:budi.id,version:budi.version,name:'Budi',field_1:'Edit operator',status:'available',field_schema:schema});
 rows[1][2]='Dari Google';version++;await sync();assert.equal(source.conflict_rows,1);assert.equal((await api('participants')).items.find(p=>p.id===budi.id).field_1,'Edit operator');
 rows=rows.slice(1);version++;await sync();assert.equal((await api('participants')).items.find(p=>p.name==='Alam').status,'eliminated');
 const before=await api('participants');deny=true;version++;const failure=await sync();assert.ok(failure.error);assert.equal((await api('participants')).items.length,before.items.length);
 await api('google-sources',{action:'inspect',spreadsheet_url:`https://docs.google.com/spreadsheets/d/${id}/edit`,header_row:1});deny=false;
 const recheck=await inspect();const same=await connect(recheck);assert.equal(same.id,source.id,'Sheet yang sama memakai sumber sama');source=same;
 await sync();assert.equal((await api('participants')).items.length,2,'Petakan ulang tidak memasukkan peserta ulang');
 const current=source,another=await inspect(`https://docs.google.com/spreadsheets/d/${id}Other/edit#gid=0`);source=await connect(another);
 deny=true;const initialFailure=await sync();assert.equal(initialFailure.state_changed,true);assert.equal((await api('draws')).sync_pending,false,'Google gagal: undian boleh memakai data tersimpan');deny=false;
 assert.notEqual(source.id,current.id);assert.equal((await api('google-sources')).items.length,1);assert.equal((await api('participants')).items.length,2,'Ganti sumber mempertahankan peserta');
 await api('google-sources',{action:'resume',id:Number(current.id),version:Number(current.version)+1},409);
 rows=Array.from({length:450},(_,i)=>[46000+i/10000,'Peserta '+i,'Unit']);version++;let page;let pages=0;do{page=await sync();assert.ok(page.summary.processed<=200);pages++;}while(page.more);assert.equal(pages,3);
 const firstId=(await api('participants')).items.find(p=>p.name==='Peserta 0').id;rows.shift();version++;bumpFinal=true;do{page=await sync();}while(page.more);assert.equal((await db.query('SELECT status FROM doorprize.participants WHERE id=$1',[firstId])).rows[0].status,'available','Versi berubah: jangan eliminasi berdasarkan snapshot belum stabil');
 do{page=await sync();}while(page.more);assert.equal((await db.query('SELECT status FROM doorprize.participants WHERE id=$1',[firstId])).rows[0].status,'eliminated','Snapshot stabil baru menerapkan penghapusan');
 const savedRows=rows.map(row=>[...row]);version++;await sync();rows=rows.slice(0,3);title='Respons baru';version++;const shrink=await sync();assert.ok(!shrink.error,shrink.error);assert.equal(source.sheet_name,title,'Rename tab ditangani lewat ID tetap');assert.equal(source.phase,'live');
 rows=savedRows;version++;do{page=await sync();}while(page.more);
 rows[201][0]=rows[0][0];version++;await sync();const duplicate=await sync();assert.ok(duplicate.error);assert.equal(source.phase,'paused','ID ganda lintas halaman dijeda');
 const token=JSON.stringify(await api('google-sources'));assert.ok(!token.includes('fixture-readonly')&&!token.includes('encrypted_secret'));
 console.log('Google Reader: periksa/batal tanpa record, satu koneksi, link/pemetaan/ID otomatis, token terenkripsi, idle versi saja, konflik, hapus aman, izin gagal, pemetaan ulang tanpa duplikasi, ganti sumber atomik, sumber lama ditolak dan tanpa bocor token lulus.');
}finally{detach();php.exit();await db.close();}
