// Number / unit formatting per language. Never format numbers by hand in a simulation.
import { getLang } from './i18n.js';

const NBSP = ' ';
const NNBSP = ' ';
const MINUS = '−';

// num(9.8, 1) → "9.8" (EN) / "9,8" (FR). Integers ≥ 10 000 are grouped: "22 600".
export function num(value, decimals = 0, lang = getLang()) {
  if (value == null || !Number.isFinite(value)) return '—';
  let s = Math.abs(value).toFixed(decimals);
  let [int, frac] = s.split('.');
  if (int.length > 4) int = int.replace(/\B(?=(\d{3})+(?!\d))/g, NNBSP);
  s = frac ? int + (lang === 'fr' ? ',' : '.') + frac : int;
  const isZero = Number(Math.abs(value).toFixed(decimals)) === 0;
  return (value < 0 && !isZero ? MINUS : '') + s;
}

// qty(9.8, 1, 'm/s²') → "9.8 m/s²"
export function qty(value, decimals, unit, lang = getLang()) {
  return num(value, decimals, lang) + NBSP + unit;
}

// Parse what a student typed: accepts "47", "47.5", "47,5", " 47 mL ".
export function parseNum(str) {
  if (typeof str !== 'string') return NaN;
  const m = str.trim().replace(/\s+/g, '').replace(MINUS, '-').match(/^-?\d+(?:[.,]\d+)?/);
  return m ? parseFloat(m[0].replace(',', '.')) : NaN;
}
