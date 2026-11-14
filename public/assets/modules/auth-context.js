const meta = name => globalThis.document?.querySelector(`meta[name="${name}"]`)?.content || '';
export const authScope = meta('auth-scope');
const csrf = meta('csrf-token');
let ended = false;

export const scopedName = name => authScope ? `${name}:${authScope}` : name;
export function authHeaders() {
  if (ended) throw Error('Sesi berakhir. Silakan masuk kembali.');
  return authScope ? { 'X-Doorprize-Session': authScope, 'X-CSRF-Token': csrf } : {};
}
export function expireSession(broadcast = true) {
  if (ended || !authScope) return;
  ended = true;
  document.dispatchEvent(new CustomEvent('auth-ended', { detail: { broadcast } }));
}
