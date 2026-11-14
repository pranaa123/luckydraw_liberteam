import { openLocalDatabase } from './local-database.mjs';
import { connectAuthenticatedDatabase } from './auth-fixture.mjs';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { PGlite } from '@electric-sql/pglite';
import { createPHP, projectRoot } from './php-runtime.mjs';

const javascript = ['public/assets/workers/excel-worker.js', 'public/assets/operator.js', 'public/assets/presentation.js', ...(await readdir(resolve(projectRoot, 'public/assets/modules'))).filter(file => file.endsWith('.js')).map(file => `public/assets/modules/${file}`)];
for (const file of javascript) {
  const result = spawnSync(process.execPath, ['--check', resolve(projectRoot, file)], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${file}: ${result.stderr}`);
}
console.log(`JavaScript: ${javascript.length} berkas valid.`);

async function phpFiles(directory) {
  const entries = await readdir(resolve(projectRoot, directory), { withFileTypes: true });
  const groups = await Promise.all(entries.map((entry) => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? phpFiles(path) : Promise.resolve(entry.name.endsWith('.php') ? [path] : []);
  }));
  return groups.flat();
}

const php = await createPHP();
const authDatabase = await openLocalDatabase('memory://');
const detach = await connectAuthenticatedDatabase(php,authDatabase);
try {
  const files = (await Promise.all(['app', 'bootstrap', 'config', 'routes', 'resources/views', 'public', 'scripts'].map(phpFiles))).flat();
  const paths = JSON.stringify(files.map((file) => `/app/${file}`));
  const syntax = await php.run({ code: `<?php foreach (json_decode('${paths}', true) as $file) { token_get_all(file_get_contents($file), TOKEN_PARSE); } echo 'ok';` });
  assert.equal(syntax.text, 'ok', syntax.errors);

  const request = (relativeUri, method = 'GET', env = {}) => php.run({ scriptPath: '/app/public/index.php', relativeUri, method, env });
  const operator = await request('/');
  assert.equal(operator.httpStatusCode, 200);
  assert.match(operator.text, /id="panel-participants"/);
  assert.match(operator.text, /src="\/output\?preview=1"/);
  assert.doesNotMatch(operator.text, /Fatal error|Warning:/);
  assert.ok(operator.headers['content-security-policy']);
  const output = await request('/output');
  assert.equal(output.httpStatusCode, 200);
  assert.match(output.text, /Bersiap untuk/);
  assert.match(output.text, /id="fullscreen"/);
  const preview = await request('/output?preview=1');
  assert.doesNotMatch(preview.text, /id="fullscreen"/);
  assert.equal((await request('/tidak-ada')).httpStatusCode, 404);
  assert.equal((await request('/.env')).httpStatusCode, 404);
  assert.equal((await request('/', 'POST')).httpStatusCode, 405);
  assert.equal((await request('/', 'HEAD')).text, '');
  const health = await request('/api/health');
  assert.deepEqual(JSON.parse(health.text), { status: 'ok', stage: 'foundation' });
  assert.equal((await request('/', 'GET', { APP_ENV: 'production' })).httpStatusCode, 503);
  console.log(`PHP 8.3: ${files.length} berkas valid; operator, output, preview, route, dan batas lokal lulus.`);
} finally {
  detach(); php.exit(); await authDatabase.close();
}

// PostgreSQL sementara dalam memori: tidak terhubung ke database aplikasi mana pun.
const database = new PGlite();
try {
  await database.exec(await readFile(resolve(projectRoot, 'database/schema.sql'), 'utf8'));
  await database.exec(`
    INSERT INTO doorprize.events (owner_id) VALUES
      ('00000000-0000-4000-8000-000000000001'),
      ('00000000-0000-4000-8000-000000000002');
    INSERT INTO doorprize.participants (event_id, name) VALUES (1, 'Alam'), (2, 'Budi');
    INSERT INTO doorprize.prizes (event_id, name, initial_quantity, remaining_quantity) VALUES (1, 'Tas', 2, 2);
    INSERT INTO doorprize.draws (event_id, sequence_number, prize_mode, requested_count, idempotency_key)
      VALUES (1, 1, 'selected', 1, '00000000-0000-4000-8000-000000000011');
    INSERT INTO doorprize.draw_entries (event_id, draw_id, participant_id, prize_id, position, participant_snapshot)
      VALUES (1, 1, 1, 1, 1, '{"name":"Alam"}');
  `);
  await assert.rejects(() => database.exec("INSERT INTO doorprize.event_fields (event_id, slot, label) VALUES (1, 4, 'Isian keempat')"));
  await assert.rejects(() => database.exec('UPDATE doorprize.prizes SET remaining_quantity = -1 WHERE id = 1'));
  await assert.rejects(() => database.exec("INSERT INTO doorprize.draw_entries (event_id, draw_id, participant_id, position, participant_snapshot) VALUES (1, 1, 2, 2, '{}')"));
  await assert.rejects(() => database.exec("INSERT INTO doorprize.draw_entries (event_id, draw_id, participant_id, position, participant_snapshot) VALUES (1, 1, 1, 2, '{}')"));
  await assert.rejects(() => database.exec("INSERT INTO doorprize.draws (event_id, sequence_number, prize_mode, requested_count, idempotency_key) VALUES (1, 2, 'none', 1, '00000000-0000-4000-8000-000000000012')"));
  await database.exec('CREATE ROLE foundation_reader; GRANT USAGE ON SCHEMA doorprize TO foundation_reader; GRANT SELECT ON ALL TABLES IN SCHEMA doorprize TO foundation_reader; SET ROLE foundation_reader');
  assert.equal((await database.query('SELECT id FROM doorprize.participants')).rows.length, 0);
  await database.exec('RESET ROLE');
  console.log('PostgreSQL: skema valid; batas isian, stok, relasi acara, hasil ganda, dan RLS lulus.');
} finally {
  await database.close();
}
