// Grade 8 — Sound waves (Ch.12 Act. 1–7, Ex. 6). Real sounds through shared/audio.js.
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num, qty } from '../../../shared/format.js';
import { createButton, createSegmented, createSlider, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, font } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { label, person } from '../../../shared/figures.js';
import { calcCell, calcSig } from '../../../shared/calc-cell.js';
import { audioAvailable, createVoice, noiseBurst, setMuted, isMuted, stopAll } from '../../../shared/audio.js';

/* ================================================================
   Model
   ================================================================ */
const V_SOUND = 340; // m/s
const F_MIN = 5, F_MAX = 40000;
const posToF = (p) => F_MIN * (F_MAX / F_MIN) ** (p / 1000);
const fToPos = (f) => (1000 * Math.log(f / F_MIN)) / Math.log(F_MAX / F_MIN);
function niceF(f) {
  const d = 10 ** Math.floor(Math.log10(f));
  const step = d >= 1000 ? d / 10 : d >= 10 ? d / 10 : 1;
  return Math.max(F_MIN, Math.round(f / step) * step);
}
const SAX = [1, 0.85, 0.7, 0.55, 0.45, 0.32, 0.22, 0.15, 0.1];
const PIANO = [1, 0.45, 0.25, 0.15, 0.08, 0.05];
const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

function initialState() {
  return {
    vibration: { amp: 0, touchAt: -10, near: false, th: 0, om: 0, pushed: false },
    vacuum: { bellOn: false, pumping: false, air: 1 },
    range: { f: 440, on: false },
    qualities: { q: 'pitch', fork: null, forkAt: -10, vol: 0.5, noteOn: false, played: { sax: false, piano: false }, inst: null, instAt: -10 },
    echo: { mode: 'explore', d: 100, dHidden: 17 * randInt(4, 24), shoutAt: null, lastT: null, rows: [], fb: null },
  };
}
let S = initialState();
let now = 0;
const voices = {};
function voice(key, opts) {
  if (!voices[key]) voices[key] = createVoice(opts);
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

const loop = createLoop({
  step(dt) {
    now += dt;
    if (!shell) return false;
    const tab = shell.tab;
    if (tab === 'vibration') {
      const st = S.vibration;
      st.amp *= Math.exp(-dt / 2.5);
      if (st.amp < 0.003) st.amp = 0;
      // light pendulum next to the prong
      st.om += (-9.8 / 0.12 * Math.sin(st.th) - 0.6 * st.om) * dt;
      st.th += st.om * dt;
      if (st.th <= 0) {
        st.th = 0;
        if (st.near && st.amp > 0.05) { st.om = 2.4 * st.amp + 0.6; st.pushed = true; } else st.om = Math.max(0, -st.om * 0.3);
        if (!st.near) st.om = 0;
      }
      return st.amp > 0 || Math.abs(st.om) > 0.01 || st.th > 0.002 || now - st.touchAt < 1;
    }
    if (tab === 'vacuum') {
      const st = S.vacuum;
      if (st.pumping) st.air = Math.max(0.003, st.air * Math.exp(-dt / 3));
      if (st.bellOn) {
        const v = voices.bell;
        if (v) v.setGain(0.16 * st.air ** 0.8 * (0.45 + 0.55 * Math.abs(Math.sin(2 * Math.PI * 12 * now))), 0.004);
      }
      return st.bellOn || st.pumping;
    }
    if (tab === 'range') return S.range.on;
    if (tab === 'qualities') {
      const st = S.qualities;
      return st.noteOn || now - st.forkAt < 6 || now - st.instAt < 3;
    }
    if (tab === 'echo') {
      const st = S.echo;
      return st.shoutAt != null && now - st.shoutAt < echoTime() + 0.5;
    }
    return false;
  },
  render() { draw(); updateMeasures(); },
});
const echoDist = () => (S.echo.mode === 'find' ? S.echo.dHidden : S.echo.d);
const echoTime = () => (2 * echoDist()) / V_SOUND;

/* ================================================================
   Drawing helpers
   ================================================================ */
function drawFork(ctx, x, yTop, len, amp, phase, name, gap = 34) {
  const off = amp * 7 * Math.sin(phase);
  ctx.strokeStyle = cssVar('--metal'); ctx.lineWidth = 10; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - gap / 2 - off, yTop); ctx.lineTo(x - gap / 2, yTop + len);
  ctx.moveTo(x + gap / 2 + off, yTop); ctx.lineTo(x + gap / 2, yTop + len);
  ctx.stroke();
  ctx.beginPath(); ctx.arc(x, yTop + len, gap / 2, 0, Math.PI); ctx.stroke();
  ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(x, yTop + len + gap / 2); ctx.lineTo(x, yTop + len + gap / 2 + 46); ctx.stroke();
  ctx.lineCap = 'butt';
  if (amp > 0.02) {
    ctx.strokeStyle = cssVar('--accent'); ctx.lineWidth = 1.5; ctx.globalAlpha = Math.min(1, amp * 1.5);
    for (const s of [-1, 1]) for (let k = 1; k <= 3; k++) {
      ctx.beginPath(); ctx.arc(x + s * (gap / 2 + 10), yTop + 30, 8 + k * 9, s > 0 ? -0.6 : Math.PI - 0.6, s > 0 ? 0.6 : Math.PI + 0.6); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  if (name) label(ctx, name, x, yTop + len + gap / 2 + 62, { size: 12, weight: 700, color: cssVar('--muted') });
}
function waveform(ctx, x, y, w, h, harmonics, amp, periods, title) {
  ctx.fillStyle = cssVar('--surface'); roundRect(ctx, x, y, w, h, 8); ctx.fill();
  ctx.strokeStyle = cssVar('--border'); ctx.lineWidth = 1; ctx.stroke();
  ctx.strokeStyle = cssVar('--border'); ctx.beginPath(); ctx.moveTo(x + 6, y + h / 2 + 6); ctx.lineTo(x + w - 6, y + h / 2 + 6); ctx.stroke();
  const sig = (ph) => harmonics.reduce((s, a, k) => s + a * Math.sin((k + 1) * ph), 0);
  let norm = 1e-9;
  for (let i = 0; i < 200; i++) norm = Math.max(norm, Math.abs(sig((2 * Math.PI * i) / 200)));
  ctx.strokeStyle = cssVar('--accent'); ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= 240; i++) {
    const u = i / 240, ph = 2 * Math.PI * periods * u;
    const v = sig(ph);
    const yy = y + h / 2 + 6 - (v / norm) * amp * (h / 2 - 18);
    const xx = x + 8 + u * (w - 16);
    if (i) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy);
  }
  ctx.stroke();
  if (title) label(ctx, title, x + 10, y + 12, { size: 11, weight: 700, color: cssVar('--muted'), align: 'left', halo: false });
}
function soundBar(ctx, x, y, w, level) {
  ctx.fillStyle = cssVar('--surface'); roundRect(ctx, x, y, w, 16, 6); ctx.fill();
  ctx.fillStyle = '#e67e22'; roundRect(ctx, x, y, Math.max(0, Math.min(1, level)) * w, 16, 6); ctx.fill();
  ctx.strokeStyle = cssVar('--border'); ctx.lineWidth = 1; roundRect(ctx, x, y, w, 16, 6); ctx.stroke();
  label(ctx, t('soundBar'), x + w / 2, y - 10, { size: 11, weight: 700 });
}

function draw() {
  if (!shell) return;
  const ctx = view.begin();
  ctx.fillStyle = cssVar('--scene-bg');
  ctx.fillRect(0, 0, SCENE.w, SCENE.h);
  const tab = shell.tab;
  if (tab === 'vibration') drawVibration(ctx);
  else if (tab === 'vacuum') drawVacuum(ctx);
  else if (tab === 'range') drawRange(ctx);
  else if (tab === 'qualities') drawQualities(ctx);
  else drawEcho(ctx);
}

/* ---------- Tab 1 ---------- */
function drawVibration(ctx) {
  const st = S.vibration;
  ctx.fillStyle = cssVar('--wood'); ctx.fillRect(10, 300, SCENE.w - 20, 30);
  ctx.fillStyle = '#8f6a3a'; roundRect(ctx, 220, 276, 160, 26, 4); ctx.fill(); // resonance box
  const x = 300, yTop = 70;
  drawFork(ctx, x, yTop, 150, st.amp, now * 2 * Math.PI * 9, t('fork'));
  label(ctx, t('prong'), x - 50, yTop + 110, { size: 11, color: cssVar('--muted'), align: 'right' });
  // light pendulum: thread from a stand, ball resting against the right prong when "near"
  const px = st.near ? x + 17 + 10 + 8 : 480, py = 30, L = 120;
  ctx.fillStyle = cssVar('--wire'); ctx.fillRect(px - 2, 18, 120, 5); ctx.fillRect(px + 112, 18, 6, 282);
  const bx = px + L * Math.sin(st.th), by = py + L * Math.cos(st.th);
  ctx.strokeStyle = cssVar('--thread'); ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(px, 22); ctx.lineTo(bx, by); ctx.stroke();
  ctx.fillStyle = '#f2f2ee'; ctx.beginPath(); ctx.arc(bx + 8, by, 8, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#9a9a92'; ctx.stroke();
  label(ctx, t('lightPend'), px + 60, 36, { size: 11, color: cssVar('--muted') });
  // finger touching the prong
  if (now - st.touchAt < 1) {
    ctx.fillStyle = cssVar('--skin'); roundRect(ctx, x - 90, yTop + 46, 70, 18, 9); ctx.fill();
    label(ctx, t('finger'), x - 110, yTop + 55, { size: 11, color: cssVar('--muted'), align: 'right' });
  }
  // rubber hammer
  ctx.fillStyle = cssVar('--wood'); ctx.fillRect(90, 210, 80, 6);
  ctx.fillStyle = '#c0392b'; roundRect(ctx, 76, 200, 22, 26, 6); ctx.fill();
  label(ctx, t('hammer'), 126, 236, { size: 11, color: cssVar('--muted') });
}

/* ---------- Tab 2 ---------- */
const AIR_DOTS = Array.from({ length: 70 }, (_, i) => [210 + ((i * 53) % 180), 70 + ((i * 37) % 200)]);
function drawVacuum(ctx) {
  const st = S.vacuum;
  ctx.fillStyle = cssVar('--wood'); ctx.fillRect(10, 300, SCENE.w - 20, 30);
  ctx.fillStyle = cssVar('--device'); ctx.fillRect(170, 286, 260, 14);
  // air particles
  const n = Math.round(AIR_DOTS.length * st.air);
  ctx.fillStyle = cssVar('--air-part') || '#7fb3e6';
  for (let i = 0; i < n; i++) { const [x, y] = AIR_DOTS[i]; if (Math.hypot(x - 300, (y - 286) * 1.1) < 128) { ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill(); } }
  // bell
  const ring = st.bellOn ? Math.sin(now * 2 * Math.PI * 12) : 0;
  ctx.fillStyle = '#c9a23a'; ctx.beginPath(); ctx.arc(300, 210, 34, Math.PI, 0); ctx.fill();
  ctx.fillRect(266, 210, 68, 6);
  ctx.fillStyle = cssVar('--device'); ctx.fillRect(282, 246, 36, 40);
  ctx.strokeStyle = cssVar('--wire'); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(300, 246); ctx.lineTo(300 + 16 + ring * 6, 222); ctx.stroke();
  ctx.fillStyle = cssVar('--wire'); ctx.beginPath(); ctx.arc(300 + 16 + ring * 6, 222, 5, 0, Math.PI * 2); ctx.fill();
  label(ctx, t('bell'), 300, 160, { size: 11, color: cssVar('--muted') });
  // glass bell jar
  ctx.strokeStyle = 'rgba(120,170,210,0.9)'; ctx.lineWidth = 3; ctx.fillStyle = 'rgba(160,200,230,0.18)';
  ctx.beginPath(); ctx.moveTo(180, 286); ctx.lineTo(180, 150); ctx.quadraticCurveTo(180, 60, 300, 56); ctx.quadraticCurveTo(420, 60, 420, 150); ctx.lineTo(420, 286); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(120,170,210,0.9)'; ctx.fillRect(292, 44, 16, 14);
  label(ctx, t('jar'), 438, 90, { size: 11, color: cssVar('--muted'), align: 'left' });
  // pipe to the pump
  ctx.strokeStyle = cssVar('--rubber') || '#444'; ctx.lineWidth = 7;
  ctx.beginPath(); ctx.moveTo(430, 293); ctx.lineTo(540, 293); ctx.stroke();
  label(ctx, t('pump'), 520, 276, { size: 11, color: cssVar('--muted') });
  if (st.pumping) { ctx.fillStyle = cssVar('--accent'); for (let k = 0; k < 3; k++) { const xx = 440 + ((now * 80 + k * 33) % 100); ctx.beginPath(); ctx.arc(xx, 293, 2, 0, Math.PI * 2); ctx.fill(); } }
  soundBar(ctx, 30, 70, 120, st.bellOn ? st.air ** 0.8 : 0);
}

/* ---------- Tab 3 ---------- */
function drawRange(ctx) {
  const st = S.range;
  // L.F.G
  ctx.fillStyle = cssVar('--device'); roundRect(ctx, 30, 70, 200, 110, 10); ctx.fill();
  ctx.fillStyle = cssVar('--lcd-bg'); roundRect(ctx, 46, 88, 168, 44, 6); ctx.fill();
  ctx.fillStyle = cssVar('--lcd-ink'); ctx.font = '700 24px ui-monospace, Menlo, Consolas, monospace'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  ctx.fillText(st.on ? `${num(st.f, 0)} Hz` : '— — —', 206, 111);
  label(ctx, t('lfg'), 130, 156, { size: 13, weight: 800, color: cssVar('--text'), halo: false });
  ctx.fillStyle = st.on ? '#2ecc71' : '#555'; ctx.beginPath(); ctx.arc(210, 160, 6, 0, Math.PI * 2); ctx.fill();
  // wires
  ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(230, 110); ctx.lineTo(380, 110); ctx.stroke();
  ctx.strokeStyle = '#222'; ctx.beginPath(); ctx.moveTo(230, 140); ctx.lineTo(380, 140); ctx.stroke();
  // loudspeaker
  const vib = st.on ? Math.sin(now * 2 * Math.PI * Math.min(st.f, 9)) * (st.f > 60 ? 0.6 : 1) : 0;
  const blur = st.on && st.f > 9;
  ctx.fillStyle = cssVar('--device'); ctx.fillRect(380, 92, 26, 66);
  ctx.fillStyle = '#5b6470';
  ctx.beginPath(); ctx.moveTo(406, 100); ctx.lineTo(456 + vib * 5, 60); ctx.lineTo(456 + vib * 5, 190); ctx.lineTo(406, 150); ctx.closePath(); ctx.fill();
  if (blur) { ctx.strokeStyle = 'rgba(91,100,112,0.45)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(451, 60); ctx.lineTo(451, 190); ctx.moveTo(461, 60); ctx.lineTo(461, 190); ctx.stroke(); }
  label(ctx, t('speaker'), 430, 208, { size: 11, color: cssVar('--muted') });
  const audible = st.f >= 20 && st.f <= 20000;
  if (st.on && audible) {
    ctx.strokeStyle = cssVar('--accent'); ctx.lineWidth = 2;
    for (let k = 0; k < 3; k++) { const r = 20 + ((now * 60 + k * 22) % 66); ctx.globalAlpha = 1 - r / 90; ctx.beginPath(); ctx.arc(462, 125, r, -0.7, 0.7); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
  // frequency scale (logarithmic) 1 Hz – 100 kHz
  const x0 = 40, x1 = 560, y = 268;
  const X = (f) => x0 + ((Math.log10(f) - 0) / 5) * (x1 - x0);
  const zone = (a, b, c, k) => { ctx.fillStyle = c; ctx.fillRect(X(a), y - 14, X(b) - X(a), 28); label(ctx, t(k), (X(a) + X(b)) / 2, y, { size: 11, weight: 800, color: '#ffffff', halo: false }); };
  zone(1, 20, '#8e6bbf', 'scale.infra'); zone(20, 20000, '#2f8f5b', 'scale.audible'); zone(20000, 100000, '#c0392b', 'scale.ultra');
  ctx.fillStyle = cssVar('--text'); ctx.font = font(10, 600); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const [f, s] of [[1, '1'], [20, '20'], [1000, '1 000'], [20000, '20 000'], [100000, '100 000']]) ctx.fillText(s, X(f), y + 18);
  label(ctx, 'f (Hz)', x1, y + 40, { size: 11, weight: 800, align: 'right' });
  const mx = X(st.f);
  ctx.fillStyle = cssVar('--accent'); ctx.beginPath(); ctx.moveTo(mx, y - 16); ctx.lineTo(mx - 7, y - 28); ctx.lineTo(mx + 7, y - 28); ctx.fill();
}

/* ---------- Tab 4 ---------- */
function drawQualities(ctx) {
  const st = S.qualities;
  if (st.q === 'pitch') {
    const ampA = st.fork === 'A' ? Math.exp(-(now - st.forkAt) / 1.5) : 0;
    const ampB = st.fork === 'B' ? Math.exp(-(now - st.forkAt) / 1.5) : 0;
    drawFork(ctx, 130, 40, 140, ampA, now * 2 * Math.PI * 5, t('forkA'), 38);
    drawFork(ctx, 290, 70, 105, ampB, now * 2 * Math.PI * 10, t('forkB'), 30);
    const f = st.fork === 'A' ? 220 : 440;
    if (st.fork) waveform(ctx, 380, 40, 200, 150, [1], st.fork === 'A' ? ampA : ampB, f / 220, t('waveShort'));
    else waveform(ctx, 380, 40, 200, 150, [1], 0, 1, t('waveShort'));
  } else if (st.q === 'loud') {
    const a = st.noteOn ? st.vol : 0;
    ctx.fillStyle = cssVar('--device'); ctx.fillRect(60, 100, 30, 80);
    ctx.fillStyle = '#5b6470'; ctx.beginPath(); ctx.moveTo(90, 110); ctx.lineTo(150, 70); ctx.lineTo(150, 210); ctx.lineTo(90, 170); ctx.closePath(); ctx.fill();
    if (a > 0) { ctx.strokeStyle = cssVar('--accent'); ctx.lineWidth = 1 + a * 4; for (let k = 0; k < 3; k++) { const r = 20 + ((now * 70 + k * 25) % 80); ctx.globalAlpha = 1 - r / 100; ctx.beginPath(); ctx.arc(156, 140, r, -0.7, 0.7); ctx.stroke(); } ctx.globalAlpha = 1; }
    label(ctx, `${t('vol.whisper')}  ←  →  ${t('vol.shout')}`, 120, 250, { size: 12, weight: 700, color: cssVar('--muted') });
    waveform(ctx, 270, 40, 310, 220, [1], a, 2, t('waveShort'));
  } else {
    const fade = (k) => (st.inst === k ? Math.max(0.25, Math.exp(-(now - st.instAt) / (k === 'piano' ? 0.8 : 4))) : 1);
    if (st.played.sax) waveform(ctx, 230, 20, 350, 140, SAX, 0.9 * fade('sax'), 2, `${t('sax')} — la3`);
    else waveform(ctx, 230, 20, 350, 140, [1], 0, 2, `${t('sax')} — la3`);
    if (st.played.piano) waveform(ctx, 230, 180, 350, 140, PIANO, 0.9 * fade('piano'), 2, `${t('piano')} — la3`);
    else waveform(ctx, 230, 180, 350, 140, [1], 0, 2, `${t('piano')} — la3`);
    // simple instruments
    ctx.strokeStyle = '#c9a23a'; ctx.lineWidth = 12; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(80, 40); ctx.lineTo(80, 120); ctx.quadraticCurveTo(80, 150, 110, 150); ctx.lineTo(130, 135); ctx.stroke(); ctx.lineCap = 'butt';
    label(ctx, t('sax'), 100, 168, { size: 12, weight: 700 });
    ctx.fillStyle = '#1a1a1a'; roundRect(ctx, 30, 220, 160, 70, 6); ctx.fill();
    ctx.fillStyle = '#fafafa'; for (let i = 0; i < 10; i++) ctx.fillRect(36 + i * 15, 254, 13, 32);
    ctx.fillStyle = '#1a1a1a'; for (const i of [0, 1, 3, 4, 5, 7, 8]) ctx.fillRect(46 + i * 15, 254, 8, 18);
    label(ctx, t('piano'), 110, 304, { size: 12, weight: 700 });
  }
}

/* ---------- Tab 5 ---------- */
function drawEcho(ctx) {
  const st = S.echo;
  ctx.fillStyle = cssVar('--sky'); ctx.fillRect(0, 0, SCENE.w, 270);
  ctx.fillStyle = cssVar('--grass'); ctx.fillRect(0, 270, SCENE.w, 70);
  const bx = 70, wx = 540;
  // wall or rock face
  if (st.mode === 'find') {
    ctx.fillStyle = '#8b7d6b'; ctx.beginPath(); ctx.moveTo(wx, 270); ctx.lineTo(wx + 10, 40); ctx.lineTo(600, 20); ctx.lineTo(600, 270); ctx.fill();
  } else { ctx.fillStyle = '#b5651d'; ctx.fillRect(wx, 60, 40, 210); ctx.strokeStyle = 'rgba(0,0,0,0.2)'; for (let y = 70; y < 270; y += 16) { ctx.beginPath(); ctx.moveTo(wx, y); ctx.lineTo(wx + 40, y); ctx.stroke(); } }
  label(ctx, t(st.mode === 'find' ? 'cliff' : 'wall'), wx + 20, 46, { size: 11, weight: 700 });
  person(ctx, bx, 270, { color: '#2f6db5', h: 56, name: t('boy') });
  // distance arrow
  ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(bx + 10, 296); ctx.lineTo(wx - 2, 296); ctx.stroke();
  for (const xx of [bx + 10, wx - 2]) { ctx.beginPath(); ctx.moveTo(xx, 290); ctx.lineTo(xx, 302); ctx.stroke(); }
  label(ctx, st.mode === 'find' ? `d = ${t('dHidden')}` : `d = ${qty(st.d, 0, 'm')}`, (bx + wx) / 2, 312, { size: 13, weight: 800 });
  // sound fronts
  if (st.shoutAt != null) {
    const T = echoTime(), u = (now - st.shoutAt) / (T / 2); // 0 → 1 going, 1 → 2 coming back
    const L = wx - bx - 20;
    ctx.lineWidth = 3;
    const front = (x, dir, col) => { ctx.strokeStyle = col; for (let k = 0; k < 3; k++) { ctx.globalAlpha = 1 - k * 0.3; ctx.beginPath(); ctx.arc(x - dir * k * 8, 200, 30, -0.6 + (dir < 0 ? Math.PI : 0), 0.6 + (dir < 0 ? Math.PI : 0)); ctx.stroke(); } ctx.globalAlpha = 1; };
    if (u < 1) front(bx + 20 + u * L, 1, cssVar('--accent'));
    else if (u < 2) front(wx - (u - 1) * L, -1, '#2f8f5b');
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
function buildVibration() {
  const st = S.vibration;
  ui.pend = createSegmented({
    labelKey: 'ctl.pendulum', options: [{ value: 'away', labelKey: 'pend.away' }, { value: 'near', labelKey: 'pend.near' }], value: st.near ? 'near' : 'away',
    onChange: (v) => { st.near = v === 'near'; st.th = 0; st.om = 0; st.pushed = false; refresh(); },
  });
  controlsBody.append(
    btnRow(createButton({ labelKey: 'ctl.hit', variant: 'primary', onClick: () => {
      st.amp = 1; st.pushed = false;
      voice('fork', { freq: 440 })?.strike(0.22, 2.5);
      loop.start(); refresh();
    } })),
    btnRow(createButton({ labelKey: 'ctl.touch', variant: 'secondary', onClick: () => {
      st.amp = 0; st.touchAt = now; voices.fork?.setGain(0, 0.02); loop.start(); refresh();
    } })),
    ui.pend.root, ...soundControl(), resetBtn('vibration'));
  ui.dl = el('dl', { class: 'meas' });
  measuresBody.append(ui.dl);
}
function updateVibration() {
  const st = S.vibration;
  const vib = st.amp > 0.02;
  measRows(ui.dl, [
    [t('m.f'), qty(440, 0, 'Hz')],
    [t('m.vibrates'), yn(vib), vib ? 'good-text' : ''],
    [t('m.heard'), yn(vib)],
    [t('m.ball'), t(st.th > 0.02 ? 'ball.pushed' : 'ball.rest'), st.th > 0.02 ? 'good-text' : ''],
  ]);
}

/* ---------- Tab 2 ---------- */
function buildVacuum() {
  const st = S.vacuum;
  ui.bell = createSegmented({
    labelKey: 'ctl.bell', options: [{ value: 'off', labelKey: 'bell.off' }, { value: 'on', labelKey: 'bell.on' }], value: st.bellOn ? 'on' : 'off',
    onChange: (v) => {
      st.bellOn = v === 'on';
      if (st.bellOn) voice('bell', { freq: 880, harmonics: [1, 0, 0.6, 0, 0.4, 0, 0.3] }); else voices.bell?.setGain(0, 0.02);
      loop.start(); refresh();
    },
  });
  ui.pump = createSegmented({
    labelKey: 'ctl.pump', options: [{ value: 'off', labelKey: 'pump.off' }, { value: 'on', labelKey: 'pump.on' }], value: st.pumping ? 'on' : 'off',
    onChange: (v) => { st.pumping = v === 'on'; loop.start(); refresh(); },
  });
  controlsBody.append(ui.bell.root, ui.pump.root,
    btnRow(createButton({ labelKey: 'ctl.letAir', variant: 'secondary', onClick: () => { st.pumping = false; st.air = 1; refresh(); } })),
    ...soundControl(), resetBtn('vacuum'));
  ui.dl = el('dl', { class: 'meas' });
  measuresBody.append(ui.dl);
}
function updateVacuum() {
  const st = S.vacuum;
  ui.bell.set(st.bellOn ? 'on' : 'off'); ui.pump.set(st.pumping ? 'on' : 'off');
  const lvl = !st.bellOn ? 'lvl.none' : st.air > 0.6 ? 'lvl.loud' : st.air > 0.2 ? 'lvl.fainter' : st.air > 0.03 ? 'lvl.faint' : 'lvl.inaudible';
  measRows(ui.dl, [
    [t('m.air'), `${num(st.air * 100, st.air < 0.1 ? 1 : 0)} %`],
    [t('m.level'), t(lvl), lvl === 'lvl.inaudible' ? 'bad-text' : ''],
    [t('m.hammerMoves'), st.bellOn ? t('yes') : '—'],
  ]);
}

/* ---------- Tab 3 ---------- */
function rangeGain(f) { return f < 20 || f > 20000 ? 0 : 0.1 * Math.min(1, Math.sqrt(3000 / f)); }
function buildRange() {
  const st = S.range;
  ui.f = createSlider({ labelKey: 'ctl.freq', min: 0, max: 1000, step: 1, value: Math.round(fToPos(st.f)), unit: '', onInput: (p) => {
    st.f = niceF(posToF(p));
    if (st.on) { const v = voice('lfg', { freq: st.f }); v?.setFreq(Math.min(st.f, 20000)); v?.setGain(rangeGain(st.f)); }
    refresh();
  } });
  ui.on = createButton({ labelKey: st.on ? 'ctl.stopLFG' : 'ctl.play', variant: 'primary', onClick: () => {
    st.on = !st.on;
    const v = voice('lfg', { freq: Math.min(st.f, 20000) });
    if (st.on) { v?.setFreq(Math.min(st.f, 20000)); v?.setGain(rangeGain(st.f)); } else v?.setGain(0);
    loop.start(); buildTab('range');
  } });
  controlsBody.append(ui.f.root, btnRow(ui.on), ...soundControl(), hint('hint.range'), resetBtn('range'));
  ui.dl = el('dl', { class: 'meas' });
  measuresBody.append(ui.dl);
}
function updateRange() {
  const st = S.range;
  const out = ui.f.root.querySelector('output');
  if (out) out.textContent = qty(st.f, 0, 'Hz');
  const dom = st.f < 20 ? 'dom.infra' : st.f > 20000 ? 'dom.ultra' : 'dom.audible';
  measRows(ui.dl, [
    [t('m.freq'), qty(st.f, 0, 'Hz')],
    [t('m.domain'), t(dom), dom === 'dom.audible' ? 'good-text' : ''],
    [t('m.speaker'), st.on ? t('yes') : t('no')],
  ]);
}

/* ---------- Tab 4 ---------- */
function buildQualities() {
  const st = S.qualities;
  ui.q = createSegmented({
    labelKey: 'ctl.quality', options: ['pitch', 'loud', 'timbre'].map((v) => ({ value: v, labelKey: `q.${v}` })), value: st.q,
    onChange: (v) => { silence(); st.q = v; st.noteOn = false; buildTab('qualities'); },
  });
  controlsBody.append(ui.q.root);
  if (st.q === 'pitch') {
    const strike = (k) => { st.fork = k; st.forkAt = now; voice(`fork${k}`, { freq: k === 'A' ? 220 : 440 })?.strike(0.22, 1.5); loop.start(); refresh(); };
    controlsBody.append(btnRow(createButton({ labelKey: 'ctl.forkA', variant: 'primary', onClick: () => strike('A') })),
      btnRow(createButton({ labelKey: 'ctl.forkB', variant: 'primary', onClick: () => strike('B') })));
  } else if (st.q === 'loud') {
    ui.vol = createSlider({ labelKey: 'ctl.volume', min: 5, max: 100, step: 5, value: Math.round(st.vol * 100), unit: '%', onInput: (v) => {
      st.vol = v / 100; if (st.noteOn) voices.note?.setGain(0.25 * st.vol ** 1.5); refresh();
    } });
    ui.note = createButton({ labelKey: st.noteOn ? 'ctl.stopNote' : 'ctl.playNote', variant: 'primary', onClick: () => {
      st.noteOn = !st.noteOn;
      const v = voice('note', { freq: 440 });
      v?.setGain(st.noteOn ? 0.25 * st.vol ** 1.5 : 0);
      loop.start(); buildTab('qualities');
    } });
    controlsBody.append(btnRow(ui.note), ui.vol.root);
  } else {
    const play = (k) => {
      st.inst = k; st.instAt = now; st.played[k] = true;
      const v = voice(k, { freq: 440, harmonics: k === 'sax' ? SAX : PIANO });
      if (k === 'piano') v?.strike(0.2, 0.7);
      else { v?.setGain(0.14, 0.04); setTimeout(() => v?.setGain(0, 0.08), 1400); }
      loop.start(); refresh();
    };
    controlsBody.append(btnRow(createButton({ labelKey: 'ctl.sax', variant: 'primary', onClick: () => play('sax') })),
      btnRow(createButton({ labelKey: 'ctl.piano', variant: 'primary', onClick: () => play('piano') })));
  }
  controlsBody.append(...soundControl(), resetBtn('qualities'));
  ui.dl = el('dl', { class: 'meas' });
  measuresBody.append(ui.dl);
}
function updateQualities() {
  const st = S.qualities;
  ui.q.set(st.q);
  if (st.q === 'pitch') {
    const f = st.fork === 'A' ? 220 : st.fork === 'B' ? 440 : null;
    measRows(ui.dl, [
      [t('m.source'), f ? (st.fork === 'A' ? t('forkA') : t('forkB')) : t('src.none')],
      [t('m.pitch'), f ? t(f === 220 ? 'pitch.low' : 'pitch.high') : '—'],
      [t('m.T'), f ? qty(1000 / f, 2, 'ms') : '—'],
    ]);
  } else if (st.q === 'loud') {
    measRows(ui.dl, [
      [t('m.pitch'), st.noteOn ? `la3 · ${qty(440, 0, 'Hz')}` : '—'],
      [t('m.amp'), st.noteOn ? `${num(st.vol * 100, 0)} %` : '—'],
    ]);
  } else {
    measRows(ui.dl, [
      [t('m.pitch'), `la3 · ${qty(440, 0, 'Hz')}`],
      [t('m.timbre'), st.inst ? t(`timbre.${st.inst}`) : '—'],
    ]);
  }
}

/* ---------- Tab 5 ---------- */
let rowsSig = '';
function buildEcho() {
  const st = S.echo;
  ui.mode = createSegmented({
    labelKey: 'ctl.mode', options: [{ value: 'explore', labelKey: 'mode.explore' }, { value: 'find', labelKey: 'mode.find' }], value: st.mode,
    onChange: (v) => { st.mode = v; st.shoutAt = null; st.lastT = null; st.fb = null; buildTab('echo'); },
  });
  const shout = createButton({ labelKey: 'ctl.shout', variant: 'primary', onClick: () => {
    st.shoutAt = now; st.lastT = null; st.fb = null;
    const T = echoTime();
    noiseBurst({ duration: 0.28, gain: 0.35, freq: 800 });
    noiseBurst({ delay: T, duration: 0.28, gain: 0.14, freq: 800 });
    setTimeout(() => { if (st.shoutAt != null) { st.lastT = Math.round(T * 100) / 100; refresh(); } }, T * 1000 + 20);
    loop.start(); refresh();
  } });
  controlsBody.append(ui.mode.root);
  if (st.mode === 'explore') {
    ui.d = createSlider({ labelKey: 'ctl.dist', min: 5, max: 300, step: 1, value: st.d, unit: 'm', onInput: (v) => { st.d = v; st.shoutAt = null; st.lastT = null; refresh(); } });
    controlsBody.append(ui.d.root, btnRow(shout));
  } else {
    controlsBody.append(btnRow(shout,
      createButton({ labelKey: 'ctl.record', variant: 'secondary', onClick: () => {
        if (st.lastT == null) st.fb = { type: 'warn', key: 'fb.shoutFirst' };
        else { st.rows.push({ t: st.lastT, d: st.dHidden }); st.fb = null; }
        refresh();
      } }),
      createButton({ labelKey: 'ctl.newWall', variant: 'ghost', onClick: () => {
        let d; do { d = 17 * randInt(4, 24); } while (d === st.dHidden);
        st.dHidden = d; st.shoutAt = null; st.lastT = null; st.fb = null; refresh();
      } })));
  }
  controlsBody.append(...soundControl(), resetBtn('echo'));
  ui.dl = el('dl', { class: 'meas' });
  ui.table = el('table', { class: 'data' });
  ui.clear = el('div', { class: 'btn-row', style: 'margin-top:8px' }, [createButton({ labelKey: 'ctl.clearTable', variant: 'ghost', onClick: () => { st.rows = []; st.fb = null; refresh(); } })]);
  ui.status = statusBox();
  measuresBody.append(ui.dl, ui.table, ui.clear, ui.status);
}
function updateEcho() {
  const st = S.echo;
  ui.mode.set(st.mode);
  const T = echoTime();
  measRows(ui.dl, [
    [t('m.d'), st.mode === 'find' ? t('dHidden') : qty(st.d, 0, 'm')],
    [t('m.t'), st.lastT != null ? qty(st.lastT, 2, 's') : '—'],
    [t('m.echo'), st.lastT != null ? t(T >= 0.1 ? 'echo.yes' : 'echo.mixed') : '—', st.lastT != null && T < 0.1 ? 'bad-text' : ''],
  ]);
  const show = st.mode === 'find' && st.rows.length > 0;
  const sig = calcSig(st.rows) + st.rows.length + t('col.t');
  if (show && sig !== rowsSig) {
    const head = el('tr', {}, [el('th', {}, t('col.t')), el('th', {}, t('col.d'))]);
    const body = st.rows.map((r) => el('tr', {}, [el('td', {}, num(r.t, 2)),
      calcCell(r, 'd', { expected: (V_SOUND * r.t) / 2, decimals: 0, onCheck: (res) => {
        st.fb = res === 'invalid' ? { type: 'warn', key: 'calcInvalid' } : res === 'wrong' ? { type: 'bad', key: 'fb.dWrong' } : { type: 'good', key: 'fb.dOk' };
        refresh();
      } })]));
    ui.table.replaceChildren(el('thead', {}, head), el('tbody', {}, body));
    rowsSig = calcSig(st.rows) + st.rows.length + t('col.t');
  }
  ui.table.hidden = !show;
  ui.clear.hidden = !show;
  showStatus(ui.status, st.fb);
}

/* ---------- Tab switching ---------- */
const TABS = ['vibration', 'vacuum', 'range', 'qualities', 'echo'];
function buildTab(id) {
  controlsBody.replaceChildren();
  measuresBody.replaceChildren();
  ui = {};
  rowsSig = '';
  if (id === 'vibration') buildVibration();
  else if (id === 'vacuum') buildVacuum();
  else if (id === 'range') buildRange();
  else if (id === 'qualities') buildQualities();
  else buildEcho();
  loop.start();
  refresh();
}
let lastTab = null;
function onTab(id) {
  if (lastTab && lastTab !== id) { silence(); S[lastTab] = { ...S[lastTab], ...pauseState(lastTab) }; }
  lastTab = id;
  buildTab(id);
}
// what must stop when the student leaves a tab (the sounds are stopped)
function pauseState(id) {
  if (id === 'vacuum') return { bellOn: false };
  if (id === 'range') return { on: false };
  if (id === 'qualities') return { noteOn: false };
  if (id === 'vibration') return { amp: 0 };
  return {};
}
function updateMeasures() {
  if (!shell || !ui.dl) return;
  const tab = shell.tab;
  if (tab === 'vibration') updateVibration();
  else if (tab === 'vacuum') updateVacuum();
  else if (tab === 'range') updateRange();
  else if (tab === 'qualities') updateQualities();
  else updateEcho();
}
function refresh() { updateMeasures(); requestDraw(); }
function resetTab(id) { silence(); S[id] = initialState()[id]; buildTab(id); }

onLangChange(() => { if (shell) buildTab(shell.tab); });

shell = initSim({
  strings,
  tabs: TABS.map((id) => ({ id, labelKey: `tab.${id}` })),
  initialTab: 'vibration',
  onTab,
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, echoTime };
