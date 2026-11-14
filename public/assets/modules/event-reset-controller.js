import { apiRequest } from './api-client.js';
import { changeEvent } from './event-lifecycle.js';

export class EventResetController {
  start() {
    this.dialog = document.querySelector('#event-reset-dialog');
    this.form = document.querySelector('#event-reset-form');
    this.input = document.querySelector('#event-reset-confirmation');
    this.submit = document.querySelector('#event-reset-submit');
    this.error = document.querySelector('#event-reset-error');
    this.summary = document.querySelector('#event-reset-summary');
    this.close = [...this.dialog.querySelectorAll('[data-reset-close]')];
    const open = document.querySelector('#event-reset-open');
    open.addEventListener('click', () => this.open());
    open.disabled = false;
    for (const button of this.close) button.addEventListener('click', () => { if (!this.busy) this.dialog.close(); });
    this.dialog.addEventListener('cancel', event => { if (this.busy) event.preventDefault(); });
    this.input.addEventListener('input', () => this.update());
    this.form.addEventListener('submit', event => this.reset(event));
    if (Number(document.querySelector('meta[name="event-cleanup"]')?.content)>0) this.cleanup();
  }

  update() {
    this.submit.disabled = this.busy || !this.snapshot || this.input.value !== 'RESET';
  }

  async open() {
    const generation = this.generation = (this.generation || 0)+1;
    this.snapshot = null;
    this.form.reset();
    this.error.hidden = true;
    this.summary.textContent = 'Memuat ringkasan…';
    this.update();
    this.dialog.showModal();
    try {
      const snapshot = await apiRequest('/api/event-reset');
      if (!this.dialog.open || generation !== this.generation) return;
      this.snapshot = snapshot;
      const number = new Intl.NumberFormat('id-ID');
      this.summary.textContent = `${number.format(snapshot.participants)} peserta · ${number.format(snapshot.prizes)} jenis hadiah · ${number.format(snapshot.winners)} pemenang`;
      this.update();
      this.input.focus();
    } catch (error) { this.error.textContent = error.message; this.error.hidden = false; }
  }

  async reset(event) {
    event.preventDefault();
    if (this.busy || !this.snapshot || this.input.value !== 'RESET') return;
    this.busy = true;
    this.input.disabled = true;
    this.close.forEach(button => { button.disabled = true; });
    this.error.hidden = true;
    this.submit.textContent = 'Mereset…';
    this.update();
    try {
      await apiRequest('/api/event-reset', { action:'reset',...this.snapshot,confirmation:this.input.value });
      changeEvent();
    } catch (error) {
      this.error.textContent = error.message;
      this.error.hidden = false;
      this.snapshot = null;
    } finally {
      this.busy = false;
      this.input.disabled = false;
      this.close.forEach(button => { button.disabled = false; });
      this.submit.textContent = 'Reset acara';
      this.update();
    }
  }

  async cleanup() {
    try {
      let more = true;
      while (more) ({ more } = await apiRequest('/api/event-reset',{ action:'cleanup' }));
    } catch { /* Antrean tetap di database dan dilanjutkan saat operator dibuka. */ }
  }
}
