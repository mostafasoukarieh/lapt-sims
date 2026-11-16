// Sec 3 GS-LS — Chapter 8: Electromagnetic induction (8.1–8.7; 8.8 is not taught in 2026–2027). SG and SV.
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num, qty } from '../../../shared/format.js';
import { createButton, createSegmented, createSlider, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, arrow } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { label } from '../../../shared/figures.js';
import { calcCell, calcSig, calcDone } from '../../../shared/calc-cell.js';
import { plotCurves, drawEnergyBars } from '../../../shared/energy-bars.js';
import { drawBar } from '../../../shared/magnet-draw.js';
import { drawGalvanometer, drawSolenoid, drawLED, drawFieldPerp } from '../../../shared/induction-draw.js';

const TAU = 2 * Math.PI;
const D2R = Math.PI / 180;
const W = 600;
const TABS = ['evidence', 'flux', 'vary', 'lenz', 'faraday', 'generator'];
const HEIGHTS = { evidence: 380, flux: 400, vary: 440, lenz: 400, faraday: 440, generator: 460 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ================================================================
   Model (illustrative values approved by the owner, 16 Nov 2026: galvanometer ±5 mA, coil of 500 turns, circuit 50 Ω)
   ================================================================ */
const RC = 50; // Ω, resistance of the induced circuit (coil + galvanometer)
const PHI0 = 4.6e-5; // Wb: flux of the magnet through one turn when its pole touches the face of the coil
const D0 = 0.05; // m: distance over which the flux of the bar magnet falls (on-axis field of a magnet ≈ dipole)
const TURNS = 500; // coil of Exp. 8.1 and of Faraday's law
const TURNS_LED = 6000; // "coil with many turns" of Exp. 8.4
const LED_ON = 1.8; // V: an LED glows above this voltage
const MM = 1000; // px per m in the magnet–coil scenes (1 px = 1 mm)
const MAG_L = 160; // px: length of the bar magnet
const COIL = { y: 130, r: 45, len: 110 };
const RAIL = { B: 0.5, l: 0.2, xL: 120, xR: 575, yT: 70, yB: 190, k: 600 }; // Exp. 8.2: 0.20 m ↔ 120 px
const ROT = { N: 50, S: 20e-4, B: 0.5 }; // Exp. 8.3: flat coil of 50 turns, 20 cm², between the poles of a U magnet
const R_COIL = 50; // Ω, flat coil of Applications 8.4–8.5

const phiOf = (d, turns, pole) => (pole === 'N' ? 1 : -1) * turns * PHI0 / (1 + (d / D0) ** 2) ** 1.5;

function initialState(tab) {
  switch (tab) {
    case 'evidence': return { mode: 'magnet', pole: 'N', mx: 150, cx: 380, phiPrev: null, e: 0, peak: 0 };
    case 'flux': return { N: 1, R: 10, B: 0.2, alpha: 30, sense: 1, rows: [], fb: null };
    case 'vary': return { mode: 'rails', rx: 300, phiPrev: null, e: 0, ns: 0.5, phi: 0, run: false, t: 0, hist: [] };
    case 'lenz': return { mode: 'leds', pole: 'N', mx: 150, cx: 380, phiPrev: null, e: 0, led1: 0, led2: 0, rx: 300, v: 0, vS: 0 };
    case 'faraday': return { pole: 'N', at: 'out', T: 1, anim: null, phiPrev: null, e: 0, hist: [], last: null, rows: [], fb: null };
    default: return { E: 2.2, R: 500, sense: 'CD', actual: 'DC', rows: [], fb: null };
  }
}
let S = Object.fromEntries(TABS.map((k) => [k, initialState(k)]));

/* ================================================================
   Canvas and loop
   ================================================================ */
let shell;
let drawQueued = false;
const canvas = document.getElementById('stage');
const view = setupCanvas(canvas, { width: W, height: 380, maxHeightVh: () => (window.innerWidth < 880 ? 54 : 78), onResize: () => requestDraw() });
function requestDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; draw(); });
}
onThemeChange(() => requestDraw());

// distance (m) between the pole of the magnet facing the coil and the face of the coil
const gap = (st) => Math.max(0, st.cx - (st.mx + MAG_L / 2)) / MM;
function induce(st, phi, dt, tau = 0.05) {
  if (st.phiPrev == null) st.phiPrev = phi;
  const raw = -(phi - st.phiPrev) / dt;
  st.e += (raw - st.e) * Math.min(1, dt / tau);
  st.phiPrev = phi;
  st.phi = phi;
}
const loop = createLoop({
  step(dt) {
    if (!shell) return false;
    const tab = shell.tab, st = S[tab];
    if (tab === 'evidence') {
      induce(st, phiOf(gap(st), TURNS, st.pole), dt);
      st.peak = Math.max(st.peak * Math.exp(-dt / 1.5), Math.abs(st.e / RC) * 1000);
    } else if (tab === 'lenz') {
      if (st.mode === 'leds') {
        induce(st, phiOf(gap(st), TURNS_LED, st.pole), dt, 0.025);
        const b1 = clamp((st.e - LED_ON) / 1.2, 0, 1), b2 = clamp((-st.e - LED_ON) / 1.2, 0, 1);
        st.led1 = Math.max(b1, st.led1 - dt / 0.35); st.led2 = Math.max(b2, st.led2 - dt / 0.35);
      } else {
        induce(st, RAIL.B * RAIL.l * (st.rx - RAIL.xL) / RAIL.k, dt);
        st.vS += ((-st.e / (RAIL.B * RAIL.l)) - st.vS) * Math.min(1, dt / 0.05);
      }
    } else if (tab === 'vary') {
      if (st.mode === 'rails') {
        induce(st, RAIL.B * RAIL.l * (st.rx - RAIL.xL) / RAIL.k, dt);
      } else {
        if (st.run) st.ang = (st.ang ?? 0) + TAU * st.ns * dt;
        const a = st.ang ?? 0;
        st.phi = ROT.N * ROT.B * ROT.S * Math.cos(a);
        st.e = st.run ? ROT.N * ROT.B * ROT.S * TAU * st.ns * Math.sin(a) : 0;
      }
      st.t += dt;
      st.hist.push([st.t, st.phi * 1000, st.e * 1000]);
      while (st.hist.length && st.hist[0][0] < st.t - 8) st.hist.shift();
    } else if (tab === 'faraday') {
      const a = st.anim;
      let d = st.at === 'in' ? 0.01 : 0.15;
      if (a) {
        a.t += dt;
        const u = Math.min(1, a.t / st.T);
        d = a.from + (a.to - a.from) * (1 - Math.cos(Math.PI * u)) / 2;
        if (a.t >= st.T + 0.6) {
          st.last = { T: st.T, phi1: a.phi1, phi2: phiOf(a.to, TURNS, st.pole), dir: st.at };
          st.anim = null;
          refresh();
        }
      }
      st.d = d;
      induce(st, phiOf(d, TURNS, st.pole), dt, 0.01);
      if (a) a.hist.push([a.t, st.phi * 1000, st.e * 1000]);
    } else return false;
    return true;
  },
  render() { draw(); updateMeasures(); },
});

/* ================================================================
   Drawing helpers
   ================================================================ */
const C = { phi: () => cssVar('--s2'), e: () => cssVar('--s1'), B: () => cssVar('--s5'), n: () => cssVar('--s3'), cur: () => cssVar('--current') };
const histFn = (hist, k) => (tt) => {
  if (!hist.length || tt < hist[0][0] || tt > hist[hist.length - 1][0]) return NaN;
  let lo = 0, hi = hist.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (hist[mid][0] <= tt) lo = mid; else hi = mid; }
  return hist[lo][k];
};
function note(ctx, key, x, y, align = 'center', params) { label(ctx, t(key, params), x, y, { size: 12, weight: 600, color: cssVar('--muted'), align }); }
function wire(ctx, pts, color = cssVar('--wire'), w = 2.5) {
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]); ctx.stroke();
}
function smallGalvano(ctx, x, y, i, scale = 0.72) {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale); drawGalvanometer(ctx, 0, 0, i, { max: 5 }); ctx.restore();
}
// coil of the magnet scenes with its two leads going down to (xa, yb) and (xb, yb)
function coilScene(ctx, st, turns) {
  const x0 = st.cx, x1 = st.cx + COIL.len, y = COIL.y;
  drawSolenoid(ctx, x0, x1, y, COIL.r, { turns });
  wire(ctx, [[x0, y + COIL.r], [x0, y + COIL.r + 30]], cssVar('--copper'), 3);
  wire(ctx, [[x1, y + COIL.r], [x1, y + COIL.r + 30]], cssVar('--copper'), 3);
  // axis
  ctx.save(); ctx.strokeStyle = cssVar('--muted'); ctx.setLineDash([3, 5]); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(20, y); ctx.lineTo(W - 20, y); ctx.stroke(); ctx.restore();
}
function magnet(ctx, st) {
  drawBar(ctx, st.mx, COIL.y, st.pole === 'N' ? 0 : Math.PI, MAG_L, 30);
}
function dragHint(ctx, x, y) {
  ctx.fillStyle = cssVar('--muted'); ctx.strokeStyle = cssVar('--muted'); ctx.lineWidth = 1.5;
  arrow(ctx, x - 6, y, x - 30, y, 6); arrow(ctx, x + 6, y, x + 30, y, 6);
}
// rails of Exp. 8.2 / Application 8.3 seen from above; B into the page
function drawRails(ctx, st, { lenz = false } = {}) {
  const { xL, xR, yT, yB } = RAIL;
  // U magnet gap (field region)
  ctx.fillStyle = cssVar('--surface'); roundRect(ctx, 165, yT - 40, 420, yB - yT + 80, 10); ctx.fill();
  drawFieldPerp(ctx, 165, yT - 40, 420, yB - yT + 80, true, 40);
  label(ctx, t('lbl.Bin'), 175, yB + 30, { size: 12, weight: 800, color: C.B(), align: 'left' });
  // rails and the closing wire with the galvanometer
  ctx.strokeStyle = cssVar('--metal'); ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(xL, yT); ctx.lineTo(xR, yT); ctx.moveTo(xL, yB); ctx.lineTo(xR, yB); ctx.stroke();
  wire(ctx, [[xL, yT], [70, yT], [70, yB], [xL, yB]]);
  smallGalvano(ctx, 70, 145, (st.e / RC) * 1000, 0.62);
  // rod
  const x = st.rx;
  ctx.fillStyle = cssVar('--copper'); roundRect(ctx, x - 5, yT - 16, 10, yB - yT + 32, 4); ctx.fill();
  label(ctx, t('rod.top'), x + 16, yT - 16, { size: 13, weight: 800 });
  label(ctx, t('rod.bot'), x + 16, yB + 16, { size: 13, weight: 800 });
  // circuit area
  ctx.fillStyle = 'rgba(47,116,200,0.10)'; ctx.fillRect(xL, yT + 3, x - xL, yB - yT - 6);
  // positive sense chosen: clockwise seen from above (n into the page, like B)
  ctx.strokeStyle = cssVar('--text'); ctx.fillStyle = cssVar('--text'); ctx.lineWidth = 1.5;
  const mx = (xL + x) / 2, my = (yT + yB) / 2;
  ctx.beginPath(); ctx.arc(mx, my, 16, -Math.PI * 0.9, Math.PI * 0.6); ctx.stroke();
  arrow(ctx, mx + 16 * Math.cos(Math.PI * 0.55), my + 16 * Math.sin(Math.PI * 0.55), mx + 16 * Math.cos(Math.PI * 0.62), my + 16 * Math.sin(Math.PI * 0.62), 6);
  label(ctx, '+', mx, my, { size: 13, weight: 800 });
  if (lenz && Math.abs(st.vS) > 0.03) {
    const up = st.vS > 0; // moving right → flux increases → current counter-clockwise → up in the rod (from bottom to top)
    ctx.strokeStyle = C.cur(); ctx.fillStyle = C.cur(); ctx.lineWidth = 2.5;
    if (up) arrow(ctx, x - 16, yB - 18, x - 16, yT + 18, 9); else arrow(ctx, x - 16, yT + 18, x - 16, yB - 18, 9);
    label(ctx, 'i', x - 28, my, { size: 14, weight: 800, color: C.cur() });
    const dir = Math.sign(st.vS);
    ctx.strokeStyle = C.n(); ctx.fillStyle = C.n(); ctx.lineWidth = 3;
    arrow(ctx, x, yB + 34, x - dir * 70, yB + 34, 9);
    label(ctx, 'F', x - dir * 82, yB + 34, { size: 14, weight: 800, color: C.n() });
    ctx.strokeStyle = cssVar('--text'); ctx.fillStyle = cssVar('--text'); ctx.lineWidth = 2;
    arrow(ctx, x, yT - 40, x + dir * 60, yT - 40, 8);
    label(ctx, 'v', x + dir * 72, yT - 40, { size: 14, weight: 800 });
  } else dragHint(ctx, x, (yT + yB) / 2 + 50);
}

function draw() {
  if (!shell) return;
  const tab = shell.tab;
  if (view.height !== HEIGHTS[tab]) view.setLogicalSize(W, HEIGHTS[tab]);
  const ctx = view.begin();
  ctx.fillStyle = cssVar('--scene-bg');
  roundRect(ctx, 0, 0, W, HEIGHTS[tab], 14);
  ctx.fill();
  ({ evidence: drawEvidence, flux: drawFlux, vary: drawVary, lenz: drawLenz, faraday: drawFaraday, generator: drawGenerator })[tab](ctx, S[tab]);
}

/* ---------- Tab 1: experimental evidence (Exp. 8.1) ---------- */
function drawEvidence(ctx, st) {
  coilScene(ctx, st, 9);
  magnet(ctx, st);
  const y = COIL.y + COIL.r + 30;
  wire(ctx, [[st.cx, y], [st.cx, 290], [240, 290]]);
  wire(ctx, [[st.cx + COIL.len, y], [st.cx + COIL.len, 300], [400, 300], [400, 330], [380, 330]]);
  drawGalvanometer(ctx, 310, 310, (st.e / RC) * 1000, { max: 5 });
  label(ctx, 'M', st.cx - 12, y + 6, { size: 12, weight: 800 });
  label(ctx, 'M′', st.cx + COIL.len + 14, y + 6, { size: 12, weight: 800 });
  if (st.mode === 'magnet') dragHint(ctx, st.mx, COIL.y + 34); else dragHint(ctx, st.cx + COIL.len / 2, COIL.y - COIL.r - 14);
  note(ctx, st.mode === 'magnet' ? 'ev.dragMagnet' : 'ev.dragCoil', W / 2, 22);
}

/* ---------- Tab 2: magnetic flux ---------- */
function fluxCalc(st) {
  const theta = st.sense === 1 ? 90 - st.alpha : 90 + st.alpha; // angle (n, B) in degrees
  const Sm = Math.PI * (st.R / 100) ** 2;
  return { theta, Sm, phi: st.N * st.B * Sm * Math.cos(theta * D2R) };
}
function drawFlux(ctx, st) {
  // field lines of B, horizontal, to the right
  ctx.strokeStyle = C.B(); ctx.fillStyle = C.B(); ctx.lineWidth = 1.5;
  for (let y = 50; y <= 290; y += 48) arrow(ctx, 30, y, 570, y, 8);
  label(ctx, 'B', 580, 50, { size: 15, weight: 800, color: C.B() });
  const cx = 300, cy = 170, R = 40 + st.R * 5; // px
  const a = st.alpha * D2R; // the plane of the loop makes α with B
  const ux = Math.cos(a), uy = Math.sin(a);
  // loop seen in perspective: an ellipse whose major axis is the trace of the plane
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(a);
  ctx.fillStyle = 'rgba(196,112,63,0.15)'; ctx.strokeStyle = cssVar('--copper'); ctx.lineWidth = st.N > 1 ? 6 : 3.5;
  ctx.beginPath(); ctx.ellipse(0, 0, R, 18, 0, 0, TAU); ctx.fill(); ctx.stroke();
  // positive sense on the front of the loop
  ctx.fillStyle = cssVar('--text'); ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 2;
  const sgn = st.sense; // +1: arrow to the right on the front edge
  arrow(ctx, -sgn * 16, 18, sgn * 16, 18, 8);
  label(ctx, '+', 0, 34, { size: 13, weight: 800 });
  ctx.restore();
  // normal n (right-hand rule): sense 1 → n on the upper side of the plane
  void ux; void uy;
  const nx = st.sense * Math.sin(a), ny = -st.sense * Math.cos(a); // (n, B) = 90° − α (direction 1) or 90° + α (direction 2)
  ctx.strokeStyle = C.n(); ctx.fillStyle = C.n(); ctx.lineWidth = 3;
  arrow(ctx, cx, cy, cx + nx * 90, cy + ny * 90, 10);
  label(ctx, 'n', cx + nx * 104, cy + ny * 104, { size: 15, weight: 800, color: C.n() });
  // angles
  const { theta, phi } = fluxCalc(st);
  ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(cx, cy, 40, Math.min(0, a), Math.max(0, a)); ctx.stroke();
  label(ctx, 'α', cx + 52 * Math.cos(a / 2), cy + 52 * Math.sin(a / 2), { size: 13, weight: 800 });
  const an = Math.atan2(ny, nx);
  ctx.strokeStyle = C.n(); ctx.beginPath(); ctx.arc(cx, cy, 62, Math.min(0, an), Math.max(0, an)); ctx.stroke();
  label(ctx, 'θ', cx + 74 * Math.cos(an / 2), cy + 74 * Math.sin(an / 2), { size: 13, weight: 800, color: C.n() });
  ctx.save(); ctx.strokeStyle = cssVar('--muted'); ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx - R - 20, cy); ctx.lineTo(cx + R + 30, cy); ctx.stroke(); ctx.restore();
  note(ctx, Math.abs(phi) < 1e-12 ? 'fl.zero' : phi > 0 ? 'fl.pos' : 'fl.neg', W / 2, 340);
  note(ctx, 'fl.view', W / 2, 368);
}

/* ---------- Tab 3: variation of S or θ (Exp. 8.2–8.3) ---------- */
function drawRotating(ctx, st) {
  // U magnet: poles N (left) and S (right), uniform B to the right between them
  ctx.fillStyle = cssVar('--mag-n'); roundRect(ctx, 100, 40, 60, 180, 6); ctx.fill();
  ctx.fillStyle = cssVar('--mag-s'); roundRect(ctx, 400, 40, 60, 180, 6); ctx.fill();
  label(ctx, 'N', 130, 130, { size: 18, weight: 800, color: '#fff', halo: false });
  label(ctx, 'S', 430, 130, { size: 18, weight: 800, color: '#fff', halo: false });
  ctx.strokeStyle = C.B(); ctx.fillStyle = C.B(); ctx.lineWidth = 1.2; ctx.globalAlpha = 0.6;
  for (let y = 60; y <= 200; y += 35) arrow(ctx, 165, y, 395, y, 7);
  ctx.globalAlpha = 1;
  label(ctx, 'B', 380, 50, { size: 14, weight: 800, color: C.B() });
  // flat coil turning about the vertical axis (Δ)
  const a = st.ang ?? 0, half = 70 * Math.cos(a);
  ctx.strokeStyle = cssVar('--muted'); ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
  ctx.beginPath(); ctx.moveTo(280, 22); ctx.lineTo(280, 238); ctx.stroke(); ctx.setLineDash([]);
  label(ctx, '(Δ)', 296, 26, { size: 12, weight: 800 });
  ctx.strokeStyle = cssVar('--copper'); ctx.lineWidth = 5;
  ctx.strokeRect(280 - Math.abs(half), 70, Math.max(2, 2 * Math.abs(half)), 120);
  // normal n seen from the side: its component along B
  ctx.strokeStyle = C.n(); ctx.fillStyle = C.n(); ctx.lineWidth = 2.5;
  const nlen = 60 * Math.cos(a);
  if (Math.abs(nlen) > 6) arrow(ctx, 280, 130, 280 + nlen, 130, 8);
  label(ctx, 'n', 280 + nlen + Math.sign(nlen || 1) * 12, 116, { size: 13, weight: 800, color: C.n() });
  const deg = (((a / D2R) % 360) + 360) % 360;
  label(ctx, `θ = ${qty(deg, 0, '°')}`, 280, 252, { size: 13, weight: 800 });
  wire(ctx, [[280, 190], [280, 232], [530, 232], [530, 140]]);
  smallGalvano(ctx, 530, 110, (st.e / RC) * 1000, 0.62);
}
function drawVary(ctx, st) {
  if (st.mode === 'rails') drawRails(ctx, st); else drawRotating(ctx, st);
  const t0 = Math.max(0, st.t - 8), mPhi = st.mode === 'rails' ? 80 : 60, mE = st.mode === 'rails' ? 200 : 300;
  plotCurves(ctx, {
    x: 12, y: 270, w: 284, h: 160, xMin: t0, xMax: t0 + 8, yMin: st.mode === 'rails' ? 0 : -mPhi, yMax: mPhi, xLabel: 't (s)', yLabel: 'Φ (mWb)', xStep: 2,
    curves: st.hist.length ? [{ f: histFn(st.hist, 1), color: C.phi(), label: 'Φ(t)' }] : [],
  });
  plotCurves(ctx, {
    x: 304, y: 270, w: 284, h: 160, xMin: t0, xMax: t0 + 8, yMin: -mE, yMax: mE, xLabel: 't (s)', yLabel: 'e (mV)', xStep: 2,
    curves: st.hist.length ? [{ f: histFn(st.hist, 2), color: C.e(), label: 'e(t)' }] : [],
  });
}

/* ---------- Tab 4: Lenz's law (Exp. 8.4, Application 8.3) ---------- */
function drawLenz(ctx, st) {
  if (st.mode === 'rod') { drawRails(ctx, st, { lenz: true }); note(ctx, 'lz.rodNote', W / 2, 330); return; }
  coilScene(ctx, st, 14);
  magnet(ctx, st);
  const y = COIL.y + COIL.r + 30, xa = st.cx, xb = st.cx + COIL.len;
  label(ctx, 'A', xa - 12, y + 6, { size: 12, weight: 800 });
  label(ctx, 'A′', xb + 14, y + 6, { size: 12, weight: 800 });
  // two LEDs in opposite directions between A and A′
  wire(ctx, [[xa, y], [xa, 330], [xb, 330], [xb, y]]);
  wire(ctx, [[xa, 270], [xb, 270]]);
  const mid = (xa + xb) / 2;
  ctx.fillStyle = cssVar('--scene-bg'); ctx.fillRect(mid - 14, 256, 28, 28); ctx.fillRect(mid - 14, 316, 28, 28);
  // LED 2 conducts from A to A′ outside the coil, i.e. when the current goes from A′ to A in the coil (Exp. 8.4); LED 1 the other way
  drawLED(ctx, mid, 270, Math.PI, cssVar('--s5'), st.led1);
  drawLED(ctx, mid, 330, 0, cssVar('--s1'), st.led2);
  label(ctx, t('lz.led1'), xb + 36, 270, { size: 12, weight: 800, align: 'left', color: cssVar('--s5') });
  label(ctx, t('lz.led2'), xb + 36, 330, { size: 12, weight: 800, align: 'left', color: cssVar('--s1') });
  // induced faces while the flux changes
  if (Math.abs(st.e) > 0.25) {
    const leftN = st.e < 0; // flux (along +x) increasing → induced field towards −x → the face towards the magnet is a north face
    const cL = leftN ? cssVar('--mag-n') : cssVar('--mag-s');
    label(ctx, leftN ? 'N' : 'S', st.cx - 2, COIL.y - COIL.r - 16, { size: 16, weight: 800, color: cL });
    label(ctx, t(leftN ? 'lz.faceN' : 'lz.faceS'), st.cx + COIL.len / 2, COIL.y - COIL.r - 36, { size: 12, weight: 700, color: cL });
    // current in the coil: A′ → A when the flux increases (winding of this coil)
    ctx.fillStyle = C.cur(); ctx.strokeStyle = C.cur(); ctx.lineWidth = 2.5;
    if (leftN) arrow(ctx, xb - 10, COIL.y + COIL.r + 18, xa + 10, COIL.y + COIL.r + 18, 8);
    else arrow(ctx, xa + 10, COIL.y + COIL.r + 18, xb - 10, COIL.y + COIL.r + 18, 8);
    label(ctx, 'i', mid, COIL.y + COIL.r + 6, { size: 13, weight: 800, color: C.cur() });
  }
  dragHint(ctx, st.mx, COIL.y + 34);
  note(ctx, 'lz.fast', W / 2, 22);
}

/* ---------- Tab 5: Faraday's law ---------- */
function drawFaraday(ctx, st) {
  const cx = 400, d = st.d ?? (st.at === 'in' ? 0.01 : 0.15);
  const fake = { cx, mx: cx - d * MM - MAG_L / 2, pole: st.pole };
  coilScene(ctx, fake, 9);
  magnet(ctx, fake);
  wire(ctx, [[cx, COIL.y + COIL.r + 30], [cx, 210], [cx + COIL.len, 210], [cx + COIL.len, COIL.y + COIL.r + 30]]);
  smallGalvano(ctx, 545, 60, (st.e / RC) * 1000, 0.6);
  label(ctx, `d = ${qty(d * 100, 1, 'cm')}`, fake.mx + MAG_L / 2 + (cx - fake.mx - MAG_L / 2) / 2, COIL.y - 40, { size: 12, weight: 800 });
  const a = st.anim, hist = a ? a.hist : st.lastHist || [];
  const tmax = Math.max(2.6, st.T + 0.6);
  const peak = hist.reduce((m, r) => Math.max(m, Math.abs(r[2])), 10);
  plotCurves(ctx, {
    x: 12, y: 230, w: 284, h: 200, xMin: 0, xMax: tmax, yMin: -25, yMax: 25, xLabel: 't (s)', yLabel: 'Φ (mWb)',
    curves: hist.length ? [{ f: histFn(hist, 1), color: C.phi(), label: 'Φ(t)' }] : [],
  });
  const ym = Math.ceil(peak * 1.15 / 10) * 10;
  plotCurves(ctx, {
    x: 304, y: 230, w: 284, h: 200, xMin: 0, xMax: tmax, yMin: -ym, yMax: ym, xLabel: 't (s)', yLabel: 'e (mV)',
    curves: hist.length ? [{ f: histFn(hist, 2), color: C.e(), label: 'e(t)' }] : [],
  });
}

/* ---------- Tab 6: equivalent generator and power (Applications 8.4–8.5, 8.7) ---------- */
function genCalc(st) {
  const I = st.E / (st.R + R_COIL);
  const sg = st.actual === st.sense ? 1 : -1;
  const i = sg * I, e = sg * st.E;
  return { I, i, e, V: R_COIL * i - e, p: st.E * I, pr: R_COIL * I * I, pu: st.R * I * I };
}
function drawGenerator(ctx, st) {
  const g = genCalc(st);
  const L = t('term.C'), Rr = t('term.D');
  // coil between C (left) and D (right)
  drawSolenoid(ctx, 220, 380, 90, 32, { turns: 10 });
  label(ctx, L, 220, 136, { size: 14, weight: 800 });
  label(ctx, Rr, 380, 136, { size: 14, weight: 800 });
  label(ctx, t('gen.coil'), 300, 18, { size: 12, weight: 700, color: cssVar('--muted') });
  wire(ctx, [[220, 90], [110, 90], [110, 250], [190, 250]]);
  ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 2; ctx.strokeRect(190, 238, 80, 24);
  label(ctx, 'R', 230, 250, { size: 13, weight: 800 });
  wire(ctx, [[270, 250], [384, 250]]);
  ctx.fillStyle = cssVar('--surface'); ctx.strokeStyle = cssVar('--meter-a'); ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(408, 250, 22, 0, TAU); ctx.fill(); ctx.stroke();
  label(ctx, 'A', 408, 250, { size: 15, weight: 800, color: cssVar('--meter-a') });
  wire(ctx, [[430, 250], [490, 250], [490, 90], [380, 90]]);
  // actual current direction (conventional): inside the coil from D to C or from C to D
  const rl = st.actual === 'DC' ? -1 : 1; // +1: C → D inside the coil (to the right)
  ctx.strokeStyle = C.cur(); ctx.fillStyle = C.cur(); ctx.lineWidth = 2.5;
  arrow(ctx, 300 - rl * 40, 146, 300 + rl * 40, 146, 9);
  label(ctx, 'i', 300, 162, { size: 14, weight: 800, color: C.cur() });
  ctx.strokeStyle = C.cur(); ctx.fillStyle = C.cur(); ctx.lineWidth = 2.5;
  arrow(ctx, 230 + rl * 30, 280, 230 - rl * 30, 280, 8); // through R the current goes the other way round the loop
  // positive sense chosen on the coil
  ctx.strokeStyle = cssVar('--text'); ctx.fillStyle = cssVar('--text'); ctx.lineWidth = 2;
  const ps = st.sense === 'CD' ? 1 : -1;
  arrow(ctx, 300 - ps * 50, 40, 300 + ps * 50, 40, 9);
  label(ctx, t('gen.sense'), 300 + ps * 64, 40, { size: 12, weight: 800, align: ps > 0 ? 'left' : 'right' });
  label(ctx, `r = ${qty(R_COIL, 0, 'Ω')}`, 300, 190, { size: 12, weight: 700, color: cssVar('--muted') });
  // power distribution
  const mW = 1000;
  drawEnergyBars(ctx, {
    x: 12, y: 296, w: 576, h: 154, unit: 'mW', decimals: 2, min: 0, max: Math.max(1, g.p * mW * 1.15),
    bars: [
      { label: 'p = e i', value: g.p * mW, color: C.e() },
      { label: 'r i²', value: g.pr * mW, color: cssVar('--s4') },
      { label: t('gen.pu'), value: g.pu * mW, color: C.phi() },
    ],
  });
}

/* ================================================================
   Pointer: drag the magnet, the coil or the rod
   ================================================================ */
let drag = null;
canvas.addEventListener('pointerdown', (ev) => {
  if (!shell) return;
  const p = view.toLogical(ev), tab = shell.tab, st = S[tab];
  if (tab === 'evidence' || (tab === 'lenz' && st.mode === 'leds')) {
    if (Math.abs(p.y - COIL.y) > 80) return;
    if (tab === 'evidence' && st.mode === 'coil') { if (p.x < st.cx - 30 || p.x > st.cx + COIL.len + 30) return; drag = { k: 'cx', off: p.x - st.cx }; }
    else { if (Math.abs(p.x - st.mx) > MAG_L / 2 + 30) return; drag = { k: 'mx', off: p.x - st.mx }; }
  } else if ((tab === 'vary' && st.mode === 'rails') || (tab === 'lenz' && st.mode === 'rod')) {
    if (Math.abs(p.x - st.rx) > 40 || p.y < RAIL.yT - 50 || p.y > RAIL.yB + 50) return;
    drag = { k: 'rx', off: p.x - st.rx };
  }
  if (!drag) return;
  canvas.setPointerCapture(ev.pointerId);
});
canvas.addEventListener('pointermove', (ev) => {
  if (!drag || !shell) return;
  const p = view.toLogical(ev), st = S[shell.tab];
  const x = p.x - drag.off;
  if (drag.k === 'mx') st.mx = clamp(x, 60, st.cx - MAG_L / 2 - 4);
  else if (drag.k === 'cx') st.cx = clamp(x, st.mx + MAG_L / 2 + 4, W - COIL.len - 20);
  else st.rx = clamp(x, 180, 560);
});
const endDrag = () => { drag = null; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

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
function tableBlock(st) {
  ui.dl = el('dl', { class: 'meas' });
  ui.tableWrap = el('div', { class: 'table-scroll' });
  ui.table = el('table', { class: 'data' });
  ui.tableWrap.append(ui.table);
  ui.clear = el('div', { class: 'btn-row', style: 'margin-top:8px' }, [createButton({ labelKey: 'ctl.clearTable', variant: 'ghost', onClick: () => { st.rows = []; st.fb = null; refresh(); } })]);
  ui.status = el('p', { class: 'status', hidden: '' });
  measuresBody.append(ui.dl, ui.tableWrap, ui.clear, ui.status);
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
const iRead = (e) => qty((e / RC) * 1000, 2, 'mA');

/* ---------- Tab 1 ---------- */
function buildEvidence() {
  const st = S.evidence;
  controlsBody.append(
    seg(st, 'ctl.move', 'mode', [{ value: 'magnet', labelKey: 'ev.magnet' }, { value: 'coil', labelKey: 'ev.coil' }]),
    seg(st, 'ctl.pole', 'pole', [{ value: 'N', labelKey: 'pole.N' }, { value: 'S', labelKey: 'pole.S' }], () => { st.phiPrev = null; }),
    hint('hint.evidence'), resetBtn('evidence'));
  ui.dl = el('dl', { class: 'meas' }); measuresBody.append(ui.dl);
}
function updateEvidence() {
  const st = S.evidence;
  measRows(ui.dl, [[t('m.d'), qty(gap(st) * 100, 1, 'cm')], [t('m.i'), iRead(st.e)], [t('m.peak'), qty(st.peak, 1, 'mA')]]);
}

/* ---------- Tab 2 ---------- */
function buildFlux() {
  const st = S.flux;
  controlsBody.append(
    seg(st, 'ctl.N', 'N', [1, 10, 100, 1000].map((v) => ({ value: v, labelKey: `n.${v}` })), () => { st.N = Number(st.N); }),
    sliderEl(st, 'ctl.R', 'R', 2, 20, 1, 'cm', 0), sliderEl(st, 'ctl.B', 'B', 0.05, 0.5, 0.01, 'T', 2),
    sliderEl(st, 'ctl.alpha', 'alpha', 0, 90, 5, '°', 0),
    seg(st, 'ctl.sense', 'sense', [{ value: 1, labelKey: 'fl.sense1' }, { value: -1, labelKey: 'fl.sense2' }], () => { st.sense = Number(st.sense); }),
    btnRow(recordBtn(() => { st.rows.push({ N: st.N, R: st.R, B: st.B, alpha: st.alpha, sense: st.sense }); st.fb = null; refresh(); })),
    hint('hint.flux'), resetBtn('flux'));
  tableBlock(st);
}
function updateFlux() {
  const st = S.flux, f = fluxCalc(st);
  measRows(ui.dl, [[t('m.alpha'), qty(st.alpha, 0, '°')], [t('m.sign'), t(Math.abs(f.phi) < 1e-12 ? 'fl.zeroS' : f.phi > 0 ? 'fl.posS' : 'fl.negS')]]);
  renderTable(st, st.rows, ['col.N', 'col.Rm', 'col.B', 'col.alpha', 'col.theta', 'col.phi'], (r) => {
    const fr = fluxCalc(r), mWb = fr.phi * 1000;
    return el('tr', {}, [td(String(r.N)), td(num(r.R / 100, 2)), td(num(r.B, 2)), td(num(r.alpha, 0)),
      cell(st, r, 'th', fr.theta, 0, 0.5, 'fb.thOk', 'fb.thWrong'),
      cell(st, r, 'phi', mWb, Math.abs(mWb) < 10 ? 2 : 1, relTol(mWb, 0.01, 0.006), 'fb.phiOk', 'fb.phiWrong', !calcDone(r, 'th'))]);
  });
}

/* ---------- Tab 3 ---------- */
function buildVary() {
  const st = S.vary;
  controlsBody.append(seg(st, 'ctl.exp', 'mode', [{ value: 'rails', labelKey: 'va.rails' }, { value: 'rotate', labelKey: 'va.rotate' }], () => { Object.assign(st, { hist: [], t: 0, e: 0, phiPrev: null, run: false }); buildTab('vary'); }));
  if (st.mode === 'rotate') {
    controlsBody.append(sliderEl(st, 'ctl.ns', 'ns', 0.1, 0.75, 0.05, t('u.tps'), 2));
    ui.go = createButton({ labelKey: 'ctl.turn', variant: 'primary', onClick: () => { st.run = !st.run; refresh(); } });
    controlsBody.append(btnRow(ui.go));
  }
  controlsBody.append(hint(`hint.${st.mode}`), resetBtn('vary'));
  ui.dl = el('dl', { class: 'meas' }); measuresBody.append(ui.dl);
}
function updateVary() {
  const st = S.vary;
  if (ui.go) { const k = st.run ? 'ctl.stop' : 'ctl.turn'; if (ui.go.dataset.i18n !== k) { ui.go.dataset.i18n = k; ui.go.textContent = t(k); } }
  const rows = st.mode === 'rails'
    ? [[t('m.S'), qty(RAIL.l * (st.rx - RAIL.xL) / RAIL.k * 1e4, 0, 'cm²')], [t('m.phi'), qty(st.phi * 1000, 1, 'mWb')], [t('m.e'), qty(st.e * 1000, 0, 'mV')], [t('m.i'), iRead(st.e)]]
    : [[t('m.phi'), qty(st.phi * 1000, 1, 'mWb')], [t('m.e'), qty(st.e * 1000, 0, 'mV')], [t('m.i'), iRead(st.e)]];
  measRows(ui.dl, rows);
}

/* ---------- Tab 4 ---------- */
function buildLenz() {
  const st = S.lenz;
  controlsBody.append(seg(st, 'ctl.lenzExp', 'mode', [{ value: 'leds', labelKey: 'lz.leds' }, { value: 'rod', labelKey: 'lz.rod' }], () => { Object.assign(st, { e: 0, phiPrev: null, vS: 0 }); buildTab('lenz'); }));
  if (st.mode === 'leds') controlsBody.append(seg(st, 'ctl.pole', 'pole', [{ value: 'N', labelKey: 'pole.N' }, { value: 'S', labelKey: 'pole.S' }], () => { st.phiPrev = null; }));
  controlsBody.append(hint(`hint.${st.mode}`), resetBtn('lenz'));
  ui.dl = el('dl', { class: 'meas' }); measuresBody.append(ui.dl);
}
function updateLenz() {
  const st = S.lenz;
  if (st.mode === 'leds') {
    const which = st.led2 > 0.05 ? 'lz.led2' : st.led1 > 0.05 ? 'lz.led1' : 'lz.none';
    measRows(ui.dl, [[t('m.eLed'), qty(st.e, 2, 'V')], [t('m.glow'), t(which)]]);
  } else measRows(ui.dl, [[t('m.v'), qty(st.vS, 2, 'm/s')], [t('m.i'), iRead(st.e)]]);
}

/* ---------- Tab 5 ---------- */
function buildFaraday() {
  const st = S.faraday;
  ui.T = createSlider({ labelKey: 'ctl.T', min: 0.2, max: 2, step: 0.1, value: st.T, unit: 's', decimals: 1, onInput: (v) => { st.T = v; refresh(); } });
  ui.move = createButton({ labelKey: 'ctl.moveIn', variant: 'primary', onClick: () => {
    if (st.anim) return;
    const from = st.at === 'in' ? 0.01 : 0.15, to = st.at === 'in' ? 0.15 : 0.01;
    st.anim = { t: 0, from, to, phi1: phiOf(from, TURNS, st.pole), hist: [] };
    st.lastHist = st.anim.hist; st.at = st.at === 'in' ? 'out' : 'in'; st.e = 0; st.phiPrev = null;
    refresh();
  } });
  ui.rec = recordBtn(() => {
    if (!st.last) { st.fb = { type: 'warn', key: 'fb.moveFirst' }; refresh(); return; }
    st.rows.push({ ...st.last }); st.last = null; st.fb = null; refresh();
  });
  controlsBody.append(seg(st, 'ctl.pole', 'pole', [{ value: 'N', labelKey: 'pole.N' }, { value: 'S', labelKey: 'pole.S' }], () => { Object.assign(st, { at: 'out', anim: null, last: null, lastHist: [], phiPrev: null, e: 0 }); }),
    ui.T.root, btnRow(ui.move, ui.rec), hint('hint.faraday'), resetBtn('faraday'));
  tableBlock(st);
}
function updateFaraday() {
  const st = S.faraday;
  const k = st.at === 'in' ? 'ctl.moveOut' : 'ctl.moveIn';
  if (ui.move.dataset.i18n !== k) { ui.move.dataset.i18n = k; ui.move.textContent = t(k); }
  ui.move.disabled = !!st.anim; ui.T.setDisabled?.(!!st.anim);
  const d = st.d ?? 0.15;
  measRows(ui.dl, [[t('m.d'), qty(d * 100, 1, 'cm')], [t('m.phi'), qty(phiOf(d, TURNS, st.pole) * 1000, 2, 'mWb')], [t('m.i'), iRead(st.e)],
    [t('m.last'), st.last ? `Δt = ${qty(st.last.T, 1, 's')}` : '—']]);
  renderTable(st, st.rows, ['col.dt', 'col.phi1', 'col.phi2', 'col.dphi', 'col.emean'], (r) => {
    const p1 = r.phi1 * 1000, p2 = r.phi2 * 1000, dp = p2 - p1, em = -dp / r.T;
    return el('tr', {}, [td(num(r.T, 1)), td(num(p1, 2)), td(num(p2, 2)),
      cell(st, r, 'dp', dp, 2, 0.011, 'fb.dpOk', 'fb.dpWrong'),
      cell(st, r, 'em', em, 1, relTol(em, 0.02, 0.06), 'fb.emOk', 'fb.emWrong', !calcDone(r, 'dp'))]);
  });
}

/* ---------- Tab 6 ---------- */
function buildGenerator() {
  const st = S.generator;
  const ab = (k) => [{ value: 'CD', labelKey: `gen.${k}CD` }, { value: 'DC', labelKey: `gen.${k}DC` }];
  controlsBody.append(
    sliderEl(st, 'ctl.E', 'E', 0.5, 3, 0.1, 'V', 1), sliderEl(st, 'ctl.Rr', 'R', 100, 1000, 50, 'Ω', 0),
    seg(st, 'ctl.actual', 'actual', ab('cur')), seg(st, 'ctl.senseG', 'sense', ab('pos')),
    btnRow(recordBtn(() => { st.rows.push({ E: st.E, R: st.R, sense: st.sense, actual: st.actual }); st.fb = null; refresh(); })),
    hint('hint.generator'), resetBtn('generator'));
  tableBlock(st);
}
function updateGenerator() {
  const st = S.generator, g = genCalc(st);
  measRows(ui.dl, [[t('m.E'), qty(st.E, 2, 'V')], [t('m.I'), qty(g.I * 1000, 2, 'mA')], [t('m.r'), qty(R_COIL, 0, 'Ω')], [t('m.p'), qty(g.p * 1000, 2, 'mW')]]);
  renderTable(st, st.rows, ['col.sense', 'col.Em', 'col.R', 'col.ialg', 'col.ealg', 'col.V', 'col.Vval'], (r) => {
    const gr = genCalc(r), vName = t(r.sense === 'CD' ? 'gen.VCD' : 'gen.VDC');
    return el('tr', {}, [td(t(`gen.pos${r.sense}`)), td(num(r.E, 1)), td(num(r.R, 0)),
      cell(st, r, 'i', gr.i * 1000, 2, 0.006, 'fb.iOk', 'fb.iWrong'),
      cell(st, r, 'e', gr.e, 1, 0.006, 'fb.eOk', 'fb.eWrong', !calcDone(r, 'i')),
      td(vName),
      cell(st, r, 'V', gr.V, 2, relTol(gr.V, 0.01, 0.006), 'fb.VOk', 'fb.VWrong', !calcDone(r, 'e'))]);
  });
}

/* ---------- Tab switching ---------- */
function buildTab(id) {
  controlsBody.replaceChildren();
  measuresBody.replaceChildren();
  ui = {};
  tableSig = '';
  ({ evidence: buildEvidence, flux: buildFlux, vary: buildVary, lenz: buildLenz, faraday: buildFaraday, generator: buildGenerator })[id]();
  loop.start();
  shell?.refreshActivity();
  refresh();
}
function updateMeasures() {
  if (!shell || !ui.dl) return;
  ({ evidence: updateEvidence, flux: updateFlux, vary: updateVary, lenz: updateLenz, faraday: updateFaraday, generator: updateGenerator })[shell.tab]();
}
function refresh() { updateMeasures(); requestDraw(); }
function resetTab(id) { S[id] = initialState(id); buildTab(id); }
onLangChange(() => { if (shell) buildTab(shell.tab); });

shell = initSim({
  strings,
  tabs: TABS.map((id) => ({ id, labelKey: `tab.${id}` })),
  initialTab: 'evidence',
  onTab: buildTab,
  activityKey: (tab) => (tab === 'vary' ? `act.vary.${S.vary.mode}` : tab === 'lenz' ? `act.lenz.${S.lenz.mode}` : `act.${tab}`),
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, phiOf, fluxCalc, genCalc, gap };
