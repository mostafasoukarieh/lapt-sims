// Sec 3 GS-LS — Chapter 10: Alternating sinusoidal current (whole chapter, SG and SV).
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num, qty } from '../../../shared/format.js';
import { createButton, createSegmented, createSlider, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect } from '../../../shared/draw.js';
import { label } from '../../../shared/figures.js';
import { calcCell, calcSig, calcDone } from '../../../shared/calc-cell.js';
import { plotCurves } from '../../../shared/energy-bars.js';
import { drawScope, drawLFG } from '../../../shared/oscilloscope.js';

const TAU = 2 * Math.PI;
const W = 600;
const TABS = ['wave', 'elements', 'rc', 'rlc', 'power'];
const HEIGHTS = { wave: 510, elements: 584, rc: 584, rlc: 650, power: 460 };

/* ================================================================
   Model — values not given in the book are chosen for the simulation (Info panel)
   ================================================================ */
const EL = { R: 100, Rref: 100, Lcoil: 0.025, rcoil: 10, C: 2e-6 }; // Exp. 10.1–10.3 (chosen); coil of Application 10.3: 25 mH
const RC_E = 5; // V, square signal 0 / 5 V for Exp. 10.3
const RLC = { L: 0.07, C: 1e-6, R1: 100, r: 10, Vm: 4 }; // Exp. 10.5: L = 70 mH and C = 1.0 µF (book); R1, r, Vm chosen
const SENS = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200];
const VBS = [0.05e-3, 0.1e-3, 0.2e-3, 0.5e-3, 1e-3, 2e-3, 5e-3, 10e-3];
const niceSens = (vmax) => SENS.find((s) => vmax / s <= 3.6) ?? SENS[SENS.length - 1];
const niceVb = (T) => VBS.find((v) => (10 * v) / T >= 1.6) ?? VBS[VBS.length - 1];

function initialState(tab) {
  switch (tab) {
    case 'wave': return { Vm: 4, f: 50, phi: 0.5, rows: [], fb: null };
    case 'elements': return { el: 'coil', Vm: 6, f: 60, pure: true, rows: [], fb: null };
    case 'rc': return { C: 0.1, R: 5, f: 200, rows: [], fb: null };
    case 'rlc': return { f: 300, rows: [], fb: null };
    default: return { load: 'R', V: 100, f: 50, rows: [], fb: null };
  }
}
let S = Object.fromEntries(TABS.map((k) => [k, initialState(k)]));

/* ---------- impedances ---------- */
// element of tab "elements": complex impedance (re, im) of the element alone
function elZ(st) {
  const w = TAU * st.f;
  if (st.el === 'R') return { re: EL.R, im: 0 };
  if (st.el === 'coil') return { re: st.pure ? 0 : EL.rcoil, im: EL.Lcoil * w };
  return { re: 0, im: -1 / (EL.C * w) };
}
const zMod = (z) => Math.hypot(z.re, z.im);
// R-L-C of Exp. 10.5 at frequency f: i = Im sin(ωt + φ) for v = Vm sin ωt
function rlc(f, Vm = RLC.Vm) {
  const w = TAU * f, R = RLC.R1 + RLC.r, X = RLC.L * w - 1 / (RLC.C * w), Z = Math.hypot(R, X);
  return { w, R, X, Z, Im: Vm / Z, phi: -Math.atan2(X, R), f0: 1 / (TAU * Math.sqrt(RLC.L * RLC.C)) };
}
// loads of the power tab: φ (current relative to voltage) and Z
function loadOf(st) {
  const w = TAU * st.f;
  switch (st.load) {
    case 'R': return { Z: 100, phi: 0 };
    case 'L': return { Z: 0.5 * w, phi: -Math.PI / 2 }; // pure coil 0.5 H
    case 'C': return { Z: 1 / (20e-6 * w), phi: Math.PI / 2 }; // capacitor 20 µF
    default: { const R = 300, X = 1.5 * w - 1 / (10e-6 * w); return { Z: Math.hypot(R, X), phi: -Math.atan2(X, R) }; } // R-L-C 300 Ω, 1.5 H, 10 µF
  }
}

/* ================================================================
   Canvas (static pages: redraw on change only)
   ================================================================ */
let shell;
let drawQueued = false;
const canvas = document.getElementById('stage');
const view = setupCanvas(canvas, { width: W, height: 470, maxHeightVh: () => (window.innerWidth < 880 ? 54 : 78), onResize: () => requestDraw() });
function requestDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; draw(); });
}
onThemeChange(() => requestDraw());

const C = { ink: () => cssVar('--text'), v: () => cssVar('--s2'), i: () => cssVar('--s1'), p: () => cssVar('--s3') };
function ink(ctx, w = 2) { ctx.strokeStyle = C.ink(); ctx.fillStyle = C.ink(); ctx.lineWidth = w; }
function line(ctx, pts, w = 2) { ink(ctx, w); ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]); ctx.stroke(); }
function symRes(ctx, x1, x2, y) { ink(ctx); ctx.fillStyle = cssVar('--scene-bg'); ctx.fillRect(x1, y - 9, x2 - x1, 18); ctx.strokeRect(x1, y - 9, x2 - x1, 18); }
function symCoil(ctx, x1, x2, y, n = 5) { ink(ctx); const w = (x2 - x1) / n; ctx.beginPath(); ctx.moveTo(x1, y); for (let k = 0; k < n; k++) ctx.arc(x1 + w * (k + 0.5), y, w / 2, Math.PI, 0, false); ctx.stroke(); }
function symCap(ctx, x1, x2, y) { const m = (x1 + x2) / 2; line(ctx, [[x1, y], [m - 5, y]]); line(ctx, [[m + 5, y], [x2, y]]); line(ctx, [[m - 5, y - 14], [m - 5, y + 14]], 3); line(ctx, [[m + 5, y - 14], [m + 5, y + 14]], 3); }
function tag(ctx, txt, x, y, opts = {}) { label(ctx, txt, x, y, { size: 13, weight: 800, ...opts }); }
function dot(ctx, x, y) { ink(ctx); ctx.beginPath(); ctx.arc(x, y, 3.5, 0, TAU); ctx.fill(); }
const vSym = () => t('v');

// scope helper: two channels with automatic sensitivities; f1, f2 are functions of t (s)
function scope(ctx, x, y, d, T, f1, f2, a1, a2, opts = {}) {
  const s1 = opts.s1 ?? niceSens(a1), s2 = opts.s2 ?? niceSens(a2), vb = opts.vb ?? niceVb(T);
  const o1 = opts.o1 ?? 0, o2 = opts.o2 ?? 0;
  drawScope(ctx, {
    x, y, d, steady: true,
    svLabel: `${num(s1, s1 < 1 ? 2 : 0)} | ${num(s2, s2 < 1 ? 2 : 0)} V/div`, // CH1 | CH2
    vbLabel: `${num(vb * 1000, vb < 1e-3 ? 2 : 0)} ms/div`,
    curve: (xd) => f1(xd * vb) / s1 + o1,
    curve2: f2 ? (xd) => f2(xd * vb) / s2 + o2 : null,
  });
  return { s1, s2, vb };
}

function draw() {
  if (!shell) return;
  const tab = shell.tab;
  if (view.height !== HEIGHTS[tab]) view.setLogicalSize(W, HEIGHTS[tab]);
  const ctx = view.begin();
  ctx.fillStyle = cssVar('--scene-bg');
  roundRect(ctx, 0, 0, W, HEIGHTS[tab], 14);
  ctx.fill();
  ({ wave: drawWave, elements: drawElements, rc: drawRC, rlc: drawRLC, power: drawPower })[tab](ctx, S[tab]);
}

/* ---------- Tab 1: characteristics, phase difference (Applications 10.1–10.2) ---------- */
function drawWave(ctx, st) {
  const w = TAU * st.f, T = 1 / st.f, ph = st.phi * Math.PI;
  drawLFG(ctx, 20, 20, 150, { name: t('lfg'), display: `${num(st.f, 0)} Hz`, shape: 'sine' });
  tag(ctx, `${vSym()}1 = Vm sin(ω t)`, 400, 40, { color: cssVar('--scope-trace') });
  tag(ctx, `${vSym()}2 = Vm sin(ω t + φ)`, 400, 66, { color: cssVar('--scope-trace2') });
  const r = scope(ctx, 110, 110, 34, T, (tt) => st.Vm * Math.sin(w * tt), (tt) => st.Vm * Math.sin(w * tt + ph), st.Vm, st.Vm, { s2: niceSens(st.Vm) });
  void r;
}

/* ---------- Tab 2: resistor, coil, capacitor (Exp. 10.1–10.3) ---------- */
function drawElements(ctx, st) {
  const w = TAU * st.f, T = 1 / st.f, z = elZ(st), Im = st.Vm / zMod(z);
  const phEl = Math.atan2(z.im, z.re); // v(element) leads i by phEl
  // circuit: L.F.G. — A — element — M — R — B (channel 2 inverted shows R i)
  drawLFG(ctx, 20, 20, 140, { name: t('lfg'), display: `${num(st.f, 0)} Hz`, shape: 'sine' });
  line(ctx, [[160, 50], [230, 50]]);
  if (st.el === 'R') symRes(ctx, 230, 320, 50); else if (st.el === 'coil') symCoil(ctx, 230, 320, 50); else symCap(ctx, 230, 320, 50);
  line(ctx, [[320, 50], [400, 50]]); symRes(ctx, 400, 470, 50); line(ctx, [[470, 50], [560, 50], [560, 124], [90, 124], [90, 112]]);
  dot(ctx, 230, 50); dot(ctx, 340, 50); dot(ctx, 480, 50);
  tag(ctx, 'A', 226, 72); tag(ctx, 'M', 340, 72); tag(ctx, 'B', 484, 72);
  tag(ctx, t(`el.${st.el}`), 275, 20, { size: 12, weight: 700 }); tag(ctx, `R = ${qty(EL.Rref, 0, 'Ω')}`, 435, 24, { size: 12, weight: 700 });
  tag(ctx, `${t('ch1')} ${vSym()}AM`, 300, 148, { size: 12, color: cssVar('--scope-trace') });
  tag(ctx, `${t('ch2')} ${vSym()}BM (${t('invert')}) = R i`, 300, 166, { size: 12, color: cssVar('--scope-trace2') });
  scope(ctx, 110, 184, 34, T, (tt) => st.Vm * Math.sin(w * tt + phEl), (tt) => EL.Rref * Im * Math.sin(w * tt), st.Vm, EL.Rref * Im);
}

/* ---------- Tab 3: R-C under a square signal (Exp. 10.3, Application 10.4) ---------- */
function rcV(st, tt) {
  const tau = st.R * 1e3 * st.C * 1e-6, T = 1 / st.f, h = T / 2;
  const a = Math.exp(-h / tau), vh = RC_E / (1 + a), v0 = (RC_E * a) / (1 + a);
  const u = ((tt % T) + T) % T;
  return u < h ? { g: RC_E, c: RC_E + (v0 - RC_E) * Math.exp(-u / tau) } : { g: 0, c: vh * Math.exp(-(u - h) / tau) };
}
function drawRC(ctx, st) {
  const T = 1 / st.f;
  drawLFG(ctx, 20, 20, 140, { name: t('lfg'), display: `${num(st.f, 0)} Hz`, shape: 'square' });
  line(ctx, [[160, 50], [260, 50]]); symRes(ctx, 260, 340, 50); line(ctx, [[340, 50], [420, 50]]); symCap(ctx, 420, 470, 50); line(ctx, [[470, 50], [560, 50], [560, 124], [90, 124], [90, 112]]);
  dot(ctx, 200, 50); dot(ctx, 390, 50); dot(ctx, 520, 50);
  tag(ctx, 'A', 200, 72); tag(ctx, 'M', 390, 72); tag(ctx, 'B', 520, 72);
  tag(ctx, `R = ${qty(st.R, 1, 'kΩ')}`, 300, 24, { size: 12, weight: 700 }); tag(ctx, `C = ${qty(st.C, 1, 'µF')}`, 445, 24, { size: 12, weight: 700 });
  tag(ctx, `${t('ch1')} ${vSym()}AB (${t('lfg')})`, 300, 148, { size: 12, color: cssVar('--scope-trace') });
  tag(ctx, `${t('ch2')} ${vSym()}MB (${t('el.C')})`, 300, 166, { size: 12, color: cssVar('--scope-trace2') });
  const x0 = 1; // a rising edge 1 div after the left edge
  scope(ctx, 110, 184, 34, T, (tt) => rcV(st, tt - x0 * niceVb(T)).g, (tt) => rcV(st, tt - x0 * niceVb(T)).c, RC_E, RC_E, { s1: 2, s2: 2, o1: -2, o2: -2 });
}

/* ---------- Tab 4: R-L-C series, current resonance (Exp. 10.5, Application 10.5) ---------- */
function drawRLC(ctx, st) {
  const c = rlc(st.f), T = 1 / st.f;
  drawLFG(ctx, 20, 20, 140, { name: t('lfg'), display: `${num(st.f, 0)} Hz`, shape: 'sine' });
  line(ctx, [[160, 50], [220, 50]]); symRes(ctx, 220, 270, 50); line(ctx, [[270, 50], [310, 50]]); symCoil(ctx, 310, 400, 50); line(ctx, [[400, 50], [450, 50]]);
  symCap(ctx, 450, 500, 50); line(ctx, [[500, 50], [560, 50], [560, 124], [90, 124], [90, 112]]);
  tag(ctx, 'R₁', 245, 24, { size: 12 }); tag(ctx, '(L, r)', 355, 24, { size: 12 }); tag(ctx, 'C', 475, 24, { size: 12 });
  tag(ctx, `${t('ch1')} ${vSym()} (${t('lfg')})`, 300, 146, { size: 12, color: cssVar('--scope-trace') });
  tag(ctx, `${t('ch2')} ${vSym()}R₁ = R₁ i`, 300, 164, { size: 12, color: cssVar('--scope-trace2') });
  const w = c.w;
  scope(ctx, 110, 178, 28, T, (tt) => RLC.Vm * Math.sin(w * tt), (tt) => RLC.R1 * c.Im * Math.sin(w * tt + c.phi), RLC.Vm, RLC.R1 * c.Im, { s2: 1 });
  // resonance curve built from the recorded points whose Im was checked
  const pts = st.rows.filter((r) => calcDone(r, 'I')).map((r) => [r.f, rlc(r.f).Im * 1000]);
  const imax = rlc(c.f0).Im * 1000;
  plotCurves(ctx, {
    x: 12, y: 526, w: 576, h: 118, xMin: 0, xMax: 2000, yMin: 0, yMax: imax * 1.15, xLabel: 'f (Hz)', yLabel: 'Im (mA)', xStep: 250,
    curves: pts.length ? [{ f: () => NaN, color: C.i(), label: t('rlc.points') }] : [],
  });
  const X = (f) => 12 + 42 + (f / 2000) * 524, Y = (v) => 526 + 16 + (1 - v / (imax * 1.15)) * 72; // same frame as plotCurves
  ctx.fillStyle = C.i();
  for (const [f, v] of pts) { ctx.beginPath(); ctx.arc(X(f), Y(v), 4, 0, TAU); ctx.fill(); }
  ctx.strokeStyle = cssVar('--muted'); ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(X(st.f), 542); ctx.lineTo(X(st.f), 614); ctx.stroke(); ctx.setLineDash([]);
}

/* ---------- Tab 5: power and power factor (Application 10.6) ---------- */
function drawPower(ctx, st) {
  const L = loadOf(st), Vm = st.V * Math.SQRT2, Im = Vm / L.Z, w = TAU * st.f, T = 1 / st.f;
  const P = st.V * (Im / Math.SQRT2) * Math.cos(L.phi);
  const pmax = Vm * Im;
  tag(ctx, t(`pw.${st.load}`), W / 2, 22, { size: 13 });
  plotCurves(ctx, {
    x: 12, y: 40, w: 576, h: 200, xMin: 0, xMax: 2 * T * 1000, yMin: -1.1, yMax: 1.1, xLabel: 't (ms)', yLabel: t('pw.norm'),
    curves: [
      { f: (tm) => Math.sin(w * tm / 1000), color: C.v(), label: `${vSym()} / Vm` },
      { f: (tm) => Math.sin(w * tm / 1000 + L.phi), color: C.i(), label: 'i / Im' },
    ],
  });
  plotCurves(ctx, {
    x: 12, y: 250, w: 576, h: 200, xMin: 0, xMax: 2 * T * 1000, yMin: -pmax * 0.6, yMax: pmax * 1.1, xLabel: 't (ms)', yLabel: 'p (W)',
    curves: [
      { f: (tm) => Vm * Im * Math.sin(w * tm / 1000) * Math.sin(w * tm / 1000 + L.phi), color: C.p(), label: `p = ${vSym()} i` },
      { f: () => P, color: C.ink(), dash: true, label: t('pw.avg') },
    ],
  });
}

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
const sliderEl = (st, key, prop, min, max, step, unit, dec, after) => {
  const s = createSlider({ labelKey: key, min, max, step, value: st[prop], unit, decimals: dec, onInput: (v) => { st[prop] = v; after?.(); refresh(); } });
  ui.sliders = ui.sliders || {}; ui.sliders[prop] = s;
  return s.root;
};
const seg = (st, key, prop, opts, after) => createSegmented({ labelKey: key, options: opts, value: st[prop], onChange: (v) => { st[prop] = v; after?.(); refresh(); } }).root;

/* ---------- Tab 1 ---------- */
function buildWave() {
  const st = S.wave;
  controlsBody.append(
    sliderEl(st, 'ctl.Vm', 'Vm', 1, 10, 0.5, 'V', 1), sliderEl(st, 'ctl.f', 'f', 10, 1000, 10, 'Hz', 0),
    seg(st, 'ctl.phi', 'phi', [0, 0.25, 0.5, 1, -0.5].map((v) => ({ value: v, labelKey: `phi.${String(v).replace('.', '_').replace('-', 'm')}` })), () => { st.phi = Number(st.phi); }),
    btnRow(recordBtn(() => { st.rows.push({ Vm: st.Vm, f: st.f }); st.fb = null; refresh(); })), hint('hint.wave'), resetBtn('wave'));
  tableBlock(st);
}
function updateWave() {
  const st = S.wave;
  measRows(ui.dl, [[t('m.Vm'), qty(st.Vm, 1, 'V')], [t('m.f'), qty(st.f, 0, 'Hz')]]);
  renderTable(st, st.rows, ['col.Vm', 'col.f', 'col.T', 'col.w', 'col.Veff'], (r) => {
    const T = 1000 / r.f, w = TAU * r.f, V = r.Vm / Math.SQRT2;
    return el('tr', {}, [td(num(r.Vm, 1)), td(num(r.f, 0)),
      cell(st, r, 'T', T, 2, relTol(T, 0.005), 'fb.TOk', 'fb.TWrong'),
      cell(st, r, 'w', w, 0, relTol(w, 0.005, 0.6), 'fb.wOk', 'fb.wWrong', !calcDone(r, 'T')),
      cell(st, r, 'V', V, 2, relTol(V, 0.01), 'fb.VOk', 'fb.VWrong', !calcDone(r, 'w'))]);
  });
}

/* ---------- Tab 2 ---------- */
function buildElements() {
  const st = S.elements;
  controlsBody.append(seg(st, 'ctl.el', 'el', ['R', 'coil', 'C'].map((v) => ({ value: v, labelKey: `el.${v}` })), () => { st.fb = null; buildTab('elements'); }));
  if (st.el === 'coil') controlsBody.append(seg(st, 'ctl.pure', 'pure', [{ value: true, labelKey: 'el.pure' }, { value: false, labelKey: 'el.real' }], () => { st.pure = st.pure === true || st.pure === 'true'; }));
  controlsBody.append(sliderEl(st, 'ctl.VmEl', 'Vm', 1, 150, 1, 'V', 0), sliderEl(st, 'ctl.f', 'f', 10, 1000, 10, 'Hz', 0),
    btnRow(recordBtn(() => { st.rows.push({ el: st.el, pure: st.pure, Vm: st.Vm, f: st.f }); st.fb = null; refresh(); })), hint(`hint.el.${st.el}`), resetBtn('elements'));
  tableBlock(st);
}
function updateElements() {
  const st = S.elements, z = elZ(st), Im = st.Vm / zMod(z), ph = Math.atan2(z.im, z.re);
  measRows(ui.dl, [[t('m.VmEl'), qty(st.Vm, 0, 'V')], [t('m.lag'), t(Math.abs(ph) < 1e-6 ? 'el.inPhase' : ph > 0 ? 'el.vLeads' : 'el.iLeads', { a: qty(Math.abs(ph) * 180 / Math.PI, 1, '°') })]]);
  const rows = st.rows.filter((r) => r.el === st.el);
  const inA = st.el === 'coil'; // Im in A for the coil (Application 10.3), in mA for the resistor and the capacitor
  const cols = st.el === 'R' ? ['col.VmEl', 'col.f', 'col.ImmA'] : ['col.VmEl', 'col.f', 'col.w', inA ? 'col.ImA' : 'col.ImmA'];
  renderTable(st, rows, cols, (r) => {
    const zr = elZ(r), I = r.Vm / zMod(zr), w = TAU * r.f, unitA = !inA;
    const cells = [td(num(r.Vm, 0)), td(num(r.f, 0))];
    if (r.el !== 'R') cells.push(cell(st, r, 'w', w, 0, relTol(w, 0.005, 0.6), 'fb.wOk', 'fb.wWrong'));
    cells.push(cell(st, r, 'I', unitA ? I * 1000 : I, unitA ? 1 : 2, relTol(unitA ? I * 1000 : I, 0.01, 0.006), `fb.Im${r.el}Ok`, `fb.Im${r.el}Wrong`, r.el !== 'R' && !calcDone(r, 'w')));
    return el('tr', {}, cells);
  });
}

/* ---------- Tab 3 ---------- */
function buildRC() {
  const st = S.rc;
  controlsBody.append(
    seg(st, 'ctl.C', 'C', [0.1, 0.2].map((v) => ({ value: v, labelKey: `c.${String(v).replace('.', '_')}` })), () => { st.C = Number(st.C); }),
    sliderEl(st, 'ctl.R', 'R', 1, 10, 0.5, 'kΩ', 1), sliderEl(st, 'ctl.fsq', 'f', 50, 5000, 50, 'Hz', 0),
    btnRow(recordBtn(() => { st.rows.push({ C: st.C, R: st.R, f: st.f }); st.fb = null; refresh(); })), hint('hint.rc'), resetBtn('rc'));
  tableBlock(st);
}
function updateRC() {
  const st = S.rc, tau = st.R * st.C, T = 1000 / st.f; // ms
  measRows(ui.dl, [[t('m.E'), qty(RC_E, 0, 'V')], [t('m.T'), qty(T, 2, 'ms')], [t('m.half'), qty(T / 2, 2, 'ms')], [t('m.charge'), t(T / 2 >= 5 * tau ? 'rc.full' : 'rc.partial')]]);
  renderTable(st, st.rows, ['col.Rk', 'col.Cu', 'col.tau', 'col.v63', 'col.5tau'], (r) => {
    const ta = r.R * r.C; // kΩ × µF = ms
    return el('tr', {}, [td(num(r.R, 1)), td(num(r.C, 1)),
      cell(st, r, 't', ta, 2, relTol(ta, 0.01, 0.006), 'fb.tauOk', 'fb.tauWrong'),
      cell(st, r, 'v', 0.632 * RC_E, 2, 0.04, 'fb.v63Ok', 'fb.v63Wrong', !calcDone(r, 't')),
      cell(st, r, 'f', 5 * ta, 2, relTol(5 * ta, 0.01, 0.006), 'fb.5tauOk', 'fb.5tauWrong', !calcDone(r, 'v'))]);
  });
}

/* ---------- Tab 4 ---------- */
function buildRLC() {
  const st = S.rlc;
  controlsBody.append(sliderEl(st, 'ctl.frlc', 'f', 20, 2000, 10, 'Hz', 0),
    btnRow(recordBtn(() => { st.rows.push({ f: st.f, vr: Math.round(RLC.R1 * rlc(st.f).Im * 100) / 100 }); st.fb = null; refresh(); })), hint('hint.rlc'), resetBtn('rlc'));
  tableBlock(st);
}
function updateRLC() {
  const st = S.rlc, c = rlc(st.f), vr = RLC.R1 * c.Im;
  const ph = c.phi * 180 / Math.PI;
  measRows(ui.dl, [[t('m.VmG'), qty(RLC.Vm, 1, 'V')], [t('m.vr'), qty(vr, 2, 'V')], [t('m.lagRLC'), t(Math.abs(ph) < 1 ? 'el.inPhaseRLC' : ph > 0 ? 'rlc.iLeads' : 'rlc.iLags')]]);
  renderTable(st, st.rows, ['col.frlc', 'col.vr', 'col.ImR'], (r) => el('tr', {}, [td(num(r.f, 0)), td(num(r.vr, 2)),
    cell(st, r, 'I', (r.vr / RLC.R1) * 1000, 1, relTol(r.vr * 10, 0.01, 0.06), 'fb.ImRlcOk', 'fb.ImRlcWrong')]));
}

/* ---------- Tab 5 ---------- */
function buildPower() {
  const st = S.power;
  controlsBody.append(seg(st, 'ctl.load', 'load', ['R', 'L', 'C', 'RLC'].map((v) => ({ value: v, labelKey: `pw.${v}` }))),
    sliderEl(st, 'ctl.V', 'V', 20, 230, 10, 'V', 0), sliderEl(st, 'ctl.fp', 'f', 20, 200, 10, 'Hz', 0),
    btnRow(recordBtn(() => { const L = loadOf(st), I = st.V / L.Z; st.rows.push({ V: st.V, I: Math.round(I * 1000) / 1000, P: Math.round(st.V * I * Math.cos(L.phi) * 100) / 100 }); st.fb = null; refresh(); })),
    hint('hint.power'), resetBtn('power'));
  tableBlock(st);
}
function updatePower() {
  const st = S.power, L = loadOf(st), I = st.V / L.Z, P = st.V * I * Math.cos(L.phi);
  measRows(ui.dl, [[t('m.V'), qty(st.V, 0, 'V')], [t('m.I'), qty(I, 3, 'A')], [t('m.P'), qty(P, 2, 'W')]]);
  renderTable(st, st.rows, ['col.V', 'col.I', 'col.P', 'col.S', 'col.cos'], (r) => {
    const Sap = r.V * r.I, cos = r.P / Sap;
    return el('tr', {}, [td(num(r.V, 0)), td(num(r.I, 3)), td(num(r.P, 2)),
      cell(st, r, 's', Sap, 2, relTol(Sap, 0.01, 0.006), 'fb.SOk', 'fb.SWrong'),
      cell(st, r, 'c', cos, 3, 0.006, 'fb.cosOk', 'fb.cosWrong', !calcDone(r, 's'))]);
  });
}

/* ---------- Tab switching ---------- */
function buildTab(id) {
  controlsBody.replaceChildren();
  measuresBody.replaceChildren();
  ui = {};
  tableSig = '';
  ({ wave: buildWave, elements: buildElements, rc: buildRC, rlc: buildRLC, power: buildPower })[id]();
  shell?.refreshActivity();
  refresh();
}
function updateMeasures() {
  if (!shell || !ui.dl) return;
  ({ wave: updateWave, elements: updateElements, rc: updateRC, rlc: updateRLC, power: updatePower })[shell.tab]();
}
function refresh() { updateMeasures(); requestDraw(); }
function resetTab(id) { S[id] = initialState(id); buildTab(id); }
onLangChange(() => { if (shell) buildTab(shell.tab); });

shell = initSim({
  strings,
  tabs: TABS.map((id) => ({ id, labelKey: `tab.${id}` })),
  initialTab: 'wave',
  onTab: buildTab,
  activityKey: (tab) => (tab === 'elements' ? `act.elements.${S.elements.el}` : `act.${tab}`),
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, rlc, elZ, loadOf, rcV };
