// Grade 7 — Measuring volume with a graduated cylinder (Ch.2, Act. 3–6)
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num, qty, parseNum } from '../../../shared/format.js';
import { createSlider, createButton, createSegmented, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, font } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';

/* ================================================================
   Geometry — cylinder scene (logical 400 × 560)
   ================================================================ */
const CYL_SCENE = { w: 400, h: 560 };
const C = { x0: 150, x1: 250, cx: 200, yBase: 480, perML: 3.4, yTop: 98, bench: 498 };
const yOfV = (v) => C.yBase - v * C.perML;
const vOfY = (y) => (C.yBase - y) / C.perML;
const EYE_X = 62;
const CM = 20; // logical units per cm, for the eye-height slider
const eyeYFromCm = (h) => C.bench - h * CM;
const eyeCmFromY = (y) => (C.bench - y) / CM;
const LEVEL_TOL = 3; // logical units: eye considered level with the water
const LENS = { x: 322, r: 56, zoom: 2.5, focusX: 176 }; // focusX: scale region shown (ticks + numbers)

// Where the line of sight (eye → bottom of the curved surface, on the axis)
// crosses the graduated wall. This is the reading the eye "sees".
function seenY(eyeY, ym) {
  return eyeY + ((ym - eyeY) * (C.x0 - EYE_X)) / (C.cx - EYE_X);
}
function eyeStatus(eyeY, ym) {
  const d = eyeY - ym;
  if (Math.abs(d) <= LEVEL_TOL) return 'level';
  return d < 0 ? 'above' : 'below';
}

/* ================================================================
   Solids (immersion tab)
   ================================================================ */
const STONE_PTS = [[-0.5, 0.1], [-0.38, -0.42], [-0.05, -0.5], [0.32, -0.38], [0.5, 0.02], [0.4, 0.42], [0.02, 0.5], [-0.36, 0.4]];
const MYSTERY_PTS = [[-0.48, -0.05], [-0.22, -0.5], [0.2, -0.46], [0.5, -0.1], [0.44, 0.34], [0.1, 0.5], [-0.3, 0.44]];
const PLASTICINE_SHAPES = [
  { key: 'shape.ball', w: 46, h: 46 },
  { key: 'shape.roll', w: 28, h: 64 },
  { key: 'shape.flat', w: 78, h: 22 },
];
function solidDef(s) {
  switch (s.id) {
    case 'stone': return { V: 18, w: 62, h: 46, kind: 'poly', pts: STONE_PTS, color: '--stone' };
    case 'metal': return { V: 12, w: 46, h: 40, kind: 'metal', color: '--metal' };
    case 'plasticine': { const sh = PLASTICINE_SHAPES[s.shape]; return { V: 15, w: sh.w, h: sh.h, kind: 'plasticine', shape: s.shape, color: '--plasticine' }; }
    case 'mystery': { const k = 0.7 + s.mysteryV / 40; return { V: s.mysteryV, w: 64 * k, h: 48 * k, kind: 'poly', pts: MYSTERY_PTS, color: '--stone' }; }
    default: return null;
  }
}
const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

/* ================================================================
   Containers scene (logical 600 × 440), real sizes in cm
   ================================================================ */
const CONT_SCENE = { w: 600, h: 440 };
const U = 16; // logical units per cm
const YB = 400; // inside bottom of the containers
const VESSELS = {
  cyl: { cx: 100, kind: 'cyl', r: 1.4, H: 17.6, grads: { minor: 5, major: 10, label: 20, max: 100 } },
  A: { cx: 290, kind: 'cyl', r: 3.6, H: 7.4, grads: { minor: 25, major: 50, label: 50, max: 250 }, beaker: true },
  B: { cx: 480, kind: 'flask', R: 4.2, rn: 1.3, Hc: 8, Hn: 4, grads: { minor: 25, major: 50, label: 50, max: 200 } },
};
// Volume (mL = cm³) contained up to height h (cm)
function volAt(vs, h) {
  if (vs.kind === 'cyl') return Math.PI * vs.r * vs.r * h;
  const { R, rn, Hc } = vs;
  if (h <= Hc) {
    const rh = R - ((R - rn) * h) / Hc;
    return ((Math.PI * Hc) / (3 * (R - rn))) * (R ** 3 - rh ** 3);
  }
  return volAt(vs, Hc) + Math.PI * rn * rn * (h - Hc);
}
function heightOf(vs, V) {
  if (V <= 0) return 0;
  let lo = 0, hi = vs.kind === 'cyl' ? vs.H : vs.Hc + vs.Hn;
  for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (volAt(vs, mid) < V) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
function radiusAt(vs, h) {
  if (vs.kind === 'cyl') return vs.r;
  return h <= vs.Hc ? vs.R - ((vs.R - vs.rn) * h) / vs.Hc : vs.rn;
}
function vesselHeight(vs) { return vs.kind === 'cyl' ? vs.H : vs.Hc + vs.Hn; }

/* ================================================================
   State
   ================================================================ */
function initialState() {
  return {
    read: { V: 47, eyeY: eyeYFromCm(11), input: '', ok: 0, total: 0, fb: null },
    imm: { solid: { id: 'stone', shape: 0, mysteryV: 14 }, water: 50, lower: 0, eyeY: yOfV(50), V1: null, V1err: false, rows: [], fb: null },
    cont: { liquid: 'water', vols: { cyl: 100, A: 0, B: 0 }, where: 'cyl', anim: null, fb: null },
  };
}
let S = initialState();

/* ================================================================
   Canvas
   ================================================================ */
let shell;
let drawQueued = false;
const canvas = document.getElementById('stage');
const view = setupCanvas(canvas, { width: CYL_SCENE.w, height: CYL_SCENE.h, maxHeightVh: () => (window.innerWidth < 880 ? 50 : 76), onResize: () => requestDraw() });
function requestDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; draw(); });
}
onThemeChange(() => requestDraw());

// Immersion: level of the liquid and immersed fraction (solved iteratively — the level rises as the solid goes in)
function immersion() {
  const st = S.imm;
  const d = solidDef(st.solid);
  const yBotTop = C.yTop - 8;
  const yBot = yBotTop + (C.yBase - 1 - yBotTop) * st.lower;
  let V = st.water;
  let f = 0;
  for (let i = 0; i < 12; i++) {
    const yl = yOfV(V);
    f = Math.min(1, Math.max(0, (yBot - yl) / d.h));
    V = st.water + f * d.V;
  }
  return { V, f, yBot, d, yBotTop };
}

function draw() {
  const ctx = view.begin();
  if (!shell) return;
  if (shell.tab === 'definite') drawContainers(ctx);
  else drawCylinderScene(ctx, { eye: true, lens: true });
  if (DEBUG) drawDebug(ctx);
}

function currentLevel() {
  if (shell.tab === 'read') return { V: S.read.V, eyeY: S.read.eyeY, solid: null };
  const im = immersion();
  return { V: im.V, eyeY: S.imm.eyeY, solid: im };
}

function drawCylinderScene(ctx, { eye, lens }) {
  const { V, eyeY, solid } = currentLevel();
  const ym = yOfV(V);
  const ys = seenY(eyeY, ym);
  const status = eyeStatus(eyeY, ym);

  // Bench
  ctx.fillStyle = cssVar('--bench');
  ctx.fillRect(0, C.bench, CYL_SCENE.w, CYL_SCENE.h - C.bench);

  // Foot
  ctx.fillStyle = cssVar('--glass-fill');
  ctx.strokeStyle = cssVar('--glass-stroke');
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(C.cx - 74, C.bench);
  ctx.lineTo(C.cx - 56, C.yBase + 4);
  ctx.lineTo(C.cx + 56, C.yBase + 4);
  ctx.lineTo(C.cx + 74, C.bench);
  ctx.closePath();
  ctx.fill(); ctx.stroke();

  // Solid (drawn behind the liquid so it looks immersed)
  if (solid) drawSolid(ctx, solid);

  // Liquid with concave surface; lowest point on the axis at ym
  const men = 5;
  const grad = ctx.createLinearGradient(C.x0, 0, C.x1, 0);
  grad.addColorStop(0, cssVar('--water-dark'));
  grad.addColorStop(0.45, cssVar('--water'));
  grad.addColorStop(1, cssVar('--water-dark'));
  ctx.save();
  ctx.globalAlpha = 0.78;
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(C.x0, C.yBase);
  ctx.lineTo(C.x0, ym - men);
  ctx.quadraticCurveTo(C.cx, ym + men, C.x1, ym - men);
  ctx.lineTo(C.x1, C.yBase);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = cssVar('--water-dark');
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(C.x0, ym - men);
  ctx.quadraticCurveTo(C.cx, ym + men, C.x1, ym - men);
  ctx.stroke();

  // Glass tube
  ctx.fillStyle = cssVar('--glass-fill');
  ctx.strokeStyle = cssVar('--glass-stroke');
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(C.x0 - 10, C.yTop - 4); // spout lip
  ctx.quadraticCurveTo(C.x0 - 2, C.yTop - 2, C.x0, C.yTop + 8);
  ctx.lineTo(C.x0, C.yBase);
  ctx.lineTo(C.x1, C.yBase);
  ctx.lineTo(C.x1, C.yTop);
  ctx.stroke();
  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.fillRect(C.x0, C.yTop, C.x1 - C.x0, C.yBase - C.yTop);
  ctx.restore();
  // Shine
  ctx.fillStyle = cssVar('--glass-shine');
  ctx.fillRect(C.x1 - 18, C.yTop + 10, 6, C.yBase - C.yTop - 24);

  // Graduations
  ctx.strokeStyle = cssVar('--scale');
  ctx.fillStyle = cssVar('--scale');
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  for (let v = 0; v <= 100; v++) {
    const y = yOfV(v);
    const len = v % 10 === 0 ? 26 : v % 5 === 0 ? 18 : 11;
    ctx.lineWidth = v % 10 === 0 ? 1.6 : 1;
    ctx.beginPath();
    ctx.moveTo(C.x0 + 1, y);
    ctx.lineTo(C.x0 + 1 + len, y);
    ctx.stroke();
    if (v % 10 === 0 && v > 0) {
      ctx.font = font(13, 700);
      ctx.fillText(String(v), C.x0 + 31, y);
    }
  }
  ctx.font = font(13, 700);
  ctx.fillText('mL', C.x0 + 31, yOfV(100) - 20);

  // Line of sight + eye
  if (eye) {
    ctx.save();
    ctx.strokeStyle = cssVar('--sight');
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    ctx.moveTo(EYE_X + 16, eyeY);
    ctx.lineTo(C.cx, ym);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(C.x0 - 4, ys);
    ctx.lineTo(C.x0 + 30, ys);
    ctx.stroke();
    ctx.fillStyle = cssVar('--sight');
    ctx.beginPath();
    ctx.arc(C.x0, ys, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    drawEye(ctx, EYE_X, eyeY, status);
  }

  if (lens) drawLens(ctx, ym);
}

function drawEye(ctx, x, y, status) {
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
  ctx.beginPath();
  ctx.arc(x + 5, y, 5.5, 0, Math.PI * 2);
  ctx.fill();
  // drag hint
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = status === 'level' ? cssVar('--good') : col;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x - 6, y + s * 20);
    ctx.lineTo(x, y + s * 27);
    ctx.lineTo(x + 6, y + s * 20);
    ctx.stroke();
  }
  ctx.restore();
}

// Magnifier around the bottom of the curved surface
function drawLens(ctx, ym) {
  const cy = Math.min(C.yBase - 30, Math.max(C.yTop + LENS.r + 6, ym));
  ctx.save();
  ctx.beginPath();
  ctx.arc(LENS.x, cy, LENS.r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = cssVar('--scene-bg');
  ctx.fillRect(LENS.x - LENS.r, cy - LENS.r, LENS.r * 2, LENS.r * 2);
  ctx.translate(LENS.x, cy);
  ctx.scale(LENS.zoom, LENS.zoom);
  ctx.translate(-LENS.focusX, -ym);
  drawCylinderScene(ctx, { eye: false, lens: false });
  ctx.restore();
  ctx.strokeStyle = cssVar('--lens-ring');
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(LENS.x, cy, LENS.r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(LENS.x + LENS.r * 0.5, cy + LENS.r * 0.87);
  ctx.lineTo(LENS.x + LENS.r * 0.72, cy + LENS.r * 1.25);
  ctx.stroke();
  ctx.lineCap = 'butt';
}

function drawSolid(ctx, im) {
  const { d, yBot } = im;
  const cx = C.cx;
  const yc = yBot - d.h / 2;
  // thread
  ctx.strokeStyle = cssVar('--thread');
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx, 0);
  ctx.lineTo(cx, yBot - d.h + (d.kind === 'poly' ? 4 : 0));
  ctx.stroke();

  ctx.fillStyle = cssVar(d.color);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (d.kind === 'poly') {
    d.pts.forEach(([px, py], i) => {
      const x = cx + px * d.w, y = yc + py * d.h;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
  } else if (d.kind === 'metal') {
    roundRect(ctx, cx - d.w / 2, yc - d.h / 2, d.w, d.h, 5);
  } else if (d.shape === 0) {
    ctx.arc(cx, yc, d.w / 2, 0, Math.PI * 2);
  } else {
    roundRect(ctx, cx - d.w / 2, yc - d.h / 2, d.w, d.h, Math.min(d.w, d.h) / 2);
  }
  ctx.fill();
  ctx.stroke();
  // highlight
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.beginPath();
  ctx.ellipse(cx - d.w * 0.18, yc - d.h * 0.2, d.w * 0.14, d.h * 0.1, -0.5, 0, Math.PI * 2);
  ctx.fill();
  if (d.kind === 'metal') {
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.moveTo(cx - d.w / 2 + 6, yc - d.h / 2 + 6);
    ctx.lineTo(cx + d.w / 2 - 6, yc - d.h / 2 + 6);
    ctx.stroke();
  }
}

/* ---------- Containers scene ---------- */
function liquidColors() {
  return S.cont.liquid === 'oil' ? [cssVar('--oil'), cssVar('--oil-dark')] : [cssVar('--water'), cssVar('--water-dark')];
}

function vesselPath(ctx, vs) {
  const H = vesselHeight(vs);
  ctx.beginPath();
  if (vs.kind === 'cyl') {
    const r = vs.r * U;
    ctx.moveTo(vs.cx - r - (vs.beaker ? 6 : 0), YB - H * U - (vs.beaker ? 4 : 0));
    ctx.lineTo(vs.cx - r, YB - H * U + 4);
    ctx.lineTo(vs.cx - r, YB);
    ctx.lineTo(vs.cx + r, YB);
    ctx.lineTo(vs.cx + r, YB - H * U);
  } else {
    const R = vs.R * U, rn = vs.rn * U;
    ctx.moveTo(vs.cx - rn, YB - H * U);
    ctx.lineTo(vs.cx - rn, YB - vs.Hc * U);
    ctx.lineTo(vs.cx - R, YB);
    ctx.lineTo(vs.cx + R, YB);
    ctx.lineTo(vs.cx + rn, YB - vs.Hc * U);
    ctx.lineTo(vs.cx + rn, YB - H * U);
  }
}

function drawLiquidIn(ctx, vs, V) {
  if (V <= 0.05) return;
  const h = heightOf(vs, V);
  const [c1, c2] = liquidColors();
  ctx.save();
  ctx.globalAlpha = 0.8;
  const r0 = radiusAt(vs, 0) * U;
  const g = ctx.createLinearGradient(vs.cx - r0, 0, vs.cx + r0, 0);
  g.addColorStop(0, c2); g.addColorStop(0.45, c1); g.addColorStop(1, c2);
  ctx.fillStyle = g;
  ctx.beginPath();
  const steps = vs.kind === 'cyl' ? 1 : 24;
  ctx.moveTo(vs.cx - radiusAt(vs, 0) * U, YB);
  for (let i = 0; i <= steps; i++) { const hh = (h * i) / steps; ctx.lineTo(vs.cx - radiusAt(vs, hh) * U, YB - hh * U); }
  for (let i = steps; i >= 0; i--) { const hh = (h * i) / steps; ctx.lineTo(vs.cx + radiusAt(vs, hh) * U, YB - hh * U); }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = c2;
  ctx.lineWidth = 2;
  const rt = radiusAt(vs, h) * U;
  ctx.beginPath();
  ctx.moveTo(vs.cx - rt, YB - h * U);
  ctx.lineTo(vs.cx + rt, YB - h * U);
  ctx.stroke();
}

function drawGraduations(ctx, vs) {
  const g = vs.grads;
  ctx.strokeStyle = cssVar('--scale');
  ctx.fillStyle = cssVar('--scale');
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = font(11, 700);
  for (let v = g.minor; v <= g.max; v += g.minor) {
    const h = heightOf(vs, v);
    const y = YB - h * U;
    const xl = vs.cx - radiusAt(vs, h) * U + 2;
    const major = v % g.major === 0;
    ctx.lineWidth = major ? 1.6 : 1;
    ctx.beginPath();
    ctx.moveTo(xl, y);
    ctx.lineTo(xl + (major ? 16 : 9), y);
    ctx.stroke();
    if (v % g.label === 0) ctx.fillText(String(v), xl + 19, y);
  }
  const hMax = heightOf(vs, g.max);
  ctx.fillText('mL', vs.cx - radiusAt(vs, hMax) * U + 21, YB - hMax * U - 15);
}

function drawContainers(ctx) {
  const st = S.cont;
  ctx.fillStyle = cssVar('--bench');
  ctx.fillRect(0, YB + 6, CONT_SCENE.w, CONT_SCENE.h - YB - 6);
  for (const [id, vs] of Object.entries(VESSELS)) {
    drawLiquidIn(ctx, vs, st.vols[id]);
    ctx.fillStyle = cssVar('--glass-fill');
    ctx.strokeStyle = cssVar('--glass-stroke');
    ctx.lineWidth = 2.5;
    vesselPath(ctx, vs);
    ctx.stroke();
    // foot / base
    ctx.beginPath();
    ctx.moveTo(vs.cx - (vs.kind === 'cyl' ? vs.r * U + (vs.beaker ? 0 : 18) : vs.R * U), YB + 6);
    ctx.lineTo(vs.cx + (vs.kind === 'cyl' ? vs.r * U + (vs.beaker ? 0 : 18) : vs.R * U), YB + 6);
    ctx.stroke();
    drawGraduations(ctx, vs);
    // label
    ctx.fillStyle = cssVar('--scale');
    ctx.font = font(16, 700);
    ctx.textAlign = 'center';
    ctx.fillText(id === 'cyl' ? '' : id, vs.cx, YB - vesselHeight(vs) * U - 22);
  }
  // Pouring stream
  if (st.anim) {
    const from = VESSELS[st.anim.from], to = VESSELS[st.anim.to];
    const fromTop = YB - vesselHeight(from) * U;
    const toLevel = YB - heightOf(to, st.vols[st.anim.to]) * U;
    const dir = Math.sign(to.cx - from.cx);
    const lipX = from.cx + dir * (from.kind === 'cyl' ? from.r : from.rn) * U;
    const [c1] = liquidColors();
    ctx.strokeStyle = c1;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(lipX, fromTop);
    ctx.quadraticCurveTo(to.cx, fromTop - 30, to.cx, toLevel);
    ctx.stroke();
    ctx.lineCap = 'butt';
  }
}

function drawDebug(ctx) {
  ctx.fillStyle = 'red';
  ctx.font = font(11);
  ctx.textAlign = 'left';
  if (shell.tab === 'definite') {
    let y = 14;
    for (const [id, vs] of Object.entries(VESSELS)) {
      ctx.fillText(`${id}: V(100mL)→h=${heightOf(vs, 100).toFixed(3)} cm, back=${volAt(vs, heightOf(vs, 100)).toFixed(3)}`, 6, y);
      y += 14;
    }
  } else {
    const { V, eyeY } = currentLevel();
    ctx.fillText(`V=${V.toFixed(3)} seen=${vOfY(seenY(eyeY, yOfV(V))).toFixed(3)}`, 6, 14);
  }
}

/* ================================================================
   Pointer interaction: drag the eye; drag the solid
   ================================================================ */
let drag = null;
canvas.addEventListener('pointerdown', (ev) => {
  if (shell.tab === 'definite') return;
  const p = view.toLogical(ev);
  const tol = Math.max(30, 22 * view.unitsPerPx);
  const eyeY = shell.tab === 'read' ? S.read.eyeY : S.imm.eyeY;
  if (p.x < C.x0 - 20 && Math.abs(p.y - eyeY) < tol * 2.2) {
    drag = { kind: 'eye', dy: eyeY - p.y };
  } else if (shell.tab === 'immersion') {
    const im = immersion();
    if (Math.abs(p.x - C.cx) < im.d.w / 2 + 20 && p.y > im.yBot - im.d.h - 20 && p.y < im.yBot + 20) {
      drag = { kind: 'solid', dy: im.yBot - p.y, im };
    }
  }
  if (drag) { canvas.setPointerCapture(ev.pointerId); ev.preventDefault(); }
});
canvas.addEventListener('pointermove', (ev) => {
  if (!drag) return;
  const p = view.toLogical(ev);
  if (drag.kind === 'eye') {
    setEyeY(p.y + drag.dy);
  } else {
    const yBot = p.y + drag.dy;
    const { yBotTop } = drag.im;
    const lower = (yBot - yBotTop) / (C.yBase - 1 - yBotTop);
    setLower(Math.min(1, Math.max(0, lower)));
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
const statusBox = () => el('div', { class: 'status', hidden: '' });
function showStatus(box, fb) {
  if (!fb) { box.hidden = true; return; }
  box.hidden = false;
  box.className = `status ${fb.type || ''}`;
  box.textContent = t(fb.key, fb.params);
}

function setEyeY(y) {
  const yy = Math.min(eyeYFromCm(1.5), Math.max(eyeYFromCm(19.5), y));
  if (shell.tab === 'read') S.read.eyeY = yy; else S.imm.eyeY = yy;
  ui.eye?.set(Math.round(eyeCmFromY(yy) * 10) / 10);
  updateMeasures();
  requestDraw();
}
function setLower(l) {
  S.imm.lower = l;
  ui.lower?.set(Math.round(l * 100));
  updateMeasures();
  requestDraw();
}

function eyeSlider(stateEyeY) {
  return createSlider({
    labelKey: 'ctl.eye', min: 1.5, max: 19.5, step: 0.1, value: Math.round(eyeCmFromY(stateEyeY) * 10) / 10,
    unit: 'cm', decimals: 1, onInput: (v) => setEyeY(eyeYFromCm(v)),
  });
}

/* ---------- Tab: reading ---------- */
function buildRead() {
  const st = S.read;
  ui.eye = eyeSlider(st.eyeY);
  const input = el('input', { class: 'text-input', type: 'text', inputmode: 'decimal', autocomplete: 'off', id: 'reading-input' });
  input.value = st.input;
  input.addEventListener('input', () => { st.input = input.value; });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') check(); });
  const label = el('label', { for: 'reading-input', dataset: { i18n: 'ctl.yourReading' } }, t('ctl.yourReading'));
  const check = () => {
    const x = parseNum(input.value);
    if (!Number.isFinite(x)) st.fb = { type: 'warn', key: 'fb.invalid' };
    else {
      st.total += 1;
      if (Math.abs(x - st.V) < 0.01) { st.ok += 1; st.fb = { type: 'good', key: 'fb.correct', params: { v: num(st.V) } }; }
      else st.fb = { type: 'bad', key: x > st.V ? 'fb.high' : 'fb.low' };
    }
    updateMeasures();
  };
  const newVol = () => {
    let v;
    do { v = randInt(12, 96); } while (v === st.V);
    st.V = v;
    st.input = '';
    input.value = '';
    st.fb = null;
    updateMeasures();
    requestDraw();
    input.focus({ preventScroll: true });
  };
  const show = () => { st.fb = { type: 'warn', key: 'fb.answer', params: { v: num(st.V) } }; updateMeasures(); };
  controlsBody.append(
    ui.eye.root,
    el('div', { class: 'ctl' }, [label, el('div', { class: 'input-row' }, [input, createButton({ labelKey: 'ctl.check', onClick: check, variant: 'primary' })])]),
    el('div', { class: 'btn-row' }, [
      createButton({ labelKey: 'ctl.newVolume', onClick: newVol }),
      createButton({ labelKey: 'ctl.showVolume', onClick: show, variant: 'ghost' }),
      createButton({ labelKey: 'ui.reset', onClick: () => resetTab('read'), variant: 'ghost' }),
    ]),
  );
  ui.dl = el('dl', { class: 'meas' });
  ui.status = statusBox();
  measuresBody.append(ui.dl, ui.status);
}

function measRows(rows) {
  ui.dl.replaceChildren(...rows.flatMap(([k, v, cls]) => [el('dt', {}, k), el('dd', cls ? { class: cls } : {}, v)]));
}

function updateRead() {
  const st = S.read;
  const status = eyeStatus(st.eyeY, yOfV(st.V));
  measRows([
    [t('m.division'), qty(1, 0, 'mL')],
    [t('m.capacity'), qty(100, 0, 'mL')],
    [t('m.eye'), t(`eye.${status}`), status === 'level' ? 'good-text' : ''],
    [t('m.score'), `${st.ok} / ${st.total}`],
  ]);
  showStatus(ui.status, st.fb);
}

/* ---------- Tab: definite volume ---------- */
let pourLoop = null;
function buildDefinite() {
  const st = S.cont;
  ui.liquid = createSegmented({
    labelKey: 'ctl.liquid',
    options: [{ value: 'water', labelKey: 'ctl.water' }, { value: 'oil', labelKey: 'ctl.oil' }],
    value: st.liquid,
    onChange: (v) => {
      if (st.anim) return;
      st.liquid = v;
      st.vols = { cyl: 100, A: 0, B: 0 };
      st.where = 'cyl';
      st.fb = null;
      updateMeasures();
      requestDraw();
    },
  });
  ui.pour = {
    A: createButton({ labelKey: 'ctl.pourA', onClick: () => pour('A'), variant: 'primary' }),
    B: createButton({ labelKey: 'ctl.pourB', onClick: () => pour('B'), variant: 'primary' }),
    cyl: createButton({ labelKey: 'ctl.pourCyl', onClick: () => pour('cyl') }),
  };
  controlsBody.append(
    ui.liquid.root,
    el('div', { class: 'btn-row' }, [ui.pour.A, ui.pour.B, ui.pour.cyl]),
    el('div', { class: 'btn-row', style: 'margin-top:8px' }, [createButton({ labelKey: 'ui.reset', onClick: () => resetTab('definite'), variant: 'ghost' })]),
  );
  ui.table = el('table', { class: 'data' });
  ui.status = statusBox();
  ui.note = el('p', { class: 'muted', style: 'margin:8px 0 0' });
  measuresBody.append(ui.table, ui.note, ui.status);
}

function pour(to) {
  const st = S.cont;
  if (st.anim || st.where === to) return;
  const amount = st.vols[st.where];
  st.anim = { from: st.where, to, amount, t: 0, dur: 1.6 };
  st.fb = null;
  pourLoop = createLoop({
    dt: 1 / 60,
    step: (dt) => {
      const a = st.anim;
      a.t = Math.min(a.dur, a.t + dt);
      const p = a.t / a.dur;
      const e = p * p * (3 - 2 * p);
      st.vols[a.from] = a.amount * (1 - e);
      st.vols[a.to] = a.amount * e;
      if (a.t >= a.dur) {
        st.vols[a.from] = 0;
        st.vols[a.to] = a.amount;
        st.where = a.to;
        st.anim = null;
        st.fb = { type: 'good', key: 'fb.poured', params: { c: t(`c.${to}`) } };
        updateMeasures();
        draw();
        return false;
      }
      return true;
    },
    render: () => { draw(); updateMeasures(); },
  });
  pourLoop.start();
  updateMeasures();
}

function updateDefinite() {
  const st = S.cont;
  const head = el('tr', {}, [el('th', {}, t('m.vessel')), el('th', {}, t('m.height')), el('th', {}, t('m.volume'))]);
  const rows = ['cyl', 'A', 'B'].map((id) => {
    const V = st.vols[id];
    const h = heightOf(VESSELS[id], V);
    return el('tr', {}, [el('td', {}, t(`m.${id}`)), el('td', {}, qty(h, 1, 'cm')), el('td', {}, qty(Math.round(V), 0, 'mL'))]);
  });
  ui.table.replaceChildren(el('thead', {}, head), el('tbody', {}, rows));
  ui.note.textContent = t('m.unitNote');
  for (const [id, b] of Object.entries(ui.pour)) b.disabled = !!st.anim || st.where === id;
  ui.liquid.setDisabled(!!st.anim);
  showStatus(ui.status, st.fb);
}

/* ---------- Tab: immersion ---------- */
function buildImmersion() {
  const st = S.imm;
  ui.solid = createSegmented({
    labelKey: 'ctl.solid',
    options: [
      { value: 'stone', labelKey: 'ctl.stone' },
      { value: 'metal', labelKey: 'ctl.metal' },
      { value: 'plasticine', labelKey: 'ctl.plasticine' },
      { value: 'mystery', labelKey: 'ctl.mystery' },
    ],
    value: st.solid.id,
    onChange: (v) => {
      st.solid.id = v;
      if (v === 'mystery') st.solid.mysteryV = randInt(6, 28);
      st.lower = 0;
      ui.lower.set(0);
      st.V1 = null;
      st.fb = null;
      updateMeasures();
      requestDraw();
    },
  });
  ui.eye = eyeSlider(st.eyeY);
  ui.water = createSlider({
    labelKey: 'ctl.waterVol', min: 30, max: 70, step: 1, value: st.water, unit: 'mL', decimals: 0,
    onInput: (v) => { st.water = v; st.V1 = null; st.fb = null; updateMeasures(); requestDraw(); },
  });
  ui.lower = createSlider({
    labelKey: 'ctl.lower', min: 0, max: 100, step: 1, value: Math.round(st.lower * 100), unit: '%', decimals: 0,
    onInput: (v) => setLower(v / 100),
  });
  ui.recV1 = createButton({ labelKey: 'ctl.recordV1', onClick: recordV1, variant: 'primary' });
  ui.recV2 = createButton({ labelKey: 'ctl.recordV2', onClick: recordV2, variant: 'primary' });
  ui.shape = createButton({ labelKey: 'ctl.changeShape', onClick: changeShape });
  controlsBody.append(
    ui.solid.root, ui.water.root, ui.lower.root, ui.eye.root,
    el('div', { class: 'btn-row' }, [ui.recV1, ui.recV2, ui.shape]),
    el('div', { class: 'btn-row', style: 'margin-top:8px' }, [
      createButton({ labelKey: 'ctl.clearTable', onClick: () => { st.rows = []; st.V1 = null; st.fb = null; updateMeasures(); }, variant: 'ghost' }),
      createButton({ labelKey: 'ui.reset', onClick: () => resetTab('immersion'), variant: 'ghost' }),
    ]),
  );
  ui.dl = el('dl', { class: 'meas' });
  ui.table = el('table', { class: 'data' });
  ui.status = statusBox();
  measuresBody.append(ui.dl, ui.table, ui.status);
}

function seenReading() {
  const im = immersion();
  const ym = yOfV(im.V);
  return { im, seen: Math.round(vOfY(seenY(S.imm.eyeY, ym))), level: eyeStatus(S.imm.eyeY, ym) === 'level' };
}
function solidLabel() {
  const s = S.imm.solid;
  const base = t(`ctl.${s.id}`);
  return s.id === 'plasticine' ? `${base} (${t(PLASTICINE_SHAPES[s.shape].key)})` : base;
}
function recordV1() {
  const st = S.imm;
  const { im, seen, level } = seenReading();
  if (im.f > 0) { st.fb = { type: 'warn', key: 'fb.takeOut' }; updateMeasures(); return; }
  st.V1 = seen;
  st.V1err = !level;
  st.fb = level ? { type: 'good', key: 'fb.v1Saved', params: { v: num(seen) } } : { type: 'warn', key: 'fb.eyeError' };
  updateMeasures();
}
function recordV2() {
  const st = S.imm;
  if (st.V1 == null) { st.fb = { type: 'warn', key: 'fb.needV1' }; updateMeasures(); return; }
  const { im, seen, level } = seenReading();
  if (im.f < 1) { st.fb = { type: 'warn', key: 'fb.notTotally' }; updateMeasures(); return; }
  const err = st.V1err || !level;
  st.rows.push({ solid: { ...st.solid }, V1: st.V1, V2: seen, err });
  if (st.rows.length > 6) st.rows.shift();
  st.fb = err ? { type: 'warn', key: 'fb.eyeError' } : { type: 'good', key: 'fb.v2Saved', params: { v: num(seen), d: num(seen - st.V1) } };
  st.V1 = null;
  updateMeasures();
}
function changeShape() {
  const st = S.imm;
  if (immersion().f > 0) { st.fb = { type: 'warn', key: 'fb.shapeOut' }; updateMeasures(); return; }
  st.solid.shape = (st.solid.shape + 1) % PLASTICINE_SHAPES.length;
  st.V1 = null;
  st.fb = null;
  updateMeasures();
  requestDraw();
}
function rowLabel(solid) {
  const base = t(`ctl.${solid.id}`);
  return solid.id === 'plasticine' ? `${base} (${t(PLASTICINE_SHAPES[solid.shape].key)})` : base;
}

function updateImmersion() {
  const st = S.imm;
  const { im, seen, level } = seenReading();
  const status = level ? 'level' : eyeStatus(st.eyeY, yOfV(im.V));
  const stateKey = im.f <= 0 ? 'state.out' : im.f >= 1 ? 'state.totally' : 'state.partly';
  measRows([
    [t('m.solidCol'), solidLabel()],
    [t('m.state'), t(stateKey)],
    [t('m.seen'), qty(seen, 0, 'mL')],
    [t('m.eye'), t(`eye.${status}`), level ? 'good-text' : ''],
    ['V1', st.V1 == null ? '—' : qty(st.V1, 0, 'mL')],
  ]);
  const head = el('tr', {}, ['m.solidCol', null, null, 'm.V'].map((k, i) => el('th', {}, k ? t(k) : i === 1 ? 'V1 (mL)' : 'V2 (mL)')));
  const body = st.rows.map((r) => el('tr', {}, [
    el('td', {}, rowLabel(r.solid) + (r.err ? ' ⚠' : '')),
    el('td', {}, num(r.V1)),
    el('td', {}, num(r.V2)),
    el('td', {}, qty(r.V2 - r.V1, 0, 'cm³')),
  ]));
  ui.table.replaceChildren(el('thead', {}, head), el('tbody', {}, body));
  ui.table.hidden = st.rows.length === 0;
  ui.recV1.disabled = im.f > 0;
  ui.recV2.disabled = st.V1 == null || im.f < 1;
  ui.shape.disabled = st.solid.id !== 'plasticine';
  showStatus(ui.status, st.fb);
}

/* ---------- Tab switching / reset ---------- */
function buildTab(id) {
  pourLoop?.stop();
  if (S.cont.anim) { // finish an interrupted pour instantly
    const a = S.cont.anim;
    S.cont.vols[a.from] = 0; S.cont.vols[a.to] = a.amount; S.cont.where = a.to; S.cont.anim = null;
  }
  controlsBody.replaceChildren();
  measuresBody.replaceChildren();
  ui = {};
  if (id === 'read') buildRead();
  else if (id === 'definite') buildDefinite();
  else buildImmersion();
  const scene = id === 'definite' ? CONT_SCENE : CYL_SCENE;
  view.setLogicalSize(scene.w, scene.h);
  updateMeasures();
  requestDraw();
}

function updateMeasures() {
  if (!shell) return;
  if (shell.tab === 'read') updateRead();
  else if (shell.tab === 'definite') updateDefinite();
  else updateImmersion();
}

function resetTab(id) {
  const fresh = initialState();
  if (id === 'read') S.read = fresh.read;
  else if (id === 'definite') S.cont = fresh.cont;
  else S.imm = fresh.imm;
  buildTab(id);
}

onLangChange(() => { updateMeasures(); requestDraw(); });

shell = initSim({
  strings,
  tabs: [
    { id: 'read', labelKey: 'tab.read' },
    { id: 'definite', labelKey: 'tab.definite' },
    { id: 'immersion', labelKey: 'tab.immersion' },
  ],
  initialTab: 'read',
  onTab: buildTab,
});
shell.start();

// Exposed for automated checks (?debug=1)
if (DEBUG) window.__sim = { S, immersion, seenY, yOfV, vOfY, heightOf, volAt, VESSELS, C };
