// Grade 7 — Coils (Ch.15 Act. 1–5, Ex. 4–7) — not required in 2026–2027
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num } from '../../../shared/format.js';
import { createButton, createSegmented, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, font, arrow } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { label } from '../../../shared/figures.js';
import { drawSwitch, drawCurrentArrows, labelI, arrowHead, drawDryCell } from '../../../shared/circuit-draw.js';
import { poleField, barPoles, drawBar, drawCompass } from '../../../shared/magnet-draw.js';

const SCENE = { w: 600, h: 440 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const E = 6; // V — the dry cell of the book (Act. 5); ideal, keeps 6.00 V (owner, 29 Oct 2026)
const EARTH = 0.00004; // field of the Earth, towards the north (up on the drawings)

/* ================================================================
   Model
   A coil carrying a current = a magnet: its two faces are a "north" and a "south" pole charge
   (±q at the two faces, q ∝ current). s = +1: the right face is the north face.
   ================================================================ */
function coilPoles(x0, x1, y, s, q, out) {
  out.push({ x: x1 - 4, y, q: s * q }, { x: x0 + 4, y, q: -s * q });
  return out;
}

function initialState() {
  return {
    coil: { closed: false, rev: false, answer: null, fb: null, comps: [{ x: 120, y: 170, a: -Math.PI / 2, w: 0 }, { x: 480, y: 170, a: -Math.PI / 2, w: 0 }] },
    emag: { closed: false, rev: false, pins: 0, falling: [], comp: { x: 430, y: 95, a: -Math.PI / 2, w: 0 } },
    alt: { what: 'coil', speed: 0, phi: 0, i: 0, imax: 0, imaxT: 0 },
    motor: { closed: false, phi: Math.PI / 2, w: 0, flips: 0, s: 1 },
    two: { closed1: true, closed2: true, rev1: false, rev2: false, x2: 400, v2: 0 },
  };
}
let S = initialState();

/* ================================================================
   Canvas
   ================================================================ */
let shell;
const canvas = document.getElementById('stage');
const view = setupCanvas(canvas, { width: SCENE.w, height: SCENE.h, maxHeightVh: () => (window.innerWidth < 880 ? 52 : 76), onResize: () => draw() });
onThemeChange(() => draw());
let clock = 0;
const tmp = { bx: 0, by: 0 };

function draw() {
  if (!shell) return;
  const ctx = view.begin();
  ctx.fillStyle = cssVar('--board'); roundRect(ctx, 6, 6, SCENE.w - 12, SCENE.h - 12, 14); ctx.fill();
  ({ coil: drawCoilTab, emag: drawEmag, alt: drawAlt, motor: drawMotor, two: drawTwo })[shell.tab](ctx);
}

function wire(ctx, pts) {
  ctx.strokeStyle = cssVar('--wire'); ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(...pts[0]); for (const p of pts.slice(1)) ctx.lineTo(...p); ctx.stroke();
}
function northArrow(ctx, x, y) {
  ctx.strokeStyle = cssVar('--text'); ctx.fillStyle = cssVar('--text'); ctx.lineWidth = 2;
  arrow(ctx, x, y + 30, x, y - 10, 9);
  label(ctx, t('lbl.north'), x, y - 22, { size: 12, weight: 800 });
}
// Coil seen from the side, axis horizontal, from x0 to x1, radius r. s: sense of the current (0: no current).
// Front halves of the turns carry small arrows: downward when s = +1 (right face north).
function drawCoil(ctx, x0, x1, y, r, s, { turns = 9, core = null } = {}) {
  const dx = (x1 - x0) / (turns - 1), rx = Math.min(7, dx * 0.45);
  ctx.lineWidth = 3.2;
  ctx.strokeStyle = cssVar('--copper'); ctx.globalAlpha = 0.45;
  for (let k = 0; k < turns; k++) { const x = x0 + k * dx; ctx.beginPath(); ctx.ellipse(x, y, rx, r, 0, Math.PI / 2, (3 * Math.PI) / 2); ctx.stroke(); }
  ctx.globalAlpha = 1;
  if (core) core();
  ctx.strokeStyle = cssVar('--copper');
  for (let k = 0; k < turns; k++) { const x = x0 + k * dx; ctx.beginPath(); ctx.ellipse(x, y, rx, r, 0, -Math.PI / 2, Math.PI / 2); ctx.stroke(); }
  if (s) { ctx.fillStyle = cssVar('--current'); for (let k = 1; k < turns; k += 2) arrowHead(ctx, x0 + k * dx + rx, y, s > 0 ? Math.PI / 2 : -Math.PI / 2); }
}
function faceLetters(ctx, x0, x1, y, r) {
  label(ctx, t('lbl.faceL'), x0, y - r - 16, { size: 11, weight: 800, color: cssVar('--muted') });
  label(ctx, t('lbl.faceR'), x1, y - r - 16, { size: 11, weight: 800, color: cssVar('--muted') });
}
function stepCompass(c, poles, dt) {
  poleField(poles, c.x, c.y, tmp);
  const target = Math.atan2(tmp.by - EARTH, tmp.bx);
  const d = Math.atan2(Math.sin(c.a - target), Math.cos(c.a - target));
  c.w += (-30 * Math.sin(d) - 5 * c.w) * dt;
  c.a += c.w * dt;
}

// Small switch on a vertical wire: terminals at (x, y0) (top) and (x, y1) (bottom); the lever pivots at the bottom.
function smallSwitch(ctx, x, y0, y1, closed) {
  ctx.fillStyle = cssVar('--socket'); roundRect(ctx, x - 9, y0 - 4, 18, y1 - y0 + 8, 4); ctx.fill();
  ctx.fillStyle = cssVar('--pan-metal'); ctx.beginPath(); ctx.arc(x, y0, 3.5, 0, Math.PI * 2); ctx.arc(x, y1, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = cssVar('--lever'); ctx.lineWidth = 5; ctx.lineCap = 'round';
  const L = y1 - y0, a = closed ? 0 : 0.7;
  ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x + Math.sin(a) * L, y1 - Math.cos(a) * L); ctx.stroke();
}

/* ---------- Tab 1: the coil behaves as a magnet (Act. 1, Ex. 4–5) ---------- */
const C1 = { x0: 220, x1: 380, y: 170, r: 46 };
// Current leaves the + terminal. Normal: + on the left → enters the coil by its left lead → right face north.
const coilSense = (st) => (st.closed ? (st.rev ? -1 : 1) : 0);
function coilTabPoles(st) { const p = []; const s = coilSense(st); if (s) coilPoles(C1.x0, C1.x1, C1.y, s, 1.4, p); return p; }
const PATH1_L = [[150, 380], [100, 380], [100, 320], [C1.x0 + 6, 320], [C1.x0 + 6, C1.y + C1.r]];
const PATH1_R = [[C1.x1 - 6, C1.y + C1.r], [C1.x1 - 6, 320], [520, 320], [520, 380], [482, 380]];
function drawCoilTab(ctx) {
  const st = S.coil, s = coilSense(st);
  wire(ctx, PATH1_L); wire(ctx, PATH1_R); wire(ctx, [[250, 380], [358, 380]]);
  drawCoil(ctx, C1.x0, C1.x1, C1.y, C1.r, s);
  faceLetters(ctx, C1.x0, C1.x1, C1.y, C1.r);
  drawSwitch(ctx, { x: 200, y: 380, open: !st.closed });
  drawDryCell(ctx, 420, 380, `${num(E, 0)} V`, 0, st.rev);
  if (s) {
    // conventional current: leaves the + terminal, goes round the circuit, comes back to the − terminal
    const a = [[358, 380], [250, 380], ...PATH1_L];
    const ph = clock * 60;
    if (s > 0) { drawCurrentArrows(ctx, a, ph); drawCurrentArrows(ctx, PATH1_R, ph); labelI(ctx, 84, 350, -Math.PI / 2); }
    else { drawCurrentArrows(ctx, PATH1_R.slice().reverse(), ph); drawCurrentArrows(ctx, a.slice().reverse(), ph); labelI(ctx, 84, 350, Math.PI / 2); }
  }
  for (const c of st.comps) drawCompass(ctx, c.x, c.y, c.a, 26);
  northArrow(ctx, 540, 60);
  label(ctx, t('lbl.coil'), 300, 102, { size: 12, weight: 800 });
}
function stepCoilTab(dt) { const st = S.coil, p = coilTabPoles(st); for (const c of st.comps) stepCompass(c, p, dt); }

/* ---------- Tab 2: the electromagnet (Act. 2, Ex. 3–4) ---------- */
const NAIL = { x: 300, y0: 70, y1: 260 };
const PINS_MAX = 14;
const emagSense = (st) => (st.closed ? (st.rev ? -1 : 1) : 0);
function drawEmag(ctx) {
  const st = S.emag, s = emagSense(st);
  // pile of pins on the table
  ctx.fillStyle = cssVar('--wood'); ctx.fillRect(170, 352, 260, 8);
  ctx.strokeStyle = cssVar('--metal'); ctx.lineWidth = 1.4;
  for (let i = 0; i < 46; i++) { const x = 235 + ((i * 37) % 130), y = 338 + ((i * 13) % 13); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 15 * Math.cos(i * 1.7), y + 4 * Math.sin(i * 1.7)); ctx.stroke(); }
  label(ctx, t('lbl.pins'), 400, 370, { size: 11, weight: 700 });
  // pins held by the tip (a hanging bunch), and pins falling
  const n = Math.round(st.pins);
  for (let i = 0; i < n; i++) {
    const a = (i - (PINS_MAX - 1) / 2) * 0.09, len = 16 + (i % 3) * 3;
    const x = NAIL.x + Math.sin(a) * 4, y = NAIL.y1 + 4 + (i % 4) * 7;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.sin(a) * len, y + Math.cos(a) * len); ctx.stroke();
  }
  for (const f of st.falling) { ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x + Math.sin(f.a) * 16, f.y + Math.cos(f.a) * 16); ctx.stroke(); }
  // nail (vertical, tip down) with the coil wound on it
  ctx.save(); ctx.translate(NAIL.x, (NAIL.y0 + NAIL.y1) / 2); ctx.rotate(Math.PI / 2);
  const half = (NAIL.y1 - NAIL.y0) / 2;
  drawCoil(ctx, -half + 34, half - 34, 0, 24, s, {
    turns: 13,
    core: () => {
      ctx.fillStyle = cssVar('--metal'); ctx.fillRect(-half, -6, 2 * half - 12, 12);
      ctx.beginPath(); ctx.moveTo(half - 12, -6); ctx.lineTo(half, 0); ctx.lineTo(half - 12, 6); ctx.closePath(); ctx.fill();
      ctx.fillRect(-half - 4, -14, 8, 28);
    },
  });
  ctx.restore();
  label(ctx, t('lbl.nail'), NAIL.x + 62, NAIL.y0 + 18, { size: 12, weight: 800 });
  // circuit: + (318) → switch (260…160) → left wire → top lead → coil → bottom lead → back to − (442)
  const top = [NAIL.x - 24, NAIL.y0 + 34], bot = [NAIL.x + 24, NAIL.y1 - 34];
  const A = [[318, 410], [260, 410], [160, 410], [60, 410], [60, top[1]], top];
  const B = [bot, [520, bot[1]], [520, 410], [442, 410]];
  wire(ctx, A.slice(0, 2)); wire(ctx, A.slice(2)); wire(ctx, B);
  drawSwitch(ctx, { x: 210, y: 410, open: !st.closed });
  drawDryCell(ctx, 380, 410, `${num(E, 0)} V`, 0, st.rev);
  if (s) {
    const ph = clock * 60;
    if (s > 0) { drawCurrentArrows(ctx, A, ph); drawCurrentArrows(ctx, B, ph); labelI(ctx, 44, 250, -Math.PI / 2); }
    else { drawCurrentArrows(ctx, B.slice().reverse(), ph); drawCurrentArrows(ctx, A.slice().reverse(), ph); labelI(ctx, 44, 250, Math.PI / 2); }
  }
  drawCompass(ctx, st.comp.x, st.comp.y, st.comp.a, 24);
  label(ctx, t('lbl.compass'), st.comp.x, st.comp.y + 38, { size: 11, color: cssVar('--muted') });
}
function emagPoles(st) {
  const p = [], s = emagSense(st);
  // nail axis is vertical: head at the top (y0), tip at the bottom (y1). s = +1: the tip is north.
  if (s) p.push({ x: NAIL.x, y: NAIL.y1, q: 3 * s }, { x: NAIL.x, y: NAIL.y0, q: -3 * s });
  return p;
}
function stepEmag(dt) {
  const st = S.emag;
  if (st.closed) st.pins = Math.min(PINS_MAX, st.pins + dt * 30);
  else if (st.pins > 0) {
    for (let i = 0; i < Math.round(st.pins); i++) st.falling.push({ x: NAIL.x + (i - 7) * 3, y: NAIL.y1 + 8 + (i % 4) * 7, v: 0, a: (i - 7) * 0.2 });
    st.pins = 0;
  }
  for (const f of st.falling) { f.v += 900 * dt; f.y += f.v * dt; }
  st.falling = st.falling.filter((f) => f.y < 330);
  stepCompass(st.comp, emagPoles(st), dt);
}

/* ---------- Tab 3: alternator and bicycle generator (Act. 3–4) ---------- */
// flux through the coil ∝ cos φ → i = I0 · (turns per second) · sin φ  (illustrative values)
const I0 = 4; // mA per turn/s
const ALT = { cx: 330, cy: 190, W: 120, H: 140 };
function drawAnalogA(ctx, x, y, i, max = 10) {
  // centre-zero ammeter (the needle swings both ways: the current changes direction)
  ctx.fillStyle = cssVar('--meter-body'); ctx.strokeStyle = cssVar('--meter-a'); ctx.lineWidth = 2.5;
  roundRect(ctx, x - 70, y - 60, 140, 92, 10); ctx.fill(); ctx.stroke();
  ctx.fillStyle = cssVar('--lcd-bg'); roundRect(ctx, x - 60, y - 52, 120, 64, 6); ctx.fill();
  ctx.strokeStyle = '#333'; ctx.fillStyle = '#333'; ctx.lineWidth = 1.2; ctx.font = font(10, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const cy = y + 6, R = 48;
  for (let k = -max; k <= max; k += 1) {
    const a = -Math.PI / 2 + (k / max) * 0.95;
    const r1 = k % 5 === 0 ? R - 10 : R - 6;
    ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r1, cy + Math.sin(a) * r1); ctx.lineTo(x + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.stroke();
    if (k % 5 === 0) ctx.fillText(num(k, 0), x + Math.cos(a) * (R - 18), cy + Math.sin(a) * (R - 18));
  }
  ctx.font = font(12, 800); ctx.fillText('mA', x, y + 22);
  const a = -Math.PI / 2 + clamp(i / max, -1.05, 1.05) * 0.95;
  ctx.strokeStyle = cssVar('--bad'); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, cy); ctx.lineTo(x + Math.cos(a) * (R - 4), cy + Math.sin(a) * (R - 4)); ctx.stroke();
  ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(x, cy, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = cssVar('--meter-a'); roundRect(ctx, x - 14, y - 70, 28, 18, 9); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = font(13, 800); ctx.fillText('A', x, y - 61);
}
// Rectangular coil turning about a vertical axis: seen with a width W·cos φ
function drawFlatCoil(ctx, cx, cy, W, H, phi, s, { side1 = true } = {}) {
  const c = Math.cos(phi), half = (W / 2) * c;
  ctx.strokeStyle = cssVar('--copper'); ctx.lineWidth = 5; ctx.lineJoin = 'round';
  ctx.globalAlpha = 0.9;
  ctx.strokeRect(cx - Math.abs(half), cy - H / 2, 2 * Math.abs(half) || 1, H);
  ctx.globalAlpha = 1;
  // side 1 (marked) is at −W/2 in the frame of the coil
  if (side1) { ctx.strokeStyle = cssVar('--side1'); ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(cx - half, cy - H / 2); ctx.lineTo(cx - half, cy + H / 2); ctx.stroke(); }
  if (s && Math.abs(c) > 0.15) {
    ctx.fillStyle = cssVar('--current');
    arrowHead(ctx, cx - half, cy, s > 0 ? -Math.PI / 2 : Math.PI / 2); // side 1: up when s > 0
    arrowHead(ctx, cx + half, cy, s > 0 ? Math.PI / 2 : -Math.PI / 2);
  }
}
function drawAlt(ctx) {
  const st = S.alt, { cx, cy, W, H } = ALT;
  // axis
  ctx.strokeStyle = cssVar('--metal'); ctx.lineWidth = 4;
  if (st.what === 'coil') {
    ctx.beginPath(); ctx.moveTo(cx, cy - H / 2 - 30); ctx.lineTo(cx, cy + H / 2 + 40); ctx.stroke();
    // fixed magnet in front of the coil (left)
    drawBar(ctx, 140, cy, 0, 150, 34);
    drawFlatCoil(ctx, cx, cy, W, H, st.phi, 0, { side1: false });
    label(ctx, t('lbl.magnetFixed'), 140, cy + 42, { size: 11, color: cssVar('--muted') });
    label(ctx, t('lbl.coilTurns'), cx, cy - H / 2 - 42, { size: 12, weight: 800 });
  } else {
    // bicycle generator: the magnet turns (on the axis of the pebble), the coil is fixed
    const mx = 190;
    ctx.beginPath(); ctx.moveTo(mx, cy - 110); ctx.lineTo(mx, cy + 100); ctx.stroke();
    ctx.fillStyle = cssVar('--box'); roundRect(ctx, mx - 16, cy - 132, 32, 24, 6); ctx.fill();
    label(ctx, t('lbl.pebble'), mx, cy - 146, { size: 11, color: cssVar('--muted') });
    const c = Math.cos(st.phi);
    const L = 150 * Math.abs(c) + 10;
    drawBar(ctx, mx, cy, c >= 0 ? 0 : Math.PI, L, 34, { labels: Math.abs(c) > 0.3 });
    label(ctx, t('lbl.magnetTurns'), mx, cy + 42 + 70, { size: 12, weight: 800 });
    // fixed coil (side view, axis horizontal) on the right of the magnet
    drawCoil(ctx, 300, 400, cy, 40, 0, { turns: 9, core: () => { ctx.fillStyle = cssVar('--metal'); ctx.fillRect(296, cy - 10, 108, 20); } });
    label(ctx, t('lbl.coilFixed'), 350, cy - 64, { size: 11, color: cssVar('--muted') });
  }
  // leads to the ammeter
  const ax = 470, ay = 360;
  const l1 = st.what === 'coil' ? [cx - 8, cy + H / 2 + 40] : [306, cy + 40];
  const l2 = st.what === 'coil' ? [cx + 8, cy + H / 2 + 40] : [394, cy + 40];
  if (st.what === 'coil') { ctx.fillStyle = cssVar('--pan-metal'); ctx.fillRect(cx - 10, cy + H / 2 + 6, 20, 10); ctx.fillRect(cx - 10, cy + H / 2 + 22, 20, 10); }
  wire(ctx, [l1, [l1[0], 410], [ax - 40, 410], [ax - 40, ay + 32]]);
  wire(ctx, [l2, [l2[0], 395], [ax + 40, 395], [ax + 40, ay + 32]]);
  drawAnalogA(ctx, ax, ay - 20, st.i);
  if (Math.abs(st.i) > 0.3) labelI(ctx, ax - 58, 410 - 14, st.i > 0 ? 0 : Math.PI);
}
function stepAlt(dt) {
  const st = S.alt;
  const w = 2 * Math.PI * st.speed;
  st.phi += w * dt;
  st.i = I0 * st.speed * Math.sin(st.phi);
  st.imaxT += dt;
  if (Math.abs(st.i) > st.imax) st.imax = Math.abs(st.i);
  if (st.speed === 0) st.imax = 0;
}

/* ---------- Tab 4: the simple electric motor (Act. 5) ---------- */
// Coil turning about a vertical axis between the poles N (left) and S (right) of a U-shaped magnet.
// φ: angle between the plane of the coil and the plane of the picture. The torque is largest when the coil
// is seen face on (cos φ = ±1) and zero when it is edge on (facing the poles). The commutator reverses the
// current each time the coil is edge on, so the torque always turns the coil in the same direction.
const MOT = { cx: 300, cy: 170, W: 150, H: 140, k: 55, b: 4.5, fr: 1.5 };
const MS = { y0: 376, y1: 404 }; // small switch of the motor (x = 200)
const motorSense = (st) => (Math.cos(st.phi) >= 0 ? 1 : -1);
function drawMotor(ctx) {
  const st = S.motor, { cx, cy, W, H } = MOT;
  const on = st.closed;
  // U-shaped magnet: base behind, then the two poles
  ctx.fillStyle = cssVar('--metal'); ctx.fillRect(110, 262, 380, 28);
  ctx.fillStyle = cssVar('--mag-n'); ctx.fillRect(110, 80, 70, 210);
  ctx.fillStyle = cssVar('--mag-s'); ctx.fillRect(420, 80, 70, 210);
  ctx.fillStyle = '#fff'; ctx.font = font(26, 800); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('N', 145, 170); ctx.fillText('S', 455, 170);
  label(ctx, t('lbl.uMagnet'), 145, 304, { size: 11, color: cssVar('--muted') });
  // axis
  ctx.strokeStyle = cssVar('--wood'); ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(cx, 70); ctx.lineTo(cx, 350); ctx.stroke();
  drawFlatCoil(ctx, cx, cy, W, H, st.phi, on ? motorSense(st) : 0);
  // commutator (two bare ends on the tube) and the two brushes
  const ky = 330, kr = 16;
  ctx.fillStyle = cssVar('--box'); ctx.fillRect(cx - kr, ky - 14, 2 * kr, 28);
  ctx.fillStyle = cssVar('--copper');
  const sp = Math.sin(st.phi) * kr; // the gap between the two bare ends turns with the coil
  ctx.fillRect(cx - kr, ky - 10, kr + sp - 2, 20); ctx.fillStyle = cssVar('--side1'); ctx.fillRect(cx + sp + 2, ky - 10, kr - sp - 2, 20);
  ctx.strokeStyle = cssVar('--pan-metal'); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(cx - kr - 2, ky); ctx.lineTo(cx - 50, ky + 36); ctx.moveTo(cx + kr + 2, ky); ctx.lineTo(cx + 50, ky + 36); ctx.stroke();
  label(ctx, t('lbl.commutator'), cx, ky - 24, { size: 10, weight: 700, color: cssVar('--muted') });
  label(ctx, t('lbl.brushes'), cx + 92, ky + 18, { size: 10, weight: 700, color: cssVar('--muted') });
  // circuit: cell + → switch → left brush → coil → right brush → cell −
  const yb = ky + 36, yc = 404;
  const A = [[cx - 62, yc], [200, yc], [200, MS.y1]];
  const B = [[200, MS.y0], [200, yb], [cx - 50, yb]];
  const C = [[cx + 50, yb], [400, yb], [400, yc], [cx + 62, yc]];
  wire(ctx, A); wire(ctx, B); wire(ctx, C);
  smallSwitch(ctx, 200, MS.y0, MS.y1, on);
  drawDryCell(ctx, cx, yc, `${num(E, 0)} V`);
  if (on) {
    const ph = clock * 60;
    drawCurrentArrows(ctx, A, ph); drawCurrentArrows(ctx, B, ph); drawCurrentArrows(ctx, C, ph);
    labelI(ctx, 182, yb + 2, -Math.PI / 2);
  }
  label(ctx, t('lbl.side1'), cx - (W / 2) * Math.cos(st.phi), cy - H / 2 - 14, { size: 11, weight: 800, color: cssVar('--side1') });
}
function stepMotor(dt) {
  const st = S.motor;
  const s = motorSense(st);
  if (s !== st.s) { if (st.closed) st.flips += 1; st.s = s; }
  const tau = st.closed ? MOT.k * Math.abs(Math.cos(st.phi)) : 0;
  let a = tau - MOT.b * st.w;
  if (Math.abs(st.w) < 0.05 && tau < MOT.fr) { st.w = 0; a = 0; } else a -= Math.sign(st.w) * MOT.fr;
  st.w += a * dt;
  st.phi = (st.phi + st.w * dt) % (2 * Math.PI);
}

/* ---------- Tab 5: two coils on a wooden rod (Ex. 7) ---------- */
const TW = { y: 190, L: 110, r: 38, x1: 190 };
const twoSense = (closed, rev) => (closed ? (rev ? -1 : 1) : 0);
function twoPoles(st) {
  const p = [], s1 = twoSense(st.closed1, st.rev1), s2 = twoSense(st.closed2, st.rev2);
  if (s1) coilPoles(TW.x1 - TW.L / 2, TW.x1 + TW.L / 2, TW.y, s1, 1, p); else p.push({ x: 0, y: 0, q: 0 }, { x: 0, y: 0, q: 0 });
  if (s2) coilPoles(st.x2 - TW.L / 2, st.x2 + TW.L / 2, TW.y, s2, 1, p); else p.push({ x: 0, y: 0, q: 0 }, { x: 0, y: 0, q: 0 });
  return p;
}
function forceOn2(st) {
  const p = twoPoles(st);
  let F = 0;
  for (const a of p.slice(2)) for (const b of p.slice(0, 2)) { const dx = a.x - b.x; F += (a.q * b.q * Math.sign(dx)) / (dx * dx + 30); }
  return F; // > 0: B2 pushed to the right (repulsion)
}
function drawCircuitUnder(ctx, xc, s, closed, rev, name) {
  const x0 = xc - TW.L / 2 + 6, x1 = xc + TW.L / 2 - 6, yb = TW.y + TW.r;
  // + on the left (normal) → the current enters by the left lead → right face north (s = +1)
  wire(ctx, [[x0, yb], [x0, 300], [xc - 92, 300], [xc - 92, 330]]);
  wire(ctx, [[x1, yb], [x1, 300], [xc + 92, 300], [xc + 92, 400], [xc + 62, 400]]);
  wire(ctx, [[xc - 92, 366], [xc - 92, 400], [xc - 62, 400]]);
  drawDryCell(ctx, xc, 400, `${num(E, 0)} V`, 0, rev);
  smallSwitch(ctx, xc - 92, 330, 366, closed);
  label(ctx, name, xc, TW.y - TW.r - 20, { size: 14, weight: 800 });
  if (s) {
    const ph = clock * 60;
    const a = [[xc - 62, 400], [xc - 92, 400], [xc - 92, 300], [x0, 300], [x0, yb]];
    const b = [[x1, yb], [x1, 300], [xc + 92, 300], [xc + 92, 400], [xc + 62, 400]];
    if (s > 0) { drawCurrentArrows(ctx, a, ph); drawCurrentArrows(ctx, b, ph); } else { drawCurrentArrows(ctx, b.slice().reverse(), ph); drawCurrentArrows(ctx, a.slice().reverse(), ph); }
  }
}
function drawTwo(ctx) {
  const st = S.two;
  const s1 = twoSense(st.closed1, st.rev1), s2 = twoSense(st.closed2, st.rev2);
  // wooden rod
  ctx.fillStyle = cssVar('--wood'); ctx.fillRect(40, TW.y - 6, 520, 12);
  drawCoil(ctx, TW.x1 - TW.L / 2, TW.x1 + TW.L / 2, TW.y, TW.r, s1, { turns: 8 });
  drawCoil(ctx, st.x2 - TW.L / 2, st.x2 + TW.L / 2, TW.y, TW.r, s2, { turns: 8 });
  drawCircuitUnder(ctx, TW.x1, s1, st.closed1, st.rev1, 'B1');
  drawCircuitUnder(ctx, st.x2, s2, st.closed2, st.rev2, 'B2');
  const F = forceOn2(st), gap = st.x2 - TW.x1 - TW.L;
  if (s1 && s2 && gap < 160) label(ctx, t(F < 0 ? 'lbl.attract' : 'lbl.repel'), (TW.x1 + st.x2) / 2, 60, { size: 16, weight: 800, color: F < 0 ? cssVar('--good') : cssVar('--bad') });
  label(ctx, t('lbl.rod'), 520, TW.y - 20, { size: 11, color: cssVar('--muted') });
}
function stepTwo(dt) {
  const st = S.two;
  const F = forceOn2(st);
  const a = Math.abs(F) > 0.0006 ? F * 9e5 : 0;
  st.v2 = (st.v2 + a * dt) * Math.exp(-dt * 3);
  st.x2 += st.v2 * dt;
  const min = TW.x1 + TW.L + 2;
  if (st.x2 < min) { st.x2 = min; st.v2 = 0; }
  if (st.x2 > 470) { st.x2 = 470; st.v2 = 0; }
}

/* ================================================================
   Loop and pointer
   ================================================================ */
let measT = 0;
const loop = createLoop({
  dt: 1 / 120,
  step: (dt) => {
    clock += dt;
    if (!shell) return true;
    ({ coil: stepCoilTab, emag: stepEmag, alt: stepAlt, motor: stepMotor, two: stepTwo })[shell.tab](dt);
    measT += dt;
    return true;
  },
  render: () => { draw(); if (measT > 0.15) { measT = 0; updateMeasures(); } },
});

let drag = null;
canvas.addEventListener('pointerdown', (ev) => {
  const p = view.toLogical(ev), tab = shell.tab;
  const comps = tab === 'coil' ? S.coil.comps : tab === 'emag' ? [S.emag.comp] : [];
  const c = comps.find((cc) => Math.hypot(cc.x - p.x, cc.y - p.y) < 32);
  if (c) drag = { c, dx: c.x - p.x, dy: c.y - p.y };
  else if (tab === 'coil' && Math.abs(p.x - 200) < 64 && Math.abs(p.y - 360) < 50) { S.coil.closed = !S.coil.closed; S.coil.fb = null; buildTab('coil'); }
  else if (tab === 'emag' && Math.abs(p.x - 210) < 64 && Math.abs(p.y - 380) < 50) { S.emag.closed = !S.emag.closed; buildTab('emag'); }
  else if (tab === 'motor' && Math.abs(p.x - 200) < 34 && Math.abs(p.y - 390) < 34) { S.motor.closed = !S.motor.closed; buildTab('motor'); }
  if (drag) { canvas.setPointerCapture(ev.pointerId); ev.preventDefault(); }
});
canvas.addEventListener('pointermove', (ev) => {
  if (!drag) return;
  const p = view.toLogical(ev);
  drag.c.x = clamp(p.x + drag.dx, 30, 570); drag.c.y = clamp(p.y + drag.dy, 30, 300);
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
function showStatus(fb) {
  if (!ui.status) return;
  if (!fb) { ui.status.hidden = true; return; }
  ui.status.hidden = false; ui.status.className = `status ${fb.type || ''}`; ui.status.textContent = t(fb.key, fb.params);
}
function measRows(rows) {
  const sig = JSON.stringify(rows);
  if (ui.dlSig === sig) return;
  ui.dlSig = sig;
  ui.dl.replaceChildren(...rows.flatMap(([k, v, cls]) => [el('dt', {}, k), el('dd', cls ? { class: cls } : {}, v)]));
}
function panel(controls) {
  controlsBody.append(...controls.filter(Boolean).map((c) => c.root ?? c));
  ui.dl = el('dl', { class: 'meas' });
  ui.status = el('div', { class: 'status', hidden: '' });
  measuresBody.append(ui.dl, ui.status);
}
const seg = (labelKey, values, prefix, value, onChange) => createSegmented({ labelKey, options: values.map((v) => ({ value: v, labelKey: `${prefix}.${v}` })), value, onChange });
const btn = (k, f, v) => createButton({ labelKey: k, onClick: f, variant: v });
const row = (...c) => el('div', { class: 'btn-row' }, c.filter(Boolean));
const resetBtn = (id) => btn('ui.reset', () => { S[id] = initialState()[id]; buildTab(id); }, 'ghost');
const circuitSeg = (st, key = 'closed', labelKey = 'ctl.circuit', extra) => seg(labelKey, ['open', 'closed'], 'circ', st[key] ? 'closed' : 'open', (v) => { st[key] = v === 'closed'; if (extra) extra(); });
const pointsNorth = (c) => { const d = Math.atan2(Math.sin(c.a + Math.PI / 2), Math.cos(c.a + Math.PI / 2)); return Math.abs(d) < 0.12; };

function buildCoil() {
  const st = S.coil;
  panel([
    circuitSeg(st, 'closed', 'ctl.circuit', () => { st.fb = null; }),
    row(btn('ctl.reverse', () => { st.rev = !st.rev; st.fb = null; st.answer = null; buildTab('coil'); })),
    seg('ctl.faceR', ['N', 'S'], 'face', st.answer, (v) => { st.answer = v; }),
    row(btn('ctl.check', () => {
      if (!st.closed) st.fb = { type: 'warn', key: 'fb.closeFirst' };
      else if (!st.answer) st.fb = { type: 'warn', key: 'fb.choose' };
      else st.fb = (st.answer === 'N') === (coilSense(st) > 0) ? { type: 'good', key: 'fb.faceOk' } : { type: 'bad', key: 'fb.faceWrong' };
      updateMeasures();
    }, 'primary'), resetBtn('coil')),
  ]);
}
function updateCoil() {
  const st = S.coil;
  const dev = st.comps.some((c) => !pointsNorth(c));
  measRows([
    [t('m.circuit'), t(st.closed ? 'circ.closed' : 'circ.open')],
    [t('m.cell'), t(st.rev ? 'cell.rev' : 'cell.normal')],
    [t('m.current'), t(st.closed ? 'opt.yes' : 'opt.no')],
    [t('m.needles'), t(dev ? 'nd.deviate' : 'nd.north'), dev ? 'good-text' : ''],
  ]);
  showStatus(st.fb);
}

function buildEmag() {
  const st = S.emag;
  panel([circuitSeg(st), row(btn('ctl.reverse', () => { st.rev = !st.rev; buildTab('emag'); }), resetBtn('emag'))]);
}
function updateEmag() {
  const st = S.emag, n = Math.round(st.pins);
  measRows([
    [t('m.circuit'), t(st.closed ? 'circ.closed' : 'circ.open')],
    [t('m.cell'), t(st.rev ? 'cell.rev' : 'cell.normal')],
    [t('m.pinsHeld'), String(n)],
    [t('m.nailIs'), t(n > 0 ? 'nl.magnet' : 'nl.not'), n > 0 ? 'good-text' : ''],
  ]);
  showStatus(null);
}

function buildAlt() {
  const st = S.alt;
  panel([
    seg('ctl.what', ['coil', 'magnet'], 'what', st.what, (v) => { S.alt = { ...initialState().alt, what: v, speed: st.speed }; shell.refreshActivity(); buildTab('alt'); }),
    seg('ctl.speed', ['0', '1', '2'], 'spd', String(st.speed), (v) => { st.speed = Number(v); st.imax = 0; }),
    row(resetBtn('alt')),
  ]);
}
function updateAlt() {
  const st = S.alt;
  measRows([
    [t(st.what === 'coil' ? 'm.coilRot' : 'm.magRot'), st.speed ? t('rot.yes', { n: num(st.speed, 0) }) : t('rot.no')],
    [t('m.ammeter'), st.speed ? t('am.current') : t('am.zero'), st.speed ? 'good-text' : ''],
    [t('m.imax'), `${num(st.imax, 1)} mA`],
  ]);
  showStatus(null);
}

function buildMotor() {
  const st = S.motor;
  panel([circuitSeg(st), row(btn('ctl.push', () => { st.w += 4; }, 'primary'), resetBtn('motor'))]);
}
function updateMotor() {
  const st = S.motor;
  const rot = Math.abs(st.w) > 0.3;
  const up = motorSense(st) > 0;
  measRows([
    [t('m.circuit'), t(st.closed ? 'circ.closed' : 'circ.open')],
    [t('m.coilRot'), rot ? t('rot.yes', { n: num(st.w / (2 * Math.PI), 1) }) : t('rot.no'), rot ? 'good-text' : ''],
    [t('m.side1'), st.closed ? t(up ? 'cur.up' : 'cur.down') : t('cur.none')],
    [t('m.flips'), String(st.flips)],
  ]);
  showStatus(null);
}

function buildTwo() {
  const st = S.two;
  panel([
    circuitSeg(st, 'closed1', 'ctl.circuit1'), circuitSeg(st, 'closed2', 'ctl.circuit2'),
    row(btn('ctl.rev1', () => { st.rev1 = !st.rev1; }), btn('ctl.rev2', () => { st.rev2 = !st.rev2; })),
    row(btn('ctl.revBoth', () => { st.rev1 = !st.rev1; st.rev2 = !st.rev2; }), resetBtn('two')),
  ]);
}
function updateTwo() {
  const st = S.two;
  const s1 = twoSense(st.closed1, st.rev1), s2 = twoSense(st.closed2, st.rev2);
  const F = forceOn2(st), gap = st.x2 - TW.x1 - TW.L;
  const act = !(s1 && s2) ? 'tw.none' : gap > 160 ? 'tw.far' : F < 0 ? 'tw.attract' : 'tw.repel';
  measRows([
    [t('m.c1'), t(s1 ? 'opt.yes' : 'opt.no')],
    [t('m.c2'), t(s2 ? 'opt.yes' : 'opt.no')],
    [t('m.two'), t(act), act === 'tw.attract' ? 'good-text' : act === 'tw.repel' ? 'bad-text' : ''],
  ]);
  showStatus(null);
}

function buildTab(id) {
  controlsBody.replaceChildren(); measuresBody.replaceChildren(); ui = {};
  ({ coil: buildCoil, emag: buildEmag, alt: buildAlt, motor: buildMotor, two: buildTwo })[id]();
  updateMeasures(); draw();
}
function updateMeasures() {
  if (!shell || !ui.dl) return;
  ({ coil: updateCoil, emag: updateEmag, alt: updateAlt, motor: updateMotor, two: updateTwo })[shell.tab]();
}
onLangChange(() => { if (shell) buildTab(shell.tab); });

shell = initSim({
  strings,
  notRequired: true, // Ch.15 is not in the CRDP 2026–2027 list (curriculum-scope.md)
  tabs: [
    { id: 'coil', labelKey: 'tab.coil' },
    { id: 'emag', labelKey: 'tab.emag' },
    { id: 'alt', labelKey: 'tab.alt' },
    { id: 'motor', labelKey: 'tab.motor' },
    { id: 'two', labelKey: 'tab.two' },
  ],
  initialTab: 'coil',
  onTab: buildTab,
  activityKey: (tab) => (tab === 'alt' ? `act.alt.${S.alt.what}` : `act.${tab}`),
});
shell.start();
loop.start();
if (DEBUG) window.__sim = { S };
