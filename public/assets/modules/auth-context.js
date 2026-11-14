const meta = name => globalThis.document?.querySelector(`meta[name="${name}"]`)?.content || '';
export const authScope = meta('auth-scope');
export const eventScope = meta('event-scope');
const csrf = meta('csrf-token');
let ended = false;

export const scopedName = name => authScope ? `${name}:${authScope}` : name;
export const eventScopedName = name => eventScope ? `${scopedName(name)}:event:${eventScope}` : scopedName(name);
export function authHeaders() {
  if (ended) throw Error('Sesi berakhir. Silakan masuk kembali.');
  return authScope ? { 'X-Doorprize-Session': authScope, 'X-CSRF-Token': csrf, ...(eventScope ? { 'X-Doorprize-Event':eventScope } : {}) } : {};
}
export function expireSession(broadcast = true) {
  if (ended || !authScope) return;
  ended = true;
  document.dispatchEvent(new CustomEvent('auth-ended', { detail: { broadcast } }));
}
