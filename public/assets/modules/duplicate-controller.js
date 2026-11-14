import { apiRequest } from './api-client.js';
import { DuplicateRuleEditor } from './duplicate-rule-editor.js';

export class DuplicateController {
  start() {
    this.message = document.querySelector('#duplicate-message'); this.button = document.querySelector('#duplicate-save');
    this.editor = new DuplicateRuleEditor(document.querySelector('#duplicate-keys'));
    this.button.addEventListener('click', () => this.save());
    document.querySelector('#duplicate-reload').addEventListener('click', () => this.load());
    document.addEventListener('operator-tab', ({ detail }) => { if (detail === 'settings' && !this.loaded) this.load(); });
    document.addEventListener('records-changed', ({ detail }) => {
      if (detail.type === 'field' || detail.origin === 'import') {
        this.loaded = false;
        if (!document.querySelector('#panel-settings').hidden) this.load();
      }
    });
    if (!document.querySelector('#panel-settings').hidden) this.load();
  }
  status(text, error = false) { this.message.textContent = text; this.message.className = error ? 'form-error' : 'field-hint'; }
  async load() {
    if (this.busy) return;
    this.busy = true; this.button.disabled = true;
    try { this.data = await apiRequest('/api/duplicates'); this.editor.render(this.data.fields, this.data.keys); this.loaded = true; this.status(''); }
    catch (error) { this.status(error.message, true); }
    finally { this.busy = false; this.button.disabled = !this.loaded; }
  }
  async save() {
    if (this.busy || !this.loaded) return;
    this.busy = true; this.button.disabled = true;
    document.querySelector('#duplicate-keys').inert = true;
    try {
      this.data = await apiRequest('/api/duplicates', { action: 'update', version: Number(this.data.version), field_schema: this.data.field_schema, keys: this.editor.keys() });
      this.editor.render(this.data.fields, this.data.keys); this.status('Aturan disimpan.');
      document.dispatchEvent(new CustomEvent('records-changed', { detail: { type: 'participant', origin: 'duplicates' } }));
    } catch (error) { this.status(error.message, true); }
    finally { this.busy = false; this.button.disabled = false; document.querySelector('#duplicate-keys').inert = false; }
  }
}
