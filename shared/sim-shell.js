// Common page wiring for every simulation: languages, tabs, activity panel, info dialog.
import { addStrings, applyI18n, setLang, t, has, onLangChange, checkKeys } from './i18n.js';
import shared from './strings.js';
import { el } from './controls.js';

export const DEBUG = new URLSearchParams(location.search).has('debug');

// notRequired (optional): true when the whole simulation is not required in the current school year, or
// { tabId: true | 'strings.key' } for some parts (a key adds a precise text, e.g. which activity).
export function initSim({ strings, tabs = [], initialTab, onTab, activityKey, notRequired }) {
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

  // Book reference of the current part (chapter · activity · page), from strings 'ref.<tab>'
  const ref = el('p', { class: 'book-ref', id: 'book-ref', hidden: '' });
  (nav || document.querySelector('.topbar')).after(ref);
  // Highly visible note on the parts not required in the current school year (owner, 4 Nov 2026)
  const nr = el('p', { class: 'not-required', role: 'note', hidden: '' });
  ref.after(nr);
  function renderNotRequired() {
    const v = notRequired === true ? true : notRequired?.[current];
    if (!v) { nr.hidden = true; return; }
    nr.hidden = false;
    nr.replaceChildren(el('strong', {}, `⚠\uFE0E ${t('ui.notRequired')}`), typeof v === 'string' ? ` — ${t(v)}` : '');
  }
  function renderRef() {
    renderNotRequired();
    const key = `ref.${current}`;
    if (!has(key)) { ref.hidden = true; return; }
    ref.hidden = false;
    ref.replaceChildren(el('span', { class: 'book-ref-label' }, t('ui.book')), ' ', t(key));
  }

  function setTab(id) {
    current = id;
    tabButtons.forEach((b) => {
      const on = b.dataset.tab === id;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    renderActivity();
    renderRef();
    onTab?.(id);
  }

  function renderActivity() {
    const body = document.getElementById('activity-body');
    if (!body || !current) return;
    body.replaceChildren();
    // A simulation may show another activity for the same tab (e.g. lamp ↔ motor): activityKey(tab) → 'act.xxx'
    const p = activityKey?.(current) ?? `act.${current}`;
    body.append(el('h3', {}, t('ui.goal')), el('p', {}, t(`${p}.goal`)));
    // Optional note under the goal, e.g. the steps and questions follow the book's values ('act.xxx.note' or the sim-wide 'act.note')
    const noteKey = has(`${p}.note`) ? `${p}.note` : has('act.note') ? 'act.note' : null;
    if (noteKey) body.append(el('p', { class: 'activity-note' }, `ⓘ ${t(noteKey)}`));
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

  onLangChange(() => { renderActivity(); renderRef(); renderInfo(); refreshTitle(); });
  applyI18n();
  renderInfo();
  refreshTitle();
  // First tab is applied by the caller (after it has built its scene) via setTab.
  return { setTab, get tab() { return current; }, start: () => setTab(current), refreshActivity: () => renderActivity() };
}

