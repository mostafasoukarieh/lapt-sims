// Sec 1 — Chapter 4: Resistors (Conducteurs ohmiques), except 4.5 (resistance of a wire) — p.53–68.
// Owner (4 Nov 2026): Sec 1 batteries have an emf E and an internal resistance r (book Table 5.1).
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num } from '../../../shared/format.js';
import { createButton, createSegmented, createSlider, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, font } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { calcCell, calcSig } from '../../../shared/calc-cell.js';
import { drawMeterBox, drawCurrentArrows, labelI, METER_HALF } from '../../../shared/circuit-draw.js';
import { drawMultimeter, reading, meterLead } from '../../../shared/multimeter-draw.js';
import { COLORS, HEX, TOL, bandsOf, valueOf, drawResistor, OHM_RANGES, OHM_DIAL, OHM_JACKS, bestOhmRange } from '../../../shared/resistor-draw.js';
import { createGraph } from '../../../shared/graph.js';
import { label } from '../../../shared/figures.js';
import { board as boardBg, line, tag, dot, resBox, lampAt, sourceV, switchH, rheostatH } from '../../../shared/board-draw.js';

/* ================================================================
   Model values
   ================================================================ */
const E = 4.27, R_INT = 1.9;              // 4.5 V flat battery (Table 5.1)
const R_F = 9.0;                          // ferronickel wire of Exp. 4.1 (Table 4.1 gives V/I ≈ 9 Ω)
const R_PROT = 30;                        // protection resistance (Fig. 4.1)
const LOADS = { wire: R_F, r22: 22, lamp: null };
// lamp 6 V – 0.3 A, characteristic not straight (Test 8, Fig. 4.24): I = 0.3 (V/6)^0.55
const lampI = (V) => 0.3 * Math.pow(Math.max(0, V) / 6, 0.55);
function loadCurrent(load, U) {
  if (load !== 'lamp') return U / (LOADS[load] + R_PROT);
  // solve U = R_PROT I + V(I), V = 6 (I/0.3)^(1/0.55), by bisection
  let a = 0, b = U / R_PROT;
  for (let k = 0; k < 50; k++) { const m = (a + b) / 2; const V = 6 * Math.pow(m / 0.3, 1 / 0.55); if (R_PROT * m + V > U) b = m; else a = m; }
  return (a + b) / 2;
}
// ohmmeter tab: parts to measure (nominal → value read)
const PARTS = { wire: { R: 9.0 }, r10k: { R: 10120, nominal: 10000, tol: 'gold' }, r82: { R: 81.4, nominal: 82, tol: 'gold' }, r470: { R: 466, nominal: 470, tol: 'silver' }, unknown: { R: null } };
const UNKNOWN = [27, 150, 390, 1800, 5600, 33000, 680000];
// grouping tab
const STOCK = [22, 33, 47, 82, 100, 220];
const W = 600, H = 440;
const TABS = ['characteristic', 'ohmmeter', 'joule', 'grouping', 'applications'];

function rand(a) { return a[Math.floor(Math.random() * a.length)]; }
function newTestBands() {
  const v = rand([10, 12, 15, 18, 22, 27, 33, 39, 47, 56, 68, 82]) * 10 ** Math.floor(Math.random() * 5);
  return bandsOf(v, rand(['gold', 'gold', 'silver']));
}
function initialState(tab) {
  switch (tab) {
    case 'characteristic': return { U: 0, closed: true, load: 'wire', rows: [], fb: null };
    case 'ohmmeter': return { mode: 'measure', part: 'r10k', range: 'r20M', unknown: rand(UNKNOWN), bands: newTestBands(), calc: {}, fb: null };
    case 'joule': return { V: 3, burnt: false, over: 0, rows: [], calc: {}, fb: null };
    case 'grouping': return { mode: 'mixed', r: [33, 47, 82], meas: 'AB', calc: {}, fb: null };
    case 'applications': return { scene: 'short', shorted: false, prot: false, cur: 1, cin: 0.5, calc: {}, fb: null };
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
const graphCard = document.getElementById('graph-card');
function requestDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; draw(); });
}
onThemeChange(() => requestDraw());

/* ================================================================
   Drawing helpers
   ================================================================ */
function board(ctx) { boardBg(ctx, W, H); }
function hint(ctx, text) { label(ctx, text, W / 2, H - 20, { size: 13, weight: 600, color: cssVar('--muted') }); }
const fmtR = (R) => (R >= 1e6 ? `${num(R / 1e6, 2)} MΩ` : R >= 1000 ? `${num(R / 1000, R >= 10000 ? 1 : 2)} kΩ` : `${num(R, R < 10 ? 1 : 0)} Ω`);

/* ================================================================
   Tab 1 — Current–potential difference characteristic (Exp. 4.1, Table 4.1)
   ================================================================ */
function charValues(st) {
  const I = st.closed ? loadCurrent(st.load, st.U) : 0;
  const V = st.load === 'lamp' ? (I > 0 ? 6 * Math.pow(I / 0.3, 1 / 0.55) : 0) : I * LOADS[st.load];
  return { I, V };
}
function drawCharacteristic(ctx, st) {
  board(ctx);
  const { I, V } = charValues(st);
  // source — K — ammeter — load F — protection resistance — back
  line(ctx, [[90, 120], [90, 70], [170, 70]]); line(ctx, [[230, 70], [300 - METER_HALF, 70]]); line(ctx, [[300 + METER_HALF, 70], [470, 70], [470, 140]]);
  line(ctx, [[470, 240], [470, 370], [330, 370]]); line(ctx, [[270, 370], [90, 370], [90, 320]]);
  sourceV(ctx, 90, 120, 320, `${dec(num(st.U, 1))} V`);
  tag(ctx, t('lbl.source'), 90, 244, '#ffffff', 11, 'center', 700);
  switchH(ctx, 170, 230, 70, !st.closed); tag(ctx, 'K', 200, 98, cssVar('--text'), 15);
  drawMeterBox(ctx, { x: 300, y: 70, kind: 'A', name: 'A', text: num(I * 1000, 0), unit: 'mA' });
  if (st.load === 'lamp') { line(ctx, [[470, 140], [470, 172]]); line(ctx, [[470, 208], [470, 240]]); lampAt(ctx, 470, 190, Math.min(1, I / 0.3), 'L', true); }
  else {
    line(ctx, [[470, 140], [470, 160]]); line(ctx, [[470, 220], [470, 240]]);
    resBox(ctx, 470, 190, st.load === 'wire' ? 'F' : 'R', true);
  }
  resBox(ctx, 300, 370, t('lbl.protection'));
  // voltmeter across the load (between the points P and Q)
  dot(ctx, 470, 140); dot(ctx, 470, 240);
  tag(ctx, 'A', 488, 132, cssVar('--text'), 14, 'left'); tag(ctx, 'B', 488, 250, cssVar('--text'), 14, 'left');
  line(ctx, [[470, 140], [560, 140], [560, 190 - METER_HALF + 10]], cssVar('--accent'), 2.5);
  line(ctx, [[470, 240], [560, 240], [560, 190 + METER_HALF - 10]], cssVar('--lead-black'), 2.5);
  ctx.save(); ctx.translate(560, 190); ctx.rotate(-Math.PI / 2);
  drawMeterBox(ctx, { x: 0, y: 0, kind: 'V', name: 'V', text: num(V, 2), unit: 'V' });
  ctx.restore();
  if (I > 0) {
    const ph = (performance.now() / 25) % 1000;
    const skip = (x, y) => (x === 90 && y > 115 && y < 325) || (y === 70 && x > 160 && x < 360) || (x === 470 && y > 150 && y < 230) || (y === 370 && x > 260 && x < 340);
    drawCurrentArrows(ctx, [[90, 120], [90, 70], [470, 70], [470, 370], [90, 370], [90, 320]], ph * Math.min(1, I / 0.2), skip);
  }
  hint(ctx, t('hint.char'));
}

/* ================================================================
   Tab 2 — Measuring a resistance with an ohmmeter (Exp. 4.2), colour code (Example 4.3)
   ================================================================ */
let hits = [];
function ohmValue(st) { return st.part === 'unknown' ? st.unknown : PARTS[st.part].R; }
function drawCoil(ctx, x, y) {
  // coiled ferronickel wire on an insulating support
  ctx.fillStyle = cssVar('--wood'); roundRect(ctx, x - 70, y - 10, 140, 20, 6); ctx.fill();
  ctx.strokeStyle = cssVar('--copper'); ctx.lineWidth = 2;
  for (let i = 0; i < 16; i++) { const xx = x - 60 + i * 8; ctx.beginPath(); ctx.ellipse(xx, y, 4, 16, 0.3, 0, Math.PI * 2); ctx.stroke(); }
  line(ctx, [[x - 92, y], [x - 66, y]], cssVar('--metal'), 3); line(ctx, [[x + 66, y], [x + 92, y]], cssVar('--metal'), 3);
}
function drawColourTable(ctx, x0, y0) {
  ctx.font = font(11, 700); ctx.textBaseline = 'middle';
  const rows = [...COLORS.map((c, i) => [c, String(i)]), ['gold', '5 %'], ['silver', '10 %']];
  rows.forEach(([c, v], i) => {
    const col = i < 6 ? 0 : 1, row = i % 6;
    const x = x0 + col * 165, y = y0 + row * 22;
    ctx.fillStyle = HEX[c]; ctx.fillRect(x, y - 8, 18, 16);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1; ctx.strokeRect(x, y - 8, 18, 16);
    ctx.fillStyle = cssVar('--text'); ctx.textAlign = 'left'; ctx.fillText(t(`col.${c}`), x + 26, y);
    ctx.textAlign = 'right'; ctx.fillText(v, x + 150, y);
  });
}
function drawOhmmeter(ctx, st) {
  board(ctx); hits = [];
  const RX = 190, RY = 110;
  let ends = [[RX - 90, RY], [RX + 90, RY]];
  if (st.mode === 'test') {
    drawResistor(ctx, 300, 110, st.bands, 220, 56);
    tag(ctx, t('lbl.testRings'), 300, 52, cssVar('--muted'), 13, 'center', 700);
    drawColourTable(ctx, 140, 220);
    hint(ctx, t('hint.colourTest'));
    return;
  }
  if (st.part === 'wire') drawCoil(ctx, RX, RY);
  else if (st.part === 'unknown') { drawResistor(ctx, RX, RY, ['grey', 'grey', 'grey', 'grey'], 130, 32); tag(ctx, t('lbl.unknownTag'), RX, RY - 36, cssVar('--muted'), 13); ends = [[RX - 79, RY], [RX + 79, RY]]; }
  else { const P = PARTS[st.part]; drawResistor(ctx, RX, RY, bandsOf(P.nominal, P.tol), 130, 32); ends = [[RX - 79, RY], [RX + 79, RY]]; }
  drawColourTable(ctx, 30, 230);
  const R = OHM_RANGES[st.range];
  const r = R.kind ? reading(R, ohmValue(st), 'VΩ') : { text: '' };
  const J = drawMultimeter(ctx, {
    x: 396, y: 20, w: 190, h: 340, ranges: OHM_RANGES, order: OHM_DIAL, value: st.range, offLabel: 'OFF', jacks: OHM_JACKS,
    text: r.text, unit: R.kind ? R.unit : '', overload: r.overload, zoneV: 'Ω', zoneA: ' ',
  });
  for (const d of J.dial) hits.push({ kind: 'dial', id: d.id, x: d.x, y: d.y, r: d.r });
  meterLead(ctx, J.jacks['VΩ'], ends[1], cssVar('--accent'), [J.jacks['VΩ'][0], 400], [ends[1][0] + 40, ends[1][1] + 120]);
  meterLead(ctx, J.jacks.COM, ends[0], cssVar('--lead-black'), [J.jacks.COM[0], 410], [ends[0][0] - 20, ends[0][1] + 140]);
  hint(ctx, t('hint.ohm'));
}

/* ================================================================
   Tab 3 — Joule's law and limits of functioning (4.6, Problem 5)
   ================================================================ */
const R_J = 47, PMAX = 0.5;
function jouleValues(st) {
  const I = st.burnt ? 0 : st.V / R_J;
  return { I, P: st.V * I };
}
function drawJoule(ctx, st) {
  board(ctx);
  const { I, P } = jouleValues(st);
  line(ctx, [[90, 120], [90, 80], [300 - METER_HALF, 80]]); line(ctx, [[300 + METER_HALF, 80], [470, 80], [470, 160]]);
  line(ctx, [[470, 260], [470, 360], [90, 360], [90, 320]]);
  sourceV(ctx, 90, 120, 320, `${dec(num(st.V, 1))} V`);
  drawMeterBox(ctx, { x: 300, y: 80, kind: 'A', name: 'A', text: num(I * 1000, 1), unit: 'mA' });
  line(ctx, [[470, 160], [470, 180]]); line(ctx, [[470, 240], [470, 260]]);
  resBox(ctx, 470, 210, '', true, Math.min(1, P / PMAX), st.burnt);
  tag(ctx, '47 Ω', 500, 196, cssVar('--text'), 14, 'left'); tag(ctx, `Pmax = ${dec('0.5')} W`, 500, 220, cssVar('--text'), 13, 'left', 700);
  // voltmeter across the resistor
  line(ctx, [[470, 160], [400, 160], [400, 210 - METER_HALF + 10]], cssVar('--accent'), 2.5);
  line(ctx, [[470, 260], [400, 260], [400, 210 + METER_HALF - 10]], cssVar('--lead-black'), 2.5);
  ctx.save(); ctx.translate(400, 210); ctx.rotate(-Math.PI / 2);
  drawMeterBox(ctx, { x: 0, y: 0, kind: 'V', name: 'V', text: num(st.burnt ? st.V : st.V, 2), unit: 'V' });
  ctx.restore();
  if (st.burnt) {
    // smoke
    ctx.fillStyle = 'rgba(120,120,120,0.45)';
    const tt = performance.now() / 600;
    for (let i = 0; i < 5; i++) { const k = (tt + i * 0.2) % 1; ctx.beginPath(); ctx.arc(470 + 12 * Math.sin(i + tt), 180 - k * 90, 8 + k * 14, 0, Math.PI * 2); ctx.fill(); }
    label(ctx, t('warn.burnt'), 300, 300, { size: 15, weight: 800, color: cssVar('--bad') });
  } else if (P > PMAX) {
    label(ctx, t('warn.hot'), 300, 300, { size: 15, weight: 800, color: cssVar('--bad') });
  }
  if (I > 0) {
    const ph = (performance.now() / 25) % 1000;
    const skip = (x, y) => (x === 90 && y > 115 && y < 325) || (y === 80 && x > 240 && x < 360) || (x === 470 && y > 170 && y < 250);
    drawCurrentArrows(ctx, [[90, 120], [90, 80], [470, 80], [470, 360], [90, 360], [90, 320]], ph * Math.min(1, I / 0.1), skip);
  }
  hint(ctx, t('hint.joule'));
}

/* ================================================================
   Tab 4 — Grouping of resistors (Exp. 4.3, 4.4, Example 4.1)
   ================================================================ */
function req(st) {
  const [a, b, c] = st.r;
  if (st.mode === 'series') return a + b + c;
  if (st.mode === 'parallel') return 1 / (1 / a + 1 / b + 1 / c);
  return a + (b * c) / (b + c);
}
function measuredR(st) {
  if (st.meas === 'AB') return req(st);
  return st.r[Number(st.meas.slice(1)) - 1];
}
function drawGrouping(ctx, st) {
  board(ctx);
  const [a, b, c] = st.r;
  const Y = 150, XA = 70, XB = 530;
  const res = (x, y, v, name) => { drawResistor(ctx, x, y, bandsOf(v), 90, 24); tag(ctx, `${name} = ${v} Ω`, x, y - 26, cssVar('--text'), 13); };
  if (st.mode === 'series') {
    line(ctx, [[XA, Y], [XB, Y]]);
    res(160, Y, a, 'R1'); res(300, Y, b, 'R2'); res(440, Y, c, 'R3');
  } else if (st.mode === 'parallel') {
    line(ctx, [[XA, Y + 60], [180, Y + 60]]); line(ctx, [[420, Y + 60], [XB, Y + 60]]);
    line(ctx, [[180, Y - 10], [180, Y + 130]]); line(ctx, [[420, Y - 10], [420, Y + 130]]);
    for (const [k, y] of [[0, Y - 10], [1, Y + 60], [2, Y + 130]]) { line(ctx, [[180, y], [420, y]]); res(300, y, st.r[k], `R${k + 1}`); }
    dot(ctx, 180, Y + 60); dot(ctx, 420, Y + 60);
  } else {
    // Example 4.1: R1 in series with (R2 // R3)
    line(ctx, [[XA, Y + 30], [290, Y + 30]]); line(ctx, [[490, Y + 30], [XB, Y + 30]]);
    line(ctx, [[290, Y - 20], [290, Y + 80]]); line(ctx, [[490, Y - 20], [490, Y + 80]]);
    res(170, Y + 30, a, 'R1');
    line(ctx, [[290, Y - 20], [490, Y - 20]]); line(ctx, [[290, Y + 80], [490, Y + 80]]);
    res(390, Y - 20, b, 'R2'); res(390, Y + 80, c, 'R3');
    dot(ctx, 290, Y + 30); dot(ctx, 490, Y + 30);
  }
  const yAB = st.mode === 'series' ? Y : st.mode === 'parallel' ? Y + 60 : Y + 30;
  for (const [x, n] of [[XA, 'A'], [XB, 'B']]) { dot(ctx, x, yAB, 7); tag(ctx, n, x, yAB - 22, cssVar('--text'), 16); }
  // ohmmeter box and leads
  const MX = 300, MY = 360;
  const target = st.meas === 'AB' ? null : Number(st.meas.slice(1)) - 1;
  let p1 = [XA, yAB], p2 = [XB, yAB];
  if (target !== null) {
    // the resistor is measured alone (taken out of the grouping in the book's experiments)
    const pos = st.mode === 'series' ? [[160, Y], [300, Y], [440, Y]][target]
      : st.mode === 'parallel' ? [[300, Y - 10], [300, Y + 60], [300, Y + 130]][target]
        : [[170, Y + 30], [390, Y - 20], [390, Y + 80]][target];
    p1 = [pos[0] - 59, pos[1]]; p2 = [pos[0] + 59, pos[1]];
    ctx.strokeStyle = cssVar('--accent'); ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
    roundRect(ctx, pos[0] - 62, pos[1] - 40, 124, 58, 10); ctx.stroke(); ctx.setLineDash([]);
  }
  drawMeterBox(ctx, { x: MX, y: MY, kind: 'V', name: 'Ω', text: num(measuredR(st), 1), unit: 'Ω' });
  const lead = (from, to, color) => { ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(...from); ctx.quadraticCurveTo(to[0], from[1], to[0], to[1] + 4); ctx.stroke(); };
  lead([MX - METER_HALF, MY], p1, cssVar('--lead-black')); lead([MX + METER_HALF, MY], p2, cssVar('--accent'));
  hint(ctx, t(target === null ? 'hint.groupAB' : 'hint.groupOne'));
}

/* ================================================================
   Tab 5 — Applications: short circuit, rheostat (Problem 9), potential divider (Example 4.2)
   ================================================================ */
const R_LAMP = 12;
function appValues(st) {
  if (st.scene === 'short') {
    if (st.shorted) {
      const Rs = st.prot ? 10 : 0.05; // thick wire (≈ 0.05 Ω) or wire with a protection resistance of 10 Ω
      const I = E / (R_INT + Rs);
      return { I, Ilamp: 0, U: I * Rs };
    }
    const Rl = R_LAMP + (st.prot ? 10 : 0);
    const I = E / (R_INT + Rl);
    return { I, Ilamp: I, U: I * Rl };
  }
  if (st.scene === 'rheostat') {
    const Rh = 100 * st.cur;
    const I = 6 / (82 + Rh);
    return { I, Rh };
  }
  // potential divider: 6 V across the rheostat AB (100 Ω), output between the cursor C and B (no load)
  return { Vout: 6 * st.cin, RCB: 100 * st.cin };
}
function drawApplications(ctx, st) {
  board(ctx);
  const v = appValues(st);
  const ph = (performance.now() / 25) % 1000;
  if (st.scene === 'short') {
    // battery — K — lamp; a thick wire can be put across the battery terminals
    line(ctx, [[90, 120], [90, 80], [470, 80], [470, 172]]); line(ctx, [[470, 208], [470, 360], [90, 360], [90, 320]]);
    sourceV(ctx, 90, 120, 320, dec('4.5 V'));
    drawMeterBox(ctx, { x: 270, y: 80, kind: 'A', name: 'A', text: num(v.I, 2), unit: 'A' });
    lampAt(ctx, 470, 190, Math.min(1, v.Ilamp / 0.3), t('lbl.lamp'), true);
    if (st.prot) { resBox(ctx, 270, 360, t('lbl.protection10')); }
    if (st.shorted) {
      line(ctx, [[400, 80], [400, 360]], cssVar('--copper'), 7);
      tag(ctx, t('lbl.thickWire'), 392, 220, cssVar('--copper'), 12, 'right', 800);
      if (!st.prot) {
        // spark
        ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 3;
        const k = performance.now() / 70;
        for (let i = 0; i < 6; i++) { const a = i + k; ctx.beginPath(); ctx.moveTo(400, 82); ctx.lineTo(400 + 18 * Math.cos(a), 82 + 18 * Math.sin(a)); ctx.stroke(); }
        label(ctx, t('warn.short'), 300, 36, { size: 14, weight: 800, color: cssVar('--bad') });
      }
    }
    const pts = st.shorted ? [[90, 120], [90, 80], [400, 80], [400, 360], [90, 360], [90, 320]] : [[90, 120], [90, 80], [470, 80], [470, 360], [90, 360], [90, 320]];
    const skip = (x, y) => (x === 90 && y > 115 && y < 325) || (y === 80 && x > 210 && x < 330) || (x === 470 && y > 165 && y < 215) || (st.prot && y === 360 && x > 230 && x < 310);
    drawCurrentArrows(ctx, pts, ph * Math.min(2, v.I / 0.3), skip);
    hint(ctx, t('hint.short'));
  } else if (st.scene === 'rheostat') {
    // Problem 9: 6 V source, resistor 82 Ω and rheostat 0–100 Ω in series
    line(ctx, [[90, 120], [90, 80], [250 - METER_HALF, 80]]); line(ctx, [[250 + METER_HALF, 80], [470, 80], [470, 160]]);
        sourceV(ctx, 90, 120, 320, '6 V');
    drawMeterBox(ctx, { x: 250, y: 80, kind: 'A', name: 'A', text: num(v.I * 1000, 1), unit: 'mA' });
    line(ctx, [[470, 160], [470, 170]]); line(ctx, [[470, 210], [470, 220]]);
    resBox(ctx, 470, 190, '82 Ω', true);
    // rheostat used as a variable resistor: the part between the cursor C and the end B is in the circuit
    line(ctx, [[470, 220], [470, 360]]);
    const cx = rheostatH(ctx, 350, 360, 1 - st.cur, 240);
    tag(ctx, 'A', 222, 384, cssVar('--text'), 14); tag(ctx, 'B', 478, 384, cssVar('--text'), 14);
    ctx.fillStyle = cssVar('--accent'); ctx.beginPath(); ctx.moveTo(cx, 346); ctx.lineTo(cx - 8, 332); ctx.lineTo(cx + 8, 332); ctx.fill();
    line(ctx, [[cx, 332], [cx, 300], [160, 300], [160, 360], [90, 360], [90, 320]]);
    tag(ctx, 'C', cx + 12, 322, cssVar('--accent'), 14, 'left');
    tag(ctx, `Rh = ${num(v.Rh, 0)} Ω`, 350, 396, cssVar('--text'), 13);
    hint(ctx, t('hint.rheostat'));
  } else {
    // potential divider (Example 4.2, Fig. 4.21): Vin = 6 V across AB, Vout between C and B
    line(ctx, [[90, 120], [90, 100], [300, 100], [300, 120]]); line(ctx, [[90, 320], [90, 360], [300, 360], [300, 320]]);
    sourceV(ctx, 90, 120, 320, '6 V');
    // rheostat drawn vertically between A (top) and B (bottom), x = 300
    ctx.fillStyle = cssVar('--surface'); ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 2.5;
    ctx.fillRect(289, 120, 22, 200); ctx.strokeRect(289, 120, 22, 200);
        tag(ctx, 'A', 316, 110, cssVar('--text'), 14, 'left'); tag(ctx, 'B', 316, 334, cssVar('--text'), 14, 'left');
    const cy = 320 - 200 * st.cin;
    ctx.fillStyle = cssVar('--accent'); ctx.beginPath(); ctx.moveTo(312, cy); ctx.lineTo(326, cy - 8); ctx.lineTo(326, cy + 8); ctx.fill();
    line(ctx, [[326, cy], [420, cy], [420, 210 - METER_HALF + 10]], cssVar('--accent'), 2.5);
    line(ctx, [[300, 360], [420, 360], [420, 210 + METER_HALF - 10]], cssVar('--lead-black'), 2.5);
    tag(ctx, 'C', 340, cy - 14, cssVar('--accent'), 14, 'left');
    ctx.save(); ctx.translate(420, 210); ctx.rotate(-Math.PI / 2);
    drawMeterBox(ctx, { x: 0, y: 0, kind: 'V', name: 'V', text: num(v.Vout, 2), unit: 'V' });
    ctx.restore();
    tag(ctx, `R(CB) = ${num(v.RCB, 0)} Ω`, 300, 396, cssVar('--text'), 13);
    tag(ctx, 'R(AB) = 100 Ω', 160, 60, cssVar('--muted'), 12);
    hint(ctx, t('hint.divider'));
  }
}

/* ================================================================
   Draw, loop, taps
   ================================================================ */
function draw() {
  if (!shell) return;
  const ctx = view.begin();
  const st = cur();
  switch (shell.tab) {
    case 'characteristic': drawCharacteristic(ctx, st); break;
    case 'ohmmeter': drawOhmmeter(ctx, st); break;
    case 'joule': drawJoule(ctx, st); break;
    case 'grouping': drawGrouping(ctx, st); break;
    case 'applications': drawApplications(ctx, st); break;
    default: break;
  }
}
let tick = 0;
const loop = createLoop({
  dt: 1 / 60,
  step(dt) {
    if (!shell) return false;
    const st = cur();
    if (shell.tab === 'joule' && !st.burnt) {
      const { P } = jouleValues(st);
      st.over = P > PMAX ? st.over + dt * (P / PMAX) : Math.max(0, st.over - dt);
      if (st.over > 2.5) { st.burnt = true; st.fb = { type: 'bad', key: 'fb.burnt' }; updateMeasures(); }
    }
    return true;
  },
  render() { draw(); if (++tick % 15 === 0 && shell.tab === 'joule') updateMeasures(); },
});
canvas.addEventListener('pointerdown', (ev) => {
  if (shell.tab !== 'ohmmeter') return;
  const st = cur();
  const p = view.toLogical(ev);
  const h = hits.find((q) => Math.hypot(p.x - q.x, p.y - q.y) < q.r);
  if (!h) return;
  ev.preventDefault();
  st.range = h.id; st.fb = null; updateMeasures(); requestDraw();
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

function build() {
  const tab = shell.tab, st = cur();
  const items = [];
  if (tab === 'characteristic') {
    items.push(seg('ctl.load', [['wire', 'load.wire'], ['r22', 'load.r22'], ['lamp', 'load.lamp']], st.load, (v) => { st.load = v; st.rows = []; st.fb = null; ui.sig = null; updateMeasures(); }));
    items.push(slider({ labelKey: 'ctl.U', min: 0, max: 20, step: 0.5, value: st.U, format: (x) => `${num(x, 1)} V`, onInput: (x) => { st.U = x; updateMeasures(); } }));
    items.push(seg('ctl.switch', [['closed', 'sw.closed'], ['open', 'sw.open']], st.closed ? 'closed' : 'open', (v) => { st.closed = v === 'closed'; updateMeasures(); }));
    items.push(btnRow(createButton({ labelKey: 'ctl.record', variant: 'primary', onClick: () => recordChar(st) }), resetBtn(tab)));
    items.push(hintP('hint.charCtl'));
  } else if (tab === 'ohmmeter') {
    items.push(seg('ctl.omode', [['measure', 'omode.measure'], ['test', 'omode.test']], st.mode, (v) => { st.mode = v; st.calc = {}; st.fb = null; buildTab(); }));
    if (st.mode === 'measure') {
      items.push(seg('ctl.part', [['wire', 'part.wire'], ['r10k', 'part.r10k'], ['r82', 'part.r82'], ['r470', 'part.r470'], ['unknown', 'part.unknown']], st.part, (v) => {
        st.part = v; if (v === 'unknown') st.unknown = rand(UNKNOWN); st.range = 'r20M'; st.calc = {}; st.fb = null; ui.sig = null; updateMeasures();
      }));
      items.push(btnRow(createButton({ labelKey: 'ctl.highest', onClick: () => { st.range = 'r20M'; updateMeasures(); } }), resetBtn(tab)));
      items.push(hintP('hint.ohmCtl'));
    } else {
      items.push(btnRow(createButton({ labelKey: 'ctl.newResistor', variant: 'primary', onClick: () => { st.bands = newTestBands(); st.calc = {}; st.fb = null; ui.sig = null; updateMeasures(); } })));
      items.push(hintP('hint.colourCtl'));
    }
  } else if (tab === 'joule') {
    items.push(slider({ labelKey: 'ctl.V', min: 0, max: 8, step: 0.1, value: st.V, format: (x) => `${num(x, 1)} V`, onInput: (x) => { st.V = x; updateMeasures(); } }));
    items.push(btnRow(
      createButton({ labelKey: 'ctl.recordP', variant: 'primary', onClick: () => recordJoule(st) }),
      createButton({ labelKey: 'ctl.replace', onClick: () => { st.burnt = false; st.over = 0; st.fb = null; updateMeasures(); } }),
      resetBtn(tab)));
    items.push(hintP('hint.jouleCtl'));
  } else if (tab === 'grouping') {
    items.push(seg('ctl.gmode', [['series', 'gmode.series'], ['parallel', 'gmode.parallel'], ['mixed', 'gmode.mixed']], st.mode, (v) => { st.mode = v; st.calc = {}; st.fb = null; ui.sig = null; updateMeasures(); }));
    for (let k = 0; k < 3; k++) {
      items.push(seg(`ctl.r${k + 1}`, STOCK.map((x) => [x, `stock.${x}`]), st.r[k], (v) => { st.r[k] = Number(v); st.calc = {}; st.fb = null; ui.sig = null; updateMeasures(); }));
    }
    items.push(seg('ctl.meas', [['R1', 'meas.R1'], ['R2', 'meas.R2'], ['R3', 'meas.R3'], ['AB', 'meas.AB']], st.meas, (v) => { st.meas = v; updateMeasures(); }));
    items.push(btnRow(resetBtn(tab)));
    items.push(hintP('hint.groupCtl'));
  } else if (tab === 'applications') {
    items.push(seg('ctl.scene', [['short', 'scene.short'], ['rheostat', 'scene.rheostat'], ['divider', 'scene.divider']], st.scene, (v) => { st.scene = v; st.calc = {}; st.fb = null; buildTab(); }));
    if (st.scene === 'short') {
      items.push(btnRow(createButton({ labelKey: st.shorted ? 'ctl.removeShort' : 'ctl.short', variant: 'primary', onClick: () => { st.shorted = !st.shorted; buildTab(); } })));
      items.push(seg('ctl.prot', [['no', 'ctl.no'], ['yes', 'ctl.yes']], st.prot ? 'yes' : 'no', (v) => { st.prot = v === 'yes'; updateMeasures(); }));
    } else if (st.scene === 'rheostat') {
      items.push(slider({ labelKey: 'ctl.cursor', min: 0, max: 1, step: 0.05, value: st.cur, format: (x) => `${num(100 * x, 0)} Ω`, onInput: (x) => { st.cur = x; updateMeasures(); } }));
    } else {
      items.push(slider({ labelKey: 'ctl.cursorC', min: 0, max: 1, step: 0.05, value: st.cin, format: (x) => `${num(100 * x, 0)} Ω`, onInput: (x) => { st.cin = x; updateMeasures(); } }));
    }
    items.push(btnRow(resetBtn(tab)));
    items.push(hintP(`hint.${st.scene}Ctl`));
  }
  controlsBody.append(...items);
  ui.dl = el('dl', { class: 'meas' });
  ui.status = el('div', { class: 'status', hidden: '' });
  ui.tables = el('div');
  ui.clear = createButton({ labelKey: 'ctl.clearTable', variant: 'ghost', onClick: () => { const s = cur(); s.rows = []; s.fb = null; ui.sig = null; updateMeasures(); } });
  ui.clearRow = el('div', { class: 'btn-row', style: 'margin-top:8px' }, [ui.clear]);
  measuresBody.append(ui.dl, ui.status, ui.tables, ui.clearRow);
}

function recordChar(st) {
  const { I, V } = charValues(st);
  if (I <= 0) { st.fb = { type: 'warn', key: 'fb.noCurrent' }; updateMeasures(); return; }
  const Im = Math.round(I * 1000), Vr = Math.round(V * 100) / 100;
  if (st.rows.some((r) => r.I === Im)) { st.fb = { type: 'warn', key: 'fb.sameRow' }; updateMeasures(); return; }
  st.rows.push({ I: Im, V: Vr });
  st.rows.sort((a, b) => a.I - b.I);
  st.fb = null; ui.sig = null; updateMeasures();
}
function recordJoule(st) {
  if (st.burnt) { st.fb = { type: 'bad', key: 'fb.burnt' }; updateMeasures(); return; }
  const I = Math.round((st.V / R_J) * 10000) / 10; // mA, 1 decimal
  st.rows.push({ V: st.V, I });
  st.fb = null; ui.sig = null; updateMeasures();
}
function onCheckFor(st) {
  return (res) => {
    st.fb = res === 'invalid' ? { type: 'warn', key: 'calc.invalid' } : res === 'ok' ? { type: 'good', key: 'fb.ok' } : { type: 'bad', key: 'fb.wrong' };
    ui.sig = null; updateMeasures();
  };
}

function updateMeasures() {
  if (!shell || !ui.dl) return;
  const tab = shell.tab, st = cur();
  const rows = [];
  let tableBuilder = null;
  ui.clearRow.hidden = true;
  graphCard.hidden = tab !== 'characteristic';
  if (tab === 'characteristic') {
    const { I, V } = charValues(st);
    rows.push(['I', `${num(I * 1000, 0)} mA`], [el('span', { class: 'keep-case' }, [t('sym.U'), el('sub', {}, 'AB')]), `${num(V, 2)} V`], [t('m.U'), `${num(st.U, 1)} V`]);
    if (st.rows.length) ui.clearRow.hidden = false;
    tableBuilder = () => charTable(st);
    drawGraph(st);
  } else if (tab === 'ohmmeter') {
    if (st.mode === 'measure') {
      const R = OHM_RANGES[st.range];
      const Rv = ohmValue(st);
      const best = bestOhmRange(Rv);
      rows.push([t('m.range'), R.kind ? `${R.label} Ω` : 'OFF']);
      if (R.kind) {
        const r = reading(R, Rv, 'VΩ');
        rows.push([t('m.display'), r.overload ? t('m.over') : `${r.text} ${R.unit}`]);
        rows.push([t('m.adequate'), st.range === best ? t('adeq.yes') : r.overload ? t('adeq.larger') : t('adeq.smaller')]);
      }
      tableBuilder = () => (st.part === 'unknown' || st.part === 'wire' ? unknownTable(st, Rv) : colourTable(st, PARTS[st.part]));
    } else tableBuilder = () => testTable(st);
  } else if (tab === 'joule') {
    const { I, P } = jouleValues(st);
    rows.push([t('sym.U'), `${num(st.V, 1)} V`], ['I', `${num(I * 1000, 1)} mA`], [t('m.state'), t(st.burnt ? 'state.burnt' : P > PMAX ? 'state.hot' : 'state.ok')]);
    if (st.rows.length) ui.clearRow.hidden = false;
    tableBuilder = () => jouleTables(st);
  } else if (tab === 'grouping') {
    rows.push([t('m.ohm'), `${num(measuredR(st), 1)} Ω`], [t('m.between'), st.meas === 'AB' ? 'A – B' : st.meas]);
    tableBuilder = () => groupTable(st);
  } else if (tab === 'applications') {
    const v = appValues(st);
    if (st.scene === 'short') rows.push(['I', `${num(v.I, 2)} A`], [t('m.lamp'), t(v.Ilamp > 0 ? 'lamp.on' : 'lamp.off')], [t('m.Ubat'), `${num(E - R_INT * v.I, 2)} V`]);
    else if (st.scene === 'rheostat') rows.push(['Rh', `${num(v.Rh, 0)} Ω`], ['I', `${num(v.I * 1000, 1)} mA`]);
    else rows.push([t('m.Vin'), '6 V'], [t('m.Vout'), `${num(v.Vout, 2)} V`]);
    tableBuilder = () => appTable(st);
  }
  ui.dl.replaceChildren(...rows.flatMap(([k, val]) => [el('dt', {}, k), el('dd', {}, val)]));
  if (!st.fb) ui.status.hidden = true;
  else { ui.status.hidden = false; ui.status.className = `status ${st.fb.type || ''}`; ui.status.textContent = t(st.fb.key); }
  if (tableBuilder) {
    const sig = JSON.stringify([tab, st.mode, st.part, st.load, st.scene, st.r, st.bands, st.unknown, st.rows?.length]) + calcSig([st, ...(st.rows || [])]);
    if (sig !== ui.sig) { ui.sig = sig; ui.tables.replaceChildren(...tableBuilder()); }
  } else { ui.sig = null; ui.tables.replaceChildren(); }
}

function drawGraph(st) {
  const pts = st.rows.map((r) => [r.I / 1000, r.V]);
  const firstOk = st.rows.find((r) => r.calc?.k?.ok);
  graph.draw({
    xLabel: 'I (A)', yLabel: `${t('sym.U')}AB (V)`, xMax: st.load === 'wire' ? 0.6 : 0.4, yMax: st.load === 'wire' ? 5 : 10,
    series: [{ color: cssVar('--accent'), points: pts, slope: firstOk && st.load !== 'lamp' ? LOADS[st.load] : undefined }],
  });
}
function charTable(st) {
  if (!st.rows.length) return [el('p', { class: 'muted', style: 'margin:8px 0 0;font-size:0.88rem' }, t('tbl.charEmpty'))];
  const body = st.rows.map((r) => el('tr', {}, [td(`${r.I}`), td(num(r.V, 2)), calcCell(r, 'k', { expected: r.V / (r.I / 1000), decimals: 1, tol: Math.max(0.15, 0.01 * r.V / (r.I / 1000)), onCheck: onCheckFor(st) })]));
  return [el('div', { class: 'table-scroll' }, el('table', { class: 'data' }, [
    el('thead', {}, el('tr', {}, [th('I (mA)'), th(el('span', { class: 'keep-case' }, [t('sym.U'), el('sub', {}, 'AB'), ' (V)'])), th(el('span', { class: 'keep-case' }, [t('sym.U'), el('sub', {}, 'AB'), ' / I (Ω)']))])),
    el('tbody', {}, body)]))];
}
function colourTable(st, P) {
  const R0 = P.nominal, dR = (R0 * TOL[P.tol]) / 100;
  return [el('p', { class: 'muted', style: 'margin:8px 0 4px;font-size:0.88rem' }, t('tbl.colour')),
    el('table', { class: 'data' }, [el('thead', {}, el('tr', {}, [th(t('col.qty')), th(t('col.value'))])), el('tbody', {}, [
      el('tr', {}, [td(t('row.Rcode')), calcCell(st, 'R', { expected: R0, decimals: 0, tol: 0.5, onCheck: onCheckFor(st) })]),
      el('tr', {}, [td(t('row.dR')), calcCell(st, 'dR', { expected: dR, decimals: 1, tol: 0.05, onCheck: onCheckFor(st) })]),
      el('tr', {}, [td(t('row.inside')), td(t('row.insideAns'))]),
    ])])];
}
function unknownTable(st, Rv) {
  const best = bestOhmRange(Rv);
  const shown = Number(reading(OHM_RANGES[best], Rv, 'VΩ').value.toFixed(OHM_RANGES[best].dec)) / OHM_RANGES[best].k;
  return [el('table', { class: 'data' }, [el('thead', {}, el('tr', {}, [th(t('col.qty')), th(t('col.value'))])), el('tbody', {}, [
    el('tr', {}, [td(t('row.Rread')), calcCell(st, 'Ru', { expected: shown, decimals: 1, tol: Math.max(0.05, shown * 0.005), onCheck: onCheckFor(st) })]),
  ])])];
}
function testTable(st) {
  const R0 = valueOf(st.bands), dR = (R0 * TOL[st.bands[3]]) / 100;
  return [el('table', { class: 'data' }, [el('thead', {}, el('tr', {}, [th(t('col.qty')), th(t('col.value'))])), el('tbody', {}, [
    el('tr', {}, [td(t('row.Rcode')), calcCell(st, 'tR', { expected: R0, decimals: 0, tol: 0.5, onCheck: onCheckFor(st) })]),
    el('tr', {}, [td(t('row.dR')), calcCell(st, 'tdR', { expected: dR, decimals: 1, tol: Math.max(0.05, dR * 0.001), onCheck: onCheckFor(st) })]),
  ])])];
}
function jouleTables(st) {
  const out = [];
  if (st.rows.length) {
    const body = st.rows.map((r) => el('tr', {}, [td(num(r.V, 1)), td(num(r.I, 1)), calcCell(r, 'P', { expected: (r.V * r.I) / 1000, decimals: 3, tol: Math.max(0.0015, 0.01 * (r.V * r.I) / 1000), onCheck: onCheckFor(st) })]));
    out.push(el('div', { class: 'table-scroll' }, el('table', { class: 'data' }, [el('thead', {}, el('tr', {}, [th(`${t('sym.U')} (V)`), th('I (mA)'), th(`P = ${t('sym.U')} I (W)`)])), el('tbody', {}, body)])));
  } else out.push(el('p', { class: 'muted', style: 'margin:8px 0 0;font-size:0.88rem' }, t('tbl.jouleEmpty')));
  out.push(el('h3', { style: 'margin:14px 0 0;font-size:0.95rem' }, t('tbl.book')));
  const ex = [['p5', Math.sqrt(PMAX * R_J), 2], ['p1J', 1.8, 1], ['p1k', 0.5, 1], ['p2', 1500 / 220, 2], ['p3', 400, 0]];
  out.push(el('table', { class: 'data' }, [el('thead', {}, el('tr', {}, [th(t('col.q')), th(t('col.answer'))])),
    el('tbody', {}, ex.map(([k, v, d]) => el('tr', {}, [td(t(`row.${k}`)), calcCell(st, k, { expected: v, decimals: d, tol: Math.max(0.011, v * 0.01), onCheck: onCheckFor(st) })])))]));
  return out;
}
function groupTable(st) {
  return [el('table', { class: 'data' }, [el('thead', {}, el('tr', {}, [th(t('col.qty')), th(t('col.value'))])), el('tbody', {}, [
    el('tr', {}, [td(t(`row.req.${st.mode}`)), calcCell(st, 'req', { expected: req(st), decimals: 1, tol: 0.15, onCheck: onCheckFor(st) })]),
  ])]), el('p', { class: 'muted', style: 'margin:8px 0 0;font-size:0.88rem' }, t('tbl.groupCheck'))];
}
function appTable(st) {
  const rowsByScene = {
    short: [['shortI', E / (R_INT + 0.05), 2], ['protI', E / (R_INT + 10), 3]],
    rheostat: [['imax', 1000 * 6 / 82, 1], ['imin', 1000 * 6 / 182, 1]],
    divider: [['vout', 6 * 40 / 100, 2], ['vout2', 6 * 75 / 100, 2]],
  };
  return [el('table', { class: 'data' }, [el('thead', {}, el('tr', {}, [th(t('col.q')), th(t('col.answer'))])),
    el('tbody', {}, rowsByScene[st.scene].map(([k, v, d]) => el('tr', {}, [td(t(`row.${k}`)), calcCell(st, k, { expected: v, decimals: d, tol: Math.max(0.011, v * 0.01), onCheck: onCheckFor(st) })])))])];
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
  initialTab: 'characteristic',
  onTab: buildTab,
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, get tab() { return shell.tab; }, charValues, req, appValues, jouleValues };
