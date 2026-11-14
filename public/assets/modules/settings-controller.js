import { apiRequest } from './api-client.js';
import { uploadBackground } from './background-client.js';
import { element } from './ui.js';
import { prizeStore } from './prize-store.js';
import { presentationState } from './presentation-state.js';
import { CanvasControls } from './canvas-controls.js';
import { CanvasPreview } from './canvas-preview.js';
import { FieldVisibilityControls } from './field-visibility-controls.js';

const visualFields = ['background_type', 'background_color', 'background_fit', 'font_color', 'font_style', 'text_case'];

function localDate(value, timezone) {
  if (!value) return '';
  const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: timezone }).formatToParts(new Date(value));
  const get = type => parts.find(part => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

export class SettingsController {
  constructor() {
    this.form = document.querySelector('#settings-form');
    this.controls = document.querySelector('#settings-controls');
    this.saveButton = document.querySelector('#settings-save');
    this.ready = false;
    this.loading = null;
    this.busy = false;
    this.uploading = false;
    this.invalidDraft = false;
    this.canvas = new CanvasControls(this.form,() => this.queuePreview());
    this.fieldVisibility = new FieldVisibilityControls(() => this.queuePreview());
  }

  start() {
    this.canvas.start();
    this.fieldVisibility.start();
    new CanvasPreview().start();
    document.addEventListener('operator-tab', ({ detail }) => { if (detail === 'settings') this.load(); });
    presentationState.addEventListener('change', ({ detail }) => {
      if (this.ready && !detail.local) this.fill(detail.state);
      this.status();
    });
    prizeStore.addEventListener('change', () => { if (this.ready) this.renderBackgrounds(); });
    this.form.addEventListener('input', event => { if (event.target.name) this.queuePreview(); });
    this.form.addEventListener('change', event => {
      if (event.target.name) this.queuePreview();
    });
    this.form.addEventListener('submit', event => this.submit(event));
    document.querySelector('#settings-reload').addEventListener('click', () => this.load(true));
    document.querySelector('#main-background-file').addEventListener('change', event => this.upload(event.target, null));
    document.querySelector('#prize-background-file').addEventListener('change', event => this.upload(event.target, Number(document.querySelector('#background-prize').value)));
    document.querySelector('#remove-main-background').addEventListener('click', () => {
      const state = structuredClone(presentationState.packet.state);
      state.visual.background_image = null;
      presentationState.publish(state, true);
      this.toggleImages();
    });
    document.querySelector('#inspect-name-area').addEventListener('change', event => {
      document.querySelector('.preview-frame').contentWindow?.postMessage({ type: 'doorprize:area-guide', visible: event.target.checked }, location.origin);
    });
    if (document.querySelector('[data-tab][aria-selected="true"]').dataset.tab === 'settings') this.load();
  }

  async load(force = false) {
    if (this.loading || (this.ready && !force)) return;
    this.loading = Promise.all([presentationState.load(force), prizeStore.load(force)]);
    this.error('');
    try {
      await this.loading;
      this.ready = true;
      this.controls.disabled = false;
      this.fill(presentationState.packet.state);
      this.invalidDraft = false;
      this.status();
    } catch (error) { this.error(error.message); document.querySelector('#settings-state').textContent = 'Pengaturan belum dimuat'; }
    finally { this.loading = null; }
  }

  fill(state) {
    for (const key of ['client_name', 'event_name']) this.form.elements[key].value = state[key];
    this.form.elements.event_at.value = localDate(state.event_at, state.timezone);
    this.form.elements.show_event_info.checked = state.show_event_info;
    for (const key of visualFields) this.form.elements[key].value = state.visual[key];
    this.canvas.fill(state.visual);
    this.fieldVisibility.fill(state.visual);
    this.toggleImages();
    this.renderBackgrounds();
  }

  read() {
    const state = structuredClone(presentationState.packet.state);
    state.client_name = this.form.elements.client_name.value;
    state.event_name = this.form.elements.event_name.value;
    const date = this.form.elements.event_at.value;
    if (date && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(date)) return null;
    // Waktu input dikirim sebagai waktu lokal acara; render sementara memakai offset konfigurasi.
    state.event_at_input = date;
    if (date) {
      const offset = this.offset(state.timezone, date);
      state.event_at = `${date}:00${offset}`;
    } else state.event_at = null;
    state.show_event_info = this.form.elements.show_event_info.checked;
    const geometry = this.canvas.read();
    if (!geometry) return null;
    Object.assign(state.visual,geometry,this.fieldVisibility.read());
    for (const key of visualFields) state.visual[key] = this.form.elements[key].value;
    return state;
  }

  offset(timezone, value) {
    // Hitung offset pada tanggal acara, termasuk zona yang memakai DST.
    const instant = new Date(`${value}:00Z`);
    const part = new Intl.DateTimeFormat('en', { timeZone: timezone, timeZoneName: 'longOffset' }).formatToParts(instant).find(part => part.type === 'timeZoneName')?.value;
    return part === 'GMT' ? '+00:00' : part?.replace('GMT', '') || '+00:00';
  }

  preview() {
    if (!this.ready || this.busy) return;
    const state = this.read();
    this.invalidDraft = !state;
    if (state) presentationState.publish(state, true);
    this.toggleImages();
    this.status();
  }

  queuePreview() {
    cancelAnimationFrame(this.previewFrame);
    if (document.hidden) { this.preview(); return; }
    this.previewFrame = requestAnimationFrame(() => this.preview());
  }

  toggleImages() {
    document.querySelector('#image-background-settings').hidden = this.form.elements.background_type.value !== 'image';
    const path = presentationState.packet?.state.visual.background_image;
    const preview = document.querySelector('#main-background-preview');
    preview.hidden = !path;
    if (path) document.querySelector('#main-background-image').src = path;
  }

  renderBackgrounds() {
    const state = presentationState.packet?.state;
    if (!state) return;
    const select = document.querySelector('#background-prize');
    const selected = select.value;
    select.replaceChildren();
    for (const prize of prizeStore.items) { const option = element('option', prize.name); option.value = prize.id; select.append(option); }
    if (prizeStore.items.some(prize => String(prize.id) === selected)) select.value = selected;
    if (!prizeStore.items.length) select.append(element('option', 'Tambahkan hadiah terlebih dahulu'));
    select.disabled = !prizeStore.items.length;
    document.querySelector('#prize-background-file').disabled = !prizeStore.items.length || this.uploading;
    const list = document.querySelector('#prize-background-list');
    list.replaceChildren();
    for (const [id, background] of Object.entries(state.visual.prize_backgrounds || {})) {
      const prize = prizeStore.items.find(prize => String(prize.id) === id);
      if (!prize) continue;
      const row = element('div', undefined, 'background-row');
      const image = element('img'); image.src = background.path; image.alt = prize.name; image.loading = 'lazy'; image.width = 64; image.height = 40;
      const remove = document.querySelector('#record-actions-template').content.querySelector('[data-record-action="delete"]').cloneNode(true);
      remove.title = `Lepaskan background ${prize.name}`; remove.setAttribute('aria-label', remove.title);
      remove.addEventListener('click', () => this.assignBackground(prize, null));
      row.append(image, element('span', prize.name), remove);
      list.append(row);
    }
  }

  assignBackground(prize, path) {
    const state = structuredClone(presentationState.packet.state);
    const changes = structuredClone(presentationState.packet.backgroundChanges || {});
    changes[String(prize.id)] = { id: Number(prize.id), version: Number(prize.version), path };
    if (path) state.visual.prize_backgrounds[String(prize.id)] = { path, version: Number(prize.version) };
    else delete state.visual.prize_backgrounds[String(prize.id)];
    presentationState.publish(state, true, changes);
    this.renderBackgrounds();
  }

  async upload(input, prizeId) {
    const file = input.files?.[0];
    if (!file || this.uploading) return;
    if (file.size > 20 * 1024 * 1024) { this.error('Ukuran gambar maksimal 20 MB.'); input.value = ''; return; }
    const prize = prizeId === null ? null : prizeStore.items.find(prize => Number(prize.id) === prizeId);
    if (prizeId !== null && !prize) { this.error('Pilih hadiah terlebih dahulu.'); return; }
    this.uploading = true;
    input.disabled = true;
    this.error(''); this.status();
    try {
      const asset = await uploadBackground(file);
      if (prize) this.assignBackground(prize, asset.path);
      else {
        const state = structuredClone(presentationState.packet.state);
        state.visual.background_image = asset.path;
        presentationState.publish(state, true);
        this.toggleImages();
      }
    } catch (error) { this.error(error.message); }
    finally { this.uploading = false; input.disabled = false; input.value = ''; this.status(); }
  }

  async submit(event) {
    event.preventDefault();
    if (!this.ready || this.busy || this.uploading) return;
    if (!this.form.reportValidity()) return;
    const state = this.read();
    if (!state) { this.error('Area nama harus berada di dalam canvas. Periksa ukuran dan posisinya.'); return; }
    this.busy = true; this.error(''); this.status();
    const controls = [...this.controls.querySelectorAll('input, select, button')].map(node => [node, node.disabled]);
    this.controls.disabled = true;
    try {
      const result = await apiRequest('/api/settings', {
        action: 'update', settings_version: state.settings_version,
        client_name: state.client_name, event_name: state.event_name, event_at: this.form.elements.event_at.value,
        show_event_info: state.show_event_info, visual: state.visual,
        prize_backgrounds: Object.values(presentationState.packet.backgroundChanges || {}),
      });
      const { prize_updates, ...saved } = result;
      this.invalidDraft = false;
      presentationState.publish(saved, false, {});
      if (prize_updates?.length) prizeStore.apply(prize_updates);
      this.fill(saved);
    } catch (error) { this.error(error.message); }
    finally { this.busy = false; this.controls.disabled = false; controls.forEach(([node, disabled]) => { node.disabled = disabled; }); this.canvas.write(); this.status(); }
  }

  status() {
    this.fieldVisibility.setDisabled(!this.ready || this.busy);
    const dirty = presentationState.packet?.dirty || this.invalidDraft;
    this.saveButton.disabled = !this.ready || !dirty || this.busy || this.uploading;
    document.querySelector('#settings-state').textContent = this.uploading ? 'Mengupload gambar…' : this.busy ? 'Menyimpan…' : !this.ready ? 'Memuat pengaturan…' : dirty ? 'Belum disimpan' : 'Tersimpan';
    document.querySelector('#settings-reload').disabled = this.busy || this.uploading;
  }

  error(message) {
    const node = document.querySelector('#settings-error');
    node.textContent = message; node.hidden = !message;
  }
}
