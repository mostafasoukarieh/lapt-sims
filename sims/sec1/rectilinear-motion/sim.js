// Sec 1 — Chapter 15: Rectilinear motion (Mouvements rectilignes) — p.167–176.
// The student measures the abscissas on the recording with a ruler, calculates speeds and accelerations.
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num } from '../../../shared/format.js';
import { createButton, createSegmented, createSlider, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, font } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { calcCell, calcSig } from '../../../shared/calc-cell.js';
import { label } from '../../../shared/figures.js';
import { drawPuck } from '../../../shared/air-table.js';
import { inclineDots, drawRecording, drawRuler } from '../../../shared/recording-draw.js';
import { createGraph } from '../../../shared/graph.js';

const W = 600, H = 440;
const TABS = ['uniform', 'accelerated', 'equations'];
const G = 9.8;
// Table 15.1 (Fig. 15.2), τ = 60 ms, horizontal table
const BOOK_U = [0, 12, 24, 37, 50, 63, 76, 88, 102];
// Table 15.2 (Fig. 15.6), τ = 100 ms, table inclined 3°, no initial velocity
const BOOK_A = [0, 3, 11, 24, 42.5, 66, 95, 128];
const KU = 5, KA = 3.6;                 // px per mm on the enlarged recordings
const STRIP = { x: 20, y: 250, w: 560, x0: 30 };
const RULER_Y = 284;

function initialState(tab) {
  switch (tab) {
    case 'uniform': return { src: 'book', v: 0.2, tau: 0.06, dots: BOOK_U.slice(), shown: BOOK_U.length, play: null, rulerX: STRIP.x + STRIP.x0, gv: 'x', calc: {}, fb: null };
    case 'accelerated': return { src: 'book', alpha: 3, tau: 0.1, dots: BOOK_A.slice(), shown: BOOK_A.length, play: null, rulerX: STRIP.x + STRIP.x0, gv: 'x', calc: {}, fb: null };
    case 'equations': return { type: 'uniform', v: 2, x0: 1, a: 1, time: 0, run: false, gv: 'x', calc: {}, fb: null };
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
const graph = createGraph(document.getElementById('graph'), { width: 360, height: 240, maxHeightVh: 36 });
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

/* ================================================================
   Recordings
   ================================================================ */
const accOf = (st) => G * Math.sin((st.alpha * Math.PI) / 180);
function makeDots(tab, st) {
  if (st.src === 'book') return (tab === 'uniform' ? BOOK_U : BOOK_A).slice();
  if (tab === 'uniform') {
    const out = [];
    for (let n = 0; n < 14; n++) { const mm = Math.round(st.v * n * st.tau * 2000) / 2; if (mm > 102 && out.length >= 6) break; out.push(mm); }
    return out;
  }
  return inclineDots({ a: accOf(st), tau: st.tau, t0: 0, maxMm: 128, minDots: 6, maxDots: 10 });
}
const kOf = (tab) => (tab === 'uniform' ? KU : KA);
const instV = (d, tau, i) => (d[i + 1] - d[i - 1]) / 1000 / (2 * tau);

function drawRecTab(ctx, st, tab) {
  board(ctx);
  // side view of the air table: horizontal (uniform) or inclined (accelerated)
  const inc = tab === 'accelerated' ? (st.src === 'book' ? 3 : st.alpha) : 0;
  const A = [60, 70], B = [540, 70 + 480 * Math.tan((inc * Math.PI) / 180) * 1.5];
  ctx.fillStyle = cssVar('--wood');
  ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.lineTo(B[0], B[1] + 14); ctx.lineTo(A[0], A[1] + 14); ctx.closePath(); ctx.fill();
  ctx.fillStyle = cssVar('--muted');
  if (inc) { ctx.beginPath(); ctx.moveTo(A[0] - 4, A[1] + 14); ctx.lineTo(A[0] + 40, A[1] + 14); ctx.lineTo(A[0] - 4, B[1] + 14); ctx.closePath(); ctx.fill(); tag(ctx, `α = ${dec(num(inc, 1))}°`, B[0] - 60, B[1] + 30, cssVar('--text'), 13, 'center', 700); }
  else { ctx.fillRect(A[0] + 10, A[1] + 14, 12, 40); ctx.fillRect(B[0] - 22, B[1] + 14, 12, 40); tag(ctx, t('lbl.horizontal'), 300, 116, cssVar('--text'), 13, 'center', 700); }
  tag(ctx, `τ = ${num(st.tau * 1000, 0)} ms`, 540, 34, cssVar('--text'), 13, 'right', 700);
  const k = kOf(tab);
  const last = st.dots[st.dots.length - 1] || 1;
  const along = (mm) => { const f = (mm / last) * 0.85 + 0.05; return [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f]; };
  const puckMm = st.play ? st.play.mm : st.dots[Math.max(0, st.shown - 1)];
  const [px, py] = along(puckMm);
  drawPuck(ctx, px, py - 12, 12, { color: cssVar('--accent') });
  drawRecording(ctx, { x: STRIP.x, y: STRIP.y, w: STRIP.w, dots: st.dots.slice(0, st.shown), k, x0: STRIP.x0 });
  tag(ctx, t('lbl.recording'), STRIP.x + 6, STRIP.y - 44, cssVar('--muted'), 12, 'left', 700);
  drawRuler(ctx, { x: st.rulerX, y: RULER_Y, k, lenMm: tab === 'uniform' ? 105 : 130 });
  hint(ctx, t(st.play ? 'hint.recording' : 'hint.ruler'));
}

/* ================================================================
   Tab 3 — Time equations
   ================================================================ */
const T_MAX = 10;
const eqX = (st, tt) => (st.type === 'uniform' ? st.v * tt + st.x0 : 0.5 * st.a * tt * tt);
const eqV = (st, tt) => (st.type === 'uniform' ? st.v : st.a * tt);
function drawEquations(ctx, st) {
  board(ctx);
  const AX = { x1: 50, x2: 560, y: 200 };
  const xMaxM = Math.max(10, Math.ceil(eqX(st, T_MAX) / 10) * 10);
  const X = (x) => AX.x1 + ((AX.x2 - AX.x1) * x) / xMaxM;
  ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(AX.x1 - 10, AX.y); ctx.lineTo(AX.x2 + 20, AX.y); ctx.stroke();
  ctx.fillStyle = cssVar('--text'); ctx.beginPath(); ctx.moveTo(AX.x2 + 26, AX.y); ctx.lineTo(AX.x2 + 14, AX.y - 6); ctx.lineTo(AX.x2 + 14, AX.y + 6); ctx.fill();
  const step = xMaxM <= 20 ? 2 : xMaxM <= 50 ? 5 : xMaxM <= 100 ? 10 : 20;
  ctx.font = font(11, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = cssVar('--muted');
  for (let x = 0; x <= xMaxM; x += step) { ctx.fillRect(X(x) - 1, AX.y - 5, 2, 10); ctx.fillText(String(x), X(x), AX.y + 10); }
  tag(ctx, 'x (m)', AX.x2 + 10, AX.y + 30, cssVar('--text'), 12, 'center', 700);
  tag(ctx, 'O', X(0), AX.y - 18, cssVar('--text'), 14);
  // positions every second (like a recording)
  for (let s = 0; s <= Math.floor(st.time + 1e-9); s++) { ctx.fillStyle = cssVar('--muted'); ctx.beginPath(); ctx.arc(X(eqX(st, s)), AX.y + 46, 3, 0, Math.PI * 2); ctx.fill(); }
  tag(ctx, t('lbl.everySecond'), AX.x1, AX.y + 66, cssVar('--muted'), 11, 'left', 700);
  const xm = X(eqX(st, st.time));
  ctx.fillStyle = cssVar('--accent'); roundRect(ctx, xm - 22, AX.y - 34, 44, 24, 6); ctx.fill();
  ctx.fillStyle = '#222'; for (const dx of [-12, 12]) { ctx.beginPath(); ctx.arc(xm + dx, AX.y - 8, 6, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = cssVar('--box'); roundRect(ctx, 40, 300, 520, 70, 10); ctx.fill();
  tag(ctx, `t = ${dec(num(st.time, 1))} s`, 140, 335, '#ffffff', 18);
  tag(ctx, `x = ${dec(num(eqX(st, st.time), 1))} m`, 300, 335, '#ffffff', 18);
  tag(ctx, `v = ${dec(num(eqV(st, st.time), 1))} m/s`, 460, 335, '#ffffff', 18);
  const eq = st.type === 'uniform' ? `x = ${dec(String(st.v))} t + ${dec(String(st.x0))}` : `x = ½ × ${dec(String(st.a))} × t²   ;   v = ${dec(String(st.a))} t`;
  label(ctx, eq, W / 2, 60, { size: 17, weight: 800 });
  hint(ctx, t('hint.eq'));
}

/* ================================================================
   Graph card
   ================================================================ */
function drawGraphFor(tab, st) {
  if (tab === 'equations') {
    const isX = st.gv === 'x';
    const yMax = isX ? Math.max(10, Math.ceil(eqX(st, T_MAX) / 10) * 10) : Math.max(5, Math.ceil(eqV(st, T_MAX)) + 1);
    graph.draw({
      xLabel: 't (s)', yLabel: isX ? 'x (m)' : 'v (m/s)', xMax: T_MAX, yMax,
      series: [{ color: cssVar('--accent'), points: [[st.time, isX ? eqX(st, st.time) : eqV(st, st.time)]], fn: (tt) => (isX ? eqX(st, tt) : eqV(st, tt)), fnEnd: st.time, solid: true }],
    });
    return;
  }
  const d = st.dots, tau = st.tau, n = d.length;
  const tEnd = (n - 1) * tau;
  if (st.gv === 'x') {
    const pts = []; for (let i = 1; i < n; i++) if (st.calc?.[`x${i}`]?.ok) pts.push([i * tau, d[i]]);
    if (st.calc?.x1?.ok || true) pts.unshift([0, 0]);
    const s = { color: cssVar('--accent'), points: pts };
    if (tab === 'uniform' && st.calc?.vs?.ok) { s.slope = d[n - 1] / tEnd; s.intercept = 0; }
    if (tab === 'accelerated' && (st.calc?.avt?.ok || st.calc?.a2x?.ok)) { const a = 2 * d[n - 2] / 1000 / ((n - 2) * tau) ** 2; s.fn = (tt) => 500 * a * tt * tt; }
    graph.draw({ xLabel: 't (s)', yLabel: 'x (mm)', xMax: Math.ceil(tEnd * 10 + 0.5) / 10, yMax: Math.ceil(d[n - 1] / 20 + 0.5) * 20, series: [s] });
  } else {
    const pts = []; for (let i = 1; i < n - 1; i++) if (st.calc?.[`v${i}`]?.ok) pts.push([i * tau, instV(d, tau, i)]);
    const s = { color: cssVar('--meter-v'), points: pts };
    if (tab === 'uniform' && st.calc?.vs?.ok) { s.slope = 0; s.intercept = d[n - 1] / 1000 / tEnd; }
    if (tab === 'accelerated' && st.calc?.avt?.ok) { s.slope = instV(d, tau, 3) / (3 * tau); s.intercept = 0; }
    const vMax = Math.max(...d.slice(1, -1).map((_, j) => instV(d, tau, j + 1)));
    graph.draw({ xLabel: 't (s)', yLabel: 'v (m/s)', xMax: Math.ceil(tEnd * 10 + 0.5) / 10, yMax: Math.ceil(vMax * 12 + 0.5) / 10, series: [s] });
  }
}

/* ================================================================
   Draw, loop, pointer
   ================================================================ */
function draw() {
  if (!shell) return;
  const ctx = view.begin();
  const st = cur();
  if (shell.tab === 'equations') drawEquations(ctx, st); else drawRecTab(ctx, st, shell.tab);
}
let tick = 0;
const loop = createLoop({
  dt: 1 / 60,
  step(dt) {
    if (!shell) return false;
    const st = cur();
    if (shell.tab !== 'equations' && st.play) {
      st.play.t += dt / 6;     // slow motion ×6
      const tt = st.play.t;
      st.play.mm = shell.tab === 'uniform' ? (st.src === 'book' ? (BOOK_U[8] / 0.48) * tt : st.v * tt * 1000) : 500 * st.play.a * tt * tt;
      const n = Math.floor(tt / st.tau + 1e-9) + 1;
      if (n > st.shown) st.shown = Math.min(n, st.dots.length);
      if (st.shown >= st.dots.length && st.play.mm >= st.dots[st.dots.length - 1]) { st.play = null; updateMeasures(); }
      return true;
    }
    if (shell.tab === 'equations' && st.run) {
      st.time = Math.min(T_MAX, st.time + dt);
      if (st.time >= T_MAX) { st.run = false; buildTab(); }
      if (++tick % 6 === 0) updateMeasures();
      return true;
    }
    return false;
  },
  render() { draw(); },
});
let drag = null;
canvas.addEventListener('pointerdown', (ev) => {
  if (shell.tab === 'equations') return;
  const p = view.toLogical(ev);
  const st = cur();
  if (!(p.y > RULER_Y - 6 && p.y < RULER_Y + 52)) return;
  drag = { dx: p.x - st.rulerX };
  ev.preventDefault(); canvas.setPointerCapture(ev.pointerId);
});
canvas.addEventListener('pointermove', (ev) => {
  if (!drag) return;
  const st = cur();
  st.rulerX = Math.max(-200, Math.min(W - 60, view.toLogical(ev).x - drag.dx));
  requestDraw();
});
canvas.addEventListener('pointerup', () => { drag = null; });

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
const slider = (o) => createSlider(o).root;

function renew(tab, st) {
  st.dots = makeDots(tab, st); st.shown = st.src === 'book' ? st.dots.length : 0;
  st.play = null; st.calc = {}; st.fb = null; st.rulerX = STRIP.x + STRIP.x0;
}
function release(tab, st) {
  st.shown = 0; st.play = { t: 0, mm: 0, a: tab === 'accelerated' ? (st.src === 'book' ? 0.52 : accOf(st)) : 0 };
  loop.start();
}

function build() {
  const tab = shell.tab, st = cur();
  const items = [];
  if (tab === 'uniform' || tab === 'accelerated') {
    items.push(seg('ctl.src', [['book', tab === 'uniform' ? 'src.bookU' : 'src.bookA'], ['make', 'src.make']], st.src, (v) => {
      st.src = v; if (v === 'book') { st.tau = tab === 'uniform' ? 0.06 : 0.1; st.alpha = 3; } renew(tab, st); buildTab();
    }));
    if (st.src === 'make') {
      if (tab === 'uniform') {
        items.push(slider({ labelKey: 'ctl.launch', min: 0.1, max: 0.4, step: 0.01, value: st.v, format: (x) => `${num(x, 2)} m/s`, onInput: (x) => { st.v = x; renew(tab, st); ui.sig = null; updateMeasures(); } }));
        items.push(seg('ctl.tau', [['0.04', 'tau.40'], ['0.06', 'tau.60']], String(st.tau), (v) => { st.tau = Number(v); renew(tab, st); ui.sig = null; updateMeasures(); }));
      } else {
        items.push(slider({ labelKey: 'ctl.alpha', min: 2, max: 6, step: 0.2, value: st.alpha, format: (x) => `${num(x, 1)}°`, onInput: (x) => { st.alpha = x; renew(tab, st); ui.sig = null; updateMeasures(); } }));
        items.push(seg('ctl.tau', [['0.06', 'tau.60'], ['0.1', 'tau.100']], String(st.tau), (v) => { st.tau = Number(v); renew(tab, st); ui.sig = null; updateMeasures(); }));
      }
    }
    items.push(btnRow(
      createButton({ labelKey: tab === 'uniform' ? 'ctl.launchPuck' : 'ctl.release', variant: 'primary', onClick: () => { release(tab, st); updateMeasures(); } }),
      createButton({ labelKey: 'ctl.rulerZero', onClick: () => { st.rulerX = STRIP.x + STRIP.x0; requestDraw(); } }),
      resetBtn(tab)));
    items.push(seg('ctl.graph', [['x', 'graph.x'], ['v', 'graph.v']], st.gv, (v) => { st.gv = v; updateMeasures(); }));
    items.push(hintP(`hint.${tab}Ctl`));
  } else {
    items.push(seg('ctl.type', [['uniform', 'type.uniform'], ['acc', 'type.acc']], st.type, (v) => { st.type = v; st.time = 0; st.run = false; buildTab(); }));
    if (st.type === 'uniform') {
      items.push(slider({ labelKey: 'ctl.v', min: 0.5, max: 5, step: 0.5, value: st.v, format: (x) => `${num(x, 1)} m/s`, onInput: (x) => { st.v = x; st.time = 0; updateMeasures(); } }));
      items.push(slider({ labelKey: 'ctl.x0', min: 0, max: 10, step: 1, value: st.x0, format: (x) => `${num(x, 0)} m`, onInput: (x) => { st.x0 = x; st.time = 0; updateMeasures(); } }));
    } else {
      items.push(slider({ labelKey: 'ctl.a', min: 0.2, max: 2, step: 0.2, value: st.a, format: (x) => `${num(x, 1)} m/s²`, onInput: (x) => { st.a = x; st.time = 0; updateMeasures(); } }));
    }
    items.push(btnRow(
      createButton({ labelKey: st.run ? 'ctl.pause' : 'ctl.start', variant: 'primary', onClick: () => { if (!st.run && st.time >= T_MAX) st.time = 0; st.run = !st.run; buildTab(); } }),
      createButton({ labelKey: 'ctl.zero', onClick: () => { st.time = 0; st.run = false; buildTab(); } }),
      resetBtn(tab)));
    items.push(seg('ctl.graph', [['x', 'graph.x'], ['v', 'graph.v']], st.gv, (v) => { st.gv = v; updateMeasures(); }));
    items.push(hintP('hint.eqCtl'));
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
    ui.sig = null; updateMeasures();
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
  if (tab === 'equations') {
    rows.push(['t', `${num(st.time, 1)} s`], ['x', `${num(eqX(st, st.time), 1)} m`], ['v', `${num(eqV(st, st.time), 1)} m/s`]);
    tableBuilder = () => eqTables(st);
  } else {
    rows.push([t('m.dots'), `${st.shown}`], ['τ', `${num(st.tau * 1000, 0)} ms`]);
    if (!st.play && st.shown === st.dots.length) tableBuilder = () => recTables(tab, st);
  }
  drawGraphFor(tab, st);
  ui.dl.replaceChildren(...rows.flatMap(([k, val]) => [el('dt', {}, k), el('dd', {}, val)]));
  if (!st.fb) ui.status.hidden = true;
  else { ui.status.hidden = false; ui.status.className = `status ${st.fb.type || ''}`; ui.status.textContent = t(st.fb.key); }
  if (tableBuilder) {
    const sig = JSON.stringify([tab, st.src, st.dots, st.play ? 1 : 0, st.shown, st.type]) + calcSig([st]);
    if (sig !== ui.sig) { ui.sig = sig; ui.tables.replaceChildren(...tableBuilder()); }
  } else { ui.sig = null; ui.tables.replaceChildren(); }
}

function recTables(tab, st) {
  const d = st.dots, tau = st.tau, n = d.length, out = [];
  // abscissas measured with the ruler
  out.push(h3('tbl.x'));
  out.push(el('div', { class: 'table-scroll' }, el('table', { class: 'data' }, [
    el('thead', {}, el('tr', {}, [th(t('col.point')), th(tau < 0.09 ? 't (ms)' : 't (s)'), th('x (mm)')])),
    el('tbody', {}, d.slice(1).map((x, j) => {
      const i = j + 1;
      return el('tr', {}, [td(sub('M', String(i))), td(tau < 0.09 ? num(i * tau * 1000, 0) : num(i * tau, 1)), cell(st, `x${i}`, x, 1, 0.6)]);
    }))])));
  // instantaneous speeds
  out.push(h3('tbl.v'));
  const vRows = [];
  for (let i = 1; i < n - 1; i++) {
    const lab = el('span', { class: 'keep-case' }, [sub('v', String(i)), ' = (', sub('x', String(i + 1)), ' − ', sub('x', String(i - 1)), ') / 2τ (m/s)']);
    vRows.push([`v${i}`, lab, instV(d, tau, i), 3, Math.max(0.006, instV(d, tau, i) * 0.03)]);
  }
  out.push(qTable(st, vRows));
  out.push(h3('tbl.conclude'));
  if (tab === 'uniform') {
    out.push(qTable(st, [['vs', t('row.vs'), d[n - 1] / 1000 / ((n - 1) * tau), 3, 0.006]]));
  } else {
    const v3 = instV(d, tau, 3), t6 = (n - 2) * tau;
    out.push(qTable(st, [
      ['avt', el('span', { class: 'keep-case' }, [t('row.avt'), ' ', sub('v', '3'), ' / ', sub('t', '3'), ' (m/s²)']), v3 / (3 * tau), 2, 0.03],
      ['a2x', el('span', { class: 'keep-case' }, [t('row.a2x'), ' 2', sub('x', String(n - 2)), ' / ', sub('t', String(n - 2)), '² (m/s²)']), 2 * d[n - 2] / 1000 / (t6 * t6), 2, 0.03],
    ]));
  }
  return out;
}
function eqTables(st) {
  return [h3('tbl.book'), qTable(st, [
    ['t4', t('row.t4'), 15000, 0, 1],
    ['q3', t('row.q3'), 602, 0, 0.5],
    ['p4', t('row.p4'), 1.25, 2],
    ['p5', t('row.p5'), 5, 1],
    ['p6t', t('row.p6t'), 2, 1],
    ['p6v', t('row.p6v'), 20, 1],
    ['p7', t('row.p7'), 3, 1],
    ['p8a', t('row.p8a'), 4, 1],
    ['p8v', t('row.p8v'), 80, 1],
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
  initialTab: 'uniform',
  onTab: buildTab,
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, get tab() { return shell.tab; }, instV, makeDots };
