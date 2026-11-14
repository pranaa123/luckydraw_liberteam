import '../vendor/pdfmake/pdfmake.min.js';
import '../vendor/pdfmake/vfs_fonts.js';
import { createWinnerReport,winnerFilename } from '../modules/winner-report.js';

let requestId;
const fail = error => self.postMessage({ id: requestId,status:error?.status,error: error?.message || 'PDF belum dapat dibuat. Coba lagi.' });
self.addEventListener('unhandledrejection',event=>{ event.preventDefault(); fail(event.reason); });
self.onmessage = async ({ data: { id,headers } }) => {
  requestId = id;
  try {
    const items = []; let cursor = '', snapshot, meta;
    const seen = new Set();
    do {
      const response = await fetch(`/api/winners?export=1${cursor}`,{ cache: 'no-store',headers });
      const page = await response.json();
      if (!response.ok) { const error = Error(page.error || 'Daftar pemenang tidak dapat dimuat.'); error.status = response.status; throw error; }
      if (!meta) { meta = page.meta; snapshot = page.snapshot; }
      if (!meta || !Array.isArray(page.items) || page.snapshot !== snapshot) throw Error('Data laporan tidak sesuai. Coba lagi.');
      items.push(...page.items);
      self.postMessage({ id,progress: { loaded: items.length,total: meta.total } });
      if (!page.next) break;
      cursor = `&snapshot=${snapshot}&after_draw=${page.next.draw_id}&after_position=${page.next.position}`;
      if (seen.has(cursor) || !page.items.length) throw Error('Halaman laporan tidak sesuai. Coba lagi.');
      seen.add(cursor);
    } while (true);
    if (items.length !== meta.total) throw Error('Jumlah pemenang laporan tidak sesuai. Coba lagi.');
    const definition = createWinnerReport(meta,items);
    globalThis.pdfMake.createPdf(definition).getBuffer(bytes=>{
      const buffer = bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset + bytes.byteLength);
      self.postMessage({ id,result: { buffer,filename: winnerFilename(meta) } },[buffer]);
    });
  } catch (error) { fail(error); }
};
