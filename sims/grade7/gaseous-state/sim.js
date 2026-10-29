// Grade 7 — Gaseous state (Ch.4): syringe (Act. 3–4), existence and transfer of air (Act. 2, 6, Ex. 6, 8),
// air has mass (Act. 5, Ex. 10)
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num, qty } from '../../../shared/format.js';
import { createSlider, createButton, createSegmented, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, font } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { polyArea, belowSurface, aboveLine, rotatePoly, levelFor, fillPoly, dampStep } from '../../../shared/liquid.js';
import { drawDigitalBalance } from '../../../shared/lab-draw.js';
import { calcCell, calcSig } from '../../../shared/calc-cell.js';

const SCENE = { w: 600, h: 440 };
const TABLE_Y = 404;
const DEG = Math.PI / 180;

/* ================================================================
   Model
   ================================================================ */
// Syringe of 50 mL. Closed: the air keeps the same amount n (mL at room pressure); its volume can change.
const SYR = { max: 50, start: 25, minK: 0.4, maxK: 2.5, sandK: 0.94 };
// Ball (Act. 5): volume 5.0 L; 1 L of air at room pressure ≈ 1.29 g (book); butane ≈ 2 times denser than air.
// Inflated at 1.30 bar, partly deflated down to 1.07 bar → 270.0 g → 268.5 g with air (owner decision).
const BALL = { V: 5.0, shell: 261.6, pFull: 1.30, pMin: 1.07, step: 0.046 };
const GAS_RHO = { air: 1.29, butane: 2.58 }; // g per litre at 1 bar
const gasMass = (gas, p) => GAS_RHO[gas] * BALL.V * p;
// Ex. 10: flask of 1 L; 1 L of air = 1.3 g (book), 1 L of carbon dioxide = 2.0 g; M balances the flask full of air.
const FLASK = { air: 1.3, co2: 2.0, extra: 0.7 };

function initialState(tab) {
  if (tab === 'syringe') return { content: 'air', open: true, V: SYR.start, n: SYR.start, particles: false, fb: null };
  if (tab === 'air') {
    return { bx: 200, by: 112, tilt: 0, air: null, pierced: false, glassAir: 0, bubbles: [], escaping: 0, fb: null };
  }
  return { mode: 'ball', gas: 'air', p: BALL.pFull, tare: 0, m1: null, rows: [], puff: 0, fgas: 'co2', extra: false, beam: { x: 0, v: 0 }, fb: null };
}
let S = { syringe: initialState('syringe'), air: initialState('air'), mass: initialState('mass') };

/* ================================================================
   Canvas
   ================================================================ */
let shell;
let drawQueued = false;
let drag = null;
const canvas = document.getElementById('stage');
canvas.style.touchAction = 'none';
const view = setupCanvas(canvas, { width: SCENE.w, height: SCENE.h, maxHeightVh: () => (window.innerWidth < 880 ? 50 : 74), onResize: () => requestDraw() });
function requestDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; draw(); });
}
onThemeChange(() => requestDraw());
const cur = () => S[shell.tab];

function draw() {
  if (!shell) return;
  const ctx = view.begin();
  ctx.fillStyle = cssVar('--scene-bg');
  roundRect(ctx, 0, 0, SCENE.w, SCENE.h, 12);
  ctx.fill();
  if (shell.tab === 'syringe') drawSyringe(ctx, cur());
  else if (shell.tab === 'air') drawAir(ctx, cur());
  else drawMass(ctx, cur());
}
function bench(ctx) {
  ctx.fillStyle = cssVar('--bench');
  ctx.fillRect(0, TABLE_Y, SCENE.w, SCENE.h - TABLE_Y);
}
function strokePoly(ctx, poly, close = false) {
  ctx.beginPath();
  poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  if (close) ctx.closePath();
  ctx.stroke();
}

/* ---------- Particles (persistent random positions, moving in all directions) ---------- */
const PART = Array.from({ length: 90 }, (_, i) => ({ x: Math.random(), y: Math.random(), vx: Math.cos(i * 2.4), vy: Math.sin(i * 2.4) }));
function moveParticles(dt) {
  for (const p of PART) {
    p.x += p.vx * dt * 0.35; p.y += p.vy * dt * 0.35;
    if (p.x < 0 || p.x > 1) { p.vx *= -1; p.x = Math.min(1, Math.max(0, p.x)); }
    if (p.y < 0 || p.y > 1) { p.vy *= -1; p.y = Math.min(1, Math.max(0, p.y)); }
  }
}

/* ================================================================
   Tab 1 — syringe
   ================================================================ */
const SY = { cy: 170, h: 64, x0: 120, k: 5.6, nozzle: 80 };
const xOfV = (V) => SY.x0 + V * SY.k;
function drawSyringe(ctx, st) {
  bench(ctx);
  const { cy, h, x0 } = SY;
  const top = cy - h / 2, bot = cy + h / 2;
  const xp = xOfV(st.V), xEnd = xOfV(SYR.max) + 30;
  // contents
  if (st.content === 'water') { ctx.fillStyle = cssVar('--water'); ctx.fillRect(x0, top, xp - x0, h); ctx.fillRect(SY.nozzle, cy - 6, x0 - SY.nozzle, 12); }
  else if (st.content === 'sand') drawSandFill(ctx, x0, top, xp - x0, h);
  else { ctx.fillStyle = cssVar('--glass-fill'); ctx.fillRect(x0, top, xp - x0, h); }
  // barrel
  ctx.strokeStyle = cssVar('--glass-stroke');
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(xEnd, top); ctx.lineTo(x0, top); ctx.lineTo(x0, cy - 6); ctx.lineTo(SY.nozzle, cy - 6);
  ctx.moveTo(SY.nozzle, cy + 6); ctx.lineTo(x0, cy + 6); ctx.lineTo(x0, bot); ctx.lineTo(xEnd, bot);
  ctx.stroke();
  ctx.fillStyle = cssVar('--glass-stroke');
  ctx.fillRect(xEnd - 4, top - 18, 8, h + 36); // finger flange
  // graduations
  ctx.strokeStyle = cssVar('--text');
  ctx.fillStyle = cssVar('--text');
  ctx.font = font(11, 700);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineWidth = 1;
  for (let v = 0; v <= SYR.max; v++) {
    const x = xOfV(v);
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top + (v % 5 ? 7 : 14)); ctx.stroke();
    if (v % 10 === 0) ctx.fillText(String(v), x, top - 4);
  }
  ctx.textAlign = 'left';
  ctx.fillText('mL', xOfV(SYR.max) + 10, top - 4);
  // piston (rubber) + rod + handle
  ctx.fillStyle = cssVar('--rubber');
  roundRect(ctx, xp, top + 2, 14, h - 4, 3); ctx.fill();
  ctx.fillStyle = cssVar('--glass-stroke');
  ctx.fillRect(xp + 14, cy - 6, 150, 12);
  roundRect(ctx, xp + 160, top - 14, 12, h + 28, 4); ctx.fill();
  // finger closing the opening
  if (!st.open) {
    ctx.fillStyle = cssVar('--skin');
    ctx.beginPath(); ctx.ellipse(SY.nozzle - 14, cy, 18, 26, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.stroke();
  }
  // air going out / in
  if (st.open && st.content === 'air' && Math.abs(st.flow || 0) > 0.01) {
    ctx.fillStyle = cssVar('--muted');
    ctx.font = font(18, 800);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(st.flow < 0 ? '⇠ ⇠' : '⇢ ⇢', SY.nozzle - 36, cy);
  }
  if (st.particles) drawZoom(ctx, st);
  else {
    ctx.fillStyle = cssVar('--muted');
    ctx.font = font(13, 600);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t('hint.drag'), 300, 300);
  }
}
function drawSandFill(ctx, x, y, w, h) {
  ctx.fillStyle = cssVar('--sand');
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let i = 0; i < w * h / 60; i++) {
    const px = x + ((i * 37) % Math.max(1, Math.floor(w))), py = y + ((i * 53) % h);
    ctx.fillRect(px, py, 2, 2);
  }
}
// Magnified view of a small part of the syringe
function drawZoom(ctx, st) {
  const cx = 300, cy = 318, r = 82;
  const sx = xOfV(Math.min(st.V, 8) / 2), sy = SY.cy;
  ctx.strokeStyle = cssVar('--muted');
  ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(sx, sy + 10); ctx.lineTo(cx - r * 0.7, cy - r * 0.7); ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath(); ctx.arc(sx, sy, 12, 0, Math.PI * 2); ctx.stroke();
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = cssVar('--surface');
  ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
  const L = cx - r, T = cy - r, W = 2 * r;
  if (st.content === 'water') {
    ctx.fillStyle = cssVar('--water');
    const d = 15;
    for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) {
      const p = PART[(i * 12 + j) % PART.length];
      const x = L + i * d + (j % 2) * 7 + (p.x - 0.5) * 2, y = T + j * (d - 2) + (p.y - 0.5) * 2;
      ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
    }
  } else {
    if (st.content === 'sand') {
      ctx.fillStyle = cssVar('--sand');
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      const grains = [[0.25, 0.25], [0.7, 0.22], [0.45, 0.55], [0.18, 0.75], [0.78, 0.7], [0.5, 0.92], [0.95, 0.45], [0.02, 0.45]];
      const s = (st.V / st.n); // grains come a little closer when the sand is pushed
      for (const [gx, gy] of grains) {
        ctx.beginPath(); ctx.arc(L + W * (0.5 + (gx - 0.5) * s), T + W * gy, 34, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    }
    // air particles: the same number of particles in a smaller or larger volume
    const count = Math.max(2, Math.min(PART.length, Math.round(((st.content === 'sand' ? 8 : 22) * st.n) / st.V)));
    ctx.fillStyle = cssVar('--particle');
    for (let i = 0; i < count; i++) {
      const p = PART[i];
      const rr = Math.sqrt(p.x) * (r - 6), a = p.y * Math.PI * 2; // spread over the whole disc
      ctx.beginPath(); ctx.arc(cx + rr * Math.cos(a), cy + rr * Math.sin(a), 4.5, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
  ctx.strokeStyle = cssVar('--glass-stroke');
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = cssVar('--text');
  ctx.font = font(12, 700);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(t(`zoom.${st.content}`), cx + r + 12, cy);
}
// Try to bring the piston to volume v; returns the volume reached.
function setSyringeV(v) {
  const st = S.syringe;
  v = Math.max(1, Math.min(SYR.max, v));
  let lo = 1, hi = SYR.max;
  if (st.content === 'air' && !st.open) { lo = st.n * SYR.minK; hi = Math.min(SYR.max, st.n * SYR.maxK); }
  else if (st.content === 'water') { lo = st.n; hi = st.n; }
  else if (st.content === 'sand') { lo = st.n * SYR.sandK; hi = st.n; }
  const nv = Math.max(lo, Math.min(hi, v));
  const blocked = Math.abs(nv - v) > 0.3;
  st.flow = st.open && st.content === 'air' ? nv - st.V : 0;
  st.V = Math.round(nv * 10) / 10;
  if (st.open && st.content === 'air') st.n = st.V;
  st.fb = blocked ? { type: 'warn', key: st.content === 'air' ? (v < nv ? 'fb.cannotPush' : 'fb.cannotPull') : st.content === 'water' ? 'fb.waterStuck' : 'fb.sandStuck' } : null;
  return st.V;
}

/* ================================================================
   Tab 2 — air exists, air flows (bottle mouth down in a tank of water, glass full of water)
   ================================================================ */
const TANK = { x0: 34, x1: 566, top: 120, surface: 160, bottom: 398 };
const GLASS = { x0: 420, x1: 512, top: 176, mouth: 266 };
const glassPoly = [[GLASS.x0, GLASS.mouth], [GLASS.x0, GLASS.top], [GLASS.x1, GLASS.top], [GLASS.x1, GLASS.mouth]];
const GLASS_FULL = polyArea(glassPoly);
// Bottle: mouth at the bottom when upright (local "up" coordinates, mouth centre at 0); outline starts at the mouth.
const BOTTLE_LOCAL = [[-9, 0], [-9, 27], [-30, 50], [-30, 144], [30, 144], [30, 50], [9, 27], [9, 0]];
const BOTTLE_C = 80; // turning point (up from the mouth)
const HOLE_LOCAL = [-30, 128];
function bottleWorld(st) {
  const C = [st.bx, st.by - BOTTLE_C];
  const map = ([x, y]) => [st.bx + x, st.by - y];
  const poly = rotatePoly(BOTTLE_LOCAL.map(map), C[0], C[1], st.tilt * DEG);
  const hole = rotatePoly([map(HOLE_LOCAL)], C[0], C[1], st.tilt * DEG)[0];
  return { poly, rimA: poly[0], rimB: poly[poly.length - 1], hole };
}
const BOTTLE_FULL = polyArea(BOTTLE_LOCAL);
const areaAboveY = (poly, y) => polyArea(aboveLine(poly, y));
// Largest amount of air the bottle can keep in its present position, and where the extra air leaves.
function airLimit(st, b) {
  const ys = TANK.surface;
  const mouthLow = Math.max(b.rimA[1], b.rimB[1]);
  if (mouthLow < ys) return { cap: BOTTLE_FULL, refill: true };
  const top = b.rimA[1] < b.rimB[1] ? b.rimA : b.rimB;
  let cap = areaAboveY(b.poly, top[1]), at = top;
  if (st.pierced) {
    const capHole = areaAboveY(b.poly, Math.max(b.hole[1], ys));
    if (capHole < cap) { cap = capHole; at = b.hole[1] > ys ? b.hole : null; }
  }
  return { cap, at };
}
function stepAir(st, dt) {
  const b = bottleWorld(st);
  if (st.air == null) st.air = BOTTLE_FULL;
  const lim = airLimit(st, b);
  st.escaping = 0;
  if (lim.refill) st.air = BOTTLE_FULL;
  else if (st.air > lim.cap + 1) {
    const d = Math.min(st.air - lim.cap, 2600 * dt); // the air leaves bubble by bubble
    st.air -= d;
    st.escaping = d;
    st.bubAcc = (st.bubAcc || 0) + d;
    while (lim.at && st.bubAcc > 70) {
      st.bubAcc -= 70;
      st.bubbles.push({ x: lim.at[0] + (Math.random() - 0.5) * 8, y: lim.at[1] - 4, a: 70, ph: Math.random() * 6 });
    }
    if (!lim.at) st.bubAcc = 0;
  }
  // bubbles rise; those under the glass are caught in it
  for (const bb of st.bubbles) {
    bb.y -= 95 * dt;
    bb.ph += dt * 8;
    const inGlass = bb.x > GLASS.x0 + 4 && bb.x < GLASS.x1 - 4 && bb.y < GLASS.mouth && bb.y > GLASS.top;
    if (inGlass) {
      if (st.glassAir < GLASS_FULL * 0.97) { st.glassAir = Math.min(GLASS_FULL * 0.97, st.glassAir + bb.a); bb.dead = true; }
      else { bb.x = GLASS.x1 + 8; } // the glass is full of air: the bubble escapes past its edge
    }
    if (bb.y < TANK.surface) bb.dead = true;
  }
  st.bubbles = st.bubbles.filter((bb) => !bb.dead);
}
function drawAir(ctx, st) {
  bench(ctx);
  const T = TANK;
  // water in the tank
  ctx.fillStyle = cssVar('--water');
  ctx.globalAlpha = 0.55;
  ctx.fillRect(T.x0, T.surface, T.x1 - T.x0, T.bottom - T.surface);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = cssVar('--water-dark');
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(T.x0, T.surface); ctx.lineTo(T.x1, T.surface); ctx.stroke();
  // glass (upside down) held by a clamp
  ctx.fillStyle = cssVar('--metal');
  ctx.fillRect((GLASS.x0 + GLASS.x1) / 2 - 4, 40, 8, GLASS.top - 40);
  ctx.fillRect((GLASS.x0 + GLASS.x1) / 2 - 30, 34, 60, 8);
  ctx.fillStyle = cssVar('--surface');
  fillPoly(ctx, glassPoly);
  const gy = levelFor([glassPoly], GLASS_FULL - st.glassAir, 0, 0);
  ctx.fillStyle = cssVar('--water');
  ctx.globalAlpha = 0.8;
  fillPoly(ctx, belowSurface(glassPoly, 0, gy, 0));
  ctx.globalAlpha = 1;
  ctx.strokeStyle = cssVar('--glass-stroke');
  ctx.lineWidth = 3;
  strokePoly(ctx, glassPoly);
  // bottle
  const b = bottleWorld(st);
  ctx.fillStyle = cssVar('--surface');
  fillPoly(ctx, b.poly);
  if (st.air == null) st.air = BOTTLE_FULL;
  const water = BOTTLE_FULL - st.air;
  if (water > 1) {
    const yi = levelFor([b.poly], water, 0, 0);
    ctx.fillStyle = cssVar('--water');
    ctx.globalAlpha = 0.8;
    fillPoly(ctx, belowSurface(b.poly, 0, yi, 0));
    ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = cssVar('--glass-stroke');
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  strokePoly(ctx, b.poly);
  if (st.pierced) {
    ctx.fillStyle = cssVar('--accent');
    ctx.beginPath(); ctx.arc(b.hole[0], b.hole[1], 4, 0, Math.PI * 2); ctx.fill();
  }
  // hand holding the bottle (at its base)
  const base = rotatePoly([[st.bx, st.by - 150]], st.bx, st.by - BOTTLE_C, st.tilt * DEG)[0];
  ctx.fillStyle = cssVar('--skin');
  ctx.beginPath(); ctx.ellipse(base[0], base[1], 22, 13, st.tilt * DEG, 0, Math.PI * 2); ctx.fill();
  // bubbles
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1.5;
  for (const bb of st.bubbles) {
    ctx.beginPath(); ctx.arc(bb.x + Math.sin(bb.ph) * 2.5, bb.y, 4.7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  // labels
  ctx.fillStyle = cssVar('--text');
  ctx.font = font(13, 800);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(t('name.glass'), GLASS.x0 - 10, (GLASS.top + GLASS.mouth) / 2);
}

/* ================================================================
   Tab 3 — air has mass
   ================================================================ */
const ballMass = (st) => BALL.shell + gasMass(st.gas, st.p);
const ballReading = (st) => Math.round((ballMass(st) - st.tare) * 10) / 10;
function drawMass(ctx, st) {
  bench(ctx);
  if (st.mode === 'ball') drawBall(ctx, st);
  else drawFlaskBalance(ctx, st);
}
function drawBall(ctx, st) {
  const cx = 300, plateY = 296;
  hitZero = drawDigitalBalance(ctx, { cx, plateY, bench: TABLE_Y, value: ballReading(st), zeroLabel: t('ctl.zero') });
  // the ball gets a little softer and flatter when gas comes out
  const k = (st.p - 1) / (BALL.pFull - 1); // 1 = well inflated
  const R = 92 + 4 * k, flat = 10 * (1 - k);
  const cy = plateY - R + flat * 0.6;
  ctx.fillStyle = cssVar('--ball');
  ctx.strokeStyle = cssVar('--ball-line');
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(cx, cy, R + flat * 0.5, R - flat * 0.4, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.ellipse(cx, cy, R * 0.35, R - flat * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - R, cy + 10); ctx.quadraticCurveTo(cx, cy - 30, cx + R, cy + 10); ctx.stroke();
  // valve
  const vx = cx + R * 0.55, vy = cy - R * 0.78;
  ctx.fillStyle = cssVar('--rubber');
  ctx.beginPath(); ctx.arc(vx, vy, 5, 0, Math.PI * 2); ctx.fill();
  if (st.puff > 0) {
    ctx.fillStyle = cssVar('--muted');
    for (let i = 0; i < 6; i++) {
      const a = -0.9 + i * 0.12, d = 14 + (1 - st.puff) * 40 + i * 4;
      ctx.globalAlpha = Math.max(0, st.puff);
      ctx.beginPath(); ctx.arc(vx + Math.cos(a) * d, vy + Math.sin(a) * d, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = cssVar('--text');
  ctx.font = font(13, 700);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(t(`ballgas.${st.gas}`), cx, cy - R - 8);
}
let hitZero = null;
function drawFlaskBalance(ctx, st) {
  hitZero = null;
  const px = 300, py = 150, arm = 170;
  const a = st.beam.x * DEG; // positive = right side goes down
  const ends = [-1, 1].map((s) => [px + s * arm * Math.cos(a), py + s * arm * Math.sin(a)]);
  // column and base
  ctx.fillStyle = cssVar('--metal');
  ctx.fillRect(px - 6, py, 12, TABLE_Y - py - 12);
  roundRect(ctx, px - 70, TABLE_Y - 14, 140, 14, 6); ctx.fill();
  // scale with 0 and pointer (as in Fig. 8)
  ctx.strokeStyle = cssVar('--text');
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(px, py, 70, -Math.PI / 2 - 0.45, -Math.PI / 2 + 0.45); ctx.stroke();
  ctx.fillStyle = cssVar('--text');
  ctx.font = font(14, 800);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('0', px, py - 74);
  ctx.strokeStyle = cssVar('--accent');
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + 66 * Math.sin(a), py - 66 * Math.cos(a)); ctx.stroke();
  // beam
  ctx.strokeStyle = cssVar('--metal');
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(...ends[0]); ctx.lineTo(...ends[1]); ctx.stroke();
  ctx.fillStyle = cssVar('--text');
  ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill();
  // pans hanging under the ends
  for (const [i, [ex, ey]] of ends.entries()) {
    const panY = ey + 150;
    ctx.strokeStyle = cssVar('--thread');
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - 55, panY); ctx.moveTo(ex, ey); ctx.lineTo(ex + 55, panY); ctx.stroke();
    ctx.fillStyle = cssVar('--pan-metal');
    roundRect(ctx, ex - 62, panY, 124, 8, 4); ctx.fill();
    if (i === 0) {
      // mass M and the small 0.7 g mass
      ctx.fillStyle = cssVar('--metal');
      roundRect(ctx, ex - 40, panY - 48, 46, 48, 4); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = font(16, 800);
      ctx.textBaseline = 'middle';
      ctx.fillText('M', ex - 17, panY - 24);
      if (st.extra) {
        ctx.fillStyle = cssVar('--brass');
        roundRect(ctx, ex + 12, panY - 26, 20, 26, 3); ctx.fill();
        ctx.fillStyle = cssVar('--text');
        ctx.font = font(12, 800);
        ctx.textBaseline = 'bottom';
        ctx.fillText(`${num(FLASK.extra, 1)} g`, ex + 22, panY - 30);
      }
    } else {
      // flask of 1 L
      ctx.fillStyle = st.fgas === 'co2' ? cssVar('--co2') : cssVar('--glass-fill');
      ctx.strokeStyle = cssVar('--glass-stroke');
      ctx.lineWidth = 2.5;
      roundRect(ctx, ex - 30, panY - 92, 60, 92, 12); ctx.fill(); ctx.stroke();
      ctx.fillRect(ex - 12, panY - 108, 24, 18); ctx.strokeRect(ex - 12, panY - 108, 24, 18);
      ctx.fillStyle = cssVar('--text');
      ctx.font = font(14, 800);
      ctx.textBaseline = 'middle';
      ctx.fillText(st.fgas === 'co2' ? 'CO₂' : t('name.air'), ex, panY - 46);
      ctx.font = font(11, 700);
      ctx.fillText('1 L', ex, panY - 22);
    }
  }
}
const beamTarget = (st) => {
  const right = st.fgas === 'co2' ? FLASK.co2 : FLASK.air; // gas in the flask
  const left = FLASK.air + (st.extra ? FLASK.extra : 0); // M balances the flask full of air
  return Math.max(-12, Math.min(12, (right - left) * 14));
};

/* ================================================================
   Animation
   ================================================================ */
const loop = createLoop({
  dt: 1 / 60,
  step(dt) {
    if (!shell) return false;
    const st = cur();
    if (shell.tab === 'syringe') {
      if (st.flow) st.flow *= 0.9;
      if (Math.abs(st.flow || 0) < 0.01) st.flow = 0;
      if (st.particles) moveParticles(dt);
      return st.particles || !!st.flow;
    }
    if (shell.tab === 'air') {
      const before = st.air;
      stepAir(st, dt);
      if (before !== st.air || st.bubbles.length) updateMeasures();
      return st.bubbles.length > 0 || st.escaping > 0;
    }
    if (st.puff > 0) st.puff = Math.max(0, st.puff - dt * 1.4);
    st.beam.x -= beamTarget(st);
    dampStep(st.beam, dt, 4, 0.3, 0.02);
    st.beam.x += beamTarget(st);
    return st.puff > 0 || st.beam.v !== 0;
  },
  render: () => draw(),
});
function kick() { loop.start(); requestDraw(); }

/* ================================================================
   Pointer
   ================================================================ */
canvas.addEventListener('pointerdown', (ev) => {
  const p = view.toLogical(ev);
  const st = cur();
  if (shell.tab === 'syringe') {
    const xp = xOfV(st.V);
    if (p.x > xp - 10 && p.x < xp + 190 && Math.abs(p.y - SY.cy) < 60) drag = { kind: 'piston', dx: p.x - xp };
    else if (Math.abs(p.x - SY.nozzle) < 40 && Math.abs(p.y - SY.cy) < 40 && st.content === 'air') { st.open = !st.open; if (!st.open) st.n = st.V; buildTab(); }
  } else if (shell.tab === 'air') {
    const b = bottleWorld(st);
    const xs = b.poly.map((q) => q[0]), ys = b.poly.map((q) => q[1]);
    if (p.x > Math.min(...xs) - 30 && p.x < Math.max(...xs) + 30 && p.y > Math.min(...ys) - 30 && p.y < Math.max(...ys) + 20) drag = { kind: 'bottle', dx: st.bx - p.x, dy: st.by - p.y };
  } else if (st.mode === 'ball' && hitZero && Math.hypot(p.x - hitZero.x, p.y - hitZero.y) < hitZero.r) {
    zeroBalance();
  }
  if (drag) { canvas.setPointerCapture(ev.pointerId); ev.preventDefault(); }
});
canvas.addEventListener('pointermove', (ev) => {
  if (!drag) return;
  const p = view.toLogical(ev);
  const st = cur();
  if (drag.kind === 'piston') {
    setSyringeV((p.x - drag.dx - SY.x0) / SY.k);
    ui.vol?.set(st.V);
    updateMeasures(); kick();
  } else if (drag.kind === 'bottle') {
    st.bx = Math.max(80, Math.min(470, p.x + drag.dx));
    st.by = Math.max(90, Math.min(392, p.y + drag.dy));
    updateMeasures(); kick();
  }
});
const endDrag = () => { drag = null; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

/* ================================================================
   Panels
   ================================================================ */
const controlsBody = document.getElementById('controls-body');
const measuresBody = document.getElementById('measures-body');
let ui = {};
function measRows(dl, rows) {
  dl.replaceChildren(...rows.flatMap(([k, v, cls]) => [el('dt', {}, k), el('dd', cls ? { class: cls } : {}, v)]));
}
function statusBox() { return el('div', { class: 'status', hidden: '' }); }
function showStatus(box, fb) {
  if (!fb) { box.hidden = true; return; }
  box.hidden = false;
  box.className = `status ${fb.type || ''}`;
  box.textContent = t(fb.key, fb.params);
}
const hint = (key) => el('p', { class: 'muted', style: 'margin:8px 0 0;font-size:0.88rem', dataset: { i18n: key } }, t(key));
const resetRow = () => el('div', { class: 'btn-row', style: 'margin-top:8px' }, [createButton({ labelKey: 'ui.reset', onClick: resetTab, variant: 'ghost' })]);

/* ---------- Syringe ---------- */
function buildSyringe() {
  const st = S.syringe;
  ui.content = createSegmented({
    labelKey: 'ctl.content',
    options: ['air', 'water', 'sand'].map((v) => ({ value: v, labelKey: `content.${v}` })),
    value: st.content,
    onChange: (v) => { S.syringe = { ...initialState('syringe'), content: v, open: v === 'air', particles: st.particles }; buildTab(); shell.refreshActivity(); },
  });
  const items = [ui.content.root];
  if (st.content === 'air') {
    ui.open = createSegmented({
      labelKey: 'ctl.opening',
      options: [{ value: 'open', labelKey: 'opening.open' }, { value: 'closed', labelKey: 'opening.closed' }],
      value: st.open ? 'open' : 'closed',
      onChange: (v) => { st.open = v === 'open'; st.n = st.V; st.fb = null; updateMeasures(); requestDraw(); },
    });
    items.push(ui.open.root);
  }
  ui.vol = createSlider({
    labelKey: 'ctl.piston', min: 1, max: SYR.max, step: 0.5, value: st.V, unit: 'mL', decimals: 1,
    onInput: (v) => { const got = setSyringeV(v); if (got !== v) ui.vol.set(got); updateMeasures(); kick(); },
  });
  ui.part = createSegmented({
    labelKey: 'ctl.particles',
    options: [{ value: 'no', labelKey: 'line.no' }, { value: 'yes', labelKey: 'line.yes' }],
    value: st.particles ? 'yes' : 'no',
    onChange: (v) => { st.particles = v === 'yes'; kick(); },
  });
  items.push(ui.vol.root, ui.part.root, resetRow(), hint(st.content === 'air' ? 'hint.syringeAir' : 'hint.syringe'));
  controlsBody.append(...items);
  ui.dl = el('dl', { class: 'meas' });
  ui.status = statusBox();
  measuresBody.append(ui.dl, ui.status);
}
function updateSyringe() {
  const st = S.syringe;
  ui.open?.set(st.open ? 'open' : 'closed');
  measRows(ui.dl, [
    [t('m.content'), t(`content.${st.content}`)],
    [t('m.opening'), t(st.open ? 'opening.open' : 'opening.closed')],
    [t(`m.V.${st.content}`), qty(st.V, 1, 'mL')],
    [t('m.Vstart'), qty(st.content === 'air' && st.open ? st.V : st.n, 1, 'mL')],
  ]);
  showStatus(ui.status, st.fb ?? (st.open && st.content === 'air' && st.flow ? { type: '', key: st.flow < 0 ? 'fb.airOut' : 'fb.airIn' } : null));
}

/* ---------- Air exists, air flows ---------- */
function buildAir() {
  const st = S.air;
  ui.tilt = createSlider({
    labelKey: 'ctl.tiltBottle', min: -135, max: 135, step: 1, value: st.tilt, unit: '°', decimals: 0,
    onInput: (v) => { st.tilt = v; updateMeasures(); kick(); },
  });
  ui.depth = createSlider({
    labelKey: 'ctl.depth', min: 90, max: 392, step: 1, value: st.by, unit: '', decimals: 0,
    onInput: (v) => { st.by = v; updateMeasures(); kick(); },
  });
  ui.depth.root.querySelector('output').hidden = true;
  ui.pierce = createButton({ labelKey: 'ctl.pierce', onClick: () => { st.pierced = !st.pierced; buildTab(); kick(); } });
  ui.empty = createButton({ labelKey: 'ctl.takeOut', onClick: () => { st.bx = 200; st.by = 112; st.tilt = 0; st.air = BOTTLE_FULL; buildTab(); kick(); } });
  ui.glass = createButton({ labelKey: 'ctl.refillGlass', onClick: () => { st.glassAir = 0; updateMeasures(); requestDraw(); } });
  ui.pierce.textContent = t(st.pierced ? 'ctl.unpierce' : 'ctl.pierce');
  ui.pierce.dataset.i18n = st.pierced ? 'ctl.unpierce' : 'ctl.pierce';
  controlsBody.append(ui.tilt.root, ui.depth.root, el('div', { class: 'btn-row' }, [ui.empty, ui.pierce, ui.glass]), resetRow(), hint('hint.air'));
  ui.dl = el('dl', { class: 'meas' });
  ui.status = statusBox();
  measuresBody.append(ui.dl, ui.status);
}
const pct = (a, full) => qty(Math.round((100 * a) / full), 0, '%');
function updateAir() {
  const st = S.air;
  if (st.air == null) st.air = BOTTLE_FULL;
  const b = bottleWorld(st);
  const under = Math.max(b.rimA[1], b.rimB[1]) > TANK.surface;
  ui.tilt?.set(st.tilt);
  ui.depth?.set(st.by);
  measRows(ui.dl, [
    [t('m.mouth'), t(under ? 'mouth.under' : 'mouth.out')],
    [t('m.airBottle'), pct(st.air, BOTTLE_FULL)],
    [t('m.waterBottle'), pct(BOTTLE_FULL - st.air, BOTTLE_FULL)],
    [t('m.airGlass'), pct(st.glassAir, GLASS_FULL)],
  ]);
  showStatus(ui.status, st.escaping > 0 ? { type: 'warn', key: st.pierced && !airLimit(st, b).at ? 'fb.airHole' : 'fb.bubbles' } : null);
}

/* ---------- Air has mass ---------- */
function zeroBalance() {
  const st = S.mass;
  st.tare = ballMass(st);
  st.fb = { type: '', key: 'fb.zeroed' };
  updateMeasures(); requestDraw();
}
function buildMass() {
  const st = S.mass;
  ui.mode = createSegmented({
    labelKey: 'ctl.massMode',
    options: [{ value: 'ball', labelKey: 'mode.ball' }, { value: 'flask', labelKey: 'mode.flask' }],
    value: st.mode,
    onChange: (v) => { st.mode = v; st.fb = null; buildTab(); shell.refreshActivity(); },
  });
  const items = [ui.mode.root];
  if (st.mode === 'ball') {
    ui.gas = createSegmented({
      labelKey: 'ctl.ballGas',
      options: [{ value: 'air', labelKey: 'gas.air' }, { value: 'butane', labelKey: 'gas.butane' }],
      value: st.gas,
      onChange: (v) => { st.gas = v; st.p = BALL.pFull; st.m1 = null; st.tare = 0; st.fb = null; updateMeasures(); requestDraw(); },
    });
    ui.out = createButton({ labelKey: 'ctl.letOut', variant: 'primary', onClick: () => {
      if (st.p <= BALL.pMin + 1e-6) { st.fb = { type: 'warn', key: 'fb.soft' }; updateMeasures(); return; }
      st.p = Math.max(BALL.pMin, st.p - BALL.step); st.puff = 1; st.fb = null; updateMeasures(); kick();
    } });
    ui.inflate = createButton({ labelKey: 'ctl.inflate', onClick: () => { st.p = BALL.pFull; st.fb = null; updateMeasures(); requestDraw(); } });
    ui.recM1 = createButton({ labelKey: 'ctl.recM1', variant: 'primary', onClick: () => {
      if (st.p < BALL.pFull - 1e-6) st.fb = { type: 'warn', key: 'fb.inflateFirst' };
      else { st.m1 = ballReading(st); st.fb = { type: 'good', key: 'fb.m1', params: { v: num(st.m1, 1) } }; }
      updateMeasures();
    } });
    ui.recM2 = createButton({ labelKey: 'ctl.recM2', variant: 'primary', onClick: () => {
      if (st.m1 == null) st.fb = { type: 'warn', key: 'fb.needM1' };
      else if (st.p > BALL.pFull - 1e-6) st.fb = { type: 'warn', key: 'fb.letOutFirst' };
      else {
        const m2 = ballReading(st);
        st.rows.push({ gas: st.gas, m1: st.m1, m2 });
        if (st.rows.length > 6) st.rows.shift();
        st.m1 = null;
        st.fb = { type: 'good', key: 'fb.m2', params: { v: num(m2, 1) } };
      }
      updateMeasures();
    } });
    items.push(ui.gas.root, el('div', { class: 'btn-row' }, [ui.out, ui.inflate]), el('div', { class: 'btn-row', style: 'margin-top:8px' }, [ui.recM1, ui.recM2]), resetRow(), hint('hint.zero'));
  } else {
    ui.fgas = createSegmented({
      labelKey: 'ctl.flaskGas',
      options: [{ value: 'air', labelKey: 'gas.air' }, { value: 'co2', labelKey: 'gas.co2' }],
      value: st.fgas,
      onChange: (v) => { st.fgas = v; updateMeasures(); kick(); },
    });
    ui.extra = createSegmented({
      labelKey: 'ctl.extra',
      options: [{ value: 'no', labelKey: 'extra.no' }, { value: 'yes', labelKey: 'extra.yes' }],
      value: st.extra ? 'yes' : 'no',
      onChange: (v) => { st.extra = v === 'yes'; updateMeasures(); kick(); },
    });
    items.push(ui.fgas.root, ui.extra.root, resetRow());
  }
  controlsBody.append(...items);
  ui.dl = el('dl', { class: 'meas' });
  ui.status = statusBox();
  measuresBody.append(ui.dl, ui.status);
  if (st.mode === 'ball') {
    ui.table = el('table', { class: 'data' });
    ui.clear = createButton({ labelKey: 'ctl.clearTable', onClick: () => { st.rows = []; st.fb = null; updateMeasures(); }, variant: 'ghost' });
    ui.clearRow = el('div', { class: 'btn-row', style: 'margin-top:8px' }, [ui.clear]);
    measuresBody.insertBefore(ui.table, ui.status);
    measuresBody.insertBefore(ui.clearRow, ui.status);
  }
}
function updateMass() {
  const st = S.mass;
  if (st.mode === 'ball') {
    measRows(ui.dl, [
      [t('m.ballGas'), t(`gas.${st.gas}`)],
      [t('m.ball'), t(st.p > BALL.pFull - 1e-6 ? 'ball.full' : st.p <= BALL.pMin + 1e-6 ? 'ball.soft' : 'ball.part')],
      [t('m.reading'), qty(ballReading(st), 1, 'g')],
      ['m1', st.m1 == null ? '—' : qty(st.m1, 1, 'g')],
    ]);
    const sig = calcSig(st.rows) + st.rows.length;
    if (ui.tableSig !== sig) {
      ui.tableSig = sig;
      const head = el('tr', {}, [el('th', {}, t('col.gas')), el('th', {}, 'm1 (g)'), el('th', {}, 'm2 (g)'), el('th', {}, `${t('col.out')} (g)`)]);
      const body = st.rows.map((r) => el('tr', {}, [
        el('td', {}, t(`gas.${r.gas}`)), el('td', {}, num(r.m1, 1)), el('td', {}, num(r.m2, 1)),
        calcCell(r, 'd', { expected: r.m1 - r.m2, decimals: 1, onCheck: (res) => {
          st.fb = res === 'invalid' ? { type: 'warn', key: 'calc.invalid' }
            : res === 'ok' ? { type: 'good', key: 'fb.calcOk', params: { d: num(r.m1 - r.m2, 1), gas: t(`gas.${r.gas}`) } }
              : { type: 'bad', key: 'fb.calcWrong', params: { m1: num(r.m1, 1), m2: num(r.m2, 1) } };
          updateMeasures();
        } }),
      ]));
      ui.table.replaceChildren(el('thead', {}, head), el('tbody', {}, body));
    }
    ui.table.hidden = st.rows.length === 0;
    ui.clearRow.hidden = ui.table.hidden;
  } else {
    const d = beamTarget(st);
    const state = Math.abs(d) < 0.01 ? 'eq' : d > 0 ? 'right' : 'left';
    measRows(ui.dl, [
      [t('m.leftPan'), st.extra ? `M + ${qty(FLASK.extra, 1, 'g')}` : 'M'],
      [t('m.rightPan'), t(`flask.${st.fgas}`)],
      [t('m.beam'), t(`beam.${state}`), state === 'eq' ? 'good-text' : 'warn-text'],
    ]);
  }
  showStatus(ui.status, st.fb);
}

function updateMeasures() {
  if (!shell || !ui.dl) return;
  if (shell.tab === 'syringe') updateSyringe();
  else if (shell.tab === 'air') updateAir();
  else updateMass();
}
function buildTab() {
  loop.stop();
  controlsBody.replaceChildren();
  measuresBody.replaceChildren();
  ui = {};
  if (shell.tab === 'syringe') buildSyringe();
  else if (shell.tab === 'air') buildAir();
  else buildMass();
  updateMeasures();
  kick();
}
function resetTab() {
  const keep = shell.tab === 'mass' ? S.mass.mode : shell.tab === 'syringe' ? S.syringe.content : null;
  S[shell.tab] = initialState(shell.tab);
  if (shell.tab === 'mass') S.mass.mode = keep;
  if (shell.tab === 'syringe') { S.syringe.content = keep; S.syringe.open = keep === 'air'; }
  buildTab();
}
onLangChange(() => { if (shell) buildTab(); });

shell = initSim({
  strings,
  tabs: [{ id: 'syringe', labelKey: 'tab.syringe' }, { id: 'air', labelKey: 'tab.air' }, { id: 'mass', labelKey: 'tab.mass' }],
  initialTab: 'syringe',
  onTab: buildTab,
  activityKey: (tab) => (tab === 'syringe' ? `act.syringe.${S.syringe.content === 'air' ? 'air' : 'water'}` : tab === 'mass' ? `act.mass.${S.mass.mode}` : 'act.air'),
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, cur: () => cur(), ballReading, beamTarget, bottleWorld, airLimit, BOTTLE_FULL };
