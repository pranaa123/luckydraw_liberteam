import { element } from './ui.js';
import { normalizeHeader } from './excel-values.js';

export class ImportMapping {
  constructor(host, changed, prefix = 'excel') { this.host = host; this.changed = changed; this.prefix = prefix; }
  render(fields, headers) {
    this.host.replaceChildren(); this.selects = new Map();
    for (const field of fields) {
      const label = element('label', field.label), select = element('select'); select.setAttribute(`data-${this.prefix}-field`, field.key);
      const empty = element('option', field.key === 'name' ? 'Pilih kolom Nama' : 'Tidak dipakai'); empty.value = ''; select.append(empty);
      for (const header of headers) {
        const option = element('option', `${header.column}. ${header.label}`); option.value = String(header.column); if (header.sample) option.title = header.sample; select.append(option);
      }
      const candidates = headers.filter(header => {
        const key = normalizeHeader(header.label);
        return key === normalizeHeader(field.label) || (field.key === 'name' && ['namalengkap', 'name', 'fullname', 'namapeserta'].includes(key));
      });
      if (candidates.length === 1) select.value = String(candidates[0].column);
      select.addEventListener('change', this.changed); label.append(select); this.host.append(label); this.selects.set(field.key, select);
    }
  }
  value() {
    const result = Object.fromEntries([...this.selects].filter(([, select]) => select.value).map(([key, select]) => [key, Number(select.value)]));
    if (!result.name) throw new Error('Tentukan kolom Nama.');
    if (new Set(Object.values(result)).size !== Object.keys(result).length) throw new Error('Satu kolom Excel hanya boleh dipakai untuk satu isian.');
    return result;
  }
}
