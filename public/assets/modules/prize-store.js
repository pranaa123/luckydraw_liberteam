import { apiRequest } from './api-client.js';

class PrizeStore extends EventTarget {
  constructor() {
    super();
    this.items = [];
    this.loaded = false;
    this.pending = null;
  }

  async load(force = false) {
    if (this.pending) return this.pending;
    if (this.loaded && !force) return this.items;
    this.pending = apiRequest('/api/prizes').then(({ items }) => {
      const current = new Map(this.items.map(item => [Number(item.id), item]));
      this.items = items.map(item => Number(current.get(Number(item.id))?.version) > Number(item.version) ? current.get(Number(item.id)) : item);
      this.loaded = true;
      this.changed();
      return this.items;
    }).finally(() => { this.pending = null; });
    return this.pending;
  }

  apply(records, deletedId = null) {
    const updates = new Map(records.map(record => [Number(record.id), record]));
    this.items = this.items.filter(record => Number(record.id) !== Number(deletedId) && !updates.has(Number(record.id)));
    this.items.push(...records);
    this.items.sort((a, b) => Number(Number(a.remaining_quantity) === 0) - Number(Number(b.remaining_quantity) === 0) || Number(a.sort_order) - Number(b.sort_order) || Number(a.id) - Number(b.id));
    this.changed();
  }

  changed() { this.dispatchEvent(new Event('change')); }
}

export const prizeStore = new PrizeStore();
