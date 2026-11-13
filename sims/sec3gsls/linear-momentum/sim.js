// Sec 3 GS-LS (SG-SV) — Chapter 2: Linear momentum (whole chapter, SG and SV). g = 10 m/s² as in the book.
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num, qty } from '../../../shared/format.js';
import { createButton, createSegmented, createSlider, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, arrow } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { label } from '../../../shared/figures.js';
import { calcCell, calcSig, calcDone } from '../../../shared/calc-cell.js';
import { drawEnergyBars } from '../../../shared/energy-bars.js';
import { tableFrame, drawAirTable, drawPuck, drawDots, drawGlider, drawAirTrack } from '../../../shared/air-table.js';
import { G_SEC3GSLS as g } from '../../../shared/constants.js';

const TAU = 2 * Math.PI;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const W = 600;
const TABS = ['notion', 'system', 'collision', 'recoil', 'track'];
const HEIGHTS = { notion: 340, system: 420, collision: 560, recoil: 360, track: 380 };
const REC = 0.06; // s, interval of the marking system (Exp. 2.2: τ = 60 ms)

/* ================================================================
   Model and values
   ================================================================ */
// Exp. 2.1 — values chosen for the simulation (the book gives none): puck A1 with the ring 0.60 kg,
// puck A2 0.60 kg (+ 0.30 kg overload), energy of the compressed steel web 0.060 J.
const EXP1 = { m1: 0.6, m2: 0.6, over: 0.3, E: 0.06, r: 0.05, x1: 0.62, x2: 0.78, y: 0.35, wM: 1.4, hM: 0.7 };
// Exp. 2.2 — masses and speeds before the collision from the book's table; the motion after the collision is computed.
const EXP2 = { mA: 1.07, mB: 0.72, vA: 0.216, vB: 0.25, r: 0.05, wM: 1.4, hM: 0.7, T: 1.4, phi: 30 * Math.PI / 180, dirB: 290 * Math.PI / 180 };

function initialState(tab) {
  switch (tab) {
    case 'notion': return { over: true, showG: true, phase: 'ready', t: 0, rows: [], fb: null };
    case 'system': return { mode: 'two', run: false, t: 0, m1: 1, v1: 2, m2: 2, v2: -1, x1: -1.5, x2: 1.5, rows: [], fb: null };
    case 'collision': return { e: 1, phase: 'ready', t: 0, diagram: false, rows: [], fb: null };
    case 'recoil': return { mode: 'cannon', M: 1000, m: 5, v: 400, v1: 6, run: false, done: false, t: 0, rows: [], fb: null };
    default: return { type: 'elastic', m1: 0.3, m2: 0.6, v1: 0.8, v2: 0, run: false, done: false, hit: false, x1: 0.35, x2: 0.95, u1: 0.8, u2: 0, rows: [], fb: null };
  }
}
let S = Object.fromEntries(TABS.map((k) => [k, initialState(k)]));

// ---------- Exp. 2.1 ----------
function exp1(st) {
  const m1 = EXP1.m1, m2 = EXP1.m2 + (st.over ? EXP1.over : 0);
  const p = Math.sqrt((2 * EXP1.E * m1 * m2) / (m1 + m2));
  return { m1, m2, v1: -p / m1, v2: p / m2, p };
}
function exp1Pos(st, tt) {
  const e = exp1(st);
  return [EXP1.x1 + e.v1 * tt, EXP1.x2 + e.v2 * tt];
}
function exp1End(st) {
  const e = exp1(st);
  return Math.min((EXP1.x1 - 0.08) / -e.v1, (EXP1.wM - 0.08 - EXP1.x2) / e.v2);
}

// ---------- Exp. 2.2: 2D collision of two pucks (impulse along the line of centres) ----------
function exp2Init(st) {
  const A = { x: 0.15, y: 0.25, vx: EXP2.vA, vy: 0 };
  const cA = [A.x + A.vx * EXP2.T, A.y];
  const d = 2 * EXP2.r;
  const vBx = EXP2.vB * Math.cos(EXP2.dirB), vBy = EXP2.vB * Math.sin(EXP2.dirB);
  const B = { x: cA[0] + d * Math.cos(EXP2.phi) - vBx * EXP2.T, y: cA[1] + d * Math.sin(EXP2.phi) - vBy * EXP2.T, vx: vBx, vy: vBy };
  st.A = A; st.B = B; st.t = 0; st.hit = false; st.phase = 'ready';
  st.dotsA = [[A.x, A.y]]; st.dotsB = [[B.x, B.y]]; st.nextDot = REC;
  st.before = { A: [A.vx, A.vy], B: [B.vx, B.vy] };
  st.after = null;
}
function exp2Step(st, dt) {
  const n = 10, h = dt / n;
  for (let i = 0; i < n; i++) {
    const { A, B } = st;
    A.x += A.vx * h; A.y += A.vy * h; B.x += B.vx * h; B.y += B.vy * h;
    st.t += h;
    const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy);
    if (!st.hit && d <= 2 * EXP2.r) {
      const nx = dx / d, ny = dy / d;
      const vrel = (B.vx - A.vx) * nx + (B.vy - A.vy) * ny;
      if (vrel < 0) {
        const J = (-(1 + st.e) * vrel) / (1 / EXP2.mA + 1 / EXP2.mB);
        A.vx -= (J / EXP2.mA) * nx; A.vy -= (J / EXP2.mA) * ny;
        B.vx += (J / EXP2.mB) * nx; B.vy += (J / EXP2.mB) * ny;
        st.hit = true;
        st.after = { A: [A.vx, A.vy], B: [B.vx, B.vy] };
      }
    }
    if (st.t >= st.nextDot - 1e-9) { st.dotsA.push([A.x, A.y]); st.dotsB.push([B.x, B.y]); st.nextDot += REC; }
    const out = (P) => P.x < 0.06 || P.x > EXP2.wM - 0.06 || P.y < 0.06 || P.y > EXP2.hM - 0.06;
    if (st.hit && (out(A) || out(B) || st.t > EXP2.T + 2.2)) { st.phase = 'done'; break; }
  }
}
const mag = (v) => Math.hypot(v[0], v[1]);

// ---------- Recoil ----------
function recoil(st) {
  if (st.mode === 'cannon') return { V: (-st.m * st.v) / st.M };
  if (st.mode === 'explosion') return { v2: -st.v1 / 3 };
  return {};
}

// ---------- Air track (1D collisions) ----------
const TRACK = { L: 1.4, w: 0.1 };
function trackAfter(st) {
  const { m1, m2, v1, v2 } = st;
  if (st.type === 'stick') { const V = (m1 * v1 + m2 * v2) / (m1 + m2); return { a: V, b: V }; }
  return {
    a: ((m1 - m2) / (m1 + m2)) * v1 + ((2 * m2) / (m1 + m2)) * v2,
    b: ((2 * m1) / (m1 + m2)) * v1 + ((m2 - m1) / (m1 + m2)) * v2,
  };
}
function resetTrack(st) {
  Object.assign(st, { run: false, done: false, hit: false, x1: 0.35, x2: 0.95, u1: st.v1, u2: st.v2 });
}

/* ================================================================
   Canvas and loop
   ================================================================ */
let shell;
let drawQueued = false;
let now = 0;
const canvas = document.getElementById('stage');
canvas.style.touchAction = 'none';
const view = setupCanvas(canvas, { width: W, height: 340, maxHeightVh: () => (window.innerWidth < 880 ? 56 : 78), onResize: () => requestDraw() });
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
    if (tab === 'notion' && st.phase === 'moving') {
      st.t += dt;
      if (st.t >= exp1End(st)) { st.t = exp1End(st); st.phase = 'done'; }
    } else if (tab === 'system' && st.run) stepSystem(st, dt);
    else if (tab === 'collision' && st.phase === 'moving') exp2Step(st, dt);
    else if (tab === 'recoil' && st.run) {
      st.t += dt;
      const end = st.mode === 'moving' ? 3 : 1.6;
      if (st.t >= end) { st.t = end; st.run = false; st.done = true; }
    } else if (tab === 'track' && st.run) stepTrack(st, dt);
    return true;
  },
  render() { draw(); updateMeasures(); },
});

function stepSystem(st, dt) {
  st.t += dt;
  if (st.mode === 'fall') { if (st.t >= 3.4) { st.t = 3.4; st.run = false; } }
  else if (st.mode === 'forces') { if (st.t >= 2.4) { st.t = 2.4; st.run = false; } }
  else {
    st.x1 += st.v1 * dt; st.x2 += st.v2 * dt;
    if (st.x2 - st.x1 < 0.35 || st.x1 < -2.3 || st.x2 > 2.3 || st.x1 > 2.3 || st.x2 < -2.3) st.run = false;
  }
}
function stepTrack(st, dt) {
  const n = 8, h = dt / n;
  for (let i = 0; i < n; i++) {
    st.x1 += st.u1 * h; st.x2 += st.u2 * h;
    if (!st.hit && st.x2 - st.x1 <= TRACK.w && st.u1 - st.u2 > 0) {
      const a = trackAfter(st);
      st.u1 = a.a; st.u2 = a.b; st.hit = true;
    }
    const lo = TRACK.w / 2 + 0.02, hi = TRACK.L - TRACK.w / 2 - 0.02;
    if (st.x1 < lo || st.x2 > hi || st.x1 > hi || st.x2 < lo || (st.hit && Math.abs(st.u1) + Math.abs(st.u2) < 1e-6)) {
      st.x1 = clamp(st.x1, lo, hi); st.x2 = clamp(st.x2, lo, hi);
      st.run = false; st.done = true; break;
    }
  }
}

/* ================================================================
   Drawing
   ================================================================ */
const C = { A: () => cssVar('--s2'), B: () => cssVar('--s1'), P: () => cssVar('--brand-navy'), G: () => cssVar('--s6'), F: () => cssVar('--accent') };
function vec(ctx, x1, y1, x2, y2, color, text, lw = 2.5) {
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = lw;
  if (Math.hypot(x2 - x1, y2 - y1) > 3) arrow(ctx, x1, y1, x2, y2, 9);
  if (text) {
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1;
    label(ctx, text, x2 + (dx / L) * 12 - (dy / L) * 10, y2 + (dy / L) * 12 + (dx / L) * 10, { size: 13, weight: 800, color });
  }
}
function cross(ctx, x, y, color, text) {
  ctx.strokeStyle = color; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(x - 7, y - 7); ctx.lineTo(x + 7, y + 7); ctx.moveTo(x - 7, y + 7); ctx.lineTo(x + 7, y - 7); ctx.stroke();
  if (text) label(ctx, text, x + 10, y - 12, { size: 13, weight: 800, color, align: 'left' });
}
function dashed(ctx, x1, y1, x2, y2, color = cssVar('--muted')) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.setLineDash([6, 5]);
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore();
}
function note(ctx, key, x, y, align = 'left') { label(ctx, t(key), x, y, { size: 12, weight: 600, color: cssVar('--muted'), align }); }

function draw() {
  if (!shell) return;
  const tab = shell.tab;
  if (view.height !== HEIGHTS[tab]) view.setLogicalSize(W, HEIGHTS[tab]);
  const ctx = view.begin();
  ctx.fillStyle = cssVar('--scene-bg');
  roundRect(ctx, 0, 0, W, HEIGHTS[tab], 14);
  ctx.fill();
  ({ notion: drawNotion, system: drawSystem, collision: drawCollision, recoil: drawRecoil, track: drawTrack })[tab](ctx, S[tab]);
}

/* ---------- Tab 1: Exp. 2.1 ---------- */
function drawNotion(ctx, st) {
  const f = tableFrame(20, 24, 560, 270, EXP1.wM, EXP1.hM);
  drawAirTable(ctx, f);
  const e = exp1(st);
  const r = EXP1.r * f.k;
  const [x1, x2] = exp1Pos(st, st.t);
  // recording
  if (st.phase !== 'ready') {
    const n = Math.floor(st.t / REC + 1e-9);
    const d1 = [], d2 = [];
    for (let k = 0; k <= n; k++) {
      const [a, b] = exp1Pos(st, k * REC);
      d1.push([f.X(a), f.Y(EXP1.y) + r + 12]); d2.push([f.X(b), f.Y(EXP1.y) + r + 12]);
    }
    drawDots(ctx, d1, C.A(), { numbers: true, every: 5 });
    drawDots(ctx, d2, C.B(), { numbers: true, every: 5 });
  }
  if (st.phase === 'ready') {
    // nylon string around the two pucks, steel web compressed between them
    ctx.strokeStyle = cssVar('--thread'); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse((f.X(x1) + f.X(x2)) / 2, f.Y(EXP1.y), (f.X(x2) - f.X(x1)) / 2 + r + 4, r + 4, 0, 0, TAU); ctx.stroke();
  }
  drawPuck(ctx, f.X(x1), f.Y(EXP1.y), r, { color: C.A(), label: 'A1', ring: true });
  drawPuck(ctx, f.X(x2), f.Y(EXP1.y), r, { color: C.B(), label: 'A2', overload: st.over });
  if (st.phase !== 'ready') {
    const ya = f.Y(EXP1.y) - r - 16;
    vec(ctx, f.X(x1), ya, f.X(x1) + e.v1 * 160, ya, C.A());
    vec(ctx, f.X(x2), ya, f.X(x2) + e.v2 * 160, ya, C.B());
    label(ctx, 'v1', f.X(x1) + e.v1 * 80, ya - 14, { size: 13, weight: 800, color: C.A() });
    label(ctx, 'v2', f.X(x2) + e.v2 * 80, ya - 14, { size: 13, weight: 800, color: C.B() });
  }
  if (st.showG) {
    const xg = (e.m1 * x1 + e.m2 * x2) / (e.m1 + e.m2);
    cross(ctx, f.X(xg), f.Y(EXP1.y) + r + 34, C.G(), 'G');
  }
  note(ctx, st.phase === 'ready' ? 'n.ready' : st.phase === 'moving' ? 'n.moving' : 'n.done', 24, HEIGHTS.notion - 22);
  label(ctx, `τ = ${qty(REC * 1000, 0, 'ms')} · ${t('n.scaleV')}`, 576, HEIGHTS.notion - 22, { size: 12, weight: 700, align: 'right' });
}

/* ---------- Tab 2: momentum of a particle / a system; ΣF = dP/dt ---------- */
function drawSystem(ctx, st) {
  if (st.mode === 'fall') {
    const k = 5.4, top = 34, x = 260;
    const z = 0.5 * g * st.t * st.t, v = g * st.t, p = 0.2 * v;
    // axis Oz downward
    ctx.strokeStyle = cssVar('--text'); ctx.fillStyle = cssVar('--text'); ctx.lineWidth = 1.5;
    arrow(ctx, 110, top, 110, top + 62 * k + 6, 8);
    label(ctx, 'O', 96, top, { size: 13, weight: 800 });
    label(ctx, 'z (m)', 118, top + 62 * k, { size: 12, weight: 800, align: 'left' });
    for (let zz = 0; zz <= 60; zz += 10) {
      ctx.beginPath(); ctx.moveTo(105, top + zz * k); ctx.lineTo(115, top + zz * k); ctx.stroke();
      label(ctx, num(zz, 0), 98, top + zz * k, { size: 10, weight: 600, align: 'right' });
    }
    dashed(ctx, 110, top, x, top);
    ctx.fillStyle = cssVar('--s3'); ctx.beginPath(); ctx.arc(x, top + z * k, 8, 0, TAU); ctx.fill();
    if (p > 0.01) vec(ctx, x + 16, top + z * k, x + 16, top + z * k + p * 22, C.P(), 'p');
    label(ctx, `t = ${qty(st.t, 2, 's')}`, 420, 60, { size: 15, weight: 800 });
    label(ctx, t('sys.scaleP'), 420, 90, { size: 12, weight: 600, color: cssVar('--muted') });
    label(ctx, 'k', 128, top + 12, { size: 12, weight: 800, align: 'left' });
    note(ctx, 'sys.fallNote', 300, HEIGHTS.system - 20, 'center');
  } else if (st.mode === 'two') {
    const k = 110, cx = 300, y = 200;
    ctx.strokeStyle = cssVar('--muted'); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(30, y); ctx.lineTo(570, y); ctx.stroke();
    ctx.fillStyle = cssVar('--text'); ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 1.5;
    arrow(ctx, 470, y + 40, 520, y + 40, 7);
    label(ctx, 'i', 495, y + 54, { size: 13, weight: 800 });
    const P = st.m1 * st.v1 + st.m2 * st.v2, M = st.m1 + st.m2;
    const xg = (st.m1 * st.x1 + st.m2 * st.x2) / M;
    const sp = 40; // px per kg·m/s
    const r1 = 9 + st.m1 * 3, r2 = 9 + st.m2 * 3;
    ctx.fillStyle = C.A(); ctx.beginPath(); ctx.arc(cx + st.x1 * k, y, r1, 0, TAU); ctx.fill();
    ctx.fillStyle = C.B(); ctx.beginPath(); ctx.arc(cx + st.x2 * k, y, r2, 0, TAU); ctx.fill();
    label(ctx, 'A1', cx + st.x1 * k, y + r1 + 14, { size: 12, weight: 800 });
    label(ctx, 'A2', cx + st.x2 * k, y + r2 + 14, { size: 12, weight: 800 });
    vec(ctx, cx + st.x1 * k, y - 40, cx + st.x1 * k + st.m1 * st.v1 * sp, y - 40, C.A(), 'p1');
    vec(ctx, cx + st.x2 * k, y - 40, cx + st.x2 * k + st.m2 * st.v2 * sp, y - 40, C.B(), 'p2');
    dashed(ctx, cx + xg * k, y, cx + xg * k, y + 40, C.G());
    cross(ctx, cx + xg * k, y + 44, C.G(), 'G');
    if (Math.abs(P) > 0.01) vec(ctx, cx + xg * k, y - 90, cx + xg * k + P * sp, y - 90, C.P(), 'P');
    else label(ctx, 'P = 0', cx + xg * k, y - 90, { size: 13, weight: 800, color: C.P() });
    label(ctx, t('sys.scaleP2'), 300, 30, { size: 12, weight: 600, color: cssVar('--muted') });
    note(ctx, 'sys.twoNote', 300, HEIGHTS.system - 20, 'center');
  } else {
    const k = 26, ox = 70, oy = 360;
    // axes
    ctx.strokeStyle = cssVar('--text'); ctx.fillStyle = cssVar('--text'); ctx.lineWidth = 1.5;
    arrow(ctx, ox, oy, ox + 400, oy, 8); arrow(ctx, ox, oy, ox, oy - 330, 8);
    label(ctx, 'x (m)', ox + 400, oy + 16, { size: 12, weight: 800 });
    label(ctx, 'y (m)', ox - 30, oy - 330, { size: 12, weight: 800 });
    for (let v = 2; v <= 14; v += 2) {
      label(ctx, num(v, 0), ox + v * k, oy + 12, { size: 10, weight: 600 });
      if (v <= 12) label(ctx, num(v, 0), ox - 12, oy - v * k, { size: 10, weight: 600 });
    }
    label(ctx, 'O', ox - 10, oy + 10, { size: 13, weight: 800 });
    const x = 1.5 * st.t * st.t, y = 2.5 * st.t * st.t;
    dashed(ctx, ox, oy, ox + 7.4 * k, oy - 12.4 * k);
    const sx = ox + x * k, sy = oy - y * k;
    ctx.fillStyle = cssVar('--s3'); roundRect(ctx, sx - 13, sy - 13, 26, 26, 5); ctx.fill();
    label(ctx, '5 kg', sx, sy, { size: 9, weight: 800, color: '#fff', halo: false });
    const fs = 3.2; // px per N
    vec(ctx, sx, sy, sx + 5 * fs, sy - 15 * fs, C.F(), 'F1', 2);
    vec(ctx, sx, sy, sx + 10 * fs, sy - 10 * fs, cssVar('--s5'), 'F2', 2);
    vec(ctx, sx, sy, sx + 15 * fs, sy - 25 * fs, cssVar('--text'), 'ΣF', 2.5);
    const ps = 2.4; // px per kg·m/s
    const ux = 25 / Math.sqrt(850), uy = 15 / Math.sqrt(850); // offset perpendicular to ΣF so that P stays visible
    if (st.t > 0.05) vec(ctx, sx + 22 * ux, sy + 22 * uy, sx + 22 * ux + 15 * st.t * ps, sy + 22 * uy - 25 * st.t * ps, C.P(), 'P', 3);
    label(ctx, `t = ${qty(st.t, 2, 's')}`, 580, 50, { size: 15, weight: 800, align: 'right' });
    label(ctx, t('sys.scaleF'), 580, 78, { size: 11, weight: 600, color: cssVar('--muted'), align: 'right' });
    label(ctx, t('sys.scaleP3'), 580, 96, { size: 11, weight: 600, color: cssVar('--muted'), align: 'right' });
    note(ctx, 'sys.forcesNote', 300, HEIGHTS.system - 18, 'center');
  }
}

/* ---------- Tab 3: Exp. 2.2 ---------- */
function drawCollision(ctx, st) {
  const f = tableFrame(20, 20, 560, 290, EXP2.wM, EXP2.hM);
  drawAirTable(ctx, f);
  const r = EXP2.r * f.k;
  const pts = (d) => d.map(([x, y]) => [f.X(x), f.Y(y)]);
  drawDots(ctx, pts(st.dotsA), C.A(), { r: 2.4 });
  drawDots(ctx, pts(st.dotsB), C.B(), { r: 2.4 });
  drawPuck(ctx, f.X(st.A.x), f.Y(st.A.y), r, { color: C.A(), label: 'A', ring: true });
  drawPuck(ctx, f.X(st.B.x), f.Y(st.B.y), r, { color: C.B(), label: 'B', ring: true });
  label(ctx, `τ = ${qty(REC * 1000, 0, 'ms')}`, 572, 300, { size: 12, weight: 700, align: 'right' });
  // vector diagram (Figure 2.9): P = pA + pB before, P′ = pA′ + pB′ after
  const by = 330;
  ctx.fillStyle = cssVar('--surface'); ctx.strokeStyle = cssVar('--border'); ctx.lineWidth = 1;
  roundRect(ctx, 12, by, 576, HEIGHTS.collision - by - 12, 10); ctx.fill(); ctx.stroke();
  if (!st.diagram || !st.after) { note(ctx, st.after ? 'c.diagramHint' : 'c.diagramWait', 300, by + 100, 'center'); return; }
  const sc = 400; // px per kg·m/s (0.1 kg·m/s ↔ 40 px)
  const boxH = HEIGHTS.collision - by - 12;
  const diag = (cxBox, vA, vB, tagA, tagB, tagP, title) => {
    const pA = [EXP2.mA * vA[0], EXP2.mA * vA[1]], pB = [EXP2.mB * vB[0], EXP2.mB * vB[1]];
    const pts = [[0, 0], pA, [pA[0] + pB[0], pA[1] + pB[1]]];
    const xs = pts.map((q) => q[0] * sc), ys = pts.map((q) => -q[1] * sc);
    const ox = cxBox - (Math.min(...xs) + Math.max(...xs)) / 2;
    const oy = by + 30 + (boxH - 50) / 2 - (Math.min(...ys) + Math.max(...ys)) / 2;
    const ax = ox + pA[0] * sc, ay = oy - pA[1] * sc;
    const ex = ax + pB[0] * sc, ey = ay - pB[1] * sc;
    // labels at the middle of each vector: pA and pB outside the triangle, P on the other side
    const side = Math.sign((ax - ox) * (ey - oy) - (ay - oy) * (ex - ox)) || 1;
    const mid = (x1, y1, x2, y2, txt, color, s) => {
      const L = Math.hypot(x2 - x1, y2 - y1) || 1;
      label(ctx, txt, (x1 + x2) / 2 + (s * (y2 - y1) / L) * 14, (y1 + y2) / 2 - (s * (x2 - x1) / L) * 14, { size: 13, weight: 800, color });
    };
    vec(ctx, ox, oy, ax, ay, C.A());
    vec(ctx, ax, ay, ex, ey, C.B());
    vec(ctx, ox, oy, ex, ey, C.P(), null, 3);
    mid(ox, oy, ax, ay, tagA, C.A(), side);
    mid(ax, ay, ex, ey, tagB, C.B(), side);
    mid(ox, oy, ex, ey, tagP, C.P(), -side);
    ctx.fillStyle = cssVar('--text'); ctx.beginPath(); ctx.arc(ox, oy, 3, 0, TAU); ctx.fill();
    label(ctx, title, cxBox, by + 18, { size: 13, weight: 800 });
    return mag([pA[0] + pB[0], pA[1] + pB[1]]);
  };
  const P1 = diag(155, st.before.A, st.before.B, 'pA', 'pB', 'P', t('c.before'));
  const P2 = diag(445, st.after.A, st.after.B, 'pA′', 'pB′', 'P′', t('c.after'));
  dashed(ctx, 300, by + 10, 300, HEIGHTS.collision - 22, cssVar('--border'));
  label(ctx, `P = ${qty(P1, 3, 'kg·m/s')}`, 155, HEIGHTS.collision - 28, { size: 12, weight: 800, color: C.P() });
  label(ctx, `P′ = ${qty(P2, 3, 'kg·m/s')}`, 445, HEIGHTS.collision - 28, { size: 12, weight: 800, color: C.P() });
  // scale legend
  ctx.strokeStyle = cssVar('--text'); ctx.fillStyle = cssVar('--text'); ctx.lineWidth = 2;
  arrow(ctx, 24, HEIGHTS.collision - 50, 64, HEIGHTS.collision - 50, 7);
  label(ctx, qty(0.1, 1, 'kg·m/s'), 24, HEIGHTS.collision - 34, { size: 11, weight: 700, align: 'left' });
}

/* ---------- Tab 4: recoil and explosions ---------- */
function drawRecoil(ctx, st) {
  const H = HEIGHTS.recoil;
  if (st.mode === 'cannon') {
    const gy = 250, k = 40; // px per m
    ctx.fillStyle = cssVar('--bench'); ctx.fillRect(10, gy, 580, 10);
    const V = recoil(st).V, xg0 = 300;
    const xGun = xg0 + (st.run || st.done ? V * st.t * k : 0);
    // gun on wheels
    ctx.fillStyle = cssVar('--box');
    ctx.save(); ctx.translate(xGun, gy - 40); ctx.rotate(-0.12);
    ctx.fillRect(-20, -10, 110, 20); ctx.restore();
    ctx.fillStyle = cssVar('--wood'); roundRect(ctx, xGun - 50, gy - 46, 80, 30, 6); ctx.fill();
    ctx.fillStyle = cssVar('--box');
    for (const wx of [-30, 14]) { ctx.beginPath(); ctx.arc(xGun + wx, gy - 14, 14, 0, TAU); ctx.fill(); }
    // shell
    if (!st.run && !st.done) { ctx.fillStyle = cssVar('--accent'); ctx.beginPath(); ctx.arc(xGun + 88, gy - 51, 6, 0, TAU); ctx.fill(); }
    else if (st.t < 0.25) {
      const xs = xGun + 88 + st.t * 2400;
      ctx.fillStyle = cssVar('--accent'); ctx.beginPath(); ctx.arc(xs, gy - 51 - st.t * 280, 6, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(160,160,160,0.5)'; ctx.beginPath(); ctx.arc(xGun + 96, gy - 52, 14 + st.t * 60, 0, TAU); ctx.fill();
    }
    if (st.run || st.done) vec(ctx, xGun - 20, gy - 90, xGun - 20 + V * 40, gy - 90, C.A(), 'V');
    cross(ctx, xg0, gy + 30, C.G(), 'G');
    note(ctx, 'r.gNote', 24, H - 42);
    note(ctx, 'r.cannonScale', 24, H - 20);
  } else if (st.mode === 'explosion') {
    const y = 180, k = 30, x0 = 300;
    ctx.strokeStyle = cssVar('--muted'); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(20, y); ctx.lineTo(580, y); ctx.stroke();
    label(ctx, 'x', 575, y + 16, { size: 13, weight: 800 });
    const v2 = recoil(st).v2, tt = st.run || st.done ? st.t : 0;
    if (!st.run && !st.done) {
      ctx.fillStyle = cssVar('--s3'); ctx.beginPath(); ctx.arc(x0, y, 18, 0, TAU); ctx.fill();
    } else {
      const x1 = x0 + st.v1 * tt * k, x2 = x0 + v2 * tt * k;
      ctx.fillStyle = C.A(); ctx.beginPath(); ctx.arc(x1, y, 9, 0, TAU); ctx.fill();
      ctx.fillStyle = C.B(); ctx.beginPath(); ctx.arc(x2, y, 15, 0, TAU); ctx.fill();
      label(ctx, 'm', x1, y + 22, { size: 12, weight: 800 }); label(ctx, '3m', x2, y + 28, { size: 12, weight: 800 });
      vec(ctx, x1, y - 30, x1 + st.v1 * 12, y - 30, C.A(), 'v1');
      vec(ctx, x2, y - 30, x2 + v2 * 12, y - 30, C.B(), 'v2');
    }
    cross(ctx, x0, y + 60, C.G(), 'G');
    note(ctx, 'r.gNote', 24, H - 22);
  } else {
    // a solid moving on the air table explodes: G keeps its uniform rectilinear motion
    const f = tableFrame(20, 20, 560, 300, 1.4, 0.75);
    drawAirTable(ctx, f);
    const v0 = [0.25, 0.06], tB = 1.0, x0 = [0.2, 0.25];
    const u = [[0.05, 0.16], [-0.05, -0.16]]; // velocities of the two halves relative to G after the explosion
    const tt = st.run || st.done ? st.t : 0;
    const G = (s) => [x0[0] + v0[0] * s, x0[1] + v0[1] * s];
    dashed(ctx, f.X(x0[0]), f.Y(x0[1]), f.X(G(3)[0]), f.Y(G(3)[1]), C.G());
    const dots = (fn) => { const a = []; for (let s = 0; s <= tt + 1e-9; s += 0.12) a.push([f.X(fn(s)[0]), f.Y(fn(s)[1])]); return a; };
    if (tt <= tB) {
      drawDots(ctx, dots(G), cssVar('--s3'));
      drawPuck(ctx, f.X(G(tt)[0]), f.Y(G(tt)[1]), 18, { color: cssVar('--s3') });
    } else {
      const piece = (j) => (s) => (s <= tB ? G(s) : [G(s)[0] + u[j][0] * (s - tB), G(s)[1] + u[j][1] * (s - tB)]);
      drawDots(ctx, dots(piece(0)), C.A()); drawDots(ctx, dots(piece(1)), C.B());
      drawPuck(ctx, f.X(piece(0)(tt)[0]), f.Y(piece(0)(tt)[1]), 13, { color: C.A() });
      drawPuck(ctx, f.X(piece(1)(tt)[0]), f.Y(piece(1)(tt)[1]), 13, { color: C.B() });
    }
    cross(ctx, f.X(G(tt)[0]), f.Y(G(tt)[1]) + (tt <= tB ? 30 : 0), C.G(), 'G');
    note(ctx, 'r.movingNote', 24, H - 22);
  }
}

/* ---------- Tab 5: air track ---------- */
function drawTrack(ctx, st) {
  const x1p = 30, x2p = 570, k = (x2p - x1p) / TRACK.L, y = 160;
  drawAirTrack(ctx, x1p, x2p, y);
  const w = TRACK.w * k;
  drawGlider(ctx, x1p + st.x1 * k, y, w, { color: C.A(), label: 'S1' });
  drawGlider(ctx, x1p + st.x2 * k, y, w, { color: C.B(), label: 'S2' });
  if (st.type === 'stick') {
    ctx.fillStyle = cssVar('--s4');
    ctx.fillRect(x1p + st.x1 * k + w / 2 - 3, y - 18, 3, 10); ctx.fillRect(x1p + st.x2 * k - w / 2, y - 18, 3, 10);
  }
  const sv = 55; // px per m/s
  if (Math.abs(st.u1) > 0.005) vec(ctx, x1p + st.x1 * k, y - 46, x1p + st.x1 * k + st.u1 * sv, y - 46, C.A(), 'v1');
  if (Math.abs(st.u2) > 0.005) vec(ctx, x1p + st.x2 * k, y - 46, x1p + st.x2 * k + st.u2 * sv, y - 46, C.B(), 'v2');
  // bars: momentum and kinetic energy, before and after
  const a = trackAfter(st);
  const Pb = st.m1 * st.v1 + st.m2 * st.v2, Pa = st.m1 * a.a + st.m2 * a.b;
  const Eb = 0.5 * st.m1 * st.v1 ** 2 + 0.5 * st.m2 * st.v2 ** 2, Ea = 0.5 * st.m1 * a.a ** 2 + 0.5 * st.m2 * a.b ** 2;
  const shown = st.hit;
  const pm = Math.max(0.3, Math.abs(Pb)) * 1.15;
  drawEnergyBars(ctx, { x: 60, y: 196, w: 220, h: 170, title: t('tr.barsP'), unit: 'kg·m/s', max: pm, min: -pm, decimals: 3, values: true,
    bars: [{ label: t('tr.before'), value: Pb, color: C.P() }, { label: t('tr.after'), value: shown ? Pa : 0, color: C.P() }] });
  drawEnergyBars(ctx, { x: 320, y: 196, w: 220, h: 170, title: t('tr.barsE'), unit: 'J', max: Math.max(0.05, Eb) * 1.15, decimals: 3, values: true,
    bars: [{ label: t('tr.before'), value: Eb, color: cssVar('--s1') }, { label: t('tr.after'), value: shown ? Ea : 0, color: cssVar('--s1') }] });
  if (!shown) note(ctx, 'tr.afterHidden', 300, 186, 'center');
  ctx.strokeStyle = cssVar('--text'); ctx.fillStyle = cssVar('--text'); ctx.lineWidth = 1.5;
  arrow(ctx, 40, 40, 90, 40, 7);
  label(ctx, t('tr.positive'), 98, 40, { size: 12, weight: 700, align: 'left' });
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
function showStatus(box, fb) {
  if (!fb) { box.hidden = true; return; }
  box.hidden = false; box.className = `status ${fb.type || ''}`; box.textContent = t(fb.key, fb.params);
}
function hint(key) { return el('p', { class: 'muted', style: 'font-size:0.88rem;margin:10px 0 0', dataset: { i18n: key } }, t(key)); }
const btnRow = (...b) => el('div', { class: 'btn-row' }, b);
const resetBtn = (id) => btnRow(createButton({ labelKey: 'ui.reset', variant: 'ghost', onClick: () => resetTab(id) }));
function clearRow(onClick) { return el('div', { class: 'btn-row', style: 'margin-top:8px' }, [createButton({ labelKey: 'ctl.clearTable', variant: 'ghost', onClick })]); }
const fbOf = (res, okKey, badKey) => (res === 'invalid' ? { type: 'warn', key: 'calcInvalid' } : res === 'wrong' ? { type: 'bad', key: badKey } : { type: 'good', key: okKey });
const relTol = (v, p, min = 1e-6) => Math.max(Math.abs(v) * p, min);
function tableBlock(st) {
  ui.dl = el('dl', { class: 'meas' });
  ui.tableWrap = el('div', { class: 'table-scroll' });
  ui.table = el('table', { class: 'data' });
  ui.tableWrap.append(ui.table);
  ui.clear = clearRow(() => { st.rows = []; st.fb = null; refresh(); });
  ui.status = statusBox();
  measuresBody.append(ui.dl, ui.tableWrap, ui.clear, ui.status);
}
function renderTable(st, cols, rowFn) {
  const sig = calcSig(st.rows) + st.rows.length + cols.join();
  if (sig !== tableSig) {
    ui.table.replaceChildren(el('thead', {}, el('tr', {}, cols.map((k) => el('th', {}, t(k))))), el('tbody', {}, st.rows.map(rowFn)));
    tableSig = sig;
  }
  ui.tableWrap.hidden = st.rows.length === 0;
  ui.clear.hidden = ui.tableWrap.hidden;
  showStatus(ui.status, st.fb);
}
const cell = (r, key, expected, decimals, tol, okKey, badKey, st, disabled = false) =>
  calcCell(r, key, { expected, decimals, tol, disabled, onCheck: (res) => { st.fb = fbOf(res, okKey, badKey); refresh(); } });

/* ---------- Tab 1 ---------- */
function buildNotion() {
  const st = S.notion;
  ui.over = createSegmented({ labelKey: 'ctl.overload', options: [{ value: 'no', labelKey: 'no' }, { value: 'yes', labelKey: 'yes' }], value: st.over ? 'yes' : 'no',
    onChange: (v) => { st.over = v === 'yes'; st.phase = 'ready'; st.t = 0; refresh(); } });
  ui.showG = createSegmented({ labelKey: 'ctl.showG', options: [{ value: 'no', labelKey: 'no' }, { value: 'yes', labelKey: 'yes' }], value: st.showG ? 'yes' : 'no',
    onChange: (v) => { st.showG = v === 'yes'; refresh(); } });
  ui.go = createButton({ labelKey: 'ctl.burn', variant: 'primary', onClick: () => {
    if (st.phase === 'ready') { st.phase = 'moving'; st.t = 0; } else { st.phase = 'ready'; st.t = 0; }
    refresh();
  } });
  ui.rec = createButton({ labelKey: 'ctl.recordBoth', variant: 'secondary', onClick: () => {
    if (st.phase !== 'done') { st.fb = { type: 'warn', key: 'fb.notDone' }; refresh(); return; }
    const e = exp1(st);
    st.rows.push({ puck: 'A1', m: e.m1, d: Math.round(Math.abs(e.v1) * 5 * REC * 1000) / 10 }, { puck: 'A2', m: e.m2, d: Math.round(Math.abs(e.v2) * 5 * REC * 1000) / 10 });
    st.fb = null; refresh();
  } });
  controlsBody.append(ui.over.root, ui.showG.root, btnRow(ui.go, ui.rec), hint('hint.notion'), resetBtn('notion'));
  tableBlock(st);
}
function updateNotion() {
  const st = S.notion, e = exp1(st);
  const key = st.phase === 'ready' ? 'ctl.burn' : 'ctl.again';
  if (ui.go.dataset.i18n !== key) { ui.go.dataset.i18n = key; ui.go.textContent = t(key); }
  const rows = [[t('m.m1'), qty(e.m1, 2, 'kg')], [t('m.m2'), qty(e.m2, 2, 'kg')], [t('m.tau'), qty(REC * 1000, 0, 'ms')]];
  if (st.phase === 'done') rows.push([t('m.d1'), qty(Math.round(Math.abs(e.v1) * 5 * REC * 1000) / 10, 1, 'cm')], [t('m.d2'), qty(Math.round(Math.abs(e.v2) * 5 * REC * 1000) / 10, 1, 'cm')]);
  measRows(ui.dl, rows);
  renderTable(st, ['col.puck', 'col.m', 'col.d5', 'col.v5', 'col.p'], (r) => {
    const v = r.d / 100 / (5 * REC), p = r.m * v;
    return el('tr', {}, [el('td', {}, r.puck), el('td', {}, num(r.m, 2)), el('td', {}, num(r.d, 1)),
      cell(r, 'v', v, 3, relTol(v, 0.015), 'fb.vOk', 'fb.v5Wrong', st),
      cell(r, 'p', p, 3, relTol(p, 0.02), 'fb.pOk', 'fb.pWrong', st, !calcDone(r, 'v'))]);
  });
}

/* ---------- Tab 2 ---------- */
function buildSystem() {
  const st = S.system;
  ui.mode = createSegmented({ labelKey: 'ctl.case', options: ['fall', 'two', 'forces'].map((v) => ({ value: v, labelKey: `sys.${v}` })), value: st.mode,
    onChange: (v) => { st.mode = v; st.rows = []; st.fb = null; resetSystem(st); buildTab('system'); } });
  controlsBody.append(ui.mode.root);
  if (st.mode === 'two') {
    const sl = (key, prop, min, max, step, unit, dec) => createSlider({ labelKey: key, min, max, step, value: st[prop], unit, decimals: dec, onInput: (v) => { st[prop] = v; resetSystem(st); refresh(); } });
    ui.sl = [sl('ctl.m1', 'm1', 0.5, 3, 0.5, 'kg', 1), sl('ctl.v1', 'v1', -2, 2, 0.5, 'm/s', 1), sl('ctl.m2', 'm2', 0.5, 3, 0.5, 'kg', 1), sl('ctl.v2', 'v2', -2, 2, 0.5, 'm/s', 1)];
    controlsBody.append(...ui.sl.map((s) => s.root));
  }
  ui.go = createButton({ labelKey: 'ctl.start', variant: 'primary', onClick: () => {
    if (!st.run && isSystemEnd(st)) resetSystem(st);
    st.run = !st.run; refresh();
  } });
  ui.rec = createButton({ labelKey: 'ctl.record', variant: 'secondary', onClick: () => {
    if (st.mode === 'two') st.rows.push({ m1: st.m1, v1: st.v1, m2: st.m2, v2: st.v2 });
    else {
      const tt = Math.round(st.t * 10) / 10;
      if (tt <= 0) { st.fb = { type: 'warn', key: 'fb.tZero' }; refresh(); return; }
      st.rows.push({ t: tt });
    }
    st.fb = null; refresh();
  } });
  controlsBody.append(btnRow(ui.go, ui.rec, createButton({ labelKey: 'ctl.again', variant: 'ghost', onClick: () => { resetSystem(st); refresh(); } })), hint(`hint.${st.mode}`), resetBtn('system'));
  tableBlock(st);
}
function resetSystem(st) { st.run = false; st.t = 0; st.x1 = -1.5; st.x2 = 1.5; }
function isSystemEnd(st) {
  if (st.mode === 'fall') return st.t >= 3.4;
  if (st.mode === 'forces') return st.t >= 2.4;
  return st.x1 !== -1.5;
}
function updateSystem() {
  const st = S.system;
  const key = st.run ? 'ctl.pause' : isSystemEnd(st) || st.t === 0 && st.x1 === -1.5 ? 'ctl.start' : 'ctl.continue';
  if (ui.go.dataset.i18n !== key) { ui.go.dataset.i18n = key; ui.go.textContent = t(key); }
  if (st.mode === 'fall') {
    measRows(ui.dl, [[t('m.mass'), qty(200, 0, 'g')], [t('m.t'), qty(st.t, 2, 's')], [t('m.tRec'), qty(Math.round(st.t * 10) / 10, 1, 's')]]);
    renderTable(st, ['col.t', 'col.vFall', 'col.pFall'], (r) => el('tr', {}, [el('td', {}, num(r.t, 1)),
      cell(r, 'v', g * r.t, 1, 0.051, 'fb.vFallOk', 'fb.vFallWrong', st),
      cell(r, 'p', 0.2 * g * r.t, 2, 0.011, 'fb.pFallOk', 'fb.pFallWrong', st, !calcDone(r, 'v'))]));
  } else if (st.mode === 'two') {
    const M = st.m1 + st.m2, xg = (st.m1 * st.x1 + st.m2 * st.x2) / M;
    measRows(ui.dl, [[t('m.xG'), qty(xg, 2, 'm')], [t('m.gap'), qty(st.x2 - st.x1, 2, 'm')]]);
    renderTable(st, ['col.m1', 'col.v1', 'col.m2', 'col.v2', 'col.P', 'col.VG'], (r) => {
      const P = r.m1 * r.v1 + r.m2 * r.v2, V = P / (r.m1 + r.m2);
      return el('tr', {}, [el('td', {}, num(r.m1, 1)), el('td', {}, num(r.v1, 1)), el('td', {}, num(r.m2, 1)), el('td', {}, num(r.v2, 1)),
        cell(r, 'P', P, 2, 0.011, 'fb.POk', 'fb.PWrong', st),
        cell(r, 'V', V, 2, relTol(V, 0.015, 0.006), 'fb.VGOk', 'fb.VGWrong', st, !calcDone(r, 'P'))]);
    });
  } else {
    measRows(ui.dl, [[t('m.M'), qty(5, 0, 'kg')], [t('m.F1'), '5 i + 15 j (N)'], [t('m.F2'), '10 i + 10 j (N)'], [t('m.t'), qty(st.t, 2, 's')], [t('m.tRec'), qty(Math.round(st.t * 10) / 10, 1, 's')]]);
    renderTable(st, ['col.t', 'col.Px', 'col.Py', 'col.VGm'], (r) => el('tr', {}, [el('td', {}, num(r.t, 1)),
      cell(r, 'px', 15 * r.t, 1, 0.051, 'fb.PxOk', 'fb.PxWrong', st),
      cell(r, 'py', 25 * r.t, 1, 0.051, 'fb.PxOk', 'fb.PxWrong', st, !calcDone(r, 'px')),
      cell(r, 'v', Math.sqrt(34) * r.t, 2, relTol(Math.sqrt(34) * r.t, 0.015), 'fb.VGmOk', 'fb.VGmWrong', st, !calcDone(r, 'py'))]));
  }
}

/* ---------- Tab 3 ---------- */
function buildCollision() {
  const st = S.collision;
  ui.e = createSegmented({ labelKey: 'ctl.rings', options: [{ value: 1, labelKey: 'ring.elastic' }, { value: 0.5, labelKey: 'ring.soft' }], value: st.e,
    onChange: (v) => { st.e = Number(v); st.rows = []; st.fb = null; exp2Init(st); refresh(); } });
  ui.go = createButton({ labelKey: 'ctl.launch', variant: 'primary', onClick: () => {
    if (st.phase === 'ready') st.phase = 'moving';
    else if (st.phase === 'moving') st.phase = 'paused';
    else if (st.phase === 'paused') st.phase = 'moving';
    else { exp2Init(st); st.rows = []; st.fb = null; st.phase = 'moving'; }
    refresh();
  } });
  ui.rec = createButton({ labelKey: 'ctl.recordDots', variant: 'secondary', onClick: () => {
    if (st.phase !== 'done') { st.fb = { type: 'warn', key: 'fb.notDone' }; refresh(); return; }
    const d = (v) => Math.round(mag(v) * REC * 10000) / 100; // cm, two decimals
    st.rows = [
      { puck: 'A', when: 'before', m: EXP2.mA, d: d(st.before.A) }, { puck: 'B', when: 'before', m: EXP2.mB, d: d(st.before.B) },
      { puck: 'A', when: 'after', m: EXP2.mA, d: d(st.after.A) }, { puck: 'B', when: 'after', m: EXP2.mB, d: d(st.after.B) },
    ];
    st.fb = null; refresh();
  } });
  ui.diag = createSegmented({ labelKey: 'ctl.diagram', options: [{ value: 'no', labelKey: 'no' }, { value: 'yes', labelKey: 'yes' }], value: st.diagram ? 'yes' : 'no',
    onChange: (v) => { st.diagram = v === 'yes'; refresh(); } });
  controlsBody.append(ui.e.root, btnRow(ui.go, ui.rec), ui.diag.root, hint('hint.collision'), resetBtn('collision'));
  tableBlock(st);
}
function updateCollision() {
  const st = S.collision;
  const key = st.phase === 'moving' ? 'ctl.pause' : st.phase === 'paused' ? 'ctl.continue' : st.phase === 'done' ? 'ctl.again' : 'ctl.launch';
  if (ui.go.dataset.i18n !== key) { ui.go.dataset.i18n = key; ui.go.textContent = t(key); }
  const rows = [[t('m.mA'), qty(EXP2.mA, 3, 'kg')], [t('m.mB'), qty(EXP2.mB, 3, 'kg')], [t('m.tau'), qty(REC * 1000, 0, 'ms')]];
  if (st.phase === 'done') {
    const Ek = (vA, vB) => 0.5 * EXP2.mA * mag(vA) ** 2 + 0.5 * EXP2.mB * mag(vB) ** 2;
    rows.push([t('m.EkBefore'), qty(Ek(st.before.A, st.before.B) * 1000, 1, 'mJ')], [t('m.EkAfter'), qty(Ek(st.after.A, st.after.B) * 1000, 1, 'mJ')]);
  }
  measRows(ui.dl, rows);
  renderTable(st, ['col.puck', 'col.when', 'col.m', 'col.d1', 'col.v1d', 'col.p'], (r) => {
    const v = r.d / 100 / REC, p = r.m * v;
    return el('tr', {}, [el('td', {}, r.puck), el('td', {}, t(`c.${r.when}`)), el('td', {}, num(r.m, 3)), el('td', {}, num(r.d, 2)),
      cell(r, 'v', v, 3, relTol(v, 0.015), 'fb.vOk', 'fb.v1Wrong', st),
      cell(r, 'p', p, 3, relTol(p, 0.02), 'fb.pOk', 'fb.pWrong', st, !calcDone(r, 'v'))]);
  });
}

/* ---------- Tab 4 ---------- */
function buildRecoil() {
  const st = S.recoil;
  ui.mode = createSegmented({ labelKey: 'ctl.case', options: ['cannon', 'explosion', 'moving'].map((v) => ({ value: v, labelKey: `r.${v}` })), value: st.mode,
    onChange: (v) => { st.mode = v; st.rows = []; st.fb = null; Object.assign(st, { run: false, done: false, t: 0 }); buildTab('recoil'); } });
  controlsBody.append(ui.mode.root);
  const again = () => Object.assign(st, { run: false, done: false, t: 0 });
  if (st.mode === 'cannon') {
    controlsBody.append(
      createSlider({ labelKey: 'ctl.Mgun', min: 500, max: 2000, step: 100, value: st.M, unit: 'kg', decimals: 0, onInput: (v) => { st.M = v; again(); refresh(); } }).root,
      createSlider({ labelKey: 'ctl.mShell', min: 2, max: 20, step: 1, value: st.m, unit: 'kg', decimals: 0, onInput: (v) => { st.m = v; again(); refresh(); } }).root,
      createSlider({ labelKey: 'ctl.vShell', min: 200, max: 600, step: 50, value: st.v, unit: 'm/s', decimals: 0, onInput: (v) => { st.v = v; again(); refresh(); } }).root);
  } else if (st.mode === 'explosion') {
    controlsBody.append(createSlider({ labelKey: 'ctl.vPiece', min: 2, max: 9, step: 1, value: st.v1, unit: 'm/s', decimals: 0, onInput: (v) => { st.v1 = v; again(); refresh(); } }).root);
  }
  ui.go = createButton({ labelKey: st.mode === 'cannon' ? 'ctl.fire' : 'ctl.explode', variant: 'primary', onClick: () => {
    if (st.done) again();
    st.run = true; refresh();
  } });
  const row = [ui.go];
  if (st.mode !== 'moving') row.push(createButton({ labelKey: 'ctl.record', variant: 'secondary', onClick: () => {
    st.rows.push(st.mode === 'cannon' ? { M: st.M, m: st.m, v: st.v } : { v1: st.v1 });
    st.fb = null; refresh();
  } }));
  controlsBody.append(btnRow(...row), hint(`hint.${st.mode}`), resetBtn('recoil'));
  tableBlock(st);
}
function updateRecoil() {
  const st = S.recoil;
  const key = st.done ? 'ctl.again' : st.mode === 'cannon' ? 'ctl.fire' : 'ctl.explode';
  if (ui.go.dataset.i18n !== key) { ui.go.dataset.i18n = key; ui.go.textContent = t(key); }
  ui.go.disabled = st.run;
  if (st.mode === 'cannon') {
    measRows(ui.dl, [[t('m.Mgun'), qty(st.M, 0, 'kg')], [t('m.mShell'), qty(st.m, 0, 'kg')], [t('m.vShell'), qty(st.v, 0, 'm/s')]]);
    renderTable(st, ['col.Mgun', 'col.mShell', 'col.vShell', 'col.Vgun'], (r) => el('tr', {}, [el('td', {}, num(r.M, 0)), el('td', {}, num(r.m, 0)), el('td', {}, num(r.v, 0)),
      cell(r, 'V', (-r.m * r.v) / r.M, 2, relTol((r.m * r.v) / r.M, 0.015), 'fb.VgunOk', 'fb.VgunWrong', st)]));
  } else if (st.mode === 'explosion') {
    measRows(ui.dl, [[t('m.masses'), 'm, 3m'], [t('m.vPiece'), qty(st.v1, 0, 'm/s')]]);
    renderTable(st, ['col.vPiece', 'col.v2'], (r) => el('tr', {}, [el('td', {}, num(r.v1, 0)),
      cell(r, 'v', -r.v1 / 3, 2, 0.011, 'fb.v2Ok', 'fb.v2Wrong', st)]));
  } else {
    measRows(ui.dl, [[t('m.t'), qty(st.t, 2, 's')], [t('m.explodeAt'), qty(1, 1, 's')]]);
    renderTable(st, [], () => el('tr'));
  }
}

/* ---------- Tab 5 ---------- */
function buildTrack() {
  const st = S.track;
  ui.type = createSegmented({ labelKey: 'ctl.collision', options: [{ value: 'elastic', labelKey: 'tr.elastic' }, { value: 'stick', labelKey: 'tr.stick' }], value: st.type,
    onChange: (v) => { st.type = v; resetTrack(st); buildTab('track'); } });
  const sl = (key, prop, min, max, step, unit, dec) => createSlider({ labelKey: key, min, max, step, value: st[prop], unit, decimals: dec, onInput: (v) => { st[prop] = v; resetTrack(st); refresh(); } });
  ui.sl = [sl('ctl.m1', 'm1', 0.1, 1, 0.1, 'kg', 1), sl('ctl.v1', 'v1', -1, 1, 0.1, 'm/s', 1), sl('ctl.m2', 'm2', 0.1, 1, 0.1, 'kg', 1), sl('ctl.v2', 'v2', -1, 1, 0.1, 'm/s', 1)];
  const preset = (key, vals) => createButton({ labelKey: key, variant: 'ghost', onClick: () => { Object.assign(st, vals); resetTrack(st); buildTab('track'); } });
  ui.go = createButton({ labelKey: 'ctl.launch', variant: 'primary', onClick: () => { if (st.done) resetTrack(st); st.run = !st.run; refresh(); } });
  controlsBody.append(ui.type.root, ...ui.sl.map((s) => s.root),
    btnRow(preset('pre.equal', { m1: 0.5, m2: 0.5, v1: 0.6, v2: -0.4 }), preset('pre.rest', { m1: 0.3, m2: 0.6, v1: 0.8, v2: 0 })),
    btnRow(ui.go, createButton({ labelKey: 'ctl.record', variant: 'secondary', onClick: () => { st.rows.push({ type: st.type, m1: st.m1, v1: st.v1, m2: st.m2, v2: st.v2 }); st.fb = null; refresh(); } })),
    hint(`hint.${st.type}`), resetBtn('track'));
  tableBlock(st);
}
function updateTrack() {
  const st = S.track;
  const key = st.run ? 'ctl.pause' : st.done ? 'ctl.again' : st.x1 !== 0.35 ? 'ctl.continue' : 'ctl.launch';
  if (ui.go.dataset.i18n !== key) { ui.go.dataset.i18n = key; ui.go.textContent = t(key); }
  measRows(ui.dl, [[t('m.v1now'), qty(st.u1, 2, 'm/s')], [t('m.v2now'), qty(st.u2, 2, 'm/s')], [t('m.collided'), t(st.hit ? 'yes' : 'no')]]);
  const rows = st.rows.filter((r) => r.type === st.type);
  if (st.type === 'elastic') {
    renderTable({ ...st, rows }, ['col.m1', 'col.v1', 'col.m2', 'col.v2', 'col.v1p', 'col.v2p'], (r) => {
      const a = trackAfter(r);
      return el('tr', {}, [el('td', {}, num(r.m1, 1)), el('td', {}, num(r.v1, 1)), el('td', {}, num(r.m2, 1)), el('td', {}, num(r.v2, 1)),
        cell(r, 'a', a.a, 2, 0.011, 'fb.v1pOk', 'fb.vpWrong', st), cell(r, 'b', a.b, 2, 0.011, 'fb.v2pOk', 'fb.vpWrong', st, !calcDone(r, 'a'))]);
    });
  } else {
    renderTable({ ...st, rows }, ['col.m1', 'col.v1', 'col.m2', 'col.v2', 'col.Vp'], (r) => {
      const a = trackAfter(r);
      return el('tr', {}, [el('td', {}, num(r.m1, 1)), el('td', {}, num(r.v1, 1)), el('td', {}, num(r.m2, 1)), el('td', {}, num(r.v2, 1)),
        cell(r, 'a', a.a, 2, 0.011, 'fb.VpOk', 'fb.VpWrong', st)]);
    });
  }
  showStatus(ui.status, st.fb);
}

/* ---------- Tab switching ---------- */
function buildTab(id) {
  controlsBody.replaceChildren();
  measuresBody.replaceChildren();
  ui = {};
  tableSig = '';
  ({ notion: buildNotion, system: buildSystem, collision: buildCollision, recoil: buildRecoil, track: buildTrack })[id]();
  loop.start();
  shell?.refreshActivity();
  refresh();
}
function updateMeasures() {
  if (!shell || !ui.dl) return;
  ({ notion: updateNotion, system: updateSystem, collision: updateCollision, recoil: updateRecoil, track: updateTrack })[shell.tab]();
}
function refresh() { updateMeasures(); requestDraw(); }
function resetTab(id) {
  S[id] = initialState(id);
  if (id === 'collision') exp2Init(S[id]);
  if (id === 'track') resetTrack(S[id]);
  buildTab(id);
}

exp2Init(S.collision);
resetTrack(S.track);
onLangChange(() => { if (shell) buildTab(shell.tab); });

shell = initSim({
  strings,
  tabs: TABS.map((id) => ({ id, labelKey: `tab.${id}` })),
  initialTab: 'notion',
  onTab: buildTab,
  activityKey: (tab) => (tab === 'system' || tab === 'recoil' ? `act.${tab}.${S[tab].mode}` : tab === 'track' ? `act.track.${S.track.type}` : `act.${tab}`),
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, exp1, trackAfter, EXP2 };
