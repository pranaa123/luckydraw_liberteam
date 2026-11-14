import assert from 'node:assert/strict';
import { createHash,createHmac } from 'node:crypto';
import { createPHP } from './php-runtime.mjs';
import { openLocalDatabase,connectPortableDatabase } from './local-database.mjs';
import { fixtureCredentials,fixtureOwner } from './auth-fixture.mjs';

const database = await openLocalDatabase('memory://');
let php = await createPHP(), detach = connectPortableDatabase(php,database);
const query = (sql,params=[])=>database.query(sql,params);
const headers = {host:'127.0.0.1:8091',origin:'http://127.0.0.1:8091','content-type':'application/json'};
async function request(path,payload,session={},extra={}) {
  const response = await php.run({scriptPath:'/app/public/index.php',relativeUri:path,method:payload?'POST':'GET',headers:{...headers,...session,...extra},body:payload?Buffer.from(JSON.stringify(payload)):undefined});
  assert.doesNotMatch(response.text,/Fatal error|Warning:/,response.errors);
  return response;
}
async function login(credentials=fixtureCredentials,old={}) {
  const response = await request('/api/login',credentials,old);
  assert.equal(response.httpStatusCode,200,response.text+'\n'+response.errors);
  const value = [].concat(response.headers['set-cookie'])[0];
  assert.match(value,/HttpOnly/i); assert.match(value,/SameSite=Lax/i); assert.match(value,/expires=/i);
  assert.doesNotMatch(value,/Secure/i,'HTTP loopback masih dapat menggunakan cookie');
  const cookie = value.split(';')[0],token=cookie.split('=')[1];
  const row = (await query('SELECT id,token_hash,expires_at FROM doorprize_auth.sessions WHERE token_hash=$1',[createHash('sha256').update(token).digest('hex')])).rows[0];
  assert.ok(row); assert.notEqual(row.token_hash,token);
  assert.ok(new Date(row.expires_at)-Date.now()>29*86400000);
  return {cookie,'x-doorprize-session':row.id,'x-csrf-token':createHmac('sha256',token).update('doorprize-baru-csrf').digest('hex')};
}
try {
  // Data yang dibuat sebelum login tetap menjadi acara pemilik awal.
  await query('INSERT INTO doorprize.events(owner_id,event_name) VALUES ($1,$2)',[fixtureOwner,'Acara yang sudah ada']);
  await query("INSERT INTO doorprize.participants(event_id,name) VALUES(1,'Peserta yang dipertahankan')");
  const encoded = Buffer.from(JSON.stringify(fixtureCredentials)).toString('base64');
  const result = await php.run({code:`<?php $config=require '/app/bootstrap/app.php'; (new App\\Modules\\Auth\\AuthService($config))->provision(json_decode(base64_decode('${encoded}'),true)); echo 'ok';`});
  assert.equal(result.text,'ok',result.errors);
  const user = (await query('SELECT email,password_hash FROM doorprize_auth.users')).rows[0];
  assert.equal(user.email,fixtureCredentials.email); assert.notEqual(user.password_hash,fixtureCredentials.password);
  for(const path of ['/','/output','/output?preview=1']) {
    const response=await request(path); assert.equal(response.httpStatusCode,303); assert.deepEqual([].concat(response.headers.location),['/login']);
  }
  assert.equal((await request('/login')).httpStatusCode,200);
  const secureCookie=await php.run({code:"<?php require '/app/bootstrap/app.php'; $_SERVER['HTTPS']='on'; App\\Modules\\Auth\\AuthSession::cookie(str_repeat('a',64),time()+3600);"});
  assert.match([].concat(secureCookie.headers['set-cookie']).join(';'),/Secure/i);
  for(const path of ['participants','prizes','fields','settings','draws','history','winners','imports','duplicates','google-sources','participant-filters']) assert.equal((await request('/api/'+path)).httpStatusCode,401,path);
  assert.equal((await request('/api/backgrounds',{action:'unused'})).httpStatusCode,401);
  assert.equal((await request('/api/login',fixtureCredentials,{}, {origin:'https://situs-lain.example'})).httpStatusCode,403);
  assert.equal((await request('/api/login',{...fixtureCredentials,password:'salah'})).httpStatusCode,401);
  assert.equal((await request('/api/login',{email:'unknown@example.test',password:'salah'})).httpStatusCode,401);
  let owner = await login({...fixtureCredentials,email:' OWNER@EXAMPLE.TEST '});
  assert.equal((await request('/api/session',null,owner)).httpStatusCode,200);
  const page = await request('/',null,owner); assert.equal(page.httpStatusCode,200); assert.match(page.text,/auth-logout/);
  assert.doesNotMatch(page.text,/test-owner-pass|password_hash|token_hash/);
  assert.equal(JSON.parse((await request('/api/participants',null,owner)).text).items[0].name,'Peserta yang dipertahankan');
  assert.equal((await request('/api/participants',null,{cookie:owner.cookie})).httpStatusCode,401,'HTML lama tidak boleh mengambil sesi akun baru');
  assert.equal((await request('/api/prizes',{action:'create',name:'Tidak sah',quantity:1},{...owner,'x-csrf-token':'salah'})).httpStatusCode,403);
  // Cookie persisten bertahan ketika runtime PHP diganti; tidak bergantung file sesi.
  detach(); php.exit(); php=await createPHP(); detach=connectPortableDatabase(php,database);
  assert.equal((await request('/api/session',null,owner)).httpStatusCode,200);
  const rotated = await login(fixtureCredentials,owner);
  assert.notEqual(rotated.cookie,owner.cookie);
  assert.equal((await request('/api/session',null,owner)).httpStatusCode,401);
  owner=rotated;
  const secondId='00000000-0000-4000-8000-000000000002';
  await query('INSERT INTO doorprize_auth.users(id,email,password_hash) VALUES($1,$2,$3)',[secondId,'second@example.test',user.password_hash]);
  const second = await login({...fixtureCredentials,email:'second@example.test'});
  const foreign = JSON.parse((await request('/api/prizes',{action:'create',name:'Hadiah acara lain',quantity:1},second)).text);
  assert.equal((await request('/api/prizes',{action:'delete',id:foreign.id,version:foreign.version},owner)).httpStatusCode,404);
  assert.equal(JSON.parse((await request('/api/participants',null,second)).text).items.length,0);
  assert.equal(JSON.parse((await request('/api/prizes',null,owner)).text).items.length,0);
  // RLS langsung, termasuk staging import, tanpa filter event dari repository.
  await database.exec('BEGIN; SET LOCAL ROLE doorprize_app;');
  await query("SELECT set_config('doorprize.owner_id',$1,true)",[fixtureOwner]);
  assert.equal((await query('SELECT id FROM doorprize.events')).rows.length,1);
  assert.equal((await query('SELECT id FROM doorprize.prizes')).rows.length,0);
  await assert.rejects(query('INSERT INTO doorprize.participants(event_id,name) VALUES(2,$1)',['Lintas pemilik']),error=>error.code==='42501');
  await database.exec('ROLLBACK');
  await database.exec('BEGIN; SET LOCAL ROLE doorprize_app;');
  await assert.rejects(query('SELECT email FROM doorprize_auth.users'),error=>error.code==='42501');
  await database.exec('ROLLBACK');
  assert.equal((await request('/api/logout',{},owner,{origin:'https://situs-lain.example'})).httpStatusCode,403);
  assert.equal((await request('/api/logout',{},owner)).httpStatusCode,200);
  assert.equal((await request('/api/session',null,owner)).httpStatusCode,401);
  assert.equal((await request('/api/session',null,second)).httpStatusCode,200,'Logout tidak mencabut sesi akun lain');
  await query('UPDATE doorprize_auth.sessions SET expires_at=now()-interval \'1 second\' WHERE id=$1',[second['x-doorprize-session']]);
  assert.equal((await request('/api/session',null,second)).httpStatusCode,401);
  await query('DELETE FROM doorprize_auth.login_attempts');
  for(let index=0;index<10;index++) assert.equal((await request('/api/login',{...fixtureCredentials,password:'salah'})).httpStatusCode,401);
  assert.equal((await request('/api/login',fixtureCredentials)).httpStatusCode,429);
  console.log('Auth: hash password/token, email, sesi 30 hari, restart, rotasi/logout/kedaluwarsa, CSRF/origin, perlindungan route, isolasi akun/RLS dan pembatasan percobaan lulus.');
} finally { detach(); php.exit(); await database.close(); }
