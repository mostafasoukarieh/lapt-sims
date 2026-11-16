// Sec 3 SE-LH — Chapter 1: Work and mechanical energy (whole chapter). g = 10 m/s² as in the book (owner, 11 Nov 2026).
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num, qty } from '../../../shared/format.js';
import { createButton, createSegmented, createSlider, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, arrow } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { label, person } from '../../../shared/figures.js';
import { calcCell, calcSig, calcDone } from '../../../shared/calc-cell.js';
import { drawEnergyBars } from '../../../shared/energy-bars.js';
import { G_SEC3SELL as g } from '../../../shared/constants.js';

const TAU = 2 * Math.PI;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const W = 600;
const TABS = ['work', 'potential', 'kinetic', 'mechanical'];
const MODES = {
  work: ['pram', 'wall', 'brick', 'mower'],
  potential: ['sand', 'shelf', 'paths'],
  kinetic: ['spring', 'car'],
  mechanical: ['fall', 'bird', 'bounce', 'crash'],
};
const HEIGHTS = { work: 320, potential: 360, kinetic: 320, mechanical: 400 };

/* ================================================================
   Book values (and illustrative values, listed in the Info panel)
   ================================================================ */
const PRAM_M = 3; // kg (illustrative): weight 30 N, perpendicular to the motion
const MOWER = { Fpar: 30, Fperp: 25, dMax: 8 }; // Question 13: forward part 30 N, part towards the ground 25 N, 8 m
const BOOK = { m: 0.5, zShelf: 3, zTable: 1 }; // Solved Problem 3: shelf 2 m above the table, table 1 m high
const TWINS = { m: 60, H: 500 }; // Question 9 (illustrative mass and height): slopes of 30° and 40°
const SAND_K = 0.4; // depth of the hole in cm per joule of GPE (illustrative)
const SPR = { m: 0.5, k: 50 }; // Fig. 1.7 (illustrative): m1 = m2 = 0.5 kg, k = 50 N/m
const CAR = { m: 1000, a: 7 }; // Solved Problem 4: 1000 kg; braking deceleration 7 m/s² (illustrative)
const BIRD_M = 0.1; // Solved Problem 5: 100 g
const AIR_C = 0.03; // kg/m, air resistance F = c v² (illustrative)
const CRASH = { m1: 1000, v1: 20, m2: 3000, v2: 15, v: 10 }; // Question 14: 72 km/h, 54 km/h, 36 km/h

function initialState(tab) {
  switch (tab) {
    case 'work': return { mode: 'pram', F: 20, d: 10, x: 0, run: false, done: false, m: 20, h: 1.5, rows: [], fb: null, phase: 0 };
    case 'potential': return { mode: 'sand', m: 0.5, h: 1, y: 1, v: 0, run: false, dropped: false, depth: 0, ref: 'ground', pos: 'shelf', path: 30, s: 0, rows: [], fb: null, phase: 0 };
    case 'kinetic': return { mode: 'spring', vThrow: 1.5, phase: 'idle', t: 0, x2: 0, x1: 0, comp: 0, vCar: 72, carX: 0, carV: 0, carRun: false, skid: 0, rows: [], fb: null };
    default: return { mode: 'fall', m: 0.5, h0: 10, v0: 0, air: false, z: 10, v: 0, run: false, done: false, heat: 0, vb: 10, hb: 50, loss: 10, bounces: [], top: 1, crashT: 0, rows: [], fb: null, phase: 0 };
  }
}
let S = Object.fromEntries(TABS.map((k) => [k, initialState(k)]));

/* ================================================================
   Canvas and loop
   ================================================================ */
let shell;
let drawQueued = false;
let now = 0;
const canvas = document.getElementById('stage');
canvas.style.touchAction = 'none';
const view = setupCanvas(canvas, { width: W, height: 320, maxHeightVh: () => (window.innerWidth < 880 ? 52 : 76), onResize: () => requestDraw() });
function requestDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; draw(); });
}
onThemeChange(() => requestDraw());

const loop = createLoop({
  step(dt) {
    now += dt;
    if (!shell) return false;
    const tab = shell.tab, st = S[tab];
    if (tab === 'work') stepWork(st, dt);
    else if (tab === 'potential') stepPotential(st, dt);
    else if (tab === 'kinetic') stepKinetic(st, dt);
    else stepMechanical(st, dt);
    return true;
  },
  render() { draw(); updateMeasures(); },
});

/* ---------- Work ---------- */
function workTarget(st) { return st.mode === 'brick' ? st.h : st.mode === 'mower' ? st.d : st.mode === 'wall' ? 0 : st.d; }
function stepWork(st, dt) {
  if (!st.run) return;
  if (st.mode === 'wall') { st.phase += dt * 4; return; }
  const speed = st.mode === 'brick' ? 0.6 : 2; // m/s on the screen
  st.phase += dt * 6;
  st.x = Math.min(workTarget(st), st.x + speed * dt);
  if (st.x >= workTarget(st) - 1e-9) { st.run = false; st.done = true; }
}

/* ---------- Potential energy ---------- */
function stepPotential(st, dt) {
  if (st.mode === 'sand' && st.run) {
    const h = dt / 3; // slow motion ×3
    st.v += g * h; st.y -= st.v * h;
    if (st.y <= 0) {
      st.y = 0; st.run = false; st.dropped = true;
      st.depth = SAND_K * st.m * g * st.h; // cm
    }
  } else if (st.mode === 'paths' && st.run) {
    const L = pathLength(st.path);
    st.phase += dt * 6;
    st.s = Math.min(L, st.s + L / 5 * dt); // reaches the top in 5 s
    if (st.s >= L) { st.run = false; st.done = true; }
  }
}
const pathLength = (a) => TWINS.H / Math.sin(a * Math.PI / 180);

/* ---------- Kinetic energy ---------- */
const SP = { wall: 50, L0: 0.6, w: 0.12, ppm: 300, y: 180 }; // spring: natural length 0.6 m, blocks 12 cm, 300 px per m
const x1Rest = () => SP.L0; // left face of m1 (m) from the wall
function stepKinetic(st, dt) {
  if (st.mode === 'spring') {
    const om = Math.sqrt(SPR.k / SPR.m), v = st.vThrow;
    const h = dt / 2; // slow motion ×2
    if (st.phase === 'approach') {
      st.x2 -= v * h;
      if (st.x2 <= x1Rest() + SP.w) { st.x2 = x1Rest() + SP.w; st.phase = 'compress'; st.t = 0; }
    } else if (st.phase === 'compress') {
      st.t += h;
      if (om * st.t >= Math.PI) { st.phase = 'leave'; st.x1 = x1Rest(); st.comp = 0; }
      else { st.comp = (v / om) * Math.sin(om * st.t); st.x1 = x1Rest() - st.comp; }
    } else if (st.phase === 'leave') {
      st.x2 += v * h;
      if (st.x2 > 1.9) st.phase = 'end';
    }
  } else if (st.carRun) {
    const brakeX = 10; // the driver brakes at x = 10 m
    const v = st.carV;
    if (st.carX < brakeX) st.carX = Math.min(brakeX, st.carX + v * dt); // braking starts exactly at the line
    else {
      if (v - CAR.a * dt <= 0) { st.carX += (v * v) / (2 * CAR.a); st.carV = 0; } // stops inside this step
      else { st.carV = v - CAR.a * dt; st.carX += (v + st.carV) / 2 * dt; }
      st.skid = st.carX - brakeX;
      if (st.carV <= 0) { st.carRun = false; st.carDone = true; }
    }
  }
}

/* ---------- Mechanical energy ---------- */
function mechE(st) {
  const Ek = 0.5 * st.m * st.v * st.v, Ep = st.m * g * Math.max(0, st.z);
  return { Ek, Ep, Em: Ek + Ep, E0: 0.5 * st.m * st.v0 * st.v0 + st.m * g * st.h0 };
}
function resetFall(st) { Object.assign(st, { z: st.h0, v: st.v0, run: false, done: false, heat: 0 }); }
function resetBounce(st) { Object.assign(st, { z: 1, v: 0, run: false, done: false, bounces: [], top: 1, heat: 0 }); }
function stepMechanical(st, dt) {
  if (st.mode === 'bird') { st.phase += dt; return; }
  if (st.mode === 'crash') {
    if (st.run) { st.crashT += dt; if (st.crashT > 6) { st.run = false; st.done = true; } }
    return;
  }
  if (!st.run) return;
  const n = 10, h = (dt * 0.5) / n; // slow motion ×2
  for (let i = 0; i < n; i++) {
    if (st.mode === 'fall') {
      // v > 0 upward
      let a = -g;
      if (st.air) a -= Math.sign(st.v) * AIR_C * st.v * st.v / st.m;
      const vOld = st.v, zOld = st.z;
      st.v += a * h;
      st.z += (vOld + st.v) / 2 * h;
      if (st.z <= 0) {
        // landing inside this step: interpolate to z = 0
        const f = zOld / (zOld - st.z);
        st.v = vOld + (st.v - vOld) * f;
        if (st.air) st.heat += AIR_C * Math.abs(vOld) ** 3 * h * f;
        st.z = 0; st.run = false; st.done = true; break;
      }
      if (st.air) st.heat += AIR_C * Math.abs(vOld) ** 3 * h;
    } else {
      st.v -= g * h;
      st.z += st.v * h;
      if (st.z <= 0 && st.v < 0) {
        st.z = 0;
        const keep = 1 - st.loss / 100;
        const v1 = -st.v * Math.sqrt(keep);
        const E = 0.5 * st.m * st.v * st.v;
        st.heat += E * (1 - keep);
        st.v = v1;
        st.top = (v1 * v1) / (2 * g);
        st.bounces.push(st.top);
        st.rows.push({ n: st.bounces.length, prev: st.bounces.length > 1 ? st.bounces[st.bounces.length - 2] : 1 });
        if (st.bounces.length >= 6 || st.top < 0.02) { st.run = false; st.done = true; break; }
      }
    }
  }
}

/* ================================================================
   Drawing helpers
   ================================================================ */
const C = {
  KE: () => cssVar('--s1'), PE: () => cssVar('--s2'), ME: () => cssVar('--brand-navy'), heat: () => cssVar('--s4'),
  F: () => cssVar('--accent'), P: () => cssVar('--s5'), N: () => cssVar('--s3'),
};
function tag(ctx, s, x, y, o = {}) { label(ctx, s, x, y, { size: 13, weight: 700, ...o }); }
function note(ctx, s, x, y, o = {}) { label(ctx, s, x, y, { size: 12, weight: 600, color: cssVar('--muted'), ...o }); }
function vec(ctx, x1, y1, x2, y2, color, text, lw = 2.8, side = null) {
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = lw;
  if (Math.hypot(x2 - x1, y2 - y1) > 3) arrow(ctx, x1, y1, x2, y2, 9);
  if (text) {
    const right = side ?? (x2 >= x1 ? 'right' : 'left');
    label(ctx, text, x2 + (right === 'right' ? 8 : -8), y2 + (Math.abs(y2 - y1) > Math.abs(x2 - x1) ? (y2 > y1 ? -6 : 8) : -12), { size: 13, weight: 800, color, align: right === 'right' ? 'left' : 'right' });
  }
}
function dashed(ctx, x1, y1, x2, y2, color = cssVar('--muted'), lw = 1.5) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.setLineDash([6, 5]);
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore();
}
function ground(ctx, y, x1 = 8, x2 = W - 8, color = cssVar('--bench')) {
  ctx.fillStyle = color; ctx.fillRect(x1, y, x2 - x1, 10);
  ctx.strokeStyle = cssVar('--glass-stroke'); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
}
function ruler(ctx, x0, y, ppm, maxM, step = 1, labelEvery = 5) {
  ctx.strokeStyle = cssVar('--muted'); ctx.lineWidth = 1;
  for (let m = 0; m <= maxM + 1e-9; m += step) {
    const x = x0 + m * ppm, big = Math.abs(m / labelEvery - Math.round(m / labelEvery)) < 1e-6;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + (big ? 9 : 5)); ctx.stroke();
    if (big) label(ctx, `${num(m, 0)} m`, x, y + 18, { size: 10, weight: 600, color: cssVar('--muted') });
  }
}
function spring(ctx, x1, y1, x2, y2, coils = 14, amp = 10, color = cssVar('--spring-coil')) {
  const L = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / L, uy = (y2 - y1) / L;
  ctx.strokeStyle = color; ctx.lineWidth = 2.2; ctx.lineJoin = 'round';
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
// An arm drawn from the shoulder of person() (same proportions) to the point pushed
function arm(ctx, x, yFeet, h, color, hx, hy) {
  const neck = yFeet - h * 0.45 - h * 0.33;
  ctx.strokeStyle = color; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, neck + 4); ctx.lineTo(hx, hy); ctx.stroke();
}
function block(ctx, x, y, w, h, color, text) {
  ctx.fillStyle = color; roundRect(ctx, x, y, w, h, 5); ctx.fill();
  ctx.strokeStyle = cssVar('--glass-stroke'); ctx.lineWidth = 1.2; ctx.stroke();
  if (text) label(ctx, text, x + w / 2, y + h / 2, { size: 11, weight: 800, color: '#fff', halo: false });
}
function ball(ctx, x, y, r, color = cssVar('--s3')) {
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.35, 0, TAU); ctx.fill();
}
function wheel(ctx, x, y, r) {
  ctx.fillStyle = cssVar('--text'); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.fillStyle = cssVar('--silver'); ctx.beginPath(); ctx.arc(x, y, r * 0.45, 0, TAU); ctx.fill();
}
function car(ctx, x, yG, w, color, flip = false) {
  // x: rear of the vehicle (front when flip), yG: road level
  const x0 = flip ? x - w : x;
  ctx.fillStyle = color;
  roundRect(ctx, x0, yG - 34, w, 22, 6); ctx.fill();
  ctx.beginPath();
  if (!flip) { ctx.moveTo(x0 + w * 0.22, yG - 34); ctx.lineTo(x0 + w * 0.34, yG - 52); ctx.lineTo(x0 + w * 0.68, yG - 52); ctx.lineTo(x0 + w * 0.82, yG - 34); }
  else { ctx.moveTo(x0 + w * 0.18, yG - 34); ctx.lineTo(x0 + w * 0.32, yG - 52); ctx.lineTo(x0 + w * 0.66, yG - 52); ctx.lineTo(x0 + w * 0.78, yG - 34); }
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = cssVar('--sky');
  ctx.fillRect(x0 + w * (flip ? 0.36 : 0.38), yG - 48, w * 0.26, 12);
  wheel(ctx, x0 + w * 0.22, yG - 9, 9); wheel(ctx, x0 + w * 0.78, yG - 9, 9);
}
function truck(ctx, xFront, yG, w, color) {
  // drawn facing left; xFront: front of the cab
  ctx.fillStyle = cssVar('--box'); roundRect(ctx, xFront + w * 0.3, yG - 60, w * 0.7, 46, 4); ctx.fill();
  ctx.fillStyle = color; roundRect(ctx, xFront, yG - 48, w * 0.3, 34, 6); ctx.fill();
  ctx.fillStyle = cssVar('--sky'); ctx.fillRect(xFront + 5, yG - 44, w * 0.14, 12);
  for (const f of [0.15, 0.6, 0.85]) wheel(ctx, xFront + w * f, yG - 9, 9);
}

function draw() {
  if (!shell) return;
  const tab = shell.tab;
  if (view.height !== HEIGHTS[tab]) view.setLogicalSize(W, HEIGHTS[tab]);
  const ctx = view.begin();
  ctx.fillStyle = cssVar('--scene-bg');
  roundRect(ctx, 0, 0, W, HEIGHTS[tab], 14);
  ctx.fill();
  if (tab === 'work') drawWork(ctx, S.work);
  else if (tab === 'potential') drawPotential(ctx, S.potential);
  else if (tab === 'kinetic') drawKinetic(ctx, S.kinetic);
  else drawMechanical(ctx, S.mechanical);
}

/* ---------- Tab 1: work ---------- */
const FS = 1.5; // force scale: 10 N ↔ 15 px
// scale arrow: `px` logical units ↔ `text` (e.g. '20 N')
function scaleLegend(ctx, x, y, px, text) {
  vec(ctx, x, y, x + px, y, cssVar('--text'), null, 2);
  label(ctx, text, x + px + 8, y, { size: 11, weight: 700, align: 'left' });
  note(ctx, t('w.scale'), x - 8, y, { size: 11, align: 'right' });
}
function forceLegend(ctx, x, y) { scaleLegend(ctx, x, y, 20 * FS, '20 N'); }
function drawWork(ctx, st) {
  const yG = 250;
  if (st.mode === 'brick') { drawBrick(ctx, st); return; }
  ctx.fillStyle = cssVar('--sky'); ctx.fillRect(8, 8, W - 16, yG - 8);
  ground(ctx, yG, 8, W - 8, cssVar('--grass'));
  if (st.mode === 'wall') {
    // student pushing against a wall that does not move
    ctx.fillStyle = cssVar('--stone'); ctx.fillRect(360, 40, 70, yG - 40);
    ctx.strokeStyle = cssVar('--glass-stroke'); ctx.lineWidth = 1;
    for (let r = 0; r < 10; r++) { const y = 40 + r * 21; ctx.beginPath(); ctx.moveTo(360, y); ctx.lineTo(430, y); ctx.stroke(); }
    const push = st.run ? Math.sin(st.phase) * 1.5 : 0;
    const px = 322 + push;
    person(ctx, px, yG, { color: cssVar('--brand-blue'), h: 90, face: 1, run: true, walk: 0.4 });
    arm(ctx, px + 7, yG, 90, cssVar('--brand-blue'), 360, yG - 62);
    arm(ctx, px + 7, yG, 90, cssVar('--brand-blue'), 360, yG - 54);
    if (st.F > 0) vec(ctx, 360, yG - 58, 360 + st.F * FS, yG - 58, C.F(), 'F');
    tag(ctx, `F = ${qty(st.F, 0, 'N')}`, 470, 90, { color: C.F(), align: 'left' });
    tag(ctx, `d = ${qty(0, 0, 'm')}`, 470, 115, { align: 'left' });
    note(ctx, t('w.wallNote'), 300, 290);
    forceLegend(ctx, 500, 24);
    return;
  }
  const ppm = 20, x0 = 150;
  ruler(ctx, x0, yG + 10, ppm, st.mode === 'mower' ? MOWER.dMax : 15, 1, st.mode === 'mower' ? 2 : 5);
  dashed(ctx, x0, 60, x0, yG);
  const x = x0 + st.x * ppm;
  if (st.mode === 'pram') {
    // pram: body, hood, wheels; the woman behind it pushes on the handle
    const bx = x, bw = 64;
    ctx.fillStyle = cssVar('--s6'); roundRect(ctx, bx, yG - 58, bw, 32, 10); ctx.fill();
    ctx.beginPath(); ctx.moveTo(bx + bw - 6, yG - 58); ctx.arc(bx + bw - 22, yG - 58, 16, 0, Math.PI, true); ctx.closePath(); ctx.fill();
    wheel(ctx, bx + 12, yG - 9, 9); wheel(ctx, bx + bw - 12, yG - 9, 9);
    ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(bx + 4, yG - 52); ctx.lineTo(bx - 16, yG - 76); ctx.stroke();
    person(ctx, bx - 46, yG, { color: cssVar('--brand-red'), h: 92, face: 1, walk: st.run ? st.phase : null });
    arm(ctx, bx - 46, yG, 92, cssVar('--brand-red'), bx - 16, yG - 76);
    const cx = bx + bw / 2, cy = yG - 46;
    if (st.F > 0) vec(ctx, bx + bw, cy, bx + bw + st.F * FS, cy, C.F(), 'F');
    const P = PRAM_M * g;
    vec(ctx, cx - 8, cy, cx - 8, cy + P * FS, C.P(), 'P', 2.4, 'left');
    vec(ctx, cx + 8, yG, cx + 8, yG - P * FS, C.N(), t('sym.N'), 2.4, 'right');
    tag(ctx, t('w.perp'), 300, 40, { color: cssVar('--muted'), size: 12, weight: 600 });
  } else {
    // lawn mower: push along the handle, split into a forward part and a part towards the ground (Fig. 1.9)
    const bx = x, bw = 70;
    ctx.fillStyle = cssVar('--s4'); roundRect(ctx, bx, yG - 34, bw, 22, 6); ctx.fill();
    wheel(ctx, bx + 12, yG - 9, 9); wheel(ctx, bx + bw - 12, yG - 9, 9);
    const hx = bx - 70, hy = yG - 92; // the hands
    ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.moveTo(bx + 10, yG - 30); ctx.lineTo(hx, hy); ctx.stroke();
    person(ctx, hx - 30, yG, { color: cssVar('--brand-blue'), h: 96, face: 1, walk: st.run ? st.phase : null });
    arm(ctx, hx - 30, yG, 96, cssVar('--brand-blue'), hx, hy);
    // forces drawn at the hands, to scale
    const fx = MOWER.Fpar * FS * 2, fy = MOWER.Fperp * FS * 2; // ×2 so that they can be seen: 10 N ↔ 30 px here
    vec(ctx, hx, hy, hx + fx, hy + fy, C.F(), null);
    label(ctx, 'F', hx + fx * 0.55 + 12, hy + fy * 0.55 - 10, { size: 13, weight: 800, color: C.F() });
    dashed(ctx, hx + fx, hy, hx + fx, hy + fy, C.F());
    dashed(ctx, hx, hy + fy, hx + fx, hy + fy, C.F());
    vec(ctx, hx, hy, hx + fx, hy, C.KE(), null, 2.4);
    vec(ctx, hx, hy, hx, hy + fy, C.P(), null, 2.4);
    // legend of the two parts of the push
    vec(ctx, 20, 24, 50, 24, C.KE(), null, 2.4);
    label(ctx, t('w.forward'), 58, 24, { size: 13, weight: 800, color: C.KE(), align: 'left' });
    vec(ctx, 35, 38, 35, 60, C.P(), null, 2.4);
    label(ctx, t('w.down'), 58, 50, { size: 13, weight: 800, color: C.P(), align: 'left' });
    scaleLegend(ctx, 70, 80, 30, '10 N');
  }
  // displacement arrow
  if (st.x > 0.05) {
    ctx.strokeStyle = cssVar('--text'); ctx.fillStyle = cssVar('--text'); ctx.lineWidth = 1.6;
    arrow(ctx, x0, yG + 40, x, yG + 40, 7);
    label(ctx, `d = ${qty(st.x, 1, 'm')}`, (x0 + x) / 2, yG + 54, { size: 12, weight: 800 });
  }
  if (st.mode === 'pram') forceLegend(ctx, 520, 24);
}
function drawBrick(ctx, st) {
  const yG = 280, ppm = 70, x0 = 300;
  ground(ctx, yG, 8, W - 8);
  // vertical ruler in m
  ctx.strokeStyle = cssVar('--muted'); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(220, yG); ctx.lineTo(220, yG - 3.2 * ppm); ctx.stroke();
  for (let m = 0; m <= 3 + 1e-9; m += 0.5) {
    const y = yG - m * ppm;
    ctx.beginPath(); ctx.moveTo(214, y); ctx.lineTo(226, y); ctx.stroke();
    label(ctx, `${num(m, 1)} m`, 208, y, { size: 10, weight: 600, color: cssVar('--muted'), align: 'right' });
  }
  dashed(ctx, 230, yG - st.h * ppm - 0, 420, yG - st.h * ppm, cssVar('--muted'));
  note(ctx, t('w.target'), 430, yG - st.h * ppm, { align: 'left', size: 11 });
  const y = yG - st.x * ppm; // bottom of the brick
  block(ctx, x0 - 30, y - 26, 60, 26, cssVar('--brand-red'), `${num(st.m, 0)} kg`);
  // the hand pulls the rope up
  ctx.strokeStyle = cssVar('--thread'); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x0, y - 26); ctx.lineTo(x0, y - 60); ctx.stroke();
  ctx.fillStyle = cssVar('--skin'); roundRect(ctx, x0 - 12, y - 78, 24, 20, 8); ctx.fill();
  const Fw = st.m * g;
  vec(ctx, x0 + 40, y - 13, x0 + 40, y - 13 - Fw * 0.25, C.F(), 'F', 2.8, 'right');
  vec(ctx, x0 - 40, y - 13, x0 - 40, y - 13 + Fw * 0.25, C.P(), 'P', 2.8, 'left');
  if (st.x > 0.05) {
    ctx.strokeStyle = cssVar('--text'); ctx.fillStyle = cssVar('--text'); ctx.lineWidth = 1.6;
    arrow(ctx, 500, yG, 500, y, 7);
    label(ctx, `h = ${qty(st.x, 2, 'm')}`, 510, (yG + y) / 2, { size: 12, weight: 800, align: 'left' });
  }
  scaleLegend(ctx, 70, 24, 25, '100 N');
  note(ctx, t('w.constantSpeed'), 20, 44, { size: 11, align: 'left' });
}

/* ---------- Tab 2: potential energy ---------- */
function drawPotential(ctx, st) {
  if (st.mode === 'sand') drawSand(ctx, st);
  else if (st.mode === 'shelf') drawShelf(ctx, st);
  else drawPaths(ctx, st);
}
function drawSand(ctx, st) {
  const yS = 300, ppm = 120, x = 300;
  // sand box
  ctx.fillStyle = cssVar('--sand'); ctx.fillRect(200, yS, 200, 44);
  ctx.strokeStyle = cssVar('--wood'); ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(196, yS - 6); ctx.lineTo(196, yS + 48); ctx.lineTo(404, yS + 48); ctx.lineTo(404, yS - 6); ctx.stroke();
  // ruler for the height
  ctx.strokeStyle = cssVar('--muted'); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(150, yS); ctx.lineTo(150, yS - 2 * ppm); ctx.stroke();
  for (let m = 0; m <= 2 + 1e-9; m += 0.25) {
    const y = yS - m * ppm, big = Math.abs(m * 2 - Math.round(m * 2)) < 1e-6;
    ctx.beginPath(); ctx.moveTo(big ? 142 : 146, y); ctx.lineTo(158, y); ctx.stroke();
    if (big) label(ctx, `${num(m, 1)} m`, 136, y, { size: 10, weight: 600, color: cssVar('--muted'), align: 'right' });
  }
  dashed(ctx, 160, yS - st.h * ppm, 280, yS - st.h * ppm);
  const r = st.m > 0.3 ? 14 : 10;
  const dpx = st.dropped ? st.depth * 4 : 0; // 1 cm ↔ 4 px (depth drawn ×4 / height)
  if (st.dropped) {
    ctx.fillStyle = cssVar('--scene-bg');
    ctx.beginPath(); ctx.ellipse(x, yS, r + 4 + dpx * 0.4, dpx + 2, 0, 0, Math.PI); ctx.fill();
    ctx.strokeStyle = cssVar('--soot'); ctx.lineWidth = 1.2; ctx.stroke();
  }
  const yb = st.dropped ? yS + dpx - r : yS - st.y * ppm - r;
  ball(ctx, x, yb, r, cssVar('--metal'));
  if (st.dropped) {
    ctx.strokeStyle = cssVar('--text'); ctx.fillStyle = cssVar('--text'); ctx.lineWidth = 1.4;
    arrow(ctx, 440, yS, 440, yS + dpx, 6);
    label(ctx, `${t('pe.hole')} ${qty(st.depth, 1, 'cm')}`, 450, yS + dpx / 2 + 4, { size: 12, weight: 800, align: 'left' });
  } else {
    ctx.strokeStyle = cssVar('--text'); ctx.fillStyle = cssVar('--text'); ctx.lineWidth = 1.4;
    if (st.y > 0.05) arrow(ctx, 440, yS, 440, yS - st.y * ppm, 6);
    label(ctx, `h = ${qty(st.y, 2, 'm')}`, 450, yS - st.y * ppm / 2, { size: 12, weight: 800, align: 'left' });
  }
  note(ctx, t('pe.sandNote'), 20, 24, { size: 11, align: 'left' });
}
const SH = { yG: 330, ppm: 85 };
function drawShelf(ctx, st) {
  const Y = (z) => SH.yG - z * SH.ppm;
  ground(ctx, SH.yG);
  // table 1 m high and a shelf 2 m above it (Fig. 1.6)
  ctx.fillStyle = cssVar('--wood');
  ctx.fillRect(140, Y(BOOK.zTable), 200, 10);
  ctx.fillRect(152, Y(BOOK.zTable) + 10, 10, SH.ppm * BOOK.zTable - 10);
  ctx.fillRect(318, Y(BOOK.zTable) + 10, 10, SH.ppm * BOOK.zTable - 10);
  ctx.fillStyle = cssVar('--stone'); ctx.fillRect(380, Y(3.6), 14, Y(0) - Y(3.6));
  ctx.fillStyle = cssVar('--wood'); ctx.fillRect(230, Y(BOOK.zShelf), 150, 8);
  label(ctx, t('pe.table'), 240, Y(BOOK.zTable) + 26, { size: 12, weight: 700 });
  label(ctx, t('pe.shelf'), 304, Y(BOOK.zShelf) + 20, { size: 12, weight: 700 });
  // book
  const zb = st.pos === 'shelf' ? BOOK.zShelf : BOOK.zTable;
  const bx = st.pos === 'shelf' ? 280 : 210;
  block(ctx, bx, Y(zb) - 18, 52, 18, cssVar('--book'), '0.5 kg');
  // reference level
  const zr = st.ref === 'ground' ? 0 : BOOK.zTable;
  ctx.save(); ctx.strokeStyle = C.PE(); ctx.lineWidth = 2; ctx.setLineDash([10, 6]);
  ctx.beginPath(); ctx.moveTo(14, Y(zr)); ctx.lineTo(W - 14, Y(zr)); ctx.stroke(); ctx.restore();
  label(ctx, t('pe.refLine'), W - 16, Y(zr) - 11, { size: 12, weight: 800, color: C.PE(), align: 'right' });
  // height h of the book above the reference level
  const hx = 392;
  if (zb - zr > 0.01) {
    ctx.strokeStyle = C.PE(); ctx.fillStyle = C.PE(); ctx.lineWidth = 2;
    arrow(ctx, hx + 30, Y(zr), hx + 30, Y(zb), 7);
  }
  label(ctx, `h = ${qty(zb - zr, 0, 'm')}`, hx + 38, (Y(zr) + Y(zb)) / 2, { size: 13, weight: 800, color: C.PE(), align: 'left' });
  // heights from the book
  ctx.strokeStyle = cssVar('--muted'); ctx.fillStyle = cssVar('--muted'); ctx.lineWidth = 1.2;
  arrow(ctx, 100, Y(0), 100, Y(BOOK.zTable), 6);
  label(ctx, '1 m', 92, Y(0.5), { size: 11, weight: 700, color: cssVar('--muted'), align: 'right' });
  arrow(ctx, 100, Y(BOOK.zTable), 100, Y(BOOK.zShelf), 6);
  label(ctx, '2 m', 92, Y(2), { size: 11, weight: 700, color: cssVar('--muted'), align: 'right' });
  dashed(ctx, 100, Y(BOOK.zShelf), 230, Y(BOOK.zShelf));
}
const PT = { yG: 320, top: 150 };
function drawPaths(ctx, st) {
  // a mountain with two slopes of 30° (left) and 40° (right), drawn to scale
  const Hpx = PT.yG - PT.top, cx = 320;
  const lx = cx - Hpx / Math.tan(Math.PI / 6), rx = cx + Hpx / Math.tan((40 * Math.PI) / 180);
  ctx.fillStyle = cssVar('--sky'); ctx.fillRect(8, 8, W - 16, PT.yG - 8);
  ctx.fillStyle = cssVar('--land');
  ctx.beginPath(); ctx.moveTo(lx, PT.yG); ctx.lineTo(cx, PT.top); ctx.lineTo(rx, PT.yG); ctx.closePath(); ctx.fill();
  ground(ctx, PT.yG, 8, W - 8, cssVar('--grass'));
  label(ctx, '30°', lx + 46, PT.yG - 12, { size: 12, weight: 800 });
  label(ctx, '40°', rx - 36, PT.yG - 12, { size: 12, weight: 800 });
  // heights
  dashed(ctx, cx, PT.top, cx, PT.yG);
  label(ctx, `h = ${qty(TWINS.H, 0, 'm')}`, cx + 8, (PT.top + PT.yG) / 2, { size: 12, weight: 800, align: 'left' });
  // the chosen path, highlighted
  const left = st.path === 30;
  ctx.strokeStyle = C.F(); ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(left ? lx : rx, PT.yG); ctx.lineTo(cx, PT.top); ctx.stroke();
  // climber
  const L = pathLength(st.path), f = st.s / L;
  const px = left ? lx + (cx - lx) * f : rx + (cx - rx) * f, py = PT.yG + (PT.top - PT.yG) * f;
  person(ctx, px, py, { color: left ? cssVar('--brand-red') : cssVar('--brand-blue'), h: 34, face: left ? 1 : -1, walk: st.run ? st.phase : null });
  label(ctx, t(left ? 'pe.karim' : 'pe.asaad'), px, py - 48, { size: 12, weight: 800 });
  note(ctx, t('pe.pathsNote'), 20, 24, { size: 11, align: 'left' });
}

/* ---------- Tab 3: kinetic energy ---------- */
function drawKinetic(ctx, st) {
  if (st.mode === 'spring') drawSpringScene(ctx, st);
  else drawCar(ctx, st);
}
function drawSpringScene(ctx, st) {
  const yT = 230, X = (m) => SP.wall + m * SP.ppm, bw = SP.w * SP.ppm, bh = 46;
  ground(ctx, yT, 20, W - 20, cssVar('--wood'));
  ctx.fillStyle = cssVar('--stone'); ctx.fillRect(SP.wall - 22, 110, 22, yT - 110);
  const x1 = st.phase === 'compress' ? st.x1 : x1Rest();
  spring(ctx, SP.wall, yT - bh / 2, X(x1), yT - bh / 2, 14, 10);
  block(ctx, X(x1), yT - bh, bw, bh, cssVar('--s2'), 'm₁');
  dashed(ctx, X(x1Rest()), 90, X(x1Rest()), yT);
  const placed = st.phase !== 'idle';
  if (placed) {
    const x2 = st.x2;
    block(ctx, X(x2), yT - bh, bw, bh, cssVar('--s1'), 'm₂');
    if (st.phase === 'approach') vec(ctx, X(x2) + bw / 2, yT - bh - 18, X(x2) + bw / 2 - st.vThrow * 40, yT - bh - 18, C.KE(), 'v', 2.8, 'left');
    if (st.phase === 'leave' || st.phase === 'end') vec(ctx, X(x2) + bw / 2, yT - bh - 18, X(x2) + bw / 2 + st.vThrow * 40, yT - bh - 18, C.KE(), 'v', 2.8, 'right');
  }
  if (st.phase === 'compress') {
    ctx.strokeStyle = cssVar('--text'); ctx.fillStyle = cssVar('--text'); ctx.lineWidth = 1.4;
    if (st.comp > 0.005) arrow(ctx, X(x1Rest()), yT + 26, X(x1), yT + 26, 6);
    label(ctx, `${t('ke.comp')} ${qty(st.comp * 100, 1, 'cm')}`, X(x1Rest()) + 10, yT + 44, { size: 12, weight: 800, align: 'left' });
  }
  const msg = { idle: 'ke.sIdle', rest: 'ke.sRest', approach: 'ke.sApproach', compress: 'ke.sCompress', leave: 'ke.sLeave', end: 'ke.sLeave' }[st.phase];
  tag(ctx, t(msg), 300, 40, { size: 13 });
  if (st.phase === 'approach' || st.phase === 'compress' || st.phase === 'leave') note(ctx, t('ke.slow'), 300, 290, { size: 11 });
}
const CR = { yG: 230, x0: 30, ppm: 5.2, brake: 10 };
function drawCar(ctx, st) {
  const X = (m) => CR.x0 + m * CR.ppm;
  ctx.fillStyle = cssVar('--road'); ctx.fillRect(8, CR.yG - 4, W - 16, 30);
  ctx.strokeStyle = cssVar('--road-line'); ctx.lineWidth = 2; ctx.setLineDash([16, 12]);
  ctx.beginPath(); ctx.moveTo(8, CR.yG + 11); ctx.lineTo(W - 8, CR.yG + 11); ctx.stroke(); ctx.setLineDash([]);
  ruler(ctx, X(CR.brake), CR.yG + 30, CR.ppm, 90, 5, 20);
  // brake line and skid marks
  ctx.strokeStyle = cssVar('--brand-red'); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(X(CR.brake), CR.yG - 70); ctx.lineTo(X(CR.brake), CR.yG + 26); ctx.stroke();
  label(ctx, t('ke.brakeHere'), X(CR.brake) + 6, CR.yG - 78, { size: 11, weight: 800, color: cssVar('--brand-red'), align: 'left' });
  const w = 64, front = X(st.carX);
  if (st.skid > 0) {
    ctx.fillStyle = cssVar('--soot');
    ctx.fillRect(X(CR.brake), CR.yG - 3, Math.max(0, front - w * 0.22 - X(CR.brake)), 4);
  }
  car(ctx, front - w, CR.yG, w, cssVar('--brand-blue'));
  if (st.carV > 0.1 || (!st.carRun && !st.carDone)) {
    const v = st.carRun ? st.carV : st.vCar / 3.6;
    vec(ctx, front - w / 2, CR.yG - 66, front - w / 2 + v * 2.4, CR.yG - 66, C.KE(), 'v');
  }
  if (st.skid > 0) {
    ctx.strokeStyle = cssVar('--text'); ctx.fillStyle = cssVar('--text'); ctx.lineWidth = 1.4;
    arrow(ctx, X(CR.brake), CR.yG + 62, X(CR.brake + st.skid), CR.yG + 62, 6);
    label(ctx, `${t('ke.skid')} ${qty(st.skid, 1, 'm')}`, X(CR.brake) + 8, CR.yG + 78, { size: 12, weight: 800, align: 'left' });
  }
  note(ctx, t('ke.carNote'), 20, 24, { size: 11, align: 'left' });
}

/* ---------- Tab 4: mechanical energy ---------- */
function bars(E, heat) {
  const b = [
    { label: t('sym.KE'), value: E.Ek, color: C.KE() },
    { label: t('sym.PE'), value: E.Ep, color: C.PE() },
    { label: t('sym.ME'), value: E.Em, color: C.ME() },
  ];
  if (heat != null) b.push({ label: t('sym.heat'), value: heat, color: C.heat() });
  return b;
}
function drawMechanical(ctx, st) {
  if (st.mode === 'fall') drawFall(ctx, st);
  else if (st.mode === 'bird') drawBird(ctx, st);
  else if (st.mode === 'bounce') drawBounce(ctx, st);
  else drawCrash(ctx, st);
}
function heightScale(ctx, x, yG, ppm, max, step, unitDec = 0) {
  ctx.strokeStyle = cssVar('--muted'); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x, yG); ctx.lineTo(x, yG - max * ppm); ctx.stroke();
  for (let m = 0; m <= max + 1e-9; m += step) {
    const y = yG - m * ppm;
    ctx.beginPath(); ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y); ctx.stroke();
    label(ctx, `${num(m, unitDec)} m`, x - 9, y, { size: 10, weight: 600, color: cssVar('--muted'), align: 'right' });
  }
}
function drawFall(ctx, st) {
  const yG = 370, ppm = 10;
  ctx.fillStyle = cssVar('--sky'); ctx.fillRect(8, 8, 392, yG - 8);
  ground(ctx, yG, 8, 400, cssVar('--grass'));
  heightScale(ctx, 70, yG, ppm, 32, 4);
  label(ctx, t('me.refGround'), 90, yG + 18, { size: 11, weight: 700, color: C.PE(), align: 'left' });
  dashed(ctx, 80, yG - st.h0 * ppm, 380, yG - st.h0 * ppm);
  label(ctx, `h₀ = ${qty(st.h0, 0, 'm')}`, 380, yG - st.h0 * ppm - 10, { size: 11, weight: 700, color: cssVar('--muted'), align: 'right' });
  const x = 230, y = yG - st.z * ppm;
  ball(ctx, x, y - 9, 9);
  if (Math.abs(st.v) > 0.3 && !st.done) vec(ctx, x + 22, y - 9, x + 22, y - 9 - clamp(st.v * 3, -Math.max(20, y - 40 - 9), 120), C.KE(), 'v');
  if (st.air) note(ctx, t('me.airOn'), 20, 24, { size: 11, align: 'left' });
  const E = mechE(st);
  drawEnergyBars(ctx, { x: 410, y: 12, w: 180, h: 376, bars: bars(E, st.air ? st.heat : null), max: E.E0 * 1.1, unit: 'J', values: false, title: t('me.bars') });
}
function drawBird(ctx, st) {
  const yG = 370, ppm = 3.2;
  ctx.fillStyle = cssVar('--sky'); ctx.fillRect(8, 8, 392, yG - 8);
  ground(ctx, yG, 8, 400, cssVar('--grass'));
  heightScale(ctx, 60, yG, ppm, 100, 20);
  label(ctx, t('me.refGround'), 80, yG + 18, { size: 11, weight: 700, color: C.PE(), align: 'left' });
  const span = 300, x = 80 + ((st.phase * st.vb * 12) % span + span) % span, y = yG - st.hb * ppm;
  // bird: body and flapping wings
  const flap = Math.sin(st.phase * 12) * 8;
  ctx.fillStyle = cssVar('--brand-navy');
  ctx.beginPath(); ctx.ellipse(x, y, 12, 6, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - 4, y - 2); ctx.lineTo(x - 12, y - 10 - flap); ctx.lineTo(x + 4, y - 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 12, y - 3, 4, 0, TAU); ctx.fill();
  ctx.fillStyle = cssVar('--gold'); ctx.beginPath(); ctx.moveTo(x + 15, y - 4); ctx.lineTo(x + 21, y - 2); ctx.lineTo(x + 15, y); ctx.fill();
  if (st.vb > 0.2) vec(ctx, x + 24, y, x + 24 + st.vb * 4, y, C.KE(), 'v');
  dashed(ctx, x, y + 8, x, yG);
  label(ctx, `h = ${qty(st.hb, 0, 'm')}`, x + 8, (y + yG) / 2, { size: 12, weight: 800, align: 'left' });
  const Ek = 0.5 * BIRD_M * st.vb ** 2, Ep = BIRD_M * g * st.hb;
  drawEnergyBars(ctx, { x: 410, y: 12, w: 180, h: 376, bars: bars({ Ek, Ep, Em: Ek + Ep }), max: 0.5 * BIRD_M * 400 + BIRD_M * g * 100, unit: 'J', values: false, title: t('me.bars') });
}
function drawBounce(ctx, st) {
  const yG = 360, ppm = 300;
  ground(ctx, yG, 8, 400);
  heightScale(ctx, 70, yG, ppm, 1.1, 0.1, 1);
  // heights reached, marked on the scale
  st.bounces.forEach((h, i) => {
    dashed(ctx, 80, yG - h * ppm, 300, yG - h * ppm, cssVar('--s2'), 1.2);
    label(ctx, `${i + 1}`, 308, yG - h * ppm, { size: 11, weight: 800, color: cssVar('--s2'), align: 'left' });
  });
  dashed(ctx, 80, yG - ppm, 300, yG - ppm);
  label(ctx, t('me.start'), 308, yG - ppm, { size: 11, weight: 800, align: 'left' });
  ball(ctx, 230, yG - st.z * ppm - 10, 10, cssVar('--brand-red'));
  const E = { Ek: 0.5 * st.m * st.v * st.v, Ep: st.m * g * st.z };
  E.Em = E.Ek + E.Ep;
  drawEnergyBars(ctx, { x: 410, y: 12, w: 180, h: 376, bars: bars(E, st.heat), max: st.m * g * 1.1, unit: 'J', decimals: 2, title: t('me.bars') });
}
function drawCrash(ctx, st) {
  const yG = 250, ppm = 6;
  ctx.fillStyle = cssVar('--road'); ctx.fillRect(8, yG - 4, W - 16, 30);
  // before: the car (from the left) and the truck (from the right) approach; they meet at x = 300 at t = 2 s
  const tc = 2;
  const tt = st.crashT;
  let carFront, truckFront;
  if (tt < tc) {
    carFront = 300 - CRASH.v1 * (tc - tt) * ppm;
    truckFront = 300 + CRASH.v2 * (tc - tt) * ppm;
  } else {
    // stuck together, moving at 36 km/h (book value) in the direction of the truck
    const dx = -CRASH.v * (tt - tc) * ppm;
    carFront = 300 + dx; truckFront = 300 + dx;
  }
  car(ctx, carFront - 64, yG, 64, cssVar('--brand-blue'));
  truck(ctx, truckFront, yG, 120, cssVar('--brand-red'));
  label(ctx, '1000 kg', carFront - 32, yG - 64, { size: 11, weight: 800 });
  label(ctx, '3000 kg', truckFront + 80, yG - 74, { size: 11, weight: 800 });
  if (tt < tc) {
    vec(ctx, carFront - 32, yG - 86, carFront - 32 + CRASH.v1 * 3, yG - 86, C.KE(), '72 km/h');
    vec(ctx, truckFront + 60, yG - 96, truckFront + 60 - CRASH.v2 * 3, yG - 96, C.KE(), '54 km/h', 2.8, 'left');
  } else {
    vec(ctx, truckFront, yG - 96, truckFront - CRASH.v * 3, yG - 96, C.KE(), '36 km/h', 2.8, 'left');
    if (tt < tc + 0.6) {
      ctx.strokeStyle = cssVar('--gold'); ctx.lineWidth = 3;
      for (let k = 0; k < 8; k++) { const a = k * TAU / 8; ctx.beginPath(); ctx.moveTo(300 + 10 * Math.cos(a), yG - 40 + 10 * Math.sin(a)); ctx.lineTo(300 + 26 * Math.cos(a), yG - 40 + 26 * Math.sin(a)); ctx.stroke(); }
    }
  }
  tag(ctx, t(tt < tc ? 'me.before' : 'me.after'), 300, 40, { size: 14 });
  note(ctx, t('me.crashNote'), 300, 300, { size: 11 });
}

/* ================================================================
   Controls and measurements
   ================================================================ */
const controlsBody = document.getElementById('controls-body');
const measuresBody = document.getElementById('measures-body');
let ui = {};
let tableSig = '';
function measRows(dl, rows) {
  dl.replaceChildren(...rows.flatMap(([k, v, cls]) => [el('dt', {}, k), el('dd', cls ? { class: cls } : {}, v)]));
}
function statusBox() { return el('p', { class: 'status', hidden: '' }); }
function showStatus(box, fb) {
  if (!fb) { box.hidden = true; return; }
  box.hidden = false;
  box.className = `status ${fb.type || ''}`;
  box.textContent = t(fb.key, fb.params);
}
function hint(key) { return el('p', { class: 'muted', style: 'font-size:0.88rem;margin:10px 0 0', dataset: { i18n: key } }, t(key)); }
const btnRow = (...b) => el('div', { class: 'btn-row' }, b);
const resetBtn = (id) => btnRow(createButton({ labelKey: 'ui.reset', variant: 'ghost', onClick: () => resetTab(id) }));
function clearRow(onClick) { return el('div', { class: 'btn-row', style: 'margin-top:8px' }, [createButton({ labelKey: 'ctl.clearTable', variant: 'ghost', onClick })]); }
const fbOf = (res, okKey, badKey) => (res === 'invalid' ? { type: 'warn', key: 'calcInvalid' } : res === 'wrong' ? { type: 'bad', key: badKey } : { type: 'good', key: okKey });
const relTol = (v, p) => Math.max(Math.abs(v) * p, 1e-6);
function modeControl(tab, labelKey) {
  const st = S[tab];
  return createSegmented({
    labelKey, options: MODES[tab].map((v) => ({ value: v, labelKey: `mode.${v}` })), value: st.mode,
    onChange: (v) => { if (v === st.mode) return; S[tab] = { ...initialState(tab), mode: v }; prepTab(tab); buildTab(tab); },
  });
}
function tableBlock(st) {
  ui.dl = el('dl', { class: 'meas' });
  ui.tableWrap = el('div', { class: 'table-scroll' });
  ui.table = el('table', { class: 'data' });
  ui.tableWrap.append(ui.table);
  ui.clear = clearRow(() => { st.rows = []; st.fb = null; refresh(); });
  ui.status = statusBox();
  measuresBody.append(ui.dl, ui.tableWrap, ui.clear, ui.status);
}
function renderTable(st, cols, rowFn, rows = st.rows) {
  const sig = calcSig(rows) + rows.length + cols.join();
  if (sig !== tableSig) {
    ui.table.replaceChildren(
      el('thead', {}, el('tr', {}, cols.map((k) => el('th', {}, t(k))))),
      el('tbody', {}, rows.map(rowFn)),
    );
    tableSig = sig;
  }
  ui.tableWrap.hidden = rows.length === 0;
  ui.clear.hidden = ui.tableWrap.hidden;
  showStatus(ui.status, st.fb);
}
function setGo(btn, key) { if (btn && btn.dataset.i18n !== key) { btn.dataset.i18n = key; btn.textContent = t(key); } }

/* ---------- Tab 1: work ---------- */
function buildWork() {
  const st = S.work;
  controlsBody.append(modeControl('work', 'ctl.situation').root);
  const restart = () => { st.x = 0; st.run = false; st.done = false; };
  if (st.mode === 'pram' || st.mode === 'wall') {
    ui.F = createSlider({ labelKey: 'ctl.F', min: 0, max: 50, step: 5, value: st.F, unit: 'N', onInput: (v) => { st.F = v; restart(); refresh(); } });
    controlsBody.append(ui.F.root);
  }
  if (st.mode === 'pram') controlsBody.append(createSlider({ labelKey: 'ctl.d', min: 1, max: 15, step: 1, value: st.d, unit: 'm', onInput: (v) => { st.d = v; restart(); refresh(); } }).root);
  if (st.mode === 'mower') controlsBody.append(createSlider({ labelKey: 'ctl.d', min: 1, max: MOWER.dMax, step: 1, value: Math.min(st.d, MOWER.dMax), unit: 'm', onInput: (v) => { st.d = v; restart(); refresh(); } }).root);
  if (st.mode === 'brick') {
    controlsBody.append(
      createSlider({ labelKey: 'ctl.mBrick', min: 5, max: 30, step: 1, value: st.m, unit: 'kg', onInput: (v) => { st.m = v; restart(); refresh(); } }).root,
      createSlider({ labelKey: 'ctl.h', min: 0.5, max: 3, step: 0.1, value: st.h, unit: 'm', decimals: 1, onInput: (v) => { st.h = v; restart(); refresh(); } }).root,
    );
  }
  ui.go = createButton({ labelKey: `go.${st.mode}`, variant: 'primary', onClick: () => {
    if (st.mode === 'wall') { st.run = !st.run; st.done = true; refresh(); return; }
    if (st.done) restart();
    st.run = !st.run; st.fb = null; refresh();
  } });
  const rec = createButton({ labelKey: 'ctl.record', variant: 'secondary', onClick: () => {
    if (!st.done) { st.fb = { type: 'warn', key: st.mode === 'wall' ? 'fb.pushFirst' : 'fb.moveFirst' }; refresh(); return; }
    st.rows.push({ mode: st.mode, F: st.F, d: st.mode === 'wall' ? 0 : st.mode === 'brick' ? st.h : st.d, m: st.m });
    st.fb = null; refresh();
  } });
  controlsBody.append(btnRow(ui.go, rec), hint(`hint.${st.mode}`), resetBtn('work'));
  tableBlock(st);
}
function updateWork() {
  const st = S.work;
  setGo(ui.go, st.mode === 'wall' ? (st.run ? 'ctl.stop' : 'go.wall') : st.run ? 'ctl.pause' : st.done ? 'ctl.again' : st.x > 0 ? 'ctl.continue' : `go.${st.mode}`);
  const rows = [];
  if (st.mode === 'pram') rows.push([t('m.F'), qty(st.F, 0, 'N')], [t('m.dDone'), qty(st.x, 1, 'm')], [t('m.angle'), t('m.parallel')], [t('m.WP'), t('m.zeroPerp')]);
  else if (st.mode === 'wall') rows.push([t('m.F'), qty(st.F, 0, 'N')], [t('m.dDone'), qty(0, 0, 'm')]);
  else if (st.mode === 'brick') rows.push([t('m.mBrick'), qty(st.m, 0, 'kg')], [t('m.g'), qty(g, 0, 'm/s²')], [t('m.hDone'), qty(st.x, 2, 'm')]);
  else rows.push([t('m.Fpar'), qty(MOWER.Fpar, 0, 'N')], [t('m.Fperp'), qty(MOWER.Fperp, 0, 'N')], [t('m.dDone'), qty(st.x, 1, 'm')]);
  measRows(ui.dl, rows);
  const rs = st.rows.filter((r) => r.mode === st.mode);
  const ck = (key, expected, okK, badK, disabled = false, tol) => (r) => calcCell(r, key, { expected, decimals: 0, tol, disabled, onCheck: (res) => { st.fb = fbOf(res, okK, badK); refresh(); } });
  if (st.mode === 'pram' || st.mode === 'wall') {
    renderTable(st, ['col.F', 'col.d', 'col.W'], (r) => el('tr', {}, [
      el('td', {}, num(r.F, 0)), el('td', {}, num(r.d, 0)), ck('W', r.F * r.d, 'fb.WOk', 'fb.WWrong', false, 0.5)(r),
    ]), rs);
  } else if (st.mode === 'brick') {
    renderTable(st, ['col.m', 'col.h', 'col.Fw', 'col.Wh'], (r) => el('tr', {}, [
      el('td', {}, num(r.m, 0)), el('td', {}, num(r.d, 1)),
      ck('F', r.m * g, 'fb.FwOk', 'fb.FwWrong', false, 0.5)(r),
      calcCell(r, 'W', { expected: r.m * g * r.d, decimals: 0, tol: 0.5, disabled: !calcDone(r, 'F'), onCheck: (res) => { st.fb = fbOf(res, 'fb.WhOk', 'fb.WhWrong'); refresh(); } }),
    ]), rs);
  } else {
    renderTable(st, ['col.Fpar', 'col.d', 'col.W'], (r) => el('tr', {}, [
      el('td', {}, num(MOWER.Fpar, 0)), el('td', {}, num(r.d, 0)), ck('W', MOWER.Fpar * r.d, 'fb.WmOk', 'fb.WmWrong', false, 0.5)(r),
    ]), rs);
  }
}

/* ---------- Tab 2: potential energy ---------- */
function buildPotential() {
  const st = S.potential;
  controlsBody.append(modeControl('potential', 'ctl.situation').root);
  if (st.mode === 'sand') {
    ui.m = createSegmented({ labelKey: 'ctl.ball', options: [{ value: '0.2', labelKey: 'ball.light' }, { value: '0.5', labelKey: 'ball.heavy' }], value: String(st.m),
      onChange: (v) => { st.m = Number(v); resetSand(st); refresh(); } });
    ui.h = createSlider({ labelKey: 'ctl.hDrop', min: 0.2, max: 2, step: 0.1, value: st.h, unit: 'm', decimals: 1, onInput: (v) => { st.h = v; resetSand(st); refresh(); } });
    ui.go = createButton({ labelKey: 'go.drop', variant: 'primary', onClick: () => { if (st.dropped || st.run) resetSand(st); st.run = true; st.fb = null; refresh(); } });
    const rec = createButton({ labelKey: 'ctl.record', variant: 'secondary', onClick: () => {
      if (!st.dropped) { st.fb = { type: 'warn', key: 'fb.dropFirst' }; refresh(); return; }
      st.rows.push({ mode: 'sand', m: st.m, h: st.h, depth: st.depth }); st.fb = null; refresh();
    } });
    controlsBody.append(ui.m.root, ui.h.root, btnRow(ui.go, rec), hint('hint.sand'));
  } else if (st.mode === 'shelf') {
    ui.ref = createSegmented({ labelKey: 'ctl.ref', options: [{ value: 'ground', labelKey: 'rl.ground' }, { value: 'table', labelKey: 'rl.table' }], value: st.ref, onChange: (v) => { st.ref = v; refresh(); } });
    ui.pos = createSegmented({ labelKey: 'ctl.pos', options: [{ value: 'shelf', labelKey: 'pos.shelf' }, { value: 'table', labelKey: 'pos.table' }], value: st.pos, onChange: (v) => { st.pos = v; refresh(); } });
    const rec = createButton({ labelKey: 'ctl.record', variant: 'primary', onClick: () => {
      const zb = st.pos === 'shelf' ? BOOK.zShelf : BOOK.zTable, zr = st.ref === 'ground' ? 0 : BOOK.zTable;
      st.rows.push({ mode: 'shelf', ref: st.ref, pos: st.pos, h: zb - zr }); st.fb = null; refresh();
    } });
    controlsBody.append(ui.ref.root, ui.pos.root, btnRow(rec), hint('hint.shelf'));
  } else {
    ui.path = createSegmented({ labelKey: 'ctl.path', options: [{ value: '30', labelKey: 'path.30' }, { value: '40', labelKey: 'path.40' }], value: String(st.path),
      onChange: (v) => { st.path = Number(v); st.s = 0; st.run = false; st.done = false; refresh(); } });
    ui.go = createButton({ labelKey: 'go.climb', variant: 'primary', onClick: () => { if (st.done) { st.s = 0; st.done = false; } st.run = !st.run; st.fb = null; refresh(); } });
    const rec = createButton({ labelKey: 'ctl.record', variant: 'secondary', onClick: () => {
      if (!st.done) { st.fb = { type: 'warn', key: 'fb.climbFirst' }; refresh(); return; }
      st.rows.push({ mode: 'paths', path: st.path }); st.fb = null; refresh();
    } });
    controlsBody.append(ui.path.root, btnRow(ui.go, rec), hint('hint.paths'));
  }
  controlsBody.append(resetBtn('potential'));
  tableBlock(st);
}
function resetSand(st) { Object.assign(st, { y: st.h, v: 0, run: false, dropped: false, depth: 0 }); }
function updatePotential() {
  const st = S.potential;
  const rs = st.rows.filter((r) => r.mode === st.mode);
  const cb = (okK, badK) => (res) => { st.fb = fbOf(res, okK, badK); refresh(); };
  if (st.mode === 'sand') {
    setGo(ui.go, st.dropped ? 'ctl.again' : 'go.drop');
    measRows(ui.dl, [[t('m.mBall'), qty(st.m * 1000, 0, 'g')], [t('m.g'), qty(g, 0, 'm/s²')], [t('m.hDrop'), qty(st.h, 1, 'm')], [t('m.hole'), st.dropped ? qty(st.depth, 1, 'cm') : '—']]);
    renderTable(st, ['col.mBall', 'col.h', 'col.GPE', 'col.hole'], (r) => el('tr', {}, [
      el('td', {}, num(r.m, 1)), el('td', {}, num(r.h, 1)),
      calcCell(r, 'E', { expected: r.m * g * r.h, decimals: 1, tol: 0.05, onCheck: cb('fb.GPEOk', 'fb.GPEWrong') }),
      el('td', {}, num(r.depth, 1)),
    ]), rs);
  } else if (st.mode === 'shelf') {
    const zb = st.pos === 'shelf' ? BOOK.zShelf : BOOK.zTable, zr = st.ref === 'ground' ? 0 : BOOK.zTable;
    measRows(ui.dl, [[t('m.mBook'), qty(BOOK.m, 1, 'kg')], [t('m.g'), qty(g, 0, 'm/s²')], [t('m.refLevel'), t(`rl.${st.ref}`)], [t('m.hRef'), qty(zb - zr, 0, 'm')]]);
    renderTable(st, ['col.ref', 'col.pos', 'col.h', 'col.GPE'], (r) => el('tr', {}, [
      el('td', {}, t(`rl.${r.ref}`)), el('td', {}, t(`pos.${r.pos}`)), el('td', {}, num(r.h, 0)),
      calcCell(r, 'E', { expected: BOOK.m * g * r.h, decimals: 0, tol: 0.05, onCheck: cb('fb.GPEOk', 'fb.GPEWrong') }),
    ]), rs);
  } else {
    setGo(ui.go, st.run ? 'ctl.pause' : st.done ? 'ctl.again' : st.s > 0 ? 'ctl.continue' : 'go.climb');
    const L = pathLength(st.path);
    measRows(ui.dl, [[t('m.mTwin'), qty(TWINS.m, 0, 'kg')], [t('m.g'), qty(g, 0, 'm/s²')], [t('m.slope'), `${st.path}°`], [t('m.L'), qty(L, 0, 'm')], [t('m.walked'), qty(st.s, 0, 'm')], [t('m.hReached'), qty(st.s * Math.sin(st.path * Math.PI / 180), 0, 'm')]]);
    renderTable(st, ['col.slope', 'col.L', 'col.hPath', 'col.Wclimb'], (r) => el('tr', {}, [
      el('td', {}, `${r.path}°`), el('td', {}, num(pathLength(r.path), 0)), el('td', {}, num(TWINS.H, 0)),
      calcCell(r, 'W', { expected: TWINS.m * g * TWINS.H, decimals: 0, tol: 0.5, onCheck: cb('fb.WclimbOk', 'fb.WclimbWrong') }),
    ]), rs);
  }
}

/* ---------- Tab 3: kinetic energy ---------- */
function buildKinetic() {
  const st = S.kinetic;
  controlsBody.append(modeControl('kinetic', 'ctl.situation').root);
  if (st.mode === 'spring') {
    controlsBody.append(createSlider({ labelKey: 'ctl.vThrow', min: 0.5, max: 2, step: 0.1, value: st.vThrow, unit: 'm/s', decimals: 1, onInput: (v) => { st.vThrow = v; if (st.phase !== 'idle') { st.phase = 'idle'; } refresh(); } }).root);
    const place = createButton({ labelKey: 'go.place', variant: 'secondary', onClick: () => { st.phase = 'rest'; st.x2 = x1Rest() + SP.w; refresh(); } });
    const thr = createButton({ labelKey: 'go.throw', variant: 'primary', onClick: () => { st.phase = 'approach'; st.x2 = 1.55; st.t = 0; refresh(); } });
    controlsBody.append(btnRow(place, thr), hint('hint.spring'));
    ui.dl = el('dl', { class: 'meas' });
    measuresBody.append(ui.dl);
  } else {
    controlsBody.append(createSlider({ labelKey: 'ctl.vCar', min: 6, max: 120, step: 6, value: st.vCar, unit: 'km/h', onInput: (v) => { st.vCar = v; resetCar(st); refresh(); } }).root);
    ui.go = createButton({ labelKey: 'go.drive', variant: 'primary', onClick: () => { resetCar(st); st.carRun = true; st.carV = st.vCar / 3.6; st.fb = null; refresh(); } });
    const rec = createButton({ labelKey: 'ctl.record', variant: 'secondary', onClick: () => {
      if (!st.carDone) { st.fb = { type: 'warn', key: 'fb.driveFirst' }; refresh(); return; }
      st.rows.push({ v: st.vCar, skid: st.skid }); st.fb = null; refresh();
    } });
    controlsBody.append(btnRow(ui.go, rec), hint('hint.car'));
    tableBlock(st);
  }
  controlsBody.append(resetBtn('kinetic'));
}
function resetCar(st) { Object.assign(st, { carX: 0, carV: st.vCar / 3.6, carRun: false, carDone: false, skid: 0 }); }
function updateKinetic() {
  const st = S.kinetic;
  if (st.mode === 'spring') {
    const moving = st.phase === 'approach' || st.phase === 'leave' || st.phase === 'end';
    const v2 = moving ? st.vThrow : 0;
    measRows(ui.dl, [
      [t('m.m12'), qty(SPR.m, 1, 'kg')],
      [t('m.v2'), qty(v2, 1, 'm/s')],
      [t('m.comp'), qty(st.phase === 'compress' ? st.comp * 100 : 0, 1, 'cm')],
      [t('m.workDone'), st.phase === 'compress' || st.phase === 'leave' || st.phase === 'end' ? t('yes') : st.phase === 'rest' ? t('no') : '—'],
    ]);
    return;
  }
  setGo(ui.go, st.carRun ? 'ctl.driving' : 'go.drive');
  if (ui.go) ui.go.disabled = st.carRun;
  measRows(ui.dl, [[t('m.mCar'), qty(CAR.m, 0, 'kg')], [t('m.vCar'), qty(st.carRun ? st.carV * 3.6 : st.vCar, 0, 'km/h')], [t('m.skid'), qty(st.skid, 1, 'm')]]);
  renderTable(st, ['col.vKmh', 'col.vMs', 'col.KE', 'col.skid'], (r) => {
    const v = r.v / 3.6, E = 0.5 * CAR.m * v * v;
    return el('tr', {}, [
      el('td', {}, num(r.v, 0)),
      calcCell(r, 'v', { expected: v, decimals: 2, tol: 0.06, onCheck: (res) => { st.fb = fbOf(res, 'fb.vOk', 'fb.vWrong'); refresh(); } }),
      calcCell(r, 'E', { expected: E, decimals: 0, tol: relTol(E, 0.01), disabled: !calcDone(r, 'v'), onCheck: (res) => { st.fb = fbOf(res, 'fb.KEOk', 'fb.KEWrong'); refresh(); } }),
      el('td', {}, num(r.skid, 1)),
    ]);
  });
}

/* ---------- Tab 4: mechanical energy ---------- */
function prepMech(st) { if (st.mode === 'fall') resetFall(st); if (st.mode === 'bounce') { st.m = 0.1; resetBounce(st); } }
function buildMechanical() {
  const st = S.mechanical;
  controlsBody.append(modeControl('mechanical', 'ctl.situation').root);
  if (st.mode === 'fall') {
    controlsBody.append(
      createSlider({ labelKey: 'ctl.mBall', min: 0.1, max: 2, step: 0.1, value: st.m, unit: 'kg', decimals: 1, onInput: (v) => { st.m = v; resetFall(st); refresh(); } }).root,
      createSlider({ labelKey: 'ctl.h0', min: 1, max: 20, step: 1, value: st.h0, unit: 'm', onInput: (v) => { st.h0 = v; resetFall(st); refresh(); } }).root,
      createSlider({ labelKey: 'ctl.v0', min: 0, max: 15, step: 1, value: st.v0, unit: 'm/s', onInput: (v) => { st.v0 = v; resetFall(st); refresh(); } }).root,
      createSegmented({ labelKey: 'ctl.air', options: [{ value: 'no', labelKey: 'no' }, { value: 'yes', labelKey: 'yes' }], value: st.air ? 'yes' : 'no', onChange: (v) => { st.air = v === 'yes'; resetFall(st); refresh(); } }).root,
    );
    ui.go = createButton({ labelKey: 'ctl.start', variant: 'primary', onClick: () => { if (st.done) resetFall(st); st.run = !st.run; refresh(); } });
    const rec = createButton({ labelKey: 'ctl.recordNow', variant: 'secondary', onClick: () => {
      st.rows.push({ m: st.m, z: Math.round(st.z * 100) / 100, v: Math.round(Math.abs(st.v) * 100) / 100, air: st.air }); st.fb = null; refresh();
    } });
    controlsBody.append(btnRow(ui.go, rec, createButton({ labelKey: 'ctl.again', variant: 'ghost', onClick: () => { resetFall(st); refresh(); } })), hint('hint.fall'));
  } else if (st.mode === 'bird') {
    controlsBody.append(
      createSlider({ labelKey: 'ctl.vBird', min: 0, max: 20, step: 1, value: st.vb, unit: 'm/s', onInput: (v) => { st.vb = v; refresh(); } }).root,
      createSlider({ labelKey: 'ctl.hBird', min: 0, max: 100, step: 5, value: st.hb, unit: 'm', onInput: (v) => { st.hb = v; refresh(); } }).root,
      btnRow(createButton({ labelKey: 'ctl.record', variant: 'primary', onClick: () => { st.rows.push({ v: st.vb, h: st.hb }); st.fb = null; refresh(); } })),
      hint('hint.bird'),
    );
  } else if (st.mode === 'bounce') {
    controlsBody.append(createSlider({ labelKey: 'ctl.loss', min: 0, max: 50, step: 5, value: st.loss, unit: '%', onInput: (v) => { st.loss = v; resetBounce(st); st.rows = []; refresh(); } }).root);
    ui.go = createButton({ labelKey: 'go.dropBall', variant: 'primary', onClick: () => { if (st.done || st.bounces.length) { resetBounce(st); st.rows = []; } st.run = !st.run; st.fb = null; refresh(); } });
    controlsBody.append(btnRow(ui.go), hint('hint.bounce'));
  } else {
    ui.go = createButton({ labelKey: 'go.crash', variant: 'primary', onClick: () => { st.crashT = 0; st.run = true; st.done = false; if (!st.rows.length) st.rows.push({}); refresh(); } });
    controlsBody.append(btnRow(ui.go), hint('hint.crash'));
  }
  controlsBody.append(resetBtn('mechanical'));
  tableBlock(st);
}
function updateMechanical() {
  const st = S.mechanical;
  const cb = (okK, badK) => (res) => { st.fb = fbOf(res, okK, badK); refresh(); };
  if (st.mode === 'fall') {
    setGo(ui.go, st.run ? 'ctl.pause' : st.done ? 'ctl.again' : (st.z !== st.h0 || st.v !== st.v0) ? 'ctl.continue' : 'ctl.start');
    const E = mechE(st);
    measRows(ui.dl, [[t('m.mBallKg'), qty(st.m, 1, 'kg')], [t('m.g'), qty(g, 0, 'm/s²')], [t('m.z'), qty(st.z, 2, 'm')], [t('m.speed'), qty(Math.abs(st.v), 2, 'm/s')],
      ...(st.air ? [[t('m.heat'), qty(st.heat, 1, 'J')]] : []), [t('m.MEstart'), qty(E.E0, 1, 'J')]]);
    renderTable(st, ['col.z', 'col.v', 'col.GPE', 'col.KE', 'col.ME'], (r) => {
      const Ep = r.m * g * r.z, Ek = 0.5 * r.m * r.v * r.v;
      return el('tr', {}, [
        el('td', {}, num(r.z, 2)), el('td', {}, num(r.v, 2)),
        calcCell(r, 'p', { expected: Ep, decimals: 1, tol: relTol(Ep, 0.01) + 0.05, onCheck: cb('fb.GPEOk', 'fb.GPEWrong') }),
        calcCell(r, 'k', { expected: Ek, decimals: 1, tol: relTol(Ek, 0.01) + 0.05, disabled: !calcDone(r, 'p'), onCheck: cb('fb.KEOk2', 'fb.KEWrong2') }),
        calcCell(r, 'e', { expected: Ep + Ek, decimals: 1, tol: relTol(Ep + Ek, 0.01) + 0.1, disabled: !calcDone(r, 'k'), onCheck: cb(r.air ? 'fb.MEOkAir' : 'fb.MEOk', 'fb.MEWrong') }),
      ]);
    });
  } else if (st.mode === 'bird') {
    measRows(ui.dl, [[t('m.mBird'), qty(BIRD_M * 1000, 0, 'g')], [t('m.g'), qty(g, 0, 'm/s²')], [t('m.speed'), qty(st.vb, 0, 'm/s')], [t('m.z'), qty(st.hb, 0, 'm')]]);
    renderTable(st, ['col.v', 'col.z', 'col.GPE', 'col.KE', 'col.ME'], (r) => {
      const Ep = BIRD_M * g * r.h, Ek = 0.5 * BIRD_M * r.v * r.v;
      return el('tr', {}, [
        el('td', {}, num(r.v, 0)), el('td', {}, num(r.h, 0)),
        calcCell(r, 'p', { expected: Ep, decimals: 1, tol: 0.05, onCheck: cb('fb.GPEOk', 'fb.GPEWrong') }),
        calcCell(r, 'k', { expected: Ek, decimals: 1, tol: 0.05, disabled: !calcDone(r, 'p'), onCheck: cb('fb.KEOk2', 'fb.KEWrong2') }),
        calcCell(r, 'e', { expected: Ep + Ek, decimals: 1, tol: 0.05, disabled: !calcDone(r, 'k'), onCheck: cb('fb.MEbirdOk', 'fb.MEWrong') }),
      ]);
    });
  } else if (st.mode === 'bounce') {
    setGo(ui.go, st.run ? 'ctl.pause' : st.done ? 'ctl.again' : st.bounces.length ? 'ctl.continue' : 'go.dropBall');
    measRows(ui.dl, [[t('m.mBallG'), qty(st.m * 1000, 0, 'g')], [t('m.loss'), qty(st.loss, 0, '%')], [t('m.z'), qty(st.z, 2, 'm')], [t('m.nb'), num(st.bounces.length, 0)]]);
    renderTable(st, ['col.n', 'col.hPrev', 'col.hNext'], (r) => {
      const hNext = r.prev * (1 - st.loss / 100);
      return el('tr', {}, [
        el('td', {}, num(r.n, 0)), el('td', {}, num(r.prev, 3)),
        calcCell(r, 'h', { expected: hNext, decimals: 2, tol: 0.006, onCheck: cb('fb.hOk', 'fb.hWrong') }),
      ]);
    });
    ui.clear.hidden = true;
  } else {
    measRows(ui.dl, [[t('m.car'), `${qty(CRASH.m1, 0, 'kg')} · ${qty(72, 0, 'km/h')}`], [t('m.truck'), `${qty(CRASH.m2, 0, 'kg')} · ${qty(54, 0, 'km/h')}`], [t('m.after'), qty(36, 0, 'km/h')]]);
    const E1 = 0.5 * CRASH.m1 * CRASH.v1 ** 2 + 0.5 * CRASH.m2 * CRASH.v2 ** 2, E2 = 0.5 * (CRASH.m1 + CRASH.m2) * CRASH.v ** 2;
    renderTable(st, ['col.MEbefore', 'col.MEafter', 'col.MElost'], (r) => el('tr', {}, [
      calcCell(r, 'a', { expected: E1, decimals: 0, tol: relTol(E1, 0.002), onCheck: cb('fb.MEbOk', 'fb.MEbWrong') }),
      calcCell(r, 'b', { expected: E2, decimals: 0, tol: relTol(E2, 0.002), disabled: !calcDone(r, 'a'), onCheck: cb('fb.MEaOk', 'fb.MEaWrong') }),
      calcCell(r, 'c', { expected: E1 - E2, decimals: 0, tol: relTol(E1 - E2, 0.002), disabled: !calcDone(r, 'b'), onCheck: cb('fb.MElOk', 'fb.MElWrong') }),
    ]));
    ui.clear.hidden = true;
  }
}

/* ---------- Tab switching ---------- */
function buildTab(id) {
  controlsBody.replaceChildren();
  measuresBody.replaceChildren();
  ui = {};
  tableSig = '';
  ({ work: buildWork, potential: buildPotential, kinetic: buildKinetic, mechanical: buildMechanical })[id]();
  loop.start();
  shell?.refreshActivity();
  refresh();
}
function updateMeasures() {
  if (!shell || !ui.dl) return;
  ({ work: updateWork, potential: updatePotential, kinetic: updateKinetic, mechanical: updateMechanical })[shell.tab]();
}
function refresh() { updateMeasures(); requestDraw(); }
function prepTab(id) {
  const st = S[id];
  if (id === 'mechanical') prepMech(st);
  if (id === 'potential') resetSand(st);
  if (id === 'kinetic') resetCar(st);
  if (id === 'work' && st.mode === 'mower') st.d = MOWER.dMax;
}
function resetTab(id) { const mode = S[id].mode; S[id] = { ...initialState(id), mode }; prepTab(id); buildTab(id); }
TABS.forEach(prepTab);
onLangChange(() => { if (shell) buildTab(shell.tab); });
shell = initSim({
  strings,
  tabs: TABS.map((id) => ({ id, labelKey: `tab.${id}` })),
  initialTab: 'work',
  onTab: buildTab,
  activityKey: (tab) => `act.${tab}.${S[tab].mode}`,
});
shell.start();
if (DEBUG) window.__sim = { get S() { return S; }, mechE, g };
