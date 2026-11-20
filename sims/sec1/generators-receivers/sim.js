// Sec 1 — Chapter 5: Generators and receivers (Générateurs et récepteurs) — p.69–81.
// Owner (4 Nov 2026): the 4.5 V flat battery has E = 4.27 V and r = 1.9 Ω (book Table 5.1).
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num } from '../../../shared/format.js';
import { createButton, createSegmented, createSlider, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { calcCell, calcSig } from '../../../shared/calc-cell.js';
import { drawMeterBox, drawCurrentArrows, drawDryCell, drawLead, METER_HALF } from '../../../shared/circuit-draw.js';
import { drawAnalogDial } from '../../../shared/analog-meter.js';
import { drawScope } from '../../../shared/oscilloscope.js';
import { createGraph } from '../../../shared/graph.js';
import { label } from '../../../shared/figures.js';
import { board as boardBg, line, tag, dot, resBox, lampAt, sourceV, switchH, rheostatH } from '../../../shared/board-draw.js';

/* ================================================================
   Model values
   ================================================================ */
const GENS = {
  flat: { E: 4.27, r: 1.9, R0: 5, text: '4.5 V' },     // Table 5.1
  cell: { E: 1.53, r: 0.67, R0: 2, text: '1.5 V' },    // Problem 7 (I = 0 → 1.53 V; 430 mA → 1.24 V)
};
const RH_MAX = 10;                                     // rheostat 0–10 Ω (Exp. 5.3)
const RECS = { cell: { e: 2.0, r: 4 }, motor: { e: 4.0, r: 2 } };
const R_PROT = 20;                                     // protection resistance of Fig. 5.12
const BAT = { E: 4.27, r: 1.9 }, R_LAMP = 40;          // batteries in opposition (Fig. 5.14)
const POLE_E = [1.5, 4.5, 9];
const SV = 2, SCALE = 10;
const W = 600, H = 440;
const TABS = ['poles', 'generator', 'receiver', 'opposition'];

const rand = (a) => a[Math.floor(Math.random() * a.length)];
function newGen() { return { pos: Math.random() < 0.5 ? 'A' : 'B', E: rand(POLE_E) }; }
function initialState(tab) {
  switch (tab) {
    case 'poles': return { tool: 'voltmeter', swap: false, gen: newGen(), needle: 0, fb: null };
    case 'generator': return { gen: 'flat', Rh: 10, closed: true, rows: [], calc: {}, fb: null };
    case 'receiver': return { rec: 'cell', U: 0, closed: true, rows: [], calc: {}, fb: null };
    case 'opposition': return { mode: 'series', calc: {}, fb: null };
    default: return {};
  }
}
let S = Object.fromEntries(TABS.map((k) => [k, initialState(k)]));
let shell;
const cur = () => S[shell.tab];
const dec = (s) => s.replace('.', t('dec'));

let drawQueued = false;
const canvas = document.getElementById('stage');
const view = setupCanvas(canvas, { width: W, height: H, maxHeightVh: () => (window.innerWidth < 880 ? 52 : 76), onResize: () => requestDraw() });
const graph = createGraph(document.getElementById('graph'), { width: 360, height: 240, maxHeightVh: 36 });
const graphCard = document.getElementById('graph-card');
function requestDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; draw(); });
}
onThemeChange(() => requestDraw());

function board(ctx) { boardBg(ctx, W, H); }
function hint(ctx, text) { label(ctx, text, W / 2, H - 20, { size: 13, weight: 600, color: cssVar('--muted') }); }
function vMeter(ctx, x, y, text) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(-Math.PI / 2);
  drawMeterBox(ctx, { x: 0, y: 0, kind: 'V', name: 'V', text, unit: 'V' });
  ctx.restore();
}
const phase = () => (performance.now() / 25) % 1000;

/* ================================================================
   Tab 1 — Poles of a generator (Exp. 5.1 and 5.2)
   ================================================================ */
function genBox(ctx, x, y) {
  // generator whose poles are not marked: terminals A (left) and B (right)
  ctx.fillStyle = cssVar('--battery'); ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.5;
  roundRect(ctx, x - 70, y - 22, 140, 44, 8); ctx.fill(); ctx.stroke();
  tag(ctx, '? ', x, y, '#ffffff', 18);
  ctx.fillStyle = cssVar('--pan-metal');
  ctx.fillRect(x - 78, y - 5, 9, 10); ctx.fillRect(x + 69, y - 5, 9, 10);
  tag(ctx, 'A', x - 86, y, cssVar('--text'), 16, 'right'); tag(ctx, 'B', x + 86, y, cssVar('--text'), 16, 'left');
  return { A: [x - 76, y], B: [x + 76, y] };
}
const poleVAB = (g) => (g.pos === 'A' ? g.E : -g.E);
function drawPoles(ctx, st) {
  board(ctx);
  const g = st.gen;
  if (st.tool === 'voltmeter') {
    const d = drawAnalogDial(ctx, { width: W, needle: st.needle, grads: [100], unit: 'V', scaleText: `${t('lbl.scale')} : ${SCALE} V`, divsText: `(100 ${t('lbl.divs')})` });
    const T = genBox(ctx, W / 2, 408);
    // A → V(+), B → COM(−) — or interchanged
    const [toPlus, toMinus] = st.swap ? [T.B, T.A] : [T.A, T.B];
    drawLead(ctx, toPlus, d.plus, cssVar('--accent'), [d.plus[0] + 40, toPlus[1] + 10]);
    drawLead(ctx, toMinus, d.minus, cssVar('--lead-black'), [d.minus[0] - 120, toMinus[1] + 10]);
    if (st.needle < -0.02) label(ctx, t('warn.blocked'), W / 2, 282, { size: 14, weight: 800, color: cssVar('--bad') });
  } else {
    const vBA = -poleVAB(g); // book: B → input E, A → ground M
    const level = (st.swap ? -vBA : vBA) / SV;
    const r = drawScope(ctx, { x: 40, y: 24, d: 30, level, steady: false, spotX: 5, len: 0, svLabel: `${SV} V/div`, vbLabel: t('lbl.sweepOff'), svName: 'Sv', vbName: ' ' });
    const T = genBox(ctx, 480, 300);
    const [toE, toM] = st.swap ? [T.A, T.B] : [T.B, T.A];
    drawLead(ctx, toE, r.A, cssVar('--accent'), [toE[0] - 40, r.A[1] + 60]);
    drawLead(ctx, toM, r.M, cssVar('--lead-black'), [toM[0] - 60, r.M[1] + 90]);
    tag(ctx, st.swap ? t('lbl.connScopeSwap') : t('lbl.connScope'), 480, 360, cssVar('--muted'), 12, 'center', 700);
  }
}

/* ================================================================
   Tab 2 — Characteristic of a generator (Exp. 5.3, Table 5.1, 5.4)
   ================================================================ */
function genValues(st) {
  const G = GENS[st.gen];
  const I = st.closed ? G.E / (G.r + G.R0 + st.Rh) : 0;
  return { I, V: G.E - G.r * I };
}
function drawGenerator(ctx, st) {
  board(ctx);
  const G = GENS[st.gen];
  const { I, V } = genValues(st);
  const XB = 150;
  line(ctx, [[XB, 120], [XB, 70], [220, 70]]); line(ctx, [[280, 70], [360 - METER_HALF, 70]]); line(ctx, [[360 + METER_HALF, 70], [520, 70], [520, 160]]);
  line(ctx, [[520, 220], [520, 370], [500, 370]]);
  sourceV(ctx, XB, 120, 320, dec(G.text));
  tag(ctx, 'P', XB - 18, 104, cssVar('--text'), 15); tag(ctx, 'N', XB - 18, 338, cssVar('--text'), 15);
  switchH(ctx, 220, 280, 70, !st.closed); tag(ctx, 'K', 250, 98, cssVar('--text'), 15);
  drawMeterBox(ctx, { x: 360, y: 70, kind: 'A', name: 'A', text: num(I * 1000, 0), unit: 'mA' });
  resBox(ctx, 520, 190, '', true); tag(ctx, `${G.R0} Ω`, 540, 190, cssVar('--text'), 14, 'left');
  // rheostat: the part between the cursor C and the right end is in the circuit
  const cx = rheostatH(ctx, 380, 370, 1 - st.Rh / RH_MAX, 240);
  ctx.fillStyle = cssVar('--accent'); ctx.beginPath(); ctx.moveTo(cx, 356); ctx.lineTo(cx - 8, 342); ctx.lineTo(cx + 8, 342); ctx.fill();
  line(ctx, [[cx, 342], [cx, 300], [220, 300], [220, 370], [XB, 370], [XB, 320]]);
  tag(ctx, `Rh = ${num(st.Rh, 1)} Ω`, 380, 400, cssVar('--text'), 13);
  // voltmeter across P and N
  line(ctx, [[XB, 120], [50, 120], [50, 220 - METER_HALF + 10]], cssVar('--accent'), 2.5);
  line(ctx, [[XB, 320], [50, 320], [50, 220 + METER_HALF - 10]], cssVar('--lead-black'), 2.5);
  vMeter(ctx, 50, 220, num(V, 2));
  dot(ctx, XB, 120); dot(ctx, XB, 320);
  if (I > 0) {
    const skip = (x, y) => (x === XB && y > 115 && y < 325) || (y === 70 && x > 210 && x < 420) || (x === 520 && y > 150 && y < 230) || (y === 370 && x > 255 && x < 505);
    drawCurrentArrows(ctx, [[XB, 120], [XB, 70], [520, 70], [520, 370], [cx, 370], [cx, 300], [220, 300], [220, 370], [XB, 370], [XB, 320]], phase() * Math.min(1, I / 0.3), skip);
  }
  hint(ctx, t(st.closed ? 'hint.gen' : 'hint.genOpen'));
}

/* ================================================================
   Tab 3 — Characteristic of a receiver (5.5–5.6, Fig. 5.12–5.13)
   ================================================================ */
function recValues(st) {
  const R = RECS[st.rec];
  if (!st.closed) return { I: 0, V: 0 };
  if (st.U <= R.e) return { I: 0, V: st.U };
  const I = (st.U - R.e) / (R_PROT + R.r);
  return { I, V: R.e + R.r * I };
}
let bubbles = [];
let motorAngle = 0;
function drawReceiver(ctx, st) {
  board(ctx);
  const { I, V } = recValues(st);
  line(ctx, [[90, 120], [90, 70], [170, 70]]); line(ctx, [[230, 70], [300 - METER_HALF, 70]]); line(ctx, [[300 + METER_HALF, 70], [470, 70], [470, 140]]);
  line(ctx, [[470, 240], [470, 370], [330, 370]]); line(ctx, [[270, 370], [90, 370], [90, 320]]);
  sourceV(ctx, 90, 120, 320, `${dec(num(st.U, 1))} V`);
  tag(ctx, t('lbl.adjustable'), 90, 244, '#ffffff', 11, 'center', 700);
  switchH(ctx, 170, 230, 70, !st.closed); tag(ctx, 'K', 200, 98, cssVar('--text'), 15);
  drawMeterBox(ctx, { x: 300, y: 70, kind: 'A', name: 'A', text: num(I * 1000, 0), unit: 'mA' });
  resBox(ctx, 300, 370, `R = ${R_PROT} Ω`);
  // receiver symbol between M (top) and N (bottom)
  ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 2.5; ctx.fillStyle = cssVar('--surface');
  if (st.rec === 'cell') {
    line(ctx, [[470, 140], [470, 172]]); line(ctx, [[470, 208], [470, 240]]);
    ctx.fillRect(448, 160, 44, 60); ctx.strokeRect(448, 160, 44, 60);
    ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(456, 172); ctx.lineTo(484, 172); ctx.moveTo(456, 208); ctx.lineTo(484, 208); ctx.stroke();
  } else {
    line(ctx, [[470, 140], [470, 168]]); line(ctx, [[470, 212], [470, 240]]);
    ctx.beginPath(); ctx.arc(470, 190, 22, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    tag(ctx, 'M', 470, 191, cssVar('--text'), 16);
  }
  dot(ctx, 470, 140); dot(ctx, 470, 240);
  tag(ctx, 'M', 452, 128, cssVar('--text'), 14, 'right'); tag(ctx, 'N', 452, 252, cssVar('--text'), 14, 'right');
  line(ctx, [[470, 140], [560, 140], [560, 190 - METER_HALF + 10]], cssVar('--accent'), 2.5);
  line(ctx, [[470, 240], [560, 240], [560, 190 + METER_HALF - 10]], cssVar('--lead-black'), 2.5);
  vMeter(ctx, 560, 190, num(V, 2));
  // picture of the receiver inside the loop
  const px = 290, py = 215;
  if (st.rec === 'cell') {
    ctx.fillStyle = 'rgba(120, 180, 230, 0.35)'; ctx.fillRect(px - 60, py - 20, 120, 70);
    ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(px - 62, py - 45); ctx.lineTo(px - 62, py + 52); ctx.lineTo(px + 62, py + 52); ctx.lineTo(px + 62, py - 45); ctx.stroke();
    ctx.fillStyle = cssVar('--metal');
    ctx.fillRect(px - 32, py - 55, 10, 90); ctx.fillRect(px + 22, py - 55, 10, 90);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (const b of bubbles) { ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill(); }
    tag(ctx, t('lbl.cellPic'), px, py + 70, cssVar('--muted'), 12, 'center', 700);
  } else {
    ctx.fillStyle = cssVar('--metal'); ctx.beginPath(); ctx.arc(px, py, 38, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = cssVar('--surface'); ctx.lineWidth = 4;
    for (let k = 0; k < 3; k++) { const a = motorAngle + (k * 2 * Math.PI) / 3; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + 32 * Math.cos(a), py + 32 * Math.sin(a)); ctx.stroke(); }
    tag(ctx, t('lbl.motorPic'), px, py + 60, cssVar('--muted'), 12, 'center', 700);
  }
  if (I > 0) {
    const skip = (x, y) => (x === 90 && y > 115 && y < 325) || (y === 70 && x > 160 && x < 360) || (x === 470 && y > 150 && y < 230) || (y === 370 && x > 260 && x < 340);
    drawCurrentArrows(ctx, [[90, 120], [90, 70], [470, 70], [470, 370], [90, 370], [90, 320]], phase() * Math.min(1, I / 0.3), skip);
  }
  hint(ctx, t(st.closed && I === 0 && st.U > 0 ? 'hint.recZero' : 'hint.rec'));
}

/* ================================================================
   Tab 4 — Batteries in opposition (5.7, Fig. 5.14–5.16)
   ================================================================ */
function oppValues(st) {
  const n = st.mode === 'removed' ? 2 : 3;
  const emf = st.mode === 'series' ? 3 * BAT.E : st.mode === 'removed' ? 2 * BAT.E : BAT.E;
  const I = emf / (n * BAT.r + R_LAMP);
  // voltage across G3 measured from its + pole to its − pole
  const V3 = st.mode === 'series' ? BAT.E - BAT.r * I : st.mode === 'reversed' ? BAT.E + BAT.r * I : null;
  return { I, V3, P: R_LAMP * I * I };
}
const P_FULL = R_LAMP * (3 * BAT.E / (3 * BAT.r + R_LAMP)) ** 2;
function drawOpposition(ctx, st) {
  board(ctx);
  const v = oppValues(st);
  const Y = 120, xs = [150, 300, 450];
  // + pole on the left of G1 and G2: the current leaves towards the left
  line(ctx, [[88, Y], [60, Y], [60, 370], [210 - METER_HALF, 370]]); line(ctx, [[210 + METER_HALF, 370], [400, 370]]); line(ctx, [[440, 370], [540, 370], [540, Y], [512, Y]]);
  line(ctx, [[212, Y], [238, Y]]); line(ctx, [[362, Y], [388, Y]]);
  drawDryCell(ctx, xs[0], Y, dec('4.5 V')); drawDryCell(ctx, xs[1], Y, dec('4.5 V'));
  if (st.mode === 'removed') { line(ctx, [[388, Y], [512, Y]]); tag(ctx, t('lbl.removed'), 450, Y + 30, cssVar('--muted'), 12, 'center', 700); }
  else drawDryCell(ctx, xs[2], Y, dec('4.5 V'), 0, st.mode === 'reversed');
  ['G1', 'G2', 'G3'].forEach((g, i) => tag(ctx, g, xs[i], Y - 46, cssVar('--text'), 15));
  drawMeterBox(ctx, { x: 210, y: 370, kind: 'A', name: 'A', text: num(v.I, 3), unit: 'A' });
  lampAt(ctx, 420, 370, Math.min(1, v.P / P_FULL), 'L');
  if (v.V3 != null) {
    // voltmeter: red lead on the + pole of G3
    const plus = st.mode === 'reversed' ? [512, Y] : [388, Y], minus = st.mode === 'reversed' ? [388, Y] : [512, Y];
    drawMeterBox(ctx, { x: 450, y: 230, kind: 'V', name: 'V', text: num(v.V3, 2), unit: 'V' });
    drawLead(ctx, plus, [450 + (plus[0] > 450 ? METER_HALF : -METER_HALF), 230], cssVar('--accent'), [plus[0], 200]);
    drawLead(ctx, minus, [450 + (minus[0] > 450 ? METER_HALF : -METER_HALF), 230], cssVar('--lead-black'), [minus[0], 200]);
    tag(ctx, t('lbl.v3'), 430, 268, cssVar('--muted'), 12, 'center', 700);
  }
  drawCurrentArrows(ctx, [[88, Y], [60, Y], [60, 370], [540, 370], [540, Y], [512, Y]], phase() * Math.min(1.5, v.I / 0.2),
    (x, y) => (y === 370 && ((x > 150 && x < 270) || (x > 395 && x < 445))));
  hint(ctx, t(`hint.opp.${st.mode}`));
}

/* ================================================================
   Draw, loop
   ================================================================ */
function draw() {
  if (!shell) return;
  const ctx = view.begin();
  const st = cur();
  switch (shell.tab) {
    case 'poles': drawPoles(ctx, st); break;
    case 'generator': drawGenerator(ctx, st); break;
    case 'receiver': drawReceiver(ctx, st); break;
    case 'opposition': drawOpposition(ctx, st); break;
    default: break;
  }
}
const loop = createLoop({
  dt: 1 / 60,
  step(dt) {
    if (!shell) return false;
    const st = cur();
    if (shell.tab === 'poles' && st.tool === 'voltmeter') {
      const target = Math.max(-0.06, (st.swap ? -1 : 1) * poleVAB(st.gen) / SCALE);
      st.needle += (target - st.needle) * Math.min(1, dt * 6);
    }
    if (shell.tab === 'receiver') {
      const { I } = recValues(st);
      if (st.rec === 'cell') {
        if (I > 0 && Math.random() < I * 1.2) bubbles.push({ x: 290 + (Math.random() < 0.5 ? -27 : 27) + (Math.random() - 0.5) * 10, y: 245, r: 1.5 + Math.random() * 2 });
        bubbles.forEach((b) => { b.y -= 40 * dt; }); bubbles = bubbles.filter((b) => b.y > 197);
      } else motorAngle += dt * 25 * I;
    }
    return true;
  },
  render() { draw(); },
});

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
const slider = (o) => createSlider(o).root;
const sub = (sym, s) => el('span', { class: 'keep-case' }, [sym, el('sub', {}, s)]);

function build() {
  const tab = shell.tab, st = cur();
  const items = [];
  if (tab === 'poles') {
    items.push(seg('ctl.tool', [['voltmeter', 'tool.voltmeter'], ['scope', 'tool.scope']], st.tool, (v) => { st.tool = v; st.fb = null; buildTab(); }));
    items.push(seg('ctl.conn', [['book', st.tool === 'voltmeter' ? 'conn.vBook' : 'conn.sBook'], ['swap', 'conn.swap']], st.swap ? 'swap' : 'book', (v) => { st.swap = v === 'swap'; updateMeasures(); }));
    items.push(el('p', { style: 'margin:10px 0 4px;font-weight:700' }, t('ctl.answer')));
    items.push(btnRow(
      createButton({ labelKey: 'ans.A', variant: 'primary', onClick: () => answerPole('A') }),
      createButton({ labelKey: 'ans.B', variant: 'primary', onClick: () => answerPole('B') })));
    items.push(btnRow(createButton({ labelKey: 'ctl.newGen', onClick: () => { st.gen = newGen(); st.fb = null; updateMeasures(); } })));
    items.push(hintP(st.tool === 'voltmeter' ? 'hint.polesV' : 'hint.polesS'));
  } else if (tab === 'generator') {
    items.push(seg('ctl.gen', [['flat', 'gen.flat'], ['cell', 'gen.cell']], st.gen, (v) => { st.gen = v; st.rows = []; st.calc = {}; st.fb = null; ui.sig = null; updateMeasures(); }));
    items.push(slider({ labelKey: 'ctl.Rh', min: 0, max: RH_MAX, step: 0.5, value: st.Rh, format: (x) => `${num(x, 1)} Ω`, onInput: (x) => { st.Rh = x; updateMeasures(); } }));
    items.push(seg('ctl.switch', [['closed', 'sw.closed'], ['open', 'sw.open']], st.closed ? 'closed' : 'open', (v) => { st.closed = v === 'closed'; updateMeasures(); }));
    items.push(btnRow(createButton({ labelKey: 'ctl.record', variant: 'primary', onClick: () => recordRow(st, genValues(st)) }), resetBtn(tab)));
    items.push(hintP('hint.genCtl'));
  } else if (tab === 'receiver') {
    items.push(seg('ctl.rec', [['cell', 'rec.cell'], ['motor', 'rec.motor']], st.rec, (v) => { st.rec = v; st.rows = []; st.calc = {}; st.fb = null; ui.sig = null; bubbles = []; updateMeasures(); }));
    items.push(slider({ labelKey: 'ctl.U', min: 0, max: 20, step: 0.5, value: st.U, format: (x) => `${num(x, 1)} V`, onInput: (x) => { st.U = x; updateMeasures(); } }));
    items.push(seg('ctl.switch', [['closed', 'sw.closed'], ['open', 'sw.open']], st.closed ? 'closed' : 'open', (v) => { st.closed = v === 'closed'; updateMeasures(); }));
    items.push(btnRow(createButton({ labelKey: 'ctl.record', variant: 'primary', onClick: () => recordRow(st, recValues(st), true) }), resetBtn(tab)));
    items.push(hintP('hint.recCtl'));
  } else if (tab === 'opposition') {
    items.push(seg('ctl.mode', [['series', 'mode.series'], ['removed', 'mode.removed'], ['reversed', 'mode.reversed']], st.mode, (v) => { st.mode = v; st.fb = null; updateMeasures(); }));
    items.push(btnRow(resetBtn(tab)));
    items.push(hintP('hint.oppCtl'));
  }
  controlsBody.append(...items);
  ui.dl = el('dl', { class: 'meas' });
  ui.status = el('div', { class: 'status', hidden: '' });
  ui.tables = el('div');
  ui.clear = createButton({ labelKey: 'ctl.clearTable', variant: 'ghost', onClick: () => { const s = cur(); s.rows = []; s.calc = {}; s.fb = null; ui.sig = null; updateMeasures(); } });
  ui.clearRow = el('div', { class: 'btn-row', style: 'margin-top:8px' }, [ui.clear]);
  measuresBody.append(ui.dl, ui.status, ui.tables, ui.clearRow);
}

function answerPole(p) {
  const st = cur();
  st.fb = p === st.gen.pos ? { type: 'good', key: `fb.pole${p}` } : { type: 'bad', key: 'fb.poleWrong' };
  updateMeasures();
}
function recordRow(st, { I, V }, allowZero = false) {
  if (I <= 0 && !(allowZero && st.closed && st.U > 0)) { st.fb = { type: 'warn', key: 'fb.noCurrent' }; updateMeasures(); return; }
  const Ir = Math.round(I * 1000) / 1000, Vr = Math.round(V * 100) / 100;
  if (st.rows.some((r) => r.I === Ir && (Ir > 0 || r.V === Vr))) { st.fb = { type: 'warn', key: 'fb.sameRow' }; updateMeasures(); return; }
  st.rows.push({ I: Ir, V: Vr }); st.rows.sort((a, b) => a.I - b.I || a.V - b.V);
  st.fb = null; ui.sig = null; updateMeasures();
}
function onCheckFor(st) {
  return (res) => {
    st.fb = res === 'invalid' ? { type: 'warn', key: 'calc.invalid' } : res === 'ok' ? { type: 'good', key: 'fb.ok' } : { type: 'bad', key: 'fb.wrong' };
    ui.sig = null; updateMeasures();
  };
}
const cell = (st, key, v, d, tol) => calcCell(st, key, { expected: v, decimals: d, tol: tol ?? Math.max(0.011, Math.abs(v) * 0.01), onCheck: onCheckFor(st) });
const qTable = (st, rows) => el('table', { class: 'data' }, [el('thead', {}, el('tr', {}, [th(t('col.q')), th(t('col.answer'))])),
  el('tbody', {}, rows.map(([k, v, d, tol]) => el('tr', {}, [td(t(`row.${k}`)), cell(st, k, v, d, tol)])))]);
const h3 = (key) => el('h3', { style: 'margin:14px 0 0;font-size:0.95rem' }, t(key));

function updateMeasures() {
  if (!shell || !ui.dl) return;
  const tab = shell.tab, st = cur();
  const rows = [];
  let tableBuilder = null;
  ui.clearRow.hidden = true;
  graphCard.hidden = !(tab === 'generator' || tab === 'receiver');
  if (tab === 'poles') {
    const g = st.gen;
    if (st.tool === 'voltmeter') {
      const v = (st.swap ? -1 : 1) * poleVAB(g);
      rows.push([t('m.needle'), t(v > 0 ? 'needle.right' : 'needle.left')]);
    } else {
      const vBA = (st.swap ? 1 : -1) * poleVAB(g);
      rows.push([t('m.spot'), t(vBA > 0 ? 'spot.up' : 'spot.down')]);
    }
  } else if (tab === 'generator') {
    const { I, V } = genValues(st);
    rows.push(['I', `${num(I * 1000, 0)} mA`], [sub(t('sym.U'), 'PN'), `${num(V, 2)} V`]);
    if (st.rows.length) ui.clearRow.hidden = false;
    tableBuilder = () => genTables(st);
    drawGenGraph(st);
  } else if (tab === 'receiver') {
    const { I, V } = recValues(st);
    rows.push(['I', `${num(I * 1000, 0)} mA`], [sub(t('sym.U'), 'MN'), `${num(V, 2)} V`]);
    if (st.rows.length) ui.clearRow.hidden = false;
    tableBuilder = () => recTables(st);
    drawRecGraph(st);
  } else if (tab === 'opposition') {
    const v = oppValues(st);
    rows.push(['I', `${num(v.I, 3)} A`], [t('m.lamp'), t(v.P > 0.6 * P_FULL ? 'lamp.normal' : v.P > 0.25 * P_FULL ? 'lamp.less' : 'lamp.hardly')]);
    if (v.V3 != null) rows.push([t('m.G3'), t(st.mode === 'reversed' ? 'g3.receiver' : 'g3.generator')]);
    tableBuilder = () => oppTables(st);
  }
  ui.dl.replaceChildren(...rows.flatMap(([k, val]) => [el('dt', {}, k), el('dd', {}, val)]));
  if (!st.fb) ui.status.hidden = true;
  else { ui.status.hidden = false; ui.status.className = `status ${st.fb.type || ''}`; ui.status.textContent = t(st.fb.key); }
  if (tableBuilder) {
    const sig = JSON.stringify([tab, st.gen, st.rec, st.rows?.length]) + calcSig([st, ...(st.rows || [])]);
    if (sig !== ui.sig) { ui.sig = sig; ui.tables.replaceChildren(...tableBuilder()); }
  } else { ui.sig = null; ui.tables.replaceChildren(); }
}

function dataTable(st, symName) {
  if (!st.rows.length) return el('p', { class: 'muted', style: 'margin:8px 0 0;font-size:0.88rem' }, t('tbl.empty'));
  return el('div', { class: 'table-scroll' }, el('table', { class: 'data' }, [
    el('thead', {}, el('tr', {}, [th('I (A)'), th(el('span', { class: 'keep-case' }, [t('sym.U'), el('sub', {}, symName), ' (V)']))])),
    el('tbody', {}, st.rows.map((r) => el('tr', {}, [td(num(r.I, 3)), td(num(r.V, 2))])))]));
}
function genTables(st) {
  const G = GENS[st.gen];
  const out = [dataTable(st, 'PN')];
  if (st.rows.length >= 3) {
    out.push(h3('tbl.genFind'));
    out.push(qTable(st, [['E', G.E, 2, 0.06], ['r', G.r, 2, Math.max(0.1, G.r * 0.08)]]));
  }
  out.push(h3('tbl.book'));
  out.push(qTable(st, [['p1', 0.2, 2], ['p2', 5.8, 2], ['p5E', 6, 1], ['p5r', 1, 1]]));
  return out;
}
function recTables(st) {
  const R = RECS[st.rec];
  const out = [dataTable(st, 'MN')];
  if (st.rows.filter((r) => r.I > 0).length >= 3) {
    out.push(h3('tbl.recFind'));
    out.push(qTable(st, [['e', R.e, 2, 0.1], ['rr', R.r, 2, Math.max(0.2, R.r * 0.08)]]));
  }
  out.push(h3('tbl.book'));
  out.push(qTable(st, [['p3', 75, 0], ['p4a', 10, 0], ['p4b', 15, 0], ['p9r', P9.r, 1, 0.3], ['p9e', P9.e, 2, 0.06]]));
  return out;
}
function oppTables(st) {
  return [qTable(st, [
    ['iSeries', 3 * BAT.E / (3 * BAT.r + R_LAMP), 3, 0.004],
    ['iRev', BAT.E / (3 * BAT.r + R_LAMP), 3, 0.002],
    ['v3Rev', BAT.E + BAT.r * BAT.E / (3 * BAT.r + R_LAMP), 2, 0.02],
  ]), h3('tbl.book'), qTable(st, [['p8E1', 24, 0], ['p8E2', 12, 0]])];
}
// Problem 9: best line through the book's points
const P9 = (() => {
  const pts = [[0.045, 0.7], [0.09, 0.8], [0.12, 0.85], [0.165, 0.9], [0.22, 1.0]];
  const n = pts.length, sx = pts.reduce((a, p) => a + p[0], 0), sy = pts.reduce((a, p) => a + p[1], 0);
  const sxx = pts.reduce((a, p) => a + p[0] * p[0], 0), sxy = pts.reduce((a, p) => a + p[0] * p[1], 0);
  const r = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  return { r, e: (sy - r * sx) / n };
})();

function drawGenGraph(st) {
  const G = GENS[st.gen];
  const ok = st.calc?.E?.ok && st.calc?.r?.ok;
  graph.draw({
    xLabel: 'I (A)', yLabel: `${t('sym.U')}PN (V)`, xMax: 0.7, yMax: st.gen === 'flat' ? 5 : 2,
    series: [{ color: cssVar('--accent'), points: st.rows.map((r) => [r.I, r.V]), slope: ok ? -G.r : undefined, intercept: G.E }],
  });
}
function drawRecGraph(st) {
  const R = RECS[st.rec];
  const ok = st.calc?.e?.ok && st.calc?.rr?.ok;
  graph.draw({
    xLabel: 'I (A)', yLabel: `${t('sym.U')}MN (V)`, xMax: 0.8, yMax: 6,
    series: [{ color: cssVar('--accent'), points: st.rows.map((r) => [r.I, r.V]), slope: ok ? R.r : undefined, intercept: R.e }],
  });
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
  initialTab: 'poles',
  onTab: buildTab,
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, get tab() { return shell.tab; }, genValues, recValues, oppValues, P9 };
