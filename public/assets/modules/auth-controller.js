import { authHeaders,authScope,expireSession,scopedName } from './auth-context.js';

/** Satu pemeriksaan saat kembali ke halaman, tanpa polling sesi. */
export class AuthController {
  start() {
    if (!authScope) return;
    const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(scopedName('doorprize-baru-auth')) : null;
    channel?.addEventListener('message', ({ data }) => { if (data === 'ended') expireSession(false); });
    document.addEventListener('auth-ended', ({ detail }) => {
      if (detail.broadcast) channel?.postMessage('ended');
      clearTimeout(this.timer);
      document.body.hidden = true;
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      location.replace('/login');
    }, { once: true });
    const expire = () => {
      const remaining = Number(document.querySelector('meta[name="auth-expires"]').content)*1000-Date.now();
      if (remaining<=0) expireSession();
      else this.timer = setTimeout(expire, Math.min(remaining,2147483647));
    };
    expire();
    const verify = async () => {
      try {
        const response = await fetch('/api/session', { cache:'no-store', headers:authHeaders() });
        if (response.status === 401) expireSession();
      } catch { /* Gangguan jaringan tidak mengeluarkan operator. */ }
    };
    window.addEventListener('pageshow', event => { if (event.persisted) verify(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) verify(); });
    window.addEventListener('pagehide', () => { clearTimeout(this.timer); channel?.close(); }, { once: true });
    const button = document.querySelector('#auth-logout');
    button?.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const response = await fetch('/api/logout', { method:'POST',headers:authHeaders() });
        if (!response.ok && response.status !== 401) throw Error('Belum dapat keluar. Coba lagi.');
        expireSession();
      } catch (error) {
        button.disabled = false;
        const feedback = document.querySelector('#output-message');
        feedback.textContent = error.message; feedback.hidden = false;
      }
    });
  }
}
