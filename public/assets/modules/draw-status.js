/** Status operator berasal dari putaran tersimpan, tanpa request tambahan. */
export class DrawStatus {
  constructor() {
    this.badge = document.querySelector('#draw-session-status');
    this.label = document.querySelector('#visual-status');
    this.message = document.querySelector('#draw-pending-message');
    this.lock = document.querySelector('#draw-lock-notice');
    this.reason = document.querySelector('#draw-lock-reason');
    this.clear = document.querySelector('#draw-clear');
    this.controls = ['#winner-count','#draw-with-prizes','#draw-random-prizes','#draw-filter-menu summary'].map(selector=>document.querySelector(selector));
  }

  render(state) {
    const draw = state?.draw;
    const pending = draw?.status === 'pending';
    const rolling = pending && draw.phase === 'rolling';
    const status = !state ? 'loading' : rolling ? 'rolling' : pending ? 'pending' : draw?.status === 'confirmed' ? 'confirmed' : 'ready';
    this.badge.dataset.state = status;
    this.label.textContent = {loading:'Menghubungkan…',ready:'Siap mengundi',rolling:'Sedang mengundi',pending:'Menunggu keputusan',confirmed:'Disahkan'}[status];
    this.message.hidden = !pending;
    this.message.textContent = !pending ? '' : rolling ? 'Tekan Stop untuk menampilkan hasil undian.' : 'Pilih Sahkan, Eliminasi, atau Kosongkan untuk melanjutkan.';
    this.lock.hidden = !pending;
    this.clear.title = pending ? 'Batalkan undian tanpa mengesahkan atau mengeliminasi peserta dan tanpa mengurangi hadiah' : 'Kosongkan tampilan; pengesahan sebelumnya tetap tersimpan';
    this.reason.textContent = !pending ? '' : rolling ? 'Pengaturan terkunci selama pengundian.' : 'Pengaturan terkunci sampai hasil diputuskan.';
    for (const control of this.controls) {
      if (pending) control.setAttribute('aria-describedby','draw-lock-notice');
      else control.removeAttribute('aria-describedby');
    }
  }
}
