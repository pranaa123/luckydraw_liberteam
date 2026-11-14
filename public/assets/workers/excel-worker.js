import '../vendor/exceljs/exceljs.min.js';
import { createParticipantTemplate } from '../modules/excel-template.js';
import { cellText, normalizeHeader, assertWorkbookSize } from '../modules/excel-values.js';

let workbook, sheet, rowNumbers, mapping, cursor;
const safeText = cell => { try { return cellText(cell); } catch { return '[Sel tidak terbaca]'; } };
const isName = value => ['nama', 'namalengkap', 'name', 'fullname', 'namapeserta'].includes(normalizeHeader(value));

function describe(sheetName, headerRow) {
  sheet = workbook.getWorksheet(sheetName);
  if (!sheet) throw new Error('Sheet tidak ditemukan.');
  if (sheet.columnCount > 256 || sheet.rowCount > 1048576) throw new Error('Sheet mendukung maksimal 256 kolom.');
  if (!headerRow) {
    headerRow = 1; let best = -1;
    for (let index = 1; index <= Math.min(40, sheet.rowCount); index++) {
      const row = sheet.getRow(index);
      const values = row.values.slice(1).map(value => typeof value === 'string' ? value : '');
      const score = values.some(isName) ? 100 + values.filter(Boolean).length : values.filter(Boolean).length;
      if (score > best) { best = score; headerRow = index; }
    }
  }
  const headers = [];
  for (let col = 1; col <= sheet.columnCount; col++) headers.push({ column: col, label: safeText(sheet.getCell(headerRow, col)) || `Kolom ${col}`, sample: safeText(sheet.getCell(headerRow + 1, col)).slice(0, 60) });
  return { sheets: workbook.worksheets.map(item => item.name), sheet: sheet.name, header_row: headerRow, headers };
}

async function execute(type, data) {
  if (type === 'template') {
    const book = createParticipantTemplate(globalThis.ExcelJS, { ...data, fields: data.fields.filter(field => field.key !== 'name') });
    return { buffer: await book.xlsx.writeBuffer() };
  }
  if (type === 'load') {
    assertWorkbookSize(data.buffer);
    workbook = new globalThis.ExcelJS.Workbook(); await workbook.xlsx.load(data.buffer);
    if (!workbook.worksheets.length || workbook.worksheets.length > 50) throw new Error('Berkas harus berisi 1–50 sheet.');
    const preferred = workbook.worksheets.find(item => normalizeHeader(item.name) === 'peserta') || workbook.worksheets[0];
    return describe(preferred.name);
  }
  if (type === 'sheet') return describe(data.sheet, data.header_row);
  if (type === 'prepare') {
    mapping = data.mapping; cursor = 0; rowNumbers = [];
    sheet.eachRow((row, number) => {
      if (number > data.header_row && Object.values(mapping).some(column => safeText(row.getCell(column)) !== '')) rowNumbers.push(number);
    });
    if (!rowNumbers.length) throw new Error('Tidak ada data setelah baris header.');
    if (rowNumbers.length > 100000) throw new Error('Maksimal 100.000 baris per import.');
    return { total: rowNumbers.length };
  }
  if (type === 'chunk') {
    const rows = []; let bytes = 0;
    while (cursor < rowNumbers.length && rows.length < 200) {
      const number = rowNumbers[cursor], row = { row_number: number };
      for (const [key, column] of Object.entries(mapping)) {
        try { row[key] = cellText(sheet.getCell(number, column)); } catch { row[key] = ''; row.issue = 'Sel tidak terbaca'; }
        if (row[key].length > 1000) { row[key] = row[key].slice(0, 1000); row.issue = 'Isian terlalu panjang'; }
      }
      const size = new TextEncoder().encode(JSON.stringify(row)).length + 1;
      if (rows.length && bytes + size > 45000) break;
      bytes += size; rows.push(row); cursor++;
    }
    return { rows, done: cursor === rowNumbers.length };
  }
  throw new Error('Aksi Excel tidak dikenal.');
}

self.onmessage = async ({ data: { id, type, data } }) => {
  try {
    const result = await execute(type, data);
    if (result.buffer) {
      const buffer = result.buffer instanceof ArrayBuffer ? result.buffer : result.buffer.buffer.slice(result.buffer.byteOffset, result.buffer.byteOffset + result.buffer.byteLength);
      self.postMessage({ id, result: { buffer } }, [buffer]);
    } else self.postMessage({ id, result });
  } catch (error) { self.postMessage({ id, error: error.message || 'Berkas Excel tidak dapat dibaca.' }); }
};
