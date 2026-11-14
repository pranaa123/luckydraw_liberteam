import { randomUUID } from 'node:crypto';

const allowed = url => url.protocol === 'https:' && !url.username && !url.password && !url.port && ['script.google.com', 'script.googleusercontent.com'].includes(url.hostname);

async function googleFetch(endpoint, payload) {
  let url = new URL(endpoint), body = JSON.stringify(payload);
  const signal = AbortSignal.timeout(10000);
  for (let redirects = 0; redirects < 4; redirects++) {
    if (!allowed(url)) throw new Error('Pengalihan konektor Google tidak valid.');
    const response = await fetch(url, { method: body === null ? 'GET' : 'POST', headers: { 'content-type': 'application/json' }, body, signal, redirect: 'manual' });
    if ([301,302,303,307,308].includes(response.status)) {
      const location = response.headers.get('location'); await response.body?.cancel();
      if (!location) throw new Error('Pengalihan konektor Google tidak valid.');
      url = new URL(location, url); body = null; continue;
    }
    if (!response.ok) { await response.body?.cancel(); throw new Error('Konektor Google belum dapat diakses. Periksa URL dan izin deployment.'); }
    const reader = response.body.getReader(), chunks = []; let length = 0;
    try {
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        length += value.length; if (length > 524288) throw new Error('Respons konektor terlalu besar. Kurangi ukuran potongan data.'); chunks.push(value);
      }
    } finally { await reader.cancel(); }
    try { return JSON.parse(Buffer.concat(chunks, length).toString('utf8')); }
    catch { throw new Error('Konektor tidak mengembalikan JSON. Periksa izin aplikasi web Google.'); }
  }
  throw new Error('Pengalihan konektor Google terlalu banyak.');
}

/** Hanya adapter dev WASM: jaringan berjalan di luar antrean PHP. Produksi memakai HTTP PHP biasa. */
export function createGoogleHttpBridge(fetcher = googleFetch) {
  const jobs = new Map();
  return request => {
    const now = Date.now();
    for (const [id, job] of jobs) if (job.expires < now) jobs.delete(id);
    if (request.job_id) {
      const job = jobs.get(request.job_id);
      if (!job) return { expired: true };
      return job.result || { pending: request.job_id };
    }
    if (jobs.size >= 32) return { error: 'Antrean konektor sedang penuh. Mencoba kembali.' };
    const id = randomUUID(), job = { expires: now + 60000 };
    jobs.set(id, job);
    Promise.resolve().then(() => fetcher(request.endpoint, request.payload)).then(response => { job.result = { response }; }, error => {
      job.result = { error: error.name === 'TimeoutError' || error.name === 'AbortError' ? 'Google belum merespons. Sinkronisasi akan dicoba kembali.' : error.message || 'Koneksi Google belum berhasil.' };
    });
    return { pending: id };
  };
}
