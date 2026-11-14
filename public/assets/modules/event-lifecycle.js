import { authScope,eventScope,scopedName } from './auth-context.js';

let channel, started = false, changing = false;

export function changeEvent(broadcast = true) {
  const outputHost = document.body.classList.contains('is-output-host');
  const keepFullscreen = outputHost || document.body.dataset.eventDisplayOnly === 'true'
    || (location.pathname === '/output' && document.fullscreenElement);
  if (keepFullscreen) {
    if (broadcast) channel?.postMessage({ previous_event_id:eventScope });
    document.body.dataset.eventDisplayOnly = 'true';
    document.dispatchEvent(new Event('event-changing'));
    let frame = outputHost ? document.querySelector('.preview-frame') : document.querySelector('.event-reset-output-frame');
    if (!frame) {
      frame = document.createElement('iframe');
      frame.className = 'event-reset-output-frame';
      frame.title = 'Output presentasi';
      document.body.classList.add('is-reset-output');
      document.body.append(frame);
    }
    // Elemen fullscreen tetap hidup; hanya dokumen renderer yang diganti.
    frame.contentWindow.location.replace('/output?preview=1');
    return;
  }
  if (changing || !eventScope) return;
  changing = true;
  if (broadcast) channel?.postMessage({ previous_event_id:eventScope });
  document.dispatchEvent(new Event('event-changing'));
  location.reload();
}

export function startEventLifecycle() {
  if (started || !authScope || !eventScope) return;
  started = true;
  if (typeof BroadcastChannel === 'function') {
    channel = new BroadcastChannel(scopedName('doorprize-baru-event-reset'));
    channel.addEventListener('message', ({ data }) => {
      if (document.body.dataset.eventDisplayOnly === 'true' || document.body.classList.contains('is-output-host') || String(data?.previous_event_id) === eventScope) changeEvent(false);
    });
    window.addEventListener('pagehide', () => channel.close(), { once:true });
  }
}
