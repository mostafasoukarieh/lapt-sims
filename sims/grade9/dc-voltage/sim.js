// Grade 9 — Measuring a DC voltage and a current (Ch.5 Act. 1–5 + experimental activity)
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num, parseNum } from '../../../shared/format.js';
import { createButton, createSegmented, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, font } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { calcCell, calcSig, calcDone, matches } from '../../../shared/calc-cell.js';
import {
  drawLamp, drawSwitch, drawCurrentArrows, labelI, arrowHead, drawMeterBox, drawLead, METER_HALF as MH,
  symLamp, symMeter, symCell, symSwitch,
} from '../../../shared/circuit-draw.js';
import { drawMultimeter, meterLead, reading } from '../../../shared/multimeter-draw.js';
import { drawScope, SV_LIST, VB_LIST, DIV_Y, traceLength, svText, vbText } from '../../../shared/oscilloscope.js';

/* ================================================================
   Model — values from the book's photos (pages 60–64)
   ================================================================ */
// 6 V dry cell: 6.34 V (Fig. 1b). Owner (2 Nov 2026): its voltage stays 6.34 V whether a current passes
// or not (no internal resistance), as in Grade 7, so the laws of circuits appear exactly.
const E = 6.34; // V
const R_INT = 0; // Ω
const I_SERIES = 0.0316, U1_S = 2.81, U2_S = 3.53; // series (book: 31.6 mA); U1 + U2 = 6.34 V
const R1_S = U1_S / I_SERIES, R2_S = U2_S / I_SERIES; // lamps L1 (3.5 V, 30 mA) and L2 (6 V, 60 mA) in series
// Parallel (Fig. 5a–5b): I1 = 41.3 mA, I2 = 44.1 mA → I = 85.4 mA (book photos: 41.3, 44.1, 84.8)
const I1_P = 0.0413, I2_P = 0.0441;
const R1_P = E / I1_P, R2_P = E / I2_P;
const LAMP_I = [0.030, 0.060]; // rated currents of L1 and L2
// Activity 2: lamp + switch + ammeter → 0.43 A (Fig. 2d)
const I_ACT2 = 0.430;
// Owner (2 Nov 2026): a multimeter reads best on the most convenient range (the smallest range larger than
// the value); on a larger range it shows a slightly different value (here + 1 %, e.g. 6.4 V on 200 V).
const COARSE_ERROR = 1.01;

// Multimeter ranges (as on the book's meter: inputs 10A, A, COM, V)
const RANGES = {
  off: { kind: null, angle: -90 },
  v600: { kind: 'V', max: 600, dec: 0, k: 1, unit: 'V', jack: 'V', label: '600', angle: -128 },
  v200: { kind: 'V', max: 199.9, dec: 1, k: 1, unit: 'V', jack: 'V', label: '200', angle: -156 },
  v20: { kind: 'V', max: 19.99, dec: 2, k: 1, unit: 'V', jack: 'V', label: '20', angle: 172 },
  v2: { kind: 'V', max: 1.999, dec: 3, k: 1, unit: 'V', jack: 'V', label: '2', angle: 144 },
  mv200: { kind: 'V', max: 199.9, dec: 1, k: 1000, unit: 'mV', jack: 'V', label: '200m', angle: 116 },
  a10: { kind: 'A', max: 9.99, dec: 2, k: 1, unit: 'A', jack: '10A', label: '10A', angle: -52 },
  ma200: { kind: 'A', max: 199.9, dec: 1, k: 1000, unit: 'mA', jack: 'A', label: '200m', angle: -22 },
  ma20: { kind: 'A', max: 19.99, dec: 2, k: 1000, unit: 'mA', jack: 'A', label: '20m', angle: 8 },
};
const DIAL_ORDER = ['off', 'v600', 'v200', 'v20', 'v2', 'mv200', 'a10', 'ma200', 'ma20'];
const JACKS = [{ name: '10A' }, { name: 'A' }, { name: 'COM' }, { name: 'V' }];

function initialState(tab) {
  switch (tab) {
    case 'voltmeter': return { jack: 'V', range: 'v600', reversed: false, rows: [], fb: null };
    case 'ammeter': return { jack: '10A', range: 'a10', sw: 'open', reversed: false, rows: [], fb: null };
    case 'scope': return {
      mode: 'exp', sv: 2, vb: 0.002, coupling: 'dc', reversed: false, voltmeter: false, rows: [], fb: null,
      test: null, score: { ok: 0, n: 0 },
    };
    default: return { mode: 'current', sw: 'open', lamps: [true, true], rows: [], fb: null };
  }
}
const TABS = ['voltmeter', 'ammeter', 'scope', 'series', 'parallel'];
let S = Object.fromEntries(TABS.map((k) => [k, initialState(k)]));

// Most convenient range for a value: the smallest range of the same kind and input that can show it.
function bestRange(kind, jack, value) {
  const ok = DIAL_ORDER.filter((id) => RANGES[id].kind === kind && RANGES[id].jack === jack && Math.abs(value * RANGES[id].k) <= RANGES[id].max);
  return ok.sort((a, b) => RANGES[a].max / RANGES[a].k - RANGES[b].max / RANGES[b].k)[0];
}
function meterValue(rangeId, value) {
  const R = RANGES[rangeId];
  if (!R.kind || value === 0) return value;
  const best = bestRange(R.kind, R.jack, value);
  return best && best !== rangeId ? value * COARSE_ERROR : value;
}
function evalVoltmeter(st) {
  const voltage = (st.reversed ? -1 : 1) * E;
  const r = reading(RANGES[st.range], RANGES[st.range].kind === 'V' ? meterValue(st.range, voltage) : 0, st.jack);
  return { voltage, r, range: RANGES[st.range], I: 0 };
}
function evalAmmeter(st) {
  const lowR = st.jack !== 'V'; // 10A and A inputs: very small resistance
  const closed = st.sw === 'closed';
  const I = closed && lowR ? I_ACT2 : 0;
  const s = st.reversed ? -1 : 1;
  const voltage = !lowR && closed ? s * E : 0; // a voltmeter in series: almost no current, the whole voltage across it
  const R = RANGES[st.range];
  const r = reading(R, meterValue(st.range, R.kind === 'A' ? s * I : voltage), st.jack);
  return { I, r, range: R, glow: Math.min(1.2, (I / I_ACT2) ** 2), voltSeries: !lowR && closed };
}
function evalScope(st) {
  const test = st.mode === 'test' && st.test;
  const sv = test ? st.test.sv : st.sv;
  let U = 0;
  if (test) U = st.test.y * st.test.sv;
  else if (st.coupling === 'dc') U = (st.reversed ? -1 : 1) * E;
  const level = U / sv;
  const vb = test ? 0.002 : st.vb;
  const tr = traceLength(vb);
  return { U, sv, vb, level, off: Math.abs(level) > DIV_Y / 2 + 0.02, ...tr, I: 0 };
}
function evalSeries(st) {
  const gaps = (st.sw === 'open' ? 1 : 0) + st.lamps.filter((x) => !x).length;
  let I = 0, U1 = 0, U2 = 0, U = 0;
  if (gaps === 0) {
    I = E / (R_INT + R1_S + R2_S);
    U1 = R1_S * I; U2 = R2_S * I; U = U1 + U2;
  } else if (gaps === 1 && st.sw === 'closed') {
    // a removed lamp is the only gap: the whole voltage of the dry cell is across its socket
    if (!st.lamps[0]) U1 = E;
    if (!st.lamps[1]) U2 = E;
    U = E;
  }
  return { I, I1: I, I2: I, U1, U2, U, Ucell: E - R_INT * I, glow: [0, 1].map((k) => (st.lamps[k] ? Math.min(1.4, (I / LAMP_I[k]) ** 2) : 0)) };
}
function evalParallel(st) {
  let I = 0, I1 = 0, I2 = 0, U = E, Ul = 0;
  if (st.sw === 'closed') {
    const G = (st.lamps[0] ? 1 / R1_P : 0) + (st.lamps[1] ? 1 / R2_P : 0);
    if (G === 0) Ul = E;
    else {
      I = E / (R_INT + 1 / G);
      U = E - R_INT * I;
      Ul = U;
      I1 = st.lamps[0] ? U / R1_P : 0;
      I2 = st.lamps[1] ? U / R2_P : 0;
    }
  }
  const glow = [Math.min(1.4, (I1 / LAMP_I[0]) ** 2), Math.min(1.4, (I2 / LAMP_I[1]) ** 2)];
  return { I, I1, I2, U, U1: Ul, U2: Ul, glow };
}
const EVAL = { voltmeter: evalVoltmeter, ammeter: evalAmmeter, scope: evalScope, series: evalSeries, parallel: evalParallel };
const evaluate = (tab, st) => EVAL[tab](st);

// Readings of the ready-made meters (series / parallel), in the most convenient ranges
const mA = (v) => num(Math.round(v * 10000) / 10, 1);
const volt = (v) => num(Math.round(v * 100) / 100, 2);
const roundmA = (v) => Math.round(v * 10000) / 10;
const roundV = (v) => Math.round(v * 100) / 100;

/* ================================================================
   Canvas
   ================================================================ */
const HEIGHTS = { voltmeter: 380, ammeter: 380, scope: 356, series: 460, parallel: 500 };
let shell;
const anim = { t: 0, ph: { main: 0, b1: 0, b2: 0 }, spot: 0 };
let hit = { sw: null, lamps: [], dial: [], jacks: [] };
let drawQueued = false;
const canvas = document.getElementById('stage');
const view = setupCanvas(canvas, { width: 600, height: 380, maxHeightVh: () => (window.innerWidth < 880 ? 46 : 74), onResize: () => requestDraw() });
const diag = setupCanvas(document.getElementById('diagram'), { width: 360, height: 220, maxHeightVh: 30, onResize: () => requestDraw() });
function requestDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; draw(); });
}
onThemeChange(() => requestDraw());
const cur = () => S[shell.tab];

function line(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
}
function wireStyle(ctx) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 5;
  ctx.strokeStyle = cssVar('--wire');
}
// Horizontal 6 V dry cell centred at (x, y). Returns its terminals.
function drawCell6(ctx, x, y, plusLeft) {
  const w = 112, h = 56, x0 = x - w / 2;
  ctx.fillStyle = cssVar('--battery');
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, x0, y - h / 2, w, h, 6);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = cssVar('--gold');
  ctx.fillRect(x0 + 8, y + 6, w - 16, 12);
  ctx.fillStyle = '#ffffff';
  ctx.font = font(15, 800);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('6 V', x, y - 9);
  ctx.fillStyle = cssVar('--pan-metal');
  ctx.fillRect(x0 - 6, y - 5, 7, 10);
  ctx.fillRect(x0 + w - 1, y - 5, 7, 10);
  ctx.font = font(18, 800);
  ctx.textBaseline = 'bottom';
  const L = [x0 - 6, y], R = [x0 + w + 6, y];
  ctx.fillStyle = plusLeft ? cssVar('--accent') : cssVar('--text');
  ctx.fillText(plusLeft ? '+' : '−', x0 - 2, y - 14);
  ctx.fillStyle = plusLeft ? cssVar('--text') : cssVar('--accent');
  ctx.fillText(plusLeft ? '−' : '+', x0 + w + 2, y - 14);
  return plusLeft ? { plus: L, minus: R } : { plus: R, minus: L };
}
function tag(ctx, s, x, y, color = cssVar('--text'), size = 14, base = 'middle') {
  ctx.fillStyle = color;
  ctx.font = font(size, 800);
  ctx.textAlign = 'center';
  ctx.textBaseline = base;
  ctx.fillText(s, x, y);
}
function multimeter(ctx, st, e, M) {
  const h = drawMultimeter(ctx, {
    ...M, ranges: RANGES, order: DIAL_ORDER, value: st.range, offLabel: 'OFF', jacks: JACKS,
    text: e.r.text, unit: e.range.kind ? e.range.unit : '', overload: e.r.overload,
  });
  hit.dial = h.dial;
  hit.jacks = h.jackHits;
  return h.jacks;
}

function draw() {
  if (!shell) return;
  const tab = shell.tab;
  const st = cur();
  const e = evaluate(tab, st);
  if (view.height !== HEIGHTS[tab]) view.setLogicalSize(600, HEIGHTS[tab]);
  const ctx = view.begin();
  ctx.fillStyle = cssVar('--board');
  roundRect(ctx, 8, 8, 584, HEIGHTS[tab] - 16, 14);
  ctx.fill();
  hit = { sw: null, lamps: [], dial: [], jacks: [] };
  ({ voltmeter: drawVoltmeterScene, ammeter: drawAmmeterScene, scope: drawScopeScene, series: drawSeries, parallel: drawParallel })[tab](ctx, st, e);
  if (DEBUG) {
    ctx.fillStyle = 'red'; ctx.font = font(10); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(JSON.stringify(e, (k, v) => (typeof v === 'number' ? Number(v.toFixed(4)) : v)).slice(0, 160), 12, 10);
  }
  drawDiagram(tab, st, e);
}

/* ---------- Activity 1: voltmeter across the dry cell ---------- */
const VM = { x: 384, y: 20, w: 196, h: 340 };
function drawVoltmeterScene(ctx, st, e) {
  // the dry cell standing, terminals on top (as in Fig. 1)
  const bx = 96, by = 150, bw = 170, bh = 190;
  ctx.fillStyle = cssVar('--battery');
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, bx, by, bw, bh, 10);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = cssVar('--gold');
  roundRect(ctx, bx + 18, by + 70, bw - 36, 70, 6);
  ctx.fill();
  tag(ctx, '6 V', bx + bw / 2, by + 105, '#1a2333', 30);
  const minus = [bx + 40, by - 8], plus = [bx + bw - 40, by - 8];
  ctx.fillStyle = cssVar('--pan-metal');
  ctx.fillRect(plus[0] - 9, by - 12, 18, 12);
  ctx.fillRect(minus[0] - 9, by - 12, 18, 12);
  tag(ctx, '+', plus[0], by + 22, cssVar('--accent'), 24);
  tag(ctx, '−', minus[0], by + 22, '#ffffff', 24);
  const J = multimeter(ctx, st, e, VM);
  const [redEnd, blackEnd] = st.reversed ? [minus, plus] : [plus, minus];
  const ctrl = (j, end) => [[J[j][0], J[j][1] + 40], [end[0] + (end[0] < 200 ? -40 : 60), end[1] - 110]];
  meterLead(ctx, J[st.jack], redEnd, cssVar('--accent'), ...ctrl(st.jack, redEnd));
  meterLead(ctx, J.COM, blackEnd, cssVar('--lead-black'), ...ctrl('COM', blackEnd));
  tag(ctx, 'COM', blackEnd[0], blackEnd[1] - 22, cssVar('--com-dot'), 12);
}

/* ---------- Activity 2: ammeter in series with a lamp and a switch ---------- */
// The ammeter is inserted in the right-hand wire: the current comes from the + terminal, enters by the red input
// (top end PB) and leaves by COM (bottom end PA) towards the switch, the lamp and the − terminal.
const AM = { CY: 70, BY: 300, XL: 50, XR: 350, CX: 200, LAMP: 118, SWX: 240, PB: [350, 128], PA: [350, 236] };
function drawAmmeterScene(ctx, st, e) {
  const { CY, BY, XL, XR, CX, LAMP, SWX, PB, PA } = AM;
  wireStyle(ctx);
  const N1 = [CX - 62, CY], N2 = [CX + 62, CY];
  line(ctx, [N2, [XR, CY], PB]);
  line(ctx, [PA, [XR, BY], [SWX + 50, BY]]);
  line(ctx, [[SWX - 50, BY], [LAMP + 30, BY]]);
  line(ctx, [[LAMP - 30, BY], [XL, BY], [XL, CY], N1]);
  drawCell6(ctx, CX, CY, false);
  drawLamp(ctx, { x: LAMP, y: BY, glow: e.glow });
  hit.sw = drawSwitch(ctx, { x: SWX, y: BY, open: st.sw === 'open' });
  tag(ctx, 'K', SWX, BY + 26);
  if (e.I > 0) {
    const skip = (x, y) => (Math.abs(y - BY) < 1 && (Math.abs(x - LAMP) < 46 || Math.abs(x - SWX) < 62))
      || (Math.abs(x - XR) < 1 && y > PB[1] - 4 && y < PA[1] + 4);
    drawCurrentArrows(ctx, [N2, [XR, CY], [XR, BY], [XL, BY], [XL, CY], N1], anim.ph.main, skip);
    labelI(ctx, XL + 20, (CY + BY) / 2, -Math.PI / 2);
  }
  const J = multimeter(ctx, st, e, { x: 396, y: 20, w: 190, h: 340 });
  const [redEnd, blackEnd] = st.reversed ? [PA, PB] : [PB, PA];
  meterLead(ctx, J[st.jack], redEnd, cssVar('--accent'), [J[st.jack][0], 372], [redEnd[0] - 40, redEnd[1] + 40]);
  meterLead(ctx, J.COM, blackEnd, cssVar('--lead-black'), [J.COM[0], 372], [blackEnd[0] - 40, blackEnd[1] + 40]);
  tag(ctx, 'COM', blackEnd[0] - 28, blackEnd[1], cssVar('--com-dot'), 12);
}

/* ---------- Activity 3: oscilloscope ---------- */
function drawScopeScene(ctx, st, e) {
  const test = st.mode === 'test';
  const g = drawScope(ctx, {
    x: 16, y: 18, d: 26, level: e.off ? null : e.level, spotX: anim.spot, len: e.len, steady: e.steady,
    svLabel: svText(e.sv), vbLabel: vbText(e.vb), svName: 'Sv', vbName: t('scope.vbName'), gnd: !test && st.coupling === 'gnd',
  });
  if (e.off) {
    tag(ctx, t('scope.offscreen'), g.screen.x + g.screen.w / 2, g.screen.y + (e.level > 0 ? 18 : g.screen.h - 18), '#ffd166', 13);
  }
  const red = cssVar('--accent'), black = cssVar('--lead-black');
  if (test) {
    // an unknown source in a box
    ctx.fillStyle = cssVar('--box');
    roundRect(ctx, 420, 96, 140, 76, 10);
    ctx.fill();
    tag(ctx, '?', 490, 134, '#ffffff', 34);
    drawLead(ctx, g.A, [440, 172], red, [g.A[0] + 40, 230]);
    drawLead(ctx, g.M, [540, 172], black, [g.M[0] + 90, 250]);
    return;
  }
  const c = drawCell6(ctx, 476, 110, true);
  const [toA, toM] = st.reversed ? [c.minus, c.plus] : [c.plus, c.minus];
  drawLead(ctx, g.A, toA, red, [g.A[0] + 20, toA[1] + 150]);
  drawLead(ctx, g.M, toM, black, [g.M[0] + 120, toM[1] + 130]);
  if (st.voltmeter) {
    const v = E; // the voltmeter stays connected with COM on the negative pole
    drawLead(ctx, [476 - MH, 250], c.plus, red, [400, 190]);
    drawLead(ctx, [476 + MH, 250], c.minus, black, [560, 190]);
    drawMeterBox(ctx, { x: 476, y: 250, kind: 'V', name: 'V', text: volt(v), unit: 'V' });
  }
}

/* ---------- Activity 4: series circuit ---------- */
const SR = { TOP: 110, BOT: 330, XL: 50, XR: 560, CX: 230, SWX: 420, LX: [150, 390], AX: [270, 490] };
function drawSeries(ctx, st, e) {
  const { TOP, BOT, XL, XR, CX, SWX, LX, AX } = SR;
  const amm = st.mode === 'current';
  const NP = [CX - 62, TOP], NN = [CX + 62, TOP];
  wireStyle(ctx);
  line(ctx, [NP, [XL, TOP], [XL, BOT], [LX[0] - 30, BOT]]);
  if (amm) {
    line(ctx, [[LX[0] + 30, BOT], [AX[0] - MH, BOT]]);
    line(ctx, [[AX[0] + MH, BOT], [LX[1] - 30, BOT]]);
    line(ctx, [[LX[1] + 30, BOT], [AX[1] - MH, BOT]]);
    line(ctx, [[AX[1] + MH, BOT], [XR, BOT], [XR, TOP], [SWX + 50, TOP]]);
  } else {
    line(ctx, [[LX[0] + 30, BOT], [LX[1] - 30, BOT]]);
    line(ctx, [[LX[1] + 30, BOT], [XR, BOT], [XR, TOP], [SWX + 50, TOP]]);
  }
  line(ctx, [[SWX - 50, TOP], NN]);
  drawCell6(ctx, CX, TOP, true);
  hit.sw = drawSwitch(ctx, { x: SWX, y: TOP, open: st.sw === 'open' });
  tag(ctx, 'K', SWX, TOP + 26);
  for (let k = 0; k < 2; k++) {
    drawLamp(ctx, { x: LX[k], y: BOT, glow: e.glow[k], removed: !st.lamps[k] });
    tag(ctx, `L${k + 1}`, LX[k], BOT + 26);
    hit.lamps.push({ k, x: LX[k] - 44, y: BOT - 100, w: 88, h: 120 });
  }
  if (e.I > 0) {
    const skip = (x, y) => (Math.abs(y - BOT) < 1 && (LX.some((lx) => Math.abs(x - lx) < 40) || (amm && AX.some((ax) => Math.abs(x - ax) < MH + 4))))
      || (Math.abs(y - TOP) < 1 && Math.abs(x - SWX) < 62);
    drawCurrentArrows(ctx, [NP, [XL, TOP], [XL, BOT], [XR, BOT], [XR, TOP], NN], anim.ph.main, skip);
    labelI(ctx, XL + 22, (TOP + BOT) / 2, Math.PI / 2);
    labelI(ctx, XR - 22, (TOP + BOT) / 2, -Math.PI / 2);
  }
  const red = cssVar('--accent'), black = cssVar('--lead-black');
  if (amm) {
    drawMeterBox(ctx, { x: AX[0], y: BOT, kind: 'A', name: 'A1', text: mA(e.I1), unit: 'mA' });
    drawMeterBox(ctx, { x: AX[1], y: BOT, kind: 'A', name: 'A2', text: mA(e.I2), unit: 'mA' });
  } else {
    // V3 across the two lamps together
    const y3 = 222;
    drawLead(ctx, [270 - MH, y3], [LX[0] - 30, BOT - 4], red, [LX[0] - 40, y3 + 30]);
    drawLead(ctx, [270 + MH, y3], [LX[1] + 30, BOT - 4], black, [LX[1] + 50, y3 + 30]);
    drawMeterBox(ctx, { x: 270, y: y3, kind: 'V', name: 'V3', text: volt(e.U), unit: 'V' });
    for (let k = 0; k < 2; k++) {
      const y = 404;
      drawLead(ctx, [LX[k] - MH, y], [LX[k] - 30, BOT + 2], red, [LX[k] - 44, BOT + 40]);
      drawLead(ctx, [LX[k] + MH, y], [LX[k] + 30, BOT + 2], black, [LX[k] + 44, BOT + 40]);
      drawMeterBox(ctx, { x: LX[k], y, kind: 'V', name: `V${k + 1}`, text: volt(k ? e.U2 : e.U1), unit: 'V' });
    }
  }
}

/* ---------- Activity 5: parallel circuit ---------- */
const PR = { TOP: 124, Y: [268, 404], XL: 40, XR: 560, CX: 250, SWX: 440, LX: [200, 330], AX: 460, MAX: 104 };
function drawParallel(ctx, st, e) {
  const { TOP, Y, XL, XR, CX, SWX, LX, AX, MAX } = PR;
  const amm = st.mode === 'current';
  const NP = [CX - 62, TOP], NN = [CX + 62, TOP];
  wireStyle(ctx);
  if (amm) {
    line(ctx, [NP, [MAX + MH, TOP]]);
    line(ctx, [[MAX - MH, TOP], [XL, TOP], [XL, Y[1]], [LX[1] - 30, Y[1]]]);
  } else line(ctx, [NP, [XL, TOP], [XL, Y[1]], [LX[1] - 30, Y[1]]]);
  line(ctx, [[XL, Y[0]], [LX[0] - 30, Y[0]]]);
  for (let k = 0; k < 2; k++) {
    if (amm) {
      line(ctx, [[LX[k] + 30, Y[k]], [AX - MH, Y[k]]]);
      line(ctx, [[AX + MH, Y[k]], [XR, Y[k]]]);
    } else line(ctx, [[LX[k] + 30, Y[k]], [XR, Y[k]]]);
  }
  line(ctx, [[XR, Y[1]], [XR, TOP], [SWX + 50, TOP]]);
  line(ctx, [[SWX - 50, TOP], NN]);
  ctx.fillStyle = cssVar('--wire');
  for (const p of [[XL, Y[0]], [XR, Y[0]]]) { ctx.beginPath(); ctx.arc(p[0], p[1], 6, 0, Math.PI * 2); ctx.fill(); }
  drawCell6(ctx, CX, TOP, true);
  hit.sw = drawSwitch(ctx, { x: SWX, y: TOP, open: st.sw === 'open' });
  tag(ctx, 'K', SWX, TOP + 26);
  for (let k = 0; k < 2; k++) {
    drawLamp(ctx, { x: LX[k], y: Y[k], glow: e.glow[k], removed: !st.lamps[k] });
    tag(ctx, `L${k + 1}`, LX[k] - 54, Y[k] - 38);
    hit.lamps.push({ k, x: LX[k] - 44, y: Y[k] - 100, w: 88, h: 120 });
  }
  const skip = (x, y) => (Math.abs(y - TOP) < 1 && (Math.abs(x - SWX) < 62 || (amm && Math.abs(x - MAX) < MH + 4)))
    || Y.some((yy, k) => Math.abs(y - yy) < 1 && (Math.abs(x - LX[k]) < 40 || (amm && Math.abs(x - AX) < MH + 4)));
  if (e.I > 0) {
    drawCurrentArrows(ctx, [NP, [XL, TOP], [XL, Y[0]]], anim.ph.main, skip);
    drawCurrentArrows(ctx, [[XR, Y[0]], [XR, TOP], NN], anim.ph.main, skip);
    labelI(ctx, XL + 22, (TOP + Y[0]) / 2 + 20, Math.PI / 2);
  }
  if (e.I1 > 0) {
    drawCurrentArrows(ctx, [[XL, Y[0]], [XR, Y[0]]], anim.ph.b1, skip);
    labelI(ctx, (LX[0] + AX) / 2 - 10, Y[0] - 22, 0, 'I1');
  }
  if (e.I2 > 0) {
    drawCurrentArrows(ctx, [[XL, Y[0]], [XL, Y[1]], [XR, Y[1]], [XR, Y[0]]], anim.ph.b2, skip);
    labelI(ctx, (LX[1] + AX) / 2 - 4, Y[1] - 22, 0, 'I2');
  }
  const red = cssVar('--accent'), black = cssVar('--lead-black');
  if (amm) {
    drawMeterBox(ctx, { x: MAX, y: TOP, kind: 'A', name: 'A', text: mA(e.I), unit: 'mA', flip: true });
    for (let k = 0; k < 2; k++) drawMeterBox(ctx, { x: AX, y: Y[k], kind: 'A', name: `A${k + 1}`, text: mA(k ? e.I2 : e.I1), unit: 'mA' });
  } else {
    // V across the dry cell (above it), red on the + terminal
    drawLead(ctx, [CX - MH, 46], NP, red, [CX - 80, 56]);
    drawLead(ctx, [CX + MH, 46], NN, black, [CX + 80, 56]);
    drawMeterBox(ctx, { x: CX, y: 46, kind: 'V', name: 'V', text: volt(e.U), unit: 'V' });
    for (let k = 0; k < 2; k++) {
      const y = Y[k] + 52;
      drawLead(ctx, [LX[k] - MH, y], [LX[k] - 30, Y[k] + 2], red, [LX[k] - 44, Y[k] + 24]);
      drawLead(ctx, [LX[k] + MH, y], [LX[k] + 30, Y[k] + 2], black, [LX[k] + 44, Y[k] + 24]);
      drawMeterBox(ctx, { x: LX[k], y, kind: 'V', name: `V${k + 1}`, text: volt(k ? e.U2 : e.U1), unit: 'V' });
    }
  }
}

/* ---------- Diagrams (book symbols) ---------- */
function drawDiagram(tab, st, e) {
  const ctx = diag.begin();
  const ink = cssVar('--text');
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  const com = (x, y, dx, dy) => {
    ctx.fillStyle = cssVar('--com-dot');
    ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill();
    label(ctx, 'COM', x + dx, y + dy, cssVar('--com-dot'), 11);
    ctx.fillStyle = ink;
  };
  if (tab === 'voltmeter') {
    const cx = 180, y = 130;
    symCell(ctx, cx, y, true);
    ctx.beginPath();
    ctx.moveTo(cx - 5, y); ctx.lineTo(100, y); ctx.lineTo(100, 60); ctx.lineTo(cx - 14, 60);
    ctx.moveTo(cx + 5, y); ctx.lineTo(260, y); ctx.lineTo(260, 60); ctx.lineTo(cx + 14, 60);
    ctx.stroke();
    symMeter(ctx, cx, 60, 'V');
    if (st.reversed) com(cx + 14, 60, 30, -12); else com(cx - 14, 60, -30, -12);
    label(ctx, 'P', 268, y + 18, ink); label(ctx, 'N', 92, y + 18, ink);
  } else if (tab === 'ammeter') {
    const L = 50, R = 310, T = 50, B = 160, cx = 180;
    symCell(ctx, cx, T, true);
    ctx.beginPath();
    ctx.moveTo(cx + 5, T); ctx.lineTo(R, T); ctx.lineTo(R, 91); ctx.moveTo(R, 119); ctx.lineTo(R, B); ctx.lineTo(195, B);
    ctx.moveTo(165, B); ctx.lineTo(L, B); ctx.lineTo(L, 124); ctx.moveTo(L, 88); ctx.lineTo(L, T); ctx.lineTo(cx - 5, T);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(L, 88, 3, 0, Math.PI * 2); ctx.arc(L, 124, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(L, 124); ctx.lineTo(st.sw === 'open' ? L + 14 : L, st.sw === 'open' ? 92 : 88); ctx.stroke();
    label(ctx, 'K', L - 16, 106, ink);
    symLamp(ctx, 180, B, e.glow > 0.05);
    symMeter(ctx, R, 105, st.jack === 'V' ? 'V' : 'A');
    if (st.reversed) com(R, 91, 30, -6); else com(R, 119, 30, 6);
    if (e.I > 0) { ctx.fillStyle = cssVar('--current'); arrowHead(ctx, R, 145, Math.PI / 2); label(ctx, 'I', R - 14, 145); }
  } else if (tab === 'scope') {
    const cx = 120, y = 120;
    symCell(ctx, cx, y, true);
    ctx.strokeRect(220, 60, 110, 100);
    label(ctx, t('diag.scope'), 275, 80, ink, 11);
    ctx.beginPath(); ctx.arc(240, 140, 4, 0, Math.PI * 2); ctx.arc(310, 140, 4, 0, Math.PI * 2); ctx.fill();
    label(ctx, 'A', 240, 124, ink); label(ctx, 'M', 310, 124, ink);
    const [a, m] = st.reversed ? [cx - 5, cx + 5] : [cx + 5, cx - 5];
    ctx.beginPath();
    ctx.moveTo(a, y); ctx.lineTo(a < cx ? 60 : 180, y); ctx.lineTo(a < cx ? 60 : 180, 190); ctx.lineTo(240, 190); ctx.lineTo(240, 140);
    ctx.moveTo(m, y); ctx.lineTo(m < cx ? 60 : 180, y); ctx.lineTo(m < cx ? 60 : 180, 40); ctx.lineTo(310, 40); ctx.lineTo(310, 140);
    ctx.stroke();
  } else if (tab === 'series') {
    const L = 40, R = 320, T = 56, B = 150, cx = 150, amm = st.mode === 'current';
    const LXd = [90, 210], AXd = [150, 270];
    symCell(ctx, cx, T, false);
    symSwitch(ctx, 232, 268, T, st.sw === 'open');
    label(ctx, 'K', 250, T + 16, ink);
    ctx.beginPath();
    ctx.moveTo(cx - 5, T); ctx.lineTo(L, T); ctx.lineTo(L, B); ctx.lineTo(LXd[0] - 15, B);
    ctx.moveTo(cx + 5, T); ctx.lineTo(232, T);
    ctx.moveTo(268, T); ctx.lineTo(R, T); ctx.lineTo(R, B);
    const xs = amm ? [LXd[0], AXd[0], LXd[1], AXd[1]] : [LXd[0], LXd[1]];
    const rs = amm ? [15, 14, 15, 14] : [15, 15];
    for (let i = 0; i < xs.length; i++) {
      const next = i + 1 < xs.length ? xs[i + 1] - rs[i + 1] : R;
      ctx.moveTo(xs[i] + rs[i], B); ctx.lineTo(next, B);
    }
    ctx.stroke();
    for (let k = 0; k < 2; k++) diagLamp(ctx, LXd[k], B, st.lamps[k], e.glow[k] > 0.05, `L${k + 1}`, 0, amm ? 26 : -26);
    if (amm) {
      for (let k = 0; k < 2; k++) { symMeter(ctx, AXd[k], B, 'A'); sub(ctx, AXd[k], B, String(k + 1)); com(AXd[k] + 14, B, 10, -14); }
    } else {
      ctx.beginPath();
      for (const x of LXd) {
        ctx.moveTo(x - 26, B); ctx.lineTo(x - 26, B + 42); ctx.lineTo(x - 14, B + 42);
        ctx.moveTo(x + 14, B + 42); ctx.lineTo(x + 26, B + 42); ctx.lineTo(x + 26, B);
      }
      ctx.moveTo(LXd[0] - 34, B); ctx.lineTo(LXd[0] - 34, 200); ctx.lineTo(136, 200);
      ctx.moveTo(164, 200); ctx.lineTo(LXd[1] + 34, 200); ctx.lineTo(LXd[1] + 34, B);
      ctx.stroke();
      symMeter(ctx, LXd[0], B + 42, 'V'); sub(ctx, LXd[0], B + 42, '1');
      symMeter(ctx, LXd[1], B + 42, 'V'); sub(ctx, LXd[1], B + 42, '2');
      symMeter(ctx, 150, 200, 'V'); sub(ctx, 150, 200, '3');
    }
    if (e.I > 0) { ctx.fillStyle = cssVar('--current'); arrowHead(ctx, L, 103, Math.PI / 2); label(ctx, 'I', L + 14, 103); }
  } else {
    const L = 40, R = 320, T = 46, Y = [118, 190], cx = 170, amm = st.mode === 'current';
    const LXd = 130, AXd = 240, MA = 90;
    symCell(ctx, cx, T, false);
    symSwitch(ctx, 240, 276, T, st.sw === 'open');
    label(ctx, 'K', 258, T + 16, ink);
    ctx.beginPath();
    if (amm) { ctx.moveTo(cx - 5, T); ctx.lineTo(MA + 14, T); ctx.moveTo(MA - 14, T); ctx.lineTo(L, T); }
    else { ctx.moveTo(cx - 5, T); ctx.lineTo(L, T); }
    ctx.lineTo(L, Y[1]);
    ctx.moveTo(cx + 5, T); ctx.lineTo(240, T);
    ctx.moveTo(276, T); ctx.lineTo(R, T); ctx.lineTo(R, Y[1]);
    for (let k = 0; k < 2; k++) {
      ctx.moveTo(L, Y[k]); ctx.lineTo(LXd - 15, Y[k]);
      if (amm) { ctx.moveTo(LXd + 15, Y[k]); ctx.lineTo(AXd - 14, Y[k]); ctx.moveTo(AXd + 14, Y[k]); ctx.lineTo(R, Y[k]); }
      else { ctx.moveTo(LXd + 15, Y[k]); ctx.lineTo(R, Y[k]); }
    }
    ctx.stroke();
    dot(ctx, L, Y[0]); dot(ctx, R, Y[0]);
    for (let k = 0; k < 2; k++) diagLamp(ctx, LXd, Y[k], st.lamps[k], e.glow[k] > 0.05, `L${k + 1}`, amm ? 0 : -46, amm ? 25 : -10);
    if (amm) {
      symMeter(ctx, MA, T, 'A'); com(MA - 14, T, -6, 14);
      for (let k = 0; k < 2; k++) { symMeter(ctx, AXd, Y[k], 'A'); sub(ctx, AXd, Y[k], String(k + 1)); com(AXd + 14, Y[k], 10, -14); }
    } else {
      ctx.beginPath();
      for (let k = 0; k < 2; k++) {
        const y = Y[k] - 34;
        ctx.moveTo(LXd - 30, Y[k]); ctx.lineTo(LXd - 30, y); ctx.lineTo(LXd - 14, y);
        ctx.moveTo(LXd + 14, y); ctx.lineTo(LXd + 30, y); ctx.lineTo(LXd + 30, Y[k]);
      }
      ctx.moveTo(cx - 24, T); ctx.lineTo(cx - 24, 14); ctx.lineTo(cx - 14, 14);
      ctx.moveTo(cx + 14, 14); ctx.lineTo(cx + 24, 14); ctx.lineTo(cx + 24, T);
      ctx.stroke();
      for (let k = 0; k < 2; k++) { symMeter(ctx, LXd, Y[k] - 34, 'V'); sub(ctx, LXd, Y[k] - 34, String(k + 1)); }
      symMeter(ctx, cx, 14, 'V');
    }
    ctx.fillStyle = cssVar('--current');
    if (e.I > 0) { arrowHead(ctx, L, (T + Y[0]) / 2, Math.PI / 2); label(ctx, 'I', L + 12, (T + Y[0]) / 2); }
    if (e.I1 > 0) { arrowHead(ctx, 296, Y[0], 0); label(ctx, 'I1', 296, Y[0] - 12); }
    if (e.I2 > 0) { arrowHead(ctx, 296, Y[1], 0); label(ctx, 'I2', 296, Y[1] - 12); }
  }
}
function diagLamp(ctx, x, y, present, glowing, name, lx, ly) {
  if (present) symLamp(ctx, x, y, glowing);
  else {
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.arc(x, y, 15, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }
  label(ctx, name, x + lx, y + ly, cssVar('--text'));
}
function sub(ctx, x, y, s) { label(ctx, s, x + 19, y + 12, cssVar('--text'), 11); }
function dot(ctx, x, y) { ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill(); }
function label(ctx, s, x, y, color, size = 13) {
  if (color) ctx.fillStyle = color;
  ctx.font = font(size, 800);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}

/* ================================================================
   Animation: current arrows, and the spot of the oscilloscope
   ================================================================ */
const SPEED = 300; // px/s per ampere (series / parallel)
const loop = createLoop({
  dt: 1 / 60,
  step(dt) {
    if (!shell) return false;
    const tab = shell.tab;
    const e = evaluate(tab, cur());
    anim.t += dt;
    if (tab === 'scope') {
      anim.spot = (anim.spot + dt / e.vb) % 10;
      return !e.steady;
    }
    const speed = tab === 'ammeter' ? 120 : SPEED * 20;
    anim.ph.main += speed * e.I * dt;
    anim.ph.b1 += speed * (e.I1 || 0) * dt;
    anim.ph.b2 += speed * (e.I2 || 0) * dt;
    return e.I > 0;
  },
  render: () => draw(),
});
function needsLoop(tab, e) { return tab === 'scope' ? !e.steady : e.I > 0; }

/* ================================================================
   State changes
   ================================================================ */
function change(fn) {
  const tab = shell.tab;
  const st = cur();
  const before = { jack: st.jack };
  fn(st);
  // An ammeter (10A or A input) is never connected across the dry cell: it would be a short circuit.
  if (tab === 'voltmeter' && st.jack !== 'V') {
    st.jack = before.jack;
    st.fb = { type: 'bad', key: 'fb.noAmmCell' };
  } else st.fb = null;
  refresh();
}
function refresh() {
  updateMeasures();
  const tab = shell?.tab;
  if (tab && needsLoop(tab, evaluate(tab, cur()))) loop.start(); else loop.stop();
  requestDraw();
}

canvas.addEventListener('pointerdown', (ev) => {
  const p = view.toLogical(ev);
  const near = (h) => Math.hypot(p.x - h.x, p.y - h.y) < h.r;
  const inside = (r) => r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  const d = hit.dial.find(near);
  if (d) { change((st) => { st.range = d.id; }); ev.preventDefault(); return; }
  const j = hit.jacks.find(near);
  if (j) { change((st) => { st.jack = j.name; }); ev.preventDefault(); return; }
  const lamp = hit.lamps.find(inside);
  if (lamp) { change((st) => { st.lamps[lamp.k] = !st.lamps[lamp.k]; }); ev.preventDefault(); return; }
  if (inside(hit.sw)) { change((st) => { st.sw = st.sw === 'open' ? 'closed' : 'open'; }); ev.preventDefault(); }
});

/* ================================================================
   Panels
   ================================================================ */
const controlsBody = document.getElementById('controls-body');
const measuresBody = document.getElementById('measures-body');
let ui = {};
function showStatus(box, fb) {
  if (!fb) { box.hidden = true; return; }
  box.hidden = false;
  box.className = `status ${fb.type || ''}`;
  box.textContent = t(fb.key, fb.params);
}
function measRows(dl, rows) {
  dl.replaceChildren(...rows.flatMap(([k, v, cls]) => [el('dt', {}, k), el('dd', cls ? { class: cls } : {}, v)]));
}
function seg(labelKey, options, value, onChange) {
  return createSegmented({ labelKey, options: options.map(([v, k]) => ({ value: String(v), labelKey: k })), value: String(value), onChange });
}
const btnRow = (...b) => el('div', { class: 'btn-row', style: 'margin-top:8px' }, b);
const hint = (key) => el('p', { class: 'muted', style: 'margin:8px 0 0;font-size:0.88rem', dataset: { i18n: key } }, t(key));

function meterText(e) {
  if (!e.range.kind) return t('m.blank');
  if (e.r.overload) return t('m.overload');
  return `${e.r.text} ${e.range.unit}`;
}
function meterAdvice(tab, st, e) {
  if (!e.range.kind) return { type: 'warn', key: 'fb.off' };
  if (!e.r.match) return { type: 'warn', key: `fb.jack.${e.range.jack}` };
  if (e.r.overload) return { type: 'warn', key: 'fb.overload' };
  if (tab === 'ammeter' && e.voltSeries) return { type: 'warn', key: 'fb.voltSeries' };
  if (e.r.value < -1e-9) return { type: 'warn', key: 'fb.negative' };
  if (tab === 'ammeter' && st.sw === 'open') return { type: '', key: 'fb.closeK' };
  // most convenient range: the smallest range that does not show 1
  const kind = e.range.kind;
  const better = DIAL_ORDER.filter((id) => RANGES[id].kind === kind && RANGES[id].jack === e.range.jack
    && RANGES[id].max < e.range.max && Math.abs(e.r.value / e.range.k * RANGES[id].k) <= RANGES[id].max);
  if (better.length) return { type: 'warn', key: 'fb.better' };
  return { type: 'good', key: 'fb.best' };
}

function buildMeterControls(tab, st) {
  ui.jack = seg('ctl.input', [['10A', 'jack.10A'], ['A', 'jack.A'], ['V', 'jack.V']], st.jack, (v) => change((s) => { s.jack = v; }));
  ui.range = seg('ctl.range', DIAL_ORDER.map((id) => [id, `range.${id}`]), st.range, (v) => change((s) => { s.range = v; }));
  const items = [ui.jack.root, ui.range.root];
  if (tab === 'ammeter') {
    ui.sw = seg('ctl.switch', [['open', 'ctl.open'], ['closed', 'ctl.closed']], st.sw, (v) => change((s) => { s.sw = v; }));
    items.push(ui.sw.root);
  }
  const record = () => {
    const s = cur();
    const e = evaluate(tab, s);
    if (!e.range.kind || !e.r.match) { s.fb = { type: 'warn', key: 'fb.nothing' }; updateMeasures(); return; }
    const r = meterText(e);
    s.rows.push({ range: s.range, sw: s.sw, r });
    if (s.rows.length > 8) s.rows.shift();
    s.fb = { type: 'good', key: 'fb.recorded', params: { r } };
    updateMeasures();
  };
  items.push(
    btnRow(createButton({ labelKey: 'ctl.reverse', onClick: () => change((s) => { s.reversed = !s.reversed; }) }),
      createButton({ labelKey: 'ctl.record', onClick: record, variant: 'primary' })),
    btnRow(createButton({ labelKey: 'ui.reset', onClick: resetTab, variant: 'ghost' })),
    hint('hint.tapMeter'),
  );
  controlsBody.append(...items);
}

function newTest(st) {
  const sv = [1, 2, 5, 10][Math.floor(Math.random() * 4)];
  let y;
  do { y = (3 + Math.floor(Math.random() * 17)) * 0.2 * (Math.random() < 0.25 ? -1 : 1); } while (st.test && Math.abs(y - st.test.y) < 1e-9);
  st.test = { sv, y: Math.round(y * 10) / 10, draft: '', result: null };
}
function buildScopeControls(st) {
  ui.mode = seg('ctl.mode', [['exp', 'mode.exp'], ['test', 'mode.test']], st.mode, (v) => change((s) => {
    s.mode = v;
    if (v === 'test' && !s.test) newTest(s);
    buildTab();
  }));
  const items = [ui.mode.root];
  if (st.mode === 'exp') {
    ui.sv = seg('ctl.sv', SV_LIST.map((v) => [v, `sv.${v}`]), st.sv, (v) => change((s) => { s.sv = Number(v); }));
    ui.vb = seg('ctl.vb', VB_LIST.map((v) => [v, `vb.${v}`]), st.vb, (v) => change((s) => { s.vb = Number(v); }));
    ui.coupling = seg('ctl.coupling', [['dc', 'coupling.dc'], ['gnd', 'coupling.gnd']], st.coupling, (v) => change((s) => { s.coupling = v; }));
    ui.vm = seg('ctl.voltmeter', [['no', 'ctl.no'], ['yes', 'ctl.yes']], st.voltmeter ? 'yes' : 'no', (v) => change((s) => { s.voltmeter = v === 'yes'; }));
    const record = () => {
      const s = cur();
      const e = evaluate('scope', s);
      if (s.coupling === 'gnd') { s.fb = { type: 'warn', key: 'fb.gndRecord' }; updateMeasures(); return; }
      if (e.off) { s.fb = { type: 'warn', key: 'fb.offRecord' }; updateMeasures(); return; }
      s.rows.push({ sv: s.sv, vb: s.vb, y: e.level });
      if (s.rows.length > 8) s.rows.shift();
      s.fb = { type: 'good', key: 'fb.scopeRecorded' };
      updateMeasures();
    };
    items.push(ui.sv.root, ui.vb.root, ui.coupling.root, ui.vm.root,
      btnRow(createButton({ labelKey: 'ctl.reverseCell', onClick: () => change((s) => { s.reversed = !s.reversed; }) }),
        createButton({ labelKey: 'ctl.recordScope', onClick: record, variant: 'primary' })),
      btnRow(createButton({ labelKey: 'ui.reset', onClick: resetTab, variant: 'ghost' })));
  } else {
    if (!st.test) newTest(st);
    ui.testInfo = el('p', { class: 'keep-case', style: 'margin:8px 0' });
    ui.testInput = el('input', { class: 'text-input', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '?', 'aria-label': t('test.aria') });
    ui.testInput.value = st.test.draft;
    ui.testInput.addEventListener('input', () => { cur().test.draft = ui.testInput.value; });
    const check = () => {
      const s = cur();
      const x = parseNum(ui.testInput.value);
      if (!Number.isFinite(x)) { s.fb = { type: 'warn', key: 'calc.invalid' }; updateMeasures(); return; }
      if (s.test.result === 'ok') return;
      const ok = Math.abs(x - s.test.y * s.test.sv) <= s.test.sv * 0.1 + 1e-9;
      s.score.n += 1; if (ok) s.score.ok += 1;
      s.test.result = ok ? 'ok' : 'wrong';
      s.fb = ok ? { type: 'good', key: 'fb.testOk', params: { u: num(s.test.y * s.test.sv, 1), y: num(s.test.y, 1), sv: num(s.test.sv, 0) } }
        : { type: 'bad', key: 'fb.testWrong' };
      updateMeasures();
    };
    ui.testInput.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') check(); });
    items.push(ui.testInfo,
      el('div', { class: 'calc-cell' }, [ui.testInput, el('span', {}, 'V'), createButton({ labelKey: 'calc.check', variant: 'primary', onClick: check })]),
      btnRow(createButton({ labelKey: 'ctl.newScreen', onClick: () => { const s = cur(); newTest(s); s.fb = null; buildTab(); } }),
        createButton({ labelKey: 'ui.reset', onClick: resetTab, variant: 'ghost' })));
  }
  controlsBody.append(...items);
}

function buildCircuitControls(tab, st) {
  ui.mode = seg('ctl.measure', [['current', 'mode.current'], ['voltage', 'mode.voltage']], st.mode, (v) => change((s) => { s.mode = v; }));
  ui.sw = seg('ctl.switch', [['open', 'ctl.open'], ['closed', 'ctl.closed']], st.sw, (v) => change((s) => { s.sw = v; }));
  ui.lamps = [0, 1].map((k) => seg(`ctl.lamp${k + 1}`, [['in', 'lamp.in'], ['out', 'lamp.out']], st.lamps[k] ? 'in' : 'out', (v) => change((s) => { s.lamps[k] = v === 'in'; })));
  const record = () => {
    const s = cur();
    const e = evaluate(tab, s);
    if (tab === 'series' && s.mode === 'voltage') s.rows.push({ a: roundV(e.U1), b: roundV(e.U2), c: roundV(e.U) });
    else if (tab === 'parallel' && s.mode === 'current') s.rows.push({ a: roundmA(e.I1), b: roundmA(e.I2), c: roundmA(e.I) });
    else return;
    if (s.rows.length > 8) s.rows.shift();
    s.fb = { type: 'good', key: 'fb.recordedRow' };
    updateMeasures();
  };
  ui.record = createButton({ labelKey: 'ctl.recordReadings', onClick: record, variant: 'primary' });
  controlsBody.append(ui.mode.root, ui.sw.root, ui.lamps[0].root, ui.lamps[1].root,
    btnRow(ui.record, createButton({ labelKey: 'ui.reset', onClick: resetTab, variant: 'ghost' })), hint('hint.lamps'));
}

function build() {
  const tab = shell.tab;
  const st = cur();
  if (tab === 'voltmeter' || tab === 'ammeter') buildMeterControls(tab, st);
  else if (tab === 'scope') buildScopeControls(st);
  else buildCircuitControls(tab, st);
  ui.dl = el('dl', { class: 'meas' });
  ui.status = el('div', { class: 'status', hidden: '' });
  ui.table = el('table', { class: 'data' });
  ui.clear = createButton({ labelKey: 'ctl.clearTable', onClick: () => { cur().rows = []; cur().fb = null; ui.sig = null; updateMeasures(); }, variant: 'ghost' });
  ui.clearRow = el('div', { class: 'btn-row', style: 'margin-top:8px' }, [ui.clear]);
  measuresBody.append(ui.dl, ui.status, ui.table, ui.clearRow);
}

const fmtA = (v) => `${mA(v)} mA`;
const fmtV = (v) => `${volt(v)} V`;
function updateMeasures() {
  if (!shell || !ui.dl) return;
  const tab = shell.tab;
  const st = cur();
  const e = evaluate(tab, st);
  const rows = [];
  let fb = st.fb;
  if (tab === 'voltmeter' || tab === 'ammeter') {
    ui.jack.set(st.jack); ui.range.set(st.range); ui.sw?.set(st.sw);
    rows.push([t('m.function'), t(!e.range.kind ? 'fn.off' : !e.r.match ? 'fn.mismatch' : e.range.kind === 'V' ? 'fn.voltmeter' : 'fn.ammeter')]);
    rows.push([t('m.range'), t(`range.${st.range}`)]);
    rows.push([t('m.display'), meterText(e)]);
    if (tab === 'ammeter') rows.push([t('m.lamp'), t(e.glow > 0.05 ? 'lamp.on' : 'lamp.off')]);
    fb ??= meterAdvice(tab, st, e);
  } else if (tab === 'scope') {
    if (st.mode === 'exp') {
      ui.sv.set(String(st.sv)); ui.vb.set(String(st.vb)); ui.coupling.set(st.coupling); ui.vm.set(st.voltmeter ? 'yes' : 'no');
      rows.push([t('m.sv'), svText(st.sv)], [t('m.vb'), vbText(st.vb)]);
      rows.push([t('m.trace'), t(e.steady ? 'trace.line' : 'trace.spot')]);
      if (st.voltmeter) rows.push([t('m.voltmeter'), fmtV(E)]);
      if (!fb) {
        if (st.coupling === 'gnd') fb = { type: '', key: 'fb.gnd' };
        else if (e.off) fb = { type: 'warn', key: 'fb.off' + (e.level > 0 ? 'Up' : 'Down') };
        else if (!e.steady) fb = { type: '', key: 'fb.spot' };
        else if (e.level < 0) fb = { type: 'warn', key: 'fb.down' };
      }
    } else {
      ui.testInfo.textContent = t('test.info', { sv: svText(st.test.sv) });
      ui.testInput.classList.toggle('is-wrong', st.test.result === 'wrong');
      rows.push([t('m.sv'), svText(st.test.sv)], [t('m.score'), `${st.score.ok} / ${st.score.n}`]);
    }
  } else {
    ui.mode.set(st.mode); ui.sw.set(st.sw);
    ui.lamps.forEach((c, k) => c.set(st.lamps[k] ? 'in' : 'out'));
    ui.record.hidden = !((tab === 'series' && st.mode === 'voltage') || (tab === 'parallel' && st.mode === 'current'));
    if (st.mode === 'current') {
      if (tab === 'parallel') rows.push([t('m.Imain'), fmtA(e.I)]);
      rows.push([t('m.I1'), fmtA(e.I1)], [t('m.I2'), fmtA(e.I2)]);
    } else {
      if (tab === 'parallel') rows.push([t('m.Ucell'), fmtV(e.U)]);
      rows.push([t('m.U1'), fmtV(e.U1)], [t('m.U2'), fmtV(e.U2)]);
      if (tab === 'series') rows.push([t('m.U3'), fmtV(e.U)]);
    }
    for (let k = 0; k < 2; k++) {
      rows.push([t('m.lampK', { k: k + 1 }), t(!st.lamps[k] ? 'lamp.removed' : e.glow[k] > 0.05 ? 'lamp.on' : 'lamp.off'), st.lamps[k] ? '' : 'muted']);
    }
  }
  measRows(ui.dl, rows);
  showStatus(ui.status, fb);
  buildTable(tab, st);
}

function buildTable(tab, st) {
  const sig = `${tab}|${st.mode}|${st.rows.length}|${calcSig(st.rows)}`;
  if (sig === ui.sig) return;
  ui.sig = sig;
  let head = [], body = [];
  const th = (k) => el('th', { class: 'keep-case' }, t(k));
  const onCheck = (res) => {
    const s = cur();
    s.fb = res === 'invalid' ? { type: 'warn', key: 'calc.invalid' } : res === 'ok' ? { type: 'good', key: 'fb.calcOk' } : { type: 'bad', key: 'fb.calcWrong' };
    updateMeasures();
  };
  if (tab === 'voltmeter' || tab === 'ammeter') {
    head = [...(tab === 'ammeter' ? [th('col.switch')] : []), th('col.range'), th('col.reading')];
    body = st.rows.map((r) => el('tr', {}, [...(tab === 'ammeter' ? [el('td', {}, t(`ctl.${r.sw}`))] : []), el('td', {}, t(`range.${r.range}`)), el('td', {}, r.r)]));
  } else if (tab === 'scope' && st.mode === 'exp') {
    head = [th('col.sv'), th('col.vb'), th('col.y'), th('col.U')];
    body = st.rows.map((r) => {
      const yTyped = calcDone(r, 'y') ? parseNum(r.calc.y.draft) : NaN;
      return el('tr', {}, [
        el('td', {}, svText(r.sv)), el('td', {}, vbText(r.vb)),
        calcCell(r, 'y', { expected: r.y, decimals: 1, tol: 0.1, onCheck }),
        calcCell(r, 'U', { expected: Number.isFinite(yTyped) ? r.sv * yTyped : 0, decimals: 2, disabled: !calcDone(r, 'y'), onCheck }),
      ]);
    });
  } else if ((tab === 'series' && st.mode === 'voltage') || (tab === 'parallel' && st.mode === 'current')) {
    const ser = tab === 'series';
    head = ser ? [th('col.U1'), th('col.U2'), th('col.U3'), th('col.sumU')] : [th('col.I1'), th('col.I2'), th('col.I'), th('col.sumI')];
    body = st.rows.map((r) => el('tr', {}, [
      el('td', {}, ser ? volt(r.a) : mA(r.a / 1000)), el('td', {}, ser ? volt(r.b) : mA(r.b / 1000)), el('td', {}, ser ? volt(r.c) : mA(r.c / 1000)),
      calcCell(r, 'sum', { expected: r.a + r.b, decimals: ser ? 2 : 1, onCheck }),
    ]));
  }
  ui.table.replaceChildren(el('thead', {}, el('tr', {}, head)), el('tbody', {}, body));
  ui.table.hidden = body.length === 0;
  ui.clearRow.hidden = ui.table.hidden;
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

// Labels of the inputs, ranges and knob positions (numbers formatted per language)
function extraStrings() {
  const s = { en: {}, fr: {} };
  for (const lang of ['en', 'fr']) {
    const n = (v, d) => num(v, d, lang);
    s[lang]['jack.10A'] = '10A';
    s[lang]['jack.A'] = 'A';
    s[lang]['jack.V'] = 'V';
    Object.assign(s[lang], {
      'range.off': 'OFF', 'range.v600': '600 V', 'range.v200': '200 V', 'range.v20': '20 V', 'range.v2': '2 V', 'range.mv200': '200 mV',
      'range.a10': '10 A', 'range.ma200': '200 mA', 'range.ma20': '20 mA',
    });
    for (const v of SV_LIST) s[lang][`sv.${v}`] = `${n(v, v < 1 ? 1 : 0)} V/div`;
    for (const v of VB_LIST) s[lang][`vb.${v}`] = v >= 0.1 ? `${n(v, v < 1 ? 1 : 0)} s/div` : `${n(v * 1000, v < 0.001 ? 1 : 0)} ms/div`;
  }
  return s;
}
const xs = extraStrings();
onLangChange(() => { if (shell) buildTab(); });

shell = initSim({
  strings: { en: { ...strings.en, ...xs.en }, fr: { ...strings.fr, ...xs.fr } },
  tabs: TABS.map((id) => ({ id, labelKey: `tab.${id}` })),
  initialTab: 'voltmeter',
  onTab: buildTab,
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, evaluate, cur: () => cur(), tab: () => shell.tab, R_INT, matches };
