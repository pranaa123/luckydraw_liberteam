import { eventScopedName } from './auth-context.js';
import { apiRequest } from './api-client.js';

class DrawState extends EventTarget {
  constructor() {
    super();
    this.state = null;
    this.pending = null;
    if (typeof BroadcastChannel !== 'function') return;
    this.channel = new BroadcastChannel(eventScopedName('doorprize-baru-draws'));
    this.channel.addEventListener('message', ({ data }) => {
      if (data?.type === 'request' && this.state) this.channel.postMessage({ type: 'state', state: this.state });
      if (data?.type === 'state') this.accept(data.state);
      if (data?.type === 'invalidate') this.refresh().catch(() => {});
    });
    this.channel.postMessage({ type: 'request' });
    window.addEventListener('pagehide', () => this.channel.close(), { once: true });
  }

  accept(data) {
    if (!Number.isInteger(data?.version) || !Number.isInteger(data?.data_version) || !data.config || !Array.isArray(data.fields)) return;
    const old = this.state;
    if (old && (data.version < old.version || (data.version === old.version && data.data_version <= old.data_version))) return;
    const { participant_updates = [], prize_updates = [], ...state } = data;
    this.state = state;
    this.dispatchEvent(new CustomEvent('change', { detail: { state, participant_updates, prize_updates } }));
  }

  async load(force = false) {
    if (this.pending) return this.pending;
    if (this.state && !force) return this.state;
    this.pending = apiRequest('/api/draws').then(data => {
      this.accept(data);
      this.channel?.postMessage({ type: 'state', state: data });
      return this.state;
    }).finally(() => { this.pending = null; });
    return this.pending;
  }

  async command(payload) {
    const data = await apiRequest('/api/draws', payload);
    this.accept(data);
    this.channel?.postMessage({ type: 'state', state: data });
    return data;
  }

  invalidate() {
    this.channel?.postMessage({ type: 'invalidate' });
    return this.refresh();
  }

  refresh() {
    return this.pending ? this.pending.then(() => this.load(true)) : this.load(true);
  }
}

export const drawState = new DrawState();
