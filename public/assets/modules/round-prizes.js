import { prizeStore } from './prize-store.js';
import { element } from './ui.js';

export class RoundPrizes {
  constructor(count, feedback) {
    this.count = count;
    this.feedback = feedback;
    this.withPrizes = document.querySelector('#draw-with-prizes');
    this.random = document.querySelector('#draw-random-prizes');
    this.list = document.querySelector('#draw-prize-list');
    this.values = new Map();
    this.locked = false;
  }

  start() {
    this.withPrizes.addEventListener('change', () => {
      this.render();
      if (this.withPrizes.checked) prizeStore.load().catch(error => this.feedback(error.message));
    });
    this.random.addEventListener('change', () => { this.defaultSelection(); this.render(); });
    this.count.addEventListener('input', () => { if (!this.touched) { this.values.clear(); this.defaultSelection(); this.render(); } });
    prizeStore.addEventListener('change', () => {
      for (const [id, quantity] of this.values) {
        const prize = prizeStore.items.find(item => Number(item.id) === id);
        if (!prize) this.values.delete(id);
        else this.values.set(id, Math.min(quantity, Number(prize.remaining_quantity)));
      }
      this.defaultSelection(); this.render();
    });
    this.render();
  }

  mode() { return !this.withPrizes.checked ? 'none' : this.random.checked ? 'random' : 'selected'; }

  restore(config) {
    this.withPrizes.checked = config.prize_mode !== 'none';
    this.random.checked = config.prize_mode !== 'selected';
    this.values = new Map(config.allocation.map(item => [Number(item.prize_id), Number(item.quantity)]));
    this.touched = this.values.size > 0;
    if (this.withPrizes.checked) prizeStore.load().catch(error => this.feedback(error.message));
    this.defaultSelection(); this.render();
  }

  defaultSelection() {
    if (this.values.size || this.touched || !prizeStore.loaded) return;
    const first = prizeStore.items.find(item => Number(item.remaining_quantity) > 0);
    if (first) this.values.set(Number(first.id), Math.min(Number(this.count.value) || 1, Number(first.remaining_quantity)));
  }

  allocation() {
    return this.mode() !== 'selected' ? [] : [...this.values].filter(([, quantity]) => quantity > 0).map(([prize_id, quantity]) => ({ prize_id, quantity }));
  }

  setLocked(locked) { this.locked = locked; this.render(); }

  render() {
    const mode = this.mode();
    this.withPrizes.disabled = this.locked;
    this.random.disabled = this.locked;
    document.querySelector('#draw-prize-mode').hidden = mode === 'none';
    document.querySelector('#draw-prize-mode-label').textContent = mode === 'selected' ? 'Tentukan hadiah' : 'Hadiah acak';
    document.querySelector('#draw-prize-description').textContent = mode === 'none' ? 'Tanpa hadiah' : mode === 'random' ? 'Acak dari stok yang tersedia' : 'Atur jumlah tiap hadiah';
    this.list.hidden = mode !== 'selected';
    this.list.replaceChildren();
    this.summary();
    if (mode !== 'selected') return;
    for (const prize of prizeStore.items) {
      const row = element('label', undefined, 'round-prize-row');
      const content = element('span');
      content.append(element('span', prize.name), element('small', `Sisa ${prize.remaining_quantity}`, 'field-hint'));
      const input = element('input'); input.type = 'number'; input.min = '0'; input.max = String(prize.remaining_quantity);
      input.value = String(this.values.get(Number(prize.id)) || 0);
      input.disabled = this.locked || Number(prize.remaining_quantity) === 0;
      input.setAttribute('aria-label', `Jumlah ${prize.name}`); input.dataset.prizeId = String(prize.id);
      input.addEventListener('input', () => {
        this.touched = true; this.values.set(Number(prize.id), Number(input.value)); this.summary();
      });
      row.append(content, input); this.list.append(row);
    }
    if (!prizeStore.items.length) this.list.append(element('p', 'Tambahkan hadiah melalui menu Hadiah.', 'field-hint'));
    this.summary();
  }

  summary() {
    const node = document.querySelector('#draw-allocation-summary');
    node.hidden = this.mode() !== 'selected';
    node.textContent = `${this.allocation().reduce((sum, item) => sum + item.quantity, 0)} / ${this.count.value || 0} hadiah`;
  }

  valid() {
    return this.mode() !== 'selected' || [...this.list.querySelectorAll('input:not(:disabled)')].every(input => input.reportValidity());
  }
}
