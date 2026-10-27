// Language handling: EN | FR toggle, data-i18n filling, t() lookups.
const STORAGE_KEY = 'lapt-lang';
const LANGS = ['en', 'fr'];
const dict = { en: {}, fr: {} };
const listeners = new Set();

function readStoredLang() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (LANGS.includes(v)) return v;
  } catch (e) { /* storage unavailable */ }
  return 'en';
}

let lang = readStoredLang();

export function addStrings(strings) {
  for (const l of LANGS) Object.assign(dict[l], strings[l] || {});
}

export function getLang() { return lang; }

export function setLang(l) {
  if (!LANGS.includes(l)) return;
  lang = l;
  try { localStorage.setItem(STORAGE_KEY, l); } catch (e) { /* ignore */ }
  applyI18n();
  listeners.forEach((f) => f(l));
}

export function onLangChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// t('key') or t('key', {n: 3}) → string (or array/object if the entry is one)
export function t(key, params) {
  let s = dict[lang][key];
  if (s == null) {
    s = dict.en[key];
    if (s == null) { console.warn('[i18n] missing key:', key); return key; }
  }
  if (params && typeof s === 'string') {
    s = s.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? params[k] : m));
  }
  return s;
}

export function applyI18n(root = document) {
  document.documentElement.lang = lang;
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  for (const attr of ['aria-label', 'title', 'placeholder']) {
    root.querySelectorAll(`[data-i18n-${attr}]`).forEach((el) => {
      el.setAttribute(attr, t(el.getAttribute(`data-i18n-${attr}`)));
    });
  }
  document.querySelectorAll('[data-lang-btn]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.langBtn === lang));
  });
}

// Development check: every key must exist in both languages.
export function checkKeys() {
  const en = Object.keys(dict.en), fr = Object.keys(dict.fr);
  const missFr = en.filter((k) => !(k in dict.fr));
  const missEn = fr.filter((k) => !(k in dict.en));
  if (missFr.length || missEn.length) console.warn('[i18n] missing FR:', missFr, 'missing EN:', missEn);
  return { missFr, missEn };
}
