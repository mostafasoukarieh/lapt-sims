// Sec 3 GS-LS — Chapter 3: Angular momentum. Taught in General Sciences only (gsOnly).
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

const TAU = 2 * Math.PI;
const W = 600;
const TABS = ['particle', 'theorem', 'skater', 'disk', 'rods'];
const HEIGHTS = { particle: 400, theorem: 440, skater: 400, disk: 400, rods: 460 };

/* ================================================================
   Model and book values
   ================================================================ */
const APP32 = { I: 2e-3 }; // Application 3.2: both particles have I = 2 × 10⁻³ kg·m² (e.g. 50 g at 20 cm)
const FLY = { m: 20, r: 0.1 }; // Application 3.3: disk 20 kg, r = 10 cm → I = 0.1 kg·m²
const SKATER = { I1: 13.1, I2: 5.225 }; // exercise 7 (boy on a turntable), kg·m²
const DISK = { m: 0.5, r: 0.4, mp: 0.1 }; // exercise 8: disk 500 g, 40 cm; particle 100 g
const WHEELS = { I1: 2.27, I2: 3.52 }; // exercise 9, kg·m²
const RODS = { I1: 0.02, C: 0.05 }; // Figure 3.9 — values chosen for the simulation

function initialState(tab) {
  switch (tab) {
    case 'particle': return { mode: 'particle', m: 0.5, r: 30, w: 4, w1: 5, w2: -8, hm: 200, hr: 20, hN: 10, hSense: -1, phi: 0, rows: [], fb: null };
    case 'theorem': return { N0: 3000, M: -0.25, t: 0, run: false, phi: 0, rows: [], fb: null };
    case 'skater': return { N1: 0.5, folded: false, phi: 0, rows: [], fb: null };
    case 'disk': return { mode: 'drop', N: 2, d: 20, dropped: false, drop: 0, phi1: 0, phi2: 0, cN1: 2, cN2: -2, clutched: false, rows: [], fb: null };
    default: return { ratio: 2, a: 40, run: false, t: 0, hist: [] };
  }
}
let S = Object.fromEntries(TABS.map((k) => [k, initialState(k)]));

// Angular velocity (rad/s) of each thing that turns
const flyI = () => 0.5 * FLY.m * FLY.r ** 2;
function flyW(st) { const s0 = flyI() * TAU * st.N0 / 60; return Math.max(0, s0 + st.M * st.t) / flyI(); }
function flyStop(st) { return -(flyI() * TAU * st.N0 / 60) / st.M; }
const skaterI = (st) => (st.folded ? SKATER.I2 : SKATER.I1);
const skaterN = (st) => (st.N1 * SKATER.I1) / skaterI(st);
const diskI = () => 0.5 * DISK.m * DISK.r ** 2;
function diskN(st) { return st.dropped ? (st.N * diskI()) / (diskI() + DISK.mp * (st.d / 100) ** 2) : st.N; }
const clutchN = (st) => (WHEELS.I1 * st.cN1 + WHEELS.I2 * st.cN2) / (WHEELS.I1 + WHEELS.I2);
// Two rods on a torsion wire: θ1(0) = +a, θ2(0) = −a, released from rest
function rods(st, tt) {
  const I1 = RODS.I1, I2 = RODS.I1 * st.ratio, a = (st.a * Math.PI) / 180;
  const w = Math.sqrt(RODS.C * (1 / I1 + 1 / I2));
  const Th = (a * (I1 - I2)) / (I1 + I2); // angle of the "centre", constant (σ = 0)
  const phi = 2 * a * Math.cos(w * tt), dphi = -2 * a * w * Math.sin(w * tt); // θ1 − θ2
  return {
    I1, I2, w,
    th1: Th + (I2 / (I1 + I2)) * phi, th2: Th - (I1 / (I1 + I2)) * phi,
    w1: (I2 / (I1 + I2)) * dphi, w2: -(I1 / (I1 + I2)) * dphi,
  };
}

/* ================================================================
   Canvas and loop
   ================================================================ */
let shell;
let drawQueued = false;
const canvas = document.getElementById('stage');
const view = setupCanvas(canvas, { width: W, height: 400, maxHeightVh: () => (window.innerWidth < 880 ? 54 : 78), onResize: () => requestDraw() });
function requestDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; draw(); });
}
onThemeChange(() => requestDraw());

const SLOW = { particle: 0.25, hoop: 0.05, fly: 0.02 };
const loop = createLoop({
  step(dt) {
    if (!shell) return false;
    const tab = shell.tab, st = S[tab];
    if (tab === 'particle') {
      const w = st.mode === 'particle' ? st.w : st.mode === 'two' ? 1 : st.hSense * TAU * st.hN;
      st.phi += w * dt * (st.mode === 'hoop' ? SLOW.hoop : SLOW.particle);
      if (st.mode === 'two') { st.phi1 = (st.phi1 ?? 0) + st.w1 * dt * SLOW.particle; st.phi2 = (st.phi2 ?? 0) + st.w2 * dt * SLOW.particle; }
    } else if (tab === 'theorem') {
      if (st.run) {
        st.t += dt * 20; // time × 20
        if (st.t >= flyStop(st)) { st.t = flyStop(st); st.run = false; }
      }
      st.phi += flyW(st) * dt * SLOW.fly;
    } else if (tab === 'skater') st.phi += TAU * skaterN(st) * dt;
    else if (tab === 'disk') {
      if (st.mode === 'drop') {
        st.phi1 += TAU * diskN(st) * dt * 0.25;
        if (st.dropped && st.drop < 1) st.drop = Math.min(1, st.drop + dt * 3);
      } else {
        const n1 = st.clutched ? clutchN(st) : st.cN1, n2 = st.clutched ? clutchN(st) : st.cN2;
        st.phi1 += TAU * n1 * dt * 0.25; st.phi2 += TAU * n2 * dt * 0.25;
      }
    } else if (tab === 'rods' && st.run) {
      st.t += dt;
      const r = rods(st, st.t);
      st.hist.push([st.t, r.th1, r.th2]);
      if (st.hist.length > 600) st.hist.shift();
      if (st.t > 12) st.run = false;
    }
    return true;
  },
  render() { draw(); updateMeasures(); },
});

/* ================================================================
   Drawing
   ================================================================ */
const C = { a: () => cssVar('--s2'), b: () => cssVar('--s1'), s: () => cssVar('--brand-navy'), plus: () => cssVar('--s6') };
function vec(ctx, x1, y1, x2, y2, color, text, lw = 2.5) {
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = lw;
  if (Math.hypot(x2 - x1, y2 - y1) > 3) arrow(ctx, x1, y1, x2, y2, 9);
  if (text) {
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1;
    label(ctx, text, x2 + (dx / L) * 12, y2 + (dy / L) * 12, { size: 13, weight: 800, color });
  }
}
function note(ctx, key, x, y, align = 'left', params) { label(ctx, t(key, params), x, y, { size: 12, weight: 600, color: cssVar('--muted'), align }); }
// Axis Δ seen from above (⊙) and the chosen positive sense (counterclockwise arc on the screen)
function axisMark(ctx, x, y, R = 26) {
  ctx.fillStyle = cssVar('--surface'); ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, 7, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = cssVar('--text'); ctx.beginPath(); ctx.arc(x, y, 2.2, 0, TAU); ctx.fill();
  label(ctx, '(Δ)', x + 12, y + 14, { size: 12, weight: 800, align: 'left' });
}
function senseArrow(ctx, x, y, R = 22) {
  ctx.strokeStyle = C.plus(); ctx.fillStyle = C.plus(); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, R, 0.3, -1.6, true); ctx.stroke();
  const a = -1.6, ex = x + R * Math.cos(a), ey = y + R * Math.sin(a);
  arrow(ctx, ex + 6, ey + 1, ex - 2, ey, 7);
  label(ctx, '+', x + R + 8, y - 8, { size: 15, weight: 800, color: C.plus() });
}
// Rotating disk (top view) with marks so that the rotation is seen
function drawDisk(ctx, x, y, R, phi, fill, marks = 6) {
  ctx.fillStyle = fill; ctx.strokeStyle = cssVar('--glass-stroke'); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1.5;
  for (let k = 0; k < marks; k++) {
    const a = -phi + (k * TAU) / marks;
    ctx.beginPath(); ctx.moveTo(x + R * 0.25 * Math.cos(a), y + R * 0.25 * Math.sin(a)); ctx.lineTo(x + R * 0.95 * Math.cos(a), y + R * 0.95 * Math.sin(a)); ctx.stroke();
  }
  ctx.fillStyle = cssVar('--accent');
  ctx.beginPath(); ctx.arc(x + R * 0.8 * Math.cos(-phi), y + R * 0.8 * Math.sin(-phi), Math.max(3, R * 0.05), 0, TAU); ctx.fill();
}

function draw() {
  if (!shell) return;
  const tab = shell.tab;
  if (view.height !== HEIGHTS[tab]) view.setLogicalSize(W, HEIGHTS[tab]);
  const ctx = view.begin();
  ctx.fillStyle = cssVar('--scene-bg');
  roundRect(ctx, 0, 0, W, HEIGHTS[tab], 14);
  ctx.fill();
  ({ particle: drawParticle, theorem: drawTheorem, skater: drawSkater, disk: drawDiskTab, rods: drawRods })[tab](ctx, S[tab]);
}

/* ---------- Tab 1: σ = I θ′ ---------- */
function drawParticle(ctx, st) {
  const cx = 250, cy = 200;
  senseArrow(ctx, 520, 50);
  note(ctx, 'p.topView', 20, 22);
  if (st.mode === 'particle' || st.mode === 'two') {
    const items = st.mode === 'particle'
      ? [{ r: st.r * 5, phi: st.phi, w: st.w, color: C.a(), name: 'A', size: 6 + st.m * 8 }]
      : [{ r: 100, phi: st.phi1 ?? 0, w: st.w1, color: C.a(), name: 'A1', size: 9 }, { r: 160, phi: (st.phi2 ?? 0) + 2, w: st.w2, color: C.b(), name: 'A2', size: 9 }];
    for (const it of items) {
      ctx.save(); ctx.strokeStyle = cssVar('--muted'); ctx.setLineDash([4, 5]); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(cx, cy, it.r, 0, TAU); ctx.stroke(); ctx.restore();
      const px = cx + it.r * Math.cos(-it.phi), py = cy + it.r * Math.sin(-it.phi);
      ctx.strokeStyle = cssVar('--muted'); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, py); ctx.stroke();
      ctx.fillStyle = it.color; ctx.beginPath(); ctx.arc(px, py, it.size, 0, TAU); ctx.fill();
      label(ctx, it.name, px + 14 * Math.cos(-it.phi), py + 14 * Math.sin(-it.phi) + 2, { size: 12, weight: 800, color: it.color });
      // velocity (tangent), in the sense of the motion
      const L = Math.sign(it.w) * Math.min(90, 12 + Math.abs(it.w) * 7);
      if (it.w !== 0) vec(ctx, px, py, px - L * Math.sin(-it.phi), py + L * Math.cos(-it.phi), it.color, 'v');
    }
    if (st.mode === 'particle') label(ctx, 'r', cx + (st.r * 5) / 2 * Math.cos(-st.phi) + 10, cy + (st.r * 5) / 2 * Math.sin(-st.phi) - 10, { size: 13, weight: 800 });
  } else {
    const R = 40 + st.hr * 4;
    ctx.strokeStyle = cssVar('--metal'); ctx.lineWidth = 8;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
    ctx.strokeStyle = cssVar('--muted'); ctx.lineWidth = 1.5;
    for (let k = 0; k < 3; k++) {
      const a = -st.phi + (k * TAU) / 3;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a)); ctx.stroke();
    }
    ctx.fillStyle = cssVar('--accent'); ctx.beginPath(); ctx.arc(cx + R * Math.cos(-st.phi), cy + R * Math.sin(-st.phi), 6, 0, TAU); ctx.fill();
    // sense of rotation of the hoop
    ctx.strokeStyle = C.a(); ctx.fillStyle = C.a(); ctx.lineWidth = 3;
    const a0 = -Math.PI / 2, a1 = a0 + (st.hSense > 0 ? -0.9 : 0.9);
    ctx.beginPath(); ctx.arc(cx, cy, R + 18, Math.min(a0, a1), Math.max(a0, a1)); ctx.stroke();
    const ex = cx + (R + 18) * Math.cos(a1), ey = cy + (R + 18) * Math.sin(a1);
    const tx = st.hSense > 0 ? Math.sin(a1) : -Math.sin(a1), ty = st.hSense > 0 ? -Math.cos(a1) : Math.cos(a1);
    arrow(ctx, ex - tx * 8, ey - ty * 8, ex + tx * 4, ey + ty * 4, 8);
    note(ctx, 'p.slowHoop', 20, HEIGHTS.particle - 20);
  }
  axisMark(ctx, cx, cy);
  if (st.mode !== 'hoop') note(ctx, 'p.slow', 20, HEIGHTS.particle - 20);
}

/* ---------- Tab 2: theorem of angular momentum (Application 3.3) ---------- */
function drawTheorem(ctx, st) {
  const cx = 130, cy = 120;
  drawDisk(ctx, cx, cy, 82, st.phi, cssVar('--metal'), 8);
  axisMark(ctx, cx, cy);
  senseArrow(ctx, 260, 40);
  // braking couple: two opposite forces on the rim, against the rotation
  if (st.run || st.t > 0) {
    const col = cssVar('--accent');
    vec(ctx, cx, cy - 92, cx + 40, cy - 92, col, null, 3);
    vec(ctx, cx, cy + 92, cx - 40, cy + 92, col, null, 3);
    label(ctx, t('th.couple'), cx + 100, cy + 100, { size: 12, weight: 800, color: col, align: 'left' });
  }
  const sigma0 = flyI() * TAU * st.N0 / 60, ts = flyStop(st);
  label(ctx, `t = ${qty(st.t, 1, 's')}`, 480, 60, { size: 15, weight: 800 });
  label(ctx, `N = ${qty((flyW(st) * 60) / TAU, 0, t('unit.rpm'))}`, 480, 88, { size: 14, weight: 700 });
  note(ctx, 'th.slow', 420, 116, 'center');
  plotCurves(ctx, {
    x: 12, y: 230, w: 576, h: 198, xMin: 0, xMax: Math.max(ts * 1.1, 10), yMin: 0, yMax: sigma0 * 1.15, xLabel: 't (s)', yLabel: 'σ (kg·m²/s)',
    curves: [{ f: (x) => Math.max(0, sigma0 + st.M * x), color: C.s(), label: 'σ' }],
    marker: st.t > 0 ? st.t : null,
  });
}

/* ---------- Tab 3: skater / boy on a turntable (exercise 7) ---------- */
function drawSkater(ctx, st) {
  const cx = 210, cy = 200;
  note(ctx, 'p.topView', 20, 22);
  drawDisk(ctx, cx, cy, 130, st.phi, cssVar('--wood'), 10);
  // the boy seen from above: shoulders, head, arms with the loads
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(-st.phi);
  const reach = st.folded ? 34 : 112;
  ctx.strokeStyle = cssVar('--skin'); ctx.lineWidth = 9; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-26, 0); ctx.lineTo(-reach, st.folded ? 14 : 0); ctx.moveTo(26, 0); ctx.lineTo(reach, st.folded ? 14 : 0); ctx.stroke();
  ctx.fillStyle = cssVar('--s2'); roundRect(ctx, -30, -12, 60, 24, 10); ctx.fill();
  ctx.fillStyle = cssVar('--skin'); ctx.beginPath(); ctx.arc(0, 0, 13, 0, TAU); ctx.fill();
  ctx.fillStyle = cssVar('--box');
  for (const sx of [-1, 1]) { roundRect(ctx, sx * reach - 9, (st.folded ? 14 : 0) - 9, 18, 18, 4); ctx.fill(); }
  ctx.restore();
  axisMark(ctx, cx, cy);
  senseArrow(ctx, 380, 50);
  // σ, θ′ and Ek: one box each, with its own unit
  const I = skaterI(st), w = TAU * skaterN(st);
  const box = (x, lab, v, max, unit, color, dec) => drawEnergyBars(ctx, { x, y: 110, w: 60, h: 280, max, unit, decimals: dec, bars: [{ label: lab, value: v, color }] });
  const s0 = SKATER.I1 * TAU * st.N1, w2 = s0 / SKATER.I2;
  box(398, 'σ', I * w, s0 * 1.2, 'kg·m²/s', C.s(), 1);
  box(462, 'θ′', w, w2 * 1.15, 'rad/s', C.a(), 2);
  box(526, 'Ek', 0.5 * I * w * w, 0.5 * s0 * w2 * 1.15, 'J', C.b(), 0);
  note(ctx, 'sk.barsNote', 492, 96, 'center');
}

/* ---------- Tab 4: disk + particle (exercise 8) / two flywheels clutched (exercise 9) ---------- */
function drawDiskTab(ctx, st) {
  note(ctx, 'p.topView', 20, 22);
  senseArrow(ctx, 540, 50);
  if (st.mode === 'drop') {
    const cx = 230, cy = 210, R = 160; // 40 cm ↔ 160 px
    drawDisk(ctx, cx, cy, R, st.phi1, cssVar('--alu'), 8);
    axisMark(ctx, cx, cy);
    // the particle: falls from above (grows) then turns with the disk
    const d = st.d * 4;
    if (st.dropped) {
      const a = -st.phi1 + 0.6;
      const s = 1 + 1.4 * (1 - st.drop);
      ctx.fillStyle = cssVar('--s3');
      ctx.beginPath(); ctx.arc(cx + d * Math.cos(a), cy + d * Math.sin(a), 8 * s, 0, TAU); ctx.fill();
    } else {
      ctx.save(); ctx.strokeStyle = cssVar('--s3'); ctx.setLineDash([3, 4]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, Math.max(1, d), 0, TAU); ctx.stroke(); ctx.restore();
      label(ctx, t('dk.where'), cx, cy - d - 12, { size: 12, weight: 700, color: cssVar('--s3') });
      ctx.fillStyle = cssVar('--s3'); ctx.beginPath(); ctx.arc(520, 140, 10, 0, TAU); ctx.fill();
      label(ctx, '100 g', 520, 164, { size: 12, weight: 800 });
    }
    label(ctx, `N = ${qty(diskN(st), 3, t('unit.rps'))}`, 500, 330, { size: 15, weight: 800 });
    note(ctx, 'dk.slow', 20, HEIGHTS.disk - 20);
  } else {
    const cx = 230, cy = 210;
    const n1 = st.clutched ? clutchN(st) : st.cN1, n2 = st.clutched ? clutchN(st) : st.cN2;
    drawDisk(ctx, cx, cy, 160, st.phi2, cssVar('--metal'), 8);
    drawDisk(ctx, cx, cy, 95, st.phi1, cssVar('--alu'), 6);
    axisMark(ctx, cx, cy);
    label(ctx, 'R1', cx, cy - 70, { size: 13, weight: 800 });
    label(ctx, 'R2', cx, cy - 135, { size: 13, weight: 800, color: '#fff', halo: false });
    label(ctx, `N1 = ${qty(n1, 3, t('unit.rps'))}`, 500, 300, { size: 14, weight: 800 });
    label(ctx, `N2 = ${qty(n2, 3, t('unit.rps'))}`, 500, 330, { size: 14, weight: 800 });
    note(ctx, st.clutched ? 'dk.clutched' : 'dk.free', 500, 270, 'center');
    note(ctx, 'dk.slow', 20, HEIGHTS.disk - 20);
  }
}

/* ---------- Tab 5: two rods on a torsion wire (Figure 3.9) ---------- */
function drawRods(ctx, st) {
  const r = rods(st, st.t);
  const cx = 150, cy = 130;
  note(ctx, 'p.topView', 20, 22);
  ctx.save(); ctx.strokeStyle = cssVar('--muted'); ctx.setLineDash([3, 4]); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx - 120, cy); ctx.lineTo(cx + 120, cy); ctx.stroke(); ctx.restore();
  const rod = (th, L, w, color, name) => {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(-th);
    ctx.fillStyle = color; roundRect(ctx, -L, -w / 2, 2 * L, w, w / 2); ctx.fill();
    ctx.restore();
    label(ctx, name, cx + (L + 14) * Math.cos(-th), cy + (L + 14) * Math.sin(-th), { size: 13, weight: 800, color });
  };
  rod(r.th2, 70 + 20 * st.ratio, 8 + 3 * st.ratio, C.b(), '(D2)');
  rod(r.th1, 80, 9, C.a(), '(D1)');
  axisMark(ctx, cx, cy);
  senseArrow(ctx, 300, 215);
  // σ1, σ2 and σ = σ1 + σ2
  const s1 = r.I1 * r.w1 * 1000, s2 = r.I2 * r.w2 * 1000, sm = RODS.I1 * Math.sqrt(RODS.C * (1 / RODS.I1 + 1 / (RODS.I1 * st.ratio))) * (2 * st.a * Math.PI / 180) * 1000;
  drawEnergyBars(ctx, { x: 370, y: 36, w: 218, h: 206, max: sm * 1.05, min: -sm * 1.05, unit: '10⁻³ kg·m²/s', decimals: 1,
    bars: [{ label: 'σ1', value: s1, color: C.a() }, { label: 'σ2', value: s2, color: C.b() }, { label: 'σ1+σ2', value: s1 + s2, color: C.s() }] });
  // angles against time
  const Th = Math.abs(st.a * (r.I1 - r.I2) / (r.I1 + r.I2));
  const A = (Th + (2 * st.a * Math.max(r.I1, r.I2)) / (r.I1 + r.I2)) * 1.08;
  const hist = st.hist;
  const t0 = Math.max(0, st.t - 6);
  const at = (k) => (tt) => { if (!hist.length || tt > st.t) return NaN; let best = hist[0]; for (const h of hist) { if (h[0] <= tt) best = h; else break; } return (best[k ? 2 : 1] * 180) / Math.PI; };
  plotCurves(ctx, {
    x: 12, y: 254, w: 576, h: 194, xMin: t0, xMax: t0 + 6, yMin: -A, yMax: A, xLabel: 't (s)', yLabel: 'θ (°)', xStep: 1,
    curves: st.hist.length ? [{ f: at(0), color: C.a(), label: 'θ1' }, { f: at(1), color: C.b(), label: 'θ2' }] : [],
    marker: st.hist.length ? st.t : null,
  });
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

/* ---------- Tab 1 ---------- */
function buildParticle() {
  const st = S.particle;
  const re = () => refresh();
  ui.mode = createSegmented({ labelKey: 'ctl.case', options: ['particle', 'two', 'hoop'].map((v) => ({ value: v, labelKey: `p.${v}` })), value: st.mode,
    onChange: (v) => { st.mode = v; st.fb = null; buildTab('particle'); } });
  controlsBody.append(ui.mode.root);
  const sl = (key, prop, min, max, step, unit, dec) => createSlider({ labelKey: key, min, max, step, value: st[prop], unit, decimals: dec, onInput: (v) => { st[prop] = v; re(); } }).root;
  if (st.mode === 'particle') controlsBody.append(sl('ctl.m', 'm', 0.1, 1, 0.1, 'kg', 1), sl('ctl.r', 'r', 10, 50, 5, 'cm', 0), sl('ctl.w', 'w', -10, 10, 1, 'rad/s', 0));
  else if (st.mode === 'two') controlsBody.append(sl('ctl.w1', 'w1', -10, 10, 1, 'rad/s', 0), sl('ctl.w2', 'w2', -10, 10, 1, 'rad/s', 0));
  else {
    controlsBody.append(sl('ctl.hm', 'hm', 100, 500, 50, 'g', 0), sl('ctl.hr', 'hr', 10, 40, 5, 'cm', 0), sl('ctl.hN', 'hN', 1, 10, 1, t('unit.rps'), 0),
      createSegmented({ labelKey: 'ctl.sense', options: [{ value: 1, labelKey: 'sense.pos' }, { value: -1, labelKey: 'sense.neg' }], value: st.hSense, onChange: (v) => { st.hSense = Number(v); re(); } }).root);
  }
  controlsBody.append(btnRow(recordBtn(() => {
    st.rows.push(st.mode === 'particle' ? { mode: 'particle', m: st.m, r: st.r, w: st.w } : st.mode === 'two' ? { mode: 'two', w1: st.w1, w2: st.w2 } : { mode: 'hoop', m: st.hm, r: st.hr, N: st.hN * st.hSense });
    st.fb = null; refresh();
  })), hint(`hint.${st.mode}`), resetBtn('particle'));
  tableBlock(st);
}
function updateParticle() {
  const st = S.particle;
  const rows = st.rows.filter((r) => r.mode === st.mode);
  if (st.mode === 'particle') {
    measRows(ui.dl, [[t('m.m'), qty(st.m, 1, 'kg')], [t('m.r'), qty(st.r, 0, 'cm')], [t('m.w'), qty(st.w, 0, 'rad/s')]]);
    renderTable(st, rows, ['col.m', 'col.r', 'col.w', 'col.I', 'col.sigma'], (r) => {
      const I = r.m * (r.r / 100) ** 2, s = I * r.w;
      return el('tr', {}, [td(num(r.m, 1)), td(num(r.r / 100, 2)), td(num(r.w, 0)),
        cell(st, r, 'I', I, 4, relTol(I, 0.01), 'fb.IOk', 'fb.IWrong'),
        cell(st, r, 's', s, 4, relTol(s, 0.01, 1e-4), 'fb.sOk', 'fb.sWrong', !calcDone(r, 'I'))]);
    });
  } else if (st.mode === 'two') {
    measRows(ui.dl, [[t('m.I12'), '2 × 10⁻³ kg·m²'], [t('m.w1'), qty(st.w1, 0, 'rad/s')], [t('m.w2'), qty(st.w2, 0, 'rad/s')]]);
    renderTable(st, rows, ['col.w1', 'col.w2', 'col.s1', 'col.s2', 'col.sSys'], (r) => {
      const s1 = APP32.I * r.w1, s2 = APP32.I * r.w2;
      return el('tr', {}, [td(num(r.w1, 0)), td(num(r.w2, 0)),
        cell(st, r, 'a', s1, 4, 1e-4, 'fb.s1Ok', 'fb.s1Wrong'),
        cell(st, r, 'b', s2, 4, 1e-4, 'fb.s1Ok', 'fb.s1Wrong', !calcDone(r, 'a')),
        cell(st, r, 'c', s1 + s2, 4, 1e-4, 'fb.sSysOk', 'fb.sSysWrong', !calcDone(r, 'b'))]);
    });
  } else {
    measRows(ui.dl, [[t('m.hm'), qty(st.hm, 0, 'g')], [t('m.hr'), qty(st.hr, 0, 'cm')], [t('m.hN'), qty(st.hN, 0, t('unit.rps'))], [t('m.sense'), t(st.hSense > 0 ? 'sense.pos' : 'sense.neg')]]);
    renderTable(st, rows, ['col.m', 'col.r', 'col.N', 'col.I', 'col.w', 'col.sigma'], (r) => {
      const I = (r.m / 1000) * (r.r / 100) ** 2, w = TAU * r.N, s = I * w;
      return el('tr', {}, [td(num(r.m / 1000, 2)), td(num(r.r / 100, 2)), td(num(r.N, 0)),
        cell(st, r, 'I', I, 4, relTol(I, 0.01), 'fb.IhOk', 'fb.IhWrong'),
        cell(st, r, 'w', w, 1, relTol(w, 0.01), 'fb.wOk', 'fb.wWrong', !calcDone(r, 'I')),
        cell(st, r, 's', s, 3, relTol(s, 0.015), 'fb.sOk', 'fb.sWrong', !calcDone(r, 'w'))]);
    });
  }
}

/* ---------- Tab 2 ---------- */
function buildTheorem() {
  const st = S.theorem;
  const again = () => { st.t = 0; st.run = false; };
  ui.N0 = createSlider({ labelKey: 'ctl.N0', min: 1000, max: 3000, step: 500, value: st.N0, unit: t('unit.rpm'), decimals: 0, onInput: (v) => { st.N0 = v; again(); refresh(); } });
  ui.M = createSlider({ labelKey: 'ctl.M', min: -0.5, max: -0.1, step: 0.05, value: st.M, unit: 'm·N', decimals: 2, onInput: (v) => { st.M = v; again(); refresh(); } });
  ui.go = createButton({ labelKey: 'ctl.brake', variant: 'primary', onClick: () => { if (st.t >= flyStop(st) - 1e-9) again(); st.run = !st.run; refresh(); } });
  controlsBody.append(ui.N0.root, ui.M.root, btnRow(ui.go, recordBtn(() => { st.rows.push({ N0: st.N0, M: st.M }); st.fb = null; refresh(); })), hint('hint.theorem'), resetBtn('theorem'));
  tableBlock(st);
}
function updateTheorem() {
  const st = S.theorem;
  const done = st.t >= flyStop(st) - 1e-9;
  const key = st.run ? 'ctl.pause' : done ? 'ctl.again' : st.t > 0 ? 'ctl.continue' : 'ctl.brake';
  if (ui.go.dataset.i18n !== key) { ui.go.dataset.i18n = key; ui.go.textContent = t(key); }
  measRows(ui.dl, [[t('m.flyM'), qty(FLY.m, 0, 'kg')], [t('m.flyR'), qty(FLY.r * 100, 0, 'cm')], [t('m.t'), qty(st.t, 1, 's')], [t('m.N'), qty((flyW(st) * 60) / TAU, 0, t('unit.rpm'))]]);
  renderTable(st, st.rows, ['col.N0', 'col.M', 'col.s0', 'col.ts'], (r) => {
    const s0 = flyI() * TAU * r.N0 / 60, ts = -s0 / r.M;
    return el('tr', {}, [td(num(r.N0, 0)), td(num(r.M, 2)),
      cell(st, r, 's', s0, 2, relTol(s0, 0.01), 'fb.s0Ok', 'fb.s0Wrong'),
      cell(st, r, 't', ts, 1, relTol(ts, 0.01), 'fb.tsOk', 'fb.tsWrong', !calcDone(r, 's'))]);
  });
}

/* ---------- Tab 3 ---------- */
function buildSkater() {
  const st = S.skater;
  ui.N1 = createSlider({ labelKey: 'ctl.N1', min: 0.2, max: 1, step: 0.1, value: st.N1, unit: t('unit.rps'), decimals: 2, onInput: (v) => { st.N1 = v; st.folded = false; refresh(); } });
  ui.arms = createButton({ labelKey: 'ctl.lower', variant: 'primary', onClick: () => { st.folded = !st.folded; refresh(); } });
  controlsBody.append(ui.N1.root, btnRow(ui.arms, recordBtn(() => { st.rows.push({ N1: st.N1 }); st.fb = null; refresh(); })), hint('hint.skater'), resetBtn('skater'));
  tableBlock(st);
}
function updateSkater() {
  const st = S.skater;
  const key = st.folded ? 'ctl.stretch' : 'ctl.lower';
  if (ui.arms.dataset.i18n !== key) { ui.arms.dataset.i18n = key; ui.arms.textContent = t(key); }
  const I = skaterI(st), N = skaterN(st), w = TAU * N;
  measRows(ui.dl, [[t('m.arms'), t(st.folded ? 'arms.down' : 'arms.out')], [t('m.Isk'), qty(I, 3, 'kg·m²')], [t('m.Nsk'), qty(N, 2, t('unit.rps'))],
    [t('m.sigmaSk'), qty(I * w, 2, 'kg·m²/s')], [t('m.EkSk'), qty(0.5 * I * w * w, 1, 'J')]]);
  renderTable(st, st.rows, ['col.I1', 'col.N1', 'col.I2', 'col.N2'], (r) => el('tr', {}, [td(num(SKATER.I1, 2)), td(num(r.N1, 2)), td(num(SKATER.I2, 3)),
    cell(st, r, 'N', (r.N1 * SKATER.I1) / SKATER.I2, 2, 0.011, 'fb.N2Ok', 'fb.N2Wrong')]));
}

/* ---------- Tab 4 ---------- */
function buildDisk() {
  const st = S.disk;
  ui.mode = createSegmented({ labelKey: 'ctl.case', options: [{ value: 'drop', labelKey: 'dk.drop' }, { value: 'clutch', labelKey: 'dk.clutch' }], value: st.mode,
    onChange: (v) => { st.mode = v; st.fb = null; buildTab('disk'); } });
  controlsBody.append(ui.mode.root);
  if (st.mode === 'drop') {
    controlsBody.append(
      createSlider({ labelKey: 'ctl.Nd', min: 1, max: 3, step: 0.5, value: st.N, unit: t('unit.rps'), decimals: 1, onInput: (v) => { st.N = v; st.dropped = false; refresh(); } }).root,
      createSlider({ labelKey: 'ctl.d', min: 0, max: 40, step: 5, value: st.d, unit: 'cm', decimals: 0, onInput: (v) => { st.d = v; st.dropped = false; refresh(); } }).root);
    ui.go = createButton({ labelKey: 'ctl.drop', variant: 'primary', onClick: () => { st.dropped = !st.dropped; st.drop = 0; refresh(); } });
    controlsBody.append(btnRow(ui.go, recordBtn(() => { st.rows.push({ mode: 'drop', N: st.N, d: st.d }); st.fb = null; refresh(); })), hint('hint.drop'));
  } else {
    controlsBody.append(
      createSlider({ labelKey: 'ctl.cN1', min: -3, max: 3, step: 0.5, value: st.cN1, unit: t('unit.rps'), decimals: 1, onInput: (v) => { st.cN1 = v; st.clutched = false; refresh(); } }).root,
      createSlider({ labelKey: 'ctl.cN2', min: -3, max: 3, step: 0.5, value: st.cN2, unit: t('unit.rps'), decimals: 1, onInput: (v) => { st.cN2 = v; st.clutched = false; refresh(); } }).root);
    ui.go = createButton({ labelKey: 'ctl.clutch', variant: 'primary', onClick: () => { st.clutched = !st.clutched; refresh(); } });
    controlsBody.append(btnRow(ui.go, recordBtn(() => { st.rows.push({ mode: 'clutch', n1: st.cN1, n2: st.cN2 }); st.fb = null; refresh(); })), hint('hint.clutch'));
  }
  controlsBody.append(resetBtn('disk'));
  tableBlock(st);
}
function updateDisk() {
  const st = S.disk;
  const rows = st.rows.filter((r) => r.mode === st.mode);
  if (st.mode === 'drop') {
    const key = st.dropped ? 'ctl.remove' : 'ctl.drop';
    if (ui.go.dataset.i18n !== key) { ui.go.dataset.i18n = key; ui.go.textContent = t(key); }
    measRows(ui.dl, [[t('m.disk'), `${qty(DISK.m * 1000, 0, 'g')}, ${qty(DISK.r * 100, 0, 'cm')}`], [t('m.part'), qty(DISK.mp * 1000, 0, 'g')], [t('m.d'), qty(st.d, 0, 'cm')], [t('m.Nnow'), qty(diskN(st), 3, t('unit.rps'))]]);
    renderTable(st, rows, ['col.Nd', 'col.d', 'col.Id', 'col.Ip', 'col.N2'], (r) => {
      const I = diskI(), Ip = DISK.mp * (r.d / 100) ** 2, N2 = (r.N * I) / (I + Ip);
      return el('tr', {}, [td(num(r.N, 1)), td(num(r.d / 100, 2)),
        cell(st, r, 'I', I, 3, relTol(I, 0.01), 'fb.IdOk', 'fb.IdWrong'),
        cell(st, r, 'p', Ip, 4, relTol(Ip, 0.01, 1e-5), 'fb.IpOk', 'fb.IpWrong', !calcDone(r, 'I')),
        cell(st, r, 'N', N2, 2, 0.011, 'fb.NdOk', 'fb.NdWrong', !calcDone(r, 'p'))]);
    });
  } else {
    const key = st.clutched ? 'ctl.unclutch' : 'ctl.clutch';
    if (ui.go.dataset.i18n !== key) { ui.go.dataset.i18n = key; ui.go.textContent = t(key); }
    measRows(ui.dl, [[t('m.I1w'), qty(WHEELS.I1, 2, 'kg·m²')], [t('m.I2w'), qty(WHEELS.I2, 2, 'kg·m²')], [t('m.clutched'), t(st.clutched ? 'yes' : 'no')]]);
    renderTable(st, rows, ['col.cN1', 'col.cN2', 'col.Nc'], (r) => el('tr', {}, [td(num(r.n1, 1)), td(num(r.n2, 1)),
      cell(st, r, 'N', (WHEELS.I1 * r.n1 + WHEELS.I2 * r.n2) / (WHEELS.I1 + WHEELS.I2), 3, 0.006, 'fb.NcOk', 'fb.NcWrong')]));
  }
}

/* ---------- Tab 5 ---------- */
function buildRods() {
  const st = S.rods;
  const again = () => { st.run = false; st.t = 0; st.hist = []; };
  controlsBody.append(
    createSlider({ labelKey: 'ctl.ratio', min: 1, max: 4, step: 0.5, value: st.ratio, unit: '', decimals: 1, onInput: (v) => { st.ratio = v; again(); refresh(); } }).root,
    createSlider({ labelKey: 'ctl.a', min: 10, max: 60, step: 5, value: st.a, unit: '°', decimals: 0, onInput: (v) => { st.a = v; again(); refresh(); } }).root);
  ui.go = createButton({ labelKey: 'ctl.release', variant: 'primary', onClick: () => { if (st.t > 12 - 1e-9) again(); st.run = !st.run; refresh(); } });
  controlsBody.append(btnRow(ui.go, createButton({ labelKey: 'ctl.again', variant: 'ghost', onClick: () => { again(); refresh(); } })), hint('hint.rods'), resetBtn('rods'));
  ui.dl = el('dl', { class: 'meas' });
  measuresBody.append(ui.dl);
}
function updateRods() {
  const st = S.rods, r = rods(st, st.t);
  const key = st.run ? 'ctl.pause' : st.t > 0 && st.t < 12 ? 'ctl.continue' : 'ctl.release';
  if (ui.go.dataset.i18n !== key) { ui.go.dataset.i18n = key; ui.go.textContent = t(key); }
  measRows(ui.dl, [
    [t('m.I1r'), qty(r.I1 * 1000, 0, '× 10⁻³ kg·m²')], [t('m.I2r'), qty(r.I2 * 1000, 0, '× 10⁻³ kg·m²')],
    [t('m.w1r'), qty(r.w1, 2, 'rad/s')], [t('m.w2r'), qty(r.w2, 2, 'rad/s')],
    [t('m.sumR'), qty((r.I1 * r.w1 + r.I2 * r.w2) * 1000, 2, '× 10⁻³ kg·m²/s')],
  ]);
}

/* ---------- Tab switching ---------- */
function buildTab(id) {
  controlsBody.replaceChildren();
  measuresBody.replaceChildren();
  ui = {};
  tableSig = '';
  ({ particle: buildParticle, theorem: buildTheorem, skater: buildSkater, disk: buildDisk, rods: buildRods })[id]();
  loop.start();
  shell?.refreshActivity();
  refresh();
}
function updateMeasures() {
  if (!shell || !ui.dl) return;
  ({ particle: updateParticle, theorem: updateTheorem, skater: updateSkater, disk: updateDisk, rods: updateRods })[shell.tab]();
}
function refresh() { updateMeasures(); requestDraw(); }
function resetTab(id) { S[id] = initialState(id); buildTab(id); }
onLangChange(() => { if (shell) buildTab(shell.tab); });

shell = initSim({
  strings,
  tabs: TABS.map((id) => ({ id, labelKey: `tab.${id}` })),
  initialTab: 'particle',
  onTab: buildTab,
  gsOnly: true,
  activityKey: (tab) => (tab === 'particle' ? `act.particle.${S.particle.mode}` : tab === 'disk' ? `act.disk.${S.disk.mode}` : `act.${tab}`),
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, rods, flyStop, diskN, clutchN, skaterN };
