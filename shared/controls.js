// Reusable controls: slider with live value + unit, buttons, segmented choice.
import { t, onLangChange } from './i18n.js';
import { qty } from './format.js';

let uid = 0;
const nextId = (p) => `${p}-${++uid}`;

function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c != null) e.append(c);
  return e;
}
export { el };

// createSlider({ labelKey, min, max, step, value, unit, decimals, onInput })
export function createSlider(o) {
  const id = nextId('sl');
  const label = el('label', { for: id, dataset: { i18n: o.labelKey } }, t(o.labelKey));
  const out = el('output', { for: id, class: 'ctl-value' });
  const input = el('input', {
    id, type: 'range', min: o.min, max: o.max, step: o.step ?? 1, value: o.value,
  });
  const root = el('div', { class: 'ctl ctl-slider' }, [el('div', { class: 'ctl-head' }, [label, out]), input]);
  const show = () => { out.textContent = qty(Number(input.value), o.decimals ?? 0, o.unit ?? ''); };
  input.addEventListener('input', () => { show(); o.onInput?.(Number(input.value)); });
  onLangChange(show);
  show();
  return {
    root,
    input,
    get value() { return Number(input.value); },
    set(v, silent = true) { input.value = v; show(); if (!silent) o.onInput?.(Number(input.value)); },
    setDisabled(d) { input.disabled = d; root.classList.toggle('is-disabled', d); },
  };
}

// createButton({ labelKey, onClick, variant: 'primary'|'secondary'|'ghost' })
export function createButton(o) {
  const b = el('button', { type: 'button', class: `btn btn-${o.variant || 'secondary'}`, dataset: { i18n: o.labelKey } }, t(o.labelKey));
  b.addEventListener('click', o.onClick);
  return b;
}

// createSegmented({ labelKey, options: [{ value, labelKey }], value, onChange })
export function createSegmented(o) {
  const group = el('div', { class: 'seg', role: 'radiogroup' });
  const buttons = o.options.map((opt) => {
    const b = el('button', { type: 'button', role: 'radio', dataset: { i18n: opt.labelKey, value: opt.value } }, t(opt.labelKey));
    b.addEventListener('click', () => { api.set(opt.value); o.onChange?.(opt.value); });
    group.append(b);
    return b;
  });
  const root = el('div', { class: 'ctl' }, [
    o.labelKey ? el('div', { class: 'ctl-head' }, el('span', { class: 'ctl-label', dataset: { i18n: o.labelKey } }, t(o.labelKey))) : null,
    group,
  ]);
  const api = {
    root,
    value: o.value,
    set(v) {
      api.value = v;
      buttons.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.value === String(v))));
    },
    setDisabled(d) { buttons.forEach((b) => { b.disabled = d; }); },
  };
  api.set(o.value);
  return api;
}
