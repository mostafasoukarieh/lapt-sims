// Grade 8 — Rectilinear propagation of light (Ch.15 Act. 1–4, Ex. 5–6, further study: umbra, penumbra, eclipses).
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange, getLang } from '../../../shared/i18n.js';
import { num, qty } from '../../../shared/format.js';
import { createButton, createSegmented, createSlider, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, font } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { label } from '../../../shared/figures.js';
import { drawRay, drawLamp, drawEye, LIGHT } from '../../../shared/optics-draw.js';

/* ================================================================
   Model
   ================================================================ */
// Tab "cards": lamp and eye at the same height; three cards with a hole each (side view).
const CARD = { lampX: 60, eyeX: 545, y0: 175, xs: [210, 310, 410], hole: 5, h: 130 };
// Tab "shadow", pencil: 6 px per cm, pencil AB = 10 cm at x = 40 cm.
const SH = { x0: 20, k: 6, pencilX: 40, AB: 10, yc: 175 };
// Tab "shadow", stick (Ex. 6): ground, 160 px per m, stick 50 cm.
const ST = { groundY: 292, k: 160, sx: 70, stick: 0.5 };

function initialState() {
  return {
    bodies: { body: 'glass' },
    cards: { ys: [148, 205, 186], stretched: false, anim: null },
    beams: { src: 'four', type: 'converging' },
    shadow: { mode: 'pencil', sx: 15, sy: SH.yc, screen: 70, h: 1, d: 0.5 },
    umbra: { mode: 'ball', rs: 22, screen: 520, moon: 60, moonS: 40 },
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
  step(dt) {
    now += dt;
    if (!shell) return false;
    if (shell.tab === 'cards') {
      const st = S.cards;
      if (st.anim) {
        let done = true;
        st.ys = st.ys.map((y) => { const ny = y + (CARD.y0 - y) * Math.min(1, dt * 5); if (Math.abs(ny - CARD.y0) > 0.3) done = false; return ny; });
        if (done) { st.ys = st.ys.map(() => CARD.y0); st.anim = null; }
        return true;
      }
    }
    return false;
  },
  render() { draw(); updateMeasures(); },
});

/* ---------- Geometry ---------- */
// Path of the light through the holes of the cards: returns { pts, reaches } (reaches = enters the eye)
function cardsPath() {
  const st = S.cards;
  const pts = [[CARD.lampX, CARD.y0]];
  // the light that enters the first hole goes on along the line lamp → hole 1
  const y1 = st.ys[0];
  const slope = (y1 - CARD.y0) / (CARD.xs[0] - CARD.lampX);
  const yAt = (x) => CARD.y0 + slope * (x - CARD.lampX);
  pts.push([CARD.xs[0], y1]);
  for (let k = 1; k < 3; k++) {
    const y = yAt(CARD.xs[k]);
    pts.push([CARD.xs[k], y]);
    if (Math.abs(y - st.ys[k]) > CARD.hole) return { pts, reaches: false, blockedAt: k };
  }
  const ye = yAt(CARD.eyeX - 14);
  pts.push([CARD.eyeX - 14, ye]);
  return { pts, reaches: Math.abs(ye - CARD.y0) < 6, blockedAt: null };
}
const aligned = () => S.cards.ys.every((y) => Math.abs(y - CARD.y0) < 0.6);

// Shadow of the pencil on the screen (cm). A top, B bottom.
function pencilShadow() {
  const st = S.shadow;
  const yA = -SH.AB / 2, yB = SH.AB / 2; // cm, relative to the axis (downwards positive)
  const sY = (st.sy - SH.yc) / SH.k;
  const f = (st.screen - st.sx) / (SH.pencilX - st.sx);
  return { a: sY + (yA - sY) * f, b: sY + (yB - sY) * f, size: (yB - yA) * f };
}
const cmX = (x) => SH.x0 + x * SH.k;
const cmY = (y) => SH.yc + y * SH.k;

// Stick (Ex. 6): length of the shadow on the ground (m), Infinity when S is at the height of the stick top
function stickShadow() {
  const { h, d } = S.shadow;
  if (h <= ST.stick + 1e-9) return Infinity;
  return (d * ST.stick) / (h - ST.stick);
}

// Umbra and penumbra behind a round body, the source and the body seen as segments (half sizes rs, rb).
// ys, yb: heights of the centres (the body may be off the axis, as the Moon in an eclipse of the Sun).
function cones(xs, ys, rs, xb, yb, rb, x) {
  const at = (x1, y1, x2, y2) => y1 + ((y2 - y1) * (x - x1)) / (x2 - x1);
  const uTop = at(xs, ys - rs, xb, yb - rb), uBot = at(xs, ys + rs, xb, yb + rb); // limits of the umbra
  const pTop = at(xs, ys + rs, xb, yb - rb), pBot = at(xs, ys - rs, xb, yb + rb); // outer limits of the penumbra
  const dx = xb - xs;
  return { uTop, uBot, pTop, pBot, umbra: Math.max(0, (uBot - uTop) / 2), pen: (pBot - pTop) / 2, apex: rs > rb ? xb + (rb * dx) / (rs - rb) : Infinity };
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
  if (tab === 'bodies') drawBodies(ctx);
  else if (tab === 'cards') drawCards(ctx);
  else if (tab === 'beams') drawBeams(ctx);
  else if (tab === 'shadow') drawShadow(ctx);
  else drawUmbra(ctx);
}
const muted = (ctx, s, x, y, o = {}) => label(ctx, s, x, y, { size: 11, color: cssVar('--muted'), ...o });

/* ---------- Tab 1: transparent / opaque ---------- */
function drawBodies(ctx) {
  const st = S.bodies;
  const y = 170, lx = 80, bx = 300, ex = 530;
  ctx.fillStyle = cssVar('--wood'); ctx.fillRect(10, 280, SCENE.w - 20, 40);
  ctx.fillStyle = cssVar('--device'); ctx.fillRect(lx - 4, y + 12, 8, 98); ctx.fillRect(lx - 24, 274, 48, 8);
  drawLamp(ctx, lx, y, { r: 13 });
  muted(ctx, t('lamp'), lx, y - 38);
  const opaque = st.body === 'book' || st.body === 'wood';
  // rays from the lamp
  for (const sl of [-0.2, -0.1, 0, 0.1, 0.2]) {
    const x2 = !opaque ? ex - 16 : bx - 14;
    drawRay(ctx, lx + 16, y + sl * 16, x2, y + sl * (x2 - lx), { arrows: 1, width: sl === 0 ? 2.2 : 1.4 });
  }
  // the body
  if (st.body === 'glass') {
    ctx.fillStyle = 'rgba(160,210,235,0.35)'; ctx.strokeStyle = 'rgba(110,160,200,0.95)'; ctx.lineWidth = 2;
    ctx.fillRect(bx - 6, 70, 12, 210); ctx.strokeRect(bx - 6, 70, 12, 210);
    muted(ctx, t('body.glass'), bx, 56);
  } else if (st.body === 'book') {
    ctx.fillStyle = '#9c3d2e'; roundRect(ctx, bx - 14, 92, 28, 170, 3); ctx.fill();
    ctx.fillStyle = '#efe6d2'; ctx.fillRect(bx + 8, 96, 4, 162);
    muted(ctx, t('body.book'), bx, 78);
  } else if (st.body === 'wood') {
    ctx.fillStyle = '#b07a43'; ctx.fillRect(bx - 8, 70, 16, 210);
    ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1; for (let yy = 80; yy < 280; yy += 22) { ctx.beginPath(); ctx.moveTo(bx - 8, yy); ctx.quadraticCurveTo(bx, yy + 6, bx + 8, yy); ctx.stroke(); }
    muted(ctx, t('body.wood'), bx, 56);
  }
  drawEye(ctx, ex, y, Math.PI, { sees: !opaque });
  muted(ctx, t('eye'), ex, y + 26);
}

/* ---------- Tab 2: three cards ---------- */
function drawCards(ctx) {
  const st = S.cards;
  const tableY = 280;
  ctx.fillStyle = cssVar('--wood'); ctx.fillRect(10, tableY, SCENE.w - 20, 40);
  ctx.fillStyle = cssVar('--device'); ctx.fillRect(CARD.lampX - 4, CARD.y0 + 12, 8, tableY - CARD.y0 - 12);
  drawLamp(ctx, CARD.lampX, CARD.y0, { r: 12 });
  muted(ctx, t('lamp'), CARD.lampX, CARD.y0 - 36);
  const path = cardsPath();
  // light: lamp → first card (a wide cone), then the thin beam through the holes
  ctx.fillStyle = 'rgba(255,214,80,0.18)';
  ctx.beginPath(); ctx.moveTo(CARD.lampX, CARD.y0); ctx.lineTo(CARD.xs[0] - 5, st.ys[0] - CARD.h / 2); ctx.lineTo(CARD.xs[0] - 5, st.ys[0] + CARD.h / 2); ctx.fill();
  for (let k = 0; k < path.pts.length - 1; k++) {
    const [x1, y1] = path.pts[k], [x2, y2] = path.pts[k + 1];
    drawRay(ctx, x1, y1, x2, y2, { arrows: k === 0 ? 0 : 1, width: 2.2 });
  }
  // cards
  CARD.xs.forEach((x, k) => {
    const hy = st.ys[k];
    const top = hy - CARD.h / 2;
    ctx.fillStyle = '#c9b48a'; ctx.strokeStyle = '#8a7650'; ctx.lineWidth = 1.2;
    ctx.fillRect(x - 5, top, 10, CARD.h); ctx.strokeRect(x - 5, top, 10, CARD.h);
    ctx.fillStyle = cssVar('--scene-bg'); ctx.fillRect(x - 6, hy - CARD.hole, 12, CARD.hole * 2);
    // small stand down to the table
    ctx.fillStyle = cssVar('--device'); ctx.fillRect(x - 2, top + CARD.h, 4, Math.max(0, tableY - top - CARD.h)); ctx.fillRect(x - 14, tableY - 6, 28, 6);
    label(ctx, String(k + 1), x, top - 10, { size: 12, weight: 800 });
    if (!st.stretched && !st.anim) { ctx.fillStyle = cssVar('--accent'); ctx.font = font(14, 800); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('↕', x + 16, hy); }
  });
  if (st.stretched) {
    ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(CARD.xs[0] - 40, st.ys[0]); ctx.lineTo(CARD.xs[0], st.ys[0]); ctx.lineTo(CARD.xs[1], st.ys[1]); ctx.lineTo(CARD.xs[2], st.ys[2]); ctx.lineTo(CARD.xs[2] + 40, st.ys[2]); ctx.stroke();
    muted(ctx, t('string'), CARD.xs[2] + 46, st.ys[2] - 12, { align: 'left', color: '#c0392b' });
  }
  drawEye(ctx, CARD.eyeX, CARD.y0, Math.PI, { sees: path.reaches });
  muted(ctx, t('eye'), CARD.eyeX, CARD.y0 + 26);
  if (!st.stretched) muted(ctx, t('hint.dragCards'), 300, 26, { weight: 700 });
}

/* ---------- Tab 3: beams ---------- */
function drawBeams(ctx) {
  const st = S.beams;
  const fr = getLang() === 'fr';
  const bx = 440, yc = 170;
  // lantern (light box) on the right, slits on its left face
  ctx.fillStyle = '#2c3e50'; roundRect(ctx, bx, 100, 130, 140, 8); ctx.fill();
  label(ctx, t(st.src === 'one' ? 'lantern1' : 'lantern4'), bx + 65, 256, { size: 11, weight: 700 });
  const four = st.src === 'four';
  const slits = four ? [-27, -9, 9, 27] : [0];
  // lamp inside the lantern (the FR book moves it; the EN book uses a lens)
  const lampX = fr && four ? { converging: bx + 106, cylindrical: bx + 76, diverging: bx + 40 }[st.type] : bx + 76;
  drawLamp(ctx, lampX, yc, { r: 9 });
  if (fr && four) muted(ctx, t('lampIn'), lampX, yc + 40, { color: '#ecf0f1', halo: false });
  ctx.fillStyle = '#ecf0f1';
  for (const s of slits) ctx.fillRect(bx - 2, yc + s - 2, 6, 4);
  // lens (EN book)
  const useLens = !fr && four && st.type !== 'cylindrical';
  const lensX = 400;
  // rays
  const Ax = 170;
  const rayEnd = 40;
  slits.forEach((s, k) => {
    const y0 = yc + s;
    if (!four) {
      drawRay(ctx, bx, y0, 90, y0, { arrows: 2 });
      return;
    }
    let x1 = bx, y1 = y0;
    if (useLens) {
      drawRay(ctx, bx, y0, lensX, y0, { arrows: 0 });
      x1 = lensX;
    }
    if (st.type === 'cylindrical') drawRay(ctx, x1, y1, rayEnd, y1, { arrows: 2 });
    else if (st.type === 'converging') {
      // through A, then on
      const sl = (yc - y1) / (Ax - x1);
      drawRay(ctx, x1, y1, Ax, yc, { arrows: 1 });
      drawRay(ctx, Ax, yc, rayEnd, yc + sl * (rayEnd - Ax), { arrows: 1 });
    } else {
      // diverging: the rays seem to come out of A' behind
      const Dx = useLens ? 500 : lampX;
      const sl = (y1 - yc) / (x1 - Dx);
      drawRay(ctx, x1, y1, rayEnd, y1 + sl * (rayEnd - x1), { arrows: 2 });
      ctx.strokeStyle = 'rgba(242,183,5,0.7)'; ctx.lineWidth = 1.2; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(Dx, yc); ctx.stroke(); ctx.setLineDash([]);
      if (k === 0) { ctx.fillStyle = '#e74c3c'; ctx.beginPath(); ctx.arc(Dx, yc, 3.5, 0, Math.PI * 2); ctx.fill(); label(ctx, 'A', Dx + 2, yc - 14, { size: 12, weight: 800, color: '#e74c3c' }); }
    }
    label(ctx, `F${k + 1}`, bx + 12, y0, { size: 10, weight: 700, color: '#ecf0f1', halo: false, align: 'left' });
  });
  if (useLens) {
    ctx.fillStyle = 'rgba(160,210,235,0.45)'; ctx.strokeStyle = 'rgba(110,160,200,0.95)'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (st.type === 'converging') { ctx.ellipse(lensX, yc, 9, 60, 0, 0, Math.PI * 2); }
    else { ctx.moveTo(lensX - 10, yc - 60); ctx.lineTo(lensX + 10, yc - 60); ctx.quadraticCurveTo(lensX, yc, lensX + 10, yc + 60); ctx.lineTo(lensX - 10, yc + 60); ctx.quadraticCurveTo(lensX, yc, lensX - 10, yc - 60); }
    ctx.fill(); ctx.stroke();
    muted(ctx, t(st.type === 'converging' ? 'lensThin' : 'lensThick'), lensX, yc + 78);
  }
  if (!four) {
    label(ctx, 'F', bx - 10, yc - 12, { size: 12, weight: 800 });
    ctx.fillStyle = '#e74c3c'; ctx.beginPath(); ctx.arc(90, yc, 3.5, 0, Math.PI * 2); ctx.fill();
    label(ctx, 'A', 90, yc - 14, { size: 12, weight: 800, color: '#e74c3c' });
    ctx.fillStyle = '#ecf0f1'; ctx.fillRect(70, 110, 8, 120); ctx.strokeStyle = cssVar('--border'); ctx.strokeRect(70, 110, 8, 120);
    muted(ctx, t('screen'), 74, 96);
  } else if (st.type === 'converging') {
    ctx.fillStyle = '#e74c3c'; ctx.beginPath(); ctx.arc(Ax, yc, 3.5, 0, Math.PI * 2); ctx.fill();
    label(ctx, 'A', Ax, yc - 16, { size: 12, weight: 800, color: '#e74c3c' });
  }
  label(ctx, t(`beam.${four ? st.type : 'ray'}`), 220, 40, { size: 14, weight: 800 });
}

/* ---------- Tab 4: shadow ---------- */
function drawShadow(ctx) {
  const st = S.shadow;
  if (st.mode === 'stick') return drawStick(ctx);
  const sx = cmX(st.sx), sy = st.sy;
  const px = cmX(SH.pencilX), ay = cmY(-SH.AB / 2), by = cmY(SH.AB / 2);
  const scx = cmX(st.screen);
  const sh = pencilShadow();
  const a2 = cmY(sh.a), b2 = cmY(sh.b);
  // light reaching the screen: everything except the shadow
  ctx.fillStyle = 'rgba(255,214,80,0.16)';
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(scx, -400); ctx.lineTo(scx, 800); ctx.fill();
  ctx.fillStyle = 'rgba(40,40,50,0.28)';
  ctx.beginPath(); ctx.moveTo(px, ay); ctx.lineTo(scx, a2); ctx.lineTo(scx, b2); ctx.lineTo(px, by); ctx.fill();
  // other rays from S
  for (const ang of [-0.55, -0.32, 0.32, 0.55]) {
    const dx = scx - sx, y2 = sy + Math.tan(ang) * dx;
    const yAtP = sy + Math.tan(ang) * (px - sx);
    if (yAtP > ay && yAtP < by) continue;
    drawRay(ctx, sx, sy, scx, y2, { arrows: 1, width: 1.2, color: 'rgba(242,183,5,0.75)' });
  }
  // boundary rays SAA' and SBB'
  drawRay(ctx, sx, sy, scx, a2, { arrows: 2, width: 2 });
  drawRay(ctx, sx, sy, scx, b2, { arrows: 2, width: 2 });
  // screen
  ctx.fillStyle = '#ecf0f1'; ctx.fillRect(scx, 20, 8, 300);
  ctx.strokeStyle = cssVar('--border'); ctx.lineWidth = 1; ctx.strokeRect(scx, 20, 8, 300);
  ctx.fillStyle = '#2c2c34'; ctx.fillRect(scx, Math.max(20, a2), 8, Math.min(320, b2) - Math.max(20, a2));
  label(ctx, "A'", scx + 16, a2, { size: 12, weight: 800, align: 'left' });
  label(ctx, "B'", scx + 16, b2, { size: 12, weight: 800, align: 'left' });
  muted(ctx, t('screen'), scx + 4, 12);
  // pencil
  ctx.fillStyle = '#e1b12c'; ctx.fillRect(px - 3, ay + 6, 6, by - ay - 6);
  ctx.fillStyle = '#f5deb3'; ctx.beginPath(); ctx.moveTo(px - 3, ay + 6); ctx.lineTo(px + 3, ay + 6); ctx.lineTo(px, ay); ctx.fill();
  ctx.fillStyle = '#e88'; ctx.fillRect(px - 3, by - 5, 6, 5);
  label(ctx, 'A', px - 12, ay, { size: 12, weight: 800 });
  label(ctx, 'B', px - 12, by, { size: 12, weight: 800 });
  muted(ctx, t('pencil'), px, by + 14);
  // source
  drawLamp(ctx, sx, sy, { r: 5 });
  label(ctx, 'S', sx - 12, sy - 12, { size: 12, weight: 800 });
  muted(ctx, t('hint.dragS'), 300, 330, { weight: 700 });
}
function drawStick(ctx) {
  const st = S.shadow;
  const gy = ST.groundY;
  ctx.fillStyle = cssVar('--grass'); ctx.fillRect(0, gy, SCENE.w, SCENE.h - gy);
  label(ctx, t('ground'), 560, gy + 18, { size: 11, weight: 700 });
  const sx = ST.sx, sy = gy - st.h * ST.k;
  const kx = sx + st.d * ST.k, ky = gy - ST.stick * ST.k;
  // lamp post
  ctx.fillStyle = cssVar('--device'); ctx.fillRect(sx - 2, sy + 6, 4, gy - sy - 6);
  drawLamp(ctx, sx, sy, { r: 6 });
  label(ctx, 'S', sx - 14, sy - 10, { size: 12, weight: 800 });
  // stick
  ctx.fillStyle = '#8e5b2e'; ctx.fillRect(kx - 3, ky, 6, gy - ky);
  label(ctx, '50 cm', kx - 8, (ky + gy) / 2, { size: 11, weight: 700, align: 'right' });
  // ray through the top of the stick
  const L = stickShadow();
  if (Number.isFinite(L)) {
    const ex = kx + L * ST.k;
    const xEnd = Math.min(ex, SCENE.w - 4);
    const yEnd = ex <= SCENE.w - 4 ? gy : sy + ((gy - sy) * (xEnd - sx)) / (ex - sx);
    ctx.fillStyle = 'rgba(40,40,50,0.35)'; ctx.fillRect(kx, gy - 2, xEnd - kx, 7);
    drawRay(ctx, sx, sy, xEnd, yEnd, { arrows: 2 });
    if (ex > SCENE.w - 4) muted(ctx, t('goesOn'), 560, gy - 14, { weight: 700, align: 'right' });
  } else {
    drawRay(ctx, sx, sy, SCENE.w - 4, sy, { arrows: 2 });
    muted(ctx, t('parallel'), 330, sy - 16, { weight: 700 });
  }
  // dimension lines
  ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(sx - 26, sy); ctx.lineTo(sx - 26, gy); ctx.stroke();
  label(ctx, `h = ${qty(st.h, 2, 'm')}`, sx + 8, Math.max(sy, 30) + 22, { size: 11, weight: 700, align: 'left' });
  ctx.beginPath(); ctx.moveTo(sx, gy + 30); ctx.lineTo(kx, gy + 30); ctx.stroke();
  label(ctx, `d = ${qty(st.d, 2, 'm')}`, (sx + kx) / 2, gy + 42, { size: 11, weight: 700 });
}

/* ---------- Tab 5: umbra, penumbra, eclipses ---------- */
function drawCones(ctx, xs, ys, rs, xb, yb, rb, xEnd) {
  const c = (x) => cones(xs, ys, rs, xb, yb, rb, x);
  const xa = Math.min(xEnd, c(xEnd).apex);
  const e = c(xEnd), a = c(xa);
  // penumbra (between the inner tangents)
  ctx.fillStyle = 'rgba(70,70,85,0.22)';
  ctx.beginPath(); ctx.moveTo(xb, yb - rb); ctx.lineTo(xEnd, e.pTop); ctx.lineTo(xEnd, e.pBot); ctx.lineTo(xb, yb + rb); ctx.fill();
  // umbra (between the outer tangents, up to the apex of the cone)
  ctx.fillStyle = 'rgba(25,25,35,0.6)';
  ctx.beginPath(); ctx.moveTo(xb, yb - rb); ctx.lineTo(xa, a.uTop); ctx.lineTo(xa, a.uBot); ctx.lineTo(xb, yb + rb); ctx.fill();
  // tangent rays from the two edges of the source
  const line = (x1, y1, x2, y2) => { const sl = (y2 - y1) / (x2 - x1); drawRay(ctx, x1, y1, xEnd, y1 + sl * (xEnd - x1), { arrows: 1, width: 1.2, color: 'rgba(230,126,34,0.9)' }); };
  line(xs, ys - rs, xb, yb - rb); line(xs, ys + rs, xb, yb + rb);
  line(xs, ys + rs, xb, yb - rb); line(xs, ys - rs, xb, yb + rb);
}
function sunDisc(ctx, x, y, r) {
  const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 1.3);
  g.addColorStop(0, '#fff3a0'); g.addColorStop(0.75, '#f5b301'); g.addColorStop(1, 'rgba(245,179,1,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 1.3, 0, Math.PI * 2); ctx.fill();
}
function drawUmbra(ctx) {
  const st = S.umbra;
  label(ctx, t('forReading'), 300, 14, { size: 12, weight: 800, color: '#8e44ad' });
  const yc = 180;
  if (st.mode === 'ball') {
    const xs = 60, xb = 250, rb = 26, xsc = st.screen;
    drawCones(ctx, xs, yc, st.rs, xb, yc, rb, xsc);
    ctx.fillStyle = '#ffb347'; ctx.fillRect(xs - 6, yc - st.rs, 12, 2 * st.rs);
    sunDisc(ctx, xs, yc, Math.max(6, st.rs * 0.6));
    label(ctx, 'A', xs - 16, yc - st.rs, { size: 12, weight: 800 }); label(ctx, 'B', xs - 16, yc + st.rs, { size: 12, weight: 800 });
    muted(ctx, t('extSource'), xs, yc + st.rs + 18);
    const g = ctx.createRadialGradient(xb - 8, yc - 8, 3, xb, yc, rb);
    g.addColorStop(0, '#f2f2f2'); g.addColorStop(1, '#9aa0a6');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(xb, yc, rb, 0, Math.PI * 2); ctx.fill();
    muted(ctx, t('ball'), xb, yc + rb + 14);
    ctx.fillStyle = '#ecf0f1'; ctx.fillRect(xsc, 40, 8, 290); ctx.strokeStyle = cssVar('--border'); ctx.strokeRect(xsc, 40, 8, 290);
    muted(ctx, t('screen'), xsc + 4, 30);
    // the screen seen from the front (as Fig. 6)
    const c = cones(xs, yc, st.rs, xb, yc, rb, xsc);
    // (inset at the top, the radii reduced)
    const fx = 300, fy = 66, k = 0.32;
    ctx.fillStyle = '#ecf0f1'; ctx.strokeStyle = cssVar('--border'); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(fx, fy, 40, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#8d8d95'; ctx.beginPath(); ctx.arc(fx, fy, Math.min(39, c.pen * k), 0, Math.PI * 2); ctx.fill();
    if (c.umbra > 0) { ctx.fillStyle = '#1c1c22'; ctx.beginPath(); ctx.arc(fx, fy, c.umbra * k, 0, Math.PI * 2); ctx.fill(); }
    muted(ctx, t('frontView'), fx + 48, fy, { align: 'left', weight: 700 });
    return;
  }
  const sunX = 0, sunR = 60;
  if (st.mode === 'moon') {
    const ex = 300, er = 34, mx = 470, mr = 10;
    const my = yc + st.moon;
    drawCones(ctx, sunX, yc, sunR, ex, yc, er, 600);
    sunDisc(ctx, sunX, yc, sunR);
    earth(ctx, ex, yc, er);
    // orbit of the Moon (drawn as a line)
    ctx.strokeStyle = cssVar('--muted'); ctx.setLineDash([3, 4]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(mx, 40); ctx.lineTo(mx, 320); ctx.stroke(); ctx.setLineDash([]);
    const ec = lunar();
    ctx.fillStyle = ec === 'total' ? '#7a3b2e' : ec === 'partial' ? '#a89c8e' : '#e8e4da';
    ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();
    label(ctx, t('sun'), 40, yc + sunR + 30, { size: 12, weight: 700 });
    label(ctx, t('earth'), ex, yc + er + 16, { size: 12, weight: 700 });
    label(ctx, t('moon'), mx + 18, my, { size: 12, weight: 700, align: 'left' });
  } else {
    const mx = 300, mr = 24, ex = 520, er = 40;
    const my = yc + st.moonS;
    drawCones(ctx, sunX, yc, sunR, mx, my, mr, ex - er + 4);
    sunDisc(ctx, sunX, yc, sunR);
    earth(ctx, ex, yc, er);
    ctx.fillStyle = '#c9c5bb'; ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();
    // observer on the Earth, facing the Sun
    const ox = ex - er, oy = yc;
    ctx.fillStyle = '#e74c3c'; ctx.beginPath(); ctx.arc(ox, oy, 4, 0, Math.PI * 2); ctx.fill();
    label(ctx, t('observer'), ox - 8, oy + 22, { size: 11, weight: 700, align: 'right' });
    label(ctx, t('sun'), 40, yc + sunR + 30, { size: 12, weight: 700 });
    label(ctx, t('earth'), ex, yc + er + 16, { size: 12, weight: 700 });
    label(ctx, t('moon'), mx, my - mr - 12, { size: 12, weight: 700 });
  }
  muted(ctx, t('notToScale'), 300, 332, { weight: 700 });
}
function earth(ctx, x, y, r) {
  const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, 2, x, y, r);
  g.addColorStop(0, '#7fc0ff'); g.addColorStop(1, '#1f5f9e');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(80,160,80,0.8)'; ctx.beginPath(); ctx.ellipse(x - r * 0.2, y - r * 0.1, r * 0.35, r * 0.22, 0.6, 0, Math.PI * 2); ctx.fill();
  // night side
  ctx.fillStyle = 'rgba(0,0,20,0.35)'; ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, Math.PI / 2); ctx.fill();
}
// state of the eclipses
function lunar() {
  const st = S.umbra;
  const c = cones(0, 180, 60, 300, 180, 34, 470);
  const d = Math.abs(st.moon), mr = 10;
  if (d + mr <= c.umbra) return 'total';
  if (d - mr < c.umbra) return 'partial';
  if (d - mr < c.pen) return 'pen';
  return 'none';
}
function solar() {
  const st = S.umbra;
  // the observer is at (480, 180) on the Earth, facing the Sun; the Moon is shifted by moonS
  const c = cones(0, 180, 60, 300, 180 + st.moonS, 24, 480);
  if (c.umbra > 0 && c.uTop < 180 && 180 < c.uBot) return 'total';
  if (c.pTop < 180 && 180 < c.pBot) return 'partial';
  return 'none';
}

/* ================================================================
   Pointer
   ================================================================ */
let dragging = null;
canvas.addEventListener('pointerdown', (ev) => {
  if (!shell) return;
  const p = view.toLogical(ev);
  const tab = shell.tab;
  if (tab === 'cards') {
    const st = S.cards;
    if (st.anim) return;
    const k = CARD.xs.findIndex((x, i) => Math.abs(p.x - x) < 26 && Math.abs(p.y - st.ys[i]) < CARD.h / 2 + 10);
    if (k >= 0) { dragging = { what: 'card', k, dy: p.y - st.ys[k] }; st.stretched = false; }
  } else if (tab === 'shadow') {
    const st = S.shadow;
    if (st.mode === 'pencil') {
      if (Math.hypot(p.x - cmX(st.sx), p.y - st.sy) < 30) dragging = { what: 'S' };
      else if (Math.abs(p.x - cmX(st.screen)) < 26) dragging = { what: 'screen' };
    }
  } else if (tab === 'umbra') {
    const st = S.umbra;
    if (st.mode === 'ball' && Math.abs(p.x - st.screen) < 26) dragging = { what: 'uscreen' };
    else if (st.mode === 'moon' && Math.abs(p.x - 470) < 30) dragging = { what: 'moon' };
    else if (st.mode === 'sun' && Math.abs(p.x - 300) < 40) dragging = { what: 'moonS' };
  }
  if (dragging) { canvas.setPointerCapture(ev.pointerId); ev.preventDefault(); onDrag(p); }
});
canvas.addEventListener('pointermove', (ev) => { if (dragging) onDrag(view.toLogical(ev)); });
const endDrag = () => { dragging = null; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
function onDrag(p) {
  const d = dragging;
  if (d.what === 'card') {
    let y = Math.max(115, Math.min(235, p.y - d.dy));
    if (Math.abs(y - CARD.y0) < 3) y = CARD.y0;
    S.cards.ys[d.k] = y;
  } else if (d.what === 'S') {
    const st = S.shadow;
    st.sx = Math.round(Math.max(2, Math.min(25, (p.x - SH.x0) / SH.k)) * 2) / 2;
    st.sy = Math.max(120, Math.min(230, p.y));
    if (Math.abs(st.sy - SH.yc) < 4) st.sy = SH.yc;
    ui.sx?.set(st.sx);
  } else if (d.what === 'screen') {
    S.shadow.screen = Math.round(Math.max(48, Math.min(92, (p.x - SH.x0) / SH.k)));
    ui.screen?.set(S.shadow.screen);
  } else if (d.what === 'uscreen') {
    S.umbra.screen = Math.max(330, Math.min(530, p.x)); ui.uscreen?.set(Math.round(S.umbra.screen));
  } else if (d.what === 'moon') {
    S.umbra.moon = Math.max(-120, Math.min(120, p.y - 180)); ui.moon?.set(Math.round(S.umbra.moon));
  } else if (d.what === 'moonS') {
    S.umbra.moonS = Math.max(-100, Math.min(100, p.y - 180)); ui.moonS?.set(Math.round(S.umbra.moonS));
  }
  refresh();
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
function hint(key) { return el('p', { class: 'muted', style: 'font-size:0.88rem;margin:10px 0 0', dataset: { i18n: key } }, t(key)); }
const btnRow = (...b) => el('div', { class: 'btn-row' }, b);
const yn = (b) => t(b ? 'yes' : 'no');
const resetBtn = (id) => btnRow(createButton({ labelKey: 'ui.reset', variant: 'ghost', onClick: () => resetTab(id) }));
const outText = (slider, s) => { const o = slider.root.querySelector('output'); if (o) o.textContent = s; };

function buildBodies() {
  const st = S.bodies;
  ui.body = createSegmented({
    labelKey: 'ctl.body', options: ['none', 'glass', 'book', 'wood'].map((v) => ({ value: v, labelKey: `body.${v}` })), value: st.body,
    onChange: (v) => { st.body = v; refresh(); },
  });
  controlsBody.append(ui.body.root, resetBtn('bodies'));
  ui.dl = el('dl', { class: 'meas' }); measuresBody.append(ui.dl);
}
function updateBodies() {
  const st = S.bodies;
  ui.body.set(st.body);
  const opaque = st.body === 'book' || st.body === 'wood';
  measRows(ui.dl, [
    [t('m.body'), t(`body.${st.body}`)],
    [t('m.seeLamp'), yn(!opaque), opaque ? 'bad-text' : 'good-text'],
    [t('m.crosses'), st.body === 'none' ? '—' : yn(!opaque)],
  ]);
}

function buildCards() {
  const st = S.cards;
  controlsBody.append(
    btnRow(createButton({ labelKey: 'ctl.stretch', variant: 'primary', onClick: () => { st.stretched = true; st.anim = true; loop.start(); refresh(); } })),
    btnRow(createButton({ labelKey: 'ctl.shuffle', variant: 'secondary', onClick: () => {
      st.stretched = false; st.anim = null;
      st.ys = st.ys.map(() => CARD.y0 + (Math.random() < 0.5 ? -1 : 1) * (12 + Math.random() * 45));
      refresh();
    } })),
    hint('hint.cards'), resetBtn('cards'));
  ui.dl = el('dl', { class: 'meas' }); measuresBody.append(ui.dl);
}
function updateCards() {
  const path = cardsPath();
  measRows(ui.dl, [
    [t('m.aligned'), yn(aligned()), aligned() ? 'good-text' : ''],
    [t('m.seeLampHoles'), yn(path.reaches), path.reaches ? 'good-text' : 'bad-text'],
    [t('m.lightStops'), path.reaches ? '—' : t('stops.card', { n: (path.blockedAt ?? 2) + 1 })],
  ]);
}

function buildBeams() {
  const st = S.beams;
  ui.src = createSegmented({
    labelKey: 'ctl.source', options: [{ value: 'one', labelKey: 'src.one' }, { value: 'four', labelKey: 'src.four' }], value: st.src,
    onChange: (v) => { st.src = v; buildTab('beams'); },
  });
  controlsBody.append(ui.src.root);
  if (st.src === 'four') {
    ui.type = createSegmented({
      labelKey: getLang() === 'fr' ? 'ctl.lampPos' : 'ctl.lens', options: ['converging', 'cylindrical', 'diverging'].map((v) => ({ value: v, labelKey: `set.${v}` })), value: st.type,
      onChange: (v) => { st.type = v; refresh(); },
    });
    controlsBody.append(ui.type.root);
  }
  controlsBody.append(resetBtn('beams'));
  ui.dl = el('dl', { class: 'meas' }); measuresBody.append(ui.dl);
}
function updateBeams() {
  const st = S.beams;
  ui.src.set(st.src); ui.type?.set(st.type);
  const four = st.src === 'four';
  measRows(ui.dl, [
    [t('m.rays'), four ? '4' : '1'],
    [t('m.directions'), four ? t(`dir.${st.type}`) : t('dir.one')],
  ]);
}

function buildShadow() {
  const st = S.shadow;
  ui.mode = createSegmented({
    labelKey: 'ctl.mode', options: [{ value: 'pencil', labelKey: 'mode.pencil' }, { value: 'stick', labelKey: 'mode.stick' }], value: st.mode,
    onChange: (v) => { st.mode = v; buildTab('shadow'); },
  });
  controlsBody.append(ui.mode.root);
  if (st.mode === 'pencil') {
    ui.sx = createSlider({ labelKey: 'ctl.sx', min: 2, max: 25, step: 0.5, value: st.sx, unit: 'cm', decimals: 1, onInput: (v) => { st.sx = v; refresh(); } });
    ui.screen = createSlider({ labelKey: 'ctl.screen', min: 48, max: 92, step: 1, value: st.screen, unit: 'cm', onInput: (v) => { st.screen = v; refresh(); } });
    controlsBody.append(ui.sx.root, ui.screen.root, hint('hint.shadow'));
  } else {
    ui.h = createSlider({ labelKey: 'ctl.h', min: 0.5, max: 1.5, step: 0.05, value: st.h, unit: 'm', decimals: 2, onInput: (v) => { st.h = v; refresh(); } });
    ui.d = createSlider({ labelKey: 'ctl.d', min: 0.2, max: 1, step: 0.05, value: st.d, unit: 'm', decimals: 2, onInput: (v) => { st.d = v; refresh(); } });
    controlsBody.append(ui.h.root, ui.d.root, hint('hint.stick'));
  }
  controlsBody.append(resetBtn('shadow'));
  ui.dl = el('dl', { class: 'meas' }); measuresBody.append(ui.dl);
}
function updateShadow() {
  const st = S.shadow;
  ui.mode.set(st.mode);
  if (st.mode === 'pencil') {
    const sh = pencilShadow();
    measRows(ui.dl, [
      [t('m.AB'), qty(SH.AB, 0, 'cm')],
      [t('m.dSP'), qty(SH.pencilX - st.sx, 1, 'cm')],
      [t('m.dSE'), qty(st.screen - st.sx, 1, 'cm')],
      [t('m.shadow'), qty(sh.size, 1, 'cm'), 'good-text'],
    ]);
  } else {
    const L = stickShadow();
    measRows(ui.dl, [
      [t('m.h'), qty(st.h, 2, 'm')],
      [t('m.d'), qty(st.d, 2, 'm')],
      [t('m.L'), Number.isFinite(L) ? qty(L, 2, 'm') : t('L.inf'), Number.isFinite(L) ? 'good-text' : 'bad-text'],
    ]);
  }
}

function buildUmbra() {
  const st = S.umbra;
  ui.mode = createSegmented({
    labelKey: 'ctl.mode', options: ['ball', 'moon', 'sun'].map((v) => ({ value: v, labelKey: `umode.${v}` })), value: st.mode,
    onChange: (v) => { st.mode = v; buildTab('umbra'); },
  });
  controlsBody.append(ui.mode.root);
  if (st.mode === 'ball') {
    ui.rs = createSlider({ labelKey: 'ctl.rs', min: 2, max: 50, step: 1, value: st.rs, unit: '', onInput: (v) => { st.rs = v; refresh(); } });
    ui.uscreen = createSlider({ labelKey: 'ctl.uscreen', min: 330, max: 530, step: 1, value: Math.round(st.screen), unit: '', onInput: (v) => { st.screen = v; refresh(); } });
    controlsBody.append(ui.rs.root, ui.uscreen.root);
  } else if (st.mode === 'moon') {
    ui.moon = createSlider({ labelKey: 'ctl.moon', min: -120, max: 120, step: 1, value: Math.round(st.moon), unit: '', onInput: (v) => { st.moon = v; refresh(); } });
    controlsBody.append(ui.moon.root);
  } else {
    ui.moonS = createSlider({ labelKey: 'ctl.moon', min: -100, max: 100, step: 1, value: Math.round(st.moonS), unit: '', onInput: (v) => { st.moonS = v; refresh(); } });
    controlsBody.append(ui.moonS.root);
  }
  controlsBody.append(hint('hint.umbra'), resetBtn('umbra'));
  ui.dl = el('dl', { class: 'meas' }); measuresBody.append(ui.dl);
}
function updateUmbra() {
  const st = S.umbra;
  ui.mode.set(st.mode);
  for (const k of ['rs', 'uscreen', 'moon', 'moonS']) if (ui[k]) outText(ui[k], '');
  if (st.mode === 'ball') {
    const c = cones(60, 180, st.rs, 250, 180, 26, st.screen);
    measRows(ui.dl, [
      [t('m.source'), t(st.rs <= 4 ? 'src.small' : 'src.extended')],
      [t('m.umbraOn'), yn(c.umbra > 0.5), c.umbra > 0.5 ? 'good-text' : ''],
      [t('m.penOn'), yn(c.pen - c.umbra > 2), c.pen - c.umbra > 2 ? 'good-text' : ''],
    ]);
  } else if (st.mode === 'moon') {
    const e = lunar();
    measRows(ui.dl, [[t('m.lunar'), t(`ecl.${e}`), e === 'total' || e === 'partial' ? 'good-text' : '']]);
  } else {
    const e = solar();
    measRows(ui.dl, [[t('m.solar'), t(`ecl.${e}`), e === 'total' || e === 'partial' ? 'good-text' : '']]);
  }
}

/* ---------- Tab switching ---------- */
const TABS = ['bodies', 'cards', 'beams', 'shadow', 'umbra'];
function buildTab(id) {
  controlsBody.replaceChildren();
  measuresBody.replaceChildren();
  ui = {};
  if (id === 'bodies') buildBodies();
  else if (id === 'cards') buildCards();
  else if (id === 'beams') buildBeams();
  else if (id === 'shadow') buildShadow();
  else buildUmbra();
  loop.start();
  refresh();
}
function updateMeasures() {
  if (!shell || !ui.dl) return;
  const tab = shell.tab;
  if (tab === 'bodies') updateBodies();
  else if (tab === 'cards') updateCards();
  else if (tab === 'beams') updateBeams();
  else if (tab === 'shadow') updateShadow();
  else updateUmbra();
}
function refresh() { updateMeasures(); requestDraw(); }
function resetTab(id) { S[id] = initialState()[id]; buildTab(id); }

onLangChange(() => { if (shell) buildTab(shell.tab); });

shell = initSim({
  strings,
  tabs: TABS.map((id) => ({ id, labelKey: `tab.${id}` })),
  initialTab: 'bodies',
  onTab: (id) => buildTab(id),
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, cardsPath, pencilShadow, stickShadow, lunar, solar, cones };
