import { presentationState } from './presentation-state.js';

export class CanvasPreview {
  start() {
    this.shell = document.querySelector('.preview-shell');
    presentationState.addEventListener('change',({ detail }) => this.render(detail.state.visual));
    if (presentationState.packet) this.render(presentationState.packet.state.visual);
  }
  render(visual) {
    this.shell.style.setProperty('--canvas-ratio',String(visual.canvas_width / visual.canvas_height));
    this.shell.style.setProperty('--canvas-aspect',`${visual.canvas_width} / ${visual.canvas_height}`);
    document.querySelector('#preview-resolution').textContent = `${visual.canvas_width} × ${visual.canvas_height}`;
  }
}
