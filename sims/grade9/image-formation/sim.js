// Grade 9 — Formation of images (Ch.3: Act. 1–7; Ex. 1–6, 8, 9, 12). NOT REQUIRED IN 2026–2027 (owner: built for next year).
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num } from '../../../shared/format.js';
import { createButton, createSegmented, createSlider, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, font } from '../../../shared/draw.js';
import { drawRay, LIGHT } from '../../../shared/optics-draw.js';

/* ================================================================
   Model: thin lens. Distances in cm, heights in cm (upward).
   Object at distance d in front of the lens; image at d′ = d·f / (d − f) (d′ > 0: behind the lens, real;
   d′ < 0: in front of the lens, virtual); magnification m = −d′ / d (m < 0: inverted).
   A ray reaching the lens at height y with slope u leaves with slope u − y / f.
   ================================================================ */
const F_BENCH = 10;      // the book's lens for Activity 6 (f = 10 cm)
const FAR = 200;         // "very far" object: d = 2 m (Activity 6, C1)
const R_LENS = 4;        // radius of the bench lens (cm)
const H_OBJ = 2;         // height of the letter F / of the filament (cm)
const PRESETS = [200, 30, 20, 15, 10, 8];
function imageOf(d, f) {
  if (Math.abs(d - f) < 1e-6) return { inf: true };
  const dp = (d * f) / (d - f);
  return { inf: false, dp, m: -dp / d };
}
const outSlope = (uIn, y, f) => uIn - y / f;
const rand = (a) => a[Math.floor(Math.random() * a.length)];
const snap = (v, s = 0.5) => Math.round(v / s) * s;
// The correct characteristics for an object at d from a converging lens (or a diverging one when f < 0)
function expected(d, f) {
  const im = imageOf(d, f);
  if (im.inf) return null;
  const am = Math.abs(im.m);
  return { nature: im.dp > 0 ? 'real' : 'virtual', dir: im.m < 0 ? 'inverted' : 'erect', size: Math.abs(am - 1) < 0.02 ? 'same' : am > 1 ? 'larger' : 'smaller' };
}

function newPractice() {
  for (;;) {
    const f = rand([6, 8, 10, 12]);
    const d = snap(f * (0.4 + Math.random() * 2.6));
    const h = rand([2, 3, 4, 5]);
    const im = imageOf(d, f);
    if (Math.abs(d - f) < 1.5 || im.inf || Math.abs(im.dp) > 30 || Math.abs(im.m * h) > 9 || d * 8 > 290) continue;
    return { f, d, h };
  }
}
function initialState(tab) {
  switch (tab) {
    case 'bench': return { obj: 'F', d: 30, s: 20, look: false, ans: { nature: '', dir: '', size: '' }, rows: [], fb: null };
    case 'construct': return { mode: 'explore', f: 10, d: 30, h: 5, show: 'rays', cover: false, pr: newPractice(), guess: { x: 24, y: 14 }, revealed: false, score: 0, tries: 0, fb: null };
    default: return { fabs: 10, d: 20, h: 5, show: 'rays', look: true, ans: { nature: '', dir: '', size: '' }, rows: [], fb: null };
  }
}
const TABS = ['bench', 'construct', 'div'];
let S = Object.fromEntries(TABS.map((k) => [k, initialState(k)]));

/* ================================================================
   Canvas
   ================================================================ */
const HEIGHTS = { bench: 480, construct: 420, div: 540 };
let shell;
let hit = [];
let drag = null;
let drawQueued = false;
const canvas = document.getElementById('stage');
canvas.style.touchAction = 'none';
const view = setupCanvas(canvas, { width: 600, height: 480, maxHeightVh: () => (window.innerWidth < 880 ? 52 : 76), onResize: () => requestDraw() });
const diag = setupCanvas(document.getElementById('diagram'), { width: 360, height: 200, maxHeightVh: 30, onResize: () => requestDraw() });
function requestDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; draw(); });
}
onThemeChange(() => requestDraw());
const cur = () => S[shell.tab];
function tag(ctx, s, x, y, color = cssVar('--text'), size = 14, align = 'center', weight = 800) {
  ctx.fillStyle = color; ctx.font = font(size, weight); ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(s, x, y);
}
const IMG = '#8e44ad';       // colour of the image A′B′
const OUT = '#f08a1c';       // colour of the emergent rays (as in the Lenses sim)
// filter: blur() is used when the browser supports it on canvas; otherwise several shifted copies
const FILTER_OK = (() => { try { const c = document.createElement('canvas').getContext('2d'); c.filter = 'blur(2px)'; return c.filter === 'blur(2px)'; } catch { return false; } })();

// Letter F (or the filament) with its foot A at (x, y): height H_OBJ·k px, k px per cm (negative → turned by 180°)
function paintObject(ctx, obj, x, y, k, color) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(k, k);
  ctx.fillStyle = color; ctx.strokeStyle = color;
  if (obj === 'F') {
    ctx.fillRect(-0.55, -2, 0.36, 2);       // stem (A at the bottom of the stem, on the axis)
    ctx.fillRect(-0.55, -2, 1.25, 0.34);    // top bar
    ctx.fillRect(-0.55, -1.15, 0.95, 0.32); // middle bar
  } else {
    // filament: a small helix between two supports
    ctx.lineWidth = 0.16; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0);
    for (let i = 0; i <= 12; i++) ctx.lineTo((i % 2 ? 0.35 : -0.35), -i / 6);
    ctx.stroke();
  }
  ctx.restore();
}

function draw() {
  if (!shell) return;
  const tab = shell.tab;
  const st = cur();
  const H = HEIGHTS[tab];
  if (view.height !== H) view.setLogicalSize(600, H);
  const ctx = view.begin();
  ctx.fillStyle = cssVar('--board');
  roundRect(ctx, 8, 8, 584, H - 16, 14); ctx.fill();
  hit = [];
  if (tab === 'bench') { drawBench(ctx, st); drawBenchDiagram(st); }
  else if (tab === 'construct') drawConstructTab(ctx, st);
  else drawDivTab(ctx, st);
}

/* ---------- Activities 1, 4, 6: optical bench ---------- */
const LXB = 300, AXB = 140, KX = 7, KY = 12; // lens position, axis, px per cm (horizontal / vertical)
const BX = (x) => LXB + x * KX, BY = (y) => AXB - y * KY;
function benchImage(st) { return imageOf(st.d, F_BENCH); }
function blurRadius(st) {
  const im = benchImage(st);
  if (im.inf) return R_LENS;
  return (R_LENS * Math.abs(st.s - im.dp)) / Math.abs(im.dp);
}
function isSharp(st) {
  const im = benchImage(st);
  return !im.inf && im.dp > 0 && im.dp <= 40 && blurRadius(st) < 0.06;
}
function drawBench(ctx, st) {
  const far = st.d >= FAR;
  const rail = AXB + 82;
  // bench rail with a scale in cm (origin at the lens)
  ctx.fillStyle = cssVar('--bench'); roundRect(ctx, 16, rail, 568, 10, 3); ctx.fill();
  ctx.strokeStyle = cssVar('--muted'); ctx.lineWidth = 1;
  ctx.font = font(9, 600); ctx.fillStyle = cssVar('--muted'); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let c = -40; c <= 40; c += 5) {
    const x = BX(c); if (x < 18 || x > 582) continue;
    ctx.beginPath(); ctx.moveTo(x, rail); ctx.lineTo(x, rail + (c % 10 ? 4 : 7)); ctx.stroke();
    if (c % 10 === 0) ctx.fillText(`${Math.abs(c)}`, x, rail + 12);
  }
  // optical axis
  ctx.setLineDash([8, 5]); ctx.strokeStyle = cssVar('--muted'); ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(16, AXB); ctx.lineTo(584, AXB); ctx.stroke(); ctx.setLineDash([]);
  // foci
  for (const [x, n] of [[-F_BENCH, 'F'], [F_BENCH, 'F’']]) {
    ctx.fillStyle = cssVar('--accent'); ctx.beginPath(); ctx.arc(BX(x), AXB, 3.5, 0, 7); ctx.fill();
    tag(ctx, n, BX(x), AXB + 13, cssVar('--accent'), 12);
  }
  // object position
  const xo = far ? 46 : BX(-st.d);
  const im = benchImage(st);
  // beam of light from B (top of the object) through the lens, stopped by the screen
  const B = { x: -st.d, y: H_OBJ };
  const xEdge = (16 - LXB) / KX;
  const inc = (yl) => { const x0 = Math.max(-st.d, xEdge); return [x0, B.y + ((yl - B.y) * (x0 + st.d)) / st.d]; };
  const outAt = (yl, x) => yl + outSlope((yl - B.y) / st.d, yl, F_BENCH) * x;
  const xs = st.s;
  const ys = [R_LENS, -R_LENS].map((yl) => outAt(yl, xs));
  const a0 = inc(R_LENS), a1 = inc(-R_LENS);
  ctx.save(); ctx.beginPath(); ctx.rect(16, 16, 568, rail - 20); ctx.clip();
  ctx.fillStyle = 'rgba(255, 214, 80, 0.28)';
  ctx.beginPath(); ctx.moveTo(far ? 16 : BX(a0[0]), BY(a0[1])); ctx.lineTo(BX(0), BY(R_LENS)); ctx.lineTo(BX(0), BY(-R_LENS)); ctx.lineTo(far ? 16 : BX(a1[0]), BY(a1[1])); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(BX(0), BY(R_LENS)); ctx.lineTo(BX(0), BY(-R_LENS)); ctx.lineTo(BX(xs), BY(ys[1])); ctx.lineTo(BX(xs), BY(ys[0])); ctx.closePath(); ctx.fill();
  for (const yl of [R_LENS, 0, -R_LENS]) {
    const p = inc(yl);
    drawRay(ctx, BX(p[0]), BY(p[1]), BX(0), BY(yl), { arrows: 1, width: 1.3 });
    drawRay(ctx, BX(0), BY(yl), BX(xs), BY(outAt(yl, xs)), { arrows: 1, width: 1.3 });
  }
  ctx.restore();
  // lantern and object (letter F cut in a black card, or the lamp)
  const holder = (x, top) => { ctx.fillStyle = cssVar('--metal'); ctx.fillRect(x - 3, top, 6, rail - top); ctx.fillRect(x - 12, rail - 4, 24, 5); };
  if (far) {
    // break marks on the rail: the object is 2 m away
    ctx.fillStyle = cssVar('--board'); ctx.fillRect(70, rail - 2, 14, 16);
    ctx.strokeStyle = cssVar('--muted'); ctx.lineWidth = 1.5;
    for (const dx of [70, 84]) { ctx.beginPath(); ctx.moveTo(dx - 3, rail + 14); ctx.lineTo(dx + 3, rail - 4); ctx.stroke(); }
    tag(ctx, 'd = 2 m', 90, AXB - 64, cssVar('--text'), 12, 'left', 700);
  }
  holder(xo, AXB + 30);
  if (st.obj === 'F') {
    ctx.fillStyle = '#ffe9a8'; ctx.beginPath(); ctx.arc(xo - 26, AXB - 10, 20, 0, 7); ctx.fill();
    ctx.fillStyle = cssVar('--box'); roundRect(ctx, xo - 40, AXB - 26, 22, 34, 4); ctx.fill(); // lantern behind (on the left)
    ctx.fillStyle = '#1f232a'; ctx.fillRect(xo - 3, AXB - 44, 6, 74); // the black card, seen from the side
    ctx.fillStyle = LIGHT; ctx.fillRect(xo - 3, BY(H_OBJ), 6, H_OBJ * KY); // the cut-out letter, lit from behind
  } else {
    const g = ctx.createRadialGradient(xo, AXB - 12, 2, xo, AXB - 12, 30);
    g.addColorStop(0, 'rgba(255, 230, 120, 0.9)'); g.addColorStop(1, 'rgba(255, 230, 120, 0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(xo, AXB - 12, 30, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff3b0'; ctx.strokeStyle = '#a89c62'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(xo, AXB - 12, 14, 0, 7); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#d98d1e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(xo, AXB); ctx.lineTo(xo, BY(H_OBJ)); ctx.stroke();
  }
  tag(ctx, 'A', xo + 10, AXB + 10, cssVar('--text'), 12);
  tag(ctx, 'B', xo + 10, BY(H_OBJ) - 4, cssVar('--text'), 12);
  if (!far) hit.push({ kind: 'obj', x: xo, y: AXB - 10, r: 28 });
  // lens (L)
  holder(LXB, AXB + 52);
  ctx.beginPath(); ctx.ellipse(LXB, AXB, 9, R_LENS * KY, 0, 0, 7);
  ctx.fillStyle = 'rgba(140, 200, 235, 0.45)'; ctx.fill(); ctx.strokeStyle = 'rgba(40, 110, 160, 0.9)'; ctx.lineWidth = 2; ctx.stroke();
  tag(ctx, '(L)', LXB, AXB - R_LENS * KY - 12, cssVar('--text'), 13);
  // translucent screen (E)
  const xsPx = BX(st.s);
  holder(xsPx, AXB + 62);
  ctx.fillStyle = 'rgba(245, 245, 240, 0.92)'; ctx.strokeStyle = cssVar('--muted'); ctx.lineWidth = 1.5;
  ctx.fillRect(xsPx - 3, AXB - 62, 6, 124); ctx.strokeRect(xsPx - 3, AXB - 62, 6, 124);
  tag(ctx, '(E)', xsPx, AXB - 74, cssVar('--text'), 13);
  hit.push({ kind: 'screen', x: xsPx, y: AXB, r: 34 });
  // where the image is formed (only marked once it is sharp on the screen)
  if (isSharp(st)) tag(ctx, '✓', xsPx + 14, AXB - 50, cssVar('--good'), 18);
  if (!im.inf && im.dp > 40) tag(ctx, t('lbl.beyond'), 580, AXB - 90, cssVar('--warn'), 11, 'right', 700);

  // insets: what is seen on the screen, and through the lens
  const top = 270, hgt = H_BENCH_INSET;
  drawScreenInset(ctx, st, 16, top, 280, hgt);
  drawLookInset(ctx, st, 304, top, 280, hgt);
}
const H_BENCH_INSET = 196;
let off = null;
const PXS = 18; // px per cm on the screen inset
function drawScreenInset(ctx, st, x, y, w, h) {
  ctx.fillStyle = cssVar('--surface'); roundRect(ctx, x, y, w, h, 10); ctx.fill();
  tag(ctx, t('lbl.onScreen'), x + 10, y + 14, cssVar('--muted'), 12, 'left', 700);
  // the screen face, about 8 cm × 8 cm at 18 px/cm
  const side = 150, sx = x + (w - side) / 2, sy = y + 30, cx = sx + side / 2, cy = sy + side / 2;
  ctx.fillStyle = '#7d828a'; ctx.fillRect(sx, sy, side, side);
  ctx.save(); ctx.beginPath(); ctx.rect(sx, sy, side, side); ctx.clip();
  const im = benchImage(st);
  const r = blurRadius(st);                 // radius of the blur spot of a point (cm)
  const k = (-st.s / st.d) * PXS;           // the chief ray through O fixes the centre of each spot
  const light = st.obj === 'F' ? '#fff6c8' : '#ffd36a';
  if (r > 0.6) {
    // very blurred: a patch of light whose brightness drops as it spreads
    const rr = Math.min(400, (r + Math.abs(k / PXS) * H_OBJ * 0.5) * PXS);
    const a = Math.max(0.12, Math.min(0.9, 9 / (rr * 0.6)));
    const g = ctx.createRadialGradient(cx, cy + k * H_OBJ * 0.5, 0, cx, cy + k * H_OBJ * 0.5, rr);
    g.addColorStop(0, `rgba(255, 240, 180, ${a})`); g.addColorStop(0.75, `rgba(255, 240, 180, ${a * 0.8})`); g.addColorStop(1, 'rgba(255, 240, 180, 0)');
    ctx.fillStyle = g; ctx.fillRect(sx, sy, side, side);
  } else {
    if (!off) { off = document.createElement('canvas'); off.width = 300; off.height = 300; }
    const o = off.getContext('2d');
    o.setTransform(1, 0, 0, 1, 0, 0); o.clearRect(0, 0, 300, 300);
    o.setTransform(2, 0, 0, 2, 0, 0);
    paintObject(o, st.obj, side / 2, side / 2, k, light);
    const bpx = r * PXS;
    if (bpx < 0.35) ctx.drawImage(off, sx, sy, side, side);
    else if (FILTER_OK) { ctx.filter = `blur(${bpx.toFixed(2)}px)`; ctx.drawImage(off, sx, sy, side, side); ctx.filter = 'none'; }
    else {
      ctx.globalAlpha = 1 / 9;
      for (let i = 0; i < 9; i++) { const an = (i / 8) * Math.PI * 2, rr = i ? bpx : 0; ctx.drawImage(off, sx + rr * Math.cos(an), sy + rr * Math.sin(an), side, side); }
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
  ctx.strokeStyle = cssVar('--muted'); ctx.lineWidth = 1; ctx.strokeRect(sx, sy, side, side);
  // the axis meets the screen at its centre
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.moveTo(cx - 5, cy); ctx.lineTo(cx + 5, cy); ctx.moveTo(cx, cy - 5); ctx.lineTo(cx, cy + 5); ctx.stroke();
  const state = im.inf || im.dp <= 0 ? t('sharp.none') : isSharp(st) ? t('sharp.yes') : t('sharp.no');
  tag(ctx, state, x + w / 2, y + h - 10, isSharp(st) ? cssVar('--good') : cssVar('--muted'), 12, 'center', 700);
}
function drawLookInset(ctx, st, x, y, w, h) {
  ctx.fillStyle = cssVar('--surface'); roundRect(ctx, x, y, w, h, 10); ctx.fill();
  tag(ctx, t('lbl.through'), x + 10, y + 14, cssVar('--muted'), 12, 'left', 700);
  const cx = x + w / 2, cy = y + 104, R = 76;
  const im = benchImage(st);
  if (!st.look) { wrapText(ctx, t('lbl.lookOff'), cx, cy, w - 40, cssVar('--muted')); return; }
  if (!im.inf && im.dp > 0) { wrapText(ctx, t('lbl.lookReal'), cx, cy, w - 40, cssVar('--muted')); return; }
  // the eye close behind the lens sees the virtual image: erect and magnified, m = f / (f − d)
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.clip();
  ctx.fillStyle = '#3a3f48'; ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
  const sc = Math.min(im.inf ? 14 : im.m, 14) * 6;
  if (im.inf) ctx.filter = FILTER_OK ? 'blur(5px)' : 'none';
  paintObject(ctx, st.obj, cx, cy + (H_OBJ * sc) / 2, sc, st.obj === 'F' ? '#fff6c8' : '#ffd36a');
  ctx.filter = 'none';
  ctx.restore();
  ctx.strokeStyle = '#5b636e'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
  tag(ctx, im.inf ? t('lbl.atInf') : t('lbl.virtualSeen'), cx, y + h - 10, cssVar('--text'), 12, 'center', 700);
}
function wrapText(ctx, s, cx, cy, w, color) {
  ctx.font = font(13, 600); ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const words = s.split(' '); const lines = []; let ln = '';
  for (const wd of words) { const test = ln ? `${ln} ${wd}` : wd; if (ctx.measureText(test).width > w && ln) { lines.push(ln); ln = wd; } else ln = test; }
  lines.push(ln);
  lines.forEach((l, i) => ctx.fillText(l, cx, cy + (i - (lines.length - 1) / 2) * 18));
}
// Diagram card on the bench tab: the same set-up in symbols, with the construction of the image (Fig. 7b – 11b)
function drawBenchDiagram(st) {
  const ctx = diag.begin();
  const x0 = 180, ax = 100, kx = 4, ky = 14;
  const X = (x) => x0 + x * kx, Y = (y) => ax - y * ky;
  const ink = cssVar('--text');
  ctx.strokeStyle = cssVar('--muted'); ctx.lineWidth = 1; ctx.setLineDash([5, 4]);
  ctx.beginPath(); ctx.moveTo(10, ax); ctx.lineTo(350, ax); ctx.stroke(); ctx.setLineDash([]);
  // lens symbol (converging)
  ctx.strokeStyle = ink; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x0, ax - 70); ctx.lineTo(x0, ax + 70); ctx.stroke();
  for (const [yy, dir] of [[ax - 70, 1], [ax + 70, -1]]) { ctx.beginPath(); ctx.moveTo(x0 - 6, yy + 7 * dir); ctx.lineTo(x0, yy); ctx.lineTo(x0 + 6, yy + 7 * dir); ctx.stroke(); }
  for (const [x, n] of [[-F_BENCH, 'F'], [F_BENCH, 'F’']]) { ctx.fillStyle = cssVar('--accent'); ctx.beginPath(); ctx.arc(X(x), ax, 2.5, 0, 7); ctx.fill(); tag(ctx, n, X(x), ax + 11, cssVar('--accent'), 10); }
  tag(ctx, 'O', x0 + 8, ax + 10, ink, 10);
  const far = st.d >= FAR;
  const dDraw = far ? 42 : st.d;
  const bx = X(-dDraw), by = Y(H_OBJ);
  const arrowV = (x, y1, y2, color, dash) => {
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2; if (dash) ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y2); ctx.stroke(); ctx.setLineDash([]);
    const s = y2 < y1 ? 1 : -1; ctx.beginPath(); ctx.moveTo(x, y2); ctx.lineTo(x - 4, y2 + 7 * s); ctx.lineTo(x + 4, y2 + 7 * s); ctx.closePath(); ctx.fill();
  };
  arrowV(bx, ax, by, ink);
  tag(ctx, far ? 'AB (2 m)' : 'AB', bx - 4, by - 10, ink, 10);
  // screen
  ctx.strokeStyle = cssVar('--muted'); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(X(st.s), ax - 60); ctx.lineTo(X(st.s), ax + 60); ctx.stroke();
  tag(ctx, '(E)', X(st.s), ax - 68, cssVar('--muted'), 10);
  // the two particular rays from B
  const im = benchImage(st);
  const d = far ? FAR : st.d;
  const slopeO = -H_OBJ / d; // through O
  const Bx = far ? 10 : bx;
  const yAt = (x) => H_OBJ + slopeO * (x + d);
  drawRay(ctx, Bx, far ? Y(yAt(-42)) : by, x0, ax, { arrows: 1, width: 1.3 });
  drawRay(ctx, x0, ax, 350, Y(slopeO * 42.5), { arrows: 1, width: 1.3, color: OUT });
  drawRay(ctx, Bx, by, x0, by, { arrows: 1, width: 1.3 });
  drawRay(ctx, x0, by, 350, Y(H_OBJ - (H_OBJ / F_BENCH) * 42.5), { arrows: 1, width: 1.3, color: OUT });
  if (im.inf) { tag(ctx, t('lbl.atInf'), 270, 186, IMG, 10); return; }
  if (im.dp < 0) {
    drawRay(ctx, x0, ax, X(im.dp), Y(im.m * H_OBJ), { arrows: 0, dash: [4, 3], width: 1, color: OUT });
    drawRay(ctx, x0, by, X(im.dp), Y(im.m * H_OBJ), { arrows: 0, dash: [4, 3], width: 1, color: OUT });
  }
  if (X(im.dp) > 8 && X(im.dp) < 352) { arrowV(X(im.dp), ax, Math.max(4, Math.min(196, Y(im.m * H_OBJ))), IMG, im.dp < 0); tag(ctx, 'A′B′', X(im.dp) + 18, Math.max(12, Math.min(188, Y(im.m * H_OBJ))), IMG, 10); }
}

/* ---------- Activities 2, 3, 5, 6, 7 and Ex. 8, 9, 12: construction of the image ---------- */
const LXC = 320, AXC = 200, LENS_HALF = 160;
function drawConstruction(ctx, { f, d, h, K, show = 'rays', cover = false, emergent = true, image = true, handle = true }) {
  const X = (x) => LXC + x * K, Y = (y) => AXC - y * K;
  const xL = (16 - LXC) / K, xR = (584 - LXC) / K;
  const conv = f > 0;
  // axis, lens, foci
  ctx.strokeStyle = cssVar('--muted'); ctx.lineWidth = 1.2; ctx.setLineDash([8, 5]);
  ctx.beginPath(); ctx.moveTo(16, AXC); ctx.lineTo(584, AXC); ctx.stroke(); ctx.setLineDash([]);
  // graph-paper grid, 1 cm
  ctx.strokeStyle = 'rgba(120, 140, 170, 0.12)'; ctx.lineWidth = 1;
  for (let c = Math.ceil(xL); c <= xR; c++) { ctx.beginPath(); ctx.moveTo(X(c), 16); ctx.lineTo(X(c), AXC + LENS_HALF + 20); ctx.stroke(); }
  for (let c = -Math.floor((LENS_HALF + 20) / K); c <= Math.floor((AXC - 16) / K); c++) { ctx.beginPath(); ctx.moveTo(16, Y(c)); ctx.lineTo(584, Y(c)); ctx.stroke(); }
  ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(LXC, AXC - LENS_HALF); ctx.lineTo(LXC, AXC + LENS_HALF); ctx.stroke();
  for (const [yy, dir] of [[AXC - LENS_HALF, 1], [AXC + LENS_HALF, -1]]) {
    ctx.beginPath();
    if (conv) { ctx.moveTo(LXC - 8, yy + 9 * dir); ctx.lineTo(LXC, yy); ctx.lineTo(LXC + 8, yy + 9 * dir); }
    else { ctx.moveTo(LXC - 8, yy - 9 * dir); ctx.lineTo(LXC, yy); ctx.lineTo(LXC + 8, yy - 9 * dir); }
    ctx.stroke();
  }
  if (cover) { ctx.fillStyle = 'rgba(30, 33, 40, 0.85)'; ctx.fillRect(LXC - 7, AXC - LENS_HALF, 14, LENS_HALF - 2); tag(ctx, t('lbl.covered'), LXC + 12, AXC - LENS_HALF + 30, cssVar('--muted'), 11, 'left', 700); }
  tag(ctx, 'O', LXC + 10, AXC + 14, cssVar('--text'), 13);
  for (const [x, n] of [[-f, 'F'], [f, 'F’']]) {
    ctx.fillStyle = cssVar('--accent'); ctx.beginPath(); ctx.arc(X(x), AXC, 4, 0, 7); ctx.fill();
    tag(ctx, n, X(x), AXC + 16, cssVar('--accent'), 14);
  }
  const im = imageOf(d, f);
  const blocked = (y) => cover && y > 0.01;
  // incident ray from B to the lens at height y, then emergent ray (or a construction line if the lens is covered there)
  const ray = (yl, { aimF = false } = {}) => {
    const bl = blocked(yl);
    drawRay(ctx, X(-d), Y(h), X(0), Y(yl), { arrows: 1, width: 2.2 });
    if (conv && aimF === 'back') drawRay(ctx, X(-f), AXC, X(-d), Y(h), { arrows: 0, dash: [5, 5], width: 1.3, color: cssVar('--muted') });
    if (aimF === true) drawRay(ctx, X(0), Y(yl), X(-f), AXC, { arrows: 0, dash: [5, 5], width: 1.3, color: cssVar('--muted') });
    if (!emergent) return;
    const u = outSlope((yl - h) / d, yl, f);
    const yR = yl + u * xR;
    if (bl) {
      tag(ctx, '✕', X(0) - 10, Y(yl), cssVar('--bad'), 14);
      drawRay(ctx, X(0), Y(yl), X(xR), Y(yR), { arrows: 0, dash: [3, 4], width: 1, color: cssVar('--muted') });
      return;
    }
    drawRay(ctx, X(0), Y(yl), X(xR), Y(yR), { arrows: 1, width: 2.2, color: OUT });
    if (!im.inf && im.dp < 0 && image) drawRay(ctx, X(0), Y(yl), X(Math.max(im.dp, xL)), Y(yl + u * Math.max(im.dp, xL)), { arrows: 0, dash: [5, 5], width: 1.3, color: OUT });
  };
  // beam from B limited by the lens (Activity 2: the rays AI and AJ)
  if (show !== 'rays') {
    const a = 50 / K;
    const lo = -a, hi = cover ? 0 : a;
    const outY = (yl, x) => yl + outSlope((yl - h) / d, yl, f) * x;
    ctx.fillStyle = 'rgba(255, 214, 80, 0.26)';
    ctx.beginPath(); ctx.moveTo(X(-d), Y(h)); ctx.lineTo(X(0), Y(hi)); ctx.lineTo(X(0), Y(lo)); ctx.closePath(); ctx.fill();
    if (emergent) {
      ctx.beginPath(); ctx.moveTo(X(0), Y(hi)); ctx.lineTo(X(0), Y(lo)); ctx.lineTo(X(xR), Y(outY(lo, xR))); ctx.lineTo(X(xR), Y(outY(hi, xR))); ctx.closePath(); ctx.fill();
    }
    for (const yl of [hi, lo]) {
      drawRay(ctx, X(-d), Y(h), X(0), Y(yl), { arrows: 1, width: 1.6, color: '#d9a400' });
      if (!emergent) continue;
      drawRay(ctx, X(0), Y(yl), X(xR), Y(outY(yl, xR)), { arrows: 1, width: 1.6, color: '#d9a400' });
      if (!im.inf && im.dp < 0 && image) drawRay(ctx, X(0), Y(yl), X(Math.max(im.dp, xL)), Y(outY(yl, Math.max(im.dp, xL))), { arrows: 0, dash: [4, 4], width: 1, color: '#d9a400' });
    }
  }
  if (show !== 'beam') {
    ray(0);                                   // through O
    ray(h);                                   // parallel to the axis
    if (Math.abs(d - f) > 0.01) {             // through (or towards) F
      const yJ = (h * f) / (f - d);
      if (Math.abs(yJ) * K < LENS_HALF) ray(yJ, { aimF: !conv ? true : d < f ? 'back' : false });
    }
  }
  // object AB
  arrowUp(ctx, X(-d), AXC, Y(h), cssVar('--primary'), false, 3);
  tag(ctx, 'A', X(-d) - 12, AXC + 12, cssVar('--primary'), 13);
  tag(ctx, 'B', X(-d) - 13, Y(h) - 4, cssVar('--primary'), 13);
  if (handle) { ctx.fillStyle = cssVar('--primary'); ctx.beginPath(); ctx.arc(X(-d), Y(h), 7, 0, 7); ctx.fill(); hit.push({ kind: 'B', x: X(-d), y: Y(h), r: 28 }); }
  // image A′B′
  if (!image) return im;
  if (im.inf) { tag(ctx, t('lbl.atInf'), 584, 30, IMG, 13, 'right'); return im; }
  const xi = X(im.dp), yi = Y(im.m * h);
  if (xi > 10 && xi < 590) {
    ctx.save(); if (cover) ctx.globalAlpha = 0.5;
    arrowUp(ctx, xi, AXC, Math.max(12, Math.min(view.height - 12, yi)), IMG, im.dp < 0, 3);
    tag(ctx, 'A′', xi + 13, AXC + (im.m < 0 ? -12 : 12), IMG, 13);
    tag(ctx, 'B′', xi + 14, yi + (im.m < 0 ? 8 : -6), IMG, 13);
    ctx.restore();
  } else tag(ctx, t('lbl.offCanvas'), 584, 30, IMG, 12, 'right');
  return im;
}
function arrowUp(ctx, x, y1, y2, color, dash, w = 2.5) {
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = w;
  if (dash) ctx.setLineDash([6, 4]);
  ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y2); ctx.stroke(); ctx.setLineDash([]);
  if (Math.abs(y2 - y1) < 4) return;
  const s = y2 < y1 ? 1 : -1;
  ctx.beginPath(); ctx.moveTo(x, y2); ctx.lineTo(x - 6, y2 + 10 * s); ctx.lineTo(x + 6, y2 + 10 * s); ctx.closePath(); ctx.fill();
}
const kOf = (f) => (Math.abs(f) <= 5 ? 18 : 8);   // drawing scale: px per cm (f = 4 cm → 18 px/cm; otherwise 8 px/cm)
function drawConstructTab(ctx, st) {
  if (st.mode === 'explore') {
    const K = kOf(st.f);
    drawConstruction(ctx, { f: st.f, d: st.d, h: st.h, K, show: st.show, cover: st.cover });
    tag(ctx, `f = ${num(st.f, 0)} cm · ${t('lbl.scale')} 1 cm ↔ ${num(K, 0)} px`, 584, HEIGHTS.construct - 22, cssVar('--muted'), 11, 'right', 600);
    return;
  }
  const p = st.pr, K = 8;
  const im = drawConstruction(ctx, { f: p.f, d: p.d, h: p.h, K, show: 'rays', emergent: st.revealed, image: st.revealed, handle: false });
  // the student's guess for B′
  const gx = LXC + st.guess.x * K, gy = AXC - st.guess.y * K;
  ctx.strokeStyle = cssVar('--primary'); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(gx - 11, gy); ctx.lineTo(gx + 11, gy); ctx.moveTo(gx, gy - 11); ctx.lineTo(gx, gy + 11); ctx.stroke();
  ctx.beginPath(); ctx.arc(gx, gy, 15, 0, 7); ctx.stroke();
  tag(ctx, `B′ ?`, gx + 20, gy - 16, cssVar('--primary'), 13, 'left');
  if (!st.revealed) hit.push({ kind: 'guess', x: gx, y: gy, r: 30 });
  tag(ctx, `f = ${num(p.f, 0)} cm`, 584, HEIGHTS.construct - 22, cssVar('--muted'), 12, 'right', 700);
  if (st.revealed && !im.inf) {
    const ok = Math.hypot(st.guess.x - im.dp, st.guess.y - im.m * p.h) <= tolPos(im);
    tag(ctx, ok ? '✓' : '✗', gx - 20, gy - 18, ok ? cssVar('--good') : cssVar('--bad'), 20);
  }
}
const tolPos = (im) => Math.max(1, 0.1 * Math.abs(im.dp));

/* ---------- Activity 7: diverging lens ---------- */
function drawDivTab(ctx, st) {
  const f = -st.fabs, K = 8;
  const im = drawConstruction(ctx, { f, d: st.d, h: st.h, K, show: st.show });
  tag(ctx, `f = ${num(f, 0)} cm · ${t('lbl.scale')} 1 cm ↔ 8 px`, 584, 386, cssVar('--muted'), 11, 'right', 600);
  // what the eye sees through the lens: an erect, smaller image
  const x = 16, y = 400, w = 568, h = 126;
  ctx.fillStyle = cssVar('--surface'); roundRect(ctx, x, y, w, h, 10); ctx.fill();
  tag(ctx, t('lbl.through'), x + 10, y + 14, cssVar('--muted'), 12, 'left', 700);
  if (!st.look) { wrapText(ctx, t('lbl.lookOff'), x + w / 2, y + h / 2 + 6, w - 60, cssVar('--muted')); return; }
  const cx = x + w / 2, cy = y + h / 2 + 8, R = 52;
  // the object seen directly (beside the lens) and through the lens
  paintObjectSeen(ctx, cx - 150, cy, 1, 'lbl.direct');
  ctx.save(); ctx.beginPath(); ctx.arc(cx + 60, cy, R, 0, 7); ctx.clip();
  ctx.fillStyle = '#3a3f48'; ctx.fillRect(cx + 60 - R, cy - R, 2 * R, 2 * R);
  paintObject(ctx, 'F', cx + 60, cy + (H_OBJ * im.m * 18) / 2, im.m * 18, '#fff6c8');
  ctx.restore();
  ctx.strokeStyle = '#5b636e'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(cx + 60, cy, R, 0, 7); ctx.stroke();
  tag(ctx, t('lbl.withLens'), cx + 130, cy, cssVar('--text'), 12, 'left', 700);
}
function paintObjectSeen(ctx, cx, cy, m, key) {
  ctx.fillStyle = '#3a3f48'; roundRect(ctx, cx - 40, cy - 40, 80, 80, 8); ctx.fill();
  paintObject(ctx, 'F', cx, cy + H_OBJ * 18 * m / 2, 18 * m, '#fff6c8');
  tag(ctx, t(key), cx + 50, cy, cssVar('--text'), 12, 'left', 700);
}

/* ================================================================
   Pointer
   ================================================================ */
canvas.addEventListener('pointerdown', (ev) => {
  const p = view.toLogical(ev);
  const h = hit.find((q) => Math.hypot(p.x - q.x, p.y - q.y) < q.r);
  if (!h) return;
  ev.preventDefault();
  drag = h.kind;
  canvas.setPointerCapture(ev.pointerId);
});
canvas.addEventListener('pointermove', (ev) => {
  if (!drag) return;
  const p = view.toLogical(ev);
  const st = cur();
  if (drag === 'screen') { st.s = Math.round(Math.max(4, Math.min(40, (p.x - LXB) / KX)) * 10) / 10; ui.s?.set(st.s); }
  else if (drag === 'obj') { st.d = snap(Math.max(6, Math.min(40, (LXB - p.x) / KX))); ui.dsl?.set(st.d); }
  else if (drag === 'B') {
    const K = shell.tab === 'div' ? 8 : kOf(st.f);
    st.d = Math.max(0.5, Math.min((LXC - 24) / K, snap((LXC - p.x) / K)));
    st.h = Math.max(0.5, Math.min((AXC - 30) / K, snap((AXC - p.y) / K)));
  } else if (drag === 'guess') {
    st.guess.x = Math.max((20 - LXC) / 8, Math.min((580 - LXC) / 8, (p.x - LXC) / 8));
    st.guess.y = Math.max(-(HEIGHTS.construct - AXC - 20) / 8, Math.min((AXC - 20) / 8, (AXC - p.y) / 8));
  }
  st.fb = null;
  refresh();
});
const endDrag = () => { drag = null; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

/* ================================================================
   Panels
   ================================================================ */
const controlsBody = document.getElementById('controls-body');
const measuresBody = document.getElementById('measures-body');
const diagCard = document.getElementById('diagram-card');
let ui = {};
function change(fn, keepFb = false) { const st = cur(); fn(st); if (!keepFb) st.fb = null; refresh(); }
function refresh() { updateMeasures(); requestDraw(); }
function seg(labelKey, options, value, onChange) {
  return createSegmented({ labelKey, options: options.map(([v, k]) => ({ value: String(v), labelKey: k })), value: String(value), onChange });
}
const btnRow = (...b) => el('div', { class: 'btn-row', style: 'margin-top:8px' }, b);
const hintP = (key) => el('p', { class: 'muted', style: 'margin:8px 0 0;font-size:0.88rem', dataset: { i18n: key } }, t(key));
const yesNo = (key, v, fn) => seg(key, [['yes', 'ctl.yes'], ['no', 'ctl.no']], v ? 'yes' : 'no', (x) => change((s) => fn(s, x === 'yes')));
function charControls(st) {
  ui.nat = seg('ctl.nature', [['real', 'nat.real'], ['virtual', 'nat.virtual']], st.ans.nature, (v) => change((s) => { s.ans.nature = v; }));
  ui.dir = seg('ctl.dir', [['erect', 'dir.erect'], ['inverted', 'dir.inverted']], st.ans.dir, (v) => change((s) => { s.ans.dir = v; }));
  ui.size = seg('ctl.size', [['larger', 'size.larger'], ['same', 'size.same'], ['smaller', 'size.smaller']], st.ans.size, (v) => change((s) => { s.ans.size = v; }));
  return [ui.nat.root, ui.dir.root, ui.size.root];
}
function checkChars(s, f, extraOk) {
  const a = s.ans;
  if (!a.nature || !a.dir || !a.size) { s.fb = { type: 'warn', key: 'fb.choose' }; return false; }
  if (extraOk) { const e = extraOk(); if (e) { s.fb = e; return false; } }
  const ex = expected(s.d, f);
  const wrong = ['nature', 'dir', 'size'].filter((k) => a[k] !== ex[k]);
  if (wrong.length) { s.fb = { type: 'bad', key: 'fb.wrong', params: { items: wrong.map((k) => t(`item.${k}`)).join(', ') } }; return false; }
  return true;
}

function build() {
  const tab = shell.tab;
  const st = cur();
  const items = [];
  diagCard.hidden = tab !== 'bench';
  if (tab === 'bench') {
    ui.obj = seg('ctl.obj', [['F', 'obj.F'], ['lamp', 'obj.lamp']], st.obj, (v) => change((s) => { s.obj = v; }));
    ui.preset = seg('ctl.dPreset', PRESETS.map((p) => [p, `pre.${p}`]), PRESETS.includes(st.d) ? st.d : '', (v) => change((s) => { s.d = Number(v); s.ans = { nature: '', dir: '', size: '' }; if (s.d < FAR) ui.dsl.set(s.d); }));
    ui.dsl = createSlider({ labelKey: 'ctl.dMove', min: 6, max: 40, step: 0.5, value: Math.min(st.d, 40), unit: 'cm', decimals: 1, onInput: (v) => change((s) => { s.d = v; }) });
    ui.s = createSlider({ labelKey: 'ctl.s', min: 4, max: 40, step: 0.1, value: st.s, unit: 'cm', decimals: 1, onInput: (v) => change((s) => { s.s = v; }) });
    ui.look = yesNo('ctl.look', st.look, (s, v) => { s.look = v; });
    items.push(ui.obj.root, ui.preset.root, ui.dsl.root, ui.s.root, ui.look.root, hintP('hint.bench'),
      el('h3', { class: 'ctl-sub', dataset: { i18n: 'ctl.chars' } }, t('ctl.chars')), ...charControls(st),
      btnRow(createButton({ labelKey: 'ctl.checkRecord', variant: 'primary', onClick: () => change((s) => {
        const im = benchImage(s);
        const pos = { d: s.d };
        if (im.inf) {
          pos.inf = true;
          s.rows = s.rows.filter((r) => r.d !== s.d).concat([pos]).sort((a, b) => b.d - a.d);
          s.fb = { type: 'good', key: 'fb.atInf' }; return;
        }
        const ok = checkChars(s, F_BENCH, () => {
          if (im.dp > 40) return { type: 'warn', key: 'fb.tooFar' };
          if (im.dp > 0 && !isSharp(s)) return { type: 'warn', key: 'fb.notSharp' };
          if (im.dp < 0 && !s.look) return { type: 'warn', key: 'fb.lookFirst' };
          return null;
        });
        if (!ok) return;
        Object.assign(pos, s.ans, { s: im.dp > 0 ? s.s : null });
        s.rows = s.rows.filter((r) => r.d !== s.d).concat([pos]).sort((a, b) => b.d - a.d);
        s.fb = { type: 'good', key: 'fb.ok' };
      }, true) })));
  } else if (tab === 'construct') {
    ui.mode = seg('ctl.mode', [['explore', 'mode.explore'], ['practice', 'mode.practice']], st.mode, (v) => { cur().mode = v; cur().fb = null; buildTab(); });
    items.push(ui.mode.root);
    if (st.mode === 'explore') {
      ui.f = seg('ctl.f', [[4, 'f.4'], [10, 'f.10']], st.f, (v) => change((s) => {
        s.f = Number(v);
        if (s.f === 4) { s.d = 6; s.h = 3; } else { s.d = 30; s.h = 5; } // Activity 5 (f = 4, d = 6, AB = 3) or Exercise 9 (f = 10, AB = 5)
      }));
      ui.show = seg('ctl.show', [['rays', 'show.rays'], ['beam', 'show.beam'], ['both', 'show.both']], st.show, (v) => change((s) => { s.show = v; }));
      ui.cover = yesNo('ctl.cover', st.cover, (s, v) => { s.cover = v; });
      ui.dsl = createSlider({ labelKey: 'ctl.dObj', min: 0.5, max: st.f === 4 ? 16 : 36, step: 0.5, value: st.d, unit: 'cm', decimals: 1, onInput: (v) => change((s) => { s.d = v; }) });
      items.push(ui.f.root, ui.dsl.root, ui.show.root, ui.cover.root, hintP('hint.construct'),
        btnRow(createButton({ labelKey: 'ui.reset', variant: 'ghost', onClick: () => { const m = cur().pr; S.construct = initialState('construct'); S.construct.pr = m; buildTab(); } })));
    } else {
      items.push(hintP('hint.practice'), btnRow(
        createButton({ labelKey: 'ctl.check', variant: 'primary', onClick: () => change((s) => {
          if (s.revealed) return;
          const im = imageOf(s.pr.d, s.pr.f);
          s.revealed = true; s.tries += 1;
          const ok = Math.hypot(s.guess.x - im.dp, s.guess.y - im.m * s.pr.h) <= tolPos(im);
          if (ok) s.score += 1;
          s.fb = ok ? { type: 'good', key: 'fb.posOk', params: { s: s.score, n: s.tries } } : { type: 'bad', key: 'fb.posWrong', params: { s: s.score, n: s.tries } };
        }, true) }),
        createButton({ labelKey: 'ctl.newObj', onClick: () => change((s) => { s.pr = newPractice(); s.revealed = false; s.guess = { x: 12, y: -3 }; }) })));
    }
  } else {
    ui.fabs = createSlider({ labelKey: 'ctl.fabs', min: 5, max: 15, step: 1, value: st.fabs, unit: 'cm', decimals: 0, onInput: (v) => change((s) => { s.fabs = v; }) });
    ui.dsl = createSlider({ labelKey: 'ctl.dObj', min: 0.5, max: 36, step: 0.5, value: st.d, unit: 'cm', decimals: 1, onInput: (v) => change((s) => { s.d = v; }) });
    ui.show = seg('ctl.show', [['rays', 'show.rays'], ['beam', 'show.beam'], ['both', 'show.both']], st.show, (v) => change((s) => { s.show = v; }));
    ui.look = yesNo('ctl.look', st.look, (s, v) => { s.look = v; });
    items.push(ui.fabs.root, ui.dsl.root, ui.show.root, ui.look.root, hintP('hint.div'),
      el('h3', { class: 'ctl-sub', dataset: { i18n: 'ctl.chars' } }, t('ctl.chars')), ...charControls(st),
      btnRow(
        createButton({ labelKey: 'ctl.check', variant: 'primary', onClick: () => change((s) => {
          if (checkChars(s, -s.fabs, () => (s.look ? null : { type: 'warn', key: 'fb.lookFirst' }))) s.fb = { type: 'good', key: 'fb.divOk' };
        }, true) }),
        createButton({ labelKey: 'ctl.record', onClick: () => change((s) => {
          const im = imageOf(s.d, -s.fabs);
          const row = { f: -s.fabs, d: s.d, h: s.h, dp: -im.dp, hp: im.m * s.h };
          s.rows = s.rows.filter((r) => !(r.d === s.d && r.f === row.f && r.h === s.h)).concat([row]);
          s.fb = { type: 'good', key: 'fb.recorded' };
        }, true) })));
  }
  controlsBody.append(...items);
  ui.dl = el('dl', { class: 'meas' });
  ui.status = el('div', { class: 'status', hidden: '' });
  ui.table = el('div', { class: 'table-scroll' });
  ui.clear = el('div', { class: 'btn-row', style: 'margin-top:8px' }, [createButton({ labelKey: 'ctl.clearTable', variant: 'ghost', onClick: () => change((s) => { s.rows = []; }) })]);
  measuresBody.append(ui.dl, ui.status, ui.table, ui.clear);
}

const cm = (v, dec = 1) => `${num(v, dec)} cm`;
function updateMeasures() {
  if (!shell || !ui.dl) return;
  const tab = shell.tab;
  const st = cur();
  const rows = [];
  let table = null;
  if (tab === 'bench') {
    ui.obj.set(st.obj); ui.preset.set(PRESETS.includes(st.d) ? String(st.d) : ''); ui.look.set(st.look ? 'yes' : 'no');
    ui.nat.set(st.ans.nature); ui.dir.set(st.ans.dir); ui.size.set(st.ans.size);
    ui.dsl.setDisabled(st.d >= FAR);
    const im = benchImage(st);
    rows.push([t('m.f'), cm(F_BENCH, 0)], [t('m.d'), st.d >= FAR ? '2 m' : cm(st.d)], [t('m.s'), cm(st.s)],
      [t('m.screen'), im.inf || im.dp <= 0 ? t('sharp.none') : isSharp(st) ? t('sharp.yes') : t('sharp.no')]);
    if (st.rows.length) {
      const th = (k) => el('th', { dataset: { i18n: k } }, t(k));
      table = el('table', { class: 'data' }, [
        el('thead', {}, el('tr', {}, [th('col.d'), th('col.nature'), th('col.dir'), th('col.size'), th('col.pos')])),
        el('tbody', {}, st.rows.map((r) => el('tr', {}, r.inf
          ? [el('td', {}, num(r.d, 1)), el('td', { colspan: '4' }, t('pos.inf'))]
          : [el('td', {}, r.d >= FAR ? '200' : num(r.d, 1)), el('td', {}, t(`nat.${r.nature}`)), el('td', {}, t(`dir.${r.dir}`)), el('td', {}, t(`sz.${r.size}`)),
            el('td', {}, r.s != null ? t('pos.behind', { d: num(r.s, 1) }) : t('pos.front'))]))),
      ]);
    }
  } else if (tab === 'construct') {
    ui.mode.set(st.mode);
    if (st.mode === 'explore') {
      ui.f.set(String(st.f)); ui.show.set(st.show); ui.cover.set(st.cover ? 'yes' : 'no'); ui.dsl.set(st.d);
      rows.push(...constructRows(st.f, st.d, st.h));
    } else {
      const p = st.pr;
      rows.push([t('m.f'), cm(p.f, 0)], [t('m.dObj'), cm(p.d)], [t('m.h'), cm(p.h)], [t('m.guess'), `${cm(Math.abs(st.guess.x))} ${t(st.guess.x >= 0 ? 'side.behind' : 'side.front')}`]);
      if (st.revealed) rows.push(...constructRows(p.f, p.d, p.h).slice(3));
      rows.push([t('m.score'), `${st.score} / ${st.tries}`]);
    }
  } else {
    ui.look.set(st.look ? 'yes' : 'no'); ui.show.set(st.show); ui.dsl.set(st.d);
    ui.nat.set(st.ans.nature); ui.dir.set(st.ans.dir); ui.size.set(st.ans.size);
    rows.push(...constructRows(-st.fabs, st.d, st.h));
    if (st.rows.length) {
      const th = (k) => el('th', { dataset: { i18n: k } }, t(k));
      table = el('table', { class: 'data' }, [
        el('thead', {}, el('tr', {}, [th('col.f'), th('col.d'), th('col.AB'), th('col.dp'), th('col.hp')])),
        el('tbody', {}, st.rows.map((r) => el('tr', {}, [num(r.f, 0), num(r.d, 1), num(r.h, 1), num(r.dp, 1), num(r.hp, 1)].map((v) => el('td', {}, v))))),
      ]);
    }
  }
  ui.dl.replaceChildren(...rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)]));
  ui.table.replaceChildren(...(table ? [table] : []));
  ui.clear.hidden = !table;
  const fb = st.fb;
  if (!fb) ui.status.hidden = true;
  else { ui.status.hidden = false; ui.status.className = `status ${fb.type || ''}`; ui.status.textContent = t(fb.key, fb.params); }
}
// Values read on the construction (to scale), so the student can compare with his own drawing
function constructRows(f, d, h) {
  const im = imageOf(d, f);
  const r = [[t('m.f'), cm(f, 0)], [t('m.dObj'), cm(d)], [t('m.h'), cm(h)]];
  if (im.inf) return r.concat([[t('m.image'), t('pos.inf')]]);
  const ex = expected(d, f);
  return r.concat([
    [t('m.dImg'), `${cm(Math.abs(im.dp))} ${t(im.dp > 0 ? 'side.behind' : 'side.front')}`],
    [t('m.hImg'), cm(Math.abs(im.m * h))],
    [t('m.image'), `${t(`nat.${ex.nature}`)}, ${t(`dir.${ex.dir}`)}, ${t(`size.${ex.size}`)}`],
  ]);
}

function buildTab() {
  controlsBody.replaceChildren();
  measuresBody.replaceChildren();
  ui = {};
  build();
  refresh();
}
onLangChange(() => { if (shell) buildTab(); });

shell = initSim({
  strings,
  tabs: TABS.map((id) => ({ id, labelKey: `tab.${id}` })),
  initialTab: 'bench',
  onTab: buildTab,
  notRequired: { bench: 'nr.ch3', construct: 'nr.ch3', div: 'nr.ch3' },
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, cur: () => cur(), imageOf, expected, isSharp: () => isSharp(S.bench) };
