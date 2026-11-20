// Sec 3 GS-LS — Chapter 9: Self-induction. SG: whole chapter; SV: without 9.5 (growth and decay in an R-L circuit)
// and 9.7 (sparks on switching off) — tabs "rl" and "sparks" are gsOnly.
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num, qty } from '../../../shared/format.js';
import { createButton, createSegmented, createSlider, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, arrow } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { label } from '../../../shared/figures.js';
import { calcCell, calcSig, calcDone } from '../../../shared/calc-cell.js';
import { plotCurves, drawEnergyBars } from '../../../shared/energy-bars.js';
import { symLamp, symCell, symSwitch } from '../../../shared/circuit-draw.js';
import { drawScope, drawLFG } from '../../../shared/oscilloscope.js';
import { drawSolenoid } from '../../../shared/induction-draw.js';

const TAU = 2 * Math.PI;
const W = 600;
const MU0 = 4 * Math.PI * 1e-7;
const TABS = ['evidence', 'scope', 'inductance', 'rl', 'energy', 'sparks'];
const HEIGHTS = { evidence: 440, scope: 580, inductance: 440, rl: 460, energy: 440, sparks: 460 };

/* ================================================================
   Model — values not given in the book are chosen for the simulation (Info panel)
   ================================================================ */
// Exp. 9.1: DC source 9 V, lamps 6 V – 0.3 A (20 Ω), coil with an iron core L = 2 H, r = 10 Ω, rheostat set to r = 10 Ω
const EX1 = { U: 9, RL: 20, r: 10, L: 2, Inom: 0.3 };
// Exp. 9.2: square signal 0 / 2 V, coil of 300 turns L = 0.2 H, r′ = 10 Ω, resistor r = 500 Ω
const EX2 = { U: 2, L: 0.2, rc: 10, r: 500 };
// Current profile of the "self-induced e.m.f." mode: [t (ms), i (A)] corners
const PROFILE = [[0, 0], [2, 2], [5, 2], [6, 0], [8, -1], [10, -1]];
// Application 9.4: E = 10 V, generator r′ = 1 Ω, coil r = 4 Ω, L = 1.2 H
const AP4 = { E: 10, rg: 1, r: 4, L: 1.2 };
const PROT = { diodeR: 10, C: 1e-3 }; // protection: diode + 10 Ω across the coil, or 1 mF across the switch (chosen)

function initialState(tab) {
  switch (tab) {
    case 'evidence': return { closed: false, i1: 0, i2: 0, t: 0, slow: true, hist: [] };
    case 'scope': return { f: 250, vb: 0.0005, rows: [], fb: null };
    case 'inductance': return { mode: 'solenoid', N: 1000, len: 30, rad: 1.5, L: 50, seg: 0, rows: [], fb: null };
    case 'rl': return { L: 0.1, R: 500, E: 5, phase: 'off', i: 0, t: 0, i0: 0, rows: [], fb: null };
    case 'energy': return { L: 0.5, E: 6, phase: 'off', i: 0, t: 0, W: 0, Q: 0, rows: [], fb: null };
    default: return { prot: 'none', dt: 4.8, phase: 'closed', t: 0, i: 2, hist: [], spark: 0, rows: [], fb: null };
  }
}
let S = Object.fromEntries(TABS.map((k) => [k, initialState(k)]));
const R_EN = 10; // Ω, circuit of the energy tab

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

const loop = createLoop({
  step(dt) {
    if (!shell) return false;
    const tab = shell.tab, st = S[tab];
    if (tab === 'evidence') {
      const h = (st.slow ? dt / 20 : dt) / 10;
      for (let k = 0; k < 10; k++) {
        if (st.closed) {
          st.i1 = EX1.U / (EX1.r + EX1.RL);
          st.i2 += ((EX1.U - (EX1.r + EX1.RL) * st.i2) / EX1.L) * h;
        } else {
          // K open: the coil keeps its current flowing round the loop (coil, lamp A2, lamp A1, rheostat)
          st.i2 += (-(2 * (EX1.r + EX1.RL)) * st.i2 / EX1.L) * h;
          st.i1 = -st.i2;
        }
        st.t += h;
      }
      st.hist.push([st.t * 1000, st.i1, st.i2]);
      while (st.hist.length && st.hist[0][0] < st.t * 1000 - 400) st.hist.shift();
      return true;
    }
    if (tab === 'rl' || tab === 'energy') {
      if (st.phase === 'off' || st.phase === 'done' || st.phase === 'on') return false;
      const R = tab === 'rl' ? st.R : R_EN, tau = st.L / R, I = st.E / R;
      const slow = tab === 'rl' ? tau / 0.5 : tau / 1; // 1 τ of the circuit lasts 0.5 s (or 1 s) on the screen
      const h = (dt * slow) / 20;
      for (let k = 0; k < 20; k++) {
        const prev = st.i;
        st.t += h;
        st.i = st.phase === 'grow' ? I + (st.i0 - I) * Math.exp(-st.t / tau) : st.i0 * Math.exp(-st.t / tau);
        const im = (prev + st.i) / 2;
        if (tab === 'energy') { if (st.phase === 'grow') st.W += st.E * im * h; st.Q += R * im * im * h; }
      }
      if (st.t > 6 * tau) { st.phase = st.phase === 'grow' ? 'on' : 'done'; refresh(); }
      return true;
    }
    if (tab === 'sparks') {
      if (st.phase !== 'opening') { st.spark = Math.max(0, st.spark - dt * 2); return st.spark > 0; }
      const h = (dt * 0.004) / 10; // 1 s on the screen = 4 ms
      for (let k = 0; k < 10; k++) { st.t += h; sparkStep(st, h); }
      st.hist.push([st.t * 1000, st.vk, st.i]);
      if (st.t > 0.03) { st.phase = 'open'; refresh(); }
      return true;
    }
    return false;
  },
  render() { draw(); updateMeasures(); },
});

// Application 9.4 after K opens: the current falls linearly to 0 in Δt (no protection), or flows through the protection
function sparkStep(st, h) {
  const I0 = AP4.E / (AP4.rg + AP4.r), T = st.dt / 1000;
  if (st.prot === 'none') {
    st.i = st.t < T ? I0 * (1 - st.t / T) : 0;
    const e = st.t < T ? AP4.L * I0 / T : 0;
    st.vk = st.t < T ? AP4.E + e : AP4.E; // voltage across the open switch ≈ E + e (book: 510 V)
    if (st.vk > 300) st.spark = 1;
  } else if (st.prot === 'diode') {
    // the current goes on through the diode and the resistor in parallel with the coil
    st.i = I0 * Math.exp(-st.t * (AP4.r + PROT.diodeR) / AP4.L);
    st.vk = AP4.E + PROT.diodeR * st.i;
  } else {
    // capacitor across the switch: series R-L-C circuit (charge q on C)
    const R = AP4.rg + AP4.r;
    const q = st.q ?? 0;
    const di = (AP4.E - R * st.i - q / PROT.C) / AP4.L;
    st.i += di * h; st.q = q + st.i * h;
    st.vk = st.q / PROT.C;
  }
}

/* ================================================================
   Drawing helpers
   ================================================================ */
const C = { i1: () => cssVar('--s5'), i2: () => cssVar('--s1'), u: () => cssVar('--s2'), e: () => cssVar('--s3'), ink: () => cssVar('--text') };
const histFn = (hist, k) => (tt) => {
  if (!hist.length || tt < hist[0][0] || tt > hist[hist.length - 1][0]) return NaN;
  let lo = 0, hi = hist.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (hist[mid][0] <= tt) lo = mid; else hi = mid; }
  return hist[lo][k];
};
function note(ctx, key, x, y, align = 'center', params) { label(ctx, t(key, params), x, y, { size: 12, weight: 600, color: cssVar('--muted'), align }); }
// label() leaves a background-coloured stroke style: every wire and symbol sets the ink again
function ink(ctx, w = 2) { ctx.strokeStyle = C.ink(); ctx.fillStyle = C.ink(); ctx.lineWidth = w; }
function line(ctx, pts, w = 2) {
  ink(ctx, w);
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]); ctx.stroke();
}
// coil symbol between x1 and x2 on a horizontal wire (bumps), with an iron core (two lines) if core
function symCoil(ctx, x1, x2, y, { core = false, n = 5 } = {}) {
  ink(ctx);
  const w = (x2 - x1) / n;
  ctx.beginPath(); ctx.moveTo(x1, y);
  for (let k = 0; k < n; k++) ctx.arc(x1 + w * (k + 0.5), y, w / 2, Math.PI, 0, false);
  ctx.stroke();
  if (core) { ctx.beginPath(); ctx.moveTo(x1, y - w / 2 - 6); ctx.lineTo(x2, y - w / 2 - 6); ctx.moveTo(x1, y - w / 2 - 10); ctx.lineTo(x2, y - w / 2 - 10); ctx.stroke(); }
}
function symRes(ctx, x1, x2, y, rheo = false) {
  ink(ctx);
  ctx.fillStyle = cssVar('--scene-bg'); ctx.fillRect(x1, y - 9, x2 - x1, 18); ctx.strokeRect(x1, y - 9, x2 - x1, 18);
  if (rheo) arrow(ctx, x1 + 4, y + 18, x2 - 4, y - 18, 7);
}
function glowLamp(ctx, x, y, b) {
  if (b > 0.01) {
    const g = ctx.createRadialGradient(x, y, 4, x, y, 18 + 34 * b);
    g.addColorStop(0, `rgba(255,214,70,${0.95 * Math.min(1, b)})`); g.addColorStop(1, 'rgba(255,214,70,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 18 + 34 * b, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = cssVar('--scene-bg'); ctx.beginPath(); ctx.arc(x, y, 15, 0, TAU); ctx.fill();
  ctx.strokeStyle = C.ink(); ctx.lineWidth = 2; symLamp(ctx, x, y, b > 0.3);
}
function curArrow(ctx, x, y, dir, color, txt, i) {
  if (Math.abs(i) < 1e-4) return;
  const s = Math.sign(i) * dir;
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2.2;
  arrow(ctx, x - 14 * s, y, x + 14 * s, y, 8);
  label(ctx, txt, x, y - 14, { size: 13, weight: 800, color });
}

function draw() {
  if (!shell) return;
  const tab = shell.tab;
  if (view.height !== HEIGHTS[tab]) view.setLogicalSize(W, HEIGHTS[tab]);
  const ctx = view.begin();
  ctx.fillStyle = cssVar('--scene-bg');
  roundRect(ctx, 0, 0, W, HEIGHTS[tab], 14);
  ctx.fill();
  ({ evidence: drawEvidence, scope: drawScopeTab, inductance: drawInductance, rl: drawRL, energy: drawEnergy, sparks: drawSparks })[tab](ctx, S[tab]);
}

/* ---------- Tab 1: Experiment 9.1 ---------- */
function drawEvidence(ctx, st) {
  const xL = 90, xR = 510, yT = 60, y1 = 150, y2 = 250;
  ctx.strokeStyle = C.ink(); ctx.fillStyle = C.ink(); ctx.lineWidth = 2;
  line(ctx, [[xL, y2], [xL, yT], [210, yT]]); line(ctx, [[230, yT], [330, yT]]); line(ctx, [[370, yT], [xR, yT], [xR, y2]]);
  ink(ctx); symCell(ctx, 220, yT, false);
  label(ctx, `${t('ev.source')} ${qty(EX1.U, 0, 'V')}`, 220, yT - 30, { size: 12, weight: 700 });
  ink(ctx); symSwitch(ctx, 330, 370, yT, !st.closed);
  label(ctx, 'K', 350, yT + 18, { size: 13, weight: 800 });
  // branch 1: rheostat + A1
  line(ctx, [[xL, y1], [170, y1]]); symRes(ctx, 170, 260, y1, true); line(ctx, [[260, y1], [365, y1]]); line(ctx, [[395, y1], [xR, y1]]);
  glowLamp(ctx, 380, y1, (st.i1 / EX1.Inom) ** 2);
  label(ctx, t('ev.rheo'), 215, y1 + 30, { size: 12, weight: 700 });
  label(ctx, 'A₁', 380, y1 + 30, { size: 13, weight: 800 });
  // branch 2: coil with iron core + A2
  ctx.strokeStyle = C.ink(); ctx.lineWidth = 2;
  line(ctx, [[xL, y2], [160, y2]]); symCoil(ctx, 160, 280, y2, { core: true }); line(ctx, [[280, y2], [365, y2]]); line(ctx, [[395, y2], [xR, y2]]);
  glowLamp(ctx, 380, y2, (st.i2 / EX1.Inom) ** 2);
  label(ctx, t('ev.coil'), 220, y2 + 24, { size: 12, weight: 700 });
  label(ctx, 'A₂', 380, y2 + 30, { size: 13, weight: 800 });
  ctx.fillStyle = C.ink(); for (const [x, y] of [[xL, y1], [xR, y1]]) { ctx.beginPath(); ctx.arc(x, y, 4, 0, TAU); ctx.fill(); }
  curArrow(ctx, 450, y1, 1, C.i1(), 'i₁', st.i1);
  curArrow(ctx, 450, y2, 1, C.i2(), 'i₂', st.i2);
  const t1 = st.t * 1000;
  plotCurves(ctx, {
    x: 12, y: 290, w: 576, h: 144, xMin: Math.max(0, t1 - 400), xMax: Math.max(400, t1), yMin: -0.35, yMax: 0.35, xLabel: 't (ms)', yLabel: 'i (A)', xStep: 50, yStep: 0.1,
    curves: st.hist.length ? [{ f: histFn(st.hist, 1), color: C.i1(), label: 'i₁ (A₁)' }, { f: histFn(st.hist, 2), color: C.i2(), label: 'i₂ (A₂)' }] : [],
  });
}

/* ---------- Tab 2: Experiment 9.2 on the oscilloscope ---------- */
function scopeI(st, tt) {
  // steady periodic current for a square signal 0 / U of frequency f: tt in s from a rising edge
  const R = EX2.r + EX2.rc, I = EX2.U / R, tau = EX2.L / R, T = 1 / st.f, h = T / 2;
  const a = Math.exp(-h / tau), ih = I / (1 + a), i0 = (I * a) / (1 + a);
  const u = ((tt % T) + T) % T;
  return u < h ? { v: EX2.U, i: I + (i0 - I) * Math.exp(-u / tau) } : { v: 0, i: ih * Math.exp(-(u - h) / tau) };
}
function drawScopeTab(ctx, st) {
  // circuit: L.F.G. — A — coil (L, r′) — B — resistor r — C
  const g = drawLFG(ctx, 20, 20, 140, { name: t('sc.lfg'), display: `${num(st.f, 0)} Hz`, shape: 'square' }) || {};
  void g;
  ctx.strokeStyle = C.ink(); ctx.fillStyle = C.ink(); ctx.lineWidth = 2;
  line(ctx, [[160, 50], [230, 50]]); symCoil(ctx, 230, 330, 50); line(ctx, [[330, 50], [400, 50]]);
  symRes(ctx, 400, 470, 50); line(ctx, [[470, 50], [560, 50], [560, 120], [90, 120], [90, 112]]);
  label(ctx, 'A', 226, 74, { size: 13, weight: 800 }); label(ctx, 'B', 396, 74, { size: 13, weight: 800 }); label(ctx, 'C', 560, 136, { size: 13, weight: 800 });
  label(ctx, t('sc.coil'), 280, 18, { size: 12, weight: 700 }); label(ctx, `r = ${qty(EX2.r, 0, 'Ω')}`, 435, 24, { size: 12, weight: 700 });
  const vName = t('sc.v');
  label(ctx, `${t('sc.ch1')} ${vName}AC`, 300, 150, { size: 12, weight: 800, color: cssVar('--scope-trace') });
  label(ctx, `${t('sc.ch2')} ${vName}BC`, 300, 168, { size: 12, weight: 800, color: cssVar('--scope-trace2') });
  const d = 34, off = -2; // 1 V/div, ground line 2 div below the centre
  const x0 = 1; // a rising edge 1 div after the left edge
  drawScope(ctx, {
    x: 110, y: 184, d, steady: true, svLabel: '1 V/div', vbLabel: `${num(st.vb * 1000, st.vb < 0.001 ? 1 : 0)} ms/div`,
    curve: (x) => scopeI(st, (x - x0) * st.vb).v / 1 + off,
    curve2: (x) => EX2.r * scopeI(st, (x - x0) * st.vb).i / 1 + off,
  });
}

/* ---------- Tab 3: inductance and self-induced e.m.f. ---------- */
const solL = (st) => MU0 * st.N ** 2 * Math.PI * (st.rad / 100) ** 2 / (st.len / 100);
const segs = () => PROFILE.slice(1).map((p, k) => ({ k, t0: PROFILE[k][0], t1: p[0], i0: PROFILE[k][1], i1: p[1] }));
function iProfile(tt) {
  for (let k = 1; k < PROFILE.length; k++) {
    const [ta, ia] = PROFILE[k - 1], [tb, ib] = PROFILE[k];
    if (tt <= tb) return ia + (ib - ia) * (tt - ta) / (tb - ta);
  }
  return PROFILE[PROFILE.length - 1][1];
}
function eProfile(tt, Lh) {
  for (let k = 1; k < PROFILE.length; k++) {
    const [ta, ia] = PROFILE[k - 1], [tb, ib] = PROFILE[k];
    if (tt < tb) return -Lh * (ib - ia) / ((tb - ta) / 1000);
  }
  return 0;
}
function drawInductance(ctx, st) {
  if (st.mode === 'solenoid') {
    const len = st.len * 9, r = st.rad * 22, x0 = 300 - len / 2;
    ctx.save(); ctx.strokeStyle = cssVar('--s5'); ctx.fillStyle = cssVar('--s5'); ctx.lineWidth = 1.5; ctx.globalAlpha = 0.7;
    for (const dy of [-0.5, 0, 0.5]) arrow(ctx, x0 - 20, 150 + dy * r, x0 + len + 40, 150 + dy * r, 7);
    ctx.restore();
    drawSolenoid(ctx, x0, x0 + len, 150, r, { turns: Math.max(8, Math.min(40, Math.round(st.N / 50))), s: 1 });
    label(ctx, 'B', x0 + len + 54, 150, { size: 14, weight: 800, color: cssVar('--s5') });
    ctx.strokeStyle = C.ink(); ctx.fillStyle = C.ink(); ctx.lineWidth = 1.2;
    arrow(ctx, x0, 150 + r + 26, x0 + len, 150 + r + 26, 6); arrow(ctx, x0 + len, 150 + r + 26, x0, 150 + r + 26, 6);
    label(ctx, `ℓ = ${qty(st.len, 0, 'cm')}`, 300, 150 + r + 42, { size: 12, weight: 800 });
    label(ctx, `N = ${st.N}`, 300, 150 - r - 26, { size: 12, weight: 800 });
    label(ctx, `r = ${qty(st.rad, 1, 'cm')}`, x0 - 34, 150, { size: 12, weight: 800, align: 'right' });
    note(ctx, 'in.solNote', W / 2, 330);
    note(ctx, 'in.solNote2', W / 2, 352);
    return;
  }
  const Lh = st.L / 1000, sg = segs()[st.seg];
  plotCurves(ctx, { x: 12, y: 10, w: 576, h: 190, xMin: 0, xMax: 10, yMin: -1.5, yMax: 2.5, xLabel: 't (ms)', yLabel: 'i (A)', xStep: 1, yStep: 0.5,
    curves: [{ f: iProfile, color: C.u(), label: 'i(t)' }] });
  // chosen segment shaded on both graphs (same frame as plotCurves)
  ctx.fillStyle = 'rgba(47,116,200,0.12)';
  for (const yy of [10, 220]) ctx.fillRect(12 + 42 + sg.t0 * 52.4, yy + 16, (sg.t1 - sg.t0) * 52.4, 144);
  const em = Math.max(...segs().map((s) => Math.abs(Lh * (s.i1 - s.i0) / ((s.t1 - s.t0) / 1000))));
  const ym = Math.max(10, Math.ceil(em * 1.25 / 10) * 10);
  plotCurves(ctx, { x: 12, y: 220, w: 576, h: 190, xMin: 0, xMax: 10, yMin: -ym, yMax: ym, xLabel: 't (ms)', yLabel: 'e (V)', xStep: 1,
    curves: [{ f: (tt) => eProfile(tt, Lh), color: C.e(), label: 'e = −L di/dt' }] });
  note(ctx, 'in.segNote', W / 2, 428, 'center', { n: sg.k + 1 });
}

/* ---------- Tabs 4–5: R-L circuit ---------- */
function rlCircuit(ctx, st, rName) {
  const xL = 80, xR = 520, yT = 50, yB = 170;
  ctx.strokeStyle = C.ink(); ctx.fillStyle = C.ink(); ctx.lineWidth = 2;
  // two-position switch: 1 → source (growth), 2 → short circuit (decay)
  const pos = st.phase === 'grow' || st.phase === 'on' ? 1 : 2;
  line(ctx, [[xL, yB], [xL, yT], [150, yT]]); ink(ctx); symCell(ctx, 160, yT, false); line(ctx, [[170, yT], [230, yT]]);
  label(ctx, `E = ${qty(st.E, 0, 'V')}`, 160, yT - 28, { size: 12, weight: 800 });
  ink(ctx); ctx.beginPath(); ctx.arc(230, yT, 3, 0, TAU); ctx.fill();
  line(ctx, [[xL, yB], [250, yB], [250, yT + 40], [270, yT + 40]]); // position 2 contact wire
  ctx.beginPath(); ctx.arc(270, yT + 40, 3, 0, TAU); ctx.fill();
  label(ctx, '1', 228, yT - 14, { size: 11, weight: 800 }); label(ctx, '2', 258, yT + 54, { size: 11, weight: 800 });
  ink(ctx); ctx.beginPath(); ctx.arc(300, yT, 3, 0, TAU); ctx.fill();
  line(ctx, [[300, yT], pos === 1 ? [233, yT] : [272, yT + 38]], 2.5);
  label(ctx, 'K', 300, yT - 16, { size: 13, weight: 800 });
  line(ctx, [[300, yT], [330, yT]]); symRes(ctx, 330, 400, yT); line(ctx, [[400, yT], [xR, yT], [xR, 90]]);
  label(ctx, rName, 365, yT - 22, { size: 12, weight: 800 });
  ctx.save(); ctx.translate(xR, 90); ctx.rotate(Math.PI / 2); symCoil(ctx, 0, 70, 0); ctx.restore();
  line(ctx, [[xR, 160], [xR, yB], [250, yB]]);
  label(ctx, 'L', xR + 26, 125, { size: 13, weight: 800 });
  curArrow(ctx, 450, yT, 1, C.i2(), 'i', st.i);
}
function drawRL(ctx, st) {
  rlCircuit(ctx, st, `R = ${qty(st.R, 0, 'Ω')}`);
  const tau = st.L / st.R * 1000, I = st.E / st.R * 1000; // ms, mA
  const xm = 6 * tau, grow = st.phase === 'grow' || st.phase === 'on';
  const hist = st.hist || [];
  const curves = [];
  if (hist.length) curves.push({ f: histFn(hist, 1), color: C.i2(), label: 'i(t)' });
  if (grow) curves.push({ f: (x) => (x <= tau * 1.2 ? (I / tau) * x : NaN), color: cssVar('--muted'), dash: true, label: t('rl.tangent') });
  plotCurves(ctx, { x: 12, y: 200, w: 576, h: 250, xMin: 0, xMax: xm, yMin: 0, yMax: I * 1.15, xLabel: 't (ms)', yLabel: 'i (mA)', curves });
  // marks: τ and 0.63 I (growth) or 0.37 I (decay)
  const X = (x) => 12 + 42 + (x / xm) * 524, Y = (y) => 200 + 16 + (1 - y / (I * 1.15)) * 204; // same frame as plotCurves
  if (st.phase !== 'off') {
    const yv = grow ? 0.632 * I : 0.368 * I;
    ctx.save(); ctx.strokeStyle = cssVar('--s5'); ctx.setLineDash([4, 4]); ctx.lineWidth = 1.2;
    line(ctx, [[X(tau), Y(0)], [X(tau), Y(yv)], [X(0), Y(yv)]]);
    if (grow) line(ctx, [[X(0), Y(I)], [X(xm), Y(I)]]);
    ctx.restore();
    label(ctx, 'τ', X(tau), Y(0) - 10, { size: 13, weight: 800, color: cssVar('--s5') });
    label(ctx, grow ? '0.63 I' : '0.37 I0', X(0) + 30, Y(yv) - 10, { size: 11, weight: 800, color: cssVar('--s5') });
  }
}
function drawEnergy(ctx, st) {
  rlCircuit(ctx, st, `R = ${qty(R_EN, 0, 'Ω')}`);
  const Em = 0.5 * st.L * st.i ** 2, Imax = st.E / R_EN, EmMax = 0.5 * st.L * Imax ** 2;
  const max = Math.max(EmMax * 3, st.W, st.Q) * 1000 * 1.1;
  drawEnergyBars(ctx, {
    x: 12, y: 200, w: 576, h: 230, unit: 'mJ', decimals: 1, min: 0, max,
    bars: [
      { label: t('en.W'), value: st.W * 1000, color: C.u() },
      { label: t('en.Q'), value: st.Q * 1000, color: cssVar('--s4') },
      { label: t('en.Em'), value: Em * 1000, color: C.i2() },
    ],
  });
}

/* ---------- Tab 6: sparks on switching off (Application 9.4) ---------- */
function drawSparks(ctx, st) {
  const xL = 80, xR = 520, yT = 60, yB = 180;
  ctx.strokeStyle = C.ink(); ctx.fillStyle = C.ink(); ctx.lineWidth = 2;
  line(ctx, [[xL, yB], [xL, yT], [150, yT]]); ink(ctx); symCell(ctx, 160, yT, false); line(ctx, [[170, yT], [270, yT]]);
  label(ctx, `E = ${qty(AP4.E, 0, 'V')}, r′ = ${qty(AP4.rg, 0, 'Ω')}`, 160, yT - 28, { size: 12, weight: 800 });
  ink(ctx); symSwitch(ctx, 270, 320, yT, st.phase !== 'closed');
  label(ctx, 'K', 295, yT + 20, { size: 13, weight: 800 });
  line(ctx, [[320, yT], [xR, yT], [xR, 90]]);
  ctx.save(); ctx.translate(xR, 90); ctx.rotate(Math.PI / 2); symCoil(ctx, 0, 70, 0, { core: true }); ctx.restore();
  line(ctx, [[xR, 160], [xR, yB], [xL, yB]]);
  label(ctx, `L = ${qty(AP4.L, 1, 'H')}, r = ${qty(AP4.r, 0, 'Ω')}`, xR - 16, 125, { size: 12, weight: 800, align: 'right' });
  if (st.prot === 'diode') {
    line(ctx, [[xR, 80], [xR + 50, 80], [xR + 50, 100]]); line(ctx, [[xR + 50, 150], [xR + 50, 170], [xR, 170]]);
    // diode pointing up (conducts when the coil drives the current on after opening)
    ink(ctx); ctx.beginPath(); ctx.moveTo(xR + 40, 120); ctx.lineTo(xR + 60, 120); ctx.lineTo(xR + 50, 106); ctx.closePath(); ctx.fill();
    line(ctx, [[xR + 40, 104], [xR + 60, 104]]); line(ctx, [[xR + 50, 100], [xR + 50, 106]]); line(ctx, [[xR + 50, 120], [xR + 50, 128]]);
    ctx.save(); ctx.translate(xR + 50, 128); ctx.rotate(Math.PI / 2); symRes(ctx, 0, 22, 0); ctx.restore();
  } else if (st.prot === 'cap') {
    line(ctx, [[270, yT], [270, yT + 40], [288, yT + 40]]); line(ctx, [[302, yT + 40], [320, yT + 40], [320, yT]]);
    line(ctx, [[288, yT + 28], [288, yT + 52]], 3); line(ctx, [[302, yT + 28], [302, yT + 52]], 3);
    label(ctx, 'C', 295, yT + 66, { size: 12, weight: 800 });
  }
  if (st.spark > 0) {
    ctx.save(); ctx.strokeStyle = `rgba(255,220,60,${st.spark})`; ctx.lineWidth = 3;
    line(ctx, [[278, yT - 4], [288, yT - 14], [294, yT - 2], [304, yT - 16], [312, yT - 6]]);
    ctx.fillStyle = `rgba(255,240,150,${0.5 * st.spark})`; ctx.beginPath(); ctx.arc(295, yT - 8, 22, 0, TAU); ctx.fill();
    ctx.restore();
    label(ctx, t('sp.spark'), 295, yT - 38, { size: 13, weight: 800, color: cssVar('--bad') });
  }
  curArrow(ctx, 420, yT, 1, C.i2(), 'i', st.phase === 'closed' ? 2 : st.i);
  const hist = st.hist;
  const vmax = Math.max(50, ...hist.map((r) => Math.abs(r[1])));
  const ym = Math.ceil(vmax * 1.15 / 50) * 50;
  plotCurves(ctx, { x: 12, y: 210, w: 576, h: 240, xMin: 0, xMax: 30, yMin: st.prot === 'cap' ? -ym : 0, yMax: ym, xLabel: 't (ms)', yLabel: t('sp.vk'), xStep: 5,
    curves: hist.length ? [{ f: histFn(hist, 1), color: C.e(), label: t('sp.vkShort') }] : [] });
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
const sliderEl = (st, key, prop, min, max, step, unit, dec, after) => createSlider({ labelKey: key, min, max, step, value: st[prop], unit, decimals: dec, onInput: (v) => { st[prop] = v; after?.(); refresh(); } }).root;
const seg = (st, key, prop, opts, after) => createSegmented({ labelKey: key, options: opts, value: st[prop], onChange: (v) => { st[prop] = v; after?.(); refresh(); } }).root;
function setLabel(btn, key) { if (btn.dataset.i18n !== key) { btn.dataset.i18n = key; btn.textContent = t(key); } }

/* ---------- Tab 1 ---------- */
function buildEvidence() {
  const st = S.evidence;
  ui.k = createButton({ labelKey: 'ctl.closeK', variant: 'primary', onClick: () => { st.closed = !st.closed; st.t = 0; st.hist = []; refresh(); } });
  controlsBody.append(seg(st, 'ctl.speed', 'slow', [{ value: true, labelKey: 'ev.slow' }, { value: false, labelKey: 'ev.real' }], () => { st.slow = st.slow === true || st.slow === 'true'; }),
    btnRow(ui.k), hint('hint.evidence'), resetBtn('evidence'));
  ui.dl = el('dl', { class: 'meas' }); measuresBody.append(ui.dl);
}
function updateEvidence() {
  const st = S.evidence;
  setLabel(ui.k, st.closed ? 'ctl.openK' : 'ctl.closeK');
  measRows(ui.dl, [[t('m.K'), t(st.closed ? 'm.closed' : 'm.open')], [t('m.i1'), qty(st.i1, 3, 'A')], [t('m.i2'), qty(st.i2, 3, 'A')], [t('m.t'), qty(st.t * 1000, 0, 'ms')]]);
}

/* ---------- Tab 2 ---------- */
function buildScope() {
  const st = S.scope;
  controlsBody.append(
    sliderEl(st, 'ctl.f', 'f', 50, 1000, 50, 'Hz', 0),
    seg(st, 'ctl.vb', 'vb', [{ value: 0.0005, labelKey: 'vb.05' }, { value: 0.001, labelKey: 'vb.1' }, { value: 0.002, labelKey: 'vb.2' }], () => { st.vb = Number(st.vb); }),
    btnRow(recordBtn(() => { st.rows.push({ f: st.f }); st.fb = null; refresh(); })), hint('hint.scope'), resetBtn('scope'));
  tableBlock(st);
}
function updateScope() {
  const st = S.scope, R = EX2.r + EX2.rc;
  measRows(ui.dl, [[t('m.coil'), `L = ${qty(EX2.L, 1, 'H')}, r′ = ${qty(EX2.rc, 0, 'Ω')}`], [t('m.r'), qty(EX2.r, 0, 'Ω')], [t('m.T'), qty(1000 / st.f, 2, 'ms')]]);
  renderTable(st, st.rows, ['col.f', 'col.Rtot', 'col.I', 'col.tau'], (r) => el('tr', {}, [td(num(r.f, 0)),
    cell(st, r, 'R', R, 0, 0.5, 'fb.ROk', 'fb.RWrong'),
    cell(st, r, 'I', EX2.U / R * 1000, 2, 0.02, 'fb.IOk', 'fb.IWrong', !calcDone(r, 'R')),
    cell(st, r, 'tau', EX2.L / R * 1000, 2, 0.006, 'fb.tauOk', 'fb.tauWrong', !calcDone(r, 'I'))]));
}

/* ---------- Tab 3 ---------- */
function buildInductance() {
  const st = S.inductance;
  controlsBody.append(seg(st, 'ctl.part', 'mode', [{ value: 'solenoid', labelKey: 'in.solenoid' }, { value: 'emf', labelKey: 'in.emf' }], () => { st.fb = null; buildTab('inductance'); }));
  if (st.mode === 'solenoid') {
    controlsBody.append(sliderEl(st, 'ctl.N', 'N', 100, 2000, 100, '', 0), sliderEl(st, 'ctl.len', 'len', 10, 50, 5, 'cm', 0), sliderEl(st, 'ctl.rad', 'rad', 0.5, 3, 0.5, 'cm', 1),
      btnRow(recordBtn(() => { st.rows.push({ mode: 'solenoid', N: st.N, len: st.len, rad: st.rad }); st.fb = null; refresh(); })));
  } else {
    controlsBody.append(sliderEl(st, 'ctl.L', 'L', 10, 200, 10, 'mH', 0),
      seg(st, 'ctl.seg', 'seg', [0, 1, 2, 3, 4].map((k) => ({ value: k, labelKey: `seg.${k}` })), () => { st.seg = Number(st.seg); }),
      btnRow(recordBtn(() => { st.rows.push({ mode: 'emf', L: st.L, seg: st.seg }); st.fb = null; refresh(); })));
  }
  controlsBody.append(hint(`hint.${st.mode}`), resetBtn('inductance'));
  tableBlock(st);
}
function updateInductance() {
  const st = S.inductance;
  const rows = st.rows.filter((r) => r.mode === st.mode);
  if (st.mode === 'solenoid') {
    measRows(ui.dl, [[t('m.N'), String(st.N)], [t('m.len'), qty(st.len, 0, 'cm')], [t('m.rad'), qty(st.rad, 1, 'cm')]]);
    renderTable(st, rows, ['col.N', 'col.len', 'col.rad', 'col.S', 'col.Lsol'], (r) => {
      const Sc = Math.PI * (r.rad / 100) ** 2 * 1e4, L = solL(r) * 1000;
      return el('tr', {}, [td(String(r.N)), td(num(r.len / 100, 2)), td(num(r.rad / 100, 3)),
        cell(st, r, 'S', Sc, 2, relTol(Sc, 0.01), 'fb.SOk', 'fb.SWrong'),
        cell(st, r, 'L', L, 2, relTol(L, 0.02), 'fb.LOk', 'fb.LWrong', !calcDone(r, 'S'))]);
    });
  } else {
    const sg = segs()[st.seg];
    measRows(ui.dl, [[t('m.L'), qty(st.L, 0, 'mH')], [t('m.seg'), `${num(sg.t0, 0)} → ${num(sg.t1, 0)} ms`], [t('m.di'), `${qty(sg.i0, 1, 'A')} → ${qty(sg.i1, 1, 'A')}`]]);
    renderTable(st, rows, ['col.L', 'col.segN', 'col.didt', 'col.e'], (r) => {
      const s = segs()[r.seg], didt = (s.i1 - s.i0) / ((s.t1 - s.t0) / 1000), e = -(r.L / 1000) * didt;
      return el('tr', {}, [td(num(r.L, 0)), td(`${r.seg + 1} (${num(s.t0, 0)}–${num(s.t1, 0)} ms)`),
        cell(st, r, 'd', didt, 0, 0.5, 'fb.didtOk', 'fb.didtWrong'),
        cell(st, r, 'e', e, 2, relTol(e, 0.01, 0.006), 'fb.eOk', 'fb.eWrong', !calcDone(r, 'd'))]);
    });
  }
}

/* ---------- Tabs 4–5 ---------- */
function rlButtons(st, tab) {
  ui.close = createButton({ labelKey: 'ctl.pos1', variant: 'primary', onClick: () => { if (st.phase === 'grow' || st.phase === 'on') return; Object.assign(st, { phase: 'grow', t: 0, i0: st.i, hist: [] }); if (tab === 'energy') { st.W = 0; st.Q = 0; } loop.start(); refresh(); } });
  ui.open = createButton({ labelKey: 'ctl.pos2', variant: 'secondary', onClick: () => { if (st.phase !== 'on' && st.phase !== 'grow') return; Object.assign(st, { phase: 'decay', t: 0, i0: st.i, hist: [] }); if (tab === 'energy') { st.Q = 0; st.W = 0; st.EmStart = 0.5 * st.L * st.i ** 2; } loop.start(); refresh(); } });
  return btnRow(ui.close, ui.open);
}
function buildRL() {
  const st = S.rl;
  const again = () => Object.assign(st, { phase: 'off', i: 0, t: 0, hist: [] });
  controlsBody.append(sliderEl(st, 'ctl.Lh', 'L', 0.05, 1, 0.05, 'H', 2, again), sliderEl(st, 'ctl.R', 'R', 100, 1000, 50, 'Ω', 0, again), sliderEl(st, 'ctl.E', 'E', 2, 12, 1, 'V', 0, again),
    rlButtons(st, 'rl'), btnRow(recordBtn(() => { st.rows.push({ L: st.L, R: st.R, E: st.E }); st.fb = null; refresh(); })), hint('hint.rl'), resetBtn('rl'));
  tableBlock(st);
}
function updateRL() {
  const st = S.rl;
  ui.close.disabled = st.phase === 'grow' || st.phase === 'on'; ui.open.disabled = !(st.phase === 'grow' || st.phase === 'on');
  if (st.phase !== 'off') { st.hist = st.hist || []; const last = st.hist[st.hist.length - 1]; const tm = st.t * 1000; if (!last || tm - last[0] > 1e-6) st.hist.push([tm, st.i * 1000]); }
  measRows(ui.dl, [[t('m.phase'), t(`ph.${st.phase}`)], [t('m.t'), qty(st.t * 1000, 3, 'ms')], [t('m.i'), qty(st.i * 1000, 2, 'mA')]]);
  renderTable(st, st.rows, ['col.Lh', 'col.R', 'col.E', 'col.Iss', 'col.tau', 'col.itau'], (r) => {
    const I = r.E / r.R * 1000, tau = r.L / r.R * 1000;
    return el('tr', {}, [td(num(r.L, 2)), td(num(r.R, 0)), td(num(r.E, 0)),
      cell(st, r, 'I', I, 2, relTol(I, 0.01), 'fb.IssOk', 'fb.IssWrong'),
      cell(st, r, 't', tau, 3, relTol(tau, 0.01, 0.0006), 'fb.tauOk', 'fb.tauWrong', !calcDone(r, 'I')),
      cell(st, r, 'it', 0.632 * I, 2, relTol(I, 0.012), 'fb.itauOk', 'fb.itauWrong', !calcDone(r, 't'))]);
  });
}
function buildEnergy() {
  const st = S.energy;
  const again = () => Object.assign(st, { phase: 'off', i: 0, t: 0, W: 0, Q: 0 });
  controlsBody.append(sliderEl(st, 'ctl.Lh', 'L', 0.1, 1, 0.1, 'H', 1, again), sliderEl(st, 'ctl.E', 'E', 2, 12, 1, 'V', 0, again),
    rlButtons(st, 'energy'), btnRow(recordBtn(() => { st.rows.push({ L: st.L, E: st.E }); st.fb = null; refresh(); })), hint('hint.energy'), resetBtn('energy'));
  tableBlock(st);
}
function updateEnergy() {
  const st = S.energy;
  ui.close.disabled = st.phase === 'grow' || st.phase === 'on'; ui.open.disabled = !(st.phase === 'grow' || st.phase === 'on');
  measRows(ui.dl, [[t('m.phase'), t(`ph.${st.phase}`)], [t('m.R'), qty(R_EN, 0, 'Ω')], [t('m.i'), qty(st.i, 3, 'A')], [t('m.Em'), qty(0.5 * st.L * st.i ** 2 * 1000, 1, 'mJ')]]);
  renderTable(st, st.rows, ['col.Lh', 'col.E', 'col.IA', 'col.Em'], (r) => {
    const I = r.E / R_EN, Em = 0.5 * r.L * I * I * 1000;
    return el('tr', {}, [td(num(r.L, 1)), td(num(r.E, 0)),
      cell(st, r, 'I', I, 2, 0.006, 'fb.IAOk', 'fb.IAWrong'),
      cell(st, r, 'E', Em, 1, relTol(Em, 0.01, 0.06), 'fb.EmOk', 'fb.EmWrong', !calcDone(r, 'I'))]);
  });
}

/* ---------- Tab 6 ---------- */
function buildSparks() {
  const st = S.sparks;
  const again = () => Object.assign(st, { phase: 'closed', t: 0, i: 2, hist: [], q: 0, spark: 0, vk: 0 });
  ui.k = createButton({ labelKey: 'ctl.openK', variant: 'primary', onClick: () => { if (st.phase === 'closed') { Object.assign(st, { phase: 'opening', t: 0, i: 2, q: 0, hist: [[0, 0, 2]] }); loop.start(); } else again(); refresh(); } });
  controlsBody.append(
    seg(st, 'ctl.prot', 'prot', [{ value: 'none', labelKey: 'sp.none' }, { value: 'diode', labelKey: 'sp.diode' }, { value: 'cap', labelKey: 'sp.cap' }], again),
    sliderEl(st, 'ctl.dt', 'dt', 1, 10, 0.1, 'ms', 1, again),
    btnRow(ui.k, recordBtn(() => { st.rows.push({ dt: st.dt }); st.fb = null; refresh(); })), hint('hint.sparks'), resetBtn('sparks'));
  tableBlock(st);
}
function updateSparks() {
  const st = S.sparks;
  setLabel(ui.k, st.phase === 'closed' ? 'ctl.openK' : 'ctl.again');
  ui.k.disabled = st.phase === 'opening';
  const vmax = st.hist.reduce((m, r) => Math.max(m, r[1]), 0);
  measRows(ui.dl, [[t('m.K'), t(st.phase === 'closed' ? 'm.closed' : 'm.open')], [t('m.i'), qty(st.phase === 'closed' ? 2 : st.i, 2, 'A')], [t('m.vkmax'), st.hist.length ? qty(vmax, 0, 'V') : '—']]);
  renderTable(st, st.rows, ['col.dtms', 'col.I0', 'col.Vcoil', 'col.esp', 'col.vk'], (r) => {
    const I0 = AP4.E / (AP4.rg + AP4.r), e = AP4.L * I0 / (r.dt / 1000);
    return el('tr', {}, [td(num(r.dt, 1)),
      cell(st, r, 'I', I0, 1, 0.006, 'fb.I0Ok', 'fb.I0Wrong'),
      cell(st, r, 'V', AP4.r * I0, 1, 0.06, 'fb.VcOk', 'fb.VcWrong', !calcDone(r, 'I')),
      cell(st, r, 'e', e, 0, relTol(e, 0.01, 0.6), 'fb.espOk', 'fb.espWrong', !calcDone(r, 'V')),
      cell(st, r, 'k', e + AP4.E, 0, relTol(e, 0.01, 0.6), 'fb.vkOk', 'fb.vkWrong', !calcDone(r, 'e'))]);
  });
}

/* ---------- Tab switching ---------- */
function buildTab(id) {
  controlsBody.replaceChildren();
  measuresBody.replaceChildren();
  ui = {};
  tableSig = '';
  ({ evidence: buildEvidence, scope: buildScope, inductance: buildInductance, rl: buildRL, energy: buildEnergy, sparks: buildSparks })[id]();
  loop.start();
  shell?.refreshActivity();
  refresh();
}
function updateMeasures() {
  if (!shell || !ui.dl) return;
  ({ evidence: updateEvidence, scope: updateScope, inductance: updateInductance, rl: updateRL, energy: updateEnergy, sparks: updateSparks })[shell.tab]();
}
function refresh() { updateMeasures(); requestDraw(); }
function resetTab(id) { S[id] = initialState(id); buildTab(id); }
onLangChange(() => { if (shell) buildTab(shell.tab); });

shell = initSim({
  strings,
  tabs: TABS.map((id) => ({ id, labelKey: `tab.${id}` })),
  initialTab: 'evidence',
  onTab: buildTab,
  gsOnly: { rl: true, sparks: true },
  activityKey: (tab) => (tab === 'inductance' ? `act.inductance.${S.inductance.mode}` : `act.${tab}`),
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, solL, scopeI, segs };
