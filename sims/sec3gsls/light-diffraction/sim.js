// Sec 3 GS-LS — Chapter 13: Wave aspect of light – Diffraction (whole chapter, SG and SV).
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num, qty } from '../../../shared/format.js';
import { createButton, createSegmented, createSlider, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, arrow } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { label } from '../../../shared/figures.js';
import { calcCell, calcSig, calcDone } from '../../../shared/calc-cell.js';
import { plotCurves } from '../../../shared/energy-bars.js';
import { lambdaRGB, lambdaCSS, sinc2, airy, drawPattern } from '../../../shared/wave-optics.js';

const TAU = 2 * Math.PI;
const W = 600;
const TABS = ['slit', 'obstacles', 'intensity', 'huygens', 'em'];
const HEIGHTS = { slit: 430, obstacles: 420, intensity: 470, huygens: 400, em: 440 };
const LASER = 633; // nm, He-Ne laser of Exp. 13.1–13.2
const C0 = 3e8;

function initialState(tab) {
  switch (tab) {
    case 'slit': return { a: 0.2, vertical: true, D: 2, rows: [], fb: null };
    case 'obstacles': return { obj: 'hole', d: 1, rows: [] };
    case 'intensity': return { a: 0.3, lam: 580, D: 2, rows: [], fb: null };
    case 'huygens': return { gap: 3, wavelets: true, t: 0, run: true };
    default: return { lam: 633, n: 1, t: 0, run: true, rows: [], fb: null };
  }
}
let S = Object.fromEntries(TABS.map((k) => [k, initialState(k)]));

/* ================================================================
   Canvas and loop
   ================================================================ */
let shell;
let drawQueued = false;
const canvas = document.getElementById('stage');
const view = setupCanvas(canvas, { width: W, height: 430, maxHeightVh: () => (window.innerWidth < 880 ? 54 : 78), onResize: () => requestDraw() });
function requestDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; draw(); });
}
onThemeChange(() => requestDraw());
const loop = createLoop({
  step(dt) {
    if (!shell) return false;
    const st = S[shell.tab];
    if ((shell.tab === 'huygens' || shell.tab === 'em') && st.run) { st.t += dt; return true; }
    return false;
  },
  render() { draw(); },
});

/* ================================================================
   Drawing helpers
   ================================================================ */
const ink = (ctx, w = 2) => { ctx.strokeStyle = cssVar('--text'); ctx.fillStyle = cssVar('--text'); ctx.lineWidth = w; };
function note(ctx, key, x, y, align = 'center', params) { label(ctx, t(key, params), x, y, { size: 12, weight: 600, color: cssVar('--muted'), align }); }
function ruler(ctx, x0, x1, y, mmPerPx, { major = 10, minor = 1 } = {}) {
  ink(ctx, 1);
  const cx = (x0 + x1) / 2, half = ((x1 - x0) / 2) * mmPerPx;
  ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
  for (let m = -Math.floor(half / minor) * minor; m <= half + 1e-9; m += minor) {
    const X = cx + m / mmPerPx, big = Math.abs(Math.round(m / major) * major - m) < 1e-6;
    ctx.beginPath(); ctx.moveTo(X, y); ctx.lineTo(X, y + (big ? 10 : 5)); ctx.stroke();
    if (big) label(ctx, num(Math.round(m), 0), X, y + 19, { size: 10, weight: 600, halo: false });
  }
}
function laserBox(ctx, x, y, nm) {
  ctx.fillStyle = cssVar('--metal'); roundRect(ctx, x, y - 14, 70, 28, 5); ctx.fill();
  label(ctx, t('laser'), x + 35, y, { size: 10, weight: 800, color: '#fff', halo: false });
  ctx.fillStyle = lambdaCSS(nm); ctx.beginPath(); ctx.arc(x + 70, y, 4, 0, TAU); ctx.fill();
}
// side view of the set-up: laser → obstacle → screen
function setup(ctx, nm, y, dLabel, objLabel) {
  laserBox(ctx, 20, y, nm);
  ctx.strokeStyle = lambdaCSS(nm, 0.9); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(90, y); ctx.lineTo(160, y); ctx.stroke();
  ink(ctx, 4); ctx.beginPath(); ctx.moveTo(160, y - 34); ctx.lineTo(160, y - 3); ctx.moveTo(160, y + 3); ctx.lineTo(160, y + 34); ctx.stroke();
  ctx.fillStyle = lambdaCSS(nm, 0.18);
  ctx.beginPath(); ctx.moveTo(160, y); ctx.lineTo(560, y - 30); ctx.lineTo(560, y + 30); ctx.closePath(); ctx.fill();
  ink(ctx, 5); ctx.beginPath(); ctx.moveTo(560, y - 40); ctx.lineTo(560, y + 40); ctx.stroke();
  label(ctx, objLabel, 160, y - 46, { size: 11, weight: 700 });
  label(ctx, t('screen'), 560, y - 50, { size: 11, weight: 700 });
  ink(ctx, 1.2); arrow(ctx, 165, y + 50, 555, y + 50, 6); arrow(ctx, 555, y + 50, 165, y + 50, 6);
  label(ctx, dLabel, 360, y + 62, { size: 12, weight: 800 });
}

function draw() {
  if (!shell) return;
  const tab = shell.tab;
  if (view.height !== HEIGHTS[tab]) view.setLogicalSize(W, HEIGHTS[tab]);
  const ctx = view.begin();
  ctx.fillStyle = cssVar('--scene-bg');
  roundRect(ctx, 0, 0, W, HEIGHTS[tab], 14);
  ctx.fill();
  ({ slit: drawSlit, obstacles: drawObstacles, intensity: drawIntensity, huygens: drawHuygens, em: drawEM })[tab](ctx, S[tab]);
}

/* ---------- Tab 1: diffraction by a slit (Exp. 13.1) ---------- */
const slitL = (a, nm, D) => (2 * nm * 1e-6 * D * 1000) / a; // mm: width of the central fringe
function drawSlit(ctx, st) {
  setup(ctx, LASER, 70, `D = ${qty(st.D, 1, 'm')}`, t('sl.slit', { a: qty(st.a, 2, 'mm') }));
  // screen seen from the front
  const x0 = 20, y0 = 160, w = 560, h = 190, mmPerPx = 60 / w;
  ctx.fillStyle = '#000'; ctx.fillRect(x0, y0, w, h);
  const lam = LASER * 1e-6, D = st.D * 1000, a = st.a, beam = 1.3;
  const wide = a >= 1;
  const I = (X, Y) => {
    const along = st.vertical ? X : Y, across = st.vertical ? Y : X;
    if (wide) return Math.exp(-(X * X + Y * Y) / (beam * beam));
    return sinc2((Math.PI * a * along) / (lam * D)) * Math.exp(-(across * across) / (beam * beam));
  };
  drawPattern(ctx, x0, y0, w, h, I, { rgb: lambdaRGB(LASER), unitsPerPx: mmPerPx, key: `slit${a}${st.vertical}${st.D}`, res: 2 });
  ruler(ctx, x0, x0 + w, y0 + h + 6, mmPerPx);
  label(ctx, t('sl.mm'), x0 + w, y0 + h + 32, { size: 10, weight: 700, align: 'right', halo: false });
  // slit drawn in its orientation
  ctx.fillStyle = cssVar('--surface'); roundRect(ctx, 470, 4, 110, 44, 6); ctx.fill();
  ink(ctx, 1); ctx.fillStyle = '#333'; ctx.fillRect(480, 10, 90, 32);
  ctx.fillStyle = '#fff';
  const sw = Math.max(1.5, a * 6);
  if (st.vertical) ctx.fillRect(525 - sw / 2, 12, sw, 28); else ctx.fillRect(490, 26 - sw / 2, 70, sw);
  note(ctx, wide ? 'sl.wideNote' : st.vertical ? 'sl.vNote' : 'sl.hNote', W / 2, HEIGHTS.slit - 18);
}

/* ---------- Tab 2: holes and other obstacles (Exp. 13.2) ---------- */
function drawObstacles(ctx, st) {
  const x0 = 20, y0 = 20, s = 300;
  const lam = LASER * 1e-6, D = 2000;
  ctx.fillStyle = '#000'; ctx.fillRect(x0, y0, s, s);
  let mmPerPx = 30 / s, I, key = `${st.obj}${st.d}`;
  if (st.obj === 'hole') I = (X, Y) => airy((Math.PI * st.d * Math.hypot(X, Y)) / (lam * D));
  else if (st.obj === 'rect') I = (X, Y) => sinc2((Math.PI * 0.2 * X) / (lam * D)) * sinc2((Math.PI * 0.5 * Y) / (lam * D));
  else if (st.obj === 'hair') I = (X, Y) => Math.min(1, sinc2((Math.PI * 0.1 * X) / (lam * D)) * Math.exp(-(Y * Y) / 2) * 0.9 + Math.exp(-(X * X + Y * Y) / 1.2));
  else {
    mmPerPx = 1200 / s; // grating: wide screen
    const dg = 1 / 300; // mm (300 lines per mm)
    I = (X, Y) => {
      let v = 0;
      for (let n = -3; n <= 3; n++) {
        const sn = (n * lam) / dg; if (Math.abs(sn) >= 1) continue;
        const xn = D * Math.tan(Math.asin(sn));
        v += (n === 0 ? 1 : 0.5 / Math.abs(n)) * Math.exp(-((X - xn) ** 2 + Y * Y) / 500);
      }
      return Math.min(1, v);
    };
  }
  drawPattern(ctx, x0, y0, s, s, I, { rgb: lambdaRGB(LASER), unitsPerPx: mmPerPx, key, res: 2, gamma: st.obj === 'grating' ? 0.6 : 0.4 });
  ruler(ctx, x0, x0 + s, y0 + s + 6, mmPerPx, st.obj === 'grating' ? { major: 200, minor: 50 } : { major: 10, minor: 1 });
  label(ctx, t('sl.mm'), x0 + s, y0 + s + 32, { size: 10, weight: 700, align: 'right', halo: false });
  // the obstacle
  const ox = 460, oy = 120;
  ctx.fillStyle = cssVar('--surface'); roundRect(ctx, ox - 90, oy - 90, 180, 180, 10); ctx.fill();
  ctx.fillStyle = '#333'; ctx.fillRect(ox - 70, oy - 70, 140, 140);
  ctx.fillStyle = '#fff';
  if (st.obj === 'hole') { ctx.beginPath(); ctx.arc(ox, oy, 6 + st.d * 18, 0, TAU); ctx.fill(); }
  else if (st.obj === 'rect') ctx.fillRect(ox - 8, oy - 20, 16, 40);
  else if (st.obj === 'hair') { ctx.fillStyle = '#fff'; ctx.fillRect(ox - 70, oy - 70, 140, 140); ctx.fillStyle = '#5a3a1a'; ctx.fillRect(ox - 1.5, oy - 70, 3, 140); }
  else { for (let k = -60; k <= 60; k += 6) ctx.fillRect(ox + k - 1, oy - 60, 2, 120); }
  label(ctx, t(`ob.${st.obj}Lbl`, { d: qty(st.d, 2, 'mm') }), ox, oy + 106, { size: 12, weight: 800 });
  note(ctx, `ob.${st.obj}Note`, ox, oy + 130, 'center');
  note(ctx, 'ob.setup', W / 2, HEIGHTS.obstacles - 16);
}

/* ---------- Tab 3: distribution of the light intensity (Application 13.1) ---------- */
function drawIntensity(ctx, st) {
  const lam = st.lam * 1e-6, D = st.D * 1000, a = st.a;
  const x1 = (lam * D) / a; // mm: first dark fringe
  const xm = Math.max(4 * x1, 1);
  const rgb = lambdaRGB(st.lam), col = lambdaCSS(st.lam);
  plotCurves(ctx, {
    x: 12, y: 10, w: 576, h: 260, xMin: -xm, xMax: xm, yMin: 0, yMax: 1.1, xLabel: 'x (mm)', yLabel: 'I / I0',
    curves: [{ f: (X) => sinc2((Math.PI * a * X) / (lam * D)), color: col, label: 'I(x)' }],
  });
  const X = (v) => 12 + 42 + ((v + xm) / (2 * xm)) * 524, Y = (v) => 10 + 16 + (1 - v / 1.1) * 214;
  ctx.save(); ctx.strokeStyle = cssVar('--muted'); ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
  for (const n of [-3, -2, -1, 1, 2, 3]) { ctx.beginPath(); ctx.moveTo(X(n * x1), Y(0)); ctx.lineTo(X(n * x1), Y(0.35)); ctx.stroke(); }
  ctx.restore();
  ink(ctx, 1.5); arrow(ctx, X(-x1), Y(0.22), X(x1), Y(0.22), 6); arrow(ctx, X(x1), Y(0.22), X(-x1), Y(0.22), 6);
  label(ctx, 'L', X(0), Y(0.29), { size: 13, weight: 800 });
  label(ctx, '4.7 %', X(1.43 * x1), Y(0.12), { size: 10, weight: 700, color: cssVar('--muted') });
  // the pattern on the screen, same horizontal scale
  const y0 = 300, h = 110, w = 524;
  ctx.fillStyle = '#000'; ctx.fillRect(54, y0, w, h);
  drawPattern(ctx, 54, y0, w, h, (Xmm, Ymm) => sinc2((Math.PI * a * Xmm) / (lam * D)) * Math.exp(-(Ymm * Ymm) / (0.18 * xm) ** 2),
    { rgb, unitsPerPx: (2 * xm) / w, key: `int${a}${st.lam}${st.D}`, res: 2 });
  label(ctx, `${t('in.screen')} — ${t('in.scale', { x: qty(xm, 1, 'mm') })}`, W / 2, y0 + h + 18, { size: 11, weight: 700, color: cssVar('--muted') });
  label(ctx, `a = ${qty(a, 2, 'mm')} · λ = ${qty(st.lam, 0, 'nm')} · D = ${qty(st.D, 1, 'm')}`, W / 2, y0 + h + 40, { size: 12, weight: 800 });
}

/* ---------- Tab 4: Huygens' principle ---------- */
const HG = { gw: 150, gh: 100, cell: 4, lam: 8, bx: 38 }; // grid cells, wavelength in cells, barrier column
let hgCache = { key: '', re: null, im: null, max: 1 };
function huygensField(gap) {
  const key = String(gap);
  if (hgCache.key === key) return hgCache;
  const { gw, gh, lam, bx } = HG, k = TAU / lam, half = (gap * lam) / 2, cy = gh / 2;
  const n = Math.max(3, Math.round(gap * 6));
  const src = Array.from({ length: n }, (_, j) => cy - half + (j + 0.5) * (2 * half / n));
  const re = new Float32Array(gw * gh), im = new Float32Array(gw * gh);
  let max = 0;
  for (let j = 0; j < gh; j++) for (let i = bx + 1; i < gw; i++) {
    let a = 0, b = 0;
    for (const sy of src) { const r = Math.hypot(i - bx, j - sy); const amp = 1 / Math.sqrt(r + 1); a += amp * Math.cos(k * r); b += amp * Math.sin(k * r); }
    re[j * gw + i] = a; im[j * gw + i] = b;
    if (i > bx + 40) max = Math.max(max, Math.hypot(a, b));
  }
  hgCache = { key, re, im, max: max || 1, src };
  return hgCache;
}
let hgCanvas = null;
function drawHuygens(ctx, st) {
  const { gw, gh, cell, lam, bx } = HG, F = huygensField(st.gap), wt = st.t * 3, k = TAU / lam;
  if (!hgCanvas) { hgCanvas = document.createElement('canvas'); hgCanvas.width = gw; hgCanvas.height = gh; }
  const c = hgCanvas.getContext('2d'), img = c.createImageData(gw, gh), d = img.data;
  const half = (st.gap * lam) / 2, cy = gh / 2;
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    let v;
    if (i < bx) v = Math.cos(k * i - wt);
    else if (i === bx) v = Math.abs(j - cy) <= half ? Math.cos(k * i - wt) : null;
    else { const p = j * gw + i; v = (F.re[p] * Math.cos(wt) + F.im[p] * Math.sin(wt)) / F.max; v = Math.max(-1.5, Math.min(1.5, v)); }
    const q = (j * gw + i) * 4;
    if (v == null) { d[q] = 60; d[q + 1] = 60; d[q + 2] = 70; d[q + 3] = 255; continue; }
    const u = Math.max(0, v); // crests bright
    d[q] = 20 + 200 * u; d[q + 1] = 40 + 190 * u; d[q + 2] = 90 + 160 * Math.min(1, u + 0.3); d[q + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  ctx.save(); ctx.imageSmoothingEnabled = true; ctx.drawImage(hgCanvas, 0, 0, gw * cell, gh * cell); ctx.restore();
  // barrier
  const X = bx * cell, y1 = (cy - half) * cell, y2 = (cy + half) * cell;
  ctx.fillStyle = cssVar('--metal'); ctx.fillRect(X - 3, 0, 6, y1); ctx.fillRect(X - 3, y2, 6, gh * cell - y2);
  label(ctx, 'B', X - 12, y1 - 8, { size: 13, weight: 800 }); label(ctx, 'G', X - 12, y2 + 10, { size: 13, weight: 800 });
  // geometrical shadow limits (ray model)
  ctx.save(); ctx.strokeStyle = '#ffd34d'; ctx.setLineDash([6, 5]); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(X, y1); ctx.lineTo(gw * cell, y1); ctx.moveTo(X, y2); ctx.lineTo(gw * cell, y2); ctx.stroke(); ctx.restore();
  // a few secondary wavelets from points of the aperture
  if (st.wavelets) {
    const phase = ((wt / TAU) % 1 + 1) % 1;
    ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1.2;
    const pts = st.gap < 1.5 ? [cy] : [cy - half * 0.8, cy, cy + half * 0.8];
    for (const py of pts) for (let m = 0; m < 3; m++) {
      const r = (phase + m - (bx % lam) / lam + 1) * lam * cell;
      ctx.beginPath(); ctx.arc(X, py * cell, r, -Math.PI / 2, Math.PI / 2); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(X, py * cell, 3, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  label(ctx, t('hg.shadow'), 590, y1 - 10, { size: 11, weight: 700, color: '#ffd34d', align: 'right', halo: false });
  label(ctx, t('hg.gap', { n: num(st.gap, 1) }), 12, 388, { size: 12, weight: 800, align: 'left' });
}

/* ---------- Tab 5: light, an electromagnetic wave ---------- */
const BANDS = [[-14, -11, 'gamma'], [-11, -8, 'x'], [-8, Math.log10(4e-7), 'uv'], [Math.log10(4e-7), Math.log10(8e-7), 'vis'], [Math.log10(8e-7), -3, 'ir'], [-3, 0, 'micro'], [0, 3, 'radio'], [3, 5, 'long']];
function drawEM(ctx, st) {
  const col = lambdaCSS(st.lam);
  // perspective wave along Ox: E vertical, B along the depth (oblique)
  const x0 = 60, x1 = 560, y = 140, A = 70, lamPx = 160, ph = st.t * 3;
  ink(ctx, 1.5); arrow(ctx, 40, y, 585, y, 8); label(ctx, 'x', 588, y + 14, { size: 13, weight: 800 });
  const ex = 0, ey = -1, bx = -0.55, by = 0.38; // unit directions on the drawing
  ctx.lineWidth = 2.5;
  for (const [cx, cy, c, lab] of [[ex, ey, cssVar('--s1'), 'E'], [bx, by, cssVar('--s5'), 'B']]) {
    ctx.strokeStyle = c; ctx.beginPath();
    for (let x = x0; x <= x1; x += 3) { const v = Math.sin(TAU * (x - x0) / lamPx - ph) * A * (lab === 'B' ? 0.75 : 1); const px = x + cx * v, py = y + cy * v; if (x === x0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
    ctx.stroke();
    ctx.fillStyle = c;
    for (let x = x0 + 10; x <= x1; x += 20) { const v = Math.sin(TAU * (x - x0) / lamPx - ph) * A * (lab === 'B' ? 0.75 : 1); if (Math.abs(v) < 6) continue; ctx.globalAlpha = 0.45; ctx.lineWidth = 1.2; arrow(ctx, x, y, x + cx * v, y + cy * v, 5); ctx.globalAlpha = 1; }
    label(ctx, lab, x0 + (lab === 'E' ? 0 : -40), y + (lab === 'E' ? -A - 14 : 40), { size: 15, weight: 800, color: c });
  }
  ctx.lineWidth = 1.2; ink(ctx, 1.2);
  arrow(ctx, x0, y + A + 20, x0 + lamPx, y + A + 20, 6); arrow(ctx, x0 + lamPx, y + A + 20, x0, y + A + 20, 6);
  label(ctx, 'λ', x0 + lamPx / 2, y + A + 32, { size: 13, weight: 800 });
  ctx.fillStyle = col; roundRect(ctx, 470, 16, 110, 30, 8); ctx.fill();
  label(ctx, qty(st.lam, 0, 'nm'), 525, 31, { size: 13, weight: 800, color: '#fff', halo: false });
  // spectrum strip (logarithmic wavelength scale)
  const sx0 = 20, sx1 = 580, sy = 300, lx = (lg) => sx0 + ((lg + 14) / 19) * (sx1 - sx0);
  BANDS.forEach(([a, b, k], j) => {
    if (k === 'vis') {
      const g = ctx.createLinearGradient(lx(a), 0, lx(b), 0);
      for (let s = 0; s <= 8; s++) g.addColorStop(s / 8, lambdaCSS(400 + 50 * s));
      ctx.fillStyle = g;
    } else ctx.fillStyle = j % 2 ? 'rgba(120,140,170,0.30)' : 'rgba(120,140,170,0.18)';
    ctx.fillRect(lx(a), sy, lx(b) - lx(a), 34);
    if (k !== 'vis') label(ctx, t(`band.${k}`), (lx(a) + lx(b)) / 2, sy + 17, { size: 10, weight: 700, halo: false });
  });
  label(ctx, t('band.vis'), lx(-6.25), sy - 10, { size: 10, weight: 800 });
  ink(ctx, 1); for (let lg = -14; lg <= 4; lg += 2) { ctx.beginPath(); ctx.moveTo(lx(lg), sy + 34); ctx.lineTo(lx(lg), sy + 40); ctx.stroke(); label(ctx, `10${sup(lg)}`, lx(lg), sy + 50, { size: 10, weight: 600, halo: false }); }
  label(ctx, t('em.lamAxis'), sx1, sy + 66, { size: 10, weight: 700, align: 'right', halo: false });
  // visible zoom 400–800 nm
  const vx0 = 120, vx1 = 480, vy = 390;
  const g = ctx.createLinearGradient(vx0, 0, vx1, 0);
  for (let s = 0; s <= 16; s++) g.addColorStop(s / 16, lambdaCSS(400 + 25 * s));
  ctx.fillStyle = g; ctx.fillRect(vx0, vy, vx1 - vx0, 18);
  ink(ctx, 1); ctx.strokeRect(vx0, vy, vx1 - vx0, 18);
  label(ctx, '400 nm', vx0, vy + 30, { size: 10, weight: 700 }); label(ctx, '800 nm', vx1, vy + 30, { size: 10, weight: 700 });
  const mx = vx0 + ((st.lam - 400) / 400) * (vx1 - vx0);
  ink(ctx, 2); ctx.beginPath(); ctx.moveTo(mx, vy - 6); ctx.lineTo(mx, vy + 24); ctx.stroke();
  ctx.strokeStyle = cssVar('--muted'); ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(lx(Math.log10(4e-7)), sy + 34); ctx.lineTo(vx0, vy); ctx.moveTo(lx(Math.log10(8e-7)), sy + 34); ctx.lineTo(vx1, vy); ctx.stroke(); ctx.setLineDash([]);
}
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const sup = (n) => String(n).split('').map((c) => SUP[c]).join('');

/* ================================================================
   Controls and measurements
   ================================================================ */
const controlsBody = document.getElementById('controls-body');
const measuresBody = document.getElementById('measures-body');
let ui = {};
let tableSig = '';
function measRows(dl, rows) { dl.replaceChildren(...rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)])); }
function showStatus(box, fb) {
  if (!fb) { box.hidden = true; return; }
  box.hidden = false; box.className = `status ${fb.type || ''}`; box.textContent = t(fb.key, fb.params);
}
function hint(key) { return el('p', { class: 'muted', style: 'font-size:0.88rem;margin:10px 0 0', dataset: { i18n: key } }, t(key)); }
const btnRow = (...b) => el('div', { class: 'btn-row' }, b);
const resetBtn = (id) => btnRow(createButton({ labelKey: 'ui.reset', variant: 'ghost', onClick: () => resetTab(id) }));
const fbOf = (res, okKey, badKey) => (res === 'invalid' ? { type: 'warn', key: 'calcInvalid' } : res === 'wrong' ? { type: 'bad', key: badKey } : { type: 'good', key: okKey });
const relTol = (v, p, min = 1e-9) => Math.max(Math.abs(v) * p, min);
function tableBlock(st) {
  ui.dl = el('dl', { class: 'meas' });
  ui.tableWrap = el('div', { class: 'table-scroll' });
  ui.table = el('table', { class: 'data' });
  ui.tableWrap.append(ui.table);
  ui.clear = el('div', { class: 'btn-row', style: 'margin-top:8px' }, [createButton({ labelKey: 'ctl.clearTable', variant: 'ghost', onClick: () => { st.rows = []; st.fb = null; refresh(); } })]);
  ui.status = el('p', { class: 'status', hidden: '' });
  measuresBody.append(ui.dl, ui.tableWrap, ui.clear, ui.status);
}
function renderTable(st, rows, cols, rowFn) {
  const sig = calcSig(rows) + rows.length + cols.join();
  if (sig !== tableSig) {
    ui.table.replaceChildren(el('thead', {}, el('tr', {}, cols.map((k) => el('th', {}, t(k))))), el('tbody', {}, rows.map(rowFn)));
    tableSig = sig;
  }
  ui.tableWrap.hidden = rows.length === 0;
  ui.clear.hidden = ui.tableWrap.hidden;
  showStatus(ui.status, st.fb);
}
const cell = (st, r, key, expected, decimals, tol, okKey, badKey, disabled = false) =>
  calcCell(r, key, { expected, decimals, tol, disabled, onCheck: (res) => { st.fb = fbOf(res, okKey, badKey); refresh(); } });
const td = (v) => el('td', {}, v);
const recordBtn = (fn) => createButton({ labelKey: 'ctl.record', variant: 'secondary', onClick: fn });
const sliderEl = (st, key, prop, min, max, step, unit, dec, after) => createSlider({ labelKey: key, min, max, step, value: st[prop], unit, decimals: dec, onInput: (v) => { st[prop] = v; after?.(); refresh(); } }).root;
const seg = (st, key, prop, opts, after) => createSegmented({ labelKey: key, options: opts, value: st[prop], onChange: (v) => { st[prop] = v; after?.(); refresh(); } }).root;
const asBool = (v) => v === true || v === 'true';

/* ---------- Tab 1 ---------- */
function buildSlit() {
  const st = S.slit;
  controlsBody.append(
    seg(st, 'ctl.a', 'a', [2, 0.4, 0.2, 0.1, 0.05].map((v) => ({ value: v, labelKey: `a.${String(v).replace('.', '_')}` })), () => { st.a = Number(st.a); }),
    seg(st, 'ctl.orient', 'vertical', [{ value: true, labelKey: 'sl.vertical' }, { value: false, labelKey: 'sl.horizontal' }], () => { st.vertical = asBool(st.vertical); }),
    sliderEl(st, 'ctl.D', 'D', 1, 3, 0.5, 'm', 1),
    btnRow(recordBtn(() => { if (st.a >= 1) { st.fb = { type: 'warn', key: 'fb.wide' }; refresh(); return; } st.rows.push({ a: st.a, D: st.D }); st.fb = null; refresh(); })),
    hint('hint.slit'), resetBtn('slit'));
  tableBlock(st);
}
function updateSlit() {
  const st = S.slit;
  measRows(ui.dl, [[t('m.lam'), qty(LASER, 0, 'nm')], [t('m.a'), qty(st.a, 2, 'mm')], [t('m.D'), qty(st.D, 1, 'm')]]);
  renderTable(st, st.rows, ['col.a', 'col.D', 'col.Lread'], (r) => {
    const L = slitL(r.a, LASER, r.D);
    return el('tr', {}, [td(num(r.a, 2)), td(num(r.D, 1)), cell(st, r, 'L', L, 1, Math.max(0.6, 0.08 * L), 'fb.LreadOk', 'fb.LreadWrong')]);
  });
}

/* ---------- Tab 2 ---------- */
function buildObstacles() {
  const st = S.obstacles;
  controlsBody.append(seg(st, 'ctl.obj', 'obj', ['hole', 'rect', 'hair', 'grating'].map((v) => ({ value: v, labelKey: `ob.${v}` })), () => buildTab('obstacles')));
  if (st.obj === 'hole') controlsBody.append(seg(st, 'ctl.d', 'd', [1, 0.6, 0.4, 0.3].map((v) => ({ value: v, labelKey: `d.${String(v).replace('.', '_')}` })), () => { st.d = Number(st.d); }));
  controlsBody.append(hint('hint.obstacles'), resetBtn('obstacles'));
  ui.dl = el('dl', { class: 'meas' }); measuresBody.append(ui.dl);
}
function updateObstacles() {
  const st = S.obstacles;
  const rows = [[t('m.lam'), qty(LASER, 0, 'nm')], [t('m.D'), qty(2, 1, 'm')]];
  if (st.obj === 'hole') rows.push([t('m.ring'), qty((1.22 * LASER * 1e-6 * 2000) / st.d, 1, 'mm')]);
  measRows(ui.dl, rows);
}

/* ---------- Tab 3 ---------- */
function buildIntensity() {
  const st = S.intensity;
  controlsBody.append(sliderEl(st, 'ctl.aI', 'a', 0.05, 1, 0.05, 'mm', 2), sliderEl(st, 'ctl.lam', 'lam', 400, 800, 10, 'nm', 0), sliderEl(st, 'ctl.D', 'D', 1, 3, 0.5, 'm', 1),
    btnRow(recordBtn(() => { st.rows.push({ a: st.a, lam: st.lam, D: st.D }); st.fb = null; refresh(); })), hint('hint.intensity'), resetBtn('intensity'));
  tableBlock(st);
}
function updateIntensity() {
  const st = S.intensity;
  measRows(ui.dl, [[t('m.a'), qty(st.a, 2, 'mm')], [t('m.lamI'), qty(st.lam, 0, 'nm')], [t('m.D'), qty(st.D, 1, 'm')]]);
  renderTable(st, st.rows, ['col.a', 'col.lam', 'col.D', 'col.alpha', 'col.L'], (r) => {
    const al = (2 * r.lam * 1e-9) / (r.a * 1e-3) * 1000, L = al * r.D; // mrad, mm
    return el('tr', {}, [td(num(r.a, 2)), td(num(r.lam, 0)), td(num(r.D, 1)),
      cell(st, r, 'al', al, 2, relTol(al, 0.01), 'fb.alphaOk', 'fb.alphaWrong'),
      cell(st, r, 'L', L, 2, relTol(L, 0.01), 'fb.LOk', 'fb.LWrong', !calcDone(r, 'al'))]);
  });
}

/* ---------- Tab 4 ---------- */
function buildHuygens() {
  const st = S.huygens;
  ui.go = createButton({ labelKey: 'ctl.pause', variant: 'secondary', onClick: () => { st.run = !st.run; refresh(); } });
  controlsBody.append(sliderEl(st, 'ctl.gap', 'gap', 0.5, 6, 0.5, '× λ', 1), seg(st, 'ctl.wavelets', 'wavelets', [{ value: true, labelKey: 'hg.show' }, { value: false, labelKey: 'hg.hide' }], () => { st.wavelets = asBool(st.wavelets); }),
    btnRow(ui.go), hint('hint.huygens'), resetBtn('huygens'));
  ui.dl = el('dl', { class: 'meas' }); measuresBody.append(ui.dl);
}
function updateHuygens() {
  const st = S.huygens;
  const k = st.run ? 'ctl.pause' : 'ctl.play';
  if (ui.go.dataset.i18n !== k) { ui.go.dataset.i18n = k; ui.go.textContent = t(k); }
  measRows(ui.dl, [[t('m.gap'), t('hg.gapV', { n: num(st.gap, 1) })], [t('m.spread'), t(st.gap <= 1 ? 'hg.spreadAll' : st.gap <= 3 ? 'hg.spreadSome' : 'hg.spreadLittle')]]);
}

/* ---------- Tab 5 ---------- */
function buildEM() {
  const st = S.em;
  controlsBody.append(sliderEl(st, 'ctl.lamV', 'lam', 400, 800, 5, 'nm', 0),
    seg(st, 'ctl.n', 'n', [1, 1.33, 1.5].map((v) => ({ value: v, labelKey: `n.${String(v).replace('.', '_')}` })), () => { st.n = Number(st.n); }),
    btnRow(recordBtn(() => { st.rows.push({ lam: st.lam, n: st.n }); st.fb = null; refresh(); })), hint('hint.em'), resetBtn('em'));
  tableBlock(st);
}
function updateEM() {
  const st = S.em;
  measRows(ui.dl, [[t('m.lamV'), qty(st.lam, 0, 'nm')], [t('m.color'), t(colorKey(st.lam))], [t('m.n'), num(st.n, 2)]]);
  renderTable(st, st.rows, ['col.lam', 'col.n', 'col.nu', 'col.v'], (r) => {
    const nu = C0 / (r.lam * 1e-9) / 1e14, v = C0 / r.n / 1e8;
    return el('tr', {}, [td(num(r.lam, 0)), td(num(r.n, 2)),
      cell(st, r, 'nu', nu, 2, relTol(nu, 0.01), 'fb.nuOk', 'fb.nuWrong'),
      cell(st, r, 'v', v, 2, relTol(v, 0.01), 'fb.vOk', 'fb.vWrong', !calcDone(r, 'nu'))]);
  });
}
function colorKey(nm) { return nm < 450 ? 'clr.violet' : nm < 490 ? 'clr.blue' : nm < 560 ? 'clr.green' : nm < 590 ? 'clr.yellow' : nm < 630 ? 'clr.orange' : 'clr.red'; }

/* ---------- Tab switching ---------- */
function buildTab(id) {
  controlsBody.replaceChildren();
  measuresBody.replaceChildren();
  ui = {};
  tableSig = '';
  ({ slit: buildSlit, obstacles: buildObstacles, intensity: buildIntensity, huygens: buildHuygens, em: buildEM })[id]();
  loop.start();
  shell?.refreshActivity();
  refresh();
}
function updateMeasures() {
  if (!shell || !ui.dl) return;
  ({ slit: updateSlit, obstacles: updateObstacles, intensity: updateIntensity, huygens: updateHuygens, em: updateEM })[shell.tab]();
}
function refresh() { updateMeasures(); requestDraw(); }
function resetTab(id) { S[id] = initialState(id); buildTab(id); }
onLangChange(() => { if (shell) buildTab(shell.tab); });

shell = initSim({
  strings,
  tabs: TABS.map((id) => ({ id, labelKey: `tab.${id}` })),
  initialTab: 'slit',
  onTab: buildTab,
  activityKey: (tab) => (tab === 'obstacles' ? `act.obstacles.${S.obstacles.obj}` : `act.${tab}`),
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, slitL };
