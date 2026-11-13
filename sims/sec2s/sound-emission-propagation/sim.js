// Sec 2 S — Chapter 3: emission and propagation of sound (3.1, 3.2; Experiments 3.1–3.4). Real sounds via shared/audio.js.
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
import { drawLead, drawSwitch } from '../../../shared/circuit-draw.js';
import { drawTuningFork, drawSpeaker, drawMicrophone, drawSoundArcs } from '../../../shared/sound-draw.js';
import { audioAvailable, createVoice, setMuted, isMuted, setVolume, getVolume, stopAll } from '../../../shared/audio.js';

const TAU = 2 * Math.PI;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const frac = (x) => x - Math.floor(x);
const PLAY_MIN = 100, PLAY_MAX = 15000; // frequencies the device plays (owner, 9 Nov 2026)
const playable = (f) => f >= PLAY_MIN && f <= PLAY_MAX;

/* ================================================================
   Model
   ================================================================ */
const FORK_F = 440, VIOLIN_F = 196;
const DEV_PER_A = (3.5 * Math.PI) / 180; // wire MN: deviation per ampere (value chosen for the simulation)
const SPK_FREQS = [50, 100, 440, 1000, 5000, 10000, 15000];
const RANGE = { 21: [50, 5000], 5: [5000, 20000] };
const V_AIR = { 20: 340, 0: 331 }; // m/s, book table
const RULER0 = 6; // cm from the membrane to the zero of the ruler (chosen)
const SP_FREQS = [500, 1000, 2000];
const SH_FOR = { 500: 0.5, 1000: 0.2, 2000: 0.1 }; // ms/div so that about 2 periods are on the screen

let now = 0;
function initialState(tab) {
  switch (tab) {
    case 'sources': return { src: 'fork', struck: null, plucked: null, lfgOn: false, lfgF: 100, grains: makeGrains() };
    case 'force': return { closed: false, magnet: false, flipI: false, flipB: false, I: 2, th: 0, w: 0 };
    case 'speaker': return { supply: 'lfg', on: false, fIdx: 2, amp: 0.6, diam: 21, ph: 0, dc: 0 };
    case 'air': return { f: 5, amp: 3, layers: false, ph: 0 };
    case 'vacuum': return { closed: true, pumping: false, venting: false, p: 1 };
    default: return { f: 1000, temp: 20, x: 12, rows: [], pending: null, fb: null };
  }
}
function makeGrains() {
  const g = [];
  for (let i = 0; i < 14; i++) g.push({ x: -60 + (120 * i) / 13 + (Math.random() - 0.5) * 6, y: 0, vy: 0 });
  return g;
}
const TABS = ['sources', 'force', 'speaker', 'air', 'vacuum', 'speed'];
let S = Object.fromEntries(TABS.map((k) => [k, initialState(k)]));

const forkAmp = (st) => (st.struck == null ? 0 : Math.exp(-(now - st.struck) / 2.5));
const violinAmp = (st) => (st.plucked == null ? 0 : Math.exp(-(now - st.plucked) / 1.0));
function forceSign(st) { return (st.flipI ? -1 : 1) * (st.flipB ? -1 : 1); } // +1: deviation to the right
function forceOn(st) { return st.closed && st.magnet; }
function spkF(st) { return SPK_FREQS[st.fIdx]; }
const vAir = (st) => V_AIR[st.temp];
const lambdaCm = (st) => (100 * vAir(st)) / st.f;
function phaseErr(st, x) { const r = frac((RULER0 + x) / lambdaCm(st)); return Math.min(r, 1 - r); } // in cycles

/* ================================================================
   Sound (real, through the Web Audio API)
   ================================================================ */
setMuted(true); // off by default (owner, 9 Nov 2026)
const voices = {};
function voice(key, opts) {
  if (isMuted()) return null;
  if (!voices[key]) voices[key] = createVoice(opts);
  return voices[key];
}
function stopVoices() { stopAll(); for (const k of Object.keys(voices)) delete voices[k]; }
const lastGain = {};
function setG(key, v, g, tau = 0.03) {
  if (!v) return;
  if (lastGain[key] != null && Math.abs(lastGain[key] - g) < 0.002) return;
  lastGain[key] = g;
  v.setGain(g, tau);
}
function updateAudio() {
  if (!shell || isMuted()) return;
  const tab = shell.tab;
  if (tab === 'sources') {
    const st = S.sources;
    const v = voice('lfg', { freq: st.lfgF });
    if (v) { v.setFreq(st.lfgF); setG('lfg', v, st.src === 'speaker' && st.lfgOn ? 0.3 : 0); }
  } else if (tab === 'speaker') {
    const st = S.speaker;
    const f = spkF(st);
    const v = voice('spk', { freq: f });
    if (v) {
      v.setFreq(f);
      const [a, b] = RANGE[st.diam];
      const eff = f >= a && f <= b ? 1 : 0.25;
      setG('spk', v, st.supply === 'lfg' && st.on && playable(f) ? 0.3 * st.amp * eff : 0);
    }
  } else if (tab === 'vacuum') {
    const st = S.vacuum;
    const v = voice('bell', { freq: 1150, harmonics: [1, 0.6, 0.35, 0.25, 0.15] });
    if (v) {
      const g = st.closed ? 0.16 * st.p * (0.55 + 0.45 * Math.sin(TAU * 18 * now)) : 0;
      lastGain.bell = null;
      v.setGain(g, 0.006);
    }
  } else if (tab === 'speed') {
    const st = S.speed;
    const v = voice('tone', { freq: st.f });
    if (v) { v.setFreq(st.f); setG('tone', v, 0.12); }
  }
}
function strike(kind) {
  if (isMuted()) return;
  if (kind === 'fork') voice('fork', { freq: FORK_F, harmonics: [1, 0, 0.04] })?.strike(0.4, 2.5);
  else voice('violin', { freq: VIOLIN_F, harmonics: [1, 0.7, 0.5, 0.35, 0.25, 0.15, 0.1] })?.strike(0.3, 1.0);
}

/* ================================================================
   Canvas and loop
   ================================================================ */
const HEIGHTS = { sources: 340, force: 380, speaker: 440, air: 330, vacuum: 360, speed: 430 };
let shell;
let drawQueued = false;
const canvas = document.getElementById('stage');
canvas.style.touchAction = 'none';
const view = setupCanvas(canvas, { width: 600, height: 340, maxHeightVh: () => (window.innerWidth < 880 ? 50 : 74), onResize: () => requestDraw() });
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
    if (tab === 'sources') {
      const st = S.sources;
      const on = st.src === 'speaker' && st.lfgOn;
      for (const g of st.grains) {
        // a grain resting on the vibrating membrane is thrown up; then it falls back
        g.vy -= 900 * dt; g.y += g.vy * dt;
        if (g.y <= 0) { g.y = 0; g.vy = on ? 60 + Math.random() * (st.lfgF > 150 ? 90 : 140) : 0; }
      }
    } else if (tab === 'force') {
      const st = S.force;
      const target = forceOn(st) ? forceSign(st) * DEV_PER_A * st.I : 0;
      const a = -40 * (st.th - target) - 7 * st.w; // damped approach (critically damped-ish)
      st.w += a * dt; st.th += st.w * dt;
    } else if (tab === 'speaker') {
      const st = S.speaker;
      st.ph += dt * 0.9;
      const tgt = st.supply === 'dc' && st.on ? 1 : 0;
      st.dc += (tgt - st.dc) * Math.min(1, dt * 12);
    } else if (tab === 'air') {
      S.air.ph += dt;
    } else if (tab === 'vacuum') {
      const st = S.vacuum;
      if (st.pumping) st.p = Math.max(0.002, st.p - (st.p / 3) * dt);
      if (st.venting) { st.p += (1 - st.p) * Math.min(1, dt / 0.8); if (st.p > 0.999) { st.p = 1; st.venting = false; } }
    }
    updateAudio();
    return true;
  },
  render() { draw(); updateMeasures(); },
});

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
  ({ sources: drawSources, force: drawForce, speaker: drawSpeakerTab, air: drawAir, vacuum: drawVacuum, speed: drawSpeed })[tab](ctx, S[tab]);
}
function note(ctx, s, x, y, align = 'center', size = 11, color = cssVar('--muted')) { label(ctx, s, x, y, { size, weight: 700, color, align }); }

/* ---------- sources ---------- */
function drawSources(ctx, st) {
  if (st.src === 'fork') {
    const a = forkAmp(st);
    const d = a > 0.01 ? 7 * a * Math.sin(now * 55) : 0;
    const [tx, ty] = drawTuningFork(ctx, { x: 260, yBox: 280, height: 230, gap: 22, d, width: 12 });
    drawSoundArcs(ctx, { x: tx + 14, y: ty + 70, amp: a, phase: frac(now * 1.5), n: 4, step: 22 });
    // hammer
    const since = st.struck == null ? 9 : now - st.struck;
    const swing = since < 0.12 ? 0 : Math.min(1, (since - 0.12) / 0.3);
    ctx.save();
    ctx.translate(140, 250); ctx.rotate(-0.9 + 0.25 * (1 - swing) - 0.25);
    ctx.fillStyle = cssVar('--wood'); ctx.fillRect(-4, -110, 8, 110);
    ctx.fillStyle = cssVar('--rubber'); roundRect(ctx, -18, -132, 36, 24, 8); ctx.fill();
    ctx.restore();
    note(ctx, t('hammer'), 110, 300);
    label(ctx, `${FORK_F} Hz`, 260, 296, { size: 12, weight: 800, color: '#fff', halo: false });
  } else if (st.src === 'violin') {
    const a = violinAmp(st);
    const x1 = 80, x2 = 520, y = 170;
    ctx.fillStyle = cssVar('--wood');
    roundRect(ctx, 60, 140, 480, 60, 26); ctx.fill();
    ctx.fillStyle = '#2b2f36';
    ctx.fillRect(x1 - 6, y - 14, 6, 28); ctx.fillRect(x2, y - 14, 6, 28);
    // the string vibrates on its fundamental (drawn larger and slower)
    const amp = 16 * a * Math.sin(now * 40);
    ctx.strokeStyle = cssVar('--metal') || '#c9ced6'; ctx.lineWidth = 2.4;
    ctx.beginPath();
    for (let i = 0; i <= 60; i++) { const u = i / 60; const yy = y - amp * Math.sin(Math.PI * u); if (i) ctx.lineTo(x1 + u * (x2 - x1), yy); else ctx.moveTo(x1, yy); }
    ctx.stroke();
    if (a > 0.02) {
      ctx.globalAlpha = 0.25; ctx.beginPath();
      for (let i = 0; i <= 60; i++) { const u = i / 60; const yy = y + amp * Math.sin(Math.PI * u); if (i) ctx.lineTo(x1 + u * (x2 - x1), yy); else ctx.moveTo(x1, yy); }
      ctx.stroke(); ctx.globalAlpha = 1;
    }
    drawSoundArcs(ctx, { x: 300, y: 120, amp: a, phase: frac(now * 1.5), n: 3, step: 18, dir: 1, spread: 0.5 });
    note(ctx, `${VIOLIN_F} Hz`, 300, 230, 'center', 12);
  } else {
    // loudspeaker lying horizontally, membrane up, grains on it (Fig. 3.3)
    const cx = 300, cy = 230;
    const vib = st.lfgOn ? 3 * Math.sin(now * 50) : 0;
    ctx.fillStyle = '#3a3f48'; roundRect(ctx, cx - 30, cy + 30, 60, 26, 4); ctx.fill();
    ctx.strokeStyle = cssVar('--metal') || '#9aa4b0'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx - 28, cy + 30); ctx.lineTo(cx - 90, cy - 4); ctx.moveTo(cx + 28, cy + 30); ctx.lineTo(cx + 90, cy - 4); ctx.stroke();
    ctx.fillStyle = '#5b4a3a';
    ctx.beginPath(); ctx.ellipse(cx, cy - vib, 86, 14, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2b2f36'; ctx.beginPath(); ctx.ellipse(cx, cy - vib, 20, 5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e9d9a6';
    for (const g of st.grains) { ctx.beginPath(); ctx.arc(cx + g.x, cy - 6 - vib - g.y * 0.35, 3, 0, TAU); ctx.fill(); }
    note(ctx, t('grains'), cx + 150, cy - 40, 'left');
    note(ctx, t('membrane'), cx, cy + 74);
    const l = drawLFG(ctx, 40, 40, 200, { name: t('lfg'), display: st.lfgOn ? qty(st.lfgF, 0, 'Hz') : '', shape: 'sine' });
    drawLead(ctx, l.out1, [cx - 20, cy + 50], cssVar('--accent'), [l.out1[0], cy + 60]);
    drawLead(ctx, l.out2, [cx + 20, cy + 50], cssVar('--lead-black'), [l.out2[0] + 40, cy + 90]);
    if (st.lfgOn) drawSoundArcs(ctx, { x: cx, y: cy - 30, amp: 1, phase: frac(now * 1.5), n: 3, step: 18, spread: 0.6, dir: 1 });
  }
  note(ctx, t('slow'), 14, HEIGHTS.sources - 14, 'left');
}

/* ---------- force (Experiment 3.1) ---------- */
function drawMagnetBranch(ctx, x1, y, x2, h, pole) {
  ctx.fillStyle = pole === 'N' ? '#d6342c' : '#2f74c8';
  roundRect(ctx, x1, y, 40, h, 4); ctx.fill();
  ctx.fillStyle = '#8b939e';
  ctx.fillRect(x1 + 40, y, x2 - x1 - 40, h);
  label(ctx, pole, x1 + 20, y + h / 2, { size: 14, weight: 800, color: '#fff', halo: false });
}
// Small view from above: wire MN seen end-on between the two poles, field B and force F (Experiment 3.1)
function drawTopView(ctx, st) {
  const x = 384, y = 250, w = 140, h = 100, cx = x + w / 2, cy = y + h / 2 + 4;
  ctx.fillStyle = cssVar('--box'); ctx.globalAlpha = 0.12; roundRect(ctx, x, y, w, h, 8); ctx.fill(); ctx.globalAlpha = 1;
  ctx.strokeStyle = cssVar('--border'); ctx.lineWidth = 1; roundRect(ctx, x, y, w, h, 8); ctx.stroke();
  note(ctx, t('topView'), cx, y + 10, 'center', 10);
  const back = st.flipB ? 'N' : 'S', front = st.flipB ? 'S' : 'N';
  const pole = (p, yy) => { ctx.fillStyle = p === 'N' ? '#d6342c' : '#2f74c8'; ctx.fillRect(cx - 26, yy, 52, 14); label(ctx, p, cx, yy + 7, { size: 11, weight: 800, color: '#fff', halo: false }); };
  pole(back, y + 20); pole(front, y + h - 16);
  // B from N to S
  const up = !st.flipB; // N in front (bottom of the view) → B points to the back (up in the view)
  ctx.strokeStyle = cssVar('--primary'); ctx.fillStyle = cssVar('--primary'); ctx.lineWidth = 2;
  arrow(ctx, cx + 56, up ? y + h - 22 : y + 40, cx + 56, up ? y + 40 : y + h - 22, 7);
  label(ctx, 'B', cx + 46, y + h - 26, { size: 12, weight: 800, color: cssVar('--primary') });
  // wire end-on with the direction of the current
  ctx.fillStyle = cssVar('--copper'); ctx.beginPath(); ctx.arc(cx, cy, 8, 0, TAU); ctx.fill();
  if (st.closed) label(ctx, st.flipI ? '⊙' : '⊗', cx, cy, { size: 14, weight: 800, color: '#fff', halo: false });
  if (forceOn(st)) {
    const s = forceSign(st);
    ctx.strokeStyle = cssVar('--good'); ctx.fillStyle = cssVar('--good'); ctx.lineWidth = 2.5;
    arrow(ctx, cx + s * 10, cy, cx + s * 38, cy, 7);
    label(ctx, 'F', cx + s * 30, cy - 13, { size: 12, weight: 800, color: cssVar('--good') });
  }
}
function drawForce(ctx, st) {
  const Mx = 300, My = 64, L = 236;
  const th = st.th;
  const Nx = Mx + Math.sin(th) * L, Ny = My + Math.cos(th) * L;
  const flipB = st.flipB;
  // support
  ctx.fillStyle = cssVar('--wood');
  ctx.fillRect(220, 40, 324, 14); ctx.fillRect(532, 40, 12, 290); ctx.fillRect(528, 324, 64, 12);
  note(ctx, t('support'), 538, 28);
  // mercury dish
  ctx.fillStyle = cssVar('--glass-fill');
  roundRect(ctx, 230, 296, 140, 24, 6); ctx.fill();
  ctx.fillStyle = cssVar('--mercury');
  ctx.fillRect(236, 300, 128, 10);
  note(ctx, t('mercury'), 300, 336);
  // magnet: back branch (behind the wire)
  if (st.magnet) drawMagnetBranch(ctx, 262, 166, 460, 18, flipB ? 'N' : 'S');
  // wire MN
  ctx.strokeStyle = cssVar('--copper') || '#c4743a'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(Mx, My); ctx.lineTo(Nx, Ny); ctx.stroke();
  label(ctx, 'M', Mx - 16, My + 4, { size: 14, weight: 800 });
  label(ctx, 'N', Nx + 16, Ny - 8, { size: 14, weight: 800 });
  // magnet: front branch (in front of the wire) and base
  if (st.magnet) {
    drawMagnetBranch(ctx, 242, 196, 470, 22, flipB ? 'S' : 'N');
    ctx.fillStyle = '#8b939e';
    ctx.beginPath(); ctx.moveTo(460, 166); ctx.lineTo(470, 166); ctx.lineTo(490, 218); ctx.lineTo(470, 218); ctx.closePath(); ctx.fill();
  }
  // current
  const on = st.closed;
  if (on) {
    const down = !st.flipI;
    const ux = Math.sin(th), uy = Math.cos(th);
    const ax = Mx + ux * 44, ay = My + uy * 44;
    ctx.fillStyle = cssVar('--accent'); ctx.strokeStyle = cssVar('--accent'); ctx.lineWidth = 2.5;
    if (down) arrow(ctx, ax - 12, ay - 4, ax - 12 + ux * 34, ay - 4 + uy * 34, 8);
    else arrow(ctx, ax - 12 + ux * 34, ay - 4 + uy * 34, ax - 12, ay - 4, 8);
    label(ctx, 'I', ax - 28, ay + 14, { size: 14, weight: 800, color: cssVar('--accent') });
  }
  if (forceOn(st)) {
    const s = forceSign(st);
    const fx = Mx + Math.sin(th) * 175, fy = My + Math.cos(th) * 175;
    ctx.fillStyle = cssVar('--good'); ctx.strokeStyle = cssVar('--good'); ctx.lineWidth = 3;
    arrow(ctx, fx, fy, fx + s * 16 * st.I, fy, 10);
    label(ctx, 'F', fx + s * (16 * st.I + 14), fy - 2, { size: 15, weight: 800, color: cssVar('--good') });
  }
  if (st.magnet) drawTopView(ctx, st);
  // circuit: source, switch, rheostat
  const sx = 40, sy = 240;
  ctx.fillStyle = cssVar('--device'); roundRect(ctx, sx, sy, 120, 60, 8); ctx.fill();
  note(ctx, t('dcSource'), sx + 60, sy + 16, 'center', 11, cssVar('--text-on-meter'));
  const plus = [sx + 30, sy + 44], minus = [sx + 90, sy + 44];
  ctx.fillStyle = cssVar('--accent'); ctx.beginPath(); ctx.arc(plus[0], plus[1], 6, 0, TAU); ctx.fill();
  ctx.fillStyle = '#1d1f24'; ctx.beginPath(); ctx.arc(minus[0], minus[1], 6, 0, TAU); ctx.fill();
  label(ctx, '+', plus[0], plus[1] - 14, { size: 13, weight: 800 }); label(ctx, '−', minus[0], minus[1] - 14, { size: 13, weight: 800 });
  // leads: the terminal connected to M is + unless the poles of the source are interchanged
  const toM = st.flipI ? minus : plus, toHg = st.flipI ? plus : minus;
  drawSwitch(ctx, { x: 90, y: 120, open: !st.closed });
  note(ctx, 'K', 90, 98, 'center', 13, cssVar('--text'));
  // rheostat
  ctx.fillStyle = '#7b6a55'; roundRect(ctx, 150, 52, 50, 18, 4); ctx.fill();
  note(ctx, t('rheostat'), 175, 86);
  drawLead(ctx, toM, [66, 120], st.flipI ? cssVar('--lead-black') : cssVar('--accent'), [40, 180]);
  drawLead(ctx, [114, 120], [150, 61], cssVar('--wire'), [130, 70]);
  drawLead(ctx, [200, 61], [Mx - 4, My], cssVar('--wire'), [250, 62]);
  drawLead(ctx, toHg, [240, 306], st.flipI ? cssVar('--accent') : cssVar('--lead-black'), [200, 350]);
}

/* ---------- loudspeaker (cut view) ---------- */
function drawSpeakerTab(ctx, st) {
  const cy = 180;
  const lfg = st.supply === 'lfg';
  const running = st.on;
  // current in the coil: sinusoidal (slow motion) or constant
  const i = running ? (lfg ? Math.sin(TAU * st.ph) : 1) : 0;
  const disp = lfg ? 14 * st.amp * i : 14 * st.dc;
  // back plate + ring magnet (top and bottom sections) + central cylinder
  ctx.fillStyle = '#3a3f48';
  ctx.fillRect(96, 70, 16, 220);
  ctx.fillStyle = '#d6342c'; ctx.fillRect(112, 70, 80, 52); ctx.fillRect(112, 238, 80, 52);
  ctx.fillStyle = '#2f74c8'; ctx.fillRect(112, 160, 110, 40);
  label(ctx, 'N', 150, 96, { size: 14, weight: 800, color: '#fff', halo: false });
  label(ctx, 'N', 150, 264, { size: 14, weight: 800, color: '#fff', halo: false });
  label(ctx, 'S', 165, 180, { size: 14, weight: 800, color: '#fff', halo: false });
  // salad bowl
  ctx.strokeStyle = cssVar('--metal') || '#9aa4b0'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(192, 72); ctx.lineTo(440, 30); ctx.moveTo(192, 288); ctx.lineTo(440, 330); ctx.stroke();
  // moving coil on its cardboard cylinder, in the gap between the poles
  const cx = 196 + disp;
  ctx.fillStyle = '#c8b28a'; ctx.fillRect(cx - 4, 132, 60, 6); ctx.fillRect(cx - 4, 222, 60, 6);
  ctx.fillStyle = cssVar('--copper') || '#c4743a';
  for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(cx + 4 + k * 9, 145, 4.2, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(cx + 4 + k * 9, 215, 4.2, 0, TAU); ctx.fill(); }
  if (Math.abs(i) > 0.15) {
    const top = i > 0 ? '⊙' : '⊗', bot = i > 0 ? '⊗' : '⊙'; // B points from the ring (N) to the centre (S)
    label(ctx, top, cx + 18, 124, { size: 15, weight: 700, color: cssVar('--accent') });
    label(ctx, bot, cx + 18, 238, { size: 15, weight: 700, color: cssVar('--accent') });
  }
  // cone membrane
  ctx.fillStyle = '#5b4a3a';
  ctx.beginPath();
  ctx.moveTo(cx + 54, 136); ctx.lineTo(430 + disp * 0.7, 40); ctx.lineTo(438 + disp * 0.7, 40); ctx.lineTo(438 + disp * 0.7, 320); ctx.lineTo(430 + disp * 0.7, 320); ctx.lineTo(cx + 54, 224);
  ctx.closePath(); ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1;
  // force on the coil
  if (running && Math.abs(i) > 0.15) {
    const s = Math.sign(i), L = 30 * Math.abs(i);
    ctx.fillStyle = cssVar('--good'); ctx.strokeStyle = cssVar('--good'); ctx.lineWidth = 3;
    arrow(ctx, cx + 20, cy, cx + 20 + s * L, cy, 9);
    label(ctx, 'F', cx + 20 + s * (L + 12), cy - 12, { size: 15, weight: 800, color: cssVar('--good') });
  }
  // sound leaving the membrane
  if (lfg && running && st.amp > 0) drawSoundArcs(ctx, { x: 440, y: cy, amp: st.amp, phase: frac(st.ph), n: 4, step: 30, spread: 0.55 });
  // labels
  note(ctx, t('ringMagnet'), 152, 58);
  note(ctx, t('centralPole'), 152, 306);
  note(ctx, t('coil'), cx + 20, 108, 'center');
  note(ctx, t('cone'), 360, 180);
  note(ctx, t('bowl'), 330, 34);
  note(ctx, `⌀ ${st.diam} cm`, 520, 60, 'center', 12, cssVar('--text'));
  // generator / DC source
  const g = drawLFG(ctx, 14, 336, 170, { name: lfg ? t('lfg') : t('supply.dc'), display: lfg ? (running ? qty(spkF(st), 0, 'Hz') : '') : running ? '6 V' : '', shape: lfg ? 'sine' : null });
  drawLead(ctx, g.out1, [cx + 4, 145], cssVar('--accent'), [60, 140]);
  drawLead(ctx, g.out2, [cx + 4, 215], cssVar('--lead-black'), [80, 220]);
  if (lfg && running) note(ctx, t('slowSpk'), 590, HEIGHTS.speaker - 16, 'right');
}

/* ---------- air (Experiment 3.2) ---------- */
function drawAir(ctx, st) {
  const cy = 140;
  const visible = st.f <= 10;
  // membrane displacement (real time when the eye can follow it; otherwise a blur)
  const u = visible ? Math.sin(TAU * st.f * st.ph) : 0;
  const [mx] = drawSpeaker(ctx, { x: 110, y: cy, size: 1.6, dir: 1, cone: 2.5 * st.amp * u });
  // layers of air (slow motion), longitudinal displacement with compressions and rarefactions
  const x0 = mx + 6, x1 = 420;
  if (st.layers) {
    const lam = 150, fv = 0.6;
    ctx.fillStyle = cssVar('--air-part') || '#8fa3b8';
    for (let k = 0; ; k++) {
      const xr = x0 + k * 9;
      if (xr > x1) break;
      const d = 3.2 * st.amp * Math.sin(TAU * (fv * st.ph - (xr - x0) / lam));
      for (let r = -4; r <= 4; r++) { ctx.beginPath(); ctx.arc(xr + d, cy + r * 14, 2.2, 0, TAU); ctx.fill(); }
    }
    // mark one compression and one rarefaction
    const xc = x0 + lam * frac(fv * st.ph - 0.25) , xd = x0 + lam * frac(fv * st.ph + 0.25);
    if (xc < x1 - 10) note(ctx, t('compression'), xc, cy - 80, 'center', 11, cssVar('--primary'));
    if (xd < x1 - 10) note(ctx, t('rarefaction'), xd, cy + 80, 'center', 11, cssVar('--accent'));
  }
  // candle
  const kx = 470, top = 192;
  ctx.fillStyle = '#f2ecd8'; roundRect(ctx, kx - 14, top, 28, 100, 3); ctx.fill();
  ctx.strokeStyle = '#2b2f36'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(kx, top); ctx.lineTo(kx, top - 8); ctx.stroke();
  const L0 = 62, W0 = 13;
  const drawFlame = (dx, len, wid, alpha) => {
    ctx.globalAlpha = alpha;
    const g = ctx.createLinearGradient(0, top - 8 - len, 0, top - 8);
    g.addColorStop(0, '#ffe7a3'); g.addColorStop(0.6, '#ffb534'); g.addColorStop(1, '#e8651c');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(kx + dx, top - 8 - len);
    ctx.bezierCurveTo(kx + dx * 0.6 + wid, top - 8 - len * 0.45, kx + wid, top - 4, kx, top - 4);
    ctx.bezierCurveTo(kx - wid, top - 4, kx + dx * 0.6 - wid, top - 8 - len * 0.45, kx + dx, top - 8 - len);
    ctx.fill();
    ctx.globalAlpha = 1;
  };
  if (visible) drawFlame(-8 * st.amp * u * 0.6, L0, W0, 1);
  else {
    const len = L0 * (1 - 0.07 * st.amp), wid = W0 * (1 + 0.16 * st.amp);
    for (let k = -2; k <= 2; k++) drawFlame((k * 3 * st.amp) / 2, len, wid, 0.32);
  }
  note(ctx, t('candle'), kx, top + 118);
  const l = drawLFG(ctx, 14, 228, 170, { name: t('lfg'), display: qty(st.f, 0, 'Hz'), shape: 'sine' });
  drawLead(ctx, l.out1, [48, cy - 6], cssVar('--accent'), [30, 200]);
  drawLead(ctx, l.out2, [48, cy + 6], cssVar('--lead-black'), [70, 200]);
}

/* ---------- vacuum (Experiment 3.3) ---------- */
function drawVacuum(ctx, st) {
  const cx = 300, base = 300;
  // plate and pump
  ctx.fillStyle = '#8b939e'; ctx.fillRect(150, base, 300, 12);
  ctx.fillStyle = cssVar('--device'); roundRect(ctx, 480, 236, 100, 70, 8); ctx.fill();
  note(ctx, t('pump'), 530, 252, 'center', 11, cssVar('--text-on-meter'));
  if (st.pumping) { ctx.fillStyle = cssVar('--good'); ctx.beginPath(); ctx.arc(530, 284, 7, 0, TAU); ctx.fill(); }
  ctx.strokeStyle = '#2b2f36'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(450, base + 6); ctx.quadraticCurveTo(470, base + 40, 486, 290); ctx.stroke();
  // air particles inside the jar: their number follows the pressure
  const n = Math.round(70 * st.p);
  ctx.fillStyle = cssVar('--air-part') || '#8fa3b8';
  for (let k = 0; k < n; k++) {
    const a = (k * 2.399) % TAU, r = 30 + ((k * 37) % 100);
    const x = cx + Math.cos(a + now * 0.3 * ((k % 3) - 1)) * r, y = 190 + Math.sin(a) * r * 0.85;
    if (y > base - 4 || y < 80) continue;
    ctx.beginPath(); ctx.arc(x, y, 2.2, 0, TAU); ctx.fill();
  }
  // circuit inside: cell, bell, bulb
  const on = st.closed;
  ctx.fillStyle = '#3a3f48'; roundRect(ctx, 200, 250, 50, 34, 4); ctx.fill();
  note(ctx, t('cell'), 225, 236);
  // bell
  const bx = 300, by = 220;
  ctx.fillStyle = cssVar('--brass'); ctx.beginPath(); ctx.arc(bx, by, 26, Math.PI, 0); ctx.closePath(); ctx.fill();
  ctx.fillRect(bx - 4, by, 8, 50);
  const hit = on ? 6 * Math.sin(now * 2 * Math.PI * 9) : 0;
  ctx.strokeStyle = '#2b2f36'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(bx + 34, 270); ctx.lineTo(bx + 26 + hit, by - 6); ctx.stroke();
  ctx.fillStyle = '#2b2f36'; ctx.beginPath(); ctx.arc(bx + 26 + hit, by - 8, 5, 0, TAU); ctx.fill();
  note(ctx, t('bell'), bx, by - 46);
  // bulb
  const lx = 382, ly = 236;
  if (on) { const g = ctx.createRadialGradient(lx, ly, 2, lx, ly, 46); g.addColorStop(0, 'rgba(255,230,120,0.95)'); g.addColorStop(1, 'rgba(255,230,120,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(lx, ly, 46, 0, TAU); ctx.fill(); }
  ctx.fillStyle = on ? '#fff3b0' : 'rgba(220,225,232,0.8)'; ctx.beginPath(); ctx.arc(lx, ly, 15, 0, TAU); ctx.fill();
  ctx.fillStyle = '#8b939e'; ctx.fillRect(lx - 8, ly + 13, 16, 14);
  note(ctx, t('bulb'), lx, ly + 44);
  ctx.strokeStyle = cssVar('--wire'); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(250, 266); ctx.lineTo(296, 268); ctx.moveTo(304, 268); ctx.lineTo(lx - 8, 262); ctx.moveTo(lx, 263); ctx.lineTo(lx, 290); ctx.lineTo(225, 290); ctx.lineTo(225, 284); ctx.stroke();
  // jar
  ctx.strokeStyle = 'rgba(150,180,210,0.9)'; ctx.lineWidth = 3;
  ctx.fillStyle = 'rgba(170,200,230,0.12)';
  ctx.beginPath(); ctx.moveTo(165, base); ctx.lineTo(165, 140); ctx.bezierCurveTo(165, 50, 435, 50, 435, 140); ctx.lineTo(435, base); ctx.fill(); ctx.stroke();
  note(ctx, t('jar'), 300, 50);
  // sound heard outside
  if (on) drawSoundArcs(ctx, { x: 150, y: 190, dir: -1, amp: st.p, phase: frac(now * 1.5), n: 3, step: 22, spread: 0.6 });
  // pressure gauge
  const gx = 30, gy = 60, gh = 180;
  ctx.fillStyle = cssVar('--box'); roundRect(ctx, gx, gy, 26, gh, 6); ctx.fill();
  ctx.fillStyle = cssVar('--primary'); ctx.fillRect(gx + 5, gy + 5 + (gh - 10) * (1 - st.p), 16, (gh - 10) * st.p);
  note(ctx, t('gauge'), gx, gy - 16, 'left');
  note(ctx, qty(st.p, 2, 'bar'), gx + 34, gy + gh / 2, 'left', 13, cssVar('--text'));
}

/* ---------- speed (Experiment 3.4) ---------- */
const RX0 = 120, RPX = 4.6; // ruler: 0 cm at x = 120 px, 4.6 px/cm, 0–100 cm
const rulerX = (cm) => RX0 + cm * RPX;
const MIC_Y = 350;
function drawSpeed(ctx, st) {
  const sh = SH_FOR[st.f] / 1000;
  const lam = lambdaCm(st);
  const D = RULER0 + st.x; // cm from the membrane
  const phi = (TAU * D) / lam;
  const ch1 = (xd) => 1.6 * Math.sin(TAU * st.f * xd * sh) + 2.0;
  const ch2 = (xd) => 1.6 * Math.sin(TAU * st.f * xd * sh - phi) - 2.0;
  drawScope(ctx, { x: 16, y: 10, d: 21, curve: ch1, curve2: ch2, steady: true, spotX: 0, len: DIV_X, svLabel: '1 V/div', vbLabel: vbText(sh), svName: 'Sv', vbName: 'Sh' });
  note(ctx, t('ch1'), 270, 30, 'left', 11, cssVar('--scope-trace'));
  note(ctx, t('ch2'), 270, 46, 'left', 11, '#d9a400');
  const l = drawLFG(ctx, 300, 120, 180, { name: t('lfg'), display: qty(st.f, 0, 'Hz'), shape: 'sine' });
  // loudspeaker, ruler, microphone
  const [mx, my] = drawSpeaker(ctx, { x: rulerX(-RULER0) - 12, y: MIC_Y - 4, size: 0.75, dir: 1 });
  drawLead(ctx, l.out1, [mx - 34, my - 8], cssVar('--accent'), [200, 316]);
  drawLead(ctx, l.out2, [mx - 34, my + 4], cssVar('--lead-black'), [260, 330]);
  // ruler
  const ry = MIC_Y + 30;
  ctx.fillStyle = '#efe2b5'; ctx.fillRect(rulerX(0) - 4, ry, 100 * RPX + 8, 26);
  ctx.strokeStyle = '#3d3a2c'; ctx.fillStyle = '#3d3a2c'; ctx.lineWidth = 1; ctx.font = font(10, 600); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.beginPath();
  for (let c = 0; c <= 100; c++) { const xx = rulerX(c), h = c % 10 === 0 ? 12 : c % 5 === 0 ? 8 : 5; ctx.moveTo(xx, ry); ctx.lineTo(xx, ry + h); }
  ctx.stroke();
  for (let c = 0; c <= 100; c += 10) ctx.fillText(String(c), rulerX(c), ry + 13);
  // microphone with its index on the ruler
  const px = rulerX(st.x);
  ctx.strokeStyle = cssVar('--accent'); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(px, MIC_Y + 10); ctx.lineTo(px, ry + 2); ctx.stroke();
  drawMicrophone(ctx, { x: px + 16, y: MIC_Y, dir: -1 });
  drawLead(ctx, [px + 30, MIC_Y], [600, MIC_Y - 50], cssVar('--wire'), [px + 80, MIC_Y - 4]);
  if (st.pending != null) {
    const qx = rulerX(st.pending);
    ctx.strokeStyle = cssVar('--good'); ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(qx, MIC_Y - 20); ctx.lineTo(qx, ry); ctx.stroke(); ctx.setLineDash([]);
    note(ctx, 'x₁', qx, MIC_Y - 28, 'center', 12, cssVar('--good'));
  }
  // sound wavefronts between the loudspeaker and the microphone
  ctx.strokeStyle = cssVar('--muted'); ctx.globalAlpha = 0.35; ctx.lineWidth = 1.5;
  for (let k = 0; k < 6; k++) {
    const xx = rulerX(-RULER0) + (frac(now * 0.6) + k) * lam * RPX;
    if (xx > rulerX(100)) break;
    ctx.beginPath(); ctx.arc(xx - 40, MIC_Y - 4, 40, -0.35, 0.35); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/* ================================================================
   Pointer: drag the microphone (speed tab)
   ================================================================ */
let dragMic = false;
canvas.addEventListener('pointerdown', (ev) => {
  if (shell.tab !== 'speed') return;
  const p = view.toLogical(ev);
  if (p.y < MIC_Y - 40 || p.y > MIC_Y + 70) return;
  dragMic = true;
  canvas.setPointerCapture(ev.pointerId);
  moveMic(p);
});
canvas.addEventListener('pointermove', (ev) => { if (dragMic) moveMic(view.toLogical(ev)); });
const endDrag = () => { dragMic = false; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
function moveMic(p) {
  S.speed.x = clamp(Math.round(((p.x - 16 - RX0) / RPX) * 10) / 10, 0, 100);
  refresh();
}

/* ================================================================
   Controls and measurements
   ================================================================ */
const controlsBody = document.getElementById('controls-body');
const measuresBody = document.getElementById('measures-body');
let ui = {};
let tableSig = '';
function measRows(dl, rows) { dl.replaceChildren(...rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)])); }
function statusBox() { return el('p', { class: 'status', hidden: '' }); }
function showStatus(box, fb) {
  if (!fb) { box.hidden = true; return; }
  box.hidden = false;
  box.className = `status ${fb.type || ''}`;
  box.textContent = t(fb.key, fb.params);
}
function hint(key) { return el('p', { class: 'muted', style: 'font-size:0.88rem;margin:10px 0 0', dataset: { i18n: key } }, t(key)); }
const btnRow = (...b) => el('div', { class: 'btn-row' }, b);
const resetBtn = (id) => btnRow(createButton({ labelKey: 'ui.reset', variant: 'ghost', onClick: () => resetTab(id) }));
const yn = (b) => t(b ? 'yes' : 'no');
const seg = (labelKey, opts, value, onChange) => createSegmented({ labelKey, options: opts.map(([v, k]) => ({ value: String(v), labelKey: k })), value: String(value), onChange });
function soundControls(withRange = false) {
  const s = seg('ctl.sound', [['off', 'snd.off'], ['on', 'snd.on']], isMuted() ? 'off' : 'on', (v) => {
    setMuted(v === 'off');
    if (v === 'off') stopVoices(); else updateAudio();
  });
  const vol = createSlider({ labelKey: 'ctl.volume', min: 0, max: 100, step: 5, value: Math.round(getVolume() * 100), unit: '%', decimals: 0, onInput: (v) => setVolume(v / 100) });
  const out = [s.root, vol.root, hint(audioAvailable() ? 'snd.note' : 'noAudio')];
  if (withRange) out.push(hint('snd.range'));
  return out;
}

/* ---------- sources ---------- */
function buildSources() {
  const st = S.sources;
  ui.src = seg('ctl.source', [['fork', 'src.fork'], ['violin', 'src.violin'], ['speaker', 'src.speaker']], st.src, (v) => { st.src = v; buildTab('sources'); });
  controlsBody.append(ui.src.root);
  if (st.src === 'fork') controlsBody.append(btnRow(createButton({ labelKey: 'ctl.strike', variant: 'primary', onClick: () => { st.struck = now; strike('fork'); refresh(); } })));
  else if (st.src === 'violin') controlsBody.append(btnRow(createButton({ labelKey: 'ctl.pluck', variant: 'primary', onClick: () => { st.plucked = now; strike('violin'); refresh(); } })));
  else {
    controlsBody.append(
      seg('ctl.lfg', [['off', 'lfg.off'], ['on', 'lfg.on']], st.lfgOn ? 'on' : 'off', (v) => { st.lfgOn = v === 'on'; refresh(); }).root,
      seg('ctl.lfgF', [[100, 'f100'], [200, 'f200']], st.lfgF, (v) => { st.lfgF = Number(v); refresh(); }).root,
    );
  }
  controlsBody.append(...soundControls(), resetBtn('sources'));
  ui.dl = el('dl', { class: 'meas' });
  measuresBody.append(ui.dl);
}
function updateSources() {
  const st = S.sources;
  const vib = st.src === 'fork' ? forkAmp(st) > 0.03 : st.src === 'violin' ? violinAmp(st) > 0.03 : st.lfgOn;
  const f = st.src === 'fork' ? FORK_F : st.src === 'violin' ? VIOLIN_F : st.lfgF;
  const rows = [[t('m.source'), t(`src.${st.src}`)], [t('m.vibrates'), yn(vib)], [t('m.heard'), yn(vib)], [t('m.fsound'), vib ? qty(f, 0, 'Hz') : '—']];
  if (st.src === 'speaker') rows.push([t('m.grains'), t(st.lfgOn ? 'grains.hop' : 'grains.rest')]);
  measRows(ui.dl, rows);
}

/* ---------- force ---------- */
function buildForce() {
  const st = S.force;
  controlsBody.append(
    seg('ctl.switch', [['open', 'open'], ['closed', 'closed']], st.closed ? 'closed' : 'open', (v) => { st.closed = v === 'closed'; refresh(); }).root,
    seg('ctl.magnet', [['out', 'magnet.out'], ['in', 'magnet.in']], st.magnet ? 'in' : 'out', (v) => { st.magnet = v === 'in'; refresh(); }).root,
    createSlider({ labelKey: 'ctl.I', min: 0.5, max: 4, step: 0.5, value: st.I, unit: 'A', decimals: 1, onInput: (v) => { st.I = v; refresh(); } }).root,
    btnRow(createButton({ labelKey: 'ctl.swapSource', variant: 'secondary', onClick: () => { st.flipI = !st.flipI; refresh(); } })),
    btnRow(createButton({ labelKey: 'ctl.swapMagnet', variant: 'secondary', onClick: () => { st.flipB = !st.flipB; refresh(); } })),
    resetBtn('force'),
  );
  ui.dl = el('dl', { class: 'meas' });
  measuresBody.append(ui.dl);
}
function updateForce() {
  const st = S.force;
  const deg = Math.abs((st.th * 180) / Math.PI);
  const dev = forceOn(st) || deg > 0.3 ? t(st.th > 0 ? 'dev.right' : 'dev.left', { a: num(deg, 1) }) : t('dev.none');
  measRows(ui.dl, [
    [t('m.circuit'), t(st.closed ? 'closed' : 'open')],
    [t('m.current'), st.closed ? qty(st.I, 1, 'A') : qty(0, 1, 'A')],
    [t('m.Idir'), st.closed ? t(st.flipI ? 'Idir.up' : 'Idir.down') : '—'],
    [t('m.Bdir'), st.magnet ? t(st.flipB ? 'B.out' : 'B.in') : t('B.none')],
    [t('m.dev'), deg < 0.3 ? t('dev.none') : dev],
  ]);
}

/* ---------- loudspeaker ---------- */
function buildSpeaker() {
  const st = S.speaker;
  controlsBody.append(seg('ctl.supply', [['lfg', 'supply.lfg'], ['dc', 'supply.dc']], st.supply, (v) => { st.supply = v; st.on = false; buildTab('speaker'); }).root);
  if (st.supply === 'lfg') {
    controlsBody.append(
      seg('ctl.on', [['off', 'lfg.off'], ['on', 'lfg.on']], st.on ? 'on' : 'off', (v) => { st.on = v === 'on'; refresh(); }).root,
      seg('ctl.fs', SPK_FREQS.map((f, i) => [i, `f${f}`]), st.fIdx, (v) => { st.fIdx = Number(v); refresh(); }).root,
      createSlider({ labelKey: 'ctl.amp', min: 0.2, max: 1, step: 0.1, value: st.amp, unit: '', decimals: 1, onInput: (v) => { st.amp = v; refresh(); } }).root,
    );
  } else {
    controlsBody.append(seg('ctl.switch', [['open', 'open'], ['closed', 'closed']], st.on ? 'closed' : 'open', (v) => { st.on = v === 'closed'; refresh(); }).root);
  }
  controlsBody.append(seg('ctl.diam', [[21, 'diam.21'], [5, 'diam.5']], st.diam, (v) => { st.diam = Number(v); refresh(); }).root, ...soundControls(true), resetBtn('speaker'));
  ui.dl = el('dl', { class: 'meas' });
  measuresBody.append(ui.dl);
}
function updateSpeaker() {
  const st = S.speaker;
  const lfg = st.supply === 'lfg';
  const f = spkF(st);
  const [a, b] = RANGE[st.diam];
  const rows = [];
  if (lfg) {
    const fq = st.on ? qty(f, 0, 'Hz') : '—';
    rows.push([t('m.fcur'), fq], [t('m.fmem'), fq], [t('m.emit'), st.on ? t('emit.yes', { f: qty(f, 0, 'Hz') }) : t('emit.off')]);
    rows.push([t('m.Fdir'), st.on ? t('Fdir.alt') : t('Fdir.none')]);
    if (st.on) rows.push([t('m.suits'), t(f >= a && f <= b ? 'suits.yes' : 'suits.no', { r: t(`range.${st.diam}`) })]);
  } else {
    rows.push([t('m.fcur'), st.on ? qty(0, 0, 'Hz') : '—'], [t('m.emit'), st.on ? t('emit.dc') : t('emit.off')], [t('m.Fdir'), st.on ? t('Fdir.right') : t('Fdir.none')]);
  }
  measRows(ui.dl, rows);
}

/* ---------- air ---------- */
function buildAir() {
  const st = S.air;
  controlsBody.append(
    createSlider({ labelKey: 'ctl.fair', min: 1, max: 100, step: 1, value: st.f, unit: 'Hz', decimals: 0, onInput: (v) => { st.f = v; refresh(); } }).root,
    createSlider({ labelKey: 'ctl.ampAir', min: 1, max: 5, step: 1, value: st.amp, unit: '', decimals: 0, onInput: (v) => { st.amp = v; refresh(); } }).root,
    seg('ctl.layers', [['no', 'no'], ['yes', 'yes']], st.layers ? 'yes' : 'no', (v) => { st.layers = v === 'yes'; refresh(); }).root,
    resetBtn('air'),
  );
  ui.dl = el('dl', { class: 'meas' });
  measuresBody.append(ui.dl);
}
function updateAir() {
  const st = S.air;
  measRows(ui.dl, [
    [t('m.fgen'), qty(st.f, 0, 'Hz')],
    [t('m.fv'), yn(st.f <= 10)],
    [t('m.flame'), t(st.f <= 10 ? 'flame.osc' : 'flame.wide')],
  ]);
}

/* ---------- vacuum ---------- */
function buildVacuum() {
  const st = S.vacuum;
  ui.pump = createButton({ labelKey: st.pumping ? 'ctl.pumpOff' : 'ctl.pumpOn', variant: 'primary', onClick: () => {
    st.pumping = !st.pumping; st.venting = false;
    ui.pump.dataset.i18n = st.pumping ? 'ctl.pumpOff' : 'ctl.pumpOn'; ui.pump.textContent = t(ui.pump.dataset.i18n);
    refresh();
  } });
  controlsBody.append(
    seg('ctl.switch', [['open', 'open'], ['closed', 'closed']], st.closed ? 'closed' : 'open', (v) => { st.closed = v === 'closed'; refresh(); }).root,
    btnRow(ui.pump, createButton({ labelKey: 'ctl.vent', variant: 'secondary', onClick: () => {
      st.pumping = false; st.venting = true;
      ui.pump.dataset.i18n = 'ctl.pumpOn'; ui.pump.textContent = t('ctl.pumpOn');
      refresh();
    } })),
    ...soundControls(), resetBtn('vacuum'),
  );
  ui.dl = el('dl', { class: 'meas' });
  measuresBody.append(ui.dl);
}
function updateVacuum() {
  const st = S.vacuum;
  const out = !st.closed ? '—' : t(st.p > 0.6 ? 'out.loud' : st.p > 0.2 ? 'out.weak' : st.p > 0.03 ? 'out.faint' : 'out.none');
  measRows(ui.dl, [
    [t('m.p'), qty(st.p, st.p < 0.1 ? 3 : 2, 'bar')],
    [t('m.lamp'), t(st.closed ? 'lamp.on' : 'lamp.off')],
    [t('m.bell'), t(st.closed ? 'bell.on' : 'bell.off')],
    [t('m.outside'), out],
  ]);
}

/* ---------- speed ---------- */
function buildSpeed() {
  const st = S.speed;
  const nudge = (d) => () => { st.x = clamp(Math.round((st.x + d) * 10) / 10, 0, 100); refresh(); };
  controlsBody.append(
    seg('ctl.fsp', SP_FREQS.map((f) => [f, `f${f}`]), st.f, (v) => { st.f = Number(v); st.pending = null; st.fb = null; refresh(); }).root,
    seg('ctl.temp', [[20, 'temp.20'], [0, 'temp.0']], st.temp, (v) => { st.temp = Number(v); st.pending = null; st.fb = null; refresh(); }).root,
    el('div', { class: 'ctl-head', style: 'margin-top:10px' }, el('span', { class: 'ctl-label', dataset: { i18n: 'ctl.move' } }, t('ctl.move'))),
    btnRow(
      createButton({ labelKey: 'mv.m1', variant: 'secondary', onClick: nudge(-1) }),
      createButton({ labelKey: 'mv.m01', variant: 'secondary', onClick: nudge(-0.1) }),
      createButton({ labelKey: 'mv.p01', variant: 'secondary', onClick: nudge(0.1) }),
      createButton({ labelKey: 'mv.p1', variant: 'secondary', onClick: nudge(1) }),
    ),
    btnRow(createButton({ labelKey: 'ctl.recordPos', variant: 'primary', onClick: recordPos })),
    hint('hint.speed'), ...soundControls(), resetBtn('speed'),
  );
  ui.dl = el('dl', { class: 'meas' });
  ui.table = el('table', { class: 'data' });
  ui.clear = el('div', { class: 'btn-row', style: 'margin-top:8px' }, [createButton({ labelKey: 'ctl.clearTable', variant: 'ghost', onClick: () => { st.rows = []; st.pending = null; st.fb = null; refresh(); } })]);
  ui.status = statusBox();
  measuresBody.append(ui.dl, ui.table, ui.clear, ui.status);
}
const IN_PHASE = 0.03; // cycles (≈ 11°)
function recordPos() {
  const st = S.speed;
  const err = phaseErr(st, st.x) > IN_PHASE;
  if (err) { st.fb = { type: 'bad', key: 'fb.notPhase' }; refresh(); return; }
  if (st.pending == null) { st.pending = st.x; st.fb = { type: 'good', key: 'fb.first' }; refresh(); return; }
  if (st.x <= st.pending + 0.5) { st.fb = { type: 'warn', key: 'fb.notFurther' }; refresh(); return; }
  const lam = lambdaCm(st);
  const skip = Math.abs(st.x - st.pending - lam) > 0.15 * lam;
  st.rows.push({ f: st.f, x1: st.pending, x2: st.x, skip });
  st.pending = null;
  st.fb = skip ? { type: 'bad', key: 'fb.skip' } : null;
  refresh();
}
function updateSpeed() {
  const st = S.speed;
  measRows(ui.dl, [
    [t('m.fgen'), qty(st.f, 0, 'Hz')],
    [t('m.sh'), vbText(SH_FOR[st.f] / 1000)],
    [t('m.pos'), qty(st.x, 1, 'cm')],
  ]);
  const sig = calcSig(st.rows) + st.rows.length;
  if (sig !== tableSig) {
    tableSig = sig;
    const head = el('tr', {}, ['col.f', 'col.x1', 'col.x2', 'col.d', 'col.v'].map((k) => el('th', {}, t(k))));
    const body = st.rows.map((r) => {
      const d = r.x2 - r.x1;
      return el('tr', { class: r.skip ? 'bad-row' : '' }, [
        el('td', {}, num(r.f, 0)), el('td', {}, num(r.x1, 1)), el('td', { class: r.skip ? 'bad-cell' : '' }, num(r.x2, 1)),
        calcCell(r, 'd', { expected: d, decimals: 1, tol: 0.15, err: r.skip, onCheck: (res) => { st.fb = fbOf(res, 'fb.dOk', 'fb.dWrong'); refresh(); } }),
        calcCell(r, 'v', { expected: (d / 100) * r.f, decimals: 0, tol: (d / 100) * r.f * 0.02, err: r.skip, disabled: !calcDone(r, 'd'), onCheck: (res) => { st.fb = fbOf(res, 'fb.vOk', 'fb.vWrong'); refresh(); } }),
      ]);
    });
    ui.table.replaceChildren(el('thead', {}, head), el('tbody', {}, body));
    tableSig = calcSig(st.rows) + st.rows.length;
  }
  ui.table.hidden = st.rows.length === 0;
  ui.clear.hidden = ui.table.hidden;
  showStatus(ui.status, st.fb);
}
const fbOf = (res, okKey, badKey) => (res === 'invalid' ? { type: 'warn', key: 'calcInvalid' } : res === 'wrong' ? { type: 'bad', key: badKey } : { type: 'good', key: okKey });

/* ---------- tabs ---------- */
const BUILD = { sources: buildSources, force: buildForce, speaker: buildSpeaker, air: buildAir, vacuum: buildVacuum, speed: buildSpeed };
const UPDATE = { sources: updateSources, force: updateForce, speaker: updateSpeaker, air: updateAir, vacuum: updateVacuum, speed: updateSpeed };
let lastTab = null;
function buildTab(id) {
  if (id !== lastTab) { stopVoices(); for (const k of Object.keys(lastGain)) delete lastGain[k]; lastTab = id; }
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
function resetTab(id) { stopVoices(); for (const k of Object.keys(lastGain)) delete lastGain[k]; S[id] = initialState(id); buildTab(id); }

const extra = { en: {}, fr: {} };
for (const lang of ['en', 'fr']) {
  for (const f of [...new Set([...SPK_FREQS, ...SP_FREQS, 100, 200])]) extra[lang][`f${f}`] = `${num(f, 0, lang)} Hz`;
  Object.assign(extra[lang], { 'mv.m1': '−1 cm', 'mv.p1': '+1 cm', 'mv.m01': `−${num(0.1, 1, lang)} cm`, 'mv.p01': `+${num(0.1, 1, lang)} cm` });
}
onLangChange(() => { if (shell) buildTab(shell.tab); });

shell = initSim({
  strings: { en: { ...strings.en, ...extra.en }, fr: { ...strings.fr, ...extra.fr } },
  tabs: TABS.map((id) => ({ id, labelKey: `tab.${id}` })),
  initialTab: 'sources',
  onTab: buildTab,
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, phaseErr, lambdaCm };
