import { element } from './ui.js';

export class ImportPreview {
  summary(data) {
    const host = document.querySelector('#excel-summary'); host.replaceChildren();
    for (const [key, label] of [['available', 'Tersedia'], ['duplicates', 'Duplikat'], ['invalid', 'Tidak valid']]) host.append(element('span', `${label} · ${data[key].toLocaleString('id-ID')}`, 'quiet-badge'));
    document.querySelector('#excel-impact').textContent = [data.invalid ? `${data.invalid} baris tidak valid dilewati saat import.` : '', data.existing_changes ? `${data.existing_changes} peserta lama berubah status mengikuti aturan.` : '', data.rule_changed ? 'Aturan duplikasi ini akan disimpan bersama import.' : ''].filter(Boolean).join(' ');
    document.querySelector('#excel-preview').hidden = false;
  }
  rows(data, fields, page) {
    const host = document.querySelector('#excel-preview-table'), table = element('table', undefined, 'participant-table');
    const head = element('thead'), header = element('tr');
    for (const label of ['Baris', ...fields.map(field => field.label), 'Hasil']) header.append(element('th', label));
    head.append(header); const body = element('tbody');
    for (const record of data.items) {
      const row = element('tr'); row.dataset.previewStatus = record.preview_status;
      row.append(element('td', String(record.row_number)));
      for (const field of fields) row.append(element('td', record[field.key] || '—'));
      const result = element('td');
      result.append(element('span', { available: 'Tersedia', duplicate: 'Duplikat', invalid: 'Tidak valid' }[record.preview_status]));
      if (record.issue || record.keeper_name) result.append(element('small', record.issue || `Dipertahankan: ${record.keeper_name}`, 'field-hint'));
      row.append(result); body.append(row);
    }
    table.append(head, body); host.replaceChildren(table); host.scrollTop = 0;
    document.querySelector('#excel-page').textContent = `Halaman ${page}`;
    document.querySelector('#excel-previous').disabled = page === 1;
    document.querySelector('#excel-next').disabled = data.next === null;
  }
}
