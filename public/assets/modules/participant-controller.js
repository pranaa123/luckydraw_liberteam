import { apiRequest } from './api-client.js';
import { element } from './ui.js';
import { FilterControl } from './filter-control.js';
import { FilterDropdown } from './filter-dropdown.js';

const statuses = { available: 'Tersedia', duplicate: 'Duplikat', eliminated: 'Tereliminasi', winner: 'Pemenang' };

/** Daftar, filter, pemilihan lintas halaman dan edit massal. Editor satu record tetap dikelola ManagementController. */
export class ParticipantController {
  constructor(fields, actions, feedback) {
    this.fields = fields; this.actions = actions; this.feedback = feedback;
    this.items = []; this.cursors = [0]; this.next = null; this.summary = []; this.selected = new Map(); this.excluded = new Set(); this.generation = 0;
    this.search = document.querySelector('#participant-search');
    this.filters = new FilterControl(document.querySelector('#participant-filters'), 'all', () => this.queryChanged(), feedback,
      [{ key: 'status', label: 'Status', options: Object.entries(statuses).map(([value, label]) => ({ value, label })) }]);
    this.dropdown = new FilterDropdown(this.filters,document.querySelector('#participant-filter-menu'));
    this.dialog = document.querySelector('#participant-bulk-dialog');
  }

  start() {
    this.dropdown.start();
    document.querySelector('#participants-next').addEventListener('click', () => this.changePage(true));
    document.querySelector('#participants-previous').addEventListener('click', () => this.changePage(false));
    this.search.addEventListener('input', () => { clearTimeout(this.searchTimer); this.searchTimer = setTimeout(() => this.queryChanged(), 220); });
    document.querySelector('#participants-select-all').addEventListener('click', () => {
      this.all = true; this.selected.clear(); this.excluded.clear(); this.selectionVersion = Number(this.meta.participants_version); this.selectionQuery = structuredClone(this.query()); this.renderSelection();
    });
    document.querySelector('#participants-clear-selection').addEventListener('click', () => { this.resetSelection(); this.renderSelection(); });
    document.querySelector('#participants-bulk-edit').addEventListener('click', () => this.openBulk());
    document.querySelector('#bulk-field').addEventListener('change', () => this.renderBulkValue());
    document.querySelector('#participant-bulk-form').addEventListener('submit', event => this.saveBulk(event));
    document.querySelector('#participant-bulk-close').addEventListener('click', () => this.dialog.close());
    this.dialog.addEventListener('cancel', event => { if (this.bulkBusy) event.preventDefault(); });
    document.addEventListener('records-changed', ({ detail }) => {
      if (!['import', 'duplicates', 'sheets'].includes(detail.origin)) return;
      this.invalidate(); this.resetSelection();
      if (!document.querySelector('#panel-participants').hidden) this.refreshAfterMutation().catch(error => this.feedback(error.message));
    });
    document.addEventListener('draw-records-changed', ({ detail }) => this.applyDrawChanges(detail));
  }

  query() {
    const { status: status_filter, ...filters } = this.filters.get();
    return { filters, ...(status_filter ? { status_filter } : {}), search: this.search.value };
  }
  filtered() { const query = this.query(); return Boolean(Object.keys(query.filters).length || query.status_filter || query.search); }
  total() { return this.summary.reduce((sum, item) => sum + Number(item.count), 0); }
  selectedCount() { return this.all ? this.total() - this.excluded.size : this.selected.size; }
  resetSelection() { this.all = false; this.selected.clear(); this.excluded.clear(); }
  invalidate() { this.loaded = false; }

  queryChanged() {
    this.cursors = [0]; this.resetSelection(); this.loaded = false;
    this.load(true, true).catch(error => this.feedback(error.message));
  }

  async load(force = false, includeSummary = true) {
    if (!force && this.pending) return this.pending;
    if (!force && this.loaded) return;
    this.filterReady ||= this.filters.load().catch(error => { this.filterReady = null; throw error; });
    await this.filterReady;
    const generation = ++this.generation;
    const query = this.query();
    const promise = apiRequest('/api/participants', { action: 'query', ...query, after: this.cursors.at(-1), include_summary: includeSummary }).then(data => {
      if (generation !== this.generation) return;
      const changed = this.meta && Number(data.participants_version) !== Number(this.meta.participants_version);
      if (changed && this.all) this.resetSelection();
      this.items = data.items; this.next = data.next; this.meta = data;
      if (data.summary) this.summary = data.summary;
      this.loaded = true; this.render();
      if (changed) this.filters.refreshValues();
      if (changed && !includeSummary) return this.load(true, true);
    }).finally(() => { if (this.pending === promise) { this.pending = null; this.renderSelection(); } });
    this.pending = promise; this.render();
    return promise;
  }

  async refreshAfterMutation() {
    this.resetSelection(); await this.load(true, true);
    if (!this.items.length && this.cursors.length > 1) { this.cursors.pop(); await this.load(true, true); }
  }

  async fieldsChanged() {
    this.filterReady = this.filters.load(true); await this.filterReady;
    this.cursors = [0]; this.resetSelection(); this.loaded = false;
    if (document.querySelector('[data-tab][aria-selected="true"]').dataset.tab === 'participants') await this.load(true, true);
  }

  async changePage(forward) {
    if (this.pending) return;
    const old = [...this.cursors];
    if (forward && this.next !== null) this.cursors.push(this.next);
    else if (!forward && this.cursors.length > 1) this.cursors.pop(); else return;
    try { await this.load(true, false); } catch (error) { this.cursors = old; this.feedback(error.message); }
  }

  isSelected(record) { return this.all ? !this.excluded.has(Number(record.id)) : this.selected.has(Number(record.id)); }
  select(record, checked) {
    const id = Number(record.id);
    if (this.all) { if (checked) this.excluded.delete(id); else this.excluded.add(id); }
    else if (checked) this.selected.set(id, { id, version: Number(record.version) }); else this.selected.delete(id);
  }

  render() {
    const host = document.querySelector('#participant-list'); const scrollTop = host.querySelector('.table-scroll')?.scrollTop || 0; host.replaceChildren();
    const fields = this.fields();
    if (!this.items.length) {
      const empty = element('div', undefined, 'card empty-card');
      empty.append(element('h3', this.filtered() ? 'Tidak ada peserta yang cocok' : 'Belum ada peserta di halaman ini'), element('p', this.filtered() ? 'Sesuaikan filter atau pencarian.' : 'Tambahkan peserta satu per satu atau melalui import.')); host.append(empty);
    } else {
      const scroll = element('div', undefined, 'table-scroll'), table = element('table', undefined, 'participant-table');
      const head = element('thead'), headings = element('tr'), choose = element('th');
      const master = element('input'); master.type = 'checkbox'; master.setAttribute('aria-label', 'Pilih halaman peserta');
      master.id = 'participant-page-select';
      master.checked = this.items.every(item => this.isSelected(item)); master.indeterminate = !master.checked && this.items.some(item => this.isSelected(item));
      master.addEventListener('change', () => { for (const record of this.items) this.select(record, master.checked); this.renderSelection(); }); choose.append(master); headings.append(choose);
      for (const label of ['Nama', ...fields.map(field => field.label), 'Status', 'Aksi']) { const th = element('th', label); th.scope = 'col'; headings.append(th); }
      head.append(headings); const body = element('tbody');
      for (const record of this.items) {
        const row = element('tr'); row.dataset.participantId = String(record.id);
        const selection = element('td'), check = element('input'); check.type = 'checkbox'; check.checked = this.isSelected(record); check.setAttribute('aria-label', `Pilih peserta ${record.name}`);
        check.dataset.selectParticipant = String(record.id);
        check.addEventListener('change', () => { this.select(record, check.checked); this.renderSelection(); }); selection.append(check); row.append(selection);
        for (const text of [record.name, ...fields.map(field => record[`field_${field.slot}`] || '—'), statuses[record.status]]) row.append(element('td', text));
        const actions = element('td'); actions.append(this.actions(record)); row.append(actions); body.append(row);
      }
      table.append(head, body); scroll.append(table); host.append(scroll); scroll.scrollTop = scrollTop;
    }
    const summary = document.querySelector('#participant-summary'); summary.replaceChildren();
    for (const [status, label] of Object.entries(statuses)) summary.append(element('span', `${label} · ${this.summary.find(item => item.status === status)?.count || 0}`, 'quiet-badge'));
    document.querySelector('#participant-pagination').hidden = this.cursors.length === 1 && this.next === null;
    document.querySelector('#participants-previous').disabled = Boolean(this.pending) || this.cursors.length === 1;
    document.querySelector('#participants-next').disabled = Boolean(this.pending) || this.next === null;
    document.querySelector('#participant-page').textContent = `Halaman ${this.cursors.length}`;
    document.querySelector('#participant-matched').textContent = `${this.total().toLocaleString('id-ID')} hasil`;
    this.renderSelection();
  }

  renderSelection() {
    const master = document.querySelector('#participant-page-select');
    if (master) {
      master.checked = this.items.every(item => this.isSelected(item)); master.indeterminate = !master.checked && this.items.some(item => this.isSelected(item)); master.disabled = Boolean(this.pending);
    }
    for (const record of this.items) {
      const check = document.querySelector(`[data-select-participant="${record.id}"]`);
      if (check) { check.checked = this.isSelected(record); check.disabled = Boolean(this.pending); }
    }
    document.querySelector('#participants-previous').disabled = Boolean(this.pending) || this.cursors.length === 1;
    document.querySelector('#participants-next').disabled = Boolean(this.pending) || this.next === null;
    document.querySelector('#participants-selected').textContent = `${this.selectedCount().toLocaleString('id-ID')} dipilih`;
    document.querySelector('#participants-select-all').disabled = !this.total() || Boolean(this.pending);
    document.querySelector('#participants-clear-selection').disabled = !this.selectedCount();
    document.querySelector('#participants-bulk-edit').disabled = !this.selectedCount() || Boolean(this.pending) || this.drawPending || this.bulkBusy;
    document.querySelector('#bulk-save').disabled = this.bulkBusy || this.drawPending;
  }

  openBulk() {
    if (!this.selectedCount() || this.drawPending) return;
    const select = document.querySelector('#bulk-field'); select.replaceChildren();
    for (const [key, label] of [['status', 'Status'], ['name', 'Nama'], ...this.fields().map(field => [`field_${field.slot}`, field.label])]) { const option = element('option', label); option.value = key; select.append(option); }
    document.querySelector('#bulk-title').textContent = `Edit ${this.selectedCount().toLocaleString('id-ID')} peserta`;
    document.querySelector('#bulk-error').hidden = true; this.renderBulkValue(); this.dialog.showModal();
  }

  renderBulkValue() {
    const host = document.querySelector('#bulk-value-host'); host.replaceChildren(); const key = document.querySelector('#bulk-field').value;
    const input = element(key === 'status' ? 'select' : 'input'); input.id = 'bulk-value'; input.name = 'value';
    if (key === 'status') for (const status of ['available', 'eliminated']) { const option = element('option', statuses[status]); option.value = status; input.append(option); }
    else { input.type = 'text'; input.maxLength = 200; input.required = key === 'name'; }
    input.setAttribute('aria-label', 'Nilai baru'); host.append(input);
  }

  async saveBulk(event) {
    event.preventDefault(); if (this.bulkBusy || this.drawPending) return;
    const selection = this.all ? { mode: 'query', participants_version: this.selectionVersion, query: this.selectionQuery, excluded_ids: [...this.excluded] } : { mode: 'ids', items: [...this.selected.values()] };
    const key = document.querySelector('#bulk-field').value, value = document.querySelector('#bulk-value').value;
    const errorNode = document.querySelector('#bulk-error'); errorNode.hidden = true; this.bulkBusy = true;
    const controls = [...this.dialog.querySelectorAll('input, select, button')]; controls.forEach(node => node.disabled = true); this.render();
    try {
      const result = await apiRequest('/api/participant-bulk', { action: 'update', field_schema: this.meta.field_schema, selection, changes: { [key]: value } });
      this.dialog.close(); await this.refreshAfterMutation();
      document.dispatchEvent(new CustomEvent('records-changed', { detail: { type: 'participant', result } }));
      this.feedback(`${result.updated_count.toLocaleString('id-ID')} peserta diperbarui.`);
    } catch (error) { errorNode.textContent = error.message; errorNode.hidden = false; }
    finally { this.bulkBusy = false; controls.forEach(node => node.disabled = false); this.render(); }
  }

  applyDrawChanges({ state, participant_updates }) {
    this.drawPending = state.draw?.status === 'pending';
    const previous = this.lastState; this.lastState = state;
    if (!this.loaded) { this.renderSelection(); return; }
    if (!participant_updates.length) {
      if (previous && Number(state.participants_version) !== Number(this.meta?.participants_version)) {
        this.loaded = false;
        if (document.querySelector('[data-tab][aria-selected="true"]').dataset.tab === 'participants') this.load(true, true).catch(error => this.feedback(error.message));
      }
      this.render(); return;
    }
    if (this.filtered()) { this.loaded = false; if (document.querySelector('[data-tab][aria-selected="true"]').dataset.tab === 'participants') this.load(true, true).catch(error => this.feedback(error.message)); return; }
    const updates = new Map(participant_updates.map(record => [Number(record.id), record]));
    this.items = this.items.map(record => updates.get(Number(record.id)) || record);
    const counts = new Map(this.summary.map(item => [item.status, Number(item.count)])); counts.set('available', state.available_count);
    for (const record of participant_updates) counts.set(record.status, (counts.get(record.status) || 0) + 1);
    this.summary = [...counts].map(([status, count]) => ({ status, count }));
    this.meta.participants_version = state.participants_version; this.render();
  }
}
