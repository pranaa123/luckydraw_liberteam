import { element } from './ui.js';


/** Switch visual saja; skema/isian peserta tetap milik ManagementController. */
export class FieldVisibilityControls {
  constructor(changed) {
    this.changed = changed; this.root = document.querySelector('#field-list');
    this.keys = Array.from({length:Number(this.root.dataset.maxFields)},(_,index)=>`show_field_${index+1}`);
    this.values = Object.fromEntries(this.keys.map(key => [key,true])); this.disabled = true;
  }
  start() {
    document.addEventListener('field-list-rendered',({ detail }) => this.render(detail));
    this.root.addEventListener('change',({ target }) => {
      const key = target.dataset.fieldVisibility;
      if (!this.keys.includes(key) || this.disabled) return;
      this.values[key] = target.checked; this.changed();
    });
  }
  render(fields) {
    for (const [index,field] of fields.entries()) {
      const row = this.root.children[index], label = element('label',undefined,'switch field-visibility-switch');
      const input = element('input'); input.type = 'checkbox'; input.dataset.fieldVisibility = `show_field_${field.slot}`;
      input.setAttribute('aria-label',`Tampilkan ${field.label} pada output`); label.title = `Tampilkan ${field.label} pada output`;
      label.append(input,element('span')); row.insertBefore(label,row.lastElementChild);
    }
    this.write();
  }
  fill(visual) { for (const key of this.keys) this.values[key] = visual[key] !== false; this.write(); }
  read() { return { ...this.values }; }
  setDisabled(disabled) { this.disabled = disabled; this.write(); }
  write() {
    for (const input of this.root.querySelectorAll('[data-field-visibility]')) {
      input.checked = this.values[input.dataset.fieldVisibility]; input.disabled = this.disabled;
    }
  }
}
