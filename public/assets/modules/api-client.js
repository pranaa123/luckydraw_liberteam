export async function apiRequest(path, payload) {
  let response;
  try {
    const headers = authHeaders();
    response = await fetch(path, payload ? {
      method: 'POST',
      ...(payload instanceof FormData ? { headers, body: payload } : { headers: { ...headers,'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
    } : { cache: 'no-store', headers });
  } catch {
    throw new Error('Server belum dapat diakses. Periksa koneksi dan coba lagi.');
  }
  if (response.status === 401) expireSession();
  const data = await response.json().catch(() => null);
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    const error = new Error('Respons server tidak valid. Coba lagi.');
    if (!response.ok) error.status = response.status;
    throw error;
  }
  if (!response.ok) {
    const error = new Error(data.error || 'Permintaan belum berhasil. Coba lagi.');
    error.status = response.status;
    throw error;
  }
  return data;
}
import { authHeaders,expireSession } from './auth-context.js';
