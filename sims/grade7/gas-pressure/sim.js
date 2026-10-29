// Grade 7 — Gas pressure (Ch.5): air exerts pressure (Act. 1–3, Ex. 5, 7), manometers (Act. 6–7),
// barometers (Act. 8–10, Ex. 8), units of pressure (Act. 4–5)
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num, qty } from '../../../shared/format.js';
import { createSlider, createButton, createSegmented, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, font, arrow } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { label } from '../../../shared/figures.js';
import { calcCell, calcSig } from '../../../shared/calc-cell.js';
import { G, RHO_WATER, PA_PER_CMHG, PA_PER_BAR } from '../../../shared/constants.js';

const SCENE = { w: 600, h: 440 };
const TABLE_Y = 404;
const DEG = Math.PI / 180;
const P0 = 1.0; // atmospheric pressure used with the manometers, in bar (book: a manometer reads 1 bar in the free state)
const ALT_SCALE = 8.5; // km — atmospheric pressure ≈ p(0)·e^(−z / 8.5 km) (shape of the graph of Ex. 8)

/* ================================================================
   State
   ================================================================ */
function initialState(tab) {
  if (tab === 'atm') return { exp: 'card', phase: 0, rot: 0, suck: 0, inflate: 0.25, squeeze: 0, cap: true, water: 1, jet: 0, pump: 0 };
  if (tab === 'mano') return { inst: 'liquid', connected: false, dV: 0, attached: false, bottle: 1.25, needle: P0, blow: 0, blowing: false };
  if (tab === 'baro') return { phase: 0, fill: 0, level: 100, tilt: 0, sea: 76, alt: 0, ref: null };
  return { rows: [], fb: null };
}
let S = { atm: initialState('atm'), mano: initialState('mano'), baro: initialState('baro'), units: initialState('units') };

/* ================================================================
   Canvas
   ================================================================ */
let shell;
let drawQueued = false;
let drag = null;
const canvas = document.getElementById('stage');
canvas.style.touchAction = 'none';
const view = setupCanvas(canvas, { width: SCENE.w, height: SCENE.h, maxHeightVh: () => (window.innerWidth < 880 ? 50 : 74), onResize: () => requestDraw() });
const graphCard = document.getElementById('graph-card');
const gview = setupCanvas(document.getElementById('graph'), { width: 360, height: 220, maxHeightVh: 34, onResize: () => requestDraw() });
function requestDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; draw(); });
}
onThemeChange(() => requestDraw());
const cur = () => S[shell.tab];

function draw() {
  if (!shell) return;
  const ctx = view.begin();
  ctx.fillStyle = cssVar('--scene-bg');
  roundRect(ctx, 0, 0, SCENE.w, SCENE.h, 12);
  ctx.fill();
  ctx.fillStyle = cssVar('--bench');
  ctx.fillRect(0, TABLE_Y, SCENE.w, SCENE.h - TABLE_Y);
  const st = cur();
  if (shell.tab === 'atm') drawAtm(ctx, st);
  else if (shell.tab === 'mano') drawMano(ctx, st);
  else if (shell.tab === 'baro') { drawBaro(ctx, st); drawAltGraph(st); }
  else drawUnits(ctx);
}
function pressureArrow(ctx, x1, y1, x2, y2) {
  ctx.strokeStyle = cssVar('--primary');
  ctx.fillStyle = cssVar('--primary');
  ctx.lineWidth = 2.5;
  arrow(ctx, x1, y1, x2, y2, 9);
}
function poly(ctx, pts, close = true) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  if (close) ctx.closePath();
}

/* ================================================================
   Tab 1 — air exerts pressure
   ================================================================ */
const insideSuck = (st) => P0 * (1 - 0.6 * st.suck); // bar, air left in the bottle
const balloonP = (st) => P0 + 0.02 + 0.1 * st.inflate; // bar, gas in the balloon
const jarP = (st) => P0 * (1 - 0.8 * st.pump); // bar, air left in the bell jar
function drawAtm(ctx, st) {
  if (st.exp === 'card') drawCard(ctx, st);
  else if (st.exp === 'suck') drawSuck(ctx, st);
  else if (st.exp === 'balloon') drawBalloon(ctx, st);
  else if (st.exp === 'hole') drawHole(ctx, st);
  else drawJar(ctx, st);
}
function drawCard(ctx, st) {
  const cx = 300, cy = 220, w = 110, h = 150;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(st.rot);
  const glass = [[-w / 2, -h / 2], [-w / 2 + 6, h / 2], [w / 2 - 6, h / 2], [w / 2, -h / 2]];
  ctx.fillStyle = cssVar('--water');
  ctx.globalAlpha = 0.85;
  poly(ctx, glass); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = cssVar('--glass-stroke');
  ctx.lineWidth = 3;
  poly(ctx, glass, false);
  ctx.stroke();
  // card on the mouth of the glass
  ctx.fillStyle = cssVar('--wood');
  ctx.fillRect(-w / 2 - 12, -h / 2 - 6, w + 24, 6);
  ctx.restore();
  const inverted = st.phase >= 1 && Math.abs(st.rot - Math.PI) < 0.01;
  const cardY = cy + h / 2 + 6;
  if (st.phase <= 1) {
    // hand holding the card (over the mouth, then under it once the glass is turned over)
    const hy = inverted ? cardY + 16 : st.phase === 0 && st.rot === 0 ? cy - h / 2 - 22 : null;
    if (hy != null) {
      ctx.fillStyle = cssVar('--skin');
      ctx.beginPath(); ctx.ellipse(cx, hy, 62, 15, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
  if (st.phase === 2) {
    for (const dx of [-36, 0, 36]) pressureArrow(ctx, cx + dx, cardY + 64, cx + dx, cardY + 8);
    label(ctx, t('lbl.patm'), cx, cardY + 82, { size: 13, weight: 800, color: cssVar('--primary') });
  }
}
function drawSuck(ctx, st) {
  const cx = 300, top = 120, bot = 390, hw = 62;
  const c = 34 * st.suck; // how much the walls are pushed in
  const pts = [];
  for (let i = 0; i <= 20; i++) {
    const y = top + 50 + ((bot - top - 50) * i) / 20;
    const k = Math.sin((Math.PI * i) / 20);
    pts.push([cx - hw + c * k, y]);
  }
  const right = pts.map(([x, y]) => [2 * cx - x, y]).reverse();
  const outline = [[cx - 14, top], [cx - 14, top + 22], ...pts, ...right, [cx + 14, top + 22], [cx + 14, top]];
  ctx.fillStyle = cssVar('--glass-fill');
  poly(ctx, outline); ctx.fill();
  ctx.strokeStyle = cssVar('--glass-stroke');
  ctx.lineWidth = 3;
  poly(ctx, outline, false); ctx.stroke();
  // straw and mouth
  ctx.strokeStyle = cssVar('--accent');
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(cx, top + 30); ctx.lineTo(cx, top - 40); ctx.stroke();
  ctx.fillStyle = cssVar('--skin');
  ctx.beginPath(); ctx.ellipse(cx, top - 58, 30, 18, 0, 0, Math.PI * 2); ctx.fill();
  // atmospheric pressure on the walls
  for (let i = 0; i < 4; i++) {
    const y = top + 90 + i * 58;
    const k = Math.sin((Math.PI * (y - top - 50)) / (bot - top - 50));
    const xw = cx - hw + c * k;
    pressureArrow(ctx, xw - 60, y, xw - 8, y);
    pressureArrow(ctx, 2 * cx - xw + 60, y, 2 * cx - xw + 8, y);
  }
  label(ctx, t('lbl.patm'), cx - hw - 70, top + 60, { size: 12, weight: 800, color: cssVar('--primary') });
}
function drawBalloon(ctx, st) {
  const cx = 300, cy = 240;
  const R = 60 + 55 * st.inflate;
  const stiff = 0.12 + 2.5 * st.inflate * st.inflate; // a well inflated balloon is hard to deform
  const flat = Math.min(0.55, (0.32 * st.squeeze) / stiff);
  const rx = R * (1 - flat), ry = R * (1 + flat * 0.6);
  ctx.fillStyle = cssVar('--accent');
  ctx.globalAlpha = 0.85;
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = cssVar('--accent');
  poly(ctx, [[cx - 7, cy + ry - 2], [cx + 7, cy + ry - 2], [cx, cy + ry + 12]]); ctx.fill();
  // gas pushing on the inner walls
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    arrow(ctx, cx + Math.cos(a) * rx * 0.25, cy + Math.sin(a) * ry * 0.25, cx + Math.cos(a) * rx * 0.75, cy + Math.sin(a) * ry * 0.75, 7);
  }
  // fingers squeezing from both sides
  if (st.squeeze > 0.01) {
    ctx.fillStyle = cssVar('--skin');
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(cx + s * (rx + 22), cy, 22, 44, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
}
function drawHole(ctx, st) {
  const x0 = 220, x1 = 340, top = 150, bot = 380, holeY = 362;
  // basin
  ctx.strokeStyle = cssVar('--glass-stroke');
  ctx.lineWidth = 3;
  ctx.strokeRect(380, 330, 150, 72);
  // bottle body
  ctx.fillStyle = cssVar('--glass-fill');
  ctx.fillRect(x0, top, x1 - x0, bot - top);
  const yw = bot - (bot - top) * st.water;
  ctx.fillStyle = cssVar('--water');
  ctx.globalAlpha = 0.85;
  ctx.fillRect(x0, yw, x1 - x0, bot - yw);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = cssVar('--glass-stroke');
  poly(ctx, [[x0 + 40, top - 40], [x0 + 40, top - 10], [x0, top + 10], [x0, bot], [x1, bot], [x1, top + 10], [x1 - 40, top - 10], [x1 - 40, top - 40]], false);
  ctx.stroke();
  if (st.cap) { ctx.fillStyle = cssVar('--primary'); ctx.fillRect(x0 + 34, top - 56, x1 - x0 - 68, 18); }
  // the hole
  ctx.fillStyle = cssVar('--text');
  ctx.beginPath(); ctx.arc(x1, holeY, 3, 0, Math.PI * 2); ctx.fill();
  // jet of water
  if (st.jet > 0 && st.water > 0.02) {
    const v = 40 + 140 * Math.sqrt(Math.max(0, (holeY - yw) / (bot - top)));
    ctx.strokeStyle = cssVar('--water');
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let i = 0; i <= 20; i++) {
      const tt = i / 20 * 0.45, x = x1 + v * tt, y = holeY + 0.5 * 600 * tt * tt;
      if (y > 400) break;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
  label(ctx, t(st.cap ? 'lbl.capOn' : 'lbl.capOff'), (x0 + x1) / 2, top - 72, { size: 13, weight: 800 });
  if (st.cap && st.water > 0.02) pressureArrow(ctx, x1 + 60, holeY, x1 + 8, holeY);
}
function drawJar(ctx, st) {
  const cx = 300, base = 360, R = 150;
  ctx.fillStyle = cssVar('--wood');
  roundRect(ctx, cx - 190, base, 380, 22, 6); ctx.fill();
  // balloon inside
  const r = 42 * Math.cbrt(P0 / jarP(st));
  ctx.fillStyle = cssVar('--accent');
  ctx.globalAlpha = 0.85;
  ctx.beginPath(); ctx.ellipse(cx, base - r, r, r * 0.95, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  // bell jar
  ctx.fillStyle = cssVar('--glass-fill');
  ctx.globalAlpha = 0.5;
  ctx.beginPath(); ctx.moveTo(cx - R, base); ctx.lineTo(cx - R, base - 150); ctx.quadraticCurveTo(cx - R, base - 260, cx, base - 262); ctx.quadraticCurveTo(cx + R, base - 260, cx + R, base - 150); ctx.lineTo(cx + R, base); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = cssVar('--glass-stroke');
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(cx - R, base); ctx.lineTo(cx - R, base - 150); ctx.quadraticCurveTo(cx - R, base - 260, cx, base - 262); ctx.quadraticCurveTo(cx + R, base - 260, cx + R, base - 150); ctx.lineTo(cx + R, base); ctx.stroke();
  // pipe to the pump
  ctx.strokeStyle = cssVar('--rubber');
  ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(cx + 120, base + 12); ctx.lineTo(cx + 250, base + 12); ctx.lineTo(cx + 250, base - 40); ctx.stroke();
  label(ctx, t('lbl.pump'), cx + 250, base - 56, { size: 12, weight: 800 });
  // small gauge on the jar
  ctx.fillStyle = cssVar('--surface');
  ctx.strokeStyle = cssVar('--glass-stroke');
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, base - 288, 24, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  const a = -Math.PI * 0.75 + (Math.PI * 1.5 * jarP(st)) / 1.2;
  ctx.strokeStyle = cssVar('--accent');
  ctx.beginPath(); ctx.moveTo(cx, base - 288); ctx.lineTo(cx + 18 * Math.sin(a), base - 288 - 18 * Math.cos(a)); ctx.stroke();
}

/* ================================================================
   Tab 2 — manometers
   ================================================================ */
// Liquid manometer: syringe 20 mL + rubber tube 5 mL of confined air; U-tube of inner cross-section 0.5 cm².
const LM = { V0: 25, A: 0.5, pxPerCm: 8, base: 250 };
// x = how far (cm) the water goes down in the branch joined to the syringe (and up in the other branch).
function liquidState(st) {
  if (!st.connected) return { x: 0, h: 0, p: P0 };
  const f = (x) => (P0 * LM.V0) / (LM.V0 - st.dV + LM.A * x) - P0 - (RHO_WATER * G * (2 * x) / 100) / PA_PER_BAR;
  let lo = -14, hi = 14;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (f(m) > 0) lo = m; else hi = m; }
  const x = (lo + hi) / 2;
  return { x, h: 2 * x, p: P0 + (RHO_WATER * G * (2 * x) / 100) / PA_PER_BAR };
}
const gaugeP = (st) => (st.attached ? st.bottle : P0);
function drawMano(ctx, st) {
  if (st.inst === 'liquid') drawLiquid(ctx, st);
  else if (st.inst === 'metal') drawMetal(ctx, st);
  else drawWhistle(ctx, st);
}
function drawLiquid(ctx, st) {
  const L = 360, R = 440, w = 16, top = 100, bot = 380;
  const { x, h, p } = liquidState(st);
  const yL = LM.base + x * LM.pxPerCm, yR = LM.base - x * LM.pxPerCm;
  // water
  ctx.fillStyle = cssVar('--water');
  ctx.fillRect(L - w / 2, yL, w, bot - yL);
  ctx.fillRect(R - w / 2, yR, w, bot - yR);
  ctx.beginPath(); ctx.arc((L + R) / 2, bot, (R - L) / 2 + w / 2, 0, Math.PI); ctx.arc((L + R) / 2, bot, (R - L) / 2 - w / 2, Math.PI, 0, true); ctx.fill();
  // glass
  ctx.strokeStyle = cssVar('--glass-stroke');
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(L - w / 2, top); ctx.lineTo(L - w / 2, bot); ctx.arc((L + R) / 2, bot, (R - L) / 2 + w / 2, Math.PI, 0, true); ctx.lineTo(R + w / 2, top);
  ctx.moveTo(L + w / 2, top); ctx.lineTo(L + w / 2, bot); ctx.arc((L + R) / 2, bot, (R - L) / 2 - w / 2, Math.PI, 0, true); ctx.lineTo(R - w / 2, top);
  ctx.stroke();
  // ruler between the branches (cm, 0 at the level of rest)
  ctx.fillStyle = cssVar('--text');
  ctx.strokeStyle = cssVar('--text');
  ctx.lineWidth = 1;
  ctx.font = font(10, 700);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let c = -15; c <= 15; c++) {
    const y = LM.base - c * LM.pxPerCm;
    ctx.beginPath(); ctx.moveTo(R + 16, y); ctx.lineTo(R + (c % 5 ? 22 : 28), y); ctx.stroke();
    if (c % 5 === 0) ctx.fillText(String(c), R + 40, y);
  }
  ctx.fillText('cm', R + 40, LM.base - 16 * LM.pxPerCm - 4);
  // syringe joined to the left branch
  if (st.connected) {
    ctx.strokeStyle = cssVar('--rubber');
    ctx.lineWidth = 10;
    ctx.beginPath(); ctx.moveTo(L, top + 4); ctx.lineTo(L, 70); ctx.lineTo(250, 70); ctx.stroke();
  }
  const sx = 60, sw = 190, sy = 70, sh = 36;
  ctx.fillStyle = cssVar('--glass-fill');
  ctx.fillRect(sx, sy - sh / 2, sw, sh);
  ctx.strokeStyle = cssVar('--glass-stroke');
  ctx.lineWidth = 2.5;
  ctx.strokeRect(sx, sy - sh / 2, sw, sh);
  // the air is between the piston and the nozzle (right); 20 mL = 80 px; pushing moves the piston to the right
  const xp = sx + sw - 80 + 4 * st.dV;
  ctx.fillStyle = cssVar('--rubber');
  ctx.fillRect(xp - 6, sy - sh / 2 + 2, 10, sh - 4);
  ctx.fillStyle = cssVar('--glass-stroke');
  ctx.fillRect(xp - 116, sy - 4, 110, 8);
  ctx.fillRect(xp - 122, sy - 22, 8, 44);
  if (!st.connected) label(ctx, t('lbl.notConnected'), 150, 116, { size: 12, weight: 700, color: cssVar('--muted') });
  // level difference h
  if (Math.abs(h) > 0.05) {
    const xm = 300;
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = cssVar('--muted');
    ctx.beginPath(); ctx.moveTo(xm - 20, yL); ctx.lineTo(L, yL); ctx.moveTo(xm - 20, yR); ctx.lineTo(R, yR); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = cssVar('--accent');
    ctx.fillStyle = cssVar('--accent');
    ctx.lineWidth = 2;
    arrow(ctx, xm, (yL + yR) / 2, xm, Math.min(yL, yR) + 1, 6);
    arrow(ctx, xm, (yL + yR) / 2, xm, Math.max(yL, yR) - 1, 6);
    label(ctx, `h = ${qty(Math.abs(h), 1, 'cm')}`, xm - 50, (yL + yR) / 2, { size: 13, weight: 800, color: cssVar('--accent') });
  }
  label(ctx, `p = ${qty(p, 3, 'bar')}`, 150, 150, { size: 15, weight: 800, color: p > P0 + 1e-4 ? cssVar('--accent') : p < P0 - 1e-4 ? cssVar('--primary') : cssVar('--text') });
  label(ctx, t('lbl.confined'), 150, 172, { size: 12, weight: 600, color: cssVar('--muted') });
  label(ctx, t('lbl.patm1'), R + 6, top - 24, { size: 12, weight: 700 });
}
// Dial manometer 0–3 bar (Fig. 8b)
function drawDial(ctx, cx, cy, r, value, { min, max, step, labelStep, unit, start = -225, sweep = 270, words = null, ref = null, decimals = 1 }) {
  ctx.fillStyle = cssVar('--surface');
  ctx.strokeStyle = cssVar('--glass-stroke');
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  const ang = (v) => (start + (sweep * (v - min)) / (max - min)) * DEG;
  ctx.strokeStyle = cssVar('--text');
  ctx.fillStyle = cssVar('--text');
  ctx.font = font(13, 800);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const n = Math.round((max - min) / step);
  for (let i = 0; i <= n; i++) {
    const v = min + i * step, a = ang(v);
    const major = Math.abs(((v - min) / labelStep) - Math.round((v - min) / labelStep)) < 1e-6;
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath(); ctx.moveTo(cx + (r - 6) * Math.cos(a), cy + (r - 6) * Math.sin(a)); ctx.lineTo(cx + (r - (major ? 18 : 12)) * Math.cos(a), cy + (r - (major ? 18 : 12)) * Math.sin(a)); ctx.stroke();
    if (major) ctx.fillText(num(v, decimals), cx + (r - 34) * Math.cos(a), cy + (r - 34) * Math.sin(a));
  }
  if (words) {
    ctx.font = font(10, 700);
    ctx.fillStyle = cssVar('--primary');
    for (const [v, key] of words) { const a = ang(v); ctx.fillText(t(key), cx + (r - 60) * Math.cos(a), cy + (r - 60) * Math.sin(a)); }
  }
  ctx.fillStyle = cssVar('--muted');
  ctx.font = font(12, 700);
  ctx.fillText(unit, cx, cy + r * 0.45);
  if (ref != null) {
    const a = ang(ref);
    ctx.strokeStyle = cssVar('--gold');
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + (r - 20) * Math.cos(a), cy + (r - 20) * Math.sin(a)); ctx.stroke();
  }
  const a = ang(Math.max(min, Math.min(max, value)));
  ctx.strokeStyle = cssVar('--accent');
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(cx - 14 * Math.cos(a), cy - 14 * Math.sin(a)); ctx.lineTo(cx + (r - 14) * Math.cos(a), cy + (r - 14) * Math.sin(a)); ctx.stroke();
  ctx.fillStyle = cssVar('--text');
  ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill();
}
function drawMetal(ctx, st) {
  const cx = 400, cy = 190, r = 130;
  drawDial(ctx, cx, cy, r, st.needle, { min: 0, max: 3, step: 0.1, labelStep: 0.5, unit: 'bar' });
  // flattened elastic tube (tube aplati) that straightens when the pressure rises
  const k = 1 / (52 + 40 * (st.needle - P0)); // curvature
  ctx.strokeStyle = cssVar('--gold');
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  let x = cx - 10, y = cy + 72, a = Math.PI; // starts at the inlet, goes left then up
  ctx.moveTo(x, y);
  for (let i = 0; i < 40; i++) { a += 3.2 * k; x += 3.2 * Math.cos(a); y += 3.2 * Math.sin(a); ctx.lineTo(x, y); }
  ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.strokeStyle = cssVar('--muted');
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(cx, cy); ctx.stroke();
  // inlet and bottle
  ctx.fillStyle = cssVar('--metal');
  ctx.fillRect(cx - 16, cy + r - 4, 32, 30);
  if (st.attached) {
    ctx.strokeStyle = cssVar('--rubber');
    ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(cx, cy + r + 26); ctx.lineTo(cx, 380); ctx.lineTo(160, 380); ctx.lineTo(160, 150); ctx.stroke();
  }
  ctx.fillStyle = cssVar('--co2');
  roundRect(ctx, 100, 170, 120, 220, 30); ctx.fill();
  ctx.strokeStyle = cssVar('--glass-stroke');
  ctx.lineWidth = 2.5;
  roundRect(ctx, 100, 170, 120, 220, 30); ctx.stroke();
  ctx.fillStyle = cssVar('--metal');
  ctx.fillRect(146, 140, 28, 30);
  label(ctx, t('lbl.gasBottle'), 160, 280, { size: 13, weight: 800 });
  label(ctx, `${qty(st.bottle, 2, 'bar')}`, 160, 300, { size: 12, weight: 700, color: cssVar('--muted') });
}
function drawWhistle(ctx, st) {
  // face profile and the party whistle: a paper tube rolled in a spiral, it unrolls when the pressure inside rises
  ctx.fillStyle = cssVar('--skin');
  ctx.beginPath(); ctx.ellipse(110, 210, 70, 95, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = cssVar('--accent');
  ctx.fillRect(176, 214, 40, 14);
  const c = st.blow; // 0 rolled … 1 unrolled
  ctx.strokeStyle = cssVar('--primary');
  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  ctx.beginPath();
  let x = 216, y = 221, a = 0;
  ctx.moveTo(x, y);
  const n = 90, ds = 3.6;
  for (let i = 0; i < n; i++) {
    const s = i / n;
    const kappa = (1 - c) * (0.02 + 0.16 * s * s); // tighter at the end
    a += kappa * ds;
    x += ds * Math.cos(a); y += ds * Math.sin(a);
    ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.lineCap = 'butt';
  label(ctx, `p = ${qty(P0 + 0.03 * c, 2, 'bar')}`, 400, 110, { size: 15, weight: 800, color: c > 0.02 ? cssVar('--accent') : cssVar('--text') });
  label(ctx, t('lbl.inTube'), 400, 132, { size: 12, color: cssVar('--muted') });
}

/* ================================================================
   Tab 3 — mercury barometer (Torricelli) and metallic barometer
   ================================================================ */
const TB = { px: 160, dish: 380, scale: 2.6 }; // tube pivot (in the dish), px per cm
const atmH = (st) => st.sea * Math.exp(-st.alt / ALT_SCALE); // cmHg
const WEATHER = [[71, 'w.hurricane'], [72.6, 'w.storm'], [74.2, 'w.rain'], [76, 'w.variable'], [78, 'w.good']];
const weatherKey = (v) => (v >= 77 ? 'w.good' : v >= 75 ? 'w.variable' : v >= 73.5 ? 'w.rain' : v >= 72 ? 'w.storm' : 'w.hurricane');
// Length of mercury in the tube (cm along the tube) when the column balances the atmosphere
const columnLength = (st) => Math.min(100, atmH(st) / Math.cos(st.tilt * DEG));
function drawBaro(ctx, st) {
  const { px, dish, scale } = TB;
  // dish of mercury
  ctx.fillStyle = cssVar('--mercury');
  ctx.fillRect(70, dish - 14, 180, 22);
  ctx.strokeStyle = cssVar('--glass-stroke');
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(66, dish - 30); ctx.lineTo(66, dish + 12); ctx.lineTo(254, dish + 12); ctx.lineTo(254, dish - 30); ctx.stroke();
  const surf = dish - 14;
  if (st.phase < 2) {
    // tube upright (open end up) beside the dish, being filled
    const x = 300, bot = 392, L = 100 * scale;
    ctx.fillStyle = cssVar('--mercury');
    ctx.fillRect(x - 6, bot - L * st.fill, 12, L * st.fill);
    ctx.strokeStyle = cssVar('--glass-stroke');
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x - 7, bot - L); ctx.lineTo(x - 7, bot); ctx.arc(x, bot, 7, Math.PI, 0, true); ctx.lineTo(x + 7, bot - L); ctx.stroke();
    if (st.phase === 1 && st.fill >= 1) { ctx.fillStyle = cssVar('--skin'); ctx.beginPath(); ctx.ellipse(x, bot - L - 8, 14, 10, 0, 0, Math.PI * 2); ctx.fill(); }
    return drawBaroRight(ctx, st);
  }
  // tube upside down in the dish, turning about its open end
  const a = st.tilt * DEG, ux = Math.sin(a), uy = -Math.cos(a);
  const L = 100 * scale;
  const bx = px, by = dish - 4; // open end (in the mercury of the dish)
  const lev = st.level * scale; // mercury length in the tube (px)
  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(a);
  ctx.fillStyle = cssVar('--mercury');
  ctx.fillRect(-6, -lev, 12, lev);
  ctx.strokeStyle = cssVar('--glass-stroke');
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(-7, -L); ctx.arc(0, -L, 7, Math.PI, 0); ctx.lineTo(7, 0); ctx.stroke();
  if (st.phase === 2) { ctx.fillStyle = cssVar('--skin'); ctx.beginPath(); ctx.ellipse(0, 8, 14, 10, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
  // space above the mercury: vacuum
  if (st.phase === 3 && st.level < 99.5) {
    const mx = bx + ux * (lev + (L - lev) / 2), my = by + uy * (lev + (L - lev) / 2);
    const sd = st.tilt < 15 ? 1 : -1; // label on the right while the tube is nearly vertical, else on the left
    label(ctx, t('lbl.vacuum'), mx + sd * 44, my, { size: 12, weight: 800, align: sd > 0 ? 'left' : 'right' });
    ctx.strokeStyle = cssVar('--muted');
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(mx + sd * 10, my); ctx.lineTo(mx + sd * 40, my); ctx.stroke();
  }
  // vertical height H between the two levels
  if (st.phase === 3) {
    const topY = by + uy * lev, topX = bx + ux * lev;
    const xr = 58;
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = cssVar('--muted');
    ctx.beginPath(); ctx.moveTo(topX, topY); ctx.lineTo(xr, topY); ctx.moveTo(70, surf); ctx.lineTo(xr, surf); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = cssVar('--accent');
    ctx.fillStyle = cssVar('--accent');
    ctx.lineWidth = 2;
    arrow(ctx, xr, (topY + surf) / 2, xr, topY + 1, 6);
    arrow(ctx, xr, (topY + surf) / 2, xr, surf - 1, 6);
    label(ctx, 'H', xr + 12, (topY + surf) / 2, { size: 15, weight: 800, color: cssVar('--accent') });
  }
  drawBaroRight(ctx, st);
}
function drawBaroRight(ctx, st) {
  const H = atmH(st);
  // scale near the tube: cm above the mercury of the dish
  // vertical ruler on the left (cm above the mercury of the dish)
  const x = 42, surf = TB.dish - 14;
  ctx.strokeStyle = cssVar('--text');
  ctx.fillStyle = cssVar('--text');
  ctx.lineWidth = 1;
  ctx.font = font(10, 700);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.beginPath(); ctx.moveTo(x, surf); ctx.lineTo(x, surf - 100 * TB.scale); ctx.stroke();
  for (let c = 0; c <= 100; c += 2) {
    const y = surf - c * TB.scale;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - (c % 10 ? 4 : 8), y); ctx.stroke();
    if (c % 10 === 0) ctx.fillText(String(c), x - 10, y);
  }
  ctx.fillText('cm', x - 6, surf - 104 * TB.scale);
  // metallic barometer (Act. 9–10): needle = present pressure, gold needle = previous pressure
  drawDial(ctx, 470, 200, 112, H, { min: 70, max: 80, step: 0.5, labelStep: 2, unit: 'cmHg', start: -210, sweep: 240, words: WEATHER, ref: st.ref, decimals: 0 });
  label(ctx, t('lbl.metalBaro'), 470, 332, { size: 13, weight: 800 });
}
// Graph of the atmospheric pressure (kPa) as a function of the altitude (km) — Ex. 8, Fig. 15
function drawAltGraph(st) {
  const ctx = gview.begin();
  const L = 48, R = 344, T = 14, B = 182;
  const X = (z) => L + ((R - L) * z) / 20, Y = (p) => B - ((B - T) * p) / 110;
  ctx.strokeStyle = cssVar('--border');
  ctx.lineWidth = 1;
  ctx.fillStyle = cssVar('--text');
  ctx.font = font(11, 600);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let z = 0; z <= 20; z += 5) { ctx.beginPath(); ctx.moveTo(X(z), T); ctx.lineTo(X(z), B); ctx.stroke(); ctx.fillText(String(z), X(z), B + 4); }
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let p = 0; p <= 100; p += 25) { ctx.beginPath(); ctx.moveTo(L, Y(p)); ctx.lineTo(R, Y(p)); ctx.stroke(); ctx.fillText(String(p), L - 6, Y(p)); }
  ctx.strokeStyle = cssVar('--text');
  ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(L, B); ctx.lineTo(R, B); ctx.stroke();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(t('graph.y'), L + 4, T);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(t('graph.x'), R, B - 4);
  const kpa = (z) => (st.sea * PA_PER_CMHG * Math.exp(-z / ALT_SCALE)) / 1000;
  ctx.strokeStyle = cssVar('--accent');
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let i = 0; i <= 80; i++) { const z = (20 * i) / 80; if (i) ctx.lineTo(X(z), Y(kpa(z))); else ctx.moveTo(X(z), Y(kpa(z))); }
  ctx.stroke();
  ctx.fillStyle = cssVar('--primary');
  ctx.beginPath(); ctx.arc(X(st.alt), Y(kpa(st.alt)), 6, 0, Math.PI * 2); ctx.fill();
}

/* ================================================================
   Tab 4 — units of pressure (Act. 4–5): book equivalences on the canvas, conversions in the table
   ================================================================ */
function drawUnits(ctx) {
  // tire label of Fig. 4
  ctx.fillStyle = cssVar('--rubber');
  ctx.beginPath(); ctx.arc(130, 250, 95, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = cssVar('--metal');
  ctx.beginPath(); ctx.arc(130, 250, 48, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, 60, 120, 140, 34, 6); ctx.fill();
  ctx.fillStyle = '#1d1f24';
  ctx.font = font(18, 800);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('800 kPa', 130, 138);
  label(ctx, t('lbl.tire'), 130, 370, { size: 12, weight: 700 });
  // book equivalences
  const lines = ['1 kPa = 1000 Pa', '1 hPa = 100 Pa', '1 bar = 100 000 Pa', '1 atm ≈ 100 000 Pa', '1 atm = 76 cmHg', '1 atm = 760 mmHg', '1 cmHg = 10 mmHg', '1 cmHg = 1360 Pa'];
  ctx.fillStyle = cssVar('--surface');
  roundRect(ctx, 270, 60, 300, 320, 12); ctx.fill();
  ctx.strokeStyle = cssVar('--border');
  ctx.lineWidth = 1.5;
  roundRect(ctx, 270, 60, 300, 320, 12); ctx.stroke();
  label(ctx, t('lbl.equiv'), 420, 86, { size: 14, weight: 800, halo: false });
  lines.forEach((s, i) => label(ctx, s.replace(/(\d) (\d{3})/g, '$1 $2'), 420, 122 + i * 33, { size: 16, weight: 700, halo: false }));
}
// Conversions: [from, to, factor (to = from × factor)], values chosen so that the answer is exact
const CONV = [
  ['kPa', 'Pa', 1000, [800, 250, 1.5, 101]], ['Pa', 'kPa', 1e-3, [800000, 3500, 101300]],
  ['hPa', 'Pa', 100, [1013, 980, 1020]], ['Pa', 'hPa', 0.01, [101300, 98000, 2500]],
  ['bar', 'Pa', 100000, [1.25, 2, 0.5, 3]], ['Pa', 'bar', 1e-5, [250000, 120000, 50000]],
  ['bar', 'hPa', 1000, [1.25, 0.8, 2]], ['hPa', 'bar', 0.001, [1013, 2500, 500]],
  ['atm', 'cmHg', 76, [1, 2, 0.5, 3]], ['atm', 'mmHg', 760, [1, 2, 0.5]], ['cmHg', 'mmHg', 10, [76, 74.5, 38]],
  ['mmHg', 'cmHg', 0.1, [760, 745, 380]], ['cmHg', 'Pa', 1360, [76, 75, 10, 38]], ['cmHg', 'atm', 1 / 76, [152, 38, 76]],
];
function newConversion(st) {
  let k;
  do { k = Math.floor(Math.random() * CONV.length); } while (st.rows.length && st.rows[st.rows.length - 1].k === k && CONV.length > 1);
  const c = CONV[k];
  const v = c[3][Math.floor(Math.random() * c[3].length)];
  const ans = Math.round(v * c[2] * 1e6) / 1e6;
  st.rows.push({ k, v, from: c[0], to: c[1], ans });
  if (st.rows.length > 6) st.rows.shift();
}
const decimalsOf = (x) => { const s = String(x); return s.includes('.') ? s.split('.')[1].length : 0; };

/* ================================================================
   Animation
   ================================================================ */
const loop = createLoop({
  dt: 1 / 60,
  step(dt) {
    if (!shell) return false;
    const st = cur();
    let moving = false;
    if (shell.tab === 'atm') {
      if (st.exp === 'card' && st.phase >= 1 && st.rot < Math.PI) { st.rot = Math.min(Math.PI, st.rot + dt * 3.4); moving = true; }
      if (st.exp === 'hole' && !st.cap && st.water > 0.02) { st.water = Math.max(0, st.water - dt * 0.05 * Math.sqrt(st.water)); st.jet = 1; moving = true; }
      else st.jet = 0;
    } else if (shell.tab === 'mano') {
      const target = gaugeP(st);
      if (Math.abs(st.needle - target) > 1e-3) { st.needle += (target - st.needle) * Math.min(1, dt * 5); moving = true; } else st.needle = target;
      if (st.inst === 'whistle') {
        const tb = st.blowing ? 1 : 0;
        if (Math.abs(st.blow - tb) > 1e-3) { st.blow += (tb - st.blow) * Math.min(1, dt * (st.blowing ? 3 : 2.2)); moving = true; } else st.blow = tb;
      }
    } else if (shell.tab === 'baro') {
      if (st.phase === 1 && st.fill < 1) { st.fill = Math.min(1, st.fill + dt * 0.6); moving = true; }
      const target = st.phase === 3 ? columnLength(st) : 100;
      if (st.phase >= 2 && Math.abs(st.level - target) > 0.02) { st.level += (target - st.level) * Math.min(1, dt * 3); moving = true; } else if (st.phase >= 2) st.level = target;
    }
    if (moving) updateMeasures();
    return moving;
  },
  render: () => draw(),
});
function kick() { loop.start(); requestDraw(); }

/* ================================================================
   Pointer: hold to blow in the whistle; drag the piston of the U-tube syringe
   ================================================================ */
canvas.addEventListener('pointerdown', (ev) => {
  const p = view.toLogical(ev);
  const st = cur();
  if (shell.tab === 'mano' && st.inst === 'whistle') { st.blowing = true; drag = { kind: 'blow' }; kick(); }
  else if (shell.tab === 'mano' && st.inst === 'liquid' && st.connected && p.y < 110 && p.x < 360) drag = { kind: 'piston', x: p.x, dV: st.dV };
  else if (shell.tab === 'atm' && st.exp === 'balloon') drag = { kind: 'squeeze', y: p.y, s: st.squeeze };
  if (drag) { canvas.setPointerCapture(ev.pointerId); ev.preventDefault(); }
});
canvas.addEventListener('pointermove', (ev) => {
  if (!drag) return;
  const p = view.toLogical(ev);
  const st = cur();
  if (drag.kind === 'piston') { st.dV = Math.round(Math.max(-4, Math.min(4, drag.dV + (p.x - drag.x) / 4)) * 10) / 10; ui.dV?.set(st.dV); updateMeasures(); requestDraw(); }
  if (drag.kind === 'squeeze') { st.squeeze = Math.max(0, Math.min(1, drag.s + Math.abs(p.y - drag.y) / 120)); ui.squeeze?.set(Math.round(st.squeeze * 100)); updateMeasures(); requestDraw(); }
});
const endDrag = () => { const st = cur(); if (drag?.kind === 'blow') { st.blowing = false; kick(); } drag = null; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

/* ================================================================
   Panels
   ================================================================ */
const controlsBody = document.getElementById('controls-body');
const measuresBody = document.getElementById('measures-body');
let ui = {};
function measRows(dl, rows) {
  dl.replaceChildren(...rows.flatMap(([k, v, cls]) => [el('dt', {}, k), el('dd', cls ? { class: cls } : {}, v)]));
}
function showStatus(box, fb) {
  if (!fb) { box.hidden = true; return; }
  box.hidden = false;
  box.className = `status ${fb.type || ''}`;
  box.textContent = t(fb.key, fb.params);
}
const hint = (key) => el('p', { class: 'muted', style: 'margin:8px 0 0;font-size:0.88rem', dataset: { i18n: key } }, t(key));
const resetRow = () => el('div', { class: 'btn-row', style: 'margin-top:8px' }, [createButton({ labelKey: 'ui.reset', onClick: resetTab, variant: 'ghost' })]);
const bar = (p) => qty(p, 3, 'bar');

/* ---------- Tab 1 ---------- */
function buildAtm() {
  const st = S.atm;
  ui.exp = createSegmented({
    labelKey: 'ctl.exp',
    options: ['card', 'suck', 'balloon', 'hole', 'jar'].map((v) => ({ value: v, labelKey: `exp.${v}` })),
    value: st.exp,
    onChange: (v) => { S.atm = { ...initialState('atm'), exp: v }; buildTab(); shell.refreshActivity(); },
  });
  const items = [ui.exp.root];
  if (st.exp === 'card') {
    ui.turn = createButton({ labelKey: 'ctl.turn', variant: 'primary', onClick: () => { if (st.phase === 0) { st.phase = 1; kick(); updateMeasures(); } } });
    ui.hand = createButton({ labelKey: 'ctl.hand', variant: 'primary', onClick: () => { if (st.phase === 1 && st.rot >= Math.PI) { st.phase = 2; updateMeasures(); requestDraw(); } } });
    items.push(el('div', { class: 'btn-row' }, [ui.turn, ui.hand]));
  } else if (st.exp === 'suck') {
    ui.suck = createSlider({ labelKey: 'ctl.suck', min: 0, max: 100, step: 1, value: Math.round(st.suck * 100), unit: '%', decimals: 0, onInput: (v) => { st.suck = v / 100; updateMeasures(); requestDraw(); } });
    items.push(ui.suck.root);
  } else if (st.exp === 'balloon') {
    ui.inflate = createSlider({ labelKey: 'ctl.inflate', min: 0, max: 100, step: 1, value: Math.round(st.inflate * 100), unit: '%', decimals: 0, onInput: (v) => { st.inflate = v / 100; updateMeasures(); requestDraw(); } });
    ui.squeeze = createSlider({ labelKey: 'ctl.squeeze', min: 0, max: 100, step: 1, value: Math.round(st.squeeze * 100), unit: '%', decimals: 0, onInput: (v) => { st.squeeze = v / 100; updateMeasures(); requestDraw(); } });
    items.push(ui.inflate.root, ui.squeeze.root, hint('hint.squeeze'));
  } else if (st.exp === 'hole') {
    ui.cap = createSegmented({
      labelKey: 'ctl.cap', options: [{ value: 'on', labelKey: 'cap.on' }, { value: 'off', labelKey: 'cap.off' }], value: st.cap ? 'on' : 'off',
      onChange: (v) => { st.cap = v === 'on'; updateMeasures(); kick(); },
    });
    items.push(ui.cap.root, el('div', { class: 'btn-row' }, [createButton({ labelKey: 'ctl.refill', onClick: () => { st.water = 1; st.cap = true; buildTab(); } })]));
  } else {
    ui.pump = createSlider({ labelKey: 'ctl.pumpOut', min: 0, max: 100, step: 1, value: Math.round(st.pump * 100), unit: '%', decimals: 0, onInput: (v) => { st.pump = v / 100; updateMeasures(); requestDraw(); } });
    items.push(ui.pump.root);
  }
  items.push(resetRow());
  controlsBody.append(...items);
  ui.dl = el('dl', { class: 'meas' });
  measuresBody.append(ui.dl);
}
function updateAtm() {
  const st = S.atm;
  const rows = [];
  if (st.exp === 'card') {
    rows.push([t('m.glass'), t(st.phase === 0 ? 'glass.up' : 'glass.down')], [t('m.hand'), t(st.phase === 2 ? 'hand.off' : 'hand.on')], [t('m.card'), t('card.stays')]);
    ui.turn.disabled = st.phase !== 0;
    ui.hand.disabled = !(st.phase === 1 && st.rot >= Math.PI);
  } else if (st.exp === 'suck') {
    rows.push([t('m.pIn'), bar(insideSuck(st))], [t('m.pOut'), bar(P0)], [t('m.bottle'), t(st.suck > 0.05 ? 'bottle.crushed' : 'bottle.normal')]);
  } else if (st.exp === 'balloon') {
    const stiff = 0.12 + 2.5 * st.inflate * st.inflate;
    rows.push([t('m.pBalloon'), bar(balloonP(st))], [t('m.pOut'), bar(P0)], [t('m.deform'), t((0.32 * st.squeeze) / stiff > 0.2 ? 'deform.easy' : st.squeeze > 0.05 ? 'deform.hard' : 'deform.none')]);
  } else if (st.exp === 'hole') {
    rows.push([t('m.cap'), t(st.cap ? 'cap.on' : 'cap.off')], [t('m.flow'), t(!st.cap && st.water > 0.02 ? 'flow.yes' : 'flow.no')], [t('m.water'), qty(Math.round(st.water * 100), 0, '%')]);
  } else {
    rows.push([t('m.pJar'), bar(jarP(st))], [t('m.size'), t(st.pump > 0.05 ? 'size.bigger' : 'size.same')]);
  }
  measRows(ui.dl, rows);
}

/* ---------- Tab 2 ---------- */
function buildMano() {
  const st = S.mano;
  ui.inst = createSegmented({
    labelKey: 'ctl.inst',
    options: [{ value: 'liquid', labelKey: 'inst.liquid' }, { value: 'metal', labelKey: 'inst.metal' }, { value: 'whistle', labelKey: 'inst.whistle' }],
    value: st.inst,
    onChange: (v) => { S.mano = { ...initialState('mano'), inst: v }; buildTab(); shell.refreshActivity(); },
  });
  const items = [ui.inst.root];
  if (st.inst === 'liquid') {
    ui.conn = createSegmented({
      labelKey: 'ctl.syringe', options: [{ value: 'no', labelKey: 'conn.no' }, { value: 'yes', labelKey: 'conn.yes' }], value: st.connected ? 'yes' : 'no',
      onChange: (v) => { st.connected = v === 'yes'; st.dV = 0; ui.dV.set(0); ui.dV.setDisabled(!st.connected); updateMeasures(); requestDraw(); },
    });
    ui.dV = createSlider({ labelKey: 'ctl.piston', min: -4, max: 4, step: 0.1, value: st.dV, unit: 'mL', decimals: 1, onInput: (v) => { st.dV = v; updateMeasures(); requestDraw(); } });
    ui.dV.setDisabled(!st.connected);
    items.push(ui.conn.root, ui.dV.root, hint('hint.piston'));
  } else if (st.inst === 'metal') {
    ui.att = createSegmented({
      labelKey: 'ctl.attach', options: [{ value: 'no', labelKey: 'att.no' }, { value: 'yes', labelKey: 'att.yes' }], value: st.attached ? 'yes' : 'no',
      onChange: (v) => { st.attached = v === 'yes'; updateMeasures(); kick(); },
    });
    ui.bottle = createSlider({ labelKey: 'ctl.bottleP', min: 1, max: 2.8, step: 0.05, value: st.bottle, unit: 'bar', decimals: 2, onInput: (v) => { st.bottle = v; updateMeasures(); kick(); } });
    items.push(ui.att.root, ui.bottle.root);
  } else {
    ui.blowBtn = createButton({ labelKey: 'ctl.blow', variant: 'primary', onClick: () => {} });
    const on = (e) => { e.preventDefault(); st.blowing = true; kick(); };
    const off = () => { st.blowing = false; kick(); };
    ui.blowBtn.addEventListener('pointerdown', on);
    ui.blowBtn.addEventListener('pointerup', off);
    ui.blowBtn.addEventListener('pointerleave', off);
    items.push(el('div', { class: 'btn-row' }, [ui.blowBtn]), hint('hint.blow'));
  }
  items.push(resetRow());
  controlsBody.append(...items);
  ui.dl = el('dl', { class: 'meas' });
  measuresBody.append(ui.dl);
}
function updateMano() {
  const st = S.mano;
  const rows = [];
  if (st.inst === 'liquid') {
    const { h, p } = liquidState(st);
    const cmp = p > P0 + 1e-4 ? 'cmp.greater' : p < P0 - 1e-4 ? 'cmp.smaller' : 'cmp.equal';
    rows.push(
      [t('m.syringeV'), qty(20 - st.dV, 1, 'mL')],
      [t('m.h'), qty(Math.abs(h), 1, 'cm')],
      [t('m.higher'), t(Math.abs(h) < 0.05 ? 'higher.same' : h > 0 ? 'higher.open' : 'higher.syringe')],
      [t('m.pConfined'), bar(p)],
      [t('m.patm'), bar(P0)],
      [t('m.compare'), t(cmp), cmp === 'cmp.equal' ? '' : 'warn-text'],
    );
    if (st.connected && st.dV < -0.05) rows.push([t('m.air'), t('air.rarefied')]);
    else if (st.connected && st.dV > 0.05) rows.push([t('m.air'), t('air.compressed')]);
  } else if (st.inst === 'metal') {
    rows.push([t('m.reading'), bar(Math.abs(st.needle - gaugeP(st)) < 0.005 ? gaugeP(st) : st.needle)], [t('m.connectedTo'), t(st.attached ? 'att.bottle' : 'att.air')], [t('m.tube'), t(st.needle > P0 + 0.01 ? 'tube.straighter' : 'tube.rest')]);
  } else {
    rows.push([t('m.pTube'), qty(P0 + 0.03 * st.blow, 2, 'bar')], [t('m.whistle'), t(st.blow > 0.6 ? 'wh.unrolled' : st.blow > 0.05 ? 'wh.unrolling' : 'wh.rolled')]);
  }
  measRows(ui.dl, rows);
}

/* ---------- Tab 3 ---------- */
function buildBaro() {
  const st = S.baro;
  ui.fill = createButton({ labelKey: 'ctl.fill', variant: 'primary', onClick: () => { if (st.phase === 0) { st.phase = 1; kick(); updateMeasures(); } } });
  ui.invert = createButton({ labelKey: 'ctl.invert', variant: 'primary', onClick: () => { if (st.phase === 1 && st.fill >= 1) { st.phase = 2; st.level = 100; updateMeasures(); requestDraw(); } } });
  ui.thumb = createButton({ labelKey: 'ctl.thumb', variant: 'primary', onClick: () => { if (st.phase === 2) { st.phase = 3; kick(); updateMeasures(); } } });
  ui.tilt = createSlider({ labelKey: 'ctl.tiltTube', min: 0, max: 45, step: 1, value: st.tilt, unit: '°', decimals: 0, onInput: (v) => { st.tilt = v; kick(); updateMeasures(); } });
  ui.sea = createSlider({ labelKey: 'ctl.weather', min: 71, max: 79, step: 0.1, value: st.sea, unit: 'cmHg', decimals: 1, onInput: (v) => { st.sea = v; kick(); updateMeasures(); } });
  ui.alt = createSlider({ labelKey: 'ctl.alt', min: 0, max: 20, step: 0.1, value: st.alt, unit: 'km', decimals: 1, onInput: (v) => { st.alt = v; kick(); updateMeasures(); } });
  ui.ref = createButton({ labelKey: 'ctl.ref', onClick: () => { st.ref = atmH(st); requestDraw(); updateMeasures(); } });
  controlsBody.append(el('div', { class: 'btn-row' }, [ui.fill, ui.invert, ui.thumb]), ui.tilt.root, ui.sea.root, ui.alt.root, el('div', { class: 'btn-row' }, [ui.ref]), resetRow());
  ui.dl = el('dl', { class: 'meas' });
  measuresBody.append(ui.dl);
}
function updateBaro() {
  const st = S.baro;
  const H = atmH(st), pa = H * PA_PER_CMHG;
  ui.fill.disabled = st.phase !== 0;
  ui.invert.disabled = !(st.phase === 1 && st.fill >= 1);
  ui.thumb.disabled = st.phase !== 2;
  ui.tilt.setDisabled(st.phase !== 3);
  const rows = [];
  if (st.phase === 3) {
    const Hv = st.level * Math.cos(st.tilt * DEG); // vertical height of the column
    const full = st.level >= 99.9;
    rows.push(
      [t('m.H'), `${qty(Hv, 1, 'cm')}`],
      [t('m.length'), qty(st.level, 1, 'cm')],
      [t('m.above'), t(full ? 'above.none' : 'above.vacuum'), full ? 'warn-text' : ''],
    );
  } else rows.push([t('m.step'), t(`step.${st.phase}`)]);
  rows.push(
    [t('m.baro'), qty(H, 1, 'cmHg')],
    [t('m.inPa'), `${qty(Math.round(pa), 0, 'Pa')} = ${qty(pa / 100, 0, 'hPa')} = ${qty(pa / 1000, 1, 'kPa')}`],
    [t('m.weather'), t(weatherKey(st.sea))],
    [t('m.altitude'), qty(st.alt, 1, 'km')],
  );
  if (st.ref != null) rows.push([t('m.trend'), t(H > st.ref + 0.05 ? 'trend.up' : H < st.ref - 0.05 ? 'trend.down' : 'trend.same')]);
  measRows(ui.dl, rows);
}

/* ---------- Tab 4 ---------- */
function buildUnits() {
  const st = S.units;
  if (!st.rows.length) newConversion(st);
  controlsBody.append(
    el('div', { class: 'btn-row' }, [createButton({ labelKey: 'ctl.newConv', variant: 'primary', onClick: () => { newConversion(st); st.fb = null; updateMeasures(); } })]),
    resetRow(),
    hint('hint.units'),
  );
  ui.table = el('table', { class: 'data' });
  ui.clear = createButton({ labelKey: 'ctl.clearTable', onClick: () => { st.rows = []; st.fb = null; updateMeasures(); }, variant: 'ghost' });
  ui.clearRow = el('div', { class: 'btn-row', style: 'margin-top:8px' }, [ui.clear]);
  ui.status = el('div', { class: 'status', hidden: '' });
  ui.dl = el('dl', { class: 'meas' });
  measuresBody.append(ui.table, ui.clearRow, ui.status);
}
function updateUnits() {
  const st = S.units;
  const sig = calcSig(st.rows) + st.rows.map((r) => r.k + ':' + r.v).join();
  if (ui.tableSig !== sig) {
    ui.tableSig = sig;
    const head = el('tr', {}, [el('th', {}, t('col.value')), el('th', {}, t('col.in')), el('th', {}, t('col.answer'))]);
    const body = st.rows.map((r) => el('tr', {}, [
      el('td', {}, qty(r.v, decimalsOf(r.v), r.from)), el('td', {}, r.to),
      calcCell(r, 'a', { expected: r.ans, decimals: decimalsOf(r.ans), onCheck: (res) => {
        st.fb = res === 'invalid' ? { type: 'warn', key: 'calc.invalid' }
          : res === 'ok' ? { type: 'good', key: 'fb.convOk', params: { v: qty(r.v, decimalsOf(r.v), r.from), a: qty(r.ans, decimalsOf(r.ans), r.to) } }
            : { type: 'bad', key: 'fb.convWrong', params: { from: r.from, to: r.to } };
        updateMeasures();
      } }),
    ]));
    ui.table.replaceChildren(el('thead', {}, head), el('tbody', {}, body));
  }
  ui.table.hidden = st.rows.length === 0;
  ui.clearRow.hidden = ui.table.hidden;
  showStatus(ui.status, st.fb);
}

function updateMeasures() {
  if (!shell || !ui.dl) return;
  if (shell.tab === 'atm') updateAtm();
  else if (shell.tab === 'mano') updateMano();
  else if (shell.tab === 'baro') updateBaro();
  else updateUnits();
}
function buildTab() {
  loop.stop();
  controlsBody.replaceChildren();
  measuresBody.replaceChildren();
  ui = {};
  graphCard.hidden = shell.tab !== 'baro';
  if (shell.tab === 'atm') buildAtm();
  else if (shell.tab === 'mano') buildMano();
  else if (shell.tab === 'baro') buildBaro();
  else buildUnits();
  updateMeasures();
  kick();
}
function resetTab() {
  const keep = shell.tab === 'atm' ? { exp: S.atm.exp } : shell.tab === 'mano' ? { inst: S.mano.inst } : {};
  S[shell.tab] = { ...initialState(shell.tab), ...keep };
  buildTab();
}
onLangChange(() => { if (shell) buildTab(); });

shell = initSim({
  strings,
  tabs: [{ id: 'atm', labelKey: 'tab.atm' }, { id: 'mano', labelKey: 'tab.mano' }, { id: 'baro', labelKey: 'tab.baro' }, { id: 'units', labelKey: 'tab.units' }],
  initialTab: 'atm',
  onTab: buildTab,
  activityKey: (tab) => (tab === 'atm' ? `act.atm.${S.atm.exp}` : tab === 'mano' ? `act.mano.${S.mano.inst}` : `act.${tab}`),
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, cur: () => cur(), liquidState, atmH, columnLength };
