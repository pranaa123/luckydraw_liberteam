import { canvasNumbers,centeredGeometry,centerOffsets,positionLimits,validGeometry,editGeometry } from './canvas-geometry.js';

const sizes = canvasNumbers.filter(key => !['area_x','area_y'].includes(key));
const positions = ['area_offset_x','area_offset_y'];

export class CanvasControls {
  constructor(form,changed) {
    this.form = form; this.changed = changed; this.root = form.querySelector('#canvas-settings');
    this.defaults = JSON.parse(this.root.dataset.canvasDefaults);
  }
  start() {
    this.root.addEventListener('focusin',({ target }) => { if (sizes.includes(target.name) && this.visual) this.edit = { key: target.name,base: { ...this.visual } }; });
    this.root.addEventListener('input',event => this.handle(event));
    this.root.addEventListener('change',event => this.handle(event));
    this.root.querySelector('#canvas-default').addEventListener('click',() => { this.fill(this.defaults); this.changed(); });
  }
  fill(visual) { this.visual = centeredGeometry(visual); this.edit = null; this.write(); }
  read() {
    if (!this.visual || sizes.some(key => this.form.elements[key].value === '' || Number(this.form.elements[key].value) !== this.visual[key])) return null;
    return validGeometry(this.visual) ? { ...this.visual } : null;
  }
  handle(event) {
    const key = event.target.name;
    if (!this.visual || ![...sizes,...positions].includes(key)) return;
    const raw = event.target.value, number = Number(raw);
    if (raw === '' || !Number.isFinite(number) || (sizes.includes(key) && !Number.isInteger(number))) { if (event.type === 'change') this.edit = null; return; }
    if (sizes.includes(key)) {
      if (!this.edit || this.edit.key !== key) this.edit = { key,base: { ...this.visual } };
      this.visual = editGeometry(this.edit.base,key,number);
    } else { this.edit = null; this.visual = editGeometry(this.visual,key,number); }
    this.write();
    if (event.type === 'change') this.edit = null;
  }
  write() {
    for (const key of sizes) {
      const field = this.form.elements[key], value = String(this.visual[key]);
      if (field.value !== value) field.value = value;
    }
    for (const [key,max] of Object.entries({ area_width: this.visual.canvas_width,area_height: this.visual.canvas_height })) {
      this.form.elements[key].max = String(max);
      this.root.querySelector(`#${key}-limit`).textContent = `1–${max.toLocaleString('id-ID')} px`;
    }
    const offsets = centerOffsets(this.visual), limits = positionLimits(this.visual);
    for (const axis of ['x','y']) {
      const slider = this.form.elements[`area_offset_${axis}`], limit = limits[axis], value = offsets[axis];
      // Range min=max digambar browser di ujung kiri. Rentang netral menjaga thumb tepat di tengah saat nonaktif.
      slider.min = String(limit ? -limit : -1); slider.max = String(limit || 1); slider.value = String(value); slider.disabled = limit === 0;
      slider.setAttribute('aria-valuetext',value === 0 ? 'Tengah' : `${Math.abs(value).toLocaleString('id-ID')} pixel ke ${axis === 'x' ? value < 0 ? 'kiri' : 'kanan' : value < 0 ? 'atas' : 'bawah'}`);
      this.root.querySelector(`#area_${axis}-value`).textContent = `${value > 0 ? '+' : ''}${value.toLocaleString('id-ID')} px`;
      this.root.querySelector(`#area_${axis}-limit`).textContent = limit ? `${(-limit).toLocaleString('id-ID')} / 0 / +${limit.toLocaleString('id-ID')} px` : 'Tengah · area memenuhi canvas';
    }
  }
}
