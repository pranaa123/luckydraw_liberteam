import { drawState } from './draw-state.js';
import { prizeStore } from './prize-store.js';
import { RoundPrizes } from './round-prizes.js';
import { element } from './ui.js';
import { presentationState } from './presentation-state.js';
import { DrawFilters } from './draw-filters.js';
import { DrawStatus } from './draw-status.js';

export class DrawController {
  constructor() {
    this.count = document.querySelector('#winner-count');
    this.startButton = document.querySelector('#draw-start');
    this.feedbackNode = document.querySelector('#draw-feedback');
    this.prizes = new RoundPrizes(this.count, message => this.feedback(message));
    this.filters = new DrawFilters(() => this.render(), message => this.feedback(message));
    this.status = new DrawStatus();
    this.busy = false;
    this.seenVersion = -1;
  }

  start() {
    this.prizes.start();
    this.filters.start();
    this.startButton.addEventListener('click', () => this.command(drawState.state?.draw?.status === 'pending' && drawState.state.draw.phase === 'rolling' ? 'stop' : 'start'));
    for (const action of ['confirm', 'eliminate', 'clear']) document.querySelector(`#draw-${action}`).addEventListener('click', () => this.command(action));
    document.querySelector('#draw-reload').addEventListener('click', () => this.reload());
    const accept = detail => {
      if (detail.prize_updates.length) {
        prizeStore.apply(detail.prize_updates);
        for (const record of detail.prize_updates) presentationState.refreshPrize(record).catch(error => this.feedback(error.message));
      }
      document.dispatchEvent(new CustomEvent('draw-records-changed', { detail }));
      const restore = detail.state.version !== this.seenVersion;
      if (restore) {
        this.count.value = detail.state.config.winner_count;
        this.prizes.restore(detail.state.config);
        this.seenVersion = detail.state.version;
      }
      this.filters.update(detail.state, restore);
      this.render();
    };
    drawState.addEventListener('change', ({ detail }) => accept(detail));
    if (drawState.state) accept({ state: drawState.state, participant_updates: [], prize_updates: [] });
    document.addEventListener('records-changed', ({ detail }) => {
      if (detail.type === 'participant' || detail.type === 'field' || detail.type === 'google_source') drawState.invalidate().catch(error => this.feedback(error.message));
    });
    this.render();
    drawState.load(true).then(() => this.render()).catch(error => this.feedback(error.message));
  }

  async reload() {
    if (this.busy) return;
    this.busy = true; this.render();
    try { await drawState.load(true); if (this.filters.loading) await this.filters.retry(); this.pendingStart = null; this.feedbackNode.hidden = true; }
    catch (error) { this.feedback(error.message); }
    finally { this.busy = false; this.render(); }
  }

  async command(action) {
    if (this.busy || !drawState.state) return;
    const cancelling = action === 'clear' && drawState.state.draw?.status === 'pending';
    if (action === 'start' && !this.pendingStart && (!this.count.reportValidity() || !this.prizes.valid())) return;
    this.busy = true; this.feedbackNode.hidden = true;
    let payload;
    if (action === 'start') {
      payload = this.pendingStart ||= { action, version: drawState.state.version, request_id: crypto.randomUUID(), winner_count: Number(this.count.value), prize_mode: this.prizes.mode(), allocation: this.prizes.allocation(), ...this.filters.payload() };
    } else payload = { action, draw_id: drawState.state.draw?.id };
    this.render();
    try {
      await drawState.command(payload);
      this.pendingStart = null;
      const message = { confirm: 'Seluruh hasil disahkan sebagai pemenang.', eliminate: 'Seluruh hasil dieliminasi.', clear: cancelling ? 'Undian dibatalkan. Peserta dan stok hadiah tidak berubah.' : 'Layar dikosongkan. Hasil yang sudah disahkan tetap tersimpan.' }[action];
      if (message) this.feedback(message, false);
    } catch (error) {
      this.feedback(error.message);
      try { await drawState.load(true); this.pendingStart = null; } catch { /* Request Mulai memakai kunci yang sama ketika diulang. */ }
    } finally { this.busy = false; this.render(); }
  }

  render() {
    const state = drawState.state, draw = state?.draw;
    const pending = draw?.status === 'pending', rolling = pending && draw.phase === 'rolling', result = pending && draw.phase === 'result';
    this.count.disabled = !state || this.busy || pending || Boolean(this.pendingStart);
    this.prizes.setLocked(!state || this.busy || pending || Boolean(this.pendingStart));
    this.filters.setLocked(!state || this.busy || pending || Boolean(this.pendingStart));
    this.startButton.disabled = !state || this.busy || (!rolling && state.sync_pending) || (pending && !rolling) || (!rolling && (this.filters.loading || this.filters.counting || this.filters.count === 0));
    this.startButton.querySelector('span').textContent = rolling ? 'Stop undian' : this.pendingStart ? 'Coba lagi' : 'Mulai undian';
    this.startButton.classList.toggle('is-stopping', rolling);
    document.querySelector('#draw-confirm').disabled = this.busy || !result;
    document.querySelector('#draw-eliminate').disabled = this.busy || !result;
    document.querySelector('#draw-clear').disabled = this.busy || !draw;
    this.status.render(state);
    document.querySelector('#draw-reload').disabled = this.busy;
    document.querySelector('#draw-capacity').textContent = state?.sync_pending ? 'Sinkronisasi awal…' : this.filters.counting ? 'Menghitung…' : state ? `${(this.filters.count ?? state.eligible_count).toLocaleString('id-ID')} tersedia` : 'Menghubungkan…';
    const host = document.querySelector('#draw-result-list');
    host.replaceChildren(); host.hidden = !draw || draw.phase !== 'result';
    if (host.hidden) return;
    const header = element('p', `Putaran ${draw.sequence_number} · ${draw.entries.length} nama${draw.status === 'confirmed' ? ' · Disahkan' : ''}`, 'subtle-text');
    host.append(header);
    const list = element('ol', undefined, 'draw-result-scroll');
    for (const entry of draw.entries) {
      const item = element('li');
      item.append(element('span', String(entry.position), 'draw-position'), element('strong', entry.participant.name));
      const details = [...draw.fields.map(field => entry.participant[`field_${field.slot}`]).filter(Boolean), entry.prize_name].filter(Boolean).join(' · ');
      if (details) item.append(element('small', details));
      list.append(item);
    }
    host.append(list);
  }

  feedback(message, error = true) {
    this.feedbackNode.textContent = message; this.feedbackNode.hidden = false;
    this.feedbackNode.classList.toggle('form-error', error);
  }
}
