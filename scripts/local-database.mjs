// Development only. SQL stays in PHP; this adapter connects portable PHP to PostgreSQL.
import { PGlite } from '@electric-sql/pglite';
import { mkdir, open, readFile, readdir, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { projectRoot } from './php-runtime.mjs';
import { createGoogleHttpBridge } from './google-http-bridge.mjs';

export async function openLocalDatabase(path = resolve(projectRoot, 'storage/database')) {
  if (path !== 'memory://') await mkdir(path, { recursive: true });
  const release = path === 'memory://' ? async () => {} : await lockDatabase(path);
  let database;
  try {
    database = new PGlite(path);
    await database.waitReady;
    const { rows } = await database.query("SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'doorprize') AS installed");
    if (!rows[0].installed) await database.exec(await readFile(resolve(projectRoot, 'database/schema.sql'), 'utf8'));
    await database.exec(await readFile(resolve(projectRoot, 'database/migrations/001_field_version.sql'), 'utf8'));
    await database.exec(await readFile(resolve(projectRoot, 'database/migrations/002_settings_version.sql'), 'utf8'));
    await database.exec(await readFile(resolve(projectRoot, 'database/migrations/003_draw_engine.sql'), 'utf8'));
    await database.exec(await readFile(resolve(projectRoot, 'database/migrations/004_participant_filters.sql'), 'utf8'));
    await database.exec(await readFile(resolve(projectRoot, 'database/migrations/005_excel_import_duplicates.sql'), 'utf8'));
    for (const migration of (await readdir(resolve(projectRoot, 'supabase/migrations'))).filter(name => name.endsWith('.sql')).sort()) {
      await database.exec(await readFile(resolve(projectRoot, 'supabase/migrations', migration), 'utf8'));
    }
    const close = database.close.bind(database);
    let closing;
    database.close = () => closing ||= (async () => { try { await close(); } finally { await release(); } })();
    return database;
  } catch (error) {
    try { await database?.close(); } finally { await release(); }
    throw error;
  }
}

async function lockDatabase(path) {
  const file = resolve(path, '.doorprize-runtime.lock');
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await open(file, 'wx');
      await handle.writeFile(String(process.pid));
      await handle.close();
      return async () => { await unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error; }); };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const pid = Number(await readFile(file, 'utf8'));
      // Treat an incomplete lock as active: another process may still be writing it.
      if (!Number.isInteger(pid) || pid <= 0) throw new Error('Database lokal sedang dibuka oleh proses lain.');
      try { process.kill(pid, 0); }
      catch (probe) {
        if (probe.code === 'ESRCH') { await unlink(file); continue; }
        throw probe;
      }
      throw new Error('Database lokal sedang digunakan. Hentikan server sebelumnya atau gunakan database QA terpisah.');
    }
  }
  throw new Error('Database lokal belum dapat dikunci.');
}

export function connectPortableDatabase(php, database, options = {}) {
  const google = createGoogleHttpBridge(options.google);
  return php.onMessage(async (message) => {
    const request = JSON.parse(message);
    if (request.type === 'google_http') return JSON.stringify(google(request));
    if (request.type !== 'database') throw new Error('Pesan runtime tidak dikenal.');
    try {
      let index = 0;
      // Application queries use positional placeholders, never question marks in SQL literals.
      const sql = request.sql.replace(/\?/g, () => `$${++index}`);
      if (index !== request.parameters.length) throw new Error('Jumlah parameter SQL tidak sesuai.');
      const result = await database.query(sql, request.parameters);
      return JSON.stringify({ rows: result.rows });
    } catch (error) {
      return JSON.stringify({ error: error.message });
    }
  });
}
