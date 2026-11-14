/** Dibuat hanya saat export. Menutup worker juga membatalkan pengambilan halaman/PDF. */
export class ReportClient {
  constructor() {
    this.worker = new Worker('/assets/workers/winner-report-worker.js',{ type: 'module' });
  }
  generate(progress) {
    return new Promise((resolve,reject)=>{
      this.reject = reject;
      this.worker.onmessage = ({ data }) => {
        if (this.closed) return;
        if (data.status === 401) expireSession();
        if (data.progress) { progress(data.progress); return; }
        this.reject = null;
        data.error ? reject(new Error(data.error)) : resolve(data.result);
      };
      this.worker.onerror = event => { event.preventDefault(); this.reject = null; reject(new Error('Modul PDF tidak dapat dimuat. Coba export lagi.')); };
      this.worker.postMessage({ id: 1,headers:authHeaders() });
    });
  }
  close() {
    this.closed = true; this.worker.onmessage = null; this.worker.onerror = null;
    this.worker.terminate(); this.reject?.(new Error('Export dibatalkan.')); this.reject = null;
  }
}
import { authHeaders,expireSession } from './auth-context.js';
