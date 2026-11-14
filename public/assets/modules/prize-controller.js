import { apiRequest } from './api-client.js';
import { element } from './ui.js';
import { prizeStore } from './prize-store.js';
import { presentationState } from './presentation-state.js';

export class PrizeController {
  constructor(actions, feedback) {
    this.actions = actions;
    this.feedback = feedback;
    this.busy = false;
    prizeStore.addEventListener('change', () => this.render());
  }

  load(force = false) { return prizeStore.load(force); }

  async accept(record, deleted = false) {
    prizeStore.apply(deleted ? [] : [record], deleted ? record.id : null);
    try { await presentationState.refreshPrize(record, deleted); }
    catch { this.feedback('Hadiah tersimpan. Preview akan diperbarui ketika pengaturan dibuka kembali.'); }
  }

  render() {
    const list = document.querySelector('#prize-list');
    list.replaceChildren();
    const items = prizeStore.items;
    for (let index = 0; index < items.length; index++) {
      const record = items[index];
      const row = element('div', undefined, 'record-row');
      const content = element('div', undefined, 'record-name');
      content.append(element('p', record.name), element('p', `${record.remaining_quantity} tersisa dari ${record.initial_quantity}`, 'subtle-text'));
      const actions = this.actions(record);
      const order = document.querySelector('#prize-order-template').content.firstElementChild.cloneNode(true);
      for (const button of order.querySelectorAll('button')) {
        const direction = button.dataset.prizeOrder;
        const adjacent = items[index + (direction === 'up' ? -1 : 1)];
        button.disabled = this.busy || !adjacent || (Number(adjacent.remaining_quantity) === 0) !== (Number(record.remaining_quantity) === 0);
        button.title = `${direction === 'up' ? 'Naikkan' : 'Turunkan'} hadiah ${record.name}`;
        button.setAttribute('aria-label', button.title);
        button.addEventListener('click', () => this.reorder(record, direction));
      }
      actions.prepend(order);
      row.append(content, actions);
      list.append(row);
    }
    if (!items.length) {
      const empty = element('div', undefined, 'card empty-card');
      empty.append(element('h3', 'Belum ada hadiah'), element('p', 'Tambahkan nama dan jumlah hadiah.'));
      list.append(empty);
    }
    const summary = document.querySelector('#prize-summary');
    summary.hidden = !items.length;
    summary.textContent = `${items.length} jenis · ${items.reduce((total, item) => total + Number(item.remaining_quantity), 0)} hadiah tersedia`;
  }

  async reorder(record, direction) {
    if (this.busy) return;
    this.busy = true;
    this.render();
    try {
      const result = await apiRequest('/api/prizes', { action: 'reorder', id: Number(record.id), version: Number(record.version), direction });
      prizeStore.apply(result.items);
      for (const item of result.items) await presentationState.refreshPrize(item);
      this.feedback('Urutan hadiah disimpan.');
    } catch (error) { this.feedback(error.message); }
    finally { this.busy = false; this.render(); }
  }
}
