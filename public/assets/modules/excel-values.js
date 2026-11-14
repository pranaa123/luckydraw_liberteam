export const normalizeHeader = value => String(value).normalize('NFKC').trim().toLocaleLowerCase('id').replace(/[^\p{L}\p{N}]+/gu, '');

export function cellText(cell) {
  let value = cell.value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && !(value instanceof Date)) {
    if ('formula' in value || 'sharedFormula' in value) {
      if (value.result === undefined || value.result === null) throw new Error('Rumus belum memiliki hasil tersimpan.');
      value = value.result;
    } else if (value.richText) value = value.richText.map(part => part.text).join('');
    else if ('text' in value) value = value.text;
    else throw new Error('Nilai sel tidak didukung.');
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') throw new Error('Hasil rumus tidak valid.');
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Angka tidak valid.');
    if (Number.isInteger(value) && value >= 0 && /^0{1,30}$/.test(cell.numFmt || '')) return String(value).padStart(cell.numFmt.length, '0');
  }
  return String(value).trim();
}

/** Periksa ukuran hasil dekompresi sebelum ExcelJS membuka ZIP XLSX. */
export function assertWorkbookSize(buffer) {
  if (buffer.byteLength > 20 * 1024 * 1024) throw new Error('Ukuran berkas maksimal 20 MB.');
  const view = new DataView(buffer); let end = -1;
  for (let pos = buffer.byteLength - 22; pos >= Math.max(0, buffer.byteLength - 65557); pos--) {
    if (view.getUint32(pos, true) === 0x06054b50 && pos + 22 + view.getUint16(pos + 20, true) === buffer.byteLength) { end = pos; break; }
  }
  if (end < 0 || view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) throw new Error('Berkas XLSX tidak valid.');
  const entries = view.getUint16(end + 10, true); let pos = view.getUint32(end + 16, true), total = 0;
  if (entries > 4096 || pos + view.getUint32(end + 12, true) > end) throw new Error('Struktur berkas Excel terlalu besar.');
  for (let index = 0; index < entries; index++) {
    if (pos + 46 > end || view.getUint32(pos, true) !== 0x02014b50) throw new Error('Struktur berkas XLSX tidak valid.');
    total += view.getUint32(pos + 24, true);
    if (total > 128 * 1024 * 1024 || view.getUint16(pos + 8, true) & 1) throw new Error('Berkas Excel terlalu besar atau diproteksi kata sandi.');
    pos += 46 + view.getUint16(pos + 28, true) + view.getUint16(pos + 30, true) + view.getUint16(pos + 32, true);
  }
}
