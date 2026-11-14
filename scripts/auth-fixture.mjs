// Akun fiktif hanya pada database QA. Autentikasi tetap melewati endpoint login sebenarnya.
import assert from 'node:assert/strict';
import { createHash,createHmac } from 'node:crypto';
import { connectPortableDatabase } from './local-database.mjs';

export const fixtureCredentials = { email:'owner@example.test',password:'test-owner-pass' };
export const fixtureOwner = '00000000-0000-4000-8000-000000000001';
export async function connectAuthenticatedDatabase(php,database,options) {
  const detach = connectPortableDatabase(php,database,options);
  if (!(await database.query('SELECT id FROM doorprize_auth.users LIMIT 1')).rows.length) {
    const value = Buffer.from(JSON.stringify(fixtureCredentials)).toString('base64');
    const provision = await php.run({ code:`<?php $config=require '/app/bootstrap/app.php'; (new App\\Modules\\Auth\\AuthService($config))->provision(json_decode(base64_decode('${value}'),true)); echo 'ok';` });
    assert.equal(provision.text,'ok',provision.errors);
  }
  const raw = php.run.bind(php);
  const response = await raw({ scriptPath:'/app/public/index.php',relativeUri:'/api/login',method:'POST',
    headers:{host:'127.0.0.1:8091',origin:'http://127.0.0.1:8091','content-type':'application/json'},body:Buffer.from(JSON.stringify(fixtureCredentials)) });
  assert.equal(response.httpStatusCode,200,response.text+'\n'+response.errors);
  const cookie = [].concat(response.headers['set-cookie']).find(value=>value?.startsWith('doorprize_baru_session='))?.split(';')[0];
  assert.ok(cookie,'Cookie sesi dari login');
  const token = cookie.split('=')[1];
  const row = (await database.query('SELECT id FROM doorprize_auth.sessions WHERE token_hash=$1',[createHash('sha256').update(token).digest('hex')])).rows[0];
  const headers = {host:'127.0.0.1:8091',cookie,'x-doorprize-session':row.id,'x-csrf-token':createHmac('sha256',token).update('doorprize-baru-csrf').digest('hex')};
  php.run = args => raw(args.scriptPath === '/app/public/index.php' ? {...args,headers:{...headers,...args.headers}} : args);
  return detach;
}
