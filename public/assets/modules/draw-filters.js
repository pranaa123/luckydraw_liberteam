import { FilterControl, filterKey } from './filter-control.js';
import { apiRequest } from './api-client.js';
import { FilterDropdown } from './filter-dropdown.js';

export class DrawFilters {
  constructor(changed, feedback) {
    this.changed = changed; this.feedback = feedback; this.loading = true;
    this.control = new FilterControl(document.querySelector('#draw-filters'), 'available', () => this.recount(), feedback);
    this.dropdown = new FilterDropdown(this.control,document.querySelector('#draw-filter-menu'));
  }

  async start() {
    this.dropdown.start();
    try { await this.control.load(); this.loading = false; if (this.state) this.update(this.state); }
    catch (error) { this.feedback(error.message); }
    this.changed();
    document.addEventListener('records-changed', async ({ detail }) => {
      if (detail.type !== 'field') return;
      try { await this.control.load(true); this.recount(); } catch (error) { this.feedback(error.message); }
    });
  }

  update(state, restore = false) {
    const previous = this.state;
    const changed = this.state?.participants_version !== state.participants_version;
    this.state = state;
    // Kosongkan layar tidak boleh menimpa pilihan filter untuk putaran berikutnya.
    const draft = previous && filterKey(this.control.get()) !== filterKey(previous.config.filters);
    if (restore && (!draft || state.draw?.status === 'pending')) this.control.restore(state.config.filters || {});
    if (this.loading) return;
    if (filterKey(this.control.get()) === filterKey(state.config.filters)) {
      clearTimeout(this.timer); this.generation = (this.generation || 0) + 1; this.count = state.eligible_count; this.counting = false;
    } else if (changed) this.recount();
    if (previous && changed) this.control.refreshValues();
  }

  recount() {
    clearTimeout(this.timer); this.counting = true; const generation = this.generation = (this.generation || 0) + 1;
    this.changed();
    this.timer = setTimeout(async () => {
      try {
        const { count } = await apiRequest('/api/participant-filters', { action: 'count', filters: this.control.get() });
        if (generation === this.generation) { this.count = count; this.counting = false; this.changed(); }
      } catch (error) { if (generation === this.generation) { this.counting = false; this.feedback(error.message); this.changed(); } }
    }, 220);
  }

  payload() { return { filters: this.control.get(), field_schema: this.control.meta?.field_schema }; }
  async retry() { await this.control.load(true); this.loading = false; if (this.state) this.update(this.state); this.changed(); }
  setLocked(locked) { this.control.setLocked(locked || this.loading); }
}
