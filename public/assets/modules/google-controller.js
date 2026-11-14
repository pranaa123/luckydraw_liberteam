import { apiRequest } from './api-client.js';
import { GoogleSync } from './google-sync.js';
import { GoogleDialog, googleLocalTime } from './google-dialog.js';
import { GoogleIssues } from './google-issues.js';

const phases = { draft: 'Belum terhubung',initial: 'Sinkronisasi awal',live: 'Aktif',paused: 'Dijeda',closed: 'Ditutup',disconnected: 'Terputus' };

export class GoogleController {
  start() {
    this.host = document.querySelector('#google-source-list'); this.nodes = new Map(); this.busy = new Set();
    this.store = new GoogleSync(); this.dialog = new GoogleDialog(this.store,text => this.feedback(text)); this.dialog.start(); this.issues = new GoogleIssues(this.store); this.issues.start();
    this.store.addEventListener('change',() => this.render()); this.store.addEventListener('error',({ detail }) => this.feedback(detail));
    document.querySelector('#participants-google-sheets').addEventListener('click',() => this.dialog.open(this.store.values()[0]||null));
    document.addEventListener('operator-tab',({ detail }) => { if (detail === 'participants' && Date.now() - this.store.lastLoad > 15000) this.store.load().then(() => this.store.wake()).catch(error => this.feedback(error.message)); });
    document.querySelector('#google-schedule-close').addEventListener('click',() => { if (!this.scheduleBusy) document.querySelector('#google-schedule-dialog').close(); });
    document.querySelector('#google-schedule-dialog').addEventListener('cancel',event => { if (this.scheduleBusy) event.preventDefault(); });
    document.querySelector('#google-schedule-form').addEventListener('submit',event => this.schedule(event));
    this.store.start();
  }
  feedback(text) { const host = document.querySelector('#management-feedback'); host.textContent = text; host.hidden = !text; }
  render() {
    const sources = this.store.values(); this.host.hidden = !sources.length;
    for (const [id,node] of this.nodes) if (!sources.some(source=>Number(source.id)===id)) { node.remove();this.nodes.delete(id); }
    for (const source of sources) {
      const id = Number(source.id); let node = this.nodes.get(id);
      if (!node) {
        node = document.querySelector('#google-source-template').content.firstElementChild.cloneNode(true); node.dataset.googleSourceId = String(id);
        for (const button of node.querySelectorAll('[data-source-action]')) button.addEventListener('click',() => this.action(id,button.dataset.sourceAction));
        this.nodes.set(id,node); this.host.append(node);
      }
      const title = node.querySelector('[data-source-name]'); title.textContent = source.sheet_name || 'Google Sheets'; title.href = `https://docs.google.com/spreadsheets/d/${source.spreadsheet_id}/edit${source.sheet_id == null ? '' : `#gid=${source.sheet_id}`}`;
      node.querySelector('[data-source-phase]').textContent = this.store.drawPending() && ['initial','live'].includes(source.phase) ? 'Menunggu undian' : phases[source.phase]; node.dataset.phase = source.phase;
      node.querySelector('[data-source-counts]').textContent = `${Number(source.synced_rows).toLocaleString('id-ID')} tersimpan${Number(source.invalid_rows) ? ` · ${source.invalid_rows} tidak valid` : ''}${Number(source.conflict_rows) ? ` · ${source.conflict_rows} perlu diperiksa` : ''}`;
      const note = node.querySelector('[data-source-message]'); note.className = source.error_message && source.error_code !== 'manual_pause' ? 'form-error' : 'field-hint';
      note.textContent = source.error_message || (source.closes_at ? `Tutup ${new Date(source.closes_at).toLocaleString('id-ID',{ dateStyle: 'short',timeStyle: 'short' })}` : source.last_synced_at ? `Terakhir ${new Date(source.last_synced_at).toLocaleTimeString('id-ID')}` : '');
      const issues = node.querySelector('[data-source-action="issues"]'); issues.hidden = !Number(source.invalid_rows) && !Number(source.conflict_rows); issues.querySelector('span').textContent = String(Number(source.invalid_rows) + Number(source.conflict_rows));
      const toggle = node.querySelector('[data-source-action="toggle"]'), active = ['initial','live'].includes(source.phase);
      toggle.title = toggle.ariaLabel = active ? 'Jeda sinkronisasi' : 'Lanjutkan sinkronisasi'; toggle.dataset.pausing = String(active);
      for (const button of node.querySelectorAll('button')) button.disabled = this.busy.has(id);
      toggle.hidden = source.phase === 'draft'; node.querySelector('[data-source-action="disconnect"]').hidden = source.phase === 'disconnected';
    }
  }
  async action(id,action) {
    if (this.busy.has(id)) return;
    let source = this.store.sources.get(id);
    if (action === 'issues') { this.issues.open(id).catch(error => this.feedback(error.message)); return; }
    if (action === 'schedule') {
      this.scheduling = structuredClone(source); document.querySelector('#google-schedule-time').value = googleLocalTime(source.closes_at); document.querySelector('#google-schedule-error').hidden = true; document.querySelector('#google-schedule-dialog').showModal(); return;
    }
    this.busy.add(id); this.render();
    try {
      if (action === 'edit') {
        await this.dialog.open(source);
      } else {
        source = await apiRequest('/api/google-sources',{ action: action === 'disconnect' ? 'disconnect' : ['initial','live'].includes(source.phase) ? 'pause' : 'resume',id,version: Number(source.version) });
        this.store.update(source); this.store.changed(false,true); this.store.wake();
      }
    } catch (error) { this.feedback(error.message); await this.store.load().catch(() => {}); }
    finally { this.busy.delete(id); this.render(); }
  }
  async schedule(event) {
    event.preventDefault(); if (this.scheduleBusy) return; this.scheduleBusy = true;
    const save = document.querySelector('#google-schedule-save'); save.disabled = true;
    try {
      const value = document.querySelector('#google-schedule-time').value;
      const source = await apiRequest('/api/google-sources',{ action: 'schedule',id: Number(this.scheduling.id),version: Number(this.scheduling.version),closes_at: value ? new Date(value).toISOString() : null });
      this.store.update(source); this.store.changed(false,true); this.store.wake(); document.querySelector('#google-schedule-dialog').close();
    } catch (error) { const host = document.querySelector('#google-schedule-error'); host.textContent = error.message; host.hidden = false; }
    finally { this.scheduleBusy = false; save.disabled = false; }
  }
}
