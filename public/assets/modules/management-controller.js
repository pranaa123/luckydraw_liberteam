const labels = { participant: 'peserta', prize: 'hadiah', field: 'isian' };
const paths = { participant: 'participants', prize: 'prizes', field: 'fields' };
const statuses = { available: 'Tersedia', duplicate: 'Duplikat', eliminated: 'Tereliminasi', winner: 'Pemenang' };

export class ManagementController {
  constructor() {
    this.items = { field: [] };
    this.loaded = new Set();
    this.pendingLoads = new Map();
    this.busy = false;
    this.editor = document.querySelector('#record-editor');
    this.deletion = document.querySelector('#record-delete');
    this.prizes = new PrizeController(record => this.actions('prize', record), message => this.feedback(message));
    this.participants = new ParticipantController(() => this.items.field, record => this.actions('participant', record), message => this.feedback(message));
  }

  start() {
    this.participants.start();
    document.addEventListener('operator-tab', ({ detail }) => this.activate(detail));
    document.querySelectorAll('[data-open-editor]').forEach(button => button.addEventListener('click', () => this.open(button.dataset.openEditor)));
    document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
    for (const dialog of [this.editor, this.deletion]) {
      dialog.addEventListener('cancel', event => { if (this.busy) event.preventDefault(); });
    }
    document.querySelector('#record-form').addEventListener('submit', event => this.submit(event, false));
    document.querySelector('#delete-form').addEventListener('submit', event => this.submit(event, true));
    this.activate(document.querySelector('[data-tab][aria-selected="true"]').dataset.tab);
  }

  activate(name) {
    document.querySelector('#management-feedback').hidden = true;
    const types = name === 'participants' ? ['field', 'participant'] : name === 'prizes' ? ['prize'] : name === 'settings' ? ['field'] : [];
    Promise.all(types.map(type => this.load(type))).then(() => {
      if (name === 'participants') this.participants.render();
    }).catch(error => this.feedback(error.message));
  }

  async request(type, payload) {
    return apiRequest(`/api/${paths[type]}`, payload);
  }

  async load(type, force = false) {
    if (type === 'prize') return this.prizes.load(force);
    if (type === 'participant') return this.participants.load(force);
    if (this.pendingLoads.has(type)) return this.pendingLoads.get(type);
    if (!force && this.loaded.has(type)) return;
    const promise = (async () => {
      const data = await this.request(type);
      this.items[type] = data.items;
      this.loaded.add(type);
      this.render(type);
    })();
    this.pendingLoads.set(type, promise);
    try { await promise; } finally { this.pendingLoads.delete(type); }
  }

  render(type) {
    if (type === 'prize') return this.prizes.render();
    if (type === 'participant') return this.participants.render();
    const list = document.querySelector('#field-list');
    list.replaceChildren();
    for (const record of this.items[type]) {
      const row = element('div', undefined, 'record-row');
      const content = element('div', undefined, 'record-name');
      content.append(element('p', record.label ?? record.name));
      row.append(content, this.actions(type, record));
      list.append(row);
    }
    document.querySelector('[data-open-editor="field"]').disabled = this.items.field.length >= 3;
    document.dispatchEvent(new CustomEvent('field-list-rendered',{ detail: this.items.field }));
    if (this.participants.loaded) this.participants.render();
  }

  actions(type, record) {
    const node = document.querySelector('#record-actions-template').content.firstElementChild.cloneNode(true);
    for (const button of node.querySelectorAll('button')) {
      const remove = button.dataset.recordAction === 'delete';
      const label = `${remove ? 'Hapus' : 'Edit'} ${labels[type]} ${record.label ?? record.name}`;
      button.title = label; button.setAttribute('aria-label', label);
      button.addEventListener('click', () => remove ? this.confirmDelete(type, record) : this.open(type, record));
    }
    return node;
  }

  async open(type, record = null) {
    try {
      await this.load(type);
      if (type === 'participant') await this.load('field', true);
      if (type === 'field' && !record && this.items.field.length >= 3) return;
      this.editing = { type, record, fieldSchema: this.items.field.map(field => `${field.id}:${field.slot}:${field.version}`).join(',') };
      const form = document.querySelector('#record-form');
      form.reset();
      document.querySelector('#editor-title').textContent = `${record ? 'Edit' : 'Tambah'} ${labels[type]}`;
      document.querySelector('#editor-error').hidden = true;
      const fields = document.querySelector('#editor-fields'); fields.replaceChildren();
      if (type === 'field') {
        fields.append(this.input('Label isian', 'label', record?.label || '', { maxLength: 80 }));
      } else {
        fields.append(this.input(type === 'prize' ? 'Nama hadiah' : 'Nama', 'name', record?.name || ''));
        if (type === 'prize') fields.append(this.input('Jumlah total', 'quantity', record?.initial_quantity ?? 1, { type: 'number', min: 0, max: 2147483647, step: 1 }));
        else {
          for (const field of this.items.field) fields.append(this.input(field.label, `field_${field.slot}`, record?.[`field_${field.slot}`] || '', { required: false }));
          const label = element('label', 'Status');
          const select = element('select'); select.name = 'status';
          for (const [value, text] of Object.entries(statuses)) {
            if (!['available', 'eliminated'].includes(value) && record?.status !== value) continue;
            const option = element('option', text); option.value = value; select.append(option);
          }
          select.value = record?.status || 'available';
          select.disabled = ['winner', 'duplicate'].includes(record?.status);
          label.append(select); fields.append(label);
        }
      }
      this.editor.showModal();
    } catch (error) { this.feedback(error.message); }
  }

  input(text, name, value, options = {}) {
    const label = element('label', text);
    const input = element('input');
    Object.assign(input, { type: 'text', name, value, required: true, maxLength: 200, ...options });
    label.append(input);
    return label;
  }

  confirmDelete(type, record) {
    this.removing = { type, record };
    document.querySelector('#delete-title').textContent = `Hapus ${labels[type]}?`;
    document.querySelector('#delete-description').textContent = type === 'field'
      ? `Hapus isian “${record.label}” beserta nilainya pada peserta? Data hasil undian yang sudah tercatat tetap tersimpan.`
      : `Hapus ${labels[type]} “${record.name}”?`;
    document.querySelector('#delete-error').hidden = true;
    this.deletion.showModal();
  }

  async submit(event, removing) {
    event.preventDefault();
    if (this.busy) return;
    const { type, record } = removing ? this.removing : this.editing;
    const dialog = removing ? this.deletion : this.editor;
    const errorNode = document.querySelector(removing ? '#delete-error' : '#editor-error');
    const payload = { action: removing ? 'delete' : record ? 'update' : 'create' };
    if (record) Object.assign(payload, { id: Number(record.id), version: Number(record.version) });
    if (!removing) {
      Object.assign(payload, Object.fromEntries(new FormData(event.target)));
      if (type === 'prize') payload.quantity = Number(payload.quantity);
      if (type === 'participant' && !payload.status) payload.status = record?.status || 'available';
      if (type === 'participant') payload.field_schema = this.editing.fieldSchema;
    }
    errorNode.hidden = true;
    this.busy = true;
    const controls = [...dialog.querySelectorAll('button, input, select')].map(node => [node, node.disabled]);
    controls.forEach(([node]) => { node.disabled = true; });
    try {
      const result = await this.request(type, payload);
      if (type === 'participant') {
        this.participants.invalidate();
      } else if (type === 'prize') {
        await this.prizes.accept(result, removing);
      } else {
        this.items[type] = this.items[type].filter(item => Number(item.id) !== Number(result.id));
        if (!removing) this.items[type].push(result);
        this.items[type].sort((a, b) => a.slot - b.slot);
        this.render(type);
        if (type === 'field') this.participants.fieldsChanged().catch(error => this.feedback(error.message));
      }
      dialog.close();
      document.dispatchEvent(new CustomEvent('records-changed', { detail: { type, result, removing } }));
      this.feedback(`${labels[type][0].toUpperCase() + labels[type].slice(1)} berhasil ${removing ? 'dihapus' : 'disimpan'}.`);
      // Reload only the current participant page and counts after its data changes.
      if (type === 'participant') {
        try {
          await this.participants.refreshAfterMutation();
        } catch { this.feedback('Data tersimpan. Daftar belum dapat diperbarui; buka ulang menu Peserta.'); }
      }
    } catch (error) { errorNode.textContent = error.message; errorNode.hidden = false; }
    finally { this.busy = false; controls.forEach(([node, disabled]) => { node.disabled = disabled; }); }
  }

  feedback(message) {
    const node = document.querySelector('#management-feedback');
    node.textContent = message; node.hidden = false;
  }
}
import { apiRequest } from './api-client.js';
import { element } from './ui.js';
import { PrizeController } from './prize-controller.js';
import { ParticipantController } from './participant-controller.js';
