import { apiRequest } from './api-client.js';
import { ExcelClient } from './excel-client.js';
import { DuplicateRuleEditor } from './duplicate-rule-editor.js';
import { ImportMapping } from './import-mapping.js';
import { ImportPreview } from './import-preview.js';

const $ = id => document.querySelector(`#excel-${id}`);

export class ImportController {
  start() {
    this.session = 0;
    this.dialog = $('dialog'); this.preview = new ImportPreview();
    this.mapping = new ImportMapping($('mapping'), () => this.invalidate());
    this.rule = new DuplicateRuleEditor($('keys'), () => this.invalidate());
    document.querySelector('#participants-import-excel').addEventListener('click', () => this.open());
    $('close').addEventListener('click', () => this.close());
    this.dialog.addEventListener('cancel', event => { event.preventDefault(); this.close(); });
    $('file').addEventListener('change', () => this.readFile());
    $('template').addEventListener('click', () => this.downloadTemplate());
    $('sheet').addEventListener('change', () => this.changeSheet());
    $('header').addEventListener('change', () => this.changeSheet(true));
    $('inspect').addEventListener('click', () => this.inspect());
    $('commit').addEventListener('click', () => this.commit());
    $('previous').addEventListener('click', () => this.page(false));
    $('next').addEventListener('click', () => this.page(true));
  }

  async open() {
    if (this.dialog.open) return;
    const session = ++this.session;
    this.stagedSignature = null; this.meta = null; this.file = null; this.batchId = null; this.ready = null; this.description = null; this.committing = false;
    $('inspect').textContent = 'Pratinjau'; $('file').value = ''; $('mapping-controls').hidden = true; $('preview').hidden = true; $('commit').hidden = true; $('error').hidden = true;
    this.dialog.showModal(); this.worker = new ExcelClient(); this.setBusy(true, 'Memuat isian undian…');
    try { const metadata = await apiRequest('/api/imports'); this.ensureOpen(session); this.meta = metadata; this.rule.render(metadata.fields, metadata.keys); this.status(''); }
    catch (error) {
      if (session !== this.session) return;
      this.error(error);
    }
    finally { if (session === this.session) this.setBusy(false); }
  }

  ensureOpen(session = this.session) { if (!this.dialog.open || session !== this.session) throw new Error('Import dibatalkan.'); }
  status(text) { $('status').textContent = text; }
  error(error) { if (!this.dialog.open) return; $('error').textContent = error.message; $('error').hidden = false; this.status(''); }
  setBusy(busy, message) {
    this.busy = busy;
    if (message !== undefined) this.status(message);
    for (const id of ['file', 'template']) $(id).disabled = busy || !this.meta;
    $('mapping-controls').disabled = busy;
    $('inspect').disabled = busy || !this.description;
    $('commit').disabled = busy || !this.ready?.summary.valid;
    $('close').disabled = Boolean(this.committing);
  }
  invalidate() { this.ready = null; $('preview').hidden = true; $('commit').hidden = true; $('error').hidden = true; }
  async abandonBatch() {
    const id = this.batchId; this.batchId = null; this.stagedSignature = null;
    if (id) await apiRequest('/api/imports', { action: 'cancel', batch_id: id });
  }
  close() {
    if (this.committing) return;
    this.session++; this.worker?.close(); this.dialog.close();
    this.abandonBatch().catch(() => {});
  }

  async readFile() {
    const session = this.session;
    const file = $('file').files[0]; if (!file || this.busy) return;
    this.invalidate(); this.description = null; $('mapping-controls').hidden = true;
    this.setBusy(true, 'Membaca berkas Excel…');
    try {
      if (!/\.xlsx$/i.test(file.name)) throw new Error('Gunakan berkas Excel .xlsx.');
      if (file.size > 20 * 1024 * 1024) throw new Error('Ukuran berkas maksimal 20 MB.');
      await this.abandonBatch(); this.ensureOpen(session);
      const buffer = await file.arrayBuffer(); this.ensureOpen(session);
      const description = await this.worker.request('load', { buffer }, [buffer]); this.ensureOpen(session);
      this.file = file; this.describe(description); this.status('Periksa pemetaan kolom, lalu buka pratinjau.');
    } catch (error) {
      if (session !== this.session) return;
      this.error(error);
    }
    finally { if (session === this.session) this.setBusy(false); }
  }

  describe(data) {
    this.description = data; $('sheet').replaceChildren();
    for (const name of data.sheets) $('sheet').add(new Option(name, name));
    $('sheet').value = data.sheet; $('header').value = String(data.header_row);
    this.mapping.render(this.meta.fields, data.headers); $('mapping-controls').hidden = false;
  }
  async changeSheet(useHeader = false) {
    const session = this.session;
    if (this.busy) return;
    this.invalidate(); this.setBusy(true);
    try {
      const header = useHeader ? Number($('header').value) : undefined;
      if (useHeader && (!Number.isInteger(header) || header < 1 || header > 1048575)) throw new Error('Nomor baris header tidak valid.');
      const data = await this.worker.request('sheet', { sheet: $('sheet').value, header_row: header }); this.ensureOpen(session); this.describe(data);
    } catch (error) {
      if (session !== this.session) return; this.description = null; this.error(error); }
    finally { if (session === this.session) this.setBusy(false); }
  }

  async downloadTemplate() {
    const session = this.session;
    if (this.busy || !this.meta) return;
    this.setBusy(true, 'Menyiapkan template…'); $('error').hidden = true;
    try {
      const { buffer } = await this.worker.request('template', this.meta); this.ensureOpen(session);
      const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const link = document.createElement('a'); link.href = url; link.download = 'Template Peserta Doorprize.xlsx'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); this.status('Template siap diisi pada sheet Peserta, mulai baris 7.');
    } catch (error) {
      if (session !== this.session) return;
      this.error(error);
    }
    finally { if (session === this.session) this.setBusy(false); }
  }

  async request(action, data = {}, retry = true) {
    const session = this.session;
    const payload = { action, batch_id: this.batchId, ...data };
    try { return await apiRequest('/api/imports', payload); }
    catch (error) {
      if (session !== this.session) return;
      if (!retry || (error.status && error.status !== 503)) throw error;
      this.ensureOpen(session); return apiRequest('/api/imports', payload);
    }
  }

  async inspect() {
    const session = this.session;
    if (this.busy || !this.description) return;
    this.invalidate(); this.setBusy(true, 'Menyiapkan pratinjau…');
    try {
      if (!this.batchId) {
        const mapping = this.mapping.value();
        const { total } = await this.worker.request('prepare', { mapping, header_row: this.description.header_row }); this.ensureOpen(session);
        this.batchId = crypto.randomUUID();
        await this.request('create', { filename: this.file.name, sheet_name: this.description.sheet, field_schema: this.meta.field_schema, mapping, keys: this.rule.keys(), expected_rows: total }); this.ensureOpen(session);
        let uploaded = 0, chunk = 0, done = false;
        while (!done) {
          const data = await this.worker.request('chunk'); this.ensureOpen(session); done = data.done;
          const result = await this.request('chunk', { chunk_number: chunk++, rows: data.rows }); this.ensureOpen(session);
          uploaded = Number(result.uploaded_rows); this.status(`Memeriksa ${uploaded.toLocaleString('id-ID')} / ${total.toLocaleString('id-ID')} baris…`);
        }
        this.stagedSignature = this.signature();
      } else if (this.stagedSignature !== this.signature()) {
        await this.abandonBatch(); this.ensureOpen(session); this.setBusy(false); return this.inspect();
      }
      const ready = await this.request('preview'); this.ensureOpen(session); this.ready = ready; this.cursors = [0];
      this.preview.summary(this.ready.summary); await this.loadRows(); this.ensureOpen(session);
      $('commit').textContent = `Import ${this.ready.summary.valid.toLocaleString('id-ID')} peserta`; $('commit').hidden = false;
      $('inspect').textContent = 'Perbarui pratinjau'; this.status('Daftar peserta belum berubah.');
    } catch (error) {
      if (session !== this.session) return;
      this.error(error);
      if (!this.stagedSignature && this.batchId) await this.abandonBatch().catch(() => {});
    } finally { if (session === this.session) this.setBusy(false); }
  }
  signature() { return JSON.stringify([this.description.sheet, this.description.header_row, this.mapping.value(), this.rule.keys()]); }
  async loadRows() {
    const session = this.session;
    const data = await this.request('rows', { after: this.cursors.at(-1) }); this.ensureOpen(session);
    this.next = data.next; this.preview.rows(data, this.meta.fields, this.cursors.length);
  }
  async page(forward) {
    const session = this.session;
    if (this.busy || !this.ready) return;
    const old = [...this.cursors];
    if (forward && this.next !== null) this.cursors.push(this.next);
    else if (!forward && this.cursors.length > 1) this.cursors.pop(); else return;
    this.setBusy(true);
    try { await this.loadRows(); } catch (error) {
      if (session !== this.session) return;
      this.cursors = old; this.error(error);
    }
    finally { if (session === this.session) this.setBusy(false); }
  }
  async commit() {
    if (this.busy || !this.ready?.summary.valid) return;
    this.committing = true; this.setBusy(true, 'Menyimpan peserta…'); $('error').hidden = true;
    try {
      const result = await this.request('commit', { preview_revision: Number(this.ready.preview_revision) });
      this.batchId = null; this.committing = false; this.close();
      const message = document.querySelector('#management-feedback'); message.textContent = `${result.summary.imported.toLocaleString('id-ID')} peserta diimpor · ${result.summary.duplicates.toLocaleString('id-ID')} duplikat · ${result.summary.invalid.toLocaleString('id-ID')} baris dilewati.`; message.hidden = false;
      document.dispatchEvent(new CustomEvent('records-changed', { detail: { type: 'participant', origin: 'import' } }));
    } catch (error) {
      if (error.status === 409) { this.ready = null; $('commit').hidden = true; }
      if (!error.status || error.status === 503) error = new Error(error.message + ' Tekan Import lagi untuk melanjutkan permintaan yang sama.');
      this.error(error);
    } finally { this.committing = false; this.setBusy(false); }
  }
}
