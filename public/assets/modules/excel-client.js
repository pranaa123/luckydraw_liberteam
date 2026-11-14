/** Worker baru hanya dibuat ketika template/import dibuka. Tidak membebani pengundian. */
export class ExcelClient {
  constructor() {
    this.sequence = 0; this.pending = new Map();
    this.worker = new Worker('/assets/workers/excel-worker.js', { type: 'module' });
    this.worker.onmessage = ({ data }) => {
      const request = this.pending.get(data.id); if (!request) return;
      this.pending.delete(data.id); data.error ? request.reject(new Error(data.error)) : request.resolve(data.result);
    };
    this.worker.onerror = () => this.fail('Modul Excel tidak dapat dimuat. Muat ulang aplikasi.');
  }
  request(type, data = {}, transfers = []) {
    if (this.failed) return Promise.reject(new Error(this.failed));
    return new Promise((resolve, reject) => { const id = ++this.sequence; this.pending.set(id, { resolve, reject }); this.worker.postMessage({ id, type, data }, transfers); });
  }
  fail(message) { this.failed = message; for (const task of this.pending.values()) task.reject(new Error(message)); this.pending.clear(); }
  close() { this.worker.terminate(); this.fail('Pembacaan Excel dibatalkan.'); }
}
