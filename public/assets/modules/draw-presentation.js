import { drawState } from './draw-state.js';
import { resultLayout } from './result-layout.js';
import { ResultEntrance } from './result-entrance.js';

export class DrawPresentation {
  constructor(animation, setPrizeContext) {
    this.animation = animation;
    this.setPrizeContext = setPrizeContext;
    this.group = document.querySelector('#draw-results');
    this.clip = document.querySelector('#result-clip-area');
    this.measure = document.createElement('canvas').getContext('2d');
    this.entrance = new ResultEntrance();
    this.nodes = new Map();
  }

  start() {
    this.entrance.start();
    drawState.addEventListener('change', ({ detail }) => this.accept(detail.state));
    if (drawState.state) this.accept(drawState.state);
    drawState.load(true).then(state => this.accept(state)).catch(() => {
      document.querySelector('#visual-stage').dataset.drawConnection = 'unavailable';
    });
  }

  accept(state) {
    const resultKey = state.draw?.phase === 'result' ? state.draw.id : null;
    if (resultKey !== this.resultKey) {
      this.revealPending = Boolean(resultKey && this.hasState);
      this.resultKey = resultKey;
    }
    this.hasState = true;
    this.draw = state.draw;
    this.animation.setDraw(this.draw);
    this.setPrizeContext(this.draw?.allocation.map(item => item.prize_id) || []);
    delete document.querySelector('#visual-stage').dataset.drawConnection;
    this.render();
  }

  configure(visual, family) {
    this.visual = visual;
    this.measure.font = `600 100px ${family}`;
    for (const key of ['x', 'y', 'width', 'height']) this.clip.setAttribute(key, visual[`area_${key}`]);
    this.render();
  }

  render() {
    if (this.draw?.phase !== 'result') {
      this.entrance.cancel(); this.group.replaceChildren(); this.nodes.clear(); return;
    }
    if (!this.visual) return;
    const visual = this.visual;
    const write = value => visual.text_case === 'uppercase' ? value.toLocaleUpperCase('id-ID') : visual.text_case === 'lowercase' ? value.toLocaleLowerCase('id-ID') : value[0].toLocaleUpperCase('id-ID') + value.slice(1).toLocaleLowerCase('id-ID');
    const layout = resultLayout(this.draw.entries, this.draw.fields, visual, this.measure, write);
    const live = new Set(layout.map(item => item.id));
    for (const [id,node] of this.nodes) if (!live.has(id)) { node.remove(); this.nodes.delete(id); }
    for (const [index,item] of layout.entries()) {
      let group = this.nodes.get(item.id);
      if (!group) {
        group = document.createElementNS('http://www.w3.org/2000/svg','g');
        group.dataset.participantId = String(item.id); this.nodes.set(item.id,group);
      }
      while (group.children.length > item.lines.length) group.lastElementChild.remove();
      for (const [lineIndex,line] of item.lines.entries()) {
        let text = group.children[lineIndex];
        if (!text) { text = document.createElementNS('http://www.w3.org/2000/svg','text'); group.append(text); }
        if (text.textContent !== line.text) text.textContent = line.text;
        for (const [key,value] of Object.entries({ x: line.x,y: line.y,'font-size': line.size,'font-weight': line.weight,'text-anchor': 'middle','dominant-baseline': 'central',fill: visual.font_color })) if (text.getAttribute(key) !== String(value)) text.setAttribute(key,value);
      }
      if (this.group.children[index] !== group) this.group.insertBefore(group,this.group.children[index] || null);
    }
    if (this.revealPending) { this.entrance.reveal([...this.group.children]); this.revealPending = false; }
  }
}
