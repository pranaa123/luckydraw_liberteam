export class HistoryNavigation {
  start() {
    const tabs = [...document.querySelectorAll('[data-history-view]')];
    const activate = name => {
      for (const tab of tabs) {
        const selected = tab.dataset.historyView === name;
        tab.setAttribute('aria-selected',String(selected)); tab.tabIndex = selected ? 0 : -1;
        document.querySelector(`#history-${tab.dataset.historyView}`).hidden = !selected;
      }
      document.dispatchEvent(new CustomEvent('history-view',{ detail: name }));
    };
    for (const [index,tab] of tabs.entries()) {
      tab.addEventListener('click',()=>activate(tab.dataset.historyView));
      tab.addEventListener('keydown',event=>{
        const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
        if (next === null) return;
        event.preventDefault(); activate(tabs[next].dataset.historyView); tabs[next].focus();
      });
    }
  }
}
