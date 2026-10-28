// Grade 7 — Grouping of lamps and of cells (Ch.12 Act. 1–6)
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num } from '../../../shared/format.js';
import { createButton, createSegmented, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, font } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import {
  drawLamp, drawSwitch, drawCurrentArrows, labelI, arrowHead, drawMeterBox, drawLead, METER_HALF as MH,
  symLamp, symMeter, symCell, symSwitch,
} from '../../../shared/circuit-draw.js';

/* ================================================================
   Model (values from the book's photos and text, pages 98–101)
   ================================================================ */
// One 6 V dry cell for Activities 1–5: E and its internal resistance r give 6.16 V at 0.188 A and 6.08 V at 0.508 A.
const E = 6.207; // V
const R_INT = 0.25; // Ω
// Activities 1–2 (series): two nearly identical lamps → I = 0.188 A, U1 = 3.10 V, U2 = 3.06 V
const SERIES_LAMPS = [{ R: 16.49, rated: 3.5 }, { R: 16.28, rated: 3.5 }];
// Activities 3–5 (parallel): two different lamps → I1 = 0.100 A, I2 = 0.407 A, I = 0.508 A
const PAR_LAMPS = [{ R: 60.56, rated: 6 }, { R: 14.924, rated: 6 }];
// Activity 6: dry cells of 1.5 V (book: U1 = 1.49 V, U = 2.99 V)
const CELLS_U = [1.49, 1.50, 1.51];

function initialState(tab) {
  if (tab === 'cells') return { n: 2, rev: [false, false, false] };
  return { mode: 'current', sw: 'open', lamps: [true, true] };
}
let S = { series: initialState('series'), parallel: initialState('parallel'), cells: initialState('cells') };

function evalSeries(st) {
  const [A, B] = SERIES_LAMPS;
  const gaps = (st.sw === 'open' ? 1 : 0) + st.lamps.filter((x) => !x).length;
  let I = 0, U = E, U1 = 0, U2 = 0;
  if (gaps === 0) {
    I = E / (R_INT + A.R + B.R);
    U = E - R_INT * I;
    U1 = A.R * I;
    U2 = B.R * I;
  } else if (gaps === 1) {
    // the only gap of the open circuit gets the whole voltage of the dry cell
    if (!st.lamps[0]) U1 = E;
    if (!st.lamps[1]) U2 = E;
  }
  const glow = [st.lamps[0] ? (A.R * I / A.rated) ** 2 : 0, st.lamps[1] ? (B.R * I / B.rated) ** 2 : 0];
  return { I, I1: I, I2: I, U, U1, U2, glow };
}

function evalParallel(st) {
  let I = 0, I1 = 0, I2 = 0, U = E, Uab = 0;
  if (st.sw === 'closed') {
    const G = (st.lamps[0] ? 1 / PAR_LAMPS[0].R : 0) + (st.lamps[1] ? 1 / PAR_LAMPS[1].R : 0);
    if (G === 0) Uab = E;
    else {
      I = E / (R_INT + 1 / G);
      U = E - R_INT * I;
      Uab = U;
      I1 = st.lamps[0] ? U / PAR_LAMPS[0].R : 0;
      I2 = st.lamps[1] ? U / PAR_LAMPS[1].R : 0;
    }
  }
  const glow = [0, 1].map((k) => (st.lamps[k] && st.sw === 'closed' ? (Uab / PAR_LAMPS[k].rated) ** 2 : 0));
  return { I, I1, I2, U, U1: Uab, U2: Uab, glow };
}

function evalCells(st) {
  const Uk = [];
  let U = 0;
  for (let k = 0; k < st.n; k++) {
    const v = (st.rev[k] ? -1 : 1) * CELLS_U[k];
    Uk.push(v);
    U += v;
  }
  const opposed = st.rev.slice(0, st.n).some((r) => r !== st.rev[0]);
  return { Uk, U, opposed };
}

const evaluate = (tab, st) => (tab === 'series' ? evalSeries(st) : tab === 'parallel' ? evalParallel(st) : evalCells(st));

// Readings as shown on the displays
const ampText = (v) => num(v, 3);
function voltText(v) {
  const r = Math.round(v * 100) / 100;
  return (r < 0 ? '−' : '') + num(Math.abs(r), 2);
}

/* ================================================================
   Canvas
   ================================================================ */
const SCENE = { w: 600, h: 440 };
let shell;
let anim = { t: 0, ph: { main: 0, b1: 0, b2: 0 } };
let hit = { sw: null, lamps: [], cells: [] };
let drawQueued = false;
const canvas = document.getElementById('stage');
const view = setupCanvas(canvas, { width: SCENE.w, height: SCENE.h, maxHeightVh: () => (window.innerWidth < 880 ? 46 : 74), onResize: () => requestDraw() });
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
// 6 V dry cell centred at (x, y) with its + terminal on the left (as in the book's diagrams).
function drawBigCell(ctx, x, y) {
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
  ctx.fillStyle = cssVar('--accent');
  ctx.fillText('+', x0 - 2, y - 14);
  ctx.fillStyle = cssVar('--text');
  ctx.fillText('−', x0 + w + 2, y - 14);
}
function lampLabel(ctx, name, x, y) {
  ctx.fillStyle = cssVar('--text');
  ctx.font = font(14, 800);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(name, x, y + 14);
}
function switchLabel(ctx, x, y) {
  ctx.fillStyle = cssVar('--text');
  ctx.font = font(14, 800);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('K', x, y + 16);
}

function draw() {
  if (!shell) return;
  const tab = shell.tab;
  const st = cur();
  const e = evaluate(tab, st);
  const ctx = view.begin();
  ctx.fillStyle = cssVar('--board');
  roundRect(ctx, 8, 8, SCENE.w - 16, SCENE.h - 16, 14);
  ctx.fill();
  hit = { sw: null, lamps: [], cells: [] };
  if (tab === 'series') drawSeries(ctx, st, e);
  else if (tab === 'parallel') drawParallel(ctx, st, e);
  else drawCellsScene(ctx, st, e);
  if (DEBUG) {
    ctx.fillStyle = 'red'; ctx.font = font(11); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(JSON.stringify(e, (k, v) => (typeof v === 'number' ? Number(v.toFixed(4)) : v)), 12, 10);
  }
  drawDiagram(tab, st, e);
}

/* ---------- Series (Activities 1–2) ---------- */
const SR = { TOP: 80, BOT: 310, XL: 50, XR: 560, CX: 230, SWX: 420, LX: [150, 390], AX: [270, 490] };
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
  drawBigCell(ctx, CX, TOP);
  hit.sw = drawSwitch(ctx, { x: SWX, y: TOP, open: st.sw === 'open' });
  switchLabel(ctx, SWX, TOP);
  for (let k = 0; k < 2; k++) {
    drawLamp(ctx, { x: LX[k], y: BOT, glow: e.glow[k], removed: !st.lamps[k] });
    lampLabel(ctx, `L${k + 1}`, LX[k], BOT);
    hit.lamps.push({ k, x: LX[k] - 44, y: BOT - 100, w: 88, h: 120 });
  }
  if (e.I > 0) {
    const skip = (x, y) => (Math.abs(y - BOT) < 1 && (LX.some((lx) => Math.abs(x - lx) < 40) || (amm && AX.some((ax) => Math.abs(x - ax) < MH + 4))))
      || (Math.abs(y - TOP) < 1 && Math.abs(x - SWX) < 62);
    drawCurrentArrows(ctx, [NP, [XL, TOP], [XL, BOT], [XR, BOT], [XR, TOP], NN], anim.ph.main, skip);
    labelI(ctx, XL + 22, (TOP + BOT) / 2, Math.PI / 2);
    labelI(ctx, XR - 22, (TOP + BOT) / 2, -Math.PI / 2);
  }
  if (amm) {
    drawMeterBox(ctx, { x: AX[0], y: BOT, kind: 'A', name: 'A1', text: ampText(e.I1), unit: 'A' });
    drawMeterBox(ctx, { x: AX[1], y: BOT, kind: 'A', name: 'A2', text: ampText(e.I2), unit: 'A' });
  } else {
    const red = cssVar('--accent'), black = cssVar('--lead-black');
    // across the dry cell: red on +
    drawLead(ctx, [CX - MH, 168], NP, red, [CX - 70, 150]);
    drawLead(ctx, [CX + MH, 168], NN, black, [CX + 70, 150]);
    drawMeterBox(ctx, { x: CX, y: 168, kind: 'V', name: 'V', text: voltText(e.U), unit: 'V' });
    for (let k = 0; k < 2; k++) {
      const y = 382;
      drawLead(ctx, [LX[k] - MH, y], [LX[k] - 30, BOT + 2], red, [LX[k] - 44, BOT + 40]);
      drawLead(ctx, [LX[k] + MH, y], [LX[k] + 30, BOT + 2], black, [LX[k] + 44, BOT + 40]);
      drawMeterBox(ctx, { x: LX[k], y, kind: 'V', name: `V${k + 1}`, text: voltText(k ? e.U2 : e.U1), unit: 'V' });
    }
  }
}

/* ---------- Parallel (Activities 3–5) ---------- */
const PR = { TOP: 60, Y: [210, 350], XL: 40, XR: 560, CX: 230, SWX: 420, LX: [200, 330], AX: 460, MAX: 104 };
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
  // junction dots
  ctx.fillStyle = cssVar('--wire');
  for (const p of [[XL, Y[0]], [XR, Y[0]]]) { ctx.beginPath(); ctx.arc(p[0], p[1], 6, 0, Math.PI * 2); ctx.fill(); }
  drawBigCell(ctx, CX, TOP);
  hit.sw = drawSwitch(ctx, { x: SWX, y: TOP, open: st.sw === 'open' });
  switchLabel(ctx, SWX, TOP);
  for (let k = 0; k < 2; k++) {
    drawLamp(ctx, { x: LX[k], y: Y[k], glow: e.glow[k], removed: !st.lamps[k] });
    lampLabel(ctx, `L${k + 1}`, LX[k] - 54, Y[k] - 38);
    hit.lamps.push({ k, x: LX[k] - 44, y: Y[k] - 100, w: 88, h: 120 });
  }
  const skipBase = (x, y) => (Math.abs(y - TOP) < 1 && (Math.abs(x - SWX) < 62 || (amm && Math.abs(x - MAX) < MH + 4)))
    || Y.some((yy, k) => Math.abs(y - yy) < 1 && (Math.abs(x - LX[k]) < 40 || (amm && Math.abs(x - AX) < MH + 4)));
  if (e.I > 0) {
    drawCurrentArrows(ctx, [NP, [XL, TOP], [XL, Y[0]]], anim.ph.main, skipBase);
    drawCurrentArrows(ctx, [[XR, Y[0]], [XR, TOP], NN], anim.ph.main, skipBase);
    labelI(ctx, XL + 22, (TOP + Y[0]) / 2 + 20, Math.PI / 2);
  }
  if (e.I1 > 0) {
    drawCurrentArrows(ctx, [[XL, Y[0]], [XR, Y[0]]], anim.ph.b1, skipBase);
    labelI(ctx, (LX[0] + AX) / 2 - 10, Y[0] - 22, 0, 'I1');
  }
  if (e.I2 > 0) {
    drawCurrentArrows(ctx, [[XL, Y[0]], [XL, Y[1]], [XR, Y[1]], [XR, Y[0]]], anim.ph.b2, skipBase);
    labelI(ctx, (LX[1] + AX) / 2 - 4, Y[1] - 22, 0, 'I2');
  }
  if (amm) {
    drawMeterBox(ctx, { x: MAX, y: TOP, kind: 'A', name: 'A', text: ampText(e.I), unit: 'A', flip: true });
    for (let k = 0; k < 2; k++) drawMeterBox(ctx, { x: AX, y: Y[k], kind: 'A', name: `A${k + 1}`, text: ampText(k ? e.I2 : e.I1), unit: 'A' });
  } else {
    const red = cssVar('--accent'), black = cssVar('--lead-black');
    for (let k = 0; k < 2; k++) {
      const y = Y[k] + 52;
      drawLead(ctx, [LX[k] - MH, y], [LX[k] - 30, Y[k] + 2], red, [LX[k] - 44, Y[k] + 24]);
      drawLead(ctx, [LX[k] + MH, y], [LX[k] + 30, Y[k] + 2], black, [LX[k] + 44, Y[k] + 24]);
      drawMeterBox(ctx, { x: LX[k], y, kind: 'V', name: `V${k + 1}`, text: voltText(k ? e.U2 : e.U1), unit: 'V' });
    }
  }
}

/* ---------- Dry cells in series / in opposition (Activity 6) ---------- */
const CL = { CY: 230, W: 124, VY: 112, TY: 350 };
function cellX(n, k) { return 300 - (n * CL.W) / 2 + k * CL.W; }
function drawCellsScene(ctx, st, e) {
  const { CY, W, VY, TY } = CL;
  const n = st.n;
  const red = cssVar('--accent'), black = cssVar('--lead-black');
  for (let k = 0; k < n; k++) {
    const x = cellX(n, k), plusRight = !st.rev[k];
    ctx.fillStyle = cssVar('--cell');
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, x + 6, CY - 19, W - 12, 38, 7);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = cssVar('--cell-band');
    ctx.fillRect(plusRight ? x + W - 40 : x + 6, CY - 19, 34, 38);
    ctx.fillStyle = cssVar('--pan-metal');
    ctx.fillRect(plusRight ? x + W - 6 : x + 1, CY - 6, 5, 12);
    ctx.fillStyle = '#ffffff';
    ctx.font = font(13, 800);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${num(1.5, 1)} V`, x + (plusRight ? 48 : W - 48), CY + 1);
    // pole signs
    ctx.font = font(17, 800);
    ctx.fillStyle = cssVar('--accent');
    ctx.fillText('+', plusRight ? x + W - 14 : x + 14, CY - 32);
    ctx.fillStyle = cssVar('--text');
    ctx.fillText('−', plusRight ? x + 14 : x + W - 14, CY - 32);
    ctx.font = font(13, 700);
    ctx.fillText(t('cell.name', { k: k + 1 }), x + W / 2, CY + 34);
    hit.cells.push({ k, x: x + 4, y: CY - 40, w: W - 8, h: 80 });
    // voltmeter Vk across this cell: red on the right end, COM on the left end
    drawLead(ctx, [x + W / 2 + MH, VY], [x + W - 4, CY - 8], red, [x + W, VY + 30]);
    drawLead(ctx, [x + W / 2 - MH, VY], [x + 4, CY - 8], black, [x, VY + 30]);
    drawMeterBox(ctx, { x: x + W / 2, y: VY, kind: 'V', name: `V${k + 1}`, text: voltText(e.Uk[k]), unit: 'V', flip: true });
  }
  // voltmeter V across the grouping
  const xa = cellX(n, 0), xb = cellX(n, n);
  drawLead(ctx, [300 + MH, TY], [xb - 2, CY + 8], red, [xb + 20, TY]);
  drawLead(ctx, [300 - MH, TY], [xa + 2, CY + 8], black, [xa - 20, TY]);
  drawMeterBox(ctx, { x: 300, y: TY, kind: 'V', name: 'V', text: voltText(e.U), unit: 'V', flip: true });
  // grouping label
  ctx.fillStyle = e.opposed ? cssVar('--bad') : cssVar('--good');
  ctx.font = font(15, 800);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(t(e.opposed ? 'grp.opposition' : 'grp.series'), 300, SCENE.h - 36);
}

/* ---------- Diagram ---------- */
function drawDiagram(tab, st, e) {
  const ctx = diag.begin();
  const ink = cssVar('--text');
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  if (tab === 'series') {
    const L = 40, R = 320, T = 56, B = 150, cx = 150, amm = st.mode === 'current';
    const LXd = [90, 210], AXd = [150, 270];
    symCell(ctx, cx, T, false);
    symSwitch(ctx, 232, 268, T, st.sw === 'open');
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
      symMeter(ctx, AXd[0], B, 'A'); sub(ctx, AXd[0], B, '1');
      symMeter(ctx, AXd[1], B, 'A'); sub(ctx, AXd[1], B, '2');
    } else {
      ctx.beginPath();
      ctx.moveTo(cx - 30, T); ctx.lineTo(cx - 30, 22); ctx.lineTo(cx - 14, 22);
      ctx.moveTo(cx + 14, 22); ctx.lineTo(cx + 30, 22); ctx.lineTo(cx + 30, T);
      for (const x of LXd) {
        ctx.moveTo(x - 26, B); ctx.lineTo(x - 26, B + 42); ctx.lineTo(x - 14, B + 42);
        ctx.moveTo(x + 14, B + 42); ctx.lineTo(x + 26, B + 42); ctx.lineTo(x + 26, B);
      }
      ctx.stroke();
      symMeter(ctx, cx, 22, 'V');
      symMeter(ctx, LXd[0], B + 42, 'V'); sub(ctx, LXd[0], B + 42, '1');
      symMeter(ctx, LXd[1], B + 42, 'V'); sub(ctx, LXd[1], B + 42, '2');
    }
    if (e.I > 0) { ctx.fillStyle = cssVar('--current'); arrowHead(ctx, L, 103, Math.PI / 2); label(ctx, 'I', L + 14, 103); }
  } else if (tab === 'parallel') {
    const L = 40, R = 320, T = 40, Y = [112, 186], cx = 170, amm = st.mode === 'current';
    const LXd = [130, 130], AXd = 240, MA = 90;
    symCell(ctx, cx, T, false);
    symSwitch(ctx, 240, 276, T, st.sw === 'open');
    ctx.beginPath();
    if (amm) { ctx.moveTo(cx - 5, T); ctx.lineTo(MA + 14, T); ctx.moveTo(MA - 14, T); ctx.lineTo(L, T); }
    else { ctx.moveTo(cx - 5, T); ctx.lineTo(L, T); }
    ctx.lineTo(L, Y[1]);
    ctx.moveTo(cx + 5, T); ctx.lineTo(240, T);
    ctx.moveTo(276, T); ctx.lineTo(R, T); ctx.lineTo(R, Y[1]);
    for (let k = 0; k < 2; k++) {
      ctx.moveTo(L, Y[k]); ctx.lineTo(LXd[k] - 15, Y[k]);
      if (amm) { ctx.moveTo(LXd[k] + 15, Y[k]); ctx.lineTo(AXd - 14, Y[k]); ctx.moveTo(AXd + 14, Y[k]); ctx.lineTo(R, Y[k]); }
      else { ctx.moveTo(LXd[k] + 15, Y[k]); ctx.lineTo(R, Y[k]); }
    }
    ctx.stroke();
    dot(ctx, L, Y[0]); dot(ctx, R, Y[0]);
    for (let k = 0; k < 2; k++) diagLamp(ctx, LXd[k], Y[k], st.lamps[k], e.glow[k] > 0.05, `L${k + 1}`, amm ? 0 : -46, amm ? 25 : -10);
    if (amm) {
      symMeter(ctx, MA, T, 'A');
      symMeter(ctx, AXd, Y[0], 'A'); sub(ctx, AXd, Y[0], '1');
      symMeter(ctx, AXd, Y[1], 'A'); sub(ctx, AXd, Y[1], '2');
    } else {
      ctx.beginPath();
      for (let k = 0; k < 2; k++) {
        const x = LXd[k], y = Y[k] - 34;
        ctx.moveTo(x - 30, Y[k]); ctx.lineTo(x - 30, y); ctx.lineTo(x - 14, y);
        ctx.moveTo(x + 14, y); ctx.lineTo(x + 30, y); ctx.lineTo(x + 30, Y[k]);
      }
      ctx.stroke();
      for (let k = 0; k < 2; k++) { symMeter(ctx, LXd[k] + 0, Y[k] - 34, 'V'); sub(ctx, LXd[k], Y[k] - 34, String(k + 1)); }
    }
    ctx.fillStyle = cssVar('--current');
    if (e.I > 0) { arrowHead(ctx, L, (T + Y[0]) / 2, Math.PI / 2); label(ctx, 'I', L + 12, (T + Y[0]) / 2); }
    if (e.I1 > 0) { arrowHead(ctx, 290, Y[0], 0); label(ctx, 'I1', 284, Y[0] - 12); }
    if (e.I2 > 0) { arrowHead(ctx, 290, Y[1], 0); label(ctx, 'I2', 284, Y[1] - 12); }
  } else {
    const n = st.n, sp = 70, y = 104, x0 = 180 - ((n - 1) * sp) / 2;
    ctx.beginPath();
    for (let k = 0; k < n; k++) {
      const x = x0 + k * sp;
      if (k < n - 1) { ctx.moveTo(x + 5, y); ctx.lineTo(x + sp - 5, y); }
      // Vk above
      ctx.moveTo(x - 22, y); ctx.lineTo(x - 22, y - 50); ctx.lineTo(x - 14, y - 50);
      ctx.moveTo(x + 14, y - 50); ctx.lineTo(x + 22, y - 50); ctx.lineTo(x + 22, y);
    }
    const xa = x0 - 5, xb = x0 + (n - 1) * sp + 5;
    ctx.moveTo(xa, y); ctx.lineTo(xa - 20, y); ctx.lineTo(xa - 20, 170); ctx.lineTo(166, 170);
    ctx.moveTo(194, 170); ctx.lineTo(xb + 20, 170); ctx.lineTo(xb + 20, y); ctx.lineTo(xb, y);
    ctx.stroke();
    for (let k = 0; k < n; k++) {
      const x = x0 + k * sp;
      symCell(ctx, x, y, !st.rev[k]);
      symMeter(ctx, x, y - 50, 'V'); sub(ctx, x, y - 50, String(k + 1));
    }
    symMeter(ctx, 180, 170, 'V');
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
   Animation: the arrows move faster where the current is larger
   ================================================================ */
const SPEED = 300; // px/s per ampere
const loop = createLoop({
  dt: 1 / 60,
  step(dt) {
    if (!shell || shell.tab === 'cells') return false;
    const e = evaluate(shell.tab, cur());
    anim.t += dt;
    anim.ph.main += SPEED * e.I * dt;
    anim.ph.b1 += SPEED * e.I1 * dt;
    anim.ph.b2 += SPEED * e.I2 * dt;
    return e.I > 0;
  },
  render: () => draw(),
});

/* ================================================================
   State changes
   ================================================================ */
function change(fn) {
  fn(cur());
  refresh();
}
function refresh() {
  updateMeasures();
  const tab = shell?.tab;
  if (tab && tab !== 'cells' && evaluate(tab, cur()).I > 0) loop.start(); else loop.stop();
  requestDraw();
}

canvas.addEventListener('pointerdown', (ev) => {
  const p = view.toLogical(ev);
  const inside = (r) => r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  const lamp = hit.lamps.find(inside);
  if (lamp) { change((st) => { st.lamps[lamp.k] = !st.lamps[lamp.k]; }); ev.preventDefault(); return; }
  const c = hit.cells.find(inside);
  if (c) { change((st) => { st.rev[c.k] = !st.rev[c.k]; }); ev.preventDefault(); return; }
  if (inside(hit.sw)) { change((st) => { st.sw = st.sw === 'open' ? 'closed' : 'open'; }); ev.preventDefault(); }
});

/* ================================================================
   Panels
   ================================================================ */
const controlsBody = document.getElementById('controls-body');
const measuresBody = document.getElementById('measures-body');
let ui = {};
function measRows(dl, rows) {
  dl.replaceChildren(...rows.flatMap(([k, v, cls]) => [el('dt', {}, k), el('dd', cls ? { class: cls } : {}, v)]));
}

function build() {
  const tab = shell.tab;
  const st = cur();
  const items = [];
  if (tab === 'cells') {
    ui.n = createSegmented({
      labelKey: 'ctl.cells',
      options: [{ value: '2', labelKey: 'ctl.two' }, { value: '3', labelKey: 'ctl.three' }],
      value: String(st.n),
      onChange: (v) => change((s) => { s.n = Number(v); }),
    });
    ui.rev = [0, 1, 2].map((k) => createButton({ labelKey: `ctl.reverse${k + 1}`, onClick: () => change((s) => { s.rev[k] = !s.rev[k]; }) }));
    items.push(ui.n.root, el('div', { class: 'btn-row' }, ui.rev));
  } else {
    ui.mode = createSegmented({
      labelKey: 'ctl.measure',
      options: [{ value: 'current', labelKey: 'mode.current' }, { value: 'voltage', labelKey: 'mode.voltage' }],
      value: st.mode,
      onChange: (v) => change((s) => { s.mode = v; }),
    });
    ui.sw = createSegmented({
      labelKey: 'ctl.switch',
      options: [{ value: 'open', labelKey: 'ctl.open' }, { value: 'closed', labelKey: 'ctl.closed' }],
      value: st.sw,
      onChange: (v) => change((s) => { s.sw = v; }),
    });
    ui.lamps = [0, 1].map((k) => createSegmented({
      labelKey: `ctl.lamp${k + 1}`,
      options: [{ value: 'in', labelKey: 'lamp.in' }, { value: 'out', labelKey: 'lamp.out' }],
      value: st.lamps[k] ? 'in' : 'out',
      onChange: (v) => change((s) => { s.lamps[k] = v === 'in'; }),
    }));
    items.push(ui.mode.root, ui.sw.root, ui.lamps[0].root, ui.lamps[1].root);
  }
  items.push(
    el('div', { class: 'btn-row', style: 'margin-top:8px' }, [createButton({ labelKey: 'ui.reset', onClick: resetTab, variant: 'ghost' })]),
    el('p', { class: 'muted', style: 'margin:8px 0 0;font-size:0.88rem', dataset: { i18n: `hint.${tab === 'cells' ? 'cells' : 'lamps'}` } }, t(`hint.${tab === 'cells' ? 'cells' : 'lamps'}`)),
  );
  controlsBody.append(...items);
  ui.dl = el('dl', { class: 'meas' });
  measuresBody.append(ui.dl);
}

const A = (v) => `${ampText(v)} A`;
const V = (v) => `${voltText(v)} V`;
function lampState(st, e, k) {
  if (!st.lamps[k]) return [t('m.lamp', { k: k + 1 }), t('lamp.removed'), 'muted'];
  return [t('m.lamp', { k: k + 1 }), t(e.glow[k] > 0.05 ? 'lamp.on' : 'lamp.off')];
}
function updateMeasures() {
  if (!shell || !ui.dl) return;
  const tab = shell.tab;
  const st = cur();
  const e = evaluate(tab, st);
  const rows = [];
  if (tab === 'cells') {
    ui.n.set(String(st.n));
    ui.rev[2].hidden = st.n < 3;
    for (let k = 0; k < st.n; k++) rows.push([t('m.Uk', { k: k + 1 }), V(e.Uk[k])]);
    rows.push([t('m.Ugroup'), V(e.U)]);
    rows.push([t('m.grouping'), t(e.opposed ? 'grp.opposition' : 'grp.series'), e.opposed ? 'warn-text' : '']);
  } else {
    ui.mode.set(st.mode);
    ui.sw.set(st.sw);
    ui.lamps.forEach((c, k) => c.set(st.lamps[k] ? 'in' : 'out'));
    if (st.mode === 'current') {
      if (tab === 'parallel') rows.push([t('m.Imain'), A(e.I)]);
      rows.push([t(tab === 'series' ? 'm.I1s' : 'm.I1p'), A(e.I1)], [t(tab === 'series' ? 'm.I2s' : 'm.I2p'), A(e.I2)]);
    } else {
      if (tab === 'series') rows.push([t('m.Ucell'), V(e.U)]);
      rows.push([t('m.U1'), V(e.U1)], [t('m.U2'), V(e.U2)]);
    }
    rows.push(lampState(st, e, 0), lampState(st, e, 1));
  }
  measRows(ui.dl, rows);
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
onLangChange(() => { if (shell) buildTab(); });

shell = initSim({
  strings,
  tabs: [{ id: 'series', labelKey: 'tab.series' }, { id: 'parallel', labelKey: 'tab.parallel' }, { id: 'cells', labelKey: 'tab.cells' }],
  initialTab: 'series',
  onTab: buildTab,
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, evaluate, cur: () => cur(), tab: () => shell.tab };
