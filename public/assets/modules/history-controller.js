import { apiRequest } from './api-client.js';
import { element } from './ui.js';

const actions = { connect: 'Menghubungkan', sync: 'Menyinkronkan', configure: 'Mengatur', schedule: 'Mengatur penutupan', disconnect: 'Memutus', pause: 'Menjeda', resume: 'Melanjutkan', resolve: 'Menentukan data', import: 'Mengimpor', create: 'Menambahkan', update: 'Mengubah', delete: 'Menghapus', reorder: 'Mengurutkan', start: 'Memulai undian', stop: 'Menghentikan undian', confirm: 'Mengesahkan pemenang', eliminate: 'Mengeliminasi hasil', clear: 'Mengosongkan layar' };
const types = { google_source: 'Google Sheets', participant_import: 'peserta dari Excel', duplicate_rule: 'aturan duplikasi', participant: 'peserta', participant_batch: 'peserta secara massal', prize: 'hadiah', field: 'isian', settings: 'pengaturan' };

export class HistoryController {
  active() { return document.querySelector('[data-tab][aria-selected="true"]').dataset.tab === 'history' && !document.querySelector('#history-activity').hidden; }
  start() {
    this.host = document.querySelector('#history-list'); this.cursors = [null]; this.dirty = true; this.revision = 0;
    document.addEventListener('operator-tab', () => { if (this.active() && this.dirty) this.load(); });
    document.addEventListener('history-view', () => { if (this.active() && this.dirty) this.load(); });
    for (const event of ['records-changed', 'draw-records-changed']) document.addEventListener(event, () => {
      this.dirty = true; this.revision++; this.cursors = [null];
      if (this.active()) this.load();
    });
    document.querySelector('#history-previous').addEventListener('click', () => this.changePage(false));
    document.querySelector('#history-next').addEventListener('click', () => this.changePage(true));
    if (this.active()) this.load();
  }

  async load() {
    if (this.busy) return;
    this.busy = true;
    const revision = this.revision;
    try {
      const before = this.cursors.at(-1);
      const { items, next } = await apiRequest(`/api/history${before ? `?before=${before}` : ''}`);
      this.next = next; this.host.replaceChildren();
      const format = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'Asia/Makassar' });
      for (const record of items) {
        const row = element('div', undefined, 'history-row');
        const text = `${actions[record.action] || record.action}${types[record.entity_type] ? ` ${types[record.entity_type]}` : ''}`;
        const content = element('div');
        content.append(element('p', text), element('small', record.entity_type === 'draw' ? `Putaran ${record.sequence_number} · ${record.requested_count} nama` : record.name, 'field-hint'));
        row.append(content, element('time', format.format(new Date(record.created_at)), 'field-hint')); this.host.append(row);
      }
      if (!items.length) this.host.append(element('p', 'Belum ada aktivitas.', 'subtle-text'));
      document.querySelector('#history-previous').disabled = this.cursors.length === 1;
      document.querySelector('#history-next').disabled = next === null;
      document.querySelector('#history-page').textContent = `Halaman ${this.cursors.length}`;
      this.dirty = revision !== this.revision;
    } catch (error) { this.host.replaceChildren(element('p', error.message, 'form-error')); }
    finally {
      this.busy = false;
      if (revision !== this.revision && this.active()) this.load();
    }
  }

  changePage(forward) {
    if (this.busy) return;
    if (forward && this.next) this.cursors.push(this.next);
    else if (!forward && this.cursors.length > 1) this.cursors.pop();
    else return;
    this.load();
  }
}
