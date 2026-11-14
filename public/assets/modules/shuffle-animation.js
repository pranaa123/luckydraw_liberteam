import { NameSequence } from './shuffle-model.js';
import { defaultNameSize } from './output-typography.js';

/** Dua node didaur ulang. Pergantian nama bergerak di satu baris yang terklip. */
export class ShuffleAnimation {
  constructor() {
    this.host = document.querySelector('#shuffle-area');
    this.line = document.querySelector('#shuffle-line');
    this.stage = document.querySelector('#visual-stage');
    this.standby = document.querySelector('#standby-text');
    this.title = document.querySelector('#stage-title');
    this.motion = matchMedia('(prefers-reduced-motion: reduce)');
    this.frame = 0; this.timer = 0;
    this.measure = document.createElement('canvas').getContext('2d');
    this.window = document.createElement('div'); this.window.className = 'shuffle-name-window';
    this.nodes = [0,1].map(() => { const node=document.createElement('span');node.className='shuffle-name';this.window.append(node);return node; });
    this.line.replaceChildren(this.window);
  }

  start() {
    document.addEventListener('visibilitychange', () => this.refresh());
    this.motion.addEventListener('change', () => this.refresh());
    window.addEventListener('pagehide', () => { cancelAnimationFrame(this.frame);clearTimeout(this.timer); });
    this.refresh();
  }

  configure(visual,family) {
    this.visual=visual;this.family=family;
    this.measure.font=`600 100px ${family}`;
    this.size=Math.min(defaultNameSize(visual,this.measure),visual.area_height*.52);
    this.slotHeight=this.size*1.4;
    this.window.dataset.referenceSize=String(this.size);
    this.sizes=new Map();
    for(const key of ['x','y','width','height']) this.host.setAttribute(key,visual[`area_${key}`]);
    this.line.style.color=visual.font_color;this.line.style.fontFamily=family;
    this.window.style.height=`${this.slotHeight}px`;
    this.refresh();
  }

  packet() {
    return this.draw ? {running:this.draw.status==='pending'&&this.draw.phase==='rolling',startedAt:this.draw.started_at} : null;
  }

  setDraw(draw) {
    this.draw=draw;
    const signature=draw?.phase==='rolling' ? `${draw.id}:${draw.seed}:${(draw.sample_names||[]).join('\0')}` : '';
    if(signature!==this.signature){this.signature=signature;this.sequence=new NameSequence(draw?.seed||0,draw?.sample_names||[]);}
    if(this.visual)this.configure(this.visual,this.family);else this.refresh();
  }

  refresh() {
    cancelAnimationFrame(this.frame);clearTimeout(this.timer);this.frame=0;
    const running=this.packet()?.running===true,result=this.draw?.phase==='result';
    this.host.setAttribute('visibility',running?'visible':'hidden');
    this.standby.setAttribute('visibility',running||result?'hidden':'visible');
    this.stage.dataset.animation=running?'running':result?'result':'standby';
    this.title.textContent=running?'Visual pengacakan':result?'Hasil undian':'Bersiap untuk mengundi';
    if(running&&this.visual&&!document.hidden)this.tick();
  }

  write(name) {
    const clean=name.replace(/\s+/gu,' ');
    return this.visual.text_case==='uppercase'?clean.toLocaleUpperCase('id-ID'):this.visual.text_case==='lowercase'?clean.toLocaleLowerCase('id-ID'):clean;
  }

  setName(node,name) {
    const text=this.write(name);
    if(node.textContent!==text)node.textContent=text;
    if(!this.sizes.has(text))this.sizes.set(text,Math.min(this.size,this.visual.area_width*.92/Math.max(.01,this.measure.measureText(text).width/100)));
    node.style.fontSize=`${this.sizes.get(text)}px`;
  }

  tick() {
    this.frame=0;
    const packet=this.packet();if(!packet?.running||document.hidden)return;
    const elapsed=Math.max(0,Date.now()-packet.startedAt),reduced=this.motion.matches;
    const value=this.sequence?.frame(elapsed,reduced);if(!value)return;
    const progress=this.sequence.names.length<2?0:value.progress*value.progress*(3-2*value.progress);
    this.setName(this.nodes[0],value.current);this.setName(this.nodes[1],value.next);
    this.nodes[0].style.transform=`translate(-50%,-50%) translateY(${-progress*this.slotHeight}px)`;
    this.nodes[1].style.transform=`translate(-50%,-50%) translateY(${(1-progress)*this.slotHeight}px)`;
    this.nodes[1].hidden=reduced||this.sequence.names.length<2;
    if(reduced)this.timer=setTimeout(()=>this.tick(),value.interval-elapsed%value.interval+1);
    else this.frame=requestAnimationFrame(()=>this.tick());
  }
}
