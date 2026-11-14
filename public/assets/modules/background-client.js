import { apiRequest } from './api-client.js';

export async function uploadBackground(file) {
  if (document.querySelector('meta[name="background-driver"]')?.content !== 'supabase') {
    const body = new FormData();
    body.append('background', file);
    return apiRequest('/api/backgrounds', body);
  }
  const prepared = await apiRequest('/api/backgrounds', { action: 'prepare', mime: file.type, size: file.size });
  const url = new URL(prepared.upload_url);
  if (url.protocol !== 'https:' || !/^[a-z0-9]+\.supabase\.co$/.test(url.hostname) || !url.pathname.startsWith('/storage/v1/object/upload/sign/')) throw new Error('Alamat penyimpanan gambar tidak valid.');
  const response = await fetch(url, {
    method: 'PUT', body: file, credentials: 'omit', redirect: 'error',
    headers: { 'content-type': file.type, 'x-upsert': 'false', 'cache-control': 'max-age=3600' },
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error('Gambar belum dapat diunggah. Coba kembali.');
  return apiRequest('/api/backgrounds', { action: 'complete', path: prepared.path });
}
