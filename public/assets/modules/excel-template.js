const palette = { blue: '2563EB', navy: '172B4D', pale: 'EFF6FF', muted: '64748B', line: 'DBE5F3', white: 'FFFFFF' };
const fill = color => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${color}` } });

export function createParticipantTemplate(ExcelJS, metadata) {
  const book = new ExcelJS.Workbook();
  book.creator = 'Doorprize'; book.subject = 'Template data peserta'; book.description = 'Isi sheet Peserta; contoh terpisah di Panduan.';
  const fields = [{ key: 'name', label: 'Nama' }, ...metadata.fields];
  const last = String.fromCharCode(64 + fields.length);
  const sheet = book.addWorksheet('Peserta', { properties: { tabColor: { argb: `FF${palette.blue}` } }, views: [{ state: 'frozen', ySplit: 6, topLeftCell: 'A7', activeCell: 'A7', showGridLines: false }], pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:6', margins: { left: .3, right: .3, top: .4, bottom: .4, header: .15, footer: .15 } } });
  sheet.columns = fields.map((field, index) => ({ key: field.key, width: fields.length === 1 ? 58 : index === 0 ? 34 : Math.min(38, Math.max(24, field.label.length + 6)), style: { font: { name: 'Calibri', size: 11, color: { argb: `FF${palette.navy}` } }, numFmt: '@', alignment: { vertical: 'middle', wrapText: true } } }));
  const banner = (row, value, size, color, background, height, bold = false) => {
    if (fields.length > 1) sheet.mergeCells(`A${row}:${last}${row}`);
    const cell = sheet.getCell(`A${row}`); cell.value = value; cell.font = { name: 'Calibri', size, bold, color: { argb: `FF${color}` } };
    cell.fill = fill(background); cell.alignment = { vertical: 'middle', wrapText: true, indent: 1 }; sheet.getRow(row).height = height;
  };
  banner(1, 'DAFTAR PESERTA DOORPRIZE', 17, palette.white, palette.blue, 38, true);
  banner(2, [metadata.client_name, metadata.event_name].filter(Boolean).join(' · ') || 'Template input peserta', 11, palette.navy, palette.pale, 34);
  banner(3, 'Nama wajib diisi · Satu peserta per baris · Kolom lain opsional', 10, palette.muted, palette.white, 30);
  banner(4, 'Mulai isi pada baris 7. Contoh dan petunjuk ada di sheet Panduan.', 10, palette.muted, palette.white, 28);
  sheet.getRow(5).height = 10;
  sheet.addTable({ name: 'DaftarPeserta', ref: 'A6', headerRow: true, totalsRow: false,
    style: { theme: 'TableStyleMedium2', showRowStripes: true }, columns: fields.map(field => ({ name: field.label, filterButton: true })),
    rows: Array.from({ length: 200 }, () => fields.map(() => null)) });
  sheet.getRow(6).height = 28;
  for (let col = 1; col <= fields.length; col++) {
    const header = sheet.getCell(6, col); header.fill = fill(palette.blue); header.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }; header.alignment = { vertical: 'middle', indent: 1 };
    for (let row = 7; row <= 206; row++) {
      const cell = sheet.getCell(row, col); cell.numFmt = '@'; cell.fill = fill(row % 2 ? palette.white : 'F3F7FD');
      cell.border = { bottom: { style: 'hair', color: { argb: `FF${palette.line}` } } };
      cell.alignment = { vertical: 'middle', wrapText: true, indent: 1 };
      cell.dataValidation = { type: 'textLength', operator: 'lessThanOrEqual', formulae: [200], allowBlank: true, showInputMessage: true,
        promptTitle: fields[col - 1].label, prompt: col === 1 ? 'Isi nama untuk setiap baris peserta. Jangan isi baris contoh di sini.' : 'Format teks menjaga nol di depan nomor/ID.' };
      sheet.getRow(row).height = 25;
    }
  }
  sheet.addConditionalFormatting({ ref: `A7:${last}206`, rules: [{ type: 'expression', formulae: [`AND(COUNTA($A7:$${last}7)>0,LEN(TRIM($A7))=0)`], style: { fill: fill('FFF1F2'), font: { color: { argb: 'FFBE123C' } } } }] });
  sheet.headerFooter.oddFooter = 'Doorprize · Template peserta &RHalaman &P / &N';

  const guide = book.addWorksheet('Panduan', { views: [{ showGridLines: false }] });
  guide.columns = [{ width: 5 }, { width: 31 }, { width: 62 }, { width: 30 }, { width: 30 }];
  guide.mergeCells('B2:E2'); guide.getCell('B2').value = 'PANDUAN PENGISIAN'; guide.getCell('B2').font = { name: 'Calibri', size: 17, bold: true, color: { argb: `FF${palette.blue}` } }; guide.getRow(2).height = 34;
  const notes = [
    ['01', 'Isi sheet Peserta', 'Kolom mengikuti pengaturan isian undian. Baris contoh di sheet ini tidak ikut diimpor.'],
    ['02', 'Nama harus terisi', 'Biarkan baris yang tidak digunakan tetap kosong. Baris dengan data lain tetapi tanpa nama ditandai tidak valid.'],
    ['03', 'Nomor dan ID sebagai teks', 'Kolom sudah diformat teks agar 00123 atau nomor telepon tetap utuh.'],
    ['04', 'Data boleh ditambah', 'Lanjutkan baris di bawah tabel jika perlu. Pertahankan urutan/header agar pemetaan otomatis mudah.'],
    ['05', 'Duplikasi sesuai pilihan', 'Sistem membandingkan semua kunci yang dicentang tanpa membedakan huruf besar/kecil. Kunci yang belum lengkap dilewati.'],
  ];
  notes.forEach(([number, title, text], index) => {
    const row = index + 4; guide.getCell(row, 1).value = number; guide.getCell(row, 2).value = title; guide.mergeCells(`C${row}:E${row}`); guide.getCell(row, 3).value = text; guide.getRow(row).height = 42;
    for (let col = 1; col <= 5; col++) { const cell = guide.getCell(row, col); cell.font = { name: 'Calibri', size: 11, bold: col === 2, color: { argb: `FF${col === 1 ? palette.blue : palette.navy}` } }; cell.alignment = { wrapText: true, vertical: 'middle' }; cell.fill = fill(index % 2 ? palette.white : palette.pale); }
  });
  guide.mergeCells('B11:E11'); guide.getCell('B11').value = 'CONTOH — TIDAK DIIMPOR'; guide.getCell('B11').font = { name: 'Calibri', size: 12, bold: true, color: { argb: `FF${palette.blue}` } };
  for (let col = 1; col <= fields.length; col++) { const cell = guide.getCell(12, col + 1); cell.value = fields[col - 1].label; cell.fill = fill(palette.blue); cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }; }
  for (const [index, name] of ['Andi Saputra', 'Dewi Lestari', 'Rizky Pratama'].entries()) {
    guide.getRow(index + 13).height = 25;
    fields.forEach((field, col) => { const cell = guide.getCell(index + 13, col + 2); cell.value = col === 0 ? name : `Contoh ${field.label} ${index + 1}`; cell.numFmt = '@'; cell.font = { name: 'Calibri', size: 11, color: { argb: `FF${palette.navy}` } }; cell.fill = fill(index % 2 ? palette.white : palette.pale); });
  }
  return book;
}
