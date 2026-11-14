import { eventScopedName } from './auth-context.js';
import { apiRequest } from './api-client.js';
import { drawState } from './draw-state.js';

/** Hanya metadata sumber yang diperiksa berkala; delta baris berada di backend. */
export class GoogleSync extends EventTarget {
  constructor() {
    super(); this.sources = new Map(); this.lastLoad = 0;
    this.channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(eventScopedName('doorprize-baru-google')) : null;
    this.channel?.addEventListener('message', ({ data }) => { if (data?.source) { this.update(data.source,false); this.wake(); } });
    window.addEventListener('pagehide', () => { this.stopped = true; clearTimeout(this.timer); this.channel?.close(); }, { once: true });
    document.addEventListener('event-changing', () => { this.stopped = true; clearTimeout(this.timer); });
    document.addEventListener('draw-records-changed', () => { this.dispatchEvent(new Event('change')); this.wake(); });
  }
  async start() { try { await this.load(); } catch (error) { this.dispatchEvent(new CustomEvent('error',{ detail: error.message })); } this.wake(); }
  values() { return [...this.sources.values()].filter(source=>!['draft','disconnected'].includes(source.phase)).sort((a,b) => Number(b.id)-Number(a.id)).slice(0,1); }
  drawPending() { return drawState.state?.draw?.status === 'pending'; }
  update(source,broadcast = true) {
    this.generation=(this.generation||0)+1;
    const old = this.sources.get(Number(source.id));
    if (old && Number(old.revision) > Number(source.revision)) return;
    if (!['draft','disconnected'].includes(source.phase)) {
      for (const [id,item] of this.sources) if (id<Number(source.id) && item.phase!=='draft') this.sources.delete(id);
    }
    this.sources.set(Number(source.id),source); this.dispatchEvent(new Event('change'));
    if (broadcast) this.channel?.postMessage({ source });
  }
  async load() {
    const generation=this.generation||0;
    const data = await apiRequest('/api/google-sources');
    this.reader=data.reader;
    if (generation===(this.generation||0)) this.sources.clear();
    for (const source of data.items) this.update(source,false);
    this.dispatchEvent(new Event('change'));
    this.lastLoad = Date.now();
    if (drawState.state && Number(data.data_version) > drawState.state.data_version) this.changed(false,true);
  }
  changed(participants = false,state = false) {
    if (participants || state) document.dispatchEvent(new CustomEvent('records-changed',{ detail: { type: participants ? 'participant' : 'google_source',origin: 'sheets' } }));
  }
  wake(delay = 100) {
    if (this.stopped) return;
    clearTimeout(this.timer); this.timer = setTimeout(() => this.cycle(),delay);
  }
  async cycle() {
    if (this.busy || this.stopped) return;
    if (document.body.classList.contains('is-output-host')) { this.wake(5000); return; }
    this.busy = true; let delay = 3000;
    try {
      const run = async () => {
        if (Date.now() - this.lastLoad > 15000) await this.load();
        const active = this.values().filter(source => source.sync_enabled && ['initial','live'].includes(source.phase));
        for (const source of active) {
          if (drawState.state?.draw?.status === 'pending') { delay = 3000; continue; }
          const result = await apiRequest('/api/google-sources',{ action: 'sync',id: Number(source.id) });
          this.update(result.source); this.changed(result.changed,result.state_changed);
          if (result.more) delay = Math.min(delay,60); else if (result.pending) delay = Math.min(delay,600);
        }
      };
      if (navigator.locks) await navigator.locks.request(eventScopedName('doorprize-baru-google-sync'),{ ifAvailable: true },lock => lock ? run() : undefined);
      else await run();
    } catch (error) { this.dispatchEvent(new CustomEvent('error',{ detail: error.message })); delay = 5000; }
    finally {
      this.busy = false;
      if (this.values().some(source => source.sync_enabled && ['initial','live'].includes(source.phase))) this.wake(delay);
    }
  }
}
