import { scopedName } from './auth-context.js';
const WINDOW_NAME = scopedName('doorprize-baru-output');
const PREFERENCE_KEY = scopedName('doorprize-baru.output-screen');

function screenKey(screen) {
  // Identitas tidak bergantung pada resolusi/viewport yang bisa berbeda antarjendela.
  return JSON.stringify([screen.left, screen.top, screen.label || '']);
}

function bounds(screen) {
  return {
    left: Math.round(screen.availLeft ?? screen.left),
    top: Math.round(screen.availTop ?? screen.top),
    width: Math.round(screen.availWidth ?? screen.width),
    height: Math.round(screen.availHeight ?? screen.height),
  };
}

// Modul ini hanya mengelola layar dan jendela; tidak membaca data undian.
export class OutputController {
  constructor(browser, root) {
    this.browser = browser;
    this.root = root;
    this.choose = root.querySelector('#choose-output-screen');
    this.select = root.querySelector('#output-screen');
    this.open = root.querySelector('#open-output');
    this.label = root.querySelector('#open-output-label');
    this.message = root.querySelector('#output-message');
    this.details = null;
    this.output = null;
    this.selectedKey = null;
    this.permission = null;
    this.session = new PresentationSession(browser, root, (state) => this.receiveSessionState(state), (key) => this.details?.screens.find((screen) => screenKey(screen) === key));
    this.screenChanged = () => this.refreshScreens(true);
  }

  start() {
    this.open.addEventListener('click', () => this.showOutput());
    this.select.addEventListener('change', () => {
      this.selectedKey = this.select.value;
      this.open.disabled = !this.selectedScreen();
      this.rememberScreen();
      this.notify('');
    });

    if (!this.browser.isSecureContext || typeof this.browser.getScreenDetails !== 'function') {
      this.open.title = 'Buka output; pindahkan jendela ke layar tujuan dan gunakan tombol Fullscreen.';
      return;
    }

    this.choose.hidden = false;
    this.choose.addEventListener('click', () => this.connectScreens());
    this.restorePermission();
  }

  async restorePermission() {
    try {
      this.permission = await this.browser.navigator.permissions.query({ name: 'window-management' });
      this.permission.addEventListener('change', () => {
        if (this.permission.state !== 'granted') {
          this.disconnectScreens();
          this.notify('Izin layar berubah. Pilih layar kembali atau gunakan Buka output.');
        }
      });
      if (this.permission.state === 'granted') await this.connectScreens(false);
    } catch {
      // Browser dapat mendukung pemilihan layar tanpa Permissions.query.
    }
  }

  async connectScreens(showFeedback = true) {
    this.choose.disabled = true;
    try {
      const details = await this.browser.getScreenDetails();
      this.details?.removeEventListener('screenschange', this.screenChanged);
      this.details?.removeEventListener('currentscreenchange', this.screenChanged);
      this.details = details;
      this.details.addEventListener('screenschange', this.screenChanged);
      this.details.addEventListener('currentscreenchange', this.screenChanged);
      if (!this.selectedKey) {
        try { this.selectedKey = this.browser.sessionStorage.getItem(PREFERENCE_KEY); } catch { /* Penyimpanan opsional. */ }
      }
      this.refreshScreens(false);
      if (showFeedback) {
        this.notify(this.details.screens.length === 1
          ? 'Satu layar terdeteksi. Hubungkan layar tambahan dalam mode Extend untuk output terpisah.'
          : 'Pilih layar tujuan, lalu klik Tampilkan.');
      }
    } catch (error) {
      this.disconnectScreens();
      if (showFeedback) this.notify(error.name === 'NotAllowedError'
        ? 'Izin layar belum diberikan. Buka output tetap tersedia.'
        : 'Layar belum dapat dideteksi. Gunakan Buka output atau coba pilih layar kembali.');
    } finally {
      this.choose.disabled = false;
    }
  }

  refreshScreens(fromEvent) {
    const screens = this.details.screens;
    const previous = this.selectedKey;
    const selected = screens.find((screen) => screenKey(screen) === previous);
    const disconnected = Boolean(fromEvent && previous && !selected);
    if (!selected && !disconnected && !fromEvent) {
      const preferred = screens.find((screen) => screen !== this.details.currentScreen) || screens[0];
      this.selectedKey = preferred ? screenKey(preferred) : null;
    }
    if (disconnected || !screens.length) this.selectedKey = null;

    this.select.replaceChildren();
    if (!this.selectedKey) this.select.add(new Option('Pilih layar', ''));
    screens.forEach((screen, index) => {
      const current = screen === this.details.currentScreen ? ' · Operator' : '';
      const name = screen.label || `Layar ${index + 1}`;
      this.select.add(new Option(`${name} · ${screen.width} × ${screen.height}${current}`, screenKey(screen)));
    });
    this.select.value = this.selectedKey || '';
    this.select.hidden = false;
    this.choose.hidden = true;
    this.label.textContent = 'Tampilkan';
    this.open.disabled = !this.selectedScreen();
    this.rememberScreen();
    if (disconnected) this.notify('Layar pilihan berubah atau terputus. Pilih layar tujuan kembali sebelum menampilkan output.');
  }

  selectedScreen() {
    return this.details?.screens.find((screen) => screenKey(screen) === this.selectedKey) || null;
  }

  rememberScreen() {
    try {
      if (this.selectedKey) this.browser.sessionStorage.setItem(PREFERENCE_KEY, this.selectedKey);
      else this.browser.sessionStorage.removeItem(PREFERENCE_KEY);
    } catch { /* Pemilihan tetap bekerja tanpa penyimpanan sesi. */ }
  }

  disconnectScreens() {
    this.details?.removeEventListener('screenschange', this.screenChanged);
    this.details?.removeEventListener('currentscreenchange', this.screenChanged);
    this.details = null;
    this.selectedKey = null;
    this.select.hidden = true;
    this.choose.hidden = false;
    this.open.disabled = false;
    this.label.textContent = 'Buka output';
  }

  async showOutput() {
    const screen = this.selectedScreen();
    if (screen) {
      if (this.details.screens.length < 2 || screen === this.details.currentScreen) {
        this.notify('Pilih layar eksternal dalam mode Extend agar layar operator tetap terpisah.');
        return;
      }
      try {
        await this.session.present(screen, this.selectedKey, bounds(this.details.currentScreen));
      } catch (error) {
        this.notify(error.message.includes('popup')
          ? error.message
          : 'Fullscreen belum dapat diaktifkan. Izinkan popup dan akses layar, lalu klik Tampilkan kembali.');
      }
      return;
    }
    if (!this.output || this.output.closed) {
      // Harus dipanggil langsung dari klik; jangan tunggu request/izin di sini.
      try {
        this.output = this.browser.open('', WINDOW_NAME, 'popup,width=1280,height=720');
        if (this.output && this.output.location.href === 'about:blank') {
          this.output.location.replace('/output');
        }
      } catch {
        this.output = null;
        this.notify('Jendela output belum dapat dibuka. Periksa izin popup browser.');
        return;
      }
    }
    if (!this.output) {
      this.notify('Izinkan popup untuk membuka output presentasi.');
      return;
    }

    this.output.focus();
    this.notify('');
  }

  receiveSessionState(state) {
    if (state.error) {
      this.notify(state.error);
      return;
    }
    if (typeof state.key === 'string' && (!this.details || this.details.screens.some((screen) => screenKey(screen) === state.key))) {
      this.selectedKey = state.key;
      this.rememberScreen();
      if (this.details) this.refreshScreens(false);
    }
    this.notify(state.fullscreen ? 'Output fullscreen aktif.' : 'Fullscreen output berakhir. Klik Tampilkan untuk mengaktifkan kembali.');
  }

  notify(text) {
    this.message.textContent = text;
    this.message.hidden = !text;
  }
}
import { PresentationSession } from './presentation-session.js';
