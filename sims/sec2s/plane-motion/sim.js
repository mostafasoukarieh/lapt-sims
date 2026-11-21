// Sec 2 S — Chapter 7: motion of a particle in a plane (frames, r v a, displacement, aT and aN, circular motion).
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num, qty } from '../../../shared/format.js';
import { createButton, createSegmented, createSlider, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, font, arrow } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { label, person } from '../../../shared/figures.js';
import { calcCell, calcSig, calcDone } from '../../../shared/calc-cell.js';

const TAU = 2 * Math.PI;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const DEG = Math.PI / 180;
const hyp = Math.hypot;
const relTol = (x, r = 0.01, min = 0.01) => Math.max(Math.abs(x) * r, min);

/* ================================================================
   Model
   ================================================================ */
// position / velocity / acceleration of the motions of the book (SI)
const MOTIONS = {
  parab: { tmax: 2, r: (t) => [t, t * t + 1], v: (t) => [1, 2 * t], a: () => [0, 2], box: [-0.6, -0.2, 2.6, 5.4], kv: 0.5, ka: 0.4, grid: 1, eq: 'x = t ; y = t² + 1', traj: 'y = x² + 1' },
  circle: { tmax: Math.PI, r: (t) => [Math.cos(2 * t), Math.sin(2 * t)], v: (t) => [-2 * Math.sin(2 * t), 2 * Math.cos(2 * t)], a: (t) => [-4 * Math.cos(2 * t), -4 * Math.sin(2 * t)], box: [-1.7, -1.7, 1.7, 1.7], kv: 0.25, ka: 0.15, grid: 0.5, eq: 'x = cos 2t ; y = sin 2t', traj: 'x² + y² = 1' },
  line: { tmax: 1.2, r: (t) => [3 * t * t, 0], v: (t) => [6 * t, 0], a: () => [6, 0], box: [-0.4, -1.3, 4.6, 1.3], kv: 0.12, ka: 0.12, grid: 1, eq: 'x = 3t² ; y = 0', traj: 'y = 0 (x ≥ 0)' },
};
// Exercise 13 (same motion as "parab"): tangential and normal accelerations, radius of curvature
const ex13 = (t) => { const s = Math.sqrt(1 + 4 * t * t); return { v: s, aT: (4 * t) / s, aN: 2 / s, R: (s * s * s) / 2 }; };
// circular laws (cm, s)
const LAWS = {
  ex5: { R: 8, tmax: 4, s: (t) => 2 * t * t, v: (t) => 4 * t, aT: () => 4 },
  s1: { R: 10, tmax: 30, s: (t) => t, v: () => 1, aT: () => 0 },
  s2: { R: 10, tmax: 3, s: (t) => 3 * t * t, v: (t) => 6 * t, aT: () => 6 },
  s3: { R: 10, tmax: 2.5, s: (t) => 2 * t ** 3, v: (t) => 6 * t * t, aT: (t) => 12 * t },
};
// recording of Exercise 16 (values chosen): R = 7.0 cm, τ = 40 ms, 10° between two dots, 22 dots, clockwise
const REC = { R: 7, tau: 0.04, step: 10, n: 22, a1: 236 };
const recAng = (i) => (REC.a1 - REC.step * (i - 1)) * DEG; // i = 1 … 22
const recPt = (i) => [REC.R * Math.cos(recAng(i)), REC.R * Math.sin(recAng(i))]; // cm
const chordCm = (i) => Math.round(hyp(recPt(i + 1)[0] - recPt(i - 1)[0], recPt(i + 1)[1] - recPt(i - 1)[1]) * 100) / 100; // to 0.1 mm
const recV = (i) => { const p = recPt(i - 1), q = recPt(i + 1); return [(q[0] - p[0]) / 100 / (2 * REC.tau), (q[1] - p[1]) / 100 / (2 * REC.tau)]; }; // m/s
const recA = (i) => { const p = recV(i - 1), q = recV(i + 1); return [(q[0] - p[0]) / (2 * REC.tau), (q[1] - p[1]) / (2 * REC.tau)]; }; // m/s²
const LAW_SHORT = { ex5: 's = 2t²', s1: 's₁ = t', s2: 's₂ = 3t²', s3: 's₃ = 2t³' };
const V_OTHER = 25;
const R_ROUND = 20;
const V0_STRAIGHT = 5;

let now = 0;
function initialState(tab) {
  switch (tab) {
    case 'frames': return { view: 'road', frame: 'ground', v: 20, time: 0, P: [1.5, 0.25], rows: [], fb: null };
    case 'vectors': return { mo: 'parab', t: 1, play: false, show: { r: true, v: true, a: true }, rows: [], fb: null };
    case 'displacement': return { R: 20, th: 180, go: false, rows: [], fb: null };
    case 'tna': return { c: 'curve', aT: 2, vr: 10, t: 0, play: false, circ: true, rows: [], fb: null };
    default: return { view: 'law', law: 'ex5', t: 1, play: false, i: 4, sv: true, sa: false, rows: [], rrows: [], fb: null };
  }
}
const TABS = ['frames', 'vectors', 'displacement', 'tna', 'circular'];
let S = Object.fromEntries(TABS.map((k) => [k, initialState(k)]));

/* ================================================================
   Canvas and loop
   ================================================================ */
const HEIGHTS = { frames: 340, vectors: 400, displacement: 380, tna: 400, circular: 420 };
let shell;
let drawQueued = false;
const canvas = document.getElementById('stage');
canvas.style.touchAction = 'none';
const view = setupCanvas(canvas, { width: 600, height: 340, maxHeightVh: () => (window.innerWidth < 880 ? 50 : 74), onResize: () => requestDraw() });
function requestDraw() { if (drawQueued) return; drawQueued = true; requestAnimationFrame(() => { drawQueued = false; draw(); }); }
onThemeChange(() => requestDraw());

const loop = createLoop({
  step(dt) {
    now += dt;
    if (!shell) return false;
    const st = S[shell.tab];
    switch (shell.tab) {
      case 'frames': if (st.view === 'road') st.time += dt; break;
      case 'vectors': if (st.play) { st.t += dt * (st.mo === 'circle' ? 0.5 : 0.5); if (st.t >= MOTIONS[st.mo].tmax) { st.t = MOTIONS[st.mo].tmax; st.play = false; syncPlay(); } ui.t?.set(st.t); } break;
      case 'displacement': if (st.go) { st.th += 60 * dt; if (st.th >= 360) { st.th = 360; st.go = false; } ui.th?.set(Math.round(st.th)); } break;
      case 'tna': st.time = (st.time || 0) + dt; if (st.c === 'curve' && st.play) { st.t += dt * 0.4; if (st.t >= 2) { st.t = 2; st.play = false; syncPlay(); } ui.t?.set(st.t); } break;
      case 'circular': if (st.view === 'law' && st.play) { const L = LAWS[st.law]; st.t += dt; if (st.t >= L.tmax) { st.t = L.tmax; st.play = false; syncPlay(); } ui.t?.set(st.t); } break;
    }
    return true;
  },
  render() { draw(); updateMeasures(); },
});

/* ================================================================
   Drawing helpers
   ================================================================ */
function draw() {
  if (!shell) return;
  const tab = shell.tab;
  if (view.height !== HEIGHTS[tab]) view.setLogicalSize(600, HEIGHTS[tab]);
  const ctx = view.begin();
  ctx.fillStyle = cssVar('--scene-bg');
  roundRect(ctx, 0, 0, 600, HEIGHTS[tab], 14);
  ctx.fill();
  ({ frames: drawFrames, vectors: drawVectors, displacement: drawDisplacement, tna: drawTna, circular: drawCircular })[tab](ctx, S[tab]);
}
function note(ctx, s, x, y, align = 'center', size = 11, color = cssVar('--muted'), weight = 700) { label(ctx, s, x, y, { size, weight, color, align, halo: color !== '#fff' }); }
const COL = { r: () => cssVar('--muted'), v: () => '#1f6fd1', a: () => '#d6342c', aT: () => '#2e8b57', aN: () => '#b0469c' };
// vector from (x, y) by (dx, dy) in px, with its name near the tip
function vec(ctx, x, y, dx, dy, color, name, width = 2.6) {
  if (hyp(dx, dy) < 2) return;
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width;
  arrow(ctx, x, y, x + dx, y + dy, 9);
  if (name) {
    const L = hyp(dx, dy), ox = (dx / L) * 12, oy = (dy / L) * 12;
    note(ctx, name, x + dx + ox, y + dy + oy, 'center', 13, color, 800);
  }
}
// world box → screen box with equal scales; y of the world points up
function frameOf([x1, y1, x2, y2], bx, by, bw, bh) {
  const k = Math.min(bw / (x2 - x1), bh / (y2 - y1));
  const ox = bx + (bw - (x2 - x1) * k) / 2, oy = by + (bh - (y2 - y1) * k) / 2;
  return { k, X: (x) => ox + (x - x1) * k, Y: (y) => oy + (y2 - y) * k, x1, y1, x2, y2 };
}
function axes(ctx, f, grid, { names = ['x', 'y'], origin = 'O', unitVec = true } = {}) {
  ctx.strokeStyle = cssVar('--border'); ctx.lineWidth = 1;
  ctx.fillStyle = cssVar('--muted'); ctx.font = font(10, 600);
  for (let x = Math.ceil(f.x1 / grid) * grid; x <= f.x2 + 1e-9; x += grid) {
    ctx.beginPath(); ctx.moveTo(f.X(x), f.Y(f.y1)); ctx.lineTo(f.X(x), f.Y(f.y2)); ctx.stroke();
    if (Math.abs(x) > 1e-9) { ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(num(x, grid < 1 ? 1 : 0), f.X(x), f.Y(0) + 3); }
  }
  for (let y = Math.ceil(f.y1 / grid) * grid; y <= f.y2 + 1e-9; y += grid) {
    ctx.beginPath(); ctx.moveTo(f.X(f.x1), f.Y(y)); ctx.lineTo(f.X(f.x2), f.Y(y)); ctx.stroke();
    if (Math.abs(y) > 1e-9) { ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(num(y, grid < 1 ? 1 : 0), f.X(0) - 4, f.Y(y)); }
  }
  ctx.strokeStyle = cssVar('--text'); ctx.fillStyle = cssVar('--text'); ctx.lineWidth = 1.4;
  arrow(ctx, f.X(f.x1), f.Y(0), f.X(f.x2), f.Y(0), 7);
  arrow(ctx, f.X(0), f.Y(f.y1), f.X(0), f.Y(f.y2), 7);
  note(ctx, names[0], f.X(f.x2) - 6, f.Y(0) - 10, 'right', 12, cssVar('--text'));
  note(ctx, names[1], f.X(0) + 10, f.Y(f.y2) + 6, 'left', 12, cssVar('--text'));
  note(ctx, origin, f.X(0) - 8, f.Y(0) + 10, 'right', 12, cssVar('--text'));
  if (unitVec) {
    ctx.strokeStyle = '#e07b00'; ctx.fillStyle = '#e07b00'; ctx.lineWidth = 2.4;
    arrow(ctx, f.X(0), f.Y(0), f.X(0) + 26, f.Y(0), 7); arrow(ctx, f.X(0), f.Y(0), f.X(0), f.Y(0) - 26, 7);
    note(ctx, 'i', f.X(0) + 16, f.Y(0) + 10, 'center', 12, '#e07b00', 800);
    note(ctx, 'j', f.X(0) - 9, f.Y(0) - 18, 'center', 12, '#e07b00', 800);
  }
}
function drawCar(ctx, x, y, { color = '#3a7bd5', ang = 0, size = 1 } = {}) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(size, size);
  ctx.fillStyle = color;
  roundRect(ctx, -22, -9, 44, 18, 6); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.75)'; roundRect(ctx, 2, -7, 10, 14, 3); ctx.fill();
  ctx.fillStyle = '#222'; for (const [wx, wy] of [[-13, -10], [13, -10], [-13, 10], [13, 10]]) { ctx.fillRect(wx - 5, wy - 2, 10, 4); }
  ctx.restore();
}
function drawTree(ctx, x, yGround) {
  ctx.fillStyle = '#7a5532'; ctx.fillRect(x - 3, yGround - 26, 6, 26);
  ctx.fillStyle = '#3f8f3a'; ctx.beginPath(); ctx.arc(x, yGround - 34, 15, 0, TAU); ctx.fill();
}

/* ---------- frames ---------- */
const ROAD = { y: 190, k: 6 }; // px per metre
const wrap = (x, a, b) => a + ((((x - a) % (b - a)) + (b - a)) % (b - a));
function drawFrames(ctx, st) { if (st.view === 'road') drawRoad(ctx, st); else drawTable(ctx, st); }
function drawRoad(ctx, st) {
  const { y, k } = ROAD, T = st.time;
  ctx.fillStyle = cssVar('--sky'); ctx.fillRect(0, 0, 600, y - 40);
  ctx.fillStyle = 'rgba(120,170,90,0.35)'; ctx.fillRect(0, y - 40, 600, 22);
  ctx.fillStyle = '#9aa0a8'; ctx.fillRect(0, y - 18, 600, 10); // pavement
  ctx.fillStyle = '#6b6f76'; ctx.fillRect(0, y - 8, 600, 74);
  const carX = st.v * T; // true position of the car (m)
  const ref = st.frame === 'car' ? carX : 0; // the screen follows the frame of reference
  const sx = (xm) => 300 + (xm - ref) * k;
  // road marks and trees fixed to the ground
  ctx.strokeStyle = '#f2f2f2'; ctx.lineWidth = 2; ctx.setLineDash([]);
  for (let m = Math.floor((ref - 60) / 8) * 8; m < ref + 60; m += 8) { ctx.beginPath(); ctx.moveTo(sx(m), y + 29); ctx.lineTo(sx(m + 4), y + 29); ctx.stroke(); }
  for (let m = Math.floor((ref - 60) / 15) * 15; m < ref + 60; m += 15) drawTree(ctx, sx(m), y - 20);
  // observer on the pavement at x = 0 (fixed to the ground); in the car frame he passes by again and again
  const obsX = st.frame === 'car' ? wrap(0 - ref, -55, 55) + ref : 0;
  person(ctx, sx(obsX) + 0, y - 10, { color: cssVar('--primary'), h: 36 });
  note(ctx, t('pavement'), sx(obsX) + 14, y - 52, 'left', 10, cssVar('--text'));
  // the car: in the ground frame it crosses the screen again and again
  const carS = st.frame === 'car' ? 300 : sx(wrap(carX, -52, 52));
  drawCar(ctx, carS, y + 12, { color: '#3a7bd5' });
  note(ctx, t('driver'), carS, y + 33, 'center', 10, '#fff');
  // the other car at 25 m/s in the other lane
  const oX = V_OTHER * T + 20;
  const oS = st.frame === 'car' ? 300 + wrap((oX - carX), -52, 52) * k : sx(wrap(oX, -52, 52));
  drawCar(ctx, oS, y + 46, { color: '#d6842c' });
  // velocity arrows in the chosen frame (8 px per m/s)
  const vc = st.frame === 'car' ? 0 : st.v, vt = st.frame === 'car' ? -st.v : 0, vo = V_OTHER - (st.frame === 'car' ? st.v : 0);
  vec(ctx, carS, y - 4, vc * 4, 0, COL.v(), vc ? 'v' : '', 2.4);
  vec(ctx, oS, y + 60, vo * 4, 0, COL.v(), vo ? 'v' : '', 2.4);
  const tx = sx(Math.ceil((ref + 10) / 15) * 15);
  if (vt) vec(ctx, tx, y - 74, vt * 4, 0, COL.v(), 'v', 2.4);
  note(ctx, `${t('m.frame')} : ${t(st.frame === 'car' ? 'frame.car' : 'frame.ground')}`, 300, 20, 'center', 12, cssVar('--text'), 800);
  note(ctx, t('m.note'), 300, HEIGHTS.frames - 26, 'center', 11);
}
const TBL = () => frameOf([-0.25, -0.2, 2.25, 1.25], 30, 30, 540, 290);
function drawTable(ctx, st) {
  const f = TBL();
  ctx.fillStyle = '#7a4a24'; roundRect(ctx, f.X(0) - 12, f.Y(1) - 12, 2 * f.k + 24, f.k + 24, 10); ctx.fill();
  ctx.fillStyle = '#2f8a4e'; ctx.fillRect(f.X(0), f.Y(1), 2 * f.k, f.k);
  // diagonals (Figure 7.4)
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.setLineDash([5, 5]); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(f.X(0), f.Y(0)); ctx.lineTo(f.X(2), f.Y(1)); ctx.moveTo(f.X(0), f.Y(1)); ctx.lineTo(f.X(2), f.Y(0)); ctx.stroke(); ctx.setLineDash([]);
  for (const [n, x, y, dx, dy] of [['A', 0, 1, -10, -12], ['B', 2, 1, 10, -12], ['C', 2, 0, 10, 12]]) note(ctx, n, f.X(x) + dx, f.Y(y) + dy, 'center', 12, cssVar('--text'), 800);
  // axes of (O, i, j) and (O′, i, j)
  ctx.strokeStyle = cssVar('--text'); ctx.fillStyle = cssVar('--text'); ctx.lineWidth = 1.4;
  arrow(ctx, f.X(-0.15), f.Y(0), f.X(2.2), f.Y(0), 7); arrow(ctx, f.X(0), f.Y(-0.12), f.X(0), f.Y(1.2), 7);
  note(ctx, 'x', f.X(2.2), f.Y(0) + 12, 'center', 12, cssVar('--text')); note(ctx, 'y', f.X(0) - 10, f.Y(1.2), 'center', 12, cssVar('--text'));
  note(ctx, 'O', f.X(0) - 10, f.Y(0) + 12, 'center', 13, cssVar('--text'), 800);
  ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff'; ctx.lineWidth = 1.2;
  arrow(ctx, f.X(0.05), f.Y(0.5), f.X(1.95), f.Y(0.5), 7); arrow(ctx, f.X(1), f.Y(0.05), f.X(1), f.Y(0.95), 7);
  note(ctx, 'X', f.X(1.95), f.Y(0.5) - 10, 'center', 12, '#fff', 800); note(ctx, 'Y', f.X(1) + 10, f.Y(0.95), 'center', 12, '#fff', 800);
  ctx.strokeStyle = '#e07b00'; ctx.fillStyle = '#e07b00'; ctx.lineWidth = 2.4;
  for (const [ox, oy] of [[0, 0], [1, 0.5]]) { arrow(ctx, f.X(ox), f.Y(oy), f.X(ox) + 24, f.Y(oy), 6); arrow(ctx, f.X(ox), f.Y(oy), f.X(ox), f.Y(oy) - 24, 6); }
  note(ctx, 'O′', f.X(1) - 12, f.Y(0.5) + 12, 'center', 13, '#fff', 800);
  // vectors OO′, O′P and OP
  const [px, py] = st.P;
  vec(ctx, f.X(0), f.Y(0), f.k * 1, -f.k * 0.5, '#e9e9e9', '', 2);
  vec(ctx, f.X(1), f.Y(0.5), f.k * (px - 1), -f.k * (py - 0.5), '#ffd54a', '', 2.6);
  vec(ctx, f.X(0), f.Y(0), f.k * px, -f.k * py, '#9fd2ff', '', 2.6);
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#222'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(f.X(px), f.Y(py), 8, 0, TAU); ctx.fill(); ctx.stroke();
  note(ctx, `P (${num(px, 2)} ; ${num(py, 2)})`, f.X(px) + 12, f.Y(py) - 14, px > 1.6 ? 'right' : 'left', 12, cssVar('--text'), 800);
}

/* ---------- position, velocity, acceleration ---------- */
const vecFrame = (mo) => frameOf(MOTIONS[mo].box, 30, 16, 545, HEIGHTS.vectors - 32);
function trajPath(ctx, f, M, t1 = 0, t2 = M.tmax) {
  ctx.beginPath();
  for (let i = 0; i <= 200; i++) { const tt = t1 + ((t2 - t1) * i) / 200; const [x, y] = M.r(tt); if (i === 0) ctx.moveTo(f.X(x), f.Y(y)); else ctx.lineTo(f.X(x), f.Y(y)); }
}
function drawVectors(ctx, st) {
  const M = MOTIONS[st.mo], f = vecFrame(st.mo);
  axes(ctx, f, M.grid);
  ctx.strokeStyle = cssVar('--primary'); ctx.lineWidth = 2; ctx.globalAlpha = 0.55; trajPath(ctx, f, M); ctx.stroke(); ctx.globalAlpha = 1;
  ctx.strokeStyle = cssVar('--primary'); ctx.lineWidth = 3; trajPath(ctx, f, M, 0, st.t); ctx.stroke();
  const [x, y] = M.r(st.t), [vx, vy] = M.v(st.t), [ax, ay] = M.a(st.t);
  const X = f.X(x), Y = f.Y(y);
  if (st.show.r) vec(ctx, f.X(0), f.Y(0), X - f.X(0), Y - f.Y(0), COL.r(), 'r', 2.2);
  if (st.show.v) vec(ctx, X, Y, vx * M.kv * f.k, -vy * M.kv * f.k, COL.v(), 'v');
  if (st.show.a) vec(ctx, X, Y, ax * M.ka * f.k, -ay * M.ka * f.k, COL.a(), 'a');
  ctx.fillStyle = cssVar('--accent'); ctx.beginPath(); ctx.arc(X, Y, 6, 0, TAU); ctx.fill();
  note(ctx, 'M', X - 12, Y + 12, 'center', 13, cssVar('--text'), 800);
  note(ctx, `t = ${qty(st.t, 2, 's')}`, 588, 20, 'right', 13, cssVar('--text'), 800);
}

/* ---------- displacement ---------- */
const DC = { x: 300, y: 196, r: 150 };
function drawDisplacement(ctx, st) {
  const { x, y, r } = DC, th = st.th * DEG;
  // road
  ctx.strokeStyle = '#8d9299'; ctx.lineWidth = 26; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
  ctx.strokeStyle = '#f2f2f2'; ctx.lineWidth = 1.5; ctx.setLineDash([10, 10]); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(120,170,90,0.35)'; ctx.beginPath(); ctx.arc(x, y, r - 14, 0, TAU); ctx.fill();
  // A at the bottom; positive sense counter-clockwise (θ measured from OA)
  const a0 = Math.PI / 2; // screen angle of A (down)
  const P = (ang) => [x + r * Math.cos(a0 - ang), y + r * Math.sin(a0 - ang)];
  ctx.strokeStyle = cssVar('--primary'); ctx.lineWidth = 6;
  if (th > 0) { ctx.beginPath(); ctx.arc(x, y, r, a0, a0 - th, true); ctx.stroke(); }
  const [ax, ay] = P(0), [bx, by] = P(th);
  if (hyp(bx - ax, by - ay) > 4) vec(ctx, ax, ay, bx - ax, by - ay, cssVar('--accent'), '', 3);
  // radius R
  ctx.strokeStyle = cssVar('--muted'); ctx.lineWidth = 1.2; ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + r * Math.cos(-2.4), y + r * Math.sin(-2.4)); ctx.stroke(); ctx.setLineDash([]);
  note(ctx, `R = ${qty(st.R, 0, 'm')}`, x + 0.5 * r * Math.cos(-2.4) - 8, y + 0.5 * r * Math.sin(-2.4) - 8, 'right', 12, cssVar('--text'));
  ctx.fillStyle = cssVar('--text'); ctx.beginPath(); ctx.arc(x, y, 3, 0, TAU); ctx.fill(); note(ctx, 'O', x + 10, y + 4, 'left', 12, cssVar('--text'));
  drawCar(ctx, bx, by, { ang: -th - Math.PI * 0, size: 0.75, color: '#d6842c' });
  note(ctx, 'A', ax, ay + 26, 'center', 14, cssVar('--text'), 800);
  if (st.th > 8 && st.th < 352) note(ctx, 'B', x + (r + 28) * Math.cos(a0 - th), y + (r + 28) * Math.sin(a0 - th), 'center', 14, cssVar('--text'), 800);
  // legend
  ctx.fillStyle = cssVar('--primary'); ctx.fillRect(20, 20, 22, 6); note(ctx, t('distance'), 48, 23, 'left', 11, cssVar('--text'));
  ctx.strokeStyle = cssVar('--accent'); ctx.fillStyle = cssVar('--accent'); ctx.lineWidth = 3; arrow(ctx, 20, 42, 42, 42, 6); note(ctx, t('displacement'), 48, 42, 'left', 11, cssVar('--text'));
}

/* ---------- tangential and normal acceleration ---------- */
function tnaState(st) {
  if (st.c === 'straight') {
    // car runs 0 → 130 m, then starts again
    const T = Math.sqrt(V0_STRAIGHT ** 2 + 2 * st.aT * 130) / st.aT - V0_STRAIGHT / st.aT;
    const tt = (st.time || 0) % T;
    return { tt, x: V0_STRAIGHT * tt + 0.5 * st.aT * tt * tt, v: V0_STRAIGHT + st.aT * tt, aT: st.aT, aN: 0, R: Infinity };
  }
  if (st.c === 'round') {
    const w = st.vr / R_ROUND, ang = (st.time || 0) * w;
    return { ang, v: st.vr, aT: 0, aN: (st.vr * st.vr) / R_ROUND, R: R_ROUND };
  }
  return ex13(st.t);
}
function drawTna(ctx, st) {
  const s = tnaState(st);
  if (st.c === 'straight') {
    const y = 200, k = 4, x0 = 35;
    ctx.fillStyle = '#6b6f76'; ctx.fillRect(0, y - 26, 600, 52);
    ctx.strokeStyle = '#f2f2f2'; ctx.lineWidth = 2; ctx.setLineDash([16, 14]); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(600, y); ctx.stroke(); ctx.setLineDash([]);
    const cx = x0 + s.x * k;
    drawCar(ctx, cx, y - 12, { color: '#3a7bd5' });
    vec(ctx, cx, y - 48, s.v * 4, 0, COL.v(), 'v');
    vec(ctx, cx, y + 44, s.aT * 30, 0, COL.aT(), 'a = aT');
    note(ctx, t('straight'), 300, 60, 'center', 12, cssVar('--text'));
    return;
  }
  if (st.c === 'round') {
    const cx = 300, cy = 205, k = 7, r = R_ROUND * k;
    ctx.strokeStyle = '#8d9299'; ctx.lineWidth = 30; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
    ctx.strokeStyle = '#f2f2f2'; ctx.lineWidth = 1.5; ctx.setLineDash([10, 10]); ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = cssVar('--text'); ctx.beginPath(); ctx.arc(cx, cy, 3, 0, TAU); ctx.fill();
    const a = s.ang, px = cx + r * Math.cos(a), py = cy - r * Math.sin(a);
    drawCar(ctx, px, py, { ang: -a - Math.PI / 2, size: 0.8, color: '#3a7bd5' });
    const tx = -Math.sin(a), ty = -Math.cos(a); // screen tangent (counter-clockwise)
    vec(ctx, px, py, tx * s.v * 6, ty * s.v * 6, COL.v(), 'v');
    vec(ctx, px, py, (cx - px) / r * s.aN * 12, (cy - py) / r * s.aN * 12, COL.aN(), 'a = aN');
    note(ctx, `R = ${qty(R_ROUND, 0, 'm')}`, cx, cy + 16, 'center', 12, cssVar('--text'));
    return;
  }
  // curve of Exercise 13 (same as the motion "parab")
  const Mo = MOTIONS.parab, f = frameOf([-0.6, -0.2, 2.6, 5.4], 30, 16, 545, HEIGHTS.tna - 32);
  axes(ctx, f, 1);
  ctx.strokeStyle = cssVar('--primary'); ctx.lineWidth = 2.5; trajPath(ctx, f, Mo); ctx.stroke();
  const [x, y] = Mo.r(st.t), [vx, vy] = Mo.v(st.t), X = f.X(x), Y = f.Y(y);
  const ux = vx / s.v, uy = vy / s.v, nx = -uy, ny = ux; // unit tangent and unit normal (towards the inside: +j side)
  if (st.circ && s.R < 40) {
    const ccx = x + nx * s.R, ccy = y + ny * s.R;
    ctx.save(); ctx.beginPath(); ctx.rect(f.X(f.x1), f.Y(f.y2), f.X(f.x2) - f.X(f.x1), f.Y(f.y1) - f.Y(f.y2)); ctx.clip();
    ctx.strokeStyle = COL.aN(); ctx.lineWidth = 1.4; ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.arc(f.X(ccx), f.Y(ccy), s.R * f.k, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(f.X(ccx), f.Y(ccy)); ctx.stroke();
    ctx.fillStyle = COL.aN(); ctx.beginPath(); ctx.arc(f.X(ccx), f.Y(ccy), 3, 0, TAU); ctx.fill();
    ctx.restore();
  }
  const ka = 0.5 * f.k, kv = 0.4 * f.k;
  vec(ctx, X, Y, vx * kv, -vy * kv, COL.v(), 'v');
  vec(ctx, X, Y, 0, -2 * ka, COL.a(), 'a');
  vec(ctx, X - nx * 9, Y + ny * 9, ux * s.aT * ka, -uy * s.aT * ka, COL.aT(), 'aT', 2.2); // shifted to the outside so that it does not hide v
  vec(ctx, X, Y, nx * s.aN * ka, -ny * s.aN * ka, COL.aN(), 'aN', 2.2);
  // completing the rectangle a = aT + aN
  ctx.strokeStyle = cssVar('--muted'); ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(X + ux * s.aT * ka, Y - uy * s.aT * ka); ctx.lineTo(X, Y - 2 * ka); ctx.lineTo(X + nx * s.aN * ka, Y - ny * s.aN * ka); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = cssVar('--accent'); ctx.beginPath(); ctx.arc(X, Y, 6, 0, TAU); ctx.fill();
  note(ctx, `t = ${qty(st.t, 2, 's')}`, 588, 20, 'right', 13, cssVar('--text'), 800);
}

/* ---------- circular motion ---------- */
const CC = { x: 300, y: 212 };
function drawCircular(ctx, st) { if (st.view === 'law') drawLaw(ctx, st); else drawRec(ctx, st); }
function lawScales(L) {
  let vmax = 0, amax = 0;
  const tt = 0.7 * L.tmax, v = L.v(tt); vmax = v; amax = hyp(L.aT(tt), (v * v) / L.R);
  return { kv: 90 / vmax, ka: 90 / amax };
}
function drawLaw(ctx, st) {
  const L = LAWS[st.law], r = 150, { x, y } = CC;
  const s = L.s(st.t), th = s / L.R, v = L.v(st.t), aT = L.aT(st.t), aN = (v * v) / L.R;
  const { kv, ka } = lawScales(L);
  ctx.strokeStyle = cssVar('--border'); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
  ctx.strokeStyle = cssVar('--primary'); ctx.lineWidth = 5;
  // arc covered from A, several turns drawn as a spiral offset
  const turns = Math.floor(th / TAU);
  for (let k = 0; k <= turns; k++) { const end = Math.min(th, (k + 1) * TAU) - k * TAU; ctx.beginPath(); ctx.arc(x, y, r - k * 7, 0, -end, true); ctx.stroke(); }
  const px = x + r * Math.cos(th), py = y - r * Math.sin(th);
  ctx.strokeStyle = cssVar('--muted'); ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y); ctx.lineTo(px, py); ctx.stroke();
  // angle θ
  ctx.strokeStyle = cssVar('--accent'); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 34, 0, -Math.min(th, TAU - 0.01), true); ctx.stroke();
  note(ctx, 'θ', x + 46 * Math.cos(Math.min(th, 6) / 2), y - 46 * Math.sin(Math.min(th, 6) / 2), 'center', 13, cssVar('--accent'), 800);
  ctx.fillStyle = cssVar('--text'); ctx.beginPath(); ctx.arc(x, y, 3, 0, TAU); ctx.fill();
  note(ctx, 'O', x - 10, y + 10, 'center', 12, cssVar('--text'));
  note(ctx, 'A', x + r + 14, y, 'left', 13, cssVar('--text'), 800);
  const tx = -Math.sin(th), ty = -Math.cos(th);
  vec(ctx, px, py, tx * v * kv, ty * v * kv, COL.v(), 'v');
  const ox = (px - x) / r * 9, oy = (py - y) / r * 9; // aT drawn just outside the circle so that it does not hide v
  vec(ctx, px + ox, py + oy, tx * aT * ka, ty * aT * ka, COL.aT(), 'aT', 2.2);
  vec(ctx, px, py, (x - px) / r * aN * ka, (y - py) / r * aN * ka, COL.aN(), 'aN', 2.2);
  ctx.fillStyle = cssVar('--accent'); ctx.beginPath(); ctx.arc(px, py, 7, 0, TAU); ctx.fill();
  note(ctx, 'M', px + 14 * Math.cos(th) , py - 14 * Math.sin(th) - 6, 'center', 13, cssVar('--text'), 800);
  note(ctx, `t = ${qty(st.t, 2, 's')}`, 588, 20, 'right', 13, cssVar('--text'), 800);
  note(ctx, `R = ${qty(L.R, 0, 'cm')}`, 12, 20, 'left', 12, cssVar('--text'), 800);
}
const RK = 24; // px per cm (the recording is drawn at its real size × 0.95 on a usual screen)
function drawRec(ctx, st) {
  const { x, y } = CC;
  const P = (i) => { const [cx, cy] = recPt(i); return [x + cx * RK, y - cy * RK]; };
  ctx.fillStyle = '#fffdf6'; roundRect(ctx, x - 200, y - 200, 400, 400, 6); ctx.fill();
  ctx.strokeStyle = cssVar('--border'); ctx.lineWidth = 1; ctx.stroke();
  ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x - 5, y - 5); ctx.lineTo(x + 5, y + 5); ctx.moveTo(x + 5, y - 5); ctx.lineTo(x - 5, y + 5); ctx.stroke();
  note(ctx, 'O', x + 12, y - 2, 'left', 12, '#333');
  const i = st.i;
  // chord M(i−1)M(i+1)
  const [p1x, p1y] = P(i - 1), [p2x, p2y] = P(i + 1), [pix, piy] = P(i);
  ctx.strokeStyle = '#999'; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(p1x, p1y); ctx.lineTo(p2x, p2y); ctx.stroke(); ctx.setLineDash([]);
  for (let k = 1; k <= REC.n; k++) {
    const [px, py] = P(k), hl = k === i;
    ctx.fillStyle = hl ? cssVar('--accent') : '#222';
    ctx.beginPath(); ctx.arc(px, py, hl ? 5 : 3.2, 0, TAU); ctx.fill();
    const ang = recAng(k);
    label(ctx, String(k), px + 14 * Math.cos(ang), py - 14 * Math.sin(ang), { size: 10, weight: hl ? 800 : 600, color: hl ? cssVar('--accent') : '#444', halo: false });
  }
  const KV = 240, KA = 48; // px per m/s and per m/s² (1 m/s ↔ 10 cm, 1 m/s² ↔ 2 cm on the drawing)
  const showV = (k) => { const [vx, vy] = recV(k), [px, py] = P(k); vec(ctx, px, py, vx * KV, -vy * KV, COL.v(), `v${k}`, 2.2); };
  const showA = (k) => { const [ax, ay] = recA(k), [px, py] = P(k); vec(ctx, px, py, ax * KA, -ay * KA, COL.a(), `a${k}`, 2.2); };
  if (st.sv) for (const k of [4, 6, 11, 13, 19, 21]) showV(k);
  if (st.sa) for (const k of [5, 12, 20]) showA(k);
  showV(i);
  if (i >= 3 && i <= REC.n - 2) showA(i);
  note(ctx, `τ = 40 ms`, x - 190, y - 186, 'left', 11, '#444');
  note(ctx, '1 m/s ↔ 10 cm · 1 m/s² ↔ 2 cm', x + 190, y + 188, 'right', 10, '#444');
  void pix; void piy;
}

/* ================================================================
   Pointer
   ================================================================ */
let dragging = false;
canvas.addEventListener('pointerdown', (ev) => {
  const p = view.toLogical(ev);
  if (shell.tab === 'frames' && S.frames.view === 'table') { dragging = true; moveP(p); }
  else if (shell.tab === 'displacement') { dragging = true; moveB(p); }
  else if (shell.tab === 'circular' && S.circular.view === 'rec') { pickDot(p); return; }
  else return;
  canvas.setPointerCapture(ev.pointerId);
});
canvas.addEventListener('pointermove', (ev) => {
  if (!dragging) return;
  const p = view.toLogical(ev);
  if (shell.tab === 'frames') moveP(p); else if (shell.tab === 'displacement') moveB(p);
});
const endDrag = () => { dragging = false; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
function moveP(p) {
  const f = TBL(), st = S.frames;
  const snap = (v) => Math.round(v / 0.05) * 0.05;
  st.P = [clamp(snap((p.x - f.X(0)) / f.k), 0, 2), clamp(snap((f.Y(0) - p.y) / f.k), 0, 1)];
  refresh();
}
function moveB(p) {
  const st = S.displacement;
  let ang = Math.atan2(-(p.y - DC.y), p.x - DC.x) + Math.PI / 2; // 0 at A (bottom), counter-clockwise
  ang = ((ang % TAU) + TAU) % TAU;
  st.th = Math.round(ang / DEG / 5) * 5; st.go = false; ui.th?.set(st.th); refresh();
}
function pickDot(p) {
  let best = 0, bd = 1e9;
  for (let k = 2; k <= REC.n - 1; k++) { const [cx, cy] = recPt(k), d = hyp(CC.x + cx * RK - p.x, CC.y - cy * RK - p.y); if (d < bd) { bd = d; best = k; } }
  if (bd < 24) { S.circular.i = best; ui.i?.set(best); refresh(); }
}

/* ================================================================
   Controls and measurements
   ================================================================ */
const controlsBody = document.getElementById('controls-body');
const measuresBody = document.getElementById('measures-body');
let ui = {};
let tableSig = '';
function measRows(dl, rows) { dl.replaceChildren(...rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)])); }
function statusBox() { return el('p', { class: 'status', hidden: '' }); }
function showStatus(box, fb) { if (!fb) { box.hidden = true; return; } box.hidden = false; box.className = `status ${fb.type || ''}`; box.textContent = t(fb.key, fb.params); }
function hint(key) { return el('p', { class: 'muted', style: 'font-size:0.88rem;margin:10px 0 0', dataset: { i18n: key } }, t(key)); }
const btnRow = (...b) => el('div', { class: 'btn-row' }, b);
const resetBtn = (id) => btnRow(createButton({ labelKey: 'ui.reset', variant: 'ghost', onClick: () => resetTab(id) }));
const seg = (labelKey, opts, value, onChange) => createSegmented({ labelKey, options: opts.map(([v, k]) => ({ value: String(v), labelKey: k })), value: String(value), onChange });
const fbOf = (res, okKey, badKey) => (res === 'invalid' ? { type: 'warn', key: 'calcInvalid' } : res === 'wrong' ? { type: 'bad', key: badKey } : { type: 'good', key: okKey });
function tableParts(st, rowsKey = 'rows') {
  ui.table = el('table', { class: 'data' });
  ui.clear = el('div', { class: 'btn-row', style: 'margin-top:8px' }, [createButton({ labelKey: 'ctl.clearTable', variant: 'ghost', onClick: () => { st[rowsKey] = []; st.fb = null; refresh(); } })]);
  ui.status = statusBox();
  return [ui.table, ui.clear, ui.status];
}
function renderTable(st, rows, cols, cells) {
  const sig = calcSig(rows) + rows.length + cols.join();
  if (sig !== tableSig) {
    ui.table.replaceChildren(el('thead', {}, el('tr', {}, cols.map((k) => el('th', {}, t(k))))), el('tbody', {}, rows.map((r) => el('tr', {}, cells(r)))));
    tableSig = calcSig(rows) + rows.length + cols.join();
  }
  ui.table.hidden = rows.length === 0;
  ui.clear.hidden = ui.table.hidden;
  showStatus(ui.status, st.fb);
}
// on/off buttons (pressed = primary)
function toggles(labelKey, items) {
  return el('div', {}, [
    el('p', { class: 'muted', style: 'font-size:0.88rem;margin:10px 0 4px' }, t(labelKey)),
    btnRow(...items.map(([key, on, flip]) => { const b = createButton({ labelKey: key, variant: on ? 'primary' : 'secondary', onClick: () => { flip(); buildTab(shell.tab); } }); b.setAttribute('aria-pressed', String(on)); return b; })),
  ]);
}
let playBtn = null, playSt = null;
function playButton(st, atEnd, restart) {
  playSt = st;
  playBtn = createButton({ labelKey: st.play ? 'ctl.pause' : 'ctl.play', variant: 'primary', onClick: () => { if (!st.play && atEnd()) restart(); st.play = !st.play; syncPlay(); } });
  return playBtn;
}
function syncPlay() { if (!playBtn || !playSt) return; playBtn.dataset.i18n = playSt.play ? 'ctl.pause' : 'ctl.play'; playBtn.textContent = t(playBtn.dataset.i18n); }
const r2 = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

/* ---------- frames ---------- */
function buildFrames() {
  const st = S.frames;
  controlsBody.append(seg('ctl.fview', [['road', 'fview.road'], ['table', 'fview.table']], st.view, (v) => { st.view = v; buildTab('frames'); }).root);
  ui.dl = el('dl', { class: 'meas' });
  if (st.view === 'road') {
    controlsBody.append(
      seg('ctl.frame', [['ground', 'frame.ground'], ['car', 'frame.car']], st.frame, (v) => { st.frame = v; refresh(); }).root,
      createSlider({ labelKey: 'ctl.vcar', min: 0, max: 30, step: 1, value: st.v, unit: 'm/s', decimals: 0, onInput: (v) => { st.v = v; refresh(); } }).root,
      resetBtn('frames'));
    measuresBody.append(ui.dl);
    return;
  }
  controlsBody.append(btnRow(createButton({ labelKey: 'ctl.recordP', variant: 'primary', onClick: () => { st.rows.push({ x: r2(st.P[0]), y: r2(st.P[1]) }); st.fb = null; refresh(); } })), hint('hint.table'), resetBtn('frames'));
  measuresBody.append(ui.dl, ...tableParts(st));
}
function updateFrames() {
  const st = S.frames;
  if (st.view === 'road') {
    const g = st.frame === 'ground';
    const sgn = (v) => qty(v, 0, 'm/s');
    measRows(ui.dl, [[t('m.frame'), t(g ? 'frame.ground' : 'frame.car')], [t('m.vCar'), sgn(g ? st.v : 0)], [t('m.vTree'), sgn(g ? 0 : -st.v)], [t('m.vOther'), sgn(V_OTHER - (g ? 0 : st.v))]]);
    return;
  }
  const [x, y] = st.P;
  measRows(ui.dl, [[t('m.P'), `(${num(x, 2)} ; ${num(y, 2)})`], [t('m.OO'), `(${num(1, 0)} ; ${num(0.5, 1)})`]]);
  renderTable(st, st.rows, ['col.x', 'col.y', 'col.X', 'col.Y'], (r) => [el('td', {}, num(r.x, 2)), el('td', {}, num(r.y, 2)),
    calcCell(r, 'X', { expected: r.x - 1, decimals: 2, tol: 0.006, onCheck: (res) => { st.fb = fbOf(res, 'fb.XOk', 'fb.XWrong'); refresh(); } }),
    calcCell(r, 'Y', { expected: r.y - 0.5, decimals: 2, tol: 0.006, disabled: !calcDone(r, 'X'), onCheck: (res) => { st.fb = fbOf(res, 'fb.YOk', 'fb.YWrong'); refresh(); } })]);
}

/* ---------- vectors ---------- */
function buildVectors() {
  const st = S.vectors, M = MOTIONS[st.mo];
  ui.t = createSlider({ labelKey: 'ctl.t', min: 0, max: Math.round(M.tmax * 100) / 100, step: 0.01, value: st.t, unit: 's', decimals: 2, onInput: (v) => { st.t = v; st.play = false; syncPlay(); refresh(); } });
  controlsBody.append(
    seg('ctl.motion', [['parab', 'mo.parab'], ['circle', 'mo.circle'], ['line', 'mo.line']], st.mo, (v) => { st.mo = v; st.t = Math.min(st.t, MOTIONS[v].tmax); st.play = false; buildTab('vectors'); }).root,
    ui.t.root,
    btnRow(playButton(st, () => st.t >= M.tmax - 1e-6, () => { st.t = 0; }), createButton({ labelKey: 'ctl.record', variant: 'secondary', onClick: () => { st.rows.push({ mo: st.mo, t: r2(st.t) }); st.fb = null; refresh(); } })),
    toggles('ctl.show', [['show.r', st.show.r, () => { st.show.r = !st.show.r; }], ['show.v', st.show.v, () => { st.show.v = !st.show.v; }], ['show.a', st.show.a, () => { st.show.a = !st.show.a; }]]),
    resetBtn('vectors'));
  ui.dl = el('dl', { class: 'meas' });
  measuresBody.append(ui.dl, ...tableParts(st));
}
const pair = (a, b, d = 2) => `${num(a, d)} ; ${num(b, d)}`;
function updateVectors() {
  const st = S.vectors, M = MOTIONS[st.mo];
  const [x, y] = M.r(st.t), [vx, vy] = M.v(st.t), [ax, ay] = M.a(st.t);
  measRows(ui.dl, [
    [t('m.eq'), M.eq], [t('m.traj'), M.traj],
    [t('m.xy'), `(${pair(x, y)}) m`],
    [t('m.vxy'), `(${pair(vx, vy)}) · v = ${qty(hyp(vx, vy), 2, 'm/s')}`],
    [t('m.axy'), `(${pair(ax, ay)}) · a = ${qty(hyp(ax, ay), 2, 'm/s²')}`],
    [t('m.scale'), `1 m/s ↔ ${num(M.kv, 2)} m · 1 m/s² ↔ ${num(M.ka, 2)} m`],
  ]);
  renderTable(st, st.rows, ['col.t', 'col.r', 'col.v', 'col.a'], (r) => {
    const Mo = MOTIONS[r.mo], [rx, ry] = Mo.r(r.t), [a1, a2] = Mo.v(r.t), [b1, b2] = Mo.a(r.t);
    const R = hyp(rx, ry), V = hyp(a1, a2), A = hyp(b1, b2);
    return [el('td', {}, [num(r.t, 2), el('br'), el('small', { class: 'muted' }, t(`mo.${r.mo}`))]),
      calcCell(r, 'r', { expected: R, decimals: 2, tol: relTol(R), onCheck: (res) => { st.fb = fbOf(res, 'fb.rOk', 'fb.rWrong'); refresh(); } }),
      calcCell(r, 'v', { expected: V, decimals: 2, tol: relTol(V), disabled: !calcDone(r, 'r'), onCheck: (res) => { st.fb = fbOf(res, 'fb.vOk', 'fb.vWrong'); refresh(); } }),
      calcCell(r, 'a', { expected: A, decimals: 2, tol: relTol(A), disabled: !calcDone(r, 'v'), onCheck: (res) => { st.fb = fbOf(res, 'fb.aOk', 'fb.aWrong'); refresh(); } })];
  });
}

/* ---------- displacement ---------- */
function buildDisplacement() {
  const st = S.displacement;
  ui.th = createSlider({ labelKey: 'ctl.theta', min: 0, max: 360, step: 5, value: Math.round(st.th), unit: '°', decimals: 0, onInput: (v) => { st.th = v; st.go = false; refresh(); } });
  controlsBody.append(
    createSlider({ labelKey: 'ctl.Rr', min: 10, max: 50, step: 5, value: st.R, unit: 'm', decimals: 0, onInput: (v) => { st.R = v; refresh(); } }).root,
    ui.th.root,
    btnRow(createButton({ labelKey: 'ctl.go', variant: 'primary', onClick: () => { if (st.th >= 360) st.th = 0; st.go = true; } }),
      createButton({ labelKey: 'pre.half', variant: 'secondary', onClick: () => { st.th = 180; st.go = false; ui.th.set(180); refresh(); } }),
      createButton({ labelKey: 'pre.full', variant: 'secondary', onClick: () => { st.th = 360; st.go = false; ui.th.set(360); refresh(); } })),
    btnRow(createButton({ labelKey: 'ctl.recordD', variant: 'secondary', onClick: () => { st.rows.push({ deg: Math.round(st.th), R: st.R }); st.fb = null; refresh(); } })),
    resetBtn('displacement'));
  ui.dl = el('dl', { class: 'meas' });
  measuresBody.append(ui.dl, ...tableParts(st));
}
function updateDisplacement() {
  const st = S.displacement, th = st.th * DEG;
  const s = st.R * th, AB = 2 * st.R * Math.sin(th / 2);
  const rows = [[t('m.s'), qty(s, 1, 'm')], [t('m.AB'), qty(Math.abs(AB) < 1e-9 ? 0 : AB, 1, 'm')]];
  if (st.th > 0) rows.push([t('m.cmp'), t(st.th >= 359.5 ? 'cmp.zero' : 'cmp.eq')]);
  measRows(ui.dl, rows);
  renderTable(st, st.rows, ['col.deg', 'col.R', 'col.s', 'col.AB'], (r) => {
    const sr = (r.R * r.deg * Math.PI) / 180, ab = Math.abs(2 * r.R * Math.sin((r.deg * DEG) / 2));
    return [el('td', {}, String(r.deg)), el('td', {}, String(r.R)),
      calcCell(r, 's', { expected: sr, decimals: 1, tol: relTol(sr, 0.01, 0.06), onCheck: (res) => { st.fb = fbOf(res, 'fb.sOk', 'fb.sWrong'); refresh(); } }),
      calcCell(r, 'AB', { expected: ab, decimals: 1, tol: relTol(ab, 0.01, 0.06), disabled: !calcDone(r, 's'), onCheck: (res) => { st.fb = fbOf(res, 'fb.ABOk', 'fb.ABWrong'); refresh(); } })];
  });
}

/* ---------- tangential and normal ---------- */
function buildTna() {
  const st = S.tna;
  controlsBody.append(seg('ctl.case', [['straight', 'case.straight'], ['round', 'case.round'], ['curve', 'case.curve']], st.c, (v) => { st.c = v; st.time = 0; st.play = false; buildTab('tna'); }).root);
  ui.dl = el('dl', { class: 'meas' });
  if (st.c === 'straight') controlsBody.append(createSlider({ labelKey: 'ctl.aT', min: 0.5, max: 3, step: 0.5, value: st.aT, unit: 'm/s²', decimals: 1, onInput: (v) => { st.aT = v; st.time = 0; refresh(); } }).root);
  else if (st.c === 'round') controlsBody.append(createSlider({ labelKey: 'ctl.vr', min: 2, max: 20, step: 1, value: st.vr, unit: 'm/s', decimals: 0, onInput: (v) => { st.vr = v; refresh(); } }).root);
  else {
    ui.t = createSlider({ labelKey: 'ctl.t', min: 0, max: 2, step: 0.01, value: st.t, unit: 's', decimals: 2, onInput: (v) => { st.t = v; st.play = false; syncPlay(); refresh(); } });
    controlsBody.append(ui.t.root,
      btnRow(playButton(st, () => st.t >= 2 - 1e-6, () => { st.t = 0; }), createButton({ labelKey: 'ctl.record', variant: 'secondary', onClick: () => { st.rows.push({ t: r2(st.t) }); st.fb = null; refresh(); } })),
      toggles('ctl.show', [['show.circle', st.circ, () => { st.circ = !st.circ; }]]));
  }
  controlsBody.append(resetBtn('tna'));
  measuresBody.append(ui.dl);
  if (st.c === 'curve') measuresBody.append(...tableParts(st));
}
function updateTna() {
  const st = S.tna, s = tnaState(st);
  const a = hyp(s.aT, s.aN);
  measRows(ui.dl, [
    [t('m.v'), qty(s.v, 2, 'm/s')], [t('m.aT'), qty(s.aT, 2, 'm/s²')], [t('m.aN'), qty(s.aN, 2, 'm/s²')], [t('m.a'), qty(a, 2, 'm/s²')],
    [t('m.Rc'), Number.isFinite(s.R) ? qty(s.R, 2, 'm') : '∞'],
    [t('m.zero'), t(st.c === 'straight' ? 'zero.aN' : st.c === 'round' ? 'zero.aT' : st.t === 0 ? 'zero.aT' : 'zero.none')],
  ]);
  if (st.c !== 'curve') return;
  renderTable(st, st.rows, ['col.t', 'col.aT', 'col.aN', 'col.Rc'], (r) => {
    const e = ex13(r.t);
    return [el('td', {}, num(r.t, 2)),
      calcCell(r, 'aT', { expected: e.aT, decimals: 2, tol: relTol(e.aT), onCheck: (res) => { st.fb = fbOf(res, 'fb.aTOk', 'fb.aTWrong'); refresh(); } }),
      calcCell(r, 'aN', { expected: e.aN, decimals: 2, tol: relTol(e.aN), disabled: !calcDone(r, 'aT'), onCheck: (res) => { st.fb = fbOf(res, 'fb.aNOk', 'fb.aNWrong'); refresh(); } }),
      calcCell(r, 'R', { expected: e.R, decimals: 2, tol: relTol(e.R, 0.015), disabled: !calcDone(r, 'aN'), onCheck: (res) => { st.fb = fbOf(res, 'fb.RcOk', 'fb.RcWrong'); refresh(); } })];
  });
}

/* ---------- circular ---------- */
function buildCircular() {
  const st = S.circular;
  controlsBody.append(seg('ctl.cview', [['law', 'cview.law'], ['rec', 'cview.rec']], st.view, (v) => { st.view = v; st.play = false; st.fb = null; buildTab('circular'); }).root);
  ui.dl = el('dl', { class: 'meas' });
  if (st.view === 'law') {
    const L = LAWS[st.law];
    ui.t = createSlider({ labelKey: 'ctl.t', min: 0, max: L.tmax, step: L.tmax > 10 ? 0.1 : 0.01, value: st.t, unit: 's', decimals: L.tmax > 10 ? 1 : 2, onInput: (v) => { st.t = v; st.play = false; syncPlay(); refresh(); } });
    controlsBody.append(
      seg('ctl.law', [['ex5', 'law.ex5'], ['s1', 'law.s1'], ['s2', 'law.s2'], ['s3', 'law.s3']], st.law, (v) => { st.law = v; st.t = Math.min(st.t, LAWS[v].tmax); st.play = false; buildTab('circular'); }).root,
      ui.t.root,
      btnRow(playButton(st, () => st.t >= L.tmax - 1e-6, () => { st.t = 0; }), createButton({ labelKey: 'ctl.record', variant: 'secondary', onClick: () => { st.rows.push({ law: st.law, t: r2(st.t) }); st.fb = null; refresh(); } })),
      resetBtn('circular'));
    measuresBody.append(ui.dl, ...tableParts(st, 'rows'));
    return;
  }
  ui.i = createSlider({ labelKey: 'ctl.point', min: 2, max: REC.n - 1, step: 1, value: st.i, unit: '', decimals: 0, onInput: (v) => { st.i = v; refresh(); } });
  controlsBody.append(ui.i.root,
    btnRow(createButton({ labelKey: 'ctl.record', variant: 'primary', onClick: () => { st.rrows.push({ i: st.i }); st.fb = null; refresh(); } })),
    toggles('ctl.show', [['show.vrec', st.sv, () => { st.sv = !st.sv; }], ['show.arec', st.sa, () => { st.sa = !st.sa; }]]),
    resetBtn('circular'));
  measuresBody.append(ui.dl, ...tableParts(st, 'rrows'));
}
function updateCircular() {
  const st = S.circular;
  if (st.view === 'law') {
    const L = LAWS[st.law], s = L.s(st.t), v = L.v(st.t), aT = L.aT(st.t);
    measRows(ui.dl, [
      [t('m.R'), qty(L.R, 0, 'cm')], [t('m.sAt'), qty(s, 2, 'cm')], [t('m.th'), qty(s / L.R, 3, 'rad')],
      [t('m.vC'), qty(v, 2, 'cm/s')], [t('m.th1'), qty(v / L.R, 3, 'rad/s')], [t('m.th2'), qty(aT / L.R, 3, 'rad/s²')],
      [t('m.aTC'), qty(aT, 2, 'cm/s²')], [t('m.aNC'), qty((v * v) / L.R, 2, 'cm/s²')],
      [t('m.kind'), t(st.law === 's1' ? 'kind.uniform' : 'kind.varied')],
    ]);
    renderTable(st, st.rows, ['col.t', 'col.thc', 'col.th1c', 'col.aTc'], (r) => {
      const Lr = LAWS[r.law], th = Lr.s(r.t) / Lr.R, th1 = Lr.v(r.t) / Lr.R, a = Lr.aT(r.t);
      return [el('td', {}, [num(r.t, 2), el('br'), el('small', { class: 'muted' }, LAW_SHORT[r.law])]),
        calcCell(r, 'th', { expected: th, decimals: 3, tol: relTol(th, 0.01, 0.002), onCheck: (res) => { st.fb = fbOf(res, 'fb.thOk', 'fb.thWrong'); refresh(); } }),
        calcCell(r, 'th1', { expected: th1, decimals: 3, tol: relTol(th1, 0.01, 0.002), disabled: !calcDone(r, 'th'), onCheck: (res) => { st.fb = fbOf(res, 'fb.th1Ok', 'fb.th1Wrong'); refresh(); } }),
        calcCell(r, 'aT', { expected: a, decimals: 2, tol: relTol(a, 0.01, 0.01), disabled: !calcDone(r, 'th1'), onCheck: (res) => { st.fb = fbOf(res, 'fb.aTcOk', 'fb.aTcWrong'); refresh(); } })];
    });
    return;
  }
  const i = st.i, c = chordCm(i), vi = c / 100 / (2 * REC.tau);
  const rows = [[t('m.tau'), qty(40, 0, 'ms')], [t('m.Rrec'), qty(REC.R, 1, 'cm')], [t('m.chord'), qty(c, 2, 'cm')], [t('m.vi'), qty(vi, 3, 'm/s')]];
  if (i >= 3 && i <= REC.n - 2) rows.push([t('m.ai'), qty(hyp(...recA(i)), 2, 'm/s²')]);
  measRows(ui.dl, rows);
  renderTable(st, st.rrows, ['col.i', 'col.chord', 'col.vi', 'col.v2R'], (r) => {
    const cr = chordCm(r.i), v = cr / 100 / (2 * REC.tau), v2R = (v * v) / (REC.R / 100);
    return [el('td', {}, String(r.i)), el('td', {}, num(cr, 2)),
      calcCell(r, 'vi', { expected: v, decimals: 3, tol: relTol(v, 0.01, 0.002), onCheck: (res) => { st.fb = fbOf(res, 'fb.viOk', 'fb.viWrong'); refresh(); } }),
      calcCell(r, 'v2R', { expected: v2R, decimals: 2, tol: relTol(v2R, 0.02, 0.01), disabled: !calcDone(r, 'vi'), onCheck: (res) => { st.fb = fbOf(res, 'fb.v2ROk', 'fb.v2RWrong'); refresh(); } })];
  });
}

/* ---------- tabs ---------- */
const BUILD = { frames: buildFrames, vectors: buildVectors, displacement: buildDisplacement, tna: buildTna, circular: buildCircular };
const UPDATE = { frames: updateFrames, vectors: updateVectors, displacement: updateDisplacement, tna: updateTna, circular: updateCircular };
function buildTab(id) {
  controlsBody.replaceChildren();
  measuresBody.replaceChildren();
  ui = {};
  tableSig = '';
  playBtn = null; playSt = null;
  BUILD[id]();
  loop.start();
  refresh();
}
function updateMeasures() { if (shell && ui.dl) UPDATE[shell.tab](); }
function refresh() { updateMeasures(); requestDraw(); }
function resetTab(id) { S[id] = initialState(id); buildTab(id); }

onLangChange(() => { if (shell) buildTab(shell.tab); });

shell = initSim({
  strings,
  tabs: TABS.map((id) => ({ id, labelKey: `tab.${id}` })),
  initialTab: 'frames',
  onTab: buildTab,
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, ex13, chordCm, recA, recV };
