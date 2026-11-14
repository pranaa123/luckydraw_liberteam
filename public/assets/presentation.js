import { PresentationView } from './modules/presentation-view.js';
import { AuthController } from './modules/auth-controller.js';

new AuthController().start();
new PresentationView().start();

// Halaman output mandiri untuk browser tanpa dukungan pemilihan layar.
// Presentasi fullscreen dari operator dikelola oleh PresentationSession.
const button = document.querySelector('#fullscreen');
const message = document.querySelector('#fullscreen-message');

button?.addEventListener('click', async () => {
  try {
    await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    message.hidden = true;
  } catch {
    message.textContent = 'Gunakan fitur fullscreen browser untuk layar penuh.';
    message.hidden = false;
  }
});

document.addEventListener('fullscreenchange', () => {
  if (button) button.hidden = Boolean(document.fullscreenElement);
  if (message && document.fullscreenElement) message.hidden = true;
});
