import { scopedName } from './auth-context.js';
const CONSOLE_NAME = scopedName('doorprize-baru-console');
const STAGE_NAME = scopedName('doorprize-baru-stage');
const PREFIX = scopedName('doorprize:display:') + ':';

/** Satu pasangan jendela: satu menjadi panggung, satu menjadi operator. */
export class PresentationSession {
  constructor(browser, root, onState, resolveScreen) {
    this.browser = browser;
    this.root = root;
    this.onState = onState;
    this.resolveScreen = resolveScreen;
    this.frame = root.querySelector('.preview-frame');
    this.peer = null;
    this.key = null;
    this.busy = false;
    this.operatorBounds = null;
    this.origin = browser.location.origin;
    this.browser.addEventListener('message', (event) => this.receive(event));
    this.root.addEventListener('fullscreenchange', () => {
      if (this.isHost() && !this.busy) this.sendState();
    });
    this.root.querySelector('#return-to-operator')?.addEventListener('click', () => {
      if (!this.openOperator(this.operatorBounds)) {
        this.root.querySelector('#return-to-operator').textContent = 'Izinkan popup operator';
      }
    });

    // Pulihkan pasangan sesudah operator di-refresh, tanpa polling atau reload panggung.
    if (typeof browser.BroadcastChannel === 'function') {
      this.channel = new browser.BroadcastChannel(scopedName('doorprize-baru-display'));
      this.channel.addEventListener('message', (event) => {
        if (event.data === 'operator-ready' && this.isHost()) this.sendState();
      });
      this.channel.postMessage('operator-ready');
      this.browser.addEventListener('pagehide', () => this.channel.close(), { once: true });
    }
    if (this.related(browser.opener)) {
      this.peer = browser.opener;
      this.peer.postMessage({ type: `${PREFIX}hello` }, this.origin);
    }
  }

  isHost() {
    return this.root.body.classList.contains('is-output-host');
  }

  related(candidate) {
    if (!candidate || candidate === this.browser || candidate.closed) return false;
    try {
      return candidate.location.origin === this.origin
        && (candidate === this.peer || candidate === this.browser.opener || candidate.opener === this.browser);
    } catch {
      return false;
    }
  }

  receive(event) {
    if (event.origin !== this.origin || !this.related(event.source)) return;
    const data = event.data;
    if (data?.type === `${PREFIX}hello` && this.isHost()) {
      this.peer = event.source;
      this.sendState();
    }
    if (data?.type === `${PREFIX}state`) {
      this.peer = event.source;
      this.onState({ fullscreen: data.fullscreen === true, key: data.key });
    }
    if (data?.type === `${PREFIX}error`) {
      this.onState({ error: data.message });
    }
    if (data?.type === `${PREFIX}present` && this.isHost()) {
      const screen = this.resolveScreen(data.key);
      if (!screen || this.busy) return;
      this.busy = true;
      // Hak dari klik operator diteruskan melalui postMessage delegate: fullscreen.
      // Tidak memerlukan izin fullscreen otomatis dan tidak memindah peran jendela.
      const transition = this.root.fullscreenElement ? this.root.exitFullscreen() : Promise.resolve();
      transition.then(() => this.frame.requestFullscreen({ screen, navigationUI: 'hide' })).then(() => {
        this.key = data.key;
        this.root.body.dataset.outputScreen = data.key;
        this.sendState();
      }).catch(() => {
        event.source.postMessage({ type: `${PREFIX}error`, message: 'Fullscreen belum dapat diaktifkan. Klik Tampilkan kembali pada operator.' }, this.origin);
      }).finally(() => { this.busy = false; });
    }
    if (data?.type === `${PREFIX}operator`) {
      this.peer = event.source;
      this.root.body.classList.remove('is-output-host');
      this.browser.name = CONSOLE_NAME;
      this.key = null;
      if (typeof data.tab === 'string') this.browser.location.hash = data.tab;
      this.onState({ fullscreen: true, key: data.key });
      this.browser.focus();
    }
  }

  sendState() {
    if (!this.peer || this.peer.closed) return;
    this.peer.postMessage({
      type: `${PREFIX}state`,
      key: this.key,
      fullscreen: this.root.fullscreenElement === this.frame,
    }, this.origin);
  }

  openOperator(position) {
    const area = position || { left: 0, top: 0, width: 1280, height: 800 };
    if (this.related(this.peer)) {
      this.peer.name = CONSOLE_NAME;
    } else {
      const url = new URL('/', this.origin);
      url.searchParams.set('operator', '1');
      url.hash = this.browser.location.hash;
      this.peer = this.browser.open(url.href, CONSOLE_NAME, `popup,left=${area.left},top=${area.top},width=${area.width},height=${area.height}`);
    }
    if (!this.peer) return false;
    try {
      this.peer.moveTo(area.left, area.top);
      this.peer.resizeTo(area.width, area.height);
    } catch { /* Pertahankan ukuran jika browser membatasi resize. */ }
    this.peer.postMessage({ type: `${PREFIX}operator`, key: this.key, tab: this.browser.location.hash }, this.origin);
    this.peer.focus();
    return true;
  }

  async present(screen, key, operatorBounds) {
    if (this.busy) return;
    this.busy = true;
    const previousName = this.browser.name;
    try {
      if (this.related(this.peer)) {
        const peerDocument = this.peer.document;
        if (peerDocument.fullscreenElement && peerDocument.body.dataset.outputScreen === key) {
          this.onState({ fullscreen: true, key });
          return;
        }
        if (peerDocument.body.classList.contains('is-output-host')) {
          this.peer.postMessage({ type: `${PREFIX}present`, key }, { targetOrigin: this.origin, delegate: 'fullscreen' });
          return;
        }
      }

      this.key = key;
      this.operatorBounds = operatorBounds;
      this.root.body.dataset.outputScreen = key;
      this.root.body.classList.add('is-output-host');
      this.browser.name = STAGE_NAME;

      // Fullscreen dipicu LANGSUNG oleh klik operator, sebelum membuka jendela.
      // Window Management mengizinkan pembukaan operator setelah fullscreen bertarget.
      await this.frame.requestFullscreen({ screen, navigationUI: 'hide' });

      if (!this.openOperator(operatorBounds)) {
        await this.root.exitFullscreen();
        throw new Error('Izinkan popup agar operator tetap tersedia di layar utama.');
      }
    } catch (error) {
      if (this.root.fullscreenElement === this.frame) await this.root.exitFullscreen();
      this.root.body.classList.remove('is-output-host');
      this.browser.name = previousName;
      this.key = null;
      delete this.root.body.dataset.outputScreen;
      throw error;
    } finally {
      this.busy = false;
    }
  }
}
