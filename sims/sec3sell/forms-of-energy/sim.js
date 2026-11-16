// Sec 3 SE-LH — Chapter 2: Forms of energy (whole chapter).
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num, qty } from '../../../shared/format.js';
import { createButton, createSegmented, createSlider, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, arrow } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { label } from '../../../shared/figures.js';
import { calcCell, calcSig, calcDone } from '../../../shared/calc-cell.js';
import { plotCurves } from '../../../shared/energy-bars.js';
import { drawLamp } from '../../../shared/circuit-draw.js';

const TAU = 2 * Math.PI;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const W = 600;
const TABS = ['thermal', 'chemelec', 'mass', 'conversions'];
const MODES = {
  thermal: ['heating', 'contact'],
  chemelec: ['carbon', 'heater', 'motor'],
  mass: ['mass'],
  conversions: ['lamp', 'motorc', 'bullet', 'fall', 'food'],
};
const HEIGHTS = { thermal: 440, chemelec: 330, mass: 300, conversions: 340 };

/* ================================================================
   Book values
   ================================================================ */
// Fig. 2.1: 1 kg of ice at −10 °C. Phase energies in kJ. The book prints 4190 kJ for the water from 0 to 100 °C:
// the correct value is 4.19 kJ/(kg·°C) × 1 kg × 100 °C = 419 kJ (misprint, stated in the Info panel).
const PH = [
  { key: 'OA', dE: 21, T0: -10, T1: 0, state: 'ice' },
  { key: 'AB', dE: 335, T0: 0, T1: 0, state: 'melt' },
  { key: 'BC', dE: 419, T0: 0, T1: 100, state: 'water' },
  { key: 'CD', dE: 2260, T0: 100, T1: 100, state: 'boil' },
  { key: 'DE', dE: 40, T0: 100, T1: 120, state: 'steam' }, // steam in a closed container (c ≈ 2.0 kJ/(kg·°C), chosen)
];
const E_TOT = PH.reduce((s, p) => s + p.dE, 0);
function heatState(E) {
  let e = 0;
  for (const p of PH) {
    if (E <= e + p.dE + 1e-9) { const f = (E - e) / p.dE; return { p, f, T: p.T0 + (p.T1 - p.T0) * f }; }
    e += p.dE;
  }
  const p = PH[PH.length - 1];
  return { p, f: 1, T: p.T1 };
}
const tempAt = (E) => heatState(E).T;
const HAND = 37; // °C
const CONTACTS = { pan: 50, bottle: 5, tea: 77 }; // tea: 350 K (Question 3 a)
const Q_C = 393; // kJ per mole of carbon (C + O2 → CO2 + 393 kJ)
const MAINS = 220; // V
const HEATER_I = 2; // A (Solved Problem 1: 20 C at 220 V, e.g. 2 A for 10 s)
const MOTOR = { I: 5, Pu: 50000 / 60 }; // Question 11: 5 A for 1 min, useful work 50 000 J in 1 min
const C_LIGHT = 3e8; // m/s, as in the book
const OBJECTS = { g2: 0.002, apple: 0.1, proton: 1.66e-27, kg1: 1 }; // Solved Problem 2, Questions 7 ii and 8
const C_FUEL = (Q_C * 1000) / 0.012; // J per kg of carbon burnt

function initialState(tab) {
  switch (tab) {
    case 'thermal': return { mode: 'heating', P: 2, E: 0, run: false, spread: true, obj: 'pan', rows: [], fb: null };
    case 'chemelec': return { mode: 'carbon', n: 1, burn: 0, run: false, tH: 10, tM: 60, time: 0, rows: [], fb: null };
    case 'mass': return { mode: 'mass', obj: 'g2', rows: [], fb: null };
    default: return { mode: 'lamp', Ein: 100, phase: 0, rows: [], fb: null };
  }
}
let S = Object.fromEntries(TABS.map((k) => [k, initialState(k)]));

/* ================================================================
   Canvas and loop
   ================================================================ */
let shell;
let drawQueued = false;
let now = 0;
const canvas = document.getElementById('stage');
const view = setupCanvas(canvas, { width: W, height: 330, maxHeightVh: () => (window.innerWidth < 880 ? 52 : 76), onResize: () => requestDraw() });
function requestDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; draw(); });
}
onThemeChange(() => requestDraw());

const TIME_X = 50; // thermal: time ×50 on the screen
const loop = createLoop({
  step(dt) {
    now += dt;
    if (!shell) return false;
    const st = S[shell.tab];
    if (shell.tab === 'thermal' && st.mode === 'heating' && st.run) {
      st.E = Math.min(E_TOT, st.E + st.P * dt * TIME_X); // kJ (P in kW)
      if (st.E >= E_TOT) st.run = false;
    } else if (shell.tab === 'chemelec' && st.run) {
      if (st.mode === 'carbon') { st.burn = Math.min(1, st.burn + dt / 4); if (st.burn >= 1) { st.run = false; st.done = true; } }
      else {
        const tEnd = st.mode === 'heater' ? st.tH : st.tM;
        st.time = Math.min(tEnd, st.time + dt * (st.mode === 'motor' ? 6 : 2)); // fast forward ×2 / ×6
        if (st.time >= tEnd) { st.run = false; st.done = true; }
      }
    }
    return true;
  },
  render() { draw(); updateMeasures(); },
});

/* ================================================================
   Drawing helpers
   ================================================================ */
const C = { heat: () => cssVar('--s4'), elec: () => cssVar('--s5'), chem: () => cssVar('--s3'), light: () => cssVar('--gold'), mech: () => cssVar('--s1'), pot: () => cssVar('--s2'), rad: () => cssVar('--sun') };
function note(ctx, s, x, y, o = {}) { label(ctx, s, x, y, { size: 12, weight: 600, color: cssVar('--muted'), ...o }); }
function heatArrow(ctx, x1, y1, x2, y2, phase) {
  // wavy heat arrow from (x1,y1) to (x2,y2)
  const L = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / L, uy = (y2 - y1) / L;
  ctx.strokeStyle = C.heat(); ctx.fillStyle = C.heat(); ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath();
  for (let s = 0; s <= L - 10; s += 2) {
    const a = Math.sin(s / 6 - phase * 8) * 4;
    const x = x1 + ux * s - uy * a, y = y1 + uy * s + ux * a;
    if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  arrow(ctx, x2 - ux * 12, y2 - uy * 12, x2, y2, 10);
}
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const sup = (n) => String(n).split('').map((c) => SUP[c] ?? c).join('');
function sciParts(x) { const e = Math.floor(Math.log10(Math.abs(x)) + 1e-12); return { m: x / 10 ** e, e }; }
function sci(x, d = 2) { if (x === 0) return '0'; const { m, e } = sciParts(x); return e === 0 ? num(m, d) : `${num(m, d)} × 10${sup(e)}`; }

function draw() {
  if (!shell) return;
  const tab = shell.tab;
  if (view.height !== HEIGHTS[tab]) view.setLogicalSize(W, HEIGHTS[tab]);
  const ctx = view.begin();
  ctx.fillStyle = cssVar('--scene-bg');
  roundRect(ctx, 0, 0, W, HEIGHTS[tab], 14);
  ctx.fill();
  if (tab === 'thermal') drawThermal(ctx, S.thermal);
  else if (tab === 'chemelec') drawChemElec(ctx, S.chemelec);
  else if (tab === 'mass') drawMass(ctx, S.mass);
  else drawConversions(ctx, S.conversions);
}

/* ---------- Tab 1: thermal energy ---------- */
// x position on the energy axis: true scale, or each phase given the same width as in Fig. 2.1
function eToX(E, spread) {
  if (!spread) return E;
  let e = 0, x = 0;
  for (const p of PH) {
    if (E <= e + p.dE) return x + (E - e) / p.dE;
    e += p.dE; x += 1;
  }
  return PH.length;
}
function xToE(x, spread) {
  if (!spread) return x;
  const i = clamp(Math.floor(x), 0, PH.length - 1);
  let e = 0; for (let k = 0; k < i; k++) e += PH[k].dE;
  return e + (x - i) * PH[i].dE;
}
function drawThermal(ctx, st) {
  if (st.mode === 'contact') { drawContact(ctx, st); return; }
  const hs = heatState(st.E);
  // container with ice / water / steam on an electric heater
  const cx = 140, yB = 190, w = 120, h = 110;
  ctx.fillStyle = cssVar('--hotplate'); roundRect(ctx, cx - 80, yB, 160, 26, 6); ctx.fill();
  if (st.run) { ctx.fillStyle = cssVar('--hot'); ctx.globalAlpha = 0.5 + 0.3 * Math.sin(now * 6); ctx.fillRect(cx - 60, yB + 2, 120, 6); ctx.globalAlpha = 1; }
  label(ctx, `${qty(st.P, 1, 'kW')}`, cx, yB + 14, { size: 11, weight: 800, color: '#fff', halo: false });
  const x0 = cx - w / 2, y0 = yB - h;
  // contents
  const s = hs.p.state, f = hs.f;
  const iceFrac = s === 'ice' ? 1 : s === 'melt' ? 1 - f : 0;
  const waterFrac = s === 'melt' ? f : s === 'water' ? 1 : s === 'boil' ? 1 - f : 0;
  const steamFrac = s === 'boil' ? f : s === 'steam' ? 1 : 0;
  const lev = 70 * waterFrac;
  if (waterFrac > 0) { ctx.fillStyle = cssVar('--water'); ctx.fillRect(x0 + 3, yB - lev, w - 6, lev); }
  if (iceFrac > 0) {
    ctx.fillStyle = cssVar('--ice'); ctx.strokeStyle = cssVar('--ice-edge'); ctx.lineWidth = 1.5;
    const n = Math.ceil(9 * iceFrac);
    for (let k = 0; k < n; k++) {
      const bx = x0 + 10 + (k % 3) * 34, by = yB - 30 - Math.floor(k / 3) * 30 - (waterFrac > 0 ? lev * 0.5 : 0) + 30 - 28 * (Math.floor(k / 3) === 0 ? 0 : 0);
      const sz = 26 * (k === n - 1 ? Math.max(0.4, (9 * iceFrac) - (n - 1)) : 1);
      roundRect(ctx, bx, by, sz, sz, 4); ctx.fill(); ctx.stroke();
    }
  }
  if (steamFrac > 0 || s === 'boil') {
    ctx.fillStyle = 'rgba(200,200,210,0.55)';
    const nb = s === 'boil' ? 10 : 18;
    for (let k = 0; k < nb; k++) {
      const yy = y0 + 10 + ((k * 23 + now * 30) % (h - (s === 'boil' ? lev + 10 : 20)));
      ctx.beginPath(); ctx.arc(x0 + 14 + ((k * 37) % (w - 28)), yy, 5 + (k % 3), 0, TAU); ctx.fill();
    }
  }
  if (s === 'boil' && st.run) {
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (let k = 0; k < 8; k++) { const yy = yB - ((k * 13 + now * 60) % Math.max(10, lev)); ctx.beginPath(); ctx.arc(x0 + 12 + ((k * 29) % (w - 24)), yy, 3, 0, TAU); ctx.fill(); }
  }
  // container walls (closed lid for the steam phase)
  ctx.strokeStyle = cssVar('--glass-stroke'); ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0, yB); ctx.lineTo(x0 + w, yB); ctx.lineTo(x0 + w, y0); ctx.stroke();
  ctx.fillStyle = cssVar('--metal'); ctx.fillRect(x0 - 6, y0 - 8, w + 12, 8);
  label(ctx, t(`th.state.${s}`), cx, y0 - 22, { size: 13, weight: 800 });
  // thermometer reading
  label(ctx, `θ = ${qty(hs.T, 1, '°C')}`, 300, 60, { size: 16, weight: 800, color: cssVar('--brand-red'), align: 'left' });
  label(ctx, `T = ${qty(hs.T + 273, 1, 'K')}`, 300, 86, { size: 13, weight: 700, align: 'left' });
  label(ctx, `${t('th.absorbed')} ${qty(st.E, 0, 'kJ')}`, 300, 112, { size: 13, weight: 700, color: C.heat(), align: 'left' });
  label(ctx, `${t('th.phase')} ${t(`th.ph.${hs.p.key}`)}`, 300, 138, { size: 12, weight: 700, color: cssVar('--muted'), align: 'left' });
  note(ctx, t('th.timeNote'), 300, 168, { size: 11, align: 'left' });
  // graph θ = f(E)
  const xMax = st.spread ? PH.length : E_TOT;
  const curves = [{ f: (x) => tempAt(xToE(x, st.spread)), color: cssVar('--brand-red') }];
  plotCurves(ctx, {
    x: 12, y: 228, w: 576, h: 200, xMin: 0, xMax, yMin: -20, yMax: 130, xLabel: t('th.xLabel'), yLabel: 'θ (°C)', yStep: 20,
    xStep: st.spread ? 1 : 500, curves, marker: eToX(st.E, st.spread),
  });
  if (st.spread) {
    // labels of the energies of the phases and of the points O′ A B C D E (Fig. 2.1)
    const X = (x) => 12 + 42 + (x / xMax) * (576 - 52);
    ctx.fillStyle = cssVar('--scene-bg'); ctx.fillRect(12 + 30, 228 + 200 - 30 + 2, 576 - 30, 14);
    let e = 0;
    PH.forEach((p, i) => {
      label(ctx, `+${num(p.dE, 0)} kJ`, X(i + 0.5), 228 + 200 - 22, { size: 10, weight: 700, color: C.heat() });
      e += p.dE;
    });
    ['O′', 'A', 'B', 'C', 'D', 'E'].forEach((n, i) => {
      const E = xToE(i, true), y = 228 + 16 + (1 - (tempAt(Math.min(E, E_TOT)) + 20) / 150) * (200 - 46);
      label(ctx, n, X(i) + (i === 0 ? 8 : 0), y - 10, { size: 11, weight: 800 });
    });
  }
}
function drawContact(ctx, st) {
  const Tobj = CONTACTS[st.obj];
  // hand (37 °C) touching the object
  const hx = 200, hy = 160;
  ctx.fillStyle = cssVar('--skin');
  roundRect(ctx, hx - 120, hy - 26, 120, 52, 22); ctx.fill();
  for (let k = 0; k < 4; k++) { roundRect(ctx, hx - 10, hy - 26 + k * 13, 34, 11, 6); ctx.fill(); }
  label(ctx, t('th.hand'), hx - 64, hy - 40, { size: 13, weight: 800 });
  label(ctx, qty(HAND, 0, '°C'), hx - 64, hy, { size: 13, weight: 800, halo: false, color: cssVar('--text') });
  // object
  const ox = 330;
  if (st.obj === 'pan') {
    ctx.fillStyle = cssVar('--metal'); roundRect(ctx, ox, hy - 40, 150, 70, 10); ctx.fill();
    ctx.fillRect(ox + 150, hy - 16, 70, 12);
  } else if (st.obj === 'bottle') {
    ctx.fillStyle = cssVar('--water'); roundRect(ctx, ox + 20, hy - 70, 60, 120, 14); ctx.fill();
    ctx.fillStyle = cssVar('--ice-edge'); ctx.fillRect(ox + 38, hy - 88, 24, 20);
  } else {
    ctx.fillStyle = cssVar('--paper'); roundRect(ctx, ox, hy - 40, 100, 80, 10); ctx.fill();
    ctx.strokeStyle = cssVar('--glass-stroke'); ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = cssVar('--dye'); ctx.fillRect(ox + 6, hy - 30, 88, 12);
    ctx.strokeStyle = cssVar('--paper'); ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(ox + 112, hy, 18, -1.2, 1.2); ctx.stroke();
  }
  label(ctx, t(`obj.${st.obj}`), ox + 70, hy - 100, { size: 13, weight: 800 });
  label(ctx, `${qty(Tobj, 0, '°C')}`, ox + 70, hy + 70, { size: 14, weight: 800 });
  // heat goes from the hotter body to the colder one
  if (Tobj > HAND) heatArrow(ctx, ox + 10, hy + 2, hx + 30, hy + 2, now);
  else if (Tobj < HAND) heatArrow(ctx, hx + 30, hy + 2, ox + 10, hy + 2, now);
  label(ctx, t(Tobj > HAND ? 'th.toHand' : 'th.fromHand'), 300, 270, { size: 13, weight: 700, color: C.heat() });
  note(ctx, t('th.contactNote'), 300, 300, { size: 11 });
}

/* ---------- Tab 2: chemical and electrical energy ---------- */
function drawChemElec(ctx, st) {
  if (st.mode === 'carbon') drawCarbon(ctx, st);
  else drawCircuit(ctx, st);
}
function drawCarbon(ctx, st) {
  // pieces of coal burning in a dish; one piece per mole (12 g)
  const yB = 230, cx = 200;
  ctx.fillStyle = cssVar('--metal'); roundRect(ctx, cx - 140, yB, 280, 16, 6); ctx.fill();
  const left = 1 - st.burn;
  for (let k = 0; k < st.n; k++) {
    const x = cx - 120 + (k % 5) * 50, y = yB - 20 - Math.floor(k / 5) * 30;
    const s = 22 * Math.max(0.15, left);
    ctx.fillStyle = cssVar('--soot'); roundRect(ctx, x, y + (22 - s), 34 * Math.max(0.3, left), s, 6); ctx.fill();
    if (st.run) {
      const fh = 30 + 8 * Math.sin(now * 20 + k);
      ctx.fillStyle = cssVar('--flame-out');
      ctx.beginPath(); ctx.moveTo(x + 2, y + 18); ctx.quadraticCurveTo(x + 17, y - fh, x + 32, y + 18); ctx.fill();
      ctx.fillStyle = cssVar('--flame-in');
      ctx.beginPath(); ctx.moveTo(x + 10, y + 18); ctx.quadraticCurveTo(x + 17, y - fh * 0.5, x + 24, y + 18); ctx.fill();
    }
  }
  if (st.run || st.done) {
    // CO2 rising and heat given off
    ctx.fillStyle = cssVar('--co2'); ctx.globalAlpha = 0.6;
    for (let k = 0; k < 12; k++) { const y = yB - 80 - ((k * 31 + now * 40) % 140); ctx.beginPath(); ctx.arc(cx - 110 + (k * 41) % 220, y, 6, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1;
    heatArrow(ctx, cx + 150, yB - 40, cx + 250, yB - 80, now);
    label(ctx, t('ce.heat'), cx + 260, yB - 96, { size: 13, weight: 800, color: C.heat(), align: 'left' });
  }
  label(ctx, 'C + O₂ → CO₂ + 393 kJ', 300, 30, { size: 16, weight: 800 });
  label(ctx, t('ce.perMole'), 300, 54, { size: 12, weight: 600, color: cssVar('--muted') });
  label(ctx, `${qty(st.n, 0, 'mol')} = ${qty(12 * st.n, 0, 'g')} ${t('ce.ofCarbon')}`, cx, yB + 40, { size: 13, weight: 700 });
  if (st.done) label(ctx, t('ce.burnt'), cx, yB + 64, { size: 12, weight: 700, color: cssVar('--muted') });
}
function drawCircuit(ctx, st) {
  // mains socket (220 V), ammeter, device; charge Q that has flowed so far
  const motor = st.mode === 'motor';
  const I = motor ? MOTOR.I : HEATER_I;
  const Q = I * st.time;
  ctx.strokeStyle = cssVar('--wire'); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(90, 120); ctx.lineTo(300, 120); ctx.moveTo(90, 240); ctx.lineTo(300, 240); ctx.stroke();
  ctx.fillStyle = cssVar('--socket'); roundRect(ctx, 30, 140, 70, 80, 10); ctx.fill();
  ctx.fillStyle = cssVar('--text'); ctx.beginPath(); ctx.arc(55, 180, 5, 0, TAU); ctx.arc(75, 180, 5, 0, TAU); ctx.fill();
  label(ctx, `${num(MAINS, 0)} V`, 65, 236, { size: 13, weight: 800 });
  ctx.strokeStyle = cssVar('--wire'); ctx.beginPath(); ctx.moveTo(90, 120); ctx.lineTo(90, 150); ctx.moveTo(90, 240); ctx.lineTo(90, 210); ctx.stroke();
  // ammeter
  ctx.fillStyle = cssVar('--meter-body'); roundRect(ctx, 160, 98, 70, 44, 8); ctx.fill();
  ctx.fillStyle = cssVar('--lcd-bg'); ctx.fillRect(168, 106, 54, 22);
  label(ctx, qty(st.run ? I : 0, 2, 'A'), 195, 117, { size: 12, weight: 800, color: cssVar('--lcd-ink'), halo: false });
  label(ctx, 'A', 195, 136, { size: 10, weight: 800, color: '#fff', halo: false });
  // voltmeter across the device: V_AB (EN) / U_AB (FR)
  // device
  const dx = 330;
  const tx = motor ? dx + 20 : dx;
  label(ctx, `${t('ce.Vsym')} = ${qty(MAINS, 0, 'V')}`, tx - (motor ? 40 : 24), 160, { size: 13, weight: 800, color: C.elec(), align: 'right' });
  label(ctx, 'A', tx + 12, 110, { size: 12, weight: 800 });
  label(ctx, 'B', tx + 12, 252, { size: 12, weight: 800 });
  if (!motor) {
    ctx.strokeStyle = st.run ? cssVar('--hot') : cssVar('--coil'); ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(dx, 120);
    for (let k = 0; k <= 12; k++) ctx.lineTo(dx + (k % 2 ? 26 : -6), 130 + k * 8.5);
    ctx.lineTo(dx, 240); ctx.stroke();
    ctx.strokeStyle = cssVar('--wire'); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(300, 120); ctx.lineTo(dx, 120); ctx.moveTo(300, 240); ctx.lineTo(dx, 240); ctx.stroke();
    if (st.run) heatArrow(ctx, dx + 40, 180, dx + 110, 160, now);
    label(ctx, t('ce.heaterName'), dx + 10, 270, { size: 12, weight: 800 });
  } else {
    ctx.strokeStyle = cssVar('--wire'); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(300, 120); ctx.lineTo(dx + 20, 120); ctx.lineTo(dx + 20, 150); ctx.moveTo(300, 240); ctx.lineTo(dx + 20, 240); ctx.lineTo(dx + 20, 210); ctx.stroke();
    ctx.fillStyle = cssVar('--motor'); ctx.beginPath(); ctx.arc(dx + 20, 180, 30, 0, TAU); ctx.fill();
    label(ctx, 'M', dx + 20, 180, { size: 16, weight: 800, color: '#fff', halo: false });
    // pulley lifting a load: useful mechanical work
    const lift = (MOTOR.Pu * st.time) / (100 * 10); // height in m of a 100 kg load (illustrative drawing)
    ctx.strokeStyle = cssVar('--thread'); ctx.lineWidth = 2;
    const ly = 80 + 160 - clamp(lift, 0, 50) * 2.6;
    ctx.beginPath(); ctx.moveTo(dx + 50, 180); ctx.lineTo(dx + 110, 60); ctx.lineTo(dx + 110, ly); ctx.stroke();
    ctx.fillStyle = cssVar('--box'); roundRect(ctx, dx + 92, ly, 36, 30, 4); ctx.fill();
    ctx.fillStyle = cssVar('--metal'); ctx.beginPath(); ctx.arc(dx + 110, 60, 8, 0, TAU); ctx.fill();
    if (st.run) heatArrow(ctx, dx - 8, 200, dx - 70, 225, now);
    label(ctx, t('ce.motorName'), dx + 20, 270, { size: 12, weight: 800 });
  }
  label(ctx, `t = ${qty(st.time, 0, 's')}`, 195, 60, { size: 14, weight: 800, align: 'center' });
  label(ctx, `${t('ce.charge')} Q = ${qty(Q, 0, 'C')}`, 195, 84, { size: 13, weight: 700, color: cssVar('--brand-blue') });
  note(ctx, t(motor ? 'ce.fastMotor' : 'ce.fastHeater'), 300, 310, { size: 11 });
}

/* ---------- Tab 3: mass and energy ---------- */
function drawMass(ctx, st) {
  const m = OBJECTS[st.obj];
  label(ctx, 'E = m c²', 300, 40, { size: 26, weight: 800, color: cssVar('--brand-navy') });
  label(ctx, `c = ${sci(C_LIGHT, 0)} m/s`, 300, 72, { size: 13, weight: 700, color: cssVar('--muted') });
  // the object on the pan of a balance
  const cx = 160, yB = 230;
  ctx.fillStyle = cssVar('--balance-body'); roundRect(ctx, cx - 70, yB, 140, 40, 8); ctx.fill();
  ctx.fillStyle = cssVar('--metal'); ctx.fillRect(cx - 60, yB - 6, 120, 6);
  if (st.obj === 'apple') {
    ctx.fillStyle = cssVar('--apple'); ctx.beginPath(); ctx.arc(cx, yB - 30, 24, 0, TAU); ctx.fill();
    ctx.fillStyle = cssVar('--leaf'); ctx.beginPath(); ctx.ellipse(cx + 8, yB - 58, 9, 4, -0.5, 0, TAU); ctx.fill();
  } else if (st.obj === 'proton') {
    ctx.fillStyle = cssVar('--plus'); ctx.beginPath(); ctx.arc(cx, yB - 40, 10, 0, TAU); ctx.fill();
    label(ctx, '+', cx, yB - 40, { size: 13, weight: 800, color: '#fff', halo: false });
    note(ctx, t('m.notToScale'), cx, yB - 70, { size: 10 });
  } else {
    const s = st.obj === 'g2' ? 12 : 40;
    ctx.fillStyle = cssVar('--brass'); roundRect(ctx, cx - s / 2, yB - 6 - s, s, s, 3); ctx.fill();
  }
  label(ctx, t(`obj.${st.obj}`), cx, yB + 20, { size: 12, weight: 800, color: '#fff', halo: false });
  label(ctx, `m = ${st.obj === 'proton' ? sci(m, 2) : num(m, m < 0.01 ? 3 : 1)} kg`, cx, yB + 56, { size: 14, weight: 800 });
  // the energy, as a comparison with burning carbon
  const E = m * C_LIGHT ** 2;
  heatArrow(ctx, 260, yB - 30, 360, yB - 30, now);
  const kg = E / C_FUEL;
  label(ctx, t('m.equivalent'), 380, 140, { size: 12, weight: 700, color: cssVar('--muted'), align: 'left' });
  label(ctx, kg >= 1000 ? `${sci(kg / 1000, 1)} ${t('m.tons')}` : `${sci(kg, 1)} kg`, 380, 166, { size: 15, weight: 800, color: C.heat(), align: 'left' });
  label(ctx, t('m.ofCoal'), 380, 190, { size: 12, weight: 700, color: cssVar('--muted'), align: 'left' });
}

/* ---------- Tab 4: energy conversions ---------- */
// Each chain: input form, outputs [{ form, value }], value in J (or %, for the lamp)
function chainOf(st) {
  switch (st.mode) {
    case 'lamp': return { input: { form: 'elec', value: st.Ein }, out: [{ form: 'light', value: 0.05 * st.Ein }, { form: 'heat', value: 0.95 * st.Ein }], unit: 'J' };
    case 'motorc': return { input: { form: 'elec', value: 66000 }, out: [{ form: 'mech', value: 50000 }, { form: 'heat', value: 16000 }], unit: 'J' };
    case 'bullet': return { input: { form: 'kin', value: 2500 }, out: [{ form: 'heat', value: 2500 }], unit: 'J' };
    case 'fall': return { input: { form: 'pot', value: 200 }, out: [{ form: 'kin', value: 180 }, { form: 'heat', value: 20 }], unit: 'J' };
    default: return null;
  }
}
const FORM_COLOR = { elec: () => C.elec(), light: () => C.light(), heat: () => C.heat(), mech: () => C.mech(), kin: () => C.mech(), pot: () => C.pot(), chem: () => C.chem(), rad: () => C.rad() };
function drawConversions(ctx, st) {
  if (st.mode === 'food') { drawFood(ctx); return; }
  const ch = chainOf(st);
  const H = HEIGHTS.conversions, total = ch.input.value;
  const band = 140; // px for the whole input
  const xIn = 30, xSplit = 250, xOut = 430, yMid = 170;
  // device picture
  const dev = { lamp: 'lamp', motorc: 'motor', bullet: 'tree', fall: 'ball' }[st.mode];
  label(ctx, t(`cv.title.${st.mode}`), 300, 26, { size: 14, weight: 800 });
  // input band
  ctx.fillStyle = FORM_COLOR[ch.input.form]();
  ctx.fillRect(xIn, yMid - band / 2, xSplit - xIn - 60, band);
  label(ctx, t(`form.${ch.input.form}`), xIn + 8, yMid - 12, { size: 13, weight: 800, color: '#fff', halo: false, align: 'left' });
  label(ctx, qty(total, 0, ch.unit), xIn + 8, yMid + 10, { size: 13, weight: 800, color: '#fff', halo: false, align: 'left' });
  // device in the middle
  const dx = xSplit - 30;
  ctx.fillStyle = cssVar('--surface'); ctx.strokeStyle = cssVar('--border'); ctx.lineWidth = 1.5;
  roundRect(ctx, dx - 34, yMid - 50, 68, 100, 12); ctx.fill(); ctx.stroke();
  if (dev === 'lamp') drawLamp(ctx, { x: dx, y: yMid + 12, glow: 0.8 });
  else if (dev === 'motor') { ctx.fillStyle = cssVar('--motor'); ctx.beginPath(); ctx.arc(dx, yMid, 22, 0, TAU); ctx.fill(); label(ctx, 'M', dx, yMid, { size: 15, weight: 800, color: '#fff', halo: false }); }
  else if (dev === 'tree') { ctx.fillStyle = cssVar('--wood'); ctx.fillRect(dx - 10, yMid - 40, 20, 80); ctx.fillStyle = cssVar('--metal'); ctx.beginPath(); ctx.arc(dx - 4, yMid, 4, 0, TAU); ctx.fill(); }
  else { ctx.fillStyle = cssVar('--s3'); ctx.beginPath(); ctx.arc(dx, yMid - 20 + ((now * 40) % 50), 10, 0, TAU); ctx.fill(); }
  label(ctx, t(`cv.dev.${st.mode}`), dx, yMid + band / 2 + 16, { size: 11, weight: 700, color: cssVar('--muted') });
  // output bands, widths ∝ energy, with moving dots
  let yTop = yMid - band / 2;
  const gap = 16;
  const nOut = ch.out.length;
  let yo = yMid - (band + gap * (nOut - 1)) / 2;
  ch.out.forEach((o) => {
    const hpx = Math.max(3, (o.value / total) * band);
    const col = FORM_COLOR[o.form]();
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(dx + 34, yTop); ctx.bezierCurveTo(xOut - 80, yTop, xOut - 80, yo, xOut, yo);
    ctx.lineTo(xOut + 40, yo); ctx.lineTo(xOut + 40, yo + hpx); ctx.lineTo(xOut, yo + hpx);
    ctx.bezierCurveTo(xOut - 80, yo + hpx, xOut - 80, yTop + hpx, dx + 34, yTop + hpx);
    ctx.closePath(); ctx.fill();
    // dots
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (let k = 0; k < 4; k++) {
      const u = ((now * 0.4 + k / 4) % 1), x = dx + 34 + u * (xOut + 40 - dx - 34);
      const yy = u < 0.85 ? yTop + (yo - yTop) * Math.min(1, u / 0.85) : yo;
      ctx.beginPath(); ctx.arc(x, yy + hpx / 2, Math.min(4, hpx / 2), 0, TAU); ctx.fill();
    }
    const showVal = o.form !== 'heat';
    label(ctx, t(`form.${o.form}`), xOut + 48, yo + hpx / 2 - (showVal ? 9 : 0), { size: 13, weight: 800, color: col, align: 'left' });
    if (showVal) label(ctx, qty(o.value, 0, ch.unit), xOut + 48, yo + hpx / 2 + 10, { size: 12, weight: 700, align: 'left' });
    else label(ctx, '? J', xOut + 48, yo + hpx / 2 + 16, { size: 12, weight: 800, align: 'left' });
    yTop += hpx; yo += hpx + gap;
  });
  note(ctx, t('cv.widths'), 300, H - 18, { size: 11 });
}
function drawFood(ctx) {
  // Question 12: Sun → grass → cow → child drinking milk
  const steps = [
    { x: 70, key: 'sun', color: C.rad() },
    { x: 215, key: 'grass', color: cssVar('--leaf') },
    { x: 360, key: 'cow', color: cssVar('--box') },
    { x: 505, key: 'child', color: cssVar('--skin') },
  ];
  label(ctx, t('cv.title.food'), 300, 26, { size: 14, weight: 800 });
  const y = 130;
  steps.forEach((s, i) => {
    ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(s.x, y, 36, 0, TAU); ctx.fill();
    label(ctx, t(`food.${s.key}`), s.x, y + 54, { size: 13, weight: 800 });
    label(ctx, t(`food.${s.key}.form`), s.x, y + 74, { size: 11, weight: 700, color: cssVar('--muted') });
    if (i < steps.length - 1) {
      const col = i === 0 ? C.rad() : C.chem();
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 4;
      arrow(ctx, s.x + 42, y, steps[i + 1].x - 42, y, 11);
      label(ctx, t(`food.arrow${i}`), (s.x + steps[i + 1].x) / 2, y - 22, { size: 11, weight: 700, color: col });
      if (i > 0) heatArrow(ctx, s.x, y + 90, s.x, y + 150, now);
    }
  });
  heatArrow(ctx, steps[3].x, y + 90, steps[3].x, y + 150, now);
  label(ctx, t('food.heat'), 300, y + 172, { size: 12, weight: 700, color: C.heat() });
}

/* ================================================================
   Controls and measurements
   ================================================================ */
const controlsBody = document.getElementById('controls-body');
const measuresBody = document.getElementById('measures-body');
let ui = {};
let tableSig = '';
function measRows(dl, rows) { dl.replaceChildren(...rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)])); }
function statusBox() { return el('p', { class: 'status', hidden: '' }); }
function showStatus(box, fb) {
  if (!fb) { box.hidden = true; return; }
  box.hidden = false; box.className = `status ${fb.type || ''}`; box.textContent = t(fb.key, fb.params);
}
function hint(key) { return el('p', { class: 'muted', style: 'font-size:0.88rem;margin:10px 0 0', dataset: { i18n: key } }, t(key)); }
const btnRow = (...b) => el('div', { class: 'btn-row' }, b);
const resetBtn = (id) => btnRow(createButton({ labelKey: 'ui.reset', variant: 'ghost', onClick: () => resetTab(id) }));
function clearRow(onClick) { return el('div', { class: 'btn-row', style: 'margin-top:8px' }, [createButton({ labelKey: 'ctl.clearTable', variant: 'ghost', onClick })]); }
const fbOf = (res, okKey, badKey) => (res === 'invalid' ? { type: 'warn', key: 'calcInvalid' } : res === 'wrong' ? { type: 'bad', key: badKey } : { type: 'good', key: okKey });
const relTol = (v, p) => Math.max(Math.abs(v) * p, 1e-6);
function modeControl(tab) {
  const st = S[tab];
  return createSegmented({
    labelKey: `ctl.mode.${tab}`, options: MODES[tab].map((v) => ({ value: v, labelKey: `mode.${v}` })), value: st.mode,
    onChange: (v) => { if (v === st.mode) return; S[tab] = { ...initialState(tab), mode: v }; buildTab(tab); },
  });
}
function tableBlock(st) {
  ui.dl = el('dl', { class: 'meas' });
  ui.tableWrap = el('div', { class: 'table-scroll' });
  ui.table = el('table', { class: 'data' });
  ui.tableWrap.append(ui.table);
  ui.clear = clearRow(() => { st.rows = []; st.fb = null; refresh(); });
  ui.status = statusBox();
  measuresBody.append(ui.dl, ui.tableWrap, ui.clear, ui.status);
}
function renderTable(st, cols, rowFn, rows = st.rows) {
  const sig = calcSig(rows) + rows.length + cols.join();
  if (sig !== tableSig) {
    ui.table.replaceChildren(el('thead', {}, el('tr', {}, cols.map((k) => el('th', {}, t(k))))), el('tbody', {}, rows.map(rowFn)));
    tableSig = sig;
  }
  ui.tableWrap.hidden = rows.length === 0;
  ui.clear.hidden = ui.tableWrap.hidden;
  showStatus(ui.status, st.fb);
}
function setGo(btn, key) { if (btn && btn.dataset.i18n !== key) { btn.dataset.i18n = key; btn.textContent = t(key); } }
const cbOf = (st, okK, badK) => (res) => { st.fb = fbOf(res, okK, badK); refresh(); };

/* ---------- Tab 1 ---------- */
function buildThermal() {
  const st = S.thermal;
  controlsBody.append(modeControl('thermal').root);
  if (st.mode === 'heating') {
    controlsBody.append(
      createSlider({ labelKey: 'ctl.P', min: 0.5, max: 5, step: 0.5, value: st.P, unit: 'kW', decimals: 1, onInput: (v) => { st.P = v; refresh(); } }).root,
      createSegmented({ labelKey: 'ctl.axis', options: [{ value: 'spread', labelKey: 'axis.spread' }, { value: 'scale', labelKey: 'axis.scale' }], value: st.spread ? 'spread' : 'scale', onChange: (v) => { st.spread = v === 'spread'; refresh(); } }).root,
    );
    ui.go = createButton({ labelKey: 'ctl.heat', variant: 'primary', onClick: () => { if (st.E >= E_TOT) st.E = 0; st.run = !st.run; refresh(); } });
    const rec = createButton({ labelKey: 'ctl.recordNow', variant: 'secondary', onClick: () => { const hs = heatState(st.E); st.rows.push({ E: Math.round(st.E), T: Math.round(hs.T * 10) / 10, key: hs.p.key }); st.fb = null; refresh(); } });
    controlsBody.append(btnRow(ui.go, rec), hint('hint.heating'));
  } else {
    controlsBody.append(createSegmented({ labelKey: 'ctl.touch', options: ['pan', 'bottle', 'tea'].map((v) => ({ value: v, labelKey: `obj.${v}` })), value: st.obj, onChange: (v) => { st.obj = v; refresh(); } }).root,
      btnRow(createButton({ labelKey: 'ctl.record', variant: 'primary', onClick: () => { st.rows.push({ obj: st.obj }); st.fb = null; refresh(); } })), hint('hint.contact'));
  }
  controlsBody.append(resetBtn('thermal'));
  tableBlock(st);
}
function updateThermal() {
  const st = S.thermal;
  if (st.mode === 'heating') {
    setGo(ui.go, st.run ? 'ctl.pause' : st.E >= E_TOT ? 'ctl.again' : st.E > 0 ? 'ctl.continue' : 'ctl.heat');
    const hs = heatState(st.E);
    measRows(ui.dl, [[t('m.mass'), qty(1, 0, 'kg')], [t('m.P'), qty(st.P, 1, 'kW')], [t('m.E'), qty(st.E, 0, 'kJ')], [t('m.theta'), qty(hs.T, 1, '°C')], [t('m.T'), qty(hs.T + 273, 1, 'K')], [t('m.state'), t(`th.state.${hs.p.state}`)]]);
    renderTable(st, ['col.E', 'col.theta', 'col.phase'], (r) => el('tr', {}, [el('td', {}, num(r.E, 0)), el('td', {}, num(r.T, 1)), el('td', {}, t(`th.ph.${r.key}`))]));
  } else {
    measRows(ui.dl, [[t('m.hand'), qty(HAND, 0, '°C')], [t('m.object'), qty(CONTACTS[st.obj], 0, '°C')]]);
    renderTable(st, ['col.object', 'col.thetaObj', 'col.Tobj', 'col.heatGoes'], (r) => el('tr', {}, [
      el('td', {}, t(`obj.${r.obj}`)), el('td', {}, num(CONTACTS[r.obj], 0)),
      calcCell(r, 'T', { expected: CONTACTS[r.obj] + 273, decimals: 0, tol: 0.5, onCheck: cbOf(st, 'fb.KOk', 'fb.KWrong') }),
      el('td', {}, t(CONTACTS[r.obj] > HAND ? 'go.toHand' : 'go.fromHand')),
    ]));
  }
}

/* ---------- Tab 2 ---------- */
function buildChemElec() {
  const st = S.chemelec;
  controlsBody.append(modeControl('chemelec').root);
  const restart = () => { st.run = false; st.done = false; st.burn = 0; st.time = 0; };
  if (st.mode === 'carbon') {
    controlsBody.append(createSlider({ labelKey: 'ctl.n', min: 1, max: 10, step: 1, value: st.n, unit: 'mol', onInput: (v) => { st.n = v; restart(); refresh(); } }).root);
    ui.go = createButton({ labelKey: 'ctl.burn', variant: 'primary', onClick: () => { if (st.done) restart(); st.run = true; refresh(); } });
  } else if (st.mode === 'heater') {
    controlsBody.append(createSlider({ labelKey: 'ctl.t', min: 1, max: 60, step: 1, value: st.tH, unit: 's', onInput: (v) => { st.tH = v; restart(); refresh(); } }).root);
    ui.go = createButton({ labelKey: 'ctl.switchOn', variant: 'primary', onClick: () => { if (st.done) restart(); st.run = !st.run; refresh(); } });
  } else {
    controlsBody.append(createSlider({ labelKey: 'ctl.t', min: 10, max: 120, step: 10, value: st.tM, unit: 's', onInput: (v) => { st.tM = v; restart(); refresh(); } }).root);
    ui.go = createButton({ labelKey: 'ctl.switchOn', variant: 'primary', onClick: () => { if (st.done) restart(); st.run = !st.run; refresh(); } });
  }
  const rec = createButton({ labelKey: 'ctl.record', variant: 'secondary', onClick: () => {
    if (!st.done) { st.fb = { type: 'warn', key: st.mode === 'carbon' ? 'fb.burnFirst' : 'fb.runFirst' }; refresh(); return; }
    st.rows.push({ mode: st.mode, n: st.n, t: st.mode === 'heater' ? st.tH : st.tM }); st.fb = null; refresh();
  } });
  controlsBody.append(btnRow(ui.go, rec), hint(`hint.${st.mode}`), resetBtn('chemelec'));
  tableBlock(st);
}
function updateChemElec() {
  const st = S.chemelec;
  const rs = st.rows.filter((r) => r.mode === st.mode);
  if (st.mode === 'carbon') {
    setGo(ui.go, st.done ? 'ctl.again' : st.run ? 'ctl.burning' : 'ctl.burn');
    ui.go.disabled = st.run;
    measRows(ui.dl, [[t('m.n'), qty(st.n, 0, 'mol')], [t('m.mC'), qty(12 * st.n, 0, 'g')], [t('m.perMol'), qty(Q_C, 0, 'kJ')]]);
    renderTable(st, ['col.n', 'col.Q'], (r) => el('tr', {}, [el('td', {}, num(r.n, 0)),
      calcCell(r, 'Q', { expected: Q_C * r.n, decimals: 0, tol: 0.5, onCheck: cbOf(st, 'fb.QOk', 'fb.QWrong') })]), rs);
    return;
  }
  setGo(ui.go, st.run ? 'ctl.pause' : st.done ? 'ctl.again' : st.time > 0 ? 'ctl.continue' : 'ctl.switchOn');
  const motor = st.mode === 'motor', I = motor ? MOTOR.I : HEATER_I;
  const rows = [[t('m.V'), qty(MAINS, 0, 'V')], [t('m.I'), qty(st.run || st.done ? I : 0, 0, 'A')], [t('m.t'), qty(st.time, 0, 's')]];
  if (!motor) rows.push([t('m.Q'), qty(I * st.time, 0, 'C')]);
  else rows.push([t('m.Wu'), qty(MOTOR.Pu * st.time, 0, 'J')]);
  measRows(ui.dl, rows);
  if (!motor) {
    renderTable(st, ['col.V', 'col.Qc', 'col.Wel'], (r) => el('tr', {}, [el('td', {}, num(MAINS, 0)), el('td', {}, num(HEATER_I * r.t, 0)),
      calcCell(r, 'W', { expected: MAINS * HEATER_I * r.t, decimals: 0, tol: 0.5, onCheck: cbOf(st, 'fb.WelOk', 'fb.WelWrong') })]), rs);
  } else {
    renderTable(st, ['col.I', 'col.t', 'col.QIt', 'col.Wel', 'col.Wu', 'col.heatJ'], (r) => {
      const Q = MOTOR.I * r.t, We = MAINS * Q, Wu = MOTOR.Pu * r.t;
      return el('tr', {}, [el('td', {}, num(MOTOR.I, 0)), el('td', {}, num(r.t, 0)),
        calcCell(r, 'Q', { expected: Q, decimals: 0, tol: 0.5, onCheck: cbOf(st, 'fb.QItOk', 'fb.QItWrong') }),
        calcCell(r, 'W', { expected: We, decimals: 0, tol: 0.5, disabled: !calcDone(r, 'Q'), onCheck: cbOf(st, 'fb.WelOk', 'fb.WelWrong') }),
        el('td', {}, num(Wu, 0)),
        calcCell(r, 'H', { expected: We - Wu, decimals: 0, tol: 1, disabled: !calcDone(r, 'W'), onCheck: cbOf(st, 'fb.heatOk', 'fb.heatWrong') })]);
    }, rs);
  }
}

/* ---------- Tab 3 ---------- */
function buildMass() {
  const st = S.mass;
  controlsBody.append(createSegmented({ labelKey: 'ctl.object', options: Object.keys(OBJECTS).map((v) => ({ value: v, labelKey: `obj.${v}` })), value: st.obj, onChange: (v) => { st.obj = v; refresh(); } }).root,
    btnRow(createButton({ labelKey: 'ctl.record', variant: 'primary', onClick: () => { st.rows.push({ obj: st.obj }); st.fb = null; refresh(); } })), hint('hint.mass'), resetBtn('mass'));
  tableBlock(st);
}
function updateMass() {
  const st = S.mass, m = OBJECTS[st.obj];
  measRows(ui.dl, [[t('m.m'), `${st.obj === 'proton' ? sci(m, 2) : num(m, m < 0.01 ? 3 : 1)} kg`], [t('m.c'), `${sci(C_LIGHT, 0)} m/s`]]);
  renderTable(st, ['col.obj', 'col.mkg', 'col.Emant', 'col.Epow'], (r) => {
    const mm = OBJECTS[r.obj], E = mm * C_LIGHT ** 2, { m: man, e } = sciParts(E);
    return el('tr', {}, [el('td', {}, t(`obj.${r.obj}`)), el('td', {}, r.obj === 'proton' ? sci(mm, 2) : num(mm, mm < 0.01 ? 3 : 1)),
      calcCell(r, 'E', { expected: man, decimals: 2, onCheck: cbOf(st, 'fb.EOk', 'fb.EWrong') }), el('td', {}, `× 10${sup(e)} J`)]);
  });
}

/* ---------- Tab 4 ---------- */
function buildConversions() {
  const st = S.conversions;
  controlsBody.append(modeControl('conversions').root);
  if (st.mode === 'lamp') controlsBody.append(createSlider({ labelKey: 'ctl.Ein', min: 100, max: 1000, step: 100, value: st.Ein, unit: 'J', onInput: (v) => { st.Ein = v; refresh(); } }).root);
  if (st.mode !== 'food') controlsBody.append(btnRow(createButton({ labelKey: 'ctl.record', variant: 'primary', onClick: () => { st.rows.push({ mode: st.mode, Ein: st.Ein }); st.fb = null; refresh(); } })));
  controlsBody.append(hint(`hint.${st.mode}`), resetBtn('conversions'));
  tableBlock(st);
}
function updateConversions() {
  const st = S.conversions;
  if (st.mode === 'food') { measRows(ui.dl, [[t('m.chain'), t('m.chainFood')]]); renderTable(st, [], () => el('tr'), []); return; }
  const ch = chainOf(st);
  const rows = [[t(`form.${ch.input.form}`), qty(ch.input.value, 0, 'J')]];
  ch.out.filter((o) => o.form !== 'heat').forEach((o) => rows.push([t(`form.${o.form}`), qty(o.value, 0, 'J')]));
  measRows(ui.dl, rows);
  const rs = st.rows.filter((r) => r.mode === st.mode);
  if (st.mode === 'bullet') {
    renderTable(st, ['col.mBullet', 'col.vBullet', 'col.KEb', 'col.heatJ'], (r) => el('tr', {}, [el('td', {}, num(20, 0)), el('td', {}, num(500, 0)),
      calcCell(r, 'K', { expected: 2500, decimals: 0, tol: 0.5, onCheck: cbOf(st, 'fb.KEbOk', 'fb.KEbWrong') }),
      calcCell(r, 'H', { expected: 2500, decimals: 0, tol: 0.5, disabled: !calcDone(r, 'K'), onCheck: cbOf(st, 'fb.heatOk', 'fb.heatWrong') })]), rs);
  } else {
    renderTable(st, ['col.Ein', 'col.useful', 'col.heatJ'], (r) => {
      const c = chainOf({ ...st, Ein: r.Ein }), useful = c.out.filter((o) => o.form !== 'heat').reduce((s, o) => s + o.value, 0);
      return el('tr', {}, [el('td', {}, num(c.input.value, 0)), el('td', {}, num(useful, 0)),
        calcCell(r, 'H', { expected: c.input.value - useful, decimals: 0, tol: 0.5, onCheck: cbOf(st, 'fb.heatOk', 'fb.heatWrong') })]);
    }, rs);
  }
}

/* ---------- Tab switching ---------- */
function buildTab(id) {
  controlsBody.replaceChildren();
  measuresBody.replaceChildren();
  ui = {};
  tableSig = '';
  ({ thermal: buildThermal, chemelec: buildChemElec, mass: buildMass, conversions: buildConversions })[id]();
  loop.start();
  shell?.refreshActivity();
  refresh();
}
function updateMeasures() {
  if (!shell || !ui.dl) return;
  ({ thermal: updateThermal, chemelec: updateChemElec, mass: updateMass, conversions: updateConversions })[shell.tab]();
}
function refresh() { updateMeasures(); requestDraw(); }
function resetTab(id) { const mode = S[id].mode; S[id] = { ...initialState(id), mode }; buildTab(id); }
onLangChange(() => { if (shell) buildTab(shell.tab); });
shell = initSim({
  strings,
  tabs: TABS.map((id) => ({ id, labelKey: `tab.${id}` })),
  initialTab: 'thermal',
  onTab: buildTab,
  activityKey: (tab) => `act.${tab}.${S[tab].mode}`,
});
shell.start();
if (DEBUG) window.__sim = { get S() { return S; }, heatState, E_TOT };
