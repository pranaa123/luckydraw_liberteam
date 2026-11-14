// Persiapan lokal saja. Kredensial dibaca dari stdin dan tidak pernah dicetak/disimpan ke berkas.
import { createPHP } from './php-runtime.mjs';
import { openLocalDatabase,connectPortableDatabase } from './local-database.mjs';

const chunks = [];
let size = 0;
for await (const bytes of process.stdin) {
  size += bytes.length;
  if (size>4096) throw Error('Data akun terlalu besar.');
  chunks.push(bytes);
}
const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
if (typeof input.email !== 'string' || typeof input.password !== 'string') throw Error('Isi email dan password melalui JSON stdin.');
const database = await openLocalDatabase(process.env.DOORPRIZE_DEV_DATABASE_PATH || undefined);
const php = await createPHP();
const disconnect = connectPortableDatabase(php,database);
try {
  const encoded = Buffer.from(JSON.stringify(input)).toString('base64');
  const response = await php.run({ code: `<?php $config=require '/app/bootstrap/app.php'; if ($config['database']['dsn']!=='') throw new RuntimeException('Alat ini hanya untuk database portabel lokal.'); (new App\\Modules\\Auth\\AuthService($config))->provision(json_decode(base64_decode('${encoded}'),true,32,JSON_THROW_ON_ERROR)); echo 'Akun pemilik lokal siap.';` });
  if (response.exitCode !== 0 || response.errors || !response.text.includes('Akun pemilik lokal siap.')) throw Error('Akun belum dibuat. Periksa konfigurasi atau akun yang sudah ada.');
  console.log(response.text);
} finally { disconnect(); php.exit(); await database.close(); }
