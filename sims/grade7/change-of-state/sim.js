// Grade 7 — Change of state (Ch.8 Act. 1–6, Ex. 4, 6, 9, 10)
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num, qty } from '../../../shared/format.js';
import { createButton, createSegmented, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, font, arrow } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { thermoGeom, drawThermometer, drawBunsen } from '../../../shared/thermo-draw.js';
import { drawDigitalBalance } from '../../../shared/lab-draw.js';
import { label } from '../../../shared/figures.js';

const TA = 22; // °C, room
const SCENE = { w: 600, h: 440 };
const BENCH = 430;
const C_ICE = 2.1, C_WATER = 4.18, L_FUS = 334, L_VAP = 2260; // J/(g·°C), J/g
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmtTime = (s) => `${Math.floor(s / 60)} min ${String(Math.floor(s % 60)).padStart(2, '0')} s`;
const fmtHours = (s) => `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')} min`;

/* ================================================================
   Models
   ================================================================ */
// Ice ⇄ water in contact with a medium at Tenv through a conductance K (W/°C). f = fraction of liquid.
const SETUPS = {
  bath: { m: 100, T0: -10, f0: 0, Tenv: 40, K: 1.5, speed: 20 }, // Act. 1: ice in a beaker in warm water
  air: { m: 50, T0: -4, f0: 0, Tenv: 20, K: 0.25, speed: 120 }, // Ex. 10: ice in a cup in the classroom
  cold: { m: 20, T0: 14, f0: 1, Tenv: -15, K: 0.25, speed: 30 }, // Act. 2: water in a test tube in a cooling mixture
};
function phaseStep(st, dt) {
  let Q = st.K * (st.Tenv - st.T) * dt; // J received
  const melting = (st.f < 1 && st.T >= 0 && Q > 0) || (st.f > 0 && st.T <= 0 && Q < 0);
  if (melting) { st.T = 0; st.f = clamp(st.f + Q / (st.m * L_FUS), 0, 1); return; }
  const c = st.f >= 1 ? C_WATER : st.f <= 0 ? C_ICE : C_WATER;
  const T1 = st.T + Q / (st.m * c);
  // the temperature stops at 0 °C while the change of state is not finished
  if (st.f < 1 && st.T < 0 && T1 > 0) st.T = 0;
  else if (st.f > 0 && st.T > 0 && T1 < 0) st.T = 0;
  else st.T = T1;
}
const stateKey = (f) => (f <= 0 ? 'st.solid' : f >= 1 ? 'st.liquid' : 'st.both');

// Boiling (Act. 3–4): flask of water on a flame; Tb from the pressure above the water
const BOIL = { m0: 200, P: 420, kLoss: 1.2, speed: 10 }; // g, W received from the flame, W/°C lost
const Tboil = (p) => 100 + 28.6 * Math.log(p / 1.013); // °C, p in bar (≈ real values near 1 bar)

/* ================================================================
   State
   ================================================================ */
function phaseState(kind) {
  const s = SETUPS[kind];
  return { kind, m: s.m, T: s.T0, f: s.f0, Tenv: s.Tenv, K: s.K, speed: s.speed, time: 0, run: false, rows: [], fb: null };
}
function initialState() {
  return {
    fus: { ...phaseState('bath') },
    sol: { ...phaseState('cold') },
    boil: { T: TA, m: BOIL.m0, time: 0, run: false, flame: false, place: 'sea', closed: false, p: 1.013, plate: false, drops: 0, rows: [], fb: null },
    evap: { exp: 'bottle', bottle: 'fridge', Tb: 5, mist: 0, sandT: 0, lid: false, run: false, time: 0 },
    vol: { exp: 'bottle', full: 'full', f: 0, inFreezer: false, time: 0, broken: false, cupF: 0 },
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
let clock = 0;

function draw() {
  if (!shell) return;
  const ctx = view.begin();
  ctx.fillStyle = cssVar('--bench');
  ctx.fillRect(0, BENCH, SCENE.w, SCENE.h - BENCH);
  const tab = shell.tab;
  if (tab === 'fus') drawFusion(ctx);
  else if (tab === 'sol') drawSolid(ctx);
  else if (tab === 'boil') drawBoil(ctx);
  else if (tab === 'evap') drawEvap(ctx);
  else drawVol(ctx);
  if (DEBUG) { ctx.fillStyle = 'red'; ctx.font = font(11); ctx.textAlign = 'left'; ctx.fillText(JSON.stringify({ T: S[tab]?.T?.toFixed?.(2), f: S[tab]?.f?.toFixed?.(3) }), 6, 14); }
}

/* ---------- common drawing ---------- */
function glassBox(ctx, x0, x1, yTop, yBot, lip = true) {
  ctx.strokeStyle = cssVar('--glass-stroke');
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  if (lip) { ctx.moveTo(x0 - 6, yTop - 3); ctx.lineTo(x0, yTop + 3); } else ctx.moveTo(x0, yTop);
  ctx.lineTo(x0, yBot); ctx.lineTo(x1, yBot); ctx.lineTo(x1, yTop);
  ctx.stroke();
  ctx.fillStyle = cssVar('--glass-shine');
  ctx.fillRect(x1 - 10, yTop + 6, 3, yBot - yTop - 12);
}
function waterRect(ctx, x0, x1, yTop, yBot, alpha = 0.5, color = '--water') {
  if (yBot - yTop < 0.5) return;
  ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = cssVar(color);
  ctx.fillRect(x0, yTop, x1 - x0, yBot - yTop); ctx.restore();
  ctx.strokeStyle = cssVar('--water-dark'); ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.moveTo(x0, yTop); ctx.lineTo(x1, yTop); ctx.stroke();
}
function iceCube(ctx, x, y, s, a = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  ctx.fillStyle = cssVar('--ice'); ctx.strokeStyle = cssVar('--ice-edge'); ctx.lineWidth = 1.2;
  roundRect(ctx, -s / 2, -s / 2, s, s, s * 0.2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillRect(-s * 0.3, -s * 0.3, s * 0.18, s * 0.18);
  ctx.restore();
}
// Graph of the student's readings θ(t)
const GR = { x0: 380, y0: 54, w: 196, h: 160 };
function drawReadingsGraph(ctx, st, { Tmin, Tmax, tMin }) {
  const g = GR;
  const lastT = st.rows.length ? st.rows[st.rows.length - 1].t : 0;
  const tMax = Math.max(tMin, Math.ceil((Math.max(lastT, st.time) + 1) / (tMin / 2)) * (tMin / 2)) ;
  const X = (s) => g.x0 + (s / tMax) * g.w;
  const Y = (T) => g.y0 + g.h - ((T - Tmin) / (Tmax - Tmin)) * g.h;
  ctx.fillStyle = cssVar('--surface');
  ctx.fillRect(g.x0, g.y0, g.w, g.h);
  ctx.strokeStyle = cssVar('--border'); ctx.lineWidth = 1;
  ctx.font = font(10); ctx.fillStyle = cssVar('--muted');
  const stepT = (Tmax - Tmin) > 60 ? 20 : 5;
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let T = Math.ceil(Tmin / stepT) * stepT; T <= Tmax; T += stepT) {
    ctx.beginPath(); ctx.moveTo(g.x0, Y(T)); ctx.lineTo(g.x0 + g.w, Y(T)); ctx.stroke();
    ctx.fillText(num(T), g.x0 - 4, Y(T));
  }
  const stepS = tMax / 5;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let s = 0; s <= tMax + 1e-6; s += stepS) { ctx.beginPath(); ctx.moveTo(X(s), g.y0); ctx.lineTo(X(s), g.y0 + g.h); ctx.stroke(); ctx.fillText(num(s / 60), X(s), g.y0 + g.h + 4); }
  ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(g.x0, g.y0); ctx.lineTo(g.x0, g.y0 + g.h); ctx.lineTo(g.x0 + g.w, g.y0 + g.h); ctx.stroke();
  if (Tmin < 0) { ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(g.x0, Y(0)); ctx.lineTo(g.x0 + g.w, Y(0)); ctx.stroke(); }
  ctx.fillStyle = cssVar('--text'); ctx.font = font(11, 700);
  ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText('θ (°C)', g.x0 + 4, g.y0 - 4);
  ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText('t (min)', g.x0 + g.w, g.y0 + g.h + 18);
  if (st.rows.length) {
    ctx.strokeStyle = cssVar('--thermo-red'); ctx.lineWidth = 2;
    ctx.beginPath();
    st.rows.forEach((r, i) => { if (i === 0) ctx.moveTo(X(r.t), Y(r.T)); else ctx.lineTo(X(r.t), Y(r.T)); });
    ctx.stroke();
    ctx.fillStyle = cssVar('--thermo-red');
    for (const r of st.rows) { ctx.beginPath(); ctx.arc(X(r.t), Y(r.T), 3.5, 0, Math.PI * 2); ctx.fill(); }
  } else {
    label(ctx, t('lbl.noReadings'), g.x0 + g.w / 2, g.y0 + g.h / 2, { size: 11, color: cssVar('--muted') });
  }
  label(ctx, `t = ${fmtTime(st.time)}`, g.x0 + g.w / 2, g.y0 + g.h + 46, { size: 16, weight: 800 });
}

/* ---------- Tab 1: fusion of ice (Act. 1, Ex. 10) ---------- */
const FB = { x0: 120, x1: 250, yTop: 210, yBot: 404 }; // beaker
const BATH = { x0: 60, x1: 320, yTop: 270, yBot: 420 };
const FTH = thermoGeom({ x: 214, yBulb: 390, yTop: 30, t0: -20, t1: 50, y0: 370, y1: 90, bulbR: 7, stemW: 6 });
const CUBES = [[0.2, 0.1, 0.2], [0.5, 0.05, -0.3], [0.78, 0.12, 0.25], [0.32, 0.4, -0.1], [0.66, 0.42, 0.4], [0.18, 0.7, 0.3], [0.5, 0.72, -0.2], [0.82, 0.72, 0.1], [0.35, 0.95, 0.2], [0.68, 0.96, -0.35]];

function drawIceInBeaker(ctx, st, b, scale = 1) {
  const H = b.yBot - b.yTop;
  const waterH = st.f * H * 0.55 * scale;
  const yW = b.yBot - waterH;
  waterRect(ctx, b.x0 + 1, b.x1 - 1, yW, b.yBot - 1, 0.5);
  // pieces of ice: fewer and smaller as they melt; they float on the water
  const n = Math.ceil(CUBES.length * (1 - st.f));
  const s = 24 * (0.55 + 0.45 * (1 - st.f));
  const pileTop = b.yBot - H * 0.55;
  for (let i = 0; i < n; i++) {
    const [fx, fy, a] = CUBES[i];
    const x = b.x0 + 14 + fx * (b.x1 - b.x0 - 28);
    let y = b.yBot - 14 - (1 - fy) * (b.yBot - pileTop - 28);
    if (st.f > 0) y = Math.min(y, yW + 4 + fy * 22); // float
    iceCube(ctx, x, y, s, a);
  }
}
function drawFusion(ctx) {
  const st = S.fus;
  if (st.kind === 'bath') {
    // vessel of warm water (cuvette) around the beaker
    waterRect(ctx, BATH.x0 + 1, BATH.x1 - 1, BATH.yTop + 12, BATH.yBot - 1, 0.35);
    label(ctx, t('lbl.warmWater', { T: num(st.Tenv) }), BATH.x0, BATH.yTop - 12, { size: 12, weight: 700, align: 'left' });
  }
  drawIceInBeaker(ctx, st, FB);
  drawThermometer(ctx, FTH, { T: st.T, liquid: 'alcohol', plate: false, scale: { minor: 1, mid: 5, major: 10, label: 10 }, unit: '°C' });
  glassBox(ctx, FB.x0, FB.x1, FB.yTop, FB.yBot);
  if (st.kind === 'bath') glassBox(ctx, BATH.x0, BATH.x1, BATH.yTop, BATH.yBot, false);
  else label(ctx, t('lbl.roomAir', { T: num(st.Tenv) }), 330, 380, { size: 12, weight: 700, color: cssVar('--muted') });
  drawReadingsGraph(ctx, st, { Tmin: -20, Tmax: st.kind === 'bath' ? 50 : 30, tMin: st.kind === 'bath' ? 1200 : 4800 });
}

/* ---------- Tab 2: solidification of water (Act. 2) ---------- */
const TUBE = { cx: 190, w: 40, yTop: 250, yBot: 408 };
const MIX = { x0: 100, x1: 280, yTop: 300, yBot: 424 };
const STH = thermoGeom({ x: 190, yBulb: 392, yTop: 30, t0: -20, t1: 30, y0: 236, y1: 62, bulbR: 6, stemW: 5 });
const MIX_DOTS = Array.from({ length: 160 }, (_, i) => [(i * 0.618) % 1, (i * 0.377 + 0.13) % 1, 2 + (i % 3)]);
function drawSolid(ctx) {
  const st = S.sol;
  // cooling mixture: crushed ice and salt
  ctx.save(); ctx.globalAlpha = 0.6; ctx.fillStyle = cssVar('--ice');
  ctx.fillRect(MIX.x0 + 1, MIX.yTop + 16, MIX.x1 - MIX.x0 - 2, MIX.yBot - MIX.yTop - 17); ctx.restore();
  ctx.fillStyle = cssVar('--ice-edge');
  for (const [fx, fy, r] of MIX_DOTS) { ctx.beginPath(); ctx.arc(MIX.x0 + 6 + fx * (MIX.x1 - MIX.x0 - 12), MIX.yTop + 22 + fy * (MIX.yBot - MIX.yTop - 28), r, 0, Math.PI * 2); ctx.fill(); }
  label(ctx, t('lbl.mixture'), MIX.x1 + 8, MIX.yBot - 30, { size: 12, weight: 700, align: 'left' });
  // test tube with water; ice grows from the wall towards the middle
  const x0 = TUBE.cx - TUBE.w / 2, x1 = TUBE.cx + TUBE.w / 2;
  const yW = 300;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x0, TUBE.yTop); ctx.lineTo(x0, TUBE.yBot - TUBE.w / 2); ctx.arc(TUBE.cx, TUBE.yBot - TUBE.w / 2, TUBE.w / 2, Math.PI, 0, true); ctx.lineTo(x1, TUBE.yTop);
  ctx.closePath();
  ctx.fillStyle = cssVar('--scene-bg'); ctx.fill();
  ctx.clip();
  waterRect(ctx, x0, x1, yW, TUBE.yBot + 2, 0.45);
  const ice = 1 - st.f;
  if (ice > 0) {
    ctx.fillStyle = cssVar('--ice'); ctx.globalAlpha = 0.95;
    const th = (TUBE.w / 2) * ice;
    ctx.fillRect(x0, yW - 3 * ice, th, TUBE.yBot - yW + 3 * ice);
    ctx.fillRect(x1 - th, yW - 3 * ice, th, TUBE.yBot - yW + 3 * ice);
    ctx.fillRect(x0, TUBE.yBot - th * 1.6, TUBE.w, th * 1.6);
    if (ice > 0.98) ctx.fillRect(x0, yW - 4, TUBE.w, TUBE.yBot - yW + 4); // all ice, a little higher than the water was
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  ctx.strokeStyle = cssVar('--glass-stroke'); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x0, TUBE.yTop); ctx.lineTo(x0, TUBE.yBot - TUBE.w / 2); ctx.arc(TUBE.cx, TUBE.yBot - TUBE.w / 2, TUBE.w / 2, Math.PI, 0, true); ctx.lineTo(x1, TUBE.yTop); ctx.stroke();
  glassBox(ctx, MIX.x0, MIX.x1, MIX.yTop, MIX.yBot);
  // thermometer in the tube; its graduations are above the tube
  drawThermometer(ctx, STH, { T: st.T, liquid: 'alcohol', plate: false, scale: { minor: 1, mid: 5, major: 10, label: 10 }, unit: '°C' });
  drawReadingsGraph(ctx, st, { Tmin: -20, Tmax: 20, tMin: 2400 });
}

/* ---------- Tab 3: boiling (Act. 3–4) ---------- */
const FL = { cx: 200, cy: 300, r: 72, neckW: 34, neckTop: 160 };
const BTH = thermoGeom({ x: 200, yBulb: 320, yTop: 24, t0: 0, t1: 110, y0: 280, y1: 60, bulbR: 6, stemW: 5 });
let bubbles = [];
function flaskPath(ctx) {
  const { cx, cy, r, neckW, neckTop } = FL;
  const a = Math.asin(neckW / 2 / r);
  ctx.beginPath();
  ctx.moveTo(cx - neckW / 2, neckTop);
  ctx.lineTo(cx - neckW / 2, cy - r * Math.cos(a));
  ctx.arc(cx, cy, r, -Math.PI / 2 - a, -Math.PI / 2 + a, true);
  ctx.lineTo(cx + neckW / 2, neckTop);
}
function boilWaterY(st) { return FL.cy - FL.r * 0.15 + (1 - st.m / BOIL.m0) * FL.r * 0.9; }
function drawBoil(ctx) {
  const st = S.boil;
  // tripod
  ctx.strokeStyle = cssVar('--lever'); ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(120, BENCH); ctx.lineTo(134, 378); ctx.moveTo(280, BENCH); ctx.lineTo(266, 378); ctx.stroke();
  ctx.fillStyle = cssVar('--box'); ctx.fillRect(120, 374, 160, 5);
  drawBunsen(ctx, { x: FL.cx, yBench: BENCH, h: 40, on: st.flame, t: clock, scale: 0.75 });
  // water in the flask
  ctx.save();
  flaskPath(ctx); ctx.closePath(); ctx.clip();
  const yW = boilWaterY(st);
  waterRect(ctx, FL.cx - FL.r, FL.cx + FL.r, yW, FL.cy + FL.r, 0.5);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.3;
  for (const b of bubbles) { if (b.y < yW) continue; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke(); }
  ctx.restore();
  ctx.strokeStyle = cssVar('--glass-stroke'); ctx.lineWidth = 2.2;
  flaskPath(ctx); ctx.stroke();
  // stopper
  if (st.closed) {
    ctx.fillStyle = cssVar('--wood');
    roundRect(ctx, FL.cx - FL.neckW / 2 - 3, FL.neckTop - 10, FL.neckW + 6, 22, 3); ctx.fill();
  }
  drawThermometer(ctx, BTH, { T: st.T, liquid: 'alcohol', plate: false, scale: { minor: 1, mid: 5, major: 10, label: 10 }, unit: '°C' });
  // vapour leaving the open flask, droplets on a cold plate
  const boiling = isBoiling(st);
  if (boiling && !st.closed) {
    ctx.strokeStyle = cssVar('--muted'); ctx.globalAlpha = 0.5; ctx.lineWidth = 1.5;
    for (let i = 0; i < 2; i++) {
      const x = FL.cx - 8 + i * 16;
      ctx.beginPath();
      for (let k = 0; k <= 10; k++) { const y = FL.neckTop - 4 - k * 4; const xx = x + Math.sin(clock * 3 + k * 0.6 + i * 2) * 4; if (k === 0) ctx.moveTo(xx, y); else ctx.lineTo(xx, y); }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  if (st.plate) {
    ctx.fillStyle = cssVar('--pan-metal');
    roundRect(ctx, FL.cx + 44, 96, 110, 8, 3); ctx.fill();
    label(ctx, t('lbl.coldPlate'), FL.cx + 99, 84, { size: 11 });
    ctx.fillStyle = cssVar('--water');
    const n = Math.floor(st.drops);
    for (let i = 0; i < n; i++) { const x = FL.cx + 50 + ((i * 37) % 100); const r = 2 + (i % 3); ctx.beginPath(); ctx.arc(x, 106 + r, r, 0, Math.PI * 2); ctx.fill(); }
  }
  if (st.closed) label(ctx, t('lbl.pressure', { p: num(st.p, 2) }), FL.cx + 40, 22, { size: 12, weight: 700, color: cssVar('--bad'), align: 'left' });
  drawReadingsGraph(ctx, st, { Tmin: 0, Tmax: 110, tMin: 600 });
}
const isBoiling = (st) => st.flame && st.T >= Tboil(st.p) - 0.05;

/* ---------- Tab 4: evaporation (Act. 5, Ex. 6) ---------- */
const DEW = 12; // °C: below this, water vapour of the air condenses on the bottle
const BOT = { cx: 200, yBot: BENCH, w: 90, h: 230 };
const DROP_POS = Array.from({ length: 140 }, (_, i) => [(i * 0.618) % 1, (i * 0.414 + 0.2) % 1, 1.4 + (i % 3) * 0.7]);
function drawEvap(ctx) {
  const st = S.evap;
  if (st.exp === 'bottle') {
    const { cx, yBot, w, h } = BOT;
    const x0 = cx - w / 2, yTop = yBot - h;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x0, yBot); ctx.lineTo(x0, yTop + 70); ctx.quadraticCurveTo(x0, yTop + 40, cx - 16, yTop + 26); ctx.lineTo(cx - 16, yTop); ctx.lineTo(cx + 16, yTop); ctx.lineTo(cx + 16, yTop + 26); ctx.quadraticCurveTo(x0 + w, yTop + 40, x0 + w, yTop + 70); ctx.lineTo(x0 + w, yBot); ctx.closePath();
    ctx.fillStyle = cssVar('--glass-fill'); ctx.fill();
    ctx.strokeStyle = cssVar('--glass-stroke'); ctx.lineWidth = 2.2; ctx.stroke();
    ctx.clip();
    waterRect(ctx, x0, x0 + w, yTop + 60, yBot, st.bottle === 'fridge' ? 0.65 : 0.45);
    // droplets of water (mist) on the outside walls
    const n = Math.floor(DROP_POS.length * st.mist);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.strokeStyle = cssVar('--water-dark'); ctx.lineWidth = 0.7;
    for (let i = 0; i < n; i++) { const [fx, fy, r] = DROP_POS[i]; const x = x0 + 4 + fx * (w - 8), y = yTop + 70 + fy * (h - 80); ctx.beginPath(); ctx.arc(x, y, r * (0.6 + st.mist * 0.6), 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    ctx.restore();
    ctx.fillStyle = cssVar('--box'); ctx.fillRect(cx - 18, yTop - 12, 36, 14);
    if (st.mist > 0.05) {
      ctx.strokeStyle = cssVar('--o2'); ctx.fillStyle = cssVar('--o2'); ctx.lineWidth = 2;
      arrow(ctx, cx + 140, yTop + 120, x0 + w + 8, yTop + 120, 8);
      label(ctx, t('lbl.vapourAir'), cx + 150, yTop + 100, { size: 12, weight: 700, align: 'left', color: cssVar('--o2') });
    }
    label(ctx, `${t('lbl.bottleT')} ${qty(st.Tb, 0, '°C')}`, cx, yTop - 30, { size: 13, weight: 800 });
    label(ctx, t('lbl.roomAir', { T: num(TA) }), 470, 60, { size: 12, color: cssVar('--muted') });
  } else {
    // wet sand on a digital balance (Ex. 6)
    const m = sandMass(st);
    drawDigitalBalance(ctx, { cx: 300, plateY: 300, bench: BENCH, value: m, zeroLabel: t('lbl.zero') });
    const dry = 1 - (m - 284) / 32;
    ctx.fillStyle = cssVar('--sand');
    ctx.beginPath(); ctx.moveTo(220, 300); ctx.quadraticCurveTo(300, 210, 380, 300); ctx.closePath(); ctx.fill();
    ctx.fillStyle = `rgba(60,40,20,${0.45 * (1 - dry)})`; ctx.fill();
    if (st.lid) { ctx.strokeStyle = cssVar('--glass-stroke'); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(300, 300, 96, Math.PI, 0); ctx.stroke(); label(ctx, t('lbl.lid'), 300, 194, { size: 11 }); }
    else if (st.run && dry < 0.98) { // vapour leaving the surface
      ctx.strokeStyle = cssVar('--muted'); ctx.globalAlpha = 0.45; ctx.lineWidth = 1.3;
      for (let i = 0; i < 3; i++) { const x = 266 + i * 34; ctx.beginPath(); for (let k = 0; k <= 8; k++) { const y = 232 - k * 4; const xx = x + Math.sin(clock * 2 + k + i) * 3; if (k === 0) ctx.moveTo(xx, y); else ctx.lineTo(xx, y); } ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    label(ctx, `${t('lbl.after')} ${fmtHours(st.sandT)}`, 300, 120, { size: 16, weight: 800 });
  }
}
const sandMass = (st) => 284 + 32 * Math.exp(-st.sandT / (4 * 3600));

/* ---------- Tab 5: change of volume (Act. 6, Ex. 4) ---------- */
function iceBlock(ctx, x, w, yTop, yBot) {
  if (yBot - yTop < 0.5) return;
  ctx.fillStyle = cssVar('--ice');
  ctx.fillRect(x, yTop, w, yBot - yTop);
  ctx.strokeStyle = cssVar('--ice-edge'); ctx.lineWidth = 1.2;
  ctx.strokeRect(x + 0.6, yTop + 0.6, w - 1.2, yBot - yTop - 1.2);
  ctx.globalAlpha = 0.6;
  for (let y = yTop + 10; y < yBot - 4; y += 14) { ctx.beginPath(); ctx.moveTo(x + 6, y); ctx.lineTo(x + w * 0.35, y + 5); ctx.moveTo(x + w * 0.55, y + 7); ctx.lineTo(x + w - 8, y + 2); ctx.stroke(); }
  ctx.globalAlpha = 1;
}
function drawVol(ctx) {
  const st = S.vol;
  // freezer
  const fz = { x0: 30, x1: st.exp === 'cup' ? 250 : 330, yTop: 40, yBot: BENCH };
  ctx.fillStyle = cssVar('--surface-2');
  ctx.fillRect(fz.x0, fz.yTop, fz.x1 - fz.x0, fz.yBot - fz.yTop);
  ctx.strokeStyle = cssVar('--o2'); ctx.lineWidth = 3;
  ctx.strokeRect(fz.x0, fz.yTop, fz.x1 - fz.x0, fz.yBot - fz.yTop);
  label(ctx, t('lbl.freezer'), (fz.x0 + fz.x1) / 2, fz.yTop + 18, { size: 12, weight: 800, color: cssVar('--o2') });
  if (st.exp === 'bottle') {
    const cx = 185, yBot = BENCH - 4, w = 80, h = 250, x0 = cx - w / 2, yTop = yBot - h;
    const water = st.full === 'full' ? yTop + 34 : yTop + 110;
    const iceUp = (st.full === 'full' ? 0 : 0.09 * (yBot - water)) * st.f; // the ice takes more room than the water
    ctx.save();
    ctx.beginPath(); ctx.moveTo(x0, yBot); ctx.lineTo(x0, yTop + 60); ctx.quadraticCurveTo(x0, yTop + 34, cx - 14, yTop + 22); ctx.lineTo(cx - 14, yTop); ctx.lineTo(cx + 14, yTop); ctx.lineTo(cx + 14, yTop + 22); ctx.quadraticCurveTo(x0 + w, yTop + 34, x0 + w, yTop + 60); ctx.lineTo(x0 + w, yBot); ctx.closePath();
    ctx.fillStyle = cssVar('--glass-fill'); ctx.fill(); ctx.clip();
    const yIce = yBot - (yBot - water) * st.f - iceUp;
    waterRect(ctx, x0, x0 + w, water, yBot, 0.5);
    if (st.f > 0) iceBlock(ctx, x0, w, yIce, yBot);
    ctx.restore();
    if (st.full === 'part' && st.f > 0) { // level of the water before freezing
      ctx.save(); ctx.setLineDash([5, 4]); ctx.strokeStyle = cssVar('--water-dark'); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x0 - 30, water); ctx.lineTo(x0 + w + 30, water); ctx.stroke(); ctx.restore();
      label(ctx, t('lbl.levelBefore'), x0 + w + 34, water, { size: 11, align: 'left', color: cssVar('--water-dark') });
    }
    ctx.strokeStyle = cssVar('--glass-stroke'); ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(x0, yBot); ctx.lineTo(x0, yTop + 60); ctx.quadraticCurveTo(x0, yTop + 34, cx - 14, yTop + 22); ctx.lineTo(cx - 14, yTop); ctx.moveTo(cx + 14, yTop); ctx.lineTo(cx + 14, yTop + 22); ctx.quadraticCurveTo(x0 + w, yTop + 34, x0 + w, yTop + 60); ctx.lineTo(x0 + w, yBot); ctx.lineTo(x0, yBot); ctx.stroke();
    ctx.fillStyle = cssVar('--box'); ctx.fillRect(cx - 16, yTop - 12, 32, 14); // cap
    if (st.broken) {
      ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x0 + 6, yTop + 90); ctx.lineTo(x0 + 26, yTop + 120); ctx.lineTo(x0 + 14, yTop + 150); ctx.lineTo(x0 + 36, yTop + 190);
      ctx.moveTo(x0 + w - 4, yTop + 70); ctx.lineTo(x0 + w - 24, yTop + 110); ctx.lineTo(x0 + w - 12, yTop + 140);
      ctx.moveTo(cx - 14, yTop + 10); ctx.lineTo(cx + 4, yTop + 30); ctx.lineTo(cx - 6, yTop + 50);
      ctx.stroke();
      label(ctx, t('lbl.broken'), cx, yTop - 30, { size: 14, weight: 800, color: cssVar('--bad') });
    }
  } else {
    // 100 cm³ of water in a graduated plastic cup: in the freezer, or out of it on a digital balance (Ex. 4)
    let x0 = 95, yBot = BENCH - 4;
    if (!st.inFreezer) { drawDigitalBalance(ctx, { cx: 440, plateY: 330, bench: BENCH, value: 100.0, zeroLabel: t('lbl.zero'), plateW: 160 }); x0 = 395; yBot = 328; }
    const x1 = x0 + 90, per = 1.6; // px per cm³
    const V = 100 + 9 * st.cupF;
    const yL = yBot - V * per;
    waterRect(ctx, x0, x1, yBot - 100 * per * (1 - st.cupF), yBot, 0.5);
    if (st.cupF > 0) iceBlock(ctx, x0 + 1, x1 - x0 - 2, yL, yBot - 100 * per * (1 - st.cupF)); // the ice forms at the top
    glassBox(ctx, x0, x1, yBot - 125 * per, yBot, false);
    ctx.strokeStyle = cssVar('--scale'); ctx.fillStyle = cssVar('--scale'); ctx.font = font(10, 700); ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineWidth = 1;
    for (let v = 0; v <= 120; v += 10) { const y = yBot - v * per; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + (v % 50 === 0 ? 14 : 8), y); ctx.stroke(); if (v % 20 === 0 && v) ctx.fillText(String(v), x0 + 16, y); }
    ctx.fillText('cm³', x0 + 34, yBot - 125 * per - 10);
  }
  // readings on the right
  const lines = st.exp === 'bottle'
    ? [`${t('lbl.time')} ${fmtHours(st.time)}`, t(stateKey(1 - st.f))]
    : [`${t('lbl.time')} ${fmtHours(st.time)}`, `V = ${qty(100 + 9 * st.cupF, 0, 'cm³')}`, `m = ${qty(100, 1, 'g')}`];
  const lx = st.exp === 'cup' ? 440 : 470, ly = st.exp === 'cup' ? 26 : 150;
  lines.forEach((s, i) => label(ctx, s, lx, ly + i * 28, { size: 15, weight: 800 }));
}

/* ================================================================
   Animation loop
   ================================================================ */
let measT = 0;
const loop = createLoop({
  dt: 1 / 60,
  step: (dt) => {
    clock += dt;
    if (!shell) return true;
    const tab = shell.tab;
    if (tab === 'fus' || tab === 'sol') {
      const st = S[tab];
      if (st.run) { const h = dt * st.speed; const n = Math.ceil(h / 2); for (let i = 0; i < n; i++) phaseStep(st, h / n); st.time += h; }
    } else if (tab === 'boil') stepBoil(dt);
    else if (tab === 'evap') stepEvap(dt);
    else stepVol(dt);
    measT += dt;
    return true;
  },
  render: () => { draw(); if (measT > 0.15) { measT = 0; updateMeasures(); } },
});

function stepBoil(dt) {
  const st = S.boil;
  if (st.run) {
    const h = dt * BOIL.speed;
    st.time += h;
    const p0 = st.place === 'sea' ? 1.013 : 0.8;
    const target = st.closed && st.T > 95 ? p0 + 0.2 : p0; // closed flask: the vapour stays inside, the pressure increases
    st.p += (target - st.p) * Math.min(1, h / 40);
    const Tb = Tboil(st.p);
    const Q = ((st.flame ? BOIL.P : 0) - BOIL.kLoss * (st.T - TA)) * h;
    if (st.flame && st.T >= Tb - 0.05 && Q > 0) {
      st.T = Tb;
      if (!st.closed) st.m = Math.max(80, st.m - Q / L_VAP); // the water turns into vapour that leaves the flask
    } else {
      st.T = Math.min(Tb, st.T + Q / (st.m * C_WATER));
    }
    if (st.plate && isBoiling(st) && !st.closed) st.drops = Math.min(40, st.drops + h * 0.25);
  }
  // bubbles: small ones of dissolved air when hot, large ones of vapour when boiling
  const boiling = isBoiling(st) && st.run;
  if (st.run && st.flame && (boiling || st.T > 70) && Math.random() < dt * (boiling ? 30 : 4)) {
    bubbles.push({ x: FL.cx - 40 + Math.random() * 80, y: FL.cy + FL.r - 10, r: boiling ? 3 : 1.2, v: boiling ? 60 + Math.random() * 40 : 20 });
  }
  for (const b of bubbles) { b.y -= b.v * dt; if (boiling) b.r += dt * 4; }
  bubbles = bubbles.filter((b) => b.y > boilWaterY(st) - 2 && b.r < 9);
}
function stepEvap(dt) {
  const st = S.evap;
  if (!st.run) return;
  if (st.exp === 'bottle') {
    const h = dt * 30;
    st.time += h;
    st.Tb += (TA - st.Tb) * (1 - Math.exp(-h / 1500));
    if (st.Tb < DEW) st.mist = Math.min(1, st.mist + h / 240);
    else st.mist = Math.max(0, st.mist - h / 600);
  } else {
    const h = dt * 1800; // 1 s ↔ 30 min
    if (!st.lid) st.sandT = Math.min(24 * 3600, st.sandT + h);
    else st.sandT = st.sandT; // covered: no evaporation, the mass stays the same
    st.time += h;
    if (st.time >= 24 * 3600) st.run = false;
  }
}
function stepVol(dt) {
  const st = S.vol;
  const h = dt * 1200; // 1 s ↔ 20 min
  if (st.inFreezer) {
    st.time += h;
    const rate = h / (3 * 3600); // completely frozen after about 3 h
    if (st.exp === 'bottle') {
      st.f = Math.min(1, st.f + rate);
      if (st.full === 'full' && st.f > 0.85) st.broken = true;
    } else st.cupF = Math.min(1, st.cupF + rate);
  } else if (st.time > 0) {
    const rate = h / (2 * 3600);
    if (st.exp === 'bottle') { if (!st.broken) st.f = Math.max(0, st.f - rate); } else st.cupF = Math.max(0, st.cupF - rate);
    st.time += h;
  }
}

/* ================================================================
   Panels
   ================================================================ */
const controlsBody = document.getElementById('controls-body');
const measuresBody = document.getElementById('measures-body');
let ui = {};
function showStatus(fb) {
  if (!ui.status) return;
  if (!fb) { ui.status.hidden = true; return; }
  ui.status.hidden = false;
  ui.status.className = `status ${fb.type || ''}`;
  ui.status.textContent = t(fb.key, fb.params);
}
function measRows(rows) {
  const sig = JSON.stringify(rows);
  if (ui.dlSig === sig) return;
  ui.dlSig = sig;
  ui.dl.replaceChildren(...rows.flatMap(([k, v, cls]) => [el('dt', {}, k), el('dd', cls ? { class: cls } : {}, v)]));
}
function panel(controls, extra = []) {
  controlsBody.append(...controls);
  ui.dl = el('dl', { class: 'meas' });
  ui.status = el('div', { class: 'status', hidden: '' });
  measuresBody.append(ui.dl, ...extra, ui.status);
}
const resetBtn = (id) => createButton({ labelKey: 'ui.reset', onClick: () => resetTab(id), variant: 'ghost' });
function setLabel(btn, key) { btn.dataset.i18n = key; btn.textContent = t(key); }

// Readings table (time, temperature) shared by the fusion, solidification and boiling tabs
function readingsUI(st) {
  ui.table = el('table', { class: 'data' });
  ui.tableWrap = el('div', { class: 'table-scroll' }, [ui.table]);
  ui.clear = createButton({ labelKey: 'ctl.clearTable', variant: 'ghost', onClick: () => { st.rows = []; ui.tableSig = null; updateMeasures(); } });
  ui.clearRow = el('div', { class: 'btn-row', style: 'margin-top:8px' }, [ui.clear]);
  return [ui.tableWrap, ui.clearRow];
}
function noteReading(st) {
  if (st.time <= 0) { st.fb = { type: 'warn', key: 'fb.notStarted' }; return; }
  const T = Math.round(st.T);
  const last = st.rows[st.rows.length - 1];
  if (last && st.time - last.t < 5) { st.fb = { type: 'warn', key: 'fb.tooSoon' }; return; }
  st.rows.push({ t: st.time, T, state: currentStateKey(st) });
  st.fb = { type: 'good', key: 'fb.noted', params: { t: fmtTime(st.time), T: qty(T, 0, '°C') } };
}
function currentStateKey(st) { return st.f != null ? stateKey(st.f) : isBoiling(st) ? 'st.boiling' : 'st.liquid'; }
function renderReadings(st) {
  const sig = st.rows.length + t('m.tCol');
  if (ui.tableSig !== sig) {
    ui.tableSig = sig;
    const head = el('tr', {}, [el('th', {}, t('m.tCol')), el('th', {}, 'θ (°C)'), el('th', {}, t('m.stateCol'))]);
    const body = st.rows.map((r) => el('tr', {}, [el('td', {}, fmtTime(r.t)), el('td', {}, num(r.T)), el('td', {}, t(r.state))]));
    ui.table.replaceChildren(el('thead', {}, head), el('tbody', {}, body));
    if (ui.tableWrap) ui.tableWrap.scrollTop = ui.tableWrap.scrollHeight;
  }
  ui.tableWrap.hidden = ui.clearRow.hidden = st.rows.length === 0;
}
function runButtons(st, startKey) {
  ui.run = createButton({ labelKey: startKey, variant: 'primary', onClick: () => { st.run = !st.run; if (st.flame !== undefined && st.run) st.flame = true; st.fb = null; refreshRun(st, startKey); } });
  ui.note = createButton({ labelKey: 'ctl.note', variant: 'primary', onClick: () => { noteReading(st); updateMeasures(); } });
  refreshRun(st, startKey);
  return el('div', { class: 'btn-row' }, [ui.run, ui.note]);
}
function refreshRun(st, startKey) { setLabel(ui.run, st.run ? 'ctl.pause' : st.time > 0 ? 'ctl.continue' : startKey); }

/* ---------- fusion ---------- */
function buildFus() {
  const st = S.fus;
  ui.setup = createSegmented({
    labelKey: 'ctl.where', options: [{ value: 'bath', labelKey: 'where.bath' }, { value: 'air', labelKey: 'where.air' }], value: st.kind,
    onChange: (v) => { S.fus = phaseState(v); ui.tableSig = null; shell.refreshActivity(); buildTab('fus'); },
  });
  panel([ui.setup.root, runButtons(st, 'ctl.startFus'), el('p', { class: 'muted', style: 'margin:8px 0 0' }, t(st.kind === 'bath' ? 'hint.speed20' : 'hint.speed120')), el('div', { class: 'btn-row', style: 'margin-top:8px' }, [resetBtn('fus')])], readingsUI(st));
}
function updatePhase(st) {
  measRows([
    [t('m.time'), fmtTime(st.time)],
    [t('m.theta'), qty(st.T, 1, '°C')],
    [t(st === S.sol ? 'm.tube' : 'm.beaker'), t(stateKey(st.f)), st.f > 0 && st.f < 1 ? 'good-text' : ''],
    [t('m.envT'), qty(st.Tenv, 0, '°C')],
  ]);
  renderReadings(st);
  showStatus(st.fb);
}

/* ---------- solidification ---------- */
function buildSol() {
  const st = S.sol;
  panel([runButtons(st, 'ctl.startSol'), el('p', { class: 'muted', style: 'margin:8px 0 0' }, t('hint.speed30')), el('div', { class: 'btn-row', style: 'margin-top:8px' }, [resetBtn('sol')])], readingsUI(st));
}

/* ---------- boiling ---------- */
function buildBoil() {
  const st = S.boil;
  ui.place = createSegmented({
    labelKey: 'ctl.place', options: [{ value: 'sea', labelKey: 'place.sea' }, { value: 'mountain', labelKey: 'place.mountain' }], value: st.place,
    onChange: (v) => { st.place = v; if (!st.closed) st.p = v === 'sea' ? 1.013 : 0.8; },
  });
  ui.stopper = createButton({ labelKey: 'ctl.close', onClick: () => {
    if (!isBoiling(st) && !st.closed) { st.fb = { type: 'warn', key: 'fb.boilFirst' }; updateMeasures(); return; }
    st.closed = !st.closed; st.fb = st.closed ? { type: 'bad', key: 'fb.danger' } : null; setLabel(ui.stopper, st.closed ? 'ctl.open' : 'ctl.close');
  } });
  setLabel(ui.stopper, st.closed ? 'ctl.open' : 'ctl.close');
  ui.plate = createSegmented({
    labelKey: 'ctl.plate', options: [{ value: 'no', labelKey: 'opt.no' }, { value: 'yes', labelKey: 'opt.yes' }], value: st.plate ? 'yes' : 'no',
    onChange: (v) => { st.plate = v === 'yes'; st.drops = 0; },
  });
  panel([runButtons(st, 'ctl.startBoil'), el('p', { class: 'muted', style: 'margin:8px 0 0' }, t('hint.speed10')), ui.place.root, el('div', { class: 'btn-row' }, [ui.stopper, resetBtn('boil')]), ui.plate.root], readingsUI(st));
}
function updateBoil() {
  const st = S.boil;
  measRows([
    [t('m.time'), fmtTime(st.time)],
    [t('m.theta'), qty(st.T, 1, '°C')],
    [t('m.water'), t(isBoiling(st) ? 'st.boiling' : 'st.liquid'), isBoiling(st) ? 'good-text' : ''],
    [t('m.massWater'), qty(Math.round(st.m), 0, 'g')],
    [t('m.pAbove'), qty(st.p, 2, 'bar')],
  ]);
  renderReadings(st);
  showStatus(st.fb);
}

/* ---------- evaporation ---------- */
function buildEvap() {
  const st = S.evap;
  ui.exp = createSegmented({
    labelKey: 'ctl.exp', options: [{ value: 'bottle', labelKey: 'exp.bottle' }, { value: 'sand', labelKey: 'exp.sand' }], value: st.exp,
    onChange: (v) => { S.evap = { ...initialState().evap, exp: v }; shell.refreshActivity(); buildTab('evap'); },
  });
  const ctl = [ui.exp.root];
  if (st.exp === 'bottle') {
    ui.bottle = createSegmented({
      labelKey: 'ctl.bottle', options: [{ value: 'fridge', labelKey: 'bottle.fridge' }, { value: 'room', labelKey: 'bottle.room' }], value: st.bottle,
      onChange: (v) => { st.bottle = v; st.Tb = v === 'fridge' ? 5 : TA; st.mist = 0; st.time = 0; },
    });
    ctl.push(ui.bottle.root);
  } else {
    ui.lid = createSegmented({
      labelKey: 'ctl.lid', options: [{ value: 'no', labelKey: 'opt.no' }, { value: 'yes', labelKey: 'opt.yes' }], value: st.lid ? 'yes' : 'no',
      onChange: (v) => { st.lid = v === 'yes'; },
    });
    ctl.push(ui.lid.root);
  }
  ui.run = createButton({ labelKey: 'ctl.startWait', variant: 'primary', onClick: () => { st.run = !st.run; setLabel(ui.run, st.run ? 'ctl.pause' : 'ctl.continue'); } });
  ctl.push(el('div', { class: 'btn-row' }, [ui.run, resetBtn('evap')]), el('p', { class: 'muted', style: 'margin:8px 0 0' }, t(st.exp === 'bottle' ? 'hint.speed30' : 'hint.speed1800')));
  panel(ctl);
}
function updateEvap() {
  const st = S.evap;
  if (st.exp === 'bottle') {
    measRows([
      [t('m.time'), fmtTime(st.time)],
      [t('m.bottleT'), qty(st.Tb, 0, '°C')],
      [t('m.walls'), t(st.mist > 0.05 ? 'walls.mist' : 'walls.dry'), st.mist > 0.05 ? 'good-text' : ''],
    ]);
  } else {
    measRows([
      [t('m.duration'), fmtHours(st.time)],
      [t('m.balance'), qty(sandMass(st), 1, 'g')],
    ]);
    if (st.time >= 24 * 3600 && ui.run) setLabel(ui.run, 'ctl.startWait');
  }
  showStatus(null);
}

/* ---------- volume ---------- */
function buildVol() {
  const st = S.vol;
  ui.exp = createSegmented({
    labelKey: 'ctl.exp', options: [{ value: 'bottle', labelKey: 'exp.glass' }, { value: 'cup', labelKey: 'exp.cup' }], value: st.exp,
    onChange: (v) => { S.vol = { ...initialState().vol, exp: v }; shell.refreshActivity(); buildTab('vol'); },
  });
  const ctl = [ui.exp.root];
  if (st.exp === 'bottle') {
    ui.full = createSegmented({
      labelKey: 'ctl.fill', options: [{ value: 'full', labelKey: 'fill.full' }, { value: 'part', labelKey: 'fill.part' }], value: st.full,
      onChange: (v) => { S.vol = { ...initialState().vol, full: v }; buildTab('vol'); },
    });
    ctl.push(ui.full.root);
  }
  ui.freezer = createButton({ labelKey: 'ctl.freezerIn', variant: 'primary', onClick: () => { st.inFreezer = !st.inFreezer; setLabel(ui.freezer, st.inFreezer ? 'ctl.freezerOut' : 'ctl.freezerIn'); } });
  ctl.push(el('div', { class: 'btn-row' }, [ui.freezer, resetBtn('vol')]), el('p', { class: 'muted', style: 'margin:8px 0 0' }, t('hint.speed1200')));
  panel(ctl);
}
function updateVol() {
  const st = S.vol;
  if (st.exp === 'bottle') {
    measRows([
      [t('m.duration'), fmtHours(st.time)],
      [t('m.content'), t(stateKey(1 - st.f))],
      [t('m.bottle'), t(st.broken ? 'bottle.broken' : 'bottle.ok'), st.broken ? 'bad-text' : ''],
    ]);
  } else {
    measRows([
      [t('m.duration'), fmtHours(st.time)],
      [t('m.content'), t(stateKey(1 - st.cupF))],
      [t('m.volume'), qty(100 + 9 * st.cupF, 0, 'cm³')],
      [t('m.mass'), qty(100, 1, 'g')],
    ]);
  }
  showStatus(null);
}

/* ---------- tabs ---------- */
function buildTab(id) {
  controlsBody.replaceChildren();
  measuresBody.replaceChildren();
  ui = {};
  if (id === 'fus') buildFus();
  else if (id === 'sol') buildSol();
  else if (id === 'boil') buildBoil();
  else if (id === 'evap') buildEvap();
  else buildVol();
  updateMeasures();
  draw();
}
function updateMeasures() {
  if (!shell || !ui.dl) return;
  const tab = shell.tab;
  if (tab === 'fus') updatePhase(S.fus);
  else if (tab === 'sol') updatePhase(S.sol);
  else if (tab === 'boil') updateBoil();
  else if (tab === 'evap') updateEvap();
  else updateVol();
}
function resetTab(id) {
  const fresh = initialState();
  if (id === 'fus') S.fus = phaseState(S.fus.kind);
  else if (id === 'evap') S.evap = { ...fresh.evap, exp: S.evap.exp };
  else if (id === 'vol') S.vol = { ...fresh.vol, exp: S.vol.exp };
  else S[id] = fresh[id];
  if (id === 'boil') bubbles = [];
  buildTab(id);
}

onLangChange(() => { if (shell) buildTab(shell.tab); });

shell = initSim({
  strings,
  notRequired: { boil: 'nr.act4' }, // CRDP 2026–2027 list (curriculum-scope.md)
  tabs: [
    { id: 'fus', labelKey: 'tab.fus' },
    { id: 'sol', labelKey: 'tab.sol' },
    { id: 'boil', labelKey: 'tab.boil' },
    { id: 'evap', labelKey: 'tab.evap' },
    { id: 'vol', labelKey: 'tab.vol' },
  ],
  initialTab: 'fus',
  onTab: buildTab,
  activityKey: (tab) => (tab === 'fus' ? `act.fus.${S.fus.kind}` : tab === 'evap' ? `act.evap.${S.evap.exp}` : tab === 'vol' ? `act.vol.${S.vol.exp}` : `act.${tab}`),
});
shell.start();
loop.start();

if (DEBUG) window.__sim = { S, Tboil, sandMass };
