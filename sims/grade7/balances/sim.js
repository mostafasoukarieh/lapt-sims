// Grade 7 — Digital balance and balance with equal arms (Ch.3, Act. 3–5)
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num, qty, parseNum } from '../../../shared/format.js';
import { createSlider, createButton, createSegmented, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, font } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { massOf } from '../../../shared/materials.js';
import { drawDigitalBalance } from '../../../shared/lab-draw.js';

/* ================================================================
   Data
   ================================================================ */
const SCENE = { w: 600, h: 440 }; // full drawing space; each tab shows only the window it needs
const VIEWS = {
  digital: { x: 100, y: 150, w: 400, h: 290 }, // zoomed on the digital balance (bigger on phones)
  rb: { x: 0, y: 64, w: 600, h: 376 },
};
const viewOf = (tab) => (tab === 'digital' ? VIEWS.digital : VIEWS.rb);
const BENCH = 404;
const MASS_BOX = [500, 200, 100, 100, 50, 20, 20, 10, 5, 2, 2, 1]; // g — owner decision: 1 kg box (1010 g)
const BOTTLE = { empty: 165, V: 200 }; // g, mL
const OBJ_MASS = { none: 0, copybook: 96, book: 485 }; // g, example values (whole grams)
const LIQUIDS = ['water', 'oil', 'alcohol'];
const DRIFT = 3.6; // g shown by the digital balance before it is set to zero
// The adjusting screw starts at a random non-zero position; the empty balance is in equilibrium when the screw is at 0.
// The screw value is the imbalance it causes, in grams (> 0: left pan heavier).
const randomScrew = () => { let v; do { v = (Math.floor(Math.random() * 25) - 12) * 0.5; } while (Math.abs(v) < 2); return v; };
const EQ_TOL = 0.5; // g: equilibrium when |difference| < EQ_TOL

// obj: { id: 'none'|'copybook'|'book'|'bottle'|'mystery', liquid: null|'water'|'oil'|'alcohol', m (mystery) }
function massOfObj(o) {
  if (o.id === 'bottle') return BOTTLE.empty + (o.liquid ? massOf(o.liquid, BOTTLE.V) : 0);
  if (o.id === 'mystery') return o.m;
  return OBJ_MASS[o.id];
}
const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

/* ================================================================
   Equal-arm (Roberval) balance model
   ================================================================ */
const RB = { cx: 258, xL: 145, xR: 371, panY: 214, panW: 184, lever: 60, thMax: 0.17, m0: 4, w0: 7, zeta: 0.22 };

function newRoberval(left) {
  const rb = { knob: randomScrew(), left, on: MASS_BOX.map(() => false), theta: 0, omega: 0 };
  rb.theta = targetTheta(rb);
  return rb;
}
const rightSum = (rb) => rb.on.reduce((s, on, i) => (on ? s + MASS_BOX[i] : s), 0);
const rbDiff = (rb) => rb.knob + massOfObj(rb.left) - rightSum(rb); // > 0: left pan heavier
const zeroDone = (rb) => Math.abs(rb.knob) < 0.25;
const pansEmpty = (rb) => rb.left.id === 'none' && !rb.on.some(Boolean);
const targetTheta = (rb) => RB.thMax * Math.tanh(rbDiff(rb) / RB.m0);
function balanceState(rb) {
  const d = rbDiff(rb);
  if (Math.abs(d) < EQ_TOL) return 'balanced';
  return d > 0 ? 'left' : 'right';
}

/* ================================================================
   State
   ================================================================ */
function initialState() {
  return {
    dg: { obj: { id: 'none', liquid: null }, tare: 0, tareWith: null, rows: [], fb: null },
    eq: { rb: newRoberval({ id: 'none', liquid: null }), mysteryM: 0, input: '', ok: 0, total: 0, fb: null },
    lq: { rb: newRoberval({ id: 'none', liquid: null }), liquid: 'water', m1: null, rows: [], fb: null },
  };
}
let S = initialState();

/* ================================================================
   Canvas
   ================================================================ */
let shell;
let drawQueued = false;
const canvas = document.getElementById('stage');
const view = setupCanvas(canvas, { width: VIEWS.digital.w, height: VIEWS.digital.h, maxHeightVh: () => (window.innerWidth < 880 ? 44 : 76), onResize: () => requestDraw() });
function requestDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; draw(); });
}
onThemeChange(() => requestDraw());

const currentRb = () => (shell.tab === 'equal' ? S.eq.rb : shell.tab === 'liquid' ? S.lq.rb : null);

// Damped motion of the beam towards its equilibrium angle (fixed timestep).
const loop = createLoop({
  dt: 1 / 120,
  step(dt) {
    const rb = currentRb();
    if (!rb) return false;
    const tt = targetTheta(rb);
    const acc = -RB.w0 * RB.w0 * (rb.theta - tt) - 2 * RB.zeta * RB.w0 * rb.omega;
    rb.omega += acc * dt;
    rb.theta += rb.omega * dt;
    if (Math.abs(rb.theta - tt) < 1e-4 && Math.abs(rb.omega) < 1e-3) { rb.theta = tt; rb.omega = 0; requestDraw(); return false; }
    return true;
  },
  render: () => draw(),
});
const kick = () => { loop.start(); requestDraw(); };

// Hit rectangles of the drawn masses (rebuilt at each draw, fixed-size arrays — no allocation in the loop)
const hitPan = MASS_BOX.map(() => ({ x: 0, y: 0, w: 0, h: 0, on: false }));
const hitBox = MASS_BOX.map(() => ({ x: 0, y: 0, w: 0, h: 0, on: false }));
let hitZero = null;

function draw() {
  const ctx = view.begin();
  if (!shell) return;
  const v = viewOf(shell.tab);
  ctx.translate(-v.x, -v.y);
  ctx.fillStyle = cssVar('--bench');
  ctx.fillRect(0, BENCH, SCENE.w, SCENE.h - BENCH);
  if (shell.tab === 'digital') drawDigital(ctx);
  else drawRoberval(ctx, currentRb());
  if (DEBUG) drawDebug(ctx, v);
  ctx.translate(v.x, v.y);
}

/* ---------- Objects ---------- */
function liquidColor(l) {
  return l === 'oil' ? cssVar('--oil') : l === 'alcohol' ? cssVar('--alcohol') : cssVar('--water');
}

// Draws an object standing on a surface at height yb, centred on cx.
function drawObject(ctx, o, cx, yb) {
  ctx.lineWidth = 1.5;
  if (o.id === 'copybook') {
    const w = 128, h = 9;
    ctx.fillStyle = cssVar('--copybook');
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    roundRect(ctx, cx - w / 2, yb - h, w, h, 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f4f1e8';
    ctx.fillRect(cx - w / 2 + 3, yb - h + 3, w - 6, 3);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    for (let x = cx - w / 2 + 6; x < cx + w / 2 - 4; x += 7) ctx.fillRect(x, yb - h - 2, 2, 3);
  } else if (o.id === 'book') {
    const w = 120, h = 24;
    ctx.fillStyle = cssVar('--book');
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    roundRect(ctx, cx - w / 2, yb - h, w, h, 3);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f4f1e8';
    ctx.fillRect(cx - w / 2 + 4, yb - h + 4, w - 10, h - 8);
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1;
    for (let y = yb - h + 7; y < yb - 4; y += 3) { ctx.beginPath(); ctx.moveTo(cx - w / 2 + 6, y); ctx.lineTo(cx + w / 2 - 8, y); ctx.stroke(); }
  } else if (o.id === 'bottle') {
    drawBottle(ctx, cx, yb, o.liquid);
  } else if (o.id === 'mystery') {
    const w = 74, h = 50, yc = yb - h / 2;
    const pts = [[-0.48, 0.5], [-0.5, 0.05], [-0.3, -0.42], [0.08, -0.5], [0.42, -0.3], [0.5, 0.12], [0.44, 0.5]];
    ctx.fillStyle = cssVar('--stone');
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    pts.forEach(([px, py], i) => { const x = cx + px * w, y = yc + py * h; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = font(24, 800);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', cx, yc + 3);
  }
}

function bottlePath(ctx, cx, yb) {
  const w = 54, hb = 80, hs = 18, wn = 20, hn = 24;
  const x0 = cx - w / 2, x1 = cx + w / 2;
  ctx.beginPath();
  ctx.moveTo(cx - wn / 2, yb - hb - hs - hn);
  ctx.lineTo(cx - wn / 2, yb - hb - hs);
  ctx.quadraticCurveTo(x0, yb - hb - hs + 4, x0, yb - hb);
  ctx.lineTo(x0, yb - 6);
  ctx.quadraticCurveTo(x0, yb, x0 + 6, yb);
  ctx.lineTo(x1 - 6, yb);
  ctx.quadraticCurveTo(x1, yb, x1, yb - 6);
  ctx.lineTo(x1, yb - hb);
  ctx.quadraticCurveTo(x1, yb - hb - hs + 4, cx + wn / 2, yb - hb - hs);
  ctx.lineTo(cx + wn / 2, yb - hb - hs - hn);
}

function drawBottle(ctx, cx, yb, liquid) {
  const fillH = 66; // 200 mL mark
  if (liquid) {
    ctx.save();
    bottlePath(ctx, cx, yb);
    ctx.closePath();
    ctx.clip();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = liquidColor(liquid);
    ctx.fillRect(cx - 30, yb - fillH, 60, fillH);
    ctx.restore();
  }
  ctx.fillStyle = cssVar('--glass-fill');
  ctx.strokeStyle = cssVar('--glass-stroke');
  ctx.lineWidth = 2;
  bottlePath(ctx, cx, yb);
  ctx.fill();
  ctx.stroke();
  // lip
  ctx.beginPath();
  ctx.moveTo(cx - 12, yb - 122);
  ctx.lineTo(cx + 12, yb - 122);
  ctx.stroke();
  // shine
  ctx.fillStyle = cssVar('--glass-shine');
  ctx.fillRect(cx + 15, yb - 74, 4, 58);
  // 200 mL mark
  ctx.strokeStyle = cssVar('--scale');
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(cx - 27, yb - fillH);
  ctx.lineTo(cx - 17, yb - fillH);
  ctx.stroke();
  ctx.fillStyle = cssVar('--scale');
  ctx.font = font(9, 700);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(qty(BOTTLE.V, 0, 'mL'), cx - 15, yb - fillH);
}

/* ---------- Standard masses ---------- */
const massW = (m, k = 1) => (5 + 3.3 * Math.cbrt(m)) * k;
const massH = (m, k = 1) => massW(m, k) * 1.2;

// Brass mass standing on yb; returns nothing. k = drawing scale.
function drawMass(ctx, m, cx, yb, k = 1) {
  const w = massW(m, k), h = massH(m, k);
  const kw = w * 0.36, kh = w * 0.2, hw = w * 0.5;
  ctx.fillStyle = cssVar('--brass');
  ctx.strokeStyle = cssVar('--brass-dark');
  ctx.lineWidth = 1;
  roundRect(ctx, cx - w / 2, yb - h, w, h, Math.min(3, w * 0.12));
  ctx.fill(); ctx.stroke();
  ctx.fillRect(cx - kw / 2, yb - h - kh, kw, kh);
  ctx.strokeRect(cx - kw / 2, yb - h - kh, kw, kh);
  ctx.beginPath();
  ctx.ellipse(cx, yb - h - kh - hw * 0.32, hw / 2, hw * 0.34, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(cx - w / 2 + 2, yb - h + 2, Math.max(1.5, w * 0.12), h - 4);
  if (m >= 20 && k >= 1) {
    ctx.fillStyle = cssVar('--brass-ink');
    ctx.font = font(m >= 100 ? 9 : 7.5, 700);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(num(m), cx, yb - h / 2);
  }
}
const massTotalH = (m, k = 1) => massH(m, k) + massW(m, k) * 0.2 + massW(m, k) * 0.34;

// Masses on the right pan: rows of at most `maxW` units, the second row stands behind the first.
const panRow = MASS_BOX.map(() => 0);
const panX = MASS_BOX.map(() => 0);
function layoutPan(rb, maxW) {
  let x = 0, row = 0;
  const gap = 3;
  for (let i = 0; i < MASS_BOX.length; i++) {
    if (!rb.on[i]) continue;
    const w = massW(MASS_BOX[i]);
    if (x > 0 && x + w > maxW) { row += 1; x = 0; }
    panRow[i] = row; panX[i] = x + w / 2;
    x += w + gap;
  }
}

/* ---------- Equal-arm balance scene ---------- */
function drawRoberval(ctx, rb) {
  const d = RB.lever * Math.sin(rb.theta); // > 0: left pan lower
  const yL = RB.panY + d, yR = RB.panY - d;

  // Box of standard masses (on the bench, right)
  drawMassBox(ctx, rb);

  // Columns under the pans
  ctx.fillStyle = cssVar('--pan-metal');
  ctx.strokeStyle = cssVar('--glass-stroke');
  ctx.lineWidth = 1.2;
  for (const [x, y] of [[RB.xL, yL], [RB.xR, yR]]) {
    ctx.fillRect(x - 6, y + 18, 12, 330 - y - 18);
    ctx.strokeRect(x - 6, y + 18, 12, 330 - y - 18);
    ctx.fillRect(x - 22, y + 14, 44, 6);
  }

  // Body
  const body = cssVar('--balance-body');
  ctx.fillStyle = body;
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(62, BENCH);
  ctx.lineTo(454, BENCH);
  ctx.lineTo(446, 372);
  ctx.lineTo(430, 328);
  ctx.lineTo(332, 320);
  ctx.lineTo(306, 298);
  ctx.lineTo(210, 298);
  ctx.lineTo(184, 320);
  ctx.lineTo(86, 328);
  ctx.lineTo(70, 372);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(80, 376, 360, 6);
  // feet
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(74, BENCH - 4, 30, 4);
  ctx.fillRect(412, BENCH - 4, 30, 4);

  // Adjusting screw (left end)
  ctx.fillStyle = cssVar('--pan-metal');
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.arc(92, 352, 9, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  const a = (rb.knob / 10) * Math.PI;
  ctx.beginPath();
  ctx.moveTo(92 - 7 * Math.cos(a), 352 - 7 * Math.sin(a));
  ctx.lineTo(92 + 7 * Math.cos(a), 352 + 7 * Math.sin(a));
  ctx.stroke();

  // Index window with the two indices
  const wx = RB.cx, wy = 312;
  ctx.fillStyle = cssVar('--scene-bg');
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  roundRect(ctx, wx - 40, wy - 20, 80, 40, 6);
  ctx.fill(); ctx.stroke();
  ctx.strokeStyle = cssVar('--scale');
  ctx.lineWidth = 1;
  for (let k = -2; k <= 2; k++) {
    ctx.beginPath();
    ctx.moveTo(wx - 4, wy + k * 7);
    ctx.lineTo(wx + 4, wy + k * 7);
    ctx.stroke();
  }
  const dI = d * 0.3;
  const balanced = balanceState(rb) === 'balanced';
  ctx.fillStyle = balanced ? cssVar('--good') : cssVar('--accent');
  for (const [s, dy] of [[-1, dI], [1, -dI]]) {
    const y = wy + Math.max(-16, Math.min(16, dy));
    ctx.beginPath();
    ctx.moveTo(wx + s * 36, y - 3);
    ctx.lineTo(wx + s * 6, y);
    ctx.lineTo(wx + s * 36, y + 3);
    ctx.closePath();
    ctx.fill();
  }

  // Left pan with the object
  drawPan(ctx, RB.xL, yL);
  if (rb.left.id !== 'none') drawObject(ctx, rb.left, RB.xL, yL + 2);

  // Right pan with the standard masses
  drawPan(ctx, RB.xR, yR);
  const maxW = RB.panW - 30;
  layoutPan(rb, maxW);
  for (let i = 0; i < MASS_BOX.length; i++) hitPan[i].on = false;
  for (let row = 1; row >= 0; row--) {
    for (let i = 0; i < MASS_BOX.length; i++) {
      if (!rb.on[i] || panRow[i] !== row) continue;
      const cx = RB.xR - maxW / 2 + panX[i];
      const yb = yR + 2 - row * 9;
      drawMass(ctx, MASS_BOX[i], cx, yb);
      const h = hitPan[i];
      h.on = true; h.w = massW(MASS_BOX[i]) + 6; h.h = massTotalH(MASS_BOX[i]) + 6;
      h.x = cx - h.w / 2; h.y = yb - h.h + 3;
    }
  }
}

function drawPan(ctx, x, y) {
  const w = RB.panW;
  ctx.fillStyle = cssVar('--pan-metal');
  ctx.strokeStyle = cssVar('--glass-stroke');
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y - 4);
  ctx.lineTo(x + w / 2, y - 4);
  ctx.lineTo(x + w / 2 - 18, y + 14);
  ctx.lineTo(x - w / 2 + 18, y + 14);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillRect(x - w / 2 + 6, y - 3, w - 12, 2);
}

const BOX = { x: 466, y: 372, w: 128, h: 32 };
function drawMassBox(ctx, rb) {
  const k = 0.72;
  const slot = BOX.w / 6;
  // back row: the 6 largest masses; front row: the 6 smallest
  for (let i = 0; i < MASS_BOX.length; i++) hitBox[i].on = false;
  const placeRow = (from, yb) => {
    for (let i = from; i < from + 6; i++) {
      const cx = BOX.x + slot * (i - from + 0.5);
      if (rb.on[i]) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.beginPath();
        ctx.ellipse(cx, yb, massW(MASS_BOX[i], k) / 2, 2.5, 0, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      drawMass(ctx, MASS_BOX[i], cx, yb, k);
      const h = hitBox[i];
      h.on = true; h.w = slot; h.h = massTotalH(MASS_BOX[i], k) + 8;
      h.x = cx - slot / 2; h.y = yb - h.h + 4;
    }
  };
  ctx.fillStyle = cssVar('--box');
  roundRect(ctx, BOX.x - 4, BOX.y - 8, BOX.w + 8, 8, 2);
  ctx.fill();
  placeRow(0, BOX.y - 2);
  ctx.fillStyle = cssVar('--box');
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  roundRect(ctx, BOX.x - 6, BOX.y + 6, BOX.w + 12, BOX.h - 6, 3);
  ctx.fill(); ctx.stroke();
  placeRow(6, BOX.y + 12);
}

/* ---------- Digital balance scene ---------- */
const DG = { cx: 300, plateY: 286, plateW: 220 };
function digitalReading() {
  const raw = DRIFT + massOfObj(S.dg.obj);
  return Math.round((raw - S.dg.tare) * 10) / 10;
}
function drawDigital(ctx) {
  const { cx, plateY, plateW } = DG;
  hitZero = drawDigitalBalance(ctx, { cx, plateY, plateW, bench: BENCH, value: digitalReading(), zeroLabel: t('dev.zero') });
  // object
  if (S.dg.obj.id !== 'none') drawObject(ctx, S.dg.obj, cx, plateY);
}

function drawDebug(ctx, v) {
  ctx.fillStyle = 'red';
  ctx.font = font(11);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const rb = currentRb();
  if (rb) ctx.fillText(`diff=${rbDiff(rb).toFixed(2)} g  theta=${rb.theta.toFixed(4)} target=${targetTheta(rb).toFixed(4)} sum=${rightSum(rb)} obj=${massOfObj(rb.left)}`, v.x + 6, v.y + 14);
  else ctx.fillText(`true=${massOfObj(S.dg.obj)} tare=${S.dg.tare} shown=${digitalReading()}`, v.x + 6, v.y + 14);
}

/* ================================================================
   Pointer: tap the ZERO key, tap a standard mass (box ↔ right pan)
   ================================================================ */
const inRect = (p, h) => h.on && p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h;
canvas.addEventListener('pointerdown', (ev) => {
  const p = view.toLogical(ev);
  const v = viewOf(shell.tab);
  p.x += v.x;
  p.y += v.y;
  if (shell.tab === 'digital') {
    if (hitZero && Math.hypot(p.x - hitZero.x, p.y - hitZero.y) < hitZero.r) { pressZero(); ev.preventDefault(); }
    return;
  }
  for (let i = 0; i < MASS_BOX.length; i++) {
    if (inRect(p, hitPan[i]) || inRect(p, hitBox[i])) { toggleMass(i); ev.preventDefault(); return; }
  }
});

/* ================================================================
   Panels
   ================================================================ */
const controlsBody = document.getElementById('controls-body');
const measuresBody = document.getElementById('measures-body');
let ui = {};
const statusBox = () => el('div', { class: 'status', hidden: '' });
function showStatus(box, fb) {
  if (!fb) { box.hidden = true; return; }
  box.hidden = false;
  box.className = `status ${fb.type || ''}`;
  box.textContent = t(fb.key, fb.params);
}
function measRows(dl, rows) {
  dl.replaceChildren(...rows.flatMap(([k, v, cls]) => [el('dt', {}, k), el('dd', cls ? { class: cls } : {}, v)]));
}
function objLabel(o) {
  if (o.id === 'bottle') return o.liquid ? t('bottle.full', { l: t(`liqlc.${o.liquid}`) }) : t('bottle.empty');
  return t(`obj.${o.id}`);
}

/* ---------- Tab: digital balance ---------- */
function pressZero() {
  const st = S.dg;
  st.tare = DRIFT + massOfObj(st.obj);
  st.tareWith = { ...st.obj };
  st.fb = { type: 'good', key: 'fb.zeroPressed', params: { z: num(0, 1) } };
  updateMeasures();
  requestDraw();
}

function buildDigital() {
  const st = S.dg;
  ui.obj = createSegmented({
    labelKey: 'ctl.object',
    options: ['none', 'copybook', 'book', 'bottle'].map((v) => ({ value: v, labelKey: `obj.${v}` })),
    value: st.obj.id,
    onChange: (v) => { st.obj = { id: v, liquid: v === 'bottle' ? st.obj.liquid : null }; st.fb = null; updateMeasures(); requestDraw(); },
  });
  ui.content = createSegmented({
    labelKey: 'ctl.bottleContent',
    options: ['empty', ...LIQUIDS].map((v) => ({ value: v, labelKey: `liq.${v}` })),
    value: st.obj.liquid || 'empty',
    onChange: (v) => { st.obj.liquid = v === 'empty' ? null : v; st.fb = null; updateMeasures(); requestDraw(); },
  });
  const record = () => {
    if (st.obj.id === 'none') { st.fb = { type: 'warn', key: 'fb.putObject' }; updateMeasures(); return; }
    const v = digitalReading();
    const trueM = massOfObj(st.obj);
    const tw = st.tareWith;
    let label = objLabel(st.obj);
    let kind = 'ok';
    if (tw && tw.id === 'bottle' && !tw.liquid && st.obj.id === 'bottle' && st.obj.liquid) {
      kind = 'tare';
      label = t('row.liquidOnly', { l: t(`liqlc.${st.obj.liquid}`) });
    } else if (Math.abs(v - trueM) > 0.05) kind = 'err';
    st.rows.push({ obj: { ...st.obj }, kind, v });
    if (st.rows.length > 6) st.rows.shift();
    st.fb = kind === 'ok' ? { type: 'good', key: 'fb.dOk', params: { o: label, v: num(v, 1) } }
      : kind === 'tare' ? { type: 'good', key: 'fb.dTare', params: { v: num(v, 1) } }
        : { type: 'bad', key: 'fb.dNoZero', params: { e: num(v - trueM, 1) } };
    updateMeasures();
  };
  controlsBody.append(
    ui.obj.root,
    ui.content.root,
    el('div', { class: 'btn-row' }, [
      createButton({ labelKey: 'ctl.zero', onClick: pressZero }),
      createButton({ labelKey: 'ctl.record', onClick: record, variant: 'primary' }),
    ]),
    el('div', { class: 'btn-row', style: 'margin-top:8px' }, [
      createButton({ labelKey: 'ui.reset', onClick: () => resetTab('digital'), variant: 'ghost' }),
    ]),
  );
  ui.dl = el('dl', { class: 'meas' });
  ui.table = el('table', { class: 'data' });
  ui.note = el('p', { class: 'muted', style: 'margin:8px 0 0;font-size:0.88rem' });
  ui.status = statusBox();
  ui.clear = createButton({ labelKey: 'ctl.clearTable', onClick: () => { st.rows = []; st.fb = null; updateMeasures(); }, variant: 'ghost' });
  ui.clearRow = el('div', { class: 'btn-row', style: 'margin-top:8px' }, [ui.clear]);
  measuresBody.append(ui.dl, ui.table, ui.clearRow, ui.note, ui.status);
}

function zeroText() {
  const tw = S.dg.tareWith;
  if (!tw) return ['zero.no', 'warn-text'];
  if (tw.id === 'none') return ['zero.ok', 'good-text'];
  if (tw.id === 'bottle' && !tw.liquid) return ['zero.tare', ''];
  return ['zero.other', 'warn-text'];
}
function updateDigital() {
  const st = S.dg;
  const v = digitalReading();
  const [zk, zc] = zeroText();
  ui.content.root.hidden = st.obj.id !== 'bottle';
  ui.content.set(st.obj.liquid || 'empty');
  measRows(ui.dl, [
    [t('m.display'), qty(v, 1, 'g')],
    [t('m.inKg'), qty(v / 1000, 4, 'kg')],
    [t('m.inMg'), qty(Math.round(v * 1000), 0, 'mg')],
    [t('m.zero'), t(zk), zc],
  ]);
  const head = el('tr', {}, [el('th', {}, t('m.object')), el('th', {}, t('m.reading'))]);
  const body = st.rows.map((r) => {
    const label = r.kind === 'tare' ? t('row.liquidOnly', { l: t(`liqlc.${r.obj.liquid}`) }) : objLabel(r.obj);
    return el('tr', {}, [el('td', {}, label + (r.kind === 'err' ? ' ⚠' : '')), el('td', {}, qty(r.v, 1, 'g'))]);
  });
  ui.table.replaceChildren(el('thead', {}, head), el('tbody', {}, body));
  ui.table.hidden = st.rows.length === 0;
  if (ui.clearRow) ui.clearRow.hidden = ui.table.hidden;
  ui.note.textContent = t('m.unitNote');
  showStatus(ui.status, st.fb);
}

/* ---------- Shared: equal-arm balance controls ---------- */
function screwSlider(st) {
  return createSlider({
    labelKey: 'ctl.screw', min: -10, max: 10, step: 0.5, value: st.rb.knob, unit: '', decimals: 1,
    onInput: (v) => {
      const rb = st.rb;
      if (!pansEmpty(rb)) { ui.screw.set(rb.knob); st.fb = { type: 'warn', key: 'fb.screwLocked' }; updateMeasures(); return; }
      const was = zeroDone(rb);
      rb.knob = v;
      if (zeroDone(rb) && !was) st.fb = { type: 'good', key: 'fb.zeroDone' };
      else if (!zeroDone(rb)) st.fb = null;
      updateMeasures();
      kick();
    },
  });
}
function massChips(st) {
  const box = el('div', { class: 'chips', role: 'group' });
  const chips = MASS_BOX.map((m, i) => {
    const b = el('button', { type: 'button', class: 'chip', 'aria-pressed': 'false' });
    b.addEventListener('click', () => toggleMass(i));
    box.append(b);
    return b;
  });
  const refresh = () => chips.forEach((b, i) => {
    b.textContent = qty(MASS_BOX[i], 0, 'g');
    b.setAttribute('aria-pressed', String(st.rb.on[i]));
    b.disabled = !zeroDone(st.rb);
  });
  return { root: el('div', { class: 'ctl' }, [el('span', { class: 'ctl-label', dataset: { i18n: 'ctl.box' } }, t('ctl.box')), box]), refresh };
}

function stateOfTab() { return shell.tab === 'equal' ? S.eq : S.lq; }

function toggleMass(i) {
  if (shell.tab === 'digital') return;
  const st = stateOfTab();
  if (!zeroDone(st.rb)) { st.fb = { type: 'warn', key: 'fb.zeroFirst' }; updateMeasures(); return; }
  st.rb.on[i] = !st.rb.on[i];
  if (st.fb && st.fb.type !== 'good') st.fb = null;
  updateMeasures();
  kick();
}
function removeAll() {
  const st = stateOfTab();
  st.rb.on.fill(false);
  updateMeasures();
  kick();
}

function balanceRows(rb, hideSum) {
  const bs = balanceState(rb);
  const used = MASS_BOX.filter((m, i) => rb.on[i]);
  const zd = zeroDone(rb);
  return [
    [t('m.zeroEq'), t(zd ? 'zeq.done' : 'zeq.notDone'), zd ? 'good-text' : 'warn-text'],
    [t('m.balance'), t(`bal.${bs}`), bs === 'balanced' ? 'good-text' : ''],
    [t('m.masses'), used.length ? used.map((m) => qty(m, 0, 'g')).join(' + ') : t('none')],
    [t('m.sum'), hideSum ? '?' : qty(rightSum(rb), 0, 'g')],
  ];
}

/* ---------- Tab: equal arms ---------- */
function buildEqual() {
  const st = S.eq;
  ui.screw = screwSlider(st);
  ui.obj = createSegmented({
    labelKey: 'ctl.objectLeft',
    options: ['none', 'copybook', 'book', 'mystery'].map((v) => ({ value: v, labelKey: `obj.${v}` })),
    value: st.rb.left.id,
    onChange: (v) => {
      if (!zeroDone(st.rb)) { ui.obj.set(st.rb.left.id); st.fb = { type: 'warn', key: 'fb.zeroFirst' }; updateMeasures(); return; }
      if (v === 'mystery') newMystery(false);
      st.rb.left = { id: v, liquid: null, m: st.mysteryM };
      st.fb = null;
      updateMeasures();
      kick();
    },
  });
  ui.chips = massChips(st);
  const input = el('input', { class: 'text-input', type: 'text', inputmode: 'decimal', autocomplete: 'off', id: 'mass-input' });
  input.value = st.input;
  input.addEventListener('input', () => { st.input = input.value; });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') check(); });
  ui.input = input;
  const check = () => {
    const x = parseNum(input.value);
    if (!Number.isFinite(x)) st.fb = { type: 'warn', key: 'fb.invalid' };
    else {
      st.total += 1;
      if (Math.abs(x - st.mysteryM) < 0.01) { st.ok += 1; st.fb = { type: 'good', key: 'fb.correct', params: { v: num(st.mysteryM) } }; }
      else st.fb = { type: 'bad', key: balanceState(st.rb) === 'balanced' ? 'fb.wrong' : 'fb.notBalanced' };
    }
    updateMeasures();
  };
  ui.practice = el('div', { class: 'ctl' }, [
    el('label', { for: 'mass-input', dataset: { i18n: 'ctl.yourMass' } }, t('ctl.yourMass')),
    el('div', { class: 'input-row' }, [input, createButton({ labelKey: 'ctl.check', onClick: check, variant: 'primary' })]),
    el('div', { class: 'btn-row' }, [
      createButton({ labelKey: 'ctl.newMystery', onClick: () => newMystery(true) }),
      createButton({ labelKey: 'ctl.showMass', onClick: () => { st.fb = { type: 'warn', key: 'fb.answer', params: { v: num(st.mysteryM) } }; updateMeasures(); }, variant: 'ghost' }),
    ]),
  ]);
  controlsBody.append(
    ui.screw.root, ui.obj.root, ui.chips.root,
    el('div', { class: 'btn-row' }, [createButton({ labelKey: 'ctl.removeAll', onClick: removeAll })]),
    ui.practice,
    el('div', { class: 'btn-row', style: 'margin-top:8px' }, [createButton({ labelKey: 'ui.reset', onClick: () => resetTab('equal'), variant: 'ghost' })]),
  );
  ui.dl = el('dl', { class: 'meas' });
  ui.status = statusBox();
  measuresBody.append(ui.dl, ui.status);
}

function newMystery(apply) {
  const st = S.eq;
  let m;
  do { m = randInt(12, 990); } while (m === st.mysteryM);
  st.mysteryM = m;
  st.input = '';
  if (ui.input) ui.input.value = '';
  if (apply) {
    if (!zeroDone(st.rb)) { st.fb = { type: 'warn', key: 'fb.zeroFirst' }; updateMeasures(); return; }
    st.rb.left = { id: 'mystery', liquid: null, m };
    st.rb.on.fill(false);
    ui.obj.set('mystery');
    st.fb = null;
    updateMeasures();
    kick();
    ui.input?.focus({ preventScroll: true });
  }
}

function updateEqual() {
  const st = S.eq;
  const rb = st.rb;
  const mystery = rb.left.id === 'mystery';
  const bs = balanceState(rb);
  const rows = balanceRows(rb, mystery);
  if (!mystery) rows.push([t('m.objMass'), rb.left.id !== 'none' && bs === 'balanced' ? qty(massOfObj(rb.left), 0, 'g') : t('none')]);
  else rows.push([t('m.score'), `${st.ok} / ${st.total}`]);
  measRows(ui.dl, rows);
  ui.chips.refresh();
  ui.obj.set(rb.left.id);
  ui.obj.setDisabled(!zeroDone(rb));
  ui.screw.setDisabled(!pansEmpty(rb));
  ui.practice.hidden = !mystery;
  showStatus(ui.status, st.fb);
}

/* ---------- Tab: mass of a liquid ---------- */
function buildLiquid() {
  const st = S.lq;
  ui.screw = screwSlider(st);
  ui.liquid = createSegmented({
    labelKey: 'ctl.liquid',
    options: LIQUIDS.map((v) => ({ value: v, labelKey: `liq.${v}` })),
    value: st.liquid,
    onChange: (v) => {
      st.liquid = v;
      if (st.rb.left.liquid) st.rb.left.liquid = v;
      st.fb = null;
      updateMeasures();
      kick();
    },
  });
  ui.place = createButton({ labelKey: 'ctl.placeBottle', onClick: placeBottle, variant: 'primary' });
  ui.fill = createButton({ labelKey: 'ctl.fill', onClick: () => setFilled(true), variant: 'primary' });
  ui.empty = createButton({ labelKey: 'ctl.empty', onClick: () => setFilled(false) });
  ui.chips = massChips(st);
  ui.recM1 = createButton({ labelKey: 'ctl.recordM1', onClick: recordM1, variant: 'primary' });
  ui.recM2 = createButton({ labelKey: 'ctl.recordM2', onClick: recordM2, variant: 'primary' });
  controlsBody.append(
    ui.screw.root, ui.liquid.root,
    el('div', { class: 'btn-row', style: 'margin-bottom:12px' }, [ui.place, ui.fill, ui.empty]),
    ui.chips.root,
    el('div', { class: 'btn-row' }, [createButton({ labelKey: 'ctl.removeAll', onClick: removeAll })]),
    el('div', { class: 'btn-row', style: 'margin-top:12px' }, [ui.recM1, ui.recM2]),
    el('div', { class: 'btn-row', style: 'margin-top:8px' }, [
      createButton({ labelKey: 'ui.reset', onClick: () => resetTab('liquid'), variant: 'ghost' }),
    ]),
  );
  ui.dl = el('dl', { class: 'meas' });
  ui.table = el('table', { class: 'data' });
  ui.status = statusBox();
  ui.clear = createButton({ labelKey: 'ctl.clearTable', onClick: () => { st.rows = []; st.m1 = null; st.fb = null; updateMeasures(); }, variant: 'ghost' });
  ui.clearRow = el('div', { class: 'btn-row', style: 'margin-top:8px' }, [ui.clear]);
  measuresBody.append(ui.dl, ui.table, ui.clearRow, ui.status);
}

function placeBottle() {
  const st = S.lq;
  if (!zeroDone(st.rb)) { st.fb = { type: 'warn', key: 'fb.zeroFirst' }; updateMeasures(); return; }
  st.rb.left = { id: 'bottle', liquid: null };
  st.fb = { type: 'good', key: 'fb.bottlePlaced' };
  updateMeasures();
  kick();
}
function setFilled(full) {
  const st = S.lq;
  st.rb.left = { id: 'bottle', liquid: full ? st.liquid : null };
  st.fb = full ? { type: 'good', key: 'fb.filled', params: { l: t(`liqlc.${st.liquid}`) } } : null;
  updateMeasures();
  kick();
}
function recordM1() {
  const st = S.lq;
  if (!zeroDone(st.rb)) st.fb = { type: 'warn', key: 'fb.zeroFirst' };
  else if (st.rb.left.id !== 'bottle') st.fb = { type: 'warn', key: 'fb.needBottle' };
  else if (st.rb.left.liquid) st.fb = { type: 'warn', key: 'fb.needEmpty' };
  else if (balanceState(st.rb) !== 'balanced') st.fb = { type: 'warn', key: 'fb.balanceFirst' };
  else { st.m1 = rightSum(st.rb); st.fb = { type: 'good', key: 'fb.m1Saved', params: { v: num(st.m1) } }; }
  updateMeasures();
}
function recordM2() {
  const st = S.lq;
  if (st.m1 == null) st.fb = { type: 'warn', key: 'fb.needM1' };
  else if (!st.rb.left.liquid) st.fb = { type: 'warn', key: 'fb.needFull' };
  else if (balanceState(st.rb) !== 'balanced') st.fb = { type: 'warn', key: 'fb.balanceFirst' };
  else {
    const m2 = rightSum(st.rb);
    st.rows.push({ liquid: st.rb.left.liquid, m1: st.m1, m2 });
    if (st.rows.length > 6) st.rows.shift();
    st.fb = { type: 'good', key: 'fb.m2Saved', params: { v: num(m2), m: num(m2 - st.m1) } };
  }
  updateMeasures();
}

function updateLiquid() {
  const st = S.lq;
  const rb = st.rb;
  const rows = balanceRows(rb, false);
  rows.splice(0, 0, [t('m.leftPan'), objLabel(rb.left)]);
  rows.push(['m1', st.m1 == null ? t('none') : qty(st.m1, 0, 'g')]);
  measRows(ui.dl, rows);
  const head = el('tr', {}, [el('th', {}, t('m.liqCol')), el('th', {}, 'm1 (g)'), el('th', {}, 'm2 (g)'), el('th', {}, t('m.m'))]);
  const body = st.rows.map((r) => el('tr', {}, [
    el('td', {}, t(`liq.${r.liquid}`)), el('td', {}, num(r.m1)), el('td', {}, num(r.m2)), el('td', {}, qty(r.m2 - r.m1, 0, 'g')),
  ]));
  ui.table.replaceChildren(el('thead', {}, head), el('tbody', {}, body));
  ui.table.hidden = st.rows.length === 0;
  if (ui.clearRow) ui.clearRow.hidden = ui.table.hidden;
  ui.chips.refresh();
  ui.liquid.set(st.liquid);
  ui.screw.setDisabled(!pansEmpty(rb));
  const placed = rb.left.id === 'bottle';
  ui.place.hidden = placed;
  ui.place.disabled = !zeroDone(rb);
  ui.fill.hidden = !placed;
  ui.empty.hidden = !placed;
  ui.fill.disabled = !!rb.left.liquid;
  ui.empty.disabled = !rb.left.liquid;
  showStatus(ui.status, st.fb);
}

/* ---------- Tab switching / reset ---------- */
function buildTab(id) {
  loop.stop();
  controlsBody.replaceChildren();
  measuresBody.replaceChildren();
  ui = {};
  if (id === 'digital') buildDigital();
  else if (id === 'equal') buildEqual();
  else buildLiquid();
  const v = viewOf(id);
  view.setLogicalSize(v.w, v.h);
  updateMeasures();
  if (id !== 'digital') kick(); else requestDraw();
}

function updateMeasures() {
  if (!shell) return;
  if (shell.tab === 'digital') updateDigital();
  else if (shell.tab === 'equal') updateEqual();
  else updateLiquid();
}

function resetTab(id) {
  const fresh = initialState();
  if (id === 'digital') S.dg = fresh.dg;
  else if (id === 'equal') S.eq = fresh.eq;
  else S.lq = fresh.lq;
  buildTab(id);
}

onLangChange(() => { updateMeasures(); requestDraw(); });

shell = initSim({
  strings,
  tabs: [
    { id: 'digital', labelKey: 'tab.digital' },
    { id: 'equal', labelKey: 'tab.equal' },
    { id: 'liquid', labelKey: 'tab.liquid' },
  ],
  initialTab: 'digital',
  onTab: buildTab,
});
shell.start();

// Exposed for automated checks (?debug=1)
if (DEBUG) window.__sim = { get S() { return S; }, rbDiff, rightSum, massOfObj, digitalReading, balanceState, zeroDone, MASS_BOX };
