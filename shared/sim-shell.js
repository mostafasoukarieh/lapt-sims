// Common page wiring for every simulation: languages, tabs, activity panel, info dialog.
import { addStrings, applyI18n, setLang, t, onLangChange, checkKeys } from './i18n.js';
import shared from './strings.js';
import { el } from './controls.js';

export const DEBUG = new URLSearchParams(location.search).has('debug');

export function initSim({ strings, tabs = [], initialTab, onTab }) {
  addStrings(shared);
  addStrings(strings);
  if (DEBUG) checkKeys();

  // Language toggle
  document.querySelectorAll('[data-lang-btn]').forEach((b) => {
    b.addEventListener('click', () => setLang(b.dataset.langBtn));
  });

  // Info dialog
  const dlg = document.getElementById('info');
  document.getElementById('info-btn')?.addEventListener('click', () => {
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  });
  dlg?.querySelector('[data-close]')?.addEventListener('click', () => dlg.close?.() ?? dlg.removeAttribute('open'));
  dlg?.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

  // Tabs
  const nav = document.getElementById('tabs');
  let current = new URLSearchParams(location.search).get('tab') || initialTab || tabs[0]?.id;
  if (!tabs.some((x) => x.id === current)) current = tabs[0]?.id;
  const tabButtons = tabs.map((tab) => {
    const b = el('button', { type: 'button', role: 'tab', dataset: { i18n: tab.labelKey, tab: tab.id } });
    b.addEventListener('click', () => setTab(tab.id));
    nav?.append(b);
    return b;
  });
  if (nav && tabs.length < 2) nav.hidden = true;

  function setTab(id) {
    current = id;
    tabButtons.forEach((b) => {
      const on = b.dataset.tab === id;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    renderActivity();
    onTab?.(id);
  }

  function renderActivity() {
    const body = document.getElementById('activity-body');
    if (!body || !current) return;
    body.replaceChildren();
    const p = `act.${current}`;
    body.append(el('h3', {}, t('ui.goal')), el('p', {}, t(`${p}.goal`)));
    const ol = el('ol');
    for (const s of t(`${p}.steps`)) ol.append(el('li', {}, s));
    body.append(el('h3', {}, t('ui.steps')), ol);
    const qs = t(`${p}.questions`);
    if (Array.isArray(qs) && qs.length) {
      body.append(el('h3', {}, t('ui.questions')));
      qs.forEach(([q, a], i) => {
        const d = el('details', { class: 'qa' }, [
          el('summary', {}, [el('span', { class: 'qa-q' }, `${i + 1}. ${q}`), el('span', { class: 'qa-show' }, t('ui.showAnswer'))]),
          el('p', { class: 'qa-a' }, a),
        ]);
        body.append(d);
      });
    }
  }

  function renderInfo() {
    const body = document.getElementById('info-body');
    if (!body) return;
    body.replaceChildren();
    body.append(el('p', { class: 'muted' }, `${t('ui.book')} — ${t('info.book')}`));
    body.append(el('h3', {}, t('ui.model')));
    const ul = el('ul');
    for (const s of t('info.model')) ul.append(el('li', {}, s));
    body.append(ul);
    body.append(el('h3', {}, t('ui.assumptions')));
    const ul2 = el('ul');
    for (const s of t('info.assumptions')) ul2.append(el('li', {}, s));
    body.append(ul2);
  }

  function refreshTitle() { document.title = `${t('title')} — LAPT`; }

  onLangChange(() => { renderActivity(); renderInfo(); refreshTitle(); });
  applyI18n();
  renderInfo();
  refreshTitle();
  // First tab is applied by the caller (after it has built its scene) via setTab.
  return { setTab, get tab() { return current; }, start: () => setTab(current) };
}

