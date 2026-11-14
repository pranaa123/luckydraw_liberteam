import { authHeaders,authScope,eventScope,expireSession,scopedName } from './auth-context.js';
import { startEventLifecycle,changeEvent } from './event-lifecycle.js';

/** Satu pemeriksaan saat kembali ke halaman, tanpa polling sesi. */
export class AuthController {
  start() {
    if (!authScope) return;
    startEventLifecycle();
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
        const displayOnly = document.body.dataset.eventDisplayOnly === 'true';
        const headers = authHeaders();
        if (displayOnly) delete headers['X-Doorprize-Event'];
        const response = await fetch('/api/session', { cache:'no-store', headers });
        if (response.status === 401) expireSession();
        else {
          const data = await response.json();
          if (!displayOnly && (data.reason === 'event_changed' || (response.ok && eventScope && String(data.event_id) !== eventScope))) changeEvent();
        }
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
