// Grade 9 — Resistors / Conducteurs ohmiques (Ch.8 Act. 1–8, Further study: colour code, Ex. 12, 13, 16, 17)
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num } from '../../../shared/format.js';
import { createButton, createSegmented, createSlider, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, font } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { calcCell, calcSig, calcDone } from '../../../shared/calc-cell.js';
import { drawLamp, drawCurrentArrows, labelI, drawMeterBox, drawLead, METER_HALF as MH } from '../../../shared/circuit-draw.js';
import { drawMultimeter, meterLead, reading } from '../../../shared/multimeter-draw.js';
import { createGraph } from '../../../shared/graph.js';

/* ================================================================
   Model
   ================================================================ */
const E0 = 6.34; // V, the Grade 9 dry cell (owner, 2 Nov 2026)
const R_ACT1 = 50.0; // Ω, resistor of Activity 1: 6.34 V / 50 Ω = 127 mA as on the photo of Fig. 1
const R_ACT3 = 50.8; // Ω, the 51 Ω resistor of Activities 3–4 (the ohmmeter of Fig. 4c and 6a reads 50.8 Ω)
// Ex. 13: characteristic of an incandescent lamp (U in V, I in mA); beyond 5 V extended with the last slope (illustrative)
const LAMP = [[0, 0], [1, 110], [2, 165], [3, 188], [4, 200], [5, 208]];
function lampCurrent(U) {
  if (U >= 5) return 208 + 8 * (U - 5);
  for (let i = 1; i < LAMP.length; i++) {
    const [u0, i0] = LAMP[i - 1], [u1, i1] = LAMP[i];
    if (U <= u1) return i0 + ((i1 - i0) * (U - u0)) / (u1 - u0);
  }
  return 0;
}
// Colour code (Further study, Fig. 25)
const COLORS = ['black', 'brown', 'red', 'orange', 'yellow', 'green', 'blue', 'violet', 'grey', 'white'];
const HEX = { black: '#1b1b1b', brown: '#7b4a26', red: '#d22a2a', orange: '#f08a1c', yellow: '#f2d21b', green: '#2e9e4a', blue: '#2b5fd9', violet: '#8a3fc4', grey: '#8c8c8c', white: '#f4f4f4', gold: '#c9a227', silver: '#b9bec4' };
const TOL = { gold: 5, silver: 10 };
function bandsOf(nominal, tol = 'gold') {
  let zeros = 0, v = Math.round(nominal);
  while (v >= 100) { v = Math.round(v / 10); zeros++; }
  return [COLORS[Math.floor(v / 10)], COLORS[v % 10], COLORS[zeros], tol];
}
const valueOf = (b) => (COLORS.indexOf(b[0]) * 10 + COLORS.indexOf(b[1])) * 10 ** COLORS.indexOf(b[2]);
// Resistors of the grouping activities: nominal value (colour code) → value read by the ohmmeter
const STOCK = { 10: 10.1, 20: 19.8, 39: 38.7, 51: 50.8, 68: 67.5, 100: 98.6, 220: 218.4 };
// Ohmmeter (Activity 4): resistors to measure
const OHM_PARTS = { act3: 50.8, r100: 98.6, r220: 218.4, r4k7: 4650, r10k: 9930, r1M: 1.012e6 };
const OHM_NOMINAL = { act3: 51, r100: 100, r220: 220, r4k7: 4700, r10k: 10000, r1M: 1e6 };
const UNKNOWN = [33, 150, 330, 680, 1500, 3300, 47000, 220000];
const E12 = [10, 12, 15, 18, 22, 27, 33, 39, 47, 56, 68, 82];
// Ohmmeter ranges: label, display unit and decimals as on a usual 3½-digit multimeter
const RANGES = {
  off: { kind: null, angle: 180 },
  r200: { kind: 'O', max: 199.9, dec: 1, k: 1, unit: 'Ω', jack: 'VΩ', label: '200', angle: -150 },
  r2k: { kind: 'O', max: 1.999, dec: 3, k: 1e-3, unit: 'kΩ', jack: 'VΩ', label: '2k', angle: -120 },
  r20k: { kind: 'O', max: 19.99, dec: 2, k: 1e-3, unit: 'kΩ', jack: 'VΩ', label: '20k', angle: -90 },
  r200k: { kind: 'O', max: 199.9, dec: 1, k: 1e-3, unit: 'kΩ', jack: 'VΩ', label: '200k', angle: -60 },
  r2M: { kind: 'O', max: 1.999, dec: 3, k: 1e-6, unit: 'MΩ', jack: 'VΩ', label: '2M', angle: -30 },
  r20M: { kind: 'O', max: 19.99, dec: 2, k: 1e-6, unit: 'MΩ', jack: 'VΩ', label: '20M', angle: 0 },
};
const DIAL = ['off', 'r200', 'r2k', 'r20k', 'r200k', 'r2M', 'r20M'];
const JACKS = [{ name: '10A' }, { name: 'mA' }, { name: 'COM' }, { name: 'VΩ', label: 'VΩ' }];
const bestRange = (R) => DIAL.slice(1).find((id) => R * RANGES[id].k <= RANGES[id].max);
const rand = (a) => a[Math.floor(Math.random() * a.length)];

function newUnknown() { return Math.round(rand(UNKNOWN) * (0.97 + Math.random() * 0.06) * 10) / 10; }
function newTest() {
  const v = rand(E12) * 10 ** Math.floor(Math.random() * 5);
  return { bands: bandsOf(v, Math.random() < 0.6 ? 'gold' : 'silver'), calc: {} };
}
function initialState(tab) {
  switch (tab) {
    case 'terminals': return { reversed: false, fb: null };
    case 'rheo': return { x: 0.5, fb: null };
    case 'char': return { x: 0, comp: 'resistor', rows: [], fb: null };
    case 'ohm': return { part: 'act3', range: 'off', connected: true, unknown: newUnknown(), calc: {}, fb: null };
    case 'group': return { r1: 51, r2: 100, mode: 'sep', meas: 'R1', seen: {}, rows: [], fb: null };
    default: return { mode: 'explore', bands: ['yellow', 'violet', 'red', 'silver'], ring: 0, test: newTest(), fb: null };
  }
}
const TABS = ['terminals', 'rheo', 'char', 'ohm', 'group', 'colour'];
let S = Object.fromEntries(TABS.map((k) => [k, initialState(k)]));

const evalTerminals = () => ({ I: E0 / R_ACT1 });
const evalRheo = (st) => ({ U: E0 * st.x });
function evalChar(st) {
  const U = E0 * st.x;
  const I = st.comp === 'lamp' ? lampCurrent(U) : (1000 * U) / R_ACT3; // mA
  return { U: Math.round(U * 100) / 100, I: Math.round(I * 10) / 10 };
}
function ohmValue(st) { return st.part === 'unknown' ? st.unknown : OHM_PARTS[st.part]; }
function evalOhm(st) {
  const R = RANGES[st.range];
  const Rv = ohmValue(st);
  const r = R.kind ? reading(R, st.connected ? Rv : Infinity, 'VΩ') : { text: '' };
  return { R: Rv, range: R, r, best: bestRange(Rv) };
}
function evalGroup(st) {
  const a = STOCK[st.r1], b = STOCK[st.r2];
  const Re = st.mode === 'series' ? a + b : st.mode === 'parallel' ? (a * b) / (a + b) : st.meas === 'R1' ? a : b;
  return { a, b, Re: Math.round(Re * 10) / 10 };
}
const EVAL = { terminals: evalTerminals, rheo: evalRheo, char: evalChar, ohm: evalOhm, group: evalGroup, colour: () => ({}) };
const evaluate = (tab, st) => EVAL[tab](st);

/* ================================================================
   Canvas
   ================================================================ */
const HEIGHTS = { terminals: 340, rheo: 360, char: 380, ohm: 380, group: 400, colour: 380 };
let shell;
const anim = { ph: 0 };
let hit = [];
let drag = null;
let drawQueued = false;
const canvas = document.getElementById('stage');
canvas.style.touchAction = 'none';
const view = setupCanvas(canvas, { width: 600, height: 340, maxHeightVh: () => (window.innerWidth < 880 ? 46 : 74), onResize: () => requestDraw() });
const diag = setupCanvas(document.getElementById('diagram'), { width: 360, height: 200, maxHeightVh: 30, onResize: () => requestDraw() });
const graph = createGraph(document.getElementById('graph'), { width: 360, height: 240, maxHeightVh: 36 });
const graphCard = document.getElementById('graph-card');
function requestDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; draw(); });
}
onThemeChange(() => requestDraw());
const cur = () => S[shell.tab];

function tag(ctx, s, x, y, color = cssVar('--text'), size = 14, align = 'center') {
  ctx.fillStyle = color;
  ctx.font = font(size, 800);
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}
function line(ctx, pts, color = cssVar('--wire'), w = 4) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
}
function dot(ctx, x, y, r = 5) { ctx.fillStyle = cssVar('--wire'); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
// Dry cell drawn from x1 (−… no: + on the left) to x2 at height y
function drawCell(ctx, cx, y, plusLeft = true) {
  ctx.fillStyle = cssVar('--battery');
  roundRect(ctx, cx - 56, y - 26, 112, 52, 6); ctx.fill();
  tag(ctx, '6 V', cx, y, '#ffffff', 15);
  tag(ctx, plusLeft ? '+' : '−', cx - 68, y - 22, plusLeft ? cssVar('--accent') : cssVar('--text'), 18);
  tag(ctx, plusLeft ? '−' : '+', cx + 68, y - 22, plusLeft ? cssVar('--text') : cssVar('--accent'), 18);
}
// Resistor: beige cylinder with four colour rings, centred at (x, y), horizontal
function drawResistor(ctx, x, y, bands, len = 90, h = 24) {
  line(ctx, [[x - len / 2 - 14, y], [x + len / 2 + 14, y]], cssVar('--metal'), 3);
  ctx.fillStyle = '#e8d3a8';
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1.2;
  roundRect(ctx, x - len / 2, y - h / 2, len, h, h / 2); ctx.fill(); ctx.stroke();
  const xs = [0.24, 0.38, 0.52, 0.8];
  bands.forEach((b, i) => {
    ctx.fillStyle = HEX[b];
    ctx.fillRect(x - len / 2 + xs[i] * len - len * 0.04, y - h / 2 + 1, len * 0.08, h - 2);
  });
  return xs.map((f) => x - len / 2 + f * len);
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
  hit = [];
  ({ terminals: drawTerminals, rheo: drawRheoScene, char: drawRheoScene, ohm: drawOhm, group: drawGroup, colour: drawColour })[tab](ctx, st, e, tab);
  drawDiagram(tab, st, e);
}

/* ---------- Activity 1: the two terminals ---------- */
function drawTerminals(ctx, st, e) {
  const CY = 70, BY = 250, XL = 80, XR = 520, CX = 300, RX = 220, AX = 400;
  drawCell(ctx, CX, CY);
  line(ctx, [[CX - 68, CY], [XL, CY], [XL, BY], [RX - 60, BY]]);
  line(ctx, [[RX + 60, BY], [AX - MH, BY]]);
  line(ctx, [[AX + MH, BY], [XR, BY], [XR, CY], [CX + 68, CY]]);
  drawResistor(ctx, RX, BY, bandsOf(51));
  // terminals A and B of the resistor (A on the side of the ammeter in Fig. 1a)
  const [left, right] = st.reversed ? ['A', 'B'] : ['B', 'A'];
  tag(ctx, left, RX - 62, BY + 24, cssVar('--accent'), 16);
  tag(ctx, right, RX + 62, BY + 24, cssVar('--accent'), 16);
  // conventional current: + (left of the cell) → left wire → resistor → ammeter → − ; ammeter: current enters at COM side? red on the left
  drawMeterBox(ctx, { x: AX, y: BY, kind: 'A', name: 'A', text: num(e.I * 1000, 1), unit: 'mA' });
  drawCurrentArrows(ctx, [[CX - 68, CY], [XL, CY], [XL, BY], [XR, BY], [XR, CY], [CX + 68, CY]], anim.ph,
    (x, y) => Math.abs(y - BY) < 1 && (Math.abs(x - RX) < 64 || Math.abs(x - AX) < MH + 4));
  labelI(ctx, XL - 22, (CY + BY) / 2, Math.PI / 2);
}

/* ---------- Activities 2–3: rheostat (potentiometer) and characteristic ---------- */
const RH = { y: 170, xa: 90, xb: 390, c0: 104, c1: 376, cy: 222 };
const cursorX = (x) => RH.c1 - x * (RH.c1 - RH.c0); // x = 0 at B, 1 at A
function drawRheostat(ctx, st) {
  const { y, xa, xb } = RH;
  // coil
  ctx.fillStyle = cssVar('--surface');
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1.2;
  roundRect(ctx, xa + 8, y - 16, xb - xa - 16, 32, 8); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = cssVar('--copper');
  ctx.lineWidth = 1.6;
  for (let x = xa + 12; x < xb - 10; x += 5) { ctx.beginPath(); ctx.moveTo(x, y - 14); ctx.lineTo(x + 2.5, y + 14); ctx.stroke(); }
  // rail under the coil and cursor C
  ctx.fillStyle = cssVar('--pan-metal');
  ctx.fillRect(xa + 10, y + 24, xb - xa - 20, 6);
  const cx = cursorX(st.x);
  ctx.fillStyle = cssVar('--socket');
  roundRect(ctx, cx - 14, y + 14, 28, 22, 5); ctx.fill();
  ctx.fillStyle = cssVar('--accent');
  ctx.beginPath(); ctx.moveTo(cx, y + 12); ctx.lineTo(cx - 6, y + 20); ctx.lineTo(cx + 6, y + 20); ctx.closePath(); ctx.fill();
  dot(ctx, cx, RH.cy);
  tag(ctx, 'C', cx - 18, RH.cy + 10, cssVar('--text'), 15);
  dot(ctx, xa, y); dot(ctx, xb, y);
  tag(ctx, 'A', xa - 4, y - 28, cssVar('--text'), 15);
  tag(ctx, 'B', xb + 4, y - 28, cssVar('--text'), 15);
  hit.push({ kind: 'cursor', x: cx, y: y + 24, r: 34 });
}
function drawRheoScene(ctx, st, e, tab) {
  const CY = 60;
  drawCell(ctx, 240, CY);
  line(ctx, [[172, CY], [50, CY], [50, RH.y], [RH.xa, RH.y]]);
  line(ctx, [[RH.xb, RH.y], [420, RH.y], [420, CY], [308, CY]]);
  drawRheostat(ctx, st);
  const loop = [[172, CY], [50, CY], [50, RH.y], [420, RH.y], [420, CY], [308, CY]];
  const cx = cursorX(st.x);
  if (tab === 'rheo') {
    drawCurrentArrows(ctx, loop, anim.ph, (x, y) => Math.abs(y - RH.y) < 1 && x > RH.xa - 4 && x < RH.xb + 4);
    labelI(ctx, 28, (CY + RH.y) / 2, Math.PI / 2);
    // voltmeter between C and the terminal B (connected to the negative pole)
    const VX = 250, VY = 300;
    drawMeterBox(ctx, { x: VX, y: VY, kind: 'V', name: 'V', text: num(e.U, 2), unit: 'V' });
    drawLead(ctx, [VX - MH, VY], [cx, RH.cy], cssVar('--accent'), [Math.min(cx, VX - MH) - 30, VY]);
    drawLead(ctx, [VX + MH, VY], [420, RH.y + 40], cssVar('--lead-black'), [440, VY]);
    line(ctx, [[420, RH.y], [420, RH.y + 40]]);
    dot(ctx, 420, RH.y + 40, 4);
    tag(ctx, `${t('rheo.ucb')} = ${num(e.U, 2)} V`, 470, 330, cssVar('--text'), 13);
    return;
  }
  // Activity 3: branch C → ammeter → component → B; voltmeter across the component
  const AX = 488, BY = 290, KX = 500, KY = RH.y;
  line(ctx, [[cx, RH.cy], [cx, BY], [AX - MH, BY]]);
  line(ctx, [[AX + MH, BY], [560, BY], [560, KY], [KX + 44, KY]]);
  line(ctx, [[KX - 44, KY], [420, KY]]);
  dot(ctx, 420, KY);
  if (st.comp === 'lamp') {
    line(ctx, [[KX + 44, KY], [KX + 30, KY]]); line(ctx, [[KX - 44, KY], [KX - 30, KY]]);
    drawLamp(ctx, { x: KX, y: KY, glow: Math.min(1, e.I / 210) });
  } else drawResistor(ctx, KX, KY, bandsOf(51), 62, 20);
  drawMeterBox(ctx, { x: AX, y: BY, kind: 'A', name: 'A', text: num(e.I, 1), unit: 'mA' });
  const VX = 500, VY = 102;
  drawMeterBox(ctx, { x: VX, y: VY, kind: 'V', name: 'V', text: num(e.U, 2), unit: 'V', flip: true });
  line(ctx, [[VX + MH, VY], [KX + 44, VY], [KX + 44, KY]], cssVar('--accent'), 2.5);
  line(ctx, [[VX - MH, VY], [KX - 44, VY], [KX - 44, KY]], cssVar('--lead-black'), 2.5);
  if (e.I > 0.05) {
    drawCurrentArrows(ctx, [[cx, RH.cy], [cx, BY], [560, BY], [560, KY], [420, KY]], anim.ph,
      (x, y) => (Math.abs(y - BY) < 1 && Math.abs(x - AX) < MH + 4) || (Math.abs(y - KY) < 1 && Math.abs(x - KX) < 48));
    labelI(ctx, 580, (BY + KY) / 2, Math.PI / 2);
  }
}

/* ---------- Activity 4: the ohmmeter ---------- */
function drawOhm(ctx, st, e) {
  const RX = 190, RY = 200;
  const nominal = st.part === 'unknown' ? null : OHM_NOMINAL[st.part];
  const bands = st.part === 'unknown' ? ['grey', 'grey', 'grey', 'grey'] : bandsOf(nominal, st.part === 'r1M' ? 'silver' : 'gold');
  drawResistor(ctx, RX, RY, bands, 120, 30);
  if (st.part === 'unknown') tag(ctx, t('ohm.unknownTag'), RX, RY - 36, cssVar('--muted'), 13);
  const J = drawMultimeter(ctx, {
    x: 396, y: 20, w: 190, h: 340, ranges: RANGES, order: DIAL, value: st.range, offLabel: 'OFF', jacks: JACKS,
    text: e.r.text, unit: e.range.kind ? e.range.unit : '', overload: e.r.overload, zoneV: 'Ω', zoneA: ' ',
  });
  for (const d of J.dial) hit.push({ kind: 'dial', id: d.id, x: d.x, y: d.y, r: d.r });
  const ends = st.connected ? [[RX - 74, RY], [RX + 74, RY]] : [[RX - 90, RY + 90], [RX + 60, RY + 110]];
  meterLead(ctx, J.jacks['VΩ'], ends[1], cssVar('--accent'), [J.jacks['VΩ'][0], 372], [ends[1][0] + 40, ends[1][1] + 120]);
  meterLead(ctx, J.jacks.COM, ends[0], cssVar('--lead-black'), [J.jacks.COM[0], 380], [ends[0][0] - 20, ends[0][1] + 140]);
  hit.push({ kind: 'connect', x: RX, y: RY, r: 70 });
}

/* ---------- Activities 5–8: grouping ---------- */
function drawGroup(ctx, st, e) {
  const Y = 170, XA = 110, XB = 490;
  const b1 = bandsOf(st.r1), b2 = bandsOf(st.r2);
  let ends;
  if (st.mode === 'series') {
    line(ctx, [[XA, Y], [XB, Y]]);
    drawResistor(ctx, 210, Y, b1); drawResistor(ctx, 390, Y, b2);
    dot(ctx, 300, Y, 4); tag(ctx, 'C', 300, Y - 22);
    ends = [[XA, Y], [XB, Y]];
  } else if (st.mode === 'parallel') {
    line(ctx, [[XA, Y], [160, Y]]); line(ctx, [[440, Y], [XB, Y]]);
    line(ctx, [[160, Y - 50], [160, Y + 50]]); line(ctx, [[440, Y - 50], [440, Y + 50]]);
    line(ctx, [[160, Y - 50], [440, Y - 50]]); line(ctx, [[160, Y + 50], [440, Y + 50]]);
    drawResistor(ctx, 300, Y - 50, b1); drawResistor(ctx, 300, Y + 50, b2);
    dot(ctx, 160, Y); dot(ctx, 440, Y);
    ends = [[XA, Y], [XB, Y]];
  } else {
    drawResistor(ctx, 300, Y - 50, b1); drawResistor(ctx, 300, Y + 50, b2);
    const yy = st.meas === 'R1' ? Y - 50 : Y + 50;
    ends = [[300 - 62, yy], [300 + 62, yy]];
  }
  tag(ctx, `R1 (${st.r1} Ω)`, st.mode === 'series' ? 210 : 300, (st.mode === 'series' ? Y : Y - 50) - 30, cssVar('--text'), 13);
  tag(ctx, `R2 (${st.r2} Ω)`, st.mode === 'series' ? 390 : 300, (st.mode === 'series' ? Y : Y + 50) + 30, cssVar('--text'), 13);
  if (st.mode !== 'sep') { dot(ctx, XA, Y); dot(ctx, XB, Y); tag(ctx, 'A', XA - 16, Y - 16); tag(ctx, 'B', XB + 16, Y - 16); }
  const MX = 300, MY = 330;
  drawMeterBox(ctx, { x: MX, y: MY, kind: 'V', name: 'Ω', text: num(e.Re, 1), unit: 'Ω' });
  drawLead(ctx, [MX - MH, MY], ends[0], cssVar('--accent'), [ends[0][0] - 40, MY]);
  drawLead(ctx, [MX + MH, MY], ends[1], cssVar('--lead-black'), [ends[1][0] + 40, MY]);
  tag(ctx, t(`meas.${st.mode === 'sep' ? st.meas : 'Re'}`), MX, MY + 44, cssVar('--muted'), 12);
}

/* ---------- Further study: colour code ---------- */
function drawColour(ctx, st) {
  const bands = st.mode === 'test' ? st.test.bands : st.bands;
  const xs = drawResistor(ctx, 180, 180, bands, 240, 64);
  xs.forEach((x, i) => {
    tag(ctx, String(i + 1), x, 128, st.mode === 'explore' && i === st.ring ? cssVar('--primary') : cssVar('--muted'), 15);
    if (st.mode === 'explore' && i === st.ring) {
      ctx.strokeStyle = cssVar('--primary'); ctx.lineWidth = 3;
      roundRect(ctx, x - 16, 140, 32, 80, 6); ctx.stroke();
    }
    hit.push({ kind: 'ring', id: i, x, y: 180, r: 22 });
  });
  tag(ctx, t('colour.left'), 60, 240, cssVar('--muted'), 12, 'left');
  // table of the code (Fig. 25)
  const x0 = 348, y0 = 30, rh = 26;
  ctx.font = font(11, 800);
  tag(ctx, t('colour.colTitle'), x0 + 50, y0, cssVar('--muted'), 11);
  tag(ctx, t('colour.colDigit'), x0 + 130, y0, cssVar('--muted'), 11);
  tag(ctx, t('colour.colMult'), x0 + 196, y0, cssVar('--muted'), 11);
  [...COLORS, 'gold', 'silver'].forEach((c, i) => {
    const y = y0 + 20 + i * rh;
    ctx.fillStyle = HEX[c];
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1;
    roundRect(ctx, x0, y - 9, 22, 18, 3); ctx.fill(); ctx.stroke();
    tag(ctx, t(`c.${c}`), x0 + 30, y, cssVar('--text'), 12, 'left');
    if (i < 10) { tag(ctx, String(i), x0 + 130, y, cssVar('--text'), 12); tag(ctx, `10${sup(i)}`, x0 + 196, y, cssVar('--text'), 12); }
    else tag(ctx, `${TOL[c]} %`, x0 + 196, y, cssVar('--text'), 12);
  });
}
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const sup = (n) => String(n).split('').map((d) => SUP[d]).join('');

/* ---------- Diagrams ---------- */
function drawDiagram(tab, st, e) {
  const ctx = diag.begin();
  const ink = cssVar('--text');
  ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = 2; ctx.lineCap = 'round';
  const L = (pts, c = ink, w = 2) => line(ctx, pts, c, w);
  const res = (x, y, lbl, vert = false) => {
    ctx.fillStyle = cssVar('--surface');
    if (vert) { ctx.fillRect(x - 8, y - 20, 16, 40); ctx.strokeRect(x - 8, y - 20, 16, 40); } else { ctx.fillRect(x - 20, y - 8, 40, 16); ctx.strokeRect(x - 20, y - 8, 40, 16); }
    if (lbl) label(ctx, lbl, vert ? x + 24 : x, vert ? y : y - 18, ink, 11);
  };
  const meter = (x, y, letter) => {
    ctx.fillStyle = cssVar('--surface');
    ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    label(ctx, letter, x, y + 1, ink, 13);
  };
  const cell = (x, y) => {
    L([[x - 4, y - 14], [x - 4, y + 14]]); L([[x + 4, y - 8], [x + 4, y + 8]], ink, 4);
    label(ctx, '+', x - 14, y - 16, ink, 12); label(ctx, '−', x + 14, y - 16, ink, 12);
  };
  if (tab === 'terminals') {
    L([[40, 40], [176, 40]]); L([[184, 40], [320, 40], [320, 160], [40, 160], [40, 40]]);
    cell(180, 40); res(120, 160, 'R'); meter(240, 160, 'A');
  } else if (tab === 'rheo' || tab === 'char') {
    L([[40, 30], [146, 30]]); L([[154, 30], [270, 30], [270, 90]]); L([[40, 30], [40, 90], [60, 90]]);
    cell(150, 30);
    ctx.strokeRect(60, 82, 190, 16); L([[250, 90], [270, 90]]);
    label(ctx, 'A', 60, 112, ink, 11); label(ctx, 'B', 250, 112, ink, 11);
    const cx = 60 + 190 * (1 - st.x);
    ctx.beginPath(); ctx.moveTo(cx, 78); ctx.lineTo(cx - 5, 70); ctx.lineTo(cx + 5, 70); ctx.closePath(); ctx.fill();
    label(ctx, 'C', cx, 62, ink, 11);
    if (tab === 'rheo') {
      L([[cx, 70], [cx, 56], [330, 56], [330, 140]]); L([[270, 90], [270, 170], [330, 170], [330, 140]]);
      meter(330, 140, 'V');
    } else {
      L([[cx, 70], [cx, 56], [340, 56], [340, 180], [270, 180], [270, 90]]);
      meter(340, 110, 'A'); res(305, 180, st.comp === 'lamp' ? '' : 'R');
      if (st.comp === 'lamp') { ctx.fillStyle = cssVar('--surface'); ctx.beginPath(); ctx.arc(305, 180, 10, 0, 7); ctx.fill(); ctx.stroke(); L([[298, 173], [312, 187]]); L([[312, 173], [298, 187]]); }
      L([[285, 180], [285, 150], [295, 150]]); L([[325, 150], [315, 150], [325, 150], [325, 180]]);
      meter(305, 150, 'V');
    }
  } else if (tab === 'ohm') {
    res(120, 100, 'R'); L([[60, 100], [100, 100]]); L([[140, 100], [180, 100]]);
    L([[60, 100], [60, 160], [100, 160]]); L([[180, 100], [180, 160], [140, 160]]);
    meter(120, 160, 'Ω');
    label(ctx, 'COM', 76, 178, ink, 10); label(ctx, 'Ω', 170, 178, ink, 10);
  } else if (tab === 'group') {
    if (st.mode === 'series') { L([[30, 80], [330, 80]]); res(130, 80, 'R1'); res(230, 80, 'R2'); label(ctx, 'A', 30, 64, ink, 11); label(ctx, 'B', 330, 64, ink, 11); }
    else if (st.mode === 'parallel') {
      L([[30, 80], [110, 80]]); L([[250, 80], [330, 80]]); L([[110, 50], [110, 110]]); L([[250, 50], [250, 110]]);
      L([[110, 50], [250, 50]]); L([[110, 110], [250, 110]]); res(180, 50, 'R1'); res(180, 110, '');
      label(ctx, 'R2', 180, 130, ink, 11);
    } else { res(120, 80, 'R1'); res(240, 80, 'R2'); }
    label(ctx, st.mode === 'series' ? 'Re = R1 + R2' : st.mode === 'parallel' ? '1/Re = 1/R1 + 1/R2' : t('diag.sep'), 180, 170, ink, 13);
  } else {
    label(ctx, t('diag.colour'), 180, 60, ink, 12);
    label(ctx, 'R = (10 a + b) × 10ⁿ Ω', 180, 110, ink, 15);
  }
}
function label(ctx, s, x, y, color, size = 12) {
  ctx.fillStyle = color || cssVar('--text');
  ctx.font = font(size, 800);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}

/* ================================================================
   Animation (current arrows)
   ================================================================ */
const loop = createLoop({
  dt: 1 / 60,
  step(dt) { if (!shell) return false; anim.ph += 80 * dt; return needsLoop(); },
  render: () => draw(),
});
function needsLoop() {
  const tab = shell.tab;
  if (tab === 'terminals' || tab === 'rheo') return true;
  if (tab === 'char') return evalChar(cur()).I > 0.05;
  return false;
}

/* ================================================================
   Pointer: drag the cursor, turn the selector, tap rings
   ================================================================ */
function setCursorFromX(px) {
  const x = Math.max(0, Math.min(1, (RH.c1 - px) / (RH.c1 - RH.c0)));
  cur().x = Math.round(x * 400) / 400;
  cur().fb = null;
  if (ui.pos) ui.pos.set(cur().x * 100);
  refresh();
}
canvas.addEventListener('pointerdown', (ev) => {
  const p = view.toLogical(ev);
  const h = hit.find((q) => Math.hypot(p.x - q.x, p.y - q.y) < q.r);
  if (!h) return;
  ev.preventDefault();
  if (h.kind === 'cursor') { drag = 'cursor'; canvas.setPointerCapture(ev.pointerId); setCursorFromX(p.x); return; }
  if (h.kind === 'dial') { change((s) => { s.range = h.id; }); return; }
  if (h.kind === 'connect') { change((s) => { s.connected = !s.connected; }); return; }
  if (h.kind === 'ring' && cur().mode === 'explore') { cur().ring = h.id; buildTab(); }
});
canvas.addEventListener('pointermove', (ev) => { if (drag === 'cursor') setCursorFromX(view.toLogical(ev).x); });
const endDrag = () => { drag = null; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

/* ================================================================
   Panels
   ================================================================ */
const controlsBody = document.getElementById('controls-body');
const measuresBody = document.getElementById('measures-body');
let ui = {};
function change(fn, keepFb = false) {
  const st = cur();
  fn(st);
  if (!keepFb) st.fb = null;
  refresh();
}
function refresh() {
  updateMeasures();
  if (shell && needsLoop()) loop.start(); else loop.stop();
  requestDraw();
}
function seg(labelKey, options, value, onChange) {
  return createSegmented({ labelKey, options: options.map(([v, k]) => ({ value: String(v), labelKey: k })), value: String(value), onChange });
}
const btnRow = (...b) => el('div', { class: 'btn-row', style: 'margin-top:8px' }, b);
const resetBtn = () => createButton({ labelKey: 'ui.reset', onClick: resetTab, variant: 'ghost' });
const hintP = (key) => el('p', { class: 'muted', style: 'margin:8px 0 0;font-size:0.88rem', dataset: { i18n: key } }, t(key));

function build() {
  const tab = shell.tab;
  const st = cur();
  const items = [];
  if (tab === 'terminals') {
    items.push(btnRow(createButton({ labelKey: 'ctl.reverse', variant: 'primary', onClick: () => change((s) => { s.reversed = !s.reversed; s.fb = { type: 'good', key: 'fb.reversed' }; }, true) }), resetBtn()));
  } else if (tab === 'rheo' || tab === 'char') {
    ui.pos = createSlider({ labelKey: 'ctl.pos', min: 0, max: 100, step: 0.25, value: st.x * 100, unit: '%', decimals: 0, onInput: (v) => change((s) => { s.x = v / 100; }) });
    items.push(ui.pos.root);
    if (tab === 'rheo') {
      items.push(btnRow(...['B', 'mid', 'A'].map((k) => createButton({ labelKey: `ctl.at${k}`, onClick: () => { const x = k === 'B' ? 0 : k === 'A' ? 1 : 0.5; ui.pos.set(x * 100); change((s) => { s.x = x; }); } })), resetBtn()));
    } else {
      ui.comp = seg('ctl.comp', [['resistor', 'comp.resistor'], ['lamp', 'comp.lamp']], st.comp, (v) => { const s = cur(); s.comp = v; s.rows = []; s.fb = null; buildTab(); });
      const record = () => {
        const s = cur(); const e = evalChar(s);
        if (s.rows.some((r) => Math.abs(r.U - e.U) < 0.005)) { s.fb = { type: 'warn', key: 'fb.sameU' }; updateMeasures(); return; }
        s.rows.push({ U: e.U, I: e.I });
        s.rows.sort((a, b) => a.U - b.U);
        if (s.rows.length > 10) s.rows.shift();
        s.fb = { type: 'good', key: 'fb.recorded' };
        updateMeasures();
      };
      items.push(ui.comp.root, btnRow(createButton({ labelKey: 'ctl.record', variant: 'primary', onClick: record }), resetBtn()));
    }
    items.push(hintP('hint.drag'));
  } else if (tab === 'ohm') {
    ui.part = seg('ctl.part', [...Object.keys(OHM_PARTS), 'unknown'].map((k) => [k, `part.${k}`]), st.part, (v) => change((s) => { s.part = v; if (v === 'unknown') { s.unknown = newUnknown(); s.calc = {}; } }));
    ui.range = seg('ctl.range', DIAL.map((id) => [id, `range.${id}`]), st.range, (v) => change((s) => { s.range = v; }));
    ui.conn = seg('ctl.connected', [['yes', 'ctl.yes'], ['no', 'ctl.no']], st.connected ? 'yes' : 'no', (v) => change((s) => { s.connected = v === 'yes'; }));
    items.push(ui.part.root, ui.range.root, ui.conn.root,
      btnRow(createButton({ labelKey: 'ctl.newUnknown', onClick: () => change((s) => { s.part = 'unknown'; s.unknown = newUnknown(); s.calc = {}; }) }), resetBtn()), hintP('hint.ohm'));
  } else if (tab === 'group') {
    const vals = Object.keys(STOCK).map((v) => [v, `val.${v}`]);
    ui.r1 = seg('ctl.r1', vals, st.r1, (v) => change((s) => { s.r1 = Number(v); }));
    ui.r2 = seg('ctl.r2', vals, st.r2, (v) => change((s) => { s.r2 = Number(v); }));
    ui.mode = seg('ctl.mode', [['sep', 'mode.sep'], ['series', 'mode.series'], ['parallel', 'mode.parallel']], st.mode, (v) => { cur().mode = v; cur().fb = null; buildTab(); });
    items.push(ui.r1.root, ui.r2.root, ui.mode.root);
    if (st.mode === 'sep') {
      ui.meas = seg('ctl.meas', [['R1', 'meas.R1'], ['R2', 'meas.R2']], st.meas, (v) => change((s) => { s.meas = v; }));
      items.push(ui.meas.root);
    } else {
      const record = () => {
        const s = cur(); const e = evalGroup(s);
        const m1 = s.seen[`R1:${s.r1}`], m2 = s.seen[`R2:${s.r2}`];
        if (m1 == null || m2 == null) { s.fb = { type: 'warn', key: 'fb.measureFirst' }; updateMeasures(); return; }
        s.rows.push({ mode: s.mode, R1: m1, R2: m2, Re: e.Re });
        if (s.rows.length > 6) s.rows.shift();
        s.fb = { type: 'good', key: 'fb.groupRecorded' };
        updateMeasures();
      };
      items.push(btnRow(createButton({ labelKey: 'ctl.recordGroup', variant: 'primary', onClick: record })));
    }
    items.push(btnRow(resetBtn()), hintP('hint.group'));
  } else {
    ui.mode = seg('ctl.colourMode', [['explore', 'cmode.explore'], ['test', 'cmode.test']], st.mode, (v) => { cur().mode = v; cur().fb = null; buildTab(); });
    items.push(ui.mode.root);
    if (st.mode === 'explore') {
      ui.ring = seg('ctl.ring', [0, 1, 2, 3].map((i) => [i, `ring.${i}`]), st.ring, (v) => { cur().ring = Number(v); buildTab(); });
      const opts = st.ring === 3 ? ['gold', 'silver'] : st.ring === 0 ? COLORS.slice(1) : COLORS;
      ui.col = seg('ctl.colour', opts.map((c) => [c, `c.${c}`]), st.bands[st.ring], (v) => change((s) => { s.bands[s.ring] = v; }));
      items.push(ui.ring.root, ui.col.root, hintP('hint.colour'));
    } else {
      items.push(btnRow(createButton({ labelKey: 'ctl.newResistor', variant: 'primary', onClick: () => change((s) => { s.test = newTest(); }) }), resetBtn()), hintP('hint.colourTest'));
    }
  }
  controlsBody.append(...items);
  ui.dl = el('dl', { class: 'meas' });
  ui.status = el('div', { class: 'status', hidden: '' });
  ui.tables = el('div');
  ui.clear = createButton({ labelKey: 'ctl.clearTable', onClick: () => { const s = cur(); s.rows = []; s.fb = null; ui.sig = null; updateMeasures(); }, variant: 'ghost' });
  ui.clearRow = el('div', { class: 'btn-row', style: 'margin-top:8px' }, [ui.clear]);
  measuresBody.append(ui.dl, ui.status, ui.tables, ui.clearRow);
}

function updateMeasures() {
  if (!shell || !ui.dl) return;
  const tab = shell.tab;
  const st = cur();
  const e = evaluate(tab, st);
  const rows = [];
  let fb = st.fb;
  if (tab === 'terminals') {
    rows.push([t('m.I'), `${num(e.I * 1000, 1)} mA`], [t('m.ampSide'), st.reversed ? 'B' : 'A']);
  } else if (tab === 'rheo') {
    rows.push([t('m.posC'), `${num(st.x * 100, 0)} %`], [t('m.Ucb'), `${num(e.U, 2)} V`]);
  } else if (tab === 'char') {
    ui.comp.set(st.comp);
    rows.push([t('m.U'), `${num(e.U, 2)} V`], [t('m.Ima'), `${num(e.I, 1)} mA`]);
  } else if (tab === 'ohm') {
    ui.part.set(st.part); ui.range.set(st.range); ui.conn.set(st.connected ? 'yes' : 'no');
    rows.push([t('m.display'), !e.range.kind ? t('m.blank') : e.r.overload ? '1' : `${e.r.text} ${e.range.unit}`]);
    if (!fb) {
      if (!e.range.kind) fb = { type: '', key: 'fb.chooseOhm' };
      else if (!st.connected) fb = { type: '', key: 'fb.open' };
      else if (e.r.overload) fb = { type: 'warn', key: 'fb.ohmOver' };
      else if (st.range === e.best) fb = { type: 'good', key: 'fb.ohmBest' };
      else fb = { type: 'warn', key: 'fb.ohmSmaller' };
    }
  } else if (tab === 'group') {
    ui.r1.set(String(st.r1)); ui.r2.set(String(st.r2)); ui.mode.set(st.mode);
    if (st.mode === 'sep') { ui.meas.set(st.meas); st.seen[`${st.meas}:${st.meas === 'R1' ? st.r1 : st.r2}`] = e.Re; }
    rows.push([t(`meas.${st.mode === 'sep' ? st.meas : 'Re'}`), `${num(e.Re, 1)} Ω`]);
    const m1 = st.seen[`R1:${st.r1}`], m2 = st.seen[`R2:${st.r2}`];
    rows.push([t('m.seenR1'), m1 != null ? `${num(m1, 1)} Ω` : '…'], [t('m.seenR2'), m2 != null ? `${num(m2, 1)} Ω` : '…']);
  } else {
    if (st.mode === 'explore') {
      ui.ring.set(String(st.ring)); ui.col.set(st.bands[st.ring]);
      const R = valueOf(st.bands), tol = TOL[st.bands[3]];
      rows.push([t('m.R'), `${fmtOhm(R)}`], [t('m.tol'), `${tol} %`], [t('m.between'), `${fmtOhm(R * (1 - tol / 100))} – ${fmtOhm(R * (1 + tol / 100))}`]);
    } else rows.push([t('m.rings'), st.test.bands.map((c) => t(`c.${c}`)).join(' · ')]);
  }
  ui.dl.replaceChildren(...rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)]));
  showStatus(fb);
  buildTables(tab, st);
  updateGraph(tab, st);
}
function fmtOhm(R) { return `${num(R, R < 10 ? 1 : 0)} Ω`; }
function showStatus(fb) {
  if (!fb) { ui.status.hidden = true; return; }
  ui.status.hidden = false;
  ui.status.className = `status ${fb.type || ''}`;
  ui.status.textContent = t(fb.key, fb.params);
}

function buildTables(tab, st) {
  const rows = st.rows || [];
  const extra = tab === 'ohm' ? `${st.part}|${st.unknown}|${calcSig([st.calc])}` : tab === 'colour' ? `${st.mode}|${st.test.bands}|${calcSig([st.test])}` : '';
  const sig = `${tab}|${rows.length}|${calcSig(rows)}|${extra}|${st.comp || ''}`;
  if (sig === ui.sig) return;
  const th = (k) => el('th', { class: 'keep-case' }, t(k));
  const onCheck = (res) => {
    const s = cur();
    s.fb = res === 'invalid' ? { type: 'warn', key: 'calc.invalid' } : res === 'ok' ? { type: 'good', key: 'fb.calcOk' } : { type: 'bad', key: 'fb.calcWrong' };
    updateMeasures();
  };
  const parts = [];
  if (tab === 'char' && rows.length) {
    parts.push(el('table', { class: 'data' }, [el('thead', {}, el('tr', {}, [th('col.U'), th('col.I'), th('col.ratio')])),
      el('tbody', {}, rows.map((r) => el('tr', {}, [el('td', {}, num(r.U, 2)), el('td', {}, num(r.I, 1)),
        r.I > 0 ? calcCell(r, 'ratio', { expected: r.U / (r.I / 1000), decimals: 1, tol: Math.max(0.05, 0.01 * r.U / (r.I / 1000)), onCheck }) : el('td', {}, '—')])))]));
  } else if (tab === 'group' && rows.length) {
    parts.push(el('table', { class: 'data' }, [el('thead', {}, el('tr', {}, [th('col.mode'), th('col.R1'), th('col.R2'), th('col.Re'), th('col.Rcalc')])),
      el('tbody', {}, rows.map((r) => el('tr', {}, [el('td', {}, t(`mode.${r.mode}`)), el('td', {}, num(r.R1, 1)), el('td', {}, num(r.R2, 1)), el('td', {}, num(r.Re, 1)),
        calcCell(r, 'calc', { expected: r.mode === 'series' ? r.R1 + r.R2 : (r.R1 * r.R2) / (r.R1 + r.R2), decimals: 1, tol: 0.15, onCheck })])))]));
  } else if (tab === 'ohm' && st.part === 'unknown') {
    const best = bestRange(st.unknown);
    const shown = Number(reading(RANGES[best], st.unknown, 'VΩ').value.toFixed(RANGES[best].dec)) / RANGES[best].k;
    parts.push(el('table', { class: 'data' }, [el('thead', {}, el('tr', {}, [th('col.unknownR')])),
      el('tbody', {}, el('tr', {}, calcCell(st.calc, 'R', { expected: shown, decimals: 0, tol: Math.max(0.05, shown * 0.002), onCheck })))]));
  } else if (tab === 'colour' && st.mode === 'test') {
    const R = valueOf(st.test.bands), tol = TOL[st.test.bands[3]];
    const c = st.test;
    parts.push(el('table', { class: 'data' }, [el('thead', {}, el('tr', {}, [th('col.Rnom'), th('col.Rmin'), th('col.Rmax')])),
      el('tbody', {}, el('tr', {}, [
        calcCell(c, 'R', { expected: R, decimals: 0, tol: R * 1e-6, onCheck }),
        calcCell(c, 'min', { expected: R * (1 - tol / 100), decimals: R < 100 ? 1 : 0, tol: R * 1e-6 + 0.05, disabled: !calcDone(c, 'R'), onCheck }),
        calcCell(c, 'max', { expected: R * (1 + tol / 100), decimals: R < 100 ? 1 : 0, tol: R * 1e-6 + 0.05, disabled: !calcDone(c, 'R'), onCheck })]))]));
  }
  ui.tables.replaceChildren(...parts);
  ui.tables.hidden = parts.length === 0;
  ui.clearRow.hidden = !rows.length;
  ui.sig = sig;
}

function updateGraph(tab, st) {
  graphCard.hidden = tab !== 'char';
  if (tab !== 'char') return;
  const lamp = st.comp === 'lamp';
  const pts = st.rows.map((r) => [r.I, r.U]);
  const anyRatio = st.rows.some((r) => calcDone(r, 'ratio'));
  graph.draw({
    xLabel: t('graph.x'), yLabel: t('graph.y'), xMax: lamp ? 240 : 140, yMax: 7,
    series: [{ color: cssVar('--accent'), points: pts, slope: !lamp && anyRatio && pts.length >= 2 ? R_ACT3 / 1000 : undefined }],
  });
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
const xs = { en: {}, fr: {} };
for (const lang of ['en', 'fr']) {
  Object.assign(xs[lang], { 'range.off': 'OFF', 'range.r200': '200 Ω', 'range.r2k': '2 kΩ', 'range.r20k': '20 kΩ', 'range.r200k': '200 kΩ', 'range.r2M': '2 MΩ', 'range.r20M': '20 MΩ' });
  for (const v of Object.keys(STOCK)) xs[lang][`val.${v}`] = `${v} Ω`;
  [0, 1, 2, 3].forEach((i) => { xs[lang][`ring.${i}`] = String(i + 1); });
}
onLangChange(() => { if (shell) buildTab(); });

shell = initSim({
  strings: { en: { ...strings.en, ...xs.en }, fr: { ...strings.fr, ...xs.fr } },
  tabs: TABS.map((id) => ({ id, labelKey: `tab.${id}` })),
  initialTab: 'terminals',
  onTab: buildTab,
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, evaluate, cur: () => cur(), lampCurrent, bandsOf, valueOf };
