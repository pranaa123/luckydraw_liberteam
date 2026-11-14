/* Konektor Doorprize. Tempel seluruh kode, jalankan pasangDoorprize sekali,
 * lalu deploy sebagai Web app: Execute as Me, akses Anyone.
 * Jangan ubah/hapus kolom ID tersembunyi. Sortir seluruh baris, bukan sebagian kolom.
 */
const DOORPRIZE = __DOORPRIZE_CONFIG__;

function dpBook_() { return SpreadsheetApp.openById(DOORPRIZE.spreadsheetId); }
function dpSheet_() {
  const stored = dpProps_().getProperty(dpProp_('sheet_id'));
  const selected = DOORPRIZE.sheetId == null ? (stored === null ? null : Number(stored)) : DOORPRIZE.sheetId;
  const sheet = selected == null ? dpBook_().getSheets()[0] : dpBook_().getSheetById(selected);
  if (!sheet) throw new Error('SHEET_NOT_FOUND');
  return sheet;
}
function dpPrefix_() { return '_Doorprize_' + DOORPRIZE.connectorId; }
function dpProps_() { return PropertiesService.getScriptProperties(); }
function dpProp_(key) { return dpPrefix_() + '_' + key; }
function dpLog_() { return dpBook_().getSheetByName(dpPrefix_() + '_log'); }
function dpKnown_() { return dpBook_().getSheetByName(dpPrefix_() + '_ids'); }
function dpBase_() {
  let id = DOORPRIZE.sheetId;
  if (id == null) { try { id = dpSheet_().getSheetId(); } catch (error) { id = 0; } }
  return { protocol: 1, spreadsheet_id: DOORPRIZE.spreadsheetId, sheet_id: id };
}
function dpJson_(data) { return ContentService.createTextOutput(JSON.stringify(Object.assign(dpBase_(), data))).setMimeType(ContentService.MimeType.JSON); }
function dpLocked_(operation, timeout) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(timeout || 3000)) throw new Error('BUSY');
  try { return operation(); } finally { SpreadsheetApp.flush(); lock.releaseLock(); }
}
function dpHeader_() {
  const sheet = dpSheet_(); const width = Math.max(1, sheet.getLastColumn());
  if (width > 257) throw new Error('TOO_MANY_COLUMNS');
  const raw = sheet.getRange(DOORPRIZE.headerRow, 1, 1, width).getDisplayValues()[0];
  const headers = []; let idColumn = 0;
  raw.forEach(function (label, index) {
    if (label === '_DOORPRIZE_ID') idColumn = index + 1;
    else headers.push({ column: index + 1, label: label || 'Kolom ' + (index + 1) });
  });
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(headers), Utilities.Charset.UTF_8);
  const hash = digest.map(function (value) { return ('0' + (value & 255).toString(16)).slice(-2); }).join('');
  return { headers: headers, idColumn: idColumn, header_hash: hash, sheet_name: sheet.getName(), header_row: DOORPRIZE.headerRow, last_row: sheet.getLastRow() };
}
function dpEnsureRows_(sheet, last) {
  if (sheet.getMaxRows() < last) sheet.insertRowsAfter(sheet.getMaxRows(), last - sheet.getMaxRows());
}

function pasangDoorprize() {
  dpLocked_(function () {
    const sheet = dpSheet_(); dpProps_().setProperty(dpProp_('sheet_id'), String(sheet.getSheetId())); let header = dpHeader_();
    if (!header.idColumn) {
      const column = Math.max(1, sheet.getLastColumn()) + 1;
      if (column > sheet.getMaxColumns()) sheet.insertColumnAfter(sheet.getMaxColumns());
      sheet.getRange(DOORPRIZE.headerRow, column).setValue('_DOORPRIZE_ID');
      sheet.hideColumns(column); header = dpHeader_();
    }
    let log = dpLog_();
    if (!log) { log = dpBook_().insertSheet(dpPrefix_() + '_log'); log.getRange(1, 1, 1, 6).setValues([['Urutan','ID','Aksi','Baris','Data','Waktu']]); log.hideSheet(); }
    let known = dpKnown_();
    if (!known) {
      known = dpBook_().insertSheet(dpPrefix_() + '_ids'); known.getRange(1, 1, 1, 3).setValues([['ID','Baris','Aktif']]); known.hideSheet();
      const length = Math.max(0, sheet.getLastRow() - DOORPRIZE.headerRow);
      if (length) {
        const ids = sheet.getRange(DOORPRIZE.headerRow + 1, header.idColumn, length, 1).getDisplayValues();
        const entries = ids.map(function (row, index) { return [row[0], DOORPRIZE.headerRow + 1 + index, true]; }).filter(function (row) { return !!row[0]; });
        if (entries.length) { dpEnsureRows_(known, entries.length + 1); known.getRange(2, 1, entries.length, 3).setValues(entries); }
      }
    }
    dpProps_().setProperty(dpProp_('installed'), '1');
    if (!dpProps_().getProperty(dpProp_('epoch'))) dpProps_().setProperty(dpProp_('epoch'), '1');
    const handlers = ['doorprizeFormSubmit','doorprizeEdit','doorprizeChange'];
    ScriptApp.getProjectTriggers().forEach(function (trigger) { if (handlers.indexOf(trigger.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(trigger); });
    ScriptApp.newTrigger('doorprizeFormSubmit').forSpreadsheet(dpBook_()).onFormSubmit().create();
    ScriptApp.newTrigger('doorprizeEdit').forSpreadsheet(dpBook_()).onEdit().create();
    ScriptApp.newTrigger('doorprizeChange').forSpreadsheet(dpBook_()).onChange().create();
  });
  dpBook_().toast('Konektor siap. Deploy sebagai Web app, lalu hubungkan URL ke aplikasi Doorprize.', 'Doorprize', 10);
}

function dpColumns_() { return JSON.parse(dpProps_().getProperty(dpProp_('columns')) || '[]'); }
function dpSetColumns_(columns) {
  if (!Array.isArray(columns) || !columns.length || columns.length > 4 || columns.some(function (value) { return !Number.isInteger(value) || value < 1 || value > 256; })) throw new Error('BAD_COLUMNS');
  dpProps_().setProperty(dpProp_('columns'), JSON.stringify(columns));
}
function dpText_(value) {
  const original = String(value == null ? '' : value); let text = '', bytes = 0;
  for (const character of original) {
    const point = character.codePointAt(0), size = point <= 127 ? 1 : point <= 2047 ? 2 : point <= 65535 ? 3 : 4;
    if (bytes + size > 200) return { text: text, issue: true };
    text += character; bytes += size;
  }
  return { text: text, issue: false };
}

function dpProject_(values, columns) {
  const result = {}, issues = [];
  columns.forEach(function (column) { const cell = dpText_(values[column - 1]); result[column] = cell.text; if (cell.issue) issues.push(column); });
  return { values: result, issue: issues.length ? 'LONG_CELL' : '' };
}
function dpAppend_(events) {
  if (!events.length) return;
  const log = dpLog_(), first = log.getLastRow() + 1;
  const records = events.map(function (event, index) { return [first + index - 1, event.key, event.operation, event.row_number, JSON.stringify({ values: event.values || {}, issue: event.issue || '' }), new Date().toISOString()]; });
  dpEnsureRows_(log, first + records.length - 1); log.getRange(first, 1, records.length, 6).setValues(records);
}
function dpReadRows_(start, count, columns) {
  if (!count) return [];
  const sheet = dpSheet_(), header = dpHeader_(), width = Math.max(header.idColumn, Math.max.apply(null, columns));
  if (!header.idColumn) throw new Error('NOT_INSTALLED');
  const values = sheet.getRange(start, 1, count, width).getDisplayValues();
  const events = [], ids = [], newIds = []; let changedIds = false;
  values.forEach(function (row, index) {
    const projected = dpProject_(row, columns), present = Object.keys(projected.values).some(function (key) { return projected.values[key].trim() !== ''; });
    let key = row[header.idColumn - 1];
    if (!key && present) { key = Utilities.getUuid(); changedIds = true; newIds.push([key, start + index, true]); }
    ids.push([key || '']);
    if (key) events.push(Object.assign({ key: key, row_number: start + index, operation: present ? 'upsert' : 'delete' }, projected));
  });
  if (changedIds) sheet.getRange(start, header.idColumn, count, 1).setValues(ids);
  if (newIds.length) { const known = dpKnown_(), first = known.getLastRow() + 1; dpEnsureRows_(known, first + newIds.length - 1); known.getRange(first, 1, newIds.length, 3).setValues(newIds); }
  return events;
}
function dpRecordRange_(range) {
  if (!range || range.getSheet().getSheetId() !== dpSheet_().getSheetId() || !dpProps_().getProperty(dpProp_('installed')) || !dpColumns_().length) return;
  // Catat pointer dahulu: bila eksekusi terhenti, request berikutnya tetap dapat melanjutkan.
  dpProps_().setProperty(dpProp_('dirty_' + Utilities.getUuid()), JSON.stringify({ start: range.getRow(), end: range.getLastRow() }));
  try { dpLocked_(function () { dpDrainDirty_(dpColumns_()); }, 25000); } catch (error) { /* Pointer tetap tersimpan untuk percobaan berikutnya. */ }
}

function dpDrainDirty_(columns) {
  const properties = dpProps_().getProperties(), prefix = dpProp_('dirty_'); let budget = 200;
  Object.keys(properties).filter(function (key) { return key.indexOf(prefix) === 0; }).some(function (key) {
    const range = JSON.parse(properties[key]), start = Math.max(DOORPRIZE.headerRow + 1, range.start), last = Math.min(range.end, dpSheet_().getLastRow());
    const count = Math.max(0, Math.min(budget, last - start + 1));
    if (count) { dpAppend_(dpReadRows_(start, count, columns)); budget -= count; }
    if (start + count > last) dpProps_().deleteProperty(key);
    else dpProps_().setProperty(key, JSON.stringify({ start: start + count, end: range.end }));
    return budget <= 0;
  });
}
function dpCatchUpTail_(columns) {
  const after = Number(dpProps_().getProperty(dpProp_('scan_after')) || DOORPRIZE.headerRow), last = dpSheet_().getLastRow();
  const count = Math.min(200, Math.max(0, last - after));
  if (count) { dpAppend_(dpReadRows_(after + 1, count, columns)); dpProps_().setProperty(dpProp_('scan_after'), String(after + count)); }
  return after + count < last;
}

function doorprizeFormSubmit(event) { if (event && event.range) dpRecordRange_(event.range); }
function doorprizeEdit(event) { if (event && event.range) dpRecordRange_(event.range); }
// Bila skrip/API lain mengubah sel, panggil fungsi ini dari skrip tersebut sesudah menulis.
function catatPerubahanDoorprize(barisAwal, jumlahBaris) { dpRecordRange_(dpSheet_().getRange(barisAwal, 1, jumlahBaris || 1, 1)); }
function doorprizeChange(event) {
  if (!event || ['REMOVE_ROW','OTHER'].indexOf(event.changeType) < 0) return;
  dpLocked_(function () {
    if (!dpProps_().getProperty(dpProp_('installed'))) return;
    if (event.changeType === 'REMOVE_ROW') {
      const sheet = dpSheet_(), header = dpHeader_(), length = Math.max(0, sheet.getLastRow() - DOORPRIZE.headerRow), current = new Set();
      if (length) sheet.getRange(DOORPRIZE.headerRow + 1, header.idColumn, length, 1).getDisplayValues().forEach(function (row) { if (row[0]) current.add(row[0]); });
      const known = dpKnown_(), count = Math.max(0, known.getLastRow() - 1), removed = [];
      if (count) known.getRange(2, 1, count, 3).getValues().forEach(function (row, index) {
        if (row[2] && !current.has(row[0])) { removed.push({ key: row[0], row_number: Number(row[1]), operation: 'delete' }); known.getRange(index + 2, 3).setValue(false); }
      });
      dpAppend_(removed);
    }
    const epoch = Number(dpProps_().getProperty(dpProp_('epoch')) || '1'); dpProps_().setProperty(dpProp_('epoch'), String(epoch + 1));
  });
}

function doGet() { return dpJson_({ message: 'Konektor Doorprize. Hubungkan URL ini melalui aplikasi.' }); }
function doPost(event) {
  try {
    if (!event || !event.postData || event.postData.contents.length > 16000) return dpJson_({ error: 'BAD_REQUEST' });
    const request = JSON.parse(event.postData.contents);
    let mismatch = typeof request.secret === 'string' && request.secret.length === DOORPRIZE.secret.length ? 0 : 1;
    if (!mismatch) for (let index = 0; index < DOORPRIZE.secret.length; index++) mismatch |= DOORPRIZE.secret.charCodeAt(index) ^ request.secret.charCodeAt(index);
    if (mismatch) return dpJson_({ error: 'UNAUTHORIZED' });
    if (!dpProps_().getProperty(dpProp_('installed'))) return dpJson_({ error: 'NOT_INSTALLED' });
    return dpLocked_(function () {
      const header = dpHeader_(); if (!header.idColumn) throw new Error('NOT_INSTALLED');
      if (request.action === 'probe') {
        const count = Math.min(5, Math.max(0, header.last_row - DOORPRIZE.headerRow));
        const sample = count ? dpSheet_().getRange(DOORPRIZE.headerRow + 1, 1, count, Math.max(1, header.idColumn - 1)).getDisplayValues().map(function (row) { return row.map(function (cell) { return dpText_(cell).text; }); }) : [];
        return dpJson_(Object.assign({}, header, { sample: sample }));
      }
      if (header.header_hash !== request.header_hash) throw new Error('HEADER_CHANGED');
      const cursor = request.cursor || {}, epoch = Number(dpProps_().getProperty(dpProp_('epoch')) || '1');
      if (cursor.epoch != null && cursor.epoch !== epoch) throw new Error('RESET_REQUIRED');
      const limit = Math.min(200, Math.max(1, Number(request.limit) || 200));
      if (!Number.isInteger(cursor.after) || cursor.after < 0) throw new Error('BAD_CURSOR');
      const log = dpLog_(); let latest = Math.max(0, log.getLastRow() - 1);
      if (request.action === 'snapshot') {
        dpSetColumns_(request.columns);
        if (header.last_row - DOORPRIZE.headerRow > 100000) throw new Error('TOO_MANY_ROWS');
        const count = Math.min(limit, Math.max(0, header.last_row - cursor.after)), after = cursor.after + count;
        const events = dpReadRows_(cursor.after + 1, count, request.columns), done = after >= header.last_row;
        if (done) dpProps_().setProperty(dpProp_('scan_after'), String(after));
        return dpJson_({ events: events, header_hash: header.header_hash, after: after, epoch: epoch, watermark: cursor.watermark == null ? latest : cursor.watermark, done: done, more: !done || latest > (cursor.watermark == null ? latest : cursor.watermark) });
      }
      if (request.action === 'changes') {
        dpDrainDirty_(dpColumns_()); const tailPending = dpCatchUpTail_(dpColumns_()); latest = Math.max(0, log.getLastRow() - 1);
        if (cursor.after > latest) throw new Error('RESET_REQUIRED');
        const count = Math.min(limit, latest - cursor.after), after = cursor.after + count;
        const events = count ? log.getRange(cursor.after + 2, 1, count, 6).getValues().map(function (row) {
          const data = JSON.parse(row[4]); return { key: row[1], operation: row[2], row_number: Number(row[3]), values: data.values, issue: data.issue };
        }) : [];
        return dpJson_({ events: events, header_hash: header.header_hash, after: after, epoch: epoch, watermark: latest, done: true, more: after < latest || tailPending });
      }
      throw new Error('BAD_ACTION');
    });
  } catch (error) {
    const known = ['BUSY','NOT_INSTALLED','HEADER_CHANGED','RESET_REQUIRED','BAD_COLUMNS','BAD_CURSOR','TOO_MANY_ROWS','TOO_MANY_COLUMNS','SHEET_NOT_FOUND'];
    return dpJson_({ error: known.indexOf(error.message) >= 0 ? error.message : 'CONNECTOR_ERROR' });
  }
}
