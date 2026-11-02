// Grade 9 — Alternating voltage (Ch.6 Act. 1–5 + experimental activity)
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num, parseNum } from '../../../shared/format.js';
import { createButton, createSegmented, createSlider, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, font } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { calcCell, calcSig, calcDone } from '../../../shared/calc-cell.js';
import { drawLamp, drawMeterBox, drawLead, METER_HALF as MH, symLamp, symMeter, symCell } from '../../../shared/circuit-draw.js';
import { drawScope, DIV_X, DIV_Y, traceLength, svText, vbText } from '../../../shared/oscilloscope.js';

/* ================================================================
   Model
   ================================================================ */
const E_CELL = 6.34; // V, the 6 V dry cell of Chapter 5 (constant, owner's rule for Grade 9)
const SQRT2 = Math.SQRT2;
const TAU = 2 * Math.PI;
// Shapes of one period (phase p in [0, 1)) → value between −1 and 1
const SHAPES = {
  sinusoidal: (p) => Math.sin(TAU * p),
  square: (p) => (p < 0.5 ? 1 : -1),
  triangular: (p) => (p < 0.25 ? 4 * p : p < 0.75 ? 2 - 4 * p : 4 * p - 4),
  // bicycle alternator: narrow peaks (Fig. 2e, 3c)
  alternator: (p) => { const s = Math.sin(TAU * p); return 0.5 * s + 0.5 * s ** 5; },
};
const frac = (x) => x - Math.floor(x);
// Activity 2 (Fig. 3): what the student reads on the screen, in divisions
const FORMS = {
  square: { x: 5, ymax: 2, ymin: -2 },
  triangular: { x: 4, ymax: 3, ymin: -3 },
  alternator: { x: 5, ymax: 3.4, ymin: -3.4 },
  sinusoidal: { x: 6, ymax: 2.4, ymin: -2.4 },
};
const FORM_ORDER = ['square', 'triangular', 'alternator', 'sinusoidal'];
// Activities 3–4 and the experimental activity: sinusoidal signals of the low-frequency generator
const SIGNALS = {
  A: { um: 15, f: 50 }, // experimental activity, Fig. 6: 5 V/div × 3 div, 2 ms/div × 10 div
  B: { um: 6, f: 40 }, // book questions: 2 V/div × 3 div; 5 ms/div × 5 div = 25 ms
  C: { um: 2.5, f: 1000 },
};
// Bicycle alternator driven by a motor: frequency and amplitude grow with the speed
const ALT = { fMax: 24, umPerHz: 0.25 }; // speed 100 % → 24 Hz, Um = 6 V
const LAMP_RATED = 6; // V (Activity 5)
const SV_DC = [0.5, 1, 2, 5, 10];
const VB_DC = [2, 0.5, 0.1, 0.02, 0.01, 0.005, 0.002];
const SV_SINE = [0.5, 1, 2, 5, 10];
const VB_SINE = [0.01, 0.005, 0.002, 0.001, 0.0005, 0.0002, 0.0001];
const SV_EFF = [1, 2, 5, 10];

function initialState(tab) {
  switch (tab) {
    case 'dcac': return { source: 'cell', reversed: false, motor: false, speed: 50, sv: 2, vb: 0.01, coupling: 'dc', fb: null };
    case 'forms': return { form: 'square', rows: FORM_ORDER.map((form) => ({ form })), fb: null };
    case 'sine': return { mode: 'exp', signal: 'A', sv: 10, vb: 0.01, rows: [], test: null, score: { ok: 0, n: 0 }, fb: null };
    default: return { um: 4, u2: 2, sv: 5, meterMode: 'ac', rows: [], fb: null };
  }
}
const TABS = ['dcac', 'forms', 'sine', 'effective'];
let S = Object.fromEntries(TABS.map((k) => [k, initialState(k)]));

// What the oscilloscope shows for a tab: v(t) in volts, Sv, Vb
function scopeInput(tab, st) {
  if (tab === 'dcac') {
    if (st.coupling === 'gnd') return { v: () => 0, sv: st.sv, vb: st.vb, um: 0 };
    if (st.source === 'cell') { const u = (st.reversed ? -1 : 1) * E_CELL; return { v: () => u, sv: st.sv, vb: st.vb, um: Math.abs(u), dc: u }; }
    const f = st.motor ? (ALT.fMax * st.speed) / 100 : 0;
    const um = ALT.umPerHz * f;
    return { v: (tt) => um * SHAPES.alternator(frac(f * tt)), sv: st.sv, vb: st.vb, um, f };
  }
  if (tab === 'forms') {
    const F = FORMS[st.form];
    // shown with Vb = 1 ms/div and Sv = 1 V/div: one period lasts F.x divisions
    return { v: (tt) => F.ymax * SHAPES[st.form](frac(tt / (F.x * 0.001))), sv: 1, vb: 0.001, um: F.ymax };
  }
  if (tab === 'sine') {
    if (st.mode === 'test' && st.test) {
      const q = st.test;
      return { v: (tt) => q.y * q.sv * Math.sin(TAU * frac(tt / (q.x * q.vb))), sv: q.sv, vb: q.vb, um: q.y * q.sv };
    }
    const G = SIGNALS[st.signal];
    return { v: (tt) => G.um * Math.sin(TAU * frac(G.f * tt)), sv: st.sv, vb: st.vb, um: G.um, f: G.f };
  }
  return { v: (tt) => st.um * Math.sin(TAU * frac(50 * tt)), sv: st.sv, vb: 0.002, um: st.um, f: 50 };
}

/* ================================================================
   Canvas
   ================================================================ */
const HEIGHTS = { dcac: 380, forms: 360, sine: 380, effective: 420 };
let shell;
const anim = { t: 0 };
let drawQueued = false;
const canvas = document.getElementById('stage');
const view = setupCanvas(canvas, { width: 600, height: 380, maxHeightVh: () => (window.innerWidth < 880 ? 46 : 74), onResize: () => requestDraw() });
const diag = setupCanvas(document.getElementById('diagram'), { width: 360, height: 200, maxHeightVh: 30, onResize: () => requestDraw() });
function requestDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; draw(); });
}
onThemeChange(() => requestDraw());
const cur = () => S[shell.tab];

function tag(ctx, s, x, y, color = cssVar('--text'), size = 14) {
  ctx.fillStyle = color;
  ctx.font = font(size, 800);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}
// Draw the oscilloscope for the current input; returns the geometry (terminals A and M)
function scope(ctx, tab, st, box) {
  const inp = scopeInput(tab, st);
  const tr = traceLength(inp.vb);
  let curve, spotX = 0;
  if (tr.steady) curve = (x) => inp.v(x * inp.vb) / inp.sv; // triggered: the sweep always starts at the same instant
  else {
    const sweep = DIV_X * inp.vb;
    const start = Math.floor(anim.t / sweep) * sweep;
    spotX = (anim.t - start) / inp.vb;
    curve = (x) => inp.v(start + x * inp.vb) / inp.sv;
  }
  const g = drawScope(ctx, {
    ...box, curve, steady: tr.steady, spotX, len: Math.max(tr.len, 1.6), // a longer glow helps to follow the spot
    svLabel: svText(inp.sv), vbLabel: vbText(inp.vb), svName: 'Sv', vbName: t('scope.vbName'),
    gnd: tab === 'dcac' && st.coupling === 'gnd',
  });
  if (inp.um / inp.sv > DIV_Y / 2 + 0.02) tag(ctx, t('scope.offscreen'), g.screen.x + g.screen.w / 2, g.screen.y + 16, '#ffd166', box.small ? 11 : 13);
  return g;
}

function draw() {
  if (!shell) return;
  const tab = shell.tab;
  const st = cur();
  if (view.height !== HEIGHTS[tab]) view.setLogicalSize(600, HEIGHTS[tab]);
  const ctx = view.begin();
  ctx.fillStyle = cssVar('--board');
  roundRect(ctx, 8, 8, 584, HEIGHTS[tab] - 16, 14);
  ctx.fill();
  ({ dcac: drawDcAc, forms: drawForms, sine: drawSine, effective: drawEffective })[tab](ctx, st);
  drawDiagram(tab, st);
}

// Horizontal 6 V dry cell (as in Chapter 5)
function drawCell6(ctx, x, y, plusLeft) {
  const w = 112, h = 56, x0 = x - w / 2;
  ctx.fillStyle = cssVar('--battery');
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, x0, y - h / 2, w, h, 6);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = cssVar('--gold');
  ctx.fillRect(x0 + 8, y + 6, w - 16, 12);
  tag(ctx, '6 V', x, y - 9, '#ffffff', 15);
  ctx.fillStyle = cssVar('--pan-metal');
  ctx.fillRect(x0 - 6, y - 5, 7, 10);
  ctx.fillRect(x0 + w - 1, y - 5, 7, 10);
  const L = [x0 - 6, y], R = [x0 + w + 6, y];
  tag(ctx, plusLeft ? '+' : '−', x0 - 2, y - 22, plusLeft ? cssVar('--accent') : cssVar('--text'), 18);
  tag(ctx, plusLeft ? '−' : '+', x0 + w + 2, y - 22, plusLeft ? cssVar('--text') : cssVar('--accent'), 18);
  return plusLeft ? { plus: L, minus: R } : { plus: R, minus: L };
}
// Electric motor coupled by a belt to the alternator of a bicycle (Fig. 2d)
function drawAlternator(ctx, x, y, st) {
  const ang = st.motor ? anim.t * TAU * (ALT.fMax * st.speed) / 100 / 2 : 0;
  // motor
  ctx.fillStyle = cssVar('--motor');
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, x - 20, y + 70, 110, 60, 10);
  ctx.fill(); ctx.stroke();
  tag(ctx, 'M', x + 35, y + 100, '#ffffff', 20);
  const p1 = [x + 35, y + 70], p2 = [x + 35, y];
  // belt
  ctx.strokeStyle = cssVar('--rubber');
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(p1[0] - 12, p1[1]); ctx.lineTo(p2[0] - 9, p2[1]); ctx.moveTo(p1[0] + 12, p1[1]); ctx.lineTo(p2[0] + 9, p2[1]); ctx.stroke();
  for (const [p, r] of [[p1, 12], [p2, 9]]) {
    ctx.fillStyle = cssVar('--pan-metal');
    ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, TAU); ctx.fill();
    ctx.strokeStyle = cssVar('--wire');
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0] + r * Math.cos(ang), p[1] + r * Math.sin(ang)); ctx.stroke();
  }
  // alternator body
  ctx.fillStyle = cssVar('--battery');
  roundRect(ctx, x + 10, y - 60, 50, 56, 8);
  ctx.fill();
  tag(ctx, 'G~', x + 35, y - 32, '#ffffff', 15);
  return { A: [x + 18, y - 60], M: [x + 52, y - 60] };
}
// Low-frequency generator (G.B.F.) box with an output
function drawLFG(ctx, x, y, w, label, waveLabel) {
  ctx.fillStyle = cssVar('--device');
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, x, y, w, 86, 10);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = cssVar('--lcd-bg');
  roundRect(ctx, x + 10, y + 10, w - 20, 30, 4);
  ctx.fill();
  tag(ctx, waveLabel, x + w / 2, y + 25, cssVar('--lcd-ink'), 13);
  tag(ctx, label, x + w / 2, y + 54, cssVar('--text-on-meter'), 12);
  const out1 = [x + w / 2 - 22, y + 74], out2 = [x + w / 2 + 22, y + 74];
  ctx.fillStyle = cssVar('--accent'); ctx.beginPath(); ctx.arc(out1[0], out1[1], 6, 0, TAU); ctx.fill();
  ctx.fillStyle = '#1d1f24'; ctx.beginPath(); ctx.arc(out2[0], out2[1], 6, 0, TAU); ctx.fill();
  return { out1, out2 };
}

const BIG = { x: 16, y: 18, d: 26 };
function drawDcAc(ctx, st) {
  const g = scope(ctx, 'dcac', st, BIG);
  const red = cssVar('--accent'), black = cssVar('--lead-black');
  if (st.source === 'cell') {
    const c = drawCell6(ctx, 476, 120, true);
    const [toA, toM] = st.reversed ? [c.minus, c.plus] : [c.plus, c.minus];
    drawLead(ctx, g.A, toA, red, [g.A[0] + 20, toA[1] + 150]);
    drawLead(ctx, g.M, toM, black, [g.M[0] + 120, toM[1] + 130]);
  } else {
    const a = drawAlternator(ctx, 440, 150, st);
    drawLead(ctx, g.A, a.A, red, [g.A[0] + 40, a.A[1] - 40]);
    drawLead(ctx, g.M, a.M, black, [g.M[0] + 80, a.M[1] - 60]);
    tag(ctx, t(st.motor ? 'alt.turning' : 'alt.stopped'), 475, 300, cssVar('--text'), 13);
  }
}
function drawForms(ctx, st) {
  const g = scope(ctx, 'forms', st, BIG);
  const l = drawLFG(ctx, 400, 60, 170, t('lfg.name'), t(`form.${st.form}`));
  drawLead(ctx, g.A, l.out1, cssVar('--accent'), [g.A[0] + 60, l.out1[1] + 150]);
  drawLead(ctx, g.M, l.out2, cssVar('--lead-black'), [g.M[0] + 120, l.out2[1] + 120]);
}
function drawSine(ctx, st) {
  const g = scope(ctx, 'sine', st, BIG);
  const test = st.mode === 'test';
  const l = drawLFG(ctx, 400, 60, 170, t('lfg.name'), test ? '?' : t(`signal.${st.signal}`));
  drawLead(ctx, g.A, l.out1, cssVar('--accent'), [g.A[0] + 60, l.out1[1] + 150]);
  drawLead(ctx, g.M, l.out2, cssVar('--lead-black'), [g.M[0] + 120, l.out2[1] + 120]);
}
function drawEffective(ctx, st) {
  const g = scope(ctx, 'effective', st, { x: 16, y: 18, d: 18, small: true });
  const red = cssVar('--accent'), black = cssVar('--lead-black');
  const U1 = st.um / SQRT2;
  // AC circuit: generator → lamp L1, voltmeter V1 (AC mode) and the oscilloscope across L1
  const l = drawLFG(ctx, 236, 24, 150, t('lfg.ac'), '~ 50 Hz');
  const L1 = [311, 290], L2 = [500, 290];
  ctx.strokeStyle = cssVar('--wire'); ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(l.out1[0], l.out1[1]); ctx.lineTo(L1[0] - 30, 200); ctx.lineTo(L1[0] - 30, L1[1]);
  ctx.moveTo(l.out2[0], l.out2[1]); ctx.lineTo(L1[0] + 30, 200); ctx.lineTo(L1[0] + 30, L1[1]); ctx.stroke();
  drawLamp(ctx, { x: L1[0], y: L1[1], glow: (U1 / LAMP_RATED) ** 2 });
  tag(ctx, 'L1', L1[0] - 52, L1[1] - 40);
  // the oscilloscope is connected to the output of the generator, so it is across the lamp L1
  drawLead(ctx, g.A, [l.out1[0], l.out1[1] + 4], red, [g.A[0] + 40, l.out1[1] + 90]);
  drawLead(ctx, g.M, [l.out2[0], l.out2[1] + 4], black, [g.M[0] + 90, l.out2[1] + 110]);
  const v1 = st.meterMode === 'ac' ? U1 : 0;
  drawLead(ctx, [L1[0] - MH, 372], [L1[0] - 30, L1[1] + 2], red, [L1[0] - 44, L1[1] + 50]);
  drawLead(ctx, [L1[0] + MH, 372], [L1[0] + 30, L1[1] + 2], black, [L1[0] + 44, L1[1] + 50]);
  drawMeterBox(ctx, { x: L1[0], y: 372, kind: 'V', name: st.meterMode === 'ac' ? 'V1 ~' : 'V1 ⎓', text: num(v1, 2), unit: 'V' });
  // DC circuit: adjustable DC supply → lamp L2 with voltmeter V2 (DC mode)
  const d = drawLFG(ctx, 430, 24, 140, t('dc.supply'), `${num(st.u2, 2)} V ⎓`);
  ctx.strokeStyle = cssVar('--wire'); ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(d.out1[0], d.out1[1]); ctx.lineTo(L2[0] - 30, 200); ctx.lineTo(L2[0] - 30, L2[1]);
  ctx.moveTo(d.out2[0], d.out2[1]); ctx.lineTo(L2[0] + 30, 200); ctx.lineTo(L2[0] + 30, L2[1]); ctx.stroke();
  drawLamp(ctx, { x: L2[0], y: L2[1], glow: (st.u2 / LAMP_RATED) ** 2 });
  tag(ctx, 'L2', L2[0] + 54, L2[1] - 40);
  drawLead(ctx, [L2[0] - MH, 372], [L2[0] - 30, L2[1] + 2], red, [L2[0] - 44, L2[1] + 50]);
  drawLead(ctx, [L2[0] + MH, 372], [L2[0] + 30, L2[1] + 2], black, [L2[0] + 44, L2[1] + 50]);
  drawMeterBox(ctx, { x: L2[0], y: 372, kind: 'V', name: 'V2 ⎓', text: num(st.u2, 2), unit: 'V' });
}

/* ---------- Diagrams ---------- */
function drawDiagram(tab, st) {
  const ctx = diag.begin();
  const ink = cssVar('--text');
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  const scopeBox = (x, y) => {
    ctx.strokeRect(x, y, 110, 90);
    label(ctx, t('diag.scope'), x + 55, y + 18, ink, 11);
    ctx.beginPath(); ctx.arc(x + 20, y + 70, 4, 0, TAU); ctx.arc(x + 90, y + 70, 4, 0, TAU); ctx.fill();
    label(ctx, 'A', x + 20, y + 54, ink); label(ctx, 'M', x + 90, y + 54, ink);
    return [[x + 20, y + 70], [x + 90, y + 70]];
  };
  const genSym = (x, y, txt) => {
    ctx.beginPath(); ctx.arc(x, y, 16, 0, TAU); ctx.stroke();
    label(ctx, txt, x, y, ink, 12);
  };
  const wire = (pts) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); };
  if (tab === 'effective') {
    // AC circuit and DC circuit side by side
    genSym(60, 60, 'G~'); symLamp(ctx, 60, 150, st.um / SQRT2 > 1);
    wire([[60, 76], [60, 135]]); wire([[60, 44], [60, 20], [110, 20], [110, 180], [60, 180], [60, 165]]);
    symMeter(ctx, 140, 150, 'V'); label(ctx, '~', 158, 138, ink, 12);
    wire([[110, 120], [140, 120], [140, 136]]); wire([[140, 164], [140, 185], [110, 185]]);
    label(ctx, 'L1', 32, 150, ink);
    genSym(250, 60, '⎓'); symLamp(ctx, 250, 150, st.u2 > 1);
    wire([[250, 76], [250, 135]]); wire([[250, 44], [250, 20], [300, 20], [300, 180], [250, 180], [250, 165]]);
    symMeter(ctx, 330, 150, 'V'); label(ctx, '⎓', 348, 138, ink, 12);
    wire([[300, 120], [330, 120], [330, 136]]); wire([[330, 164], [330, 185], [300, 185]]);
    label(ctx, 'L2', 222, 150, ink);
    return;
  }
  const [A, M] = scopeBox(210, 50);
  if (tab === 'dcac' && st.source === 'cell') {
    symCell(ctx, 100, 100, true);
    const [a, m] = st.reversed ? [95, 105] : [105, 95];
    wire([[a, 100], [a > 100 ? 160 : 40, 100], [a > 100 ? 160 : 40, 170], [A[0], 170], A]);
    wire([[m, 100], [m > 100 ? 160 : 40, 100], [m > 100 ? 160 : 40, 30], [M[0], 30], M]);
  } else {
    genSym(100, 100, tab === 'dcac' ? 'G~' : '~');
    wire([[100, 116], [100, 170], [A[0], 170], A]);
    wire([[100, 84], [100, 30], [M[0], 30], M]);
  }
}
function label(ctx, s, x, y, color, size = 13) {
  if (color) ctx.fillStyle = color;
  ctx.font = font(size, 800);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}

/* ================================================================
   Animation (spot at slow time bases, turning alternator)
   ================================================================ */
const loop = createLoop({
  dt: 1 / 60,
  step(dt) {
    if (!shell) return false;
    anim.t += dt;
    return needsLoop(shell.tab, cur());
  },
  render: () => draw(),
});
function needsLoop(tab, st) {
  const inp = scopeInput(tab, st);
  return !traceLength(inp.vb).steady || (tab === 'dcac' && st.source === 'alternator' && st.motor);
}

/* ================================================================
   Panels
   ================================================================ */
const controlsBody = document.getElementById('controls-body');
const measuresBody = document.getElementById('measures-body');
let ui = {};
function change(fn) {
  const st = cur();
  fn(st);
  st.fb = null;
  refresh();
}
function refresh() {
  updateMeasures();
  if (shell && needsLoop(shell.tab, cur())) loop.start(); else loop.stop();
  requestDraw();
}
function showStatus(box, fb) {
  if (!fb) { box.hidden = true; return; }
  box.hidden = false;
  box.className = `status ${fb.type || ''}`;
  box.textContent = t(fb.key, fb.params);
}
function measRows(dl, rows) {
  dl.replaceChildren(...rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)]));
}
function seg(labelKey, options, value, onChange) {
  return createSegmented({ labelKey, options: options.map(([v, k]) => ({ value: String(v), labelKey: k })), value: String(value), onChange });
}
const btnRow = (...b) => el('div', { class: 'btn-row', style: 'margin-top:8px' }, b);
const resetBtn = () => createButton({ labelKey: 'ui.reset', onClick: resetTab, variant: 'ghost' });
const svOpts = (list) => list.map((v) => [v, `sv.${v}`]);
const vbOpts = (list) => list.map((v) => [v, `vb.${v}`]);

function build() {
  const tab = shell.tab;
  const st = cur();
  const items = [];
  if (tab === 'dcac') {
    ui.source = seg('ctl.source', [['cell', 'src.cell'], ['alternator', 'src.alternator']], st.source, (v) => change((s) => { s.source = v; }));
    items.push(ui.source.root);
    if (st.source === 'cell') {
      items.push(btnRow(createButton({ labelKey: 'ctl.reverseCell', onClick: () => change((s) => { s.reversed = !s.reversed; }) })));
    } else {
      ui.motor = seg('ctl.motor', [['off', 'motor.off'], ['on', 'motor.on']], st.motor ? 'on' : 'off', (v) => change((s) => { s.motor = v === 'on'; }));
      ui.speed = createSlider({ labelKey: 'ctl.speed', min: 10, max: 100, step: 5, value: st.speed, unit: '%', onInput: (v) => change((s) => { s.speed = v; }) });
      items.push(ui.motor.root, ui.speed.root);
    }
    ui.sv = seg('ctl.sv', svOpts(SV_DC), st.sv, (v) => change((s) => { s.sv = Number(v); }));
    ui.vb = seg('ctl.vb', vbOpts(VB_DC), st.vb, (v) => change((s) => { s.vb = Number(v); }));
    ui.coupling = seg('ctl.coupling', [['dc', 'coupling.dc'], ['gnd', 'coupling.gnd']], st.coupling, (v) => change((s) => { s.coupling = v; }));
    items.push(ui.sv.root, ui.vb.root, ui.coupling.root, btnRow(resetBtn()));
    ui.source.root.addEventListener('click', () => setTimeout(buildTab)); // rebuild the controls of the new source
  } else if (tab === 'forms') {
    ui.form = seg('ctl.form', FORM_ORDER.map((f) => [f, `form.${f}`]), st.form, (v) => change((s) => { s.form = v; }));
    items.push(ui.form.root, btnRow(resetBtn()), el('p', { class: 'muted', style: 'margin:8px 0 0;font-size:0.88rem', dataset: { i18n: 'hint.forms' } }, t('hint.forms')));
  } else if (tab === 'sine') {
    ui.mode = seg('ctl.mode', [['exp', 'mode.exp'], ['test', 'mode.test']], st.mode, (v) => {
      const s = cur(); s.mode = v; if (v === 'test' && !s.test) newTest(s); s.fb = null; buildTab();
    });
    items.push(ui.mode.root);
    if (st.mode === 'exp') {
      ui.signal = seg('ctl.signal', [['A', 'signal.A'], ['B', 'signal.B'], ['C', 'signal.C']], st.signal, (v) => change((s) => { s.signal = v; }));
      ui.sv = seg('ctl.sv', svOpts(SV_SINE), st.sv, (v) => change((s) => { s.sv = Number(v); }));
      ui.vb = seg('ctl.vb', vbOpts(VB_SINE), st.vb, (v) => change((s) => { s.vb = Number(v); }));
      const record = () => {
        const s = cur();
        const G = SIGNALS[s.signal];
        const y = G.um / s.sv, x = 1 / (G.f * s.vb);
        if (y > DIV_Y / 2 + 0.02) { s.fb = { type: 'warn', key: 'fb.yTooBig' }; updateMeasures(); return; }
        if (x > DIV_X + 0.01) { s.fb = { type: 'warn', key: 'fb.xTooBig' }; updateMeasures(); return; }
        if (y < 1) { s.fb = { type: 'warn', key: 'fb.ySmall' }; updateMeasures(); return; }
        s.rows.push({ sv: s.sv, vb: s.vb, y, x });
        if (s.rows.length > 6) s.rows.shift();
        s.fb = { type: 'good', key: 'fb.sineRecorded' };
        updateMeasures();
      };
      items.push(ui.signal.root, ui.sv.root, ui.vb.root, btnRow(createButton({ labelKey: 'ctl.recordScope', onClick: record, variant: 'primary' }), resetBtn()));
    } else {
      if (!st.test) newTest(st);
      ui.testInfo = el('p', { class: 'keep-case', style: 'margin:8px 0' });
      ui.inputs = {};
      const box = el('div', { class: 'test-grid' });
      for (const [k, unit] of [['um', 'V'], ['T', 'ms'], ['f', 'Hz']]) {
        const inp = el('input', { class: 'text-input', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '?', 'aria-label': t(`test.${k}`) });
        inp.value = st.test.draft[k];
        inp.addEventListener('input', () => { cur().test.draft[k] = inp.value; });
        inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') checkTest(); });
        ui.inputs[k] = inp;
        box.append(el('label', { class: 'keep-case', style: 'display:flex;align-items:center;gap:8px;margin:6px 0' }, [el('span', { style: 'min-width:9.5em' }, t(`test.${k}`)), inp, el('span', {}, unit)]));
      }
      items.push(ui.testInfo, box,
        btnRow(createButton({ labelKey: 'calc.check', variant: 'primary', onClick: checkTest }),
          createButton({ labelKey: 'ctl.newScreen', onClick: () => { const s = cur(); newTest(s); s.fb = null; buildTab(); } }), resetBtn()));
    }
  } else {
    ui.um = createSlider({ labelKey: 'ctl.um', min: 0, max: 12, step: 0.1, value: st.um, unit: 'V', decimals: 1, onInput: (v) => change((s) => { s.um = v; }) });
    ui.sv = seg('ctl.sv', svOpts(SV_EFF), st.sv, (v) => change((s) => { s.sv = Number(v); }));
    ui.meter = seg('ctl.meterMode', [['ac', 'meter.ac'], ['dc', 'meter.dc']], st.meterMode, (v) => change((s) => { s.meterMode = v; }));
    ui.u2 = createSlider({ labelKey: 'ctl.u2', min: 0, max: 9, step: 0.02, value: st.u2, unit: 'V', decimals: 2, onInput: (v) => change((s) => { s.u2 = v; }) });
    const record = () => {
      const s = cur();
      if (s.meterMode !== 'ac') { s.fb = { type: 'warn', key: 'fb.meterDC' }; updateMeasures(); return; }
      if (s.um / s.sv > DIV_Y / 2 + 0.02 || s.um / s.sv < 1) { s.fb = { type: 'warn', key: 'fb.effSv' }; updateMeasures(); return; }
      s.rows.push({ sv: s.sv, y: s.um / s.sv, u1: Math.round((s.um / SQRT2) * 100) / 100, u2: s.u2 });
      if (s.rows.length > 6) s.rows.shift();
      s.fb = { type: 'good', key: 'fb.effRecorded' };
      updateMeasures();
    };
    items.push(ui.um.root, ui.sv.root, ui.meter.root, ui.u2.root,
      btnRow(createButton({ labelKey: 'ctl.recordEff', onClick: record, variant: 'primary' }), resetBtn()));
  }
  controlsBody.append(...items);
  ui.dl = el('dl', { class: 'meas' });
  ui.status = el('div', { class: 'status', hidden: '' });
  ui.tables = el('div');
  ui.clear = createButton({ labelKey: 'ctl.clearTable', onClick: () => { const s = cur(); s.rows = tab === 'forms' ? FORM_ORDER.map((form) => ({ form })) : []; s.fb = null; ui.sig = null; updateMeasures(); }, variant: 'ghost' });
  ui.clearRow = el('div', { class: 'btn-row', style: 'margin-top:8px' }, [ui.clear]);
  measuresBody.append(ui.dl, ui.status, ui.tables, ui.clearRow);
}

function newTest(st) {
  const sv = [1, 2, 5][Math.floor(Math.random() * 3)];
  const y = (5 + Math.floor(Math.random() * 16)) * 0.2; // 1.0 … 4.0 divisions
  const vb = [0.0005, 0.001, 0.002, 0.005][Math.floor(Math.random() * 4)];
  const x = [4, 5, 8, 10][Math.floor(Math.random() * 4)];
  st.test = { sv, y: Math.round(y * 10) / 10, vb, x, draft: { um: '', T: '', f: '' }, res: {} };
}
function checkTest() {
  const s = cur();
  const q = s.test;
  const um = q.y * q.sv, T = q.x * q.vb * 1000, f = 1000 / T;
  const val = (k) => parseNum(ui.inputs[k].value);
  const v = { um: val('um'), T: val('T'), f: val('f') };
  if (Object.values(v).some((x) => !Number.isFinite(x))) { s.fb = { type: 'warn', key: 'fb.testFill' }; updateMeasures(); return; }
  q.res = {
    um: Math.abs(v.um - um) <= q.sv * 0.1 + 1e-9,
    T: Math.abs(v.T - T) <= q.vb * 1000 * 0.1 + 1e-9,
    f: Math.abs(v.f - 1000 / v.T) <= Math.max(0.5, 0.01 * f) && Math.abs(v.f - f) <= 0.03 * f,
  };
  const ok = q.res.um && q.res.T && q.res.f;
  s.score.n += 1; if (ok) s.score.ok += 1;
  s.fb = ok ? { type: 'good', key: 'fb.testOk', params: { um: num(um, 1), T: num(T, T < 10 ? 1 : 0), f: num(f, f < 100 ? 1 : 0) } }
    : { type: 'bad', key: 'fb.testWrong' };
  updateMeasures();
}

function updateMeasures() {
  if (!shell || !ui.dl) return;
  const tab = shell.tab;
  const st = cur();
  const rows = [];
  let fb = st.fb;
  const inp = scopeInput(tab, st);
  if (tab === 'dcac') {
    ui.source.set(st.source); ui.sv.set(String(st.sv)); ui.vb.set(String(st.vb)); ui.coupling.set(st.coupling);
    ui.motor?.set(st.motor ? 'on' : 'off');
    rows.push([t('m.sv'), svText(st.sv)], [t('m.vb'), vbText(st.vb)]);
    rows.push([t('m.trace'), t(traceLength(st.vb).steady ? 'trace.curve' : 'trace.spot')]);
    if (!fb) {
      if (st.coupling === 'gnd') fb = { type: '', key: 'fb.gnd' };
      else if (inp.um / st.sv > DIV_Y / 2 + 0.02) fb = { type: 'warn', key: 'fb.off' };
      else if (st.source === 'alternator' && !st.motor) fb = { type: '', key: 'fb.motorOff' };
      else if (!traceLength(st.vb).steady) fb = { type: '', key: 'fb.spot' };
    }
  } else if (tab === 'forms') {
    ui.form.set(st.form);
    rows.push([t('m.form'), t(`form.${st.form}`)]);
  } else if (tab === 'sine') {
    if (st.mode === 'exp') {
      ui.signal.set(st.signal); ui.sv.set(String(st.sv)); ui.vb.set(String(st.vb));
      rows.push([t('m.sv'), svText(st.sv)], [t('m.vb'), vbText(st.vb)]);
      if (!fb) {
        if (inp.um / st.sv > DIV_Y / 2 + 0.02) fb = { type: 'warn', key: 'fb.off' };
        else if (1 / (inp.f * st.vb) > DIV_X + 0.01) fb = { type: 'warn', key: 'fb.lessThanPeriod' };
      }
    } else {
      const q = st.test;
      ui.testInfo.textContent = t('test.info', { sv: svText(q.sv), vb: vbText(q.vb) });
      for (const k of ['um', 'T', 'f']) ui.inputs[k].classList.toggle('is-wrong', q.res[k] === false);
      rows.push([t('m.sv'), svText(q.sv)], [t('m.vb'), vbText(q.vb)], [t('m.score'), `${st.score.ok} / ${st.score.n}`]);
    }
  } else {
    ui.sv.set(String(st.sv)); ui.meter.set(st.meterMode);
    const U1 = st.um / SQRT2;
    rows.push([t('m.v1'), `${num(st.meterMode === 'ac' ? U1 : 0, 2)} V`], [t('m.v2'), `${num(st.u2, 2)} V`]);
    rows.push([t('m.l1'), t(lampWord(U1))], [t('m.l2'), t(lampWord(st.u2))]);
    if (!fb) {
      if (st.meterMode === 'dc') fb = { type: 'warn', key: 'fb.meterDC' };
      else if (st.um / st.sv > DIV_Y / 2 + 0.02) fb = { type: 'warn', key: 'fb.off' };
      else if (Math.abs(U1 - LAMP_RATED) > 0.45) fb = { type: '', key: 'fb.adjustL1' };
      else if (Math.abs(st.u2 - U1) <= 0.1) fb = { type: 'good', key: 'fb.same' };
      else fb = { type: '', key: st.u2 < U1 ? 'fb.l2dimmer' : 'fb.l2brighter' };
    }
  }
  measRows(ui.dl, rows);
  showStatus(ui.status, fb);
  buildTables(tab, st);
}
function lampWord(u) {
  const r = u / LAMP_RATED;
  return r < 0.15 ? 'lamp.off' : r < 0.9 ? 'lamp.dim' : r <= 1.1 ? 'lamp.normal' : 'lamp.bright';
}

function buildTables(tab, st) {
  const rows = st.rows || [];
  const sig = `${tab}|${st.mode}|${st.form}|${rows.length}|${calcSig(rows)}`;
  if (sig === ui.sig) return;
  ui.sig = sig;
  const th = (k) => el('th', { class: 'keep-case' }, t(k));
  const onCheck = (res) => {
    const s = cur();
    s.fb = res === 'invalid' ? { type: 'warn', key: 'calc.invalid' } : res === 'ok' ? { type: 'good', key: 'fb.calcOk' } : { type: 'bad', key: 'fb.calcWrong' };
    updateMeasures();
  };
  const typed = (r, k) => (calcDone(r, k) ? parseNum(r.calc[k].draft) : NaN);
  const table = (head, body, title) => {
    const tb = el('table', { class: 'data' }, [el('thead', {}, el('tr', {}, head)), el('tbody', {}, body)]);
    return title ? [el('h3', { class: 'keep-case', style: 'margin:10px 0 4px;font-size:0.95rem' }, t(title)), tb] : [tb];
  };
  let parts = [];
  let any = rows.length > 0;
  if (tab === 'forms') {
    const body = rows.map((r) => {
      const F = FORMS[r.form], off = r.form !== st.form;
      return el('tr', {}, [el('td', {}, t(`form.${r.form}`)),
        calcCell(r, 'x', { expected: F.x, decimals: 1, tol: 0.1, disabled: off, onCheck }),
        calcCell(r, 'ymax', { expected: F.ymax, decimals: 1, tol: 0.1, disabled: off, onCheck }),
        calcCell(r, 'ymin', { expected: F.ymin, decimals: 1, tol: 0.1, disabled: off, onCheck })]);
    });
    parts = table([th('col.voltage'), th('col.x'), th('col.ymax'), th('col.ymin')], body);
    any = rows.some((r) => r.calc);
  } else if (tab === 'sine' && st.mode === 'exp') {
    const b1 = rows.map((r) => {
      const um = typed(r, 'um');
      return el('tr', {}, [el('td', {}, svText(r.sv)),
        calcCell(r, 'y', { expected: r.y, decimals: 1, tol: 0.1, onCheck }),
        calcCell(r, 'um', { expected: r.sv * (typed(r, 'y') || 0), decimals: 1, disabled: !calcDone(r, 'y'), onCheck }),
        calcCell(r, 'U', { expected: (um || 0) / SQRT2, decimals: 2, tol: 0.06, disabled: !calcDone(r, 'um'), onCheck })]);
    });
    const b2 = rows.map((r) => {
      const T = typed(r, 'T');
      return el('tr', {}, [el('td', {}, vbText(r.vb)),
        calcCell(r, 'x', { expected: r.x, decimals: 1, tol: 0.1, onCheck }),
        calcCell(r, 'T', { expected: r.vb * 1000 * (typed(r, 'x') || 0), decimals: 1, disabled: !calcDone(r, 'x'), onCheck }),
        calcCell(r, 'f', { expected: 1000 / (T || 1), decimals: 0, tol: Math.max(0.5, 10 / (T || 1)), disabled: !calcDone(r, 'T'), onCheck })]);
    });
    parts = [...table([th('col.sv'), th('col.y'), th('col.um'), th('col.U')], b1, 'tbl.um'),
      ...table([th('col.vb'), th('col.x'), th('col.T'), th('col.f')], b2, 'tbl.T')];
  } else if (tab === 'effective') {
    const body = rows.map((r) => {
      const um = typed(r, 'um');
      return el('tr', {}, [
        calcCell(r, 'um', { expected: r.sv * r.y, decimals: 1, tol: r.sv * 0.1, onCheck }),
        el('td', {}, num(r.u1, 2)),
        calcCell(r, 'ratio', { expected: (um || 0) / r.u1, decimals: 2, tol: 0.03, disabled: !calcDone(r, 'um'), onCheck }),
        el('td', {}, num(r.u2, 2))]);
    });
    parts = table([th('col.umEff'), th('col.u1'), th('col.ratio'), th('col.u2')], body);
  } else any = false;
  ui.tables.replaceChildren(...parts);
  ui.tables.hidden = parts.length === 0 || (tab !== 'forms' && rows.length === 0);
  ui.clearRow.hidden = !any;
}

function buildTab() {
  loop.stop();
  controlsBody.replaceChildren();
  measuresBody.replaceChildren();
  ui = {};
  build();
  refresh();
}
function resetTab() {
  S[shell.tab] = initialState(shell.tab);
  buildTab();
}

function extraStrings() {
  const s = { en: {}, fr: {} };
  for (const lang of ['en', 'fr']) {
    const n = (v, d) => num(v, d, lang);
    for (const v of new Set([...SV_DC, ...SV_SINE, ...SV_EFF])) s[lang][`sv.${v}`] = `${n(v, v < 1 ? 1 : 0)} V/div`;
    for (const v of new Set([...VB_DC, ...VB_SINE])) s[lang][`vb.${v}`] = v >= 0.1 ? `${n(v, v < 1 ? 1 : 0)} s/div` : `${n(v * 1000, v < 0.001 ? 1 : 0)} ms/div`;
  }
  return s;
}
const xs = extraStrings();
onLangChange(() => { if (shell) buildTab(); });

shell = initSim({
  strings: { en: { ...strings.en, ...xs.en }, fr: { ...strings.fr, ...xs.fr } },
  tabs: TABS.map((id) => ({ id, labelKey: `tab.${id}` })),
  initialTab: 'dcac',
  onTab: buildTab,
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, cur: () => cur(), scopeInput, tab: () => shell.tab };
