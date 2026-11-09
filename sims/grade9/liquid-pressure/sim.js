// Grade 9 — Pressure in liquids (Ch.14: Act. 1–8; Ex. 1–11). g = 10 N/kg as in the Grade 9 book.
// p = F / S ; pA = ρ g hA ; pB − pA = ρ g (hB − hA) ; pA = patm + ρ g hA ; Pascal: F / S = f / s.
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange, getLang } from '../../../shared/i18n.js';
import { num, qty } from '../../../shared/format.js';
import { createButton, createSegmented, createSlider, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, font, arrow } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { label } from '../../../shared/figures.js';
import { calcCell, calcSig, calcDone } from '../../../shared/calc-cell.js';
import { G_EB9 } from '../../../shared/constants.js';

/* ================================================================
   Data
   ================================================================ */
const W_ = 600, H_ = 360;
const G = G_EB9;
const PATM = 100000;                                  // Pa (the book: 10⁵ Pa)
const LIQ = {                                         // density in kg/m³
  water: { rho: 1000, c: '--water', d: '--water-dark' },
  alcohol: { rho: 800, c: '--alcohol', d: '--glass-stroke' },
  salt: { rho: 1200, c: '#2f9fb3', d: '#1d6b79' },     // illustrative
  mercury: { rho: 13600, c: '--mercury', d: '#6c7480' },
  oil: { rho: 900, c: '#e1c45a', d: '#a68b2a' },
};
const col = (v) => (v.startsWith('--') ? cssVar(v) : v);
// Activity 1: a brick 20 cm × 10 cm × 5 cm of weight 20 N (illustrative); faces it can rest on
const BRICK = { a: 20, b: 10, c: 5, W: 20 };
const FACES = {
  large: { w: 20, d: 10, h: 5 },    // rests on 20 × 10 cm²
  medium: { w: 20, d: 5, h: 10 },   // rests on 20 × 5 cm²
  small: { w: 5, d: 10, h: 20 },    // rests on 10 × 5 cm²
};
// Exercise 7: aluminium cylinder h = 20 cm, r = 10 cm, ρ = 2700 kg/m³; a coin of diameter 2 cm
const CYL = { h: 0.2, r: 0.1, rho: 2700, coin: 0.01 };
const cylW = () => CYL.rho * Math.PI * CYL.r ** 2 * CYL.h * G;
const S_OPTS = [2, 5], BIG_OPTS = [20, 50, 100];      // cm² (Exercise 11: 2 cm² and 20 cm²)

function initialState(tab) {
  switch (tab) {
    case 'pressure': return { body: 'brick', face: 'large', n: 1, coin: false, rows: [], fb: null };
    case 'depth': return { liq: 'water', H: 25, A: { x: 230, h: 6 }, B: { x: 290, h: 16 }, atm: false, rows: [], fb: null };
    case 'gauge': return { mode: 'immerse', liq: 'water', press: 0, cap: { x: 150, h: 8 }, orient: 'up', hw: 13.6, show: 0, rows: [], fb: null };
    case 'pascal': return { squeeze: 0, holes: [150, 90, 30], time: 0 };
    default: return { s: 2, S: 20, f: 20, W2: 0, y: 0, rows: [], fb: null };
  }
}
const TABS = ['pressure', 'depth', 'gauge', 'pascal', 'press'];
const S = Object.fromEntries(TABS.map((k) => [k, initialState(k)]));

/* ================================================================
   Canvas helpers
   ================================================================ */
let shell;
let drawQueued = false;
const canvas = document.getElementById('stage');
canvas.style.touchAction = 'none';
const view = setupCanvas(canvas, { width: W_, height: H_, maxHeightVh: () => (window.innerWidth < 880 ? 52 : 74), onResize: () => requestDraw() });
function requestDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; draw(); });
}
onThemeChange(() => requestDraw());
const cur = () => S[shell.tab];
const txt = (ctx, s, x, y, o = {}) => label(ctx, s, x, y, { size: 13, weight: 700, ...o });
const muted = (ctx, s, x, y, align = 'left') => txt(ctx, s, x, y, { size: 11, weight: 600, align, color: cssVar('--muted') });
const COLF = '#c0392b', COLP = '#2f6fd6';
// pressure written in Pa, with bar in brackets for large values (owner, 30 Oct 2026)
function pa(v) {
  if (Math.abs(v) >= 1e5) return `${num(v / 1e5, 2)} × 10⁵ Pa (${num(v / 1e5, 2)} bar)`;
  return qty(v, 0, 'Pa');
}
function liquidRect(ctx, x0, x1, ySurf, yBot, liq, alpha = 0.6) {
  const L = typeof liq === 'string' ? LIQ[liq] : liq;
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, col(L.d)); g.addColorStop(0.45, col(L.c)); g.addColorStop(1, col(L.d));
  ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = g; ctx.fillRect(x0, ySurf, x1 - x0, yBot - ySurf); ctx.restore();
  ctx.strokeStyle = col(L.d); ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(x0, ySurf); ctx.lineTo(x1, ySurf); ctx.stroke();
}
function vessel(ctx, x0, x1, yTop, yBot) {
  ctx.fillStyle = cssVar('--glass-fill'); ctx.fillRect(x0, yTop, x1 - x0, yBot - yTop);
  ctx.strokeStyle = cssVar('--glass-stroke'); ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(x0, yTop); ctx.lineTo(x0, yBot); ctx.lineTo(x1, yBot); ctx.lineTo(x1, yTop); ctx.stroke();
}
function ruler(ctx, x, y0, len, px, { label0 = '0', right = false } = {}) {
  // vertical ruler from y0 downwards, graduated in cm
  ctx.fillStyle = '#f3e3a6'; ctx.fillRect(x - 13, y0 - 6, 26, len + 12);
  ctx.strokeStyle = '#7a6420'; ctx.lineWidth = 1; ctx.strokeRect(x - 13, y0 - 6, 26, len + 12);
  ctx.fillStyle = '#3a3020'; ctx.font = font(9, 700); ctx.textAlign = right ? 'left' : 'right'; ctx.textBaseline = 'middle';
  for (let c = 0; c * px <= len + 0.1; c++) {
    const y = y0 + c * px;
    const major = c % 5 === 0;
    ctx.beginPath(); ctx.moveTo(right ? x - 13 : x + 13, y); ctx.lineTo(right ? x - 13 + (major ? 10 : 5) : x + 13 - (major ? 10 : 5), y); ctx.stroke();
    if (major) ctx.fillText(c === 0 ? label0 : String(c), right ? x - 1 : x + 1, y);
  }
}
function oblique(ctx, x, yB, w, h, d, fill, stroke) {
  // a box in oblique projection: front face w × h with its bottom at yB, depth d drawn up-right
  const dx = d * 0.5, dy = -d * 0.35;
  ctx.lineWidth = 1.3; ctx.strokeStyle = stroke;
  ctx.fillStyle = fill; ctx.fillRect(x, yB - h, w, h); ctx.strokeRect(x, yB - h, w, h);
  ctx.fillStyle = shade(fill, 25);
  ctx.beginPath(); ctx.moveTo(x, yB - h); ctx.lineTo(x + dx, yB - h + dy); ctx.lineTo(x + w + dx, yB - h + dy); ctx.lineTo(x + w, yB - h); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = shade(fill, -25);
  ctx.beginPath(); ctx.moveTo(x + w, yB - h); ctx.lineTo(x + w + dx, yB - h + dy); ctx.lineTo(x + w + dx, yB + dy); ctx.lineTo(x + w, yB); ctx.closePath(); ctx.fill(); ctx.stroke();
}
function shade(hex, d) {
  const n = parseInt(hex.slice(1), 16);
  const c = (s) => Math.max(0, Math.min(255, ((n >> s) & 255) + d));
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}

function draw() {
  if (!shell) return;
  const ctx = view.begin();
  ctx.fillStyle = cssVar('--scene-bg'); ctx.fillRect(0, 0, W_, H_);
  ({ pressure: drawPressure, depth: drawDepth, gauge: drawGauge, pascal: drawPascal, press: drawPress })[shell.tab](ctx);
}

/* ---------- Activity 1, Ex. 5–7: pressure p = F / S ---------- */
function pressureCase(st) {
  if (st.body === 'cyl') {
    const F = cylW();
    const S2 = st.coin ? Math.PI * CYL.coin ** 2 : Math.PI * CYL.r ** 2;
    return { F, S: S2, p: F / S2 };
  }
  const f = FACES[st.face];
  const n = st.face === 'large' ? st.n : 1;
  const S2 = (f.w * f.d) / 1e4;
  return { F: n * BRICK.W, S: S2, p: (n * BRICK.W) / S2, n, f };
}
function drawPressure(ctx) {
  const st = S.pressure;
  const c = pressureCase(st);
  const PX = 7;                                         // px per cm
  const ySurf = 250;
  if (st.body === 'brick') {
    // a large container of flour
    ctx.fillStyle = '#efe7d4'; ctx.fillRect(110, ySurf, 380, 90);
    ctx.strokeStyle = cssVar('--glass-stroke'); ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(110, 200); ctx.lineTo(110, 340); ctx.lineTo(490, 340); ctx.lineTo(490, 200); ctx.stroke();
    const sink = Math.min(48, c.p / 90);                // depth of the print (illustrative, proportional to p)
    const f = c.f, w = f.w * PX, d = f.d * PX, h = f.h * PX;
    const x = 300 - w / 2 - d * 0.25, yB = ySurf + sink;
    // the print around the brick
    ctx.fillStyle = '#d8ccb0'; ctx.fillRect(x - 3, ySurf, w + 6, sink);
    for (let i = 0; i < c.n; i++) oblique(ctx, x, yB - i * h, w, h, d, '#b5533c', '#6e2d1e');
    // flour in front of the bottom of the brick
    ctx.fillStyle = '#efe7d4'; ctx.fillRect(110, ySurf + sink + 1, 380, 340 - ySurf - sink - 2);
    ctx.strokeStyle = '#c9bc9a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(112, ySurf); ctx.lineTo(x - 3, ySurf); ctx.moveTo(x + w + 3, ySurf); ctx.lineTo(488, ySurf); ctx.stroke();
    // depth of the print beside the brick
    if (sink > 2) {
      const xd = x + w + d * 0.5 + 22;
      ctx.strokeStyle = cssVar('--muted'); ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(x + w + 4, yB); ctx.lineTo(xd + 6, yB); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = cssVar('--text'); ctx.fillStyle = cssVar('--text'); arrow(ctx, xd, ySurf - 14, xd, ySurf, 5); arrow(ctx, xd, yB + 14, xd, yB, 5);
      muted(ctx, t('lbl.print'), xd + 8, (ySurf + yB) / 2);
    }
    // the pressing force on the surface of contact
    ctx.strokeStyle = COLF; ctx.fillStyle = COLF; ctx.lineWidth = 3;
    arrow(ctx, x + w / 2, yB - 34, x + w / 2, yB - 2, 9);
    txt(ctx, 'F', x + w / 2 + 12, yB - 24, { color: COLF });
    muted(ctx, t('lbl.contact', { a: num(f.w, 0), b: num(f.d, 0) }), 20, 14);
    muted(ctx, t('lbl.flour'), 120, 330);
  } else {
    // Exercise 7: the cylinder on a table, possibly on a coin
    ctx.fillStyle = cssVar('--wood'); ctx.fillRect(80, ySurf, 440, 12);
    const r = CYL.r * 100 * 4, h = CYL.h * 100 * 4, x = 300, yB = ySurf - (st.coin ? 4 : 0);
    if (st.coin) { ctx.fillStyle = '#c9a43c'; ctx.fillRect(x - 4, ySurf - 4, 8, 4); }   // coin: 2 cm at 4 px/cm
    const g = ctx.createLinearGradient(x - r, 0, x + r, 0);
    g.addColorStop(0, '#9aa3ad'); g.addColorStop(0.4, '#e3e7eb'); g.addColorStop(1, '#7d8692');
    ctx.fillStyle = g; ctx.fillRect(x - r, yB - h, 2 * r, h);
    ctx.beginPath(); ctx.ellipse(x, yB - h, r, 10, 0, 0, 7); ctx.fillStyle = '#dfe3e7'; ctx.fill(); ctx.strokeStyle = '#5d6672'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.strokeRect(x - r, yB - h, 2 * r, h);
    ctx.strokeStyle = COLF; ctx.fillStyle = COLF; ctx.lineWidth = 3; arrow(ctx, x + r + 18, yB - 40, x + r + 18, yB - 2, 9);
    txt(ctx, 'F', x + r + 30, yB - 24, { color: COLF });
    muted(ctx, t(st.coin ? 'lbl.onCoin' : 'lbl.onBase'), 20, 14);
  }
}

/* ---------- Activities 2, 3 and 7, Ex. 8: pressure and depth ---------- */
const DP = { x0: 170, x1: 390, yBot: 340, px: 10 };
const dpSurf = (st) => DP.yBot - st.H * DP.px;
function drawDepth(ctx) {
  const st = S.depth;
  const ys = dpSurf(st);
  vessel(ctx, DP.x0, DP.x1, ys - 20, DP.yBot);
  liquidRect(ctx, DP.x0, DP.x1, ys, DP.yBot, st.liq);
  ruler(ctx, DP.x0 - 24, ys, st.H * DP.px, DP.px);
  muted(ctx, 'cm', DP.x0 - 30, ys - 16);
  ctx.fillStyle = cssVar('--wood'); ctx.fillRect(100, DP.yBot, 380, 8);
  if (st.atm) {
    ctx.strokeStyle = '#7a5ad0'; ctx.fillStyle = '#7a5ad0'; ctx.lineWidth = 2;
    for (let x = DP.x0 + 25; x < DP.x1; x += 45) arrow(ctx, x, ys - 34, x, ys - 3, 7);
    txt(ctx, 'patm', DP.x1 + 8, ys - 18, { color: '#7a5ad0', align: 'left' });
  }
  for (const k of ['A', 'B']) {
    const P = st[k], y = ys + P.h * DP.px;
    ctx.setLineDash([4, 4]); ctx.strokeStyle = cssVar('--muted'); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(DP.x0 - 10, y); ctx.lineTo(P.x, y); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = k === 'A' ? '#c0392b' : '#1d6fd6';
    ctx.beginPath(); ctx.arc(P.x, y, 7, 0, 7); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    txt(ctx, k, P.x + 13, y - 9, { color: ctx.fillStyle, align: 'left' });
  }
  // depths shown on the right
  const yA = ys + st.A.h * DP.px, yB = ys + st.B.h * DP.px;
  ctx.strokeStyle = cssVar('--text'); ctx.fillStyle = cssVar('--text'); ctx.lineWidth = 1.2;
  const dim = (x, y1, y2, s) => { if (y2 - y1 < 4) return; ctx.strokeStyle = cssVar('--text'); ctx.fillStyle = cssVar('--text'); ctx.lineWidth = 1.2; arrow(ctx, x, (y1 + y2) / 2, x, y1, 5); arrow(ctx, x, (y1 + y2) / 2, x, y2, 5); txt(ctx, s, x + 6, (y1 + y2) / 2, { size: 12, align: 'left' }); };
  dim(DP.x1 + 22, ys, yA, 'hA');
  dim(DP.x1 + 62, ys, yB, 'hB');
  muted(ctx, t('lbl.liquidIs', { l: t(`liq.${st.liq}`) }), 20, 14);
  muted(ctx, t('lbl.drag'), 20, 32);
}

/* ---------- Activities 4–5, Ex. 10: manometric gauge, U-tube ---------- */
const GA = { vx0: 40, vx1: 300, vTop: 70, vBot: 340, px: 9, mx: 455, my0: 205, tubeTop: 44, tubeBot: 345, gap: 84 };
// difference of levels in the manometer (cm), the manometer contains coloured water
function gaugeDh(st) {
  if (st.mode === 'finger') return 9 * st.press;           // illustrative
  return (LIQ[st.liq].rho / 1000) * st.cap.h;
}
function drawManometer(ctx, dh, px) {
  const xL = GA.mx - GA.gap / 2, xR = GA.mx + GA.gap / 2, w = 16;
  const yL = GA.my0 + (dh / 2) * px, yR = GA.my0 - (dh / 2) * px;
  // U-tube
  ctx.fillStyle = cssVar('--glass-fill');
  ctx.fillRect(xL - w / 2, GA.tubeTop, w, GA.tubeBot - GA.tubeTop); ctx.fillRect(xR - w / 2, GA.tubeTop, w, GA.tubeBot - GA.tubeTop);
  ctx.fillRect(xL - w / 2, GA.tubeBot - w, xR - xL + w, w);
  const L = { c: '#d8433a', d: '#8f1f19' };
  ctx.save(); ctx.globalAlpha = 0.8; ctx.fillStyle = L.c;
  ctx.fillRect(xL - w / 2 + 2, yL, w - 4, GA.tubeBot - yL - 2); ctx.fillRect(xR - w / 2 + 2, yR, w - 4, GA.tubeBot - yR - 2);
  ctx.fillRect(xL, GA.tubeBot - w + 2, xR - xL, w - 4); ctx.restore();
  ctx.strokeStyle = cssVar('--glass-stroke'); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(xL - w / 2, GA.tubeTop); ctx.lineTo(xL - w / 2, GA.tubeBot); ctx.lineTo(xR + w / 2, GA.tubeBot); ctx.lineTo(xR + w / 2, GA.tubeTop);
  ctx.moveTo(xL + w / 2, GA.tubeTop); ctx.lineTo(xL + w / 2, GA.tubeBot - w); ctx.lineTo(xR - w / 2, GA.tubeBot - w); ctx.lineTo(xR - w / 2, GA.tubeTop); ctx.stroke();
  // scale between the branches, 0 at the level when both sides are at the same pressure
  ctx.strokeStyle = cssVar('--scale'); ctx.fillStyle = cssVar('--scale'); ctx.lineWidth = 1; ctx.font = font(9, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let c = -15; c <= 15; c++) {
    const y = GA.my0 - c * px;
    if (y < GA.tubeTop + 4 || y > GA.tubeBot - 20) continue;
    ctx.beginPath(); ctx.moveTo(GA.mx - (c % 5 ? 4 : 8), y); ctx.lineTo(GA.mx + (c % 5 ? 4 : 8), y); ctx.stroke();
    if (c % 5 === 0) ctx.fillText(String(Math.abs(c)), GA.mx + 20, y);
  }
  // difference of levels
  if (dh > 0.3) {
    ctx.strokeStyle = cssVar('--text'); ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(xL - 14, yL); ctx.lineTo(xR + 30, yL); ctx.moveTo(xR - 8, yR); ctx.lineTo(xR + 30, yR); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = cssVar('--text'); arrow(ctx, xR + 26, (yL + yR) / 2, xR + 26, yR, 5); arrow(ctx, xR + 26, (yL + yR) / 2, xR + 26, yL, 5);
    txt(ctx, 'Δh', xR + 32, (yL + yR) / 2, { size: 12, align: 'left' });
  }
  return { xL, yTopL: GA.tubeTop };
}
// rubber tube from the gauge, over the top, into the left branch of the manometer
function hose(ctx, x, y, m, side) {
  const yH = 22;
  ctx.strokeStyle = '#3b3f47'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x, y);
  if (side) ctx.bezierCurveTo(x + 60, y, m.xL - 120, yH, m.xL - 40, yH);
  else ctx.bezierCurveTo(x + 30, y - 40, x + 20, yH, x + 80, yH);
  ctx.lineTo(m.xL - 14, yH); ctx.quadraticCurveTo(m.xL, yH, m.xL, yH + 14); ctx.lineTo(m.xL, m.yTopL + 6); ctx.stroke();
}
function capsule(ctx, x, y, orient) {
  // a small box with a membrane; orient = direction the membrane faces
  const ang = { up: -Math.PI / 2, side: 0, down: Math.PI / 2 }[orient];
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang + Math.PI / 2);
  ctx.fillStyle = '#4f5866'; roundRect(ctx, -16, 0, 32, 16, 3); ctx.fill();
  ctx.fillStyle = '#e8b04a'; ctx.fillRect(-15, -2, 30, 3);
  ctx.restore();
}
function drawGauge(ctx) {
  const st = S.gauge;
  if (st.mode === 'utube') { drawUtube(ctx, st); return; }
  const dh = gaugeDh(st);
  const m = drawManometer(ctx, dh, GA.px);
  ctx.strokeStyle = '#3b3f47'; ctx.lineWidth = 4;
  if (st.mode === 'finger') {
    const cx = 200, cy = 260;
    ctx.fillStyle = cssVar('--wood'); ctx.fillRect(60, 300, 300, 10);
    ctx.fillStyle = '#4f5866'; roundRect(ctx, cx - 30, cy, 60, 40, 4); ctx.fill();
    const dip = 6 * st.press;
    ctx.strokeStyle = '#e8b04a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx - 28, cy); ctx.quadraticCurveTo(cx, cy + dip * 2, cx + 28, cy); ctx.stroke();
    // the forefinger
    ctx.fillStyle = cssVar('--skin'); roundRect(ctx, cx - 11, cy - 90 + dip, 22, 92, 10); ctx.fill();
    hose(ctx, cx + 30, cy + 20, m, 1);
    muted(ctx, t('lbl.pressHint'), 20, 14);
  } else {
    const ys = GA.vTop;
    vessel(ctx, GA.vx0, GA.vx1, ys - 20, GA.vBot);
    liquidRect(ctx, GA.vx0, GA.vx1, ys, GA.vBot, st.liq);
    const cy = ys + st.cap.h * GA.px;
    // rubber tube from the capsule to the manometer
    hose(ctx, st.cap.x, cy, m, 0);
    capsule(ctx, st.cap.x, cy, st.orient);
    ruler(ctx, GA.vx0 + 18, ys, (GA.vBot - ys) - 6, GA.px);
    ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(GA.vx0 + 31, cy); ctx.lineTo(st.cap.x - 18, cy); ctx.stroke(); ctx.setLineDash([]);
    muted(ctx, t('lbl.liquidIs', { l: t(`liq.${st.liq}`) }), 20, 14);
    muted(ctx, t('lbl.dragCapsule'), 20, 32);
  }
  ctx.fillStyle = cssVar('--wood'); ctx.fillRect(400, GA.tubeBot, 120, 8);
  muted(ctx, t('lbl.manometer'), GA.mx - GA.gap / 2 - 16, GA.tubeTop + 22, 'right');
}
// Exercise 10: a U-tube with mercury; water is poured into the left branch
function drawUtube(ctx, st) {
  const px = 12, x0 = 220, x1 = 380, w = 34, base = 330, y0 = 200;  // y0: mercury level without water
  const hw = st.hw, dh = hw * LIQ.water.rho / LIQ.mercury.rho;
  const yLm = y0 + (dh / 2) * px, yRm = y0 - (dh / 2) * px;  // mercury surfaces
  ctx.fillStyle = cssVar('--glass-fill'); ctx.fillRect(x0 - w / 2, 30, w, base - 30); ctx.fillRect(x1 - w / 2, 30, w, base - 30); ctx.fillRect(x0 - w / 2, base - w, x1 - x0 + w, w);
  const Hg = LIQ.mercury, Wt = LIQ.water;
  ctx.save(); ctx.globalAlpha = 0.85;
  ctx.fillStyle = col(Hg.c); ctx.fillRect(x0 - w / 2 + 2, yLm, w - 4, base - yLm - 2); ctx.fillRect(x1 - w / 2 + 2, yRm, w - 4, base - yRm - 2); ctx.fillRect(x0, base - w + 2, x1 - x0, w - 4);
  ctx.fillStyle = col(Wt.c); ctx.globalAlpha = 0.6; ctx.fillRect(x0 - w / 2 + 2, yLm - hw * px, w - 4, hw * px);
  ctx.restore();
  ctx.strokeStyle = cssVar('--glass-stroke'); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x0 - w / 2, 30); ctx.lineTo(x0 - w / 2, base); ctx.lineTo(x1 + w / 2, base); ctx.lineTo(x1 + w / 2, 30);
  ctx.moveTo(x0 + w / 2, 30); ctx.lineTo(x0 + w / 2, base - w); ctx.lineTo(x1 - w / 2, base - w); ctx.lineTo(x1 - w / 2, 30); ctx.stroke();
  ctx.strokeStyle = cssVar('--text'); ctx.fillStyle = cssVar('--text'); ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(x0 - 40, yLm); ctx.lineTo(x1 + 50, yLm); ctx.moveTo(x1 - 20, yRm); ctx.lineTo(x1 + 50, yRm); ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = cssVar('--text'); ctx.fillStyle = cssVar('--text');
  if (dh > 0.05) { arrow(ctx, x1 + 44, (yLm + yRm) / 2, x1 + 44, yRm, 4); arrow(ctx, x1 + 44, (yLm + yRm) / 2, x1 + 44, yLm, 4); }
  txt(ctx, 'h', x1 + 52, (yLm + yRm) / 2, { size: 13, align: 'left' });
  if (hw > 0.5) {
    ctx.strokeStyle = cssVar('--text'); ctx.fillStyle = cssVar('--text'); ctx.lineWidth = 1;
    arrow(ctx, x0 - 34, yLm - hw * px / 2, x0 - 34, yLm - hw * px, 4); arrow(ctx, x0 - 34, yLm - hw * px / 2, x0 - 34, yLm, 4);
    txt(ctx, t('lbl.water'), x0 - 42, yLm - hw * px / 2, { size: 12, align: 'right' });
  }
  txt(ctx, t('liq.mercury'), (x0 + x1) / 2, base + 14, { size: 12 });
  muted(ctx, t('lbl.utube'), 20, 14);
}

/* ---------- Activity 6: Pascal — a balloon with holes ---------- */
const PB = { x: 300, y: 170, r: 70, floor: 345 };
function jetSpeed(st) { return 70 * Math.sqrt(1 + 6 * st.squeeze); }    // px/s (illustrative)
function drawPascal(ctx) {
  const st = S.pascal;
  const sq = st.squeeze;
  const rx = PB.r * (1 - 0.18 * sq), ry = PB.r * (1 + 0.12 * sq);
  ctx.fillStyle = cssVar('--wood'); ctx.fillRect(80, PB.floor, 440, 8);
  // jets: perpendicular to the wall at each hole, then falling (g)
  const v = jetSpeed(st), g = 250;
  ctx.fillStyle = col(LIQ.water.c);
  for (const a of st.holes) {
    const r = (a * Math.PI) / 180, hx = PB.x + rx * Math.cos(r), hy = PB.y + ry * Math.sin(r);
    // normal to the ellipse at the hole
    let nx = Math.cos(r) / rx, ny = Math.sin(r) / ry; const n = Math.hypot(nx, ny); nx /= n; ny /= n;
    ctx.strokeStyle = col(LIQ.water.c); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(hx, hy);
    let tEnd = 0;
    for (let tt = 0; tt < 3; tt += 0.01) { const x = hx + v * nx * tt, y = hy + v * ny * tt + 0.5 * g * tt * tt; ctx.lineTo(x, y); tEnd = tt; if (y > PB.floor || x < 0 || x > W_) break; }
    ctx.stroke();
    for (let k = 0; k < 6; k++) {
      const tt = ((st.time * 1.2 + k / 6) % 1) * tEnd;
      ctx.beginPath(); ctx.arc(hx + v * nx * tt, hy + v * ny * tt + 0.5 * g * tt * tt, 3, 0, 7); ctx.fill();
    }
  }
  // the balloon
  const gr = ctx.createRadialGradient(PB.x - 20, PB.y - 25, 10, PB.x, PB.y, PB.r * 1.2);
  gr.addColorStop(0, '#ffb3b3'); gr.addColorStop(1, '#d9534f');
  ctx.fillStyle = gr; ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.ellipse(PB.x, PB.y, rx, ry, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
  ctx.strokeStyle = '#8f1f19'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = '#8f1f19'; ctx.beginPath(); ctx.moveTo(PB.x - 6, PB.y - ry - 2); ctx.lineTo(PB.x + 6, PB.y - ry - 2); ctx.lineTo(PB.x, PB.y - ry - 12); ctx.fill();
  // the hands squeeze from both sides
  if (sq > 0.01) {
    ctx.fillStyle = cssVar('--skin');
    for (const s of [-1, 1]) { roundRect(ctx, PB.x + s * (rx + 2) - (s > 0 ? 0 : 34), PB.y - 30, 34, 60, 14); ctx.fill(); }
    ctx.strokeStyle = COLF; ctx.fillStyle = COLF; ctx.lineWidth = 3;
    arrow(ctx, PB.x - rx - 70, PB.y, PB.x - rx - 38, PB.y, 8); arrow(ctx, PB.x + rx + 70, PB.y, PB.x + rx + 38, PB.y, 8);
  }
  for (const a of st.holes) { const r = (a * Math.PI) / 180; ctx.fillStyle = '#3b1010'; ctx.beginPath(); ctx.arc(PB.x + rx * Math.cos(r), PB.y + ry * Math.sin(r), 2.5, 0, 7); ctx.fill(); }
  muted(ctx, t('lbl.balloon'), 20, 14);
}

/* ---------- Activity 8, Ex. 11: hydraulic press ---------- */
const HP = { xs: 160, xS: 400, yTop: 70, yBase: 250, yBot: 320, travel: 60 };
function pressGeom(st) {
  const ws = Math.sqrt(st.s) * 16, wS = Math.sqrt(st.S) * 16;
  const F = (st.f * st.S) / st.s;
  return { ws, wS, F };
}
function drawPress(ctx) {
  const st = S.press;
  const { ws, wS } = pressGeom(st);
  const yS = 170 - st.y, ys = 170 + st.y * (st.S / st.s) * 0.12;   // positions of the pistons (small one moves more; illustrative)
  const L = LIQ.oil;
  // reservoirs and the pipe
  ctx.fillStyle = cssVar('--glass-fill');
  ctx.fillRect(HP.xs - ws / 2, HP.yTop, ws, HP.yBot - HP.yTop); ctx.fillRect(HP.xS - wS / 2, HP.yTop, wS, HP.yBot - HP.yTop);
  ctx.fillRect(HP.xs - ws / 2, HP.yBot - 30, HP.xS - HP.xs + (ws + wS) / 2, 30);
  ctx.save(); ctx.globalAlpha = 0.7; ctx.fillStyle = col(L.c);
  ctx.fillRect(HP.xs - ws / 2, ys, ws, HP.yBot - ys); ctx.fillRect(HP.xS - wS / 2, yS, wS, HP.yBot - yS); ctx.fillRect(HP.xs, HP.yBot - 30, HP.xS - HP.xs, 30);
  ctx.restore();
  ctx.strokeStyle = cssVar('--glass-stroke'); ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(HP.xs - ws / 2, HP.yTop); ctx.lineTo(HP.xs - ws / 2, HP.yBot); ctx.lineTo(HP.xS + wS / 2, HP.yBot); ctx.lineTo(HP.xS + wS / 2, HP.yTop);
  ctx.moveTo(HP.xs + ws / 2, HP.yTop); ctx.lineTo(HP.xs + ws / 2, HP.yBot - 30); ctx.lineTo(HP.xS - wS / 2, HP.yBot - 30); ctx.lineTo(HP.xS - wS / 2, HP.yTop); ctx.stroke();
  ctx.fillStyle = '#5f6875'; ctx.fillRect(HP.xs - ws / 2, ys - 8, ws, 8); ctx.fillRect(HP.xS - wS / 2, yS - 10, wS, 10);
  // force on the small piston and load on the large one
  ctx.strokeStyle = COLF; ctx.fillStyle = COLF; ctx.lineWidth = 3;
  if (st.f > 0) { arrow(ctx, HP.xs, ys - 60, HP.xs, ys - 10, 9); txt(ctx, `f = ${qty(st.f, 0, 'N')}`, HP.xs + ws / 2 + 6, ys - 44, { color: COLF, align: 'left' }); }
  if (st.W2 > 0) {
    const bw = Math.min(wS - 6, 40 + st.W2 / 30), bh = 18 + Math.min(40, st.W2 / 40);
    ctx.fillStyle = '#6b4d2e'; ctx.fillRect(HP.xS - bw / 2, yS - 10 - bh, bw, bh);
    txt(ctx, `${t('f.W2')} = ${qty(st.W2, 0, 'N')}`, HP.xS, yS - 18 - bh, { size: 12 });
  }
  ctx.fillStyle = COLP; ctx.strokeStyle = COLP;
  const up = 14 + Math.min(40, pressGeom(st).F / 10);
  arrow(ctx, HP.xS, yS + 6 + up + 10, HP.xS, yS + 6, 8);
  txt(ctx, 'F', HP.xS + 12, yS + 22, { color: COLP, align: 'left' });
  txt(ctx, `s = ${qty(st.s, 0, 'cm²')}`, HP.xs, HP.yBot + 16, { size: 12 });
  txt(ctx, `S = ${qty(st.S, 0, 'cm²')}`, HP.xS, HP.yBot + 16, { size: 12 });
  const state = pressState(st);
  txt(ctx, t(`pr.${state}`), 300, 30, { size: 14, color: state === 'bal' ? '#1d8a4b' : cssVar('--text') });
}
function pressState(st) {
  const F = pressGeom(st).F;
  if (st.W2 === 0 && st.f === 0) return 'rest';
  if (Math.abs(st.W2 - F) <= Math.max(1, 0.01 * F)) return 'bal';
  return st.W2 < F ? 'up' : 'down';
}

/* ================================================================
   Animation: balloon jets, hydraulic press
   ================================================================ */
const loop = createLoop({
  step(dt) {
    if (!shell) return false;
    if (shell.tab === 'pascal') { S.pascal.time += dt; return true; }
    if (shell.tab === 'press') {
      const st = S.press, s = pressState(st);
      const v = s === 'up' ? 30 : s === 'down' ? -30 : 0;
      const y = Math.max(-HP.travel, Math.min(HP.travel, st.y + v * dt));
      const moving = y !== st.y;
      st.y = y;
      return moving;
    }
    return false;
  },
  render() { refresh(); },
});

/* ================================================================
   Dragging (points A and B, the capsule)
   ================================================================ */
let drag = null;
canvas.addEventListener('pointerdown', (ev) => {
  if (!shell) return;
  const p = view.toLogical(ev);
  const st = cur();
  if (shell.tab === 'depth') {
    const ys = dpSurf(st);
    const dA = Math.hypot(p.x - st.A.x, p.y - (ys + st.A.h * DP.px)), dB = Math.hypot(p.x - st.B.x, p.y - (ys + st.B.h * DP.px));
    if (Math.min(dA, dB) < 40) drag = dA <= dB ? 'A' : 'B';
  } else if (shell.tab === 'gauge' && st.mode === 'immerse') {
    if (p.x < GA.vx1 + 20) drag = 'cap';
  }
  if (drag) { canvas.setPointerCapture(ev.pointerId); ev.preventDefault(); move(p); }
});
canvas.addEventListener('pointermove', (ev) => { if (drag) move(view.toLogical(ev)); });
const endDrag = () => { drag = null; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
const snap = (v) => Math.round(v * 2) / 2;
function move(p) {
  const st = cur();
  if (drag === 'A' || drag === 'B') {
    const ys = dpSurf(st);
    st[drag] = { x: Math.max(DP.x0 + 14, Math.min(DP.x1 - 14, p.x)), h: Math.max(0.5, Math.min(st.H, snap((p.y - ys) / DP.px))) };
  } else if (drag === 'cap') {
    st.cap = { x: Math.max(GA.vx0 + 60, Math.min(GA.vx1 - 24, p.x)), h: Math.max(0, Math.min(25, snap((p.y - GA.vTop) / GA.px))) };
  }
  st.fb = null;
  refresh();
}

/* ================================================================
   Panels
   ================================================================ */
const controlsBody = document.getElementById('controls-body');
const measuresBody = document.getElementById('measures-body');
let ui = {};
let tableSig = '';
function refresh() { updateMeasures(); requestDraw(); }
const seg = (labelKey, options, value, onChange) => createSegmented({ labelKey, options: options.map(([v, k]) => ({ value: String(v), labelKey: k })), value: String(value), onChange });
const btnRow = (...b) => el('div', { class: 'btn-row', style: 'margin-top:8px' }, b);
const hintP = (key) => el('p', { class: 'muted', style: 'margin:8px 0 0;font-size:0.88rem', dataset: { i18n: key } }, t(key));
function change(fn) { fn(cur()); refresh(); }
const rebuild = (fn) => { fn(cur()); buildTab(); };

function build() {
  const tab = shell.tab;
  const st = cur();
  const items = [];
  if (tab === 'pressure') {
    items.push(seg('ctl.body', [['brick', 'body.brick'], ['cyl', 'body.cyl']], st.body, (v) => rebuild((s) => { s.body = v; s.fb = null; })).root);
    if (st.body === 'brick') {
      items.push(seg('ctl.face', Object.keys(FACES).map((k) => [k, `face.${k}`]), st.face, (v) => rebuild((s) => { s.face = v; if (v !== 'large') s.n = 1; s.fb = null; })).root);
      if (st.face === 'large') items.push(seg('ctl.bricks', [[1, 'n.1'], [2, 'n.2'], [3, 'n.3']], st.n, (v) => change((s) => { s.n = +v; s.fb = null; })).root);
    } else items.push(seg('ctl.coin', [['no', 'ctl.no'], ['yes', 'ctl.yes']], st.coin ? 'yes' : 'no', (v) => change((s) => { s.coin = v === 'yes'; s.fb = null; })).root);
    items.push(btnRow(createButton({ labelKey: 'ctl.record', variant: 'primary', onClick: () => change(recordPressure) })), hintP(st.body === 'brick' ? 'hint.brick' : 'hint.cyl'));
  } else if (tab === 'depth') {
    items.push(seg('ctl.liquid', ['water', 'alcohol', 'salt', 'mercury'].map((k) => [k, `liq.${k}`]), st.liq, (v) => change((s) => { s.liq = v; s.fb = null; })).root,
      createSlider({ labelKey: 'ctl.height', min: 10, max: 25, step: 0.5, value: st.H, unit: 'cm', decimals: 1, onInput: (v) => change((s) => { s.H = v; s.A.h = Math.min(s.A.h, v); s.B.h = Math.min(s.B.h, v); s.fb = null; }) }).root,
      seg('ctl.atm', [['no', 'ctl.no'], ['yes', 'ctl.yes']], st.atm ? 'yes' : 'no', (v) => change((s) => { s.atm = v === 'yes'; })).root,
      btnRow(createButton({ labelKey: 'ctl.sameLevel', onClick: () => change((s) => { s.B.h = s.A.h; s.fb = null; }) }),
        createButton({ labelKey: 'ctl.bottom', onClick: () => change((s) => { s.B.h = s.H; s.fb = null; }) })),
      btnRow(createButton({ labelKey: 'ctl.record', variant: 'primary', onClick: () => change(recordDepth) })), hintP('hint.depth'));
  } else if (tab === 'gauge') {
    items.push(seg('ctl.gmode', [['finger', 'gmode.finger'], ['immerse', 'gmode.immerse'], ['utube', 'gmode.utube']], st.mode, (v) => rebuild((s) => { s.mode = v; s.fb = null; })).root);
    if (st.mode === 'finger') {
      items.push(createSlider({ labelKey: 'ctl.press', min: 0, max: 100, step: 1, value: Math.round(st.press * 100), unit: '%', decimals: 0, onInput: (v) => change((s) => { s.press = v / 100; }) }).root, hintP('hint.finger'));
    } else if (st.mode === 'immerse') {
      items.push(seg('ctl.liquid', ['water', 'alcohol', 'salt'].map((k) => [k, `liq.${k}`]), st.liq, (v) => change((s) => { s.liq = v; s.fb = null; })).root,
        seg('ctl.orient', [['up', 'or.up'], ['side', 'or.side'], ['down', 'or.down']], st.orient, (v) => change((s) => { s.orient = v; s.fb = null; })).root,
        btnRow(createButton({ labelKey: 'ctl.record', variant: 'primary', onClick: () => change(recordGauge) })), hintP('hint.immerse'));
    } else {
      items.push(createSlider({ labelKey: 'ctl.water', min: 0, max: 20, step: 0.1, value: st.hw, unit: 'cm', decimals: 1, onInput: (v) => change((s) => { s.hw = v; s.fb = null; }) }).root,
        btnRow(createButton({ labelKey: 'ctl.record', variant: 'primary', onClick: () => change(recordUtube) })), hintP('hint.utube'));
    }
  } else if (tab === 'pascal') {
    items.push(createSlider({ labelKey: 'ctl.squeeze', min: 0, max: 100, step: 1, value: Math.round(S.pascal.squeeze * 100), unit: '%', decimals: 0, onInput: (v) => change((s) => { s.squeeze = v / 100; }) }).root,
      btnRow(createButton({ labelKey: 'ctl.hole', onClick: () => change((s) => { if (s.holes.length < 7) s.holes.push(Math.round(-20 + Math.random() * 220)); }) }),
        createButton({ labelKey: 'ui.reset', variant: 'ghost', onClick: () => rebuild((s) => { s.squeeze = 0; s.holes = [150, 90, 30]; }) })),
      hintP('hint.pascal'));
  } else {
    items.push(seg('ctl.small', S_OPTS.map((v) => [v, `s.${v}`]), st.s, (v) => change((s) => { s.s = +v; s.fb = null; loop.start(); })).root,
      seg('ctl.large', BIG_OPTS.map((v) => [v, `S.${v}`]), st.S, (v) => change((s) => { s.S = +v; s.fb = null; loop.start(); })).root,
      createSlider({ labelKey: 'ctl.f', min: 0, max: 50, step: 1, value: st.f, unit: 'N', decimals: 0, onInput: (v) => change((s) => { s.f = v; s.fb = null; loop.start(); }) }).root);
    ui.w2 = createSlider({ labelKey: 'ctl.W2', min: 0, max: 2500, step: 5, value: st.W2, unit: 'N', decimals: 0, onInput: (v) => change((s) => { s.W2 = v; loop.start(); }) });
    items.push(ui.w2.root,
      btnRow(createButton({ labelKey: 'ctl.ex11', onClick: () => rebuild((s) => { s.s = 2; s.S = 20; s.f = 20; s.W2 = 0; s.y = 0; s.fb = null; }) }),
        createButton({ labelKey: 'ctl.record', variant: 'primary', onClick: () => change(recordPress) })), hintP('hint.press'));
  }
  controlsBody.append(...items);
  ui.dl = el('dl', { class: 'meas' });
  ui.status = el('div', { class: 'status', hidden: '' });
  ui.table = el('table', { class: 'data' });
  ui.tableWrap = el('div', { class: 'table-scroll', hidden: '' }, ui.table);
  ui.clear = el('div', { class: 'btn-row', style: 'margin-top:8px', hidden: '' }, [createButton({ labelKey: 'ctl.clearTable', variant: 'ghost', onClick: () => change((s) => { s.rows = []; s.fb = null; }) })]);
  measuresBody.append(ui.dl, ui.tableWrap, ui.clear, ui.status);
  tableSig = '';
}

const dup = (s, key) => s.rows.some((r) => r.key === key);
function addRow(s, row, okKey) {
  if (dup(s, row.key)) { s.fb = { type: 'warn', key: 'fb.already' }; return; }
  s.rows.push(row); s.fb = { type: 'good', key: okKey };
}
function recordPressure(s) {
  const c = pressureCase(s);
  const name = s.body === 'cyl' ? (s.coin ? 'row.coin' : 'row.cyl') : `face.${s.face}`;
  addRow(s, { key: `${s.body}|${s.face}|${s.n}|${s.coin}`, name, n: s.body === 'brick' ? c.n : 1, F: c.F, S: c.S, p: c.p, cyl: s.body === 'cyl' }, 'fb.recorded');
}
function recordDepth(s) {
  addRow(s, { key: `${s.liq}|${s.A.h}|${s.B.h}`, liq: s.liq, hA: s.A.h, hB: s.B.h, rho: LIQ[s.liq].rho }, 'fb.recordedDepth');
}
function recordGauge(s) {
  addRow(s, { key: `${s.liq}|${s.cap.h}|${s.orient}`, liq: s.liq, h: s.cap.h, orient: s.orient, dh: gaugeDh(s), rho: LIQ[s.liq].rho }, 'fb.recordedGauge');
}
function recordUtube(s) {
  addRow(s, { key: `u|${s.hw}`, hw: s.hw, utube: true }, 'fb.recordedUtube');
}
function recordPress(s) {
  if (s.f <= 0) { s.fb = { type: 'warn', key: 'fb.needF' }; return; }
  addRow(s, { key: `${s.s}|${s.S}|${s.f}`, s: s.s, S: s.S, f: s.f }, 'fb.recordedPress');
}

const th = (k) => el('th', {}, t(k));
function onCheckFor(st, okKey, badKey) {
  return (res) => {
    st.fb = res === 'invalid' ? { type: 'warn', key: 'fb.typeNumber' } : res === 'wrong' ? { type: 'bad', key: badKey } : { type: 'good', key: okKey };
    refresh();
  };
}
function updateMeasures() {
  if (!shell || !ui.dl) return;
  const tab = shell.tab;
  const st = cur();
  const rows = [];
  if (tab === 'pressure') {
    const c = pressureCase(st);
    if (st.body === 'brick') rows.push([t('m.brickW'), qty(BRICK.W, 0, 'N')], [t('m.bricks'), String(c.n)], [t('m.contact'), `${num(c.f.w, 0)} cm × ${num(c.f.d, 0)} cm`]);
    else rows.push([t('m.cylDims'), 'h = 20 cm, r = 10 cm'], [t('m.rhoAl'), qty(CYL.rho, 0, 'kg/m³')], [t('m.contact'), st.coin ? t('m.coinD') : t('m.base')]);
  } else if (tab === 'depth') {
    rows.push([t('m.rho'), qty(LIQ[st.liq].rho, 0, 'kg/m³')], [t('m.H'), qty(st.H, 1, 'cm')], ['hA', qty(st.A.h, 1, 'cm')], ['hB', qty(st.B.h, 1, 'cm')], [t('m.patm'), pa(PATM)]);
  } else if (tab === 'gauge') {
    if (st.mode === 'immerse') rows.push([t('m.rho'), qty(LIQ[st.liq].rho, 0, 'kg/m³')], [t('m.hCap'), qty(st.cap.h, 1, 'cm')], [t('m.dh'), qty(gaugeDh(st), 1, 'cm')]);
    else if (st.mode === 'finger') rows.push([t('m.dh'), qty(gaugeDh(st), 1, 'cm')]);
    else rows.push([t('m.hw'), qty(st.hw, 1, 'cm')], [t('m.rhoW'), qty(1000, 0, 'kg/m³')], [t('m.rhoHg'), qty(13600, 0, 'kg/m³')]);
  } else if (tab === 'pascal') {
    rows.push([t('m.holes'), String(st.holes.length)], [t('m.jets'), t(st.squeeze > 0.02 ? 'm.jetsStrong' : 'm.jetsWeak')]);
  } else {
    if (ui.w2) ui.w2.set(st.W2);
    rows.push(['s', qty(st.s, 0, 'cm²')], ['S', qty(st.S, 0, 'cm²')], ['f', qty(st.f, 0, 'N')], [t('m.W2'), qty(st.W2, 0, 'N')], [t('m.state'), t(`pr.${pressState(st)}`)]);
  }
  ui.dl.replaceChildren(...rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)]));
  renderTable(tab, st);
  const fb = st.fb;
  if (!fb) ui.status.hidden = true;
  else { ui.status.hidden = false; ui.status.className = `status ${fb.type || ''}`; ui.status.textContent = t(fb.key, fb.params); }
}
function renderTable(tab, st) {
  if (tab === 'pascal' || (tab === 'gauge' && st.mode === 'finger')) { ui.tableWrap.hidden = true; ui.clear.hidden = true; return; }
  const rows = tab === 'gauge' ? st.rows.filter((r) => !!r.utube === (st.mode === 'utube')) : st.rows;
  const sig = calcSig(rows) + rows.length + getLang() + tab + (st.mode || '');
  if (sig !== tableSig) {
    tableSig = sig;
    const C = (okKey, badKey) => onCheckFor(st, okKey, badKey);
    let head, body;
    if (tab === 'pressure') {
      head = ['col.case', 'col.S', 'col.F', 'col.p'];
      body = (r) => [el('td', {}, t(r.name) + (r.n > 1 ? ` × ${r.n}` : '')),
        calcCell(r, 'S', { expected: r.S, decimals: r.S < 0.001 ? 6 : 4, tol: r.cyl ? r.S * 0.01 : 1e-6, onCheck: C('fb.SOk', r.cyl ? 'fb.SBadCyl' : 'fb.SBad') }),
        calcCell(r, 'F', { expected: r.F, decimals: r.cyl ? 1 : 0, tol: r.cyl ? r.F * 0.01 : undefined, onCheck: C('fb.FOk', r.cyl ? 'fb.FBadCyl' : 'fb.FBad') }),
        calcCell(r, 'p', { expected: r.p, decimals: 0, tol: r.cyl ? r.p * 0.01 : undefined, disabled: !(calcDone(r, 'S') && calcDone(r, 'F')), onCheck: C('fb.pOk', 'fb.pBad') })];
    } else if (tab === 'depth') {
      head = ['col.liq', 'col.hAhB', 'col.pA', 'col.pB', 'col.dp', 'col.pAtot'];
      body = (r) => [el('td', {}, t(`liq.${r.liq}`)), el('td', {}, `${num(r.hA, 1)} ; ${num(r.hB, 1)}`),
        calcCell(r, 'pA', { expected: r.rho * G * r.hA / 100, decimals: 0, onCheck: C('fb.pAOk', 'fb.pABad') }),
        calcCell(r, 'pB', { expected: r.rho * G * r.hB / 100, decimals: 0, onCheck: C('fb.pAOk', 'fb.pABad') }),
        calcCell(r, 'dp', { expected: r.rho * G * (r.hB - r.hA) / 100, decimals: 0, disabled: !(calcDone(r, 'pA') && calcDone(r, 'pB')), onCheck: C('fb.dpOk', 'fb.dpBad') }),
        calcCell(r, 'pt', { expected: PATM + r.rho * G * r.hA / 100, decimals: 0, disabled: !calcDone(r, 'pA'), onCheck: C('fb.ptOk', 'fb.ptBad') })];
    } else if (tab === 'gauge' && st.mode === 'immerse') {
      head = ['col.liq', 'col.orient', 'col.h', 'col.dh', 'col.pLiq', 'col.pMan'];
      body = (r) => [el('td', {}, t(`liq.${r.liq}`)), el('td', {}, t(`or.${r.orient}`)), el('td', {}, num(r.h, 1)), el('td', {}, num(r.dh, 1)),
        calcCell(r, 'pl', { expected: r.rho * G * r.h / 100, decimals: 0, onCheck: C('fb.plOk', 'fb.plBad') }),
        calcCell(r, 'pm', { expected: 1000 * G * r.dh / 100, decimals: 0, disabled: !calcDone(r, 'pl'), onCheck: C('fb.pmOk', 'fb.pmBad') })];
    } else if (tab === 'gauge') {
      head = ['col.hw', 'col.pw', 'col.hHg'];
      body = (r) => [el('td', {}, num(r.hw, 1)),
        calcCell(r, 'pw', { expected: 1000 * G * r.hw / 100, decimals: 0, onCheck: C('fb.pwOk', 'fb.pwBad') }),
        calcCell(r, 'hh', { expected: r.hw / 13.6, decimals: 2, tol: 0.011, disabled: !calcDone(r, 'pw'), onCheck: C('fb.hhOk', 'fb.hhBad') })];
    } else {
      head = ['col.sS', 'col.f', 'col.dpPress', 'col.Fbig'];
      body = (r) => [el('td', {}, `${num(r.s, 0)} ; ${num(r.S, 0)}`), el('td', {}, num(r.f, 0)),
        calcCell(r, 'dp', { expected: r.f / (r.s * 1e-4), decimals: 0, onCheck: C('fb.dpPOk', 'fb.dpPBad') }),
        calcCell(r, 'F', { expected: (r.f * r.S) / r.s, decimals: 0, disabled: !calcDone(r, 'dp'), onCheck: C('fb.FbOk', 'fb.FbBad') })];
    }
    ui.table.replaceChildren(el('thead', {}, el('tr', {}, head.map(th))), el('tbody', {}, rows.map((r) => el('tr', {}, body(r)))));
  }
  ui.tableWrap.hidden = !rows.length; ui.clear.hidden = !rows.length;
}

function buildTab() {
  loop.stop();
  controlsBody.replaceChildren();
  measuresBody.replaceChildren();
  ui = {};
  build();
  refresh();
  if (shell.tab === 'pascal' || shell.tab === 'press') loop.start();
}
onLangChange(() => { if (shell) buildTab(); });

shell = initSim({
  strings,
  tabs: TABS.map((id) => ({ id, labelKey: `tab.${id}` })),
  initialTab: 'pressure',
  onTab: buildTab,
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, cur: () => cur(), pressureCase, gaugeDh, pressGeom, pressState };
