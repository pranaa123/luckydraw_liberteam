/** Transisi hasil sekali per putaran; browser menggerakkan opacity/transform tanpa loop JS. */
export class ResultEntrance {
  constructor() {
    this.motion = matchMedia('(prefers-reduced-motion: reduce)');
    this.active = new Set();
  }
  start() {
    this.motion.addEventListener('change',() => this.finish());
    document.addEventListener('visibilitychange',() => { if (document.hidden) this.finish(); });
    window.addEventListener('pagehide',() => this.cancel(),{ once: true });
  }
  reveal(groups) {
    this.cancel();
    if (document.hidden) return;
    const reduced = this.motion.matches;
    groups.forEach((group,index) => {
      const distance = Number(group.firstElementChild?.getAttribute('font-size') || 0) * .16;
      const animation = group.animate(reduced ? [{ opacity: 0 },{ opacity: 1 }] : [
        { opacity: 0,transform: `translateY(${distance}px)` },
        { opacity: 1,transform: 'translateY(0px)' },
      ],{ duration: reduced ? 120 : 380,delay: reduced ? 0 : Math.min(index * 20,160),easing: 'cubic-bezier(.2,.7,.2,1)',fill: 'backwards' });
      this.active.add(animation);
      const remove = () => this.active.delete(animation);
      animation.addEventListener('finish',remove,{ once: true });
      animation.addEventListener('cancel',remove,{ once: true });
    });
  }
  finish() { for (const animation of this.active) animation.finish(); this.active.clear(); }
  cancel() { for (const animation of this.active) animation.cancel(); this.active.clear(); }
}
