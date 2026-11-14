import { element } from './ui.js';

export class DuplicateRuleEditor {
  constructor(host, changed = () => {}) { this.host = host; this.changed = changed; }
  render(fields, keys) {
    this.host.replaceChildren(); this.inputs = new Map();
    for (const field of fields) {
      const label = element('label', undefined, 'duplicate-choice');
      const text = element('span', field.label), toggle = element('span', undefined, 'switch');
      const input = element('input'); input.type = 'checkbox'; input.checked = keys.includes(field.key); input.setAttribute('aria-label', `Kunci duplikasi ${field.label}`);
      input.addEventListener('change', this.changed); toggle.append(input, element('span')); label.append(text, toggle); this.host.append(label); this.inputs.set(field.key, input);
    }
  }
  keys() { return [...this.inputs].filter(([, input]) => input.checked).map(([key]) => key); }
}
