import { apiRequest } from './api-client.js';
import { element } from './ui.js';

export const filterKey = filters => JSON.stringify(Object.fromEntries(Object.entries(filters || {}).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, { mode: value.mode, values: [...value.values].sort() }])));

let metadata, pendingMetadata;
async function loadMetadata(force) {
  if (pendingMetadata) return pendingMetadata;
  if (metadata && !force) return metadata;
  pendingMetadata = apiRequest('/api/participant-filters').then(data => metadata = data).finally(() => { pendingMetadata = null; });
  return pendingMetadata;
}

/** Komponen filter dipakai operator undian dan daftar peserta. Nilai diambil 50 per halaman. */
export class FilterControl extends EventTarget {
  constructor(host, scope, changed, feedback, extraFields = []) {
    super();
    this.host = host; this.scope = scope; this.changed = changed; this.feedback = feedback;
    this.extraFields = extraFields;
    this.groups = new Map(); this.locked = false;
  }

  async load(force = false) {
    this.meta = await loadMetadata(force);
    const fields = [...this.extraFields, ...this.meta.fields];
    const allowed = new Set(fields.map(field => field.key));
    for (const key of this.groups.keys()) if (!allowed.has(key)) this.groups.delete(key);
    this.host.replaceChildren();
    for (const field of fields) {
      const group = this.groups.get(field.key) || { enabled: false, mode: 'exclude', values: new Set(), search: '', items: [], next: null, generation: 0 };
      clearTimeout(group.timer); group.generation++; if (force) group.loaded = false;
      group.options = field.options;
      this.groups.set(field.key, group); this.build(field, group);
    }
    if (this.restored) this.restore(this.restored);
    else this.dispatchEvent(new Event('statechange'));
    return this.meta;
  }

  get() {
    return Object.fromEntries([...this.groups].filter(([, group]) => group.enabled).map(([key, group]) => [key, { mode: group.mode, values: [...group.values] }]));
  }

  restore(filters) {
    this.restored = structuredClone(filters || {});
    for (const [key, group] of this.groups) {
      const value = filters?.[key]; group.enabled = Boolean(value);
      const changed = value && (value.mode !== group.mode || JSON.stringify([...group.values].sort()) !== JSON.stringify([...value.values].sort()));
      if (value) { group.mode = value.mode; group.values = new Set(value.values); }
      this.render(group);
      if (group.enabled && (changed || !group.loaded)) this.options(key).catch(error => this.feedback(error.message));
    }
    this.dispatchEvent(new Event('statechange'));
  }

  clear() {
    if (this.locked) return;
    for (const group of this.groups.values()) {
      clearTimeout(group.timer); group.generation++;
      group.enabled = false; group.mode = 'exclude'; group.values.clear();
      group.search = ''; group.searchNode.value = ''; group.items = []; group.next = null; group.loaded = false;
      this.render(group);
    }
    this.notify();
  }

  setLocked(locked) {
    const changed = this.locked !== locked;
    this.locked = locked;
    for (const node of this.host.querySelectorAll('input, button')) node.disabled = locked;
    if (changed) this.dispatchEvent(new Event('statechange'));
  }

  refreshValues() {
    for (const [key, group] of this.groups) {
      group.loaded = false;
      if (group.enabled) this.options(key).catch(error => this.feedback(error.message));
    }
  }

  build(field, group) {
    const section = element('section', undefined, 'filter-group'); section.dataset.filterField = field.key;
    const heading = element('div', undefined, 'filter-heading');
    const title = element('span', field.label);
    group.caption = element('small', undefined, 'field-hint'); title.append(group.caption);
    const toggle = element('label', undefined, 'switch'); group.toggle = element('input'); group.toggle.type = 'checkbox';
    group.toggle.setAttribute('aria-label', `Filter ${field.label}`); toggle.append(group.toggle, element('span')); heading.append(title, toggle);
    group.panel = element('div', undefined, 'filter-panel');
    const allLabel = element('label', undefined, 'filter-check'); group.all = element('input'); group.all.type = 'checkbox';
    group.all.setAttribute('aria-label', `Pilih semua ${field.label}`); allLabel.append(group.all, element('span', 'Pilih semua'));
    group.searchNode = element('input', undefined, 'filter-search'); group.searchNode.type = 'search'; group.searchNode.placeholder = 'Awalan nilai…'; group.searchNode.setAttribute('aria-label', `Cari awalan ${field.label}`);
    group.searchNode.hidden = Boolean(group.options);
    group.list = element('div', undefined, 'filter-values');
    if (group.options) group.list.classList.add('filter-fixed-options');
    group.more = element('button', 'Muat lainnya', 'button button-quiet'); group.more.type = 'button';
    group.panel.append(allLabel, group.searchNode, group.list, group.more); section.append(heading, group.panel); this.host.append(section);
    group.toggle.addEventListener('change', () => {
      group.enabled = group.toggle.checked; this.render(group); this.notify(field.key);
      if (group.enabled) this.options(field.key).catch(error => this.feedback(error.message));
    });
    group.all.addEventListener('change', () => { group.mode = group.all.checked ? 'exclude' : 'include'; group.values.clear(); this.render(group); this.notify(field.key); });
    group.searchNode.addEventListener('input', () => {
      group.search = group.searchNode.value; clearTimeout(group.timer); group.generation++;
      group.timer = setTimeout(() => this.options(field.key).catch(error => this.feedback(error.message)), 220);
    });
    group.more.addEventListener('click', () => this.options(field.key, true).catch(error => this.feedback(error.message)));
    this.render(group);
  }

  render(group) {
    const scrollTop = group.list.scrollTop;
    const focusedValue = group.list.contains(document.activeElement) ? document.activeElement.value : null;
    group.toggle.checked = group.enabled; group.panel.hidden = !group.enabled;
    group.caption.textContent = !group.enabled ? '' : group.mode === 'exclude' ? group.values.size ? `Semua, kecuali ${group.values.size}` : 'Semua' : `${group.values.size} dipilih`;
    group.all.checked = group.mode === 'exclude' && !group.values.size;
    group.all.indeterminate = group.values.size > 0;
    group.list.replaceChildren();
    for (const item of group.items) {
      const value = typeof item === 'string' ? item : item.value;
      const label = element('label', undefined, 'filter-check'); const input = element('input'); input.type = 'checkbox'; input.value = value;
      input.checked = group.mode === 'include' ? group.values.has(value) : !group.values.has(value);
      input.addEventListener('change', () => {
        const selected = group.mode === 'include' ? input.checked : !input.checked;
        if (selected) group.values.add(value); else group.values.delete(value);
        this.render(group); this.notify([...this.groups].find(([, item]) => item === group)[0]);
      });
      label.append(input, element('span', typeof item === 'string' ? value || '(Kosong)' : item.label)); group.list.append(label);
    }
    if (!group.items.length) group.list.append(element('p', 'Tidak ada nilai.', 'field-hint'));
    group.more.hidden = Boolean(group.options) || group.next === null;
    group.list.scrollTop = scrollTop;
    if (focusedValue !== null) [...group.list.querySelectorAll('input')].find(input => input.value === focusedValue)?.focus({ preventScroll: true });
    for (const node of [group.toggle, group.all, group.searchNode, group.more, ...group.list.querySelectorAll('input')]) node.disabled = this.locked;
  }

  notify(key) {
    this.restored = null;
    this.dispatchEvent(new Event('statechange'));
    this.changed(this.get());
    let later = false;
    for (const [current, group] of this.groups) {
      if (later && group.enabled) this.options(current).catch(error => this.feedback(error.message));
      if (current === key) later = true;
    }
  }

  async options(key, append = false) {
    const group = this.groups.get(key); if (!group || !group.enabled) return;
    if (group.options) { group.items = group.options; group.loaded = true; this.render(group); return; }
    const filters = {};
    for (const [parent, item] of this.groups) {
      if (parent === key) break;
      if (item.enabled) filters[parent] = { mode: item.mode, values: [...item.values] };
    }
    const generation = ++group.generation;
    const { status: status_filter, ...fieldFilters } = filters;
    const data = await apiRequest('/api/participant-filters', { action: 'options', field: key, filters: fieldFilters, ...(status_filter ? { status_filter } : {}), scope: this.scope, search: group.search, after: append ? group.next : null });
    if (generation !== group.generation) return;
    group.items = append ? [...group.items, ...data.items] : data.items; group.next = data.next; group.loaded = true; this.render(group);
  }
}
