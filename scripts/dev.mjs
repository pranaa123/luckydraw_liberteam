import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { createPHP, projectRoot } from './php-runtime.mjs';
import { connectPortableDatabase, openLocalDatabase } from './local-database.mjs';

const host = '127.0.0.1';
const port = Number(process.env.PORT || 8091);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT harus antara 1024–65535.');

const nativePHP = spawnSync('php', ['-v'], { stdio: 'ignore' });
const localEnvironment = await readFile(resolve(projectRoot, '.env'), 'utf8').catch(() => '');
const nativeDatabaseConfigured = Boolean(process.env.DB_DSN || /^DB_DSN\s*=\s*["']?pgsql:/m.test(localEnvironment));
if (nativeDatabaseConfigured && nativePHP.status !== 0) throw new Error('DB_DSN sudah diisi. Pasang PHP native dengan pdo_pgsql untuk memakai database tersebut.');
if (nativePHP.status === 0 && nativeDatabaseConfigured) {
  const child = spawn('php', ['-d', 'upload_max_filesize=20M', '-d', 'post_max_size=21M', '-S', `${host}:${port}`, '-t', 'public', 'public/router.php'], { cwd: projectRoot, stdio: 'inherit' });
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
  child.on('exit', (code) => process.exit(code ?? 0));
} else {
  const php = await createPHP();
  const database = await openLocalDatabase(process.env.DOORPRIZE_DEV_DATABASE_PATH || undefined);
  connectPortableDatabase(php, database);
  const assetRoot = resolve(projectRoot, 'public/assets');
  const types = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
  // PHP hanya satu instance. Antrean mencegah request preview dan operator berbenturan.
  let queue = Promise.resolve();
  const server = createServer((request, response) => {
    queue = queue.then(async () => {
      const url = new URL(request.url, `http://${host}:${port}`);
      const asset = resolve(projectRoot, 'public', `.${decodeURIComponent(url.pathname)}`);
      if (!asset.startsWith(resolve(assetRoot, 'backgrounds') + sep) && ['GET', 'HEAD'].includes(request.method) && asset.startsWith(assetRoot + sep) && types[extname(asset)]) {
        try {
          const bytes = await readFile(asset);
          response.writeHead(200, { 'Content-Type': types[extname(asset)], 'X-Content-Type-Options': 'nosniff' });
          response.end(request.method === 'HEAD' ? undefined : bytes);
        } catch {
          response.writeHead(404);
          response.end();
        }
        return;
      }
      const result = await php.run({
        scriptPath: '/app/public/index.php',
        relativeUri: request.url,
        method: request.method,
        env: Object.fromEntries(['APP_ENCRYPTION_KEY','GOOGLE_READER_EMAIL','GOOGLE_READER_AUDIENCE','VERCEL_OIDC_TOKEN']
          .filter(key=>process.env[key]).map(key=>[key,process.env[key]])),
        headers: { ...request.headers, host: request.headers.host || `${host}:${port}` },
        body: ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) ? await readBody(request) : undefined,
      });
      response.writeHead(result.httpStatusCode, result.headers);
      response.end(request.method === 'HEAD' ? undefined : result.bytes);
    }).catch((error) => {
      console.error(error);
      if (!response.headersSent) response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Gagal memproses permintaan lokal.');
    });
  });
  server.on('error', async (error) => {
    console.error(error.code === 'EADDRINUSE' ? `Port ${port} sedang digunakan. Pilih PORT lain.` : `Server lokal tidak dapat dijalankan: ${error.message}`);
    php.exit();
    await database.close();
    process.exit(1);
  });
  server.listen(port, host, () => console.log(`Doorprize: http://${host}:${port}\nPHP 8.3 dan PostgreSQL portabel · data lokal: ${process.env.DOORPRIZE_DEV_DATABASE_PATH || 'storage/database'}`));
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(async () => { php.exit(); await database.close(); process.exit(0); }));
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    const limit = request.url?.split('?')[0] === '/api/backgrounds' ? 21 * 1024 * 1024 : 64 * 1024;
    if (size > limit) throw new Error('Data permintaan terlalu besar.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
