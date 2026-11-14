/** Dropdown bersama: tanda filter efektif, reset sekali klik, dan posisi dalam viewport. */
export class FilterDropdown {
  constructor(control,menu) {
    this.control = control; this.menu = menu; this.panel = control.host;
    this.summary = menu.querySelector('summary'); this.count = menu.querySelector('[data-filter-count]');
    this.clear = menu.closest('.filter-dropdown').querySelector('[data-clear-filters]');
  }
  start() {
    this.control.addEventListener('statechange',()=>this.update());
    this.clear.addEventListener('click',()=>{ this.control.clear(); this.menu.open = false; this.summary.focus(); });
    this.menu.addEventListener('toggle',()=>this.fit());
    this.menu.addEventListener('keydown',event=>{
      if (event.key !== 'Escape' || !this.menu.open) return;
      event.preventDefault(); this.menu.open = false; this.summary.focus();
    });
    document.addEventListener('pointerdown',event=>{ if (this.menu.open && !this.menu.contains(event.target)) this.menu.open = false; });
    document.addEventListener('operator-tab',()=>{ this.menu.open = false; });
    window.addEventListener('resize',()=>this.schedule(),{passive:true});
    window.addEventListener('scroll',()=>this.schedule(),{passive:true,capture:true});
    window.addEventListener('pagehide',()=>cancelAnimationFrame(this.frame),{once:true});
    this.update();
  }
  update() {
    const count = Object.values(this.control.get()).filter(group=>group.mode==='include' || group.values.length>0).length;
    this.menu.dataset.filterActive = String(count > 0);
    this.count.textContent = String(count); this.count.hidden = count === 0;
    this.summary.setAttribute('aria-label',count ? `Filter peserta, ${count} filter aktif` : 'Filter peserta');
    this.clear.hidden = count === 0; this.clear.disabled = this.control.locked || !this.control.meta;
    this.schedule();
  }
  schedule() {
    cancelAnimationFrame(this.frame);
    if (this.menu.open) this.frame = requestAnimationFrame(()=>this.fit());
  }
  fit() {
    if (!this.menu.open) return;
    const rect = this.summary.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > innerHeight) { this.menu.open = false; return; }
    const bounds = this.menu.closest('.participant-query-bar,.draw-filter-toolbar').getBoundingClientRect();
    const width = Math.max(0,Math.min(380,bounds.width,innerWidth - 32));
    const left = Math.max(16,Math.min(rect.left,bounds.right - width,innerWidth - width - 16));
    const below = innerHeight - rect.bottom - 24, above = rect.top - 24;
    const up = below < 200 && above > below;
    this.panel.style.setProperty('--filter-panel-width',`${width}px`);
    this.panel.style.setProperty('--filter-panel-left',`${left}px`);
    this.panel.style.setProperty('--filter-panel-top',up ? 'auto' : `${rect.bottom + 8}px`);
    this.panel.style.setProperty('--filter-panel-bottom',up ? `${innerHeight - rect.top + 8}px` : 'auto');
    this.panel.style.setProperty('--filter-panel-height',`${Math.max(0,up ? above : below)}px`);
  }
}
