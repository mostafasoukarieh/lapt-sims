// Grade 9 — Equilibrium of a body (Ch.13: Act. 1–7; Ex. 1–12). g = 10 N/kg as in the Grade 9 book.
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange, getLang } from '../../../shared/i18n.js';
import { num, qty } from '../../../shared/format.js';
import { createButton, createSegmented, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, font, arrow } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { label } from '../../../shared/figures.js';
import { createGraph } from '../../../shared/graph.js';
import { calcCell, calcSig, calcDone } from '../../../shared/calc-cell.js';
import { G_EB9 } from '../../../shared/constants.js';

/* ================================================================
   Constants and state
   ================================================================ */
const W_ = 600, H_ = 360;
const CM = 26;                                    // 1 cm on the screen (vectors)
const SPRINGS = { s1: { k: 50, l0: 10 }, s2: { k: 62.5, l0: 10 } }; // N/m, cm — s1: book (Act. 7, Ex. 9); s2: Ex. 11 (0.8 cm per 50 g)
const MASSES = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]; // kg (book table, Act. 7)
const BOX_M = [0.2, 0.4, 0.6];                    // kg (illustrative)
const KB = 1 / 20;                                // spring balances of the equilibrium tab: 1 N per 20 px of stretch
const LFREE = 190;                                // px from the hand to the body when the balance reads 0
const FMAX = 5;                                   // N, range of these balances
const COLA = '#2f6fd6', COLB = '#d6452f';         // the two forces of an interaction

function initialState(tab) {
  switch (tab) {
    case 'interaction': return { mode: 'trolleys', burnt: false, xa: 0, xb: 0, va: 0, vb: 0, load: false, pull: 2.5, fb: null };
    case 'equilibrium': return { mode: 'light', P1: { x: 70, y: 180 }, P2: { x: 530, y: 180 }, B: { x: 300, y: 180 }, hold: false, sup: 'table', m: 0.4, cut: false, fall: 0, fv: 0, fb: null };
    default: return { spring: 's1', m: 0, rows: [], fb: null };
  }
}
const TABS = ['interaction', 'equilibrium', 'hooke'];
let S = Object.fromEntries(TABS.map((k) => [k, initialState(k)]));
// Equilibrium tab: forces of the two spring balances on the light body
function eqForces(st) {
  const f = (P) => {
    const dx = P.x - st.B.x, dy = P.y - st.B.y, L = Math.hypot(dx, dy) || 1;
    const F = Math.min(FMAX * 1.2, Math.max(0, (L - LFREE) * KB));
    return { F, ux: dx / L, uy: dy / L, L };
  };
  const a = f(st.P1), b = f(st.P2);
  const Rx = a.F * a.ux + b.F * b.ux, Ry = a.F * a.uy + b.F * b.uy;
  return { a, b, R: Math.hypot(Rx, Ry), Rx, Ry };
}
function isEquilibrium(st) {
  const e = eqForces(st);
  return e.a.F > 0.05 && e.b.F > 0.05 && e.R < 0.12;
}
const springLen = (st, m = st.m) => SPRINGS[st.spring].l0 + ((m * G_EB9) / SPRINGS[st.spring].k) * 100; // cm

/* ================================================================
   Canvas
   ================================================================ */
let shell;
let drawQueued = false;
const canvas = document.getElementById('stage');
canvas.style.touchAction = 'none';
const view = setupCanvas(canvas, { width: W_, height: H_, maxHeightVh: () => (window.innerWidth < 880 ? 50 : 74), onResize: () => requestDraw() });
const graphCard = document.getElementById('graph-card');
const graphHint = document.getElementById('graph-hint');
const graph = createGraph(document.getElementById('graph'), { width: 360, height: 230, maxHeightVh: 36 });
function requestDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; draw(); });
}
onThemeChange(() => requestDraw());
const cur = () => S[shell.tab];
const txt = (ctx, s, x, y, o = {}) => label(ctx, s, x, y, { size: 13, weight: 700, ...o });
function vec(ctx, x, y, dx, dy, color, name, { w = 3.5 } = {}) {
  if (Math.hypot(dx, dy) < 2) return;
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = w;
  arrow(ctx, x, y, x + dx, y + dy, 11);
  ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 7); ctx.fill();
  const L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L;
  label(ctx, name, x + dx * 0.6 + nx * 16, y + dy * 0.6 + ny * 16, { size: 14, weight: 800, color });
}
function hand(ctx, x, y) {
  ctx.fillStyle = cssVar('--skin'); ctx.strokeStyle = cssVar('--wire'); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(x, y, 13, 0, 7); ctx.fill(); ctx.stroke();
}
function spring(ctx, x1, y1, x2, y2, coils = 14, w = 9) {
  const L = Math.hypot(x2 - x1, y2 - y1); if (L < 1) return;
  const ux = (x2 - x1) / L, uy = (y2 - y1) / L, px = -uy, py = ux;
  ctx.strokeStyle = cssVar('--metal'); ctx.lineWidth = 2; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y1);
  const a = 6, b = L - 6;
  ctx.lineTo(x1 + ux * a, y1 + uy * a);
  for (let i = 1; i < coils * 2; i++) { const s = a + ((b - a) * i) / (coils * 2), sg = i % 2 ? 1 : -1; ctx.lineTo(x1 + ux * s + px * w * sg, y1 + uy * s + py * w * sg); }
  ctx.lineTo(x1 + ux * b, y1 + uy * b); ctx.lineTo(x2, y2); ctx.stroke();
}
// A tube spring balance from its ring R (held) towards its hook, along the unit vector u; F in N on a 0–max scale
function tubeBalance(ctx, R, u, F, max, name) {
  const Lh = 120, w = 18, rod = 16 + (F / max) * 60;
  ctx.save(); ctx.translate(R.x, R.y); ctx.rotate(Math.atan2(u.y, u.x));
  ctx.strokeStyle = cssVar('--wire'); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(-6, 0, 6, 0, 7); ctx.stroke(); // ring
  ctx.fillStyle = '#e9edf3'; ctx.strokeStyle = '#7f8a99'; roundRect(ctx, 0, -w / 2, Lh, w, 5); ctx.fill(); ctx.stroke();
  // scale 0 … max along the tube
  ctx.strokeStyle = '#4a5466'; ctx.lineWidth = 1; ctx.fillStyle = '#4a5466'; ctx.font = font(8, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 0; i <= max * 2; i++) {
    const x = 14 + (i / (max * 2)) * (Lh - 28);
    ctx.beginPath(); ctx.moveTo(x, -w / 2 + 2); ctx.lineTo(x, i % 2 ? -2 : 1); ctx.stroke();
    if (i % 2 === 0) { ctx.save(); ctx.translate(x, 5); if (Math.cos(Math.atan2(u.y, u.x)) < 0) ctx.rotate(Math.PI); ctx.fillText(String(i / 2), 0, 0); ctx.restore(); }
  }
  // the red indicator moves with the spring inside
  const xi = 14 + (Math.min(F, max) / max) * (Lh - 28);
  ctx.fillStyle = '#e60000'; ctx.fillRect(xi - 1.5, -w / 2, 3, w);
  // hook rod
  ctx.strokeStyle = cssVar('--wire'); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(Lh, 0); ctx.lineTo(Lh + rod, 0); ctx.stroke();
  ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(Lh + rod + 5, 0, 5, Math.PI, Math.PI * 2.6); ctx.stroke();
  ctx.restore();
  if (name) txt(ctx, name, R.x + u.x * 60 - u.y * 22, R.y + u.y * 60 + u.x * 22, { size: 12 });
  return { x: R.x + u.x * (Lh + rod + 10), y: R.y + u.y * (Lh + rod + 10) }; // the hook
}
function trolley(ctx, x, y, w, loaded, north) {
  ctx.fillStyle = '#5d7fa3'; roundRect(ctx, x - w / 2, y - 34, w, 30, 5); ctx.fill();
  for (const dx of [-w / 3, w / 3]) { ctx.fillStyle = '#2b3140'; ctx.beginPath(); ctx.arc(x + dx, y - 3, 7, 0, 7); ctx.fill(); }
  if (loaded) { ctx.fillStyle = '#b38b2e'; ctx.fillRect(x - 16, y - 58, 32, 24); ctx.fillStyle = '#4a3a10'; ctx.font = font(9, 800); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('0.5 kg', x, y - 46); }
  // magnet: its N pole faces the other trolley
  const mw = 46, mx = north === 'right' ? x + w / 2 - mw : x - w / 2;
  ctx.fillStyle = north === 'right' ? '#2f6fd6' : '#d63b3b'; ctx.fillRect(mx, y - 30, mw / 2, 20);
  ctx.fillStyle = north === 'right' ? '#d63b3b' : '#2f6fd6'; ctx.fillRect(mx + mw / 2, y - 30, mw / 2, 20);
  ctx.fillStyle = '#fff'; ctx.font = font(11, 800); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(north === 'right' ? 'S' : 'N', mx + mw / 4, y - 20); ctx.fillText(north === 'right' ? 'N' : 'S', mx + (3 * mw) / 4, y - 20);
}

function draw() {
  if (!shell) return;
  const ctx = view.begin();
  ctx.fillStyle = cssVar('--scene-bg'); ctx.fillRect(0, 0, W_, H_);
  if (shell.tab === 'interaction') drawInteraction(ctx);
  else if (shell.tab === 'equilibrium') drawEquilibrium(ctx);
  else drawHooke(ctx);
}

/* ---------- Activities 1–3: interaction ---------- */
const TW = 120, TY = 260, GAP0 = 70;              // trolley width, track level, initial gap between the magnets
const magForce = (gap) => 3 * (GAP0 / Math.max(gap, 30)) ** 2; // N, repulsion of the magnets (illustrative)
function trolleyGeom(st) {
  const xa = 300 - GAP0 / 2 - TW / 2 + st.xa, xb = 300 + GAP0 / 2 + TW / 2 + st.xb;
  return { xa, xb, gap: xb - xa - TW };
}
function drawInteraction(ctx) {
  const st = S.interaction;
  if (st.mode === 'trolleys') {
    ctx.fillStyle = cssVar('--wood'); ctx.fillRect(16, TY + 4, 568, 10);
    const g = trolleyGeom(st);
    if (!st.burnt) {
      // the string holds the trolleys together under the magnets
      ctx.strokeStyle = cssVar('--thread'); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(g.xa - TW / 2 + 8, TY - 12); ctx.lineTo(g.xa - TW / 2 + 2, TY - 12); ctx.moveTo(g.xa + TW / 2 - 4, TY - 8); ctx.lineTo(g.xb - TW / 2 + 4, TY - 8); ctx.stroke();
    }
    trolley(ctx, g.xa, TY, TW, false, 'right');
    trolley(ctx, g.xb, TY, TW, st.load, 'left');
    txt(ctx, 'A', g.xa, TY + 32, { size: 15 }); txt(ctx, 'B', g.xb, TY + 32, { size: 15 });
    const F = magForce(g.gap);
    const L = F * CM;
    // the forces are drawn above the trolleys, starting from the face of each magnet
    for (const [x, d, c, n] of [[g.xb - TW / 2 + 4, 1, COLA, 'F A/B'], [g.xa + TW / 2 - 4, -1, COLB, 'F B/A']]) {
      ctx.setLineDash([3, 3]); ctx.strokeStyle = c; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, TY - 30); ctx.lineTo(x, TY - 80); ctx.stroke(); ctx.setLineDash([]);
      vec(ctx, x, TY - 80, d * L, 0, c, n);
    }
    txt(ctx, t('lbl.scaleInt'), 584, 346, { align: 'right', size: 11, weight: 600, color: cssVar('--muted') });
    if (!st.burnt) txt(ctx, t('lbl.stringTaut'), 300, 120, { size: 12, color: cssVar('--muted') });
    return;
  }
  if (st.mode === 'balances') {
    // spring balance A hooked to the wall, spring balance B pulled by the hand
    ctx.fillStyle = cssVar('--wire'); ctx.fillRect(16, 110, 14, 150);
    const F = st.pull; // N
    const hookA = tubeBalance(ctx, { x: 40, y: 185 }, { x: 1, y: 0 }, F, FMAX, '(A)');
    // B is reversed: its ring is held by the hand, its hook meets the hook of A
    const ringB = { x: hookA.x + 10 + 12 + 120 + 16 + (F / FMAX) * 60, y: 185 };
    tubeBalance(ctx, ringB, { x: -1, y: 0 }, F, FMAX, '(B)');
    hand(ctx, ringB.x + 18, 185);
    if (F > 0.02) {
      vec(ctx, hookA.x + 6, 185, F * CM, 0, COLA, 'F B/A');
      vec(ctx, hookA.x + 6, 185, -F * CM, 0, COLB, 'F A/B');
    }
    txt(ctx, t('lbl.dragHandB'), 20, 346, { align: 'left', size: 11, weight: 600, color: cssVar('--muted') });
    txt(ctx, t('lbl.scaleInt'), 584, 346, { align: 'right', size: 11, weight: 600, color: cssVar('--muted') });
    return;
  }
  // racket and tennis ball (Activity 2): illustration of a contact interaction
  ctx.strokeStyle = '#2b3140'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.ellipse(250, 180, 46, 80, 0, 0, 7); ctx.stroke();
  ctx.strokeStyle = 'rgba(80,90,110,0.5)'; ctx.lineWidth = 1;
  for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(250 + i * 12, 106); ctx.lineTo(250 + i * 12, 254); ctx.stroke(); }
  ctx.strokeStyle = '#2b3140'; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(250, 262); ctx.lineTo(250, 340); ctx.stroke();
  ctx.fillStyle = '#d7e64a'; ctx.beginPath(); ctx.ellipse(312, 180, 18, 26, 0, 0, 7); ctx.fill(); // the ball is flattened against the strings
  vec(ctx, 296, 180, 90, 0, COLA, t('lbl.racketOnBall'));
  vec(ctx, 296, 180, -90, 0, COLB, t('lbl.ballOnRacket'));
  txt(ctx, t('lbl.deformed'), 300, 40, { size: 12, color: cssVar('--muted') });
}

/* ---------- Activities 4–6: equilibrium of a body acted upon by two forces ---------- */
function drawEquilibrium(ctx) {
  const st = S.equilibrium;
  if (st.mode === 'light') {
    const e = eqForces(st);
    // balances, strings and the hands
    for (const [P, f, n] of [[st.P1, e.a, '(1)'], [st.P2, e.b, '(2)']]) {
      const u = { x: -f.ux, y: -f.uy };
      const hook = tubeBalance(ctx, P, u, f.F, FMAX, n);
      ctx.strokeStyle = cssVar('--thread'); ctx.lineWidth = 1.5; ctx.setLineDash(f.F > 0 ? [] : [3, 4]);
      ctx.beginPath(); ctx.moveTo(hook.x, hook.y); ctx.lineTo(st.B.x, st.B.y); ctx.stroke(); ctx.setLineDash([]);
      hand(ctx, P.x - u.x * 14, P.y - u.y * 14);
    }
    // the light body (a piece of polyester)
    ctx.fillStyle = '#f4f1e6'; ctx.strokeStyle = '#a9a28a'; ctx.lineWidth = 1.5;
    roundRect(ctx, st.B.x - 22, st.B.y - 14, 44, 28, 6); ctx.fill(); ctx.stroke();
    if (st.hold) { ctx.fillStyle = 'rgba(230, 0, 0, 0.18)'; ctx.beginPath(); ctx.arc(st.B.x, st.B.y, 30, 0, 7); ctx.fill(); txt(ctx, t('lbl.held'), st.B.x, st.B.y - 40, { size: 12, color: '#c0392b' }); }
    vec(ctx, st.B.x, st.B.y, e.a.ux * e.a.F * CM, e.a.uy * e.a.F * CM, COLA, 'F1');
    vec(ctx, st.B.x, st.B.y, e.b.ux * e.b.F * CM, e.b.uy * e.b.F * CM, COLB, 'F2');
    const eq = isEquilibrium(st);
    txt(ctx, eq ? t('lbl.eqYes') : st.hold ? t('lbl.eqNo') : '', 300, 30, { size: 14, color: eq ? '#1d8a4b' : '#c0392b' });
    txt(ctx, t('lbl.dragHands'), 20, 346, { align: 'left', size: 11, weight: 600, color: cssVar('--muted') });
    txt(ctx, t('lbl.scaleEq'), 584, 346, { align: 'right', size: 11, weight: 600, color: cssVar('--muted') });
    return;
  }
  // a body on a table or hanging from a string (Activities 5 and 6)
  const W = st.m * G_EB9, k = CM / 2; // scale 1 cm ↔ 2 N
  ctx.fillStyle = cssVar('--wood'); ctx.fillRect(16, 330, 568, 10);
  if (st.sup === 'table') {
    const top = 230;
    if (!st.cut) { ctx.fillStyle = cssVar('--wood'); ctx.fillRect(160, top, 280, 12); ctx.fillRect(176, top + 12, 10, 330 - top - 12); ctx.fillRect(414, top + 12, 10, 330 - top - 12); }
    const yb = Math.min(330, top + st.fall);
    ctx.fillStyle = '#c99a5b'; ctx.strokeStyle = '#7d5a2c'; ctx.lineWidth = 2; ctx.fillRect(260, yb - 60, 80, 60); ctx.strokeRect(260, yb - 60, 80, 60);
    vec(ctx, 300, yb - 30, 0, W * k, '#2f6fd6', t('f.W'));
    if (!st.cut) vec(ctx, 300, top, 0, -W * k, '#1d8a4b', t('f.N'));
  } else {
    ctx.fillStyle = cssVar('--wire'); ctx.fillRect(200, 22, 200, 10);
    const y0 = 170 + st.fall;
    if (!st.cut) { ctx.strokeStyle = cssVar('--thread'); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(300, 32); ctx.lineTo(300, y0); ctx.stroke(); }
    else { ctx.strokeStyle = cssVar('--thread'); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(300, 32); ctx.lineTo(300, 110); ctx.stroke(); }
    const yb = Math.min(330 - 50, y0);
    ctx.fillStyle = '#9aa3b0'; ctx.strokeStyle = '#5f6875'; ctx.fillRect(278, yb, 44, 50); ctx.strokeRect(278, yb, 44, 50);
    vec(ctx, 300, yb + 25, 0, W * k, '#2f6fd6', t('f.W'));
    if (!st.cut) vec(ctx, 300, yb, 0, -W * k, '#1d8a4b', t('f.T'));
  }
  txt(ctx, t('lbl.scaleSup'), 584, 346, { align: 'right', size: 11, weight: 600, color: cssVar('--muted') });
}

/* ---------- Activity 7, Ex. 9–11: Hooke's law ---------- */
const HK = { O: { x: 200, y: 34 }, PX: 10, rulerX: 140 };   // 10 px = 1 cm
function drawHooke(ctx) {
  const st = S.hooke;
  const { O, PX } = HK;
  const L = springLen(st);
  const yEnd = O.y + L * PX;
  ctx.fillStyle = cssVar('--wire'); ctx.fillRect(100, O.y - 10, 200, 10);
  // the ruler: 0 at the point where the spring is attached
  const rx = HK.rulerX;
  ctx.fillStyle = '#f2e6b8'; ctx.fillRect(rx - 26, O.y, 26, 31 * PX); ctx.strokeStyle = '#a28d45'; ctx.lineWidth = 1; ctx.strokeRect(rx - 26, O.y, 26, 31 * PX);
  ctx.strokeStyle = '#3b3420'; ctx.fillStyle = '#3b3420'; ctx.font = font(8, 700); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let c = 0; c <= 30; c++) {
    const y = O.y + c * PX;
    ctx.beginPath(); ctx.moveTo(rx, y); ctx.lineTo(rx - (c % 5 ? 6 : 11), y); ctx.stroke();
    if (c % 5 === 0) ctx.fillText(String(c), rx - 13, y);
  }
  txt(ctx, 'cm', rx - 13, O.y + 31 * PX + 10, { size: 10 });
  spring(ctx, O.x, O.y, O.x, yEnd, 16, 10);
  // pointer at the end of the spring, level with the ruler
  ctx.strokeStyle = '#e60000'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(rx, yEnd); ctx.lineTo(O.x - 8, yEnd); ctx.stroke();
  if (st.m > 0) {
    const h = 14 + st.m * 30, w = 30;
    ctx.strokeStyle = '#7a5c12'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(O.x, yEnd); ctx.lineTo(O.x, yEnd + 8); ctx.stroke();
    const gr = ctx.createLinearGradient(O.x - w / 2, 0, O.x + w / 2, 0);
    gr.addColorStop(0, '#b38b2e'); gr.addColorStop(0.45, '#f0d27a'); gr.addColorStop(1, '#a37b22');
    ctx.fillStyle = gr; roundRect(ctx, O.x - w / 2, yEnd + 8, w, h, 3); ctx.fill();
    ctx.fillStyle = '#4a3a10'; ctx.font = font(9, 800); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`${num(st.m, 1)} kg`, O.x, yEnd + 8 + h / 2);
    // the two forces on the marked mass (scale 1 cm ↔ 4 N)
    const Wv = st.m * G_EB9 * (CM / 4);
    vec(ctx, O.x + 34, yEnd + 8 + h / 2, 0, Wv, '#2f6fd6', t('f.W'), { w: 2.5 });
    vec(ctx, O.x + 34, yEnd + 8, 0, -Wv, '#1d8a4b', t('f.T'), { w: 2.5 });
  }
  // magnifier on the ruler around the end of the spring (6 ×)
  const zx = 330, zy = 70, zw = 250, zh = 230, Z = 60; // 60 px per cm in the lens
  ctx.fillStyle = cssVar('--surface'); roundRect(ctx, zx - 10, zy - 30, zw + 20, zh + 60, 12); ctx.fill();
  txt(ctx, t('lbl.lens'), zx, zy - 14, { align: 'left', size: 12, color: cssVar('--muted') });
  ctx.save(); ctx.beginPath(); ctx.rect(zx, zy, zw, zh); ctx.clip();
  ctx.fillStyle = '#f2e6b8'; ctx.fillRect(zx, zy, 90, zh);
  ctx.fillStyle = cssVar('--scene-bg'); ctx.fillRect(zx + 90, zy, zw - 90, zh);
  const cy = zy + zh / 2;
  ctx.strokeStyle = '#3b3420'; ctx.fillStyle = '#3b3420'; ctx.font = font(14, 700); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  for (let mm = Math.floor((L - 3) * 10); mm <= Math.ceil((L + 3) * 10); mm++) {
    const y = cy + (mm / 10 - L) * Z;
    const len = mm % 10 === 0 ? 40 : mm % 5 === 0 ? 28 : 16;
    ctx.lineWidth = mm % 10 === 0 ? 2 : 1;
    ctx.beginPath(); ctx.moveTo(zx + 90, y); ctx.lineTo(zx + 90 - len, y); ctx.stroke();
    if (mm % 10 === 0) ctx.fillText(String(mm / 10), zx + 6, y - 9);
  }
  ctx.strokeStyle = '#e60000'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(zx + 60, cy); ctx.lineTo(zx + zw, cy); ctx.stroke();
  spring(ctx, zx + 170, zy - 20, zx + 170, cy, 3, 18);
  ctx.restore();
  ctx.strokeStyle = cssVar('--muted'); ctx.lineWidth = 1; ctx.strokeRect(zx, zy, zw, zh);
  txt(ctx, t('lbl.readLength'), zx + zw / 2, zy + zh + 18, { size: 12, color: cssVar('--muted') });
}

/* ================================================================
   Animation and pointer
   ================================================================ */
const PX_PER_M = 400;
const loop = createLoop({
  step(dt) {
    if (!shell) return false;
    if (shell.tab === 'interaction') {
      const st = S.interaction;
      if (st.mode !== 'trolleys' || !st.burnt) return false;
      const g = trolleyGeom(st);
      const F = magForce(g.gap);
      const ma = 0.5, mb = st.load ? 1 : 0.5;
      st.va -= (F / ma) * 60 * dt; st.vb += (F / mb) * 60 * dt;
      st.va *= 0.995; st.vb *= 0.995;
      st.xa += st.va * dt; st.xb += st.vb * dt;
      let moving = true;
      if (g.xa - TW / 2 < 20) { st.va = 0; st.xa = 20 + TW / 2 - (300 - GAP0 / 2 - TW / 2); }
      if (g.xb + TW / 2 > 580) { st.vb = 0; st.xb = 580 - TW / 2 - (300 + GAP0 / 2 + TW / 2); }
      if (st.va === 0 && st.vb === 0) moving = false;
      return moving;
    }
    if (shell.tab === 'equilibrium') {
      const st = S.equilibrium;
      if (st.mode === 'light') {
        if (st.hold) return false;
        const e = eqForces(st);
        if (e.R < 0.01) return false;
        // overdamped: the light body moves in the direction of the resultant until the two forces balance
        const s = Math.min(1, dt * 10) / (2 * KB);
        st.B.x += e.Rx * s; st.B.y += e.Ry * s;
        return true;
      }
      if (!st.cut) return false;
      st.fv += G_EB9 * PX_PER_M * dt; st.fall += st.fv * dt;
      const maxFall = st.sup === 'table' ? 100 : 160;
      if (st.fall >= maxFall) { st.fall = maxFall; return false; }
      return true;
    }
    return false;
  },
  render() { refresh(); },
});

let drag = null;
canvas.addEventListener('pointerdown', (ev) => {
  if (!shell) return;
  const p = view.toLogical(ev);
  const st = cur();
  if (shell.tab === 'interaction' && st.mode === 'balances' && p.x > 200) drag = 'pull';
  else if (shell.tab === 'equilibrium' && st.mode === 'light') {
    const d1 = Math.hypot(p.x - st.P1.x, p.y - st.P1.y), d2 = Math.hypot(p.x - st.P2.x, p.y - st.P2.y);
    if (Math.min(d1, d2) < 60) drag = d1 < d2 ? 'P1' : 'P2';
  }
  if (drag) { canvas.setPointerCapture(ev.pointerId); ev.preventDefault(); move(p); }
});
canvas.addEventListener('pointermove', (ev) => { if (drag) move(view.toLogical(ev)); });
const endDrag = () => { drag = null; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
function move(p) {
  const st = cur();
  if (drag === 'pull') {
    // the hand holds the ring of B: both springs stretch, 12 px per newton each (both read the same force)
    const x0 = 40 + 120 + 16 + 10 + 10 + 12 + 120 + 16 + 18;
    st.pull = Math.round(Math.max(0, Math.min(FMAX, (p.x - x0) / 24)) * 10) / 10;
  } else if (drag === 'P1' || drag === 'P2') {
    st[drag] = { x: Math.max(24, Math.min(576, p.x)), y: Math.max(24, Math.min(336, p.y)) };
    if (!st.hold) loop.start();
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
const N_ = (v, d = 2) => qty(v, d, 'N');
function change(fn) { fn(cur()); refresh(); }

function build() {
  const tab = shell.tab;
  const st = cur();
  const items = [];
  graphCard.hidden = tab !== 'hooke';
  if (tab === 'interaction') {
    items.push(seg('ctl.mode', [['trolleys', 'mode.trolleys'], ['racket', 'mode.racket'], ['balances', 'mode.balances']], st.mode, (v) => { const s = cur(); s.mode = v; buildTab(); }).root);
    if (st.mode === 'trolleys') {
      items.push(seg('ctl.load', [['no', 'ctl.no'], ['yes', 'ctl.yes']], st.load ? 'yes' : 'no', (v) => change((s) => { s.load = v === 'yes'; })).root,
        btnRow(createButton({ labelKey: 'ctl.burn', variant: 'primary', onClick: () => change((s) => { if (!s.burnt) { s.burnt = true; loop.start(); } }) }),
          createButton({ labelKey: 'ui.reset', variant: 'ghost', onClick: () => { const s = cur(); Object.assign(s, { burnt: false, xa: 0, xb: 0, va: 0, vb: 0 }); loop.stop(); refresh(); } })),
        hintP('hint.trolleys'));
    } else if (st.mode === 'balances') items.push(hintP('hint.balances'));
    else items.push(hintP('hint.racket'));
  } else if (tab === 'equilibrium') {
    items.push(seg('ctl.mode', [['light', 'mode.light'], ['support', 'mode.support']], st.mode, (v) => { const s = cur(); s.mode = v; s.cut = false; s.fall = 0; s.fv = 0; buildTab(); }).root);
    if (st.mode === 'light') {
      ui.hold = seg('ctl.hold', [['no', 'ctl.no'], ['yes', 'ctl.yes']], st.hold ? 'yes' : 'no', (v) => change((s) => { s.hold = v === 'yes'; if (!s.hold) loop.start(); }));
      items.push(ui.hold.root, btnRow(
        createButton({ labelKey: 'ctl.align', onClick: () => change((s) => { s.P1 = { x: 70, y: 180 }; s.P2 = { x: 530, y: 180 }; s.B = { x: 300, y: 180 }; if (!s.hold) loop.start(); }) }),
        createButton({ labelKey: 'ctl.oblique', onClick: () => change((s) => { s.P1 = { x: 90, y: 60 }; s.P2 = { x: 510, y: 300 }; s.B = { x: 300, y: 180 }; if (!s.hold) loop.start(); }) })),
        hintP('hint.light'));
    } else {
      items.push(seg('ctl.sup', [['table', 'sup.table'], ['string', 'sup.string']], st.sup, (v) => { const s = cur(); s.sup = v; s.cut = false; s.fall = 0; s.fv = 0; buildTab(); }).root,
        seg('ctl.boxm', BOX_M.map((m) => [m, `bm.${m}`]), st.m, (v) => change((s) => { s.m = Number(v); })).root,
        btnRow(createButton({ labelKey: `ctl.remove.${st.sup}`, variant: 'primary', onClick: () => change((s) => { if (!s.cut) { s.cut = true; s.fall = 0; s.fv = 0; loop.start(); } }) }),
          createButton({ labelKey: 'ui.reset', variant: 'ghost', onClick: () => { const s = cur(); s.cut = false; s.fall = 0; s.fv = 0; loop.stop(); refresh(); } })));
    }
  } else {
    items.push(seg('ctl.spring', [['s1', 'sp.s1'], ['s2', 'sp.s2']], st.spring, (v) => { const s = cur(); s.spring = v; s.m = 0; s.fb = null; buildTab(); }).root);
    ui.mass = seg('ctl.mass', MASSES.map((m) => [m, `ms.${m}`]), st.m, (v) => change((s) => { s.m = Number(v); s.fb = null; }));
    items.push(ui.mass.root, btnRow(createButton({ labelKey: 'ctl.record', variant: 'primary', onClick: () => change((s) => {
      if (s.m === 0) { s.fb = { type: 'warn', key: 'fb.hangFirst' }; return; }
      if (s.rows.some((r) => r.m === s.m && r.spring === s.spring)) { s.fb = { type: 'warn', key: 'fb.already' }; return; }
      s.rows.push({ spring: s.spring, m: s.m });
      s.rows.sort((a, b) => (a.spring === b.spring ? a.m - b.m : a.spring < b.spring ? -1 : 1));
      s.fb = { type: 'good', key: 'fb.recorded' };
    }) })), hintP('hint.hooke'));
  }
  controlsBody.append(...items);
  ui.dl = el('dl', { class: 'meas' });
  ui.status = el('div', { class: 'status', hidden: '' });
  ui.table = el('table', { class: 'data' });
  ui.tableWrap = el('div', { class: 'table-scroll', hidden: '' }, ui.table);
  ui.clear = el('div', { class: 'btn-row', style: 'margin-top:8px', hidden: '' }, [createButton({ labelKey: 'ctl.clearTable', variant: 'ghost', onClick: () => change((s) => { s.rows = s.rows.filter((r) => r.spring !== s.spring); s.fb = null; }) })]);
  measuresBody.append(ui.dl, ui.tableWrap, ui.clear, ui.status);
  tableSig = '';
}

function updateMeasures() {
  if (!shell || !ui.dl) return;
  const tab = shell.tab;
  const st = cur();
  const rows = [];
  if (tab === 'interaction') {
    if (st.mode === 'trolleys') {
      const F = magForce(trolleyGeom(st).gap);
      rows.push([t('m.FAB'), N_(F)], [t('m.FBA'), N_(F)], [t('m.mA'), qty(0.5, 1, 'kg')], [t('m.mB'), qty(st.load ? 1 : 0.5, 1, 'kg')],
        [t('m.dA'), qty(Math.abs(st.xa) / 10, 1, 'cm')], [t('m.dB'), qty(Math.abs(st.xb) / 10, 1, 'cm')]);
    } else if (st.mode === 'balances') {
      const F = st.pull;
      rows.push([t('m.readA'), N_(F, 1)], [t('m.readB'), N_(F, 1)]);
    } else rows.push([t('m.contact'), t('m.contactVal')]);
  } else if (tab === 'equilibrium') {
    if (st.mode === 'light') {
      ui.hold.set(st.hold ? 'yes' : 'no');
      const e = eqForces(st);
      const ang = Math.acos(Math.max(-1, Math.min(1, e.a.ux * e.b.ux + e.a.uy * e.b.uy))) * 180 / Math.PI;
      rows.push([t('m.F1'), N_(e.a.F, 1)], [t('m.F2'), N_(e.b.F, 1)], [t('m.angle'), `${num(ang, 0)}°`], [t('m.sum'), N_(e.R, 1)],
        [t('m.state'), isEquilibrium(st) ? t('st.eq') : t('st.noeq')]);
    } else {
      const W = st.m * G_EB9;
      rows.push([t('m.mass'), qty(st.m, 1, 'kg')], [t('m.W'), N_(W, 1)], [t(st.sup === 'table' ? 'm.N' : 'm.T'), st.cut ? N_(0, 1) : N_(W, 1)],
        [t('m.state'), st.cut ? t('st.falls') : t('st.eq')]);
    }
  } else {
    ui.mass.set(String(st.m));
    const sp = SPRINGS[st.spring];
    rows.push([t('m.l0'), qty(sp.l0, 1, 'cm')], [t('m.mass'), qty(st.m, 1, 'kg')], [t('m.k'), st.spring === 's1' ? qty(sp.k, 0, 'N/m') : '?']);
    const mine = st.rows.filter((r) => r.spring === st.spring);
    const sig = calcSig(mine) + mine.length + getLang() + st.spring;
    if (sig !== tableSig) {
      tableSig = sig;
      const th = (k) => el('th', {}, t(k));
      const onCheck = (okKey, badKey) => (res) => {
        st.fb = res === 'invalid' ? { type: 'warn', key: 'fb.typeNumber' } : res === 'wrong' ? { type: 'bad', key: badKey } : { type: 'good', key: okKey };
        refresh();
      };
      ui.table.replaceChildren(
        el('thead', {}, el('tr', {}, [th('col.m'), th('col.l'), th('col.T'), th('col.x'), th('col.k')])),
        el('tbody', {}, mine.map((r) => {
          const l = springLen(st, r.m), x = (l - sp.l0) / 100, T = r.m * G_EB9;
          return el('tr', {}, [
            el('td', {}, num(r.m, 1)),
            calcCell(r, 'l', { expected: l, decimals: 1, tol: 0.1, onCheck: onCheck('fb.lOk', 'fb.lBad') }),
            calcCell(r, 'T', { expected: T, decimals: 0, onCheck: onCheck('fb.TOk', 'fb.TBad') }),
            calcCell(r, 'x', { expected: x, decimals: 3, disabled: !calcDone(r, 'l'), onCheck: onCheck('fb.xOk', 'fb.xBad') }),
            calcCell(r, 'k', { expected: T / x, decimals: 1, disabled: !(calcDone(r, 'T') && calcDone(r, 'x')), onCheck: onCheck('fb.kOk', 'fb.kBad') }),
          ]);
        })));
    }
    ui.tableWrap.hidden = !mine.length; ui.clear.hidden = !mine.length;
    // graph of the tension T as a function of the elongation x
    const pts = mine.filter((r) => calcDone(r, 'T') && calcDone(r, 'x')).map((r) => [(springLen(st, r.m) - sp.l0) / 100, r.m * G_EB9]);
    graph.draw({ xLabel: t('graph.x'), yLabel: t('graph.y'), xMax: 0.18, yMax: 9, series: [{ color: cssVar('--accent'), points: pts, slope: mine.some((r) => calcDone(r, 'k')) ? sp.k : undefined }] });
    graphHint.hidden = pts.length >= 2;
  }
  ui.dl.replaceChildren(...rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)]));
  const fb = st.fb;
  if (!fb) ui.status.hidden = true;
  else { ui.status.hidden = false; ui.status.className = `status ${fb.type || ''}`; ui.status.textContent = t(fb.key, fb.params); }
}

function buildTab() {
  loop.stop();
  controlsBody.replaceChildren();
  measuresBody.replaceChildren();
  ui = {};
  build();
  refresh();
  const st = cur();
  if (shell.tab === 'equilibrium' && st.mode === 'light' && !st.hold) loop.start();
  if (shell.tab === 'interaction' && st.burnt) loop.start();
}
onLangChange(() => { if (shell) buildTab(); });

shell = initSim({
  strings,
  tabs: TABS.map((id) => ({ id, labelKey: `tab.${id}` })),
  initialTab: 'interaction',
  onTab: buildTab,
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, cur: () => cur(), eqForces, springLen };
