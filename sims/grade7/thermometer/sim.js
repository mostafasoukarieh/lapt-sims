// Grade 7 — Using and graduating a thermometer (Ch.7 Act. 1, Ex. 4–5; Ch.9 Act. 5)
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num, qty, parseNum } from '../../../shared/format.js';
import { createSlider, createButton, createSegmented, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, font } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { calcCell, calcSig, calcDone } from '../../../shared/calc-cell.js';
import { thermoGeom, drawThermometer } from '../../../shared/thermo-draw.js';

/* ================================================================
   Model
   ================================================================ */
// Temperature of what the reservoir touches (°C) and time constant of the thermometer (s).
const ENV = {
  air: { T: 22, tau: 2 },
  hand: { T: 33, tau: 1.6 },
  cold: { T: 12, tau: 0.8 },
  warm: { T: 45, tau: 0.8 },
  ice: { T: 0, tau: 0.8 },
  boil: { T: 100, tau: 0.8 },
};
const STOP = 0.15; // °C: closer than this, the column is considered stopped
const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

/* ================================================================
   Geometry
   ================================================================ */
// Tab "use": laboratory thermometer −10 … 60 °C, 4 px per °C
const USE_SCENE = { w: 600, h: 440 };
const BENCH = 432;
const UG = thermoGeom({ x: 300, yBulb: 398, yTop: 40, t0: -10, t1: 60, y0: 356, y1: 76, bulbR: 10, stemW: 7 });
const USE_SCALE = { minor: 1, mid: 5, major: 10, label: 10 };
const EYE_X = 430;
const XS = UG.x + UG.stemW / 2 + 6; // where the line of sight crosses the graduations
const EYE_MIN = 60, EYE_MAX = 380;
const PX_CM = 20; // eye height slider: logical units per cm
const LEVEL_TOL = 5; // px: eye level with the top of the column
const USE_BEAKER = { x0: 238, x1: 362, yTop: 340, yBot: BENCH, water: 360 };

// Tab "grad": blank mercury thermometer; 0 °C at Y0, 100 °C at Y0 − d·PX_CM (d in cm)
const GRAD_SCENE = { w: 600, h: 450 };
const G_BENCH = 446;
const GX = 230, Y0 = 390;
const GRAD_BASIN = { x0: 150, x1: 392, yTop: 384, yBot: 432, water: 398 };
const REF = thermoGeom({ x: 330, yBulb: 420, yTop: 70, t0: 0, t1: 110, y0: 392, y1: 84, bulbR: 9, stemW: 6 });
const RULER = { x1: 196, w: 30 };

// Tab "read": magnified part of a thermometer (exercise 4, figure 9)
const READ_SCENE = { w: 600, h: 440 };
const READ_TYPES = [
  { minor: 1, mid: 0, label: 5, n: 25, starts: [-20, -15, -10, -5, 0, 5, 10, 15, 20, 25], decimals: 0 },
  { minor: 2, mid: 0, label: 10, n: 25, starts: [-20, -10, 0, 10, 20, 30, 40, 50], decimals: 0 },
  { minor: 1, mid: 5, label: 10, n: 30, starts: [0, 10, 20, 30, 40, 50, 60, 70, 80], decimals: 0 },
  { minor: 0.1, mid: 0.5, label: 1, n: 40, starts: [35, 35.5, 36, 36.5, 37, 37.5, 38], decimals: 1, clinical: true },
];
const RD = { x: 300, yTop: 44, yBot: 420 };

/* ================================================================
   State
   ================================================================ */
function initialState() {
  return {
    use: { where: 'air', liquid: 'alcohol', T: ENV.air.T, eyeY: 190, rows: [], fb: null },
    grad: { d: 13, where: 'air', T: ENV.air.T, marks: {}, measured: false, row: {}, divided: false, warmT: 48, fb: null },
    read: { type: 0, start: 10, k: 12, input: '', ok: 0, total: 0, fb: null },
  };
}
let S = initialState();
const gradGeom = () => thermoGeom({ x: GX, yBulb: 420, yTop: 30, t0: 0, t1: 100, y0: Y0, y1: Y0 - S.grad.d * PX_CM, bulbR: 10, stemW: 7 });
let GG = gradGeom();

/* ================================================================
   Canvas
   ================================================================ */
let shell;
const canvas = document.getElementById('stage');
const view = setupCanvas(canvas, { width: USE_SCENE.w, height: USE_SCENE.h, maxHeightVh: () => (window.innerWidth < 880 ? 52 : 76), onResize: () => draw() });
onThemeChange(() => draw());

function draw() {
  if (!shell) return;
  const ctx = view.begin();
  if (shell.tab === 'use') drawUse(ctx, true);
  else if (shell.tab === 'grad') drawGrad(ctx, true);
  else drawRead(ctx);
  if (DEBUG) {
    ctx.fillStyle = 'red'; ctx.font = font(11); ctx.textAlign = 'left';
    const st = shell.tab === 'grad' ? S.grad : S.use;
    ctx.fillText(`T=${st.T?.toFixed(3)}`, 6, 14);
  }
}

/* ---------- common pieces ---------- */
function drawBench(ctx, y, w, h) {
  ctx.fillStyle = cssVar('--bench');
  ctx.fillRect(0, y, w, h - y);
}

function drawBeaker(ctx, b, { water = true, ice = false, boil = false, bubbles = null, warm = false } = {}) {
  if (water) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = cssVar('--water');
    ctx.fillRect(b.x0 + 2, b.water, b.x1 - b.x0 - 4, b.yBot - b.water - 2);
    ctx.restore();
    ctx.strokeStyle = cssVar('--water-dark');
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(b.x0 + 2, b.water); ctx.lineTo(b.x1 - 2, b.water); ctx.stroke();
  }
  if (ice) {
    const cubes = [[0.12, -6, 0.2], [0.3, -3, -0.3], [0.66, -5, 0.25], [0.84, -2, -0.15], [0.2, 16, 0.5], [0.78, 18, -0.4]];
    for (const [fx, dy, a] of cubes) {
      const cx = b.x0 + fx * (b.x1 - b.x0), cy = b.water + dy;
      ctx.save();
      ctx.translate(cx, cy); ctx.rotate(a);
      ctx.fillStyle = cssVar('--ice');
      ctx.strokeStyle = cssVar('--ice-edge');
      ctx.lineWidth = 1.2;
      roundRect(ctx, -10, -9, 20, 18, 4);
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }
  if (bubbles) {
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.2;
    for (const p of bubbles) {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.stroke();
    }
  }
  if (boil || warm) { // steam above the surface
    ctx.strokeStyle = cssVar('--muted');
    ctx.globalAlpha = boil ? 0.6 : 0.35;
    ctx.lineWidth = 1.5;
    const ph = performance.now() / 600;
    for (let i = 0; i < (boil ? 4 : 2); i++) {
      const x = b.x0 + 22 + i * ((b.x1 - b.x0 - 44) / Math.max(1, (boil ? 3 : 1)));
      ctx.beginPath();
      for (let k = 0; k <= 12; k++) {
        const y = b.yTop - 4 - k * 3;
        const xx = x + Math.sin(ph + k * 0.6 + i) * 4;
        if (k === 0) ctx.moveTo(xx, y); else ctx.lineTo(xx, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  // glass
  ctx.fillStyle = cssVar('--glass-fill');
  ctx.strokeStyle = cssVar('--glass-stroke');
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(b.x0 - 6, b.yTop - 3);
  ctx.lineTo(b.x0, b.yTop + 3);
  ctx.lineTo(b.x0, b.yBot);
  ctx.lineTo(b.x1, b.yBot);
  ctx.lineTo(b.x1, b.yTop);
  ctx.stroke();
  ctx.save(); ctx.globalAlpha = 0.5; ctx.fillRect(b.x0, b.yTop, b.x1 - b.x0, b.yBot - b.yTop); ctx.restore();
  ctx.fillStyle = cssVar('--glass-shine');
  ctx.fillRect(b.x1 - 12, b.yTop + 6, 4, b.yBot - b.yTop - 12);
}

// Fingers holding the reservoir (Fig. 3a)
function drawHand(ctx, g) {
  const x = g.x, y = g.yBulb;
  ctx.save();
  ctx.fillStyle = cssVar('--skin');
  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 1.2;
  const blob = (cx, cy, rx, ry, a) => { ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, a, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); };
  blob(x + 54, y + 22, 40, 24, -0.35); // palm
  blob(x + 92, y + 40, 26, 18, -0.4); // wrist
  blob(x + 6, y - 7, 19, 7, -0.12); // thumb
  blob(x + 4, y + 6, 20, 7, 0.08); // index finger
  blob(x + 10, y + 18, 18, 7, 0.2); // middle finger
  ctx.restore();
}

function drawEye(ctx, x, y, level) {
  const col = cssVar('--eye');
  ctx.save();
  ctx.strokeStyle = col;
  ctx.fillStyle = cssVar('--scene-bg');
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 18, y);
  ctx.quadraticCurveTo(x, y - 14, x + 18, y);
  ctx.quadraticCurveTo(x, y + 14, x - 18, y);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.arc(x - 5, y, 5.5, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = level ? cssVar('--good') : col;
  for (const s of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(x - 6, y + s * 20); ctx.lineTo(x, y + s * 27); ctx.lineTo(x + 6, y + s * 20); ctx.stroke();
  }
  ctx.restore();
}

// Magnifier: redraws the scene around (fx, fy) enlarged
function drawLens(ctx, lens, fx, fy, scene) {
  const cy = Math.min(lens.yMax, Math.max(lens.yMin, fy));
  ctx.save();
  ctx.beginPath(); ctx.arc(lens.x, cy, lens.r, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = cssVar('--scene-bg');
  ctx.fillRect(lens.x - lens.r, cy - lens.r, lens.r * 2, lens.r * 2);
  ctx.translate(lens.x, cy);
  ctx.scale(lens.zoom, lens.zoom);
  ctx.translate(-fx, -fy);
  scene(ctx);
  ctx.restore();
  ctx.strokeStyle = cssVar('--lens-ring');
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(lens.x, cy, lens.r, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 6; ctx.lineCap = 'round';
  const s = lens.handle ?? 1;
  ctx.beginPath();
  ctx.moveTo(lens.x + s * lens.r * 0.5, cy + lens.r * 0.87);
  ctx.lineTo(lens.x + s * lens.r * 0.72, cy + lens.r * 1.25);
  ctx.stroke();
  ctx.lineCap = 'butt';
}

/* ---------- Tab: using a thermometer ---------- */
const inWater = (w) => w === 'cold' || w === 'warm';
function seenY(eyeY, ym) {
  const ex = EYE_X - 18;
  return eyeY + ((ym - eyeY) * (ex - XS)) / (ex - UG.x);
}
function useReading() {
  const st = S.use;
  const ym = UG.colY(st.T);
  const ys = seenY(st.eyeY, ym);
  const d = st.eyeY - ym;
  const status = Math.abs(d) <= LEVEL_TOL ? 'level' : d < 0 ? 'above' : 'below';
  return { ym, ys, seen: Math.round(UG.tOfY(ys)), status };
}
const LENS_USE = { x: 140, r: 64, zoom: 2.6, yMin: 80, yMax: 330 };

function drawUse(ctx, full) {
  const st = S.use;
  drawBench(ctx, BENCH, USE_SCENE.w, USE_SCENE.h);
  // stand and clamp
  ctx.fillStyle = cssVar('--lever');
  ctx.fillRect(552, 14, 8, BENCH - 14);
  ctx.fillRect(530, BENCH - 8, 52, 8);
  ctx.fillRect(UG.x - 4, 18, 556 - UG.x, 6);
  ctx.fillStyle = cssVar('--box');
  roundRect(ctx, UG.x - 12, 14, 24, 16, 3); ctx.fill();

  drawThermometer(ctx, UG, { T: st.T, liquid: st.liquid, scale: USE_SCALE, unit: '°C' });
  if (inWater(st.where)) drawBeaker(ctx, USE_BEAKER, { warm: st.where === 'warm' });
  if (st.where === 'hand') drawHand(ctx, UG);

  if (!full) return;
  const r = useReading();
  // line of sight from the eye to the top of the column, and where it crosses the scale
  ctx.save();
  ctx.strokeStyle = cssVar('--sight');
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 5]);
  ctx.beginPath(); ctx.moveTo(EYE_X - 18, st.eyeY); ctx.lineTo(UG.x, r.ym); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = cssVar('--sight');
  ctx.beginPath(); ctx.arc(XS, r.ys, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  drawEye(ctx, EYE_X, st.eyeY, r.status === 'level');
  drawLens(ctx, LENS_USE, UG.x + 18, r.ym, (c) => {
    drawUse(c, false);
    // the line of sight inside the magnifier too
    c.save(); c.strokeStyle = cssVar('--sight'); c.lineWidth = 0.8; c.setLineDash([3, 2]);
    c.beginPath(); c.moveTo(EYE_X - 18, st.eyeY); c.lineTo(UG.x, r.ym); c.stroke(); c.restore();
  });
}

/* ---------- Tab: graduating a thermometer ---------- */
let bubbles = [];
function stepBubbles(dt) {
  if (S.grad.where !== 'boil') { bubbles.length = 0; return; }
  const b = GRAD_BASIN;
  if (bubbles.length < 26 && Math.random() < dt * 30) {
    bubbles.push({ x: b.x0 + 10 + Math.random() * (b.x1 - b.x0 - 20), y: b.yBot - 4, r: 1.5 + Math.random() * 2.5, v: 30 + Math.random() * 30 });
  }
  for (const p of bubbles) { p.y -= p.v * dt; p.r += dt * 1.2; }
  bubbles = bubbles.filter((p) => p.y > b.water + 2);
}

function gradScale() {
  if (!S.grad.divided) return null;
  const to = Math.min(110, Math.floor(GG.tOfY(GG.yTop + 6)));
  return { minor: 1, mid: 5, major: 10, label: 10, from: 0, to };
}
const LENS_GRAD = { x: 500, r: 70, zoom: 2.4, yMin: 90, yMax: 330, handle: -1 };

function drawGrad(ctx, full) {
  const st = S.grad;
  drawBench(ctx, G_BENCH, GRAD_SCENE.w, GRAD_SCENE.h);
  const w = st.where;
  const b = GRAD_BASIN;
  // hot plate (heating only for boiling water)
  ctx.fillStyle = cssVar('--hotplate');
  roundRect(ctx, b.x0 - 14, b.yBot, b.x1 - b.x0 + 28, G_BENCH - b.yBot, 3); ctx.fill();
  ctx.fillStyle = w === 'boil' ? cssVar('--hot') : cssVar('--muted');
  ctx.beginPath(); ctx.arc(b.x1 + 2, b.yBot + 7, 3, 0, Math.PI * 2); ctx.fill();

  // stand holding the thermometer(s)
  ctx.fillStyle = cssVar('--lever');
  ctx.fillRect(110, 10, 7, G_BENCH - 10);
  ctx.fillRect(110, 14, GX - 110 + 4, 5);
  ctx.fillStyle = cssVar('--box');
  roundRect(ctx, GX - 10, 10, 20, 14, 3); ctx.fill();

  const marks = Object.keys(st.marks).map((k) => ({ T: Number(k), text: st.divided ? '' : qty(Number(k), 0, '°C') }));
  drawThermometer(ctx, GG, { T: st.T, liquid: 'mercury', plate: false, scale: gradScale(), marks });
  if (w === 'warm') {
    drawThermometer(ctx, REF, { T: st.warmT, liquid: 'alcohol', scale: { minor: 1, mid: 5, major: 10, label: 10 }, unit: '°C', plateRight: 42 });
  }
  if (w !== 'air') drawBeaker(ctx, b, { ice: w === 'ice', boil: w === 'boil', bubbles: w === 'boil' ? bubbles : null, warm: w === 'warm' });

  // ruler between the two marks
  if (st.measured) drawRuler(ctx);

  if (!full) return;
  drawLens(ctx, LENS_GRAD, GX + 16, GG.colY(st.T), (c) => drawGrad(c, false));
}

function drawRuler(ctx) {
  const y0 = GG.yOfT(0), yTop = GG.yOfT(100) - 14;
  const x1 = RULER.x1, x0 = x1 - RULER.w;
  ctx.fillStyle = cssVar('--ruler');
  ctx.fillRect(x0, yTop, RULER.w, y0 + 10 - yTop);
  ctx.strokeStyle = cssVar('--scale');
  ctx.fillStyle = cssVar('--text');
  ctx.font = font(10, 700);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const nmm = Math.floor((y0 - yTop) / (PX_CM / 10));
  for (let i = 0; i <= nmm; i++) {
    const y = y0 - (i * PX_CM) / 10;
    const len = i % 10 === 0 ? 12 : i % 5 === 0 ? 8 : 5;
    ctx.lineWidth = i % 10 === 0 ? 1.2 : 0.7;
    ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x1 - len, y); ctx.stroke();
    if (i % 10 === 0) ctx.fillText(String(i / 10), x0 + 8, y);
  }
  ctx.fillText('cm', x0 + 8, yTop + 6);
  // dotted lines from the marks to the ruler
  ctx.save();
  ctx.strokeStyle = cssVar('--mark');
  ctx.setLineDash([3, 3]);
  ctx.lineWidth = 1;
  for (const T of [0, 100]) { const y = GG.yOfT(T); ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(GX - 8, y); ctx.stroke(); }
  ctx.restore();
}

/* ---------- Tab: reading thermometers (exercise 4) ---------- */
function readValue() { const st = S.read; const ty = READ_TYPES[st.type]; return round(st.start + st.k * ty.minor, ty.decimals); }
const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

function drawRead(ctx) {
  const st = S.read;
  const ty = READ_TYPES[st.type];
  const { x, yTop, yBot } = RD;
  const step = (yBot - yTop - 30) / ty.n; // px per division
  const yOf = (i) => yBot - 15 - i * step;
  // plate
  ctx.fillStyle = cssVar('--thermo-plate');
  ctx.strokeStyle = cssVar('--glass-stroke');
  ctx.lineWidth = 1.5;
  roundRect(ctx, x - 70, yTop, 160, yBot - yTop, 8);
  ctx.fill(); ctx.stroke();
  // stem
  ctx.fillStyle = cssVar('--glass-fill');
  roundRect(ctx, x - 9, yTop - 6, 18, yBot - yTop + 12, 9);
  ctx.fill(); ctx.stroke();
  // column
  ctx.fillStyle = cssVar('--thermo-red');
  const yc = yOf(st.k);
  ctx.fillRect(x - 4, yc, 8, yBot + 6 - yc);
  // graduations
  ctx.strokeStyle = cssVar('--scale');
  ctx.fillStyle = cssVar('--scale');
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = font(17, 700);
  for (let i = 0; i <= ty.n; i++) {
    const v = round(st.start + i * ty.minor, ty.decimals);
    const y = yOf(i);
    const isLabel = Math.abs(v / ty.label - Math.round(v / ty.label)) < 1e-6;
    const isMid = ty.mid && Math.abs(v / ty.mid - Math.round(v / ty.mid)) < 1e-6;
    const len = isLabel ? 30 : isMid ? 21 : 13;
    ctx.lineWidth = isLabel ? 2 : 1.2;
    ctx.beginPath(); ctx.moveTo(x + 11, y); ctx.lineTo(x + 11 + len, y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 11, y); ctx.lineTo(x - 11 - len * 0.6, y); ctx.stroke();
    if (isLabel) ctx.fillText(num(v, ty.label < 1 ? 1 : 0), x + 46, y);
  }
  ctx.font = font(15, 700);
  ctx.fillText('°C', x + 46, yTop + 12);
  if (ty.clinical) {
    ctx.font = font(13, 600);
    ctx.textAlign = 'center';
    ctx.fillStyle = cssVar('--muted');
    ctx.fillText(t('lbl.clinical'), x + 10, yTop - 16);
  }
}

/* ================================================================
   Animation: the column moves towards the temperature of what the reservoir touches
   ================================================================ */
let lastSig = '';
let measTimer = 0;
const loop = createLoop({
  dt: 1 / 60,
  step: (dt) => {
    if (shell?.tab === 'use') relax(S.use, dt);
    else if (shell?.tab === 'grad') { relax(S.grad, dt); stepBubbles(dt); }
    measTimer += dt;
    return true;
  },
  render: () => {
    if (!shell || shell.tab === 'read') return;
    draw();
    if (measTimer > 0.12) { measTimer = 0; updateMeasures(); }
  },
});
function envT(st) { return st.where === 'warm' && st === S.grad ? st.warmT : ENV[st.where].T; }
function relax(st, dt) {
  const Te = envT(st);
  const d = Te - st.T;
  if (Math.abs(d) < 0.005) { st.T = Te; return; }
  st.T += d * (1 - Math.exp(-dt / ENV[st.where].tau));
}
function columnState(st) {
  const d = envT(st) - st.T;
  if (Math.abs(d) < STOP) return 'stopped';
  return d > 0 ? 'rising' : 'falling';
}

/* ================================================================
   Pointer: drag the eye (tab "use")
   ================================================================ */
let drag = null;
canvas.addEventListener('pointerdown', (ev) => {
  if (shell.tab !== 'use') return;
  const p = view.toLogical(ev);
  const tol = Math.max(30, 22 * view.unitsPerPx);
  if (p.x > XS + 40 && Math.abs(p.y - S.use.eyeY) < tol * 2) {
    drag = { dy: S.use.eyeY - p.y };
    canvas.setPointerCapture(ev.pointerId);
    ev.preventDefault();
  }
});
canvas.addEventListener('pointermove', (ev) => {
  if (!drag) return;
  setEyeY(view.toLogical(ev).y + drag.dy);
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
const statusBox = () => el('div', { class: 'status', hidden: '' });
function showStatus(box, fb) {
  if (!fb) { box.hidden = true; return; }
  box.hidden = false;
  box.className = `status ${fb.type || ''}`;
  box.textContent = t(fb.key, fb.params);
}
function measRows(rows) {
  const sig = JSON.stringify(rows);
  if (ui.dlSig === sig) return; // the loop calls this often: touch the page only when something changed
  ui.dlSig = sig;
  ui.dl.replaceChildren(...rows.flatMap(([k, v, cls]) => [el('dt', {}, k), el('dd', cls ? { class: cls } : {}, v)]));
}
const eyeCm = (y) => Math.round(((BENCH - y) / PX_CM) * 10) / 10;
function setEyeY(y) {
  S.use.eyeY = Math.min(EYE_MAX, Math.max(EYE_MIN, y));
  ui.eye?.set(eyeCm(S.use.eyeY));
  updateMeasures();
  draw();
}

/* ---------- Tab: use ---------- */
function buildUse() {
  const st = S.use;
  ui.where = createSegmented({
    labelKey: 'ctl.where',
    options: ['air', 'hand', 'cold', 'warm'].map((v) => ({ value: v, labelKey: `where.${v}` })),
    value: st.where,
    onChange: (v) => { st.where = v; st.fb = null; updateMeasures(); },
  });
  ui.liquid = createSegmented({
    labelKey: 'ctl.liquid',
    options: [{ value: 'alcohol', labelKey: 'liq.alcohol' }, { value: 'mercury', labelKey: 'liq.mercury' }],
    value: st.liquid,
    onChange: (v) => { st.liquid = v; updateMeasures(); draw(); },
  });
  ui.eye = createSlider({
    labelKey: 'ctl.eye', min: eyeCm(EYE_MAX), max: eyeCm(EYE_MIN), step: 0.1, value: eyeCm(st.eyeY), unit: 'cm', decimals: 1,
    onInput: (v) => setEyeY(BENCH - v * PX_CM),
  });
  ui.record = createButton({ labelKey: 'ctl.record', onClick: recordUse, variant: 'primary' });
  controlsBody.append(
    ui.where.root, ui.liquid.root, ui.eye.root,
    el('p', { class: 'muted', style: 'margin:0 0 8px' }, t('hint.eye')),
    el('div', { class: 'btn-row' }, [ui.record, createButton({ labelKey: 'ui.reset', onClick: () => resetTab('use'), variant: 'ghost' })]),
  );
  ui.dl = el('dl', { class: 'meas' });
  ui.table = el('table', { class: 'data' });
  ui.clear = createButton({ labelKey: 'ctl.clearTable', onClick: () => { st.rows = []; st.fb = null; ui.tableSig = null; updateMeasures(); }, variant: 'ghost' });
  ui.clearRow = el('div', { class: 'btn-row', style: 'margin-top:8px' }, [ui.clear]);
  ui.status = statusBox();
  measuresBody.append(ui.dl, ui.table, ui.clearRow, ui.status);
}

function recordUse() {
  const st = S.use;
  if (columnState(st) !== 'stopped') { st.fb = { type: 'warn', key: 'fb.wait' }; updateMeasures(); return; }
  const r = useReading();
  const err = r.status !== 'level';
  st.rows.push({ where: st.where, liquid: st.liquid, seen: r.seen, err });
  if (st.rows.length > 6) st.rows.shift();
  st.fb = err ? { type: 'bad', key: `fb.eye.${r.status}` } : { type: 'good', key: 'fb.recorded', params: { v: qty(r.seen, 0, '°C') } };
  updateMeasures();
}

function updateUse() {
  const st = S.use;
  const r = useReading();
  const col = columnState(st);
  measRows([
    [t('m.liquid'), t(`liq.${st.liquid}`)],
    [t('m.division'), qty(1, 0, '°C')],
    [t('m.column'), t(`col.${col}`), col === 'stopped' ? 'good-text' : ''],
    [t('m.seen'), qty(r.seen, 0, '°C')],
    [t('m.eye'), t(`eye.${r.status}`), r.status === 'level' ? 'good-text' : 'bad-text'],
  ]);
  const sig = st.rows.length + t('m.whereCol') + st.rows.map((x) => x.seen).join();
  if (ui.tableSig !== sig) {
    ui.tableSig = sig;
    const head = el('tr', {}, [el('th', {}, t('m.whereCol')), el('th', {}, `${t('m.reading')} (°C)`)]);
    const body = st.rows.map((x) => el('tr', { class: x.err ? 'bad-row' : '' }, [
      el('td', { class: x.err ? 'bad-text' : '' }, t(`where.${x.where}`) + (x.err ? ' ⚠︎' : '')),
      el('td', { class: x.err ? 'bad-cell' : '' }, num(x.seen)),
    ]));
    ui.table.replaceChildren(el('thead', {}, head), el('tbody', {}, body));
  }
  ui.table.hidden = ui.clearRow.hidden = st.rows.length === 0;
  showStatus(ui.status, st.fb);
}

/* ---------- Tab: grad ---------- */
function buildGrad() {
  const st = S.grad;
  ui.where = createSegmented({
    labelKey: 'ctl.whereGrad',
    options: ['air', 'ice', 'boil', 'warm'].map((v) => ({ value: v, labelKey: `where.${v}` })),
    value: st.where,
    onChange: (v) => { st.where = v; st.fb = null; updateMeasures(); },
  });
  ui.mark = createButton({ labelKey: 'ctl.mark', onClick: markLevel, variant: 'primary' });
  ui.measure = createButton({ labelKey: 'ctl.measure', onClick: () => { st.measured = true; st.fb = { type: 'good', key: 'fb.measured', params: { d: qty(st.d, 1, 'cm') } }; updateMeasures(); } });
  ui.divide = createButton({ labelKey: 'ctl.divide', onClick: () => { st.divided = true; st.fb = { type: 'good', key: 'fb.divided' }; updateMeasures(); } });
  ui.otherWarm = createButton({ labelKey: 'ctl.otherWarm', onClick: () => { let v; do v = randInt(30, 80); while (v === st.warmT); st.warmT = v; st.where = 'warm'; ui.where.set('warm'); st.fb = null; updateMeasures(); } });
  controlsBody.append(
    ui.where.root,
    el('div', { class: 'btn-row' }, [ui.mark, ui.measure, ui.divide]),
    el('div', { class: 'btn-row', style: 'margin-top:8px' }, [ui.otherWarm, createButton({ labelKey: 'ui.reset', onClick: () => resetTab('grad'), variant: 'ghost' })]),
  );
  ui.dl = el('dl', { class: 'meas' });
  ui.table = el('table', { class: 'data' });
  ui.status = statusBox();
  measuresBody.append(ui.dl, ui.table, ui.status);
}

function markLevel() {
  const st = S.grad;
  if (st.where !== 'ice' && st.where !== 'boil') st.fb = { type: 'warn', key: 'fb.notFixed' };
  else if (columnState(st) !== 'stopped') st.fb = { type: 'bad', key: 'fb.moving' };
  else {
    const T = ENV[st.where].T;
    st.marks[T] = true;
    st.fb = { type: 'good', key: st.where === 'ice' ? 'fb.mark0' : 'fb.mark100' };
  }
  updateMeasures();
}

function updateGrad() {
  const st = S.grad;
  const col = columnState(st);
  const has0 = !!st.marks[0], has100 = !!st.marks[100];
  const rows = [
    [t('m.whereGrad'), t(`where.${st.where}`)],
    [t('m.columnHg'), t(`col.${col}`), col === 'stopped' ? 'good-text' : ''],
    [t('m.mark0'), has0 ? t('m.done') : '—', has0 ? 'good-text' : ''],
    [t('m.mark100'), has100 ? t('m.done') : '—', has100 ? 'good-text' : ''],
    [t('m.distance'), st.measured ? qty(st.d, 1, 'cm') : '—'],
  ];
  if (st.where === 'warm') rows.push([t('m.ref'), qty(st.warmT, 0, '°C')]);
  measRows(rows);
  // the student calculates the length of one division: d ÷ 100
  const sig = calcSig([st.row]) + st.measured + st.d;
  if (ui.tableSig !== sig) {
    ui.tableSig = sig;
    const head = el('tr', {}, [el('th', {}, t('m.dCol')), el('th', {}, t('m.divCol'))]);
    const body = el('tr', {}, [
      el('td', {}, num(st.d, 1)),
      calcCell(st.row, 'div', { expected: st.d / 100, decimals: 2, onCheck: checkDiv }),
    ]);
    ui.table.replaceChildren(el('thead', {}, head), el('tbody', {}, [body]));
  }
  ui.table.hidden = !st.measured;
  ui.mark.disabled = st.divided;
  ui.measure.disabled = !(has0 && has100) || st.measured;
  ui.divide.disabled = !calcDone(st.row, 'div') || st.divided;
  ui.otherWarm.disabled = !st.divided;
  showStatus(ui.status, st.fb);
}
function checkDiv(res) {
  const st = S.grad;
  if (res === 'invalid') st.fb = { type: 'warn', key: 'calc.invalid' };
  else if (res === 'ok') st.fb = { type: 'good', key: 'fb.divOk', params: { c: qty(st.d / 100, 2, 'cm'), mm: qty(st.d / 10, 1, 'mm') } };
  else st.fb = { type: 'bad', key: 'fb.divWrong', params: { d: num(st.d, 1) } };
  updateMeasures();
}

/* ---------- Tab: read ---------- */
function newThermo(st) {
  const prev = [st.type, st.start, st.k].join();
  do {
    st.type = randInt(0, READ_TYPES.length - 1);
    const ty = READ_TYPES[st.type];
    st.start = ty.starts[randInt(0, ty.starts.length - 1)];
    st.k = randInt(3, ty.n - 3);
  } while ([st.type, st.start, st.k].join() === prev);
}
function buildRead() {
  const st = S.read;
  const input = el('input', { class: 'text-input', type: 'text', inputmode: 'decimal', autocomplete: 'off', id: 'reading-input' });
  input.value = st.input;
  input.addEventListener('input', () => { st.input = input.value; });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') check(); });
  const check = () => {
    const x = parseNum(input.value);
    const v = readValue();
    if (!Number.isFinite(x)) st.fb = { type: 'warn', key: 'fb.invalid' };
    else {
      st.total += 1;
      if (Math.abs(x - v) < 1e-6) { st.ok += 1; st.fb = { type: 'good', key: 'fb.correct', params: { v: qty(v, READ_TYPES[st.type].decimals, '°C') } }; }
      else st.fb = { type: 'bad', key: x > v ? 'fb.high' : 'fb.low' };
    }
    updateMeasures();
  };
  const next = () => {
    newThermo(st);
    st.input = ''; input.value = ''; st.fb = null;
    updateMeasures(); draw();
    input.focus({ preventScroll: true });
  };
  controlsBody.append(
    el('div', { class: 'ctl' }, [
      el('label', { for: 'reading-input', dataset: { i18n: 'ctl.yourReading' } }, t('ctl.yourReading')),
      el('div', { class: 'input-row' }, [input, createButton({ labelKey: 'ctl.check', onClick: check, variant: 'primary' })]),
    ]),
    el('div', { class: 'btn-row' }, [
      createButton({ labelKey: 'ctl.newThermo', onClick: next }),
      createButton({ labelKey: 'ctl.showAnswer', onClick: () => { st.fb = { type: 'warn', key: 'fb.answer', params: { v: qty(readValue(), READ_TYPES[st.type].decimals, '°C'), d: qty(READ_TYPES[st.type].minor, READ_TYPES[st.type].decimals, '°C') } }; updateMeasures(); }, variant: 'ghost' }),
      createButton({ labelKey: 'ui.reset', onClick: () => resetTab('read'), variant: 'ghost' }),
    ]),
  );
  ui.dl = el('dl', { class: 'meas' });
  ui.status = statusBox();
  measuresBody.append(ui.dl, ui.status);
}
function updateRead() {
  const st = S.read;
  measRows([[t('m.score'), `${st.ok} / ${st.total}`]]);
  showStatus(ui.status, st.fb);
}

/* ---------- Tab switching / reset ---------- */
function buildTab(id) {
  controlsBody.replaceChildren();
  measuresBody.replaceChildren();
  ui = {};
  if (id === 'use') buildUse();
  else if (id === 'grad') buildGrad();
  else buildRead();
  const scene = id === 'grad' ? GRAD_SCENE : id === 'read' ? READ_SCENE : USE_SCENE;
  view.setLogicalSize(scene.w, scene.h);
  updateMeasures();
  draw();
}
function updateMeasures() {
  if (!shell || !ui.dl) return;
  if (shell.tab === 'use') updateUse();
  else if (shell.tab === 'grad') updateGrad();
  else updateRead();
}
function resetTab(id) {
  const fresh = initialState();
  S[id] = fresh[id];
  if (id === 'grad') { GG = gradGeom(); bubbles = []; }
  buildTab(id);
}

onLangChange(() => { ui.tableSig = null; ui.dlSig = null; updateMeasures(); draw(); });

shell = initSim({
  strings,
  tabs: [
    { id: 'use', labelKey: 'tab.use' },
    { id: 'read', labelKey: 'tab.read' },
    { id: 'grad', labelKey: 'tab.grad' },
  ],
  initialTab: 'use',
  onTab: buildTab,
});
shell.start();
loop.start();

if (DEBUG) window.__sim = { S, UG, useReading, readValue, get GG() { return GG; } };
