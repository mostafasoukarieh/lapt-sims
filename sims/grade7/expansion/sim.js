// Grade 7 — Expansion (Ch.9 Act. 1–4, 6–7, Ex. 4, 6, 7) — not required in 2026–2027
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num, qty } from '../../../shared/format.js';
import { createButton, createSegmented, createSlider, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, font } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { thermoGeom, drawThermometer, drawBunsen } from '../../../shared/thermo-draw.js';
import { calcCell, calcSig } from '../../../shared/calc-cell.js';
import { label } from '../../../shared/figures.js';

const TA = 20; // °C
const SCENE = { w: 600, h: 440 };
const BENCH = 430;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ================================================================
   Models
   ================================================================ */
// Elongation of a 1 m rod for a rise of 50 °C (book table, page 70), mm
const RODS = { iron: 0.60, copper: 0.85, aluminium: 1.15, pyrex: 0.15, platinum: 0.43 };
const MM_PER_DIV = 0.2; // dilatometer: one division of the scale ↔ 0.2 mm of elongation
const ROD_COLORS = { iron: '--metal', copper: '--copper', aluminium: '--alu', pyrex: '--glass-stroke', platinum: '--silver' };
// Bistrips (top / bottom metal) — linear expansion coefficients ×10⁻⁶ /°C from the same table
const ALPHA = { iron: 12, copper: 17, aluminium: 23 };
const STRIPS = { 'copper-iron': ['copper', 'iron'], 'aluminium-copper': ['aluminium', 'copper'], 'iron-aluminium': ['iron', 'aluminium'] };
// Liquids: mean volume expansion coefficients between 20 and 80 °C (/°C)
const BETA = { water: 4.6e-4, alcohol: 1.1e-3, glass: 2.7e-5 };
// Ex. 7: volume of 1 kg of water (cm³) from 0 to 8 °C (book table, page 76)
const WATER_V = [1000.12, 1000.07, 1000.04, 1000.01, 1000.00, 1000.01, 1000.03, 1000.07, 1000.118];
const waterV = (T) => { const i = clamp(Math.floor(T), 0, 7); return WATER_V[i] + (WATER_V[i + 1] - WATER_V[i]) * (T - i); };

/* ================================================================
   State
   ================================================================ */
function initialState() {
  return {
    sol: { exp: 'dil', rod: 'iron', dT: 0, burn: 0, max: 0, rows: [], strip: 'copper-iron', sT: TA, sTarget: TA, ballT: TA, ballTarget: TA, ballY: 0, ballV: 0, drop: false, fb: null },
    liq: { exp: 'flask', liquid: 'water', hot: false, Tg: TA, Tl: TA, T2: TA, hot2: false, Tw: 4 },
    gas: { exp: 'index', fill: 'air', touch: false, T: TA, hot: false, Tb: TA },
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
  const st = S[shell.tab];
  if (shell.tab === 'sol') { if (st.exp === 'dil') drawDil(ctx); else if (st.exp === 'strip') drawStrip(ctx); else drawRing(ctx); }
  else if (shell.tab === 'liq') { if (st.exp === 'flask') drawFlaskTube(ctx); else if (st.exp === 'two') drawTwo(ctx); else drawAnomaly(ctx); }
  else if (st.exp === 'index') drawIndex(ctx); else drawPressure(ctx);
}

function waterRect(ctx, x0, x1, yTop, yBot, alpha = 0.45, color = '--water') {
  ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = cssVar(color); ctx.fillRect(x0, yTop, x1 - x0, yBot - yTop); ctx.restore();
}
function flames(ctx, x0, x1, y, k = 1) {
  for (let x = x0; x <= x1; x += 22) {
    const h = (26 + 8 * Math.sin(clock * 17 + x)) * k;
    ctx.fillStyle = cssVar('--flame-out'); ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.moveTo(x - 9, y); ctx.quadraticCurveTo(x - 7, y - h * 0.6, x + Math.sin(clock * 9 + x) * 3, y - h); ctx.quadraticCurveTo(x + 7, y - h * 0.6, x + 9, y); ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/* ---------- Tab 1: solids ---------- */
const DIL = { x0: 70, x1: 470, y: 250, px: 46, py: 250 };
function drawDil(ctx) {
  const st = S.sol;
  // stand and groove of alcohol
  ctx.fillStyle = cssVar('--o2');
  ctx.fillRect(DIL.x0 - 20, 300, DIL.x1 - DIL.x0 + 60, 14);
  ctx.fillRect(DIL.x0 - 20, 314, 12, BENCH - 314); ctx.fillRect(DIL.x1 + 28, 314, 12, BENCH - 314);
  ctx.fillStyle = cssVar('--box');
  ctx.fillRect(DIL.x0 - 6, 268, 14, 40); ctx.fillRect(DIL.x1 - 4, 268, 10, 40); // supports
  ctx.fillStyle = cssVar('--metal'); roundRect(ctx, DIL.x0 + 20, 284, DIL.x1 - DIL.x0 - 40, 14, 3); ctx.fill(); // groove
  if (st.burn > 0) flames(ctx, DIL.x0 + 34, DIL.x1 - 34, 286, 0.6 + 0.4 * Math.min(1, st.burn / 2));
  // rod (its elongation is far too small to be seen: the needle magnifies it)
  ctx.fillStyle = cssVar(ROD_COLORS[st.rod]);
  ctx.fillRect(DIL.x0 - 10, DIL.y - 4, DIL.x1 - DIL.x0 + 22, 8);
  ctx.fillStyle = cssVar('--box'); ctx.fillRect(DIL.x0 - 14, DIL.y - 10, 10, 20); // fixed end (screw)
  // needle pivot and scale at the free end
  const div = elongation(st) / MM_PER_DIV;
  const pivot = { x: DIL.x1 + 34, y: DIL.y + 4 };
  const ang = -Math.PI / 2 - (div / 6) * (Math.PI * 0.42); // 0 → vertical, 6 divisions → 75°
  const R = 170;
  ctx.strokeStyle = cssVar('--scale'); ctx.fillStyle = cssVar('--scale'); ctx.font = font(12, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = cssVar('--thermo-plate');
  ctx.beginPath(); ctx.moveTo(pivot.x, pivot.y); ctx.arc(pivot.x, pivot.y, R + 22, -Math.PI / 2 - 0.05, -Math.PI / 2 - Math.PI * 0.45, true); ctx.closePath(); ctx.fill();
  ctx.fillStyle = cssVar('--scale');
  for (let k = 0; k <= 60; k++) {
    const a = -Math.PI / 2 - (k / 60) * (Math.PI * 0.42);
    const l = k % 10 === 0 ? 14 : k % 5 === 0 ? 9 : 5;
    ctx.lineWidth = k % 10 === 0 ? 1.6 : 0.9;
    ctx.beginPath(); ctx.moveTo(pivot.x + Math.cos(a) * R, pivot.y + Math.sin(a) * R); ctx.lineTo(pivot.x + Math.cos(a) * (R - l), pivot.y + Math.sin(a) * (R - l)); ctx.stroke();
    if (k % 10 === 0) ctx.fillText(String(k / 10), pivot.x + Math.cos(a) * (R + 12), pivot.y + Math.sin(a) * (R + 12));
  }
  ctx.strokeStyle = cssVar('--bad'); ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(pivot.x, pivot.y + 26); ctx.lineTo(pivot.x + Math.cos(ang) * (R - 4), pivot.y + Math.sin(ang) * (R - 4)); ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.fillStyle = cssVar('--box'); ctx.beginPath(); ctx.arc(pivot.x, pivot.y, 5, 0, Math.PI * 2); ctx.fill();
  label(ctx, t('lbl.divValue'), pivot.x - 60, 52, { size: 11, color: cssVar('--muted') });
  label(ctx, `${t(`rod.${st.rod}`)} · 1 m`, (DIL.x0 + DIL.x1) / 2, DIL.y - 22, { size: 13, weight: 800 });
  label(ctx, `Δθ = ${qty(st.dT, 0, '°C')}`, (DIL.x0 + DIL.x1) / 2, 380, { size: 14, weight: 800 });
}
const elongation = (st) => RODS[st.rod] * (st.dT / 50); // mm

function drawStrip(ctx) {
  const st = S.sol;
  const [top, bot] = STRIPS[st.strip];
  const x0 = 120, y0 = 200, L = 340;
  // curvature from the difference of expansion (exaggerated ×120 to be visible)
  const k = (ALPHA[top] - ALPHA[bot]) * 1e-6 * (st.sT - TA) * 0.7; // 1/px, much exaggerated
  const pts = (off) => { const out = []; for (let i = 0; i <= 40; i++) { const s = (i / 40) * L; const a = k * s; const x = Math.abs(k) < 1e-7 ? x0 + s : x0 + Math.sin(a) / k; const y = Math.abs(k) < 1e-7 ? y0 : y0 + (1 - Math.cos(a)) / k; out.push([x - off * Math.sin(a), y + off * Math.cos(a)]); } return out; };
  const band = (o1, o2, col) => { const a = pts(o1), b = pts(o2).reverse(); ctx.fillStyle = cssVar(col); ctx.beginPath(); [...a, ...b].forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill(); };
  band(-7, 0, ROD_COLORS[top]);
  band(0, 7, ROD_COLORS[bot]);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.8;
  ctx.fillStyle = cssVar('--box'); ctx.fillRect(x0 - 40, y0 - 24, 44, 48); // clamp
  ctx.fillRect(x0 - 26, y0 + 24, 12, BENCH - y0 - 24);
  label(ctx, t(`rod.${top}`), x0 + 60, y0 - 22, { size: 12, weight: 700 });
  label(ctx, t(`rod.${bot}`), x0 + 60, y0 + 24, { size: 12, weight: 700 });
  if (st.sTarget > TA) drawBunsen(ctx, { x: 360, yBench: BENCH, h: BENCH - y0 - 40, on: true, t: clock, scale: 0.9 });
  if (st.sTarget < TA) { ctx.save(); ctx.globalAlpha = 0.55; ctx.fillStyle = cssVar('--ice'); ctx.fillRect(x0 + 20, y0 + 60, L, 50); ctx.restore(); label(ctx, t('lbl.coldMix'), x0 + 20 + L / 2, y0 + 85, { size: 12 }); }
  // reference line: the straight strip at room temperature
  ctx.save(); ctx.setLineDash([5, 5]); ctx.strokeStyle = cssVar('--muted'); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + L, y0); ctx.stroke(); ctx.restore();
  label(ctx, `θ = ${qty(st.sT, 0, '°C')}`, 470, 60, { size: 15, weight: 800 });
}

const RING = { cx: 300, y: 260, r: 40 };
const ballR = (T) => 39.6 * (1 + (T - TA) * 4e-4); // exaggerated expansion of the copper sphere
function drawRing(ctx) {
  const st = S.sol;
  // stand with ring
  ctx.fillStyle = cssVar('--lever');
  ctx.fillRect(150, 120, 8, BENCH - 120); ctx.fillRect(120, BENCH - 8, 70, 8);
  ctx.fillRect(154, RING.y - 3, RING.cx - RING.r - 154, 6);
  ctx.strokeStyle = cssVar('--copper'); ctx.lineWidth = 7;
  ctx.beginPath(); ctx.ellipse(RING.cx, RING.y, RING.r + 4, 9, 0, 0, Math.PI * 2); ctx.stroke();
  // sphere on its chain
  const r = ballR(st.ballT);
  const by = RING.y - 70 + st.ballY;
  ctx.strokeStyle = cssVar('--thread'); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(RING.cx, 30); ctx.lineTo(RING.cx, by - r); ctx.stroke();
  const hot = clamp((st.ballT - TA) / 300, 0, 1);
  const g = ctx.createRadialGradient(RING.cx - r * 0.3, by - r * 0.3, 2, RING.cx, by, r);
  g.addColorStop(0, '#f6c79b'); g.addColorStop(1, hot > 0.3 ? `rgb(${200 + 40 * hot},${100 - 40 * hot},40)` : cssVar('--copper'));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(RING.cx, by, r, 0, Math.PI * 2); ctx.fill();
  // front half of the ring over the sphere
  ctx.strokeStyle = cssVar('--copper'); ctx.lineWidth = 7;
  ctx.beginPath(); ctx.ellipse(RING.cx, RING.y, RING.r + 4, 9, 0, 0, Math.PI); ctx.stroke();
  if (st.ballTarget > TA) drawBunsen(ctx, { x: RING.cx + 110, yBench: BENCH, h: 150, on: true, t: clock, scale: 0.9 });
  label(ctx, `θ = ${qty(st.ballT, 0, '°C')}`, 470, 60, { size: 15, weight: 800 });
}

/* ---------- Tab 2: liquids ---------- */
// Flask full of liquid with a thin tube through the stopper (Act. 3)
function flaskWithTube(ctx, cx, yBot, R, level, color, rLabel = true) {
  const cy = yBot - R;
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fillStyle = cssVar(color); ctx.globalAlpha = 0.55; ctx.fill();
  ctx.restore();
  ctx.strokeStyle = cssVar('--glass-stroke'); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, R, -Math.PI / 2 + 0.25, -Math.PI / 2 - 0.25 + Math.PI * 2); ctx.stroke();
  ctx.fillStyle = cssVar(color); ctx.globalAlpha = 0.55; ctx.fillRect(cx - 11, cy - R - 26, 22, 30); ctx.globalAlpha = 1;
  ctx.strokeRect(cx - 11, cy - R - 26, 22, 30);
  ctx.fillStyle = cssVar('--wood'); ctx.fillRect(cx - 14, cy - R - 34, 28, 14);
  // thin tube
  const top = 40;
  ctx.fillStyle = cssVar('--glass-fill'); ctx.fillRect(cx - 3, top, 6, cy - R - 34 - top);
  ctx.strokeStyle = cssVar('--glass-stroke'); ctx.lineWidth = 1.2; ctx.strokeRect(cx - 3, top, 6, cy - R - 34 - top + 14);
  ctx.fillStyle = cssVar(color); ctx.fillRect(cx - 2, level, 4, cy - R - 20 - level);
  return { top, mark: (y, txt) => { ctx.strokeStyle = cssVar('--mark'); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - 12, y); ctx.lineTo(cx + 12, y); ctx.stroke(); if (rLabel) label(ctx, txt, cx + 26, y, { size: 13, weight: 800, color: cssVar('--mark') }); } };
}
const LIQ = { cx: 260, yBot: 400, R: 70, y0: 170, k: 3200 }; // k: px of the tube per unit of relative volume change
const GLASS_SHOW = 6; // the expansion of the glass is shown 6 times larger, so that the small drop of the level can be seen
function drawFlaskTube(ctx) {
  const st = S.liq;
  if (st.hot) { waterRect(ctx, 140, 380, 230, BENCH - 2, 0.3); label(ctx, t('lbl.hotWater'), 200, 420, { size: 11, weight: 700 }); }
  // the glass expands first (its volume grows): the level drops a little; then the liquid expands more
  const lvl = LIQ.y0 - LIQ.k * (BETA[st.liquid] * (st.Tl - TA) - GLASS_SHOW * BETA.glass * (st.Tg - TA));
  const f = flaskWithTube(ctx, LIQ.cx, LIQ.yBot, LIQ.R, lvl, st.liquid === 'water' ? '--water' : '--ink');
  f.mark(LIQ.y0, 'R');
  if (st.hot) { ctx.strokeStyle = cssVar('--glass-stroke'); ctx.lineWidth = 2.2; ctx.strokeRect(140, 230, 240, BENCH - 230); }
  label(ctx, `${t('lbl.glass')} ${qty(st.Tg, 0, '°C')}`, 470, 120, { size: 13, weight: 700 });
  label(ctx, `${t(`liq.${st.liquid}`)} ${qty(st.Tl, 0, '°C')}`, 470, 150, { size: 13, weight: 700 });
  const d = (LIQ.y0 - lvl) / 10; // cm on the tube (10 px per cm)
  label(ctx, `${t('lbl.levelVsR')} ${d >= 0 ? '+' : ''}${num(d, 1)} cm`, 470, 190, { size: 14, weight: 800, color: d < 0 ? cssVar('--bad') : cssVar('--good') });
}
function drawTwo(ctx) {
  const st = S.liq;
  if (st.hot2) { waterRect(ctx, 80, 520, 250, BENCH - 2, 0.3); }
  const y0 = 230, k = 2400;
  const lw = y0 - k * (BETA.water - BETA.glass) * (st.T2 - TA);
  const la = y0 - k * (BETA.alcohol - BETA.glass) * (st.T2 - TA);
  flaskWithTube(ctx, 200, 410, 60, lw, '--water', false).mark(y0, '');
  flaskWithTube(ctx, 400, 410, 60, la, '--ink', false).mark(y0, '');
  label(ctx, t('liq.water'), 200, 425 - 140, { size: 12, weight: 700, halo: true });
  label(ctx, t('liq.alcohol'), 400, 425 - 140, { size: 12, weight: 700, halo: true });
  if (st.hot2) { ctx.strokeStyle = cssVar('--glass-stroke'); ctx.lineWidth = 2.2; ctx.strokeRect(80, 250, 440, BENCH - 250); label(ctx, t('lbl.hotWater80'), 300, 270, { size: 11, weight: 700 }); }
  label(ctx, `θ = ${qty(st.T2, 0, '°C')}`, 300, 60, { size: 15, weight: 800 });
}
// Ex. 7: a graduated tube shows the volume of 1 kg of water near 1000 cm³
function drawAnomaly(ctx) {
  const st = S.liq;
  const x = 220, yTop = 60, yBot = 380, vMin = 999.98, vMax = 1000.14;
  const Y = (v) => yBot - ((v - vMin) / (vMax - vMin)) * (yBot - yTop);
  ctx.fillStyle = cssVar('--glass-fill'); ctx.fillRect(x - 20, yTop - 10, 40, yBot - yTop + 30);
  waterRect(ctx, x - 18, x + 18, Y(waterV(st.Tw)), yBot + 18, 0.55);
  ctx.strokeStyle = cssVar('--glass-stroke'); ctx.lineWidth = 2; ctx.strokeRect(x - 20, yTop - 10, 40, yBot - yTop + 30);
  ctx.strokeStyle = cssVar('--scale'); ctx.fillStyle = cssVar('--scale'); ctx.font = font(11, 700); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  for (let v = 1000.0; v <= 1000.14 + 1e-6; v += 0.01) {
    const y = Y(v), big = Math.round(v * 100) % 5 === 0;
    ctx.lineWidth = big ? 1.4 : 0.8; ctx.beginPath(); ctx.moveTo(x + 20, y); ctx.lineTo(x + (big ? 34 : 27), y); ctx.stroke();
    if (big) ctx.fillText(num(v, 2), x + 38, y);
  }
  ctx.fillText('cm³', x + 38, yTop - 20);
  // small graph V(θ) of the book table, with the current point
  const g = { x0: 380, y0: 80, w: 190, h: 150 };
  const X = (T) => g.x0 + (T / 8) * g.w, YV = (v) => g.y0 + g.h - ((v - 999.99) / 0.14) * g.h;
  ctx.strokeStyle = cssVar('--border'); ctx.lineWidth = 1; ctx.strokeRect(g.x0, g.y0, g.w, g.h);
  ctx.fillStyle = cssVar('--muted'); ctx.font = font(10); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let T = 0; T <= 8; T += 2) ctx.fillText(String(T), X(T), g.y0 + g.h + 4);
  ctx.fillStyle = cssVar('--text'); ctx.font = font(11, 700); ctx.textAlign = 'right'; ctx.fillText('θ (°C)', g.x0 + g.w, g.y0 + g.h + 18);
  ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText('V (cm³)', g.x0, g.y0 - 4);
  ctx.fillStyle = cssVar('--water-dark');
  WATER_V.forEach((v, T) => { ctx.beginPath(); ctx.arc(X(T), YV(v), 3, 0, Math.PI * 2); ctx.fill(); });
  ctx.fillStyle = cssVar('--bad'); ctx.beginPath(); ctx.arc(X(st.Tw), YV(waterV(st.Tw)), 5, 0, Math.PI * 2); ctx.fill();
  label(ctx, `θ = ${qty(st.Tw, 1, '°C')}`, 475, 300, { size: 15, weight: 800 });
  label(ctx, `V = ${qty(waterV(st.Tw), 2, 'cm³')}`, 475, 330, { size: 15, weight: 800 });
}

/* ---------- Tab 3: gases ---------- */
function drawIndex(ctx) {
  const st = S.gas;
  const cx = 200, cy = 300, R = 80;
  // flask (air, or full of liquid) and bent thin tube with an index of coloured water
  if (st.fill === 'water') { ctx.save(); ctx.globalAlpha = 0.5; ctx.fillStyle = cssVar('--water'); ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(cx - 12, cy - R - 30, 24, 34); ctx.restore(); }
  ctx.strokeStyle = cssVar('--glass-stroke'); ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.arc(cx, cy, R, -Math.PI / 2 + 0.16, -Math.PI / 2 - 0.16 + Math.PI * 2); ctx.stroke();
  ctx.strokeRect(cx - 12, cy - R - 30, 24, 34);
  ctx.fillStyle = cssVar('--wood'); ctx.fillRect(cx - 15, cy - R - 38, 30, 14);
  const ty = 150;
  ctx.strokeStyle = cssVar('--glass-stroke'); ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(cx - 3, cy - R - 38); ctx.lineTo(cx - 3, ty + 3); ctx.lineTo(560, ty + 3); ctx.moveTo(cx + 3, cy - R - 38); ctx.lineTo(cx + 3, ty - 3); ctx.lineTo(560, ty - 3); ctx.stroke();
  // ruler (cm) along the tube
  const x0 = 230, PX_CM = 20;
  ctx.strokeStyle = cssVar('--scale'); ctx.fillStyle = cssVar('--scale'); ctx.font = font(10, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let c = 0; c <= 16; c++) { const x = x0 + c * PX_CM; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, ty + 8); ctx.lineTo(x, ty + (c % 5 === 0 ? 20 : 14)); ctx.stroke(); if (c % 5 === 0) ctx.fillText(String(c), x, ty + 22); }
  ctx.fillText('cm', x0 + 16 * PX_CM + 16, ty + 22);
  const d = indexShift(st);
  ctx.fillStyle = cssVar('--dye');
  ctx.fillRect(x0 + d * PX_CM - 6, ty - 2.5, 12, 5);
  // hands around the flask
  if (st.touch) {
    ctx.fillStyle = cssVar('--skin'); ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(cx + s * (R + 4), cy + 10, 26, 46, s * 0.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  }
  label(ctx, `${t('lbl.inFlask')} ${qty(st.T, 1, '°C')}`, 450, 300, { size: 14, weight: 800 });
  label(ctx, `${t('lbl.indexMoved')} ${num(d, 1)} cm`, 450, 330, { size: 14, weight: 800, color: cssVar('--good') });
}
// The index moves by ΔV / (cross-section of the tube); flask 250 mL, tube 0.5 cm²
const indexShift = (st) => (250 * (st.fill === 'air' ? (st.T - TA) / (273 + TA) : (BETA.water - BETA.glass) * (st.T - TA))) / 0.6;

const P0 = 1.013;
const gasP = (st) => P0 * (273 + st.Tb) / (273 + TA);
function drawPressure(ctx) {
  const st = S.gas;
  const x0 = 140, x1 = 340, yTop = 140, yBot = BENCH - 4;
  if (st.hot) { waterRect(ctx, 100, 380, 230, BENCH - 2, 0.35); }
  // bottle (closed)
  ctx.fillStyle = cssVar('--glass-fill'); ctx.strokeStyle = cssVar('--glass-stroke'); ctx.lineWidth = 2.2;
  roundRect(ctx, x0, yTop, x1 - x0, yBot - yTop, 14); ctx.fill(); ctx.stroke();
  ctx.fillStyle = cssVar('--bus'); ctx.fillRect(x0 + 10, yTop - 18, x1 - x0 - 20, 20); // lid
  if (st.hot) { ctx.strokeStyle = cssVar('--glass-stroke'); ctx.strokeRect(100, 230, 280, BENCH - 230); label(ctx, t('lbl.hotWater'), 240, 418, { size: 11, weight: 700 }); }
  // thermometer inside
  const g = thermoGeom({ x: x0 + 34, yBulb: 400, yTop: 160, t0: 0, t1: 70, y0: 380, y1: 170, bulbR: 6, stemW: 5 });
  drawThermometer(ctx, g, { T: st.Tb, liquid: 'alcohol', plate: true, scale: { minor: 1, mid: 5, major: 10, label: 10 }, unit: '°C', plateRight: 30 });
  // metallic barometer (dial in bar)
  const c = { x: x1 - 66, y: 300, r: 50 };
  ctx.fillStyle = cssVar('--thermo-plate'); ctx.strokeStyle = cssVar('--box'); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  const pa = (p) => Math.PI * 0.75 + ((p - 0.9) / 0.4) * Math.PI * 1.5; // 0.9 … 1.3 bar
  ctx.strokeStyle = cssVar('--scale'); ctx.fillStyle = cssVar('--scale'); ctx.font = font(9, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let k = 0; k <= 40; k++) { const p = 0.9 + k * 0.01, a = pa(p), l = k % 10 === 0 ? 9 : k % 5 === 0 ? 6 : 3; ctx.lineWidth = k % 10 === 0 ? 1.4 : 0.8; ctx.beginPath(); ctx.moveTo(c.x + Math.cos(a) * (c.r - 4), c.y + Math.sin(a) * (c.r - 4)); ctx.lineTo(c.x + Math.cos(a) * (c.r - 4 - l), c.y + Math.sin(a) * (c.r - 4 - l)); ctx.stroke(); if (k % 10 === 0) ctx.fillText(num(p, 1), c.x + Math.cos(a) * (c.r - 20), c.y + Math.sin(a) * (c.r - 20)); }
  ctx.fillText('bar', c.x, c.y + 22);
  const a = pa(gasP(st));
  ctx.strokeStyle = cssVar('--bad'); ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x + Math.cos(a) * (c.r - 10), c.y + Math.sin(a) * (c.r - 10)); ctx.stroke();
  ctx.fillStyle = cssVar('--box'); ctx.beginPath(); ctx.arc(c.x, c.y, 3.5, 0, Math.PI * 2); ctx.fill();
  label(ctx, `θ = ${qty(st.Tb, 0, '°C')}`, 470, 150, { size: 15, weight: 800 });
  label(ctx, `p = ${qty(gasP(st), 2, 'bar')}`, 470, 180, { size: 15, weight: 800 });
}

/* ================================================================
   Animation loop
   ================================================================ */
let measT = 0;
const relaxTo = (v, target, dt, tau) => v + (target - v) * (1 - Math.exp(-dt / tau));
const loop = createLoop({
  dt: 1 / 60,
  step: (dt) => {
    clock += dt;
    if (!shell) return true;
    const st = S[shell.tab];
    if (shell.tab === 'sol') {
      if (st.exp === 'dil') {
        if (st.burn > 0) { st.burn = Math.max(0, st.burn - dt); st.dT = st.burn === 0 ? 50 : Math.min(50, st.dT + dt * 5); } // the alcohol burns for 10 s: +50 °C
        else st.dT = relaxTo(st.dT, 0, dt, 25);
        st.max = Math.max(st.max, st.dT);
      } else if (st.exp === 'strip') st.sT = relaxTo(st.sT, st.sTarget, dt, 2.5);
      else {
        st.ballT = relaxTo(st.ballT, st.ballTarget, dt, 2.5);
        if (st.drop) {
          const r = ballR(st.ballT);
          const stopY = r > RING.r ? 70 - Math.sqrt(Math.max(0, r * r - RING.r * RING.r)) - 2 : 200;
          st.ballV += 500 * dt; st.ballY = Math.min(stopY, st.ballY + st.ballV * dt);
          if (st.ballY >= stopY) st.ballV = 0;
        }
      }
    } else if (shell.tab === 'liq') {
      if (st.exp === 'flask') { const T = st.hot ? 70 : TA; st.Tg = relaxTo(st.Tg, T, dt, 1.2); st.Tl = relaxTo(st.Tl, st.Tg, dt, 12); } // the liquid is heated through the glass
      else if (st.exp === 'two') st.T2 = relaxTo(st.T2, st.hot2 ? 80 : TA, dt, 6);
    } else {
      if (st.exp === 'index') st.T = relaxTo(st.T, st.touch ? (st.fill === 'air' ? 30 : 24) : TA, dt, 6); // water warms much less (larger heat capacity)
      else st.Tb = relaxTo(st.Tb, st.hot ? 60 : TA, dt, 6);
    }
    measT += dt;
    return true;
  },
  render: () => { draw(); if (measT > 0.15) { measT = 0; updateMeasures(); } },
});

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
  controlsBody.append(...controls);
  ui.dl = el('dl', { class: 'meas' });
  ui.status = el('div', { class: 'status', hidden: '' });
  measuresBody.append(ui.dl, ...extra, ui.status);
}
const resetBtn = (id) => createButton({ labelKey: 'ui.reset', onClick: () => resetTab(id), variant: 'ghost' });
const seg = (labelKey, values, prefix, value, onChange) => createSegmented({ labelKey, options: values.map((v) => ({ value: v, labelKey: `${prefix}.${v}` })), value, onChange });
const row = (...c) => el('div', { class: 'btn-row' }, c);

function buildSol() {
  const st = S.sol;
  ui.exp = seg('ctl.exp', ['dil', 'strip', 'ring'], 'expS', st.exp, (v) => { st.exp = v; st.fb = null; shell.refreshActivity(); buildTab('sol'); });
  const ctl = [ui.exp.root];
  const extra = [];
  if (st.exp === 'dil') {
    ui.rod = seg('ctl.rod', Object.keys(RODS), 'rod', st.rod, (v) => { if (st.burn > 0 || st.dT > 1) { st.fb = { type: 'warn', key: 'fb.waitCool' }; ui.rod?.set(st.rod); updateMeasures(); return; } st.rod = v; st.max = 0; st.fb = null; });
    ctl.push(ui.rod.root);
    ctl.push(row(createButton({ labelKey: 'ctl.burn', variant: 'primary', onClick: () => { if (st.burn > 0 || st.dT > 1) { st.fb = { type: 'warn', key: 'fb.waitCool' }; } else { st.burn = 10; st.max = 0; st.fb = null; } updateMeasures(); } }),
      createButton({ labelKey: 'ctl.recordMax', onClick: recordMax }), createButton({ labelKey: 'ctl.coolNow', variant: 'ghost', onClick: () => { st.burn = 0; st.dT = 0; } })));
    ui.table = el('table', { class: 'data' });
    extra.push(ui.table);
  } else if (st.exp === 'strip') {
    ctl.push(seg('ctl.strip', Object.keys(STRIPS), 'strip', st.strip, (v) => { st.strip = v; }).root);
    ctl.push(seg('ctl.stripT', ['cold', 'room', 'hot'], 'stripT', st.sTarget < TA ? 'cold' : st.sTarget > TA ? 'hot' : 'room', (v) => { st.sTarget = v === 'cold' ? -40 : v === 'hot' ? 250 : TA; }).root);
  } else {
    ctl.push(row(createButton({ labelKey: 'ctl.drop', variant: 'primary', onClick: () => { if (st.drop) { st.drop = false; st.ballY = 0; st.ballV = 0; } else { st.drop = true; st.ballV = 0; } } }),
      createButton({ labelKey: 'ctl.heatBall', onClick: () => { st.drop = false; st.ballY = 0; st.ballTarget = 300; } }),
      createButton({ labelKey: 'ctl.coolBall', onClick: () => { st.drop = false; st.ballY = 0; st.ballTarget = TA; } })));
  }
  ctl.push(row(resetBtn('sol')));
  panel(ctl, extra);
}
function recordMax() {
  const st = S.sol;
  if (st.max < 1) { st.fb = { type: 'warn', key: 'fb.burnFirst' }; updateMeasures(); return; }
  if (st.burn > 0) { st.fb = { type: 'warn', key: 'fb.stillBurning' }; updateMeasures(); return; }
  const div = Math.round((RODS[st.rod] * (st.max / 50) / MM_PER_DIV) * 20) / 20; // read to a quarter of a division
  st.rows = st.rows.filter((r) => r.rod !== st.rod);
  st.rows.push({ rod: st.rod, div });
  st.fb = { type: 'good', key: 'fb.recorded', params: { d: num(div, 2) } };
  ui.tableSig = null;
  updateMeasures();
}
function updateSol() {
  const st = S.sol;
  if (st.exp === 'dil') {
    measRows([
      [t('m.rod'), t(`rod.${st.rod}`)],
      [t('m.dT'), qty(st.dT, 0, '°C')],
      [t('m.needle'), `${num(elongation(st) / MM_PER_DIV, 1)} ${t('m.divs')}`],
      [t('m.alcohol'), t(st.burn > 0 ? 'alc.burning' : 'alc.out')],
    ]);
    const sig = calcSig(st.rows) + st.rows.map((r) => r.rod + r.div).join();
    if (ui.tableSig !== sig) {
      ui.tableSig = sig;
      const head = el('tr', {}, [el('th', {}, t('m.rodCol')), el('th', {}, t('m.devCol')), el('th', {}, t('m.dLCol'))]);
      const body = st.rows.map((r) => el('tr', {}, [el('td', {}, t(`rod.${r.rod}`)), el('td', {}, num(r.div, 2)), calcCell(r, 'dL', { expected: r.div * MM_PER_DIV, decimals: 2, onCheck: (res) => { st.fb = res === 'ok' ? { type: 'good', key: 'fb.dLok' } : res === 'wrong' ? { type: 'bad', key: 'fb.dLwrong' } : { type: 'warn', key: 'calc.invalid' }; updateMeasures(); } })]));
      ui.table.replaceChildren(el('thead', {}, head), el('tbody', {}, body));
    }
    ui.table.hidden = !st.rows.length;
  } else if (st.exp === 'strip') {
    const [a, b] = STRIPS[st.strip];
    const bend = Math.abs(st.sT - TA) < 3 ? 'bend.straight' : (ALPHA[a] - ALPHA[b]) * (st.sT - TA) > 0 ? 'bend.down' : 'bend.up';
    measRows([[t('m.theta'), qty(st.sT, 0, '°C')], [t('m.strip'), t(bend, { a: t(`rod.${a}`), b: t(`rod.${b}`) })]]);
  } else {
    const r = ballR(st.ballT);
    measRows([[t('m.ballT'), qty(st.ballT, 0, '°C')], [t('m.passes'), t(r < RING.r ? 'pass.yes' : 'pass.no'), r < RING.r ? 'good-text' : 'bad-text']]);
  }
  showStatus(st.fb);
}

function buildLiq() {
  const st = S.liq;
  ui.exp = seg('ctl.exp', ['flask', 'two', 'anomaly'], 'expL', st.exp, (v) => { st.exp = v; shell.refreshActivity(); buildTab('liq'); });
  const ctl = [ui.exp.root];
  if (st.exp === 'flask') {
    ctl.push(seg('ctl.liquid', ['water', 'alcohol'], 'liq', st.liquid, (v) => { st.liquid = v; st.hot = false; st.Tg = st.Tl = TA; ui.hotBtn && setHot(); }).root);
    ui.hotBtn = createButton({ labelKey: 'ctl.immerse', variant: 'primary', onClick: () => { st.hot = !st.hot; setHot(); } });
    const setHot = () => { ui.hotBtn.dataset.i18n = st.hot ? 'ctl.takeOut' : 'ctl.immerse'; ui.hotBtn.textContent = t(ui.hotBtn.dataset.i18n); };
    setHot();
    ctl.push(row(ui.hotBtn, resetBtn('liq')));
  } else if (st.exp === 'two') {
    ui.hotBtn = createButton({ labelKey: 'ctl.immerse', variant: 'primary', onClick: () => { st.hot2 = !st.hot2; ui.hotBtn.dataset.i18n = st.hot2 ? 'ctl.takeOut' : 'ctl.immerse'; ui.hotBtn.textContent = t(ui.hotBtn.dataset.i18n); } });
    if (st.hot2) { ui.hotBtn.dataset.i18n = 'ctl.takeOut'; ui.hotBtn.textContent = t('ctl.takeOut'); }
    ctl.push(row(ui.hotBtn, resetBtn('liq')));
  } else {
    ui.tw = createSlider({ labelKey: 'ctl.tw', min: 0, max: 8, step: 0.5, value: st.Tw, unit: '°C', decimals: 1, onInput: (v) => { st.Tw = v; } });
    ctl.push(ui.tw.root, row(resetBtn('liq')));
  }
  panel(ctl);
}
function updateLiq() {
  const st = S.liq;
  if (st.exp === 'flask') {
    const lvl = LIQ.k * (BETA[st.liquid] * (st.Tl - TA) - GLASS_SHOW * BETA.glass * (st.Tg - TA)) / 10;
    measRows([[t('m.glassT'), qty(st.Tg, 0, '°C')], [t('m.liqT'), qty(st.Tl, 0, '°C')], [t('m.level'), `${lvl >= 0 ? '+' : ''}${num(lvl, 1)} cm`, lvl < -0.05 ? 'bad-text' : '']]);
  } else if (st.exp === 'two') {
    const k = 2400 / 10;
    measRows([[t('m.theta'), qty(st.T2, 0, '°C')], [t('m.riseWater'), `${num(k * (BETA.water - BETA.glass) * (st.T2 - TA), 1)} cm`], [t('m.riseAlcohol'), `${num(k * (BETA.alcohol - BETA.glass) * (st.T2 - TA), 1)} cm`]]);
  } else {
    measRows([[t('m.theta'), qty(st.Tw, 1, '°C')], [t('m.v1kg'), qty(waterV(st.Tw), 2, 'cm³')], [t('m.rho'), `${num(1000 / waterV(st.Tw), 5)} g/cm³`]]);
  }
  showStatus(null);
}

function buildGas() {
  const st = S.gas;
  ui.exp = seg('ctl.exp', ['index', 'pressure'], 'expG', st.exp, (v) => { st.exp = v; shell.refreshActivity(); buildTab('gas'); });
  const ctl = [ui.exp.root];
  if (st.exp === 'index') {
    ctl.push(seg('ctl.fill', ['air', 'water'], 'fill', st.fill, (v) => { st.fill = v; }).root);
    ctl.push(seg('ctl.touch', ['no', 'yes'], 'opt', st.touch ? 'yes' : 'no', (v) => { st.touch = v === 'yes'; }).root);
  } else {
    ui.hotBtn = createButton({ labelKey: st.hot ? 'ctl.takeOut' : 'ctl.immerseBottle', variant: 'primary', onClick: () => { st.hot = !st.hot; ui.hotBtn.dataset.i18n = st.hot ? 'ctl.takeOut' : 'ctl.immerseBottle'; ui.hotBtn.textContent = t(ui.hotBtn.dataset.i18n); } });
    ctl.push(row(ui.hotBtn));
  }
  ctl.push(row(resetBtn('gas')));
  panel(ctl);
}
function updateGas() {
  const st = S.gas;
  if (st.exp === 'index') measRows([[t('m.content'), t(`fill.${st.fill}`)], [t('m.theta'), qty(st.T, 1, '°C')], [t('m.shift'), `${num(indexShift(st), 1)} cm`]]);
  else measRows([[t('m.airT'), qty(st.Tb, 0, '°C')], [t('m.p'), qty(gasP(st), 2, 'bar')]]);
  showStatus(null);
}

function buildTab(id) {
  controlsBody.replaceChildren(); measuresBody.replaceChildren(); ui = {};
  if (id === 'sol') buildSol(); else if (id === 'liq') buildLiq(); else buildGas();
  updateMeasures(); draw();
}
function updateMeasures() {
  if (!shell || !ui.dl) return;
  if (shell.tab === 'sol') updateSol(); else if (shell.tab === 'liq') updateLiq(); else updateGas();
}
function resetTab(id) {
  const fresh = initialState();
  fresh[id].exp = S[id].exp;
  S[id] = fresh[id];
  buildTab(id);
}
onLangChange(() => { if (shell) buildTab(shell.tab); });

shell = initSim({
  strings,
  notRequired: true, // Ch.9 is not in the CRDP 2026–2027 list (curriculum-scope.md)
  tabs: [
    { id: 'sol', labelKey: 'tab.sol' },
    { id: 'liq', labelKey: 'tab.liq' },
    { id: 'gas', labelKey: 'tab.gas' },
  ],
  initialTab: 'sol',
  onTab: buildTab,
  activityKey: (tab) => `act.${tab}.${S[tab].exp}`,
});
shell.start();
loop.start();
if (DEBUG) window.__sim = { S, indexShift, gasP, waterV };
