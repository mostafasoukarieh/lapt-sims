// Grade 8 — Electromagnetic waves (Ch.13 Act. 1–4, §3–4, Ex. 4–6). Sounds of the radio through shared/audio.js.
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num, qty } from '../../../shared/format.js';
import { createButton, createSegmented, createSlider, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, font } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { label } from '../../../shared/figures.js';
import { calcCell, calcSig } from '../../../shared/calc-cell.js';
import { audioAvailable, createVoice, createNoise, noiseBurst, setMuted, isMuted, stopAll } from '../../../shared/audio.js';

/* ================================================================
   Model
   ================================================================ */
// Radio bands: M.W 522–1620 kHz by steps of 9 kHz; F.M 87.5–108.0 MHz by steps of 0.1 MHz.
const BANDS = {
  mw: { min: 522, step: 9, n: 122, dec: 0, unit: 'kHz', stations: [531, 873, 1017] },
  fm: { min: 87.5, step: 0.1, n: 205, dec: 2, unit: 'MHz', stations: [88.6, 96.2, 102.5] },
};
const bandF = (b, i) => Math.round((BANDS[b].min + i * BANDS[b].step) * 100) / 100;
const bandI = (b, f) => Math.round((f - BANDS[b].min) / BANDS[b].step);
// reception: 1 on a station, 0.35 one step away, 0 elsewhere
function reception(b, i) {
  let r = 0;
  for (const f of BANDS[b].stations) { const d = Math.abs(bandI(b, f) - i); if (d === 0) r = 1; else if (d === 1) r = Math.max(r, 0.35); }
  return r;
}
// imaginary melodies (semitones above the base note), one per station; null = rest
const MELODIES = [
  [0, 4, 7, 12, 7, 4, 0, null, 2, 5, 9, 5, 2, null, 0, null],
  [7, 7, 9, 7, 4, null, 2, 4, 5, 4, 2, 0, null, 0, 2, null],
  [12, 11, 9, 7, 9, 7, 4, null, 5, 7, 9, 12, 9, null, 7, null],
];
const NOTE = 0.26; // s

// Electromagnetic spectrum (approximate limits as Fig. 5 of the book)
const C = 3e8;
const VIS_LO = 3.75e14, VIS_HI = 7.5e14;
const DOMAINS = [
  { id: 'radio', lo: 1e3, hi: 1e9, col: '#7a6fb0', en: 'low' },
  { id: 'micro', lo: 1e9, hi: 1e12, col: '#4f8fc0', en: 'low' },
  { id: 'ir', lo: 1e12, hi: VIS_LO, col: '#c0504d', en: 'low' },
  { id: 'visible', lo: VIS_LO, hi: VIS_HI, col: '#e8c547', en: 'mid' },
  { id: 'uv', lo: VIS_HI, hi: 1e17, col: '#8e44ad', en: 'high' },
  { id: 'x', lo: 1e17, hi: 1e20, col: '#5d6d7e', en: 'high' },
  { id: 'gamma', lo: 1e20, hi: 1e24, col: '#2c3e50', en: 'high' },
];
const domainOf = (f) => DOMAINS.find((d) => f >= d.lo && f < d.hi) || DOMAINS[DOMAINS.length - 1];
const E_MIN = 3, E_MAX = 24;
const posToF = (p) => 10 ** (E_MIN + ((E_MAX - E_MIN) * p) / 1000);
// round to 2 significant figures, so the student reads e.g. 3.0 × 10⁶ Hz
function niceF(f) { const e = Math.floor(Math.log10(f)); return Math.round(f / 10 ** (e - 1)) * 10 ** (e - 1); }
const fToPos = (f) => (1000 * (Math.log10(f) - E_MIN)) / (E_MAX - E_MIN);

// Visible colours (×10¹⁴ Hz) — limits of the seven colours of the book
const COLOURS = [
  ['red', 3.75, 4.8], ['orange', 4.8, 5.05], ['yellow', 5.05, 5.25], ['green', 5.25, 6.0],
  ['blue', 6.0, 6.45], ['indigo', 6.45, 6.7], ['violet', 6.7, 7.5],
];
const colourName = (f14) => (COLOURS.find(([, a, b]) => f14 >= a && f14 < b) || COLOURS[f14 < 3.75 ? 0 : 6])[0];
// colour of a light of wavelength lam (nm), usual approximation
function lamRGB(lam) {
  let r = 0, g = 0, b = 0;
  if (lam < 440) { r = -(lam - 440) / 60; b = 1; } else if (lam < 490) { g = (lam - 440) / 50; b = 1; } else if (lam < 510) { g = 1; b = -(lam - 510) / 20; } else if (lam < 580) { r = (lam - 510) / 70; g = 1; } else if (lam < 645) { r = 1; g = -(lam - 645) / 65; } else { r = 1; }
  let k = 1;
  if (lam > 700) k = 0.3 + (0.7 * (800 - lam)) / 100; else if (lam < 420) k = 0.3 + (0.7 * (lam - 380)) / 40;
  k = Math.max(0.25, Math.min(1, k));
  const c = (x) => Math.round(255 * (x * k) ** 0.8);
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}
const f14RGB = (f14) => lamRGB(3e8 / (f14 * 1e14) * 1e9);
const LASERS = { red: 4.74, green: 5.64 };
// refractive index, dispersion exaggerated so that the colours spread on the screen
const nOf = (f14) => 1.48 + (0.14 * (f14 - 3.75)) / 3.75;

const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const sup = (n) => String(n).split('').map((c) => SUP[c]).join('');
function sci(f, dec = 1) {
  const e = Math.floor(Math.log10(f) + 1e-9);
  let m = f / 10 ** e;
  if (Math.abs(m - Math.round(m)) < 1e-6 && dec > 0 && m >= 1) m = Math.round(m);
  return `${num(m, dec)} × 10${sup(e)}`;
}
const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
// a random wave for the exercises: { f, e, k } with f = k × 10^e; T = (10 / k) × 10^-(e+1)
function randomWave() {
  const id = DOMAINS[randInt(0, DOMAINS.length - 1)].id;
  const E = { radio: [4, 5, 6, 7, 8], micro: [9, 10, 11], ir: [12, 13], uv: [15, 16], x: [17, 18, 19], gamma: [20, 21, 22] };
  let k, e;
  if (id === 'visible') { e = 14; k = randInt(40, 74) / 10; } else { e = E[id][randInt(0, E[id].length - 1)]; k = randInt(20, 90) / 10; }
  return { k, e, f: k * 10 ** e, dom: domainOf(k * 10 ** e).id };
}

function initialState() {
  return {
    radio: { on: false, band: 'mw', i: 10, tapAt: -10, lastNote: -1 },
    vacuum: { lampOn: true, bellOn: false, pumping: false, air: 1 },
    prism: { src: 'white' },
    spectrum: { mode: 'explore', f: 3e6, rows: [], fb: null },
  };
}
let S = initialState();
let now = 0;
const voices = {};
function voice(key, make) {
  if (!voices[key]) voices[key] = make();
  return voices[key];
}
function silence() { stopAll(); for (const k of Object.keys(voices)) delete voices[k]; }

/* ================================================================
   Canvas and loop
   ================================================================ */
const SCENE = { w: 600, h: 340 };
let shell;
let drawQueued = false;
const canvas = document.getElementById('stage');
const view = setupCanvas(canvas, { width: SCENE.w, height: SCENE.h, maxHeightVh: () => (window.innerWidth < 880 ? 48 : 72), onResize: () => requestDraw() });
function requestDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; draw(); });
}
onThemeChange(() => requestDraw());

const tapping = () => now - S.radio.tapAt < 0.7;
const contact = () => tapping() && Math.floor((now - S.radio.tapAt) * 14) % 2 === 0;

const loop = createLoop({
  step(dt) {
    now += dt;
    if (!shell) return false;
    const tab = shell.tab;
    if (tab === 'radio') {
      const st = S.radio;
      if (st.on) radioSound();
      return true; // transmitter waves move all the time
    }
    if (tab === 'vacuum') {
      const st = S.vacuum;
      if (st.pumping) st.air = Math.max(0.003, st.air * Math.exp(-dt / 3));
      if (st.bellOn) voices.bell?.setGain(0.16 * st.air ** 0.8 * (0.45 + 0.55 * Math.abs(Math.sin(2 * Math.PI * 12 * now))), 0.004);
      return st.bellOn || st.pumping || st.lampOn;
    }
    if (tab === 'spectrum') return S.spectrum.mode === 'explore';
    return false;
  },
  render() { draw(); updateMeasures(); },
});

function radioSound() {
  const st = S.radio;
  const r = reception(st.band, st.i);
  voice('hiss', () => createNoise({ freq: 2600, q: 0.4 }))?.setGain(0.035 * (1 - 0.92 * r), 0.05);
  const music = voice('music', () => createVoice({ freq: 440, harmonics: [1, 0.5, 0.3, 0.15] }));
  const idx = Math.floor(now / NOTE);
  if (r > 0 && idx !== st.lastNote) {
    st.lastNote = idx;
    // the station heard: the nearest one
    const fs = BANDS[st.band].stations;
    let best = 0;
    fs.forEach((f, k) => { if (Math.abs(bandI(st.band, f) - st.i) < Math.abs(bandI(st.band, fs[best]) - st.i)) best = k; });
    const mel = MELODIES[best];
    const n = mel[idx % mel.length];
    const base = st.band === 'mw' ? 262 : 330;
    if (n != null && music) { music.setFreq(base * 2 ** (n / 12)); music.strike(0.11 * r, 0.16); }
  }
}

/* ================================================================
   Drawing
   ================================================================ */
function draw() {
  if (!shell) return;
  const ctx = view.begin();
  ctx.fillStyle = cssVar('--scene-bg');
  ctx.fillRect(0, 0, SCENE.w, SCENE.h);
  const tab = shell.tab;
  if (tab === 'radio') drawRadio(ctx);
  else if (tab === 'vacuum') drawVacuum(ctx);
  else if (tab === 'prism') drawPrism(ctx);
  else drawSpectrum(ctx);
}
function bar(ctx, x, y, w, level, title, col) {
  ctx.fillStyle = cssVar('--surface'); roundRect(ctx, x, y, w, 16, 6); ctx.fill();
  ctx.fillStyle = col; roundRect(ctx, x, y, Math.max(0, Math.min(1, level)) * w, 16, 6); ctx.fill();
  ctx.strokeStyle = cssVar('--border'); ctx.lineWidth = 1; roundRect(ctx, x, y, w, 16, 6); ctx.stroke();
  label(ctx, title, x + w / 2, y - 10, { size: 11, weight: 700 });
}
function waves(ctx, x, y, r0, r1, phase, spacing, a0, a1, col, dash = null) {
  ctx.strokeStyle = col; ctx.lineWidth = 2;
  if (dash) ctx.setLineDash(dash);
  for (let r = r0 + (phase % spacing); r < r1; r += spacing) {
    ctx.globalAlpha = Math.max(0, 1 - (r - r0) / (r1 - r0));
    ctx.beginPath(); ctx.arc(x, y, r, a0, a1); ctx.stroke();
  }
  ctx.globalAlpha = 1; ctx.setLineDash([]);
}

/* ---------- Tab 1: radio ---------- */
function drawRadio(ctx) {
  const st = S.radio;
  ctx.fillStyle = cssVar('--wood'); ctx.fillRect(10, 290, SCENE.w - 20, 40);
  // transmitter of a station (far away)
  const mx = 250;
  ctx.strokeStyle = cssVar('--wire'); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(mx - 16, 110); ctx.lineTo(mx, 24); ctx.lineTo(mx + 16, 110); ctx.moveTo(mx - 11, 80); ctx.lineTo(mx + 11, 80); ctx.moveTo(mx - 6, 52); ctx.lineTo(mx + 6, 52); ctx.stroke();
  ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.arc(mx, 22, 4, 0, Math.PI * 2); ctx.fill();
  waves(ctx, mx, 22, 10, 70, now * 30, 16, -0.5, 0.5, cssVar('--muted'), [3, 4]);
  label(ctx, t('station'), mx, 124, { size: 11, color: cssVar('--muted') });

  // dry cell standing on the bench
  const cx = 90;
  ctx.fillStyle = '#c0392b'; roundRect(ctx, cx - 26, 190, 52, 100, 6); ctx.fill();
  ctx.fillStyle = '#2c3e50'; ctx.fillRect(cx - 26, 250, 52, 40);
  ctx.fillStyle = cssVar('--metal'); ctx.fillRect(cx - 7, 182, 14, 9);
  label(ctx, '+', cx + 14, 200, { size: 12, weight: 800, color: '#fff', halo: false });
  label(ctx, '1.5 V', cx, 230, { size: 11, weight: 800, color: '#fff', halo: false });
  label(ctx, t('cell'), cx, 306, { size: 11, weight: 700 });
  // wire from the bottom terminal, its free end rubbing on the top terminal
  const touch = contact();
  const ex = touch ? cx : cx + 30, ey = touch ? 180 : 162;
  ctx.strokeStyle = '#2e9d4f'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(cx - 26, 286); ctx.bezierCurveTo(cx - 70, 270, cx - 70, 140, ex - 10, ey - 6); ctx.lineTo(ex, ey); ctx.stroke();
  label(ctx, t('wire'), 18, 136, { size: 11, color: cssVar('--muted'), align: 'left' });
  if (touch) {
    ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 2;
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + now * 9; ctx.beginPath(); ctx.moveTo(cx + 4 * Math.cos(a), 180 + 4 * Math.sin(a)); ctx.lineTo(cx + 14 * Math.cos(a), 180 + 14 * Math.sin(a)); ctx.stroke(); }
  }
  // electromagnetic wave from the perturbation
  if (now - st.tapAt < 2.2) {
    const age = now - st.tapAt;
    ctx.strokeStyle = cssVar('--accent'); ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
    for (let k = 0; k < 4; k++) {
      const r = (age - k * 0.12) * 260;
      if (r <= 6 || r > 480) continue;
      ctx.globalAlpha = Math.max(0, 1 - r / 480);
      ctx.beginPath(); ctx.arc(cx, 180, r, -1.2, 0.9); ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.setLineDash([]);
    label(ctx, t('emWave'), 300, 150, { size: 11, color: cssVar('--accent'), weight: 700 });
  }

  // radio set
  const rx = 340, ry = 168, rw = 240, rh = 118;
  ctx.strokeStyle = cssVar('--metal'); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(rx + rw - 30, ry); ctx.lineTo(rx + rw - 4, ry - 92); ctx.stroke();
  ctx.fillStyle = cssVar('--device'); roundRect(ctx, rx, ry, rw, rh, 12); ctx.fill();
  ctx.fillStyle = cssVar('--lcd-bg'); roundRect(ctx, rx + 16, ry + 16, 140, 44, 6); ctx.fill();
  const b = BANDS[st.band];
  const f = bandF(st.band, st.i);
  ctx.fillStyle = cssVar('--lcd-ink'); ctx.textBaseline = 'middle';
  if (st.on) {
    ctx.font = '700 24px ui-monospace, Menlo, Consolas, monospace'; ctx.textAlign = 'right';
    ctx.fillText(num(f, b.dec), rx + 124, ry + 38);
    ctx.font = '700 11px ui-monospace, Menlo, Consolas, monospace'; ctx.textAlign = 'left';
    ctx.fillText(b.unit, rx + 127, ry + 32);
    ctx.fillText(st.band === 'mw' ? 'MW' : 'FM', rx + 127, ry + 46);
  }
  // loudspeaker grille
  const sx = rx + 200, sy = ry + 62;
  ctx.fillStyle = '#3d4450'; ctx.beginPath(); ctx.arc(sx, sy, 30, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#566070';
  for (let a = -24; a <= 24; a += 8) for (let c = -24; c <= 24; c += 8) if (a * a + c * c < 26 * 26) { ctx.beginPath(); ctx.arc(sx + a, sy + c, 2, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = st.on ? '#2ecc71' : '#555'; ctx.beginPath(); ctx.arc(rx + 26, ry + 90, 5, 0, Math.PI * 2); ctx.fill();
  // tuning scale under the display
  ctx.fillStyle = cssVar('--surface'); ctx.fillRect(rx + 16, ry + 76, 140, 4);
  ctx.fillStyle = cssVar('--accent'); ctx.fillRect(rx + 16 + (140 * st.i) / b.n - 2, ry + 71, 4, 14);
  label(ctx, t('radio'), rx + rw / 2, ry + rh + 14, { size: 11, weight: 700 });
  // what comes out of the loudspeaker
  if (st.on) {
    const r = reception(st.band, st.i);
    const crack = touch && st.band === 'mw';
    if (r > 0 || crack) waves(ctx, sx, sy, 34, 60, now * 50, 12, Math.PI * 1.25, Math.PI * 1.75, crack ? '#e67e22' : cssVar('--accent'));
  }
}

/* ---------- Tab 2: vacuum ---------- */
const AIR_DOTS = Array.from({ length: 70 }, (_, i) => [170 + ((i * 53) % 200), 74 + ((i * 37) % 206)]);
function drawVacuum(ctx) {
  const st = S.vacuum;
  const jx = 270;
  ctx.fillStyle = cssVar('--wood'); ctx.fillRect(10, 300, SCENE.w - 20, 30);
  ctx.fillStyle = cssVar('--device'); ctx.fillRect(jx - 130, 286, 260, 14);
  const n = Math.round(AIR_DOTS.length * st.air);
  ctx.fillStyle = cssVar('--air-part') || '#7fb3e6';
  for (let i = 0; i < n; i++) { const [x, y] = AIR_DOTS[i]; if (Math.hypot(x - jx, (y - 286) * 1.1) < 126) { ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill(); } }
  // flashlight lying on a small block, pointing to the observer
  ctx.fillStyle = cssVar('--device'); ctx.fillRect(176, 252, 70, 34);
  ctx.fillStyle = '#34495e'; roundRect(ctx, 182, 226, 52, 22, 5); ctx.fill();
  ctx.fillStyle = '#7f8c8d'; ctx.beginPath(); ctx.moveTo(234, 222); ctx.lineTo(248, 216); ctx.lineTo(248, 258); ctx.lineTo(234, 252); ctx.fill();
  label(ctx, t('flashlight'), 210, 210, { size: 11, color: cssVar('--muted') });
  if (st.lampOn) {
    const g = ctx.createLinearGradient(248, 0, 560, 0);
    g.addColorStop(0, 'rgba(255,230,120,0.85)'); g.addColorStop(1, 'rgba(255,230,120,0.25)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(248, 220); ctx.lineTo(548, 214); ctx.lineTo(548, 262); ctx.lineTo(248, 254); ctx.fill();
  }
  // bell
  const bx = 320, by = 200;
  const ring = st.bellOn ? Math.sin(now * 2 * Math.PI * 12) : 0;
  ctx.fillStyle = '#c9a23a'; ctx.beginPath(); ctx.arc(bx, by - 40, 24, Math.PI, 0); ctx.fill(); ctx.fillRect(bx - 24, by - 40, 48, 5);
  ctx.fillStyle = cssVar('--device'); ctx.fillRect(bx - 4, by - 36, 8, 20);
  ctx.strokeStyle = cssVar('--wire'); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(bx, by - 16); ctx.lineTo(bx + 12 + ring * 5, by - 34); ctx.stroke();
  ctx.fillStyle = cssVar('--wire'); ctx.beginPath(); ctx.arc(bx + 12 + ring * 5, by - 34, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = cssVar('--device'); ctx.fillRect(bx - 2, by - 16, 4, 70);
  label(ctx, t('bell'), bx, by - 78, { size: 11, color: cssVar('--muted') });
  // glass bell jar
  ctx.strokeStyle = 'rgba(120,170,210,0.9)'; ctx.lineWidth = 3; ctx.fillStyle = 'rgba(160,200,230,0.18)';
  ctx.beginPath(); ctx.moveTo(jx - 120, 286); ctx.lineTo(jx - 120, 150); ctx.quadraticCurveTo(jx - 120, 60, jx, 56); ctx.quadraticCurveTo(jx + 120, 60, jx + 120, 150); ctx.lineTo(jx + 120, 286); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(120,170,210,0.9)'; ctx.fillRect(jx - 8, 44, 16, 14);
  label(ctx, t('jar'), jx + 128, 84, { size: 11, color: cssVar('--muted'), align: 'left' });
  // pipe to the pump
  ctx.strokeStyle = cssVar('--rubber') || '#444'; ctx.lineWidth = 7;
  ctx.beginPath(); ctx.moveTo(jx + 130, 293); ctx.lineTo(560, 293); ctx.stroke();
  label(ctx, t('pump'), 500, 312, { size: 11, color: cssVar('--muted') });
  if (st.pumping) { ctx.fillStyle = cssVar('--accent'); for (let k = 0; k < 3; k++) { const xx = jx + 140 + ((now * 80 + k * 33) % 130); ctx.beginPath(); ctx.arc(xx, 293, 2, 0, Math.PI * 2); ctx.fill(); } }
  // observer's eye
  const ex = 566, ey = 238;
  ctx.fillStyle = '#fafafa'; ctx.beginPath(); ctx.ellipse(ex, ey, 16, 10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = '#3b6ea5'; ctx.beginPath(); ctx.arc(ex - 6, ey, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(ex - 7, ey, 2.6, 0, Math.PI * 2); ctx.fill();
  label(ctx, t('eye'), ex - 6, ey + 24, { size: 11, color: cssVar('--muted') });
  bar(ctx, 14, 74, 120, st.lampOn ? 1 : 0, t('lightBar'), '#f1c40f');
  bar(ctx, 14, 130, 120, st.bellOn ? st.air ** 0.8 : 0, t('soundBar'), '#e67e22');
}

/* ---------- Tab 3: prism ---------- */
const PR = { A: [270, 104], B: [190, 244], Cc: [350, 244] };
function refract(d, nrm, n1, n2) {
  // d, nrm unit vectors; nrm points against d
  const cosi = -(d[0] * nrm[0] + d[1] * nrm[1]);
  const r = n1 / n2, k = 1 - r * r * (1 - cosi * cosi);
  if (k < 0) return null;
  const c = r * cosi - Math.sqrt(k);
  return [r * d[0] + c * nrm[0], r * d[1] + c * nrm[1]];
}
function hitSeg(p, d, a, b) {
  const ex = b[0] - a[0], ey = b[1] - a[1];
  const den = d[0] * ey - d[1] * ex;
  if (Math.abs(den) < 1e-9) return null;
  const s = ((a[0] - p[0]) * ey - (a[1] - p[1]) * ex) / den;
  const u = ((a[0] - p[0]) * d[1] - (a[1] - p[1]) * d[0]) / den;
  return s > 1e-6 && u >= 0 && u <= 1 ? [p[0] + s * d[0], p[1] + s * d[1]] : null;
}
function outwardNormal(a, b, inside) {
  let nx = b[1] - a[1], ny = -(b[0] - a[0]);
  const L = Math.hypot(nx, ny); nx /= L; ny /= L;
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  if ((inside[0] - mx) * nx + (inside[1] - my) * ny > 0) { nx = -nx; ny = -ny; }
  return [nx, ny];
}
const SCREEN_X = 500;
const SRC = [40, 250];
// path of a ray of frequency f14 through the prism → [entry, exit, screen point]
function trace(f14) {
  const { A, B, Cc } = PR;
  const G = [(A[0] + B[0] + Cc[0]) / 3, (A[1] + B[1] + Cc[1]) / 3];
  const target = [(A[0] + B[0]) / 2 + 2, (A[1] + B[1]) / 2 + 4];
  let d = [target[0] - SRC[0], target[1] - SRC[1]]; const L = Math.hypot(...d); d = [d[0] / L, d[1] / L];
  const p1 = hitSeg(SRC, d, A, B);
  if (!p1) return null;
  const n1 = outwardNormal(A, B, G);
  const d1 = refract(d, n1, 1, nOf(f14));
  const p2 = hitSeg(p1, d1, A, Cc);
  if (!p2) return null;
  const n2 = outwardNormal(A, Cc, G);
  const d2 = refract(d1, [-n2[0], -n2[1]], nOf(f14), 1);
  if (!d2) return null;
  const s = (SCREEN_X - p2[0]) / d2[0];
  return [p1, p2, [SCREEN_X, p2[1] + s * d2[1]]];
}
function drawPrism(ctx) {
  const st = S.prism;
  const { A, B, Cc } = PR;
  // source
  if (st.src === 'white') {
    ctx.fillStyle = cssVar('--device'); ctx.fillRect(SRC[0] - 34, SRC[1] - 16, 30, 32);
    ctx.fillStyle = '#fff6c8'; ctx.beginPath(); ctx.arc(SRC[0] - 6, SRC[1], 9, 0, Math.PI * 2); ctx.fill();
    label(ctx, t('lamp'), SRC[0] + 4, SRC[1] + 30, { size: 11, color: cssVar('--muted'), align: 'left' });
  } else {
    ctx.fillStyle = '#2c3e50'; roundRect(ctx, SRC[0] - 38, SRC[1] - 9, 44, 18, 4); ctx.fill();
    ctx.fillStyle = f14RGB(LASERS[st.src]); ctx.fillRect(SRC[0] + 2, SRC[1] - 3, 4, 6);
    label(ctx, t('laser'), SRC[0] - 16, SRC[1] + 22, { size: 11, color: cssVar('--muted') });
  }
  // screen
  ctx.fillStyle = '#ecf0f1'; ctx.fillRect(SCREEN_X, 150, 10, 150);
  ctx.strokeStyle = cssVar('--border'); ctx.lineWidth = 1; ctx.strokeRect(SCREEN_X, 150, 10, 150);
  label(ctx, t('screen'), SCREEN_X + 5, 138, { size: 11, color: cssVar('--muted') });
  const fs = st.src === 'white' ? Array.from({ length: 64 }, (_, k) => 3.75 + ((7.5 - 3.75) * (k + 0.5)) / 64) : [LASERS[st.src]];
  const paths = fs.map((f) => [f, trace(f)]).filter(([, p]) => p);
  // incident beam
  const p1 = paths[0][1][0];
  ctx.strokeStyle = st.src === 'white' ? '#fffbe6' : f14RGB(LASERS[st.src]); ctx.lineWidth = st.src === 'white' ? 5 : 3;
  ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 3;
  ctx.beginPath(); ctx.moveTo(SRC[0] + 4, SRC[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
  ctx.shadowBlur = 0;
  // inside and after the prism
  ctx.lineWidth = st.src === 'white' ? 1.6 : 3;
  for (const [f, [a, b, c]] of paths) {
    ctx.strokeStyle = f14RGB(f);
    ctx.globalAlpha = st.src === 'white' ? 0.5 : 0.9;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.stroke();
  }
  // glass prism on top (transparent)
  ctx.fillStyle = 'rgba(160,210,235,0.28)'; ctx.strokeStyle = 'rgba(110,160,200,0.95)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(...A); ctx.lineTo(...B); ctx.lineTo(...Cc); ctx.closePath(); ctx.fill(); ctx.stroke();
  label(ctx, t('prism'), A[0], A[1] - 14, { size: 11, color: cssVar('--muted') });
  // what lands on the screen, with the names of the colours (white light)
  for (const [f, [, , c]] of paths) { ctx.fillStyle = f14RGB(f); ctx.fillRect(SCREEN_X, c[1] - 1.5, 10, 3); }
  if (st.src === 'white') {
    // names in a column, with thin leader lines to their place on the screen
    const ys = COLOURS.map(([, a, b]) => trace((a + b) / 2)?.[2][1]).filter((v) => v != null);
    const mid = (ys[0] + ys[ys.length - 1]) / 2, gap = 13;
    ctx.strokeStyle = cssVar('--muted'); ctx.lineWidth = 0.8;
    COLOURS.forEach(([name], k) => {
      const yl = mid + (k - 3) * gap;
      ctx.beginPath(); ctx.moveTo(SCREEN_X + 11, ys[k]); ctx.lineTo(SCREEN_X + 24, yl); ctx.stroke();
      label(ctx, t(`col.${name}`), SCREEN_X + 27, yl, { size: 10, weight: 700, align: 'left' });
    });
  } else {
    const p = paths[0][1];
    label(ctx, t(`col.${colourName(LASERS[st.src])}`), SCREEN_X + 27, p[2][1], { size: 10, weight: 700, align: 'left' });
  }
  // strip: light on the screen vs frequency (as Fig. 4-b)
  const x0 = 40, x1 = 330, y = 40, h = 22;
  const X = (f14) => x0 + ((f14 - 3.5) / 4.25) * (x1 - x0);
  label(ctx, t('stripTitle'), x0, y - 14, { size: 11, weight: 700, align: 'left' });
  ctx.fillStyle = '#111'; ctx.fillRect(X(3.5), y, X(7.75) - X(3.5), h);
  if (st.src === 'white') {
    for (let px = X(3.75); px < X(7.5); px += 1) { ctx.fillStyle = f14RGB(3.5 + ((px - x0) / (x1 - x0)) * 4.25); ctx.fillRect(px, y, 1.2, h); }
  } else { ctx.fillStyle = f14RGB(LASERS[st.src]); ctx.fillRect(X(LASERS[st.src]) - 1.5, y, 3, h); }
  ctx.fillStyle = cssVar('--text'); ctx.font = font(10, 600); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const v of [3.75, 5, 6, 7.5]) { ctx.fillRect(X(v) - 0.5, y + h, 1, 4); ctx.fillText(num(v, v % 1 ? 2 : 0).replace(/([.,]\d)0$/, '$1'), X(v), y + h + 6); }
  label(ctx, 'f (× 10¹⁴ Hz)', x1 + 6, y + h + 12, { size: 10, weight: 700, align: 'left' });
}

/* ---------- Tab 4: spectrum ---------- */
function drawSpectrum(ctx) {
  const st = S.spectrum;
  const explore = st.mode === 'explore';
  const f = explore ? st.f : st.rows.length ? st.rows[st.rows.length - 1].f : null;
  // wave shape
  const wx = 20, wy = 14, ww = 560, wh = 92;
  ctx.fillStyle = cssVar('--surface'); roundRect(ctx, wx, wy, ww, wh, 8); ctx.fill();
  ctx.strokeStyle = cssVar('--border'); ctx.lineWidth = 1; ctx.stroke();
  label(ctx, t('waveTitle'), wx + 10, wy + 12, { size: 11, weight: 700, color: cssVar('--muted'), align: 'left', halo: false });
  if (f) {
    const cycles = 1 + ((Math.log10(f) - E_MIN) / (E_MAX - E_MIN)) * 26;
    const d = domainOf(f);
    ctx.strokeStyle = d.id === 'visible' ? f14RGB(f / 1e14) : d.col; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 600; i++) {
      const u = i / 600;
      const yy = wy + wh / 2 + 8 - Math.sin(2 * Math.PI * cycles * u - now * 4) * (wh / 2 - 20);
      const xx = wx + 10 + u * (ww - 20);
      if (i) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy);
    }
    ctx.stroke();
  }
  // spectrum bar, logarithmic
  const x0 = 30, x1 = 570, by = 150, bh = 30;
  const X = (v) => x0 + ((Math.log10(v) - E_MIN) / (E_MAX - E_MIN)) * (x1 - x0);
  for (const d of DOMAINS) {
    ctx.fillStyle = d.col; ctx.fillRect(X(d.lo), by, X(d.hi) - X(d.lo) + 0.5, bh);
    if (d.id === 'visible') continue;
    label(ctx, t(`short.${d.id}`), (X(d.lo) + X(d.hi)) / 2, by + bh / 2, { size: 11, weight: 800, color: '#ffffff', halo: false });
  }
  // visible strip drawn as a rainbow
  for (let px = X(VIS_LO); px < X(VIS_HI); px += 0.5) { ctx.fillStyle = f14RGB(10 ** (E_MIN + ((px - x0) / (x1 - x0)) * (E_MAX - E_MIN)) / 1e14); ctx.fillRect(px, by, 0.8, bh); }
  ctx.fillStyle = cssVar('--text'); ctx.font = font(10, 600); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let e = 3; e <= 24; e += 3) { ctx.fillRect(X(10 ** e) - 0.5, by + bh, 1, 5); ctx.fillText(`10${sup(e)}`, X(10 ** e), by + bh + 7); }
  label(ctx, 'f (Hz)', x1, by + bh + 30, { size: 11, weight: 800, align: 'right' });
  // zoom on the visible light (as Fig. 5)
  const zx0 = 200, zx1 = 440, zy = 246, zh = 22;
  ctx.strokeStyle = cssVar('--muted'); ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(X(VIS_LO), by + bh); ctx.lineTo(zx0, zy); ctx.moveTo(X(VIS_HI), by + bh); ctx.lineTo(zx1, zy); ctx.stroke(); ctx.setLineDash([]);
  const ZX = (f14) => zx0 + ((f14 - 3.75) / 3.75) * (zx1 - zx0);
  for (let px = zx0; px < zx1; px += 1) { ctx.fillStyle = f14RGB(3.75 + ((px - zx0) / (zx1 - zx0)) * 3.75); ctx.fillRect(px, zy, 1.2, zh); }
  ctx.fillStyle = cssVar('--text'); ctx.font = font(10, 600); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const v of [3.75, 5, 6, 7.5]) { ctx.fillRect(ZX(v) - 0.5, zy + zh, 1, 4); ctx.fillText(num(v, v % 1 ? 2 : 0).replace(/([.,]\d)0$/, '$1'), ZX(v), zy + zh + 6); }
  label(ctx, '× 10¹⁴ Hz', zx1 + 8, zy + zh + 12, { size: 10, weight: 700, align: 'left' });
  label(ctx, t('visibleZoom'), (zx0 + zx1) / 2, zy - 9, { size: 11, weight: 700 });
  // energy
  label(ctx, `${t('en.low')}  ·  ${t('energyAxis')}  ·  ${t('en.high')}`, 300, 322, { size: 11, weight: 700, color: cssVar('--muted') });
  // marker (explore only: in the exercises the student finds the range himself)
  if (explore) {
    const mx = X(f);
    ctx.fillStyle = cssVar('--accent');
    ctx.beginPath(); ctx.moveTo(mx, by - 2); ctx.lineTo(mx - 7, by - 14); ctx.lineTo(mx + 7, by - 14); ctx.fill();
    ctx.fillRect(mx - 1, by, 2, bh);
    label(ctx, `${sci(f)} Hz`, Math.max(60, Math.min(540, mx)), by - 24, { size: 12, weight: 800 });
    if (f >= VIS_LO && f < VIS_HI) {
      const zm = ZX(f / 1e14);
      ctx.beginPath(); ctx.moveTo(zm, zy - 1); ctx.lineTo(zm - 6, zy - 11); ctx.lineTo(zm + 6, zy - 11); ctx.fill();
    }
  }
}

/* ================================================================
   Controls and measurements
   ================================================================ */
const controlsBody = document.getElementById('controls-body');
const measuresBody = document.getElementById('measures-body');
let ui = {};
function measRows(dl, rows) {
  dl.replaceChildren(...rows.flatMap(([k, v, cls]) => [el('dt', {}, k), el('dd', cls ? { class: cls } : {}, v)]));
}
function statusBox() { return el('p', { class: 'status', hidden: '' }); }
function showStatus(box, fb) {
  if (!fb) { box.hidden = true; return; }
  box.hidden = false;
  box.className = `status ${fb.type || ''}`;
  box.textContent = t(fb.key, fb.params);
}
function hint(key) { return el('p', { class: 'muted', style: 'font-size:0.88rem;margin:10px 0 0', dataset: { i18n: key } }, t(key)); }
const btnRow = (...b) => el('div', { class: 'btn-row' }, b);
const yn = (b) => t(b ? 'yes' : 'no');
const resetBtn = (id) => btnRow(createButton({ labelKey: 'ui.reset', variant: 'ghost', onClick: () => resetTab(id) }));
function soundControl() {
  const s = createSegmented({
    labelKey: 'ctl.sound', options: [{ value: 'on', labelKey: 'snd.on' }, { value: 'off', labelKey: 'snd.off' }], value: isMuted() ? 'off' : 'on',
    onChange: (v) => setMuted(v === 'off'),
  });
  return [s.root, hint(audioAvailable() ? 'snd.note' : 'noAudio')];
}

/* ---------- Tab 1 ---------- */
function setTuning(i) {
  const st = S.radio;
  st.i = Math.max(0, Math.min(BANDS[st.band].n, i));
  st.lastNote = -1;
  if (ui.tune) ui.tune.set?.(st.i);
  refresh();
}
function buildRadio() {
  const st = S.radio;
  ui.power = createSegmented({
    labelKey: 'ctl.radio', options: [{ value: 'off', labelKey: 'radio.off' }, { value: 'on', labelKey: 'radio.on' }], value: st.on ? 'on' : 'off',
    onChange: (v) => {
      st.on = v === 'on';
      if (st.on) radioSound(); else { voices.hiss?.setGain(0, 0.03); voices.music?.setGain(0, 0.03); }
      loop.start(); refresh();
    },
  });
  ui.band = createSegmented({
    labelKey: 'ctl.band', options: [{ value: 'mw', labelKey: 'band.mw' }, { value: 'fm', labelKey: 'band.fm' }], value: st.band,
    onChange: (v) => { st.band = v; st.i = 10; st.lastNote = -1; buildTab('radio'); },
  });
  ui.tune = createSlider({ labelKey: 'ctl.tune', min: 0, max: BANDS[st.band].n, step: 1, value: st.i, unit: '', onInput: (v) => setTuning(v) });
  controlsBody.append(ui.power.root, ui.band.root, ui.tune.root,
    btnRow(createButton({ labelKey: 'ctl.prev', variant: 'secondary', onClick: () => setTuning(S.radio.i - 1) }),
      createButton({ labelKey: 'ctl.next', variant: 'secondary', onClick: () => setTuning(S.radio.i + 1) })),
    btnRow(createButton({ labelKey: 'ctl.tap', variant: 'primary', onClick: () => {
      st.tapAt = now;
      if (st.on) {
        const r = reception(st.band, st.i);
        const g = (st.band === 'mw' ? 0.5 : 0.05) * (1 - 0.5 * r);
        for (let k = 0; k < 5; k++) noiseBurst({ delay: k / 7 + Math.random() * 0.03, duration: 0.035 + Math.random() * 0.03, gain: g, freq: 1800, q: 0.35 });
      }
      loop.start(); refresh();
    } })),
    ...soundControl(), hint('hint.radio'), resetBtn('radio'));
  ui.dl = el('dl', { class: 'meas' });
  measuresBody.append(ui.dl);
}
function updateRadio() {
  const st = S.radio;
  const b = BANDS[st.band];
  const f = bandF(st.band, st.i);
  const out = ui.tune.root.querySelector('output');
  if (out) out.textContent = qty(f, b.dec, b.unit);
  const input = ui.tune.root.querySelector('input');
  if (input && Number(input.value) !== st.i) input.value = st.i;
  ui.power.set(st.on ? 'on' : 'off');
  const r = reception(st.band, st.i);
  const rec = !st.on ? 'rec.off' : r === 1 ? 'rec.music' : r > 0 ? 'rec.weak' : 'rec.none';
  const cr = !st.on || !tapping() ? 'crackle.none' : st.band === 'mw' ? 'crackle.yes' : 'crackle.weak';
  measRows(ui.dl, [
    [t('m.radio'), t(st.on ? 'radio.on' : 'radio.off')],
    [t('m.band'), t(`bandShort.${st.band}`)],
    [t('m.display'), st.on ? qty(f, b.dec, b.unit) : '—'],
    [t('m.reception'), t(rec), rec === 'rec.music' ? 'good-text' : ''],
    [t('m.crackle'), t(cr), cr === 'crackle.yes' ? 'good-text' : ''],
  ]);
}

/* ---------- Tab 2 ---------- */
function buildVacuum() {
  const st = S.vacuum;
  ui.lamp = createSegmented({
    labelKey: 'ctl.lamp', options: [{ value: 'off', labelKey: 'lamp.off' }, { value: 'on', labelKey: 'lamp.on' }], value: st.lampOn ? 'on' : 'off',
    onChange: (v) => { st.lampOn = v === 'on'; loop.start(); refresh(); },
  });
  ui.bell = createSegmented({
    labelKey: 'ctl.bell', options: [{ value: 'off', labelKey: 'bell.off' }, { value: 'on', labelKey: 'bell.on' }], value: st.bellOn ? 'on' : 'off',
    onChange: (v) => {
      st.bellOn = v === 'on';
      if (st.bellOn) voice('bell', () => createVoice({ freq: 880, harmonics: [1, 0, 0.6, 0, 0.4, 0, 0.3] })); else voices.bell?.setGain(0, 0.02);
      loop.start(); refresh();
    },
  });
  ui.pump = createSegmented({
    labelKey: 'ctl.pump', options: [{ value: 'off', labelKey: 'pump.off' }, { value: 'on', labelKey: 'pump.on' }], value: st.pumping ? 'on' : 'off',
    onChange: (v) => { st.pumping = v === 'on'; loop.start(); refresh(); },
  });
  controlsBody.append(ui.lamp.root, ui.pump.root,
    btnRow(createButton({ labelKey: 'ctl.letAir', variant: 'secondary', onClick: () => { st.pumping = false; st.air = 1; refresh(); } })),
    ui.bell.root, ...soundControl(), resetBtn('vacuum'));
  ui.dl = el('dl', { class: 'meas' });
  measuresBody.append(ui.dl);
}
function updateVacuum() {
  const st = S.vacuum;
  ui.lamp.set(st.lampOn ? 'on' : 'off'); ui.bell.set(st.bellOn ? 'on' : 'off'); ui.pump.set(st.pumping ? 'on' : 'off');
  const lvl = !st.bellOn ? 'lvl.none' : st.air > 0.6 ? 'lvl.loud' : st.air > 0.2 ? 'lvl.fainter' : st.air > 0.03 ? 'lvl.faint' : 'lvl.inaudible';
  measRows(ui.dl, [
    [t('m.air'), `${num(st.air * 100, st.air < 0.1 ? 1 : 0)} %`],
    [t('m.light'), t(st.lampOn ? 'light.seen' : 'light.off'), st.lampOn ? 'good-text' : ''],
    [t('m.sound'), t(lvl), lvl === 'lvl.inaudible' ? 'bad-text' : ''],
  ]);
}

/* ---------- Tab 3 ---------- */
function buildPrism() {
  const st = S.prism;
  ui.src = createSegmented({
    labelKey: 'ctl.source', options: ['white', 'red', 'green'].map((v) => ({ value: v, labelKey: `src.${v}` })), value: st.src,
    onChange: (v) => { st.src = v; refresh(); },
  });
  controlsBody.append(ui.src.root, resetBtn('prism'));
  ui.dl = el('dl', { class: 'meas' });
  measuresBody.append(ui.dl);
}
function updatePrism() {
  const st = S.prism;
  ui.src.set(st.src);
  const white = st.src === 'white';
  const f = LASERS[st.src];
  measRows(ui.dl, [
    [t('m.colours'), white ? COLOURS.map(([c]) => t(`col.${c}`)).join(', ') : t(`col.${colourName(f)}`)],
    [t('m.fRange'), white ? `${num(3.75, 2)} × 10¹⁴ Hz → ${num(7.5, 1)} × 10¹⁴ Hz` : `${num(f, 2)} × 10¹⁴ Hz`],
    [t('m.decomposed'), yn(white), white ? 'good-text' : ''],
  ]);
}

/* ---------- Tab 4 ---------- */
let rowsSig = '';
const MAX_ROWS = 6;
function buildSpectrum() {
  const st = S.spectrum;
  ui.mode = createSegmented({
    labelKey: 'ctl.mode', options: [{ value: 'explore', labelKey: 'mode.explore' }, { value: 'exercise', labelKey: 'mode.exercise' }], value: st.mode,
    onChange: (v) => { st.mode = v; st.fb = null; if (v === 'exercise' && !st.rows.length) st.rows.push(randomWave()); buildTab('spectrum'); },
  });
  controlsBody.append(ui.mode.root);
  if (st.mode === 'explore') {
    ui.f = createSlider({ labelKey: 'ctl.freq', min: 0, max: 1000, step: 1, value: Math.round(fToPos(st.f)), unit: '', onInput: (p) => { st.f = niceF(posToF(p)); refresh(); } });
    controlsBody.append(ui.f.root, hint('hint.spectrum'));
  } else {
    controlsBody.append(btnRow(createButton({ labelKey: 'ctl.newWave', variant: 'primary', onClick: () => {
      if (st.rows.length >= MAX_ROWS) st.fb = { type: 'warn', key: 'fb.full' };
      else { st.rows.push(randomWave()); st.fb = null; }
      refresh();
    } })), hint('hint.exercise'));
  }
  controlsBody.append(resetBtn('spectrum'));
  ui.dl = el('dl', { class: 'meas' });
  ui.table = el('table', { class: 'data' });
  ui.clear = el('div', { class: 'btn-row', style: 'margin-top:8px' }, [createButton({ labelKey: 'ctl.clearTable', variant: 'ghost', onClick: () => { st.rows = []; st.fb = null; refresh(); } })]);
  ui.status = statusBox();
  measuresBody.append(ui.dl, ui.table, ui.clear, ui.status);
}
function domainCell(r) {
  if (r.domOk) return el('td', { class: 'good-text' }, `${t(`dom.${r.dom}`)} ✓`);
  const sel = el('select', { class: `text-input${r.domWrong ? ' is-wrong' : ''}`, 'aria-label': t('col.dom') },
    [el('option', { value: '' }, t('choose')), ...DOMAINS.map((d) => el('option', { value: d.id }, t(`dom.${d.id}`)))]);
  sel.addEventListener('change', () => {
    if (!sel.value) return;
    r.domOk = sel.value === r.dom; r.domWrong = !r.domOk;
    S.spectrum.fb = r.domOk ? { type: 'good', key: 'fb.domOk' } : { type: 'bad', key: 'fb.domWrong' };
    refresh();
  });
  return el('td', {}, sel);
}
function updateSpectrum() {
  const st = S.spectrum;
  ui.mode.set(st.mode);
  if (st.mode === 'explore') {
    const out = ui.f.root.querySelector('output');
    if (out) out.textContent = `${sci(st.f)} Hz`;
    const d = domainOf(st.f);
    const rows = [
      [t('m.f'), `${sci(st.f)} Hz`],
      [t('m.domain'), t(`dom.${d.id}`), 'good-text'],
      [t('m.energy'), t(`en.${d.en}`)],
    ];
    if (d.id === 'visible') rows.push([t('m.colour'), t(`col.${colourName(st.f / 1e14)}`)]);
    rows.push([t('m.apps'), t(`app.${d.id}`)], [t('m.c'), qty(300000, 0, 'km/s')]);
    measRows(ui.dl, rows);
  } else measRows(ui.dl, [[t('m.c'), qty(300000, 0, 'km/s')]]);
  const show = st.mode === 'exercise' && st.rows.length > 0;
  const sig = calcSig(st.rows) + st.rows.length + JSON.stringify(st.rows.map((r) => [r.domOk, r.domWrong])) + t('col.T');
  if (show && sig !== rowsSig) {
    const head = el('tr', {}, [el('th', {}, t('col.f')), el('th', {}, t('col.T')), el('th', {}, t('col.dom'))]);
    const body = st.rows.map((r) => {
      const td = calcCell(r, 'T', { expected: 10 / r.k, decimals: 2, onCheck: (res) => {
        st.fb = res === 'invalid' ? { type: 'warn', key: 'calcInvalid' } : res === 'wrong' ? { type: 'bad', key: 'fb.TWrong' } : { type: 'good', key: 'fb.TOk' };
        refresh();
      } });
      const pow = ` × 10${sup(-(r.e + 1))}`;
      if (r.calc?.T?.ok) td.textContent = `${num(10 / r.k, 2)}${pow} ✓`;
      else td.append(el('span', { style: 'white-space:nowrap' }, pow));
      return el('tr', {}, [el('td', { style: 'white-space:nowrap' }, sci(r.f)), td, domainCell(r)]);
    });
    ui.table.replaceChildren(el('thead', {}, head), el('tbody', {}, body));
    rowsSig = sig;
  }
  ui.table.hidden = !show;
  ui.clear.hidden = !show;
  showStatus(ui.status, st.fb);
}

/* ---------- Tab switching ---------- */
const TABS = ['radio', 'vacuum', 'prism', 'spectrum'];
function buildTab(id) {
  controlsBody.replaceChildren();
  measuresBody.replaceChildren();
  ui = {};
  rowsSig = '';
  if (id === 'radio') buildRadio();
  else if (id === 'vacuum') buildVacuum();
  else if (id === 'prism') buildPrism();
  else buildSpectrum();
  loop.start();
  refresh();
}
let lastTab = null;
function onTab(id) {
  if (lastTab && lastTab !== id) {
    silence();
    if (lastTab === 'radio') S.radio.on = false;
    if (lastTab === 'vacuum') S.vacuum.bellOn = false;
  }
  lastTab = id;
  buildTab(id);
}
function updateMeasures() {
  if (!shell || !ui.dl) return;
  const tab = shell.tab;
  if (tab === 'radio') updateRadio();
  else if (tab === 'vacuum') updateVacuum();
  else if (tab === 'prism') updatePrism();
  else updateSpectrum();
}
function refresh() { updateMeasures(); requestDraw(); }
function resetTab(id) { silence(); S[id] = initialState()[id]; buildTab(id); }

onLangChange(() => { if (shell) buildTab(shell.tab); });

shell = initSim({
  strings,
  tabs: TABS.map((id) => ({ id, labelKey: `tab.${id}` })),
  initialTab: 'radio',
  onTab,
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, trace, domainOf, reception, bandF };
