// Sec 2 S — Chapter 4: reception of sound (induction, microphone, ear, audio frequencies, sonar). Real sounds via shared/audio.js.
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num, qty } from '../../../shared/format.js';
import { createButton, createSegmented, createSlider, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, font, arrow } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { label } from '../../../shared/figures.js';
import { calcCell, calcSig, calcDone } from '../../../shared/calc-cell.js';
import { drawScope, drawLFG, DIV_X, vbText } from '../../../shared/oscilloscope.js';
import { drawLead } from '../../../shared/circuit-draw.js';
import { drawSpeaker, drawSoundArcs } from '../../../shared/sound-draw.js';
import { audioAvailable, createVoice, setMuted, isMuted, setVolume, getVolume, stopAll } from '../../../shared/audio.js';

const TAU = 2 * Math.PI;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const frac = (x) => x - Math.floor(x);
const playable = (f) => f >= 100 && f <= 15000;

/* ================================================================
   Model
   ================================================================ */
// Induction (Exp. 4.1): point-pole magnet 15 cm long, coil of radius 4 cm. Flux "bump" vs relative position (cm).
const PXCM = 8, MAG_L = 15, COIL_A = 4, K_I = 5; // K_I: µA per (unit of flux per second), ≈ 60 µA at 50 cm/s
const h = (u) => u / Math.sqrt(u * u + COIL_A * COIL_A);
const fluxBump = (rel) => h(rel + MAG_L / 2) - h(rel - MAG_L / 2);
const R_CIRCUIT = 100; // Ω, u = R i
const IND_Y = 86, COIL_X0 = 300; // coil centre (px) at the start
const MAG_X0 = COIL_X0 + 25 * PXCM; // magnet centre 25 cm to the right
const SPEED = { slow: 15, fast: 60 }; // cm/s
const HIST_N = 200, HIST_DT = 0.01; // 2 s of history at 100 Hz

// Microphone
const MIC_FREQS = [250, 500, 1000, 2000];
const MIC_SH = [2, 1, 0.5, 0.2, 0.1]; // ms/div
const MIC_SV = 5; // mV/div
const UMIC_MAX = 10; // mV at full loudness, 20 cm away (chosen)

// Audible
const F_LOG_MIN = 0, F_LOG_MAX = Math.log10(200000);
const BANDS = [['infra', 1, 20], ['deep', 20, 500], ['medium', 500, 3000], ['sharp', 3000, 20000], ['ultra', 20000, 200000]];
const HEARS = [['human', 20, 20000], ['dog', 20, 40000], ['bat', 20, 100000], ['dolphin', 20, 200000]];

// Sonar
const V_WATER = 1500, SONAR_SLOW = 10;
const SURF = 72, PXM = 0.8; // sea surface y, px per metre
const bottomDepth = (x) => 300 - 90 * Math.exp(-(((x - 470) / 55) ** 2)) + 22 * Math.sin(x / 47);
const SHOAL = { x1: 120, x2: 215, top: 84, bot: 112 };
const SUB = { x1: 300, x2: 410, top: 187.5, bot: 205 };
function sonarTarget(x) {
  if (x >= SHOAL.x1 && x <= SHOAL.x2) return { kind: 'shoal', d: SHOAL.top };
  if (x >= SUB.x1 && x <= SUB.x2) return { kind: 'submarine', d: SUB.top };
  return { kind: 'seaBottom', d: Math.round(bottomDepth(x) * 10) / 10 };
}

let now = 0;
function initialState(tab) {
  switch (tab) {
    case 'induction': return { moved: 'magnet', pol: 1, speed: 'fast', mx: MAG_X0, cx: COIL_X0, target: null, flux: null, i: 0, hist: new Float32Array(HIST_N), hAcc: 0, lastRel: 25, motion: 0 };
    case 'mic': return { view: 'scope', fIdx: 2, amp: 1, sh: 0.5, gain: 50, ph: 0, rows: [], fb: null };
    case 'ear': return { part: 'all', playing: true, ph: 0 };
    case 'audible': return { lf: Math.log10(1000), tone: false };
    default: return { x: 260, ping: null, echoT: null, target: null, rows: [], fb: null };
  }
}
const TABS = ['induction', 'mic', 'ear', 'audible', 'sonar'];
let S = Object.fromEntries(TABS.map((k) => [k, initialState(k)]));
const relCm = (st) => (st.mx - st.cx) / PXCM;
const micF = (st) => MIC_FREQS[st.fIdx];
const audF = (st) => 10 ** st.lf;

/* ================================================================
   Sound
   ================================================================ */
setMuted(true); // off by default (owner, 9 Nov 2026)
const voices = {};
function voice(key, opts) { if (isMuted()) return null; if (!voices[key]) voices[key] = createVoice(opts); return voices[key]; }
function stopVoices() { stopAll(); for (const k of Object.keys(voices)) delete voices[k]; for (const k of Object.keys(lastGain)) delete lastGain[k]; }
const lastGain = {};
function setG(key, v, g) { if (!v || (lastGain[key] != null && Math.abs(lastGain[key] - g) < 0.002)) return; lastGain[key] = g; v.setGain(g, 0.03); }
function updateAudio() {
  if (!shell || isMuted()) return;
  if (shell.tab === 'mic') {
    const st = S.mic, v = voice('mic', { freq: micF(st) });
    if (v) { v.setFreq(micF(st)); setG('mic', v, 0.25 * st.amp); }
  } else if (shell.tab === 'audible') {
    const st = S.audible, f = audF(st), v = voice('tone', { freq: clamp(f, 100, 15000) });
    if (v) { v.setFreq(clamp(f, 100, 15000)); setG('tone', v, st.tone && playable(f) ? 0.22 : 0); }
  }
}

/* ================================================================
   Canvas and loop
   ================================================================ */
const HEIGHTS = { induction: 400, mic: 474, ear: 380, audible: 340, sonar: 430 };
let shell;
let drawQueued = false;
const canvas = document.getElementById('stage');
canvas.style.touchAction = 'none';
const view = setupCanvas(canvas, { width: 600, height: 400, maxHeightVh: () => (window.innerWidth < 880 ? 50 : 74), onResize: () => requestDraw() });
function requestDraw() { if (drawQueued) return; drawQueued = true; requestAnimationFrame(() => { drawQueued = false; draw(); }); }
onThemeChange(() => requestDraw());

const loop = createLoop({
  step(dt) {
    now += dt;
    if (!shell) return false;
    const tab = shell.tab;
    if (tab === 'induction') stepInduction(S.induction, dt);
    else if (tab === 'mic') S.mic.ph += dt;
    else if (tab === 'ear') { if (S.ear.playing) S.ear.ph += dt; }
    else if (tab === 'sonar') stepSonar(S.sonar);
    updateAudio();
    return true;
  },
  render() { draw(); updateMeasures(); },
});

function stepInduction(st, dt) {
  // automatic movement towards the target
  if (st.target != null && !dragging) {
    const key = st.moved === 'magnet' ? 'mx' : 'cx';
    const v = SPEED[st.speed] * PXCM * dt;
    const d = st.target - st[key];
    if (Math.abs(d) <= v) { st[key] = st.target; st.target = null; } else st[key] += Math.sign(d) * v;
  }
  const rel = relCm(st);
  const flux = st.pol * fluxBump(rel);
  if (st.flux == null) st.flux = flux;
  const iRaw = (K_I * (flux - st.flux)) / dt; // µA
  st.flux = flux;
  st.i += (iRaw - st.i) * Math.min(1, dt / 0.04); // smoothing (pointer moves come in steps)
  if (Math.abs(st.i) < 0.05) st.i = 0;
  st.motion = Math.abs(rel) < Math.abs(st.lastRel) - 1e-6 ? 1 : Math.abs(rel) > Math.abs(st.lastRel) + 1e-6 ? -1 : 0;
  st.lastRel = rel;
  st.hAcc += dt;
  while (st.hAcc >= HIST_DT) { st.hAcc -= HIST_DT; st.hist.copyWithin(0, 1); st.hist[HIST_N - 1] = st.i; }
}
function stepSonar(st) {
  if (st.ping == null) return;
  const ts = (now - st.ping) / SONAR_SLOW;
  if (st.echoT == null && ts >= (2 * st.target.d) / V_WATER) st.echoT = (2000 * st.target.d) / V_WATER; // ms
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
  ({ induction: drawInduction, mic: drawMic, ear: drawEar, audible: drawAudible, sonar: drawSonar })[tab](ctx, S[tab]);
}
function note(ctx, s, x, y, align = 'center', size = 11, color = cssVar('--muted'), weight = 700) { label(ctx, s, x, y, { size, weight, color, align, halo: color !== '#fff' }); }

/* ---------- induction ---------- */
function drawCoilHalf(ctx, cx, y, front) {
  const n = 9, w = 100, ry = 34;
  ctx.strokeStyle = cssVar('--copper'); ctx.lineWidth = 3;
  for (let k = 0; k < n; k++) {
    const x = cx - w / 2 + (k * w) / (n - 1);
    ctx.beginPath();
    if (front) ctx.ellipse(x, y, 8, ry, 0, -Math.PI / 2, Math.PI / 2); else ctx.ellipse(x, y, 8, ry, 0, Math.PI / 2, (3 * Math.PI) / 2);
    ctx.globalAlpha = front ? 1 : 0.45; ctx.stroke(); ctx.globalAlpha = 1;
  }
}
function drawBarMagnet(ctx, cxm, y, pol) {
  const L = MAG_L * PXCM, H = 26;
  const leftN = pol > 0; // the left end faces the coil
  ctx.fillStyle = leftN ? '#d6342c' : '#2f74c8'; ctx.fillRect(cxm - L / 2, y - H / 2, L / 2, H);
  ctx.fillStyle = leftN ? '#2f74c8' : '#d6342c'; ctx.fillRect(cxm, y - H / 2, L / 2, H);
  label(ctx, leftN ? 'N' : 'S', cxm - L / 2 + 14, y, { size: 14, weight: 800, color: '#fff', halo: false });
  label(ctx, leftN ? 'S' : 'N', cxm + L / 2 - 14, y, { size: 14, weight: 800, color: '#fff', halo: false });
}
function drawMicroammeter(ctx, x, y, r, i) {
  ctx.fillStyle = cssVar('--device'); roundRect(ctx, x - r - 14, y - r - 14, 2 * r + 28, r + 58, 10); ctx.fill();
  ctx.fillStyle = '#fbf8ef';
  ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r, -Math.PI / 2 - 1.1, -Math.PI / 2 + 1.1); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#2b2f36'; ctx.fillStyle = '#2b2f36'; ctx.lineWidth = 1.2; ctx.font = font(10, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let v = -100; v <= 100; v += 10) {
    const a = -Math.PI / 2 + (v / 100) * 1.0, big = v % 50 === 0;
    ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * (r - (big ? 12 : 7)), y + Math.sin(a) * (r - (big ? 12 : 7))); ctx.lineTo(x + Math.cos(a) * (r - 2), y + Math.sin(a) * (r - 2)); ctx.stroke();
    if (big) ctx.fillText(String(v), x + Math.cos(a) * (r - 22), y + Math.sin(a) * (r - 22));
  }
  const a = -Math.PI / 2 + clamp(i / 100, -1.08, 1.08);
  ctx.strokeStyle = cssVar('--accent'); ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * (r - 6), y + Math.sin(a) * (r - 6)); ctx.stroke();
  ctx.fillStyle = '#2b2f36'; ctx.beginPath(); ctx.arc(x, y, 4, 0, TAU); ctx.fill();
  label(ctx, 'µA', x, y + 18, { size: 12, weight: 800, color: cssVar('--text-on-meter'), halo: false });
  label(ctx, t('microammeter'), x, y + 34, { size: 10, weight: 700, color: cssVar('--text-on-meter'), halo: false });
  return [[x - 22, y + 40], [x + 22, y + 40]];
}
function drawInduction(ctx, st) {
  const y = IND_Y;
  // rail / track
  ctx.strokeStyle = cssVar('--border'); ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
  ctx.beginPath(); ctx.moveTo(30, y + 46); ctx.lineTo(580, y + 46); ctx.stroke(); ctx.setLineDash([]);
  drawCoilHalf(ctx, st.cx, y, false);
  drawBarMagnet(ctx, st.mx, y, st.pol);
  drawCoilHalf(ctx, st.cx, y, true);
  note(ctx, t('coil'), st.cx, y - 50);
  note(ctx, t('magnet'), st.mx, y - 26);
  // coil leads
  const e1 = [st.cx - 50, y + 34], e2 = [st.cx + 50, y + 34];
  const [a1, a2] = drawMicroammeter(ctx, 120, 280, 72, st.i);
  // oscilloscope (roll mode: last 2 s)
  const sv = 2; // mV/div
  const g = drawScope(ctx, {
    x: 330, y: 150, d: 17, steady: true, spotX: 0, len: DIV_X,
    curve: (xd) => { const k = Math.round((xd / DIV_X) * (HIST_N - 1)); return ((st.hist[clamp(k, 0, HIST_N - 1)] * R_CIRCUIT) / 1000) / sv; },
    svLabel: `${num(sv, 0)} mV/div`, vbLabel: vbText(0.2), svName: 'Sv', vbName: 'Sh',
  });
  drawLead(ctx, e1, a1, cssVar('--accent'), [e1[0] - 60, 210]);
  drawLead(ctx, a2, g.A, cssVar('--wire'), [300, 420]);
  drawLead(ctx, e2, g.M, cssVar('--lead-black'), [650, 240]);
}

/* ---------- microphone ---------- */
function drawMicCut(ctx, x, y, disp) {
  // grid, filter, membrane + coil, magnet (cut view), facing left
  ctx.strokeStyle = cssVar('--muted'); ctx.lineWidth = 2; ctx.setLineDash([3, 4]);
  ctx.beginPath(); ctx.moveTo(x, y - 60); ctx.lineTo(x, y + 60); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(160,160,160,0.35)'; ctx.fillRect(x + 8, y - 56, 8, 112);
  ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x + 26, y - 52); ctx.quadraticCurveTo(x + 26 + 2 * disp, y, x + 26, y + 52); ctx.stroke();
  ctx.fillStyle = '#c8b28a'; ctx.fillRect(x + 26 + disp, y - 20, 34, 5); ctx.fillRect(x + 26 + disp, y + 15, 34, 5);
  ctx.fillStyle = cssVar('--copper');
  for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(x + 38 + disp + k * 8, y - 25, 3.5, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(x + 38 + disp + k * 8, y + 25, 3.5, 0, TAU); ctx.fill(); }
  ctx.fillStyle = '#d6342c'; ctx.fillRect(x + 64, y - 58, 52, 28); ctx.fillRect(x + 64, y + 30, 52, 28);
  ctx.fillStyle = '#2f74c8'; ctx.fillRect(x + 50, y - 12, 66, 24);
  ctx.fillStyle = '#3a3f48'; ctx.fillRect(x + 116, y - 58, 10, 116);
  ctx.strokeStyle = cssVar('--border'); ctx.lineWidth = 2;
  roundRect(ctx, x - 6, y - 66, 140, 132, 10); ctx.stroke();
  return [x + 130, y];
}
function drawMic(ctx, st) {
  const f = micF(st);
  const vis = Math.sin(TAU * st.ph); // slow motion: about 1 vibration per second
  const umic = UMIC_MAX * st.amp;
  if (st.view === 'scope') {
    const [sx, sy] = drawSpeaker(ctx, { x: 70, y: 100, size: 1.1, dir: 1, cone: 2 * st.amp * vis });
    drawSoundArcs(ctx, { x: sx + 4, y: sy, amp: st.amp, phase: frac(st.ph), n: 5, step: 34, spread: 0.45 });
    note(ctx, t('speakerName'), 70, 166);
    const mx = 330;
    const [ox, oy] = drawMicCut(ctx, mx, 100, 4 * st.amp * Math.sin(TAU * (st.ph - 0.3)));
    note(ctx, t('grid'), mx - 2, 22, 'center', 10);
    note(ctx, t('filter'), mx + 30, 182, 'center', 10);
    note(ctx, t('membrane'), mx + 22, 32, 'left', 10);
    note(ctx, t('micCoil'), mx + 60, 196, 'center', 10);
    note(ctx, t('pole'), mx + 128, 22, 'center', 10);
    // distance 20 cm
    ctx.strokeStyle = cssVar('--muted'); ctx.fillStyle = cssVar('--muted'); ctx.lineWidth = 1.5;
    arrow(ctx, 200, 172, sx + 4, 172, 6); arrow(ctx, 200, 172, mx - 6, 172, 6);
    note(ctx, t('dist20'), 200, 160);
    const sh = st.sh / 1000;
    const g = drawScope(ctx, { x: 352, y: 206, d: 18, steady: true, spotX: 0, len: DIV_X, curve: (xd) => (umic * Math.sin(TAU * f * xd * sh)) / MIC_SV, svLabel: `${MIC_SV} mV/div`, vbLabel: vbText(sh), svName: 'Sv', vbName: 'Sh' });
    drawLead(ctx, [ox, oy - 8], g.A, cssVar('--accent'), [590, 300]);
    drawLead(ctx, [ox, oy + 8], g.M, cssVar('--lead-black'), [600, 340]);
    const l = drawLFG(ctx, 30, 250, 190, { name: t('lfg'), display: qty(f, 0, 'Hz'), shape: 'sine' });
    drawLead(ctx, l.out1, [sx - 40, sy - 6], cssVar('--accent'), [20, 220]);
    drawLead(ctx, l.out2, [sx - 40, sy + 6], cssVar('--lead-black'), [80, 220]);
  } else {
    // chain: sound → microphone (receiver) → amplifier → loudspeaker (emitter) → sound
    const y = 170;
    const [sx, sy] = drawSpeaker(ctx, { x: 60, y, size: 0.9, dir: 1, cone: 2 * st.amp * vis });
    drawSoundArcs(ctx, { x: sx + 2, y: sy, amp: st.amp, phase: frac(st.ph), n: 3, step: 18, spread: 0.45 });
    const [ox] = drawMicCut(ctx, 150, y, 3 * st.amp * Math.sin(TAU * (st.ph - 0.3)));
    note(ctx, `${t('micName')} (${t('receiver')})`, 214, y - 82);
    ctx.fillStyle = cssVar('--device'); roundRect(ctx, 330, y - 34, 100, 68, 8); ctx.fill();
    note(ctx, t('amplifier'), 380, y - 12, 'center', 12, cssVar('--text-on-meter'));
    note(ctx, `× ${st.gain}`, 380, y + 12, 'center', 13, cssVar('--text-on-meter'));
    ctx.strokeStyle = cssVar('--wire'); ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(ox, y); ctx.lineTo(330, y); ctx.moveTo(430, y); ctx.lineTo(470, y); ctx.stroke();
    const gainK = st.gain / 200;
    const [ex, ey] = drawSpeaker(ctx, { x: 500, y, size: 0.9, dir: 1, cone: 2.5 * gainK * st.amp * Math.sin(TAU * (st.ph - 0.5)) });
    drawSoundArcs(ctx, { x: ex + 2, y: ey, amp: Math.min(1, gainK * st.amp * 1.5), phase: frac(st.ph), n: 3, step: 18, spread: 0.45 });
    note(ctx, `${t('speakerName')} (${t('emitter')})`, 520, y - 82);
    // small sine sketches showing the amplitude before and after the amplifier
    const sketch = (x0, w, a, col) => { ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); for (let k = 0; k <= 40; k++) { const u = k / 40; const yy = y + 80 - a * Math.sin(TAU * 2 * u + TAU * st.ph * 0.3); if (k) ctx.lineTo(x0 + u * w, yy); else ctx.moveTo(x0, yy); } ctx.stroke(); };
    sketch(270, 60, 4, cssVar('--primary'));
    sketch(440, 60, 4 + 26 * gainK, cssVar('--accent'));
    note(ctx, qty(umic, 0, 'mV'), 300, y + 120, 'center', 12, cssVar('--primary'));
    const uout = (umic * st.gain) / 1000;
    note(ctx, qty(uout, uout < 1 ? 2 : 1, 'V'), 470, y + 120, 'center', 12, cssVar('--accent'));
  }
  note(ctx, t('slowMic'), 14, HEIGHTS.mic - 14, 'left', 10);
}

/* ---------- ear ---------- */
const EAR_PARTS = { ext: [20, 232], mid: [232, 345], int: [345, 590] };
function drawEar(ctx, st) {
  const y = 180;
  const play = st.playing;
  const vib = play ? Math.sin(st.ph * 9) : 0;
  // regions and their labels
  for (const [k, [x1, x2]] of Object.entries(EAR_PARTS)) {
    const on = st.part === 'all' || st.part === k;
    ctx.fillStyle = on ? (k === 'ext' ? 'rgba(242,170,110,0.16)' : k === 'mid' ? 'rgba(120,170,230,0.16)' : 'rgba(140,200,140,0.16)') : 'rgba(0,0,0,0)';
    ctx.fillRect(x1, 34, x2 - x1, HEIGHTS.ear - 60);
    ctx.strokeStyle = cssVar('--border'); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x1, 40); ctx.lineTo(x2, 40); ctx.stroke();
    note(ctx, t(`lbl.${k}`), (x1 + x2) / 2, 26, 'center', 12, on ? cssVar('--text') : cssVar('--muted'), 800);
  }
  ctx.globalAlpha = 1;
  const dim = (k) => (st.part === 'all' || st.part === k ? 1 : 0.3);
  // external ear: auricle and canal
  ctx.globalAlpha = dim('ext');
  ctx.fillStyle = '#e8b896'; ctx.strokeStyle = '#b77d5c'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(110, y - 30); ctx.bezierCurveTo(40, y - 150, -10, y - 30, 40, y + 40); ctx.bezierCurveTo(60, y + 90, 100, y + 80, 110, y + 30); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#f2d4bd'; ctx.fillRect(105, y - 18, 127, 36);
  ctx.strokeStyle = '#b77d5c'; ctx.beginPath(); ctx.moveTo(105, y - 18); ctx.lineTo(232, y - 18); ctx.moveTo(105, y + 18); ctx.lineTo(232, y + 18); ctx.stroke();
  if (play) drawSoundArcs(ctx, { x: 60 + ((st.ph * 50) % 60), y, amp: 1, phase: frac(st.ph * 1.2), n: 4, step: 18, spread: 0.6, color: cssVar('--primary') });
  note(ctx, t('auricle'), 50, y + 100); note(ctx, t('canal'), 168, y + 34);
  if (play) note(ctx, t('soundIn'), 70, 60, 'center', 11, cssVar('--primary'));
  // middle ear: eardrum, ossicles, Eustachian tube
  ctx.globalAlpha = dim('mid');
  ctx.fillStyle = 'rgba(200,220,240,0.6)'; roundRect(ctx, 236, y - 60, 104, 120, 16); ctx.fill();
  ctx.strokeStyle = '#8a5a3c'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(232 + 3 * vib, y - 30); ctx.quadraticCurveTo(240 + 6 * vib, y, 232 + 3 * vib, y + 30); ctx.stroke();
  ctx.fillStyle = '#efe6d2'; ctx.strokeStyle = '#a8977a'; ctx.lineWidth = 1.5;
  const ox = 2 * vib;
  ctx.beginPath(); ctx.ellipse(254 + ox, y - 14, 18, 7, 0.6, 0, TAU); ctx.fill(); ctx.stroke(); // hammer
  ctx.beginPath(); ctx.ellipse(284 + ox, y - 18, 14, 10, -0.2, 0, TAU); ctx.fill(); ctx.stroke(); // anvil
  ctx.beginPath(); ctx.moveTo(296 + ox, y - 10); ctx.lineTo(328 + ox, y - 4); ctx.lineTo(328 + ox, y + 8); ctx.lineTo(300 + ox, y); ctx.closePath(); ctx.fill(); ctx.stroke(); // stirrup
  ctx.fillStyle = 'rgba(200,220,240,0.6)'; ctx.beginPath(); ctx.moveTo(300, y + 58); ctx.lineTo(320, y + 58); ctx.lineTo(282, y + 150); ctx.lineTo(262, y + 150); ctx.closePath(); ctx.fill();
  note(ctx, t('eardrum'), 232, y + 74); note(ctx, t('hammer'), 248, y - 76, 'center', 10); note(ctx, t('anvil'), 288, y - 46, 'center', 10); note(ctx, t('stirrup'), 318, y + 26, 'center', 10);
  note(ctx, t('eustachian'), 300, y + 166, 'center', 10);
  // internal ear: oval and round windows, cochlea, nerve
  ctx.globalAlpha = dim('int');
  ctx.fillStyle = '#c9a77e'; ctx.beginPath(); ctx.ellipse(343, y + 2, 4, 9, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(343, y + 36, 3, 7, 0, 0, TAU); ctx.fill();
  note(ctx, t('oval'), 372, y - 34, 'center', 10); note(ctx, t('round'), 368, y + 56, 'center', 10);
  const cx = 430, cy = y + 6;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#d9a5a0'; ctx.lineWidth = 16;
  ctx.beginPath();
  for (let k = 0; k <= 140; k++) { const a = Math.PI + (k / 140) * 4.6 * Math.PI / 1.0; const r = 58 - (k / 140) * 44; const xx = cx + Math.cos(a) * r, yy = cy + Math.sin(a) * r; if (k) ctx.lineTo(xx, yy); else ctx.moveTo(347, y + 2); }
  ctx.stroke();
  if (play) {
    // pressure vibrations travelling in the liquid of the cochlea
    ctx.fillStyle = cssVar('--primary');
    for (let k = 0; k < 6; k++) {
      const u = frac(st.ph * 0.35 + k / 6), a = Math.PI + u * 4.6 * Math.PI, r = 58 - u * 44;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 3, 0, TAU); ctx.fill();
    }
  }
  ctx.lineCap = 'butt';
  note(ctx, t('cochlea'), cx, cy + 82);
  ctx.strokeStyle = '#e3c25b'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(cx + 10, cy); ctx.bezierCurveTo(500, cy - 10, 520, cy - 40, 585, cy - 50); ctx.stroke();
  if (play) {
    ctx.fillStyle = cssVar('--accent');
    for (let k = 0; k < 3; k++) { const u = frac(st.ph * 0.6 + k / 3); ctx.beginPath(); ctx.arc(cx + 10 + u * 160, cy - 50 * u * u, 4, 0, TAU); ctx.fill(); }
  }
  note(ctx, t('nerve'), 530, cy - 66); note(ctx, t('toBrain'), 560, cy - 22, 'center', 10, cssVar('--accent'));
  ctx.globalAlpha = 1;
}

/* ---------- audible ---------- */
const AX0 = 40, AX1 = 570;
const fx = (f) => AX0 + ((Math.log10(f) - F_LOG_MIN) / (F_LOG_MAX - F_LOG_MIN)) * (AX1 - AX0);
const BAND_COL = { infra: '#7a8aa6', deep: '#3d7fd1', medium: '#2ea36b', sharp: '#e0a21b', ultra: '#9a6cc9' };
function drawAudible(ctx, st) {
  const f = audF(st);
  const y0 = 70, hgt = 46;
  for (const [k, a, b] of BANDS) {
    ctx.fillStyle = BAND_COL[k]; ctx.globalAlpha = 0.85;
    ctx.fillRect(fx(a), y0, fx(b) - fx(a), hgt); ctx.globalAlpha = 1;
    label(ctx, t(k), (fx(a) + fx(b)) / 2, y0 + hgt / 2, { size: 12, weight: 800, color: '#fff', halo: false });
  }
  // audio range bracket
  ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(fx(20), y0 - 8); ctx.lineTo(fx(20), y0 - 16); ctx.lineTo(fx(20000), y0 - 16); ctx.lineTo(fx(20000), y0 - 8); ctx.stroke();
  note(ctx, t('audioRange'), (fx(20) + fx(20000)) / 2, y0 - 28, 'center', 11, cssVar('--text'));
  // log axis
  ctx.strokeStyle = cssVar('--muted'); ctx.fillStyle = cssVar('--muted'); ctx.lineWidth = 1; ctx.font = font(10, 600); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const ticks = [1, 10, 20, 100, 500, 1000, 3000, 10000, 20000, 100000, 200000];
  for (const v of ticks) {
    const x = fx(v);
    ctx.beginPath(); ctx.moveTo(x, y0 + hgt); ctx.lineTo(x, y0 + hgt + 6); ctx.stroke();
    ctx.fillText(v >= 1000 ? `${num(v / 1000, 0)} k` : num(v, 0), x, y0 + hgt + 8);
  }
  note(ctx, 'f (Hz)', AX1 + 4, y0 + hgt + 30, 'right', 11, cssVar('--text'));
  // who hears what
  let yy = 170;
  for (const [k, a, b] of HEARS) {
    ctx.fillStyle = cssVar('--border'); ctx.fillRect(fx(1), yy - 8, AX1 - fx(1), 16);
    const g = ctx.createLinearGradient(fx(a) - 30, 0, fx(a) + 20, 0);
    g.addColorStop(0, 'rgba(46,163,107,0)'); g.addColorStop(1, 'rgba(46,163,107,0.85)');
    ctx.fillStyle = k === 'human' ? 'rgba(46,163,107,0.85)' : g;
    ctx.fillRect(k === 'human' ? fx(a) : fx(a) - 30, yy - 8, fx(b) - (k === 'human' ? fx(a) : fx(a) - 30), 16);
    label(ctx, t(k), fx(1) + 4, yy, { size: 12, weight: 800, align: 'left' });
    if (k !== 'human') label(ctx, t('upTo', { f: `${num(b / 1000, 0)} kHz` }), fx(b) - 6, yy, { size: 10, weight: 700, color: '#fff', halo: false, align: 'right' });
    yy += 34;
  }
  // marker
  const x = fx(f);
  ctx.strokeStyle = cssVar('--accent'); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x, y0 - 4); ctx.lineTo(x, yy - 18); ctx.stroke();
  ctx.fillStyle = cssVar('--accent'); ctx.beginPath(); ctx.moveTo(x, y0 - 2); ctx.lineTo(x - 7, y0 - 12); ctx.lineTo(x + 7, y0 - 12); ctx.fill();
  label(ctx, fText(f), clamp(x, 60, 540), yy - 4, { size: 14, weight: 800, color: cssVar('--accent') });
  if (st.tone && !playable(f)) note(ctx, t('tone.notPlayed'), 300, HEIGHTS.audible - 16, 'center', 11, cssVar('--accent'));
}
function fText(f) {
  if (f >= 10000) return qty(f / 1000, f >= 100000 ? 0 : 1, 'kHz');
  if (f >= 100) return qty(Math.round(f / 10) * 10, 0, 'Hz');
  return qty(f, f < 10 ? 1 : 0, 'Hz');
}
function kindOf(f) { return f < 20 ? 'infra' : f < 500 ? 'deep' : f < 3000 ? 'medium' : f <= 20000 ? 'sharp' : 'ultra'; }

/* ---------- sonar ---------- */
const SY = (d) => SURF + d * PXM;
function drawSonar(ctx, st) {
  // sky, sea, bottom
  ctx.fillStyle = cssVar('--sky'); ctx.fillRect(0, 0, 600, SURF);
  const g = ctx.createLinearGradient(0, SURF, 0, SY(360));
  g.addColorStop(0, '#3d8ad6'); g.addColorStop(1, '#0f3b6b');
  ctx.fillStyle = g; ctx.fillRect(0, SURF, 600, SY(360) - SURF);
  ctx.fillStyle = '#b5946a';
  ctx.beginPath(); ctx.moveTo(0, HEIGHTS.sonar - 50);
  for (let x = 0; x <= 600; x += 6) ctx.lineTo(x, SY(bottomDepth(x)));
  ctx.lineTo(600, HEIGHTS.sonar - 50); ctx.closePath(); ctx.fill();
  note(ctx, t('seaBottom'), 560, SY(bottomDepth(560)) + 16, 'center', 11, '#fff');
  // shoal and submarine
  ctx.fillStyle = 'rgba(230,240,250,0.85)';
  for (let k = 0; k < 26; k++) { const xx = SHOAL.x1 + 6 + ((k * 37) % (SHOAL.x2 - SHOAL.x1 - 12)), yy = SY(SHOAL.top + 4 + ((k * 13) % (SHOAL.bot - SHOAL.top - 6))); ctx.beginPath(); ctx.ellipse(xx, yy, 5, 2.4, 0, 0, TAU); ctx.fill(); }
  note(ctx, t('shoal'), (SHOAL.x1 + SHOAL.x2) / 2, SY(SHOAL.bot) + 12, 'center', 10, '#fff');
  ctx.fillStyle = '#39424e';
  ctx.beginPath(); ctx.ellipse((SUB.x1 + SUB.x2) / 2, SY((SUB.top + SUB.bot) / 2) + 2, (SUB.x2 - SUB.x1) / 2, (SY(SUB.bot) - SY(SUB.top)) / 2 + 2, 0, 0, TAU); ctx.fill();
  ctx.fillRect((SUB.x1 + SUB.x2) / 2 - 8, SY(SUB.top) - 8, 18, 10);
  note(ctx, t('submarine'), (SUB.x1 + SUB.x2) / 2, SY(SUB.bot) + 14, 'center', 10, '#fff');
  // depth scale
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.fillStyle = '#fff'; ctx.font = font(10, 700); ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineWidth = 1;
  for (let d = 0; d <= 350; d += 50) { ctx.beginPath(); ctx.moveTo(4, SY(d)); ctx.lineTo(12, SY(d)); ctx.stroke(); if (d) ctx.fillText(String(d), 14, SY(d)); }
  note(ctx, t('depthScale'), 8, SURF + 10, 'left', 10, '#fff');
  // ship
  const x = st.x;
  ctx.fillStyle = '#d8dde4'; ctx.beginPath(); ctx.moveTo(x - 40, SURF - 14); ctx.lineTo(x + 44, SURF - 14); ctx.lineTo(x + 30, SURF + 4); ctx.lineTo(x - 30, SURF + 4); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#a63a2c'; ctx.fillRect(x - 14, SURF - 30, 26, 16);
  note(ctx, t('ship'), x, SURF - 40, 'center', 11, cssVar('--text'));
  // pulse and echo (slow motion)
  if (st.ping != null) {
    const ts = (now - st.ping) / SONAR_SLOW;
    const D = st.target.d, down = V_WATER * ts;
    const front = down <= D ? down : 2 * D - down;
    if (front > 0 && down < 2 * D + 30) {
      ctx.strokeStyle = down <= D ? '#ffe28a' : '#9ef0b0'; ctx.lineWidth = 3;
      const yy = SY(Math.max(0, front));
      ctx.beginPath(); ctx.ellipse(x, yy, 22, 6, 0, down <= D ? 0 : Math.PI, down <= D ? Math.PI : TAU); ctx.stroke();
      note(ctx, t(down <= D ? 'pulse' : 'echo'), x + 30, yy, 'left', 10, '#fff');
    }
  }
  // time line
  const ty = HEIGHTS.sonar - 30, tx0 = 40, tx1 = 570, tmax = 600; // ms
  ctx.fillStyle = cssVar('--scene-bg'); ctx.fillRect(0, ty - 20, 600, 50);
  const tX = (ms) => tx0 + (ms / tmax) * (tx1 - tx0);
  ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(tx0, ty); ctx.lineTo(tx1, ty); ctx.stroke();
  ctx.fillStyle = cssVar('--muted'); ctx.font = font(10, 600); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let ms = 0; ms <= tmax; ms += 100) { ctx.beginPath(); ctx.moveTo(tX(ms), ty - 4); ctx.lineTo(tX(ms), ty + 4); ctx.stroke(); ctx.fillText(String(ms), tX(ms), ty + 6); }
  note(ctx, t('timeLine'), tx1, ty - 12, 'right', 10);
  if (st.ping != null) {
    ctx.fillStyle = '#e0a21b'; ctx.fillRect(tX(0) - 2, ty - 14, 4, 14);
    const tsMs = ((now - st.ping) / SONAR_SLOW) * 1000;
    if (tsMs < tmax) { ctx.fillStyle = cssVar('--primary'); ctx.beginPath(); ctx.arc(tX(tsMs), ty, 4, 0, TAU); ctx.fill(); }
    if (st.echoT != null) { ctx.fillStyle = '#2ea36b'; ctx.fillRect(tX(st.echoT) - 2, ty - 14, 4, 14); }
  }
  note(ctx, t('slowSonar'), 590, SURF - 58, 'right', 10, cssVar('--muted'));
}

/* ================================================================
   Pointer
   ================================================================ */
let dragging = false, dragOff = 0;
canvas.addEventListener('pointerdown', (ev) => {
  const p = view.toLogical(ev);
  if (shell.tab === 'induction') {
    const st = S.induction, key = st.moved === 'magnet' ? 'mx' : 'cx';
    const half = st.moved === 'magnet' ? (MAG_L * PXCM) / 2 + 10 : 60;
    if (Math.abs(p.x - st[key]) > half || Math.abs(p.y - IND_Y) > 50) return;
    dragging = true; dragOff = st[key] - p.x; st.target = null;
  } else if (shell.tab === 'sonar') {
    if (p.y > SURF + 40) return;
    dragging = true; dragOff = 0; moveShip(p);
  } else return;
  canvas.setPointerCapture(ev.pointerId);
});
canvas.addEventListener('pointermove', (ev) => {
  if (!dragging) return;
  const p = view.toLogical(ev);
  if (shell.tab === 'induction') {
    const st = S.induction, key = st.moved === 'magnet' ? 'mx' : 'cx';
    st[key] = clamp(p.x + dragOff, 70, 530);
  } else moveShip(p);
});
const endDrag = () => { dragging = false; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
function moveShip(p) { const st = S.sonar; st.x = clamp(Math.round(p.x), 70, 560); st.ping = null; st.echoT = null; refresh(); }

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

/* ---------- induction ---------- */
function buildInduction() {
  const st = S.induction;
  const go = (inward) => () => {
    const key = st.moved === 'magnet' ? 'mx' : 'cx';
    st.target = inward ? (st.moved === 'magnet' ? st.cx : st.mx) : st.moved === 'magnet' ? st.cx + 25 * PXCM : st.mx - 25 * PXCM;
    st.target = clamp(st.target, 70, 530);
    void key;
  };
  controlsBody.append(
    seg('ctl.moved', [['magnet', 'moved.magnet'], ['coil', 'moved.coil']], st.moved, (v) => { Object.assign(st, initialState('induction'), { moved: v, pol: st.pol, speed: st.speed }); refresh(); }).root,
    seg('ctl.pole', [[1, 'pole.N'], [-1, 'pole.S']], st.pol, (v) => { st.pol = Number(v); st.flux = null; refresh(); }).root,
    seg('ctl.speed', [['slow', 'speed.slow'], ['fast', 'speed.fast']], st.speed, (v) => { st.speed = v; }).root,
    btnRow(createButton({ labelKey: 'ctl.in', variant: 'primary', onClick: go(true) }), createButton({ labelKey: 'ctl.out', variant: 'secondary', onClick: go(false) })),
    hint('hint.induction'), resetBtn('induction'),
  );
  ui.dl = el('dl', { class: 'meas' });
  measuresBody.append(ui.dl);
}
function updateInduction() {
  const st = S.induction;
  const moving = Math.abs(st.i) > 0.5;
  measRows(ui.dl, [
    [t('m.motion'), t(!moving ? 'motion.none' : st.motion > 0 ? 'motion.closer' : st.motion < 0 ? 'motion.away' : 'motion.none')],
    [t('m.i'), qty(st.i, 1, 'µA')],
    [t('m.u'), qty((st.i * R_CIRCUIT) / 1000, 2, 'mV')],
    [t('m.dir'), t(!moving ? 'dir.none' : st.i > 0 ? 'dir.pos' : 'dir.neg')],
  ]);
}

/* ---------- microphone ---------- */
function buildMic() {
  const st = S.mic;
  controlsBody.append(seg('ctl.view', [['scope', 'view.scope'], ['chain', 'view.chain']], st.view, (v) => { st.view = v; buildTab('mic'); }).root,
    seg('ctl.fgen', MIC_FREQS.map((f, i) => [i, `f${f}`]), st.fIdx, (v) => { st.fIdx = Number(v); refresh(); }).root,
    createSlider({ labelKey: 'ctl.ampSpk', min: 0.2, max: 1, step: 0.1, value: st.amp, unit: '', decimals: 1, onInput: (v) => { st.amp = v; refresh(); } }).root);
  if (st.view === 'scope') {
    controlsBody.append(seg('ctl.sh', MIC_SH.map((v) => [v, `sh${v}`]), st.sh, (v) => { st.sh = Number(v); refresh(); }).root,
      btnRow(createButton({ labelKey: 'ctl.recordScope', variant: 'primary', onClick: recordMic })), hint('hint.mic'));
  } else {
    controlsBody.append(createSlider({ labelKey: 'ctl.gain', min: 10, max: 200, step: 10, value: st.gain, unit: '', decimals: 0, onInput: (v) => { st.gain = v; refresh(); } }).root);
  }
  controlsBody.append(...soundControls(), resetBtn('mic'));
  ui.dl = el('dl', { class: 'meas' });
  measuresBody.append(ui.dl, ...(st.view === 'scope' ? tableParts(st) : []));
}
function recordMic() {
  const st = S.mic, f = micF(st), x = 1000 / (f * st.sh);
  if (x > DIV_X) st.fb = { type: 'warn', key: 'fb.tooFew' };
  else if (x < 1) st.fb = { type: 'warn', key: 'fb.tooMany' };
  else { st.rows.push({ sh: st.sh, x, T: 1000 / f, f }); st.fb = null; }
  refresh();
}
function updateMic() {
  const st = S.mic, f = micF(st), umic = UMIC_MAX * st.amp;
  const rows = [[t('m.fsound'), qty(f, 0, 'Hz')], [t('m.umic'), qty(umic, 0, 'mV')]];
  if (st.view === 'scope') rows.push([t('m.sv'), `${num(MIC_SV, 0)} mV/div`], [t('m.sh'), vbText(st.sh / 1000)]);
  else { const u = (umic * st.gain) / 1000; rows.push([t('m.uout'), qty(u, u < 1 ? 2 : 1, 'V')]); }
  measRows(ui.dl, rows);
  if (st.view !== 'scope') return;
  const sig = calcSig(st.rows) + st.rows.length;
  if (sig !== tableSig) {
    tableSig = sig;
    const head = el('tr', {}, ['col.sh', 'col.x', 'col.T', 'col.f'].map((k) => el('th', {}, t(k))));
    const body = st.rows.map((r) => el('tr', {}, [
      el('td', {}, num(r.sh, r.sh < 1 ? 1 : 0)),
      calcCell(r, 'x', { expected: r.x, decimals: 1, tol: 0.15, onCheck: (res) => { st.fb = fbOf(res, 'fb.xOk', 'fb.xWrong'); refresh(); } }),
      calcCell(r, 'T', { expected: r.T, decimals: r.T < 1 ? 2 : 1, tol: Math.max(r.T * 0.03, 0.15 * r.sh), disabled: !calcDone(r, 'x'), onCheck: (res) => { st.fb = fbOf(res, 'fb.TOk', 'fb.TWrong'); refresh(); } }),
      calcCell(r, 'f', { expected: r.f, decimals: 0, tol: r.f * 0.04, disabled: !calcDone(r, 'T'), onCheck: (res) => { st.fb = fbOf(res, 'fb.fOk', 'fb.fWrong'); refresh(); } }),
    ]));
    ui.table.replaceChildren(el('thead', {}, head), el('tbody', {}, body));
    tableSig = calcSig(st.rows) + st.rows.length;
  }
  ui.table.hidden = st.rows.length === 0;
  ui.clear.hidden = ui.table.hidden;
  showStatus(ui.status, st.fb);
}

/* ---------- ear ---------- */
function buildEar() {
  const st = S.ear;
  ui.play = createButton({ labelKey: st.playing ? 'ctl.pauseEar' : 'ctl.playEar', variant: 'primary', onClick: () => {
    st.playing = !st.playing; ui.play.dataset.i18n = st.playing ? 'ctl.pauseEar' : 'ctl.playEar'; ui.play.textContent = t(ui.play.dataset.i18n);
  } });
  controlsBody.append(seg('ctl.part', [['all', 'part.all'], ['ext', 'part.ext'], ['mid', 'part.mid'], ['int', 'part.int']], st.part, (v) => { st.part = v; refresh(); }).root, btnRow(ui.play), resetBtn('ear'));
  ui.dl = el('p', { style: 'margin:0;line-height:1.5' });
  measuresBody.append(ui.dl);
}
function updateEar() { ui.dl.textContent = t(`role.${S.ear.part}`); }

/* ---------- audible ---------- */
function buildAudible() {
  const st = S.audible;
  ui.f = createSlider({ labelKey: 'ctl.flog', min: F_LOG_MIN, max: F_LOG_MAX, step: 0.01, value: st.lf, format: (v) => fText(10 ** v), onInput: (v) => { st.lf = v; refresh(); } });
  ui.tone = createButton({ labelKey: st.tone ? 'ctl.stopTone' : 'ctl.playTone', variant: 'primary', onClick: () => {
    st.tone = !st.tone; ui.tone.dataset.i18n = st.tone ? 'ctl.stopTone' : 'ctl.playTone'; ui.tone.textContent = t(ui.tone.dataset.i18n);
    if (st.tone && isMuted()) { setMuted(false); buildTab('audible'); return; }
    refresh();
  } });
  const quick = btnRow(...[20, 200, 1000, 8000, 20000, 40000].map((f) => createButton({ labelKey: `q${f}`, variant: 'secondary', onClick: () => { st.lf = Math.log10(f); ui.f.set(st.lf); refresh(); } })));
  controlsBody.append(ui.f.root, quick, btnRow(ui.tone), hint('tone.note'), ...soundControls(), resetBtn('audible'));
  ui.dl = el('dl', { class: 'meas' });
  measuresBody.append(ui.dl);
}
function updateAudible() {
  const f = audF(S.audible);
  const T = 1 / f;
  const Ttext = T >= 0.1 ? qty(T, 2, 's') : T >= 1e-4 ? qty(T * 1000, T >= 0.01 ? 1 : 2, 'ms') : qty(T * 1e6, T >= 1e-5 ? 1 : 2, 'µs');
  const lam = 340 / f;
  const who = f < 20 ? [] : HEARS.filter(([, , b]) => f <= b).map(([k]) => t(k));
  measRows(ui.dl, [
    [t('m.f'), fText(f)], [t('m.T'), Ttext], [t('m.kind'), t(`kind.${kindOf(f)}`)],
    [t('m.hears'), who.length ? who.join(', ') : t('m.none')],
    [t('m.lambda'), lam >= 1 ? qty(lam, lam >= 10 ? 0 : 2, 'm') : lam >= 0.01 ? qty(lam * 100, 1, 'cm') : qty(lam * 1000, 1, 'mm')],
  ]);
}

/* ---------- sonar ---------- */
function buildSonar() {
  const st = S.sonar;
  controlsBody.append(
    btnRow(createButton({ labelKey: 'ctl.ping', variant: 'primary', onClick: () => { st.ping = now; st.echoT = null; st.target = sonarTarget(st.x); st.fb = null; refresh(); } }),
      createButton({ labelKey: 'ctl.recordEcho', variant: 'secondary', onClick: recordEcho })),
    hint('hint.sonar'), resetBtn('sonar'),
  );
  ui.dl = el('dl', { class: 'meas' });
  measuresBody.append(ui.dl, ...tableParts(st));
}
function recordEcho() {
  const st = S.sonar;
  if (st.echoT == null) { st.fb = { type: 'warn', key: 'fb.noEcho' }; refresh(); return; }
  const tShown = Math.round(st.echoT * 10) / 10;
  st.rows.push({ kind: st.target.kind, t: tShown });
  st.fb = null;
  refresh();
}
function updateSonar() {
  const st = S.sonar;
  measRows(ui.dl, [
    [t('m.fus'), qty(50, 0, 'kHz')], [t('m.vwater'), qty(V_WATER, 0, 'm/s')],
    [t('m.techo'), st.ping == null ? t('techo.none') : st.echoT == null ? t('techo.wait') : qty(st.echoT, 1, 'ms')],
  ]);
  const sig = calcSig(st.rows) + st.rows.length;
  if (sig !== tableSig) {
    tableSig = sig;
    const head = el('tr', {}, ['col.obj', 'col.t', 'col.d'].map((k) => el('th', {}, t(k))));
    const body = st.rows.map((r) => {
      const d = (V_WATER * r.t) / 2000;
      return el('tr', {}, [el('td', {}, t(r.kind)), el('td', {}, num(r.t, 1)),
        calcCell(r, 'd', { expected: d, decimals: 1, tol: Math.max(0.5, d * 0.005), onCheck: (res) => { st.fb = fbOf(res, 'fb.dOk', 'fb.dWrong'); refresh(); } })]);
    });
    ui.table.replaceChildren(el('thead', {}, head), el('tbody', {}, body));
    tableSig = calcSig(st.rows) + st.rows.length;
  }
  ui.table.hidden = st.rows.length === 0;
  ui.clear.hidden = ui.table.hidden;
  showStatus(ui.status, st.fb);
}

/* ---------- tabs ---------- */
const BUILD = { induction: buildInduction, mic: buildMic, ear: buildEar, audible: buildAudible, sonar: buildSonar };
const UPDATE = { induction: updateInduction, mic: updateMic, ear: updateEar, audible: updateAudible, sonar: updateSonar };
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

const extra = { en: {}, fr: {} };
for (const lang of ['en', 'fr']) {
  for (const f of MIC_FREQS) extra[lang][`f${f}`] = `${num(f, 0, lang)} Hz`;
  for (const v of MIC_SH) extra[lang][`sh${v}`] = `${num(v, v < 1 ? 1 : 0, lang)} ms/div`;
  for (const f of [20, 200, 1000, 8000, 20000, 40000]) extra[lang][`q${f}`] = f >= 10000 ? `${num(f / 1000, 0, lang)} kHz` : `${num(f, 0, lang)} Hz`;
}
onLangChange(() => { if (shell) buildTab(shell.tab); });

shell = initSim({
  strings: { en: { ...strings.en, ...extra.en }, fr: { ...strings.fr, ...extra.fr } },
  tabs: TABS.map((id) => ({ id, labelKey: `tab.${id}` })),
  initialTab: 'induction',
  onTab: buildTab,
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, sonarTarget, fluxBump };
