// Grade 8 — Reflection of light and the plane mirror (Ch.16 Act. 1–5, Ex. 4–9).
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num, qty } from '../../../shared/format.js';
import { createButton, createSegmented, createSlider, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, font } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { label } from '../../../shared/figures.js';
import { calcCell, calcSig } from '../../../shared/calc-cell.js';
import { drawRay, drawMirror, drawLamp, drawEye, drawCandle, LIGHT, reflectPoint, distToLine } from '../../../shared/optics-draw.js';

/* ================================================================
   Model
   ================================================================ */
const D2R = Math.PI / 180;
const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
// Tab "scatter": the light falls at I; the eye moves on an arc around I.
const SC = { ix: 300, iy: 262, lampAng: 140, eyeR: 200 };
// Tab "angles": graduated disk.
const DK = { cx: 300, cy: 250, R: 150 };
// Tab "candles": glass sheet at x = 300, 3 px per cm.
const CD = { gx: 300, base: 270, k: 3 };
// Tab "pins": mirror MM' on y = 165 (top view of the cardboard).
const PN = { my: 165, i1: [240, 165], i2: [360, 165], A: [285, 295], near: 7 };
// Tab "image": vertical mirror at x = 330, 2 px per cm.
const IM = { mx: 330, k: 2 };
const FIELD = { mx: 330, y1: 120, y2: 220, objects: [[60, 60], [120, 300], [210, 170], [40, 200], [250, 40], [150, 120]] };

function initialState() {
  return {
    scatter: { surf: 'book', eyeAng: 60 },
    angles: { mode: 'explore', i: 40, rows: [], task: null, fb: null },
    candles: { dB: 40, dA: 25, side: 'B' },
    pins: { C: [120, 300], D: [520, 300], mirror: true, drawn: false, fb: null },
    image: { mode: 'letter', obj: 'P', dObj: 50, built: 0, place: null, score: { ok: 0, n: 0 }, eye: [200, 250], ray: null },
  };
}
let S = initialState();
let now = 0;

/* ================================================================
   Canvas and loop
   ================================================================ */
const SCENE = { w: 600, h: 340 };
let shell;
let drawQueued = false;
const canvas = document.getElementById('stage');
const view = setupCanvas(canvas, { width: SCENE.w, height: SCENE.h, maxHeightVh: () => (window.innerWidth < 880 ? 48 : 72), onResize: () => requestDraw() });
function requestDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; draw(); });
}
onThemeChange(() => requestDraw());
const loop = createLoop({
  step(dt) { now += dt; return !!shell && shell.tab === 'candles'; },
  render() { draw(); },
});

/* ---------- Geometry ---------- */
// scatter: the reflected direction of the lamp beam (degrees above the surface, measured from the right)
const reflAng = () => 180 - SC.lampAng;
const eyePos = () => [SC.ix + SC.eyeR * Math.cos(S.scatter.eyeAng * D2R), SC.iy - SC.eyeR * Math.sin(S.scatter.eyeAng * D2R)];
const eyeGetsLight = () => (S.scatter.surf === 'book' ? true : Math.abs(S.scatter.eyeAng - reflAng()) <= 4);

// pins: image of A, line of sight of a pin through I
const Aimg = () => reflectPoint(PN.A[0], PN.A[1], 0, PN.my, 600, PN.my);
// a pin hides I and A' when it lies on the line A'I, in front of the mirror
function pinOk(P, I) {
  const [ax, ay] = Aimg();
  return P[1] > PN.my + 10 && distToLine(P[0], P[1], ax, ay, I[0], I[1]) < PN.near;
}
const angleDeg = (ux, uy, vx, vy) => Math.round(Math.acos((ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy))) / D2R);

// image tab: the object (points in cm from the mirror: x = distance in front, y downwards)
function objectPts() {
  const st = S.image;
  const d = st.dObj;
  if (st.obj === 'P') return [['A', d, -30], ['B', d - 22, -30], ['C', d - 22, -8], ['D', d, 30]];
  return [['A', d + 10, -30], ['B', d + 10, 25], ['C', d - 20, 25]];
}
// letter P drawn from its four points: stem A–D, bowl from A to B to C back to the stem
function objectPath(pts, toPx) {
  const p = Object.fromEntries(pts.map(([n, x, y]) => [n, toPx(x, y)]));
  if (S.image.obj === 'P') {
    const mid = toPx(S.image.dObj * 1, -8);
    return [[p.D, p.A, p.B, p.C, mid]];
  }
  return [[p.A, p.B, p.C, p.A]];
}
// object point (cm in front of the mirror) → px; image point → px behind the mirror
const objPx = (x, y) => [IM.mx - x * IM.k, 170 + y * IM.k];
const imgPx = (x, y) => [IM.mx + x * IM.k, 170 + y * IM.k];

function fieldPoly() {
  const [ox, oy] = S.image.eye;
  const ex = 2 * FIELD.mx - ox; // image O' of the eye
  const far = (y) => { const sl = (y - oy) / (FIELD.mx - ex); return [0, y + sl * (0 - FIELD.mx)]; };
  return [[FIELD.mx, FIELD.y1], far(FIELD.y1), far(FIELD.y2), [FIELD.mx, FIELD.y2]];
}
function inPoly(p, poly) {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}

/* ================================================================
   Drawing
   ================================================================ */
function draw() {
  if (!shell) return;
  const ctx = view.begin();
  ctx.fillStyle = cssVar('--scene-bg');
  ctx.fillRect(0, 0, SCENE.w, SCENE.h);
  const tab = shell.tab;
  if (tab === 'scatter') drawScatter(ctx);
  else if (tab === 'angles') drawAngles(ctx);
  else if (tab === 'candles') drawCandles(ctx);
  else if (tab === 'pins') drawPins(ctx);
  else drawImage(ctx);
}
const muted = (ctx, s, x, y, o = {}) => label(ctx, s, x, y, { size: 11, color: cssVar('--muted'), ...o });
const dot = (ctx, x, y, c = '#e74c3c', r = 3.5) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };
const dashed = (ctx, x1, y1, x2, y2, c = cssVar('--muted'), w = 1) => { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.setLineDash([]); };

/* ---------- Tab 1 ---------- */
function drawScatter(ctx) {
  const st = S.scatter;
  ctx.fillStyle = 'rgba(20,24,40,0.06)'; ctx.fillRect(0, 0, SCENE.w, SCENE.h); // dark room
  const { ix, iy } = SC;
  const la = SC.lampAng * D2R;
  const lx = ix + 210 * Math.cos(la), ly = iy - 210 * Math.sin(la);
  if (st.surf === 'book') {
    ctx.fillStyle = '#2e6b8f'; roundRect(ctx, 160, iy, 280, 22, 3); ctx.fill();
    ctx.fillStyle = '#efe6d2'; ctx.fillRect(166, iy + 16, 268, 4);
    muted(ctx, t('book'), 300, iy + 38, { weight: 700 });
  } else {
    drawMirror(ctx, 160, iy, 440, iy, { back: 1 });
    muted(ctx, t('mirror'), 300, iy + 30, { weight: 700 });
  }
  // incident beam
  drawRay(ctx, lx, ly, ix, iy, { arrows: 1, width: 3 });
  ctx.fillStyle = cssVar('--device'); ctx.save(); ctx.translate(lx, ly); ctx.rotate(-la + Math.PI);
  roundRect(ctx, -34, -12, 34, 24, 4); ctx.fill(); ctx.restore();
  drawLamp(ctx, lx, ly, { r: 7 });
  muted(ctx, t('lamp'), lx - 6, ly - 26);
  if (st.surf === 'book') {
    // scattered in all directions
    for (let a = 15; a <= 165; a += 15) drawRay(ctx, ix, iy, ix + 90 * Math.cos(a * D2R), iy - 90 * Math.sin(a * D2R), { arrows: 1, width: 1.4, color: 'rgba(242,183,5,0.8)' });
    ctx.fillStyle = 'rgba(255,230,120,0.7)'; ctx.beginPath(); ctx.ellipse(ix, iy, 18, 4, 0, 0, Math.PI * 2); ctx.fill();
  } else {
    const ra = reflAng() * D2R;
    drawRay(ctx, ix, iy, ix + 260 * Math.cos(ra), iy - 260 * Math.sin(ra), { arrows: 1, width: 3 });
  }
  // the eye looking at I
  const [ex, ey] = eyePos();
  const sees = eyeGetsLight();
  drawEye(ctx, ex, ey, Math.atan2(iy - ey, ix - ex), { sees });
  ctx.strokeStyle = cssVar('--muted'); ctx.setLineDash([2, 5]); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(ix, iy, SC.eyeR, -Math.PI * 0.92, -Math.PI * 0.08); ctx.stroke(); ctx.setLineDash([]);
  muted(ctx, t('hint.dragEye'), 300, 18, { weight: 700 });
}

/* ---------- Tab 2 ---------- */
function drawAngles(ctx) {
  const st = S.angles;
  const { cx, cy, R } = DK;
  const i = st.mode === 'practice' && st.task ? st.task.i : st.i;
  // disk (upper half above the mirror)
  ctx.fillStyle = '#f4f1e6'; ctx.beginPath(); ctx.arc(cx, cy, R + 10, Math.PI, 0); ctx.fill();
  ctx.strokeStyle = '#a89c7a'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(cx, cy, R + 10, Math.PI, 0); ctx.stroke();
  ctx.strokeStyle = '#3a3a3a';
  for (let a = -90; a <= 90; a += 1) {
    const L = a % 10 === 0 ? 14 : a % 5 === 0 ? 9 : 5;
    const th = (90 - a) * D2R; // angle from the horizontal
    const c = Math.cos(th), s = Math.sin(th);
    ctx.lineWidth = a % 10 === 0 ? 1.4 : 0.8;
    ctx.beginPath(); ctx.moveTo(cx + (R + 10) * c, cy - (R + 10) * s); ctx.lineTo(cx + (R + 10 - L) * c, cy - (R + 10 - L) * s); ctx.stroke();
    if (a % 10 === 0) {
      ctx.fillStyle = '#3a3a3a'; ctx.font = font(10, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(Math.abs(a)), cx + (R - 12) * c, cy - (R - 12) * s);
    }
  }
  // normal IN
  dashed(ctx, cx, cy, cx, cy - R - 10, '#2c3e50', 1.3);
  label(ctx, 'N', cx, cy - R - 22, { size: 12, weight: 800 });
  // mirror along 90°–90°
  drawMirror(ctx, cx - R - 30, cy, cx + R + 30, cy, { back: 1, thick: 6 });
  label(ctx, 'I', cx + 8, cy + 14, { size: 12, weight: 800 });
  // rays
  const th = (90 + i) * D2R; // incident comes from the left
  const sx = cx + (R + 40) * Math.cos(th), sy = cy - (R + 40) * Math.sin(th);
  drawRay(ctx, sx, sy, cx, cy, { arrows: 1, width: 2.4, color: '#e74c3c' });
  const rth = (90 - i) * D2R;
  drawRay(ctx, cx, cy, cx + (R + 40) * Math.cos(rth), cy - (R + 40) * Math.sin(rth), { arrows: 1, width: 2.4, color: '#e74c3c' });
  // the light box
  ctx.save(); ctx.translate(sx, sy); ctx.rotate(Math.atan2(cy - sy, cx - sx));
  ctx.fillStyle = cssVar('--device'); roundRect(ctx, -34, -10, 34, 20, 4); ctx.fill(); ctx.restore();
  label(ctx, 'S', sx - 4, sy - 18, { size: 12, weight: 800 });
  label(ctx, 'R', cx + (R + 40) * Math.cos(rth) + 6, cy - (R + 40) * Math.sin(rth) - 14, { size: 12, weight: 800 });
  if (i > 3) {
    ctx.strokeStyle = '#8e44ad'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, 34, -Math.PI / 2 - i * D2R, -Math.PI / 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 40, -Math.PI / 2, -Math.PI / 2 + i * D2R); ctx.stroke();
    label(ctx, 'i', cx - 14, cy - 50, { size: 12, weight: 800, color: '#8e44ad' });
    label(ctx, 'r', cx + 14, cy - 56, { size: 12, weight: 800, color: '#8e44ad' });
  }
  if (st.mode === 'explore') muted(ctx, t('hint.dragS'), 300, 330, { weight: 700 });
  else muted(ctx, t('hint.readDisk'), 300, 330, { weight: 700 });
}

/* ---------- Tab 3 ---------- */
function drawCandles(ctx) {
  const st = S.candles;
  const { gx, base, k } = CD;
  ctx.fillStyle = cssVar('--wood'); ctx.fillRect(10, base, SCENE.w - 20, 40);
  const bx = gx - st.dB * k, ax = gx + st.dA * k, imgX = gx + st.dB * k;
  const fromB = st.side === 'B';
  const coincide = Math.abs(st.dA - st.dB) <= 1;
  // candles
  drawCandle(ctx, bx, base, { lit: true, t: now });
  drawCandle(ctx, ax, base, { lit: false });
  if (fromB) {
    // the image B' of the lit candle (virtual), seen through and in the glass
    drawCandle(ctx, imgX, base, { ghost: true, flame: true, t: now });
    label(ctx, "B'", imgX, base - 104, { size: 12, weight: 800, color: '#e67e22' });
  }
  label(ctx, 'B', bx, base - 104, { size: 12, weight: 800 });
  label(ctx, 'A', ax + (fromB && Math.abs(ax - imgX) < 22 ? 16 : 0), base - 90, { size: 12, weight: 800 });
  // glass sheet
  ctx.fillStyle = 'rgba(160,210,235,0.30)'; ctx.strokeStyle = 'rgba(110,160,200,0.95)'; ctx.lineWidth = 1.5;
  ctx.fillRect(gx - 3, 60, 6, base - 60); ctx.strokeRect(gx - 3, 60, 6, base - 60);
  muted(ctx, t('glass'), gx, 48, { weight: 700 });
  // eye
  const exX = fromB ? 36 : 566;
  drawEye(ctx, exX, 170, fromB ? 0 : Math.PI, { sees: fromB && coincide });
  muted(ctx, t(fromB ? 'eyeB' : 'eyeOther'), exX + (fromB ? -8 : 8), 196, { align: fromB ? 'left' : 'right', weight: 700 });
  // distances
  ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 1;
  for (const [x1, x2, y, s] of [[bx, gx, base + 14, qty(st.dB, 0, 'cm')], [gx, ax, base + 30, qty(st.dA, 0, 'cm')]]) {
    ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.moveTo(x1, y - 4); ctx.lineTo(x1, y + 4); ctx.moveTo(x2, y - 4); ctx.lineTo(x2, y + 4); ctx.stroke();
    label(ctx, s, (x1 + x2) / 2, y - 1, { size: 10, weight: 700 });
  }
  muted(ctx, t('hint.dragCandles'), 300, 18, { weight: 700 });
}

/* ---------- Tab 4 ---------- */
function drawPin(ctx, x, y, name, ok) {
  ctx.fillStyle = ok ? '#2e9d4f' : '#2c3e50'; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ecf0f1'; ctx.beginPath(); ctx.arc(x - 1.5, y - 1.5, 1.6, 0, Math.PI * 2); ctx.fill();
  if (name) label(ctx, name, x + 12, y + 12, { size: 12, weight: 800, color: ok ? '#2e9d4f' : cssVar('--text') });
}
function drawPins(ctx) {
  const st = S.pins;
  const { my, i1, i2, A } = PN;
  const [ax, ay] = Aimg();
  // white cardboard
  ctx.fillStyle = '#fbfbf7'; ctx.fillRect(20, 20, 560, 300); ctx.strokeStyle = cssVar('--border'); ctx.strokeRect(20, 20, 560, 300);
  // line MM' and the normals
  ctx.strokeStyle = '#555'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(40, my); ctx.lineTo(560, my); ctx.stroke();
  label(ctx, 'M', 32, my - 10, { size: 11, weight: 800 }); label(ctx, "M'", 566, my - 10, { size: 11, weight: 800 });
  for (const [I, n] of [[i1, 1], [i2, 2]]) { dashed(ctx, I[0], my, I[0], my + 120, '#2c3e50'); label(ctx, `N${n}`, I[0] + 12, my + 118, { size: 11, weight: 800 }); }
  if (st.mirror) drawMirror(ctx, 60, my, 540, my, { back: -1 });
  // segments AI1, AI2 (incident rays)
  for (const I of [i1, i2]) drawRay(ctx, A[0], A[1], I[0], I[1], { arrows: 1, width: 1.6 });
  // image of the nail seen in the mirror
  if (st.mirror) {
    ctx.globalAlpha = 0.5; dot(ctx, ax, ay, '#555', 6); ctx.globalAlpha = 1;
    label(ctx, "A'", ax + 14, ay, { size: 12, weight: 800, color: '#777' });
  }
  // lines of sight of the pins (dashed while placing)
  const okC = pinOk(st.C, i1), okD = pinOk(st.D, i2);
  if (!st.drawn) {
    for (const [P, I, ok] of [[st.C, i1, okC], [st.D, i2, okD]]) {
      const dx = I[0] - P[0], dy = I[1] - P[1];
      dashed(ctx, P[0], P[1], P[0] + dx * 1.8, P[1] + dy * 1.8, ok ? '#2e9d4f' : 'rgba(120,120,120,0.6)');
    }
  } else {
    // lines I1C and I2D: reflected rays, their extensions behind the mirror meet at A'
    drawRay(ctx, i1[0], i1[1], st.C[0], st.C[1], { arrows: 1, width: 1.8 });
    drawRay(ctx, i2[0], i2[1], st.D[0], st.D[1], { arrows: 1, width: 1.8 });
    dashed(ctx, i1[0], i1[1], ax, ay, '#e67e22', 1.4); dashed(ctx, i2[0], i2[1], ax, ay, '#e67e22', 1.4);
    dot(ctx, ax, ay, '#e67e22', 4.5);
    label(ctx, "A'", ax + 14, ay, { size: 12, weight: 800, color: '#e67e22' });
    dashed(ctx, A[0], A[1], ax, ay, '#8e44ad');
  }
  // nail, pins at I1 and I2, pins C and D
  dot(ctx, A[0], A[1], '#7f8c8d', 6); label(ctx, 'A', A[0] + 14, A[1] + 4, { size: 12, weight: 800 });
  drawPin(ctx, i1[0], i1[1], null); drawPin(ctx, i2[0], i2[1], null);
  label(ctx, 'I1', i1[0] - 14, my - 12, { size: 11, weight: 800 }); label(ctx, 'I2', i2[0] + 14, my - 12, { size: 11, weight: 800 });
  drawPin(ctx, st.C[0], st.C[1], 'C', okC); drawPin(ctx, st.D[0], st.D[1], 'D', okD);
  if (!st.drawn) muted(ctx, t('hint.dragPins'), 300, 334, { weight: 700 });
}

/* ---------- Tab 5 ---------- */
function drawImage(ctx) {
  const st = S.image;
  if (st.mode === 'field') return drawField(ctx);
  const mx = IM.mx;
  drawMirror(ctx, mx, 20, mx, 320, { back: -1 });
  muted(ctx, t('mirror'), mx + 30, 14, { weight: 700 });
  if (st.mode === 'place') return drawPlace(ctx);
  const pts = objectPts();
  // object
  ctx.strokeStyle = '#2c3e50'; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (const poly of objectPath(pts, objPx)) { ctx.beginPath(); poly.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); }
  pts.forEach(([n, x, y]) => { const [px, py] = objPx(x, y); dot(ctx, px, py, '#2c3e50', 4); label(ctx, n, px - 14, py - 8, { size: 12, weight: 800 }); });
  // construction of the image points one by one: perpendicular to the mirror, same distance behind it
  pts.slice(0, st.built).forEach(([n, x, y]) => {
    const [px, py] = objPx(x, y), [qx, qy] = imgPx(x, y);
    dashed(ctx, px, py, qx, qy, '#8e44ad');
    ctx.strokeStyle = '#8e44ad'; ctx.lineWidth = 1; ctx.strokeRect(mx - 6, py - 6, 6, 6);
    dot(ctx, qx, qy, '#e67e22', 4);
    label(ctx, `${n}'`, qx + 14, qy - 8, { size: 12, weight: 800, color: '#e67e22' });
  });
  if (st.built >= pts.length) {
    ctx.strokeStyle = '#e67e22'; ctx.lineWidth = 3; ctx.setLineDash([7, 4]);
    for (const poly of objectPath(pts, imgPx)) { ctx.beginPath(); poly.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); }
    ctx.setLineDash([]);
    muted(ctx, t('virtualImage'), mx + 120, 314, { weight: 700, color: '#e67e22' });
  }
  muted(ctx, t('object'), mx - 160, 314, { weight: 700 });
}
function drawPlace(ctx) {
  const st = S.image;
  const p = st.place;
  if (!p) return;
  dot(ctx, p.A[0], p.A[1], '#2c3e50', 5);
  label(ctx, 'A', p.A[0] - 14, p.A[1] - 10, { size: 12, weight: 800 });
  const q = [2 * IM.mx - p.A[0], p.A[1]];
  if (p.tap) {
    ctx.strokeStyle = p.ok ? '#2e9d4f' : '#c0392b'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(p.tap[0] - 6, p.tap[1] - 6); ctx.lineTo(p.tap[0] + 6, p.tap[1] + 6); ctx.moveTo(p.tap[0] + 6, p.tap[1] - 6); ctx.lineTo(p.tap[0] - 6, p.tap[1] + 6); ctx.stroke();
  }
  if (p.shown) {
    dashed(ctx, p.A[0], p.A[1], q[0], q[1], '#8e44ad');
    dot(ctx, q[0], q[1], '#e67e22', 5);
    label(ctx, "A'", q[0] + 14, q[1] - 10, { size: 12, weight: 800, color: '#e67e22' });
  }
  if (!p.tap) label(ctx, t('hint.tapImage'), 300, 334, { size: 12, weight: 800, color: cssVar('--accent') });
}
function drawField(ctx) {
  const st = S.image;
  const { mx, y1, y2, objects } = FIELD;
  const [ox, oy] = st.eye;
  const poly = fieldPoly();
  ctx.fillStyle = 'rgba(46,157,79,0.13)';
  ctx.beginPath(); poly.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill();
  const oix = 2 * mx - ox;
  // limits of the field: from O' through the edges of the mirror
  for (const y of [y1, y2]) {
    dashed(ctx, oix, oy, mx, y, '#2e9d4f');
    const far = poly[y === y1 ? 1 : 2];
    ctx.strokeStyle = '#2e9d4f'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(mx, y); ctx.lineTo(far[0], far[1]); ctx.stroke();
  }
  drawMirror(ctx, mx, y1, mx, y2, { back: -1 });
  label(ctx, 'M', mx + 16, y1 - 8, { size: 12, weight: 800 });
  // objects
  objects.forEach(([x, y], k) => {
    const seen = inPoly([x, y], poly);
    ctx.fillStyle = seen ? '#2e9d4f' : '#95a5a6';
    ctx.beginPath(); for (let j = 0; j < 10; j++) { const r = j % 2 ? 4 : 9, a = (j * Math.PI) / 5 - Math.PI / 2; ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a)); } ctx.closePath(); ctx.fill();
    label(ctx, String(k + 1), x + 14, y - 8, { size: 11, weight: 800, color: seen ? '#2e9d4f' : cssVar('--muted') });
  });
  // a ray from a chosen object to the eye (Ex. 8)
  if (st.ray != null) {
    const [px, py] = objects[st.ray];
    if (inPoly([px, py], poly)) {
      const pix = 2 * mx - px; // image of the object
      const yI = oy + ((py - oy) * (mx - ox)) / (pix - ox);
      drawRay(ctx, px, py, mx, yI, { arrows: 1, width: 2 });
      drawRay(ctx, mx, yI, ox, oy, { arrows: 1, width: 2 });
      dashed(ctx, mx, yI, pix, py, '#e67e22');
      dot(ctx, pix, py, '#e67e22', 3.5);
      label(ctx, `${st.ray + 1}'`, pix + 12, py - 8, { size: 11, weight: 800, color: '#e67e22' });
    }
  }
  dot(ctx, oix, oy, '#7f8c8d', 3.5); label(ctx, "O'", oix + 14, oy - 8, { size: 12, weight: 800, color: '#7f8c8d' });
  drawEye(ctx, ox, oy, 0, { size: 11 });
  label(ctx, 'O', ox - 4, oy + 20, { size: 12, weight: 800 });
  muted(ctx, t('hint.field'), 300, 334, { weight: 700 });
}

/* ================================================================
   Pointer
   ================================================================ */
let dragging = null;
canvas.addEventListener('pointerdown', (ev) => {
  if (!shell) return;
  const p = view.toLogical(ev);
  const tab = shell.tab;
  if (tab === 'scatter') dragging = 'eye';
  else if (tab === 'angles' && S.angles.mode === 'explore' && p.x < DK.cx + 10 && p.y < DK.cy + 10) dragging = 'S';
  else if (tab === 'candles') {
    const st = S.candles;
    const bx = CD.gx - st.dB * CD.k, ax = CD.gx + st.dA * CD.k;
    if (Math.abs(p.x - bx) < 30 && p.x < CD.gx) dragging = 'B';
    else if (Math.abs(p.x - ax) < 30 && p.x > CD.gx) dragging = 'A';
  } else if (tab === 'pins') {
    const st = S.pins;
    if (st.drawn) return;
    if (Math.hypot(p.x - st.C[0], p.y - st.C[1]) < 28) dragging = 'C';
    else if (Math.hypot(p.x - st.D[0], p.y - st.D[1]) < 28) dragging = 'D';
  } else if (tab === 'image') {
    const st = S.image;
    if (st.mode === 'place' && st.place && !st.place.tap) { tapImage(p); return; }
    if (st.mode === 'field') {
      const k = FIELD.objects.findIndex(([x, y]) => Math.hypot(p.x - x, p.y - y) < 18);
      if (k >= 0) { st.ray = k; refresh(); return; }
      dragging = 'O';
    } else if (st.mode === 'letter' && p.x < IM.mx) dragging = 'obj';
  }
  if (dragging) { canvas.setPointerCapture(ev.pointerId); ev.preventDefault(); onDrag(p); }
});
canvas.addEventListener('pointermove', (ev) => { if (dragging) onDrag(view.toLogical(ev)); });
const endDrag = () => { dragging = null; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
function onDrag(p) {
  if (dragging === 'eye') {
    const a = Math.atan2(SC.iy - p.y, p.x - SC.ix) / D2R;
    S.scatter.eyeAng = Math.round(Math.max(12, Math.min(168, a)));
    ui.eye?.set(S.scatter.eyeAng);
  } else if (dragging === 'S') {
    const a = Math.atan2(p.x - DK.cx, DK.cy - p.y) / D2R; // angle from the normal, negative on the left
    S.angles.i = Math.max(0, Math.min(85, Math.round(-a)));
    ui.i?.set(S.angles.i);
  } else if (dragging === 'B' || dragging === 'A') {
    const d = Math.round(Math.abs(p.x - CD.gx) / CD.k);
    S.candles[dragging === 'B' ? 'dB' : 'dA'] = Math.max(8, Math.min(85, d));
  } else if (dragging === 'C' || dragging === 'D') {
    const st = S.pins;
    let P = [Math.max(30, Math.min(570, p.x)), Math.max(PN.my + 14, Math.min(312, p.y))];
    // snap on the line of sight A'I when close
    const I = dragging === 'C' ? PN.i1 : PN.i2;
    const [ax, ay] = Aimg();
    if (distToLine(P[0], P[1], ax, ay, I[0], I[1]) < PN.near) {
      const dx = I[0] - ax, dy = I[1] - ay, L2 = dx * dx + dy * dy;
      const u = ((P[0] - ax) * dx + (P[1] - ay) * dy) / L2;
      P = [ax + u * dx, ay + u * dy];
    }
    st[dragging] = P; st.fb = null;
  } else if (dragging === 'O') {
    S.image.eye = [Math.max(40, Math.min(FIELD.mx - 30, p.x)), Math.max(40, Math.min(300, p.y))];
  } else if (dragging === 'obj') {
    S.image.dObj = Math.max(30, Math.min(140, Math.round((IM.mx - p.x) / IM.k)));
    ui.dObj?.set(S.image.dObj);
  }
  refresh();
}
function tapImage(p) {
  const st = S.image;
  const q = [2 * IM.mx - st.place.A[0], st.place.A[1]];
  const ok = Math.hypot(p.x - q[0], p.y - q[1]) <= 12;
  st.place.tap = [p.x, p.y]; st.place.ok = ok; st.place.shown = true;
  st.score.n += 1; if (ok) st.score.ok += 1;
  refresh();
}
function newPlace() {
  S.image.place = { A: [randInt(60, IM.mx - 40), randInt(50, 290)], tap: null, ok: null, shown: false };
}

/* ================================================================
   Controls and measurements
   ================================================================ */
const controlsBody = document.getElementById('controls-body');
const measuresBody = document.getElementById('measures-body');
let ui = {};
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
const yn = (b) => t(b ? 'yes' : 'no');
const resetBtn = (id) => btnRow(createButton({ labelKey: 'ui.reset', variant: 'ghost', onClick: () => resetTab(id) }));
const deg = (v) => `${num(v, 0)}°`;

/* ---------- Tab 1 ---------- */
function buildScatter() {
  const st = S.scatter;
  ui.surf = createSegmented({
    labelKey: 'ctl.surface', options: [{ value: 'book', labelKey: 'surf.book' }, { value: 'mirror', labelKey: 'surf.mirror' }], value: st.surf,
    onChange: (v) => { st.surf = v; refresh(); },
  });
  ui.eye = createSlider({ labelKey: 'ctl.eye', min: 12, max: 168, step: 1, value: st.eyeAng, unit: '°', onInput: (v) => { st.eyeAng = v; refresh(); } });
  controlsBody.append(ui.surf.root, ui.eye.root, resetBtn('scatter'));
  ui.dl = el('dl', { class: 'meas' }); measuresBody.append(ui.dl);
}
function updateScatter() {
  const st = S.scatter;
  ui.surf.set(st.surf);
  const sees = eyeGetsLight();
  measRows(ui.dl, [
    [t('m.surface'), t(`surf.${st.surf}`)],
    [t('m.sentBack'), t(st.surf === 'book' ? 'back.all' : 'back.one')],
    [t('m.eyeSees'), yn(sees), sees ? 'good-text' : 'bad-text'],
  ]);
}

/* ---------- Tab 2 ---------- */
let rowsSig = '';
function newTask() {
  let i; do { i = randInt(8, 82); } while (i % 5 === 0);
  S.angles.task = { i, i_: null };
}
function buildAngles() {
  const st = S.angles;
  ui.mode = createSegmented({
    labelKey: 'ctl.mode', options: [{ value: 'explore', labelKey: 'mode.explore' }, { value: 'practice', labelKey: 'mode.practice' }], value: st.mode,
    onChange: (v) => { st.mode = v; st.fb = null; if (v === 'practice') newTask(); buildTab('angles'); },
  });
  controlsBody.append(ui.mode.root);
  if (st.mode === 'explore') {
    ui.i = createSlider({ labelKey: 'ctl.i', min: 0, max: 85, step: 1, value: st.i, unit: '°', onInput: (v) => { st.i = v; refresh(); } });
    controlsBody.append(ui.i.root, btnRow(createButton({ labelKey: 'ctl.record', variant: 'primary', onClick: () => {
      if (st.rows.some((r) => r.i === st.i)) st.fb = { type: 'warn', key: 'fb.already' };
      else { st.rows.push({ i: st.i, r: st.i }); st.rows.sort((a, b) => a.i - b.i); st.fb = null; }
      refresh();
    } })));
  } else {
    controlsBody.append(btnRow(createButton({ labelKey: 'ctl.newAngle', variant: 'primary', onClick: () => { newTask(); st.fb = null; rowsSig = ''; refresh(); } })), hint('hint.practice'));
  }
  controlsBody.append(resetBtn('angles'));
  ui.dl = el('dl', { class: 'meas' });
  ui.table = el('table', { class: 'data' });
  ui.clear = el('div', { class: 'btn-row', style: 'margin-top:8px' }, [createButton({ labelKey: 'ctl.clearTable', variant: 'ghost', onClick: () => { st.rows = []; st.fb = null; refresh(); } })]);
  ui.status = statusBox();
  measuresBody.append(ui.dl, ui.table, ui.clear, ui.status);
}
function updateAngles() {
  const st = S.angles;
  ui.mode.set(st.mode);
  if (st.mode === 'explore') {
    measRows(ui.dl, [[t('m.i'), deg(st.i)], [t('m.r'), deg(st.i)]]);
    const show = st.rows.length > 0;
    const sig = 'e' + JSON.stringify(st.rows) + t('col.i');
    if (show && sig !== rowsSig) {
      ui.table.replaceChildren(el('thead', {}, el('tr', {}, [el('th', {}, t('col.i')), el('th', {}, t('col.r'))])),
        el('tbody', {}, st.rows.map((r) => el('tr', {}, [el('td', {}, deg(r.i)), el('td', {}, deg(r.r))]))));
      rowsSig = sig;
    }
    ui.table.hidden = !show; ui.clear.hidden = !show;
  } else {
    measRows(ui.dl, [[t('m.i'), '?'], [t('m.r'), '?']]);
    const r = st.task;
    const sig = 'p' + r.i + calcSig([r]) + t('col.i');
    if (sig !== rowsSig) {
      const cb = (res) => {
        st.fb = res === 'invalid' ? { type: 'warn', key: 'calcInvalid' } : res === 'wrong' ? { type: 'bad', key: 'fb.readWrong' } : { type: 'good', key: 'fb.readOk' };
        refresh();
      };
      ui.table.replaceChildren(el('thead', {}, el('tr', {}, [el('th', {}, t('col.i')), el('th', {}, t('col.r'))])),
        el('tbody', {}, el('tr', {}, [calcCell(r, 'i', { expected: r.i, decimals: 0, tol: 1, onCheck: cb }), calcCell(r, 'r', { expected: r.i, decimals: 0, tol: 1, onCheck: cb })])));
      rowsSig = 'p' + r.i + calcSig([r]) + t('col.i');
    }
    ui.table.hidden = false; ui.clear.hidden = true;
  }
  showStatus(ui.status, st.fb);
}

/* ---------- Tab 3 ---------- */
function buildCandles() {
  const st = S.candles;
  ui.side = createSegmented({
    labelKey: 'ctl.look', options: [{ value: 'B', labelKey: 'look.B' }, { value: 'other', labelKey: 'look.other' }], value: st.side,
    onChange: (v) => { st.side = v; refresh(); },
  });
  ui.dA = createSlider({ labelKey: 'ctl.dA', min: 8, max: 85, step: 1, value: st.dA, unit: 'cm', onInput: (v) => { st.dA = v; refresh(); } });
  ui.dB = createSlider({ labelKey: 'ctl.dB', min: 8, max: 85, step: 1, value: st.dB, unit: 'cm', onInput: (v) => { st.dB = v; refresh(); } });
  controlsBody.append(ui.side.root, ui.dB.root, ui.dA.root, resetBtn('candles'));
  ui.dl = el('dl', { class: 'meas' }); measuresBody.append(ui.dl);
}
function updateCandles() {
  const st = S.candles;
  ui.side.set(st.side); ui.dA.set(st.dA); ui.dB.set(st.dB);
  const co = Math.abs(st.dA - st.dB) <= 1;
  const fromB = st.side === 'B';
  measRows(ui.dl, [
    [t('m.dB'), qty(st.dB, 0, 'cm')],
    [t('m.dA'), qty(st.dA, 0, 'cm')],
    [t('m.seemsLit'), fromB ? yn(co) : t('no'), fromB && co ? 'good-text' : ''],
    [t('m.reallyLit'), t('no')],
  ]);
}

/* ---------- Tab 4 ---------- */
function buildPins() {
  const st = S.pins;
  ui.draw = createButton({ labelKey: 'ctl.removeDraw', variant: 'primary', onClick: () => {
    if (!pinOk(st.C, PN.i1) || !pinOk(st.D, PN.i2)) { st.fb = { type: 'warn', key: 'fb.pinsFirst' }; refresh(); return; }
    st.mirror = false; st.drawn = true; st.fb = { type: 'good', key: 'fb.meet' }; refresh();
  } });
  controlsBody.append(btnRow(ui.draw), hint('hint.pins'), resetBtn('pins'));
  ui.dl = el('dl', { class: 'meas' }); ui.status = statusBox();
  measuresBody.append(ui.dl, ui.status);
}
function updatePins() {
  const st = S.pins;
  const okC = pinOk(st.C, PN.i1), okD = pinOk(st.D, PN.i2);
  ui.draw.disabled = st.drawn;
  const rows = [
    [t('m.pinC'), t(okC ? 'pin.ok' : 'pin.no'), okC ? 'good-text' : ''],
    [t('m.pinD'), t(okD ? 'pin.ok' : 'pin.no'), okD ? 'good-text' : ''],
  ];
  if (st.drawn) {
    const { A, i1, i2 } = PN;
    // angles read with the protractor (normal pointing towards A's side)
    const a1 = angleDeg(A[0] - i1[0], A[1] - i1[1], 0, 1), b1 = angleDeg(st.C[0] - i1[0], st.C[1] - i1[1], 0, 1);
    const a2 = angleDeg(A[0] - i2[0], A[1] - i2[1], 0, 1), b2 = angleDeg(st.D[0] - i2[0], st.D[1] - i2[1], 0, 1);
    rows.push([t('m.AI1N1'), deg(a1)], [t('m.N1I1C'), deg(b1)], [t('m.AI2N2'), deg(a2)], [t('m.N2I2D'), deg(b2)]);
    // the cardboard is drawn at 10 px per cm
    const [, ay] = Aimg();
    rows.push([t('m.dAM'), qty((PN.A[1] - PN.my) / 10, 1, 'cm')], [t('m.dApM'), qty((PN.my - ay) / 10, 1, 'cm')]);
  }
  measRows(ui.dl, rows);
  showStatus(ui.status, st.fb);
}

/* ---------- Tab 5 ---------- */
function buildImage() {
  const st = S.image;
  ui.mode = createSegmented({
    labelKey: 'ctl.mode', options: ['letter', 'place', 'field'].map((v) => ({ value: v, labelKey: `imode.${v}` })), value: st.mode,
    onChange: (v) => { st.mode = v; if (v === 'place' && !st.place) newPlace(); buildTab('image'); },
  });
  controlsBody.append(ui.mode.root);
  if (st.mode === 'letter') {
    ui.obj = createSegmented({
      labelKey: 'ctl.object', options: [{ value: 'P', labelKey: 'obj.P' }, { value: 'tri', labelKey: 'obj.tri' }], value: st.obj,
      onChange: (v) => { st.obj = v; st.built = 0; refresh(); },
    });
    ui.dObj = createSlider({ labelKey: 'ctl.dObj', min: 30, max: 140, step: 1, value: st.dObj, unit: 'cm', onInput: (v) => { st.dObj = v; refresh(); } });
    ui.next = createButton({ labelKey: 'ctl.construct', variant: 'primary', onClick: () => { st.built = Math.min(objectPts().length, st.built + 1); refresh(); } });
    controlsBody.append(ui.obj.root, ui.dObj.root, btnRow(ui.next,
      createButton({ labelKey: 'ctl.constructAll', variant: 'secondary', onClick: () => { st.built = objectPts().length; refresh(); } }),
      createButton({ labelKey: 'ctl.erase', variant: 'ghost', onClick: () => { st.built = 0; refresh(); } })));
  } else if (st.mode === 'place') {
    controlsBody.append(btnRow(createButton({ labelKey: 'ctl.newPoint', variant: 'primary', onClick: () => { newPlace(); refresh(); } })), hint('hint.place'));
  } else {
    controlsBody.append(hint('hint.fieldCtl'));
  }
  controlsBody.append(resetBtn('image'));
  ui.dl = el('dl', { class: 'meas' }); ui.status = statusBox();
  measuresBody.append(ui.dl, ui.status);
}
function updateImage() {
  const st = S.image;
  ui.mode.set(st.mode);
  if (st.mode === 'letter') {
    ui.obj.set(st.obj);
    const pts = objectPts();
    const label0 = pts[st.built]?.[0];
    ui.next.textContent = label0 ? t('ctl.constructPt', { p: label0 }) : t('ctl.done');
    ui.next.disabled = !label0;
    const d = pts[0][1];
    measRows(ui.dl, [
      [t('m.dObjA'), qty(d, 0, 'cm')],
      [t('m.dImgA'), st.built > 0 ? qty(d, 0, 'cm') : '—'],
      [t('m.AA'), st.built > 0 ? qty(2 * d, 0, 'cm') : '—'],
      [t('m.size'), st.built >= pts.length ? t('size.same') : '—'],
    ]);
    showStatus(ui.status, null);
  } else if (st.mode === 'place') {
    const p = st.place;
    measRows(ui.dl, [[t('m.score'), `${st.score.ok} / ${st.score.n}`]]);
    showStatus(ui.status, p?.tap ? (p.ok ? { type: 'good', key: 'fb.placeOk' } : { type: 'bad', key: 'fb.placeWrong' }) : null);
  } else {
    const poly = fieldPoly();
    const seen = FIELD.objects.map((o, k) => (inPoly(o, poly) ? k + 1 : null)).filter((k) => k);
    measRows(ui.dl, [[t('m.seen'), seen.length ? seen.join(', ') : '—', seen.length ? 'good-text' : '']]);
    showStatus(ui.status, st.ray != null && !inPoly(FIELD.objects[st.ray], poly) ? { type: 'warn', key: 'fb.notSeen' } : null);
  }
}

/* ---------- Tab switching ---------- */
const TABS = ['scatter', 'angles', 'candles', 'pins', 'image'];
function buildTab(id) {
  controlsBody.replaceChildren();
  measuresBody.replaceChildren();
  ui = {};
  rowsSig = '';
  if (id === 'scatter') buildScatter();
  else if (id === 'angles') buildAngles();
  else if (id === 'candles') buildCandles();
  else if (id === 'pins') buildPins();
  else buildImage();
  loop.start();
  refresh();
}
function updateMeasures() {
  if (!shell || !ui.dl) return;
  const tab = shell.tab;
  if (tab === 'scatter') updateScatter();
  else if (tab === 'angles') updateAngles();
  else if (tab === 'candles') updateCandles();
  else if (tab === 'pins') updatePins();
  else updateImage();
}
function refresh() { updateMeasures(); requestDraw(); }
function resetTab(id) { S[id] = initialState()[id]; if (id === 'image' && S.image.mode === 'place') newPlace(); buildTab(id); }

onLangChange(() => { if (shell) buildTab(shell.tab); });

shell = initSim({
  strings,
  tabs: TABS.map((id) => ({ id, labelKey: `tab.${id}` })),
  initialTab: 'scatter',
  onTab: (id) => buildTab(id),
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, Aimg, pinOk, fieldPoly, inPoly, newPlace };
