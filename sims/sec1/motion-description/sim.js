// Sec 1 — Chapter 14: Description of motion (Description du mouvement) — p.155–166.
// Rectilinear motion only (book). Speeds read on an air-table recording with a ruler: the student calculates.
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num } from '../../../shared/format.js';
import { createButton, createSegmented, createSlider, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, font, arrow } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { calcCell, calcSig } from '../../../shared/calc-cell.js';
import { label } from '../../../shared/figures.js';
import { drawPuck } from '../../../shared/air-table.js';
import { inclineDots, drawRecording, drawRuler } from '../../../shared/recording-draw.js';

const W = 600, H = 440;
const TABS = ['frame', 'position', 'speed', 'acceleration'];
const G = 9.8;
// Example 14.3 (Fig. 14.9), τ = 60 ms: M0M2 = 13, M1M3 = 18, M2M4 = 22, M0M3 = 23, M2M6 = 55 mm → abscissas (mm)
const BOOK_DOTS = [0, 5, 13, 23, 35, 50, 68];  // M5 = 50 mm interpolated (not given by the book)
const K = 7;               // px per mm on the recording
const STRIP = { x: 20, y: 250, w: 560, x0: 40 };
const RULER_Y = 284;
const V_SCALE = 400;       // px per (m/s) for velocity vectors: 0.1 m/s ↔ 40 px

function initialState(tab) {
  switch (tab) {
    case 'frame': return { view: 'ground', time: 3.6, ball: null, gPts: [], bPts: [], fb: null };
    case 'position': return { x: 3, o1: true, calc: {}, fb: null };
    case 'speed': return { src: 'book', alpha: 3.6, tau: 0.06, dots: BOOK_DOTS.slice(), shown: BOOK_DOTS.length, play: null, rulerX: STRIP.x + STRIP.x0, calc: {}, fb: null };
    case 'acceleration': return { phase: 'start', v: 0, x: 60, calc: {}, fb: null };
    default: return {};
  }
}
let S = Object.fromEntries(TABS.map((k) => [k, initialState(k)]));
let shell;
const cur = () => S[shell.tab];
const dec = (s) => s.replace('.', t('dec'));

let drawQueued = false;
const canvas = document.getElementById('stage');
canvas.style.touchAction = 'none';
const view = setupCanvas(canvas, { width: W, height: H, maxHeightVh: () => (window.innerWidth < 880 ? 52 : 76), onResize: () => requestDraw() });
function requestDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; draw(); });
}
onThemeChange(() => requestDraw());
function board(ctx) { ctx.fillStyle = cssVar('--board'); roundRect(ctx, 6, 6, W - 12, H - 12, 14); ctx.fill(); }
function hint(ctx, text) { label(ctx, text, W / 2, H - 20, { size: 13, weight: 600, color: cssVar('--muted') }); }
function tag(ctx, s, x, y, color = cssVar('--text'), size = 14, align = 'center', weight = 800) {
  ctx.fillStyle = color; ctx.font = font(size, weight); ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(s, x, y);
}
function vlabel(ctx, s, x, y, color, size = 15, align = 'center') {
  // letter(s) with a small arrow above (vector notation)
  tag(ctx, s, x, y, color, size, align);
  ctx.font = font(size, 800);
  const w = ctx.measureText(s).width;
  const x0 = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.5;
  arrow(ctx, x0, y - size * 0.75, x0 + w, y - size * 0.75, 4);
}
function vec(ctx, x1, y1, x2, y2, color, w = 3) { ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round'; arrow(ctx, x1, y1, x2, y2, 10); }

/* ================================================================
   Tab 1 — Rest and motion, frame of reference (14.1)
   ================================================================ */
const BUS_V = 70;         // px/s
const BALL_T = 1.2, BALL_H = 95;
const PASS_DX = 40;       // passenger position inside the bus (from the bus centre)
const busX = (st) => ((st.time * BUS_V) % 900) - 150;
function drawBus(ctx, x, y) {
  ctx.fillStyle = '#e8b33a'; ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1.5;
  roundRect(ctx, x - 110, y - 70, 220, 70, 12); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#bfe0f2';
  for (let i = 0; i < 4; i++) ctx.fillRect(x - 96 + i * 50, y - 60, 38, 26);
  ctx.fillStyle = '#333'; for (const dx of [-70, 70]) { ctx.beginPath(); ctx.arc(x + dx, y + 2, 14, 0, Math.PI * 2); ctx.fill(); }
  // passenger in the window
  ctx.fillStyle = '#8a5a3c'; ctx.beginPath(); ctx.arc(x + PASS_DX - 21, y - 46, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = cssVar('--accent'); ctx.fillRect(x + PASS_DX - 28, y - 38, 14, 6);
}
function person(ctx, x, y) {
  ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(x, y - 62, 9, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, y - 52); ctx.lineTo(x, y - 22); ctx.moveTo(x - 12, y - 42); ctx.lineTo(x + 12, y - 42);
  ctx.moveTo(x, y - 22); ctx.lineTo(x - 9, y); ctx.moveTo(x, y - 22); ctx.lineTo(x + 9, y); ctx.stroke();
}
function tree(ctx, x, y) {
  ctx.fillStyle = '#7b4a26'; ctx.fillRect(x - 5, y - 40, 10, 40);
  ctx.fillStyle = '#3f8f4a'; ctx.beginPath(); ctx.arc(x, y - 58, 24, 0, Math.PI * 2); ctx.fill();
}
function drawFrame(ctx, st) {
  board(ctx);
  const ROAD = 300;
  const bx = busX(st);
  const cam = st.view === 'ground' ? 0 : bx - 300;   // screen x = world x − cam
  ctx.fillStyle = '#9aa3ad'; ctx.fillRect(6, ROAD, W - 12, 60);
  ctx.fillStyle = '#c9ced4'; ctx.fillRect(6, ROAD - 14, W - 12, 14);   // sidewalk
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.setLineDash([24, 18]);
  ctx.lineDashOffset = cam % 42;
  ctx.beginPath(); ctx.moveTo(6, ROAD + 32); ctx.lineTo(W - 6, ROAD + 32); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
  for (let k = -2; k < 8; k++) { const wx = k * 160 + 40; const sx = ((wx - cam) % 960 + 960) % 960 - 120; tree(ctx, sx, ROAD - 14); }
  const px = ((480 - cam) % 1200 + 1200) % 1200 - 300;
  person(ctx, px, ROAD - 14); tag(ctx, t('lbl.observer'), px, ROAD - 116, cssVar('--text'), 12, 'center', 700);
  drawBus(ctx, bx - cam, ROAD + 20);
  // the ball thrown vertically upwards by the passenger
  const pts = st.view === 'ground' ? st.gPts.map(([x, y]) => [x - cam, y]) : st.bPts.map(([dx, y]) => [300 + dx, y]);
  if (pts.length > 1) {
    ctx.strokeStyle = cssVar('--minus'); ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); ctx.setLineDash([]);
  }
  if (st.ball) {
    const [x, y] = pts[pts.length - 1] || [bx - cam + PASS_DX, ROAD - 40];
    ctx.fillStyle = cssVar('--minus'); ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
  }
  label(ctx, t(st.view === 'ground' ? 'lbl.viewGround' : 'lbl.viewBus'), W / 2, 40, { size: 15, weight: 800 });
  hint(ctx, t('hint.frame'));
}

/* ================================================================
   Tab 2 — Position vector, abscissa, change of origin (14.2, Example 14.2)
   ================================================================ */
const AX = { y: 220, o: 300, u: 50 };   // origin O at x = 300, 1 unit = 50 px
const O1 = -2;                          // O1 is 2 units before O (O1O = 2)
function drawPosition(ctx, st) {
  board(ctx);
  const X = (x) => AX.o + x * AX.u;
  ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(30, AX.y); ctx.lineTo(W - 30, AX.y); ctx.stroke();
  vec(ctx, W - 40, AX.y, W - 22, AX.y, cssVar('--text'), 2);
  tag(ctx, 'x', W - 26, AX.y + 20, cssVar('--text'), 15); tag(ctx, 'x′', 34, AX.y + 20, cssVar('--text'), 15);
  ctx.font = font(11, 700); ctx.fillStyle = cssVar('--muted'); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let k = -5; k <= 5; k++) { ctx.fillRect(X(k) - 1, AX.y - 5, 2, 10); ctx.fillText(dec(String(k)), X(k), AX.y + 9); }
  // unit vector i at O
  vec(ctx, X(0), AX.y + 40, X(1), AX.y + 40, cssVar('--accent'), 3);
  vlabel(ctx, 'i', X(0.5), AX.y + 60, cssVar('--accent'), 15);
  tag(ctx, 'O', X(0), AX.y - 16, cssVar('--text'), 16);
  // position vector OM
  const xm = X(st.x);
  if (st.x !== 0) vec(ctx, X(0), AX.y - 50, xm, AX.y - 50, cssVar('--meter-v'), 3.5);
  vlabel(ctx, 'OM', (X(0) + xm) / 2, AX.y - 66, cssVar('--meter-v'), 15);
  if (st.o1) {
    tag(ctx, 'O₁', X(O1), AX.y - 16, cssVar('--text'), 16);
    ctx.fillStyle = cssVar('--text'); ctx.beginPath(); ctx.arc(X(O1), AX.y, 4, 0, Math.PI * 2); ctx.fill();
    if (st.x !== O1) vec(ctx, X(O1), AX.y + 90, xm, AX.y + 90, '#2e9e4a', 3.5);
    vlabel(ctx, 'O₁M', (X(O1) + xm) / 2, AX.y + 112, '#2e9e4a', 15);
  }
  // the particle M (drag it)
  ctx.fillStyle = cssVar('--minus'); ctx.beginPath(); ctx.arc(xm, AX.y, 9, 0, Math.PI * 2); ctx.fill();
  tag(ctx, 'M', xm, AX.y - 24, cssVar('--minus'), 16);
  hint(ctx, t('hint.position'));
}

/* ================================================================
   Tab 3 — Speed and velocity on an air-table recording (14.3, Example 14.3)
   ================================================================ */
const instSpeeds = (dots, tau) => dots.slice(1, -1).map((_, i) => (dots[i + 2] - dots[i]) / 1000 / (2 * tau));
function drawSpeed(ctx, st) {
  board(ctx);
  // side view of the inclined air table, the puck sliding down
  const A = [60, 60], B = [540, 60 + 480 * Math.tan((st.alpha * Math.PI) / 180) * 1.5];
  ctx.fillStyle = cssVar('--wood');
  ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.lineTo(B[0], B[1] + 14); ctx.lineTo(A[0], A[1] + 14); ctx.closePath(); ctx.fill();
  ctx.fillStyle = cssVar('--muted');
  ctx.beginPath(); ctx.moveTo(A[0] - 4, A[1] + 14); ctx.lineTo(A[0] + 40, A[1] + 14); ctx.lineTo(A[0] - 4, B[1] + 14); ctx.closePath(); ctx.fill();
  tag(ctx, `α = ${dec(num(st.alpha, 1))}°`, B[0] - 60, B[1] + 28, cssVar('--text'), 13, 'center', 700);
  const nShown = st.shown;
  const lastMm = nShown ? st.dots[nShown - 1] : 0;
  const along = (mm) => { const f = (mm / 68) * 0.85 + 0.05; return [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f]; };
  const puckMm = st.play ? st.play.mm : lastMm;
  const [pxp, pyp] = along(puckMm);
  drawPuck(ctx, pxp, pyp - 12, 12, { color: cssVar('--accent') });
  tag(ctx, `${t('lbl.tau')} = ${num(st.tau * 1000, 0)} ms`, 540, 30, cssVar('--text'), 13, 'right', 700);
  // the recording (enlarged) and the ruler
  const dots = st.dots.slice(0, nShown);
  const vs = instSpeeds(st.dots, st.tau);
  const pos = drawRecording(ctx, { x: STRIP.x, y: STRIP.y, w: STRIP.w, dots, k: K, x0: STRIP.x0 });
  tag(ctx, t('lbl.recording'), STRIP.x + 6, STRIP.y - 44, cssVar('--muted'), 12, 'left', 700);
  // velocity vectors for the speeds already found by the student
  vs.forEach((v, j) => {
    const i = j + 1;
    if (i < nShown && st.calc?.[`v${i}`]?.ok) {
      const x = pos(i);
      vec(ctx, x, STRIP.y + 18, x + v * V_SCALE, STRIP.y + 18, cssVar('--meter-v'), 2.5);
    }
  });
  if (Object.keys(st.calc || {}).some((k) => k.startsWith('v') && st.calc[k]?.ok)) {
    vec(ctx, 520, 196, 520 + 0.1 * V_SCALE, 196, cssVar('--meter-v'), 2.5);
    tag(ctx, `${t('lbl.scale')} : ${dec('0.1')} m/s`, 512, 196, cssVar('--meter-v'), 12, 'right', 700);
  }
  drawRuler(ctx, { x: st.rulerX, y: RULER_Y, k: K, lenMm: 75 });
  hint(ctx, t(st.play ? 'hint.recording' : 'hint.ruler'));
}

/* ================================================================
   Tab 4 — Acceleration (14.4): velocity and acceleration vectors of a car
   ================================================================ */
const ACC = { start: 2.5, cruise: 0, brake: -4 };
function drawAcceleration(ctx, st) {
  board(ctx);
  const ROAD = 250;
  ctx.fillStyle = '#9aa3ad'; ctx.fillRect(6, ROAD, W - 12, 50);
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.setLineDash([20, 16]);
  ctx.beginPath(); ctx.moveTo(6, ROAD + 25); ctx.lineTo(W - 6, ROAD + 25); ctx.stroke(); ctx.setLineDash([]);
  const x = st.x;
  // car
  ctx.fillStyle = cssVar('--accent'); roundRect(ctx, x - 50, ROAD - 34, 100, 26, 8); ctx.fill();
  roundRect(ctx, x - 28, ROAD - 52, 56, 22, 8); ctx.fill();
  ctx.fillStyle = '#bfe0f2'; ctx.fillRect(x - 22, ROAD - 48, 20, 14); ctx.fillRect(x + 2, ROAD - 48, 20, 14);
  ctx.fillStyle = '#222'; for (const dx of [-30, 30]) { ctx.beginPath(); ctx.arc(x + dx, ROAD - 6, 10, 0, Math.PI * 2); ctx.fill(); }
  const a = st.phase === 'brake' && st.v <= 0 ? 0 : ACC[st.phase];
  // velocity vector (blue) and acceleration vector (red), origin at the car
  if (st.v > 0.05) { vec(ctx, x, ROAD - 80, x + st.v * 7, ROAD - 80, cssVar('--meter-v'), 3.5); vlabel(ctx, 'v', x + st.v * 7 + 14, ROAD - 78, cssVar('--meter-v'), 16, 'left'); }
  if (a !== 0) { vec(ctx, x, ROAD - 120, x + a * 30, ROAD - 120, cssVar('--meter-a'), 3.5); vlabel(ctx, 'a', x + a * 30 + (a > 0 ? 14 : -14), ROAD - 118, cssVar('--meter-a'), 16, a > 0 ? 'left' : 'right'); }
  // speedometer
  ctx.fillStyle = cssVar('--box'); roundRect(ctx, 400, 330, 170, 70, 10); ctx.fill();
  tag(ctx, `${num(st.v * 3.6, 0)} km/h`, 485, 355, '#ffffff', 20);
  tag(ctx, `${dec(num(st.v, 1))} m/s`, 485, 382, '#cfd6de', 13, 'center', 700);
  label(ctx, t(`lbl.${st.phase === 'brake' && st.v <= 0 ? 'stopped' : st.phase}`), 200, 365, { size: 15, weight: 800 });
  hint(ctx, t('hint.acc'));
}

/* ================================================================
   Draw, loop, pointer
   ================================================================ */
function draw() {
  if (!shell) return;
  const ctx = view.begin();
  const st = cur();
  switch (shell.tab) {
    case 'frame': drawFrame(ctx, st); break;
    case 'position': drawPosition(ctx, st); break;
    case 'speed': drawSpeed(ctx, st); break;
    case 'acceleration': drawAcceleration(ctx, st); break;
    default: break;
  }
}
let tick = 0;
const loop = createLoop({
  dt: 1 / 60,
  step(dt) {
    if (!shell) return false;
    const st = cur();
    if (shell.tab === 'frame') {
      const before = busX(st);
      st.time += dt;
      if (busX(st) < before) { st.ball = null; st.gPts = []; st.bPts = []; }
      if (st.ball) {
        const tau = st.time - st.ball.t0;
        if (tau > BALL_T) st.ball = null;
        else {
          const y = 260 - (4 * BALL_H * tau * (BALL_T - tau)) / (BALL_T * BALL_T);
          st.gPts.push([busX(st) + PASS_DX - 21, y]); st.bPts.push([PASS_DX - 21, y]);
        }
      }
      return true;
    }
    if (shell.tab === 'speed' && st.play) {
      // slow motion ×8: the dots appear one every τ
      st.play.t += dt / 8;
      const tt = st.play.t0 + st.play.t;
      st.play.mm = (0.5 * st.play.a * (tt * tt - st.play.t0 * st.play.t0)) * 1000;
      const n = Math.floor(st.play.t / st.tau + 1e-9) + 1;
      if (n > st.shown) st.shown = Math.min(n, st.dots.length);
      if (st.shown >= st.dots.length && st.play.mm >= st.dots[st.dots.length - 1]) { st.play = null; updateMeasures(); }
      return true;
    }
    if (shell.tab === 'acceleration') {
      const a = ACC[st.phase];
      st.v = Math.max(0, Math.min(30, st.v + a * dt));
      st.x += st.v * dt * 12;
      if (st.x > W + 60) st.x = -60;
      if (++tick % 10 === 0) updateMeasures();
      return true;
    }
    return false;
  },
  render() { draw(); },
});
let drag = null;
canvas.addEventListener('pointerdown', (ev) => {
  const p = view.toLogical(ev);
  const st = cur();
  if (shell.tab === 'position' && Math.abs(p.y - AX.y) < 40) { drag = 'M'; }
  else if (shell.tab === 'speed' && p.y > RULER_Y - 6 && p.y < RULER_Y + 52) { drag = { kind: 'ruler', dx: p.x - st.rulerX }; }
  else return;
  ev.preventDefault(); canvas.setPointerCapture(ev.pointerId); move(p);
});
canvas.addEventListener('pointermove', (ev) => { if (drag) move(view.toLogical(ev)); });
canvas.addEventListener('pointerup', () => { drag = null; });
function move(p) {
  const st = cur();
  if (drag === 'M') {
    const x = Math.max(-5, Math.min(5, Math.round(((p.x - AX.o) / AX.u) * 2) / 2));
    if (x !== st.x) { st.x = x; st.calc = {}; st.fb = null; updateMeasures(); }
  } else if (drag?.kind === 'ruler') {
    st.rulerX = Math.max(10, Math.min(W - 60, p.x - drag.dx));
  }
  requestDraw();
}

/* ================================================================
   Panels
   ================================================================ */
const controlsBody = document.getElementById('controls-body');
const measuresBody = document.getElementById('measures-body');
let ui = {};
const seg = (labelKey, options, value, onChange) => createSegmented({ labelKey, options: options.map(([v, k]) => ({ value: String(v), labelKey: k })), value: String(value), onChange }).root;
const btnRow = (...b) => el('div', { class: 'btn-row', style: 'margin-top:8px;flex-wrap:wrap' }, b);
const hintP = (key) => el('p', { class: 'muted', style: 'margin:8px 0 0;font-size:0.88rem' }, t(key));
const resetBtn = (tab) => createButton({ labelKey: 'ui.reset', variant: 'ghost', onClick: () => { S[tab] = initialState(tab); buildTab(); } });
const th = (c) => el('th', { class: 'keep-case' }, c);
const td = (c) => el('td', { class: 'keep-case' }, c);
const h3 = (key) => el('h3', { style: 'margin:14px 0 0;font-size:0.95rem' }, t(key));
const sub = (s, i) => el('span', { class: 'keep-case' }, [s, el('sub', {}, i)]);

function newRecording(st) {
  st.dots = st.src === 'book' ? BOOK_DOTS.slice() : inclineDots({ a: G * Math.sin((st.alpha * Math.PI) / 180), tau: st.tau });
  st.shown = st.src === 'book' ? st.dots.length : 0;
  st.play = null; st.calc = {}; st.fb = null;
}
function release(st) {
  const a = st.src === 'book' ? 0.625 : G * Math.sin((st.alpha * Math.PI) / 180);
  const t0 = st.src === 'book' ? 0.112 : 0.11;
  st.shown = 0; st.play = { t: 0, a, t0, mm: 0 };
}

function build() {
  const tab = shell.tab, st = cur();
  const items = [];
  if (tab === 'frame') {
    items.push(seg('ctl.view', [['ground', 'view.ground'], ['bus', 'view.bus']], st.view, (v) => { st.view = v; updateMeasures(); }));
    items.push(btnRow(createButton({ labelKey: 'ctl.throw', variant: 'primary', onClick: () => { st.ball = { t0: st.time }; st.gPts = []; st.bPts = []; } }), resetBtn(tab)));
    items.push(hintP('hint.frameCtl'));
  } else if (tab === 'position') {
    items.push(seg('ctl.o1', [['yes', 'o1.yes'], ['no', 'o1.no']], st.o1 ? 'yes' : 'no', (v) => { st.o1 = v === 'yes'; ui.sig = null; updateMeasures(); }));
    items.push(btnRow(createButton({ labelKey: 'ctl.newPos', variant: 'primary', onClick: () => { let x; do { x = Math.round((Math.random() * 10 - 5) * 2) / 2; } while (x === st.x); st.x = x; st.calc = {}; st.fb = null; updateMeasures(); } }), resetBtn(tab)));
    items.push(hintP('hint.positionCtl'));
  } else if (tab === 'speed') {
    items.push(seg('ctl.src', [['book', 'src.book'], ['make', 'src.make']], st.src, (v) => { st.src = v; if (v === 'book') { st.alpha = 3.6; st.tau = 0.06; } newRecording(st); buildTab(); }));
    if (st.src === 'make') {
      items.push(createSlider({ labelKey: 'ctl.alpha', min: 2, max: 6, step: 0.2, value: st.alpha, format: (x) => `${num(x, 1)}°`, onInput: (x) => { st.alpha = x; newRecording(st); ui.sig = null; updateMeasures(); } }).root);
      items.push(seg('ctl.tau', [['0.04', 'tau.40'], ['0.06', 'tau.60'], ['0.08', 'tau.80']], String(st.tau), (v) => { st.tau = Number(v); newRecording(st); ui.sig = null; updateMeasures(); }));
    }
    items.push(btnRow(
      createButton({ labelKey: 'ctl.release', variant: 'primary', onClick: () => { release(st); updateMeasures(); loop.start(); } }),
      createButton({ labelKey: 'ctl.rulerZero', onClick: () => { st.rulerX = STRIP.x + STRIP.x0; requestDraw(); } }),
      resetBtn(tab)));
    items.push(hintP('hint.speedCtl'));
  } else if (tab === 'acceleration') {
    items.push(seg('ctl.phase', [['start', 'phase.start'], ['cruise', 'phase.cruise'], ['brake', 'phase.brake']], st.phase, (v) => { st.phase = v; updateMeasures(); }));
    items.push(btnRow(resetBtn(tab)));
    items.push(hintP('hint.accCtl'));
  }
  controlsBody.append(...items);
  ui.dl = el('dl', { class: 'meas' });
  ui.status = el('div', { class: 'status', hidden: '' });
  ui.tables = el('div');
  measuresBody.append(ui.dl, ui.status, ui.tables);
}

function onCheckFor(st) {
  return (res) => {
    st.fb = res === 'invalid' ? { type: 'warn', key: 'calc.invalid' } : res === 'ok' ? { type: 'good', key: 'fb.ok' } : { type: 'bad', key: 'fb.wrong' };
    ui.sig = null; updateMeasures(); requestDraw();
  };
}
const cell = (st, key, v, d, tol) => calcCell(st, key, { expected: v, decimals: d, tol: tol ?? Math.max(0.011, Math.abs(v) * 0.01), onCheck: onCheckFor(st) });
const qTable = (st, rows) => el('table', { class: 'data' }, [el('thead', {}, el('tr', {}, [th(t('col.q')), th(t('col.answer'))])),
  el('tbody', {}, rows.map(([k, lab, v, d, tol]) => el('tr', {}, [td(lab), cell(st, k, v, d, tol)])))]);

function updateMeasures() {
  if (!shell || !ui.dl) return;
  const tab = shell.tab, st = cur();
  const rows = [];
  let tableBuilder = null;
  if (tab === 'frame') {
    rows.push([t('m.relBus'), t('m.atRest')], [t('m.relGround'), t('m.moving')], [t('m.ballTraj'), t(st.view === 'ground' ? 'traj.curve' : 'traj.line')]);
  } else if (tab === 'position') {
    rows.push([t('m.x'), `x = ${dec(num(st.x, 1))}`]);
    if (st.o1) tableBuilder = () => [qTable(st, [[`x1_${st.x}`, t('row.x1'), st.x - O1, 1, 0.01]])];
  } else if (tab === 'speed') {
    rows.push([t('m.dots'), `${st.shown}`], [t('lbl.tau'), `${num(st.tau * 1000, 0)} ms`]);
    if (!st.play && st.shown === st.dots.length) tableBuilder = () => speedTables(st);
  } else if (tab === 'acceleration') {
    const a = st.phase === 'brake' && st.v <= 0 ? 0 : ACC[st.phase];
    rows.push(['v', `${num(st.v, 1)} m/s`], ['a', `${num(a, 1)} m/s²`], [t('m.motion'), t(a > 0 ? 'mot.acc' : a < 0 ? 'mot.dec' : 'mot.const')]);
    tableBuilder = () => accTables(st);
  }
  ui.dl.replaceChildren(...rows.flatMap(([k, val]) => [el('dt', {}, k), el('dd', {}, val)]));
  if (!st.fb) ui.status.hidden = true;
  else { ui.status.hidden = false; ui.status.className = `status ${st.fb.type || ''}`; ui.status.textContent = t(st.fb.key); }
  if (tableBuilder) {
    const sig = JSON.stringify([tab, st.src, st.dots, st.x, st.o1, st.play ? 1 : 0, st.shown]) + calcSig([st]);
    if (sig !== ui.sig) { ui.sig = sig; ui.tables.replaceChildren(...tableBuilder()); }
  } else { ui.sig = null; ui.tables.replaceChildren(); }
}

function speedTables(st) {
  const d = st.dots, tau = st.tau, out = [];
  const vs = instSpeeds(d, tau);
  const sp = (k, lab, v) => [k, lab, v, 3, Math.max(0.003, v * 0.025)];
  const mm = (i, j) => el('span', { class: 'keep-case' }, ['M', el('sub', {}, String(i)), 'M', el('sub', {}, String(j))]);
  const vlab = (i) => el('span', { class: 'keep-case' }, [sub('v', String(i)), ` = `, mm(i - 1, i + 1), ` / 2τ (m/s)`]);
  const vav = (i, j) => el('span', { class: 'keep-case' }, [t('row.vav'), ' ', sub('t', String(i)), '–', sub('t', String(j)), ' (m/s)']);
  if (st.src === 'book') {
    out.push(h3('tbl.avg'));
    out.push(qTable(st, [sp('a03', vav(0, 3), 23 / 180), sp('a24', vav(2, 4), 22 / 120), sp('a26', vav(2, 6), 55 / 240)]));
  } else {
    const n = d.length - 1;
    out.push(h3('tbl.avg'));
    out.push(qTable(st, [sp('a0n', vav(0, n), d[n] / 1000 / (n * tau))]));
  }
  out.push(h3('tbl.inst'));
  const nInst = st.src === 'book' ? 3 : Math.min(vs.length, 5);
  out.push(qTable(st, vs.slice(0, nInst).map((v, j) => sp(`v${j + 1}`, vlab(j + 1), v))));
  out.push(el('p', { class: 'muted', style: 'margin:8px 0 0;font-size:0.88rem' }, t('tbl.instNote')));
  out.push(h3('tbl.book'));
  out.push(qTable(st, [
    ['t5', t('row.t5'), 15, 1], ['t6', t('row.t6'), 72, 0], ['e144', t('row.e144'), 72, 0],
    ['t9', t('row.t9'), 5, 1], ['p2', t('row.p2'), 18, 0], ['p3', t('row.p3'), 55.6, 1], ['p4', t('row.p4'), 420 / 5.5, 1],
  ]));
  return out;
}
function accTables(st) {
  return [qTable(st, [
    ['a13', t('row.a13'), (0.183 - 0.108) / 0.12, 2, 0.02],
    ['a23', t('row.a23'), (0.183 - 0.150) / 0.06, 2, 0.02],
    ['e146', t('row.e146'), (130 - 120) / 3.6 / 5, 2],
    ['p6', t('row.p6'), (80 - 100) / 3.6 / 5, 2],
  ])];
}

function buildTab() {
  controlsBody.replaceChildren(); measuresBody.replaceChildren();
  ui = {};
  build(); updateMeasures();
  loop.start(); requestDraw();
}
onLangChange(() => { if (shell) buildTab(); });

shell = initSim({
  strings,
  tabs: TABS.map((id) => ({ id, labelKey: `tab.${id}` })),
  initialTab: 'frame',
  onTab: buildTab,
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, get tab() { return shell.tab; }, instSpeeds, BOOK_DOTS };
