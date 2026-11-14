import { presentationState } from './presentation-state.js';
import { ShuffleAnimation } from './shuffle-animation.js';
import { DrawPresentation } from './draw-presentation.js';
import { resolveNameArea } from './canvas-geometry.js';
import { defaultStandbySize } from './output-typography.js';

const families = {
  'sans-serif': 'Aptos, Segoe UI, Arial, sans-serif',
  serif: 'Georgia, Times New Roman, serif',
  'slab-serif': 'Rockwell, Roboto Slab, Courier New, serif',
  script: 'Segoe Script, Snell Roundhand, Brush Script MT, cursive',
};
const assetPath = value => typeof value === 'string' && /^\/assets\/backgrounds\/[a-f0-9]{32}\.(png|jpg|webp)$/.test(value) ? value : null;

export class PresentationView {
  constructor() {
    this.svg = document.querySelector('#visual-stage');
    this.prizeIds = [];
    this.guide = false;
    this.state = null;
    this.animation = new ShuffleAnimation();
    this.draw = new DrawPresentation(this.animation, ids => this.setPrizeContext(ids));
  }

  start() {
    this.animation.start();
    this.draw.start();
    document.addEventListener('event-changing', () => { this.animation.setDraw(null); this.draw.entrance.cancel(); });
    presentationState.addEventListener('change', ({ detail }) => this.render(detail.state));
    presentationState.load().then(packet => this.render(packet.state)).catch(() => {
      // Pertahankan visual standby ketika penyimpanan belum dapat dibaca.
      this.svg.dataset.connection = 'unavailable';
    });
    window.addEventListener('message', (event) => {
      if (event.origin !== location.origin || event.source !== window.parent || window.parent === window) return;
      if (event.data?.type === 'doorprize:area-guide') {
        this.guide = event.data.visible === true;
        this.refreshGuide();
      }
      if (event.data?.type === 'doorprize:prize-context' && Array.isArray(event.data.ids)) {
        this.setPrizeContext(event.data.ids);
      }
    });
    if (window.parent !== window) window.parent.document.addEventListener('fullscreenchange', () => this.refreshGuide());
  }

  setPrizeContext(ids) {
    this.prizeIds = [...new Set(ids.map(String))];
    if (this.state) this.renderBackground(this.state.visual);
  }

  renderBackground(visual) {
    const specific = this.prizeIds.length === 1 ? visual.prize_backgrounds?.[this.prizeIds[0]]?.path : null;
    const path = visual.background_type === 'image' ? assetPath(specific) || assetPath(visual.background_image) : null;
    const image = document.querySelector('#stage-image');
    image.setAttribute('preserveAspectRatio',visual.background_fit === 'contain' ? 'xMidYMid meet' : 'xMidYMid slice');
    image.setAttribute('visibility', path ? 'visible' : 'hidden');
    if (path && image.getAttribute('href') !== path) image.setAttribute('href', path);
    if (!path) image.removeAttribute('href');
    document.querySelector('#stage-background').setAttribute('fill', visual.background_color);
    document.body.style.backgroundColor = visual.background_color;
    this.svg.parentElement.style.backgroundColor = visual.background_color;
  }

  refreshGuide() {
    const operatorPreview = document.body.classList.contains('is-preview') && window.parent !== window
      && !window.parent.document.body.classList.contains('is-output-host');
    document.querySelector('#name-area-guide').setAttribute('visibility', this.guide && operatorPreview ? 'visible' : 'hidden');
  }

  render(state) {
    if (document.body.dataset.eventDisplayOnly === 'true') return;
    this.state = state;
    const v = resolveNameArea(state.visual);
    const width = Number(v.canvas_width), height = Number(v.canvas_height);
    this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    this.svg.setAttribute('font-family', families[v.font_style] || families['sans-serif']);
    this.svg.dataset.settingsVersion = String(state.settings_version);
    delete this.svg.dataset.connection;
    for (const node of this.svg.querySelectorAll('text')) node.setAttribute('fill', v.font_color);
    for (const selector of ['#stage-background', '#stage-image']) {
      const node = document.querySelector(selector);
      node.setAttribute('width', width); node.setAttribute('height', height);
    }
    this.renderBackground(v);
    const write = (value) => {
      if (v.text_case === 'uppercase') return value.toLocaleUpperCase('id-ID');
      if (v.text_case === 'lowercase') return value.toLocaleLowerCase('id-ID');
      return value ? value[0].toLocaleUpperCase('id-ID') + value.slice(1).toLocaleLowerCase('id-ID') : '';
    };
    const brand = document.querySelector('#stage-brand');
    brand.textContent = write('Doorprize');
    brand.setAttribute('x', width / 2); brand.setAttribute('y', height * .17); brand.setAttribute('font-size', height * .023);
    brand.setAttribute('visibility', state.show_event_info && (state.client_name || state.event_name || state.event_at) ? 'hidden' : 'visible');

    let date = '';
    if (state.event_at) date = new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeStyle: 'short', timeZone: state.timezone }).format(new Date(state.event_at));
    const name = document.querySelector('#stage-event-name');
    const details = document.querySelector('#stage-event-details');
    name.textContent = write(state.event_name || '');
    details.textContent = write([state.client_name, date].filter(Boolean).join(' · '));
    for (const [node, y, size] of [[name, height * .065, height * .03], [details, height * (state.event_name ? .11 : .065), height * .019]]) {
      node.setAttribute('x', width * .04); node.setAttribute('y', y); node.setAttribute('font-size', size);
      const measured = node.getComputedTextLength();
      if (measured > width * .92) node.setAttribute('font-size', size * width * .92 / measured);
    }
    document.querySelector('#stage-information').setAttribute('visibility', state.show_event_info ? 'visible' : 'hidden');
    this.animation.configure(v, families[v.font_style] || families['sans-serif']);

    const text = document.querySelector('#standby-text');
    const one = document.querySelector('#standby-line-one'), two = document.querySelector('#standby-line-two');
    one.textContent = write('Bersiap untuk '); two.textContent = v.text_case === 'sentence' ? 'mengundi' : write('mengundi');
    const centerX = Number(v.area_x) + Number(v.area_width) / 2;
    const centerY = Number(v.area_y) + Number(v.area_height) / 2;
    let size = Math.min(defaultStandbySize(v,this.animation.measure),Number(v.area_height) * .22);
    text.setAttribute('font-weight', '700');
    text.setAttribute('font-size', size);
    const measured = text.getComputedTextLength();
    if (measured > Number(v.area_width) * .94) size *= Number(v.area_width) * .94 / measured;
    text.setAttribute('font-size', size);
    text.setAttribute('x', centerX); text.setAttribute('y', centerY);
    const guide = document.querySelector('#name-area-guide');
    for (const [attribute, value] of Object.entries({ x: v.area_x, y: v.area_y, width: v.area_width, height: v.area_height })) guide.setAttribute(attribute, value);
    guide.setAttribute('stroke-width', Math.max(width, height) / 1000);
    this.refreshGuide();
    this.draw.configure(v, families[v.font_style] || families['sans-serif']);
  }
}
