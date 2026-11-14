import { apiRequest } from './api-client.js';
import { ImportMapping } from './import-mapping.js';
import { element } from './ui.js';

const $ = name => document.querySelector(`#google-${name}`);
const localTime = value => value ? new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60000).toISOString().slice(0,16) : '';

export class GoogleDialog {
  constructor(store,feedback) { this.store = store; this.feedback = feedback; this.session = 0; this.dialog = $('dialog'); this.mapping = new ImportMapping($('mapping'),() => this.renderSample(),'google'); }
  start() {
    $('close').addEventListener('click',() => this.close());
    this.dialog.addEventListener('cancel',event => { event.preventDefault(); this.close(); });
    $('prepare').addEventListener('click',() => this.prepare()); $('probe').addEventListener('click',() => this.probe());
    $('connect').addEventListener('click',() => this.connect());
    $('copy').addEventListener('click',async () => { try { await navigator.clipboard.writeText(this.script); this.status('Kode konektor disalin.'); } catch { this.error(new Error('Salinan belum diizinkan browser. Gunakan Unduh .gs.')); } });
    $('download').addEventListener('click',() => {
      const url = URL.createObjectURL(new Blob([this.script],{ type: 'text/plain;charset=utf-8' })), link = document.createElement('a');
      link.href = url; link.download = 'Konektor Doorprize.gs'; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
    });
    $('endpoint').addEventListener('input',() => { this.metadata = null; $('mapping-controls').hidden = true; $('connect').hidden = true; });
  }
  async open(source = null) {
    const session = ++this.session;
    this.source = source; this.connection = crypto.randomUUID(); this.script = ''; this.metadata = null; this.savedMapping = null; this.committing = false;
    $('url').value = ''; $('header').value = '1'; $('endpoint').value = ''; $('closes').value = localTime(source?.closes_at);
    for (const id of ['setup','mapping-controls','schedule-label','connect']) $(id).hidden = true;
    $('new-source').hidden = Boolean(source); $('error').hidden = true; this.dialog.showModal(); this.busy(true,'Memuat isian…');
    try {
      const [metadata,setup] = await Promise.all([apiRequest('/api/imports'),source ? apiRequest('/api/google-sources',{ action: 'setup',id: Number(source.id) }) : Promise.resolve(null)]);
      this.active(session); this.fields = metadata.fields; this.schema = metadata.field_schema;
      if (setup) { this.acceptSetup(setup); if (setup.field_schema === this.schema) this.savedMapping = setup.mapping; }
      this.status('');
    } catch (error) { if (session === this.session) this.error(error); }
    finally { if (session === this.session) this.busy(false); }
    if (session === this.session && source && $('endpoint').value) this.probe();
  }
  active(session) { if (session !== this.session || !this.dialog.open) throw new Error('Koneksi dibatalkan.'); }
  status(text) { $('status').textContent = text; }
  error(error) { $('error').textContent = error.message; $('error').hidden = false; this.status(''); }
  busy(value,text) {
    this.loading = value; if (text !== undefined) this.status(text);
    for (const id of ['url','header','endpoint','prepare','probe','copy','download','closes']) $(id).disabled = value;
    $('mapping-controls').disabled = value; $('connect').disabled = value; $('close').disabled = Boolean(this.committing);
  }
  close() { if (this.committing) return; this.session++; this.dialog.close(); this.script = ''; }
  acceptSetup(setup) {
    this.source = setup.source; this.script = setup.script; this.store.update(setup.source);
    $('endpoint').value = setup.endpoint || ''; $('setup').hidden = false; $('new-source').hidden = true;
    $('instructions').open = !setup.endpoint;
  }
  async prepare() {
    if (this.loading) return; const session = this.session; this.busy(true,'Menyiapkan konektor…'); $('error').hidden = true;
    try {
      const result = await apiRequest('/api/google-sources',{ action: 'prepare',connection_id: this.connection,spreadsheet_url: $('url').value,header_row: Number($('header').value) });
      this.active(session); this.acceptSetup(result); this.status('Salin kode, pasang sekali, lalu tempel URL aplikasi web.');
    } catch (error) { if (session === this.session) this.error(error); }
    finally { if (session === this.session) this.busy(false); }
  }
  async probe() {
    if (this.loading || !this.source) return; const session = this.session; this.busy(true,'Memeriksa konektor Google…'); $('error').hidden = true;
    try {
      let result;
      do {
        result = await apiRequest('/api/google-sources',{ action: 'probe',id: Number(this.source.id),version: Number(this.source.version),endpoint: $('endpoint').value });
        this.active(session); this.source = result.source; this.store.update(this.source);
        if (result.error) throw new Error(result.error);
        if (result.pending) { await new Promise(resolve => setTimeout(resolve,600)); this.active(session); }
      } while (result.pending);
      if (!result.metadata) throw new Error('Metadata konektor belum tersedia. Periksa kembali URL.');
      this.metadata = result.metadata; this.mapping.render(this.fields,this.metadata.headers);
      for (const [key,column] of Object.entries(this.savedMapping || {})) { const select = this.mapping.selects.get(key); if (select?.querySelector(`option[value="${Number(column)}"]`)) select.value = String(column); }
      this.renderSample(); $('mapping-controls').hidden = false; $('schedule-label').hidden = false; $('connect').hidden = false;
      this.status('Periksa kolom dan contoh data sebelum menghubungkan.');
    } catch (error) { if (session === this.session) this.error(error); }
    finally { if (session === this.session) this.busy(false); }
  }
  renderSample() {
    if (!this.metadata) return;
    const host = $('sample'), table = element('table',undefined,'participant-table'), head = element('thead'), header = element('tr'), body = element('tbody');
    for (const field of this.fields) header.append(element('th',field.label)); head.append(header);
    for (const values of this.metadata.sample || []) {
      const row = element('tr');
      for (const field of this.fields) { const column = Number(this.mapping.selects.get(field.key)?.value); row.append(element('td',column ? values[column - 1] || '—' : '—')); } body.append(row);
    }
    table.append(head,body); host.replaceChildren(table); host.hidden = !body.children.length;
  }
  async connect() {
    if (this.loading || !this.metadata) return;
    this.committing = true; this.busy(true,'Menghubungkan sumber…'); $('error').hidden = true;
    try {
      const source = await apiRequest('/api/google-sources',{ action: 'configure',id: Number(this.source.id),version: Number(this.source.version),mapping: this.mapping.value(),field_schema: this.schema,header_hash: this.metadata.header_hash,
        closes_at: $('closes').value ? new Date($('closes').value).toISOString() : null });
      this.store.update(source); this.store.changed(false,true); this.store.wake(); this.committing = false; this.close(); this.feedback('Google Sheets terhubung. Sinkronisasi awal berjalan.');
    } catch (error) { this.error(error); }
    finally { this.committing = false; this.busy(false); }
  }
}

export { localTime as googleLocalTime };
