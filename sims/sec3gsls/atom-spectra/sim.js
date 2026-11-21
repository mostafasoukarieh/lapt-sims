// Sec 3 GS-LS — Chapter 17: The atom. Tabs "models" (17.1–17.2) and "laser" (17.6) are for General Sciences only.
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num, qty } from '../../../shared/format.js';
import { createButton, createSegmented, createSlider, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, arrow } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { label } from '../../../shared/figures.js';
import { calcCell, calcSig, calcDone } from '../../../shared/calc-cell.js';
import { lambdaCSS } from '../../../shared/wave-optics.js';
import { LINES, WEIGHTS, drawSpectrum } from '../../../shared/spectrum.js';

const TAU = 2 * Math.PI;
const W = 600;
const TABS = ['models', 'spectro', 'hydrogen', 'levels', 'absorption', 'laser'];
const HEIGHTS = { models: 420, spectro: 400, hydrogen: 320, levels: 440, absorption: 460, laser: 440 };
// constants: Rydberg constant of the book; h, c, e rounded as in the exercises
const RH = 1.097e7, H = 6.63e-34, C0 = 3e8, E1 = 1.6e-19;
const En = (n) => (n === Infinity ? 0 : -13.6 / (n * n)); // eV
const SERIES = ['lyman', 'balmer', 'paschen', 'brackett', 'pfund', 'n6'];

function initialState(tab) {
  switch (tab) {
    case 'models': return { model: 'rutherford', mode: 'beam', aim: 1, on: true, al: [], trails: [], n: { s: 0, d: 0, b: 0 }, tShot: 0 };
    case 'spectro': return { src: 'hydrogen', disp: 'prism', zoom: false, cur: 656.3 };
    case 'hydrogen': return { n: 3, rows: [], fb: null };
    case 'levels': return { ni: 3, nf: 2, anim: -1, rows: [], fb: null };
    case 'absorption': return { el: 'sodium', burner: false, vap: 0, compare: false };
    default: return { mode: 'processes', proc: 'absorption', pt: -1, delay: 1, dir: 0, pump: 0, atoms: null, ph: [], out: 0, outAcc: 0, t: 0 };
  }
}
let S = Object.fromEntries(TABS.map((k) => [k, initialState(k)]));

/* ================================================================
   Canvas and loop
   ================================================================ */
let shell;
let drawQueued = false;
const canvas = document.getElementById('stage');
canvas.style.touchAction = 'none';
const view = setupCanvas(canvas, { width: W, height: 420, maxHeightVh: () => (window.innerWidth < 880 ? 54 : 78), onResize: () => requestDraw() });
function requestDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; draw(); });
}
onThemeChange(() => requestDraw());
let seed = 2024;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

/* ---------- Rutherford scattering (17.2) ---------- */
const V_A = 320;                 // speed of the α particles (px/s)
const K_A = 0.1 * V_A * V_A;     // a = K / r²: deviation 90° for an impact parameter of 0.1 px
const R_TH = 29;                 // radius of a Thomson atom (px)
const NUC = [];
for (let c = 0; c < 3; c++) for (let r = 0; r < 6; r++) NUC.push({ x: 260 + c * 62, y: 66 + r * 54 + (c % 2) * 27 });
function accel(a, model) {
  let ax = 0, ay = 0, rmin = 1e9;
  for (const n of NUC) {
    const dx = a.x - n.x, dy = a.y - n.y, d2 = dx * dx + dy * dy, d = Math.sqrt(d2);
    if (d > 120) continue;
    if (d < rmin) rmin = d;
    let f;
    if (model === 'thomson' && d < R_TH) f = K_A / (R_TH * R_TH * R_TH);      // uniform sphere: field ∝ r inside
    else f = K_A / ((d2 + 0.0004) * Math.max(d, 0.02));
    ax += f * dx; ay += f * dy;
  }
  a.ax = ax; a.ay = ay;
  return rmin;
}
function launch(st, y) { st.al.push({ x: 8, y, vx: V_A, vy: 0, ax: 0, ay: 0, tr: [8, y] }); }
function stepAlpha(st, dt) {
  for (const a of st.al) {
    let rem = dt;
    while (rem > 0) {
      const rmin = accel(a, st.model);
      const h = Math.min(rem, Math.max(2e-5, (0.05 * Math.max(rmin, 0.03)) / V_A));
      a.vx += a.ax * h; a.vy += a.ay * h; a.x += a.vx * h; a.y += a.vy * h; rem -= h;
    }
    const n = a.tr.length;
    if ((a.x - a.tr[n - 2]) ** 2 + (a.y - a.tr[n - 1]) ** 2 > 16) a.tr.push(a.x, a.y);
  }
  for (let i = st.al.length - 1; i >= 0; i--) {
    const a = st.al[i];
    if (a.x > 604 || a.x < -4 || a.y < 40 || a.y > 374) {
      const ang = (Math.acos(Math.max(-1, Math.min(1, a.vx / Math.hypot(a.vx, a.vy)))) * 180) / Math.PI;
      if (ang < 5) st.n.s++; else if (ang < 90) st.n.d++; else st.n.b++;
      a.ang = ang;
      st.trails.push(a);
      if (st.trails.length > (st.mode === 'single' ? 8 : 60)) st.trails.shift();
      st.al.splice(i, 1);
    }
  }
}

/* ---------- Laser (17.6) ---------- */
const TUBE = { x0: 96, x1: 504, y0: 170, y1: 270 };
function makeAtoms() {
  const a = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 12; c++) a.push({ x: TUBE.x0 + 22 + c * 33 + (r % 2) * 10, y: TUBE.y0 + 16 + r * 23, e: 0 });
  return a;
}
function stepLaser(st, dt) {
  st.t += dt;
  if (st.mode === 'processes') {
    if (st.pt >= 0) { st.pt += dt; if (st.pt > 4.2) st.pt = -1; }
    return true;
  }
  if (!st.atoms) st.atoms = makeAtoms();
  const pumpRate = (st.pump / 100) * 2.4, spont = 0.35;
  for (const a of st.atoms) {
    if (a.e === 0 && rand() < pumpRate * dt) a.e = 1;
    else if (a.e === 1 && rand() < spont * dt) {
      a.e = 0;
      if (st.ph.length < 260) { const th = rand() * TAU, ax = Math.abs(Math.sin(th)) < 0.2; st.ph.push({ x: a.x, y: a.y, vx: 260 * (ax ? Math.sign(Math.cos(th)) : Math.cos(th)), vy: ax ? 0 : 260 * Math.sin(th), skip: a }); }
    }
  }
  for (let i = st.ph.length - 1; i >= 0; i--) {
    const p = st.ph[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.y < TUBE.y0 || p.y > TUBE.y1) { st.ph.splice(i, 1); continue; }
    if (p.x < TUBE.x0 - 8) { if (Math.abs(p.vy) < 60) { p.vx = -p.vx; p.x = TUBE.x0 - 8; } else { st.ph.splice(i, 1); continue; } }
    if (p.x > TUBE.x1 + 8) {
      if (Math.abs(p.vy) < 60 && rand() < 0.9) { p.vx = -p.vx; p.x = TUBE.x1 + 8; } else { if (Math.abs(p.vy) < 60) st.outAcc += 1; st.ph.splice(i, 1); continue; }
    }
    for (const a of st.atoms) {
      if (a === p.skip) continue;
      if (Math.abs(a.x - p.x) < 5 && Math.abs(a.y - p.y) < 9) {
        p.skip = a;
        if (a.e === 1 && rand() < 0.6) { a.e = 0; if (st.ph.length < 260) st.ph.push({ x: p.x - Math.sign(p.vx) * 3, y: p.y, vx: p.vx, vy: p.vy, skip: a }); }
        else if (a.e === 0 && rand() < 0.6) { a.e = 1; st.ph.splice(i, 1); }
        break;
      }
    }
  }
  st.out += (st.outAcc / dt - st.out) * Math.min(1, dt / 0.8);
  st.outAcc = 0;
  return true;
}

const loop = createLoop({
  step(dt) {
    if (!shell) return false;
    const tab = shell.tab, st = S[tab];
    if (tab === 'models') {
      if (st.mode === 'beam' && st.on) { st.tShot += dt; if (st.tShot > 0.07) { st.tShot = 0; launch(st, 46 + rand() * 322); } }
      stepAlpha(st, dt);
      return st.mode === 'beam' ? true : st.al.length > 0;
    }
    if (tab === 'levels') { if (st.anim >= 0) { st.anim += dt; if (st.anim > 3) { st.anim = -1; return false; } } return st.anim >= 0; }
    if (tab === 'absorption') { const tgt = st.burner ? 1 : 0; st.vap += (tgt - st.vap) * Math.min(1, dt / 1.2); return Math.abs(st.vap - tgt) > 0.003; }
    if (tab === 'laser') return stepLaser(st, dt);
    return false;
  },
  render() { draw(); updateMeasures(); },
});

/* ================================================================
   Drawing
   ================================================================ */
const ink = (ctx, w = 2) => { ctx.strokeStyle = cssVar('--text'); ctx.fillStyle = cssVar('--text'); ctx.lineWidth = w; };
const muted = (ctx, key, x, y, align = 'center', params) => label(ctx, t(key, params), x, y, { size: 11, weight: 600, color: cssVar('--muted'), align });
const radColor = (nm, a = 1) => (nm < 380 ? `rgba(150,90,220,${a})` : nm > 780 ? `rgba(150,40,40,${a})` : lambdaCSS(nm, a));
function wave(ctx, x0, y0, len, ang, lam, color, phase = 0) {
  ctx.save(); ctx.translate(x0, y0); ctx.rotate(ang);
  ctx.strokeStyle = color; ctx.lineWidth = 2.2; ctx.beginPath();
  for (let s = 0; s <= len; s += 1.5) { const env = Math.sin((Math.PI * s) / len); const y = 6 * env * Math.sin((TAU * s) / lam + phase); if (s === 0) ctx.moveTo(s, y); else ctx.lineTo(s, y); }
  ctx.stroke();
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(len + 8, 0); ctx.lineTo(len, -4); ctx.lineTo(len, 4); ctx.closePath(); ctx.fill();
  ctx.restore();
}
function lambdaOf(ni, nf) { return 1e9 / (RH * (1 / (nf * nf) - (ni === Infinity ? 0 : 1 / (ni * ni)))); }

function draw() {
  if (!shell) return;
  const tab = shell.tab;
  if (view.height !== HEIGHTS[tab]) view.setLogicalSize(W, HEIGHTS[tab]);
  const ctx = view.begin();
  ctx.fillStyle = cssVar('--scene-bg');
  roundRect(ctx, 0, 0, W, HEIGHTS[tab], 14);
  ctx.fill();
  ({ models: drawModels, spectro: drawSpectro, hydrogen: drawHydrogen, levels: drawLevels, absorption: drawAbsorption, laser: drawLaser })[tab](ctx, S[tab]);
}

/* ---------- Tab 1: Thomson and Rutherford ---------- */
function drawModels(ctx, st) {
  const ruth = st.model === 'rutherford';
  // gold foil (zoom)
  ctx.save(); ctx.beginPath(); ctx.rect(0, 40, W, 334); ctx.clip();
  ctx.fillStyle = 'rgba(217,173,74,0.13)'; ctx.fillRect(228, 40, 124, 334);
  for (const n of NUC) {
    if (ruth) {
      ctx.strokeStyle = 'rgba(47,116,200,0.35)'; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.arc(n.x, n.y, 24, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      for (let k = 0; k < 3; k++) { const a = n.x * 0.1 + k * 2.1; ctx.fillStyle = cssVar('--minus'); ctx.beginPath(); ctx.arc(n.x + 24 * Math.cos(a), n.y + 24 * Math.sin(a), 2, 0, TAU); ctx.fill(); }
      ctx.fillStyle = cssVar('--plus'); ctx.beginPath(); ctx.arc(n.x, n.y, 3, 0, TAU); ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(214,52,44,0.16)'; ctx.strokeStyle = 'rgba(214,52,44,0.45)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(n.x, n.y, R_TH, 0, TAU); ctx.fill(); ctx.stroke();
      for (let k = 0; k < 4; k++) { const a = n.y * 0.07 + k * 1.6, r = 8 + (k % 2) * 10; ctx.fillStyle = cssVar('--minus'); ctx.beginPath(); ctx.arc(n.x + r * Math.cos(a), n.y + r * Math.sin(a), 2, 0, TAU); ctx.fill(); }
    }
  }
  // trails then particles
  const drawTr = (a, alpha) => {
    const big = a.ang !== undefined && a.ang >= 5;
    ctx.strokeStyle = a.ang === undefined ? 'rgba(217,138,30,0.9)' : big ? `rgba(214,52,44,${alpha})` : `rgba(217,138,30,${alpha * 0.55})`;
    ctx.lineWidth = big ? 2 : 1.2;
    ctx.beginPath(); ctx.moveTo(a.tr[0], a.tr[1]);
    for (let i = 2; i < a.tr.length; i += 2) ctx.lineTo(a.tr[i], a.tr[i + 1]);
    ctx.lineTo(a.x, a.y); ctx.stroke();
  };
  st.trails.forEach((a, i) => drawTr(a, 0.25 + (0.75 * (i + 1)) / st.trails.length));
  for (const a of st.al) { drawTr(a, 1); ctx.fillStyle = cssVar('--s4'); ctx.beginPath(); ctx.arc(a.x, a.y, 3.5, 0, TAU); ctx.fill(); }
  if (st.mode === 'single') {
    ink(ctx, 1); arrow(ctx, 8, NUC[2].y + st.aim, 40, NUC[2].y + st.aim, 7);
    ctx.strokeStyle = cssVar('--s4'); ctx.lineWidth = 2; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(NUC[2].x, NUC[2].y, 9, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.restore();
  label(ctx, t('mo.alpha'), 60, 12, { size: 12, weight: 800, color: cssVar('--s4') });
  label(ctx, t('mo.foil'), 290, 12, { size: 12, weight: 800 });
  label(ctx, t(ruth ? 'mo.ruth' : 'mo.thom'), 290, 30, { size: 11, weight: 700, color: cssVar('--muted') });
  // counters
  const tot = st.n.s + st.n.d + st.n.b || 1;
  const bars = [['mo.straight', st.n.s, cssVar('--s4')], ['mo.deviated', st.n.d, cssVar('--s1')], ['mo.back', st.n.b, cssVar('--bad')]];
  bars.forEach(([k, v, c], i) => {
    const x = 20 + i * 196;
    ctx.fillStyle = cssVar('--surface-2'); roundRect(ctx, x, 386, 180, 26, 8); ctx.fill();
    const bw = (180 * v) / tot;
    if (bw > 1) { ctx.fillStyle = c; roundRect(ctx, x, 386, bw, 26, Math.min(8, bw / 2)); ctx.fill(); }
    label(ctx, `${t(k)}${t('colon')} ${v}`, x + 90, 399, { size: 11, weight: 800 });
  });
}

/* ---------- Tab 2: spectroscope, continuous and emission spectra ---------- */
function srcSpectrum(st) {
  if (st.src === 'filament') return { mode: 'continuous', lines: [] };
  return { mode: 'emission', lines: LINES[st.src], weights: WEIGHTS[st.src] };
}
function spectroRange(st) { return st.zoom ? [584, 596] : [380, 750]; }
function drawSpectro(ctx, st) {
  // lamp, slit, collimator, prism or grating, telescope
  const lampCol = st.src === 'filament' ? '#ffe9a8' : st.src === 'hydrogen' ? '#ff6fa8' : st.src === 'sodium' ? '#ffc23a' : '#ff6a3a';
  ctx.fillStyle = lampCol; ctx.beginPath(); ctx.ellipse(60, 110, 16, 40, 0, 0, TAU); ctx.fill();
  ink(ctx, 1.5); ctx.beginPath(); ctx.ellipse(60, 110, 16, 40, 0, 0, TAU); ctx.stroke();
  label(ctx, t(`src.${st.src}`), 60, 170, { size: 11, weight: 700 });
  ctx.fillStyle = cssVar('--metal'); ctx.fillRect(100, 100, 120, 20); ctx.fillRect(98, 92, 5, 36);
  label(ctx, t('sp.slit'), 100, 82, { size: 10, weight: 700, halo: false });
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(100, 108, 120, 4);
  if (st.disp === 'prism') {
    ctx.fillStyle = 'rgba(170,210,240,0.55)'; ctx.strokeStyle = cssVar('--glass-stroke'); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(260, 60); ctx.lineTo(300, 140); ctx.lineTo(220, 140); ctx.closePath(); ctx.fill(); ctx.stroke();
    label(ctx, t('sp.prism'), 260, 158, { size: 10, weight: 700, halo: false });
  } else {
    ctx.fillStyle = cssVar('--metal'); ctx.fillRect(256, 62, 8, 80);
    for (let y = 64; y < 140; y += 4) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(256, y, 8, 1); }
    label(ctx, t('sp.grating'), 260, 158, { size: 10, weight: 700, halo: false });
  }
  // dispersed light towards the telescope
  const spec = srcSpectrum(st), [l0, l1] = spectroRange(st);
  const fan = (nm, a) => { ctx.strokeStyle = lambdaCSS(nm, a); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(262, 104); ctx.lineTo(560, 40 + ((nm - 380) / 370) * 120); ctx.stroke(); };
  if (spec.mode === 'continuous') for (let nm = 400; nm <= 700; nm += 6) fan(nm, 0.35);
  else spec.lines.forEach((l, k) => fan(l, 0.4 + 0.6 * (spec.weights ? spec.weights[k] : 1)));
  ctx.fillStyle = cssVar('--metal'); ctx.save(); ctx.translate(470, 92); ctx.rotate(0.12); ctx.fillRect(-40, -12, 90, 24); ctx.restore();
  label(ctx, t('sp.telescope'), 480, 136, { size: 10, weight: 700, halo: false });
  // spectrum strip and the cursor
  const x0 = 40, x1 = 560, y = 214, h = 70;
  const X = drawSpectrum(ctx, x0, y, x1 - x0, h, { lmin: l0, lmax: l1, mode: spec.mode, lines: spec.lines, weights: spec.weights, lineNm: st.zoom ? 0.05 : 0.9 });
  ink(ctx, 1); ctx.strokeRect(x0, y, x1 - x0, h);
  const tickStep = st.zoom ? 2 : 50;
  for (let v = Math.ceil(l0 / tickStep) * tickStep; v <= l1; v += tickStep) {
    ink(ctx, 1); ctx.beginPath(); ctx.moveTo(X(v), y + h); ctx.lineTo(X(v), y + h + 6); ctx.stroke();
    label(ctx, num(v, 0), X(v), y + h + 16, { size: 10, weight: 600, halo: false });
  }
  label(ctx, 'λ (nm)', x1, y - 10, { size: 10, weight: 700, align: 'right', halo: false });
  const cx = X(Math.max(l0, Math.min(l1, st.cur)));
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(cx, y); ctx.lineTo(cx, y + h); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = cssVar('--text'); ctx.beginPath(); ctx.moveTo(cx, y + h + 22); ctx.lineTo(cx - 9, y + h + 38); ctx.lineTo(cx + 9, y + h + 38); ctx.closePath(); ctx.fill();
  label(ctx, qty(st.cur, st.zoom ? 1 : 1, 'nm'), cx, y + h + 52, { size: 12, weight: 800 });
  label(ctx, t(spec.mode === 'continuous' ? 'sp.continuous' : 'sp.emission'), W / 2, 196, { size: 13, weight: 800 });
  muted(ctx, 'sp.drag', W / 2, 388);
}

/* ---------- Tab 3: spectrum of hydrogen, Balmer series ---------- */
function drawHydrogen(ctx, st) {
  const x0 = 30, x1 = 570, y = 90, h = 70, l0 = 350, l1 = 700;
  const X = drawSpectrum(ctx, x0, y, x1 - x0, h, { lmin: l0, lmax: l1, mode: 'emission', lines: LINES.hydrogen, weights: WEIGHTS.hydrogen, lineNm: 0.9 });
  ink(ctx, 1); ctx.strokeRect(x0, y, x1 - x0, h);
  for (let v = 350; v <= 700; v += 50) { ink(ctx, 1); ctx.beginPath(); ctx.moveTo(X(v), y + h); ctx.lineTo(X(v), y + h + 6); ctx.stroke(); label(ctx, num(v, 0), X(v), y + h + 16, { size: 10, weight: 600, halo: false }); }
  ['Hα', 'Hβ', 'Hγ', 'Hδ'].forEach((nm, k) => label(ctx, nm, X(LINES.hydrogen[k]), y - 12, { size: 12, weight: 800 }));
  // limit of the series
  const lim = lambdaOf(Infinity, 2);
  ctx.strokeStyle = cssVar('--muted'); ctx.setLineDash([4, 3]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(X(lim), y - 4); ctx.lineTo(X(lim), y + h + 4); ctx.stroke(); ctx.setLineDash([]);
  label(ctx, 'H∞', X(lim), y - 12, { size: 12, weight: 800, color: cssVar('--muted') });
  // other lines n > 6 (ultraviolet near the limit), drawn faintly
  for (let n = 7; n <= 14; n++) { const l = lambdaOf(n, 2); ctx.fillStyle = 'rgba(150,90,220,0.5)'; ctx.fillRect(X(l) - 0.8, y, 1.6, h); }
  // selected line
  const l = lambdaOf(st.n, 2);
  ctx.fillStyle = cssVar('--text'); ctx.beginPath(); ctx.moveTo(X(l), y + h + 24); ctx.lineTo(X(l) - 9, y + h + 40); ctx.lineTo(X(l) + 9, y + h + 40); ctx.closePath(); ctx.fill();
  label(ctx, `n = ${st.n}`, X(l), y + h + 54, { size: 12, weight: 800 });
  label(ctx, t('hy.formula'), W / 2, 34, { size: 14, weight: 800 });
  label(ctx, t('hy.discharge'), W / 2, 60, { size: 11, weight: 600, color: cssVar('--muted') });
  label(ctx, `${t('hy.transition', { n: st.n })} · ${t(l < 380 ? 'rg.uv' : 'rg.vis')}`, W / 2, 254, { size: 13, weight: 800 });
  muted(ctx, 'hy.note', W / 2, 290);
}

/* ---------- Tab 4: Bohr model, energy levels of hydrogen ---------- */
const LV = { x0: 40, x1: 300, yb: 400, span: 320 };
const levelY = (n) => (n === Infinity ? LV.yb - LV.span : LV.yb - LV.span * (1 - 1 / n));
function seriesOf(nf) { return SERIES[nf - 1]; }
function drawLevels(ctx, st) {
  // levels (not to scale)
  for (const n of [1, 2, 3, 4, 5, 6, 7, Infinity]) {
    const y = levelY(n), on = n === st.ni || n === st.nf;
    ctx.strokeStyle = on ? cssVar('--text') : cssVar('--muted'); ctx.lineWidth = on ? 2.5 : 1.2;
    if (n === Infinity) ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(LV.x0 + 40, y); ctx.lineTo(LV.x1, y); ctx.stroke(); ctx.setLineDash([]);
    label(ctx, n === Infinity ? 'n = ∞' : `n = ${n}`, LV.x0 + 18, y, { size: 10, weight: 700, halo: false });
    if (n <= 4 || n === Infinity) label(ctx, qty(En(n), 2, 'eV'), LV.x1 + 4, y, { size: 10, weight: 700, align: 'left', halo: false });
  }
  muted(ctx, 'lv.notScale', 170, 428);
  // all transitions of the series to nf, faint; the chosen one bold
  const col = (ni, nf) => radColor(lambdaOf(ni, nf));
  const sx = LV.x0 + 60 + (st.nf - 1) * 42;
  for (let ni = st.nf + 1; ni <= 7; ni++) { ctx.strokeStyle = col(ni, st.nf).replace(/,1\)$/, ',0.35)'); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(sx + (ni - st.nf) * 4, levelY(ni)); ctx.lineTo(sx + (ni - st.nf) * 4, levelY(st.nf)); ctx.stroke(); }
  const ax = sx + (st.ni - st.nf) * 4;
  ctx.strokeStyle = col(st.ni, st.nf); ctx.fillStyle = col(st.ni, st.nf); ctx.lineWidth = 3;
  arrow(ctx, ax, levelY(st.ni), ax, levelY(st.nf), 9);
  label(ctx, t(`se.${seriesOf(st.nf)}`), ax, levelY(st.nf) + 14, { size: 11, weight: 800 });
  // Bohr orbits (Figure 17.7)
  const cx = 470, cy = 230, rn = (n) => 13 * n;
  for (let n = 1; n <= 7; n++) { ctx.strokeStyle = n === st.ni || n === st.nf ? cssVar('--text') : 'rgba(127,127,127,0.35)'; ctx.lineWidth = n === st.ni || n === st.nf ? 1.6 : 1; ctx.beginPath(); ctx.arc(cx, cy, rn(n), 0, TAU); ctx.stroke(); }
  ctx.fillStyle = cssVar('--plus'); ctx.beginPath(); ctx.arc(cx, cy, 4, 0, TAU); ctx.fill();
  const u = st.anim < 0 ? 0 : Math.min(1, Math.max(0, (st.anim - 0.4) / 0.6));
  const r = rn(st.ni) + (rn(st.nf) - rn(st.ni)) * u, a = -0.9 + (st.anim < 0 ? 0 : st.anim * 0.6);
  ctx.fillStyle = cssVar('--minus'); ctx.beginPath(); ctx.arc(cx + r * Math.cos(a), cy + r * Math.sin(a), 5, 0, TAU); ctx.fill();
  if (st.anim > 1) {
    const d = (st.anim - 1) * 45, l = lambdaOf(st.ni, st.nf);
    wave(ctx, cx + r * Math.cos(a) + d * 0.7, cy + r * Math.sin(a) - d * 0.7, 70, -Math.PI / 4, Math.max(10, Math.min(30, l / 30)), col(st.ni, st.nf), -st.anim * 20);
    label(ctx, 'h ν', cx + r * Math.cos(a) + d * 0.7 + 30, cy + r * Math.sin(a) - d * 0.7 - 34, { size: 12, weight: 800, color: col(st.ni, st.nf) });
  }
  label(ctx, t('lv.orbits'), cx, 40, { size: 12, weight: 800 });
  const l = lambdaOf(st.ni, st.nf);
  label(ctx, `${t('lv.jump', { i: st.ni, f: st.nf })}`, cx, 360, { size: 12, weight: 800 });
  label(ctx, `${t('lv.photon')} ${t(l < 400 ? 'rg.uv' : l <= 800 ? 'rg.vis' : 'rg.ir')}`, cx, 384, { size: 12, weight: 800, color: col(st.ni, st.nf) });
}

/* ---------- Tab 5: absorption spectra (Experiment 17.2) ---------- */
function drawAbsorption(ctx, st) {
  // white lamp
  ctx.fillStyle = '#fff6d8'; ctx.beginPath(); ctx.arc(60, 110, 26, 0, TAU); ctx.fill(); ink(ctx, 1.5); ctx.beginPath(); ctx.arc(60, 110, 26, 0, TAU); ctx.stroke();
  label(ctx, t(st.el === 'sun' ? 'ab.sunSrc' : 'ab.white'), 16, 152, { size: 11, weight: 700, align: 'left' });
  ctx.fillStyle = 'rgba(255,246,200,0.35)'; ctx.beginPath(); ctx.moveTo(86, 100); ctx.lineTo(420, 96); ctx.lineTo(420, 124); ctx.lineTo(86, 120); ctx.closePath(); ctx.fill();
  const depth = st.el === 'sodium' ? st.vap : 1;
  if (st.el === 'sodium') {
    // crucible on a Bunsen burner, sodium vapour above
    ctx.fillStyle = cssVar('--metal'); ctx.beginPath(); ctx.moveTo(220, 150); ctx.lineTo(280, 150); ctx.lineTo(270, 180); ctx.lineTo(230, 180); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#c9c2b0'; ctx.fillRect(232, 146, 36, 6);
    ctx.fillStyle = cssVar('--metal'); ctx.fillRect(244, 200, 12, 60); ctx.fillRect(226, 258, 48, 10);
    if (st.burner) { ctx.fillStyle = 'rgba(70,120,255,0.7)'; ctx.beginPath(); ctx.moveTo(240, 200); ctx.quadraticCurveTo(250, 170, 260, 200); ctx.closePath(); ctx.fill(); }
    if (st.vap > 0.02) { ctx.fillStyle = `rgba(255,200,60,${0.28 * st.vap})`; ctx.beginPath(); ctx.ellipse(250, 112, 40, 40 * st.vap + 6, 0, 0, TAU); ctx.fill(); label(ctx, t('ab.vapour'), 250, 66, { size: 11, weight: 700 }); }
    label(ctx, t('ab.crucible'), 300, 165, { size: 10, weight: 700, align: 'left', halo: false });
    label(ctx, t('ab.bunsen'), 280, 240, { size: 10, weight: 700, align: 'left', halo: false });
  } else if (st.el === 'hydrogen') {
    ctx.fillStyle = 'rgba(255,111,168,0.12)'; ctx.strokeStyle = cssVar('--glass-stroke'); ctx.lineWidth = 2; roundRect(ctx, 200, 76, 100, 70, 10); ctx.fill(); ctx.stroke();
    label(ctx, t('ab.chamber'), 250, 162, { size: 11, weight: 700 });
  } else {
    ctx.fillStyle = 'rgba(255,190,90,0.18)'; ctx.beginPath(); ctx.arc(60, 110, 44, 0, TAU); ctx.fill();
    label(ctx, t('ab.atmos'), 250, 70, { size: 11, weight: 700 });
  }
  // spectroscope
  ctx.fillStyle = cssVar('--metal'); ctx.save(); ctx.translate(470, 110); ctx.rotate(0); ctx.fillRect(-50, -14, 100, 28); ctx.restore();
  label(ctx, t('ab.spectroscope'), 470, 140, { size: 10, weight: 700, halo: false });
  const x0 = 40, x1 = 560, l0 = st.el === 'sodium' ? 560 : 400, l1 = st.el === 'sodium' ? 620 : 700;
  const lines = LINES[st.el === 'sun' ? 'sun' : st.el];
  const y = 300, h = st.compare ? 50 : 70;
  const X = drawSpectrum(ctx, x0, y, x1 - x0, h, { lmin: l0, lmax: l1, mode: 'absorption', lines, depth: 0.95 * depth, lineNm: st.el === 'sodium' ? 0.12 : 0.8 });
  ink(ctx, 1); ctx.strokeRect(x0, y, x1 - x0, h);
  label(ctx, t('ab.absSpec'), x0, y - 10, { size: 11, weight: 800, align: 'left', halo: false });
  if (st.compare && st.el !== 'sun') {
    const y2 = y + h + 40;
    drawSpectrum(ctx, x0, y2, x1 - x0, h, { lmin: l0, lmax: l1, mode: 'emission', lines, weights: WEIGHTS[st.el], lineNm: st.el === 'sodium' ? 0.12 : 0.8 });
    ink(ctx, 1); ctx.strokeRect(x0, y2, x1 - x0, h);
    label(ctx, t('ab.emSpec'), x0, y2 - 10, { size: 11, weight: 800, align: 'left', halo: false });
  }
  const step = st.el === 'sodium' ? 10 : 50;
  for (let v = l0; v <= l1; v += step) { ink(ctx, 1); ctx.beginPath(); ctx.moveTo(X(v), y + h); ctx.lineTo(X(v), y + h + 5); ctx.stroke(); label(ctx, num(v, 0), X(v), y + h + 14, { size: 10, weight: 600, halo: false }); }
  if (st.el === 'sun') { const hx = X(587.6); ink(ctx, 1); arrow(ctx, hx, y + h + 24, hx, y + h + 4, 6); label(ctx, t('ab.helium'), hx, y + h + 34, { size: 11, weight: 800, color: cssVar('--s1') }); }
}

/* ---------- Tab 6: laser ---------- */
function twoLevel(ctx, x, y, eUp, eHigh) {
  ink(ctx, 2);
  ctx.beginPath(); ctx.moveTo(x - 60, y); ctx.lineTo(x + 60, y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - 60, y - 90); ctx.lineTo(x + 60, y - 90); ctx.stroke();
  label(ctx, 'E1', x - 76, y, { size: 12, weight: 800 }); label(ctx, 'E2', x - 76, y - 90, { size: 12, weight: 800 });
  ctx.fillStyle = cssVar('--minus'); ctx.beginPath(); ctx.arc(x, y - 90 * eUp, 7, 0, TAU); ctx.fill();
  if (eHigh) label(ctx, t('la.excited'), x + 70, y - 90, { size: 11, weight: 700, align: 'left', color: cssVar('--muted') });
}
const RED = 'rgba(230,40,40,1)';
function drawLaser(ctx, st) {
  if (st.mode === 'processes') {
    const x = 300, y = 260, tt = st.pt;
    let up = st.proc === 'absorption' ? 0 : 1;
    if (st.proc === 'absorption') {
      if (tt >= 0 && tt < 1) wave(ctx, 40 + tt * 200, y - 45, 60, 0, 14, RED, -tt * 30);
      if (tt >= 1) up = Math.min(1, (tt - 1) / 0.3);
      label(ctx, t('la.absNote'), W / 2, 330, { size: 12, weight: 700 });
    } else if (st.proc === 'spontaneous') {
      if (tt >= st.delay) {
        up = Math.max(0, 1 - (tt - st.delay) / 0.3);
        const d = (tt - st.delay) * 140;
        if (d > 10) wave(ctx, x + 20 + d * Math.cos(st.dir), y - 45 + d * Math.sin(st.dir), 60, st.dir, 14, RED, -tt * 30);
      }
      label(ctx, t('la.spoNote'), W / 2, 330, { size: 12, weight: 700 });
    } else {
      if (tt >= 0 && tt < 1) wave(ctx, 40 + tt * 200, y - 45, 60, 0, 14, RED, -tt * 30);
      if (tt >= 1) {
        up = Math.max(0, 1 - (tt - 1) / 0.3);
        const d = 250 + (tt - 1) * 150;
        wave(ctx, d, y - 58, 60, 0, 14, RED, -tt * 30);
        wave(ctx, d, y - 32, 60, 0, 14, RED, -tt * 30);
        if (tt > 1.3) label(ctx, t('la.inPhase'), Math.min(530, d + 34), y - 12, { size: 11, weight: 800, color: cssVar('--s1') });
      }
      label(ctx, t('la.stiNote'), W / 2, 330, { size: 12, weight: 700 });
    }
    twoLevel(ctx, x, y, up, up > 0.5);
    label(ctx, `ΔE = E2 − E1 = h ν`, x, 120, { size: 13, weight: 800 });
    label(ctx, t(`la.${st.proc}`), W / 2, 40, { size: 15, weight: 800 });
    muted(ctx, 'la.slow', W / 2, 410);
    return;
  }
  // cavity: tube with atoms, reflecting and semi-reflecting mirrors
  ctx.fillStyle = 'rgba(170,200,230,0.18)'; ctx.strokeStyle = cssVar('--glass-stroke'); ctx.lineWidth = 2;
  roundRect(ctx, TUBE.x0, TUBE.y0, TUBE.x1 - TUBE.x0, TUBE.y1 - TUBE.y0, 12); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#9aa4ae'; ctx.fillRect(TUBE.x0 - 16, TUBE.y0 - 10, 7, TUBE.y1 - TUBE.y0 + 20);
  ctx.fillStyle = 'rgba(154,164,174,0.55)'; ctx.fillRect(TUBE.x1 + 9, TUBE.y0 - 10, 7, TUBE.y1 - TUBE.y0 + 20);
  label(ctx, t('la.mirror'), TUBE.x0 - 12, TUBE.y1 + 26, { size: 10, weight: 700 });
  label(ctx, t('la.semi'), TUBE.x1 + 12, TUBE.y1 + 26, { size: 10, weight: 700 });
  if (!st.atoms) st.atoms = makeAtoms();
  let n2 = 0;
  for (const a of st.atoms) {
    n2 += a.e;
    ctx.fillStyle = a.e ? 'rgba(230,40,40,0.85)' : 'rgba(127,127,127,0.55)';
    ctx.beginPath(); ctx.arc(a.x, a.y, a.e ? 6 : 5, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = RED;
  for (const p of st.ph) { ctx.beginPath(); ctx.arc(p.x, p.y, 2.2, 0, TAU); ctx.fill(); }
  // output beam
  const I = Math.min(1, st.out / 6);
  if (I > 0.02) { ctx.fillStyle = `rgba(230,40,40,${0.25 + 0.6 * I})`; ctx.fillRect(TUBE.x1 + 16, (TUBE.y0 + TUBE.y1) / 2 - 2 - 6 * I, 80, 4 + 12 * I); label(ctx, t('la.beam'), 560, 150, { size: 11, weight: 800, color: RED }); }
  // pump
  if (st.pump > 0) { for (let k = 0; k < 6; k++) { ctx.strokeStyle = 'rgba(70,120,255,0.6)'; ctx.lineWidth = 2; arrow(ctx, 140 + k * 64, 110, 140 + k * 64, TUBE.y0 - 6, 6); } label(ctx, t('la.pumping'), W / 2, 96, { size: 11, weight: 800, color: 'rgb(70,120,255)' }); }
  // populations
  const N = st.atoms.length, n1 = N - n2;
  const bx = 150, by = 330;
  [['la.n1', n1, 'rgba(127,127,127,0.8)'], ['la.n2', n2, 'rgba(230,40,40,0.85)']].forEach(([k, v, c], i) => {
    const y = by + i * 34;
    label(ctx, t(k), bx - 10, y + 11, { size: 11, weight: 700, align: 'right' });
    ctx.fillStyle = cssVar('--surface-2'); ctx.fillRect(bx, y, 300, 22);
    ctx.fillStyle = c; ctx.fillRect(bx, y, (300 * v) / N, 22);
    label(ctx, String(v), bx + 310, y + 11, { size: 12, weight: 800, align: 'left' });
  });
  label(ctx, t(n2 > n1 ? 'la.inverted' : 'la.normal'), W / 2, 412, { size: 12, weight: 800, color: n2 > n1 ? cssVar('--good') : cssVar('--muted') });
  label(ctx, t('la.heNe'), W / 2, 40, { size: 13, weight: 800 });
}

/* ================================================================
   Pointer: drag the cursor on the spectrum
   ================================================================ */
let dragging = false;
function moveCursor(p) {
  const st = S.spectro, [l0, l1] = spectroRange(st);
  const nm = l0 + ((Math.max(40, Math.min(560, p.x)) - 40) / 520) * (l1 - l0);
  // snap to a line when close
  let best = nm;
  if (st.src !== 'filament') for (const l of LINES[st.src]) if (Math.abs(l - nm) < (l1 - l0) / 120) best = l;
  st.cur = Math.round(best * 10) / 10;
  refresh();
}
canvas.addEventListener('pointerdown', (ev) => {
  if (shell?.tab !== 'spectro') return;
  const p = view.toLogical(ev);
  if (p.y < 200 || p.y > 340) return;
  dragging = true; canvas.setPointerCapture(ev.pointerId); moveCursor(p);
});
canvas.addEventListener('pointermove', (ev) => { if (dragging) moveCursor(view.toLogical(ev)); });
canvas.addEventListener('pointerup', () => { dragging = false; });
canvas.addEventListener('pointercancel', () => { dragging = false; });

/* ================================================================
   Controls and measurements
   ================================================================ */
const controlsBody = document.getElementById('controls-body');
const measuresBody = document.getElementById('measures-body');
let ui = {};
let tableSig = '';
function measRows(dl, rows) { dl.replaceChildren(...rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)])); }
function showStatus(box, fb) {
  if (!fb) { box.hidden = true; return; }
  box.hidden = false; box.className = `status ${fb.type || ''}`; box.textContent = t(fb.key, fb.params);
}
function hint(key) { return el('p', { class: 'muted', style: 'font-size:0.88rem;margin:10px 0 0', dataset: { i18n: key } }, t(key)); }
const btnRow = (...b) => el('div', { class: 'btn-row' }, b);
const resetBtn = (id) => btnRow(createButton({ labelKey: 'ui.reset', variant: 'ghost', onClick: () => resetTab(id) }));
const fbOf = (res, okKey, badKey) => (res === 'invalid' ? { type: 'warn', key: 'calcInvalid' } : res === 'wrong' ? { type: 'bad', key: badKey } : { type: 'good', key: okKey });
const relTol = (v, p, min = 1e-9) => Math.max(Math.abs(v) * p, min);
function dlOnly() { ui.dl = el('dl', { class: 'meas' }); measuresBody.append(ui.dl); }
function tableBlock(st) {
  dlOnly();
  ui.tableWrap = el('div', { class: 'table-scroll' });
  ui.table = el('table', { class: 'data' });
  ui.tableWrap.append(ui.table);
  ui.clear = el('div', { class: 'btn-row', style: 'margin-top:8px' }, [createButton({ labelKey: 'ctl.clearTable', variant: 'ghost', onClick: () => { st.rows = []; st.fb = null; refresh(); } })]);
  ui.status = el('p', { class: 'status', hidden: '' });
  measuresBody.append(ui.tableWrap, ui.clear, ui.status);
}
function renderTable(st, rows, cols, rowFn) {
  const sig = calcSig(rows) + rows.length + cols.join();
  if (sig !== tableSig) {
    ui.table.replaceChildren(el('thead', {}, el('tr', {}, cols.map((k) => el('th', {}, t(k))))), el('tbody', {}, rows.map(rowFn)));
    tableSig = sig;
  }
  ui.tableWrap.hidden = rows.length === 0;
  ui.clear.hidden = ui.tableWrap.hidden;
  showStatus(ui.status, st.fb);
}
const cell = (st, r, key, expected, decimals, tol, okKey, badKey, disabled = false) =>
  calcCell(r, key, { expected, decimals, tol, disabled, onCheck: (res) => { st.fb = fbOf(res, okKey, badKey); refresh(); } });
const td = (v) => el('td', {}, v);
const recordBtn = (fn) => createButton({ labelKey: 'ctl.record', variant: 'secondary', onClick: fn });
const sliderEl = (st, key, prop, min, max, step, unit, dec, after) => createSlider({ labelKey: key, min, max, step, value: st[prop], unit, decimals: dec, onInput: (v) => { st[prop] = v; after?.(); refresh(); } }).root;
const seg = (st, key, prop, opts, after) => createSegmented({ labelKey: key, options: opts, value: st[prop], onChange: (v) => { st[prop] = v; after?.(); refresh(); } }).root;
const opts = (prefix, list) => list.map((v) => ({ value: v, labelKey: `${prefix}.${v}` }));
const pct = (v, tot) => (tot ? `${v} (${num((100 * v) / tot, 1)} %)` : '0');

/* ---------- Tab 1 ---------- */
function buildModels() {
  const st = S.models;
  const clear = () => { st.al = []; st.trails = []; st.n = { s: 0, d: 0, b: 0 }; loop.start(); };
  ui.beamBox = el('div');
  ui.on = createButton({ labelKey: 'ctl.stopBeam', variant: 'secondary', onClick: () => { st.on = !st.on; loop.start(); refresh(); } });
  ui.fire = createButton({ labelKey: 'ctl.fire', variant: 'primary', onClick: () => { launch(st, NUC[2].y + st.aim); loop.start(); } });
  ui.aim = sliderEl(st, 'ctl.aim', 'aim', -10, 10, 0.05, 'px', 2);
  controlsBody.append(
    seg(st, 'ctl.model', 'model', opts('mo', ['thomson', 'rutherford']), clear),
    seg(st, 'ctl.beamMode', 'mode', opts('mo', ['beam', 'single']), () => { clear(); buildTab('models'); }),
  );
  if (st.mode === 'beam') controlsBody.append(btnRow(ui.on));
  else controlsBody.append(ui.aim, btnRow(ui.fire));
  controlsBody.append(btnRow(createButton({ labelKey: 'ctl.clearCount', variant: 'ghost', onClick: () => { clear(); refresh(); } })), hint('hint.models'), resetBtn('models'));
  dlOnly();
}
function updateModels() {
  const st = S.models, tot = st.n.s + st.n.d + st.n.b;
  if (ui.on) { const k = st.on ? 'ctl.stopBeam' : 'ctl.startBeam'; if (ui.on.dataset.i18n !== k) { ui.on.dataset.i18n = k; ui.on.textContent = t(k); } }
  const rows = [[t('m.total'), String(tot)], [t('mo.straight'), pct(st.n.s, tot)], [t('mo.deviated'), pct(st.n.d, tot)], [t('mo.back'), pct(st.n.b, tot)]];
  if (st.mode === 'single' && st.trails.length) rows.push([t('m.angle'), qty(st.trails[st.trails.length - 1].ang, 1, '°')]);
  measRows(ui.dl, rows);
}

/* ---------- Tab 2 ---------- */
function buildSpectro() {
  const st = S.spectro;
  controlsBody.append(
    seg(st, 'ctl.src', 'src', opts('src', ['filament', 'hydrogen', 'sodium', 'neon']), () => { st.cur = st.src === 'sodium' ? 589.0 : st.src === 'neon' ? 640.2 : st.src === 'hydrogen' ? 656.3 : 550; if (st.src !== 'sodium') st.zoom = false; buildTab('spectro'); }),
    seg(st, 'ctl.disp', 'disp', opts('sp', ['prism', 'grating'])),
  );
  if (st.src === 'sodium') controlsBody.append(seg(st, 'ctl.zoom', 'zoom', [{ value: false, labelKey: 'sp.full' }, { value: true, labelKey: 'sp.zoomNa' }]));
  controlsBody.append(hint('hint.spectro'), resetBtn('spectro'));
  dlOnly();
}
function updateSpectro() {
  const st = S.spectro, onLine = st.src !== 'filament' && LINES[st.src].includes(st.cur);
  const rows = [[t('m.type'), t(st.src === 'filament' ? 'sp.continuous' : 'sp.emission')], [t('m.cursor'), qty(st.cur, 1, 'nm')]];
  if (st.src !== 'filament') rows.push([t('m.nLines'), String(LINES[st.src].length)], [t('m.onLine'), t(onLine ? 'th.yes' : 'th.no')]);
  measRows(ui.dl, rows);
}

/* ---------- Tab 3 ---------- */
function buildHydrogen() {
  const st = S.hydrogen;
  controlsBody.append(sliderEl(st, 'ctl.n', 'n', 3, 12, 1, '', 0),
    btnRow(recordBtn(() => { st.rows.push({ n: st.n }); st.fb = null; refresh(); })), hint('hint.hydrogen'), resetBtn('hydrogen'));
  tableBlock(st);
}
function updateHydrogen() {
  const st = S.hydrogen;
  measRows(ui.dl, [[t('m.n'), String(st.n)], [t('m.RH'), `${num(1.097, 3)} × 10⁷ m⁻¹`]]);
  renderTable(st, st.rows, ['col.n', 'col.inv', 'col.lam'], (r) => {
    const inv = RH * (1 / 4 - 1 / (r.n * r.n)) / 1e6, lam = 1e3 / inv;
    return el('tr', {}, [td(String(r.n)),
      cell(st, r, 'i', inv, 3, relTol(inv, 0.004), 'fb.invOk', 'fb.invWrong'),
      cell(st, r, 'l', lam, 1, relTol(lam, 0.004), 'fb.lamOk', 'fb.lamWrong', !calcDone(r, 'i'))]);
  });
}

/* ---------- Tab 4 ---------- */
function buildLevels() {
  const st = S.levels;
  controlsBody.append(
    seg(st, 'ctl.ni', 'ni', [2, 3, 4, 5, 6, 7].map((n) => ({ value: n, labelKey: `nn.${n}` })), () => { if (st.nf >= st.ni) st.nf = st.ni - 1; st.anim = -1; buildTab('levels'); }),
    seg(st, 'ctl.nf', 'nf', [1, 2, 3, 4, 5, 6].filter((n) => n < st.ni).map((n) => ({ value: n, labelKey: `nn.${n}` })), () => { st.anim = -1; }),
    btnRow(createButton({ labelKey: 'ctl.emit', variant: 'primary', onClick: () => { st.anim = 0; loop.start(); } }), recordBtn(() => { st.rows.push({ ni: st.ni, nf: st.nf }); st.fb = null; refresh(); })),
    hint('hint.levels'), resetBtn('levels'));
  tableBlock(st);
}
function updateLevels() {
  const st = S.levels;
  measRows(ui.dl, [[t('m.Ei'), qty(En(st.ni), 2, 'eV')], [t('m.Ef'), qty(En(st.nf), 2, 'eV')], [t('m.series'), t(`se.${seriesOf(st.nf)}`)]]);
  renderTable(st, st.rows, ['col.ni', 'col.nf', 'col.E', 'col.nu', 'col.lamL'], (r) => {
    const E = En(r.ni) - En(r.nf), nu = (E * E1) / H / 1e14, lam = (H * C0) / (E * E1) * 1e9;
    return el('tr', {}, [td(String(r.ni)), td(String(r.nf)),
      cell(st, r, 'e', E, 2, relTol(E, 0.006, 0.006), 'fb.EOk', 'fb.EWrong'),
      cell(st, r, 'n', nu, 2, relTol(nu, 0.015), 'fb.nuOk', 'fb.nuWrong', !calcDone(r, 'e')),
      cell(st, r, 'l', lam, 0, relTol(lam, 0.015), 'fb.lamLOk', 'fb.lamLWrong', !calcDone(r, 'n'))]);
  });
}

/* ---------- Tab 5 ---------- */
function buildAbsorption() {
  const st = S.absorption;
  controlsBody.append(seg(st, 'ctl.el', 'el', opts('ab', ['sodium', 'hydrogen', 'sun']), () => { st.burner = false; st.vap = 0; buildTab('absorption'); }));
  if (st.el === 'sodium') {
    ui.burn = createButton({ labelKey: 'ctl.burnerOn', variant: 'primary', onClick: () => { st.burner = !st.burner; loop.start(); refresh(); } });
    controlsBody.append(btnRow(ui.burn));
  }
  if (st.el !== 'sun') controlsBody.append(seg(st, 'ctl.compare', 'compare', [{ value: false, labelKey: 'th.no' }, { value: true, labelKey: 'th.yes' }]));
  controlsBody.append(hint('hint.absorption'), resetBtn('absorption'));
  dlOnly();
}
function updateAbsorption() {
  const st = S.absorption;
  if (ui.burn) { const k = st.burner ? 'ctl.burnerOff' : 'ctl.burnerOn'; if (ui.burn.dataset.i18n !== k) { ui.burn.dataset.i18n = k; ui.burn.textContent = t(k); } }
  const vis = st.el !== 'sodium' || st.vap > 0.15;
  const lines = st.el === 'sun' ? [656.3, 589.0, 587.6, 486.1] : LINES[st.el];
  measRows(ui.dl, [[t('m.dark'), vis ? lines.map((l) => num(l, 1)).join(' · ') + ' nm' : '—'], ...(st.el === 'sodium' ? [[t('m.vapour'), t(st.vap > 0.15 ? 'th.yes' : 'th.no')]] : [])]);
}

/* ---------- Tab 6 ---------- */
function buildLaser() {
  const st = S.laser;
  controlsBody.append(seg(st, 'ctl.lmode', 'mode', opts('la', ['processes', 'cavity']), () => { st.pt = -1; buildTab('laser'); }));
  if (st.mode === 'processes') {
    controlsBody.append(seg(st, 'ctl.proc', 'proc', opts('la', ['absorption', 'spontaneous', 'stimulated']), () => { st.pt = -1; }),
      btnRow(createButton({ labelKey: 'ctl.go', variant: 'primary', onClick: () => { st.pt = 0; st.delay = 0.5 + rand() * 1.8; st.dir = -Math.PI + rand() * TAU; loop.start(); } })));
  } else {
    controlsBody.append(sliderEl(st, 'ctl.pump', 'pump', 0, 100, 5, '%', 0),
      btnRow(createButton({ labelKey: 'ctl.empty', variant: 'ghost', onClick: () => { st.atoms = makeAtoms(); st.ph = []; st.out = 0; refresh(); } })));
  }
  controlsBody.append(hint(st.mode === 'processes' ? 'hint.laserP' : 'hint.laserC'), resetBtn('laser'));
  dlOnly();
}
function updateLaser() {
  const st = S.laser;
  if (st.mode === 'processes') { measRows(ui.dl, [[t('m.process'), t(`la.${st.proc}`)], [t('m.photonsOut'), t(st.proc === 'absorption' ? 'la.zero' : st.proc === 'spontaneous' ? 'la.one' : 'la.two')]]); return; }
  const n2 = st.atoms ? st.atoms.reduce((s, a) => s + a.e, 0) : 0, N = 48;
  measRows(ui.dl, [[t('la.n1'), String(N - n2)], [t('la.n2'), String(n2)], [t('m.out'), `${num(st.out, 0)} ${t('m.perS')}`]]);
}

/* ---------- Tab switching ---------- */
function buildTab(id) {
  controlsBody.replaceChildren();
  measuresBody.replaceChildren();
  ui = {};
  tableSig = '';
  ({ models: buildModels, spectro: buildSpectro, hydrogen: buildHydrogen, levels: buildLevels, absorption: buildAbsorption, laser: buildLaser })[id]();
  loop.start();
  shell?.refreshActivity();
  refresh();
}
function updateMeasures() {
  if (!shell || !ui.dl) return;
  ({ models: updateModels, spectro: updateSpectro, hydrogen: updateHydrogen, levels: updateLevels, absorption: updateAbsorption, laser: updateLaser })[shell.tab]();
}
function refresh() { updateMeasures(); requestDraw(); }
function resetTab(id) { S[id] = initialState(id); buildTab(id); }
onLangChange(() => { if (shell) buildTab(shell.tab); });

shell = initSim({
  strings,
  tabs: TABS.map((id) => ({ id, labelKey: `tab.${id}` })),
  initialTab: 'models',
  gsOnly: { models: true, laser: true },
  activityKey: (tab) => (tab === 'laser' ? `act.laser.${S.laser.mode}` : `act.${tab}`),
  onTab: buildTab,
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, lambdaOf, En };
