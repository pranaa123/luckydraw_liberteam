import { apiRequest } from './api-client.js';
import { element } from './ui.js';

export class GoogleIssues {
  constructor(store) { this.store = store; this.dialog = document.querySelector('#google-issues-dialog'); this.epoch = 0; }
  start() {
    document.querySelector('#google-issues-close').addEventListener('click',() => { if (!this.saving) { this.epoch++; this.dialog.close(); } });
    this.dialog.addEventListener('cancel',event => { if (this.saving) event.preventDefault(); else this.epoch++; });
    for (const direction of ['previous','next']) document.querySelector(`#google-issues-${direction}`).addEventListener('click',() => this.page(direction === 'next'));
  }
  async open(id) {
    this.id = id; this.cursors = [null]; this.dialog.showModal();
    this.fields = (await apiRequest('/api/imports')).fields; await this.load();
  }
  error(error) { const node = document.querySelector('#google-issues-error'); node.textContent = error.message; node.hidden = false; }
  async load() {
    const epoch = ++this.epoch; this.loading = true; document.querySelector('#google-issues-error').hidden = true;
    try {
      const result = await apiRequest('/api/google-sources',{ action: 'issues',id: this.id,...(this.cursors.at(-1) ? { after: this.cursors.at(-1) } : {}) });
      if (epoch !== this.epoch || !this.dialog.open) return;
      this.next = result.next; this.render(result.items);
    } catch (error) { if (epoch === this.epoch) this.error(error); }
    finally { if (epoch === this.epoch) this.loading = false; }
  }
  render(items) {
    const host = document.querySelector('#google-issues-table'), table = element('table',undefined,'participant-table'), head = element('thead'), header = element('tr'), body = element('tbody');
    for (const label of ['Baris','Data operator','Data Sheets','Aksi']) header.append(element('th',label)); head.append(header);
    for (const row of items) {
      const tr = element('tr'); tr.dataset.googleIssue = row.row_key; tr.append(element('td',String(row.row_number)));
      const local = element('td'), remote = element('td');
      if (!row.participant_id) local.append(element('span',row.locally_removed ? 'Dihapus operator' : 'Belum tersimpan','field-hint'));
      for (const field of this.fields) { if (row.participant_id) local.append(element('p',`${field.label}: ${row[field.key] || '—'}`)); remote.append(element('p',`${field.label}: ${row.incoming_data?.[field.key] || '—'}`)); }
      const actions = element('td');
      if (row.issue === 'invalid') actions.append(element('span',row.issue_message || 'Perbaiki di Sheets','field-hint'));
      else {
        if(row.issue_message)actions.append(element('p',row.issue_message,'field-hint'));
        for (const [choice,label] of [['local','Pertahankan lokal'],['remote','Gunakan Sheets']]) {
          if (choice === 'local' && !row.participant_id) continue;
          const button = element('button',label,`button ${choice === 'local' ? 'button-secondary' : 'button-save'}`); button.type = 'button'; button.dataset.resolve = choice;
          button.addEventListener('click',() => this.resolve(row,choice)); actions.append(button);
        }
        if (row.issue === 'local_deleted') actions.prepend(element('small','Dihapus operator','field-hint'));
      }
      tr.append(local,remote,actions); body.append(tr);
    }
    table.append(head,body); host.replaceChildren(items.length ? table : element('p','Tidak ada perubahan yang perlu diperiksa.','subtle-text source-empty'));
    document.querySelector('#google-issues-page').textContent = `Halaman ${this.cursors.length}`;
    document.querySelector('#google-issues-previous').disabled = this.cursors.length === 1;
    document.querySelector('#google-issues-next').disabled = this.next === null;
  }
  async page(forward) {
    if (this.loading || this.saving) return;
    if (forward && this.next) this.cursors.push(this.next); else if (!forward && this.cursors.length > 1) this.cursors.pop(); else return;
    await this.load();
  }
  async resolve(row,choice) {
    if (this.saving) return; this.saving = true;
    this.dialog.querySelectorAll('button').forEach(button => { button.disabled = true; });
    try {
      const source = this.store.sources.get(this.id);
      const result = await apiRequest('/api/google-sources',{ action: 'resolve',id: this.id,version: Number(source.version),row_key: row.row_key,row_version: Number(row.version),choice });
      this.store.update(result); this.store.changed(result.changed,true); this.store.wake(); await this.load();
    } catch (error) { this.error(error); }
    finally { this.saving = false; this.dialog.querySelectorAll('[data-resolve],#google-issues-close').forEach(button => { button.disabled = false; }); }
  }
}
