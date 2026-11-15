// Sec 3 GS-LS — Chapter 4: Mechanical oscillations. SG: whole chapter; SV: without the torsion, compound and simple pendulums
// (tabs "torsion" and "compound" are gsOnly). g = 10 m/s² as in the book.
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num, qty } from '../../../shared/format.js';
import { createButton, createSegmented, createSlider, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, arrow } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { label } from '../../../shared/figures.js';
import { calcCell, calcSig, calcDone } from '../../../shared/calc-cell.js';
import { drawEnergyBars, plotCurves } from '../../../shared/energy-bars.js';
import { G_SEC3GSLS as g } from '../../../shared/constants.js';

const TAU = 2 * Math.PI;
const D2R = Math.PI / 180;
const W = 600;
const TABS = ['free', 'horizontal', 'torsion', 'compound', 'driven', 'verify'];
const HEIGHTS = { free: 440, horizontal: 470, torsion: 440, compound: 440, driven: 420, verify: 420 };

/* ================================================================
   Model and book values
   ================================================================ */
// Exp. 4.1: spring of Exp. 4.3 (T/√m = 2.50 → k ≈ 6.32 N/m) with a labelled mass of 100 g
const FREE = { k: 6.32, m: 0.1 };
const DAMP = { none: 0, air: 0.02, water: 0.15, oil: 0.4 }; // kg/s (values chosen for the simulation)
// Exp. 4.3: two springs (T/√m = 2.50 and 3.15 in the book) → k = 4π² / ratio²
const SPRINGS = { a: 4 * Math.PI ** 2 / 2.5 ** 2, b: 4 * Math.PI ** 2 / 3.16 ** 2 };
// Application 4.3: rod 0.400 kg, 36.0 cm, C = 0.108 m·N
// Application 4.5: rod of negligible mass, two particles of 0.1 kg at OA = 1 m and OB = 0.5 m

function initialState(tab) {
  switch (tab) {
    case 'free': return { damp: 'air', x: 0.05, v: 0, t: 0, run: false, hist: [], ups: [] };
    case 'horizontal': return { K: 3.2, m: 0.2, x0: 2, v0: -0.2, t: 0, run: false, rows: [], fb: null };
    case 'torsion': return { C: 0.108, l: 36, thm: 10, t: 0, run: false, rows: [], fb: null };
    case 'compound': return { mode: 'compound', OB: 0.5, L: 1, thm: 10, th: 10 * D2R, w: 0, t: 0, run: false, ups: [], hist: [], rows: [], fb: null };
    case 'driven': return { drive: true, th: 12 * D2R, w: 0, t: 0, run: false, kicks: 0, lastKick: 0, hist: [], E0: null };
    default: return { spring: 'a', mass: 50, t: 0, run: false, count: 0, rows: [], fb: null };
  }
}
let S = Object.fromEntries(TABS.map((k) => [k, initialState(k)]));

const horiz = (st) => {
  const w0 = Math.sqrt(st.K / st.m), x0 = st.x0 / 100;
  const xm = Math.hypot(x0, st.v0 / w0);
  const phi = Math.atan2(x0 * w0, st.v0); // sin φ = x0 / xm, cos φ = v0 / (ω0 xm)
  return { w0, xm, phi, T0: TAU / w0 };
};
// horizontal spring: natural length 25 cm; beyond ±15 cm (60 % of ℓ0) the coils of the compressed spring would touch
const L0H = 0.25, XMAXH = 0.15;
const tooBig = (st) => horiz(st).xm > XMAXH + 1e-9;
const torsionI = (st) => (0.4 * (st.l / 100) ** 2) / 12;
function comp(st) {
  if (st.mode === 'simple') return { I: null, a: st.L, w2: g / st.L, T0: TAU * Math.sqrt(st.L / g) };
  const m = 0.1, OA = 1, OB = st.OB;
  const I = m * OA * OA + m * OB * OB, M = 2 * m, a = (m * OA - m * OB) / M;
  return { I, a, M, w2: (M * g * a) / I, T0: TAU * Math.sqrt(I / (M * g * a)) };
}
const DRIVE = { L: 0.5, gamma: 0.08, thm: 12 * D2R }; // clock pendulum (simple pendulum 25 cm) — values chosen for the simulation
const vertK = (st) => SPRINGS[st.spring];
const vertT = (st) => TAU * Math.sqrt((st.mass / 1000) / vertK(st));

/* ================================================================
   Canvas and loop
   ================================================================ */
let shell;
let drawQueued = false;
const canvas = document.getElementById('stage');
const view = setupCanvas(canvas, { width: W, height: 440, maxHeightVh: () => (window.innerWidth < 880 ? 54 : 78), onResize: () => requestDraw() });
function requestDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; draw(); });
}
onThemeChange(() => requestDraw());

function pushHist(st, row, keep = 12) {
  st.hist.push(row);
  while (st.hist.length && st.hist[0][0] < st.t - keep) st.hist.shift();
}
const loop = createLoop({
  step(dt) {
    if (!shell) return false;
    const tab = shell.tab, st = S[tab];
    if (!st.run) return true;
    if (tab === 'free') {
      const b = DAMP[st.damp], n = 10, h = dt / n;
      for (let i = 0; i < n; i++) {
        const xOld = st.x;
        st.v += (-(FREE.k / FREE.m) * st.x - (b / FREE.m) * st.v) * h;
        st.x += st.v * h; st.t += h;
        if (xOld < 0 && st.x >= 0) st.ups.push(st.t);
      }
      if (st.ups.length > 6) st.ups.shift();
      pushHist(st, [st.t, st.x * 100], 8);
    } else if (tab === 'horizontal' || tab === 'torsion') {
      st.t += dt;
      if (st.t > 60) st.run = false;
    } else if (tab === 'compound') {
      const n = 20, h = dt / n, { w2 } = comp(st);
      for (let i = 0; i < n; i++) {
        const old = st.th;
        st.w -= w2 * Math.sin(st.th) * h; st.th += st.w * h; st.t += h;
        if (old < 0 && st.th >= 0) st.ups.push(st.t);
      }
      if (st.ups.length > 6) st.ups.shift();
      pushHist(st, [st.t, st.th / D2R], 8);
    } else if (tab === 'driven') {
      const n = 20, h = dt / n, w2 = g / DRIVE.L;
      if (st.E0 == null) st.E0 = 1 - Math.cos(DRIVE.thm);
      for (let i = 0; i < n; i++) {
        const old = st.th;
        st.w += (-w2 * Math.sin(st.th) - 2 * DRIVE.gamma * st.w) * h; st.th += st.w * h; st.t += h;
        // escapement: once per period, when the pendulum passes through the equilibrium position in the positive direction,
        // it receives the energy lost since the last kick
        if (st.drive && old < 0 && st.th >= 0) {
          const E = 1 - Math.cos(st.th) + (st.w * st.w) / (2 * w2);
          st.lastKick = Math.max(0, st.E0 - E) / st.E0;
          st.w = Math.sqrt(Math.max(0, 2 * w2 * (st.E0 - (1 - Math.cos(st.th)))));
          st.kicks += 1; st.kickT = st.t;
        }
      }
      pushHist(st, [st.t, st.th / D2R], 10);
    } else if (tab === 'verify') {
      st.t += dt;
      const T = vertT(st);
      st.count = Math.floor(st.t / T);
      if (st.count >= 25) { st.count = 25; st.t = 25 * T; st.run = false; st.done = true; }
    }
    return true;
  },
  render() { draw(); updateMeasures(); },
});

/* ================================================================
   Drawing helpers
   ================================================================ */
const C = { x: () => cssVar('--s2'), v: () => cssVar('--s1'), Ek: () => cssVar('--s1'), Ep: () => cssVar('--s5'), Em: () => cssVar('--brand-navy') };
function note(ctx, key, x, y, align = 'left') { label(ctx, t(key), x, y, { size: 12, weight: 600, color: cssVar('--muted'), align }); }
function spring(ctx, x1, y1, x2, y2, coils = 14, amp = 9, color = cssVar('--spring-coil')) {
  const L = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / L, uy = (y2 - y1) / L;
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y1);
  const lead = Math.min(10, L * 0.1);
  ctx.lineTo(x1 + ux * lead, y1 + uy * lead);
  const n = coils * 2;
  for (let i = 1; i < n; i++) {
    const s = lead + ((L - 2 * lead) * i) / n, a = (i % 2 ? 1 : -1) * amp;
    ctx.lineTo(x1 + ux * s - uy * a, y1 + uy * s + ux * a);
  }
  ctx.lineTo(x2 - ux * lead, y2 - uy * lead); ctx.lineTo(x2, y2); ctx.stroke();
}
function support(ctx, x, y, w) {
  ctx.fillStyle = cssVar('--wood'); ctx.fillRect(x - w / 2, y - 10, w, 10);
  ctx.strokeStyle = cssVar('--glass-stroke'); ctx.lineWidth = 1;
  for (let i = -w / 2; i < w / 2; i += 10) { ctx.beginPath(); ctx.moveTo(x + i, y - 10); ctx.lineTo(x + i + 8, y - 18); ctx.stroke(); }
}
// a history [[t, y], …] as a function of t for plotCurves (NaN outside the recorded part)
const histFn = (hist, k = 1) => (tt) => {
  if (!hist.length || tt < hist[0][0] || tt > hist[hist.length - 1][0]) return NaN;
  let lo = 0, hi = hist.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (hist[mid][0] <= tt) lo = mid; else hi = mid; }
  return hist[lo][k];
};
const pseudoT = (ups) => (ups.length >= 2 ? (ups[ups.length - 1] - ups[0]) / (ups.length - 1) : null);

function draw() {
  if (!shell) return;
  const tab = shell.tab;
  if (view.height !== HEIGHTS[tab]) view.setLogicalSize(W, HEIGHTS[tab]);
  const ctx = view.begin();
  ctx.fillStyle = cssVar('--scene-bg');
  roundRect(ctx, 0, 0, W, HEIGHTS[tab], 14);
  ctx.fill();
  ({ free: drawFree, horizontal: drawHoriz, torsion: drawTorsion, compound: drawCompound, driven: drawDriven, verify: drawVerify })[tab](ctx, S[tab]);
}

/* ---------- Tab 1: free and damped oscillations (Exp. 4.1) ---------- */
function drawFree(ctx, st) {
  const x0 = 100, top = 30, eq = 150, k = 900; // px per m of displacement
  support(ctx, x0, top, 90);
  const y = eq + st.x * k;
  spring(ctx, x0, top, x0, y - 20, 14, 10);
  ctx.fillStyle = cssVar('--metal'); roundRect(ctx, x0 - 18, y - 20, 36, 40, 5); ctx.fill();
  label(ctx, '100 g', x0, y, { size: 10, weight: 800, color: '#fff', halo: false });
  ctx.save(); ctx.strokeStyle = cssVar('--muted'); ctx.setLineDash([5, 4]); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x0 + 26, eq); ctx.lineTo(x0 + 70, eq); ctx.stroke(); ctx.restore();
  label(ctx, 'O', x0 + 78, eq, { size: 13, weight: 800 });
  if (st.damp === 'water' || st.damp === 'oil') {
    ctx.fillStyle = st.damp === 'oil' ? 'rgba(210,170,40,0.25)' : 'rgba(60,140,220,0.22)';
    ctx.fillRect(x0 - 44, eq - 70, 88, 140);
    ctx.strokeStyle = cssVar('--glass-stroke'); ctx.strokeRect(x0 - 44, eq - 70, 88, 140);
  }
  note(ctx, `free.${st.damp}`, x0, 290, 'center');
  const T0 = TAU * Math.sqrt(FREE.m / FREE.k);
  label(ctx, `T0 = ${qty(T0, 3, 's')}`, 400, 40, { size: 14, weight: 800 });
  const T = pseudoT(st.ups);
  label(ctx, `T = ${T ? qty(T, 3, 's') : '…'}`, 400, 66, { size: 14, weight: 800, color: C.x() });
  note(ctx, 'free.Tnote', 400, 92, 'center');
  plotCurves(ctx, {
    x: 200, y: 120, w: 388, h: 308, xMin: Math.max(0, st.t - 8), xMax: Math.max(8, st.t), yMin: -6, yMax: 6, xLabel: 't (s)', yLabel: 'x (cm)', xStep: 1, yStep: 2,
    curves: st.hist.length ? [{ f: histFn(st.hist), color: C.x(), label: 'x' }] : [],
  });
}

/* ---------- Tab 2: horizontal elastic pendulum ---------- */
function drawHoriz(ctx, st) {
  const h = horiz(st);
  const x = st.run || st.t > 0 ? h.xm * Math.sin(h.w0 * st.t + h.phi) : st.x0 / 100;
  const v = st.run || st.t > 0 ? h.w0 * h.xm * Math.cos(h.w0 * st.t + h.phi) : st.v0;
  const ox = 300, y = 110, k = (ox - 22 - 54) / L0H; // px per m: the drawn spring has its natural length ℓ0 = 25 cm at O
  ctx.fillStyle = cssVar('--bench'); ctx.fillRect(40, y + 20, 520, 8);
  ctx.fillStyle = cssVar('--wood'); ctx.fillRect(40, y - 40, 14, 60);
  spring(ctx, 54, y, ox + x * k - 22, y, 16, 9);
  ctx.fillStyle = cssVar('--s3'); roundRect(ctx, ox + x * k - 22, y - 20, 44, 40, 5); ctx.fill();
  label(ctx, '(B)', ox + x * k, y, { size: 11, weight: 800, color: '#fff', halo: false });
  ctx.save(); ctx.strokeStyle = cssVar('--muted'); ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(ox, y - 44); ctx.lineTo(ox, y + 44); ctx.stroke(); ctx.restore();
  label(ctx, 'O', ox, y + 52, { size: 13, weight: 800 });
  ctx.strokeStyle = cssVar('--text'); ctx.fillStyle = cssVar('--text'); ctx.lineWidth = 1.5;
  arrow(ctx, ox, y + 70, ox + 50, y + 70, 7); label(ctx, 'i', ox + 26, y + 82, { size: 12, weight: 800 });
  if (Math.abs(v) > 0.005) {
    ctx.strokeStyle = C.v(); ctx.fillStyle = C.v(); ctx.lineWidth = 2.5;
    arrow(ctx, ox + x * k, y - 30, ox + x * k + v * 260, y - 30, 8);
    label(ctx, 'v', ox + x * k + v * 260 + (v > 0 ? 10 : -10), y - 42, { size: 13, weight: 800, color: C.v() });
  }
  const tw = Math.max(2 * h.T0, 3), t0 = Math.max(0, st.t - tw);
  const xmc = h.xm * 100;
  plotCurves(ctx, {
    x: 12, y: 200, w: 340, h: 258, xMin: t0, xMax: t0 + tw, yMin: -Math.max(6, xmc * 1.15), yMax: Math.max(6, xmc * 1.15), xLabel: 't (s)', yLabel: 'x (cm)',
    curves: [{ f: (tt) => (tt <= st.t ? 100 * h.xm * Math.sin(h.w0 * tt + h.phi) : NaN), color: C.x(), label: 'x(t)' }],
    marker: st.t,
  });
  // energies against x (Figure 4.17)
  const Em = 0.5 * st.K * h.xm ** 2 * 1000; // mJ
  plotCurves(ctx, {
    x: 360, y: 200, w: 228, h: 258, xMin: -xmc * 1.1, xMax: xmc * 1.1, yMin: 0, yMax: Em * 1.2, xLabel: 'x (cm)', yLabel: 'E (mJ)',
    curves: [
      { f: (xc) => (Math.abs(xc) <= xmc + 1e-9 ? 0.5 * st.K * (xc / 100) ** 2 * 1000 : NaN), color: C.Ep(), label: 'Ep' },
      { f: (xc) => (Math.abs(xc) <= xmc + 1e-9 ? Em - 0.5 * st.K * (xc / 100) ** 2 * 1000 : NaN), color: C.Ek(), label: 'Ek' },
      { f: () => Em, color: C.Em(), dash: true, label: 'Em' },
    ],
    marker: x * 100,
  });
}

/* ---------- Tab 3: torsion pendulum (GS) ---------- */
function drawTorsion(ctx, st) {
  const I = torsionI(st), w0 = Math.sqrt(st.C / I), thm = st.thm * D2R;
  const th = thm * Math.cos(w0 * st.t);
  // side view only (teacher feedback, 15 Nov 2026): the eye is slightly above the plane of the rod, so the horizontal circle
  // described by the ends looks like an ellipse; the rod turns about the vertical wire OO′.
  const cx = 300, top = 34, cy = 140, half = st.l * 3.4, k = 0.26, a0 = 25 * D2R;
  support(ctx, cx, top, 110);
  const P = (a, sgn) => [cx + sgn * half * Math.cos(a), cy + sgn * k * half * Math.sin(a)];
  ctx.save(); ctx.strokeStyle = cssVar('--muted'); ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.ellipse(cx, cy, half, k * half, 0, 0, TAU); ctx.stroke();
  const r0a = P(a0, 1), r0b = P(a0, -1);
  ctx.beginPath(); ctx.moveTo(r0b[0], r0b[1]); ctx.lineTo(r0a[0], r0a[1]); ctx.stroke(); ctx.restore();
  label(ctx, t('tor.rest'), r0a[0] + 8, r0a[1] + 14, { size: 11, weight: 600, color: cssVar('--muted'), align: 'left' });
  const A = P(a0 + th, 1), B = P(a0 + th, -1); // A is the far end (sin > 0 → lower on the screen is nearer: B is near)
  const far = A[1] < B[1] ? A : B, near = far === A ? B : A;
  ctx.lineCap = 'round';
  ctx.strokeStyle = cssVar('--s3'); ctx.lineWidth = 9;
  ctx.beginPath(); ctx.moveTo(far[0], far[1]); ctx.lineTo(cx, cy); ctx.stroke();
  ctx.strokeStyle = cssVar('--metal'); ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(cx, top); ctx.lineTo(cx, cy); ctx.stroke();
  ctx.strokeStyle = cssVar('--s3'); ctx.lineWidth = 11;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(near[0], near[1]); ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.fillStyle = cssVar('--text'); ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, TAU); ctx.fill();
  label(ctx, 'O′', cx + 10, top + 8, { size: 12, weight: 800, align: 'left' });
  label(ctx, 'O', cx + 8, cy - 14, { size: 12, weight: 800, align: 'left' });
  note(ctx, 'tor.side', cx, 196, 'center');
  label(ctx, `θ = ${qty(th / D2R, 1, '°')}`, 560, 50, { size: 14, weight: 800, align: 'right' });
  const tw = Math.max(2 * TAU / w0, 3), t0 = Math.max(0, st.t - tw);
  plotCurves(ctx, {
    x: 12, y: 210, w: 576, h: 218, xMin: t0, xMax: t0 + tw, yMin: -st.thm * 1.2, yMax: st.thm * 1.2, xLabel: 't (s)', yLabel: 'θ (°)',
    curves: [{ f: (tt) => (tt <= st.t ? st.thm * Math.cos(w0 * tt) : NaN), color: C.x(), label: 'θ(t)' }],
    marker: st.t,
  });
}

/* ---------- Tab 4: compound and simple pendulum (GS) ---------- */
function drawCompound(ctx, st) {
  const px = 140, py = 40;
  ctx.fillStyle = cssVar('--wood'); ctx.fillRect(px - 50, py - 12, 100, 10);
  ctx.save(); ctx.strokeStyle = cssVar('--muted'); ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py + 170); ctx.stroke(); ctx.restore();
  const s = Math.sin(st.th), c = Math.cos(st.th);
  if (st.mode === 'compound') {
    const k = 85; // px per m
    const A = [px + k * s, py + k * c];
    const Bx = px - st.OB * k * s, By = py - st.OB * k * c;
    ctx.strokeStyle = cssVar('--metal'); ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(Bx - 0.15 * k * s, By - 0.15 * k * c); ctx.lineTo(A[0], A[1]); ctx.stroke();
    ctx.fillStyle = cssVar('--s2'); ctx.beginPath(); ctx.arc(A[0], A[1], 9, 0, TAU); ctx.fill();
    ctx.fillStyle = cssVar('--s1'); ctx.beginPath(); ctx.arc(Bx, By, 9, 0, TAU); ctx.fill();
    label(ctx, 'A', A[0] + 14, A[1], { size: 12, weight: 800 });
    label(ctx, 'B', Bx + 14, By, { size: 12, weight: 800 });
    const { a } = comp(st);
    ctx.strokeStyle = cssVar('--s6'); ctx.lineWidth = 2;
    const Gx = px + a * k * s, Gy = py + a * k * c;
    ctx.beginPath(); ctx.moveTo(Gx - 5, Gy - 5); ctx.lineTo(Gx + 5, Gy + 5); ctx.moveTo(Gx - 5, Gy + 5); ctx.lineTo(Gx + 5, Gy - 5); ctx.stroke();
    label(ctx, 'G', Gx - 12, Gy, { size: 12, weight: 800, color: cssVar('--s6') });
  } else {
    const k = 150 / 2; // 2 m ↔ 150 px
    const Lp = st.L * k;
    ctx.strokeStyle = cssVar('--thread'); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Lp * s, py + Lp * c); ctx.stroke();
    ctx.fillStyle = cssVar('--s3'); ctx.beginPath(); ctx.arc(px + Lp * s, py + Lp * c, 9, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = cssVar('--text'); ctx.beginPath(); ctx.arc(px, py, 4, 0, TAU); ctx.fill();
  label(ctx, 'O', px - 12, py + 6, { size: 12, weight: 800 });
  const T0 = comp(st).T0, T = pseudoT(st.ups);
  label(ctx, `T0 = 2π √(…) = ${qty(T0, 3, 's')}`, 420, 50, { size: 13, weight: 800 });
  label(ctx, `${t('cp.measured')} ${T ? qty(T, 3, 's') : '…'}`, 420, 78, { size: 13, weight: 800, color: C.x() });
  note(ctx, st.thm <= 10 ? 'cp.small' : 'cp.large', 420, 104, 'center');
  plotCurves(ctx, {
    x: 12, y: 220, w: 576, h: 208, xMin: Math.max(0, st.t - 8), xMax: Math.max(8, st.t), yMin: -st.thm * 1.15, yMax: st.thm * 1.15, xLabel: 't (s)', yLabel: 'θ (°)', xStep: 1,
    curves: st.hist.length ? [{ f: histFn(st.hist), color: C.x(), label: 'θ(t)' }] : [],
  });
}

/* ---------- Tab 5: driven oscillations (clock) ---------- */
function drawDriven(ctx, st) {
  const px = 130, py = 34, Lp = 150;
  // clock case
  ctx.fillStyle = cssVar('--wood'); roundRect(ctx, px - 70, py - 24, 140, 210, 12); ctx.fill();
  ctx.fillStyle = cssVar('--scene-bg'); roundRect(ctx, px - 58, py - 10, 116, 186, 8); ctx.fill();
  const s = Math.sin(st.th), c = Math.cos(st.th);
  ctx.strokeStyle = cssVar('--metal'); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Lp * s, py + Lp * c); ctx.stroke();
  ctx.fillStyle = cssVar('--s4'); ctx.beginPath(); ctx.arc(px + Lp * s, py + Lp * c, 16, 0, TAU); ctx.fill();
  // escapement wheel
  ctx.save(); ctx.translate(px, py); ctx.rotate(st.kicks * 0.26);
  ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < 24; i++) { const a = (i * TAU) / 24, r = i % 2 ? 9 : 13; ctx.lineTo(r * Math.cos(a), r * Math.sin(a)); }
  ctx.closePath(); ctx.stroke(); ctx.restore();
  if (st.drive && st.t - (st.kickT ?? -1) < 0.15) label(ctx, t('dr.tick'), px + 40, py + 60, { size: 13, weight: 800, color: cssVar('--accent') });
  note(ctx, st.drive ? 'dr.on' : 'dr.off', px, 250, 'center');
  label(ctx, `${t('dr.kicks')} ${st.kicks}`, px, 280, { size: 13, weight: 800 });
  plotCurves(ctx, {
    x: 270, y: 20, w: 318, h: 388, xMin: Math.max(0, st.t - 10), xMax: Math.max(10, st.t), yMin: -15, yMax: 15, xLabel: 't (s)', yLabel: 'θ (°)', xStep: 2, yStep: 5,
    curves: st.hist.length ? [{ f: histFn(st.hist), color: C.x(), label: 'θ(t)' }] : [],
  });
}

/* ---------- Tab 6: experimental verification (vertical elastic pendulum, Exp. 4.3) ---------- */
function drawVerify(ctx, st) {
  const x0 = 140, top = 40;
  support(ctx, x0, top, 90);
  const T = vertT(st), k = vertK(st), m = st.mass / 1000;
  const stretch = (m * g) / k; // static elongation Δl
  const amp = 0.03;
  const yEq = 150 + stretch * 250;
  const y = yEq + (st.run || st.t > 0 ? amp * 600 * Math.cos((TAU * st.t) / T) : 0);
  spring(ctx, x0, top, x0, y - 18, 14, st.spring === 'a' ? 10 : 8, st.spring === 'a' ? cssVar('--spring-coil') : cssVar('--s5'));
  const hgt = 18 + st.mass * 0.18;
  ctx.fillStyle = cssVar('--metal'); roundRect(ctx, x0 - 16, y - 18, 32, hgt, 4); ctx.fill();
  label(ctx, `${st.mass} g`, x0, y - 18 + hgt / 2, { size: 10, weight: 800, color: '#fff', halo: false });
  // stopwatch
  const sx = 400, sy = 150, r = 70;
  ctx.fillStyle = cssVar('--surface'); ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = cssVar('--text'); ctx.fillRect(sx - 8, sy - r - 16, 16, 12);
  const tt = st.t;
  ctx.strokeStyle = cssVar('--accent'); ctx.lineWidth = 2.5;
  const a = -Math.PI / 2 + (TAU * (tt % 60)) / 60;
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + (r - 10) * Math.cos(a), sy + (r - 10) * Math.sin(a)); ctx.stroke();
  label(ctx, qty(tt, 2, 's'), sx, sy + 32, { size: 16, weight: 800 });
  label(ctx, `${t('ver.count')} ${st.count} / 25`, sx, sy + r + 30, { size: 14, weight: 800, color: C.x() });
  note(ctx, st.done ? 'ver.done' : 'ver.ready', 300, HEIGHTS.verify - 20, 'center');
}

/* ================================================================
   Controls and measurements
   ================================================================ */
const controlsBody = document.getElementById('controls-body');
const measuresBody = document.getElementById('measures-body');
let ui = {};
let tableSig = '';
function measRows(dl, rows) { dl.replaceChildren(...rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)])); }
function showStatus(box, fb) {
  if (!fb) { box.hidden = true; return; }
  box.hidden = false; box.className = `status ${fb.type || ''}`; box.textContent = t(fb.key, fb.params);
}
function hint(key) { return el('p', { class: 'muted', style: 'font-size:0.88rem;margin:10px 0 0', dataset: { i18n: key } }, t(key)); }
const btnRow = (...b) => el('div', { class: 'btn-row' }, b);
const resetBtn = (id) => btnRow(createButton({ labelKey: 'ui.reset', variant: 'ghost', onClick: () => resetTab(id) }));
const fbOf = (res, okKey, badKey) => (res === 'invalid' ? { type: 'warn', key: 'calcInvalid' } : res === 'wrong' ? { type: 'bad', key: badKey } : { type: 'good', key: okKey });
const relTol = (v, p, min = 1e-9) => Math.max(Math.abs(v) * p, min);
function tableBlock(st) {
  ui.dl = el('dl', { class: 'meas' });
  ui.tableWrap = el('div', { class: 'table-scroll' });
  ui.table = el('table', { class: 'data' });
  ui.tableWrap.append(ui.table);
  ui.clear = el('div', { class: 'btn-row', style: 'margin-top:8px' }, [createButton({ labelKey: 'ctl.clearTable', variant: 'ghost', onClick: () => { st.rows = []; st.fb = null; refresh(); } })]);
  ui.status = el('p', { class: 'status', hidden: '' });
  measuresBody.append(ui.dl, ui.tableWrap, ui.clear, ui.status);
}
function renderTable(st, rows, cols, rowFn) {
  const sig = calcSig(rows) + rows.length + cols.join();
  if (sig !== tableSig) {
    ui.table.replaceChildren(el('thead', {}, el('tr', {}, cols.map((k) => el('th', {}, t(k))))), el('tbody', {}, rows.map(rowFn)));
    tableSig = sig;
  }
  ui.tableWrap.hidden = rows.length === 0;
  ui.clear.hidden = ui.tableWrap.hidden;
  showStatus(ui.status, st.fb);
}
const cell = (st, r, key, expected, decimals, tol, okKey, badKey, disabled = false) =>
  calcCell(r, key, { expected, decimals, tol, disabled, onCheck: (res) => { st.fb = fbOf(res, okKey, badKey); refresh(); } });
const td = (v) => el('td', {}, v);
const recordBtn = (fn) => createButton({ labelKey: 'ctl.record', variant: 'secondary', onClick: fn });
function goButton(st, startKey, onStart) {
  return createButton({ labelKey: startKey, variant: 'primary', onClick: () => { if (!st.run && onStart) onStart(); st.run = !st.run; refresh(); } });
}
function setGo(st, startKey, done = false) {
  const key = st.run ? 'ctl.pause' : st.t > 0 && !done ? 'ctl.continue' : startKey;
  if (ui.go.dataset.i18n !== key) { ui.go.dataset.i18n = key; ui.go.textContent = t(key); }
}
const sliderEl = (st, key, prop, min, max, step, unit, dec, after) => createSlider({ labelKey: key, min, max, step, value: st[prop], unit, decimals: dec, onInput: (v) => { st[prop] = v; after?.(); refresh(); } }).root;

/* ---------- Tab 1 ---------- */
function buildFree() {
  const st = S.free;
  const again = () => Object.assign(st, { x: 0.05, v: 0, t: 0, run: false, hist: [], ups: [] });
  ui.d = createSegmented({ labelKey: 'ctl.damp', options: Object.keys(DAMP).map((v) => ({ value: v, labelKey: `free.${v}` })), value: st.damp, onChange: (v) => { st.damp = v; again(); refresh(); } });
  ui.go = goButton(st, 'ctl.release');
  controlsBody.append(ui.d.root, btnRow(ui.go, createButton({ labelKey: 'ctl.again', variant: 'ghost', onClick: () => { again(); refresh(); } })), hint('hint.free'), resetBtn('free'));
  ui.dl = el('dl', { class: 'meas' }); measuresBody.append(ui.dl);
}
function updateFree() {
  const st = S.free;
  setGo(st, 'ctl.release');
  const T = pseudoT(st.ups);
  measRows(ui.dl, [[t('m.k'), qty(FREE.k, 2, 'N/m')], [t('m.m'), qty(FREE.m * 1000, 0, 'g')], [t('m.T0'), qty(TAU * Math.sqrt(FREE.m / FREE.k), 3, 's')],
    [t('m.Tpseudo'), T ? qty(T, 3, 's') : '—'], [t('m.x'), qty(st.x * 100, 2, 'cm')]]);
}

/* ---------- Tab 2 ---------- */
function buildHoriz() {
  const st = S.horizontal;
  const again = () => { st.t = 0; st.run = false; };
  ui.go = goButton(st, 'ctl.release', () => { if (st.t > 59) st.t = 0; });
  ui.warn = el('p', { class: 'status bad', hidden: '' });
  controlsBody.append(
    sliderEl(st, 'ctl.K', 'K', 1, 10, 0.2, 'N/m', 1, again), sliderEl(st, 'ctl.mB', 'm', 0.1, 1, 0.05, 'kg', 2, again),
    sliderEl(st, 'ctl.x0', 'x0', -5, 5, 0.5, 'cm', 1, again), sliderEl(st, 'ctl.v0', 'v0', -0.4, 0.4, 0.05, 'm/s', 2, again),
    btnRow(ui.go, ui.rec = recordBtn(() => { if (tooBig(st)) return; st.rows.push({ K: st.K, m: st.m, x0: st.x0, v0: st.v0 }); st.fb = null; refresh(); }), createButton({ labelKey: 'ctl.again', variant: 'ghost', onClick: () => { again(); refresh(); } })),
    ui.warn, hint('hint.horizontal'), resetBtn('horizontal'));
  tableBlock(st);
}
function updateHoriz() {
  const st = S.horizontal, h = horiz(st);
  setGo(st, 'ctl.release');
  const big = tooBig(st);
  if (big) st.run = false;
  ui.go.disabled = big; ui.rec.disabled = big;
  ui.warn.hidden = !big;
  if (big) ui.warn.textContent = `⚠ ${t('hor.tooBig', { xm: qty(h.xm * 100, 1, 'cm') })}`;
  const x = st.t > 0 ? h.xm * Math.sin(h.w0 * st.t + h.phi) : st.x0 / 100;
  measRows(ui.dl, [[t('m.t'), qty(st.t, 2, 's')], [t('m.x'), qty(x * 100, 2, 'cm')], [t('m.T0'), qty(h.T0, 3, 's')]]);
  renderTable(st, st.rows, ['col.K', 'col.mB', 'col.x0', 'col.v0', 'col.w0', 'col.xm', 'col.phi'], (r) => {
    const hh = horiz(r);
    return el('tr', {}, [td(num(r.K, 1)), td(num(r.m, 2)), td(num(r.x0 / 100, 3)), td(num(r.v0, 2)),
      cell(st, r, 'w', hh.w0, 2, relTol(hh.w0, 0.01), 'fb.w0Ok', 'fb.w0Wrong'),
      cell(st, r, 'x', hh.xm * 100, 2, relTol(hh.xm * 100, 0.01, 0.02), 'fb.xmOk', 'fb.xmWrong', !calcDone(r, 'w')),
      cell(st, r, 'p', hh.phi, 2, 0.02, 'fb.phiOk', 'fb.phiWrong', !calcDone(r, 'x'))]);
  });
}

/* ---------- Tab 3 ---------- */
function buildTorsion() {
  const st = S.torsion;
  const again = () => { st.t = 0; st.run = false; };
  ui.go = goButton(st, 'ctl.release', () => { if (st.t > 59) st.t = 0; });
  controlsBody.append(sliderEl(st, 'ctl.C', 'C', 0.05, 0.2, 0.002, 'm·N', 3, again), sliderEl(st, 'ctl.l', 'l', 20, 50, 2, 'cm', 0, again), sliderEl(st, 'ctl.thm', 'thm', 2, 10, 1, '°', 0, again),
    btnRow(ui.go, recordBtn(() => { st.rows.push({ C: st.C, l: st.l }); st.fb = null; refresh(); }), createButton({ labelKey: 'ctl.again', variant: 'ghost', onClick: () => { again(); refresh(); } })),
    hint('hint.torsion'), resetBtn('torsion'));
  tableBlock(st);
}
function updateTorsion() {
  const st = S.torsion, I = torsionI(st), w0 = Math.sqrt(st.C / I);
  setGo(st, 'ctl.release');
  measRows(ui.dl, [[t('m.rod'), `${qty(400, 0, 'g')}, ${qty(st.l, 0, 'cm')}`], [t('m.C'), qty(st.C, 3, 'm·N')], [t('m.t'), qty(st.t, 2, 's')],
    [t('m.Ep'), qty(0.5 * st.C * (st.thm * D2R * Math.cos(w0 * st.t)) ** 2 * 1e4, 2, '× 10⁻⁴ J')]]);
  renderTable(st, st.rows, ['col.C', 'col.l', 'col.I', 'col.w0', 'col.T0'], (r) => {
    const Ir = torsionI(r), w = Math.sqrt(r.C / Ir);
    return el('tr', {}, [td(num(r.C, 3)), td(num(r.l / 100, 2)),
      cell(st, r, 'I', Ir * 1000, 2, relTol(Ir * 1000, 0.01), 'fb.ItOk', 'fb.ItWrong'),
      cell(st, r, 'w', w, 2, relTol(w, 0.01), 'fb.wtOk', 'fb.wtWrong', !calcDone(r, 'I')),
      cell(st, r, 'T', TAU / w, 2, relTol(TAU / w, 0.01), 'fb.T0Ok', 'fb.T0Wrong', !calcDone(r, 'w'))]);
  });
}

/* ---------- Tab 4 ---------- */
function resetComp(st) { Object.assign(st, { th: st.thm * D2R, w: 0, t: 0, run: false, ups: [], hist: [] }); }
function buildCompound() {
  const st = S.compound;
  const again = () => resetComp(st);
  ui.mode = createSegmented({ labelKey: 'ctl.pend', options: [{ value: 'compound', labelKey: 'cp.compound' }, { value: 'simple', labelKey: 'cp.simple' }], value: st.mode,
    onChange: (v) => { st.mode = v; st.fb = null; resetComp(st); buildTab('compound'); } });
  controlsBody.append(ui.mode.root);
  if (st.mode === 'compound') controlsBody.append(sliderEl(st, 'ctl.OB', 'OB', 0, 0.8, 0.1, 'm', 1, again));
  else controlsBody.append(sliderEl(st, 'ctl.L', 'L', 0.2, 2, 0.05, 'm', 2, again));
  controlsBody.append(sliderEl(st, 'ctl.thmC', 'thm', 5, 60, 5, '°', 0, again));
  ui.go = goButton(st, 'ctl.release');
  controlsBody.append(btnRow(ui.go, recordBtn(() => { st.rows.push(st.mode === 'compound' ? { mode: 'compound', OB: st.OB } : { mode: 'simple', L: st.L }); st.fb = null; refresh(); }),
    createButton({ labelKey: 'ctl.again', variant: 'ghost', onClick: () => { again(); refresh(); } })), hint(`hint.${st.mode}`), resetBtn('compound'));
  tableBlock(st);
}
function updateCompound() {
  const st = S.compound, c = comp(st);
  setGo(st, 'ctl.release');
  const T = pseudoT(st.ups);
  const rows = st.rows.filter((r) => r.mode === st.mode);
  if (st.mode === 'compound') {
    measRows(ui.dl, [[t('m.masses'), `2 × ${qty(0.1, 1, 'kg')}`], [t('m.OA'), qty(1, 1, 'm')], [t('m.OB'), qty(st.OB, 1, 'm')], [t('m.T0'), qty(c.T0, 3, 's')], [t('m.Tmeas'), T ? qty(T, 3, 's') : '—']]);
    renderTable(st, rows, ['col.OB', 'col.Ic', 'col.a', 'col.T0'], (r) => {
      const cc = comp({ mode: 'compound', OB: r.OB });
      return el('tr', {}, [td(num(r.OB, 1)),
        cell(st, r, 'I', cc.I, 3, relTol(cc.I, 0.01), 'fb.IcOk', 'fb.IcWrong'),
        cell(st, r, 'a', cc.a, 2, 0.006, 'fb.aOk', 'fb.aWrong', !calcDone(r, 'I')),
        cell(st, r, 'T', cc.T0, 2, relTol(cc.T0, 0.01), 'fb.T0cOk', 'fb.T0cWrong', !calcDone(r, 'a'))]);
    });
  } else {
    measRows(ui.dl, [[t('m.L'), qty(st.L, 2, 'm')], [t('m.T0'), qty(c.T0, 3, 's')], [t('m.Tmeas'), T ? qty(T, 3, 's') : '—']]);
    renderTable(st, rows, ['col.L', 'col.T0'], (r) => el('tr', {}, [td(num(r.L, 2)),
      cell(st, r, 'T', TAU * Math.sqrt(r.L / g), 2, relTol(TAU * Math.sqrt(r.L / g), 0.01), 'fb.T0sOk', 'fb.T0sWrong')]));
  }
}

/* ---------- Tab 5 ---------- */
function buildDriven() {
  const st = S.driven;
  ui.drive = createSegmented({ labelKey: 'ctl.drive', options: [{ value: 'yes', labelKey: 'dr.yes' }, { value: 'no', labelKey: 'dr.no' }], value: st.drive ? 'yes' : 'no',
    onChange: (v) => { st.drive = v === 'yes'; refresh(); } });
  ui.go = goButton(st, 'ctl.start');
  controlsBody.append(ui.drive.root, btnRow(ui.go, createButton({ labelKey: 'ctl.again', variant: 'ghost', onClick: () => { Object.assign(st, initialState('driven'), { drive: st.drive }); refresh(); } })), hint('hint.driven'), resetBtn('driven'));
  ui.dl = el('dl', { class: 'meas' }); measuresBody.append(ui.dl);
}
function updateDriven() {
  const st = S.driven;
  setGo(st, 'ctl.start');
  const amp = Math.acos(Math.max(-1, 1 - (1 - Math.cos(st.th) + (st.w * st.w) / (2 * g / DRIVE.L)))) / D2R;
  measRows(ui.dl, [[t('m.drive'), t(st.drive ? 'dr.yes' : 'dr.no')], [t('m.amp'), qty(amp, 1, '°')], [t('m.kicks'), String(st.kicks)],
    [t('m.lastKick'), st.kicks ? qty(st.lastKick * 100, 1, '%') : '—']]);
}

/* ---------- Tab 6 ---------- */
function buildVerify() {
  const st = S.verify;
  const again = () => Object.assign(st, { t: 0, run: false, count: 0, done: false });
  ui.sp = createSegmented({ labelKey: 'ctl.spring', options: [{ value: 'a', labelKey: 'ver.a' }, { value: 'b', labelKey: 'ver.b' }], value: st.spring, onChange: (v) => { st.spring = v; again(); refresh(); } });
  ui.mass = createSegmented({ labelKey: 'ctl.mass', options: [50, 70, 90, 110, 130].map((v) => ({ value: v, labelKey: `mass.${v}` })), value: st.mass, onChange: (v) => { st.mass = Number(v); again(); refresh(); } });
  ui.go = createButton({ labelKey: 'ctl.measure', variant: 'primary', onClick: () => { if (st.done) again(); st.run = !st.run; refresh(); } });
  ui.rec = recordBtn(() => {
    if (!st.done) { st.fb = { type: 'warn', key: 'fb.not25' }; refresh(); return; }
    st.rows.push({ spring: st.spring, mass: st.mass, t25: Math.round(st.t * 100) / 100 }); st.fb = null; refresh();
  });
  controlsBody.append(ui.sp.root, ui.mass.root, btnRow(ui.go, ui.rec), hint('hint.verify'), resetBtn('verify'));
  tableBlock(st);
}
function updateVerify() {
  const st = S.verify;
  const key = st.run ? 'ctl.pause' : st.done ? 'ctl.again' : st.t > 0 ? 'ctl.continue' : 'ctl.measure';
  if (ui.go.dataset.i18n !== key) { ui.go.dataset.i18n = key; ui.go.textContent = t(key); }
  measRows(ui.dl, [[t('m.springUsed'), t(`ver.${st.spring}`)], [t('m.mass'), qty(st.mass, 0, 'g')], [t('m.t25'), st.done ? qty(Math.round(st.t * 100) / 100, 2, 's') : '—']]);
  const rows = st.rows.filter((r) => r.spring === st.spring);
  renderTable(st, rows, ['col.mass', 'col.t25', 'col.T', 'col.ratio'], (r) => {
    const T = r.t25 / 25, ratio = T / Math.sqrt(r.mass / 1000);
    return el('tr', {}, [td(num(r.mass / 1000, 3)), td(num(r.t25, 2)),
      cell(st, r, 'T', T, 3, relTol(T, 0.006), 'fb.TOk', 'fb.TWrong'),
      cell(st, r, 'r', ratio, 2, relTol(ratio, 0.015), 'fb.ratioOk', 'fb.ratioWrong', !calcDone(r, 'T'))]);
  });
}

/* ---------- Tab switching ---------- */
function buildTab(id) {
  controlsBody.replaceChildren();
  measuresBody.replaceChildren();
  ui = {};
  tableSig = '';
  ({ free: buildFree, horizontal: buildHoriz, torsion: buildTorsion, compound: buildCompound, driven: buildDriven, verify: buildVerify })[id]();
  loop.start();
  shell?.refreshActivity();
  refresh();
}
function updateMeasures() {
  if (!shell || !ui.dl) return;
  ({ free: updateFree, horizontal: updateHoriz, torsion: updateTorsion, compound: updateCompound, driven: updateDriven, verify: updateVerify })[shell.tab]();
}
function refresh() { updateMeasures(); requestDraw(); }
function resetTab(id) { S[id] = initialState(id); if (id === 'compound') resetComp(S[id]); buildTab(id); }
onLangChange(() => { if (shell) buildTab(shell.tab); });

shell = initSim({
  strings,
  tabs: TABS.map((id) => ({ id, labelKey: `tab.${id}` })),
  initialTab: 'free',
  onTab: buildTab,
  gsOnly: { torsion: true, compound: true },
  activityKey: (tab) => (tab === 'compound' ? `act.compound.${S.compound.mode}` : `act.${tab}`),
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, horiz, comp, torsionI, vertT };
