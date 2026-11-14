import assert from 'node:assert/strict';
import { createPHP } from './php-runtime.mjs';
import { openLocalDatabase } from './local-database.mjs';

const php = await createPHP();
try {
  const response = await php.run({ code: `<?php
    require '/app/bootstrap/app.php';
    putenv('APP_ENV=preview'); putenv('APP_URL=https://luckydraw-liberteam.vercel.app');
    putenv('VERCEL_URL=fixture-preview.vercel.app');
    $cases = [
      ['luckydraw-liberteam.vercel.app','https://luckydraw-liberteam.vercel.app',true],
      ['fixture-preview.vercel.app','https://fixture-preview.vercel.app',true],
      ['luckydraw-liberteam.vercel.app','http://luckydraw-liberteam.vercel.app',false],
      ['attacker.example','https://attacker.example',false],
      ['attacker.example','https://luckydraw-liberteam.vercel.app',false],
      ['luckydraw-liberteam.vercel.app','https://attacker.example',false],
      ['luckydraw-liberteam.vercel.app','',false],
    ];
    foreach ($cases as [$host,$origin,$expected]) {
      $_SERVER=['HTTP_HOST'=>$host,'HTTP_ORIGIN'=>$origin,'HTTP_X_FORWARDED_PROTO'=>'https','HTTP_X_FORWARDED_HOST'=>'attacker.example'];
      try { App\\Core\\RequestOrigin::assertSameOrigin(); $valid=true; } catch (App\\Core\\ApiError $e) { $valid=false; }
      if ($valid!==$expected) throw new Exception('Origin gagal: '.$host.' '.$origin);
    }
    putenv('BACKGROUND_DRIVER=supabase'); putenv('SUPABASE_URL=https://mjqkrtrjrctdqnbzbbwb.supabase.co');
    App\\Modules\\Presentation\\BackgroundAsset::validate('/assets/backgrounds/'.str_repeat('a',32).'.png');
    foreach (['/assets/backgrounds/../../.env','https://attacker.example/x.png'] as $path) {
      try { App\\Modules\\Presentation\\BackgroundAsset::validate($path); throw new Exception('Path diterima'); } catch (App\\Core\\ApiError $e) {}
    }
    try { App\\Modules\\Presentation\\BackgroundAsset::image('<svg></svg>'); throw new Exception('SVG diterima'); } catch (App\\Core\\ApiError $e) {}
    echo 'ok';` });
  assert.equal(response.text,'ok',response.errors);
} finally { php.exit(); }

const database = await openLocalDatabase('memory://');
try {
  await database.exec("INSERT INTO doorprize_auth.users(id,email,password_hash) VALUES('00000000-0000-4000-8000-000000000001','owner@example.test','fixture'); INSERT INTO doorprize.events(owner_id) VALUES('00000000-0000-4000-8000-000000000001'); SET ROLE doorprize_server;");
  assert.equal((await database.query('SELECT count(*)::int AS count FROM doorprize_auth.users')).rows[0].count,1);
  assert.equal((await database.query('SELECT count(*)::int AS count FROM doorprize.events')).rows[0].count,0,'Koneksi auth tidak mempunyai claim data acara');
  await assert.rejects(database.exec("UPDATE doorprize_auth.users SET password_hash='changed'"),error=>error.code==='42501');
  await database.exec("BEGIN; SET LOCAL ROLE doorprize_app; SET LOCAL doorprize.owner_id='00000000-0000-4000-8000-000000000001';");
  assert.equal((await database.query('SELECT count(*)::int AS count FROM doorprize.events')).rows[0].count,1);
  await assert.rejects(database.query('SELECT * FROM doorprize_auth.users'),error=>error.code==='42501');
  await database.exec('ROLLBACK; RESET ROLE;');
  console.log('Cloud: HTTPS di balik proxy, penolakan origin/host palsu, path gambar, role server terbatas dan pemisahan role auth/data lulus.');
} finally { await database.close(); }
