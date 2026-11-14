import { glyphAt, reducedInterval, shuffleAlphabet } from './shuffle-model.js';
import { shuffleTypography } from './output-typography.js';

/** Renderer lokal: satu frame aktif, glyph didaur ulang, tanpa request data. */
export class ShuffleAnimation {
  constructor() {
    this.host = document.querySelector('#shuffle-area');
    this.line = document.querySelector('#shuffle-line');
    this.stage = document.querySelector('#visual-stage');
    this.standby = document.querySelector('#standby-text');
    this.title = document.querySelector('#stage-title');
    this.motion = matchMedia('(prefers-reduced-motion: reduce)');
    this.nodes = [];
    this.frame = 0;
    this.timer = 0;
    this.measure = document.createElement('canvas').getContext('2d');
  }

  start() {
    document.addEventListener('visibilitychange', () => this.refresh());
    this.motion.addEventListener('change', () => this.refresh());
    window.addEventListener('pagehide', () => { cancelAnimationFrame(this.frame); clearTimeout(this.timer); });
    this.refresh();
  }

  configure(visual, family) {
    this.visual = visual;
    this.family = family;
    this.upper = [...shuffleAlphabet];
    this.lower = [...shuffleAlphabet.toLocaleLowerCase('id-ID')];
    this.measure.font = `600 100px ${family}`;
    Object.assign(this,shuffleTypography(visual,this.measure));
    for (const key of ['x', 'y', 'width', 'height']) {
      this.host.setAttribute(key, visual[`area_${key}`]);
    }
    this.line.style.color = visual.font_color;
    this.line.style.fontFamily = family;
    this.line.style.perspective = `${Math.max(visual.area_width, visual.area_height) * 1.4}px`;
    while (this.nodes.length < this.count) {
      const node = document.createElement('span');
      node.className = 'shuffle-glyph';
      this.line.append(node); this.nodes.push(node);
    }
    while (this.nodes.length > this.count) this.nodes.pop().remove();
    for (const node of this.nodes) node.style.fontSize = `${this.size}px`;
    this.refresh();
  }

  refresh() {
    cancelAnimationFrame(this.frame);
    clearTimeout(this.timer);
    this.frame = 0;
    const running = this.packet()?.running === true;
    const result = this.draw?.phase === 'result';
    this.host.setAttribute('visibility', running ? 'visible' : 'hidden');
    this.standby.setAttribute('visibility', running || result ? 'hidden' : 'visible');
    this.stage.dataset.animation = running ? 'running' : result ? 'result' : 'standby';
    this.title.textContent = running ? 'Visual pengacakan' : result ? 'Hasil undian' : 'Bersiap untuk mengundi';
    if (!running) {
      return;
    }
    if (this.visual && !document.hidden) this.tick();
  }

  packet() {
    return this.draw ? { running: this.draw.status === 'pending' && this.draw.phase === 'rolling', startedAt: this.draw.started_at, seed: this.draw.seed } : null;
  }

  setDraw(draw) {
    this.draw = draw;
    if (this.visual) this.configure(this.visual, this.family);
    else this.refresh();
  }

  tick() {
    this.frame = 0;
    const packet = this.packet();
    if (!packet?.running || document.hidden) return;
    const elapsed = Math.max(0, Date.now() - packet.startedAt);
    const reduced = this.motion.matches;
    const step = this.advance * this.size;
    const left = (this.visual.area_width - this.count * step) / 2;
    this.nodes.forEach((node, index) => {
      const alphabet = this.visual.text_case === 'uppercase' || (this.visual.text_case === 'sentence' && index === 0) ? this.upper : this.lower;
      const glyph = glyphAt(packet.seed, index, elapsed, alphabet, reduced);
      if (node.textContent !== glyph.text) node.textContent = glyph.text;
      node.style.transform = `translate3d(${left + (index + .5) * step}px, ${this.visual.area_height / 2}px, 0) translate(-50%, -50%) rotateX(${glyph.angle}deg)`;
    });
    if (reduced) this.timer = setTimeout(() => this.tick(), reducedInterval - elapsed % reducedInterval + 1);
    else this.frame = requestAnimationFrame(() => this.tick());
  }
}
