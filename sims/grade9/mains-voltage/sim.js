// Grade 9 — The voltage of the mains and electric safety (Ch.7 Act. 1–8, Ex. 11–14)
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num, parseNum } from '../../../shared/format.js';
import { createButton, createSegmented, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, font } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { calcCell, calcSig, calcDone } from '../../../shared/calc-cell.js';
import { drawLamp, drawSwitch, drawCurrentArrows, labelI, drawMeterBox, METER_HALF as MH, symLamp, symMeter, symCell } from '../../../shared/circuit-draw.js';
import { drawMultimeter, meterLead, reading } from '../../../shared/multimeter-draw.js';

/* ================================================================
   Model — values from the book
   ================================================================ */
const U_LN = 216, U_LG = 220, U_NG = 2; // V, AC voltmeter in Fig. 2a, 2b, 2c (display 216, 220, 002)
const U_MAINS = 220; // V, effective voltage of the mains (EDL)
const F_MAINS = 50; // Hz
const NEON_MIN = 80; // V: the neon lamp of the tester glows above about 80 V
// AC voltmeter ranges (the book: "AC~ mode and the range just larger than 220 V")
const RANGES = {
  off: { kind: null, angle: -90 },
  vdc600: { kind: 'V', ac: false, max: 600, dec: 0, k: 1, unit: 'V', jack: 'V', label: '600', angle: -150 },
  vac750: { kind: 'V', ac: true, max: 750, dec: 0, k: 1, unit: 'V', jack: 'V', label: '750', angle: -30 },
  vac200: { kind: 'V', ac: true, max: 199.9, dec: 1, k: 1, unit: 'V', jack: 'V', label: '200', angle: 10 },
};
const DIAL_ORDER = ['off', 'vdc600', 'vac750', 'vac200'];
const JACKS = [{ name: '10A' }, { name: 'A' }, { name: 'COM' }, { name: 'V' }];
// Exercise 14: currents of the household appliances (A)
const APPLIANCES = [
  { id: 'lighting', I: 2 },
  { id: 'oven', I: 10 },
  { id: 'heater', I: 5 },
  { id: 'iron', I: 3 },
  { id: 'radiator', I: 7, max: 4 },
  { id: 'aircon', I: 9 }, // Fig. 3 shows an air conditioner; 9 A is illustrative, so the 50 A breaker of Act. 7 can trip
];
const TRIP_DELAY = 1.2; // s before the breaker releases on an overload (illustrative)
// Activity 6: lamp on the 6 V dry cell with a fuse (illustrative values)
const I_LAMP = 0.43, FUSE_RATING = 1; // A
const FUSE_MELT_TIME = 0.6; // s
// Activity 8 (Fig. 8b): the differential circuit breaker detects a leak of 0.3 A
const I_MACHINE = 2.0, I_LEAK = 0.3, DIFF_SENS = 0.03; // A

function newOutlet() { return Math.random() < 0.5 ? 1 : 2; } // which female terminal is the live one
function initialState(tab) {
  switch (tab) {
    case 'outlet': return { tool: 'tester', at: 1, thumb: true, pair: '12', range: 'vac750', live: newOutlet(), rows: [], calc: {}, fb: null };
    case 'house': return { on: { lighting: true, oven: false, heater: false, iron: false, aircon: false }, radiators: 0, rating: 30, tripped: false, over: 0, rows: [], fb: null };
    case 'fuse': return { exp: 'fuse', closed: true, shorted: false, fuse: 'fuse', blown: false, heat: 0, wool: false, burn: 0, fb: null };
    default: return { machine: true, fault: false, earth: true, tripped: false, leakTime: 0, fb: null };
  }
}
const TABS = ['outlet', 'house', 'fuse', 'diff'];
let S = Object.fromEntries(TABS.map((k) => [k, initialState(k)]));

// Voltage between two terminals of the outlet: '1', '2', 'G'
function voltageBetween(st, a, b) {
  const key = [a, b].sort().join('');
  const liveIn = key.includes(String(st.live));
  if (key === '12') return U_LN;
  return liveIn ? U_LG : U_NG; // between a female terminal and the ground
}
function evalOutlet(st) {
  const [a, b] = st.pair.split('');
  const u = voltageBetween(st, a, b === 'G' ? 'G' : b);
  const R = RANGES[st.range];
  const value = R.kind ? (R.ac ? u : 0) : 0; // in DC mode an alternating voltage reads 0
  const r = reading(R, value, 'V');
  const neon = st.at === st.live && st.thumb && U_LG > NEON_MIN;
  return { u, r, range: R, neon };
}
function houseCurrent(st) {
  let I = 0;
  for (const a of APPLIANCES) I += a.id === 'radiator' ? a.I * st.radiators : (st.on[a.id] ? a.I : 0);
  return I;
}
function evalHouse(st) {
  const Ion = houseCurrent(st);
  return { Ion, I: st.tripped ? 0 : Ion, overload: Ion > st.rating };
}
function evalFuse(st) {
  if (st.exp === 'wool') return { I: 0 };
  const conducting = st.closed && !(st.fuse === 'fuse' && st.blown);
  const I = !conducting ? 0 : st.shorted ? Infinity : I_LAMP;
  return { I, lamp: conducting && !st.shorted ? 1 : 0, big: I === Infinity };
}
function evalDiff(st) {
  if (st.tripped || !st.machine) return { IL: 0, IN: 0, Ileak: 0, bodyLive: st.fault && !st.earth && !st.tripped };
  const leak = st.fault && st.earth ? I_LEAK : 0;
  return { IL: I_MACHINE, IN: I_MACHINE - leak, Ileak: leak, bodyLive: st.fault && !st.earth };
}
const EVAL = { outlet: evalOutlet, house: evalHouse, fuse: evalFuse, diff: evalDiff };
const evaluate = (tab, st) => EVAL[tab](st);

/* ================================================================
   Canvas
   ================================================================ */
const HEIGHTS = { outlet: 380, house: 420, fuse: 380, diff: 380 };
let shell;
const anim = { t: 0, ph: 0 };
let hit = [];
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
const COL = { L: () => cssVar('--accent'), N: () => cssVar('--meter-v'), G: () => cssVar('--good') };

function tag(ctx, s, x, y, color = cssVar('--text'), size = 14, align = 'center') {
  ctx.fillStyle = color;
  ctx.font = font(size, 800);
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}
function line(ctx, pts, color, w = 4) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
}
// green-yellow earth wire
function earthLine(ctx, pts, w = 4) {
  line(ctx, pts, cssVar('--good'), w);
  ctx.save();
  ctx.setLineDash([6, 6]);
  line(ctx, pts, '#e3c300', w);
  ctx.restore();
}
function earthSymbol(ctx, x, y) {
  ctx.strokeStyle = cssVar('--text');
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y - 10); ctx.lineTo(x, y);
  for (let k = 0; k < 3; k++) { const w = 14 - 4 * k; ctx.moveTo(x - w, y + 5 * k); ctx.lineTo(x + w, y + 5 * k); }
  ctx.stroke();
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
  ({ outlet: drawOutletScene, house: drawHouse, fuse: drawFuseScene, diff: drawDiff })[tab](ctx, st, e);
  drawDiagram(tab, st, e);
}

/* ---------- Activities 1–2: the wall outlet ---------- */
const OUT = { cx: 180, cy: 210 };
const holes = () => ({ 1: [OUT.cx - 34, OUT.cy + 6], 2: [OUT.cx + 34, OUT.cy + 6], G: [OUT.cx, OUT.cy - 34] });
function drawOutlet(ctx, st) {
  const { cx, cy } = OUT;
  // wall
  ctx.fillStyle = cssVar('--wood');
  roundRect(ctx, 30, 40, 300, 320, 12);
  ctx.fill();
  // wires coming from the wall: colours follow the convention (red live, blue neutral, green-yellow ground)
  const H = holes();
  const liveH = H[st.live], neutH = H[st.live === 1 ? 2 : 1];
  ctx.globalAlpha = 0.7;
  line(ctx, [[liveH[0], 50], liveH], COL.L(), 5);
  line(ctx, [[neutH[0], 50], neutH], COL.N(), 5);
  earthLine(ctx, [[H.G[0], 50], H.G], 5);
  ctx.globalAlpha = 1;
  // plate
  ctx.fillStyle = '#f7f7f4';
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 2;
  roundRect(ctx, cx - 90, cy - 90, 180, 180, 22);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#e9e9e4';
  ctx.beginPath(); ctx.arc(cx, cy, 62, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // female terminals 1 and 2, male ground pin
  for (const k of ['1', '2']) {
    ctx.fillStyle = '#2a2d33';
    ctx.beginPath(); ctx.arc(H[k][0], H[k][1], 8, 0, Math.PI * 2); ctx.fill();
    tag(ctx, k, H[k][0], H[k][1] + 26, '#2a2d33', 14);
    hit.push({ kind: 'hole', id: Number(k), x: H[k][0], y: H[k][1], r: 26 });
  }
  ctx.fillStyle = cssVar('--pan-metal');
  roundRect(ctx, H.G[0] - 7, H.G[1] - 12, 14, 24, 6);
  ctx.fill(); ctx.stroke();
  tag(ctx, t('outlet.ground'), H.G[0], H.G[1] - 26, '#2a2d33', 12);
  hit.push({ kind: 'hole', id: 'G', x: H.G[0], y: H.G[1], r: 24 });
}
function drawOutletScene(ctx, st, e) {
  drawOutlet(ctx, st);
  const H = holes();
  if (st.tool === 'tester') {
    // screwdriver tester inserted in the chosen terminal, the hand above
    const tip = H[st.at];
    const ang = 0.55;
    const L = 200;
    const end = [tip[0] + L * Math.cos(ang), tip[1] + L * Math.sin(ang)];
    ctx.save();
    ctx.translate(tip[0], tip[1]);
    ctx.rotate(ang);
    ctx.fillStyle = cssVar('--pan-metal');
    ctx.fillRect(0, -3, 70, 6); // metal blade
    ctx.fillStyle = 'rgba(190, 215, 240, 0.85)';
    roundRect(ctx, 70, -11, 110, 22, 8);
    ctx.fill();
    // neon lamp window
    ctx.fillStyle = e.neon ? '#ff7a1a' : '#9aa4b0';
    if (e.neon) { ctx.shadowColor = '#ff7a1a'; ctx.shadowBlur = 18; }
    roundRect(ctx, 110, -5, 34, 10, 4);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = cssVar('--accent');
    roundRect(ctx, 180, -12, 30, 24, 6); // metal cap at the end
    ctx.fill();
    ctx.restore();
    if (st.thumb) {
      ctx.fillStyle = cssVar('--skin');
      ctx.beginPath(); ctx.ellipse(end[0] - 2, end[1] + 4, 18, 13, ang, 0, Math.PI * 2); ctx.fill();
      tag(ctx, t('tester.thumb'), end[0] + 26, end[1] + 6, cssVar('--text'), 12, 'left');
    }
    if (e.neon) tag(ctx, t('tester.glows'), 470, 250, '#e0661a', 16);
    else tag(ctx, t('tester.dark'), 470, 250, cssVar('--muted'), 15);
    return;
  }
  // AC voltmeter between two terminals
  const J = drawMultimeter(ctx, {
    x: 396, y: 20, w: 190, h: 340, ranges: RANGES, order: DIAL_ORDER, value: st.range, offLabel: 'OFF', jacks: JACKS,
    text: e.r.text, unit: e.range.kind ? (e.range.ac ? 'V~' : 'V⎓') : '', overload: e.r.overload, zoneV: 'V ⎓', zoneA: 'V ~',
  });
  const dial = J.dial;
  for (const d of dial) hit.push({ kind: 'dial', id: d.id, x: d.x, y: d.y, r: d.r });
  const [a, b] = st.pair.split('');
  meterLead(ctx, J.jacks.V, H[a], cssVar('--accent'), [J.jacks.V[0], 372], [H[a][0] + 60, H[a][1] + 160]);
  meterLead(ctx, J.jacks.COM, H[b], cssVar('--lead-black'), [J.jacks.COM[0], 372], [H[b][0] + 80, H[b][1] + 150]);
  tag(ctx, t('outlet.teacher'), 180, 372, cssVar('--bad'), 12);
}

/* ---------- Activities 3 and 7, Ex. 14: domestic installation ---------- */
const HS = { top: 70, x0: 150, x1: 580, slots: [184, 256, 328, 400, 472, 544], yDev: 250 };
function drawHouse(ctx, st, e) {
  // meter and circuit breaker
  ctx.fillStyle = cssVar('--device');
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, 20, 36, 96, 70, 8); ctx.fill(); ctx.stroke();
  tag(ctx, t('house.meter'), 68, 54, cssVar('--text-on-meter'), 12);
  ctx.fillStyle = cssVar('--lcd-bg');
  roundRect(ctx, 30, 66, 76, 26, 4); ctx.fill();
  tag(ctx, `${num(e.I, 0)} A`, 68, 80, cssVar('--lcd-ink'), 15);
  // breaker
  const bx = 28, by = 130;
  ctx.fillStyle = cssVar('--battery');
  roundRect(ctx, bx, by, 80, 96, 8); ctx.fill();
  tag(ctx, `${st.rating} A`, bx + 40, by + 18, '#ffffff', 15);
  ctx.fillStyle = st.tripped ? cssVar('--bad') : cssVar('--good');
  roundRect(ctx, bx + 24, by + (st.tripped ? 56 : 34), 32, 26, 5); ctx.fill();
  tag(ctx, st.tripped ? 'OFF' : 'ON', bx + 40, by + (st.tripped ? 69 : 47), '#ffffff', 12);
  tag(ctx, t('house.breaker'), bx + 40, by + 112, cssVar('--text'), 12);
  hit.push({ kind: 'breaker', x: bx + 40, y: by + 50, r: 50 });
  // overload warning bar
  if (e.overload && !st.tripped) {
    const k = Math.min(1, st.over / TRIP_DELAY);
    ctx.fillStyle = cssVar('--bad');
    roundRect(ctx, bx, by + 120, 80 * k, 8, 4); ctx.fill();
  }
  // live and neutral lines
  const yL = HS.top, yN = HS.top + 26;
  // meter → circuit breaker → live and neutral lines of the installation
  line(ctx, [[58, 106], [58, 130]], COL.L(), 5);
  line(ctx, [[78, 106], [78, 130]], COL.N(), 5);
  line(ctx, [[108, 160], [HS.x0 - 12, 160], [HS.x0 - 12, yL], [HS.x1, yL]], COL.L(), 5);
  line(ctx, [[108, 200], [HS.x0, 200], [HS.x0, yN], [HS.x1, yN]], COL.N(), 5);
  // appliances in parallel
  APPLIANCES.forEach((a, i) => {
    const x = HS.slots[i];
    const on = a.id === 'radiator' ? st.radiators > 0 : st.on[a.id];
    const powered = on && !st.tripped;
    line(ctx, [[x - 12, yL], [x - 12, HS.yDev - 40]], COL.L(), 3);
    line(ctx, [[x + 12, yN], [x + 12, HS.yDev - 40]], COL.N(), 3);
    ctx.fillStyle = cssVar('--wire');
    ctx.beginPath(); ctx.arc(x - 12, yL, 4, 0, Math.PI * 2); ctx.arc(x + 12, yN, 4, 0, Math.PI * 2); ctx.fill();
    // switch
    ctx.fillStyle = on ? cssVar('--good') : cssVar('--socket');
    roundRect(ctx, x - 22, HS.yDev - 70, 44, 26, 6); ctx.fill();
    tag(ctx, on ? 'ON' : 'OFF', x, HS.yDev - 57, '#ffffff', 11);
    // appliance box
    ctx.fillStyle = powered ? cssVar('--surface') : cssVar('--bg');
    ctx.strokeStyle = powered ? cssVar('--gold') : cssVar('--border');
    ctx.lineWidth = powered ? 3 : 1.5;
    roundRect(ctx, x - 32, HS.yDev - 36, 64, 92, 10); ctx.fill(); ctx.stroke();
    if (a.id === 'lighting') drawLamp(ctx, { x, y: HS.yDev + 34, glow: powered ? 1 : 0 });
    else applianceIcon(ctx, a.id, x, HS.yDev + 8, powered);
    tag(ctx, t(`short.${a.id}`), x, HS.yDev + 72, cssVar('--text'), 10);
    tag(ctx, a.id === 'radiator' ? `${st.radiators} × ${a.I} A` : `${a.I} A`, x, HS.yDev + 88, cssVar('--muted'), 11);
    hit.push({ kind: 'app', id: a.id, x, y: HS.yDev, r: 46 });
  });
  tag(ctx, t('wire.live'), HS.x1 - 4, yL - 14, COL.L(), 12, 'right');
  ctx.font = font(12, 800);
  const wN = ctx.measureText(t('wire.neutral')).width;
  ctx.fillStyle = cssVar('--board');
  roundRect(ctx, HS.x1 - 8 - wN, yN + 5, wN + 8, 18, 4); ctx.fill();
  tag(ctx, t('wire.neutral'), HS.x1 - 4, yN + 14, COL.N(), 12, 'right');
  if (st.tripped) tag(ctx, t('house.tripped'), 360, 395, cssVar('--bad'), 15);
  else if (e.overload) tag(ctx, t('house.overload'), 360, 395, cssVar('--bad'), 15);
}
function applianceIcon(ctx, id, x, y, on) {
  ctx.lineWidth = 2;
  ctx.strokeStyle = cssVar('--text');
  const hot = on ? cssVar('--hot') : cssVar('--muted');
  if (id === 'oven') {
    ctx.strokeRect(x - 22, y - 20, 44, 36);
    ctx.fillStyle = on ? 'rgba(255,138,76,0.5)' : 'transparent';
    ctx.fillRect(x - 16, y - 12, 32, 20);
    ctx.strokeRect(x - 16, y - 12, 32, 20);
  } else if (id === 'heater') {
    ctx.beginPath(); ctx.ellipse(x, y - 2, 14, 22, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = hot; ctx.beginPath(); ctx.arc(x, y + 10, 4, 0, Math.PI * 2); ctx.fill();
  } else if (id === 'iron') {
    ctx.beginPath(); ctx.moveTo(x - 22, y + 12); ctx.lineTo(x + 22, y + 12); ctx.quadraticCurveTo(x + 18, y - 10, x - 6, y - 10); ctx.lineTo(x - 22, y + 12); ctx.stroke();
    ctx.fillStyle = hot; ctx.fillRect(x - 18, y + 9, 36, 4);
  } else if (id === 'aircon') {
    ctx.strokeRect(x - 24, y - 14, 48, 24);
    for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(x - 18, y - 6 + 6 * k); ctx.lineTo(x + 18, y - 6 + 6 * k); ctx.stroke(); }
    if (on) { ctx.strokeStyle = cssVar('--meter-v'); for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(x - 12 + 12 * k, y + 16); ctx.lineTo(x - 14 + 12 * k, y + 26); ctx.stroke(); } }
  } else {
    for (let k = 0; k < 5; k++) { ctx.strokeStyle = on ? cssVar('--hot') : cssVar('--text'); ctx.strokeRect(x - 22 + k * 9, y - 18, 6, 34); }
  }
}

/* ---------- Activities 5–6, Ex. 11: short circuit and fuse ---------- */
function drawFuseScene(ctx, st, e) {
  if (st.exp === 'wool') return drawWool(ctx, st);
  const CY = 100, BY = 290, XL = 60, XR = 520, CX = 320, LX = 200, FX = 400, SWX = 150;
  const wire = cssVar('--wire');
  // circuit: cell (top) → right wire → fuse → lamp → left wire
  const hotWire = st.shorted && !(st.fuse === 'fuse' && st.blown) && st.closed;
  const wcol = hotWire ? heatCol(st.heat) : wire;
  line(ctx, [[CX + 62, CY], [XR, CY], [XR, BY], [FX + 40, BY]], wcol, 5);
  line(ctx, [[FX - 40, BY], [LX + 30, BY]], wcol, 5);
  line(ctx, [[LX - 30, BY], [XL, BY], [XL, CY], [SWX - 50, CY]], wcol, 5);
  if (st.closed) line(ctx, [[SWX + 50, CY], [CX - 62, CY]], wcol, 5);
  else line(ctx, [[SWX + 50, CY], [CX - 62, CY]], wire, 5);
  drawSwitch(ctx, { x: SWX, y: CY, open: !st.closed });
  hit.push({ kind: 'switch', x: SWX, y: CY - 20, r: 50 });
  // dry cell
  ctx.fillStyle = cssVar('--battery');
  roundRect(ctx, CX - 56, CY - 28, 112, 56, 6); ctx.fill();
  tag(ctx, '6 V', CX, CY - 8, '#ffffff', 15);
  tag(ctx, '−', CX - 66, CY - 22, cssVar('--text'), 18);
  tag(ctx, '+', CX + 66, CY - 22, cssVar('--accent'), 18);
  // fuse holder
  ctx.fillStyle = cssVar('--socket');
  roundRect(ctx, FX - 44, BY - 12, 88, 24, 6); ctx.fill();
  if (st.fuse === 'fuse') {
    ctx.fillStyle = 'rgba(200, 220, 240, 0.5)';
    roundRect(ctx, FX - 34, BY - 9, 68, 18, 8); ctx.fill();
    if (st.blown) {
      line(ctx, [[FX - 34, BY], [FX - 8, BY - 3]], '#555', 1.6); line(ctx, [[FX + 8, BY + 3], [FX + 34, BY]], '#555', 1.6);
    } else line(ctx, [[FX - 34, BY], [FX + 34, BY]], hotWire ? heatCol(Math.min(1, st.heat * 2)) : '#666', 1.6);
  } else {
    line(ctx, [[FX - 34, BY], [FX + 34, BY]], cssVar('--copper'), 4);
  }
  tag(ctx, t(st.fuse === 'fuse' ? (st.blown ? 'fuse.blown' : 'fuse.label') : 'fuse.copper'), FX, BY + 30, st.blown ? cssVar('--bad') : cssVar('--text'), 12);
  // lamp
  drawLamp(ctx, { x: LX, y: BY, glow: e.lamp });
  tag(ctx, 'L', LX - 52, BY - 40);
  // thick wire across the lamp (short circuit)
  if (st.shorted) {
    line(ctx, [[LX - 30, BY], [LX - 30, BY + 50], [LX + 30, BY + 50], [LX + 30, BY]], hotWire ? heatCol(st.heat) : cssVar('--copper'), 7);
    tag(ctx, t('fuse.thickWire'), LX, BY + 68, cssVar('--text'), 12);
  }
  if (e.I > 0 && Number.isFinite(e.I)) {
    drawCurrentArrows(ctx, [[CX + 62, CY], [XR, CY], [XR, BY], [XL, BY], [XL, CY], [CX - 62, CY]], anim.ph, (x, y) => (Math.abs(y - BY) < 1 && (Math.abs(x - LX) < 40 || Math.abs(x - FX) < 46)) || (Math.abs(y - CY) < 1 && Math.abs(x - SWX) < 62));
    labelI(ctx, XR + 22, (CY + BY) / 2, Math.PI / 2);
  } else if (e.big) {
    drawCurrentArrows(ctx, [[CX + 62, CY], [XR, CY], [XR, BY], [XL, BY], [XL, CY], [CX - 62, CY]], anim.ph * 3, (x, y) => (Math.abs(y - BY) < 1 && Math.abs(x - FX) < 46) || (Math.abs(y - CY) < 1 && Math.abs(x - SWX) < 62));
    labelI(ctx, XR + 22, (CY + BY) / 2, Math.PI / 2);
  }
  if (hotWire && st.fuse === 'copper') tag(ctx, t('fuse.fire'), 300, 200, cssVar('--bad'), 16);
}
function heatCol(h) {
  const k = Math.max(0, Math.min(1, h));
  const r = Math.round(43 + (255 - 43) * k), g = Math.round(49 + (110 - 49) * k), b = Math.round(64 * (1 - k));
  return `rgb(${r},${g},${b})`;
}
function drawWool(ctx, st) {
  // car battery (12 V) and a tuft of steel wool (Fig. 5a)
  ctx.fillStyle = cssVar('--battery');
  roundRect(ctx, 150, 170, 300, 150, 12); ctx.fill();
  tag(ctx, t('wool.battery'), 300, 260, '#ffffff', 18);
  const P = [210, 160], N = [390, 160];
  ctx.fillStyle = cssVar('--accent'); roundRect(ctx, P[0] - 20, P[1] - 10, 40, 22, 4); ctx.fill();
  ctx.fillStyle = '#1d1f24'; roundRect(ctx, N[0] - 20, N[1] - 10, 40, 22, 4); ctx.fill();
  tag(ctx, '+', P[0], P[1] + 1, '#ffffff', 16); tag(ctx, '−', N[0], N[1] + 1, '#ffffff', 16);
  if (st.wool) {
    const k = Math.min(1, st.burn / 2);
    ctx.save();
    for (let i = 0; i < 70; i++) {
      const u = i / 69, x = P[0] + (N[0] - P[0]) * u, y = 140 - 28 * Math.sin(Math.PI * u);
      const jx = Math.sin(i * 12.9898) * 14, jy = Math.cos(i * 78.233) * 12;
      const glow = k > 0 && (Math.sin(i * 3.7 + anim.t * 9) > 0.2 - k);
      ctx.strokeStyle = glow ? (Math.random() < 0.5 ? '#ffb347' : '#ff5a1f') : '#8d939c';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(x + jx, y + jy, 6 + (i % 5), 0, Math.PI * 1.6); ctx.stroke();
    }
    // sparks
    if (k > 0) for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2, r = 10 + Math.random() * 40;
      ctx.fillStyle = '#ffd166';
      ctx.fillRect(300 + Math.cos(a) * r * 2.5, 125 + Math.sin(a) * r, 2, 2);
    }
    ctx.restore();
    tag(ctx, t('wool.burning'), 300, 350, cssVar('--bad'), 15);
  } else tag(ctx, t('wool.hint'), 300, 90, cssVar('--muted'), 14);
}

/* ---------- Activity 8: the differential circuit breaker ---------- */
function drawDiff(ctx, st, e) {
  const yL = 110, yN = 160, yG = 300;
  const BX = 160, MX = 430;
  // supply from the left
  tag(ctx, t('diff.supply'), 60, 70, cssVar('--text'), 12);
  line(ctx, [[30, yL], [BX - 50, yL]], COL.L(), 5);
  line(ctx, [[30, yN], [BX - 50, yN]], COL.N(), 5);
  // differential breaker
  ctx.fillStyle = cssVar('--device');
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, BX - 50, 70, 120, 130, 10); ctx.fill(); ctx.stroke();
  tag(ctx, t('diff.name'), BX + 10, 84, cssVar('--text-on-meter'), 11);
  tag(ctx, `${num(DIFF_SENS * 1000, 0)} mA`, BX + 10, 186, cssVar('--text-on-meter'), 11);
  const lever = st.tripped ? 'OFF' : 'ON';
  ctx.fillStyle = st.tripped ? cssVar('--bad') : cssVar('--good');
  roundRect(ctx, BX - 10, 120, 40, 34, 6); ctx.fill();
  tag(ctx, lever, BX + 10, 137, '#ffffff', 13);
  hit.push({ kind: 'diffreset', x: BX + 10, y: 137, r: 40 });
  // lines to the machine
  line(ctx, [[BX + 70, yL], [MX - 60, yL], [MX - 60, 200]], COL.L(), 5);
  line(ctx, [[BX + 70, yN], [MX - 30, yN], [MX - 30, 200]], COL.N(), 5);
  // washing machine
  const body = e.bodyLive ? cssVar('--bad') : cssVar('--pan-metal');
  ctx.fillStyle = cssVar('--surface');
  ctx.strokeStyle = body;
  ctx.lineWidth = e.bodyLive ? 4 : 2;
  roundRect(ctx, MX - 90, 200, 160, 150, 12); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(MX - 10, 285, 38, 0, Math.PI * 2); ctx.stroke();
  if (st.machine && !st.tripped) {
    ctx.save(); ctx.translate(MX - 10, 285); ctx.rotate(anim.t * 4);
    ctx.strokeStyle = cssVar('--meter-v'); ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI * 1.3); ctx.stroke(); ctx.restore();
  }
  tag(ctx, t('diff.machine'), MX - 10, 222, cssVar('--text'), 12);
  // fault: the live wire touches the metal body
  if (st.fault) {
    line(ctx, [[MX - 60, 200], [MX - 84, 232]], COL.L(), 3);
    ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(MX - 86, 234, 6, 0, Math.PI * 2); ctx.fill();
    tag(ctx, t('diff.faultLabel'), MX - 90, 372, cssVar('--bad'), 12, 'left');
  }
  // earth wire from the metal body to the ground
  if (st.earth) { earthLine(ctx, [[MX + 70, 330], [MX + 110, 330], [MX + 110, yG + 50]]); earthSymbol(ctx, MX + 110, yG + 60); }
  else { earthLine(ctx, [[MX + 70, 330], [MX + 92, 330]]); tag(ctx, t('diff.noEarth'), MX + 100, 300, cssVar('--bad'), 11); }
  // current displays
  drawMeterBox(ctx, { x: BX + 10, y: 250, kind: 'A', name: 'IL', text: num(e.IL, 2), unit: 'A' });
  drawMeterBox(ctx, { x: BX + 10, y: 330, kind: 'A', name: 'IN', text: num(e.IN, 2), unit: 'A' });
  if (e.Ileak > 0) tag(ctx, `${t('diff.leak')} ${num(e.Ileak, 1)} A`, MX + 110, yG + 2, cssVar('--bad'), 12);
  if (e.bodyLive) tag(ctx, t('diff.bodyLive'), MX - 10, 186, cssVar('--bad'), 12);
}

/* ---------- Diagrams ---------- */
function drawDiagram(tab, st, e) {
  const ctx = diag.begin();
  const ink = cssVar('--text');
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  const L = (pts, c = ink, w = 2) => line(ctx, pts, c, w);
  if (tab === 'outlet') {
    L([[40, 40], [320, 40]], COL.L()); L([[40, 90], [320, 90]], COL.N()); earthLine(ctx, [[40, 140], [320, 140]], 2);
    label(ctx, t('wire.live'), 40, 28, COL.L(), 12, 'left'); label(ctx, t('wire.neutral'), 40, 78, COL.N(), 12, 'left'); label(ctx, t('wire.ground'), 40, 128, COL.G(), 12, 'left');
    if (st.tool === 'volt') {
      const rows = { 1: st.live === 1 ? 40 : 90, 2: st.live === 2 ? 40 : 90, G: 140 };
      const [a, b] = st.pair.split('');
      const ya = rows[a], yb = rows[b];
      L([[200, ya], [200, (ya + yb) / 2 - 14]]); L([[200, (ya + yb) / 2 + 14], [200, yb]]);
      symMeter(ctx, 200, (ya + yb) / 2, 'V'); label(ctx, '~', 222, (ya + yb) / 2 - 12, ink, 12);
      label(ctx, `${num(e.u, 0)} V`, 260, (ya + yb) / 2, ink, 12);
    } else {
      label(ctx, t('diag.neon'), 180, 180, ink, 11);
    }
  } else if (tab === 'house') {
    L([[20, 40], [350, 40]], COL.L()); L([[20, 170], [350, 170]], COL.N());
    ctx.strokeRect(30, 28, 40, 24); label(ctx, `${st.rating} A`, 50, 64, ink, 11);
    symMeter(ctx, 100, 40, 'A');
    const xs = [140, 180, 220, 260, 300, 340];
    xs.forEach((x, i) => {
      const a = APPLIANCES[i];
      const on = a.id === 'radiator' ? st.radiators > 0 : st.on[a.id];
      L([[x, 40], [x, 80]]); L([[x, 130], [x, 170]]);
      if (on) L([[x, 80], [x, 92]]); else L([[x, 80], [x + 10, 90]]);
      ctx.strokeRect(x - 10, 96, 20, 30);
      label(ctx, String(i + 1), x, 111, ink, 11);
    });
  } else if (tab === 'fuse') {
    if (st.exp === 'wool') { label(ctx, t('diag.wool'), 180, 100, ink, 13); return; }
    symCell(ctx, 180, 40, true);
    L([[185, 40], [320, 40], [320, 160], [260, 160]]); L([[220, 160], [110, 160]]); L([[70, 160], [40, 160], [40, 40], [175, 40]]);
    ctx.strokeRect(220, 152, 40, 16); if (!(st.fuse === 'fuse' && st.blown)) L([[220, 160], [260, 160]]);
    label(ctx, t(st.fuse === 'fuse' ? 'diag.fuse' : 'diag.copper'), 240, 184, ink, 11);
    symLamp(ctx, 90, 160, e.lamp > 0);
    if (st.shorted) { L([[70, 160], [70, 195], [110, 195], [110, 160]], cssVar('--bad'), 3); }
  } else {
    L([[30, 50], [330, 50]], COL.L()); L([[30, 100], [330, 100]], COL.N());
    ctx.strokeRect(90, 30, 60, 90); label(ctx, t('diag.diff'), 120, 140, ink, 11);
    ctx.strokeRect(250, 40, 70, 80); label(ctx, t('diff.machine'), 285, 80, ink, 10);
    if (st.earth) { earthLine(ctx, [[320, 110], [340, 110], [340, 170]], 2); earthSymbol(ctx, 340, 178); }
  }
}
function label(ctx, s, x, y, color, size = 12, align = 'center') {
  ctx.fillStyle = color || cssVar('--text');
  ctx.font = font(size, 800);
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}

/* ================================================================
   Animation and time-dependent events (breaker delay, fuse melting, steel wool)
   ================================================================ */
const loop = createLoop({
  dt: 1 / 60,
  step(dt) {
    if (!shell) return false;
    const tab = shell.tab;
    const st = cur();
    anim.t += dt;
    anim.ph += 90 * dt;
    if (tab === 'house') {
      const e = evalHouse(st);
      if (e.overload && !st.tripped) {
        st.over += dt;
        if (st.over >= TRIP_DELAY) { st.tripped = true; st.over = 0; st.fb = { type: 'bad', key: 'fb.tripped', params: { i: num(e.Ion, 0), r: st.rating } }; updateMeasures(); }
      } else st.over = 0;
    } else if (tab === 'fuse') {
      if (st.exp === 'wool') { if (st.wool) st.burn += dt; }
      else if (st.shorted && st.closed && !(st.fuse === 'fuse' && st.blown)) {
        st.heat = Math.min(1, st.heat + dt / (st.fuse === 'fuse' ? FUSE_MELT_TIME * 2 : 3));
        if (st.fuse === 'fuse' && st.heat >= 0.5) { st.blown = true; st.fb = { type: 'bad', key: 'fb.fuseBlown' }; updateMeasures(); }
        if (st.fuse === 'copper' && st.heat >= 1 && !st.fb) { st.fb = { type: 'bad', key: 'fb.copperFire' }; updateMeasures(); }
      } else st.heat = Math.max(0, st.heat - dt / 2);
    } else if (tab === 'diff') {
      const e = evalDiff(st);
      if (Math.abs(e.IL - e.IN) >= DIFF_SENS && !st.tripped) {
        st.leakTime += dt;
        if (st.leakTime > 0.25) { st.tripped = true; st.leakTime = 0; st.fb = { type: 'bad', key: 'fb.diffTripped' }; updateMeasures(); }
      }
    }
    return needsLoop(tab, st);
  },
  render: () => draw(),
});
function needsLoop(tab, st) {
  if (tab === 'outlet') return false;
  if (tab === 'house') return evalHouse(st).overload && !st.tripped;
  if (tab === 'fuse') return st.exp === 'wool' ? st.wool : evalFuse(st).I > 0 || st.heat > 0;
  return st.machine && !st.tripped;
}

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
  if (shell && needsLoop(shell.tab, cur())) loop.start(); else loop.stop();
  requestDraw();
}
function seg(labelKey, options, value, onChange) {
  return createSegmented({ labelKey, options: options.map(([v, k]) => ({ value: String(v), labelKey: k })), value: String(value), onChange });
}
const btnRow = (...b) => el('div', { class: 'btn-row', style: 'margin-top:8px' }, b);
const resetBtn = () => createButton({ labelKey: 'ui.reset', onClick: resetTab, variant: 'ghost' });
const hintP = (key) => el('p', { class: 'muted', style: 'margin:8px 0 0;font-size:0.88rem', dataset: { i18n: key } }, t(key));

canvas.addEventListener('pointerdown', (ev) => {
  const p = view.toLogical(ev);
  const h = hit.find((q) => Math.hypot(p.x - q.x, p.y - q.y) < q.r);
  if (!h) return;
  ev.preventDefault();
  const tab = shell.tab;
  if (h.kind === 'hole' && tab === 'outlet') {
    const st = cur();
    if (st.tool === 'tester') { if (h.id !== 'G') change((s) => { s.at = h.id; }); }
    return;
  }
  if (h.kind === 'dial') { change((s) => { s.range = h.id; }); return; }
  if (h.kind === 'app') { toggleAppliance(h.id); return; }
  if (h.kind === 'breaker') { resetBreaker(); return; }
  if (h.kind === 'switch') { change((s) => { s.closed = !s.closed; }); return; }
  if (h.kind === 'diffreset') resetDiff();
});
function toggleAppliance(id) {
  change((s) => {
    if (id === 'radiator') s.radiators = (s.radiators + 1) % 5;
    else s.on[id] = !s.on[id];
  });
}
function resetBreaker() {
  const s = cur();
  if (!s.tripped) return;
  s.tripped = false; s.over = 0;
  s.fb = evalHouse(s).overload ? { type: 'warn', key: 'fb.resetOverload' } : { type: 'good', key: 'fb.resetOk' };
  refresh();
}
function resetDiff() {
  const s = cur();
  if (!s.tripped) return;
  s.tripped = false; s.leakTime = 0;
  s.fb = s.fault && s.earth ? { type: 'warn', key: 'fb.diffResetFault' } : { type: 'good', key: 'fb.resetOk' };
  refresh();
}

function build() {
  const tab = shell.tab;
  const st = cur();
  const items = [];
  if (tab === 'outlet') {
    ui.tool = seg('ctl.tool', [['tester', 'tool.tester'], ['volt', 'tool.volt']], st.tool, (v) => { cur().tool = v; cur().fb = null; buildTab(); });
    items.push(ui.tool.root);
    if (st.tool === 'tester') {
      ui.at = seg('ctl.at', [[1, 'at.1'], [2, 'at.2']], st.at, (v) => change((s) => { s.at = Number(v); }));
      ui.thumb = seg('ctl.thumb', [['yes', 'ctl.yes'], ['no', 'ctl.no']], st.thumb ? 'yes' : 'no', (v) => change((s) => { s.thumb = v === 'yes'; }));
      items.push(ui.at.root, ui.thumb.root, btnRow(createButton({ labelKey: 'ctl.newOutlet', onClick: () => change((s) => { s.live = newOutlet(); }) }), resetBtn()));
    } else {
      ui.pair = seg('ctl.pair', [['12', 'pair.12'], ['1G', 'pair.1G'], ['2G', 'pair.2G']], st.pair, (v) => change((s) => { s.pair = v; }));
      ui.range = seg('ctl.range', DIAL_ORDER.map((id) => [id, `range.${id}`]), st.range, (v) => change((s) => { s.range = v; }));
      const record = () => {
        const s = cur();
        const e = evalOutlet(s);
        if (!e.range.kind) { s.fb = { type: 'warn', key: 'fb.off' }; updateMeasures(); return; }
        s.rows.push({ pair: s.pair, r: e.r.overload ? t('m.overload') : `${e.r.text} V`, range: s.range });
        if (s.rows.length > 8) s.rows.shift();
        s.fb = { type: 'good', key: 'fb.recorded' };
        updateMeasures();
      };
      items.push(ui.pair.root, ui.range.root, btnRow(createButton({ labelKey: 'ctl.record', onClick: record, variant: 'primary' }), resetBtn()));
    }
    items.push(hintP('hint.teacher'));
  } else if (tab === 'house') {
    ui.rating = seg('ctl.rating', [[30, 'rating.30'], [50, 'rating.50']], st.rating, (v) => change((s) => { s.rating = Number(v); }));
    ui.apps = APPLIANCES.filter((a) => a.id !== 'radiator').map((a) => seg(`app.${a.id}`, [['off', 'ctl.off'], ['on', 'ctl.on']], st.on[a.id] ? 'on' : 'off', (v) => change((s) => { s.on[a.id] = v === 'on'; })));
    ui.rad = seg('ctl.radiators', [0, 1, 2, 3, 4].map((n) => [n, `n.${n}`]), st.radiators, (v) => change((s) => { s.radiators = Number(v); }));
    ui.reset = createButton({ labelKey: 'ctl.resetBreaker', onClick: resetBreaker, variant: 'primary' });
    const record = () => {
      const s = cur();
      const list = APPLIANCES.filter((a) => (a.id === 'radiator' ? s.radiators > 0 : s.on[a.id]))
        .map((a) => (a.id === 'radiator' ? `${s.radiators} × ${a.I} A` : `${a.I} A`));
      if (!list.length) { s.fb = { type: 'warn', key: 'fb.nothingOn' }; updateMeasures(); return; }
      s.rows.push({ list: list.join(' + '), I: houseCurrent(s), rating: s.rating });
      if (s.rows.length > 6) s.rows.shift();
      s.fb = { type: 'good', key: 'fb.houseRecorded' };
      updateMeasures();
    };
    items.push(ui.rating.root, ...ui.apps.map((c) => c.root), ui.rad.root,
      btnRow(createButton({ labelKey: 'ctl.recordHouse', onClick: record }), ui.reset, resetBtn()), hintP('hint.house'));
  } else if (tab === 'fuse') {
    ui.exp = seg('ctl.exp', [['fuse', 'exp.fuse'], ['wool', 'exp.wool']], st.exp, (v) => { cur().exp = v; cur().fb = null; buildTab(); });
    items.push(ui.exp.root);
    if (st.exp === 'fuse') {
      ui.closed = seg('ctl.switch', [['closed', 'ctl.closed'], ['open', 'ctl.open']], st.closed ? 'closed' : 'open', (v) => change((s) => { s.closed = v === 'closed'; }));
      ui.short = seg('ctl.short', [['no', 'ctl.no'], ['yes', 'ctl.yes']], st.shorted ? 'yes' : 'no', (v) => change((s) => { s.shorted = v === 'yes'; }));
      ui.fuse = seg('ctl.fuseType', [['fuse', 'fuseType.fuse'], ['copper', 'fuseType.copper']], st.fuse, (v) => change((s) => { s.fuse = v; s.blown = false; s.heat = 0; }));
      ui.replace = createButton({ labelKey: 'ctl.replaceFuse', variant: 'primary', onClick: () => change((s) => {
        if (s.shorted) { s.fb = { type: 'warn', key: 'fb.removeShortFirst' }; return; }
        s.blown = false; s.heat = 0;
      }, true) });
      items.push(ui.closed.root, ui.short.root, ui.fuse.root, btnRow(ui.replace, resetBtn()));
    } else {
      items.push(btnRow(createButton({ labelKey: 'ctl.putWool', variant: 'primary', onClick: () => change((s) => { s.wool = true; s.burn = 0; }) }),
        createButton({ labelKey: 'ctl.removeWool', onClick: () => change((s) => { s.wool = false; s.burn = 0; }) }), resetBtn()));
    }
  } else {
    ui.machine = seg('ctl.machine', [['on', 'ctl.on'], ['off', 'ctl.off']], st.machine ? 'on' : 'off', (v) => change((s) => { s.machine = v === 'on'; }));
    ui.fault = seg('ctl.fault', [['no', 'ctl.no'], ['yes', 'ctl.yes']], st.fault ? 'yes' : 'no', (v) => change((s) => { s.fault = v === 'yes'; }));
    ui.earth = seg('ctl.earth', [['yes', 'ctl.yes'], ['no', 'ctl.no']], st.earth ? 'yes' : 'no', (v) => change((s) => { s.earth = v === 'yes'; }));
    ui.reset = createButton({ labelKey: 'ctl.resetDiff', onClick: resetDiff, variant: 'primary' });
    items.push(ui.machine.root, ui.fault.root, ui.earth.root, btnRow(ui.reset, resetBtn()), hintP('hint.diff'));
  }
  controlsBody.append(...items);
  ui.dl = el('dl', { class: 'meas' });
  ui.status = el('div', { class: 'status', hidden: '' });
  ui.tables = el('div');
  ui.clear = createButton({ labelKey: 'ctl.clearTable', onClick: () => { const s = cur(); s.rows = []; s.calc = {}; s.fb = null; ui.sig = null; updateMeasures(); }, variant: 'ghost' });
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
  if (tab === 'outlet') {
    ui.tool.set(st.tool);
    if (st.tool === 'tester') {
      ui.at.set(String(st.at)); ui.thumb.set(st.thumb ? 'yes' : 'no');
      rows.push([t('m.at'), t(`at.${st.at}`)], [t('m.neon'), t(e.neon ? 'neon.on' : 'neon.off')]);
      if (!fb) fb = !st.thumb ? { type: '', key: 'fb.noThumb' } : e.neon ? { type: 'good', key: 'fb.neonOn' } : { type: '', key: 'fb.neonOff' };
    } else {
      ui.pair.set(st.pair); ui.range.set(st.range);
      rows.push([t('m.between'), t(`pair.${st.pair}`)], [t('m.display'), !e.range.kind ? t('m.blank') : e.r.overload ? t('m.overload') : `${e.r.text} V`]);
      if (!fb) {
        if (!e.range.kind) fb = { type: 'warn', key: 'fb.off' };
        else if (!e.range.ac) fb = { type: 'warn', key: 'fb.dcMode' };
        else if (e.r.overload) fb = { type: 'warn', key: 'fb.overload' };
      }
    }
  } else if (tab === 'house') {
    ui.rating.set(String(st.rating)); ui.rad.set(String(st.radiators));
    APPLIANCES.filter((a) => a.id !== 'radiator').forEach((a, i) => ui.apps[i].set(st.on[a.id] ? 'on' : 'off'));
    ui.reset.disabled = !st.tripped;
    rows.push([t('m.Imain'), `${num(e.I, 0)} A`], [t('m.breaker'), t(st.tripped ? 'breaker.off' : 'breaker.on')], [t('m.Uapp'), st.tripped ? '0 V' : `${U_MAINS} V`]);
    if (!fb && e.overload && !st.tripped) fb = { type: 'warn', key: 'fb.overloadSoon', params: { i: num(e.Ion, 0), r: st.rating } };
  } else if (tab === 'fuse') {
    ui.exp.set(st.exp);
    if (st.exp === 'fuse') {
      ui.closed.set(st.closed ? 'closed' : 'open'); ui.short.set(st.shorted ? 'yes' : 'no'); ui.fuse.set(st.fuse);
      ui.replace.hidden = !(st.fuse === 'fuse' && st.blown);
      rows.push([t('m.current'), e.big ? t('m.veryLarge') : `${num(e.I, 2)} A`], [t('m.lamp'), t(e.lamp ? 'lamp.on' : 'lamp.off')],
        [t('m.fuse'), t(st.fuse === 'copper' ? 'fuse.copperShort' : st.blown ? 'fuse.blownShort' : 'fuse.ok')]);
      if (!fb && st.fuse === 'copper' && st.shorted && st.closed) fb = { type: 'bad', key: 'fb.copperHot' };
    } else rows.push([t('m.wool'), t(st.wool ? 'wool.on' : 'wool.off')]);
  } else {
    ui.machine.set(st.machine ? 'on' : 'off'); ui.fault.set(st.fault ? 'yes' : 'no'); ui.earth.set(st.earth ? 'yes' : 'no');
    ui.reset.disabled = !st.tripped;
    rows.push([t('m.IL'), `${num(e.IL, 2)} A`], [t('m.IN'), `${num(e.IN, 2)} A`], [t('m.leak'), `${num(e.Ileak, 2)} A`], [t('m.diff'), t(st.tripped ? 'breaker.off' : 'breaker.on')]);
    if (!fb && e.bodyLive) fb = { type: 'bad', key: 'fb.bodyLive' };
  }
  ui.dl.replaceChildren(...rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)]));
  showStatus(fb);
  buildTables(tab, st);
}
function showStatus(fb) {
  if (!fb) { ui.status.hidden = true; return; }
  ui.status.hidden = false;
  ui.status.className = `status ${fb.type || ''}`;
  ui.status.textContent = t(fb.key, fb.params);
}

function buildTables(tab, st) {
  const rows = st.rows || [];
  const sig = `${tab}|${st.tool}|${rows.length}|${calcSig(rows)}|${st.calc ? calcSig([st.calc]) : ''}`;
  if (sig === ui.sig) return;
  ui.sig = sig;
  const th = (k) => el('th', { class: 'keep-case' }, t(k));
  const onCheck = (res) => {
    const s = cur();
    s.fb = res === 'invalid' ? { type: 'warn', key: 'calc.invalid' } : res === 'ok' ? { type: 'good', key: 'fb.calcOk' } : { type: 'bad', key: 'fb.calcWrong' };
    updateMeasures();
  };
  const parts = [];
  if (tab === 'outlet' && st.tool === 'volt') {
    if (rows.length) {
      parts.push(el('table', { class: 'data' }, [el('thead', {}, el('tr', {}, [th('col.between'), th('col.range'), th('col.reading')])),
        el('tbody', {}, rows.map((r) => el('tr', {}, [el('td', {}, t(`pair.${r.pair}`)), el('td', {}, t(`range.${r.range}`)), el('td', {}, r.r)])))]));
    }
    // Um and T of the mains, from U = 220 V and f = 50 Hz
    const c = st.calc;
    parts.push(el('h3', { class: 'keep-case', style: 'margin:10px 0 4px;font-size:0.95rem' }, t('tbl.mains')));
    parts.push(el('table', { class: 'data' }, [el('thead', {}, el('tr', {}, [th('col.Ueff'), th('col.Um'), th('col.f'), th('col.T')])),
      el('tbody', {}, [el('tr', {}, [el('td', {}, `${U_MAINS}`),
        calcCell(c, 'um', { expected: U_MAINS * Math.SQRT2, decimals: 0, tol: 1.5, onCheck }),
        el('td', {}, `${F_MAINS}`),
        calcCell(c, 'T', { expected: 1000 / F_MAINS, decimals: 0, tol: 0.05, onCheck })])])]));
  } else if (tab === 'house' && rows.length) {
    parts.push(el('table', { class: 'data' }, [el('thead', {}, el('tr', {}, [th('col.appliances'), th('col.sum'), th('col.trips')])),
      el('tbody', {}, rows.map((r) => el('tr', {}, [el('td', {}, r.list),
        calcCell(r, 'sum', { expected: r.I, decimals: 0, tol: 0.05, onCheck }),
        el('td', {}, calcDone(r, 'sum') ? t(r.I > r.rating ? 'trips.yes' : 'trips.no', { r: r.rating }) : '…')])))]));
  }
  ui.tables.replaceChildren(...parts);
  ui.tables.hidden = parts.length === 0;
  ui.clearRow.hidden = !rows.length;
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
  Object.assign(xs[lang], { 'range.off': 'OFF', 'range.vdc600': '600 V ⎓', 'range.vac750': '750 V ~', 'range.vac200': '200 V ~', 'rating.30': '30 A', 'rating.50': '50 A' });
  for (const n of [0, 1, 2, 3, 4]) xs[lang][`n.${n}`] = String(n);
}
onLangChange(() => { if (shell) buildTab(); });

shell = initSim({
  strings: { en: { ...strings.en, ...xs.en }, fr: { ...strings.fr, ...xs.fr } },
  tabs: TABS.map((id) => ({ id, labelKey: `tab.${id}` })),
  initialTab: 'outlet',
  onTab: buildTab,
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, evaluate, cur: () => cur(), tab: () => shell.tab };
