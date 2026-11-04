// Grade 7 — Electric safety (Ch.13 Act. 1–5, Ex. 3–7) — not required in 2026–2027
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num, qty } from '../../../shared/format.js';
import { createButton, createSegmented, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, font } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { drawLamp, drawSwitch, drawCurrentArrows, labelI, drawMeterBox, drawDryCell, METER_HALF as MH } from '../../../shared/circuit-draw.js';
import { calcCell, calcSig } from '../../../shared/calc-cell.js';
import { label, person } from '../../../shared/figures.js';

const SCENE = { w: 600, h: 440 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ================================================================
   Models
   ================================================================ */
// Grade 7 rule: the dry cell keeps its voltage (4.5 V); a short-circuit wire and the cell together have 0.5 Ω.
const E = 4.5, R_SHORT = 0.5;
const LAMP = { R: 14, rated: 3.5 }; // 3.5 V lamp, 0.25 A (two in series)
const LAMP45 = { R: 15, rated: 4.5 }; // 4.5 V lamp, 0.3 A (alone on the dry cell)
const BODY = { dry: 5000, wet: 1500 }; // Ω, resistance of the human body (illustrative)
const MAINS = 220;
// Book table, page 106: effect of a current through the human body
const EFFECTS = [[0.5, 'eff.none'], [7, 'eff.painful'], [15, 'eff.contraction'], [30, 'eff.control'], [100, 'eff.suffocation']];
// Book, Ex. 7: currents of appliances (Table 2) and maximum current in a copper wire (Table 1)
const APPLIANCES = { lamp: 0.5, oven: 8, tv: 1, vacuum: 4, radio: 0.3, iron: 4.5 };
const WIRE_MAX = { '0.5': 1, '1': 4, '1.5': 8, '2': 15 };
const glowOf = (I, L = LAMP) => ((I * L.R) / L.rated) ** 2;

/* ================================================================
   State
   ================================================================ */
function initialState() {
  return {
    earth: { grounded: false, floor: 'dry', touch: false, tripped: false },
    cell: { short: false, used: 0, heat: 0, shortTime: 0 },
    lamps: { s1: false, s2: false, burnt2: false, heat: 0 },
    fuse: { link: 'wool', closed: true, shortLamp: false, melted: false, over: 0, heat: 0, sparks: [] },
    brk: { rating: 10, wire: '1.5', on: { lamp: true, tv: false, oven: false, vacuum: false, radio: false, iron: false }, tripped: false, over: 0, row: {}, fb: null },
  };
}
let S = initialState();

/* ================================================================
   Canvas
   ================================================================ */
let shell;
const canvas = document.getElementById('stage');
const view = setupCanvas(canvas, { width: SCENE.w, height: SCENE.h, maxHeightVh: () => (window.innerWidth < 880 ? 52 : 76), onResize: () => draw() });
onThemeChange(() => draw());
let clock = 0, phase = 0, hit = {};

function line(ctx, pts, color = cssVar('--wire'), w = 5) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = w; ctx.strokeStyle = color;
  ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
}
// Thick short-circuit wire drawn as an arc between two points
function shortWire(ctx, [x1, y1], [x2, y2], up = -1, hot = 0) {
  ctx.strokeStyle = hot > 0.1 ? `rgb(${120 + 135 * hot}, ${60 - 20 * hot}, 30)` : cssVar('--copper');
  ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo((x1 + x2) / 2, (y1 + y2) / 2 + up * 70, x2, y2); ctx.stroke();
}
function board(ctx) {
  ctx.fillStyle = cssVar('--board');
  roundRect(ctx, 8, 8, SCENE.w - 16, SCENE.h - 16, 14); ctx.fill();
}

function draw() {
  if (!shell) return;
  const ctx = view.begin();
  hit = {};
  if (shell.tab === 'earth') drawEarth(ctx);
  else if (shell.tab === 'cell') drawCell(ctx);
  else if (shell.tab === 'lamps') drawLamps(ctx);
  else if (shell.tab === 'fuse') drawFuse(ctx);
  else drawBreaker(ctx);
}

/* ---------- Tab 1: grounding (Act. 1) ---------- */
function earthEval(st) {
  if (st.tripped) return { body: 0, earth: 0 };
  if (!st.touch && !st.grounded) return { body: 0, earth: 0 };
  if (st.grounded) return { body: 0, earth: 6 }; // the leakage goes to the earth wire: the breaker switches off
  return { body: (MAINS / BODY[st.floor]) * 1000, earth: 0 }; // mA
}
function drawEarth(ctx) {
  const st = S.earth;
  const e = earthEval(st);
  ctx.fillStyle = cssVar('--surface-2'); ctx.fillRect(0, 0, SCENE.w, SCENE.h);
  const floorY = 400;
  ctx.fillStyle = st.floor === 'wet' ? cssVar('--water') : cssVar('--bench');
  ctx.globalAlpha = st.floor === 'wet' ? 0.5 : 1; ctx.fillRect(0, floorY, SCENE.w, SCENE.h - floorY); ctx.globalAlpha = 1;
  // washing machine
  const mx = 330, my = 210, mw = 170, mh = 190;
  ctx.fillStyle = cssVar('--ball'); ctx.strokeStyle = cssVar('--glass-stroke'); ctx.lineWidth = 2;
  roundRect(ctx, mx, my, mw, mh, 10); ctx.fill(); ctx.stroke();
  ctx.fillStyle = cssVar('--box'); ctx.fillRect(mx + 10, my + 12, mw - 20, 22);
  ctx.strokeStyle = cssVar('--glass-stroke'); ctx.lineWidth = 6; ctx.fillStyle = cssVar('--glass-fill');
  ctx.beginPath(); ctx.arc(mx + mw / 2, my + 110, 46, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // wall socket and cable: live (red, damaged), neutral (blue), earth (yellow-green)
  const wx = 560, wy = 160;
  ctx.fillStyle = cssVar('--surface'); ctx.strokeStyle = cssVar('--glass-stroke'); ctx.lineWidth = 1.5;
  roundRect(ctx, wx - 22, wy - 30, 44, 60, 6); ctx.fill(); ctx.stroke();
  line(ctx, [[wx - 8, wy], [wx - 8, wy + 60], [mx + mw - 10, my + 40]], '#d23b2e', 3); // live
  line(ctx, [[wx + 8, wy], [wx + 8, wy + 70], [mx + mw - 6, my + 50]], '#2a63b0', 3); // neutral
  if (st.grounded) line(ctx, [[wx, wy + 20], [wx, wy + 84], [mx + mw - 2, my + 62]], '#7ab648', 3); // earth
  // bare live wire touching the metal body (inside, behind the door)
  ctx.strokeStyle = '#d23b2e'; ctx.lineWidth = 3; ctx.setLineDash([4, 3]);
  ctx.beginPath(); ctx.moveTo(mx + mw - 10, my + 40); ctx.lineTo(mx + mw - 40, my + 70); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = cssVar('--hot'); ctx.beginPath(); ctx.arc(mx + mw - 40, my + 70, 5, 0, Math.PI * 2); ctx.fill();
  label(ctx, t('lbl.damaged'), mx + mw - 40, my + 92, { size: 11, weight: 700, color: cssVar('--bad') });
  label(ctx, t('lbl.live'), wx - 40, wy + 50, { size: 10, color: '#d23b2e' });
  if (st.grounded) label(ctx, t('lbl.earthWire'), wx - 20, wy + 100, { size: 10, color: '#5f9a35', align: 'right' });
  // user
  const px = 250;
  person(ctx, px, floorY, { color: cssVar('--primary'), h: 170, face: 1 });
  if (st.touch) line(ctx, [[px + 10, floorY - 120], [mx + 4, my + 60]], cssVar('--skin'), 7);
  // currents
  if (e.body > 0) {
    drawCurrentArrows(ctx, [[mx + 4, my + 60], [px + 10, floorY - 120], [px, floorY - 60], [px, floorY - 4]], phase * 2);
    labelI(ctx, px - 30, floorY - 80, Math.PI / 2);
  }
  // breaker state
  label(ctx, t(st.tripped ? 'lbl.breakerOff' : 'lbl.breakerOn'), 470, 40, { size: 13, weight: 800, color: st.tripped ? cssVar('--bad') : cssVar('--good') });
  // table of effects (book), the current row highlighted
  drawEffects(ctx, e.body);
}
function effectIndex(mA) { let k = -1; EFFECTS.forEach(([v], i) => { if (mA >= v) k = i; }); return k; }
function drawEffects(ctx, mA) {
  const x = 20, y = 30, w = 200, rh = 24;
  const k = effectIndex(mA);
  ctx.font = font(11, 700); ctx.textBaseline = 'middle';
  label(ctx, t('lbl.effects'), x + w / 2, y - 12, { size: 12, weight: 800 });
  EFFECTS.forEach(([v, key], i) => {
    const yy = y + i * rh;
    ctx.fillStyle = i === k && mA > 0 ? (v >= 30 ? cssVar('--nr-bg') : cssVar('--surface')) : cssVar('--surface');
    ctx.fillRect(x, yy, w, rh - 2);
    if (i === k && mA > 0) { ctx.strokeStyle = cssVar('--bad'); ctx.lineWidth = 2; ctx.strokeRect(x, yy, w, rh - 2); }
    ctx.fillStyle = cssVar('--text'); ctx.textAlign = 'left';
    ctx.fillText(`${i === EFFECTS.length - 1 ? '> ' : ''}${num(v, v < 1 ? 1 : 0)} mA`, x + 6, yy + rh / 2 - 1);
    ctx.fillText(t(key), x + 70, yy + rh / 2 - 1);
  });
}

/* ---------- Tab 2: short circuit of a dry cell (Act. 2) ---------- */
const CC = { TOP: 110, BOT: 330, XL: 110, XR: 490, CX: 300 };
function cellEval(st) {
  const Eeff = E * (1 - 0.7 * st.used); // the cell gets exhausted when it is short-circuited
  if (st.short) return { I: Eeff / R_SHORT, IL: 0, Is: Eeff / R_SHORT, Eeff };
  const IL = Eeff / LAMP45.R;
  return { I: IL, IL, Is: 0, Eeff };
}
function drawCell(ctx) {
  const st = S.cell, e = cellEval(st);
  board(ctx);
  const { TOP, BOT, XL, XR, CX } = CC;
  const NP = [CX - 62, TOP], NN = [CX + 62, TOP];
  line(ctx, [NP, [XL, TOP], [XL, BOT], [CX - 30, BOT]]);
  line(ctx, [[CX + 30, BOT], [XR, BOT], [XR, TOP], NN]);
  drawDryCell(ctx, CX, TOP, '4.5 V', st.heat);
  drawLamp(ctx, { x: CX, y: BOT, glow: glowOf(e.IL, LAMP45) });
  if (st.short) shortWire(ctx, [NP[0] + 2, TOP - 6], [NN[0] - 2, TOP - 6], -1, st.heat);
  hit.short = { x: CX - 90, y: TOP - 90, w: 180, h: 70 };
  if (e.IL > 0.001) {
    drawCurrentArrows(ctx, [NP, [XL, TOP], [XL, BOT], [XR, BOT], [XR, TOP], NN], phase, (x, y) => Math.abs(y - BOT) < 1 && Math.abs(x - CX) < 40);
    labelI(ctx, XL + 22, (TOP + BOT) / 2, Math.PI / 2);
  }
  if (st.short) {
    drawCurrentArrows(ctx, [[NP[0] + 6, TOP - 16], [CX - 40, TOP - 38], [CX + 40, TOP - 38], [NN[0] - 6, TOP - 16]], phase * 3);
    labelI(ctx, CX, TOP - 62, 0);
    label(ctx, t('lbl.shortWire'), CX, TOP - 92, { size: 11 });
  }
  label(ctx, `${t('lbl.cellT')} ${qty(20 + 40 * st.heat, 0, '°C')}`, CX, TOP + 48, { size: 12, weight: 700, color: st.heat > 0.2 ? cssVar('--bad') : cssVar('--text') });
}

/* ---------- Tab 3: short circuit of a lamp (Act. 3, Ex. 3–5) ---------- */
const LC = { TOP: 100, BOT: 330, XL: 60, XR: 540, CX: 300, LX: [200, 400], AX: 460 };
function lampsEval(st) {
  let R = R_SHORT * 0.0;
  let open = false;
  const parts = [0, 1].map((k) => {
    const shorted = k === 0 ? st.s1 : st.s2;
    if (shorted) return 0;
    if (k === 1 && st.burnt2) { open = true; return Infinity; }
    return LAMP.R;
  });
  R = parts[0] + parts[1];
  if (!Number.isFinite(R)) return { I: 0, glow: [0, 0], cellShort: false };
  if (R === 0) return { I: E / R_SHORT, glow: [0, 0], cellShort: true };
  const I = E / R;
  return { I, glow: [st.s1 ? 0 : glowOf(I), st.s2 || st.burnt2 ? 0 : glowOf(I)], cellShort: false, open };
}
function drawLamps(ctx) {
  const st = S.lamps, e = lampsEval(st);
  board(ctx);
  const { TOP, BOT, XL, XR, CX, LX, AX } = LC;
  const NP = [CX - 62, TOP], NN = [CX + 62, TOP];
  line(ctx, [NP, [XL, TOP], [XL, BOT], [LX[0] - 30, BOT]]);
  line(ctx, [[LX[0] + 30, BOT], [LX[1] - 30, BOT]]);
  line(ctx, [[LX[1] + 30, BOT], [XR, BOT], [XR, TOP], [AX + MH, TOP]]);
  line(ctx, [[AX - MH, TOP], NN]);
  drawDryCell(ctx, CX, TOP, '4.5 V', st.heat);
  hit.lamps = [];
  for (let k = 0; k < 2; k++) {
    drawLamp(ctx, { x: LX[k], y: BOT, glow: e.glow[k], burnt: k === 1 && st.burnt2 });
    label(ctx, `L${k + 1}`, LX[k], BOT + 30, { size: 14, weight: 800 });
    if (k === 0 ? st.s1 : st.s2) shortWire(ctx, [LX[k] - 30, BOT + 4], [LX[k] + 30, BOT + 4], 1, e.cellShort ? st.heat : 0);
    hit.lamps.push({ k, x: LX[k] - 44, y: BOT - 100, w: 88, h: 150 });
  }
  drawMeterBox(ctx, { x: AX, y: TOP, kind: 'A', name: 'A', text: num(e.I, 2), unit: 'A', flip: true });
  if (e.I > 0) {
    const skip = (x, y) => (Math.abs(y - BOT) < 1 && LX.some((lx) => Math.abs(x - lx) < 40)) || (Math.abs(y - TOP) < 1 && Math.abs(x - AX) < MH + 4);
    drawCurrentArrows(ctx, [NP, [XL, TOP], [XL, BOT], [XR, BOT], [XR, TOP], NN], phase * (e.cellShort ? 3 : 1), skip);
    labelI(ctx, XL + 22, (TOP + BOT) / 2, Math.PI / 2);
  }
}

/* ---------- Tab 4: the fuse (Act. 5) ---------- */
const FC = { TOP: 100, BOT: 330, XL: 70, XR: 530, CX: 300, SWX: 420, LX: 300, WX: 160 };
function fuseEval(st) {
  if (!st.closed || st.melted) return { I: 0, glow: 0 };
  const R = st.shortLamp ? R_SHORT : LAMP45.R;
  const I = E / R;
  return { I, glow: st.shortLamp ? 0 : glowOf(I, LAMP45) };
}
function drawFuse(ctx) {
  const st = S.fuse, e = fuseEval(st);
  board(ctx);
  const { TOP, BOT, XL, XR, CX, SWX, LX, WX } = FC;
  const NP = [CX - 62, TOP], NN = [CX + 62, TOP];
  line(ctx, [NP, [XL, TOP], [XL, BOT], [WX - 40, BOT]]);
  line(ctx, [[WX + 40, BOT], [LX - 30, BOT]]);
  line(ctx, [[LX + 30, BOT], [XR, BOT], [XR, TOP], [SWX + 50, TOP]]);
  line(ctx, [[SWX - 50, TOP], NN]);
  drawDryCell(ctx, CX, TOP, '4.5 V');
  hit.sw = drawSwitch(ctx, { x: SWX, y: TOP, open: !st.closed });
  label(ctx, 'K', SWX, TOP + 26, { size: 14, weight: 800 });
  drawLamp(ctx, { x: LX, y: BOT, glow: e.glow });
  if (st.shortLamp) shortWire(ctx, [LX - 30, BOT + 4], [LX + 30, BOT + 4], 1, st.link === 'wire' ? st.heat : 0);
  hit.lamp = { x: LX - 44, y: BOT - 100, w: 88, h: 150 };
  // steel wool (or a connecting wire) between two clips
  ctx.fillStyle = cssVar('--box');
  for (const x of [WX - 40, WX + 40]) { ctx.fillRect(x - 5, BOT - 8, 10, 16); }
  if (st.link === 'wool') {
    if (!st.melted) {
      ctx.strokeStyle = cssVar('--metal'); ctx.lineWidth = 1;
      for (let i = 0; i < 26; i++) { ctx.beginPath(); ctx.moveTo(WX - 36, BOT + Math.sin(i) * 4); ctx.bezierCurveTo(WX - 10, BOT - 14 + ((i * 7) % 28), WX + 10, BOT + 14 - ((i * 5) % 28), WX + 36, BOT + Math.cos(i) * 4); ctx.stroke(); }
    } else {
      ctx.strokeStyle = cssVar('--soot'); ctx.lineWidth = 1;
      for (let i = 0; i < 10; i++) { ctx.beginPath(); ctx.moveTo(WX - 36, BOT + i - 5); ctx.lineTo(WX - 16 - (i % 3) * 3, BOT + (i % 4) * 3 - 4); ctx.moveTo(WX + 36, BOT + i - 5); ctx.lineTo(WX + 16 + (i % 3) * 3, BOT - (i % 4) * 3 + 4); ctx.stroke(); }
    }
    label(ctx, t('lbl.wool'), WX, BOT + 32, { size: 12, weight: 700 });
  } else {
    line(ctx, [[WX - 40, BOT], [WX + 40, BOT]], st.heat > 0.1 ? `rgb(${120 + 135 * st.heat}, 60, 30)` : cssVar('--wire'), 5);
    label(ctx, t('lbl.wire'), WX, BOT + 32, { size: 12, weight: 700 });
  }
  // sparks when the steel wool burns
  for (const p of st.sparks) { ctx.fillStyle = `rgba(255,${150 + 100 * p.l},40,${p.l})`; ctx.beginPath(); ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2); ctx.fill(); }
  if (e.I > 0) {
    const skip = (x, y) => (Math.abs(y - BOT) < 1 && (Math.abs(x - LX) < 40 || Math.abs(x - WX) < 42)) || (Math.abs(y - TOP) < 1 && Math.abs(x - SWX) < 62);
    drawCurrentArrows(ctx, [NP, [XL, TOP], [XL, BOT], [XR, BOT], [XR, TOP], NN], phase * (st.shortLamp ? 3 : 1), skip);
    labelI(ctx, XL + 22, (TOP + BOT) / 2, Math.PI / 2);
  }
  label(ctx, `I = ${qty(e.I, 2, 'A')}`, CX, TOP + 52, { size: 14, weight: 800 });
}

/* ---------- Tab 5: the circuit breaker (Act. 4, Ex. 7) ---------- */
const brkTotal = (st) => Object.entries(st.on).reduce((s, [k, v]) => s + (v ? APPLIANCES[k] : 0), 0);
const ICONS = { lamp: '💡', oven: '♨️', tv: '📺', vacuum: '🧹', radio: '📻', iron: '👔' };
function drawBreaker(ctx) {
  const st = S.brk;
  const I = st.tripped ? 0 : brkTotal(st);
  ctx.fillStyle = cssVar('--surface-2'); ctx.fillRect(0, 0, SCENE.w, SCENE.h);
  // meter and breaker box
  ctx.fillStyle = cssVar('--surface'); ctx.strokeStyle = cssVar('--glass-stroke'); ctx.lineWidth = 2;
  roundRect(ctx, 30, 40, 130, 110, 10); ctx.fill(); ctx.stroke();
  label(ctx, t('lbl.meter'), 95, 60, { size: 12, weight: 800 });
  ctx.fillStyle = cssVar('--lcd-bg'); ctx.fillRect(50, 80, 90, 30);
  ctx.fillStyle = cssVar('--lcd-ink'); ctx.font = '700 16px ui-monospace, Menlo, Consolas, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('0 4 2 7 1', 95, 96);
  roundRect(ctx, 30, 180, 130, 120, 10); ctx.fillStyle = cssVar('--surface'); ctx.fill(); ctx.stroke();
  label(ctx, `${t('lbl.breaker')} ${st.rating} A`, 95, 200, { size: 12, weight: 800 });
  ctx.fillStyle = cssVar('--box'); roundRect(ctx, 75, 220, 40, 64, 6); ctx.fill();
  ctx.fillStyle = st.tripped ? cssVar('--bad') : cssVar('--good'); roundRect(ctx, 82, st.tripped ? 254 : 226, 26, 24, 4); ctx.fill();
  label(ctx, st.tripped ? 'OFF' : 'ON', 95, 296, { size: 11, weight: 800, color: st.tripped ? cssVar('--bad') : cssVar('--good') });
  // house wire with the appliances in parallel
  const hot = clamp((I - WIRE_MAX[st.wire]) / WIRE_MAX[st.wire], 0, 1);
  const wc = hot > 0 ? `rgb(${150 + 100 * hot}, ${80 - 40 * hot}, 30)` : cssVar('--wire');
  line(ctx, [[160, 240], [560, 240]], wc, 5);
  line(ctx, [[160, 260], [560, 260]], wc, 5);
  const keys = Object.keys(APPLIANCES);
  hit.app = [];
  keys.forEach((k, i) => {
    const x = 200 + i * 66;
    const on = st.on[k];
    line(ctx, [[x - 8, 240], [x - 8, 300]], cssVar('--wire'), 2); line(ctx, [[x + 8, 260], [x + 8, 300]], cssVar('--wire'), 2);
    ctx.fillStyle = on ? cssVar('--surface') : cssVar('--surface-2'); ctx.strokeStyle = on && !st.tripped ? cssVar('--good') : cssVar('--glass-stroke'); ctx.lineWidth = 2;
    roundRect(ctx, x - 30, 300, 60, 80, 8); ctx.fill(); ctx.stroke();
    ctx.font = font(26); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = cssVar('--text');
    ctx.globalAlpha = on && !st.tripped ? 1 : 0.35; ctx.fillText(ICONS[k], x, 328); ctx.globalAlpha = 1;
    label(ctx, t(`app.${k}`), x, 360, { size: 9, weight: 700 });
    label(ctx, qty(APPLIANCES[k], 1, 'A'), x, 374, { size: 10, color: cssVar('--muted') });
    hit.app.push({ k, x: x - 30, y: 300, w: 60, h: 80 });
  });
  label(ctx, `${t('lbl.wireD')} ${st.wire} mm · ${t('lbl.wireMax')} ${WIRE_MAX[st.wire]} A`, 360, 222, { size: 11, color: hot > 0 ? cssVar('--bad') : cssVar('--muted') });
  if (hot > 0 && !st.tripped) label(ctx, t('lbl.wireHot'), 360, 200, { size: 12, weight: 800, color: cssVar('--bad') });
  label(ctx, t('lbl.tapApp'), 360, 405, { size: 11, color: cssVar('--muted') });
}

/* ================================================================
   Loop
   ================================================================ */
let measT = 0;
const loop = createLoop({
  dt: 1 / 60,
  step: (dt) => {
    clock += dt; phase += dt * 50;
    if (!shell) return true;
    const tab = shell.tab;
    if (tab === 'earth') {
      const st = S.earth;
      if (st.grounded && !st.tripped) { st.tripped = true; st.fb = { type: 'good', key: 'fb.tripEarth' }; } // the leakage current goes to the earth: the breaker switches off at once
    } else if (tab === 'cell') {
      const st = S.cell;
      if (st.short) { st.used = Math.min(1, st.used + dt / 60); st.heat = Math.min(1, st.heat + dt / 8); st.shortTime += dt; }
      else st.heat = Math.max(0, st.heat - dt / 15);
    } else if (tab === 'lamps') {
      const st = S.lamps, e = lampsEval(st);
      st.heat = e.cellShort ? Math.min(1, st.heat + dt / 8) : Math.max(0, st.heat - dt / 15);
    } else if (tab === 'fuse') {
      const st = S.fuse, e = fuseEval(st);
      if (st.link === 'wool' && e.I > 1) { st.over += dt; if (st.over > 0.4) { st.melted = true; st.over = 0; for (let i = 0; i < 40; i++) st.sparks.push({ x: FC.WX + (Math.random() - 0.5) * 60, y: FC.BOT + (Math.random() - 0.5) * 20, vx: (Math.random() - 0.5) * 120, vy: -60 - Math.random() * 120, l: 1 }); } }
      else st.over = 0;
      st.heat = st.link === 'wire' && e.I > 1 ? Math.min(1, st.heat + dt / 6) : Math.max(0, st.heat - dt / 10);
      for (const p of st.sparks) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 300 * dt; p.l -= dt * 0.9; }
      st.sparks = st.sparks.filter((p) => p.l > 0);
    } else {
      const st = S.brk;
      if (!st.tripped && brkTotal(st) > st.rating) { st.over += dt; if (st.over > 1) { st.tripped = true; st.over = 0; } } else st.over = 0;
    }
    measT += dt;
    return true;
  },
  render: () => { draw(); if (measT > 0.15) { measT = 0; updateMeasures(); } },
});

/* ================================================================
   Pointer: tap the drawing (short wires, lamps, appliances, switch)
   ================================================================ */
const inR = (p, r) => r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
canvas.addEventListener('pointerdown', (ev) => {
  const p = view.toLogical(ev);
  const tab = shell.tab;
  if (tab === 'cell' && inR(p, hit.short)) toggle('cell', 'short');
  else if (tab === 'lamps') { const l = hit.lamps?.find((r) => inR(p, r)); if (l) toggle('lamps', l.k === 0 ? 's1' : 's2'); }
  else if (tab === 'fuse') { if (inR(p, hit.sw)) toggle('fuse', 'closed'); else if (inR(p, hit.lamp)) toggle('fuse', 'shortLamp'); }
  else if (tab === 'brk') { const a = hit.app?.find((r) => inR(p, r)); if (a) { S.brk.on[a.k] = !S.brk.on[a.k]; S.brk.row = {}; S.brk.fb = null; ui.tableSig = null; buildTab('brk'); } }
});
function toggle(tab, key) { S[tab][key] = !S[tab][key]; buildTab(tab); }

/* ================================================================
   Panels
   ================================================================ */
const controlsBody = document.getElementById('controls-body');
const measuresBody = document.getElementById('measures-body');
let ui = {};
function showStatus(fb) {
  if (!ui.status) return;
  if (!fb) { ui.status.hidden = true; return; }
  ui.status.hidden = false; ui.status.className = `status ${fb.type || ''}`; ui.status.textContent = t(fb.key, fb.params);
}
function measRows(rows) {
  const sig = JSON.stringify(rows);
  if (ui.dlSig === sig) return;
  ui.dlSig = sig;
  ui.dl.replaceChildren(...rows.flatMap(([k, v, cls]) => [el('dt', {}, k), el('dd', cls ? { class: cls } : {}, v)]));
}
function panel(controls, extra = []) {
  controlsBody.append(...controls.map((c) => c.root ?? c)); // segmented controls are given as their api
  ui.dl = el('dl', { class: 'meas' });
  ui.status = el('div', { class: 'status', hidden: '' });
  measuresBody.append(ui.dl, ...extra, ui.status);
}
const resetBtn = (id) => createButton({ labelKey: 'ui.reset', onClick: () => resetTab(id), variant: 'ghost' });
const yesNo = (labelKey, val, onChange) => createSegmented({ labelKey, options: [{ value: 'no', labelKey: 'opt.no' }, { value: 'yes', labelKey: 'opt.yes' }], value: val ? 'yes' : 'no', onChange: (v) => onChange(v === 'yes') });
const row = (...c) => el('div', { class: 'btn-row' }, c);
const hint = (k) => el('p', { class: 'muted', style: 'margin:8px 0 0' }, t(k));

function buildEarth() {
  const st = S.earth;
  panel([
    yesNo('ctl.grounded', st.grounded, (v) => { st.grounded = v; st.tripped = false; st.fb = null; }),
    createSegmented({ labelKey: 'ctl.floor', options: [{ value: 'dry', labelKey: 'floor.dry' }, { value: 'wet', labelKey: 'floor.wet' }], value: st.floor, onChange: (v) => { st.floor = v; } }),
    yesNo('ctl.touch', st.touch, (v) => { st.touch = v; }),
    row(createButton({ labelKey: 'ctl.resetBreaker', onClick: () => { st.tripped = false; st.fb = null; } }), resetBtn('earth')),
    hint('hint.teacher'),
  ]);
}
function updateEarth() {
  const st = S.earth, e = earthEval(st);
  const k = effectIndex(e.body);
  measRows([
    [t('m.machine'), t(st.grounded ? 'mach.grounded' : 'mach.notGrounded')],
    [t('m.body'), qty(e.body, 0, 'mA'), e.body >= 30 ? 'bad-text' : 'good-text'],
    [t('m.effect'), e.body > 0 && k >= 0 ? t(EFFECTS[k][1]) : t('eff.none'), e.body >= 30 ? 'bad-text' : ''],
    [t('m.breaker'), t(st.tripped ? 'brk.off' : 'brk.on')],
  ]);
  showStatus(e.body >= 30 ? { type: 'bad', key: 'fb.danger' } : st.fb);
}

function buildCell() {
  const st = S.cell;
  panel([
    yesNo('ctl.shortCell', st.short, (v) => { st.short = v; }),
    row(createButton({ labelKey: 'ctl.newCell', onClick: () => { st.used = 0; st.heat = 0; st.shortTime = 0; } }), resetBtn('cell')),
    hint('hint.tapWire'),
  ]);
}
function updateCell() {
  const st = S.cell, e = cellEval(st);
  measRows([
    [t('m.lamp'), t(glowOf(e.IL, LAMP45) > 0.8 ? 'lamp.normal' : e.IL > 0.01 ? 'lamp.dim' : 'lamp.off'), glowOf(e.IL, LAMP45) > 0.8 ? 'good-text' : ''],
    [t('m.Ilamp'), qty(e.IL, 2, 'A')],
    [t('m.Ishort'), qty(e.Is, 1, 'A'), e.Is > 0 ? 'bad-text' : ''],
    [t('m.cellState'), t(st.used > 0.25 ? 'cell.exhausted' : st.used > 0.02 ? 'cell.used' : 'cell.new'), st.used > 0.25 ? 'bad-text' : ''],
  ]);
  showStatus(st.short ? { type: 'bad', key: 'fb.cellShort' } : null);
}

function buildLamps() {
  const st = S.lamps;
  panel([
    yesNo('ctl.s1', st.s1, (v) => { st.s1 = v; }),
    yesNo('ctl.s2', st.s2, (v) => { st.s2 = v; }),
    yesNo('ctl.burnt2', st.burnt2, (v) => { st.burnt2 = v; }),
    row(resetBtn('lamps')),
    hint('hint.tapLamp'),
  ]);
}
function updateLamps() {
  const st = S.lamps, e = lampsEval(st);
  const lampState = (g, k) => (k === 1 && st.burnt2 ? t('lamp.burnt') : g > 1.05 ? t('lamp.bright') : g > 0.05 ? t('lamp.normal') : t('lamp.off'));
  measRows([
    [t('m.ammeter'), qty(e.I, 2, 'A'), e.cellShort ? 'bad-text' : ''],
    ['L1', lampState(e.glow[0], 0)],
    ['L2', lampState(e.glow[1], 1)],
  ]);
  showStatus(e.cellShort ? { type: 'bad', key: 'fb.bothShort' } : null);
}

function buildFuse() {
  const st = S.fuse;
  panel([
    createSegmented({ labelKey: 'ctl.link', options: [{ value: 'wool', labelKey: 'link.wool' }, { value: 'wire', labelKey: 'link.wire' }], value: st.link, onChange: (v) => { st.link = v; st.melted = false; st.heat = 0; } }),
    yesNo('ctl.closed', st.closed, (v) => { st.closed = v; }),
    yesNo('ctl.shortLamp', st.shortLamp, (v) => { st.shortLamp = v; }),
    row(createButton({ labelKey: 'ctl.newWool', onClick: () => { if (st.shortLamp && st.closed) { st.fb = { type: 'warn', key: 'fb.removeShortFirst' }; updateMeasures(); return; } st.melted = false; st.fb = null; } }), resetBtn('fuse')),
    hint('hint.tapFuse'),
  ]);
}
function updateFuse() {
  const st = S.fuse, e = fuseEval(st);
  measRows([
    [t('m.I'), qty(e.I, 2, 'A'), e.I > 1 ? 'bad-text' : ''],
    [t('m.lamp'), t(e.glow > 0.05 ? 'lamp.normal' : 'lamp.off')],
    [t(st.link === 'wool' ? 'm.wool' : 'm.wire'), t(st.link === 'wool' ? (st.melted ? 'wool.burnt' : 'wool.ok') : st.heat > 0.3 ? 'wire.hot' : 'wire.ok'), (st.melted || st.heat > 0.3) ? 'bad-text' : ''],
  ]);
  let fb = st.fb;
  if (st.melted) fb = { type: 'good', key: 'fb.woolBurnt' };
  else if (st.link === 'wire' && e.I > 1) fb = { type: 'bad', key: 'fb.fire' };
  showStatus(fb);
}

function buildBrk() {
  const st = S.brk;
  ui.table = el('table', { class: 'data' });
  panel([
    createSegmented({ labelKey: 'ctl.rating', options: [{ value: '10', labelKey: 'rating.10' }, { value: '40', labelKey: 'rating.40' }], value: String(st.rating), onChange: (v) => { st.rating = Number(v); st.tripped = false; } }),
    createSegmented({ labelKey: 'ctl.wireD', options: Object.keys(WIRE_MAX).map((d) => ({ value: d, labelKey: `wire.${d.replace('.', '_')}` })), value: st.wire, onChange: (v) => { st.wire = v; } }),
    row(createButton({ labelKey: 'ctl.resetBreaker', onClick: () => { if (brkTotal(st) > st.rating) { st.fb = { type: 'warn', key: 'fb.tooMany' }; updateMeasures(); return; } st.tripped = false; st.fb = null; } }), resetBtn('brk')),
    hint('hint.tapApp'),
  ], [ui.table]);
}
function updateBrk() {
  const st = S.brk;
  const I = brkTotal(st);
  measRows([
    [t('m.breaker'), `${st.rating} A · ${t(st.tripped ? 'brk.off' : 'brk.on')}`, st.tripped ? 'bad-text' : 'good-text'],
    [t('m.wireMax'), qty(WIRE_MAX[st.wire], 0, 'A')],
  ]);
  const names = Object.keys(APPLIANCES).filter((k) => st.on[k]);
  const sig = calcSig([st.row]) + names.join() + t('m.appCol');
  if (ui.tableSig !== sig) {
    ui.tableSig = sig;
    const head = el('tr', {}, [el('th', {}, t('m.appCol')), el('th', {}, 'I (A)')]);
    const body = names.map((k) => el('tr', {}, [el('td', {}, t(`app.${k}`)), el('td', {}, num(APPLIANCES[k], 1))]));
    body.push(el('tr', {}, [el('td', {}, t('m.totalCol')), calcCell(st.row, 'tot', { expected: I, decimals: 1, onCheck: (res) => { st.fb = res === 'ok' ? { type: 'good', key: I > st.rating ? 'fb.totOver' : 'fb.totOk', params: { I: num(I, 1), r: st.rating } } : res === 'wrong' ? { type: 'bad', key: 'fb.totWrong' } : { type: 'warn', key: 'calc.invalid' }; updateMeasures(); } })]));
    ui.table.replaceChildren(el('thead', {}, head), el('tbody', {}, body));
  }
  showStatus(st.tripped && !st.fb ? { type: 'bad', key: 'fb.tripped' } : st.fb);
}

function buildTab(id) {
  controlsBody.replaceChildren(); measuresBody.replaceChildren(); ui = {};
  ({ earth: buildEarth, cell: buildCell, lamps: buildLamps, fuse: buildFuse, brk: buildBrk })[id]();
  updateMeasures(); draw();
}
function updateMeasures() {
  if (!shell || !ui.dl) return;
  ({ earth: updateEarth, cell: updateCell, lamps: updateLamps, fuse: updateFuse, brk: updateBrk })[shell.tab]();
}
function resetTab(id) { S[id] = initialState()[id]; buildTab(id); }
onLangChange(() => { if (shell) buildTab(shell.tab); });

shell = initSim({
  strings,
  notRequired: true, // Ch.13 is not in the CRDP 2026–2027 list (curriculum-scope.md)
  tabs: [
    { id: 'earth', labelKey: 'tab.earth' },
    { id: 'cell', labelKey: 'tab.cell' },
    { id: 'lamps', labelKey: 'tab.lamps' },
    { id: 'fuse', labelKey: 'tab.fuse' },
    { id: 'brk', labelKey: 'tab.brk' },
  ],
  initialTab: 'earth',
  onTab: buildTab,
});
shell.start();
loop.start();
if (DEBUG) window.__sim = { S, lampsEval, fuseEval, cellEval, earthEval };
