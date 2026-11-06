// Grade 7 — Volume: units, calculation and estimation (Ch.2 Act. 1, 2, 7, 8; Ex. 8, 9, 10, 14)
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num, parseNum } from '../../../shared/format.js';
import { createButton, createSegmented, createSlider, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, font, arrow } from '../../../shared/draw.js';
import { calcCell, calcSig, calcDone } from '../../../shared/calc-cell.js';
import { label, person } from '../../../shared/figures.js';

const SCENE = { w: 600, h: 440 };
const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

/* ================================================================
   Units of volume (factor to m³)
   ================================================================ */
const UNITS = { m3: 1, dm3: 1e-3, L: 1e-3, cL: 1e-5, mL: 1e-6, cm3: 1e-6 };
const SYM = { m3: 'm³', dm3: 'dm³', L: 'L', cL: 'cL', mL: 'mL', cm3: 'cm³' };
const convert = (v, from, to) => (v * UNITS[from]) / UNITS[to];
// A volume written without useless zeros: 0.000001, 5300, 0.943
function fmt(v) {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  const d = a === 0 || a >= 1 ? 4 : Math.min(10, Math.ceil(-Math.log10(a)) + 4);
  let s = num(v, d);
  if (/[.,]/.test(s)) s = s.replace(/0+$/, '').replace(/[.,]$/, '');
  return s;
}
// Exercises 8, 9 and 10 of the book, then random questions
const BOOK_Q = [
  { v: 1, from: 'L', to: 'mL', src: 'q.ex8' }, { v: 1, from: 'L', to: 'm3', src: 'q.ex8' }, { v: 1, from: 'L', to: 'dm3', src: 'q.ex8' },
  { v: 1, from: 'm3', to: 'cm3', src: 'q.ex9' }, { v: 5.3, from: 'm3', to: 'L', src: 'q.ex9' }, { v: 25.8, from: 'L', to: 'dm3', src: 'q.ex9' },
  { v: 943, from: 'cm3', to: 'dm3', src: 'q.ex9' }, { v: 2.8, from: 'dm3', to: 'cm3', src: 'q.ex9' }, { v: 875, from: 'dm3', to: 'm3', src: 'q.ex9' },
  { v: 0.45, from: 'm3', to: 'L', src: 'q.ex10' }, { v: 375, from: 'cm3', to: 'L', src: 'q.ex10' }, { v: 75, from: 'cL', to: 'L', src: 'q.ex10' }, { v: 0.6, from: 'dm3', to: 'L', src: 'q.ex10' },
];
function randomQ() {
  const keys = Object.keys(UNITS);
  let from, to;
  do { from = keys[randInt(0, 5)]; to = keys[randInt(0, 5)]; } while (UNITS[from] === UNITS[to]);
  const vals = [0.25, 0.5, 1.2, 2.5, 3, 4.5, 12, 35, 75, 150, 250, 500, 750, 1500];
  return { v: vals[randInt(0, vals.length - 1)], from, to, src: 'q.random' };
}

/* ================================================================
   Solids (Act. 7, Fig. 9 and 10; Ex. 14)
   ================================================================ */
const CAN = { d: 13, h: 18 }; // cm — the milk can of Fig. 10 (illustrative values, measured with the rulers)
const ROOM = { a: 10, b: 7.5, c: 3 }; // m — Exercise 14
function volumeOf(st) {
  const d = st.dims;
  switch (st.solid) {
    case 'cube': return d.a ** 3;
    case 'prism': return d.a * d.b * d.c;
    case 'cylinder': return Math.PI * d.r * d.r * d.h;
    case 'sphere': return (4 / 3) * Math.PI * d.r ** 3;
    case 'room': return ROOM.a * ROOM.b * ROOM.c;
    default: return Math.PI * (CAN.d / 2) ** 2 * CAN.h;
  }
}
const DIM_KEYS = { cube: ['a'], prism: ['a', 'b', 'c'], cylinder: ['r', 'h'], sphere: ['r'] };

/* ================================================================
   Estimation (Act. 8 and the remark of p.24)
   ================================================================ */
const OBJECTS = ['sugar', 'eraser', 'apple', 'teaBox', 'body', 'fridge', 'room'];
const ESTIMATES = ['mm3', 'cm10', 'cm250', 'L1', 'L50', 'm1', 'm200'];
const ANSWER = { sugar: 'mm3', eraser: 'cm10', apple: 'cm250', teaBox: 'L1', body: 'L50', fridge: 'm1', room: 'm200' };

function initialState() {
  return {
    units: { mode: 'explore', value: '1', unit: 'L', q: 0, list: BOOK_Q.slice(), input: '', ok: 0, total: 0, done: false, fb: null },
    calc: { solid: 'cube', dims: { a: 5, b: 4, c: 8, r: 3, h: 10 }, rows: [], can: {}, fb: null },
    est: { obj: 'sugar', pick: null, solved: {}, tries: 0, fb: null },
  };
}
let S = initialState();

/* ================================================================
   Canvas
   ================================================================ */
let shell;
const canvas = document.getElementById('stage');
const view = setupCanvas(canvas, { width: SCENE.w, height: SCENE.h, maxHeightVh: () => (window.innerWidth < 880 ? 52 : 76), onResize: () => draw() });
onThemeChange(() => draw());

function draw() {
  if (!shell) return;
  const ctx = view.begin();
  ctx.fillStyle = cssVar('--board'); roundRect(ctx, 6, 6, SCENE.w - 12, SCENE.h - 12, 14); ctx.fill();
  ({ units: drawUnits, calc: drawCalc, est: drawEst })[shell.tab](ctx);
}

// A box in oblique projection: front face w × h at (x, y) = bottom-left corner, depth d drawn at 30°
function box(ctx, x, y, w, h, d, color = cssVar('--solid'), { alpha = 1, stroke = true } = {}) {
  const dx = d * 0.5, dy = -d * 0.35;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(x, y - h, w, h);
  ctx.globalAlpha = alpha * 0.75;
  ctx.beginPath(); ctx.moveTo(x, y - h); ctx.lineTo(x + dx, y - h + dy); ctx.lineTo(x + w + dx, y - h + dy); ctx.lineTo(x + w, y - h); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = alpha * 0.55;
  ctx.beginPath(); ctx.moveTo(x + w, y); ctx.lineTo(x + w + dx, y + dy); ctx.lineTo(x + w + dx, y - h + dy); ctx.lineTo(x + w, y - h); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
  if (stroke) {
    ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 1.2;
    ctx.strokeRect(x, y - h, w, h);
    ctx.beginPath();
    ctx.moveTo(x, y - h); ctx.lineTo(x + dx, y - h + dy); ctx.lineTo(x + w + dx, y - h + dy); ctx.lineTo(x + w, y - h);
    ctx.moveTo(x + w + dx, y - h + dy); ctx.lineTo(x + w + dx, y + dy); ctx.lineTo(x + w, y);
    ctx.stroke();
  }
  return { dx, dy };
}

/* ---------- Tab 1: units ---------- */
function drawUnits(ctx) {
  const st = S.units;
  // left: 1 m³ → 1 dm³ = 1 L → 1 cm³ = 1 mL (each cube is 10 × 10 × 10 of the next one)
  const big = { x: 30, y: 190, s: 130 };
  box(ctx, big.x, big.y, big.s, big.s, big.s, cssVar('--solid'), { alpha: 0.35 });
  const sm = big.s / 10;
  box(ctx, big.x, big.y, sm, sm, sm, cssVar('--hot'));
  label(ctx, t('lbl.m3cube'), big.x + 90, big.y + 20, { size: 12, weight: 800 });
  ctx.strokeStyle = cssVar('--hot'); ctx.setLineDash([4, 4]); ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(big.x + sm, big.y - sm); ctx.lineTo(60, 300); ctx.stroke(); ctx.setLineDash([]);
  const mid = { x: 40, y: 405, s: 90 };
  box(ctx, mid.x, mid.y, mid.s, mid.s, mid.s, cssVar('--hot'), { alpha: 0.35 });
  ctx.strokeStyle = cssVar('--hot'); ctx.lineWidth = 0.5; ctx.globalAlpha = 0.6;
  for (let k = 1; k < 10; k++) { ctx.beginPath(); ctx.moveTo(mid.x + k * 9, mid.y); ctx.lineTo(mid.x + k * 9, mid.y - mid.s); ctx.moveTo(mid.x, mid.y - k * 9); ctx.lineTo(mid.x + mid.s, mid.y - k * 9); ctx.stroke(); }
  ctx.globalAlpha = 1;
  box(ctx, mid.x, mid.y, 9, 9, 9, cssVar('--accent'));
  label(ctx, t('lbl.dm3cube'), mid.x + 140, mid.y - 70, { size: 11, weight: 800, align: 'left' });
  label(ctx, t('lbl.cm3cube'), mid.x + 140, mid.y - 46, { size: 11, weight: 800, align: 'left', color: cssVar('--accent') });

  // right: the ladder of Fig. 3
  const lx = 460, rungs = [['m3', 66], ['dm3', 190], ['cm3', 340]];
  const hl = st.mode === 'explore' ? st.unit : null;
  const val = parseNum(st.value);
  for (const [u, y] of rungs) {
    const alt = u === 'dm3' ? 'L' : u === 'cm3' ? 'mL' : null;
    const on = hl === u || hl === alt;
    ctx.fillStyle = on ? cssVar('--accent') : cssVar('--surface');
    ctx.strokeStyle = cssVar('--accent'); ctx.lineWidth = 2;
    roundRect(ctx, lx - 60, y - 26, 120, alt ? 52 : 40, 10); ctx.fill(); ctx.stroke();
    ctx.fillStyle = on ? '#fff' : cssVar('--text'); ctx.font = font(18, 800); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(SYM[u], lx, alt ? y - 10 : y - 6);
    if (alt) { ctx.font = font(15, 700); ctx.fillText(SYM[alt], lx, y + 13); }
    if (st.mode === 'explore' && Number.isFinite(val)) {
      const unitsHere = alt ? [u, alt] : [u];
      label(ctx, unitsHere.map((k) => `${fmt(convert(val, st.unit, k))} ${SYM[k]}`).join(' = '), lx, y + (alt ? 44 : 32), { size: 12, weight: 700, color: cssVar('--text') });
    }
  }
  // cL between L and mL
  label(ctx, '1 L = 100 cL = 1000 mL', lx, 418, { size: 12, weight: 700, color: cssVar('--muted') });
  for (const [y0, y1] of [[104, 156], [252, 306]]) {
    ctx.strokeStyle = cssVar('--text'); ctx.fillStyle = cssVar('--text'); ctx.lineWidth = 2;
    arrow(ctx, lx - 80, y0, lx - 80, y1, 8); arrow(ctx, lx + 80, y1, lx + 80, y0, 8);
    label(ctx, '× 1000', lx - 108, (y0 + y1) / 2, { size: 12, weight: 800 });
    label(ctx, '÷ 1000', lx + 108, (y0 + y1) / 2, { size: 12, weight: 800 });
  }
  if (st.mode === 'practice') {
    const q = currentQ();
    ctx.fillStyle = cssVar('--surface'); ctx.strokeStyle = cssVar('--accent'); ctx.lineWidth = 2;
    roundRect(ctx, 236, 18, 150, 60, 10); ctx.fill(); ctx.stroke();
    label(ctx, `${fmt(q.v)} ${SYM[q.from]}`, 311, 38, { size: 18, weight: 800 });
    label(ctx, `= ? ${SYM[q.to]}`, 311, 62, { size: 16, weight: 800, color: cssVar('--accent') });
  }
}
const currentQ = () => S.units.list[S.units.q];

/* ---------- Tab 2: calculation ---------- */
const CX = 230, CY = 330; // anchor of the drawing (bottom-left of the front face)
function scaleFor(st) {
  const d = st.dims;
  const ext = { cube: d.a * 1.5, prism: Math.max(d.c + d.a * 0.5, d.b + d.a * 0.35), cylinder: Math.max(2 * d.r, d.h + d.r * 0.6), sphere: 2 * d.r }[st.solid];
  return Math.min(22, 250 / ext);
}
function dimLabel(ctx, text, x, y, opts = {}) { label(ctx, text, x, y, { size: 13, weight: 800, color: cssVar('--accent'), ...opts }); }
function drawCalc(ctx) {
  const st = S.calc, d = st.dims, U = 'cm';
  if (st.solid === 'room') return drawRoom(ctx);
  if (st.solid === 'can') return drawCan(ctx);
  const k = scaleFor(st);
  if (st.solid === 'cube' || st.solid === 'prism') {
    const w = (st.solid === 'cube' ? d.a : d.c) * k, h = (st.solid === 'cube' ? d.a : d.b) * k, dp = d.a * k;
    const x = CX - w / 2 - dp * 0.25, y = CY;
    const { dx, dy } = box(ctx, x, y, w, h, dp);
    if (st.solid === 'cube') {
      dimLabel(ctx, `a = ${num(d.a, 1)} ${U}`, x + w / 2, y + 18);
    } else {
      dimLabel(ctx, `c = ${num(d.c, 1)} ${U}`, x + w / 2, y + 18);
      dimLabel(ctx, `b = ${num(d.b, 1)} ${U}`, x - 10, y - h / 2, { align: 'right' });
      dimLabel(ctx, `a = ${num(d.a, 1)} ${U}`, x + w + dx / 2 + 12, y - h + dy / 2 - 6, { align: 'left' });
    }
  } else if (st.solid === 'cylinder') {
    const r = d.r * k, h = d.h * k, ry = r * 0.3;
    const x = CX, yb = CY, yt = CY - h;
    ctx.fillStyle = cssVar('--solid');
    ctx.globalAlpha = 0.8; ctx.fillRect(x - r, yt, 2 * r, h);
    ctx.beginPath(); ctx.ellipse(x, yb, r, ry, 0, 0, Math.PI); ctx.fill();
    ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.ellipse(x, yt, r, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(x, yt, r, ry, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - r, yt); ctx.lineTo(x - r, yb); ctx.moveTo(x + r, yt); ctx.lineTo(x + r, yb); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(x, yb, r, ry, 0, 0, Math.PI); ctx.stroke();
    ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.ellipse(x, yb, r, ry, 0, Math.PI, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = cssVar('--accent'); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, yt); ctx.lineTo(x + r, yt); ctx.stroke();
    ctx.fillStyle = cssVar('--accent'); ctx.beginPath(); ctx.arc(x, yt, 3, 0, Math.PI * 2); ctx.fill();
    dimLabel(ctx, `r = ${num(d.r, 1)} ${U}`, x + r / 2, yt - ry - 14);
    dimLabel(ctx, `h = ${num(d.h, 1)} ${U}`, x + r + 10, (yt + yb) / 2, { align: 'left' });
  } else {
    const r = d.r * k, x = CX, y = CY - r;
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
    g.addColorStop(0, cssVar('--surface')); g.addColorStop(1, cssVar('--solid'));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 1.2; ctx.stroke();
    ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.28, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = cssVar('--accent'); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + r * 0.71, y - r * 0.71); ctx.stroke();
    ctx.fillStyle = cssVar('--accent'); ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    dimLabel(ctx, `r = ${num(d.r, 1)} ${U}`, x + r * 0.45 + 30, y - r * 0.4, { align: 'left' });
  }
  formulaCard(ctx);
}
function formulaCard(ctx) {
  const st = S.calc;
  ctx.fillStyle = cssVar('--surface'); ctx.strokeStyle = cssVar('--border'); ctx.lineWidth = 1.5;
  roundRect(ctx, 380, 24, 204, 92, 10); ctx.fill(); ctx.stroke();
  label(ctx, t(`sol.${st.solid}`), 482, 46, { size: 12, weight: 800, halo: false });
  label(ctx, t(`f.${st.solid}`), 482, 76, { size: 18, weight: 800, color: cssVar('--accent'), halo: false });
  label(ctx, t(`fn.${st.solid}`), 482, 100, { size: 10, color: cssVar('--muted'), halo: false });
}
function drawRuler(ctx, x, y, len, k, vertical, from = 0) {
  // len in cm, k px per cm; ticks every mm, numbers every cm; from: the 0 of the ruler at (x, y)
  ctx.save();
  ctx.translate(x, y); if (vertical) ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = cssVar('--ruler'); ctx.fillRect(-6, 0, len * k + 12, 26);
  ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 1; ctx.fillStyle = cssVar('--text'); ctx.font = font(9, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let i = 0; i <= len * 10; i++) {
    const px = (i / 10) * k, l = i % 10 === 0 ? 10 : i % 5 === 0 ? 7 : 4;
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, l); ctx.stroke();
    if (i % 10 === 0) ctx.fillText(String(i / 10 + from), px, 12);
  }
  ctx.restore();
}
function drawCan(ctx) {
  const k = 14, r = (CAN.d / 2) * k, h = CAN.h * k, ry = r * 0.22;
  const x = 230, yb = 380, yt = yb - h;
  ctx.fillStyle = cssVar('--can'); ctx.fillRect(x - r, yt, 2 * r, h);
  ctx.beginPath(); ctx.ellipse(x, yb, r, ry, 0, 0, Math.PI); ctx.fill();
  ctx.fillStyle = cssVar('--surface'); ctx.fillRect(x - r, yt + h * 0.35, 2 * r, h * 0.3);
  ctx.fillStyle = cssVar('--text'); ctx.font = font(14, 800); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(t('lbl.milk'), x, yt + h * 0.5);
  ctx.fillStyle = cssVar('--metal'); ctx.beginPath(); ctx.ellipse(x, yt, r, ry, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 1.2; ctx.stroke();
  // vertical ruler on the right (0 on the table), horizontal ruler across the top (0 at the left edge)
  drawRuler(ctx, x + r + 14, yb, 20, k, true);
  ctx.strokeStyle = cssVar('--muted'); ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(x, yt); ctx.lineTo(x + r + 14, yt); ctx.stroke(); ctx.setLineDash([]);
  drawRuler(ctx, x - r, yt - ry - 34, 15, k, false);
  ctx.strokeStyle = cssVar('--muted'); ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(x - r, yt); ctx.lineTo(x - r, yt - ry - 34); ctx.moveTo(x + r, yt); ctx.lineTo(x + r, yt - ry - 34); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = cssVar('--wood'); ctx.fillRect(30, yb + 4, 540, 8);
  label(ctx, t('lbl.readRulers'), 300, 426, { size: 12, color: cssVar('--muted') });
}
function drawRoom(ctx) {
  // classroom 10 m × 7.5 m × 3 m drawn as a box, with a person for scale
  const k = 26, w = ROOM.a * k * 0.75, h = ROOM.c * k * 1.4, dp = ROOM.b * k * 0.7;
  const x = 150, y = 340;
  const { dx, dy } = box(ctx, x, y, w, h, dp, cssVar('--paper'));
  person(ctx, x + w * 0.2, y, { color: cssVar('--accent'), h: h * 0.55 });
  dimLabel(ctx, `${t('lbl.length')} = ${num(ROOM.a, 1)} m`, x + w / 2, y + 20);
  dimLabel(ctx, `${t('lbl.height')} = ${num(ROOM.c, 1)} m`, x - 8, y - h / 2, { align: 'right' });
  dimLabel(ctx, `${t('lbl.width')} = ${num(ROOM.b, 1)} m`, x + w + dx / 2 + 10, y + dy / 2 + 8, { align: 'left' });
  formulaCard(ctx);
}

/* ---------- Tab 3: estimation ---------- */
const CARD = { w: 130, h: 150 };
function cardPos(i) { const row = i < 4 ? 0 : 1, col = i < 4 ? i : i - 4; const n = row ? 3 : 4; return { x: 300 - (n * CARD.w + (n - 1) * 12) / 2 + col * (CARD.w + 12), y: 30 + row * (CARD.h + 40) }; }
function drawObject(ctx, id, cx, cy) {
  ctx.lineWidth = 1.5; ctx.strokeStyle = cssVar('--text');
  switch (id) {
    case 'sugar': {
      box(ctx, cx - 4, cy + 4, 8, 8, 8, cssVar('--surface'));
      ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, 26, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + 19, cy + 19); ctx.lineTo(cx + 36, cy + 36); ctx.stroke();
      break;
    }
    case 'eraser': box(ctx, cx - 25, cy + 12, 50, 12, 20, cssVar('--eraser')); break;
    case 'apple':
      ctx.fillStyle = cssVar('--apple'); ctx.beginPath(); ctx.arc(cx - 10, cy + 6, 22, 0, Math.PI * 2); ctx.arc(cx + 10, cy + 6, 22, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = cssVar('--wood'); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx, cy - 14); ctx.lineTo(cx + 3, cy - 28); ctx.stroke();
      ctx.fillStyle = cssVar('--can'); ctx.beginPath(); ctx.ellipse(cx + 12, cy - 24, 9, 4, -0.4, 0, Math.PI * 2); ctx.fill();
      break;
    case 'teaBox': box(ctx, cx - 22, cy + 30, 44, 60, 22, cssVar('--hot')); break;
    case 'body': person(ctx, cx, cy + 40, { color: cssVar('--accent'), h: 84 }); break;
    case 'fridge':
      box(ctx, cx - 22, cy + 44, 44, 92, 20, cssVar('--surface'));
      ctx.strokeStyle = cssVar('--text'); ctx.beginPath(); ctx.moveTo(cx - 22, cy - 12); ctx.lineTo(cx + 22, cy - 12); ctx.stroke();
      ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx + 15, cy - 34); ctx.lineTo(cx + 15, cy - 20); ctx.moveTo(cx + 15, cy - 2); ctx.lineTo(cx + 15, cy + 18); ctx.stroke();
      break;
    default: { // classroom
      const { dx, dy } = box(ctx, cx - 44, cy + 26, 76, 42, 36, cssVar('--paper'));
      void dx; void dy;
      person(ctx, cx - 30, cy + 26, { color: cssVar('--accent'), h: 22 });
    }
  }
}
function drawEst(ctx) {
  const st = S.est;
  OBJECTS.forEach((id, i) => {
    const { x, y } = cardPos(i);
    const sel = st.obj === id, ok = st.solved[id];
    ctx.fillStyle = cssVar('--surface'); ctx.strokeStyle = sel ? cssVar('--accent') : ok ? cssVar('--good') : cssVar('--border'); ctx.lineWidth = sel ? 3 : 1.5;
    roundRect(ctx, x, y, CARD.w, CARD.h, 12); ctx.fill(); ctx.stroke();
    drawObject(ctx, id, x + CARD.w / 2, y + 62);
    label(ctx, t(`obj.${id}`), x + CARD.w / 2, y + CARD.h - 20, { size: 12, weight: 800, halo: false });
    if (ok) label(ctx, `≈ ${t(`est.${ANSWER[id]}`)}`, x + CARD.w / 2, y + CARD.h + 14, { size: 13, weight: 800, color: cssVar('--good') });
  });
}

/* ================================================================
   Pointer: tap a card in the estimation tab
   ================================================================ */
canvas.addEventListener('pointerdown', (ev) => {
  if (shell.tab !== 'est') return;
  const p = view.toLogical(ev);
  OBJECTS.forEach((id, i) => {
    const { x, y } = cardPos(i);
    if (p.x > x && p.x < x + CARD.w && p.y > y && p.y < y + CARD.h) { S.est.obj = id; S.est.pick = null; S.est.fb = null; buildTab('est'); }
  });
});

/* ================================================================
   Panels
   ================================================================ */
const controlsBody = document.getElementById('controls-body');
const measuresBody = document.getElementById('measures-body');
let ui = {};
function showStatus(fb) {
  if (!ui.status) return;
  if (!fb) { ui.status.hidden = true; return; }
  ui.status.hidden = false; ui.status.className = `status ${fb.type || ''}`; ui.status.textContent = t(fb.key, fb.params);
}
function measRows(rows) {
  const sig = JSON.stringify(rows);
  if (ui.dlSig === sig) return;
  ui.dlSig = sig;
  ui.dl.replaceChildren(...rows.flatMap(([k, v, cls]) => [el('dt', {}, k), el('dd', cls ? { class: cls } : {}, v)]));
}
const seg = (labelKey, values, prefix, value, onChange) => createSegmented({ labelKey, options: values.map((v) => ({ value: v, labelKey: `${prefix}.${v}` })), value, onChange });
const btn = (k, f, v) => createButton({ labelKey: k, onClick: f, variant: v });
const row = (...c) => el('div', { class: 'btn-row' }, c.filter(Boolean));
const resetBtn = (id) => btn('ui.reset', () => { S[id] = initialState()[id]; shell.refreshActivity(); buildTab(id); }, 'ghost');
function panel(controls, extra = []) {
  controlsBody.append(...controls.filter(Boolean).map((c) => c.root ?? c));
  ui.dl = el('dl', { class: 'meas' });
  ui.status = el('div', { class: 'status', hidden: '' });
  measuresBody.append(ui.dl, ...extra, ui.status);
}
function inputRow(id, labelKey, value, onInput, onEnter, buttons) {
  const input = el('input', { class: 'text-input', type: 'text', inputmode: 'decimal', autocomplete: 'off', id });
  input.value = value;
  input.addEventListener('input', () => onInput(input.value));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') onEnter?.(); });
  return { input, root: el('div', { class: 'ctl' }, [el('label', { for: id, dataset: { i18n: labelKey } }, t(labelKey)), el('div', { class: 'input-row' }, [input, ...buttons])]) };
}

/* ---------- units ---------- */
function buildUnits() {
  const st = S.units;
  const mode = seg('ctl.mode', ['explore', 'practice'], 'mode', st.mode, (v) => { st.mode = v; st.fb = null; shell.refreshActivity(); buildTab('units'); });
  if (st.mode === 'explore') {
    const val = inputRow('vol-value', 'ctl.value', st.value, (v) => { st.value = v; updateMeasures(); draw(); }, null, []);
    panel([mode, val.root, seg('ctl.unit', Object.keys(UNITS), 'u', st.unit, (v) => { st.unit = v; updateMeasures(); draw(); }), row(resetBtn('units'))]);
    return;
  }
  const check = () => {
    const x = parseNum(st.input);
    const q = currentQ(), exp = convert(q.v, q.from, q.to);
    if (!Number.isFinite(x)) st.fb = { type: 'warn', key: 'fb.invalid' };
    else if (!st.done) {
      st.total += 1;
      if (Math.abs(x - exp) <= Math.abs(exp) * 1e-6) { st.ok += 1; st.done = true; st.fb = { type: 'good', key: 'fb.convOk', params: { a: `${fmt(q.v)} ${SYM[q.from]}`, b: `${fmt(exp)} ${SYM[q.to]}` } }; }
      else st.fb = { type: 'bad', key: x > exp ? 'fb.convHigh' : 'fb.convLow' };
    }
    updateMeasures();
  };
  const next = () => {
    st.q += 1;
    if (st.q >= st.list.length) st.list.push(randomQ());
    st.input = ''; st.done = false; st.fb = null;
    buildTab('units');
    document.getElementById('conv-answer')?.focus({ preventScroll: true });
  };
  const ans = inputRow('conv-answer', 'ctl.answer', st.input, (v) => { st.input = v; }, check, [btn('ctl.check', check, 'primary')]);
  panel([mode, ans.root, row(btn('ctl.next', next), btn('ctl.showAnswer', () => {
    const q = currentQ();
    st.fb = { type: 'warn', key: 'fb.convAnswer', params: { a: `${fmt(q.v)} ${SYM[q.from]}`, b: `${fmt(convert(q.v, q.from, q.to))} ${SYM[q.to]}` } };
    updateMeasures();
  }, 'ghost'), resetBtn('units'))]);
}
function updateUnits() {
  const st = S.units;
  if (st.mode === 'explore') {
    const v = parseNum(st.value);
    if (!Number.isFinite(v)) { measRows([[t('m.value'), '—']]); showStatus({ type: 'warn', key: 'fb.invalid' }); return; }
    measRows(Object.keys(UNITS).map((u) => [SYM[u], `${fmt(convert(v, st.unit, u))} ${SYM[u]}`]));
    showStatus(null);
  } else {
    const q = currentQ();
    measRows([[t('m.question'), `${st.q + 1} — ${t(q.src)}`], [t('m.convert'), `${fmt(q.v)} ${SYM[q.from]} = ? ${SYM[q.to]}`], [t('m.score'), `${st.ok} / ${st.total}`]]);
    showStatus(st.fb);
  }
}

/* ---------- calc ---------- */
const DIM_RANGE = { a: [1, 20], b: [1, 20], c: [1, 20], r: [1, 10], h: [1, 20] };
function buildCalc() {
  const st = S.calc;
  const solids = seg('ctl.solid', ['cube', 'prism', 'cylinder', 'sphere', 'can', 'room'], 'sol', st.solid, (v) => { st.solid = v; st.fb = null; shell.refreshActivity(); buildTab('calc'); });
  const ctl = [solids];
  for (const key of DIM_KEYS[st.solid] || []) {
    ctl.push(createSlider({ labelKey: `dim.${key}`, min: DIM_RANGE[key][0], max: DIM_RANGE[key][1], step: 0.5, value: st.dims[key], unit: 'cm', decimals: 1, onInput: (v) => { st.dims[key] = v; draw(); updateMeasures(); } }));
  }
  ui.table = el('table', { class: 'data' });
  const extra = [ui.table];
  if (st.solid === 'can') {
    ctl.push(row(resetBtn('calc')));
  } else {
    ctl.push(row(btn('ctl.record', () => {
      const unit = st.solid === 'room' ? 'm' : 'cm';
      const dims = st.solid === 'room' ? `${num(ROOM.a, 1)} × ${num(ROOM.b, 1)} × ${num(ROOM.c, 1)} m` : (DIM_KEYS[st.solid]).map((k) => `${k} = ${num(st.dims[k], 1)} cm`).join(' ; ');
      st.rows.push({ solid: st.solid, dims, unit: `${unit}³`, V: volumeOf(st) });
      st.fb = { type: 'good', key: 'fb.recorded' };
      ui.tableSig = null; updateMeasures();
    }, 'primary'), resetBtn('calc')));
    ui.clearRow = row(btn('ctl.clearTable', () => { st.rows = []; st.fb = null; ui.tableSig = null; updateMeasures(); }, 'ghost'));
    extra.push(ui.clearRow);
  }
  panel(ctl, extra);
}
const onCalc = (okKey, badKey) => (res) => { S.calc.fb = res === 'ok' ? { type: 'good', key: okKey } : res === 'wrong' ? { type: 'bad', key: badKey } : { type: 'warn', key: 'calc.invalid' }; ui.tableSig = null; updateMeasures(); };
function updateCalc() {
  const st = S.calc;
  if (st.solid === 'can') {
    measRows([[t('m.solid'), t('sol.can')]]);
    const c = st.can;
    const sig = calcSig([c]);
    if (ui.tableSig !== sig) {
      ui.tableSig = sig;
      const S1 = Math.PI * (CAN.d / 2) ** 2, V = S1 * CAN.h;
      ui.table.replaceChildren(
        el('thead', {}, el('tr', {}, [el('th', {}, t('col.h')), el('th', {}, t('col.d')), el('th', {}, t('col.S')), el('th', {}, t('col.Vcan'))])),
        el('tbody', {}, el('tr', {}, [
          calcCell(c, 'h', { expected: CAN.h, decimals: 1, tol: 0.15, onCheck: onCalc('fb.readOk', 'fb.readWrong') }),
          calcCell(c, 'd', { expected: CAN.d, decimals: 1, tol: 0.15, onCheck: onCalc('fb.readOk', 'fb.readWrong') }),
          calcCell(c, 'S', { expected: S1, decimals: 1, tol: S1 * 0.01, disabled: !calcDone(c, 'd'), onCheck: onCalc('fb.areaOk', 'fb.areaWrong') }),
          calcCell(c, 'V', { expected: V, decimals: 0, tol: V * 0.01, disabled: !(calcDone(c, 'h') && calcDone(c, 'S')), onCheck: onCalc('fb.volOk', 'fb.volWrong') }),
        ])),
      );
    }
    ui.table.hidden = false;
  } else {
    const unit = st.solid === 'room' ? 'm' : 'cm';
    measRows([[t('m.solid'), t(`sol.${st.solid}`)], [t('m.formula'), t(`f.${st.solid}`)], [t('m.unitV'), `${unit}³`]]);
    const sig = calcSig(st.rows) + st.rows.length;
    if (ui.tableSig !== sig) {
      ui.tableSig = sig;
      ui.table.replaceChildren(
        el('thead', {}, el('tr', {}, [el('th', {}, t('col.solid')), el('th', {}, t('col.dims')), el('th', {}, t('col.V')), el('th', {}, t('col.unit'))])),
        el('tbody', {}, st.rows.map((r) => el('tr', {}, [
          el('td', {}, t(`sol.${r.solid}`)), el('td', {}, r.dims),
          calcCell(r, 'V', { expected: r.V, decimals: r.V < 100 ? 1 : 0, tol: r.V * 0.01, onCheck: onCalc('fb.volOk', 'fb.volWrong') }),
          el('td', {}, r.unit),
        ]))),
      );
    }
    ui.table.hidden = !st.rows.length;
    ui.clearRow.hidden = !st.rows.length;
  }
  showStatus(st.fb);
}

/* ---------- estimation ---------- */
function buildEst() {
  const st = S.est;
  panel([
    seg('ctl.object', OBJECTS, 'obj', st.obj, (v) => { st.obj = v; st.pick = null; st.fb = null; buildTab('est'); }),
    seg('ctl.estimate', ESTIMATES, 'est', st.pick, (v) => { st.pick = v; }),
    row(btn('ctl.check', () => {
      if (!st.pick) st.fb = { type: 'warn', key: 'fb.pick' };
      else if (st.pick === ANSWER[st.obj]) { st.solved[st.obj] = true; st.fb = { type: 'good', key: `fb.est.${st.obj}` }; }
      else st.fb = { type: 'bad', key: ESTIMATES.indexOf(st.pick) > ESTIMATES.indexOf(ANSWER[st.obj]) ? 'fb.estHigh' : 'fb.estLow' };
      updateMeasures(); draw();
    }, 'primary'), resetBtn('est')),
  ]);
}
function updateEst() {
  const st = S.est;
  measRows([[t('m.object'), t(`obj.${st.obj}`)], [t('m.found'), `${Object.keys(st.solved).length} / ${OBJECTS.length}`]]);
  showStatus(st.fb);
}

function buildTab(id) {
  controlsBody.replaceChildren(); measuresBody.replaceChildren(); ui = {};
  ({ units: buildUnits, calc: buildCalc, est: buildEst })[id]();
  updateMeasures(); draw();
}
function updateMeasures() {
  if (!shell || !ui.dl) return;
  ({ units: updateUnits, calc: updateCalc, est: updateEst })[shell.tab]();
}
onLangChange(() => { if (shell) buildTab(shell.tab); });

shell = initSim({
  strings,
  tabs: [
    { id: 'units', labelKey: 'tab.units' },
    { id: 'calc', labelKey: 'tab.calc' },
    { id: 'est', labelKey: 'tab.est' },
  ],
  initialTab: 'units',
  onTab: buildTab,
  activityKey: (tab) => (tab === 'units' ? `act.units.${S.units.mode}` : tab === 'calc' ? (S.calc.solid === 'can' ? 'act.calc.can' : S.calc.solid === 'room' ? 'act.calc.room' : 'act.calc') : 'act.est'),
});
shell.start();
if (DEBUG) window.__sim = { S };
