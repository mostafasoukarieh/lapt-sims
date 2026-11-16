// Sec 2 S — Chapter 5: sound energy (power, intensity, intensity level, audiogram, Doppler effect). Real sounds via shared/audio.js.
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange, getLang } from '../../../shared/i18n.js';
import { num, qty } from '../../../shared/format.js';
import { createButton, createSegmented, createSlider, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, font, arrow } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { label, person } from '../../../shared/figures.js';
import { calcCell, calcSig, calcDone } from '../../../shared/calc-cell.js';
import { drawSpeaker, drawMicrophone, drawSoundArcs } from '../../../shared/sound-draw.js';
import { audioAvailable, createVoice, setMuted, isMuted, setVolume, getVolume, stopAll } from '../../../shared/audio.js';

const TAU = 2 * Math.PI;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const frac = (x) => x - Math.floor(x);
const playable = (f) => f >= 100 && f <= 15000;
const I0 = 1e-12;
const levelOf = (I) => 10 * Math.log10(I / I0);
const V_SOUND = 340;

/* ---------- number helpers ---------- */
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const sup = (n) => String(n).split('').map((c) => SUP[c]).join('');
// mantissa rounded to `dec` decimals and exponent, e.g. 2.0 × 10⁻⁸
function sciParts(x, dec = 1) {
  let e = Math.floor(Math.log10(x) + 1e-9);
  let m = Math.round((x / 10 ** e) * 10 ** dec) / 10 ** dec;
  if (m >= 10) { m /= 10; e += 1; }
  return { m, e };
}
function sci(x, dec = 1, lang = getLang()) {
  if (x === 0) return '0';
  const { m, e } = sciParts(x, dec);
  if (e === 0) return num(m, dec, lang);
  if (m === 1) return `10${sup(e)}`;
  return `${num(m, dec, lang)} × 10${sup(e)}`;
}
// decimals giving 3 significant figures
const dec3 = (x) => clamp(2 - Math.floor(Math.log10(Math.abs(x) || 1)), 0, 6);

/* ================================================================
   Model
   ================================================================ */
// Intensity tab: scale 12 px per metre, the source at x = 60
const INT_X0 = 60, INT_Y = 150, PXM_I = 12;
const intP = (st) => st.P * st.a * st.a; // P = k a² (the slider gives P for the amplitude a₀)
const intI = (st) => intP(st) / (4 * Math.PI * st.R * st.R); // W/m²

// Level tab
const LEVELS = [0, 20, 30, 40, 50, 65, 80, 95, 120, 130];
const EXPO = [[85, 'ex.85'], [90, 'ex.90'], [95, 'ex.95'], [100, 'ex.100'], [105, 'ex.105'], [110, 'ex.110']];
const lvI = (st) => { const { m, e } = sciParts(10 ** st.lI, 1); return m * 10 ** e; }; // shown value, 1 decimal

// Audiogram: Terhardt's threshold of hearing, raised at low frequencies (+12 dB around 64 Hz) so that,
// as in the book, 64 Hz is not audible at 40 dB. 20 Hz ≈ 85 dB, 64 Hz ≈ 45 dB, 256 Hz ≈ 11 dB.
function threshold(f) {
  const k = f / 1000;
  const lf = Math.log10(f / 64) / 0.35;
  return 3.64 * k ** -0.8 - 6.5 * Math.exp(-0.6 * (k - 3.3) ** 2) + 1e-3 * k ** 4 + 12 * Math.exp(-lf * lf);
}
const PAIN = 120;
const AG = { x1: 70, x2: 575, y1: 26, y2: 350, lmin: -10, lmax: 140, fmin: 20, fmax: 20000 };
const agX = (f) => AG.x1 + ((Math.log10(f) - Math.log10(AG.fmin)) / 3) * (AG.x2 - AG.x1);
const agY = (L) => AG.y2 - ((L - AG.lmin) / (AG.lmax - AG.lmin)) * (AG.y2 - AG.y1);
const agF = (x) => 10 ** (Math.log10(AG.fmin) + (3 * (x - AG.x1)) / (AG.x2 - AG.x1));
const agL = (y) => AG.lmin + ((AG.y2 - y) / (AG.y2 - AG.y1)) * (AG.lmax - AG.lmin);
function audState(f, L) {
  if (f < 20 || f > 20000) return 'out';
  if (L > PAIN) return 'pain';
  return L >= threshold(f) ? 'yes' : 'no';
}

// Doppler — ripple tank: waves at 80 px/s, vibrator 2 Hz → λ = 40 px = 2 cm (20 px/cm)
const TANK = { x1: 20, x2: 580, y1: 30, y2: 330, c: 80, f: 2, pxcm: 20 };
// Doppler — road: observer (or fixed siren) 30 m from the road, 1.25 px per metre, run from −200 m to +200 m
const ROAD = { y: 112, D: 30, pxm: 1.25, cx: 300, xmin: -200, xmax: 200 };
const F_SIREN = 1000;
const roadX = (m) => ROAD.cx + m * ROAD.pxm;
// radial speed of approach (positive when they come closer) at position x (m) along the road
const approach = (x, u) => (u * -x) / Math.hypot(x, ROAD.D);
function heard(mover, x, u) {
  const vr = approach(x, u);
  return mover === 'source' ? (F_SIREN * V_SOUND) / (V_SOUND - vr) : (F_SIREN * (V_SOUND + vr)) / V_SOUND;
}
const fTowards = (mover, u) => (mover === 'source' ? (F_SIREN * V_SOUND) / (V_SOUND - u) : (F_SIREN * (V_SOUND + u)) / V_SOUND);
const fAway = (mover, u) => (mover === 'source' ? (F_SIREN * V_SOUND) / (V_SOUND + u) : (F_SIREN * (V_SOUND - u)) / V_SOUND);

let now = 0;
function initialState(tab) {
  switch (tab) {
    case 'intensity': return { P: 0.8, a: 1, R: 10, S: 28, rows: [], fb: null };
    case 'level': return { lI: -8, n: 1, play: false, rows: [], fb: null };
    case 'audiogram': return { lf: Math.log10(256), L: 40, play: false };
    default: return { view: 'tank', beta: 0.3, tx: TANK.x1 + 60, em: [], emAcc: 0, mover: 'source', u: 25, x: ROAD.xmin, run: true, rows: [], fb: null };
  }
}
const TABS = ['intensity', 'level', 'audiogram', 'doppler'];
let S = Object.fromEntries(TABS.map((k) => [k, initialState(k)]));

/* ================================================================
   Sound
   ================================================================ */
setMuted(true); // off by default (owner, 9 Nov 2026)
const voices = {};
function voice(key, opts) { if (isMuted()) return null; if (!voices[key]) voices[key] = createVoice(opts); return voices[key]; }
const lastGain = {};
function stopVoices() { stopAll(); for (const k of Object.keys(voices)) delete voices[k]; for (const k of Object.keys(lastGain)) delete lastGain[k]; }
function setG(key, v, g) { if (!v || (lastGain[key] != null && Math.abs(lastGain[key] - g) < 0.002)) return; lastGain[key] = g; v.setGain(g, 0.04); }
// loudness of the device from a level: 0 dB → silent, 120 dB → loudest (only suggests the level)
const gainOfLevel = (L) => (L <= 0 ? 0 : 0.02 + 0.33 * clamp(L / 120, 0, 1) ** 1.6);
function updateAudio() {
  if (!shell || isMuted()) return;
  const tab = shell.tab;
  if (tab === 'level') {
    const st = S.level, v = voice('lvl', { freq: 1000 });
    setG('lvl', v, st.play ? gainOfLevel(levelOf(st.n * lvI(st))) : 0);
  } else if (tab === 'audiogram') {
    const st = S.audiogram, f = 10 ** st.lf, v = voice('ag', { freq: clamp(f, 100, 15000) });
    if (v) v.setFreq(clamp(f, 100, 15000));
    // the device cannot reproduce the threshold: it plays only the sounds the model says are heard
    const ok = st.play && playable(f) && audState(f, st.L) !== 'no';
    setG('ag', v, ok ? gainOfLevel(st.L - threshold(f) + 10) : 0);
  } else if (tab === 'doppler') {
    const st = S.doppler;
    if (st.view !== 'road') return;
    const f = heard(st.mover, st.x, st.u), v = voice('siren', { freq: f, harmonics: [1, 0.45, 0.2, 0.1] });
    if (v) v.setFreq(f);
    const r = Math.hypot(st.x, ROAD.D);
    setG('siren', v, st.run ? 0.3 * clamp(40 / r, 0.12, 1) : 0);
  }
}

/* ================================================================
   Canvas and loop
   ================================================================ */
const HEIGHTS = { intensity: 360, level: 380, audiogram: 400, doppler: 380 };
let shell;
let drawQueued = false;
const canvas = document.getElementById('stage');
canvas.style.touchAction = 'none';
const view = setupCanvas(canvas, { width: 600, height: 360, maxHeightVh: () => (window.innerWidth < 880 ? 50 : 74), onResize: () => requestDraw() });
function requestDraw() { if (drawQueued) return; drawQueued = true; requestAnimationFrame(() => { drawQueued = false; draw(); }); }
onThemeChange(() => requestDraw());

const loop = createLoop({
  step(dt) {
    now += dt;
    if (!shell) return false;
    if (shell.tab === 'doppler') stepDoppler(S.doppler, dt);
    updateAudio();
    return true;
  },
  render() { draw(); updateMeasures(); },
});

function stepDoppler(st, dt) {
  if (st.view === 'tank') {
    const vs = st.beta * TANK.c;
    st.tx += vs * dt;
    if (st.tx > TANK.x2 - 40) { st.tx = TANK.x1 + 60; st.em = []; st.emAcc = 0; }
    st.emAcc += dt;
    const T = 1 / TANK.f;
    while (st.emAcc >= T) { st.emAcc -= T; st.em.push({ x: st.tx - vs * st.emAcc, t: now - st.emAcc }); }
    st.em = st.em.filter((e) => (now - e.t) * TANK.c < 700);
  } else if (st.run && !dragging) {
    st.x += st.u * dt;
    if (st.x >= ROAD.xmax) { st.x = ROAD.xmax; st.run = false; }
  }
}

/* ================================================================
   Drawing
   ================================================================ */
function draw() {
  if (!shell) return;
  const tab = shell.tab;
  if (view.height !== HEIGHTS[tab]) view.setLogicalSize(600, HEIGHTS[tab]);
  const ctx = view.begin();
  ctx.fillStyle = cssVar('--scene-bg');
  roundRect(ctx, 0, 0, 600, HEIGHTS[tab], 14);
  ctx.fill();
  ({ intensity: drawIntensity, level: drawLevel, audiogram: drawAudiogram, doppler: drawDoppler })[tab](ctx, S[tab]);
}
function note(ctx, s, x, y, align = 'center', size = 11, color = cssVar('--muted'), weight = 700) { label(ctx, s, x, y, { size, weight, color, align, halo: color !== '#fff' }); }
function meterBox(ctx, x, y, L, w = 130) {
  // digital sound level meter
  ctx.fillStyle = cssVar('--device'); roundRect(ctx, x - w / 2, y - 34, w, 86, 10); ctx.fill();
  ctx.fillStyle = '#c9e6c0'; roundRect(ctx, x - w / 2 + 10, y - 24, w - 20, 36, 5); ctx.fill();
  const txt = L <= -0.05 ? '< 0' : num(L, 1);
  label(ctx, `${txt} dB`, x, y - 6, { size: 18, weight: 800, color: L > PAIN ? '#b3261e' : '#1d3b1a', halo: false });
  ctx.fillStyle = '#9aa4b0'; ctx.beginPath(); ctx.arc(x, y + 52 + 14, 14, 0, TAU); ctx.fill(); // microphone ball
  ctx.fillStyle = cssVar('--device'); ctx.fillRect(x - 6, y + 50, 12, 6);
  note(ctx, t('meter'), x, y + 30, 'center', 11, cssVar('--text-on-meter'));
}

/* ---------- power and intensity ---------- */
function drawIntensity(ctx, st) {
  const y = INT_Y, I = intI(st), Rpx = st.R * PXM_I;
  // travelling spherical wavefronts
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 600, 262); ctx.clip();
  ctx.strokeStyle = cssVar('--primary'); ctx.lineWidth = 1.6 + 0.6 * st.a;
  for (let k = 0; k < 14; k++) {
    const r = 10 + ((now * 60 + k * 40) % 560);
    ctx.globalAlpha = clamp(0.75 * (1 - r / 600) * (0.45 + 0.15 * st.a), 0, 1);
    ctx.beginPath(); ctx.arc(INT_X0, y, r, 0, TAU); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // the sphere of radius R
  ctx.strokeStyle = cssVar('--accent'); ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
  ctx.beginPath(); ctx.arc(INT_X0, y, Rpx, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  ctx.restore();
  const ang = -0.62;
  note(ctx, t('sphere'), clamp(INT_X0 + Rpx * Math.cos(ang) + 6, 70, 560), clamp(y + Rpx * Math.sin(ang) - 8, 14, 240), 'left', 11, cssVar('--accent'));
  // source
  ctx.fillStyle = '#e0a21b'; ctx.beginPath(); ctx.arc(INT_X0, y, 9 + st.a, 0, TAU); ctx.fill();
  note(ctx, t('source'), INT_X0, y + 24);
  // microphone on the sphere, its membrane facing the source
  const mx = INT_X0 + Rpx;
  drawMicrophone(ctx, { x: mx + 16, y, dir: -1, stand: 50 });
  const sh = 6 + Math.sqrt(st.S) * 1.6; // membrane drawn bigger than real, for visibility
  ctx.strokeStyle = cssVar('--accent'); ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(mx, y - sh / 2); ctx.lineTo(mx, y + sh / 2); ctx.stroke();
  note(ctx, `S = ${qty(st.S, 0, 'cm²')}`, clamp(mx, 70, 560), y - 26, 'center', 11, cssVar('--text'));
  // distance R
  ctx.strokeStyle = cssVar('--muted'); ctx.fillStyle = cssVar('--muted'); ctx.lineWidth = 1.5;
  const ay = y + 64;
  if (Rpx > 24) { arrow(ctx, (INT_X0 + mx) / 2, ay, INT_X0, ay, 6); arrow(ctx, (INT_X0 + mx) / 2, ay, mx, ay, 6); }
  note(ctx, `R = ${qty(st.R, 0, 'm')}`, Math.max((INT_X0 + mx) / 2, 90), ay - 12, 'center', 12, cssVar('--text'));
  // sound level meter
  meterBox(ctx, 520, 46, levelOf(I), 120);
  // graph I(R)
  const gx1 = INT_X0, gx2 = INT_X0 + 40 * PXM_I, gy1 = 274, gy2 = 340;
  ctx.fillStyle = cssVar('--scene-bg'); ctx.fillRect(0, 262, 600, 98);
  ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.moveTo(gx1, gy1 - 6); ctx.lineTo(gx1, gy2); ctx.lineTo(gx2 + 8, gy2); ctx.stroke();
  const Imax = intP(st) / (4 * Math.PI * 4); // I at 2 m
  const gy = (Ix) => gy2 - (Math.min(Ix, Imax) / Imax) * (gy2 - gy1);
  ctx.strokeStyle = cssVar('--primary'); ctx.lineWidth = 2; ctx.beginPath();
  for (let R = 2; R <= 40.01; R += 0.25) { const Ix = intP(st) / (4 * Math.PI * R * R); const xx = INT_X0 + R * PXM_I; if (R === 2) ctx.moveTo(xx, gy(Ix)); else ctx.lineTo(xx, gy(Ix)); }
  ctx.stroke();
  if (st.R >= 2) { ctx.fillStyle = cssVar('--accent'); ctx.beginPath(); ctx.arc(mx, gy(I), 5, 0, TAU); ctx.fill(); }
  ctx.fillStyle = cssVar('--muted'); ctx.font = font(10, 600); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let R = 0; R <= 40; R += 10) ctx.fillText(String(R), INT_X0 + R * PXM_I, gy2 + 3);
  note(ctx, t('ax.R'), gx2 + 10, gy2 - 10, 'right', 10);
  note(ctx, t('ax.Ir'), gx1 + 8, gy1 - 2, 'left', 10);
}

/* ---------- intensity level ---------- */
const LV = { x: 340, y0: 350, y1: 36 }; // scale 0 dB at y0, 140 dB at y1
const lvY = (L) => LV.y0 - (clamp(L, -5, 145) / 140) * (LV.y0 - LV.y1);
function drawLevel(ctx, st) {
  const I1 = lvI(st), I = st.n * I1, L = levelOf(I);
  // the identical sources
  const amp = clamp(L / 100, 0.15, 1);
  for (let k = 0; k < st.n; k++) {
    const col = k % 2, row = Math.floor(k / 2);
    const x = 34 + col * 56, y = 56 + row * 56;
    const [sx, sy] = drawSpeaker(ctx, { x, y, size: 0.55, dir: 1, cone: 1.5 * amp * Math.sin(TAU * now * 3) });
    if (I1 > 2e-12) drawSoundArcs(ctx, { x: sx + 2, y: sy, amp, phase: frac(now * 1.2), n: 2, step: 12, spread: 0.5, color: cssVar('--primary') });
  }
  // meter
  meterBox(ctx, 210, 150, L, 130);
  note(ctx, `n = ${st.n}`, 170, 326, 'center', 12, cssVar('--text'));
  note(ctx, `I = ${st.n} × ${sci(I1)} = ${sci(I, 2)} W/m²`, 170, 348, 'center', 11, cssVar('--text'));
  // scale 0 → 140 dB
  ctx.fillStyle = 'rgba(214,52,44,0.13)'; ctx.fillRect(LV.x - 10, lvY(140), 20, lvY(85) - lvY(140));
  ctx.fillStyle = 'rgba(46,163,107,0.13)'; ctx.fillRect(LV.x - 10, lvY(85), 20, lvY(0) - lvY(85));
  ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(LV.x, lvY(0)); ctx.lineTo(LV.x, lvY(140)); ctx.stroke();
  ctx.font = font(10, 700); ctx.textBaseline = 'middle'; ctx.textAlign = 'right'; ctx.fillStyle = cssVar('--muted');
  for (let d = 0; d <= 140; d += 10) { ctx.beginPath(); ctx.moveTo(LV.x - 4, lvY(d)); ctx.lineTo(LV.x + 4, lvY(d)); ctx.stroke(); if (d % 20 === 0) ctx.fillText(String(d), LV.x - 13, lvY(d)); }
  note(ctx, 'dB', LV.x, LV.y1 - 18, 'center', 11, cssVar('--text'));
  for (const d of LEVELS) {
    const special = d === 0 || d === PAIN;
    const col = d === PAIN ? '#b3261e' : special ? cssVar('--primary') : cssVar('--muted');
    let yy = lvY(d);
    if (d === 130) yy -= 4; else if (d === PAIN) yy += 4;
    note(ctx, `${d} — ${t(d === 0 ? 'hearing' : d === PAIN ? 'pain' : `lv.${d}`)}`, LV.x + 14, yy, 'left', 10, col, special ? 800 : 600);
  }
  ctx.save(); ctx.translate(LV.x - 42, lvY(102)); ctx.rotate(-Math.PI / 2); note(ctx, t('danger'), 0, 0, 'center', 10, '#b3261e'); ctx.restore();
  // marker
  const y = lvY(L);
  ctx.fillStyle = cssVar('--accent');
  ctx.beginPath(); ctx.moveTo(LV.x - 12, y); ctx.lineTo(LV.x - 24, y - 7); ctx.lineTo(LV.x - 24, y + 7); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = cssVar('--accent'); ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(LV.x - 12, y); ctx.lineTo(LV.x + 10, y); ctx.stroke();
}

/* ---------- audiogram ---------- */
function drawAudiogram(ctx, st) {
  const f = 10 ** st.lf;
  // audible region
  ctx.fillStyle = 'rgba(46,163,107,0.16)';
  ctx.beginPath();
  let first = true;
  for (let x = AG.x1; x <= AG.x2; x += 2) { const yy = agY(Math.min(threshold(agF(x)), PAIN)); if (first) { ctx.moveTo(x, yy); first = false; } else ctx.lineTo(x, yy); }
  ctx.lineTo(AG.x2, agY(PAIN)); ctx.lineTo(AG.x1, agY(PAIN)); ctx.closePath(); ctx.fill();
  // grid and axes
  ctx.strokeStyle = cssVar('--border'); ctx.lineWidth = 1;
  ctx.fillStyle = cssVar('--muted'); ctx.font = font(10, 600);
  for (const fg of [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]) {
    const x = agX(fg);
    ctx.beginPath(); ctx.moveTo(x, AG.y1); ctx.lineTo(x, AG.y2); ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(fg >= 1000 ? `${num(fg / 1000, 0)} k` : String(fg), x, AG.y2 + 4);
  }
  for (let L = 0; L <= 140; L += 20) {
    const yy = agY(L);
    ctx.beginPath(); ctx.moveTo(AG.x1, yy); ctx.lineTo(AG.x2, yy); ctx.stroke();
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(String(L), AG.x1 - 6, yy);
  }
  ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 1.4; ctx.strokeRect(AG.x1, AG.y1, AG.x2 - AG.x1, AG.y2 - AG.y1);
  note(ctx, t('ax.f'), AG.x2, AG.y2 + 30, 'right', 11, cssVar('--text'));
  note(ctx, t('ax.L'), AG.x1 - 6, AG.y1 - 12, 'right', 11, cssVar('--text'));
  // human sounds (speech): about 250–4000 Hz, 30–70 dB
  ctx.strokeStyle = cssVar('--muted'); ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
  const ex1 = agX(250), ex2 = agX(4000), ey1 = agY(70), ey2 = agY(30);
  ctx.beginPath(); ctx.ellipse((ex1 + ex2) / 2, (ey1 + ey2) / 2, (ex2 - ex1) / 2, (ey2 - ey1) / 2, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  note(ctx, t('humanSounds'), (ex1 + ex2) / 2, ey1 + 12, 'center', 10);
  // threshold of hearing and of pain
  ctx.strokeStyle = cssVar('--primary'); ctx.lineWidth = 2.5; ctx.beginPath();
  first = true;
  for (let x = AG.x1; x <= AG.x2; x += 2) { const L = threshold(agF(x)); if (L > AG.lmax) { first = true; continue; } const yy = agY(L); if (first) { ctx.moveTo(x, yy); first = false; } else ctx.lineTo(x, yy); }
  ctx.stroke();
  ctx.strokeStyle = '#b3261e'; ctx.beginPath(); ctx.moveTo(AG.x1, agY(PAIN)); ctx.lineTo(AG.x2, agY(PAIN)); ctx.stroke();
  note(ctx, t('pain'), (AG.x1 + AG.x2) / 2, agY(PAIN) - 10, 'center', 11, '#b3261e', 800);
  note(ctx, t('hearing'), agX(700), agY(threshold(700)) + 14, 'center', 11, cssVar('--primary'), 800);
  note(ctx, t('audible'), agX(1500), agY(95), 'center', 13, '#2e8b57', 800);
  // the point
  const px = agX(clamp(f, AG.fmin, AG.fmax)), py = agY(st.L), s = audState(f, st.L);
  const col = s === 'yes' ? '#2e8b57' : s === 'pain' ? '#b3261e' : cssVar('--accent');
  ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(px, AG.y2); ctx.lineTo(px, py); ctx.lineTo(AG.x1, py); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = col; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(px, py, 9, 0, TAU); ctx.fill(); ctx.stroke();
  note(ctx, `${fText(f)}, ${qty(st.L, 0, 'dB')}`, clamp(px + (px > 440 ? -14 : 14), 80, 570), py - 16, px > 440 ? 'right' : 'left', 12, col, 800);
}
function fText(f) {
  if (f >= 10000) return qty(f / 1000, 1, 'kHz');
  if (f >= 1000) return qty(Math.round(f / 10) * 10, 0, 'Hz');
  return qty(Math.round(f), 0, 'Hz');
}

/* ---------- Doppler ---------- */
function drawDoppler(ctx, st) { if (st.view === 'tank') drawTank(ctx, st); else drawRoad(ctx, st); }
function drawTank(ctx, st) {
  const { x1, x2, y1, y2 } = TANK, cy = (y1 + y2) / 2;
  ctx.fillStyle = '#cfe6f3'; roundRect(ctx, x1, y1, x2 - x1, y2 - y1, 10); ctx.fill();
  ctx.save(); roundRect(ctx, x1, y1, x2 - x1, y2 - y1, 10); ctx.clip();
  ctx.strokeStyle = '#2f6fa8'; ctx.lineWidth = 2;
  for (const e of st.em) { const r = (now - e.t) * TANK.c; if (r <= 0) continue; ctx.beginPath(); ctx.arc(e.x, cy, r, 0, TAU); ctx.stroke(); }
  ctx.restore();
  // vibrator
  ctx.fillStyle = '#3a3f48'; ctx.fillRect(st.tx - 3, cy - 40, 6, 34);
  ctx.fillStyle = '#e0a21b'; ctx.beginPath(); ctx.arc(st.tx, cy, 6, 0, TAU); ctx.fill();
  note(ctx, t('vibrator'), st.tx, cy - 50, 'center', 11, cssVar('--text'));
  // wavelength brackets in front and behind, read from the crests on the axis
  const vs = st.beta * TANK.c;
  const ahead = st.em.map((e) => e.x + (now - e.t) * TANK.c).filter((x) => x > st.tx + 1 && x < x2 - 4).sort((a, b) => a - b);
  const back = st.em.map((e) => e.x - (now - e.t) * TANK.c).filter((x) => x < st.tx - 1 && x > x1 + 4).sort((a, b) => b - a);
  const bracket = (xa, xb, yy, txt) => {
    ctx.strokeStyle = cssVar('--accent'); ctx.fillStyle = cssVar('--accent'); ctx.lineWidth = 1.6;
    arrow(ctx, (xa + xb) / 2, yy, xa, yy, 5); arrow(ctx, (xa + xb) / 2, yy, xb, yy, 5);
    note(ctx, txt, (xa + xb) / 2, yy + 12, 'center', 11, cssVar('--accent'), 800);
  };
  if (ahead.length >= 2) bracket(ahead[0], ahead[1], cy + 70, `${t('front')} λ′`);
  if (back.length >= 2) bracket(back[1], back[0], cy + 70, `${t('behind')} λ″`);
  void vs;
}
function drawCar(ctx, x, y, { police = false, phase = 0 } = {}) {
  ctx.fillStyle = police ? '#f4f6f8' : '#3a7bd5';
  roundRect(ctx, x - 26, y - 10, 52, 16, 5); ctx.fill();
  roundRect(ctx, x - 14, y - 20, 28, 12, 4); ctx.fill();
  if (police) { ctx.fillStyle = '#1f3b70'; ctx.fillRect(x - 26, y - 3, 52, 4); ctx.fillStyle = frac(phase) < 0.5 ? '#d6342c' : '#2f74c8'; ctx.fillRect(x - 6, y - 25, 12, 5); }
  ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(x - 15, y + 7, 5, 0, TAU); ctx.arc(x + 15, y + 7, 5, 0, TAU); ctx.fill();
}
function drawRoad(ctx, st) {
  const y = ROAD.y;
  ctx.fillStyle = cssVar('--sky'); ctx.fillRect(0, 0, 600, y - 22);
  ctx.fillStyle = '#6b6f76'; ctx.fillRect(0, y - 22, 600, 36);
  ctx.strokeStyle = '#f2f2f2'; ctx.lineWidth = 2; ctx.setLineDash([16, 14]);
  ctx.beginPath(); ctx.moveTo(0, y - 4); ctx.lineTo(600, y - 4); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(120,170,90,0.35)'; ctx.fillRect(0, y + 14, 600, 60);
  const ox = ROAD.cx, oy = y - 4 + ROAD.D * ROAD.pxm;
  const mx = roadX(st.x);
  // sound arcs from the siren, squeezed in front and stretched behind when the siren moves
  const sx = st.mover === 'source' ? mx : ox, sy = st.mover === 'source' ? y - 14 : oy - 34;
  if (st.run) {
    ctx.strokeStyle = cssVar('--primary'); ctx.lineWidth = 1.8;
    const b = st.mover === 'source' ? st.u / V_SOUND : 0;
    for (let k = 0; k < 4; k++) {
      const p = frac(now * 1.5 + k / 4), r = 10 + p * 60;
      ctx.globalAlpha = 0.8 * (1 - p);
      ctx.beginPath(); ctx.ellipse(sx + b * r * 1.4, sy, r, r * 0.8, 0, 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  if (st.mover === 'source') {
    drawCar(ctx, mx, y - 8, { police: true, phase: now * 3 });
    note(ctx, t('siren'), mx, y - 44, 'center', 11, cssVar('--text'));
    person(ctx, ox, oy + 22, { color: cssVar('--primary'), h: 42 });
    note(ctx, t('observer'), ox + 22, oy + 4, 'left', 11, cssVar('--text'));
  } else {
    ctx.fillStyle = '#3a3f48'; ctx.fillRect(ox - 2, oy - 30, 4, 52);
    ctx.fillStyle = '#d6342c'; roundRect(ctx, ox - 10, oy - 42, 20, 14, 4); ctx.fill();
    note(ctx, t('siren'), ox + 16, oy - 36, 'left', 11, cssVar('--text'));
    drawCar(ctx, mx, y - 8);
    note(ctx, t('observer'), mx, y - 36, 'center', 11, cssVar('--text'));
  }
  // 30 m
  ctx.strokeStyle = cssVar('--muted'); ctx.fillStyle = cssVar('--muted'); ctx.lineWidth = 1.2;
  note(ctx, t('roadNote'), 590, y + 66, 'right', 10);
  // graph of the frequency heard against the position
  const gx1 = roadX(ROAD.xmin), gx2 = roadX(ROAD.xmax), gy1 = 210, gy2 = 340;
  const fHi = fTowards(st.mover, st.u), fLo = fAway(st.mover, st.u);
  const top = Math.max(fHi, F_SIREN + 20), bot = Math.min(fLo, F_SIREN - 20);
  const gy = (f) => gy2 - ((f - bot) / (top - bot)) * (gy2 - gy1);
  ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.moveTo(gx1, gy1 - 8); ctx.lineTo(gx1, gy2 + 4); ctx.lineTo(gx2 + 6, gy2 + 4); ctx.stroke();
  ctx.strokeStyle = cssVar('--border'); ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(gx1, gy(F_SIREN)); ctx.lineTo(gx2, gy(F_SIREN)); ctx.moveTo(ox, gy1 - 6); ctx.lineTo(ox, gy2 + 4); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = cssVar('--muted'); ctx.font = font(10, 600); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (const f of [fHi, F_SIREN, fLo]) if (st.u > 0 || f === F_SIREN) ctx.fillText(num(f, 0), gx1 - 4, gy(f));
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const m of [-200, -100, 0, 100, 200]) ctx.fillText(String(m), roadX(m), gy2 + 7);
  ctx.strokeStyle = cssVar('--primary'); ctx.lineWidth = 2; ctx.beginPath();
  for (let m = ROAD.xmin; m <= ROAD.xmax; m += 2) { const yy = gy(heard(st.mover, m, st.u)); if (m === ROAD.xmin) ctx.moveTo(roadX(m), yy); else ctx.lineTo(roadX(m), yy); }
  ctx.stroke();
  const fh = heard(st.mover, st.x, st.u);
  ctx.fillStyle = cssVar('--accent'); ctx.beginPath(); ctx.arc(mx, gy(fh), 5, 0, TAU); ctx.fill();
  note(ctx, `f′ = ${qty(fh, 0, 'Hz')}`, clamp(mx + 10, 70, 520), gy(fh) - 14, 'left', 12, cssVar('--accent'), 800);
  note(ctx, t('ax.fh'), gx1 + 8, gy1 - 16, 'left', 10);
  note(ctx, t('ax.pos'), gx2 + 6, gy2 + 26, 'right', 10);
}

/* ================================================================
   Pointer
   ================================================================ */
let dragging = false;
canvas.addEventListener('pointerdown', (ev) => {
  const p = view.toLogical(ev);
  if (shell.tab === 'audiogram') {
    if (p.x < AG.x1 - 10 || p.x > AG.x2 + 10 || p.y < AG.y1 - 10 || p.y > AG.y2 + 10) return;
    dragging = true; movePoint(p);
  } else if (shell.tab === 'doppler' && S.doppler.view === 'road') {
    if (p.y > ROAD.y + 80) return;
    dragging = true; moveRoad(p);
  } else if (shell.tab === 'intensity') {
    if (Math.abs(p.y - INT_Y) > 60 || p.x < INT_X0 + 6) return;
    dragging = true; moveMic(p);
  } else return;
  canvas.setPointerCapture(ev.pointerId);
});
canvas.addEventListener('pointermove', (ev) => {
  if (!dragging) return;
  const p = view.toLogical(ev);
  if (shell.tab === 'audiogram') movePoint(p);
  else if (shell.tab === 'doppler') moveRoad(p);
  else if (shell.tab === 'intensity') moveMic(p);
});
const endDrag = () => { dragging = false; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
function movePoint(p) {
  const st = S.audiogram;
  st.lf = clamp(Math.log10(agF(clamp(p.x, AG.x1, AG.x2))), Math.log10(20), Math.log10(20000));
  st.L = clamp(Math.round(agL(p.y)), -10, 140);
  ui.f?.set(st.lf); ui.L?.set(st.L);
  refresh();
}
function moveRoad(p) { const st = S.doppler; st.x = clamp((p.x - ROAD.cx) / ROAD.pxm, ROAD.xmin, ROAD.xmax); st.run = st.x < ROAD.xmax; refresh(); }
function moveMic(p) { const st = S.intensity; st.R = clamp(Math.round((p.x - INT_X0) / PXM_I), 1, 40); ui.R?.set(st.R); refresh(); }

/* ================================================================
   Controls and measurements
   ================================================================ */
const controlsBody = document.getElementById('controls-body');
const measuresBody = document.getElementById('measures-body');
let ui = {};
let tableSig = '';
function measRows(dl, rows) { dl.replaceChildren(...rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)])); }
function statusBox() { return el('p', { class: 'status', hidden: '' }); }
function showStatus(box, fb) { if (!fb) { box.hidden = true; return; } box.hidden = false; box.className = `status ${fb.type || ''}`; box.textContent = t(fb.key, fb.params); }
function hint(key) { return el('p', { class: 'muted', style: 'font-size:0.88rem;margin:10px 0 0', dataset: { i18n: key } }, t(key)); }
const btnRow = (...b) => el('div', { class: 'btn-row' }, b);
const resetBtn = (id) => btnRow(createButton({ labelKey: 'ui.reset', variant: 'ghost', onClick: () => resetTab(id) }));
const seg = (labelKey, opts, value, onChange) => createSegmented({ labelKey, options: opts.map(([v, k]) => ({ value: String(v), labelKey: k })), value: String(value), onChange });
const fbOf = (res, okKey, badKey) => (res === 'invalid' ? { type: 'warn', key: 'calcInvalid' } : res === 'wrong' ? { type: 'bad', key: badKey } : { type: 'good', key: okKey });
function soundControls() {
  const s = seg('ctl.sound', [['off', 'snd.off'], ['on', 'snd.on']], isMuted() ? 'off' : 'on', (v) => { setMuted(v === 'off'); if (v === 'off') stopVoices(); else updateAudio(); });
  const vol = createSlider({ labelKey: 'ctl.volume', min: 0, max: 100, step: 5, value: Math.round(getVolume() * 100), unit: '%', decimals: 0, onInput: (v) => setVolume(v / 100) });
  return [s.root, vol.root, hint(audioAvailable() ? 'snd.note' : 'noAudio')];
}
function tableParts(st) {
  ui.table = el('table', { class: 'data' });
  ui.clear = el('div', { class: 'btn-row', style: 'margin-top:8px' }, [createButton({ labelKey: 'ctl.clearTable', variant: 'ghost', onClick: () => { st.rows = []; st.fb = null; refresh(); } })]);
  ui.status = statusBox();
  return [ui.table, ui.clear, ui.status];
}
function playToggle(st, onKey, offKey) {
  const b = createButton({ labelKey: st.play ? offKey : onKey, variant: 'primary', onClick: () => {
    st.play = !st.play;
    if (st.play && isMuted()) { setMuted(false); buildTab(shell.tab); return; }
    b.dataset.i18n = st.play ? offKey : onKey; b.textContent = t(b.dataset.i18n);
    refresh();
  } });
  return b;
}
function renderTable(st, cols, cells) {
  const sig = calcSig(st.rows) + st.rows.length;
  if (sig !== tableSig) {
    const head = el('tr', {}, cols.map((k) => el('th', {}, t(k))));
    ui.table.replaceChildren(el('thead', {}, head), el('tbody', {}, st.rows.map((r) => el('tr', {}, cells(r)))));
    tableSig = calcSig(st.rows) + st.rows.length;
  }
  ui.table.hidden = st.rows.length === 0;
  ui.clear.hidden = ui.table.hidden;
  showStatus(ui.status, st.fb);
}

/* ---------- power and intensity ---------- */
function buildIntensity() {
  const st = S.intensity;
  ui.R = createSlider({ labelKey: 'ctl.R', min: 1, max: 40, step: 1, value: st.R, unit: 'm', decimals: 0, onInput: (v) => { st.R = v; refresh(); } });
  controlsBody.append(
    createSlider({ labelKey: 'ctl.P', min: 0.1, max: 2, step: 0.1, value: st.P, unit: 'W', decimals: 1, onInput: (v) => { st.P = v; refresh(); } }).root,
    createSlider({ labelKey: 'ctl.ampF', min: 1, max: 4, step: 1, value: st.a, unit: '', decimals: 0, onInput: (v) => { st.a = v; refresh(); } }).root,
    ui.R.root,
    createSlider({ labelKey: 'ctl.S', min: 1, max: 50, step: 1, value: st.S, unit: 'cm²', decimals: 0, onInput: (v) => { st.S = v; refresh(); } }).root,
    btnRow(createButton({ labelKey: 'ctl.recordInt', variant: 'primary', onClick: () => {
      const P = Math.round(intP(st) * 10) / 10;
      st.rows.push({ P, R: st.R, S: st.S }); st.fb = null; refresh();
    } })),
    hint('hint.int'), resetBtn('intensity'),
  );
  ui.dl = el('dl', { class: 'meas' });
  measuresBody.append(ui.dl, ...tableParts(st));
}
function updateIntensity() {
  const st = S.intensity, P = intP(st);
  const rows = [[t('m.P'), qty(P, 1, 'W')]];
  if (st.a > 1) rows.push(['', t('m.Pnote', { a: st.a, k: st.a * st.a })]);
  rows.push([t('m.R'), qty(st.R, 0, 'm')], [t('m.S'), qty(st.S, 0, 'cm²')], [t('m.L'), qty(levelOf(intI(st)), 1, 'dB')]);
  measRows(ui.dl, rows);
  renderTable(st, ['col.P', 'col.R', 'col.S', 'col.I', 'col.Pr'], (r) => {
    const I = (r.P / (4 * Math.PI * r.R * r.R)) * 1000, Pr = (I / 1000) * r.S * 1e-4 * 1e6;
    return [el('td', {}, num(r.P, 1)), el('td', {}, num(r.R, 0)), el('td', {}, num(r.S, 0)),
      calcCell(r, 'I', { expected: I, decimals: dec3(I), tol: I * 0.03, onCheck: (res) => { st.fb = fbOf(res, 'fb.IOk', 'fb.IWrong'); refresh(); } }),
      calcCell(r, 'Pr', { expected: Pr, decimals: dec3(Pr), tol: Pr * 0.03, disabled: !calcDone(r, 'I'), onCheck: (res) => { st.fb = fbOf(res, 'fb.PrOk', 'fb.PrWrong'); refresh(); } })];
  });
}

/* ---------- intensity level ---------- */
function buildLevel() {
  const st = S.level;
  controlsBody.append(
    createSlider({ labelKey: 'ctl.Ilog', min: -12, max: 1, step: 0.1, value: st.lI, format: (v) => `${sci(10 ** v)} W/m²`, onInput: (v) => { st.lI = v; refresh(); } }).root,
    createSlider({ labelKey: 'ctl.n', min: 1, max: 10, step: 1, value: st.n, unit: '', decimals: 0, onInput: (v) => { st.n = v; refresh(); } }).root,
    btnRow(playToggle(st, 'ctl.playLevel', 'ctl.stopLevel'), createButton({ labelKey: 'ctl.recordLevel', variant: 'secondary', onClick: () => { st.rows.push({ n: st.n, I: st.n * lvI(st) }); st.fb = null; refresh(); } })),
    ...soundControls(), resetBtn('level'),
  );
  ui.dl = el('dl', { class: 'meas' });
  measuresBody.append(ui.dl, ...tableParts(st));
}
function expoText(L) {
  if (L >= PAIN) return t('expo.pain');
  if (L < 85) return t('expo.none');
  let k = 0;
  while (k + 1 < EXPO.length && L >= EXPO[k + 1][0]) k++;
  if (k === EXPO.length - 1) return t('ex.more110');
  return `${t(EXPO[k][1])} … ${t(EXPO[k + 1][1])}`;
}
function updateLevel() {
  const st = S.level, I1 = lvI(st), I = st.n * I1, L = levelOf(I);
  let like = LEVELS[0];
  for (const d of LEVELS) if (L >= d - 2) like = d;
  measRows(ui.dl, [
    [t('m.I1'), `${sci(I1)} W/m²`], [t('m.Itot'), `${sci(I, 2)} W/m²`], [t('m.L2'), qty(L, 1, 'dB')],
    [t('m.like'), L < 0 ? t('lv.0') : t(like === 0 ? 'hearing' : like === PAIN ? 'lv.120' : `lv.${like}`)],
    [t('m.expo'), expoText(L)],
  ]);
  renderTable(st, ['col.n', 'col.Ii', 'col.Lc'], (r) => {
    const Lr = levelOf(r.I);
    return [el('td', {}, String(r.n)), el('td', {}, sci(r.I, 2)),
      calcCell(r, 'L', { expected: Lr, decimals: 1, tol: 0.3, onCheck: (res) => { st.fb = fbOf(res, 'fb.LOk', 'fb.LWrong'); refresh(); } })];
  });
}

/* ---------- audiogram ---------- */
function buildAudiogram() {
  const st = S.audiogram;
  ui.f = createSlider({ labelKey: 'ctl.fa', min: Math.log10(20), max: Math.log10(20000), step: 0.001, value: st.lf, format: (v) => fText(10 ** v), onInput: (v) => { st.lf = v; refresh(); } });
  ui.L = createSlider({ labelKey: 'ctl.La', min: -10, max: 140, step: 1, value: st.L, unit: 'dB', decimals: 0, onInput: (v) => { st.L = v; refresh(); } });
  const pre = (f, L, key) => createButton({ labelKey: key, variant: 'secondary', onClick: () => { st.lf = Math.log10(f); st.L = L; ui.f.set(st.lf); ui.L.set(L); refresh(); } });
  controlsBody.append(ui.f.root, ui.L.root,
    el('p', { class: 'muted', style: 'font-size:0.88rem;margin:8px 0 4px' }, t('ctl.preset')),
    btnRow(pre(256, 40, 'pre.256_40'), pre(256, 10, 'pre.256_10'), pre(64, 40, 'pre.64_40')),
    hint('hint.aud'), btnRow(playToggle(st, 'ctl.playA', 'ctl.stopA')), ...soundControls(), resetBtn('audiogram'));
  ui.dl = el('dl', { class: 'meas' });
  measuresBody.append(ui.dl);
}
function updateAudiogram() {
  const st = S.audiogram, f = 10 ** st.lf, s = audState(f, st.L);
  const rows = [[t('m.fa'), fText(f)], [t('m.La'), qty(st.L, 0, 'dB')], [t('m.thr'), qty(threshold(f), 0, 'dB')], [t('m.aud'), t(`aud.${s}`)]];
  if (st.play && !playable(f)) rows.push([t('m.played'), t('played.no')]);
  measRows(ui.dl, rows);
  const dd = ui.dl.querySelectorAll('dd')[3];
  if (dd) dd.style.color = s === 'yes' ? '#2e8b57' : s === 'pain' ? '#b3261e' : '';
}

/* ---------- Doppler ---------- */
function buildDoppler() {
  const st = S.doppler;
  controlsBody.append(seg('ctl.dview', [['tank', 'dview.tank'], ['road', 'dview.road']], st.view, (v) => { st.view = v; stopVoices(); buildTab('doppler'); }).root);
  if (st.view === 'tank') {
    controlsBody.append(
      createSlider({ labelKey: 'ctl.vs', min: 0, max: 80, step: 5, value: Math.round(st.beta * 100), unit: '%', decimals: 0, onInput: (v) => { st.beta = v / 100; if (v === 0) { st.tx = (TANK.x1 + TANK.x2) / 2; } st.em = []; st.emAcc = 0; if (v > 0) st.tx = TANK.x1 + 60; } }).root,
      resetBtn('doppler'));
    ui.dl = el('dl', { class: 'meas' });
    measuresBody.append(ui.dl);
    if (st.beta === 0) st.tx = (TANK.x1 + TANK.x2) / 2;
    return;
  }
  controlsBody.append(
    seg('ctl.mover', [['source', 'mover.source'], ['observer', 'mover.observer']], st.mover, (v) => { st.mover = v; st.x = ROAD.xmin; st.run = true; refresh(); }).root,
    createSlider({ labelKey: 'ctl.speed', min: 0, max: 90, step: 1, value: st.u, format: (v) => `${num(v, 0)} m/s (${num(v * 3.6, 0)} km/h)`, onInput: (v) => { st.u = v; refresh(); } }).root,
    btnRow(createButton({ labelKey: 'ctl.restart', variant: 'primary', onClick: () => { st.x = ROAD.xmin; st.run = true; refresh(); } }),
      createButton({ labelKey: 'ctl.recordDop', variant: 'secondary', onClick: () => { st.rows.push({ mover: st.mover, u: st.u }); st.fb = null; refresh(); } })),
    hint('hint.road'), ...soundControls(), resetBtn('doppler'));
  ui.dl = el('dl', { class: 'meas' });
  measuresBody.append(ui.dl, ...tableParts(st));
}
function updateDoppler() {
  const st = S.doppler;
  if (st.view === 'tank') {
    const l0 = TANK.c / TANK.f / TANK.pxcm;
    measRows(ui.dl, [[t('m.lrest'), qty(l0, 1, 'cm')], [t('m.lfront'), qty(l0 * (1 - st.beta), 1, 'cm')], [t('m.lback'), qty(l0 * (1 + st.beta), 1, 'cm')]]);
    return;
  }
  const fh = heard(st.mover, st.x, st.u);
  const rows = [[t('m.f0'), qty(F_SIREN, 0, 'Hz')], [t('m.v'), qty(V_SOUND, 0, 'm/s')], [t('m.us'), `${qty(st.u, 0, 'm/s')} (${qty(st.u * 3.6, 0, 'km/h')})`], [t('m.fh'), qty(fh, 0, 'Hz')]];
  if (st.u > 0 && st.run) rows.push([t('m.now'), t(st.x < 0 ? 'now.towards' : 'now.away')]);
  measRows(ui.dl, rows);
  renderTable(st, ['col.case', 'col.u', 'col.ft', 'col.fa'], (r) => {
    const ft = fTowards(r.mover, r.u), fa = fAway(r.mover, r.u);
    return [el('td', {}, t(`case.${r.mover}`)), el('td', {}, String(r.u)),
      calcCell(r, 'ft', { expected: ft, decimals: 0, tol: 2, onCheck: (res) => { st.fb = fbOf(res, 'fb.ftOk', 'fb.ftWrong'); refresh(); } }),
      calcCell(r, 'fa', { expected: fa, decimals: 0, tol: 2, disabled: !calcDone(r, 'ft'), onCheck: (res) => { st.fb = fbOf(res, 'fb.faOk', 'fb.faWrong'); refresh(); } })];
  });
}

/* ---------- tabs ---------- */
const BUILD = { intensity: buildIntensity, level: buildLevel, audiogram: buildAudiogram, doppler: buildDoppler };
const UPDATE = { intensity: updateIntensity, level: updateLevel, audiogram: updateAudiogram, doppler: updateDoppler };
let lastTab = null;
function buildTab(id) {
  if (id !== lastTab) { stopVoices(); lastTab = id; }
  controlsBody.replaceChildren();
  measuresBody.replaceChildren();
  ui = {};
  tableSig = '';
  BUILD[id]();
  loop.start();
  refresh();
}
function updateMeasures() { if (shell && ui.dl) UPDATE[shell.tab](); }
function refresh() { updateMeasures(); requestDraw(); }
function resetTab(id) { stopVoices(); S[id] = initialState(id); buildTab(id); }

onLangChange(() => { if (shell) buildTab(shell.tab); });

shell = initSim({
  strings,
  tabs: TABS.map((id) => ({ id, labelKey: `tab.${id}` })),
  initialTab: 'intensity',
  onTab: buildTab,
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, threshold, heard, fTowards, fAway, levelOf };
