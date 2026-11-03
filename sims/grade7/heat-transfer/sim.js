// Grade 7 — Heat and transfer of heat (Ch.7 Act. 2–5, Ex. 6–7)
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num, qty } from '../../../shared/format.js';
import { createButton, createSegmented, createSlider, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, font, arrow } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { thermoGeom, drawThermometer, drawBunsen, heatColor } from '../../../shared/thermo-draw.js';
import { label } from '../../../shared/figures.js';
import { rng } from '../../../shared/particles.js';

const TA = 22; // °C, temperature of the room
const SCENE = { w: 600, h: 440 };
const BENCH = 430;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmtTime = (s) => { const m = Math.floor(s / 60), r = Math.floor(s % 60); return `${m} min ${String(r).padStart(2, '0')} s`; };

/* ================================================================
   Models
   ================================================================ */
// Act. 2 — water in a beaker heated by a flame: dθ/dt = P − k(θ − θroom), boiling at 100 °C
const WATER = { P: 0.5, k: 0.003, speed: 10 }; // °C/s, 1/s, time runs 10× faster

// Act. 3 — conduction along a rod 30 cm (metal) + 7.5 cm (wooden handle); 1D heat equation with losses to the air
const ROD = { L: 0.30, handle: 0.075, dx: 0.005, flameT: 600, flameLen: 0.015, waxT: 58, pins: [0.05, 0.10, 0.15, 0.20, 0.25] };
// k (W/(m·K)), ρc (J/(m³·K)); losses hP/A = 1.5×10⁴ W/(m³·K) for a rod 4 mm thick
const MATERIALS = {
  copper: { k: 400, rc: 3.45e6, color: '--copper' },
  aluminium: { k: 237, rc: 2.42e6, color: '--alu' },
  iron: { k: 80, rc: 3.5e6, color: '--metal' },
  glass: { k: 1, rc: 2.0e6, color: '--glass-stroke' },
};
const WOOD = { k: 0.15, rc: 1.0e6 };
const LOSS = 1.5e4;
const NODES = Math.round((ROD.L + ROD.handle) / ROD.dx) + 1;

// Act. 5 — radiation: the envelope tends to θeq = θroom + A·a·(15 cm / d)² (lamp) or θroom + 28·a (sun)
const RAD = { lampA: 18, sunA: 28, tau: 5, absorb: { dark: 1, white: 0.4 } };

/* ================================================================
   State
   ================================================================ */
function initialState() {
  return {
    heat: { T: TA, time: 0, flame: false, pts: [[0, TA]], nextPt: 10, boiling: false },
    cond: { mat: 'copper', flame: false, time: 0, Tn: new Float64Array(NODES).fill(TA), fell: [], fallAnim: ROD.pins.map(() => null), map: false, speed: 10 },
    conv: { exp: 'water', flask: 'hot', time: 0, dye: [], left: 1, Ttop: 18, heaterOn: false, heaterPower: 0, heaterAway: false, showAir: false, airT: TA },
    rad: { src: 'lamp', on: false, d: 15, env: 'dark', screen: false, T: TA },
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
let clock = 0; // s, for flicker and wiggles

function draw() {
  if (!shell) return;
  const ctx = view.begin();
  ctx.fillStyle = cssVar('--bench');
  ctx.fillRect(0, BENCH, SCENE.w, SCENE.h - BENCH);
  if (shell.tab === 'heat') drawHeat(ctx);
  else if (shell.tab === 'cond') drawCond(ctx);
  else if (shell.tab === 'conv') drawConv(ctx);
  else drawRad(ctx);
}

function drawBeakerGlass(ctx, x0, x1, yTop, yBot) {
  ctx.strokeStyle = cssVar('--glass-stroke');
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(x0 - 6, yTop - 3); ctx.lineTo(x0, yTop + 3); ctx.lineTo(x0, yBot); ctx.lineTo(x1, yBot); ctx.lineTo(x1, yTop);
  ctx.stroke();
  ctx.fillStyle = cssVar('--glass-shine');
  ctx.fillRect(x1 - 12, yTop + 6, 4, yBot - yTop - 12);
}
function drawWater(ctx, x0, x1, yTop, yBot, alpha = 0.5) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = cssVar('--water');
  ctx.fillRect(x0 + 1, yTop, x1 - x0 - 2, yBot - yTop - 1);
  ctx.restore();
  ctx.strokeStyle = cssVar('--water-dark');
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x0 + 1, yTop); ctx.lineTo(x1 - 1, yTop); ctx.stroke();
}
function heatArrow(ctx, x1, y1, x2, y2) {
  ctx.strokeStyle = cssVar('--hot');
  ctx.fillStyle = cssVar('--hot');
  ctx.lineWidth = 4;
  arrow(ctx, x1, y1, x2, y2, 12);
}

/* ---------- Tab 1: heating water (Act. 2) ---------- */
const HB = { x0: 170, x1: 290, yTop: 200, yBot: 318, water: 236 }; // beaker on a tripod
const HTH = thermoGeom({ x: 250, yBulb: 300, yTop: 44, t0: 0, t1: 100, y0: 262, y1: 72, bulbR: 7, stemW: 6 });
const ZOOM = { x: 100, y: 120, r: 58 };
const GRAPH = { x0: 360, y0: 60, w: 210, h: 150, tMax: 600 };
const zoomRand = rng(7);
const zoomPs = Array.from({ length: 16 }, (_, i) => {
  const a = (i / 16) * Math.PI * 2;
  return { x: ZOOM.x + Math.cos(a) * 30 * zoomRand(), y: ZOOM.y + Math.sin(a) * 30 * zoomRand(), a: zoomRand() * 6.28 };
});
let boilBubbles = [];

function drawHeat(ctx) {
  const st = S.heat;
  // tripod and wire gauze
  ctx.strokeStyle = cssVar('--lever');
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(150, BENCH); ctx.lineTo(166, HB.yBot + 4);
  ctx.moveTo(310, BENCH); ctx.lineTo(294, HB.yBot + 4);
  ctx.moveTo(230, BENCH - 12); ctx.lineTo(230, HB.yBot + 4);
  ctx.stroke();
  ctx.fillStyle = cssVar('--box');
  ctx.fillRect(150, HB.yBot + 1, 160, 5);
  drawBunsen(ctx, { x: 230, yBench: BENCH, h: 74, on: st.flame, t: clock, scale: 0.9 });
  // water + bubbles when boiling
  drawWater(ctx, HB.x0, HB.x1, HB.water, HB.yBot);
  if (st.boiling) {
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.2;
    for (const b of boilBubbles) { ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke(); }
  }
  drawThermometer(ctx, HTH, { T: st.T, liquid: 'alcohol', scale: { minor: 2, mid: 10, major: 10, label: 20 }, unit: '°C', plateRight: 40 });
  drawBeakerGlass(ctx, HB.x0, HB.x1, HB.yTop, HB.yBot);

  // heat arrows: received from the flame, or given to the surroundings
  if (st.flame) {
    heatArrow(ctx, 196, 392, 196, 336);
    label(ctx, t('lbl.heatIn'), 130, 360, { size: 13, weight: 800, color: cssVar('--hot') });
  } else if (st.T > TA + 3) {
    heatArrow(ctx, HB.x0 - 6, 270, HB.x0 - 56, 270);
    heatArrow(ctx, 230, HB.water - 10, 230, HB.water - 60);
    label(ctx, t('lbl.heatOut'), 96, 250, { size: 13, weight: 800, color: cssVar('--hot') });
  }

  // particle view of the water
  ctx.save();
  ctx.beginPath(); ctx.arc(ZOOM.x, ZOOM.y, ZOOM.r, 0, Math.PI * 2);
  ctx.fillStyle = cssVar('--scene-bg'); ctx.fill();
  ctx.clip();
  ctx.fillStyle = cssVar('--particle');
  for (const p of zoomPs) { ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
  ctx.strokeStyle = cssVar('--lens-ring');
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(ZOOM.x, ZOOM.y, ZOOM.r, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(ZOOM.x + ZOOM.r * 0.7, ZOOM.y + ZOOM.r * 0.7); ctx.lineTo(HB.x0 + 30, HB.water + 30); ctx.stroke();
  ctx.setLineDash([]);
  label(ctx, t('lbl.waterParticles'), ZOOM.x, ZOOM.y + ZOOM.r + 14, { size: 12 });

  // graph θ(t)
  const g = GRAPH;
  const X = (s) => g.x0 + (s / g.tMax) * g.w;
  const Y = (T) => g.y0 + g.h - (T / 100) * g.h;
  ctx.fillStyle = cssVar('--surface');
  ctx.fillRect(g.x0, g.y0, g.w, g.h);
  ctx.strokeStyle = cssVar('--border');
  ctx.lineWidth = 1;
  ctx.font = font(10);
  ctx.fillStyle = cssVar('--muted');
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let T = 0; T <= 100; T += 20) { ctx.beginPath(); ctx.moveTo(g.x0, Y(T)); ctx.lineTo(g.x0 + g.w, Y(T)); ctx.stroke(); ctx.fillText(String(T), g.x0 - 4, Y(T)); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let s = 0; s <= g.tMax; s += 120) { ctx.beginPath(); ctx.moveTo(X(s), g.y0); ctx.lineTo(X(s), g.y0 + g.h); ctx.stroke(); ctx.fillText(String(s / 60), X(s), g.y0 + g.h + 4); }
  ctx.strokeStyle = cssVar('--text');
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(g.x0, g.y0); ctx.lineTo(g.x0, g.y0 + g.h); ctx.lineTo(g.x0 + g.w, g.y0 + g.h); ctx.stroke();
  ctx.fillStyle = cssVar('--text');
  ctx.font = font(11, 700);
  ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  ctx.fillText('θ (°C)', g.x0 + 4, g.y0 - 4);
  ctx.textAlign = 'right'; ctx.textBaseline = 'top';
  ctx.fillText('t (min)', g.x0 + g.w, g.y0 + g.h + 18);
  ctx.strokeStyle = cssVar('--thermo-red');
  ctx.lineWidth = 2;
  ctx.beginPath();
  st.pts.forEach(([s, T], i) => { if (s > g.tMax) return; if (i === 0) ctx.moveTo(X(s), Y(T)); else ctx.lineTo(X(s), Y(T)); });
  if (st.time <= g.tMax) ctx.lineTo(X(st.time), Y(st.T));
  ctx.stroke();
}

function stepHeat(dt) {
  const st = S.heat;
  const sdt = dt * WATER.speed;
  if (st.time < 3600) st.time += sdt;
  const P = st.flame ? WATER.P : 0;
  st.T += (P - WATER.k * (st.T - TA)) * sdt;
  if (st.T >= 100) st.T = 100;
  st.boiling = st.flame && st.T >= 99.9;
  while (st.time >= st.nextPt) { st.pts.push([st.nextPt, st.T]); st.nextPt += 10; }
  // particles: agitation grows with temperature
  const v = 14 + 1.4 * st.T;
  for (const p of zoomPs) {
    p.a += (Math.random() - 0.5) * 3 * dt * (1 + st.T / 30);
    p.x += Math.cos(p.a) * v * dt; p.y += Math.sin(p.a) * v * dt;
    const dx = p.x - ZOOM.x, dy = p.y - ZOOM.y, d = Math.hypot(dx, dy);
    if (d > ZOOM.r - 8) { p.a = Math.atan2(-dy, -dx) + (Math.random() - 0.5); p.x = ZOOM.x + (dx / d) * (ZOOM.r - 8); p.y = ZOOM.y + (dy / d) * (ZOOM.r - 8); }
  }
  if (st.boiling) {
    if (Math.random() < dt * 25) boilBubbles.push({ x: HB.x0 + 14 + Math.random() * (HB.x1 - HB.x0 - 28), y: HB.yBot - 4, r: 1.5, v: 40 + Math.random() * 40 });
  }
  for (const b of boilBubbles) { b.y -= b.v * dt; b.r += dt * 2.5; }
  boilBubbles = boilBubbles.filter((b) => b.y > HB.water + 2 && (st.boiling || b.y < HB.yBot));
}

/* ---------- Tab 2: conduction (Act. 3) ---------- */
const RX0 = 70, PX_M = 1200; // rod starts at x = 70; 12 px per cm
const RY = 200;
const xOf = (m) => RX0 + m * PX_M;
const iOf = (m) => Math.round(m / ROD.dx);

function drawCond(ctx) {
  const st = S.cond;
  const mat = MATERIALS[st.mat];
  drawBunsen(ctx, { x: xOf(0.008), yBench: BENCH, h: BENCH - RY - 44, on: st.flame, t: clock, scale: 1 });
  // rod (metal part)
  const xEnd = xOf(ROD.L);
  if (st.map) {
    for (let i = 0; i < iOf(ROD.L); i++) {
      ctx.fillStyle = heatColor(st.Tn[i], TA, 400);
      ctx.fillRect(xOf(i * ROD.dx), RY - 4, ROD.dx * PX_M + 0.6, 8);
    }
  } else {
    ctx.fillStyle = cssVar(mat.color);
    ctx.fillRect(RX0, RY - 4, xEnd - RX0, 8);
    // glow of the hot end
    for (let i = 0; i < iOf(ROD.L); i++) {
      const T = st.Tn[i];
      if (T < 350) break;
      ctx.fillStyle = `rgba(255,${Math.round(120 - (T - 350) / 4)},40,${Math.min(0.8, (T - 350) / 300)})`;
      ctx.fillRect(xOf(i * ROD.dx), RY - 4, ROD.dx * PX_M + 0.6, 8);
    }
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(RX0, RY - 4, xEnd - RX0, 8);
  // wooden handle
  ctx.fillStyle = cssVar('--wood');
  roundRect(ctx, xEnd, RY - 9, ROD.handle * PX_M, 18, 5);
  ctx.fill(); ctx.stroke();
  // hand holding the handle
  const hx = xEnd + ROD.handle * PX_M * 0.55;
  ctx.fillStyle = cssVar('--skin');
  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  for (const [dx, dy, rx, ry] of [[0, -12, 34, 14], [8, 10, 34, 12], [40, 0, 34, 24]]) {
    ctx.beginPath(); ctx.ellipse(hx + dx, RY + dy, rx, ry, 0.1, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  // pins stuck with wax
  ROD.pins.forEach((x, k) => {
    const a = st.fallAnim[k];
    const px = xOf(x);
    const y = a ? a.y : RY + 4;
    if (!a) { // wax drop
      ctx.fillStyle = cssVar('--wax');
      ctx.beginPath(); ctx.ellipse(px, RY + 6, 6, 4, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.save();
    ctx.translate(px, y);
    if (a) ctx.rotate(a.rot);
    ctx.fillStyle = cssVar('--pin');
    ctx.fillRect(-9, 6, 18, 4); // head
    ctx.strokeStyle = cssVar('--lever');
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(0, 22); ctx.stroke(); // point (hanging down)
    ctx.restore();
    if (!a) label(ctx, `${num(x * 100)} cm`, px, RY - 20, { size: 11, weight: 600, color: cssVar('--muted') });
  });
  label(ctx, t(`mat.${st.mat}`), (RX0 + xEnd) / 2, RY - 44, { size: 14, weight: 800 });
  label(ctx, t('lbl.handle'), xEnd + ROD.handle * PX_M / 2, RY - 44, { size: 12 });
  if (st.map) drawColorKey(ctx);
}
function drawColorKey(ctx) {
  const x0 = 360, y0 = 360, w = 200;
  for (let i = 0; i < w; i++) { ctx.fillStyle = heatColor(TA + (i / w) * (400 - TA), TA, 400); ctx.fillRect(x0 + i, y0, 1.2, 10); }
  ctx.strokeStyle = cssVar('--border'); ctx.strokeRect(x0, y0, w, 10);
  label(ctx, `${TA} °C`, x0, y0 + 22, { size: 11, align: 'left' });
  label(ctx, '400 °C', x0 + w, y0 + 22, { size: 11, align: 'right' });
}

const condTmp = new Float64Array(NODES);
function stepCond(dt) {
  const st = S.cond;
  const mat = MATERIALS[st.mat];
  const nMetal = iOf(ROD.L);
  let simDt = dt * st.speed;
  const sub = Math.max(1, Math.ceil(simDt / 0.05));
  const h = simDt / sub;
  for (let s = 0; s < sub; s++) {
    const T = st.Tn;
    for (let i = 0; i < NODES; i++) {
      const m = i <= nMetal ? mat : WOOD;
      const kl = i > 0 ? ((i - 1 <= nMetal ? mat : WOOD).k + m.k) / 2 : 0;
      const kr = i < NODES - 1 ? ((i + 1 <= nMetal ? mat : WOOD).k + m.k) / 2 : 0;
      const tl = i > 0 ? T[i - 1] : T[i], tr = i < NODES - 1 ? T[i + 1] : T[i];
      const lap = (kr * (tr - T[i]) - kl * (T[i] - tl)) / (ROD.dx * ROD.dx);
      condTmp[i] = T[i] + (h / m.rc) * (lap - LOSS * (T[i] - TA));
    }
    if (st.flame) for (let i = 0; i <= iOf(ROD.flameLen); i++) condTmp[i] += (ROD.flameT - condTmp[i]) * Math.min(1, h * 0.4);
    T.set(condTmp);
    st.time += h;
  }
  // pins fall when the wax melts
  ROD.pins.forEach((x, k) => {
    if (!st.fallAnim[k] && st.Tn[iOf(x)] >= ROD.waxT) {
      st.fallAnim[k] = { y: RY + 4, v: 0, rot: 0, done: false };
      st.fell.push({ k, time: st.time });
      st.fb = { type: 'good', key: 'fb.pinFell', params: { x: num(x * 100), t: fmtTime(st.time) } };
    }
    const a = st.fallAnim[k];
    if (a && !a.done) {
      a.v += 900 * dt; a.y += a.v * dt; a.rot += dt * 6;
      if (a.y >= BENCH - 12) { a.y = BENCH - 12; a.rot = Math.PI / 2; a.done = true; }
    }
  });
}
const handT = () => S.cond.Tn[iOf(ROD.L + ROD.handle * 0.55)];

/* ---------- Tab 3: convection (Act. 4) ---------- */
const JAR = { x0: 150, x1: 450, yTop: 90, yBot: 420, water: 120 };
const FLASK = { cx: 300, yBot: 420, w: 84, h: 70, neckW: 30, neckTop: 318 };
const HOLE = { x: 300, y: 312 };
const HEATER = { y: 404, w: 120 };
const STRIPS = { x: 300, y: 170, n: 5, len: 70 };
let airPs = [];

function heaterX() { return S.conv.heaterAway ? 500 : 300; }

function drawConv(ctx) {
  if (S.conv.exp === 'water') drawConvWater(ctx); else drawConvAir(ctx);
}
function drawConvWater(ctx) {
  const st = S.conv;
  drawWater(ctx, JAR.x0, JAR.x1, JAR.water, JAR.yBot, 0.35);
  // coloured water already at the top (layer) — drawn under the particles
  const dyeCol = cssVar('--dye');
  for (const p of st.dye) {
    ctx.globalAlpha = p.a;
    ctx.fillStyle = dyeCol;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // small flask full of coloured water, closed with a punched stopper
  const f = FLASK;
  ctx.save();
  ctx.fillStyle = dyeCol;
  ctx.globalAlpha = 0.25 + 0.6 * st.left;
  roundRect(ctx, f.cx - f.w / 2, f.yBot - f.h, f.w, f.h, 10); ctx.fill();
  ctx.fillRect(f.cx - f.neckW / 2, f.neckTop, f.neckW, f.yBot - f.h - f.neckTop + 4);
  ctx.restore();
  ctx.strokeStyle = cssVar('--glass-stroke');
  ctx.lineWidth = 2;
  roundRect(ctx, f.cx - f.w / 2, f.yBot - f.h, f.w, f.h, 10); ctx.stroke();
  ctx.fillStyle = cssVar('--wood');
  ctx.fillRect(f.cx - f.neckW / 2 - 2, f.neckTop - 8, f.neckW + 4, 12);
  ctx.fillStyle = cssVar('--scene-bg');
  ctx.fillRect(HOLE.x - 2.5, f.neckTop - 8, 5, 12); // hole in the stopper
  if (st.flask === 'hot') label(ctx, t('lbl.hotColoured'), f.cx, f.yBot - f.h / 2, { size: 11, weight: 800 });
  else label(ctx, t('lbl.coldColoured'), f.cx, f.yBot - f.h / 2, { size: 11, weight: 800 });
  drawBeakerGlass(ctx, JAR.x0, JAR.x1, JAR.yTop, JAR.yBot);
  label(ctx, t('lbl.coldWater'), JAR.x0 + 60, JAR.yBot - 30, { size: 12, weight: 700 });
  // thermometers: near the surface and at the bottom (readings in the panel)
  label(ctx, `${t('lbl.top')} ${qty(st.Ttop, 1, '°C')}`, JAR.x1 + 6, JAR.water + 20, { size: 12, align: 'left', weight: 700 });
  label(ctx, `${t('lbl.bottom')} ${qty(18, 1, '°C')}`, JAR.x1 + 6, JAR.yBot - 20, { size: 12, align: 'left', weight: 700 });
}
function drawConvAir(ctx) {
  const st = S.conv;
  const hx = heaterX();
  // electric heater (hot plate with glowing coil)
  ctx.fillStyle = cssVar('--heater');
  roundRect(ctx, hx - HEATER.w / 2, HEATER.y, HEATER.w, BENCH - HEATER.y, 4); ctx.fill();
  const glow = st.heaterPower;
  ctx.strokeStyle = glow > 0.05 ? cssVar('--coil') : cssVar('--muted');
  ctx.globalAlpha = 0.35 + 0.65 * glow;
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i <= 8; i++) { const x = hx - 48 + i * 12; ctx.lineTo(x, HEATER.y - (i % 2 ? 4 : 0)); }
  ctx.stroke();
  ctx.globalAlpha = 1;
  // air movement (convection current)
  if (st.showAir) {
    ctx.fillStyle = cssVar('--air-part');
    for (const p of airPs) { ctx.beginPath(); ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2); ctx.fill(); }
    if (glow > 0.3) {
      ctx.strokeStyle = cssVar('--hot'); ctx.fillStyle = cssVar('--hot'); ctx.lineWidth = 2.5;
      arrow(ctx, hx, HEATER.y - 30, hx, HEATER.y - 140, 10);
      ctx.strokeStyle = cssVar('--o2'); ctx.fillStyle = cssVar('--o2');
      arrow(ctx, hx - 150, 120, hx - 150, 300, 10);
      arrow(ctx, hx + 150, 120, hx + 150, 300, 10);
    }
  }
  // rod with paper strips
  ctx.strokeStyle = cssVar('--wood');
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(40, 110); ctx.lineTo(STRIPS.x, STRIPS.y); ctx.stroke();
  ctx.lineCap = 'butt';
  const up = upwardAt(STRIPS.x);
  for (let i = 0; i < STRIPS.n; i++) {
    const off = (i - (STRIPS.n - 1) / 2) * 6;
    const ang = Math.PI / 2 - up * (Math.PI * 0.85) + Math.sin(clock * (9 + i * 1.7) + i) * (0.08 + 0.35 * up); // from hanging (π/2) to standing up
    ctx.strokeStyle = cssVar('--paper');
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(STRIPS.x + off * 0.3, STRIPS.y);
    const mx = STRIPS.x + off + Math.cos(ang) * STRIPS.len * 0.5 + Math.sin(clock * 13 + i) * 4 * up;
    const my = STRIPS.y + Math.sin(ang) * STRIPS.len * 0.5;
    const ex = STRIPS.x + off + Math.cos(ang + Math.sin(clock * 11 + i) * 0.4 * up) * STRIPS.len;
    const ey = STRIPS.y + Math.sin(ang) * STRIPS.len;
    ctx.quadraticCurveTo(mx, my, ex, ey);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1; ctx.stroke();
  }
  label(ctx, t('lbl.strips'), STRIPS.x - 120, STRIPS.y - 60, { size: 12 });
  label(ctx, t('lbl.heater'), hx, HEATER.y - 22, { size: 12, weight: 700 });
}
// How strongly the rising warm air pushes the strips: 0 (still air) … 1
function upwardAt(x) {
  const d = Math.abs(x - heaterX());
  return S.conv.heaterPower * Math.exp(-((d / 70) ** 2));
}

function stepConv(dt) {
  const st = S.conv;
  st.time += dt;
  if (st.exp === 'water') {
    const hot = st.flask === 'hot';
    // emission of coloured water from the hole
    if (hot && st.left > 0) {
      const n = Math.random() < dt * 40 ? 1 : 0;
      for (let i = 0; i < n; i++) st.dye.push({ x: HOLE.x + (Math.random() - 0.5) * 4, y: HOLE.y, vx: 0, vy: -40, r: 5, a: 0.55, top: false });
      st.left = Math.max(0, st.left - dt / 40);
    } else if (!hot && st.dye.length < 40 && Math.random() < dt * 1.5) {
      st.dye.push({ x: HOLE.x + (Math.random() - 0.5) * 4, y: HOLE.y, vx: 0, vy: -3, r: 5, a: 0.45, top: false, slow: true });
    }
    for (const p of st.dye) {
      if (p.slow) { // same temperature: only a slow spreading around the hole
        p.x += (Math.random() - 0.5) * 10 * dt; p.y += (Math.random() - 0.5) * 10 * dt - 1.2 * dt;
        p.r = Math.min(10, p.r + dt * 0.3);
        continue;
      }
      if (!p.top) {
        p.vx += (Math.random() - 0.5) * 60 * dt;
        p.vx *= 0.96;
        p.x += p.vx * dt + Math.sin(st.time * 3 + p.y / 20) * 6 * dt;
        p.y += p.vy * dt;
        p.r = Math.min(11, p.r + dt * 2.2);
        if (p.y <= JAR.water + 12 + Math.random() * 14) { p.top = true; p.vx = (p.x < HOLE.x ? -1 : 1) * (12 + Math.random() * 22); }
      } else { // spreads under the surface
        p.x += p.vx * dt; p.vx *= 0.995;
        p.y += (Math.random() - 0.48) * 4 * dt;
        if (p.x < JAR.x0 + 10 || p.x > JAR.x1 - 10) { p.vx = -p.vx * 0.3; p.x = clamp(p.x, JAR.x0 + 10, JAR.x1 - 10); }
        p.r = Math.min(14, p.r + dt * 0.4);
        p.a = Math.max(0.18, p.a - dt * 0.004);
      }
    }
    if (st.dye.length > 700) st.dye.splice(0, st.dye.length - 700);
    const atTop = st.dye.filter((p) => p.top).length;
    st.Ttop = 18 + 4 * Math.min(1, atTop / 600);
  } else {
    const target = st.heaterOn ? 1 : 0;
    st.heaterPower += (target - st.heaterPower) * Math.min(1, dt / (st.heaterOn ? 2.5 : 3.5));
    st.airT = TA + 45 * upwardAt(STRIPS.x);
    if (st.showAir) stepAir(dt);
  }
}
function stepAir(dt) {
  const hx = heaterX();
  if (airPs.length < 90) {
    for (let i = airPs.length; i < 90; i++) airPs.push({ x: 40 + Math.random() * 520, y: 60 + Math.random() * 340 });
  }
  const P = S.conv.heaterPower;
  for (const p of airPs) {
    const dx = p.x - hx;
    // a loop: up above the heater, outwards at the top, down at the sides, inwards near the bench
    const g = Math.exp(-((dx / 60) ** 2));
    let vx = (Math.random() - 0.5) * 30;
    let vy = (Math.random() - 0.5) * 30;
    vy += -110 * P * g + 35 * P * (1 - g) * (p.y < 330 ? 1 : 0);
    if (p.y < 140) vx += Math.sign(dx || 1) * 60 * P;
    if (p.y > 340) vx += -Math.sign(dx) * 60 * P;
    p.x += vx * dt; p.y += vy * dt;
    if (p.y < 50) p.y = 50; if (p.y > 400) p.y = 400;
    if (p.x < 20) p.x = 20; if (p.x > 580) p.x = 580;
  }
}

/* ---------- Tab 4: radiation (Act. 5) ---------- */
const ENV = { x: 420, y: 250, w: 110, h: 140 };
const RTH = thermoGeom({ x: 470, yBulb: 360, yTop: 64, t0: 0, t1: 60, y0: 330, y1: 90, bulbR: 7, stemW: 6 });
const PX_CM_R = 7; // lamp distance scale

function radEq() {
  const st = S.rad;
  const a = RAD.absorb[st.env];
  if (!st.on || st.screen) return TA;
  if (st.src === 'sun') return TA + RAD.sunA * a;
  return TA + RAD.lampA * a * (15 / st.d) ** 2;
}
function drawRad(ctx) {
  const st = S.rad;
  const lit = st.on;
  const ex = ENV.x; // left edge of the envelope
  let sx, sy;
  if (st.src === 'lamp') {
    // desk lamp: base, arm, shade, bulb pointing to the envelope
    sx = ex - st.d * PX_CM_R; sy = 220;
    const baseX = sx - 70;
    ctx.fillStyle = cssVar('--box');
    roundRect(ctx, baseX - 30, BENCH - 12, 60, 12, 4); ctx.fill();
    ctx.strokeStyle = cssVar('--box'); ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(baseX, BENCH - 10); ctx.lineTo(baseX - 10, 140); ctx.lineTo(sx - 26, sy - 40); ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.save(); ctx.translate(sx - 14, sy - 18); ctx.rotate(0.6);
    ctx.fillStyle = cssVar('--motor');
    ctx.beginPath(); ctx.moveTo(-14, -26); ctx.lineTo(14, -26); ctx.lineTo(30, 18); ctx.lineTo(-30, 18); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.fillStyle = lit ? cssVar('--sun') : cssVar('--glass-fill');
    ctx.strokeStyle = cssVar('--glass-stroke'); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(sx, sy, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  } else {
    sx = 70; sy = 70;
    ctx.fillStyle = cssVar('--sun');
    ctx.beginPath(); ctx.arc(sx, sy, 46, 0, Math.PI * 2); ctx.fill();
    label(ctx, t('lbl.sun'), sx, sy + 62, { size: 13, weight: 800 });
    label(ctx, t('lbl.space'), 150, 24, { size: 12, color: cssVar('--muted'), align: 'left' });
  }
  // rays (light) towards the envelope
  if (lit) {
    ctx.save();
    ctx.strokeStyle = cssVar('--sun');
    ctx.lineWidth = 2.5;
    ctx.setLineDash([10, 8]);
    ctx.lineDashOffset = -clock * 40;
    const stopX = st.screen ? ENV.x - 46 : ex + 8;
    for (let k = 0; k < 5; k++) {
      const ty = ENV.y + 12 + k * 28;
      const tx = ex + 8;
      const f = Math.min(1, (stopX - sx) / (tx - sx));
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + (tx - sx) * f, sy + (ty - sy) * f); ctx.stroke();
    }
    ctx.restore();
  }
  // cardboard screen
  if (st.screen) {
    ctx.fillStyle = cssVar('--wood');
    ctx.fillRect(ENV.x - 50, 160, 10, BENCH - 160);
    label(ctx, t('lbl.screen'), ENV.x - 45, 146, { size: 11 });
  }
  // thermometer with its reservoir inside the envelope
  drawThermometer(ctx, RTH, { T: st.T, liquid: 'alcohol', scale: { minor: 1, mid: 5, major: 10, label: 10 }, unit: '°C', plateRight: 40 });
  const ec = cssVar(st.env === 'dark' ? '--envelope' : '--envelope-white');
  ctx.fillStyle = ec;
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1.2;
  ctx.fillRect(ENV.x, ENV.y + 40, ENV.w, ENV.h);
  ctx.strokeRect(ENV.x, ENV.y + 40, ENV.w, ENV.h);
  ctx.beginPath(); ctx.moveTo(ENV.x, ENV.y + 40); ctx.lineTo(ENV.x + ENV.w / 2, ENV.y + 80); ctx.lineTo(ENV.x + ENV.w, ENV.y + 40); ctx.stroke();
  label(ctx, t('lbl.envelope'), ENV.x + ENV.w / 2, ENV.y + ENV.h + 30, { size: 11, color: st.env === 'dark' ? '#fff' : '#333', halo: false });
  // distance
  if (st.src === 'lamp') {
    const y = 412;
    ctx.strokeStyle = cssVar('--muted'); ctx.fillStyle = cssVar('--muted'); ctx.lineWidth = 1.2;
    arrow(ctx, (sx + ex) / 2, y, sx, y, 6); arrow(ctx, (sx + ex) / 2, y, ex, y, 6);
    label(ctx, `d = ${qty(st.d, 0, 'cm')}`, (sx + ex) / 2, y - 12, { size: 12, weight: 700 });
  }
}
function stepRad(dt) {
  const st = S.rad;
  st.T += (radEq() - st.T) * (1 - Math.exp(-dt / RAD.tau));
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
    if (shell.tab === 'heat') stepHeat(dt);
    else if (shell.tab === 'cond') stepCond(dt);
    else if (shell.tab === 'conv') stepConv(dt);
    else stepRad(dt);
    measT += dt;
    return true;
  },
  render: () => {
    draw();
    if (measT > 0.15) { measT = 0; updateMeasures(); }
  },
});

/* ================================================================
   Panels
   ================================================================ */
const controlsBody = document.getElementById('controls-body');
const measuresBody = document.getElementById('measures-body');
let ui = {};
const statusBox = () => el('div', { class: 'status', hidden: '' });
function showStatus(fb) {
  const box = ui.status;
  if (!box) return;
  if (!fb) { box.hidden = true; return; }
  box.hidden = false;
  box.className = `status ${fb.type || ''}`;
  box.textContent = t(fb.key, fb.params);
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
  ui.status = statusBox();
  measuresBody.append(ui.dl, ...extra, ui.status);
}
const resetBtn = (id) => createButton({ labelKey: 'ui.reset', onClick: () => resetTab(id), variant: 'ghost' });

/* ---------- heat ---------- */
function buildHeat() {
  const st = S.heat;
  ui.flame = createButton({ labelKey: 'ctl.flameOn', variant: 'primary', onClick: () => { st.flame = !st.flame; st.fb = st.flame ? null : { type: 'good', key: 'fb.flameOff' }; refreshHeatBtn(); } });
  panel([el('div', { class: 'btn-row' }, [ui.flame, resetBtn('heat')]), el('p', { class: 'muted', style: 'margin:8px 0 0' }, t('hint.speed10'))]);
  refreshHeatBtn();
}
function refreshHeatBtn() { ui.flame.dataset.i18n = S.heat.flame ? 'ctl.flameOff' : 'ctl.flameOn'; ui.flame.textContent = t(ui.flame.dataset.i18n); }
function updateHeat() {
  const st = S.heat;
  const stateKey = st.boiling ? 'hs.boil' : st.flame ? 'hs.gain' : st.T > TA + 0.5 ? 'hs.lose' : 'hs.equal';
  measRows([
    [t('m.time'), fmtTime(st.time)],
    [t('m.thetaWater'), qty(st.T, 1, '°C')],
    [t('m.room'), qty(TA, 0, '°C')],
    [t('m.exchange'), t(stateKey)],
  ]);
  showStatus(st.fb);
}

/* ---------- conduction ---------- */
function buildCond() {
  const st = S.cond;
  ui.mat = createSegmented({
    labelKey: 'ctl.rod',
    options: Object.keys(MATERIALS).map((v) => ({ value: v, labelKey: `mat.${v}` })),
    value: st.mat,
    onChange: (v) => { const keep = { map: st.map, speed: st.speed }; S.cond = { ...initialState().cond, ...keep, mat: v }; ui.tableSig = null; refreshCondBtn(); updateMeasures(); },
  });
  ui.flame = createButton({ labelKey: 'ctl.flameOn', variant: 'primary', onClick: () => { S.cond.flame = !S.cond.flame; refreshCondBtn(); } });
  ui.map = createSegmented({
    labelKey: 'ctl.map', options: [{ value: 'no', labelKey: 'opt.no' }, { value: 'yes', labelKey: 'opt.yes' }], value: st.map ? 'yes' : 'no',
    onChange: (v) => { S.cond.map = v === 'yes'; },
  });
  ui.speed = createSegmented({
    labelKey: 'ctl.speed', options: [{ value: '10', labelKey: 'speed.10' }, { value: '30', labelKey: 'speed.30' }], value: String(st.speed),
    onChange: (v) => { S.cond.speed = Number(v); },
  });
  ui.table = el('table', { class: 'data' });
  panel([ui.mat.root, el('div', { class: 'btn-row' }, [ui.flame, resetBtn('cond')]), ui.map.root, ui.speed.root], [ui.table]);
  refreshCondBtn();
}
function refreshCondBtn() { ui.flame.dataset.i18n = S.cond.flame ? 'ctl.flameOff' : 'ctl.flameOn'; ui.flame.textContent = t(ui.flame.dataset.i18n); }
function updateCond() {
  const st = S.cond;
  measRows([
    [t('m.rod'), t(`mat.${st.mat}`)],
    [t('m.time'), fmtTime(st.time)],
    [t('m.pinsFallen'), `${st.fell.length} / ${ROD.pins.length}`],
    [t('m.hand'), qty(handT(), 0, '°C'), handT() < 40 ? 'good-text' : 'bad-text'],
  ]);
  const sig = st.fell.length + st.mat + t('m.pinCol');
  if (ui.tableSig !== sig) {
    ui.tableSig = sig;
    const head = el('tr', {}, [el('th', {}, t('m.pinCol')), el('th', {}, t('m.fallCol'))]);
    const rows = ROD.pins.map((x, k) => {
      const f = st.fell.find((e) => e.k === k);
      return el('tr', {}, [el('td', {}, qty(x * 100, 0, 'cm')), el('td', {}, f ? fmtTime(f.time) : '—')]);
    });
    ui.table.replaceChildren(el('thead', {}, head), el('tbody', {}, rows));
  }
  showStatus(st.fb);
}

/* ---------- convection ---------- */
function buildConv() {
  const st = S.conv;
  ui.exp = createSegmented({
    labelKey: 'ctl.exp', options: [{ value: 'water', labelKey: 'exp.water' }, { value: 'air', labelKey: 'exp.air' }], value: st.exp,
    onChange: (v) => { st.exp = v; shell.refreshActivity(); buildTab('conv'); },
  });
  const ctl = [ui.exp.root];
  if (st.exp === 'water') {
    ui.flask = createSegmented({
      labelKey: 'ctl.flask', options: [{ value: 'hot', labelKey: 'flask.hot' }, { value: 'cold', labelKey: 'flask.cold' }], value: st.flask,
      onChange: (v) => { st.flask = v; restartWater(); },
    });
    ctl.push(ui.flask.root, el('div', { class: 'btn-row' }, [createButton({ labelKey: 'ctl.again', variant: 'primary', onClick: restartWater }), resetBtn('conv')]));
  } else {
    ui.heater = createButton({ labelKey: 'ctl.heaterOn', variant: 'primary', onClick: () => { st.heaterOn = !st.heaterOn; refreshConvBtns(); } });
    ui.away = createButton({ labelKey: 'ctl.away', onClick: () => { st.heaterAway = !st.heaterAway; airPs = []; refreshConvBtns(); } });
    ui.air = createSegmented({
      labelKey: 'ctl.showAir', options: [{ value: 'no', labelKey: 'opt.no' }, { value: 'yes', labelKey: 'opt.yes' }], value: st.showAir ? 'yes' : 'no',
      onChange: (v) => { st.showAir = v === 'yes'; },
    });
    ctl.push(el('div', { class: 'btn-row' }, [ui.heater, ui.away, resetBtn('conv')]), ui.air.root);
  }
  panel(ctl);
  if (st.exp === 'air') refreshConvBtns();
}
function restartWater() { const st = S.conv; st.dye = []; st.left = 1; st.Ttop = 18; st.time = 0; }
function refreshConvBtns() {
  const st = S.conv;
  ui.heater.dataset.i18n = st.heaterOn ? 'ctl.heaterOff' : 'ctl.heaterOn';
  ui.heater.textContent = t(ui.heater.dataset.i18n);
  ui.away.dataset.i18n = st.heaterAway ? 'ctl.back' : 'ctl.away';
  ui.away.textContent = t(ui.away.dataset.i18n);
}
function updateConv() {
  const st = S.conv;
  if (st.exp === 'water') {
    const rising = st.flask === 'hot' && st.dye.some((p) => !p.top && !p.slow);
    measRows([
      [t('m.flaskWater'), t(`flask.${st.flask}`)],
      [t('m.coloured'), t(st.flask === 'hot' ? (rising ? 'cw.rises' : 'cw.layer') : 'cw.stays')],
      [t('m.Ttop'), qty(st.Ttop, 1, '°C')],
      [t('m.Tbottom'), qty(18, 1, '°C')],
    ]);
  } else {
    const up = upwardAt(STRIPS.x);
    measRows([
      [t('m.heater'), t(st.heaterOn ? 'heater.on' : 'heater.off')],
      [t('m.airT'), qty(st.airT, 0, '°C')],
      [t('m.strips'), t(up > 0.25 ? 'strips.move' : 'strips.still'), up > 0.25 ? 'good-text' : ''],
    ]);
  }
  showStatus(null);
}

/* ---------- radiation ---------- */
function buildRad() {
  const st = S.rad;
  ui.src = createSegmented({
    labelKey: 'ctl.src', options: [{ value: 'lamp', labelKey: 'src.lamp' }, { value: 'sun', labelKey: 'src.sun' }], value: st.src,
    onChange: (v) => { st.src = v; st.on = false; ui.d.setDisabled(v === 'sun'); refreshRadBtn(); },
  });
  ui.on = createButton({ labelKey: 'ctl.lampOn', variant: 'primary', onClick: () => { st.on = !st.on; refreshRadBtn(); } });
  ui.d = createSlider({ labelKey: 'ctl.distance', min: 10, max: 40, step: 1, value: st.d, unit: 'cm', decimals: 0, onInput: (v) => { st.d = v; } });
  ui.d.setDisabled(st.src === 'sun');
  ui.env = createSegmented({
    labelKey: 'ctl.envelope', options: [{ value: 'dark', labelKey: 'env.dark' }, { value: 'white', labelKey: 'env.white' }], value: st.env,
    onChange: (v) => { st.env = v; },
  });
  ui.screen = createSegmented({
    labelKey: 'ctl.screen', options: [{ value: 'no', labelKey: 'opt.no' }, { value: 'yes', labelKey: 'opt.yes' }], value: st.screen ? 'yes' : 'no',
    onChange: (v) => { st.screen = v === 'yes'; },
  });
  panel([ui.src.root, el('div', { class: 'btn-row' }, [ui.on, resetBtn('rad')]), ui.d.root, ui.env.root, ui.screen.root]);
  refreshRadBtn();
}
function refreshRadBtn() {
  const st = S.rad;
  const k = st.src === 'sun' ? (st.on ? 'ctl.sunOff' : 'ctl.sunOn') : (st.on ? 'ctl.lampOff' : 'ctl.lampOn');
  ui.on.dataset.i18n = k; ui.on.textContent = t(k);
}
function updateRad() {
  const st = S.rad;
  const eq = radEq();
  const moving = Math.abs(eq - st.T) > 0.15;
  measRows([
    [t('m.thetaEnv'), qty(st.T, 1, '°C')],
    [t('m.room'), qty(TA, 0, '°C')],
    [t('m.column'), t(moving ? (eq > st.T ? 'col.rising' : 'col.falling') : 'col.stopped'), moving ? '' : 'good-text'],
  ]);
  showStatus(null);
}

/* ---------- tabs ---------- */
function buildTab(id) {
  controlsBody.replaceChildren();
  measuresBody.replaceChildren();
  ui = {};
  if (id === 'heat') buildHeat();
  else if (id === 'cond') buildCond();
  else if (id === 'conv') buildConv();
  else buildRad();
  updateMeasures();
  draw();
}
function updateMeasures() {
  if (!shell || !ui.dl) return;
  if (shell.tab === 'heat') updateHeat();
  else if (shell.tab === 'cond') updateCond();
  else if (shell.tab === 'conv') updateConv();
  else updateRad();
}
function resetTab(id) {
  const fresh = initialState();
  if (id === 'conv') { fresh.conv.exp = S.conv.exp; airPs = []; }
  S[id] = fresh[id];
  if (id === 'heat') boilBubbles = [];
  buildTab(id);
}

onLangChange(() => { ui.dlSig = null; ui.tableSig = null; if (ui.flame) (shell.tab === 'heat' ? refreshHeatBtn : refreshCondBtn)(); if (ui.heater) refreshConvBtns(); if (ui.on) refreshRadBtn(); updateMeasures(); draw(); });

shell = initSim({
  strings,
  tabs: [
    { id: 'heat', labelKey: 'tab.heat' },
    { id: 'cond', labelKey: 'tab.cond' },
    { id: 'conv', labelKey: 'tab.conv' },
    { id: 'rad', labelKey: 'tab.rad' },
  ],
  initialTab: 'heat',
  onTab: buildTab,
  activityKey: (tab) => (tab === 'conv' ? `act.conv.${S.conv.exp}` : `act.${tab}`),
});
shell.start();
loop.start();

if (DEBUG) window.__sim = { S, handT, radEq, ROD, MATERIALS };
