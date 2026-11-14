import { apiRequest } from './api-client.js';
import { element } from './ui.js';
import { ReportClient } from './report-client.js';

export class WinnerController {
  constructor() {
    this.host = document.querySelector('#winner-list'); this.cursors = [null];
    this.dirty = true; this.revision = 0; this.snapshot = null;
  }
  active() { return document.querySelector('[data-tab][aria-selected="true"]').dataset.tab === 'history' && !document.querySelector('#history-winners').hidden; }
  start() {
    document.addEventListener('operator-tab',()=>{ if (this.active() && this.dirty) this.load(); });
    document.addEventListener('history-view',()=>{ if (this.active() && this.dirty) this.load(); });
    document.addEventListener('draw-records-changed',({ detail })=>{
      if (detail.state.draw?.status !== 'confirmed' || (this.snapshot !== null && detail.state.draw.id <= this.snapshot)) return;
      this.invalidate();
    });
    document.querySelector('#winners-reload').addEventListener('click',()=>this.invalidate());
    document.querySelector('#winners-previous').addEventListener('click',()=>this.changePage(false));
    document.querySelector('#winners-next').addEventListener('click',()=>this.changePage(true));
    document.querySelector('#winners-export').addEventListener('click',()=>this.export());
    document.querySelector('#winners-export-cancel').addEventListener('click',()=>this.report?.close());
    window.addEventListener('pagehide',()=>this.report?.close(),{once:true});
    if (this.active()) this.load();
  }
  invalidate() {
    this.dirty = true; this.revision++; this.cursors = [null]; this.snapshot = null;
    if (this.active()) this.load();
  }
  async load(cursors = this.cursors) {
    if (this.busy) return;
    this.busy = true; const revision = this.revision; this.status();
    const params = new URLSearchParams();
    const cursor = cursors.at(-1);
    if (this.snapshot !== null) params.set('snapshot',this.snapshot);
    if (cursor) { params.set('after_draw',cursor.draw_id); params.set('after_position',cursor.position); }
    try {
      const page = await apiRequest('/api/winners' + (params.size ? '?' + params : ''));
      if (revision !== this.revision) return;
      this.snapshot = page.snapshot; this.next = page.next; this.cursors = cursors;
      if (page.meta) this.meta = page.meta;
      this.render(page.items); this.dirty = false;
    } catch (error) { if (revision === this.revision) this.feedback(error.message,true); }
    finally { this.busy = false; this.status(); if (revision !== this.revision && this.active()) this.load(); }
  }
  render(items) {
    this.host.replaceChildren(); this.feedback('');
    for (const item of items) {
      const row = element('tr'); row.dataset.winnerId = String(item.id);
      const name = element('td',item.participant.name); name.className = 'winner-name';
      const details = element('td'), list = element('dl',undefined,'winner-details');
      for (const field of item.fields) {
        const entry = element('div'); entry.append(element('dt',field.label),element('dd',item.participant[`field_${field.slot}`] || '—')); list.append(entry);
      }
      details.append(item.fields.length ? list : element('span','—','field-hint'));
      row.append(name,details,element('td',item.prize_name || '—'),element('td',String(item.sequence_number)));
      this.host.append(row);
    }
    if (!items.length) { const cell = element('td','Belum ada pemenang yang disahkan.','winner-empty'); cell.colSpan = 4; const row = element('tr'); row.append(cell); this.host.append(row); }
  }
  changePage(forward) {
    if (this.busy) return;
    const cursors = [...this.cursors];
    if (forward && this.next) cursors.push(this.next);
    else if (!forward && cursors.length > 1) cursors.pop();
    else return;
    this.load(cursors);
  }
  status() {
    const summary = document.querySelector('#winner-summary');
    summary.textContent = this.busy ? 'Memuat pemenang…' : this.meta ? `${this.meta.total.toLocaleString('id-ID')} pemenang · ${this.meta.rounds.toLocaleString('id-ID')} undian` : 'Belum dimuat';
    document.querySelector('#winners-reload').disabled = this.busy;
    document.querySelector('#winners-previous').disabled = this.busy || this.cursors.length === 1;
    document.querySelector('#winners-next').disabled = this.busy || !this.next;
    document.querySelector('#winners-page').textContent = `Halaman ${this.cursors.length}`;
    document.querySelector('#winners-export').disabled = this.exporting || this.busy || !this.meta?.total;
    document.querySelector('#winners-export-cancel').hidden = !this.exporting;
    document.querySelector('#winners-export span').textContent = this.exporting ? 'Menyiapkan PDF…' : 'Export PDF';
  }
  feedback(message,error = false) {
    const node = document.querySelector('#winners-feedback');
    node.textContent = message; node.hidden = !message; node.className = error ? 'form-error' : 'field-hint';
  }
  async export() {
    if (this.exporting) return;
    this.exporting = true; this.feedback(''); this.status();
    try {
      this.report = new ReportClient();
      const result = await this.report.generate(({loaded,total})=>this.feedback(`${loaded.toLocaleString('id-ID')} / ${total.toLocaleString('id-ID')} pemenang · Menyiapkan PDF…`));
      const url = URL.createObjectURL(new Blob([result.buffer],{type:'application/pdf'}));
      const link = element('a'); link.href = url; link.download = result.filename; document.body.append(link); link.click(); link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),30000);
      this.feedback('PDF berhasil diunduh.');
    } catch (error) { this.feedback(error.message,error.message !== 'Export dibatalkan.'); }
    finally { this.report?.close(); this.report = null; this.exporting = false; this.status(); }
  }
}
