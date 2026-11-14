import { GoogleController } from './modules/google-controller.js';
import { ImportController } from './modules/import-controller.js';
import { DuplicateController } from './modules/duplicate-controller.js';
import { OutputController } from './modules/output-controller.js';
import { ManagementController } from './modules/management-controller.js';
import { SettingsController } from './modules/settings-controller.js';
import { DrawController } from './modules/draw-controller.js';
import { HistoryController } from './modules/history-controller.js';
import { HistoryNavigation } from './modules/history-navigation.js';
import { WinnerController } from './modules/winner-controller.js';

const tabs = [...document.querySelectorAll('[data-tab]')];
const panels = [...document.querySelectorAll('[data-panel]')];

function activateTab(name, updateHash = true) {
  if (!tabs.some((tab) => tab.dataset.tab === name)) name = 'draw';
  for (const tab of tabs) {
    const selected = tab.dataset.tab === name;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  for (const panel of panels) panel.hidden = panel.dataset.panel !== name;
  if (updateHash) history.replaceState(null, '', `#${name}`);
  document.dispatchEvent(new CustomEvent('operator-tab', { detail: name }));
}

tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => activateTab(tab.dataset.tab));
  tab.addEventListener('keydown', (event) => {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    activateTab(tabs[next].dataset.tab);
    tabs[next].focus();
  });
});

activateTab(location.hash.slice(1), false);
window.addEventListener('hashchange', () => activateTab(location.hash.slice(1), false));

new AuthController().start();
new OutputController(window, document).start();
new ManagementController().start();
new SettingsController().start();
new DrawController().start();
new HistoryNavigation().start();
new HistoryController().start();
new WinnerController().start();



new ImportController().start();
new DuplicateController().start();

new GoogleController().start();
import { AuthController } from './modules/auth-controller.js';
