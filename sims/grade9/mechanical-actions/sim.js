// Grade 9 — Mechanical actions (Ch.12: Act. 1–8; Ex. 3–8, 10, 11, 13–20). g = 10 N/kg as in the Grade 9 book.
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange, getLang } from '../../../shared/i18n.js';
import { num, qty, parseNum } from '../../../shared/format.js';
import { createButton, createSegmented, createSlider, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, font, arrow } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { label } from '../../../shared/figures.js';
import { drawSpringBalance, BALANCES, shown } from '../../../shared/spring-balance.js';
import { createGraph } from '../../../shared/graph.js';
import { calcCell, calcSig, calcDone } from '../../../shared/calc-cell.js';
import { G_EB9 } from '../../../shared/constants.js';

/* ================================================================
   Constants and state
   ================================================================ */
const CM = 26;                                  // 1 cm on the screen grid
const BAL20 = { max: 20, major: 2, minor: 0.5, labelEvery: 4 };
const PLACES = { earth: G_EB9, moon: 1.6, jupiter: 23.1 }; // N/kg (Ex. 15)
const MASSES = [0.2, 0.3, 0.4, 0.5, 0.6];       // kg (Act. 7, English book — owner, 4 Nov 2026)
const APPLE_W = 1.5;                            // N (illustrative apple of 150 g)
const SPRING = { O: { x: 300, y: 34 }, L0: 120 }; // free length 12 cm (10 px = 1 cm)
const DIST = '#2f6fd6', CONT = '#1d8a4b';       // colours: forces acting from a distance / contact forces
const rand = (a) => a[Math.floor(Math.random() * a.length)];
const angOf = (tk) => (getLang() === 'fr' && tk.angFr != null ? tk.angFr : tk.ang);
const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

// Exercises: draw a force vector to scale (angle in degrees from the horizontal, anticlockwise)
const TASKS = [
  { id: 'ex5', F: 3, ang: 0, scale: 1 },
  { id: 'ex6', F: 2.2, ang: 90, scale: 2 },
  { id: 'ex7c', F: 0.02, ang: 0, scale: 0.01 },
  { id: 'ex7d', F: 0.01, ang: -90, scale: 0.01 },
  { id: 'ex8', F: 250, ang: 30, scale: 100 },
  { id: 'ex11a', F: 8, ang: 0, scale: 2 },
  { id: 'ex11b', F: 1.2, ang: 90, scale: 0.3 },
  { id: 'ex11c', F: 12, ang: 30, angFr: 150, scale: 4 }, // the FR book says “vers la gauche”, the EN book “to the right”
  { id: 'ex16b', F: 10, ang: -90, scale: 2 },
];
// Classification scenes (Act. 4 and 5): the force studied and its category
const SCENES = {
  magnet: { force: 'Fm', cat: 'dist' }, gravity: { force: 'W', cat: 'dist' }, electric: { force: 'Fe', cat: 'dist' },
  normal: { force: 'N', cat: 'cont' }, friction: { force: 'f', cat: 'cont' }, tension: { force: 'T', cat: 'cont' },
};
// Lists of forces (Act. 8, Ex. 10, 17, 18, 19)
const CANDIDATES = ['W', 'N', 'f', 'T', 'F', 'Fm', 'Fe', 'R'];
const CAT = { W: 'dist', Fm: 'dist', Fe: 'dist', N: 'cont', f: 'cont', T: 'cont', F: 'cont', R: 'cont' };
const LISTS = {
  table: ['W', 'N'], pushed: ['W', 'N', 'f', 'F'], nail: ['W', 'T', 'Fm'], ball: ['W', 'T', 'Fe'],
  chandelier: ['W', 'T'], skier: ['W', 'N', 'f'], incline: ['W', 'N', 'T'], parachute: ['W', 'R'],
};
const SHAPES = ['square', 'rectangle', 'triangle', 'disc'];

const dec1 = (v) => (Math.abs(v - Math.round(v)) < 1e-9 ? 0 : 1);
const EX15 = [60, 375, 26];                     // kg (Ex. 15)
function newEx15(m, preset = String(m)) { return { m, preset, rows: Object.keys(PLACES).map((place) => ({ place })) }; }
function newZero(bal) { return (Math.random() < 0.5 ? -1 : 1) * randInt(2, 4) * bal.minor; }
function initialState(tab) {
  switch (tab) {
    case 'chars': return { A: { x: 300, y: 34 + 200 }, line: true, vec: true };
    case 'vector': return { mode: 'measure', bi: 1, zero: newZero(BALANCES[1]), F: 0, typed: '', readOk: false, scale: 1, tip: null, task: 0, readF: 0, score: 0, tries: 0, fb: null };
    case 'classify': return { scene: 'magnet', act: false, push: 0, anim: null, show: true, ans: '', solved: [], fb: null };
    case 'weight': return { mode: 'apple', released: false, appleY: 0, appleV: 0, plumb: true, shape: 'square', tap: null, cons: false, cgOk: false, place: 'earth', m: 0.2, rows: [], ex: newEx15(60), fb: null };
    default: return { scene: 'table', picked: [], checked: false, solved: [], fb: null };
  }
}
const TABS = ['chars', 'vector', 'classify', 'weight', 'list'];
let S = Object.fromEntries(TABS.map((k) => [k, initialState(k)]));
const newReadF = (bal) => Math.round((bal.minor + Math.random() * (bal.max - bal.minor)) / bal.minor) * bal.minor;

/* ================================================================
   Canvas
   ================================================================ */
const W_ = 600, H_ = 360;
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

// Force vector drawn from (x, y) with components (dx, dy) in px, with its name
function vec(ctx, x, y, dx, dy, color, name, { dot = true, w = 3.5 } = {}) {
  if (Math.hypot(dx, dy) < 2) return;
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = w;
  arrow(ctx, x, y, x + dx, y + dy, 11);
  if (dot) { ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 7); ctx.fill(); }
  const L = Math.hypot(dx, dy);
  const nx = -dy / L, ny = dx / L; // name beside the middle of the arrow
  label(ctx, name, x + dx * 0.7 + nx * 14, y + dy * 0.7 + ny * 14, { size: 15, weight: 800, color });
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
  const a = 10, b = L - 10;
  ctx.lineTo(x1 + ux * a, y1 + uy * a);
  for (let i = 1; i < coils * 2; i++) { const s = a + ((b - a) * i) / (coils * 2), sg = i % 2 ? 1 : -1; ctx.lineTo(x1 + ux * s + px * w * sg, y1 + uy * s + py * w * sg); }
  ctx.lineTo(x1 + ux * b, y1 + uy * b); ctx.lineTo(x2, y2); ctx.stroke();
}
function support(ctx, x, y, w = 160) { ctx.fillStyle = cssVar('--wire'); ctx.fillRect(x - w / 2, y - 8, w, 8); }
function floor(ctx, y = 330) { ctx.fillStyle = cssVar('--wood'); ctx.fillRect(16, y, 568, 10); }
function stand(ctx, x, top, baseY = 330) {
  ctx.fillStyle = cssVar('--wire');
  ctx.fillRect(x - 150, baseY, 110, 9);
  ctx.fillRect(x - 100, top - 6, 7, baseY - top + 6);
  ctx.fillRect(x - 100, top - 6, 104, 6);
}
function massPiece(ctx, x, yTop, kg) {
  const h = 18 + kg * 40, w = 30;
  ctx.strokeStyle = '#7a5c12'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(x, yTop + 5, 4, Math.PI, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, yTop + 1); ctx.lineTo(x, yTop + 8); ctx.stroke();
  const gr = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  gr.addColorStop(0, '#b38b2e'); gr.addColorStop(0.45, '#f0d27a'); gr.addColorStop(1, '#a37b22');
  ctx.fillStyle = gr; roundRect(ctx, x - w / 2, yTop + 8, w, h, 3); ctx.fill();
  ctx.fillStyle = '#4a3a10'; ctx.font = font(9, 800); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(`${num(kg, 1)} kg`, x, yTop + 8 + h / 2);
  return yTop + 8 + h;
}
function box(ctx, x, yBottom, w = 90, h = 60) {
  ctx.fillStyle = '#c99a5b'; ctx.strokeStyle = '#7d5a2c'; ctx.lineWidth = 2;
  ctx.fillRect(x - w / 2, yBottom - h, w, h); ctx.strokeRect(x - w / 2, yBottom - h, w, h);
  ctx.fillStyle = '#e6c88f'; ctx.fillRect(x - w / 2 + 6, yBottom - h + 6, w - 12, 10); // sand
}
function tableTop(ctx, x0, x1, y) {
  ctx.fillStyle = cssVar('--wood'); ctx.fillRect(x0, y, x1 - x0, 12);
  ctx.fillRect(x0 + 10, y + 12, 10, 330 - y - 12); ctx.fillRect(x1 - 20, y + 12, 10, 330 - y - 12);
}
function magnetBar(ctx, x, y, w = 90, h = 26, vertical = false) {
  ctx.save(); ctx.translate(x, y); if (vertical) ctx.rotate(Math.PI / 2);
  ctx.fillStyle = '#d63b3b'; ctx.fillRect(-w / 2, -h / 2, w / 2, h);
  ctx.fillStyle = '#2f6fd6'; ctx.fillRect(0, -h / 2, w / 2, h);
  ctx.fillStyle = '#fff'; ctx.font = font(13, 800); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('N', -w / 4, 0); ctx.fillText('S', w / 4, 0);
  ctx.restore();
}
function nail(ctx, x, y, ang = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.fillStyle = '#8a9099'; ctx.fillRect(-2.5, 0, 5, 38);
  ctx.beginPath(); ctx.moveTo(-2.5, 38); ctx.lineTo(0, 46); ctx.lineTo(2.5, 38); ctx.fill();
  ctx.fillRect(-7, -3, 14, 4);
  ctx.restore();
}
function pith(ctx, x, y) {
  ctx.fillStyle = '#f2efe4'; ctx.strokeStyle = '#9b9682'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(x, y, 10, 0, 7); ctx.fill(); ctx.stroke();
}
function rod(ctx, x, y) {
  ctx.fillStyle = '#5c4a8a'; roundRect(ctx, x - 80, y - 7, 120, 14, 6); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = font(12, 800); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 0; i < 4; i++) ctx.fillText('+', x - 50 + i * 25, y);
}
function apple(ctx, x, y) {
  ctx.fillStyle = '#d23a2a'; ctx.beginPath(); ctx.arc(x - 6, y, 14, 0, 7); ctx.arc(x + 6, y, 14, 0, 7); ctx.fill();
  ctx.strokeStyle = '#5b3b16'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y - 12); ctx.lineTo(x + 2, y - 20); ctx.stroke();
  ctx.fillStyle = '#3e9b3a'; ctx.beginPath(); ctx.ellipse(x + 8, y - 18, 6, 3, -0.4, 0, 7); ctx.fill();
}

function draw() {
  if (!shell) return;
  const ctx = view.begin();
  ctx.fillStyle = cssVar('--scene-bg'); ctx.fillRect(0, 0, W_, H_);
  const tab = shell.tab;
  if (tab === 'chars') drawChars(ctx);
  else if (tab === 'vector') drawVectorTab(ctx);
  else if (tab === 'classify') drawClassify(ctx);
  else if (tab === 'weight') drawWeight(ctx);
  else drawList(ctx);
}

/* ---------- Activity 1: characteristics of a force ---------- */
// The spring: 10 px = 1 cm; free length 12 cm; stiffness 25 N/m → F (N) = 0.25 × elongation (cm)
const PXCM = 10, K_NCM = 0.25;
function charsState() {
  const { O, L0 } = SPRING;
  const A = S.chars.A;
  const L = Math.hypot(A.x - O.x, A.y - O.y);
  const x = Math.max(0, (L - L0) / PXCM);           // elongation (cm)
  return { L, x, F: K_NCM * x, ux: (A.x - O.x) / L, uy: (A.y - O.y) / L, ang: Math.atan2(A.x - O.x, A.y - O.y) * 180 / Math.PI };
}
function drawChars(ctx) {
  const st = S.chars;
  const { O } = SPRING;
  support(ctx, O.x, O.y, 200);
  ctx.fillStyle = cssVar('--wire'); ctx.beginPath(); ctx.arc(O.x, O.y + 2, 4, 0, 7); ctx.fill();
  txt(ctx, 'O', O.x + 14, O.y + 10);
  const c = charsState();
  // the line of action
  if (st.line) {
    ctx.setLineDash([7, 5]); ctx.strokeStyle = cssVar('--muted'); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(O.x - c.ux * 30, O.y - c.uy * 30 + 0); ctx.lineTo(O.x + c.ux * 700, O.y + c.uy * 700); ctx.stroke(); ctx.setLineDash([]);
  }
  spring(ctx, O.x, O.y, st.A.x, st.A.y);
  hand(ctx, st.A.x + c.ux * 16, st.A.y + c.uy * 16);
  ctx.fillStyle = cssVar('--text'); ctx.beginPath(); ctx.arc(st.A.x, st.A.y, 4, 0, 7); ctx.fill();
  txt(ctx, 'A', st.A.x - c.uy * 18 - 10, st.A.y + c.ux * 18);
  if (st.vec && c.F > 0.01) vec(ctx, st.A.x, st.A.y, c.ux * c.F * 2 * CM, c.uy * c.F * 2 * CM, cssVar('--accent'), 'F');
  // a ruler-free scale legend
  txt(ctx, t('lbl.scaleChars'), 584, 346, { align: 'right', size: 11, weight: 600, color: cssVar('--muted') });
  txt(ctx, t('lbl.dragHand'), 20, 346, { align: 'left', size: 11, weight: 600, color: cssVar('--muted') });
}

/* ---------- Activities 2 and 3, Ex. 5–8, 11, 16: spring balance and force vector ---------- */
const GRID = { x0: 262, y0: 18, x1: 584, y1: 342 };
const BALX = { x: 140, y: 110, r: 56 };
let hookPos = null;
function balOf(st) { return BALANCES[st.bi]; }
function gridA(st) {
  if (st.mode !== 'draw') return { x: GRID.x0 + 6 * CM, y: GRID.y0 + CM };
  const tk = TASKS[st.task];
  const a = angOf(tk);
  if (a === -90) return { x: GRID.x0 + 6 * CM, y: GRID.y0 + 2 * CM };
  if (a === 90) return { x: GRID.x0 + 6 * CM, y: GRID.y0 + 10 * CM };
  if (a > 90) return { x: GRID.x0 + 10 * CM, y: GRID.y0 + 8 * CM };
  return { x: GRID.x0 + 2 * CM, y: GRID.y0 + 8 * CM };
}
function drawVectorTab(ctx) {
  const st = S.vector;
  // left: the spring balance on its stand (or the situation of the exercise)
  if (st.mode === 'draw') drawTaskPicture(ctx, TASKS[st.task]);
  else {
    const bal = balOf(st);
    const F = st.mode === 'read' ? st.readF : st.F;
    const zero = st.mode === 'read' ? 0 : st.zero;
    stand(ctx, BALX.x, 24);
    ctx.strokeStyle = cssVar('--wire'); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(BALX.x, 22); ctx.lineTo(BALX.x, BALX.y - BALX.r - 20); ctx.stroke();
    const h = drawSpringBalance(ctx, { ...BALX, bal, F, zero, rodTravel: 50, lang: getLang() });
    hookPos = h;
    ctx.strokeStyle = cssVar('--thread'); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(h.hookX, h.hookY); ctx.lineTo(h.hookX, h.hookY + 26); ctx.stroke();
    ctx.fillStyle = cssVar('--text'); ctx.beginPath(); ctx.arc(h.hookX, h.hookY + 26, 3.5, 0, 7); ctx.fill();
    txt(ctx, 'A', h.hookX - 14, h.hookY + 26);
    if (st.mode === 'read') {
      ctx.fillStyle = '#c99a5b'; ctx.strokeStyle = '#7d5a2c'; ctx.lineWidth = 2;
      ctx.fillRect(h.hookX - 22, h.hookY + 26, 44, 34); ctx.strokeRect(h.hookX - 22, h.hookY + 26, 44, 34);
      txt(ctx, '?', h.hookX, h.hookY + 43, { size: 16, halo: false });
    }
    else hand(ctx, h.hookX, h.hookY + 44);
    if (st.mode === 'measure') txt(ctx, t('lbl.dragHook'), 20, 346, { align: 'left', size: 11, weight: 600, color: cssVar('--muted') });
    if (st.mode === 'read') return;
  }
  // right: graph paper (1 cm squares) with the point of application A
  ctx.fillStyle = '#ffffff'; ctx.fillRect(GRID.x0, GRID.y0, GRID.x1 - GRID.x0, GRID.y1 - GRID.y0);
  ctx.strokeStyle = '#b9d3ec'; ctx.lineWidth = 1;
  for (let x = GRID.x0; x <= GRID.x1 + 0.5; x += CM) { ctx.beginPath(); ctx.moveTo(x, GRID.y0); ctx.lineTo(x, GRID.y1); ctx.stroke(); }
  for (let y = GRID.y0; y <= GRID.y1 + 0.5; y += CM) { ctx.beginPath(); ctx.moveTo(GRID.x0, y); ctx.lineTo(GRID.x1, y); ctx.stroke(); }
  ctx.strokeStyle = '#7fa7cf'; ctx.strokeRect(GRID.x0, GRID.y0, GRID.x1 - GRID.x0, GRID.y1 - GRID.y0);
  const A = gridA(st);
  // horizontal reference line through A (to measure the angle)
  ctx.setLineDash([4, 4]); ctx.strokeStyle = '#9aa9bb'; ctx.beginPath(); ctx.moveTo(GRID.x0, A.y); ctx.lineTo(GRID.x1, A.y); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#1a2333'; ctx.beginPath(); ctx.arc(A.x, A.y, 4, 0, 7); ctx.fill();
  ctx.font = font(14, 800); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText('A', A.x - 8, A.y - 10);
  if (st.tip) {
    const c = st.fb?.type === 'good' ? '#1d8a4b' : st.fb?.type === 'bad' ? '#c0392b' : '#e60000';
    ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = 3.5;
    arrow(ctx, A.x, A.y, st.tip.x, st.tip.y, 11);
    ctx.font = font(15, 800); ctx.textAlign = 'left'; ctx.fillText('F', st.tip.x + 8, (A.y + st.tip.y) / 2 - 8);
  }
  ctx.fillStyle = '#4a5a70'; ctx.font = font(11, 600); ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  const sc = scaleOf(st);
  ctx.fillText(t('lbl.scaleIs', { s: num(sc, sc < 0.1 ? 2 : sc < 1 ? 1 : 0) }), GRID.x0 + 6, GRID.y1 - 4);
}
function scaleOf(st) { return st.mode === 'draw' ? TASKS[st.task].scale : st.scale; }
function drawTaskPicture(ctx, tk) {
  const x = 130, y = 180;
  ctx.fillStyle = cssVar('--surface'); roundRect(ctx, 16, 18, 232, 324, 12); ctx.fill();
  txt(ctx, t(`task.${tk.id}.who`), x, 40, { size: 12 });
  // a simple sketch of the situation with the line of action
  const a = (angOf(tk) * Math.PI) / 180;
  ctx.setLineDash([6, 5]); ctx.strokeStyle = cssVar('--muted'); ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(x - Math.cos(a) * 90, y + Math.sin(a) * 90); ctx.lineTo(x + Math.cos(a) * 90, y - Math.sin(a) * 90); ctx.stroke(); ctx.setLineDash([]);
  if (Math.abs(Math.sin(a)) > 0.1 && Math.abs(Math.cos(a)) > 0.1) {
    const left = Math.cos(a) < 0;
    ctx.strokeStyle = cssVar('--muted'); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (left ? -90 : 90), y); ctx.stroke();
    ctx.beginPath(); if (left) ctx.arc(x, y, 40, Math.PI, Math.PI + (Math.PI - a)); else ctx.arc(x, y, 40, -a, 0); ctx.stroke();
    txt(ctx, '30°', x + (left ? -56 : 56), y - 12, { size: 12 });
  }
  ctx.fillStyle = cssVar('--text'); ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill();
  txt(ctx, 'A', x - 14, y + 14);
  ctx.strokeStyle = cssVar('--accent'); ctx.fillStyle = cssVar('--accent'); ctx.lineWidth = 3;
  arrow(ctx, x, y, x + Math.cos(a) * 60, y - Math.sin(a) * 60, 10);
  txt(ctx, t('lbl.notToScale'), x, 300, { size: 11, weight: 600, color: cssVar('--muted') });
}
function tipMeasure(st) {
  if (!st.tip) return null;
  const A = gridA(st);
  const dx = (st.tip.x - A.x) / CM, dy = (A.y - st.tip.y) / CM;
  return { L: Math.hypot(dx, dy), ang: (Math.atan2(dy, dx) * 180) / Math.PI };
}

/* ---------- Activities 4 and 5: classification of forces ---------- */
const SC = { tableY: 250, boxX: 300 };
function sceneState(st) { return st.anim || {}; }
function drawClassify(ctx) {
  const st = S.classify;
  const a = sceneState(st);
  const force = SCENES[st.scene].force;
  const color = st.solved.includes(st.scene) ? (SCENES[st.scene].cat === 'dist' ? DIST : CONT) : cssVar('--accent');
  const showV = st.show;
  floor(ctx);
  switch (st.scene) {
    case 'magnet': {
      support(ctx, 300, 40, 200);
      const ang = st.act ? 0 : -0.42; // the thread is pulled towards the magnet
      const L = 150, x = 300 + Math.sin(-ang) * L, y = 40 + Math.cos(ang) * L;
      ctx.strokeStyle = cssVar('--thread'); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(300, 40); ctx.lineTo(x, y); ctx.stroke();
      nail(ctx, x, y, 0);
      if (!st.act) { magnetBar(ctx, 480, y + 20); if (showV) vec(ctx, x + 4, y + 20, 55, 0, color, t('f.Fm')); }
      else txt(ctx, t('lbl.magnetRemoved'), 480, y + 20, { size: 12, color: cssVar('--muted') });
      break;
    }
    case 'gravity': {
      ctx.fillStyle = '#6b4a2b'; ctx.fillRect(120, 70, 260, 10);
      const y = 100 + (a.y || 0);
      apple(ctx, 300, y);
      if (!st.act) { ctx.strokeStyle = '#5b3b16'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(300, 80); ctx.lineTo(300, y - 18); ctx.stroke(); }
      if (showV) vec(ctx, 300, y, 0, 70, color, t('f.W'));
      break;
    }
    case 'electric': {
      support(ctx, 300, 40, 200);
      const ang = st.act ? 0 : -0.35;
      const L = 170, x = 300 + Math.sin(-ang) * L, y = 40 + Math.cos(ang) * L;
      ctx.strokeStyle = cssVar('--thread'); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(300, 40); ctx.lineTo(x, y); ctx.stroke();
      pith(ctx, x, y);
      if (!st.act) { rod(ctx, 470, y); if (showV) vec(ctx, x, y, 60, 0, color, t('f.Fe')); }
      else txt(ctx, t('lbl.rodRemoved'), 450, y, { size: 12, color: cssVar('--muted') });
      break;
    }
    case 'normal': {
      if (!st.act) tableTop(ctx, 150, 450, SC.tableY);
      const yb = SC.tableY + (a.y || 0);
      box(ctx, 300, Math.min(330, yb));
      if (!st.act && showV) vec(ctx, 300, SC.tableY, 0, -80, color, t('f.N'));
      if (st.act) txt(ctx, t('lbl.tableRemoved'), 300, 120, { size: 12, color: cssVar('--muted') });
      break;
    }
    case 'friction': {
      tableTop(ctx, 60, 540, SC.tableY);
      const bx = SC.boxX + (a.x || 0);
      box(ctx, bx, SC.tableY);
      hand(ctx, bx - 58, SC.tableY - 40);
      const fmax = 6;
      const f = a.moving ? 4 : Math.min(st.push, fmax); // sliding friction 4 N (illustrative)
      if (st.push > 0) vec(ctx, bx - 45, SC.tableY - 40, st.push * 12, 0, cssVar('--text'), t('f.F'), { w: 2.5 });
      if (showV && st.push > 0) vec(ctx, bx, SC.tableY, -f * 12, 0, color, t('f.f'));
      txt(ctx, a.moving ? t('lbl.boxMoves') : st.push > 0 ? t('lbl.boxStill') : '', 300, 80, { size: 12, color: cssVar('--muted') });
      break;
    }
    case 'tension': {
      support(ctx, 300, 40, 200);
      const yb = 190 + (a.y || 0);
      if (!st.act) spring(ctx, 300, 40, 300, 190, 12, 8);
      else { spring(ctx, 300, 40, 300, 120, 12, 8); }
      const bottom = massPiece(ctx, 300, Math.min(yb, 330 - 46), 0.2);
      if (!st.act && showV) vec(ctx, 300, 198, 0, -70, color, t('f.T'));
      void bottom;
      break;
    }
  }
}

/* ---------- Activities 6 and 7, Ex. 13–16, 20: the weight ---------- */
const APPLE_BAL = { x: 230, y: 100, r: 56 };
const MASS_BAL = { x: 200, y: 100, r: 60 };
function shapePts(sh) {
  const cx = 300, cy = 180;
  switch (sh) {
    case 'square': return [[cx - 90, cy - 90], [cx + 90, cy - 90], [cx + 90, cy + 90], [cx - 90, cy + 90]];
    case 'rectangle': return [[cx - 140, cy - 80], [cx + 140, cy - 80], [cx + 140, cy + 80], [cx - 140, cy + 80]];
    case 'triangle': return [[cx - 130, cy + 100], [cx + 150, cy + 100], [cx - 30, cy - 120]];
    default: return null;
  }
}
function centreOf(sh) {
  const P = shapePts(sh);
  if (!P) return { x: 300, y: 180 };
  return { x: P.reduce((s, p) => s + p[0], 0) / P.length, y: P.reduce((s, p) => s + p[1], 0) / P.length };
}
function drawWeight(ctx) {
  const st = S.weight;
  if (st.mode === 'apple') {
    floor(ctx);
    stand(ctx, APPLE_BAL.x, 24);
    ctx.strokeStyle = cssVar('--wire'); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(APPLE_BAL.x, 22); ctx.lineTo(APPLE_BAL.x, APPLE_BAL.y - APPLE_BAL.r - 20); ctx.stroke();
    const h = drawSpringBalance(ctx, { ...APPLE_BAL, bal: BALANCES[1], F: st.released ? 0 : APPLE_W, zero: 0, rodTravel: 50, lang: getLang() });
    const y0 = h.hookY + 30;
    const y = st.released ? Math.min(330 - 14, y0 + st.appleY) : y0;
    if (!st.released) { ctx.strokeStyle = cssVar('--thread'); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(h.hookX, h.hookY); ctx.lineTo(h.hookX, y - 18); ctx.stroke(); }
    if (st.plumb) {
      // a plumb line beside the apple to compare with its path
      const px = APPLE_BAL.x + 120;
      ctx.strokeStyle = cssVar('--thread'); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px, 24); ctx.lineTo(px, 290); ctx.stroke();
      ctx.fillStyle = '#7a7f87'; ctx.beginPath(); ctx.moveTo(px - 8, 290); ctx.lineTo(px + 8, 290); ctx.lineTo(px, 308); ctx.fill();
      txt(ctx, t('lbl.plumb'), px + 10, 200, { align: 'left', size: 11, color: cssVar('--muted') });
      if (st.released) { ctx.setLineDash([4, 4]); ctx.strokeStyle = cssVar('--accent'); ctx.beginPath(); ctx.moveTo(h.hookX, y0); ctx.lineTo(h.hookX, y); ctx.stroke(); ctx.setLineDash([]); }
    }
    apple(ctx, h.hookX, y);
    vec(ctx, h.hookX, y, 0, APPLE_W * 2 * CM, DIST, t('f.W'));
    txt(ctx, t('lbl.scaleApple'), 584, 346, { align: 'right', size: 11, weight: 600, color: cssVar('--muted') });
    return;
  }
  if (st.mode === 'cg') {
    const P = shapePts(st.shape);
    ctx.fillStyle = 'rgba(160, 180, 210, 0.55)'; ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 2;
    ctx.beginPath();
    if (P) { ctx.moveTo(...P[0]); P.slice(1).forEach((p) => ctx.lineTo(...p)); ctx.closePath(); }
    else ctx.arc(300, 180, 110, 0, 7);
    ctx.fill(); ctx.stroke();
    const G0 = centreOf(st.shape);
    if (st.cons || st.cgOk) {
      ctx.setLineDash([6, 4]); ctx.strokeStyle = cssVar('--primary'); ctx.lineWidth = 1.5; ctx.beginPath();
      if (st.shape === 'triangle') P.forEach((p, i) => { const q = P[(i + 1) % 3], r = P[(i + 2) % 3]; ctx.moveTo(...p); ctx.lineTo((q[0] + r[0]) / 2, (q[1] + r[1]) / 2); });
      else if (P) { ctx.moveTo(...P[0]); ctx.lineTo(...P[2]); ctx.moveTo(...P[1]); ctx.lineTo(...P[3]); }
      else { ctx.moveTo(190, 180); ctx.lineTo(410, 180); ctx.moveTo(300, 70); ctx.lineTo(300, 290); }
      ctx.stroke(); ctx.setLineDash([]);
    }
    if (st.tap) {
      ctx.strokeStyle = st.cgOk ? CONT : st.fb?.type === 'bad' ? '#c0392b' : cssVar('--primary'); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(st.tap.x - 9, st.tap.y); ctx.lineTo(st.tap.x + 9, st.tap.y); ctx.moveTo(st.tap.x, st.tap.y - 9); ctx.lineTo(st.tap.x, st.tap.y + 9); ctx.stroke();
    }
    if (st.cgOk || st.cons) {
      ctx.fillStyle = cssVar('--text'); ctx.beginPath(); ctx.arc(G0.x, G0.y, 4, 0, 7); ctx.fill();
      txt(ctx, 'G', G0.x - 14, G0.y - 10);
    }
    if (st.cgOk) {
      // Ex. 16 b: weight 10 N, scale 1 cm for 2 N → 5 cm
      vec(ctx, G0.x, G0.y, 0, 5 * CM, DIST, t('f.W'));
      txt(ctx, t('lbl.scaleCg'), 584, 346, { align: 'right', size: 11, weight: 600, color: cssVar('--muted') });
    }
    txt(ctx, t('lbl.tapG'), 20, 346, { align: 'left', size: 11, weight: 600, color: cssVar('--muted') });
    return;
  }
  if (st.mode === 'places') { drawPlaces(ctx, st.ex); return; }
  // marked masses on a spring balance
  const g = PLACES[st.place];
  const bal = st.place === 'jupiter' ? BAL20 : BALANCES[2];
  stand(ctx, MASS_BAL.x, 24);
  ctx.strokeStyle = cssVar('--wire'); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(MASS_BAL.x, 22); ctx.lineTo(MASS_BAL.x, MASS_BAL.y - MASS_BAL.r - 20); ctx.stroke();
  const W = st.m * g;
  const h = drawSpringBalance(ctx, { ...MASS_BAL, bal, F: W, zero: 0, rodTravel: 46, lang: getLang() });
  const bottom = massPiece(ctx, h.hookX, h.hookY - 2, st.m);
  void bottom;
  // place
  ctx.fillStyle = cssVar('--surface'); roundRect(ctx, 360, 40, 210, 90, 12); ctx.fill();
  txt(ctx, t(`pl.${st.place}`), 465, 70, { size: 16, weight: 800 });
  txt(ctx, t('lbl.massIs', { m: num(st.m, 1) }), 465, 102, { size: 13 });
}

// Ex. 15: the same body on the Earth, the Moon and Jupiter; its weight vector appears once W = m g is calculated
function drawPlaces(ctx, ex) {
  const look = { earth: ['#3b7dd8', '#5aa56a'], moon: ['#9aa0a8', '#c3c7cc'], jupiter: ['#c98a4b', '#e8c39a'] };
  ex.rows.forEach((r, i) => {
    const x0 = 20 + i * 190, cx = x0 + 90;
    ctx.fillStyle = cssVar('--surface'); roundRect(ctx, x0, 16, 180, 328, 12); ctx.fill();
    const [c1, c2] = look[r.place];
    // the ground of the planet
    ctx.fillStyle = c1; ctx.beginPath(); ctx.ellipse(cx, 250, 100, 30, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = c2; ctx.fillRect(x0 + 2, 250, 176, 92);
    txt(ctx, t(`pl.${r.place}`), cx, 36, { size: 15, weight: 800 });
    txt(ctx, `g = ${num(PLACES[r.place], dec1(PLACES[r.place]))} N/kg`, cx, 58, { size: 12, weight: 600, color: cssVar('--muted') });
    // the body
    ctx.fillStyle = '#c99a5b'; ctx.strokeStyle = '#7d5a2c'; ctx.lineWidth = 2;
    ctx.fillRect(cx - 30, 194, 60, 56); ctx.strokeRect(cx - 30, 194, 60, 56);
    txt(ctx, `${num(ex.m, 0)} kg`, cx, 208, { size: 12, halo: false });
    ctx.fillStyle = cssVar('--text'); ctx.beginPath(); ctx.arc(cx, 222, 3, 0, 7); ctx.fill();
    if (calcDone(r, 'W')) {
      const L = 20 + (PLACES[r.place] / 23.1) * 95; // longer where g is larger (not to scale)
      vec(ctx, cx, 222, 0, L, DIST, t('f.W'));
      txt(ctx, `${t('f.W')} = ${num(ex.m * PLACES[r.place], dec1(ex.m * PLACES[r.place]))} N`, cx, 130, { size: 14, color: DIST });
    } else txt(ctx, `${t('f.W')} = ?`, cx, 130, { size: 15, color: cssVar('--muted') });
  });
}

/* ---------- Activity 8, Ex. 10, 17–19: list of the forces acting on a body ---------- */
function drawList(ctx) {
  const st = S.list;
  const show = st.checked && sameSet(st.picked, LISTS[st.scene]);
  const col = (k) => (CAT[k] === 'dist' ? DIST : CONT);
  const V = (k, x, y, dx, dy) => { if (show) vec(ctx, x, y, dx, dy, col(k), t(`f.${k}`)); };
  switch (st.scene) {
    case 'table': case 'pushed': {
      floor(ctx); tableTop(ctx, 120, 480, 250); box(ctx, 300, 250);
      if (st.scene === 'pushed') { hand(ctx, 242, 220); V('F', 255, 220, 60, 0); V('f', 300, 250, -60, 0); }
      V('W', 300, 220, 0, 80); V('N', 300, 250, 0, -80);
      break;
    }
    case 'nail': case 'ball': {
      floor(ctx); support(ctx, 300, 40, 200);
      const L = st.scene === 'nail' ? 150 : 170, ang = st.scene === 'nail' ? 0.42 : 0.35;
      const x = 300 + Math.sin(ang) * L, y = 40 + Math.cos(ang) * L;
      ctx.strokeStyle = cssVar('--thread'); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(300, 40); ctx.lineTo(x, y); ctx.stroke();
      if (st.scene === 'nail') { nail(ctx, x, y); magnetBar(ctx, 470, y + 20); V('W', x, y + 20, 0, 70); V('T', x, y, -Math.sin(ang) * 75, -Math.cos(ang) * 75); V('Fm', x + 4, y + 20, 60, 0); }
      else { pith(ctx, x, y); rod(ctx, 500, y); V('W', x, y, 0, 60); V('T', x, y, -Math.sin(ang) * 70, -Math.cos(ang) * 70); V('Fe', x, y, 50, 0); }
      break;
    }
    case 'chandelier': {
      ctx.fillStyle = cssVar('--wire'); ctx.fillRect(200, 20, 200, 10);
      ctx.strokeStyle = '#8a7a50'; ctx.lineWidth = 3;
      for (let y = 34; y < 150; y += 12) { ctx.beginPath(); ctx.ellipse(300, y, 3, 6, 0, 0, 7); ctx.stroke(); }
      ctx.fillStyle = '#fff3c4'; ctx.strokeStyle = '#b39b52'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(300, 190, 40, 0, 7); ctx.fill(); ctx.stroke();
      txt(ctx, t('lbl.globe'), 360, 230, { size: 12, color: cssVar('--muted'), align: 'left' });
      V('W', 300, 190, 0, 90); V('T', 300, 150, 0, -80);
      break;
    }
    case 'skier': case 'incline': {
      const a = 0.42; // slope
      const x0 = 60, y0 = 120, x1 = 560, y1 = y0 + Math.tan(a) * (x1 - x0);
      ctx.fillStyle = st.scene === 'skier' ? '#eef4fb' : cssVar('--wood'); ctx.strokeStyle = cssVar('--muted'); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x1, 340); ctx.lineTo(x0, 340); ctx.closePath(); ctx.fill(); ctx.stroke();
      const cx = 300, cy = y0 + Math.tan(a) * (cx - x0);
      const ux = Math.cos(a), uy = Math.sin(a), nx = Math.sin(a), ny = -Math.cos(a);
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(a);
      if (st.scene === 'skier') {
        ctx.strokeStyle = '#2b3140'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-30, -2); ctx.lineTo(34, -2); ctx.stroke();
        ctx.fillStyle = '#d63b3b'; roundRect(ctx, -10, -50, 20, 46, 6); ctx.fill();
        ctx.fillStyle = cssVar('--skin'); ctx.beginPath(); ctx.arc(0, -60, 10, 0, 7); ctx.fill();
      } else {
        ctx.fillStyle = '#c99a5b'; ctx.strokeStyle = '#7d5a2c'; ctx.fillRect(-30, -44, 60, 44); ctx.strokeRect(-30, -44, 60, 44);
      }
      ctx.restore();
      if (st.scene === 'incline') {
        // the string is attached to a peg at the top of the slope
        ctx.strokeStyle = cssVar('--thread'); ctx.lineWidth = 2;
        const sx = cx - ux * 30 + nx * 22, sy = cy - uy * 30 + ny * 22;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(x0 + 30 + nx * 22, y0 + Math.tan(a) * 30 + ny * 22); ctx.stroke();
        ctx.fillStyle = cssVar('--wire'); ctx.beginPath(); ctx.arc(x0 + 30 + nx * 22, y0 + Math.tan(a) * 30 + ny * 22, 5, 0, 7); ctx.fill();
        V('T', sx, sy, -ux * 70, -uy * 70);
      } else V('f', cx, cy, -ux * 60, -uy * 60);
      const gx = cx + nx * 24, gy = cy + ny * 24;
      V('W', gx, gy, 0, 85); V('N', cx, cy, nx * 75, ny * 75);
      break;
    }
    case 'parachute': {
      ctx.fillStyle = '#eef4fb'; ctx.fillRect(16, 16, 568, 328);
      ctx.fillStyle = '#e8743b'; ctx.beginPath(); ctx.ellipse(300, 90, 110, 50, 0, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = cssVar('--thread'); ctx.lineWidth = 1.2;
      for (const dx of [-105, -50, 50, 105]) { ctx.beginPath(); ctx.moveTo(300 + dx, 90); ctx.lineTo(300, 200); ctx.stroke(); }
      ctx.fillStyle = '#2b3140'; roundRect(ctx, 290, 200, 20, 44, 6); ctx.fill();
      ctx.fillStyle = cssVar('--skin'); ctx.beginPath(); ctx.arc(300, 192, 9, 0, 7); ctx.fill();
      V('W', 300, 225, 0, 90); V('R', 300, 70, 0, -50);
      break;
    }
  }
  if (show) {
    ctx.fillStyle = DIST; ctx.fillRect(24, 22, 14, 14); txt(ctx, t('cat.dist'), 44, 29, { align: 'left', size: 12, color: DIST });
    ctx.fillStyle = CONT; ctx.fillRect(24, 44, 14, 14); txt(ctx, t('cat.cont'), 44, 51, { align: 'left', size: 12, color: CONT });
  }
}
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

/* ================================================================
   Animation (falls) and pointer
   ================================================================ */
const PX_PER_M = 400;
const loop = createLoop({
  step(dt) {
    if (!shell) return false;
    if (shell.tab === 'classify') {
      const st = S.classify, a = st.anim;
      if (!a) return false;
      if (a.fall != null) {
        a.v += G_EB9 * PX_PER_M * dt; a.y += a.v * dt;
        if (a.y >= a.fall) { a.y = a.fall; a.done = true; return false; }
      } else if (a.moving) {
        a.v += (st.push - 4) * 40 * dt; a.x += a.v * dt;
        if (a.x > 190) { a.x = 190; a.done = true; return false; }
      }
      return true;
    }
    if (shell.tab === 'weight') {
      const st = S.weight;
      if (!st.released) return false;
      st.appleV += G_EB9 * PX_PER_M * dt; st.appleY += st.appleV * dt;
      if (st.appleY > 400) return false;
      return true;
    }
    return false;
  },
  render() { draw(); },
});

let drag = null;
canvas.addEventListener('pointerdown', (ev) => {
  if (!shell) return;
  const p = view.toLogical(ev);
  const tab = shell.tab;
  if (tab === 'chars') { drag = 'hand'; moveHand(p); }
  else if (tab === 'vector') {
    const st = S.vector;
    const A = gridA(st);
    if (st.mode !== 'read' && p.x > GRID.x0 && p.y > GRID.y0 && p.y < GRID.y1) { drag = 'tip'; st.fb = null; setTip(p); }
    else if (st.mode === 'measure' && hookPos && Math.hypot(p.x - hookPos.knob.x, p.y - hookPos.knob.y) < 20) { st.zero = 0; st.fb = { type: 'good', key: 'fb.zeroDone' }; refresh(); }
    else if (st.mode === 'measure' && hookPos && Math.abs(p.x - hookPos.hookX) < 50 && p.y > hookPos.hookY - 30) { drag = 'hook'; moveHook(p); }
    void A;
  } else if (tab === 'weight' && S.weight.mode === 'cg') {
    const st = S.weight;
    if (st.cgOk) return;
    st.tap = { x: p.x, y: p.y }; st.fb = null; refresh();
  }
  if (drag) { canvas.setPointerCapture(ev.pointerId); ev.preventDefault(); }
});
canvas.addEventListener('pointermove', (ev) => {
  if (!drag) return;
  const p = view.toLogical(ev);
  if (drag === 'hand') moveHand(p);
  else if (drag === 'tip') setTip(p);
  else if (drag === 'hook') moveHook(p);
});
const endDrag = () => { drag = null; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
function moveHand(p) {
  const { O, L0 } = SPRING;
  let dx = p.x - O.x, dy = Math.max(30, p.y - O.y);
  let L = Math.hypot(dx, dy);
  const Lmin = L0, Lmax = L0 + 15 * PXCM; // elongation up to 15 cm
  const Lc = Math.max(Lmin, Math.min(Lmax, L));
  S.chars.A = { x: O.x + (dx / L) * Lc, y: O.y + (dy / L) * Lc };
  refresh();
}
function setTip(p) {
  const st = S.vector;
  const A = gridA(st);
  let x = Math.max(GRID.x0, Math.min(GRID.x1, p.x)), y = Math.max(GRID.y0, Math.min(GRID.y1, p.y));
  // snap to 1 mm
  const mm = CM / 10;
  x = A.x + Math.round((x - A.x) / mm) * mm; y = A.y + Math.round((y - A.y) / mm) * mm;
  st.tip = { x, y };
  refresh();
}
function moveHook(p) {
  const st = S.vector;
  const bal = balOf(st);
  const base = BALX.y + BALX.r + 14 + 10; // hook position at F = 0
  const F = Math.max(0, Math.min(bal.max, ((p.y - base) / 50) * bal.max));
  st.F = Math.round(F / bal.minor) * bal.minor;
  st.readOk = false; st.typed = ''; st.fb = Math.abs(st.zero) > 1e-9 && st.F > 0 ? { type: 'warn', key: 'fb.zeroFirst' } : null;
  refresh();
}

/* ================================================================
   Panels
   ================================================================ */
const controlsBody = document.getElementById('controls-body');
const measuresBody = document.getElementById('measures-body');
let ui = {};
function refresh() { updateMeasures(); requestDraw(); }
const seg = (labelKey, options, value, onChange) => createSegmented({ labelKey, options: options.map(([v, k]) => ({ value: String(v), labelKey: k })), value: String(value), onChange });
const btnRow = (...b) => el('div', { class: 'btn-row', style: 'margin-top:8px' }, b);
const hintP = (key) => el('p', { class: 'muted', style: 'margin:8px 0 0;font-size:0.88rem', dataset: { i18n: key } }, t(key));
const N_ = (v, d = 2) => qty(v, d, 'N');
const decOf = (bal) => (bal.minor < 0.1 ? 2 : 1);
function change(fn) { fn(cur()); refresh(); }

function build() {
  const tab = shell.tab;
  const st = cur();
  const items = [];
  graphCard.hidden = !(tab === 'weight' && st.mode === 'masses');
  if (tab === 'chars') {
    items.push(seg('ctl.pos', [['A1', 'pos.A1'], ['A2', 'pos.A2']], '', (v) => change((s) => {
      const L = SPRING.L0 + 8 * PXCM; // the same effort: elongation 8 cm → 2 N
      const a = v === 'A1' ? 0 : 0.6;
      s.A = { x: SPRING.O.x + Math.sin(a) * L, y: SPRING.O.y + Math.cos(a) * L };
    })).root);
    ui.line = seg('ctl.line', [['yes', 'ctl.yes'], ['no', 'ctl.no']], st.line ? 'yes' : 'no', (v) => change((s) => { s.line = v === 'yes'; }));
    ui.vec = seg('ctl.vec', [['yes', 'ctl.yes'], ['no', 'ctl.no']], st.vec ? 'yes' : 'no', (v) => change((s) => { s.vec = v === 'yes'; }));
    items.push(ui.line.root, ui.vec.root, hintP('hint.chars'));
  } else if (tab === 'vector') {
    ui.mode = seg('ctl.mode', [['measure', 'mode.measure'], ['read', 'mode.read'], ['draw', 'mode.draw']], st.mode, (v) => {
      const s = cur(); s.mode = v; s.tip = null; s.fb = null; s.typed = '';
      if (v === 'read') s.readF = newReadF(balOf(s));
      buildTab();
    });
    items.push(ui.mode.root);
    if (st.mode !== 'draw') {
      ui.bal = seg('ctl.bal', [[0, 'bal.2'], [1, 'bal.5'], [2, 'bal.10']], st.bi, (v) => change((s) => {
        s.bi = Number(v); s.F = 0; s.zero = s.mode === 'measure' ? newZero(balOf(s)) : 0; s.readOk = false; s.typed = ''; s.tip = null;
        if (s.mode === 'read') s.readF = newReadF(balOf(s));
        s.scale = [0.5, 1, 2][s.bi]; s.fb = null; buildTab();
      }));
      items.push(ui.bal.root);
    }
    if (st.mode !== 'draw') {
      ui.read = el('input', { class: 'text-input', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '?', value: st.typed });
      ui.read.addEventListener('input', () => { cur().typed = ui.read.value; });
      const checkRead = () => change((s) => {
        const bal = balOf(s);
        const v = parseNum(s.typed);
        if (!Number.isFinite(v)) { s.fb = { type: 'warn', key: 'fb.typeNumber' }; return; }
        const F = s.mode === 'read' ? s.readF : s.F;
        if (s.mode === 'measure' && Math.abs(s.zero) > 1e-9) { s.fb = { type: 'warn', key: 'fb.zeroFirst' }; return; }
        if (s.mode === 'measure' && F <= 0) { s.fb = { type: 'warn', key: 'fb.pullFirst' }; return; }
        const ok = Math.abs(v - F) <= bal.minor / 2 + 1e-9;
        if (s.mode === 'read') { s.tries += 1; if (ok) s.score += 1; }
        s.readOk = ok;
        s.fb = ok ? { type: 'good', key: s.mode === 'read' ? 'fb.readOkP' : 'fb.readOk', params: { v: num(F, decOf(bal)), s: s.score, n: s.tries } } : { type: 'bad', key: s.mode === 'read' ? 'fb.readBadP' : 'fb.readBad', params: { v: num(F, decOf(bal)), s: s.score, n: s.tries } };
      });
      ui.read.addEventListener('keydown', (e) => { if (e.key === 'Enter') checkRead(); });
      items.push(el('div', { class: 'ctl' }, [
        el('div', { class: 'ctl-head' }, el('span', { class: 'ctl-label', dataset: { i18n: 'ctl.reading' } }, t('ctl.reading'))),
        el('div', { class: 'btn-row' }, [ui.read, el('span', { style: 'align-self:center' }, 'N'), createButton({ labelKey: 'ctl.check', variant: 'primary', onClick: checkRead })]),
      ]));
      if (st.mode === 'read') items.push(btnRow(createButton({ labelKey: 'ctl.another', onClick: () => change((s) => { s.readF = newReadF(balOf(s)); s.typed = ''; ui.read.value = ''; s.fb = null; }) })));
    }
    if (st.mode === 'measure') {
      ui.scale = seg('ctl.scale', [[0.5, 'sc.0.5'], [1, 'sc.1'], [2, 'sc.2']], st.scale, (v) => change((s) => { s.scale = Number(v); s.fb = null; }));
      items.push(ui.scale.root, hintP('hint.measure'));
    }
    if (st.mode === 'draw') {
      ui.taskP = el('p', { style: 'margin:6px 0;font-weight:600' }, '');
      items.push(ui.taskP, hintP('hint.draw'), btnRow(
        createButton({ labelKey: 'ctl.check', variant: 'primary', onClick: () => change(checkVector) }),
        createButton({ labelKey: 'ctl.nextTask', onClick: () => change((s) => { s.task = (s.task + 1) % TASKS.length; s.tip = null; s.fb = null; }) })));
    } else if (st.mode === 'measure') {
      items.push(btnRow(createButton({ labelKey: 'ctl.checkVec', variant: 'primary', onClick: () => change(checkVector) })));
    }
  } else if (tab === 'classify') {
    ui.scene = seg('ctl.scene', Object.keys(SCENES).map((k) => [k, `sc.${k}`]), st.scene, (v) => { const s = cur(); s.scene = v; s.act = false; s.anim = null; s.push = 0; s.ans = ''; s.fb = null; loop.stop(); buildTab(); });
    items.push(ui.scene.root);
    if (st.scene === 'friction') {
      ui.push = createSlider({ labelKey: 'ctl.push', min: 0, max: 8, step: 0.5, value: st.push, unit: 'N', decimals: 1, onInput: (v) => change((s) => {
        s.push = v;
        if (v > 6 && !(s.anim && s.anim.moving)) { s.anim = { x: 0, v: 0, moving: true }; loop.start(); }
      }) });
      items.push(ui.push.root, btnRow(createButton({ labelKey: 'ui.reset', variant: 'ghost', onClick: () => { const s = cur(); s.push = 0; s.anim = null; loop.stop(); buildTab(); } })));
    } else {
      items.push(btnRow(createButton({ labelKey: `act.btn.${st.scene}`, variant: 'primary', onClick: () => change(doAction) }),
        createButton({ labelKey: 'ui.reset', variant: 'ghost', onClick: () => { const s = cur(); s.act = false; s.anim = null; loop.stop(); refresh(); } })));
    }
    ui.show = seg('ctl.showF', [['yes', 'ctl.yes'], ['no', 'ctl.no']], st.show ? 'yes' : 'no', (v) => change((s) => { s.show = v === 'yes'; }));
    ui.ans = seg('ctl.category', [['cont', 'cat.cont'], ['dist', 'cat.dist']], st.ans, (v) => change((s) => { s.ans = v; s.fb = null; }));
    items.push(ui.show.root, ui.ans.root, btnRow(createButton({ labelKey: 'ctl.check', variant: 'primary', onClick: () => change((s) => {
      if (!s.ans) { s.fb = { type: 'warn', key: 'fb.chooseCat' }; return; }
      const ok = s.ans === SCENES[s.scene].cat;
      if (ok && !s.solved.includes(s.scene)) s.solved.push(s.scene);
      s.fb = ok ? { type: 'good', key: `fb.cat.${s.scene}` } : { type: 'bad', key: 'fb.catBad' };
    }) })));
  } else if (tab === 'weight') {
    ui.mode = seg('ctl.mode', [['apple', 'mode.apple'], ['cg', 'mode.cg'], ['masses', 'mode.masses'], ['places', 'mode.places']], st.mode, (v) => { const s = cur(); s.mode = v; s.fb = null; s.released = false; s.appleY = 0; s.appleV = 0; buildTab(); });
    items.push(ui.mode.root);
    if (st.mode === 'apple') {
      items.push(btnRow(createButton({ labelKey: 'ctl.release', variant: 'primary', onClick: () => { const s = cur(); if (s.released) return; s.released = true; s.appleY = 0; s.appleV = 0; loop.start(); refresh(); } }),
        createButton({ labelKey: 'ui.reset', variant: 'ghost', onClick: () => { const s = cur(); s.released = false; s.appleY = 0; s.appleV = 0; loop.stop(); refresh(); } })));
      ui.plumb = seg('ctl.plumb', [['yes', 'ctl.yes'], ['no', 'ctl.no']], st.plumb ? 'yes' : 'no', (v) => change((s) => { s.plumb = v === 'yes'; }));
      items.push(ui.plumb.root);
    } else if (st.mode === 'cg') {
      ui.shape = seg('ctl.shape', SHAPES.map((k) => [k, `sh.${k}`]), st.shape, (v) => change((s) => { s.shape = v; s.tap = null; s.cgOk = false; s.cons = false; s.fb = null; }));
      ui.cons = seg('ctl.cons', [['yes', 'ctl.yes'], ['no', 'ctl.no']], st.cons ? 'yes' : 'no', (v) => change((s) => { s.cons = v === 'yes'; }));
      items.push(ui.shape.root, ui.cons.root, btnRow(createButton({ labelKey: 'ctl.check', variant: 'primary', onClick: () => change((s) => {
        if (!s.tap) { s.fb = { type: 'warn', key: 'fb.tapFirst' }; return; }
        const G0 = centreOf(s.shape);
        s.cgOk = Math.hypot(s.tap.x - G0.x, s.tap.y - G0.y) <= 10;
        s.fb = s.cgOk ? { type: 'good', key: `fb.cg.${s.shape}` } : { type: 'bad', key: 'fb.cgBad' };
      }) })));
    } else if (st.mode === 'places') {
      ui.body = seg('ctl.body15', [...EX15.map((m) => [m, `b.${m}`]), ['free', 'b.free']], st.ex.preset, (v) => {
        const s = cur(); s.ex = v === 'free' ? newEx15(s.ex.m, 'free') : newEx15(Number(v)); s.fb = null; buildTab();
      });
      items.push(ui.body.root);
      if (st.ex.preset === 'free') items.push(createSlider({ labelKey: 'ctl.mfree', min: 1, max: 500, step: 1, value: st.ex.m, unit: 'kg', decimals: 0, onInput: (v) => change((s) => { s.ex = newEx15(v, 'free'); s.fb = null; }) }).root);
      items.push(hintP('hint.places'));
    } else {
      ui.place = seg('ctl.place', Object.keys(PLACES).map((k) => [k, `pl.${k}`]), st.place, (v) => change((s) => { s.place = v; s.fb = null; }));
      ui.mass = seg('ctl.mass', MASSES.map((m) => [m, `m.${m}`]), st.m, (v) => change((s) => { s.m = Number(v); s.fb = null; }));
      items.push(ui.place.root, ui.mass.root, btnRow(createButton({ labelKey: 'ctl.record', variant: 'primary', onClick: () => change((s) => {
        const W = Math.round(s.m * PLACES[s.place] * 100) / 100;
        if (s.rows.some((r) => r.m === s.m && r.place === s.place)) { s.fb = { type: 'warn', key: 'fb.already' }; return; }
        s.rows.push({ place: s.place, m: s.m, W });
        s.fb = { type: 'good', key: 'fb.recorded' };
      }) })));
    }
  } else {
    ui.scene = seg('ctl.body', Object.keys(LISTS).map((k) => [k, `li.${k}`]), st.scene, (v) => { const s = cur(); s.scene = v; s.picked = []; s.checked = false; s.fb = null; buildTab(); });
    const chips = el('div', { class: 'chips', style: 'grid-template-columns:repeat(auto-fill,minmax(130px,1fr))' });
    ui.chips = CANDIDATES.map((k) => {
      const b = el('button', { type: 'button', class: 'chip', 'aria-pressed': String(st.picked.includes(k)) }, t(`cand.${k}`));
      b.addEventListener('click', () => change((s) => {
        s.picked = s.picked.includes(k) ? s.picked.filter((x) => x !== k) : s.picked.concat(k);
        s.checked = false; s.fb = null;
      }));
      chips.append(b);
      return [k, b];
    });
    items.push(ui.scene.root, el('div', { class: 'ctl' }, [el('div', { class: 'ctl-head' }, el('span', { class: 'ctl-label', dataset: { i18n: 'ctl.forces' } }, t('ctl.forces'))), chips]),
      btnRow(createButton({ labelKey: 'ctl.check', variant: 'primary', onClick: () => change((s) => {
        const want = LISTS[s.scene];
        s.checked = true;
        const missing = want.filter((k) => !s.picked.includes(k)).length, extra = s.picked.filter((k) => !want.includes(k)).length;
        if (!missing && !extra) { if (!s.solved.includes(s.scene)) s.solved.push(s.scene); s.fb = { type: 'good', key: `fb.list.${s.scene}` }; }
        else s.fb = { type: 'bad', key: 'fb.listBad', params: { m: missing, e: extra } };
      }) })), hintP('hint.list'));
  }
  controlsBody.append(...items);
  ui.dl = el('dl', { class: 'meas' });
  ui.status = el('div', { class: 'status', hidden: '' });
  ui.table = el('table', { class: 'data' });
  ui.tableWrap = el('div', { class: 'table-scroll' }, ui.table);
  ui.clear = el('div', { class: 'btn-row', style: 'margin-top:8px' }, [createButton({ labelKey: 'ctl.clearTable', variant: 'ghost', onClick: () => change((s) => { s.rows = []; s.fb = null; }) })]);
  measuresBody.append(ui.dl, ui.tableWrap, ui.clear, ui.status);
  tableSig = '';
}
function doAction(s) {
  if (s.act) return;
  s.act = true;
  if (s.scene === 'gravity') { s.anim = { y: 0, v: 0, fall: 330 - 14 - 100 }; loop.start(); }
  else if (s.scene === 'normal') { s.anim = { y: 0, v: 0, fall: 80 }; loop.start(); }
  else if (s.scene === 'tension') { s.anim = { y: 0, v: 0, fall: 330 - 46 - 190 - 18 }; loop.start(); }
}
function checkVector(s) {
  const m = tipMeasure(s);
  if (!m || m.L < 0.1) { s.fb = { type: 'warn', key: 'fb.drawFirst' }; return; }
  let F, ang, scale;
  if (s.mode === 'draw') { ({ F, scale } = TASKS[s.task]); ang = angOf(TASKS[s.task]); }
  else {
    if (s.F <= 0 || !s.readOk) { s.fb = { type: 'warn', key: 'fb.readFirst' }; return; }
    F = s.F; ang = -90; scale = s.scale;
  }
  const L = F / scale;
  const dAng = Math.abs(((m.ang - ang + 540) % 360) - 180);
  const okL = Math.abs(m.L - L) <= 0.15, okA = dAng <= 4;
  if (s.mode === 'draw') { s.tries += 1; if (okL && okA) s.score += 1; }
  s.fb = okL && okA ? { type: 'good', key: 'fb.vecOk', params: { L: num(L, 1) } }
    : { type: 'bad', key: !okA ? 'fb.vecDir' : 'fb.vecLen', params: { L: num(L, 2) } };
}

let tableSig = '';
function updateMeasures() {
  if (!shell || !ui.dl) return;
  const tab = shell.tab;
  const st = cur();
  const rows = [];
  ui.tableWrap.hidden = true; ui.clear.hidden = true;
  if (tab === 'chars') {
    const c = charsState();
    const dirKey = Math.abs(c.ang) < 1 ? 'dir.down' : c.ang > 0 ? 'dir.downRight' : 'dir.downLeft';
    rows.push([t('m.point'), 'A'], [t('m.line'), t('m.lineVal', { a: num(Math.abs(c.ang), 0) })], [t('m.dir'), t(dirKey)],
      [t('m.elong'), qty(c.x, 1, 'cm')], [t('m.mag'), N_(c.F, 2)]);
  } else if (tab === 'vector') {
    ui.mode.set(st.mode);
    const bal = balOf(st);
    if (st.mode !== 'draw') {
      ui.bal.set(String(st.bi));
      rows.push([t('m.range'), `0 – ${N_(bal.max, 0)}`], [t('m.div'), N_(bal.minor, bal.minor < 0.1 ? 2 : 1)]);
      if (st.mode === 'measure') rows.push([t('m.zero'), Math.abs(st.zero) < 1e-9 ? t('zero.ok') : t('zero.no')]);
      if (st.mode === 'read') rows.push([t('m.score'), `${st.score} / ${st.tries}`]);
    }
    if (st.mode === 'measure') ui.scale.set(String(st.scale));
    if (st.mode === 'draw') {
      const tk = TASKS[st.task];
      ui.taskP.textContent = `${st.task + 1}/${TASKS.length} — ${t(`task.${tk.id}`)}`;
      rows.push([t('m.score'), `${st.score} / ${st.tries}`]);
    }
    if (st.mode !== 'read') {
      const m = tipMeasure(st);
      rows.push([t('m.vecLen'), m ? qty(m.L, 1, 'cm') : '—'], [t('m.vecAng'), m && m.L > 0.05 ? `${num(m.ang, 0)}°` : '—']);
    }
  } else if (tab === 'classify') {
    ui.scene.set(st.scene); ui.show.set(st.show ? 'yes' : 'no'); ui.ans.set(st.ans);
    const sc = SCENES[st.scene];
    rows.push([t('m.force'), t(`f.${sc.force}`)], [t('m.exerts'), t(`by.${st.scene}`)], [t('m.on'), t(`on.${st.scene}`)]);
    if (st.scene === 'friction') {
      const moving = st.anim && st.anim.moving;
      rows.push([t('m.push'), N_(st.push, 1)], [t('m.fric'), N_(moving ? 4 : Math.min(st.push, 6), 1)]);
    }
    rows.push([t('m.solved'), `${st.solved.length} / ${Object.keys(SCENES).length}`]);
  } else if (tab === 'weight') {
    ui.mode.set(st.mode);
    if (st.mode === 'apple') rows.push([t('m.reading'), st.released ? N_(0, 1) : N_(APPLE_W, 1)], [t('m.wDir'), t('dir.vDown')]);
    else if (st.mode === 'cg') rows.push([t('m.shape'), t(`sh.${st.shape}`)], [t('m.cg'), st.cgOk ? t(`cg.${st.shape}`) : '—']);
    else if (st.mode === 'places') {
      const ex = st.ex;
      rows.push([t('m.sameMass'), qty(ex.m, 0, 'kg')]);
      const sig = calcSig(ex.rows) + ex.m + getLang();
      if (sig !== tableSig) {
        tableSig = sig;
        const th = (k) => el('th', {}, t(k));
        ui.table.replaceChildren(
          el('thead', {}, el('tr', {}, [th('col.place'), th('col.m'), th('col.g'), th('col.Wcalc')])),
          el('tbody', {}, ex.rows.map((r) => el('tr', {}, [
            el('td', {}, t(`pl.${r.place}`)), el('td', {}, num(ex.m, 0)), el("td", {}, num(PLACES[r.place], dec1(PLACES[r.place]))),
            calcCell(r, 'W', { expected: ex.m * PLACES[r.place], decimals: dec1(ex.m * PLACES[r.place]), onCheck: (res) => {
              st.fb = res === 'invalid' ? { type: 'warn', key: 'fb.typeNumber' } : res === 'wrong' ? { type: 'bad', key: 'fb.wBad' } : { type: 'good', key: 'fb.wOk', params: { w: num(ex.m * PLACES[r.place], dec1(ex.m * PLACES[r.place])), p: t(`pl.${r.place}`) } };
              refresh();
            } }),
          ]))));
      }
      ui.tableWrap.hidden = false;
    }
    else {
      ui.place.set(st.place); ui.mass.set(String(st.m));
      const bal = st.place === 'jupiter' ? BAL20 : BALANCES[2];
      rows.push([t('m.mass'), qty(st.m, 1, 'kg')], [t('m.reading'), N_(st.m * PLACES[st.place], 2)], [t('m.range'), `0 – ${N_(bal.max, 0)}`]);
      const sig = calcSig(st.rows) + st.rows.length + getLang();
      if (sig !== tableSig) {
        tableSig = sig;
        const th = (k) => el('th', {}, t(k));
        ui.table.replaceChildren(
          el('thead', {}, el('tr', {}, [th('col.place'), th('col.m'), th('col.W'), th('col.ratio')])),
          el('tbody', {}, st.rows.map((r) => el('tr', {}, [
            el('td', {}, t(`pl.${r.place}`)), el('td', {}, num(r.m, 1)), el('td', {}, num(r.W, 2)),
            calcCell(r, 'ratio', { expected: r.W / r.m, decimals: 1, onCheck: (res) => {
              st.fb = res === 'invalid' ? { type: 'warn', key: 'fb.typeNumber' } : res === 'wrong' ? { type: 'bad', key: 'fb.ratioBad' } : { type: 'good', key: 'fb.ratioOk', params: { g: num(PLACES[r.place], 1), p: t(`pl.${r.place}`) } };
              refresh();
            } }),
          ]))));
      }
      ui.tableWrap.hidden = !st.rows.length; ui.clear.hidden = !st.rows.length;
      // graph of the weight W as a function of the mass m, one line per place once a ratio is checked
      const colors = { earth: cssVar('--accent'), moon: '#7f8c9a', jupiter: '#c0792b' };
      const series = Object.keys(PLACES).filter((p) => st.rows.some((r) => r.place === p)).map((p) => {
        const rs = st.rows.filter((r) => r.place === p);
        return { color: colors[p], points: rs.map((r) => [r.m, r.W]), slope: rs.some((r) => calcDone(r, 'ratio')) ? PLACES[p] : undefined };
      });
      const yMax = st.rows.some((r) => r.place === 'jupiter') ? 15 : 7;
      graph.draw({ xLabel: t('graph.x'), yLabel: t('graph.y'), xMax: 0.7, yMax, series });
      graphHint.hidden = st.rows.length >= 2;
    }
  } else {
    ui.scene.set(st.scene);
    ui.chips.forEach(([k, b]) => b.setAttribute('aria-pressed', String(st.picked.includes(k))));
    rows.push([t('m.body'), t(`li.${st.scene}`)], [t('m.picked'), st.picked.length ? st.picked.map((k) => t(`f.${k}`)).join(', ') : '—'],
      [t('m.solved'), `${st.solved.length} / ${Object.keys(LISTS).length}`]);
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
  if ((shell.tab === 'classify' && st.anim && !st.anim.done) || (shell.tab === 'weight' && st.released)) loop.start();
}
onLangChange(() => { if (shell) buildTab(); });

shell = initSim({
  strings,
  tabs: TABS.map((id) => ({ id, labelKey: `tab.${id}` })),
  initialTab: 'chars',
  onTab: buildTab,
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, cur: () => cur(), charsState };
