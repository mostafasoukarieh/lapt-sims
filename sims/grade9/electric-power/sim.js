// Grade 9 — Electric power and energy (Ch.9 Act. 1–7, Ex. 5–8, 13, 18; Further study: the meter)
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num } from '../../../shared/format.js';
import { createButton, createSegmented, createSlider, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, font } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { calcCell, calcSig, calcDone } from '../../../shared/calc-cell.js';
import { drawLamp, drawCurrentArrows, labelI, drawMeterBox, METER_HALF as MH } from '../../../shared/circuit-draw.js';

/* ================================================================
   Model
   ================================================================ */
// Activity 1 and exercises: rating plates (U in V, P in W)
const PLATES = {
  lamp: { U: 230, P: 15 },        // Fig. 1
  pump: { U: 220, P: 750 },       // Fig. 1: 0.75 kW
  calc: { U: 9, P: 0.03, dc: true }, // Ex. 5
  dryer: { U: 220, P: 1500 },     // Ex. 8
  car: { U: 12, P: 21 },          // Ex. 10
  chand: { U: 220, P: 40 },       // Ex. 9: each lamp of the chandelier
};
// Activity 2: L1 (6 V, 2.5 W) on the 6 V dry cell — readings of the book's photo (Fig. 2b, owner 5 Nov 2026)
const L1 = { Ur: 6, Pr: 2.5, U: 5.88, I: 0.433 };
// L2 (12 V, 23 W) on an adjustable DC source (owner 5 Nov 2026); filament model I = Ir (U / Ur)^0.55 (illustrative)
const L2 = { Ur: 12, Pr: 23 };
const L2_IR = L2.Pr / L2.Ur;
const lampI2 = (U) => (U <= 0 ? 0 : L2_IR * (U / L2.Ur) ** 0.55);
// Activity 3–4: EDL meter, C = 2.5 Wh per turn (Fig. 4), 220 V; appliances from the table of rated powers (p.111)
const C_WH = 2.5;
const APPS = [
  { id: 'radio', P: 5 }, { id: 'eco', P: 20 }, { id: 'lamp100', P: 100 }, { id: 'tv', P: 100 },
  { id: 'iron', P: 1000 }, { id: 'heater', P: 2000 },
];
// Activity 7: resistor of a small heater, R = 10 Ω, on the DC source (illustrative)
const R_J = 10;
const CLASSIFY = [
  { id: 'iron', ok: 'adv' }, { id: 'radiator', ok: 'adv' }, { id: 'kettle', ok: 'adv' }, { id: 'bulb', ok: 'adv' },
  { id: 'fan', ok: 'loss' }, { id: 'computer', ok: 'loss' }, { id: 'tv', ok: 'loss' }, { id: 'charger', ok: 'loss' },
];

function initialState(tab) {
  switch (tab) {
    case 'rated': return { app: 'lamp', calc: {}, fb: null };
    case 'power': return { lamp: 'L1', U2: 12, closed: true, rows: [], fb: null };
    case 'meter': return { on: { lamp100: true }, speed: 10, turns: 0, time: 0, running: false, swT: 0, swTurns: 0, marks: [], counter: 1520.0, showN: true, rows: [], fb: null };
    default: return { mode: 'law', U: 6, closed: true, rows: [], answers: {}, checked: false, temp: 0, fb: null };
  }
}
const TABS = ['rated', 'power', 'meter', 'joule'];
let S = Object.fromEntries(TABS.map((k) => [k, initialState(k)]));

const evalRated = (st) => ({ ...PLATES[st.app], I: PLATES[st.app].P / PLATES[st.app].U });
function evalPower(st) {
  if (!st.closed) return { U: st.lamp === 'L1' ? 0 : 0, I: 0, src: st.lamp === 'L1' ? 6.34 : st.U2, glow: 0 };
  if (st.lamp === 'L1') return { U: L1.U, I: L1.I, src: 6.34, glow: (L1.U * L1.I) / L1.Pr };
  const I = lampI2(st.U2);
  return { U: st.U2, I, src: st.U2, glow: Math.min(1.6, (st.U2 * I) / L2.Pr) };
}
const meterPower = (st) => APPS.reduce((s, a) => s + (st.on[a.id] ? a.P : 0), 0);
const evalMeter = (st) => ({ P: meterPower(st) });
function evalJoule(st) {
  const I = st.closed ? st.U / R_J : 0;
  return { U: st.closed ? st.U : 0, I, P: R_J * I * I };
}
const EVAL = { rated: evalRated, power: evalPower, meter: evalMeter, joule: evalJoule };
const evaluate = (tab, st) => EVAL[tab](st);

/* ================================================================
   Canvas
   ================================================================ */
const HEIGHTS = { rated: 340, power: 360, meter: 380, joule: 360 };
let shell;
const anim = { ph: 0 };
let drawQueued = false;
const canvas = document.getElementById('stage');
const view = setupCanvas(canvas, { width: 600, height: 340, maxHeightVh: () => (window.innerWidth < 880 ? 46 : 74), onResize: () => requestDraw() });
const diag = setupCanvas(document.getElementById('diagram'), { width: 360, height: 200, maxHeightVh: 30, onResize: () => requestDraw() });
function requestDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; draw(); });
}
onThemeChange(() => requestDraw());
const cur = () => S[shell.tab];
function tag(ctx, s, x, y, color = cssVar('--text'), size = 14, align = 'center', weight = 800) {
  ctx.fillStyle = color; ctx.font = font(size, weight); ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(s, x, y);
}
function line(ctx, pts, color = cssVar('--wire'), w = 4) {
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
}
const fmtP = (P) => (P >= 1000 ? `${num(P / 1000, P % 1000 ? 2 : 0)} kW` : `${num(P, P < 1 ? 2 : 0)} W`);

function draw() {
  if (!shell) return;
  const tab = shell.tab;
  const st = cur();
  const e = evaluate(tab, st);
  if (view.height !== HEIGHTS[tab]) view.setLogicalSize(600, HEIGHTS[tab]);
  const ctx = view.begin();
  ctx.fillStyle = cssVar('--board');
  roundRect(ctx, 8, 8, 584, HEIGHTS[tab] - 16, 14); ctx.fill();
  ({ rated: drawRated, power: drawPower, meter: drawMeter, joule: drawJoule })[tab](ctx, st, e);
  drawDiagram(tab, st, e);
}

/* ---------- Activity 1: rating plates ---------- */
function drawRated(ctx, st, e) {
  // the appliance (simple icon) on the left, its plate on the right
  const ix = 150, iy = 170;
  ctx.lineWidth = 3; ctx.strokeStyle = cssVar('--text');
  if (st.app === 'lamp' || st.app === 'chand' || st.app === 'car') drawLamp(ctx, { x: ix, y: iy + 60, glow: 0.6 });
  else if (st.app === 'pump') {
    ctx.fillStyle = cssVar('--meter-v'); roundRect(ctx, ix - 70, iy - 40, 120, 80, 14); ctx.fill();
    ctx.fillStyle = cssVar('--pan-metal'); ctx.beginPath(); ctx.arc(ix + 60, iy, 34, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = cssVar('--text'); ctx.fillRect(ix - 60, iy + 40, 100, 14);
  } else if (st.app === 'calc') {
    ctx.fillStyle = cssVar('--device'); roundRect(ctx, ix - 50, iy - 80, 100, 160, 12); ctx.fill();
    ctx.fillStyle = cssVar('--lcd-bg'); roundRect(ctx, ix - 38, iy - 68, 76, 30, 4); ctx.fill();
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { ctx.fillStyle = cssVar('--socket'); roundRect(ctx, ix - 38 + c * 20, iy - 26 + r * 24, 16, 18, 3); ctx.fill(); }
  } else {
    ctx.fillStyle = cssVar('--accent');
    roundRect(ctx, ix - 70, iy - 50, 110, 70, 30); ctx.fill();
    roundRect(ctx, ix - 20, iy + 10, 34, 80, 10); ctx.fill();
    ctx.fillStyle = cssVar('--text'); roundRect(ctx, ix + 40, iy - 34, 30, 38, 6); ctx.fill();
  }
  tag(ctx, t(`app.${st.app}`), ix, 300, cssVar('--text'), 15);
  // plate
  const px = 320, py = 80, pw = 240, ph = 170;
  ctx.fillStyle = '#d9dde3'; ctx.strokeStyle = '#7d848f'; ctx.lineWidth = 2;
  roundRect(ctx, px, py, pw, ph, 10); ctx.fill(); ctx.stroke();
  for (const [x, y] of [[px + 12, py + 12], [px + pw - 12, py + 12], [px + 12, py + ph - 12], [px + pw - 12, py + ph - 12]]) {
    ctx.fillStyle = '#9aa1ab'; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
  }
  tag(ctx, t(`plate.${st.app}`), px + pw / 2, py + 34, '#1b1f27', 15);
  tag(ctx, `${e.dc ? 'DC ' : ''}${num(e.U, 0)} V`, px + pw / 2, py + 82, '#1b1f27', 30);
  tag(ctx, fmtP(e.P), px + pw / 2, py + 128, '#1b1f27', 30);
  tag(ctx, t('rated.plate'), px + pw / 2, py + ph + 22, cssVar('--muted'), 12);
}

/* ---------- Activity 2: P = U I ---------- */
function drawPower(ctx, st, e) {
  const TOP = 70, BOT = 280, XL = 70, XR = 530, LX = 300, AX = 150;
  const cellBox = st.lamp === 'L1';
  // source at the top
  ctx.fillStyle = cellBox ? cssVar('--battery') : cssVar('--device');
  roundRect(ctx, 220, TOP - 30, 160, 60, 8); ctx.fill();
  tag(ctx, cellBox ? t('src.cell') : `${t('src.dc')} ${num(st.U2, 1)} V`, 300, TOP, cellBox ? '#ffffff' : cssVar('--text-on-meter'), 14);
  tag(ctx, '+', 206, TOP - 22, cssVar('--accent'), 18); tag(ctx, '−', 394, TOP - 22, cssVar('--text'), 18);
  // switch K on the right wire
  line(ctx, [[220, TOP], [XL, TOP], [XL, BOT], [AX - MH, BOT]]);
  line(ctx, [[AX + MH, BOT], [LX - 30, BOT]]);
  line(ctx, [[LX + 30, BOT], [XR, BOT], [XR, 200]]);
  line(ctx, [[XR, 140], [XR, TOP], [380, TOP]]);
  ctx.strokeStyle = cssVar('--lever'); ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(XR, 200); ctx.lineTo(st.closed ? XR : XR + 40, st.closed ? 140 : 150); ctx.stroke();
  tag(ctx, 'K', XR + 26, 170, cssVar('--text'), 15);
  drawLamp(ctx, { x: LX, y: BOT, glow: Math.min(1, e.glow) });
  tag(ctx, st.lamp, LX - 50, BOT - 50, cssVar('--text'), 16);
  tag(ctx, t(`lamp.${st.lamp}`), LX, BOT + 40, cssVar('--muted'), 12);
  drawMeterBox(ctx, { x: AX, y: BOT, kind: 'A', name: 'A', text: num(e.I, 3), unit: 'A' });
  // voltmeter across the lamp (above it)
  const VX = 300, VY = 175;
  drawMeterBox(ctx, { x: VX, y: VY, kind: 'V', name: 'V', text: num(e.U, 2), unit: 'V' });
  line(ctx, [[VX - MH, VY], [LX - 60, VY], [LX - 60, BOT]], cssVar('--accent'), 2.5);
  line(ctx, [[VX + MH, VY], [LX + 60, VY], [LX + 60, BOT]], cssVar('--lead-black'), 2.5);
  if (e.I > 0) {
    drawCurrentArrows(ctx, [[220, TOP], [XL, TOP], [XL, BOT], [XR, BOT], [XR, TOP], [380, TOP]], anim.ph,
      (x, y) => (Math.abs(y - BOT) < 1 && (Math.abs(x - AX) < MH + 4 || Math.abs(x - LX) < 34)) || (x === XR && y > 136 && y < 204));
    labelI(ctx, XL - 22, (TOP + BOT) / 2, Math.PI / 2);
  }
  if (e.glow > 1.15) tag(ctx, t('power.over'), 300, 330, cssVar('--bad'), 13);
}

/* ---------- Activities 3–4: the electric meter ---------- */
function drawMeter(ctx, st, e) {
  const mx = 40, my = 30, mw = 250, mh = 320;
  ctx.fillStyle = '#f2efe6'; ctx.strokeStyle = '#7d848f'; ctx.lineWidth = 2;
  roundRect(ctx, mx, my, mw, mh, 16); ctx.fill(); ctx.stroke();
  tag(ctx, 'EDL', mx + mw / 2, my + 22, '#0d3371', 16);
  // energy register (kWh)
  const digits = st.counter.toFixed(1).padStart(7, '0').replace('.', '');
  for (let i = 0; i < 6; i++) {
    const x = mx + 35 + i * 30;
    ctx.fillStyle = i === 5 ? '#b3261e' : '#1b1f27';
    roundRect(ctx, x, my + 45, 26, 36, 3); ctx.fill();
    tag(ctx, digits[i], x + 13, my + 64, '#ffffff', 20, 'center', 700);
  }
  tag(ctx, 'kWh', mx + mw - 18, my + 64, '#1b1f27', 12);
  // window with the disc seen edge-on
  ctx.fillStyle = '#20242c';
  roundRect(ctx, mx + 25, my + 110, mw - 50, 70, 8); ctx.fill();
  const cx = mx + mw / 2, cy = my + 145;
  ctx.fillStyle = '#c8ccd2';
  ctx.beginPath(); ctx.ellipse(cx, cy, 90, 12, 0, 0, Math.PI * 2); ctx.fill();
  // red mark on the rim
  const a = (st.turns % 1) * Math.PI * 2;
  if (Math.sin(a) > -0.2) {
    const x = cx + 90 * Math.cos(a);
    ctx.fillStyle = '#e60000'; ctx.fillRect(x - 5, cy - 3 + 9 * Math.sin(a) * 0.3, 10, 9);
  }
  tag(ctx, '220 V   50 Hz', cx, my + 210, '#1b1f27', 14);
  tag(ctx, 'C = 2.5 Wh/tr', cx, my + 236, '#1b1f27', 16);
  tag(ctx, t('meter.mark'), cx, my + 266, '#5b616b', 11);
  // stopwatch and counter
  const sx = 340;
  ctx.fillStyle = cssVar('--device'); roundRect(ctx, sx, 40, 220, 80, 12); ctx.fill();
  tag(ctx, t('meter.stopwatch'), sx + 110, 58, cssVar('--text-on-meter'), 12);
  ctx.fillStyle = cssVar('--lcd-bg'); roundRect(ctx, sx + 20, 70, 180, 38, 6); ctx.fill();
  tag(ctx, `${num(st.swT, 1)} s`, sx + 110, 89, cssVar('--lcd-ink'), 22, 'center', 700);
  if (st.showN) tag(ctx, `${t('meter.turns')}: ${Math.floor(st.swTurns)}`, sx + 110, 145, cssVar('--text'), 16);
  tag(ctx, `${t('meter.speed')} × ${st.speed}`, sx + 110, 175, cssVar('--muted'), 12);
  // appliances switched on
  let y = 210;
  for (const a2 of APPS) if (st.on[a2.id]) { tag(ctx, `● ${t(`app.${a2.id}`)} (${fmtP(a2.P)})`, sx + 4, y, cssVar('--text'), 12, 'left'); y += 20; }
  if (y === 210) tag(ctx, t('meter.nothing'), sx + 4, y, cssVar('--muted'), 12, 'left');
}

/* ---------- Activities 5–7: Joule's effect ---------- */
function drawJoule(ctx, st, e) {
  if (st.mode === 'classify') {
    tag(ctx, t('joule.classifyTitle'), 300, 40, cssVar('--text'), 15);
    CLASSIFY.forEach((c, i) => {
      const x = 80 + (i % 4) * 145, yy = 120 + Math.floor(i / 4) * 130;
      ctx.fillStyle = cssVar('--surface'); ctx.strokeStyle = cssVar('--border'); ctx.lineWidth = 1.5;
      roundRect(ctx, x - 60, yy - 50, 120, 100, 12); ctx.fill(); ctx.stroke();
      tag(ctx, t(`cl.${c.id}`), x, yy - 28, cssVar('--text'), 12);
      const ans = st.answers[c.id];
      tag(ctx, ans ? t(`cl.${ans}`) : '?', x, yy + 8, ans ? cssVar('--primary') : cssVar('--muted'), 13);
      if (st.checked && ans) tag(ctx, ans === c.ok ? '✓' : '✗', x, yy + 34, ans === c.ok ? cssVar('--good') : cssVar('--bad'), 18);
    });
    return;
  }
  const TOP = 70, BOT = 270, XL = 70, XR = 530, RX = 330, AX = 160;
  ctx.fillStyle = cssVar('--device'); roundRect(ctx, 220, TOP - 30, 160, 60, 8); ctx.fill();
  tag(ctx, `${t('src.dc')} ${num(st.U, 1)} V`, 300, TOP, cssVar('--text-on-meter'), 14);
  tag(ctx, '+', 206, TOP - 22, cssVar('--accent'), 18); tag(ctx, '−', 394, TOP - 22, cssVar('--text'), 18);
  line(ctx, [[220, TOP], [XL, TOP], [XL, BOT], [AX - MH, BOT]]);
  line(ctx, [[AX + MH, BOT], [RX - 80, BOT]]);
  line(ctx, [[RX + 80, BOT], [XR, BOT], [XR, 200]]);
  line(ctx, [[XR, 140], [XR, TOP], [380, TOP]]);
  ctx.strokeStyle = cssVar('--lever'); ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(XR, 200); ctx.lineTo(st.closed ? XR : XR + 40, st.closed ? 140 : 150); ctx.stroke();
  tag(ctx, 'K', XR + 26, 170, cssVar('--text'), 15);
  // heating coil: colour from its temperature
  const k = Math.min(1, st.temp);
  const col = `rgb(${Math.round(120 + 135 * k)}, ${Math.round(110 - 40 * k + 60 * Math.max(0, k - 0.6))}, ${Math.round(100 - 90 * k)})`;
  if (k > 0.35) {
    const g = ctx.createRadialGradient(RX, BOT, 10, RX, BOT, 110);
    g.addColorStop(0, `rgba(255, 110, 40, ${0.45 * (k - 0.35) / 0.65})`); g.addColorStop(1, 'rgba(255,110,40,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(RX, BOT, 110, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = col; ctx.lineWidth = 5;
  ctx.beginPath();
  for (let i = 0; i <= 160; i++) { const x = RX - 80 + i; const yy = BOT + 14 * Math.sin((i / 160) * Math.PI * 14); i ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy); }
  ctx.stroke();
  tag(ctx, `R = ${R_J} Ω`, RX, BOT + 40, cssVar('--text'), 13);
  drawMeterBox(ctx, { x: AX, y: BOT, kind: 'A', name: 'A', text: num(e.I, 2), unit: 'A' });
  if (e.I > 0) {
    drawCurrentArrows(ctx, [[220, TOP], [XL, TOP], [XL, BOT], [XR, BOT], [XR, TOP], [380, TOP]], anim.ph,
      (x, y) => (Math.abs(y - BOT) < 1 && (Math.abs(x - AX) < MH + 4 || Math.abs(x - RX) < 84)) || (x === XR && y > 136 && y < 204));
    labelI(ctx, XL - 22, (TOP + BOT) / 2, Math.PI / 2);
  }
  tag(ctx, `${t('joule.temp')}: ${num(22 + 380 * st.temp, 0)} °C`, 330, 330, cssVar('--muted'), 12);
}

/* ---------- Diagrams ---------- */
function drawDiagram(tab, st, e) {
  const ctx = diag.begin();
  const ink = cssVar('--text');
  const L = (pts) => line(ctx, pts, ink, 2);
  const lbl = (s, x, y, size = 12) => tag(ctx, s, x, y, ink, size);
  const meter = (x, y, letter) => { ctx.fillStyle = cssVar('--surface'); ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 12, 0, 7); ctx.fill(); ctx.stroke(); lbl(letter, x, y + 1, 12); };
  if (tab === 'power' || tab === 'joule') {
    L([[40, 30], [176, 30]]); L([[184, 30], [320, 30], [320, 70]]); L([[320, 100], [320, 160], [40, 160], [40, 30]]);
    L([[176, 18], [176, 42]]); line(ctx, [[184, 24], [184, 36]], ink, 4); lbl('+', 166, 14, 11); lbl('−', 194, 14, 11);
    L([[320, 70], [334, 96]]); lbl('K', 340, 80, 11);
    meter(100, 160, 'A');
    ctx.fillStyle = cssVar('--surface');
    if (tab === 'power') { ctx.beginPath(); ctx.arc(220, 160, 12, 0, 7); ctx.fill(); ctx.stroke(); L([[212, 152], [228, 168]]); L([[228, 152], [212, 168]]); L([[190, 160], [190, 120], [205, 120]]); L([[235, 120], [250, 120], [250, 160]]); meter(220, 120, 'V'); lbl(st.lamp, 220, 186, 11); }
    else { ctx.fillRect(195, 152, 50, 16); ctx.strokeRect(195, 152, 50, 16); lbl('R', 220, 186, 11); }
  } else if (tab === 'meter') {
    lbl('E = n × C', 180, 50, 16); lbl('C = 2.5 Wh/tr', 180, 85, 13); lbl('P = E / t', 180, 125, 16); lbl('1 Wh = 3600 J', 180, 165, 13);
  } else {
    lbl(t('diag.rated'), 180, 70, 13); lbl('P = U × I  →  I = P / U', 180, 120, 15);
  }
}

/* ================================================================
   Animation: current arrows, meter disc and stopwatch, heating coil
   ================================================================ */
const loop = createLoop({
  dt: 1 / 60,
  step(dt) {
    if (!shell) return false;
    const tab = shell.tab;
    const st = cur();
    anim.ph += 70 * dt;
    if (tab === 'meter') {
      const P = meterPower(st);
      const dts = dt * st.speed; // simulated seconds
      const dTurns = (P * dts) / 3600 / C_WH;
      st.turns += dTurns;
      st.counter += (P * dts) / 3.6e6;
      if (st.running) {
        const before = Math.floor(st.swTurns);
        st.swT += dts; st.swTurns += dTurns;
        if (Math.floor(st.swTurns) > before) st.marks.push({ n: Math.floor(st.swTurns), t: st.swT });
        if (st.marks.length > 200) st.marks.shift();
      }
      if (Math.floor(anim.ph) % 6 === 0) updateMeasures();
    } else if (tab === 'joule' && st.mode === 'law') {
      const e = evalJoule(st);
      const target = e.P / 14.4; // 0 … 1 at 12 V
      st.temp += (target - st.temp) * Math.min(1, dt / 2.5);
    }
    return needsLoop();
  },
  render: () => draw(),
});
function needsLoop() {
  if (!shell) return false;
  const tab = shell.tab, st = cur();
  if (tab === 'power') return evalPower(st).I > 0;
  if (tab === 'meter') return meterPower(st) > 0 || st.running;
  if (tab === 'joule') return st.mode === 'law' && (evalJoule(st).I > 0 || st.temp > 0.005);
  return false;
}

/* ================================================================
   Panels
   ================================================================ */
const controlsBody = document.getElementById('controls-body');
const measuresBody = document.getElementById('measures-body');
let ui = {};
function change(fn, keepFb = false) { const st = cur(); fn(st); if (!keepFb) st.fb = null; refresh(); }
function refresh() { updateMeasures(); if (needsLoop()) loop.start(); else loop.stop(); requestDraw(); }
function seg(labelKey, options, value, onChange) {
  return createSegmented({ labelKey, options: options.map(([v, k]) => ({ value: String(v), labelKey: k })), value: String(value), onChange });
}
const btnRow = (...b) => el('div', { class: 'btn-row', style: 'margin-top:8px' }, b);
const resetBtn = () => createButton({ labelKey: 'ui.reset', variant: 'ghost', onClick: () => { S[shell.tab] = initialState(shell.tab); buildTab(); } });
const hintP = (key) => el('p', { class: 'muted', style: 'margin:8px 0 0;font-size:0.88rem', dataset: { i18n: key } }, t(key));

function build() {
  const tab = shell.tab;
  const st = cur();
  const items = [];
  if (tab === 'rated') {
    ui.app = seg('ctl.app', Object.keys(PLATES).map((k) => [k, `app.${k}`]), st.app, (v) => change((s) => { s.app = v; }));
    items.push(ui.app.root, btnRow(resetBtn()), hintP('hint.rated'));
  } else if (tab === 'power') {
    ui.lamp = seg('ctl.lamp', [['L1', 'lamp.L1'], ['L2', 'lamp.L2']], st.lamp, (v) => { cur().lamp = v; cur().fb = null; buildTab(); });
    ui.k = seg('ctl.switch', [['closed', 'ctl.closed'], ['open', 'ctl.open']], st.closed ? 'closed' : 'open', (v) => change((s) => { s.closed = v === 'closed'; }));
    items.push(ui.lamp.root, ui.k.root);
    if (st.lamp === 'L2') items.push(createSlider({ labelKey: 'ctl.U2', min: 0, max: 15, step: 0.1, value: st.U2, unit: 'V', decimals: 1, onInput: (v) => change((s) => { s.U2 = v; }) }).root);
    const record = () => {
      const s = cur(); const e = evalPower(s);
      if (e.I <= 0) { s.fb = { type: 'warn', key: 'fb.noCurrent' }; updateMeasures(); return; }
      s.rows.push({ lamp: s.lamp, U: Math.round(e.U * 100) / 100, I: Math.round(e.I * 1000) / 1000 });
      if (s.rows.length > 8) s.rows.shift();
      s.fb = { type: 'good', key: 'fb.recorded' }; updateMeasures();
    };
    items.push(btnRow(createButton({ labelKey: 'ctl.record', variant: 'primary', onClick: record }), resetBtn()));
  } else if (tab === 'meter') {
    ui.apps = APPS.map((a) => seg(`app.${a.id}`, [['off', 'ctl.off'], ['on', 'ctl.on']], st.on[a.id] ? 'on' : 'off', (v) => change((s) => { s.on[a.id] = v === 'on'; })));
    ui.speed = seg('ctl.speed', [[1, 'speed.1'], [10, 'speed.10'], [60, 'speed.60']], st.speed, (v) => change((s) => { s.speed = Number(v); }));
    ui.showN = seg('ctl.showN', [['yes', 'ctl.yes'], ['no', 'ctl.no']], st.showN ? 'yes' : 'no', (v) => change((s) => { s.showN = v === 'yes'; }));
    ui.start = createButton({ labelKey: 'ctl.start', variant: 'primary', onClick: () => change((s) => { s.running = true; s.swT = 0; s.swTurns = 0; s.marks = []; }) });
    ui.stop = createButton({ labelKey: 'ctl.stop', onClick: () => change((s) => {
      s.running = false;
      const m = s.marks[s.marks.length - 1];
      if (!m) { s.fb = { type: 'warn', key: 'fb.noTurn' }; return; }
      s.rows.push({ P: meterPower(s), n: m.n, t: Math.round(m.t * 10) / 10 });
      if (s.rows.length > 6) s.rows.shift();
      s.fb = { type: 'good', key: 'fb.meterRecorded', params: { n: m.n, t: num(m.t, 1) } };
    }, true) });
    items.push(...ui.apps.map((c) => c.root), ui.speed.root, ui.showN.root, btnRow(ui.start, ui.stop, resetBtn()), hintP('hint.meter'));
  } else {
    ui.mode = seg('ctl.jmode', [['law', 'jmode.law'], ['classify', 'jmode.classify']], st.mode, (v) => { cur().mode = v; cur().fb = null; buildTab(); });
    items.push(ui.mode.root);
    if (st.mode === 'law') {
      ui.k = seg('ctl.switch', [['closed', 'ctl.closed'], ['open', 'ctl.open']], st.closed ? 'closed' : 'open', (v) => change((s) => { s.closed = v === 'closed'; }));
      items.push(ui.k.root, createSlider({ labelKey: 'ctl.Uj', min: 0, max: 12, step: 0.5, value: st.U, unit: 'V', decimals: 1, onInput: (v) => change((s) => { s.U = v; }) }).root);
      const record = () => {
        const s = cur(); const e = evalJoule(s);
        if (e.I <= 0) { s.fb = { type: 'warn', key: 'fb.noCurrent' }; updateMeasures(); return; }
        if (s.rows.some((r) => Math.abs(r.I - e.I) < 1e-6)) { s.fb = { type: 'warn', key: 'fb.sameI' }; updateMeasures(); return; }
        s.rows.push({ I: Math.round(e.I * 100) / 100 });
        if (s.rows.length > 6) s.rows.shift();
        s.fb = { type: 'good', key: 'fb.jouleRecorded' }; updateMeasures();
      };
      items.push(btnRow(createButton({ labelKey: 'ctl.recordI', variant: 'primary', onClick: record }), resetBtn()));
    } else {
      ui.cls = CLASSIFY.map((c) => seg(`cl.${c.id}`, [['adv', 'cl.adv'], ['loss', 'cl.loss']], st.answers[c.id] || '', (v) => change((s) => { s.answers[c.id] = v; s.checked = false; })));
      items.push(...ui.cls.map((c) => c.root), btnRow(createButton({ labelKey: 'ctl.check', variant: 'primary', onClick: () => change((s) => {
        s.checked = true;
        const n = CLASSIFY.filter((c) => s.answers[c.id] === c.ok).length;
        s.fb = { type: n === CLASSIFY.length ? 'good' : 'warn', key: 'fb.classify', params: { n, total: CLASSIFY.length } };
      }, true) }), resetBtn()));
    }
  }
  controlsBody.append(...items);
  ui.dl = el('dl', { class: 'meas' });
  ui.status = el('div', { class: 'status', hidden: '' });
  ui.tables = el('div');
  ui.clear = createButton({ labelKey: 'ctl.clearTable', variant: 'ghost', onClick: () => { const s = cur(); s.rows = []; s.fb = null; ui.sig = null; updateMeasures(); } });
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
  if (tab === 'rated') {
    ui.app.set(st.app);
    rows.push([t('m.Ur'), `${num(e.U, 0)} V`], [t('m.Pr'), fmtP(e.P)]);
  } else if (tab === 'power') {
    ui.lamp.set(st.lamp); ui.k.set(st.closed ? 'closed' : 'open');
    rows.push([t('m.U'), `${num(e.U, 2)} V`], [t('m.I'), `${num(e.I, 3)} A`], [t('m.Prated'), `${num(st.lamp === 'L1' ? L1.Pr : L2.Pr, 1)} W`]);
  } else if (tab === 'meter') {
    APPS.forEach((a, i) => ui.apps[i].set(st.on[a.id] ? 'on' : 'off'));
    ui.speed.set(String(st.speed)); ui.showN.set(st.showN ? 'yes' : 'no');
    rows.push([t('m.index'), `${num(st.counter, 1)} kWh`], [t('m.time'), `${num(st.swT, 1)} s`]);
    if (st.showN) rows.push([t('meter.turns'), String(Math.floor(st.swTurns))]);
    if (!fb && meterPower(st) === 0) fb = { type: '', key: 'meter.nothing' };
  } else {
    ui.mode.set(st.mode);
    if (st.mode === 'law') {
      ui.k.set(st.closed ? 'closed' : 'open');
      rows.push([t('m.R'), `${R_J} Ω`], [t('m.I'), `${num(e.I, 2)} A`]);
    } else {
      CLASSIFY.forEach((c, i) => ui.cls[i].set(st.answers[c.id] || ''));
    }
  }
  ui.dl.replaceChildren(...rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)]));
  if (!fb) ui.status.hidden = true;
  else { ui.status.hidden = false; ui.status.className = `status ${fb.type || ''}`; ui.status.textContent = t(fb.key, fb.params); }
  buildTables(tab, st);
}

function buildTables(tab, st) {
  const rows = st.rows || [];
  const sig = `${tab}|${st.app || ''}|${rows.length}|${calcSig(rows)}|${st.calc ? calcSig(Object.values(st.calc)) : ''}`;
  if (sig === ui.sig) return;
  ui.sig = sig;
  const th = (k) => el('th', { class: 'keep-case' }, t(k));
  const onCheck = (res) => {
    const s = cur();
    s.fb = res === 'invalid' ? { type: 'warn', key: 'calc.invalid' } : res === 'ok' ? { type: 'good', key: 'fb.calcOk' } : { type: 'bad', key: 'fb.calcWrong' };
    updateMeasures();
  };
  const rel = (v) => Math.max(1e-6, Math.abs(v) * 0.01);
  const parts = [];
  if (tab === 'rated') {
    const e = evalRated(st);
    st.calc[st.app] ??= {};
    parts.push(el('table', { class: 'data' }, [el('thead', {}, el('tr', {}, [th('col.Ur'), th('col.Pr'), th('col.Irated')])),
      el('tbody', {}, el('tr', {}, [el('td', {}, num(e.U, 0)), el('td', {}, num(e.P, e.P < 1 ? 2 : 0)),
        calcCell(st.calc[st.app], 'I', { expected: e.I, decimals: e.I < 0.1 ? 4 : 2, tol: rel(e.I), onCheck })]))]));
  } else if (tab === 'power' && rows.length) {
    parts.push(el('table', { class: 'data' }, [el('thead', {}, el('tr', {}, [th('col.lamp'), th('col.U'), th('col.I'), th('col.UI'), th('col.Pr')])),
      el('tbody', {}, rows.map((r) => el('tr', {}, [el('td', {}, r.lamp), el('td', {}, num(r.U, 2)), el('td', {}, num(r.I, 3)),
        calcCell(r, 'P', { expected: r.U * r.I, decimals: 2, tol: rel(r.U * r.I), onCheck }), el('td', {}, num(r.lamp === 'L1' ? L1.Pr : L2.Pr, 1))])))]));
  } else if (tab === 'meter' && rows.length) {
    parts.push(el('table', { class: 'data' }, [el('thead', {}, el('tr', {}, [th('col.n'), th('col.t'), th('col.EWh'), th('col.EJ'), th('col.P')])),
      el('tbody', {}, rows.map((r) => {
        const EWh = r.n * C_WH;
        return el('tr', {}, [el('td', {}, String(r.n)), el('td', {}, num(r.t, 1)),
          calcCell(r, 'EWh', { expected: EWh, decimals: 1, tol: 0.01, onCheck }),
          calcCell(r, 'EJ', { expected: EWh * 3600, decimals: 0, tol: 1, disabled: !calcDone(r, 'EWh'), onCheck }),
          calcCell(r, 'P', { expected: (EWh * 3600) / r.t, decimals: 0, tol: rel((EWh * 3600) / r.t), disabled: !calcDone(r, 'EJ'), onCheck })]);
      }))]));
  } else if (tab === 'joule' && st.mode === 'law' && rows.length) {
    parts.push(el('table', { class: 'data' }, [el('thead', {}, el('tr', {}, [th('col.I'), th('col.RI2'), th('col.E60')])),
      el('tbody', {}, rows.map((r) => el('tr', {}, [el('td', {}, num(r.I, 2)),
        calcCell(r, 'P', { expected: R_J * r.I * r.I, decimals: 2, tol: rel(R_J * r.I * r.I), onCheck }),
        calcCell(r, 'E', { expected: R_J * r.I * r.I * 60, decimals: 0, tol: rel(R_J * r.I * r.I * 60), disabled: !calcDone(r, 'P'), onCheck })])))]));
  }
  ui.tables.replaceChildren(...parts);
  ui.tables.hidden = !parts.length;
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
const xs = { en: {}, fr: {} };
for (const lang of ['en', 'fr']) Object.assign(xs[lang], { 'speed.1': '×1', 'speed.10': '×10', 'speed.60': '×60' });
onLangChange(() => { if (shell) buildTab(); });

shell = initSim({
  strings: { en: { ...strings.en, ...xs.en }, fr: { ...strings.fr, ...xs.fr } },
  tabs: TABS.map((id) => ({ id, labelKey: `tab.${id}` })),
  initialTab: 'rated',
  onTab: buildTab,
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, cur: () => cur(), evaluate };
