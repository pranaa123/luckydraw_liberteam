import { eventScopedName } from './auth-context.js';
import { apiRequest } from './api-client.js';

/** Kanal konfigurasi kecil. Tidak membawa daftar peserta, file gambar, atau menjalankan polling. */
class PresentationState extends EventTarget {
  constructor() {
    super();
    this.packet = null;
    this.pending = null;
    this.sender = crypto.randomUUID();
    if (typeof BroadcastChannel === 'function') {
      this.channel = new BroadcastChannel(eventScopedName('doorprize-baru-visual-settings'));
      this.channel.addEventListener('message', ({ data }) => {
        if (data?.type === 'request' && this.packet) this.channel.postMessage({ type: 'state', packet: this.packet });
        if (data?.type === 'state') this.accept(data.packet);
      });
      this.channel.postMessage({ type: 'request' });
      window.addEventListener('pagehide', () => this.channel.close(), { once: true });
    }
  }

  accept(packet, local = false) {
    if (!packet?.state?.visual || !Number.isFinite(packet.clock) || !Number.isInteger(packet.state.settings_version)) return;
    const previous = this.packet;
    if (previous) {
      const version = packet.state.settings_version - previous.state.settings_version;
      if (version < 0 || (version === 0 && (packet.clock < previous.clock || (packet.clock === previous.clock && String(packet.sender) <= String(previous.sender))))) return;
    }
    this.packet = structuredClone(packet);
    this.dispatchEvent(new CustomEvent('change', { detail: { ...this.packet, local } }));
  }

  async load(force = false) {
    if (this.pending) return this.pending;
    if (this.packet && !force) return this.packet;
    this.pending = apiRequest('/api/settings').then(state => {
      if (force) this.publish(state, false, {});
      else {
        this.accept({ state, dirty: false, backgroundChanges: {}, clock: 0, sender: '' });
        this.channel?.postMessage({ type: 'state', packet: this.packet });
      }
      this.channel?.postMessage({ type: 'request' });
      return this.packet;
    }).finally(() => { this.pending = null; });
    return this.pending;
  }

  publish(state, dirty, backgroundChanges = this.packet?.backgroundChanges || {}) {
    const packet = { state, dirty, backgroundChanges, sender: this.sender, clock: Math.max(Date.now(), (this.packet?.clock || 0) + 1) };
    this.accept(packet, true);
    this.channel?.postMessage({ type: 'state', packet });
  }

  async refreshPrize(record, deleted = false) {
    await this.load();
    const state = structuredClone(this.packet.state);
    const changes = structuredClone(this.packet.backgroundChanges || {});
    const map = state.visual.prize_backgrounds ||= {};
    const id = String(record.id);
    if (deleted) { delete map[id]; delete changes[id]; }
    else if (changes[id]) {
      changes[id].version = Number(record.version);
      if (map[id]) map[id].version = Number(record.version);
    } else if (record.background_path) map[id] = { path: record.background_path, version: Number(record.version) };
    else delete map[id];
    if (JSON.stringify(map) !== JSON.stringify(this.packet.state.visual.prize_backgrounds) || JSON.stringify(changes) !== JSON.stringify(this.packet.backgroundChanges || {})) {
      this.publish(state, this.packet.dirty, changes);
    }
  }
}

export const presentationState = new PresentationState();
