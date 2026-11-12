// Sec 3 GS-LS (SG-SV) — Chapter 1: Energy (whole chapter, SG and SV). g = 10 m/s² as in the book (owner, 12 Nov 2026).
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num, qty } from '../../../shared/format.js';
import { createButton, createSegmented, createSlider, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, font, arrow } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { label } from '../../../shared/figures.js';
import { calcCell, calcSig, calcDone } from '../../../shared/calc-cell.js';
import { drawEnergyBars, plotCurves } from '../../../shared/energy-bars.js';
import { G_SEC3GSLS as g } from '../../../shared/constants.js';

const TAU = 2 * Math.PI;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const W = 600;
const TABS = ['kinetic', 'gravity', 'elastic', 'mechanical', 'conservation'];
const HEIGHTS = { kinetic: 310, gravity: 420, elastic: 300, mechanical: 470, conservation: 430 };

/* ================================================================
   Model and book values
   ================================================================ */
// Elastic: Application 1.4 (5 cm under 100 N → k = 2000 N/m) and Application 1.6 (dart gun)
const K_SPRING = 2000; // N/m
const DART = { k: 250, m: 0.025, xMax: 0.06 }; // N/m, kg, m → v = 6 m/s at 6 cm
// Gravity: Application 1.2 — body of 10 kg at A, 20 m above the ground; B 30 m below A (bottom of a well)
const GRAV = { m: 10, zA: 20, zB: -10 };
// Mechanical energy: exercise 19 (200 g on a frictionless incline at 30°, v0 = 5 m/s)
// and exercise 16 (pendulum: 100 g, L = 100 cm, released at 60°)
const INC = { m: 0.2, alpha: Math.PI / 6 };
const PEND = { m: 0.1, L: 1 };
// Conservation: exercise 15 (parachutist 100 kg, 1000 m, 270 km/h → 18 km/h); free fall of a 200 g ball from 20 m (illustrative)
const PARA = { m: 100, z0: 1000, v0: 75, vClosed: 50, vOpen: 5 };
const FALL = { m: 0.2, z0: 20 };

function initialState(tab) {
  switch (tab) {
    case 'kinetic': return { mode: 'trans', m: 2, v: 3, R: 0.5, N: 4, x: 0, phi: 0, rows: [], fb: null };
    case 'gravity': return { ref: 'ground', z: 20, rows: [], fb: null };
    case 'elastic': return { mode: 'spring', x: 0.05, dx: 0.06, dart: null, rows: [], fb: null };
    case 'mechanical': return { mode: 'incline', v0: 5, th0: 60, s: 0, v: 0, th: 60 * Math.PI / 180, w: 0, running: false, launched: false };
    default: return { mode: 'fall', run: false, done: false, z: FALL.z0, v: 0, open: false, vL: PARA.vClosed, tOpen: 0, dU: 0, rows: [], fb: null };
  }
}
let S = Object.fromEntries(TABS.map((k) => [k, initialState(k)]));

// Mechanical energy tab
function mechE(st) {
  if (st.mode === 'incline') {
    const Ep = INC.m * g * st.s * Math.sin(INC.alpha);
    const Ek = 0.5 * INC.m * st.v * st.v;
    return { Ek, Ep, Em: Ek + Ep, Em0: 0.5 * INC.m * st.v0 * st.v0 };
  }
  const Ep = PEND.m * g * PEND.L * (1 - Math.cos(st.th));
  const Ek = 0.5 * PEND.m * (PEND.L * st.w) ** 2;
  return { Ek, Ep, Em: Ek + Ep, Em0: PEND.m * g * PEND.L * (1 - Math.cos(st.th0 * Math.PI / 180)) };
}
function resetMech(st) {
  st.running = false; st.launched = false; st.ended = false;
  st.s = 0; st.v = st.v0;
  st.th = st.th0 * Math.PI / 180; st.w = 0;
}
// Conservation tab: energies in J (ΔU counted from the start)
function consE(st) {
  if (st.mode === 'fall') {
    const Ek = 0.5 * FALL.m * st.v * st.v, Ep = FALL.m * g * st.z;
    return { Ek, Ep, Em: Ek + Ep, dU: 0, E0: FALL.m * g * FALL.z0 };
  }
  if (st.mode === 'parachute') {
    const Ek = 0.5 * PARA.m * st.v * st.v, Ep = PARA.m * g * st.z;
    const E0 = 0.5 * PARA.m * PARA.v0 ** 2 + PARA.m * g * PARA.z0;
    return { Ek, Ep, Em: Ek + Ep, dU: E0 - (Ek + Ep), E0 };
  }
  // rocket (illustrative units): Em rises, ΔU falls by the same amount
  const Ek = 0.5 * st.v * st.v / 200, Ep = st.z / 40;
  return { Ek, Ep, Em: Ek + Ep, dU: -(Ek + Ep), E0: 0 };
}
function resetCons(st) {
  Object.assign(st, { run: false, done: false, open: false, tOpen: 0, vL: PARA.vClosed });
  if (st.mode === 'fall') { st.z = FALL.z0; st.v = 0; }
  else if (st.mode === 'parachute') { st.z = PARA.z0; st.v = PARA.v0; }
  else { st.z = 0; st.v = 0; }
}

/* ================================================================
   Canvas and loop
   ================================================================ */
let shell;
let drawQueued = false;
let now = 0;
const canvas = document.getElementById('stage');
canvas.style.touchAction = 'none';
const view = setupCanvas(canvas, { width: W, height: 330, maxHeightVh: () => (window.innerWidth < 880 ? 52 : 76), onResize: () => requestDraw() });
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
    if (tab === 'kinetic') {
      if (st.mode === 'trans') st.x = (st.x + st.v * dt * 60) % 760;
      else st.phi += TAU * st.N * dt / 8; // slowed down 8 times
    } else if (tab === 'elastic' && st.dart) {
      const d = st.dart;
      d.t += dt;
      // slow motion ×40 for the release, ×4 for the flight
      if (d.phase === 'release') {
        const om = Math.sqrt(DART.k / DART.m);
        const tau = d.t / 40;
        if (om * tau >= Math.PI / 2) { d.phase = 'flight'; d.t = 0; d.comp = 0; }
        else d.comp = d.x0 * Math.cos(om * tau);
      } else if (d.phase === 'flight') {
        d.fly = d.v * d.t / 4;
        if (d.fly > 4) { st.dart = null; }
      }
    } else if (tab === 'mechanical' && st.running) stepMech(st, dt);
    else if (tab === 'conservation' && st.run && !st.done) stepCons(st, dt);
    return true;
  },
  render() { draw(); updateMeasures(); },
});

function stepMech(st, dt) {
  const n = 8, h = dt / n;
  for (let i = 0; i < n; i++) {
    if (st.mode === 'incline') {
      st.v -= g * Math.sin(INC.alpha) * h;
      st.s += st.v * h;
      if (st.s <= 0 && st.v < 0) { st.s = 0; st.v = -st.v0; st.running = false; st.ended = true; break; }
    } else {
      st.w -= (g / PEND.L) * Math.sin(st.th) * h;
      st.th += st.w * h;
    }
  }
}
function stepCons(st, dt) {
  if (st.mode === 'fall') {
    const h = dt * 0.5; // slow motion ×2
    st.v += g * h; st.z -= st.v * h;
    if (st.z <= 0) { st.z = 0; st.done = true; st.run = false; }
  } else if (st.mode === 'parachute') {
    const n = 20, h = (dt * (st.open ? 8 : 4)) / n; // time ×4, then ×8 once the parachute is open
    for (let i = 0; i < n; i++) {
      if (!st.open && st.z < 300) st.open = true; // the parachute opens by itself at 300 m
      if (st.open) { st.tOpen += h; st.vL = PARA.vOpen + (PARA.vClosed - PARA.vOpen) * Math.exp(-st.tOpen / 1.5); }
      st.v += g * (1 - (st.v * st.v) / (st.vL * st.vL)) * h;
      st.z -= st.v * h;
      if (st.z <= 0) { st.z = 0; st.v = PARA.vOpen; st.done = true; st.run = false; break; }
    }
  } else {
    const h = dt;
    st.v += 15 * h; st.z += st.v * h;
    if (st.z > 600) { st.done = true; st.run = false; }
  }
}

/* ================================================================
   Drawing
   ================================================================ */
const C = {
  Ek: () => cssVar('--s1'), Ep: () => cssVar('--s2'), Pe: () => cssVar('--s5'), Em: () => cssVar('--brand-navy'),
  dU: () => cssVar('--s4'), E: () => cssVar('--s6'),
};
function tag(ctx, s, x, y, o = {}) { label(ctx, s, x, y, { size: 13, weight: 700, ...o }); }
function vec(ctx, x1, y1, x2, y2, color, text, lw = 2.5) {
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = lw;
  if (Math.hypot(x2 - x1, y2 - y1) > 3) arrow(ctx, x1, y1, x2, y2, 9);
  if (text) label(ctx, text, x2 + (x2 >= x1 ? 6 : -6), y2 - 12, { size: 13, weight: 800, color, align: x2 >= x1 ? 'left' : 'right' });
}
function dashed(ctx, x1, y1, x2, y2, color = cssVar('--muted')) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.setLineDash([6, 5]);
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore();
}
function ground(ctx, y, x1 = 0, x2 = W) {
  ctx.fillStyle = cssVar('--bench'); ctx.fillRect(x1, y, x2 - x1, 8);
  ctx.strokeStyle = cssVar('--glass-stroke'); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
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

function draw() {
  if (!shell) return;
  const tab = shell.tab;
  if (view.height !== HEIGHTS[tab]) view.setLogicalSize(W, HEIGHTS[tab]);
  const ctx = view.begin();
  ctx.fillStyle = cssVar('--scene-bg');
  roundRect(ctx, 0, 0, W, HEIGHTS[tab], 14);
  ctx.fill();
  if (tab === 'kinetic') drawKinetic(ctx, S.kinetic);
  else if (tab === 'gravity') drawGravity(ctx, S.gravity);
  else if (tab === 'elastic') drawElastic(ctx, S.elastic);
  else if (tab === 'mechanical') drawMechanical(ctx, S.mechanical);
  else drawConservation(ctx, S.conservation);
}

/* ---------- Tab 1: kinetic energy ---------- */
function drawKinetic(ctx, st) {
  if (st.mode === 'trans') {
    ground(ctx, 230);
    const w = 80 + st.m * 16, h = 46;
    const x = -w + st.x;
    ctx.fillStyle = cssVar('--metal'); roundRect(ctx, x, 230 - h, w, h, 12); ctx.fill();
    ctx.strokeStyle = cssVar('--glass-stroke'); ctx.lineWidth = 1.5; ctx.stroke();
    label(ctx, '(D)', x + w / 2, 230 - h - 14, { size: 13, weight: 800 });
    const L = st.v * 22;
    for (const [px, py] of [[x + 14, 230 - 34], [x + w / 2 - 10, 230 - 14], [x + w * 0.62, 230 - 30]]) {
      ctx.fillStyle = cssVar('--text'); ctx.beginPath(); ctx.arc(px, py, 3.5, 0, TAU); ctx.fill();
      vec(ctx, px, py, px + L, py, C.Ek(), null, 2.2);
    }
    tag(ctx, `v = ${qty(st.v, 1, 'm/s')}`, 300, 70, { color: C.Ek(), size: 15 });
    tag(ctx, t('kin.same'), 300, 100, { color: cssVar('--muted'), weight: 600 });
    tag(ctx, t('kin.transNote'), 300, 270, { color: cssVar('--muted'), size: 12, weight: 600 });
  } else {
    const cx = 200, cy = 155, R = 30 + st.R * 200;
    ctx.fillStyle = cssVar('--alu'); ctx.strokeStyle = cssVar('--glass-stroke'); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = cssVar('--muted'); ctx.lineWidth = 1.5;
    for (let k = 0; k < 4; k++) {
      const a = st.phi + (k * Math.PI) / 2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a)); ctx.stroke();
    }
    // axis Δ (perpendicular to the disk)
    ctx.fillStyle = cssVar('--surface'); ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, 8, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = cssVar('--text'); ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, TAU); ctx.fill();
    tag(ctx, 'Δ', cx + 16, cy + 14, { size: 13 });
    const w = TAU * st.N;
    [1 / 3, 2 / 3, 1].forEach((f, i) => {
      const a = st.phi + 0.4 + i * 2.1;
      const r = R * f, px = cx + r * Math.cos(a), py = cy + r * Math.sin(a);
      const vr = st.R * f * w; // m/s
      const L = vr * 4.2;
      ctx.fillStyle = cssVar('--text'); ctx.beginPath(); ctx.arc(px, py, 3.5, 0, TAU); ctx.fill();
      vec(ctx, px, py, px - L * Math.sin(a), py + L * Math.cos(a), C.Ek(), null, 2);
      label(ctx, `v${i + 1} = ${qty(vr, 1, 'm/s')}`, 486, 70 + i * 26, { size: 13, weight: 700, color: C.Ek(), align: 'left' });
      label(ctx, `r${i + 1} = ${qty(st.R * f * 100, 0, 'cm')}`, 392, 70 + i * 26, { size: 13, weight: 700, align: 'left' });
    });
    tag(ctx, t('kin.rotNote'), 470, 170, { color: cssVar('--muted'), size: 12, weight: 600, align: 'center' });
    tag(ctx, `θ′ = 2π N`, 470, 200, { size: 13, weight: 700 });
    tag(ctx, t('kin.slow'), 470, 290, { color: cssVar('--muted'), size: 11, weight: 600 });
  }
}

/* ---------- Tab 2: gravitational potential energy ---------- */
const GZ = { y0: 300, k: 9.5 }; // y of z = 0 (ground) and px per m
const gy = (z) => GZ.y0 - z * GZ.k;
const GX = 330; // vertical line of the body
const REF_Z = { ground: 0, A: GRAV.zA, B: GRAV.zB };
function drawGravity(ctx, st) {
  // sky and ground, building with the point A on its roof, well with B at its bottom
  ctx.fillStyle = cssVar('--sky'); ctx.fillRect(8, 8, W - 16, gy(0) - 8);
  ctx.fillStyle = cssVar('--land'); ctx.fillRect(8, gy(0), W - 16, HEIGHTS.gravity - gy(0) - 8);
  ctx.fillStyle = cssVar('--surface-2'); ctx.fillRect(GX - 22, gy(0), 44, gy(GRAV.zB) - gy(0) + 4);
  ctx.strokeStyle = cssVar('--glass-stroke'); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(GX - 22, gy(0)); ctx.lineTo(GX - 22, gy(GRAV.zB) + 4); ctx.lineTo(GX + 22, gy(GRAV.zB) + 4); ctx.lineTo(GX + 22, gy(0)); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(8, gy(0)); ctx.lineTo(GX - 22, gy(0)); ctx.moveTo(GX + 22, gy(0)); ctx.lineTo(W - 8, gy(0)); ctx.stroke();
  ctx.fillStyle = cssVar('--wood'); ctx.fillRect(120, gy(GRAV.zA), 150, gy(0) - gy(GRAV.zA));
  ctx.fillStyle = cssVar('--scene-bg');
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) ctx.fillRect(138 + c * 44, gy(GRAV.zA) + 22 + r * 42, 24, 22);
  ctx.fillStyle = cssVar('--glass-stroke'); ctx.fillRect(120, gy(GRAV.zA) - 4, GX - 120 - 12, 5);
  tag(ctx, t('grav.ground'), 60, gy(0) + 18, { size: 12 });
  tag(ctx, t('grav.well'), GX + 70, gy(GRAV.zB) + 2, { size: 12 });
  // named points
  ctx.fillStyle = cssVar('--text');
  for (const [z, name] of [[GRAV.zA, 'A'], [0, 'O'], [GRAV.zB, 'B']]) {
    ctx.beginPath(); ctx.arc(GX, gy(z), 3, 0, TAU); ctx.fill();
    label(ctx, name, GX - 34, gy(z) - 10, { size: 14, weight: 800 });
  }
  dashed(ctx, GX, gy(25), GX, gy(GRAV.zB));
  // reference level
  const zr = REF_Z[st.ref];
  ctx.save(); ctx.strokeStyle = C.Ep(); ctx.lineWidth = 2; ctx.setLineDash([10, 6]);
  ctx.beginPath(); ctx.moveTo(8, gy(zr)); ctx.lineTo(W - 8, gy(zr)); ctx.stroke(); ctx.restore();
  label(ctx, t('grav.refLine'), W - 14, gy(zr) - 10, { size: 12, weight: 800, color: C.Ep(), align: 'right' });
  // axis Oz from the reference level, upward
  const ax = 480;
  ctx.strokeStyle = cssVar('--text'); ctx.fillStyle = cssVar('--text'); ctx.lineWidth = 1.8;
  arrow(ctx, ax, gy(GRAV.zB - 1), ax, gy(27), 8);
  label(ctx, 'z (m)', ax + 10, gy(27) + 2, { size: 12, weight: 800, align: 'left' });
  for (let z = -30; z <= 30; z += 5) {
    const zz = zr + z;
    if (zz < GRAV.zB - 0.5 || zz > 25.5) continue;
    ctx.beginPath(); ctx.moveTo(ax - 5, gy(zz)); ctx.lineTo(ax + 5, gy(zz)); ctx.stroke();
    label(ctx, num(z, 0), ax + 10, gy(zz), { size: 11, weight: z === 0 ? 800 : 600, align: 'left' });
  }
  // body
  const by = gy(st.z);
  ctx.fillStyle = cssVar('--s3'); roundRect(ctx, GX - 14, by - 28, 28, 28, 4); ctx.fill();
  label(ctx, '10 kg', GX, by - 14, { size: 10, weight: 800, color: '#fff', halo: false });
  ctx.fillStyle = cssVar('--accent'); ctx.beginPath(); ctx.arc(GX, by - 14, 2.5, 0, TAU);
  // z of the body with respect to the reference level
  ctx.strokeStyle = C.Ep(); ctx.fillStyle = C.Ep(); ctx.lineWidth = 2;
  if (Math.abs(st.z - zr) > 0.4) arrow(ctx, GX + 34, gy(zr), GX + 34, by - 14, 7);
  label(ctx, `z = ${qty(st.z - zr, 1, 'm')}`, GX + 42, (gy(zr) + by - 14) / 2, { size: 13, weight: 800, color: C.Ep(), align: 'left' });
  label(ctx, t('grav.drag'), 18, 24, { size: 12, weight: 600, color: cssVar('--muted'), align: 'left' });
}

/* ---------- Tab 3: elastic potential energy ---------- */
const SP = { wall: 60, x0: 300, y: 150, pxPerCm: 6 };
function drawElastic(ctx, st) {
  if (st.mode === 'spring') {
    ground(ctx, 200, 40, 580);
    ctx.fillStyle = cssVar('--wood'); ctx.fillRect(SP.wall - 20, 70, 20, 130);
    const xi = SP.x0 + st.x * 100 * SP.pxPerCm;
    spring(ctx, SP.wall, SP.y, xi, SP.y, 16, 11);
    dashed(ctx, SP.x0, 90, SP.x0, 200);
    label(ctx, t('el.natural'), SP.x0, 82, { size: 11, weight: 700, color: cssVar('--muted') });
    // the free end I and the hand pulling or pushing
    ctx.fillStyle = cssVar('--text'); ctx.beginPath(); ctx.arc(xi, SP.y, 6, 0, TAU); ctx.fill();
    label(ctx, 'I', xi, SP.y + 22, { size: 14, weight: 800 });
    ctx.fillStyle = cssVar('--skin'); roundRect(ctx, xi + 8, SP.y - 14, 38, 28, 10); ctx.fill();
    ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(xi, SP.y); ctx.lineTo(xi + 10, SP.y); ctx.stroke();
    // x and the tension F of the spring on I (restoring force), scale 1 cm ↔ 100 N
    const F = K_SPRING * st.x; // N, algebraic (positive when stretched)
    if (Math.abs(st.x) > 0.001) {
      ctx.strokeStyle = cssVar('--text'); ctx.fillStyle = cssVar('--text'); ctx.lineWidth = 1.5;
      arrow(ctx, SP.x0, 230, xi, 230, 7);
      label(ctx, `x = ${qty(Math.abs(st.x) * 100, 1, 'cm')}`, (SP.x0 + xi) / 2, 246, { size: 13, weight: 800 });
      vec(ctx, xi, SP.y - 34, xi - F * 0.25, SP.y - 34, cssVar('--accent'), 'F', 3);
    }
    // scale of the forces: 100 N ↔ 25 px
    vec(ctx, 520, 280, 545, 280, cssVar('--accent'), null, 2.5);
    label(ctx, '100 N', 552, 280, { size: 11, weight: 700, align: 'left' });
    label(ctx, t('el.scaleF'), 512, 280, { size: 11, weight: 600, color: cssVar('--muted'), align: 'right' });
    label(ctx, st.x >= 0 ? t('el.stretched') : t('el.compressed'), 300, 30, { size: 13, weight: 700 });
    label(ctx, t('el.dragI'), 20, 280, { size: 12, weight: 600, color: cssVar('--muted'), align: 'left' });
  } else {
    // dart gun (Application 1.6): barrel, spring k = 250 N/m, dart 25 g
    const by = 150, back = 90, natural = 260, ppc = 10; // natural position of the dart's back (px), 10 px per cm
    ground(ctx, 230, 40, 580);
    const comp = st.dart ? st.dart.comp ?? 0 : st.dx;
    const fly = st.dart?.phase === 'flight' ? st.dart.fly * 120 : 0;
    const rear = natural - comp * 100 * ppc;
    ctx.fillStyle = cssVar('--box'); roundRect(ctx, back - 20, by - 22, natural - back + 90, 44, 8); ctx.fill();
    ctx.fillStyle = cssVar('--surface-2'); ctx.fillRect(back, by - 14, natural - back + 70, 28);
    ctx.fillStyle = cssVar('--box'); ctx.beginPath(); ctx.moveTo(back + 10, by + 22); ctx.lineTo(back + 50, by + 22); ctx.lineTo(back + 30, by + 80); ctx.lineTo(back - 6, by + 80); ctx.closePath(); ctx.fill();
    spring(ctx, back, by, Math.min(rear, natural), by, 12, 9);
    // dart
    const dx = Math.min(rear, natural) + fly;
    ctx.fillStyle = cssVar('--accent'); ctx.fillRect(dx, by - 7, 56, 14);
    ctx.beginPath(); ctx.moveTo(dx + 56, by - 7); ctx.lineTo(dx + 76, by); ctx.lineTo(dx + 56, by + 7); ctx.fill();
    label(ctx, '25 g', dx + 28, by, { size: 10, weight: 800, color: '#fff', halo: false });
    dashed(ctx, natural, 90, natural, 220);
    label(ctx, t('el.natural'), natural, 82, { size: 11, weight: 700, color: cssVar('--muted') });
    if (comp > 0.0005 && !st.dart) {
      ctx.strokeStyle = cssVar('--text'); ctx.fillStyle = cssVar('--text'); ctx.lineWidth = 1.5;
      arrow(ctx, natural, 200, rear, 200, 7);
      label(ctx, `x = ${qty(comp * 100, 1, 'cm')}`, (natural + rear) / 2, 214, { size: 13, weight: 800 });
    }
    if (st.dart?.phase === 'flight') {
      const v = st.dart.v;
      vec(ctx, dx + 80, by - 30, dx + 80 + v * 14, by - 30, C.Ek(), 'v', 3);
    }
    label(ctx, t(st.dart ? (st.dart.phase === 'release' ? 'el.slowRelease' : 'el.slowFlight') : 'el.dragDart'), 20, 280, { size: 12, weight: 600, color: cssVar('--muted'), align: 'left' });
    label(ctx, t('el.dartGun'), 300, 30, { size: 13, weight: 700 });
  }
}

/* ---------- Tab 4: mechanical energy ---------- */
const INC_G = { ox: 70, oy: 214, k: 118 }; // O on the screen, px per m along the slope
function drawMechanical(ctx, st) {
  const E = mechE(st);
  const Emax = Math.max(E.Em0, 0.01) * 1.15;
  if (st.mode === 'incline') {
    const ca = Math.cos(INC.alpha), sa = Math.sin(INC.alpha), L = 3.2;
    const P = (s) => [INC_G.ox + s * ca * INC_G.k, INC_G.oy - s * sa * INC_G.k];
    const [ex, ey] = P(L);
    ctx.fillStyle = cssVar('--bench');
    ctx.beginPath(); ctx.moveTo(INC_G.ox, INC_G.oy); ctx.lineTo(ex, ey); ctx.lineTo(ex, INC_G.oy); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = cssVar('--glass-stroke'); ctx.lineWidth = 2; ctx.stroke();
    label(ctx, '30°', INC_G.ox + 62, INC_G.oy - 12, { size: 12, weight: 700 });
    label(ctx, 'O', INC_G.ox - 20, INC_G.oy + 14, { size: 14, weight: 800 });
    dashed(ctx, 16, INC_G.oy, 420, INC_G.oy, C.Ep());
    label(ctx, t('mech.refO'), 130, INC_G.oy + 16, { size: 11, weight: 700, color: C.Ep(), align: 'left' });
    for (let s = 0.5; s < L; s += 0.5) {
      const [px, py] = P(s);
      ctx.strokeStyle = cssVar('--muted'); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px - 3 * sa, py - 3 * ca); ctx.lineTo(px - 10 * sa, py - 10 * ca); ctx.stroke();
      if (Number.isInteger(s)) label(ctx, `${num(s, 0)} m`, px - 22 * sa, py - 22 * ca, { size: 10, weight: 600, color: cssVar('--muted') });
    }
    label(ctx, 'x', ex - 6, ey - 16, { size: 13, weight: 800 });
    // particle (C)
    const [cx, cy] = P(st.s);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(-INC.alpha);
    ctx.fillStyle = cssVar('--s3'); roundRect(ctx, -14, -24, 28, 24, 4); ctx.fill();
    label(ctx, '(C)', 0, -12, { size: 10, weight: 800, color: '#fff', halo: false });
    if (Math.abs(st.v) > 0.05) vec(ctx, 0, -32, st.v * 16, -32, C.Ek(), null, 2.5);
    ctx.restore();
    drawEnergyBars(ctx, { x: 440, y: 16, w: 148, h: 210, bars: barsMech(E), max: Emax, unit: 'J', decimals: 2 });
    plotCurves(ctx, {
      x: 12, y: 246, w: 576, h: 214, xMin: 0, xMax: 3.2, yMin: 0, yMax: Emax, xLabel: 'x (m)', yLabel: t('mech.yLabel'),
      curves: [
        { f: (s) => INC.m * g * s * sa, color: C.Ep(), label: t('sym.Epp') },
        { f: (s) => Math.max(0, E.Em0 - INC.m * g * s * sa), color: C.Ek(), label: t('sym.Ek') },
        { f: () => E.Em0, color: C.Em(), dash: true, label: 'Em' },
      ],
      marker: st.launched ? st.s : null,
    });
  } else {
    const px = 220, py = 34, Lpx = 160;
    ctx.fillStyle = cssVar('--wood'); ctx.fillRect(px - 70, py - 12, 140, 10);
    const bx = px + Lpx * Math.sin(st.th), by = py + Lpx * Math.cos(st.th);
    dashed(ctx, px, py, px, py + Lpx + 20);
    const th0 = st.th0 * Math.PI / 180;
    ctx.save(); ctx.strokeStyle = cssVar('--muted'); ctx.setLineDash([3, 4]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(px, py, Lpx, Math.PI / 2 - th0, Math.PI / 2 + th0); ctx.stroke(); ctx.restore();
    ctx.strokeStyle = cssVar('--thread'); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(bx, by); ctx.stroke();
    ctx.fillStyle = cssVar('--s3'); ctx.beginPath(); ctx.arc(bx, by, 11, 0, TAU); ctx.fill();
    const lowY = py + Lpx;
    dashed(ctx, 40, lowY, 400, lowY, C.Ep());
    label(ctx, t('mech.refLow'), 44, lowY + 14, { size: 11, weight: 700, color: C.Ep(), align: 'left' });
    label(ctx, `θ = ${num(st.th * 180 / Math.PI, 0)}°`, px + 22, py + 30, { size: 13, weight: 800, align: 'left' });
    drawEnergyBars(ctx, { x: 440, y: 16, w: 148, h: 210, bars: barsMech(E), max: Emax, unit: 'J', decimals: 3 });
    const thd = st.th0;
    plotCurves(ctx, {
      x: 12, y: 246, w: 576, h: 214, xMin: -thd, xMax: thd, yMin: 0, yMax: Emax, xLabel: 'θ (°)', yLabel: t('mech.yLabel'), xStep: thd > 30 ? 10 : 5,
      curves: [
        { f: (d) => PEND.m * g * PEND.L * (1 - Math.cos(d * Math.PI / 180)), color: C.Ep(), label: t('sym.Epp') },
        { f: (d) => Math.max(0, E.Em0 - PEND.m * g * PEND.L * (1 - Math.cos(d * Math.PI / 180))), color: C.Ek(), label: t('sym.Ek') },
        { f: () => E.Em0, color: C.Em(), dash: true, label: 'Em' },
      ],
      marker: st.th * 180 / Math.PI,
    });
  }
}
const barsMech = (E) => [
  { label: t('sym.Ek'), value: E.Ek, color: C.Ek() },
  { label: t('sym.Epp'), value: E.Ep, color: C.Ep() },
  { label: 'Em', value: E.Em, color: C.Em() },
];

/* ---------- Tab 5: conservation of energy ---------- */
function drawConservation(ctx, st) {
  const E = consE(st);
  const H = HEIGHTS.conservation;
  ctx.fillStyle = cssVar('--sky'); ctx.fillRect(8, 8, 372, H - 60);
  ctx.fillStyle = cssVar('--grass'); ctx.fillRect(8, H - 52, 372, 44);
  const top = 40, bottom = H - 70;
  if (st.mode === 'fall' || st.mode === 'parachute') {
    const z0 = st.mode === 'fall' ? FALL.z0 : PARA.z0;
    const y = bottom - (st.z / z0) * (bottom - top);
    // altitude scale
    ctx.strokeStyle = cssVar('--text'); ctx.fillStyle = cssVar('--text'); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(60, bottom); ctx.lineTo(60, top); ctx.stroke();
    for (let k = 0; k <= 4; k++) {
      const yy = bottom - (k / 4) * (bottom - top);
      ctx.beginPath(); ctx.moveTo(55, yy); ctx.lineTo(65, yy); ctx.stroke();
      label(ctx, `${num((z0 * k) / 4, 0)} m`, 50, yy, { size: 10, weight: 600, align: 'right' });
    }
    label(ctx, t('cons.refGround'), 70, H - 30, { size: 11, weight: 700, color: C.Ep(), align: 'left' });
    if (st.mode === 'fall') {
      ctx.fillStyle = cssVar('--s3'); ctx.beginPath(); ctx.arc(220, y - 10, 10, 0, TAU); ctx.fill();
      if (st.v > 0.2) vec(ctx, 236, y - 10, 236, y - 10 + st.v * 3, C.Ek(), 'v');
    } else {
      const x = 230;
      if (st.open) {
        const r = 34 * Math.min(1, 0.3 + st.tOpen / 2);
        ctx.fillStyle = cssVar('--accent'); ctx.beginPath(); ctx.arc(x, y - 60, r, Math.PI, 0); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = cssVar('--thread'); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x - r, y - 60); ctx.lineTo(x, y - 16); ctx.lineTo(x + r, y - 60); ctx.stroke();
      }
      ctx.fillStyle = cssVar('--brand-navy');
      ctx.beginPath(); ctx.arc(x, y - 22, 6, 0, TAU); ctx.fill();
      ctx.fillRect(x - 4, y - 16, 8, 14);
      if (st.v > 0.2) vec(ctx, x + 18, y - 12, x + 18, y - 12 + Math.min(110, st.v * 1.4), C.Ek(), 'v');
    }
  } else {
    // rocket taking off
    const y = bottom - Math.min(1, st.z / 600) * (bottom - top - 60);
    const x = 220;
    ctx.fillStyle = cssVar('--silver'); ctx.strokeStyle = cssVar('--glass-stroke'); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x, y - 70); ctx.lineTo(x + 14, y - 46); ctx.lineTo(x + 14, y); ctx.lineTo(x - 14, y); ctx.lineTo(x - 14, y - 46); ctx.closePath(); ctx.fill(); ctx.stroke();
    if (st.run || st.done) {
      ctx.fillStyle = cssVar('--flame-out');
      ctx.beginPath(); ctx.moveTo(x - 10, y); ctx.lineTo(x, y + 30 + 8 * Math.sin(now * 40)); ctx.lineTo(x + 10, y); ctx.fill();
      ctx.fillStyle = 'rgba(160,160,160,0.35)';
      for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.arc(x + (k - 2.5) * 16, bottom + 4, 14, 0, TAU); ctx.fill(); }
    }
    label(ctx, t('cons.illustrative'), 20, 24, { size: 11, weight: 600, color: cssVar('--muted'), align: 'left' });
  }
  const vals = [
    { label: t('sym.Ek'), value: E.Ek, color: C.Ek() },
    { label: t('sym.Epp'), value: E.Ep, color: C.Ep() },
    { label: 'Em', value: E.Em, color: C.Em() },
    { label: 'ΔU', value: E.dU, color: C.dU() },
    { label: 'Em+ΔU', value: E.Em + E.dU, color: C.E() },
  ];
  const unit = st.mode === 'parachute' ? 'kJ' : st.mode === 'fall' ? 'J' : t('cons.units');
  const div = st.mode === 'parachute' ? 1000 : 1;
  const max = st.mode === 'rocket' ? 18 : (E.E0 / div) * 1.12;
  const min = st.mode === 'rocket' ? -18 : 0;
  drawEnergyBars(ctx, {
    x: 388, y: 12, w: 202, h: H - 24, bars: vals.map((b) => ({ ...b, value: b.value / div })), max, min, unit, decimals: st.mode === 'parachute' ? 0 : 1, values: st.mode !== 'rocket',
  });
}

/* ================================================================
   Pointer: drag the body (gravity), the end I of the spring or the dart (elastic)
   ================================================================ */
let drag = null;
canvas.addEventListener('pointerdown', (ev) => {
  const p = view.toLogical(ev), tab = shell.tab, st = S[tab];
  if (tab === 'gravity' && Math.abs(p.x - GX) < 50) drag = 'body';
  else if (tab === 'elastic' && st.mode === 'spring' && Math.abs(p.y - SP.y) < 60) drag = 'I';
  else if (tab === 'elastic' && st.mode === 'dart' && !st.dart && Math.abs(p.y - 150) < 50 && p.x > 120 && p.x < 360) drag = 'dart';
  if (!drag) return;
  canvas.setPointerCapture(ev.pointerId);
  moveDrag(p);
});
canvas.addEventListener('pointermove', (ev) => { if (drag) moveDrag(view.toLogical(ev)); });
const endDrag = () => { drag = null; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
function moveDrag(p) {
  if (drag === 'body') {
    let z = Math.round(((GZ.y0 - p.y + 14) / GZ.k) * 2) / 2;
    z = clamp(z, GRAV.zB, 25);
    for (const zs of [GRAV.zA, 0, GRAV.zB]) if (Math.abs(z - zs) < 1) z = zs;
    S.gravity.z = z;
  } else if (drag === 'I') {
    S.elastic.x = clamp(Math.round(((p.x - SP.x0) / SP.pxPerCm) * 2) / 2, -10, 25) / 100;
  } else if (drag === 'dart') {
    S.elastic.dx = clamp(Math.round(((260 - p.x + 30) / 10) * 2) / 2, 0, 6) / 100;
  }
  refresh();
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
const yesNo = (labelKey, value, onChange) => createSegmented({
  labelKey, options: [{ value: 'no', labelKey: 'no' }, { value: 'yes', labelKey: 'yes' }], value: value ? 'yes' : 'no', onChange: (v) => onChange(v === 'yes'),
});
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
  const sig = calcSig(st.rows) + st.rows.length;
  if (sig !== tableSig) {
    ui.table.replaceChildren(
      el('thead', {}, el('tr', {}, cols.map((k) => el('th', {}, t(k))))),
      el('tbody', {}, st.rows.map(rowFn)),
    );
    tableSig = calcSig(st.rows) + st.rows.length;
  }
  ui.tableWrap.hidden = st.rows.length === 0;
  ui.clear.hidden = ui.tableWrap.hidden;
  showStatus(ui.status, st.fb);
}

/* ---------- Tab 1 ---------- */
function buildKinetic() {
  const st = S.kinetic;
  ui.mode = createSegmented({
    labelKey: 'ctl.motion', options: [{ value: 'trans', labelKey: 'mode.trans' }, { value: 'rot', labelKey: 'mode.rot' }], value: st.mode,
    onChange: (v) => { st.mode = v; st.fb = null; buildTab('kinetic'); },
  });
  ui.m = createSlider({ labelKey: 'ctl.m', min: 0.5, max: 5, step: 0.5, value: st.m, unit: 'kg', decimals: 1, onInput: (v) => { st.m = v; refresh(); } });
  controlsBody.append(ui.mode.root, ui.m.root);
  if (st.mode === 'trans') {
    ui.v = createSlider({ labelKey: 'ctl.v', min: 0.5, max: 5, step: 0.5, value: st.v, unit: 'm/s', decimals: 1, onInput: (v) => { st.v = v; refresh(); } });
    controlsBody.append(ui.v.root);
  } else {
    ui.R = createSlider({ labelKey: 'ctl.R', min: 10, max: 60, step: 5, value: st.R * 100, unit: 'cm', decimals: 0, onInput: (v) => { st.R = v / 100; refresh(); } });
    ui.N = createSlider({ labelKey: 'ctl.N', min: 0.5, max: 5, step: 0.5, value: st.N, unit: t('unit.tps'), decimals: 1, onInput: (v) => { st.N = v; refresh(); } });
    controlsBody.append(ui.R.root, ui.N.root);
  }
  controlsBody.append(btnRow(createButton({ labelKey: 'ctl.record', variant: 'primary', onClick: () => {
    st.rows.push(st.mode === 'trans' ? { mode: 'trans', m: st.m, v: st.v } : { mode: 'rot', m: st.m, R: st.R, N: st.N });
    st.fb = null; refresh();
  } })), hint(st.mode === 'trans' ? 'hint.trans' : 'hint.rot'), resetBtn('kinetic'));
  tableBlock(st);
}
function updateKinetic() {
  const st = S.kinetic;
  const rows = [[t('m.m'), qty(st.m, 1, 'kg')]];
  if (st.mode === 'trans') rows.push([t('m.v'), qty(st.v, 1, 'm/s')]);
  else rows.push([t('m.R'), qty(st.R * 100, 0, 'cm')], [t('m.N'), qty(st.N, 1, t('unit.tps'))]);
  measRows(ui.dl, rows);
  const rs = st.rows.filter((r) => r.mode === st.mode);
  const view2 = { ...st, rows: rs };
  if (st.mode === 'trans') {
    renderTable(view2, ['col.m', 'col.v', 'col.EkT'], (r) => el('tr', {}, [
      el('td', {}, num(r.m, 1)), el('td', {}, num(r.v, 1)),
      calcCell(r, 'E', { expected: 0.5 * r.m * r.v * r.v, decimals: 2, tol: relTol(0.5 * r.m * r.v * r.v, 0.01), onCheck: (res) => { st.fb = fbOf(res, 'fb.EkTOk', 'fb.EkTWrong'); refresh(); } }),
    ]));
  } else {
    renderTable(view2, ['col.m', 'col.R', 'col.N', 'col.w', 'col.I', 'col.EkR'], (r) => {
      const w = TAU * r.N, I = 0.5 * r.m * r.R * r.R, E = 0.5 * I * w * w;
      return el('tr', {}, [
        el('td', {}, num(r.m, 1)), el('td', {}, num(r.R, 2)), el('td', {}, num(r.N, 1)),
        calcCell(r, 'w', { expected: w, decimals: 1, tol: relTol(w, 0.01), onCheck: (res) => { st.fb = fbOf(res, 'fb.wOk', 'fb.wWrong'); refresh(); } }),
        calcCell(r, 'I', { expected: I, decimals: 3, tol: relTol(I, 0.01), disabled: !calcDone(r, 'w'), onCheck: (res) => { st.fb = fbOf(res, 'fb.IOk', 'fb.IWrong'); refresh(); } }),
        calcCell(r, 'E', { expected: E, decimals: 1, tol: relTol(E, 0.015), disabled: !calcDone(r, 'I'), onCheck: (res) => { st.fb = fbOf(res, 'fb.EkROk', 'fb.EkRWrong'); refresh(); } }),
      ]);
    });
  }
}

/* ---------- Tab 2 ---------- */
function buildGravity() {
  const st = S.gravity;
  ui.ref = createSegmented({
    labelKey: 'ctl.ref', options: ['ground', 'A', 'B'].map((v) => ({ value: v, labelKey: `rl.${v}` })), value: st.ref,
    onChange: (v) => { st.ref = v; refresh(); },
  });
  const goto = (z) => () => { st.z = z; refresh(); };
  controlsBody.append(ui.ref.root,
    el('div', { class: 'ctl' }, [el('div', { class: 'ctl-head' }, el('span', { class: 'ctl-label', dataset: { i18n: 'ctl.place' } }, t('ctl.place'))),
      btnRow(createButton({ labelKey: 'place.A', onClick: goto(GRAV.zA) }), createButton({ labelKey: 'place.O', onClick: goto(0) }), createButton({ labelKey: 'place.B', onClick: goto(GRAV.zB) }))]),
    btnRow(createButton({ labelKey: 'ctl.record', variant: 'primary', onClick: () => { st.rows.push({ ref: st.ref, z: st.z - REF_Z[st.ref] }); st.fb = null; refresh(); } })),
    hint('hint.gravity'), resetBtn('gravity'));
  tableBlock(st);
}
function updateGravity() {
  const st = S.gravity;
  ui.ref.set(st.ref);
  measRows(ui.dl, [
    [t('m.mass'), qty(GRAV.m, 0, 'kg')],
    [t('m.g'), qty(g, 0, 'm/s²')],
    [t('m.refLevel'), t(`rl.${st.ref}`)],
    [t('m.zGround'), qty(st.z, 1, 'm')],
    [t('m.zRef'), qty(st.z - REF_Z[st.ref], 1, 'm')],
  ]);
  renderTable(st, ['col.ref', 'col.z', 'col.Ep'], (r) => el('tr', {}, [
    el('td', {}, t(`refShort.${r.ref}`)), el('td', {}, num(r.z, 1)),
    calcCell(r, 'E', { expected: GRAV.m * g * r.z, decimals: 0, tol: 0.5, onCheck: (res) => { st.fb = fbOf(res, 'fb.EpOk', 'fb.EpWrong'); refresh(); } }),
  ]));
}

/* ---------- Tab 3 ---------- */
function buildElastic() {
  const st = S.elastic;
  ui.mode = createSegmented({
    labelKey: 'ctl.device', options: [{ value: 'spring', labelKey: 'dev.spring' }, { value: 'dart', labelKey: 'dev.dart' }], value: st.mode,
    onChange: (v) => { st.mode = v; st.dart = null; st.fb = null; buildTab('elastic'); },
  });
  controlsBody.append(ui.mode.root);
  if (st.mode === 'spring') {
    controlsBody.append(btnRow(createButton({ labelKey: 'ctl.record', variant: 'primary', onClick: () => {
      if (Math.abs(st.x) < 0.001) st.fb = { type: 'warn', key: 'fb.noX' };
      else { st.rows.push({ mode: 'spring', x: st.x }); st.fb = null; }
      refresh();
    } })), hint('hint.spring'));
  } else {
    controlsBody.append(btnRow(
      createButton({ labelKey: 'ctl.recordX', variant: 'secondary', onClick: () => {
        if (st.dx < 0.001) st.fb = { type: 'warn', key: 'fb.noX' };
        else { st.rows.push({ mode: 'dart', x: st.dx }); st.fb = null; }
        refresh();
      } }),
      createButton({ labelKey: 'ctl.fire', variant: 'primary', onClick: () => {
        if (st.dart) return;
        if (st.dx < 0.001) { st.fb = { type: 'warn', key: 'fb.noX' }; refresh(); return; }
        st.dart = { phase: 'release', t: 0, x0: st.dx, comp: st.dx, v: st.dx * Math.sqrt(DART.k / DART.m) };
        st.dx = 0; refresh();
      } }),
    ), hint('hint.dart'));
  }
  controlsBody.append(resetBtn('elastic'));
  tableBlock(st);
}
function updateElastic() {
  const st = S.elastic;
  if (st.mode === 'spring') {
    measRows(ui.dl, [
      [t('m.x'), qty(Math.abs(st.x) * 100, 1, 'cm')],
      [t('m.state'), t(st.x > 0 ? 'state.stretched' : st.x < 0 ? 'state.compressed' : 'state.natural')],
      [t('m.F'), qty(Math.abs(K_SPRING * st.x), 0, 'N')],
    ]);
    const rs = { ...st, rows: st.rows.filter((r) => r.mode === 'spring') };
    renderTable(rs, ['col.x', 'col.F', 'col.k', 'col.Epe'], (r) => {
      const x = Math.abs(r.x), F = K_SPRING * x;
      return el('tr', {}, [
        el('td', {}, num(x, 3)), el('td', {}, num(F, 0)),
        calcCell(r, 'k', { expected: K_SPRING, decimals: 0, tol: 1, onCheck: (res) => { st.fb = fbOf(res, 'fb.kOk', 'fb.kWrong'); refresh(); } }),
        calcCell(r, 'E', { expected: 0.5 * K_SPRING * x * x, decimals: 2, tol: relTol(0.5 * K_SPRING * x * x, 0.01), disabled: !calcDone(r, 'k'), onCheck: (res) => { st.fb = fbOf(res, 'fb.EpeOk', 'fb.EpeWrong'); refresh(); } }),
      ]);
    });
  } else {
    measRows(ui.dl, [
      [t('m.k'), qty(DART.k, 0, 'N/m')],
      [t('m.dartMass'), qty(DART.m * 1000, 0, 'g')],
      [t('m.x'), qty((st.dart ? st.dart.x0 : st.dx) * 100, 1, 'cm')],
      [t('m.dart'), t(st.dart ? (st.dart.phase === 'release' ? 'dart.release' : 'dart.flight') : 'dart.ready')],
    ]);
    const rs = { ...st, rows: st.rows.filter((r) => r.mode === 'dart') };
    renderTable(rs, ['col.x', 'col.EpeD', 'col.vD'], (r) => {
      const E = 0.5 * DART.k * r.x * r.x, v = r.x * Math.sqrt(DART.k / DART.m);
      return el('tr', {}, [
        el('td', {}, num(r.x, 3)),
        calcCell(r, 'E', { expected: E, decimals: 3, tol: relTol(E, 0.01), onCheck: (res) => { st.fb = fbOf(res, 'fb.EpeDOk', 'fb.EpeWrong'); refresh(); } }),
        calcCell(r, 'v', { expected: v, decimals: 1, tol: relTol(v, 0.015), disabled: !calcDone(r, 'E'), onCheck: (res) => { st.fb = fbOf(res, 'fb.vDOk', 'fb.vDWrong'); refresh(); } }),
      ]);
    });
  }
}

/* ---------- Tab 4 ---------- */
function buildMechanical() {
  const st = S.mechanical;
  ui.mode = createSegmented({
    labelKey: 'ctl.system', options: [{ value: 'incline', labelKey: 'sys.incline' }, { value: 'pendulum', labelKey: 'sys.pendulum' }], value: st.mode,
    onChange: (v) => { st.mode = v; resetMech(st); buildTab('mechanical'); },
  });
  controlsBody.append(ui.mode.root);
  if (st.mode === 'incline') {
    ui.v0 = createSlider({ labelKey: 'ctl.v0', min: 1, max: 5.5, step: 0.5, value: st.v0, unit: 'm/s', decimals: 1, onInput: (v) => { st.v0 = v; resetMech(st); refresh(); } });
    controlsBody.append(ui.v0.root);
  } else {
    ui.th0 = createSlider({ labelKey: 'ctl.th0', min: 10, max: 60, step: 5, value: st.th0, unit: '°', decimals: 0, onInput: (v) => { st.th0 = v; resetMech(st); refresh(); } });
    controlsBody.append(ui.th0.root);
  }
  ui.go = createButton({ labelKey: st.mode === 'incline' ? 'ctl.launch' : 'ctl.release', variant: 'primary', onClick: () => {
    if (st.ended) resetMech(st);
    st.running = !st.running; st.launched = true; refresh();
  } });
  controlsBody.append(btnRow(ui.go, createButton({ labelKey: 'ctl.again', variant: 'secondary', onClick: () => { resetMech(st); refresh(); } })),
    hint(st.mode === 'incline' ? 'hint.incline' : 'hint.pendulum'), resetBtn('mechanical'));
  ui.dl = el('dl', { class: 'meas' });
  measuresBody.append(ui.dl);
}
function updateMechanical() {
  const st = S.mechanical, E = mechE(st);
  const key = st.running ? 'ctl.pause' : st.ended || !st.launched ? (st.mode === 'incline' ? 'ctl.launch' : 'ctl.release') : 'ctl.continue';
  if (ui.go.dataset.i18n !== key) { ui.go.dataset.i18n = key; ui.go.textContent = t(key); }
  const d = 3;
  const rows = st.mode === 'incline'
    ? [[t('m.mass'), qty(INC.m * 1000, 0, 'g')], [t('m.xC'), qty(st.s, 2, 'm')], [t('m.zC'), qty(st.s * Math.sin(INC.alpha), 2, 'm')], [t('m.vC'), qty(Math.abs(st.v), 2, 'm/s')]]
    : [[t('m.mass'), qty(PEND.m * 1000, 0, 'g')], [t('m.L'), qty(PEND.L * 100, 0, 'cm')], [t('m.theta'), qty(st.th * 180 / Math.PI, 1, '°')], [t('m.vC'), qty(Math.abs(st.w * PEND.L), 2, 'm/s')]];
  rows.push([t('m.Ek'), qty(E.Ek, d, 'J')], [t('m.Ep'), qty(E.Ep, d, 'J')], [t('m.Em'), qty(E.Em, d, 'J')]);
  measRows(ui.dl, rows);
}

/* ---------- Tab 5 ---------- */
function buildConservation() {
  const st = S.conservation;
  ui.mode = createSegmented({
    labelKey: 'ctl.case', options: ['fall', 'parachute', 'rocket'].map((v) => ({ value: v, labelKey: `case.${v}` })), value: st.mode,
    onChange: (v) => { st.mode = v; st.rows = []; st.fb = null; resetCons(st); buildTab('conservation'); },
  });
  controlsBody.append(ui.mode.root);
  ui.go = createButton({ labelKey: 'ctl.start', variant: 'primary', onClick: () => {
    if (st.done) resetCons(st);
    st.run = !st.run; refresh();
  } });
  const row = [ui.go];
  if (st.mode === 'parachute') {
    ui.open = createButton({ labelKey: 'ctl.open', variant: 'secondary', onClick: () => { if (st.run) { st.open = true; refresh(); } } });
    row.push(ui.open);
  }
  row.push(createButton({ labelKey: 'ctl.again', variant: 'secondary', onClick: () => { resetCons(st); st.rows = []; st.fb = null; buildTab('conservation'); } }));
  controlsBody.append(btnRow(...row), hint(`hint.${st.mode}`), resetBtn('conservation'));
  tableBlock(st);
}
function updateConservation() {
  const st = S.conservation, E = consE(st);
  const key = st.run ? 'ctl.pause' : st.done ? 'ctl.again' : (st.z !== (st.mode === 'fall' ? FALL.z0 : st.mode === 'parachute' ? PARA.z0 : 0) ? 'ctl.continue' : 'ctl.start');
  if (ui.go.dataset.i18n !== key) { ui.go.dataset.i18n = key; ui.go.textContent = t(key); }
  if (ui.open) ui.open.disabled = st.open || !st.run;
  const rows = [[t('m.system'), t(`sys.${st.mode}`)]];
  if (st.mode === 'fall') rows.push([t('m.mass'), qty(FALL.m * 1000, 0, 'g')], [t('m.alt'), qty(st.z, 1, 'm')], [t('m.speed'), qty(st.v, 1, 'm/s')], [t('m.Em'), qty(E.Em, 1, 'J')]);
  else if (st.mode === 'parachute') {
    rows.push([t('m.mass'), qty(PARA.m, 0, 'kg')], [t('m.alt'), qty(st.z, 0, 'm')], [t('m.speedKmh'), qty(st.v * 3.6, 0, 'km/h')],
      [t('m.para'), t(st.open ? 'para.open' : 'para.closed')]);
  } else rows.push([t('m.Em'), t(st.z > 0 ? 'rocket.up' : 'rocket.rest')]);
  measRows(ui.dl, rows);
  if (st.mode === 'parachute' && st.done && st.rows.length === 0) st.rows.push({ Q: (0.5 * PARA.m * PARA.v0 ** 2 + PARA.m * g * PARA.z0 - 0.5 * PARA.m * PARA.vOpen ** 2) / 1000 });
  renderTable(st, ['col.Em1', 'col.Em2', 'col.Q'], (r) => {
    const Em1 = (0.5 * PARA.m * PARA.v0 ** 2 + PARA.m * g * PARA.z0) / 1000, Em2 = (0.5 * PARA.m * PARA.vOpen ** 2) / 1000;
    return el('tr', {}, [
      calcCell(r, 'a', { expected: Em1, decimals: 1, tol: relTol(Em1, 0.005), onCheck: (res) => { st.fb = fbOf(res, 'fb.Em1Ok', 'fb.Em1Wrong'); refresh(); } }),
      calcCell(r, 'b', { expected: Em2, decimals: 2, tol: relTol(Em2, 0.01), disabled: !calcDone(r, 'a'), onCheck: (res) => { st.fb = fbOf(res, 'fb.Em2Ok', 'fb.Em2Wrong'); refresh(); } }),
      calcCell(r, 'Q', { expected: r.Q, decimals: 0, tol: relTol(r.Q, 0.005), disabled: !calcDone(r, 'b'), onCheck: (res) => { st.fb = fbOf(res, 'fb.QOk', 'fb.QWrong'); refresh(); } }),
    ]);
  });
  ui.clear.hidden = true;
}

/* ---------- Tab switching ---------- */
function buildTab(id) {
  controlsBody.replaceChildren();
  measuresBody.replaceChildren();
  ui = {};
  tableSig = '';
  ({ kinetic: buildKinetic, gravity: buildGravity, elastic: buildElastic, mechanical: buildMechanical, conservation: buildConservation })[id]();
  loop.start();
  shell?.refreshActivity();
  refresh();
}
function updateMeasures() {
  if (!shell || !ui.dl) return;
  ({ kinetic: updateKinetic, gravity: updateGravity, elastic: updateElastic, mechanical: updateMechanical, conservation: updateConservation })[shell.tab]();
}
function refresh() { updateMeasures(); requestDraw(); }
function resetTab(id) { S[id] = initialState(id); if (id === 'mechanical') resetMech(S[id]); if (id === 'conservation') resetCons(S[id]); buildTab(id); }

resetMech(S.mechanical);
resetCons(S.conservation);
onLangChange(() => { if (shell) buildTab(shell.tab); });

shell = initSim({
  strings,
  tabs: TABS.map((id) => ({ id, labelKey: `tab.${id}` })),
  initialTab: 'kinetic',
  onTab: buildTab,
  activityKey: (tab) => (tab === 'elastic' || tab === 'mechanical' || tab === 'conservation' ? `act.${tab}.${S[tab].mode}` : `act.${tab}`),
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, mechE, consE, g };
