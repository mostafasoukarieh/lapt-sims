// A table cell where the student types a result calculated from recorded readings (e.g. V = V2 − V1)
// and checks it. Teacher feedback (28 Oct 2026): such results are never computed automatically.
import { t } from './i18n.js';
import { num, parseNum } from './format.js';
import { el, createButton } from './controls.js';

// State of the cell kept on the row: r.calc[key] = { draft, ok, wrong }
function stateOf(r, key) {
  r.calc ??= {};
  r.calc[key] ??= { draft: '', ok: false, wrong: false };
  return r.calc[key];
}

// The answer is accepted when it agrees with the expected value to the precision the student typed
// (at least one decimal place): 7.87 → 7.9 or 7.87 accepted, 7.8 refused; 12 → 12 or 12.0 accepted.
export function matches(text, expected) {
  const x = parseNum(text);
  if (!Number.isFinite(x)) return null;
  const typed = (String(text).trim().split(/[.,]/)[1] || '').replace(/\D.*$/, '').length;
  const tol = 0.5 * 10 ** -Math.max(1, typed) + 1e-9;
  return Math.abs(x - expected) <= tol;
}

// calcCell(row, key, { expected, decimals, err, disabled, onCheck(result) }) → <td>
// result: 'ok' | 'wrong' | 'invalid'. err: the readings of this row have an error (shown in red with ⚠).
export function calcCell(r, key, o) {
  const s = stateOf(r, key);
  if (s.ok) return el('td', { class: o.err ? 'bad-text' : 'good-text' }, `${num(o.expected, o.decimals ?? 0)}${o.err ? ' ⚠︎' : ' ✓'}`);
  const input = el('input', {
    class: `text-input${s.wrong ? ' is-wrong' : ''}`, type: 'text', inputmode: 'decimal', autocomplete: 'off',
    'aria-label': t('calc.aria'), placeholder: '?', value: s.draft,
  });
  input.addEventListener('input', () => { s.draft = input.value; });
  const btn = createButton({ labelKey: 'calc.check', variant: 'primary', onClick: () => check() });
  if (o.disabled) { input.disabled = true; btn.disabled = true; input.placeholder = '…'; }
  function check() {
    const m = matches(input.value, o.expected);
    if (m === null) { o.onCheck?.('invalid'); return; }
    s.ok = m; s.wrong = !m;
    o.onCheck?.(m ? 'ok' : 'wrong');
  }
  input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') check(); });
  return el('td', {}, el('div', { class: 'calc-cell' }, [input, btn]));
}

export const calcDone = (r, key) => !!r.calc?.[key]?.ok;
// Signature of the rows' check states: rebuild a table only when it changes, so typing is not interrupted.
export const calcSig = (rows) => JSON.stringify(rows.map((r) => r.calc ? Object.values(r.calc).map((s) => [s.ok, s.wrong]) : 0)) + t('calc.check');
