// Sec 2 S — Chapter 1, sections 1.1 (periodic motion) and 1.4 (waves: recall, visualization on an oscilloscope)
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange, getLang } from '../../../shared/i18n.js';
import { num, qty } from '../../../shared/format.js';
import { createButton, createSegmented, createSlider, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, font, arrow } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { label } from '../../../shared/figures.js';
import { calcCell, calcSig, calcDone } from '../../../shared/calc-cell.js';
import { drawScope, drawLFG, DIV_X, DIV_Y, svText, vbText } from '../../../shared/oscilloscope.js';
import { drawLead } from '../../../shared/circuit-draw.js';

const TAU = 2 * Math.PI;
const frac = (x) => x - Math.floor(x);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/* ================================================================
   Model
   ================================================================ */
// Periodic motions (1.1). speed: seconds of the motion per second on the screen.
// uf: seconds per display unit of the timer; fExp: f is typed as a number of 10^fExp Hz.
const OBJ = {
  pendulum: { T: 2, speed: 1, unit: 's', uf: 1, dec: 2, n: [1, 2, 5, 10], Tdec: 2, fDec: 2, fExp: 0 },
  fork: { T: 1 / 440, speed: 0.002, unit: 'ms', uf: 0.001, dec: 2, n: [1, 2, 5, 10], Tdec: 5, fDec: 0, fExp: 0 },
  earthDay: { T: 86400, speed: 43200, unit: 'h', uf: 3600, dec: 1, n: [1, 2], Tdec: 0, fDec: 2, fExp: -5 },
  earthYear: { T: 365 * 86400, speed: (365 * 86400) / 12, unit: 'day', uf: 86400, dec: 0, n: [1], Tdec: 0, fDec: 2, fExp: -8 },
};
const OBJ_IDS = ['pendulum', 'fork', 'earthDay', 'earthYear'];

// Wave (1.4 a)
const ROPE = { x0: 60, len: 4, pxPerM: 120, y0: 92, pxPerCm: 8 };
const GX = { y0: 236, pxPerCm: 10 }; // graph y(x), same x scale as the rope
const GT = { x0: 60, y0: 384, pxPerCm: 10, win: 5 }; // graph y(t), 5 s window
const wy = (st, x, tt) => (tt >= x / st.v ? st.a * Math.sin(TAU * st.f * (tt - x / st.v)) : 0);
const wvy = (st, x, tt) => (tt >= x / st.v ? st.a * TAU * st.f * Math.cos(TAU * st.f * (tt - x / st.v)) : 0);

// Oscilloscope (1.4 b)
const FREQS = [50, 100, 200, 250, 500, 1000, 2000]; // Hz
const SVS = [0.5, 1, 2, 5]; // V/div
const SHS = [10, 5, 2, 1, 0.5, 0.2, 0.1]; // ms/div
const FORK_F = 440, MIC_U0 = 2, MIC_TAU = 4; // microphone voltage after the amplifier (V), fading time constant (s)
const SHAPES = {
  sine: (p) => Math.sin(TAU * p),
  square: (p) => (p < 0.5 ? 1 : -1),
  triangular: (p) => (p < 0.25 ? 4 * p : p < 0.75 ? 2 - 4 * p : 4 * p - 4),
};

let now = 0; // screen clock (s)

function initialState(tab) {
  if (tab === 'periodic') return { obj: 'pendulum', n: 5, simT: 0, running: false, swStart: 0, sw: 0, count: 0, rows: [], fb: null };
  if (tab === 'wave') return { kind: 'rope', a: 2, f: 1, v: 1, tw: 0, playing: true, xM: 1.5, arrows: false, marks: false, rows: [], fb: null };
  return { input: 'lfg', shape: 'sine', fIdx: 4, um: 2, sv: 1, sh: 0.5, hidden: false, hf: 250, struck: null, rows: [], fb: null };
}
const TABS = ['periodic', 'wave', 'scope'];
let S = Object.fromEntries(TABS.map((k) => [k, initialState(k)]));

function forkAmp(st) { return st.struck == null ? 0 : MIC_U0 * Math.exp(-(now - st.struck) / MIC_TAU); }
function scopeF(st) { return st.input === 'fork' ? FORK_F : st.hidden ? st.hf : FREQS[st.fIdx]; }
function scopeV(st, tt) {
  if (st.input === 'fork') return forkAmp(st) * Math.sin(TAU * FORK_F * tt);
  return st.um * SHAPES[st.shape](frac(scopeF(st) * tt));
}

/* ================================================================
   Canvas and loop
   ================================================================ */
const HEIGHTS = { periodic: 340, wave: 462, scope: 360 };
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
const cur = () => S[shell.tab];

const loop = createLoop({
  step(dt) {
    now += dt;
    if (!shell) return false;
    const st = cur();
    if (shell.tab === 'periodic') {
      st.simT += dt * OBJ[st.obj].speed;
      if (st.running) { st.sw = st.simT - st.swStart; st.count = Math.floor(st.sw / OBJ[st.obj].T + 1e-9); }
    } else if (shell.tab === 'wave') {
      if (st.playing) st.tw += dt;
    }
    return true;
  },
  render() { draw(); updateMeasures(); },
});

/* ================================================================
   Drawing
   ================================================================ */
function tag(ctx, s, x, y, color = cssVar('--text'), size = 13, weight = 700, align = 'center') {
  ctx.fillStyle = color;
  ctx.font = font(size, weight);
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}
function dashed(ctx, x1, y1, x2, y2, color = cssVar('--muted')) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 5]);
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.restore();
}
function dblArrow(ctx, x1, y1, x2, y2, color, text) {
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.8;
  arrow(ctx, (x1 + x2) / 2, (y1 + y2) / 2, x1, y1, 7);
  arrow(ctx, (x1 + x2) / 2, (y1 + y2) / 2, x2, y2, 7);
  if (text) label(ctx, text, (x1 + x2) / 2, y1 - 10, { size: 14, weight: 800, color });
}

function draw() {
  if (!shell) return;
  const tab = shell.tab;
  if (view.height !== HEIGHTS[tab]) view.setLogicalSize(600, HEIGHTS[tab]);
  const ctx = view.begin();
  ctx.fillStyle = cssVar('--scene-bg');
  roundRect(ctx, 0, 0, 600, HEIGHTS[tab], 14);
  ctx.fill();
  if (tab === 'periodic') drawPeriodic(ctx, S.periodic);
  else if (tab === 'wave') drawWave(ctx, S.wave);
  else drawScopeTab(ctx, S.scope);
}

/* ---------- Tab 1: periodic motion ---------- */
function drawPeriodic(ctx, st) {
  const o = OBJ[st.obj];
  const ph = frac(st.simT / o.T);
  if (st.obj === 'earthDay') drawEarthDay(ctx, ph);
  else if (st.obj === 'earthYear') drawEarthYear(ctx, ph);
  else if (st.obj === 'pendulum') drawClock(ctx, st);
  else drawFork(ctx, ph);
  // timer (shows the real time of the motion)
  const x = 440, y = 16, w = 146, h = 64;
  ctx.fillStyle = cssVar('--box');
  roundRect(ctx, x, y, w, h, 10); ctx.fill();
  ctx.fillStyle = cssVar('--lcd-bg');
  roundRect(ctx, x + 8, y + 8, w - 16, 32, 5); ctx.fill();
  tag(ctx, timerText(st), x + w / 2, y + 25, cssVar('--lcd-ink'), 17, 800);
  tag(ctx, `${t('timer')} · ${t(st.running ? 'state.run' : 'state.stop')}`, x + w / 2, y + 52, '#e6ebf2', 11, 700);
  label(ctx, t(`speed.${st.obj}`), 14, HEIGHTS.periodic - 16, { size: 12, weight: 700, color: cssVar('--muted'), align: 'left' });
}
function unitText(o) { return o.unit === 'day' ? t('unit.day') : o.unit; }
function timerText(st) { const o = OBJ[st.obj]; return qty(st.sw / o.uf, o.dec, unitText(o)); }

function drawEarthDay(ctx, ph) {
  const sx = 70, sy = 170, cx = 330, cy = 170, R = 100;
  drawSun(ctx, sx, sy, 34);
  ctx.strokeStyle = cssVar('--sun'); ctx.lineWidth = 2;
  for (const dy of [-60, 0, 60]) { ctx.fillStyle = cssVar('--sun'); arrow(ctx, sx + 50, sy + dy * 0.6, cx - R - 14, cy + dy, 7); }
  // Earth seen from above the North Pole: turns anticlockwise
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip();
  ctx.fillStyle = cssVar('--earth-sea'); ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
  const rot = -TAU * ph;
  ctx.fillStyle = cssVar('--earth-land');
  for (const [a, r, s] of [[0.2, 0.62, 30], [1.4, 0.55, 38], [2.6, 0.7, 26], [3.6, 0.45, 34], [4.8, 0.66, 30], [5.6, 0.3, 22]]) {
    const ang = Math.PI + a + rot;
    ctx.beginPath(); ctx.ellipse(cx + Math.cos(ang) * R * r, cy + Math.sin(ang) * R * r, s, s * 0.7, ang, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = cssVar('--night');
  ctx.fillRect(cx, cy - R, R, 2 * R); // half turned away from the Sun
  ctx.restore();
  ctx.strokeStyle = cssVar('--wire'); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
  // reference line (towards the Sun) and the town A
  dashed(ctx, cx, cy, cx - R - 30, cy, cssVar('--accent'));
  const ang = Math.PI + rot;
  const ax = cx + Math.cos(ang) * R, ay = cy + Math.sin(ang) * R;
  ctx.fillStyle = cssVar('--accent');
  ctx.beginPath(); ctx.arc(ax, ay, 7, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
  label(ctx, t('town'), cx + Math.cos(ang) * (R + 18), cy + Math.sin(ang) * (R + 18), { size: 15, weight: 800, color: cssVar('--accent') });
  // pole and sense of rotation
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, 4, 0, TAU); ctx.fill();
  label(ctx, 'N', cx + 12, cy - 10, { size: 13, weight: 800, color: '#fff', halo: false });
  ctx.strokeStyle = cssVar('--text'); ctx.fillStyle = cssVar('--text'); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, R + 34, -0.35, -1.25, true); ctx.stroke();
  const ea = -1.25;
  arrow(ctx, cx + Math.cos(ea + 0.05) * (R + 34), cy + Math.sin(ea + 0.05) * (R + 34), cx + Math.cos(ea) * (R + 34), cy + Math.sin(ea) * (R + 34), 9);
  label(ctx, t('sun'), sx, sy + 52, { size: 13, weight: 700 });
  label(ctx, t('day'), cx - R / 2, cy + R + 16, { size: 12, color: cssVar('--muted') });
  label(ctx, t('night'), cx + R / 2, cy + R + 16, { size: 12, color: cssVar('--muted') });
  label(ctx, t('northPole'), cx, 22, { size: 12, weight: 700, color: cssVar('--muted') });
}
function drawSun(ctx, x, y, r) {
  ctx.fillStyle = cssVar('--sun');
  ctx.strokeStyle = cssVar('--sun'); ctx.lineWidth = 3;
  for (let k = 0; k < 12; k++) {
    const a = (k * TAU) / 12;
    ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * (r + 5), y + Math.sin(a) * (r + 5)); ctx.lineTo(x + Math.cos(a) * (r + 14), y + Math.sin(a) * (r + 14)); ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
}
function drawEarthYear(ctx, ph) {
  const cx = 250, cy = 172, R = 130;
  ctx.strokeStyle = cssVar('--border'); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
  drawSun(ctx, cx, cy, 30);
  label(ctx, t('sun'), cx, cy + 52, { size: 13, weight: 700 });
  dashed(ctx, cx + 46, cy, cx + R + 30, cy, cssVar('--accent'));
  const ang = -TAU * ph;
  const ex = cx + Math.cos(ang) * R, ey = cy + Math.sin(ang) * R;
  ctx.fillStyle = cssVar('--earth-sea');
  ctx.beginPath(); ctx.arc(ex, ey, 15, 0, TAU); ctx.fill();
  ctx.fillStyle = cssVar('--earth-land');
  ctx.beginPath(); ctx.ellipse(ex - 4, ey - 3, 6, 4, 0.5, 0, TAU); ctx.fill();
  ctx.save();
  ctx.beginPath(); ctx.arc(ex, ey, 15, 0, TAU); ctx.clip();
  ctx.fillStyle = cssVar('--night');
  ctx.translate(ex, ey); ctx.rotate(ang);
  ctx.fillRect(0, -16, 16, 32); // the side away from the Sun
  ctx.restore();
  label(ctx, t('earth'), ex, ey - 26, { size: 13, weight: 800, color: cssVar('--earth-sea') });
  ctx.strokeStyle = cssVar('--text'); ctx.fillStyle = cssVar('--text'); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, R + 22, -2.0, -2.9, true); ctx.stroke();
  arrow(ctx, cx + Math.cos(-2.85) * (R + 22), cy + Math.sin(-2.85) * (R + 22), cx + Math.cos(-2.9) * (R + 22), cy + Math.sin(-2.9) * (R + 22), 9);
  label(ctx, t('northPole'), 20, 20, { size: 12, weight: 700, color: cssVar('--muted'), align: 'left' });
}
function drawClock(ctx, st) {
  const x0 = 200, w = 200, top = 16, bot = 326;
  ctx.fillStyle = cssVar('--clock-case');
  roundRect(ctx, x0, top, w, bot - top, 14); ctx.fill();
  ctx.fillStyle = cssVar('--scene-bg');
  roundRect(ctx, x0 + 22, 134, w - 44, 176, 8); ctx.fill(); // glass window
  // face
  const fx = 300, fy = 76, fr = 46;
  ctx.fillStyle = '#fbf8ef'; ctx.beginPath(); ctx.arc(fx, fy, fr, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#2b2f36'; ctx.lineWidth = 2; ctx.stroke();
  for (let k = 0; k < 12; k++) {
    const a = (k * TAU) / 12;
    ctx.beginPath(); ctx.moveTo(fx + Math.cos(a) * (fr - 8), fy + Math.sin(a) * (fr - 8)); ctx.lineTo(fx + Math.cos(a) * (fr - 3), fy + Math.sin(a) * (fr - 3)); ctx.stroke();
  }
  const secA = -Math.PI / 2 + (TAU * Math.floor(st.simT)) / 60;
  ctx.strokeStyle = cssVar('--accent'); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx + Math.cos(secA) * (fr - 10), fy + Math.sin(secA) * (fr - 10)); ctx.stroke();
  ctx.strokeStyle = '#2b2f36'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx + 20, fy - 18); ctx.moveTo(fx, fy); ctx.lineTo(fx - 4, fy - 32); ctx.stroke();
  // pendulum: T = 2 s
  const px = 300, py = 140, L = 140;
  const th = 0.2 * Math.sin((TAU * st.simT) / OBJ.pendulum.T);
  dashed(ctx, px, py, px, py + L + 30, cssVar('--accent'));
  const bx = px + Math.sin(th) * L, by = py + Math.cos(th) * L;
  ctx.strokeStyle = cssVar('--brass-dark'); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(bx, by); ctx.stroke();
  ctx.fillStyle = cssVar('--brass');
  ctx.beginPath(); ctx.arc(bx, by, 17, 0, TAU); ctx.fill();
  ctx.strokeStyle = cssVar('--brass-dark'); ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#2b2f36'; ctx.beginPath(); ctx.arc(px, py, 4, 0, TAU); ctx.fill();
  label(ctx, t('ref'), px - 50, py + 22, { size: 11, color: cssVar('--accent') });
}
function drawFork(ctx, ph) {
  const cx = 250, base = 200, top = 40, gap = 30;
  const d = 12 * Math.sin(TAU * ph); // outward displacement of the tips (drawn much larger than it is)
  ctx.fillStyle = cssVar('--wood');
  roundRect(ctx, cx - 80, 254, 160, 34, 6); ctx.fill();
  label(ctx, t('fork'), cx, 271, { size: 12, weight: 700, color: '#fff', halo: false });
  ctx.strokeStyle = cssVar('--fork'); ctx.lineCap = 'round'; ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(cx, 256); ctx.lineTo(cx, base + 26);
  ctx.moveTo(cx - gap - d, top); ctx.quadraticCurveTo(cx - gap - d * 0.4, base - 60, cx - gap, base);
  ctx.quadraticCurveTo(cx, base + 34, cx + gap, base);
  ctx.quadraticCurveTo(cx + gap + d * 0.4, base - 60, cx + gap + d, top);
  ctx.stroke();
  ctx.lineCap = 'butt';
  dashed(ctx, cx + gap, top - 24, cx + gap, base - 60, cssVar('--accent'));
  ctx.fillStyle = cssVar('--accent');
  ctx.beginPath(); ctx.arc(cx + gap + d, top + 4, 6, 0, TAU); ctx.fill();
  label(ctx, t('ref'), cx + gap + 46, top - 18, { size: 11, color: cssVar('--accent') });
  // trace of the tip as a function of time (slow motion)
  const gx = 370, gy = 200, gw = 210;
  ctx.strokeStyle = cssVar('--border'); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + gw, gy); ctx.stroke();
  ctx.strokeStyle = cssVar('--accent'); ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= 120; i++) {
    const u = i / 120, p = ph - (1 - u) * 2; // the last 2 cycles
    const yy = gy - 22 * Math.sin(TAU * p);
    if (i) ctx.lineTo(gx + u * gw, yy); else ctx.moveTo(gx + u * gw, yy);
  }
  ctx.stroke();
}

/* ---------- Tab 2: wave ---------- */
const X = (x) => ROPE.x0 + x * ROPE.pxPerM;
function drawWave(ctx, st) {
  const x1 = X(ROPE.len);
  const front = Math.min(ROPE.len, st.v * st.tw);
  // source S: vibrator
  ctx.fillStyle = cssVar('--box');
  roundRect(ctx, 14, ROPE.y0 - 34, 34, 68, 6); ctx.fill();
  tag(ctx, t('source'), 31, ROPE.y0 - 46, cssVar('--text'), 15, 800);
  // absorbing end
  ctx.fillStyle = cssVar('--wood');
  ctx.fillRect(x1 + 4, ROPE.y0 - 40, 12, 80);
  label(ctx, t('absorber'), x1 - 6, ROPE.y0 + 56, { size: 11, color: cssVar('--muted'), align: 'right' });
  dashed(ctx, X(0), ROPE.y0, x1, ROPE.y0, cssVar('--border'));
  if (st.kind === 'rope') {
    ctx.strokeStyle = cssVar('--rubber'); ctx.lineWidth = 3.5; ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i <= 240; i++) {
      const x = (i / 240) * ROPE.len;
      const yy = ROPE.y0 - wy(st, x, st.tw) * ROPE.pxPerCm;
      if (i) ctx.lineTo(X(x), yy); else ctx.moveTo(X(x), yy);
    }
    ctx.stroke();
    if (st.arrows) {
      const vmax = st.a * TAU * st.f;
      for (let x = 0.25; x < ROPE.len; x += 0.5) {
        const vy = wvy(st, x, st.tw);
        if (Math.abs(vy) < 0.05 * vmax) continue;
        const yy = ROPE.y0 - wy(st, x, st.tw) * ROPE.pxPerCm, L = (vy / vmax) * 30;
        ctx.strokeStyle = cssVar('--primary'); ctx.fillStyle = cssVar('--primary'); ctx.lineWidth = 2.5;
        arrow(ctx, X(x), yy, X(x), yy - L, 8);
      }
    }
    const yM = ROPE.y0 - wy(st, st.xM, st.tw) * ROPE.pxPerCm;
    ctx.fillStyle = cssVar('--accent');
    ctx.beginPath(); ctx.arc(X(st.xM), yM, 7, 0, TAU); ctx.fill();
    label(ctx, t('pointM'), X(st.xM), yM - 18, { size: 14, weight: 800, color: cssVar('--accent') });
  } else {
    // spring: coils displaced along the axis (displacements drawn larger than they are, but the coils never cross)
    const lam = (st.v / st.f) * ROPE.pxPerM;
    const k = Math.min(6, (0.8 * lam) / (TAU * st.a));
    const iM = Math.round(st.xM / 0.1);
    for (let i = 0; i <= 40; i++) {
      const x = i * 0.1;
      const xx = X(x) + wy(st, x, st.tw) * k;
      ctx.strokeStyle = i === iM ? cssVar('--accent') : cssVar('--spring-coil');
      ctx.lineWidth = i === iM ? 3 : 2;
      ctx.beginPath(); ctx.ellipse(xx, ROPE.y0, 4, 20, 0, 0, TAU); ctx.stroke();
    }
    if (st.arrows) {
      const vmax = st.a * TAU * st.f;
      for (let x = 0.25; x < ROPE.len; x += 0.5) {
        const vx = wvy(st, x, st.tw);
        if (Math.abs(vx) < 0.05 * vmax) continue;
        const xx = X(x) + wy(st, x, st.tw) * k, L = (vx / vmax) * 26;
        ctx.strokeStyle = cssVar('--primary'); ctx.fillStyle = cssVar('--primary'); ctx.lineWidth = 2.5;
        arrow(ctx, xx, ROPE.y0 - 32, xx + L, ROPE.y0 - 32, 8);
      }
    }
    const xM = X(st.xM) + wy(st, st.xM, st.tw) * k;
    label(ctx, t('pointM'), xM, ROPE.y0 + 34, { size: 14, weight: 800, color: cssVar('--accent') });
  }
  // wave front
  if (front < ROPE.len - 1e-6 && st.tw > 0) {
    ctx.fillStyle = cssVar('--muted');
    ctx.beginPath(); ctx.moveTo(X(front), ROPE.y0 - 46); ctx.lineTo(X(front) - 6, ROPE.y0 - 56); ctx.lineTo(X(front) + 6, ROPE.y0 - 56); ctx.fill();
  }

  // ----- graph y(x) at the instant tw -----
  const lam = st.v / st.f;
  graphFrame(ctx, GX.y0, 52, t('g.yx', { t: num(st.tw, 2) }), t('ax.x'), (x) => X(x), ROPE.len, 0.5, GX.pxPerCm);
  ctx.strokeStyle = cssVar('--primary'); ctx.lineWidth = 2.4;
  ctx.beginPath();
  for (let i = 0; i <= 240; i++) {
    const x = (i / 240) * ROPE.len;
    const yy = GX.y0 - wy(st, x, st.tw) * GX.pxPerCm;
    if (i) ctx.lineTo(X(x), yy); else ctx.moveTo(X(x), yy);
  }
  ctx.stroke();
  ctx.fillStyle = cssVar('--accent');
  ctx.beginPath(); ctx.arc(X(st.xM), GX.y0 - wy(st, st.xM, st.tw) * GX.pxPerCm, 4.5, 0, TAU); ctx.fill();
  if (st.marks) {
    // two successive crests next to the front: x_k = V (t − (1/4 + k) T)
    const crests = [];
    for (let k = 0; k < 40 && crests.length < 2; k++) {
      const x = st.v * (st.tw - (0.25 + k) / st.f);
      if (x < 0) break;
      if (x <= ROPE.len) crests.push(x);
    }
    if (crests.length === 2) {
      const yy = GX.y0 - st.a * GX.pxPerCm - 10;
      dashed(ctx, X(crests[0]), yy, X(crests[0]), GX.y0 - st.a * GX.pxPerCm, cssVar('--good'));
      dashed(ctx, X(crests[1]), yy, X(crests[1]), GX.y0 - st.a * GX.pxPerCm, cssVar('--good'));
      dblArrow(ctx, X(crests[1]), yy, X(crests[0]), yy, cssVar('--good'), `λ = ${qty(lam, 2, 'm')}`);
    }
  }

  // ----- graph y(t) of M -----
  const tw0 = Math.max(0, st.tw - GT.win);
  const T = (tt) => GT.x0 + ((tt - tw0) / GT.win) * (X(ROPE.len) - GT.x0);
  graphFrame(ctx, GT.y0, 52, t('g.yt'), t('ax.t'), T, null, null, GT.pxPerCm, tw0);
  ctx.strokeStyle = cssVar('--accent'); ctx.lineWidth = 2.4;
  ctx.beginPath();
  const n = 300;
  for (let i = 0; i <= n; i++) {
    const tt = tw0 + (i / n) * (st.tw - tw0);
    const yy = GT.y0 - wy(st, st.xM, tt) * GT.pxPerCm;
    if (i) ctx.lineTo(T(tt), yy); else ctx.moveTo(T(tt), yy);
  }
  ctx.stroke();
  if (st.marks) {
    const t0M = st.xM / st.v;
    const ks = [];
    for (let k = Math.floor((st.tw - t0M) * st.f); k >= 0 && ks.length < 2; k--) {
      const tc = t0M + (0.25 + k) / st.f;
      if (tc <= st.tw && tc >= tw0) ks.push(tc);
    }
    if (ks.length === 2) {
      const yy = GT.y0 - st.a * GT.pxPerCm - 10;
      dashed(ctx, T(ks[0]), yy, T(ks[0]), GT.y0 - st.a * GT.pxPerCm, cssVar('--good'));
      dashed(ctx, T(ks[1]), yy, T(ks[1]), GT.y0 - st.a * GT.pxPerCm, cssVar('--good'));
      dblArrow(ctx, T(ks[1]), yy, T(ks[0]), yy, cssVar('--good'), `T = ${qty(1 / st.f, 2, 's')}`);
    }
  }
}
// Axes of a graph: horizontal axis at y0 (zero of y), vertical axis y (cm) with ±4 cm.
function graphFrame(ctx, y0, half, title, xLabel, Xf, xMax, xStep, pxPerCm, tStart) {
  const xa = Xf === X ? X(0) : GT.x0, xb = X(ROPE.len);
  ctx.strokeStyle = cssVar('--border'); ctx.lineWidth = 1;
  ctx.fillStyle = cssVar('--muted'); ctx.font = font(12); ctx.textBaseline = 'top'; ctx.textAlign = 'center';
  ctx.beginPath();
  if (xMax != null) {
    for (let x = 0; x <= xMax + 1e-9; x += xStep / 2) {
      ctx.moveTo(Xf(x), y0 - half); ctx.lineTo(Xf(x), y0 + half);
    }
    ctx.stroke();
    for (let x = 0; x <= xMax + 1e-9; x += xStep * 2) ctx.fillText(num(x, 0), Xf(x), y0 + half + 2);
  } else {
    const t1 = tStart + GT.win;
    for (let tt = Math.ceil(tStart * 2) / 2; tt <= t1 + 1e-9; tt += 0.5) { ctx.moveTo(Xf(tt), y0 - half); ctx.lineTo(Xf(tt), y0 + half); }
    ctx.stroke();
    for (let tt = Math.ceil(tStart); tt <= t1 + 1e-9; tt += 1) ctx.fillText(num(tt, 0), Xf(tt), y0 + half + 2);
  }
  // y grid each cm
  ctx.beginPath();
  for (let c = -4; c <= 4; c++) { if (c === 0) continue; ctx.moveTo(xa, y0 - c * pxPerCm); ctx.lineTo(xb, y0 - c * pxPerCm); }
  ctx.stroke();
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (const c of [-4, -2, 2, 4]) ctx.fillText(num(c, 0), xa - 5, y0 - c * pxPerCm);
  ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(xa, y0 - half); ctx.lineTo(xa, y0 + half); ctx.moveTo(xa, y0); ctx.lineTo(xb + 10, y0); ctx.stroke();
  ctx.fillStyle = cssVar('--text');
  ctx.font = font(13, 700);
  ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  ctx.fillText(t('ax.y'), xa - 40, y0 - half - 2);
  ctx.textAlign = 'right';
  ctx.fillText(xLabel, xb + 52, y0 - 3);
  ctx.textAlign = 'center';
  ctx.font = font(13, 700);
  ctx.fillText(title, (xa + xb) / 2, y0 - half - 4);
}

/* ---------- Tab 3: oscilloscope ---------- */
const BIG = { x: 16, y: 18, d: 26 };
function drawScopeTab(ctx, st) {
  const shS = st.sh / 1000;
  const curve = (x) => scopeV(st, x * shS) / st.sv;
  const g = drawScope(ctx, { ...BIG, curve, steady: true, spotX: 0, len: DIV_X, svLabel: svText(st.sv), vbLabel: vbText(shS), svName: 'Sv', vbName: 'Sh' });
  const um = st.input === 'fork' ? forkAmp(st) : st.um;
  if (um / st.sv > DIV_Y / 2 + 0.02) tag(ctx, t('scope.offscreen'), g.screen.x + g.screen.w / 2, g.screen.y + 16, '#ffd166', 12, 800);
  if (st.input === 'fork' && um < 0.02) tag(ctx, t('scope.silent'), g.screen.x + g.screen.w / 2, g.screen.y + 16, '#ffd166', 12, 800);
  const red = cssVar('--accent'), black = cssVar('--lead-black');
  if (st.input === 'lfg') {
    const l = drawLFG(ctx, 352, 50, 226, { name: t('lfg'), display: st.hidden ? '?' : qty(FREQS[st.fIdx], 0, 'Hz'), shape: st.shape });
    drawLead(ctx, g.A, l.out1, red, [g.A[0] + 40, l.out1[1] + 170]);
    drawLead(ctx, g.M, l.out2, black, [g.M[0] + 90, l.out2[1] + 150]);
  } else {
    // amplifier box, microphone and tuning fork on its resonance box
    const ax = 370, ay = 40, aw = 150, ah = 58;
    ctx.fillStyle = cssVar('--device'); ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1.5;
    roundRect(ctx, ax, ay, aw, ah, 8); ctx.fill(); ctx.stroke();
    tag(ctx, t('amp'), ax + aw / 2, ay + 20, cssVar('--text-on-meter'), 12, 800);
    const o1 = [ax + aw / 2 - 20, ay + ah - 12], o2 = [ax + aw / 2 + 20, ay + ah - 12];
    ctx.fillStyle = red; ctx.beginPath(); ctx.arc(o1[0], o1[1], 5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#1d1f24'; ctx.beginPath(); ctx.arc(o2[0], o2[1], 5, 0, TAU); ctx.fill();
    drawLead(ctx, g.A, o1, red, [g.A[0] + 30, o1[1] + 190]);
    drawLead(ctx, g.M, o2, black, [g.M[0] + 70, o2[1] + 170]);
    // fork
    const fx = 420, fb = 300, amp = forkAmp(st);
    const d = amp > 0.02 ? 2.5 * (amp / MIC_U0) * Math.sin(now * 90) : 0;
    ctx.fillStyle = cssVar('--wood'); roundRect(ctx, fx - 56, fb, 112, 34, 5); ctx.fill();
    ctx.strokeStyle = cssVar('--fork'); ctx.lineWidth = 8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(fx, fb); ctx.lineTo(fx, fb - 30);
    ctx.moveTo(fx - 16 - d, fb - 150); ctx.lineTo(fx - 16, fb - 50); ctx.quadraticCurveTo(fx, fb - 22, fx + 16, fb - 50); ctx.lineTo(fx + 16 + d, fb - 150);
    ctx.stroke(); ctx.lineCap = 'butt';
    label(ctx, '440 Hz', fx, fb + 17, { size: 11, weight: 800, color: '#fff', halo: false });
    if (amp > 0.05) {
      ctx.strokeStyle = cssVar('--muted'); ctx.lineWidth = 1.5;
      for (let k = 1; k <= 3; k++) {
        const r = 14 * k + ((now * 40) % 14);
        ctx.globalAlpha = Math.min(1, amp / MIC_U0) * (1 - k / 4);
        ctx.beginPath(); ctx.arc(fx + 24, fb - 110, r, -0.6, 0.6); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    // microphone on its stand
    const mx = 530, my = 190;
    ctx.strokeStyle = cssVar('--wire'); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(mx + 8, my + 10); ctx.lineTo(mx + 8, 330); ctx.moveTo(mx - 14, 330); ctx.lineTo(mx + 30, 330); ctx.stroke();
    ctx.fillStyle = cssVar('--box'); roundRect(ctx, mx - 14, my - 12, 34, 24, 8); ctx.fill();
    ctx.fillStyle = cssVar('--metal'); ctx.beginPath(); ctx.arc(mx - 14, my, 12, 0, TAU); ctx.fill();
    label(ctx, t('mic'), mx, my + 26, { size: 11, weight: 700 });
    drawLead(ctx, [mx + 20, my], [ax + aw - 10, ay + ah / 2], cssVar('--wire'), [mx + 60, my - 80]);
  }
}

/* ================================================================
   Pointer: drag the point M (tab 2)
   ================================================================ */
let dragM = false;
canvas.addEventListener('pointerdown', (ev) => {
  if (shell.tab !== 'wave') return;
  const p = view.toLogical(ev);
  if (p.y < ROPE.y0 - 60 || p.y > ROPE.y0 + 60 || p.x < X(0) - 10 || p.x > X(ROPE.len) + 10) return;
  dragM = true;
  canvas.setPointerCapture(ev.pointerId);
  moveM(p);
});
canvas.addEventListener('pointermove', (ev) => { if (dragM) moveM(view.toLogical(ev)); });
const endDrag = () => { dragM = false; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
function moveM(p) {
  S.wave.xM = clamp(Math.round(((p.x - X(0)) / ROPE.pxPerM) / 0.05) * 0.05, 0.1, ROPE.len);
  refresh();
}

/* ================================================================
   Controls and measurements
   ================================================================ */
const controlsBody = document.getElementById('controls-body');
const measuresBody = document.getElementById('measures-body');
let ui = {};
let tableSig = '';
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
const resetBtn = (id) => btnRow(createButton({ labelKey: 'ui.reset', variant: 'ghost', onClick: () => resetTab(id) }));
function clearRow(onClick) { return el('div', { class: 'btn-row', style: 'margin-top:8px' }, [createButton({ labelKey: 'ctl.clearTable', variant: 'ghost', onClick })]); }
const fbOf = (res, okKey, badKey) => (res === 'invalid' ? { type: 'warn', key: 'calcInvalid' } : res === 'wrong' ? { type: 'bad', key: badKey } : { type: 'good', key: okKey });
const relTol = (v, p) => Math.abs(v) * p;
const POW = { '-5': '10⁻⁵', '-8': '10⁻⁸' };

/* ---------- Tab 1 ---------- */
function buildPeriodic() {
  const st = S.periodic;
  const o = OBJ[st.obj];
  ui.obj = createSegmented({
    labelKey: 'ctl.object', options: OBJ_IDS.map((id) => ({ value: id, labelKey: `obj.${id}` })), value: st.obj,
    onChange: (v) => {
      Object.assign(st, { obj: v, simT: 0, running: false, sw: 0, count: 0, fb: null });
      if (!OBJ[v].n.includes(st.n)) st.n = OBJ[v].n[0];
      buildTab('periodic');
    },
  });
  ui.n = createSegmented({
    labelKey: 'ctl.n', options: o.n.map((n) => ({ value: String(n), labelKey: `nn${n}` })), value: String(st.n),
    onChange: (v) => { st.n = Number(v); refresh(); },
  });
  controlsBody.append(ui.obj.root, ui.n.root,
    btnRow(
      createButton({ labelKey: 'ctl.start', variant: 'secondary', onClick: () => { if (!st.running) { st.running = true; st.swStart = st.simT - st.sw; } refresh(); } }),
      createButton({ labelKey: 'ctl.stop', variant: 'secondary', onClick: () => { st.running = false; refresh(); } }),
      createButton({ labelKey: 'ctl.reset', variant: 'secondary', onClick: () => { if (!st.running) { st.sw = 0; st.count = 0; } refresh(); } }),
    ),
    btnRow(createButton({ labelKey: 'ctl.record', variant: 'primary', onClick: () => recordPeriodic() })),
    hint('hint.periodic'), resetBtn('periodic'));
  ui.dl = el('dl', { class: 'meas' });
  ui.table = el('table', { class: 'data' });
  ui.clear = clearRow(() => { st.rows = []; st.fb = null; refresh(); });
  ui.status = statusBox();
  measuresBody.append(ui.dl, ui.table, ui.clear, ui.status);
}
function recordPeriodic() {
  const st = S.periodic, o = OBJ[st.obj];
  if (st.running) st.fb = { type: 'warn', key: 'fb.notStopped' };
  else if (st.sw < 0.3 * o.T) st.fb = { type: 'warn', key: 'fb.zero' };
  else {
    const shown = Number((st.sw / o.uf).toFixed(o.dec)); // what the timer shows
    const tS = shown * o.uf;
    const err = Math.abs(st.sw - st.n * o.T) > 0.25 * o.T;
    st.rows.push({ obj: st.obj, n: st.n, shown, tS, err });
    st.fb = err ? { type: 'bad', key: 'fb.countOff', params: { n: st.n, c: Math.floor(st.sw / o.T + 1e-9) } } : null;
  }
  refresh();
}
function updatePeriodic() {
  const st = S.periodic, o = OBJ[st.obj];
  ui.n.set(String(st.n));
  measRows(ui.dl, [
    [t('m.object'), t(`obj.${st.obj}`)],
    [t('m.timer'), timerText(st)],
    [t('m.state'), t(st.running ? 'state.run' : 'state.stop')],
    [t('m.cycles'), String(st.count)],
  ]);
  const sig = calcSig(st.rows) + st.rows.length;
  if (sig !== tableSig) {
    tableSig = sig;
    const head = el('tr', {}, ['col.object', 'col.n', 'col.t', 'col.T', 'col.f'].map((k) => el('th', {}, t(k))));
    const body = st.rows.map((r) => {
      const ro = OBJ[r.obj];
      const T = r.tS / r.n, f = 1 / T, fs = f / 10 ** ro.fExp;
      const tdF = calcCell(r, 'f', {
        expected: fs, decimals: ro.fDec, tol: relTol(fs, 0.01), err: r.err, disabled: !calcDone(r, 'T'),
        onCheck: (res) => { st.fb = fbOf(res, 'fb.fOk', ro.fExp ? 'fb.fScaled' : 'fb.fWrong'); if (st.fb.key === 'fb.fScaled') st.fb.params = { p: POW[ro.fExp] }; refresh(); },
      });
      if (ro.fExp) tdF.append(el('span', { class: 'muted', style: 'margin-left:4px;white-space:nowrap' }, `× ${POW[ro.fExp]}`));
      return el('tr', { class: r.err ? 'bad-row' : '' }, [
        el('td', {}, t(`short.${r.obj}`)), el('td', {}, String(r.n)),
        el('td', { class: r.err ? 'bad-cell' : '', style: 'white-space:nowrap' }, qty(r.shown, ro.dec, unitText(ro))),
        calcCell(r, 'T', { expected: T, decimals: ro.Tdec, tol: relTol(T, 0.01), err: r.err, onCheck: (res) => { st.fb = fbOf(res, 'fb.TOk', 'fb.TWrong'); refresh(); } }),
        tdF,
      ]);
    });
    ui.table.replaceChildren(el('thead', {}, head), el('tbody', {}, body));
    tableSig = calcSig(st.rows) + st.rows.length;
  }
  ui.table.hidden = st.rows.length === 0;
  ui.clear.hidden = ui.table.hidden;
  showStatus(ui.status, st.fb);
}

/* ---------- Tab 2 ---------- */
function buildWave() {
  const st = S.wave;
  const restart = () => { st.tw = 0; st.playing = true; buildTab('wave'); };
  ui.kind = createSegmented({
    labelKey: 'ctl.medium', options: [{ value: 'rope', labelKey: 'medium.rope' }, { value: 'spring', labelKey: 'medium.spring' }], value: st.kind,
    onChange: (v) => { st.kind = v; restart(); },
  });
  ui.a = createSlider({ labelKey: 'ctl.a', min: 1, max: 4, step: 0.5, value: st.a, unit: 'cm', decimals: 1, onInput: (v) => { st.a = v; refresh(); } });
  ui.f = createSlider({ labelKey: 'ctl.f', min: 0.5, max: 2, step: 0.1, value: st.f, unit: 'Hz', decimals: 1, onInput: (v) => { st.f = v; st.tw = 0; st.playing = true; ui.play.textContent = t('ctl.pause'); refresh(); } });
  ui.v = createSlider({ labelKey: 'ctl.v', min: 0.5, max: 2, step: 0.1, value: st.v, unit: 'm/s', decimals: 1, onInput: (v) => { st.v = v; st.tw = 0; st.playing = true; ui.play.textContent = t('ctl.pause'); refresh(); } });
  ui.play = createButton({ labelKey: st.playing ? 'ctl.pause' : 'ctl.play', variant: 'primary', onClick: () => {
    st.playing = !st.playing;
    ui.play.dataset.i18n = st.playing ? 'ctl.pause' : 'ctl.play';
    ui.play.textContent = t(ui.play.dataset.i18n);
  } });
  ui.arrows = createSegmented({
    labelKey: 'ctl.arrows', options: [{ value: 'no', labelKey: 'no' }, { value: 'yes', labelKey: 'yes' }], value: st.arrows ? 'yes' : 'no',
    onChange: (v) => { st.arrows = v === 'yes'; refresh(); },
  });
  ui.marks = createSegmented({
    labelKey: 'ctl.marks', options: [{ value: 'no', labelKey: 'no' }, { value: 'yes', labelKey: 'yes' }], value: st.marks ? 'yes' : 'no',
    onChange: (v) => { st.marks = v === 'yes'; refresh(); },
  });
  controlsBody.append(ui.kind.root, ui.a.root, ui.f.root, ui.v.root,
    btnRow(ui.play, createButton({ labelKey: 'ctl.restart', variant: 'secondary', onClick: restart })),
    ui.arrows.root, ui.marks.root,
    btnRow(createButton({ labelKey: 'ctl.recordWave', variant: 'primary', onClick: () => { st.rows.push({ f: st.f, v: st.v }); st.fb = null; refresh(); } })),
    hint('hint.wave'), resetBtn('wave'));
  ui.dl = el('dl', { class: 'meas' });
  ui.table = el('table', { class: 'data' });
  ui.clear = clearRow(() => { st.rows = []; st.fb = null; refresh(); });
  ui.status = statusBox();
  measuresBody.append(ui.dl, ui.table, ui.clear, ui.status);
}
function updateWave() {
  const st = S.wave;
  const reached = st.tw >= st.xM / st.v;
  measRows(ui.dl, [
    [t('m.a'), qty(st.a, 1, 'cm')],
    [t('m.f'), qty(st.f, 1, 'Hz')],
    [t('m.v'), qty(st.v, 1, 'm/s')],
    [t('m.t'), qty(st.tw, 2, 's')],
    [t('m.front'), qty(Math.min(ROPE.len, st.v * st.tw), 2, 'm')],
    [t('m.xM'), qty(st.xM, 2, 'm')],
    [t('m.yM'), qty(wy(st, st.xM, st.tw), 2, 'cm')],
    [t('m.Mmoves'), t(reached ? `moves.${st.kind}` : 'moves.none')],
  ]);
  const sig = calcSig(st.rows) + st.rows.length;
  if (sig !== tableSig) {
    tableSig = sig;
    const head = el('tr', {}, ['col.fw', 'col.vw', 'col.Tw', 'col.lw'].map((k) => el('th', {}, t(k))));
    const body = st.rows.map((r) => el('tr', {}, [
      el('td', {}, num(r.f, 1)), el('td', {}, num(r.v, 1)),
      calcCell(r, 'T', { expected: 1 / r.f, decimals: 2, tol: relTol(1 / r.f, 0.01), onCheck: (res) => { st.fb = fbOf(res, 'fb.TwOk', 'fb.TwWrong'); refresh(); } }),
      calcCell(r, 'l', { expected: r.v / r.f, decimals: 2, tol: relTol(r.v / r.f, 0.01), disabled: !calcDone(r, 'T'), onCheck: (res) => { st.fb = fbOf(res, 'fb.lOk', 'fb.lWrong'); refresh(); } }),
    ]));
    ui.table.replaceChildren(el('thead', {}, head), el('tbody', {}, body));
    tableSig = calcSig(st.rows) + st.rows.length;
  }
  ui.table.hidden = st.rows.length === 0;
  ui.clear.hidden = ui.table.hidden;
  showStatus(ui.status, st.fb);
}

/* ---------- Tab 3 ---------- */
function newUnknown(st) {
  const opts = FREQS.filter((f) => f !== st.hf);
  st.hf = opts[Math.floor(Math.random() * opts.length)];
}
function buildScope() {
  const st = S.scope;
  ui.input = createSegmented({
    labelKey: 'ctl.input', options: [{ value: 'lfg', labelKey: 'input.lfg' }, { value: 'fork', labelKey: 'input.fork' }], value: st.input,
    onChange: (v) => { st.input = v; st.fb = null; if (v === 'fork') st.struck = now; buildTab('scope'); },
  });
  controlsBody.append(ui.input.root);
  if (st.input === 'lfg') {
    ui.shape = createSegmented({
      labelKey: 'ctl.shape', options: ['triangular', 'square', 'sine'].map((s) => ({ value: s, labelKey: `shape.${s}` })), value: st.shape,
      onChange: (v) => { st.shape = v; refresh(); },
    });
    ui.hide = createSegmented({
      labelKey: 'ctl.hide', options: [{ value: 'off', labelKey: 'hide.off' }, { value: 'on', labelKey: 'hide.on' }], value: st.hidden ? 'on' : 'off',
      onChange: (v) => { st.hidden = v === 'on'; if (st.hidden) newUnknown(st); buildTab('scope'); },
    });
    controlsBody.append(ui.shape.root, ui.hide.root);
    if (st.hidden) controlsBody.append(btnRow(createButton({ labelKey: 'ctl.newUnknown', variant: 'secondary', onClick: () => { newUnknown(st); st.fb = null; refresh(); } })));
    else {
      ui.freq = createSegmented({
        labelKey: 'ctl.freq', options: FREQS.map((f, i) => ({ value: String(i), labelKey: `fq${f}` })), value: String(st.fIdx),
        onChange: (v) => { st.fIdx = Number(v); refresh(); },
      });
      controlsBody.append(ui.freq.root);
    }
    ui.um = createSlider({ labelKey: 'ctl.um', min: 1, max: 4, step: 0.5, value: st.um, unit: 'V', decimals: 1, onInput: (v) => { st.um = v; refresh(); } });
    controlsBody.append(ui.um.root);
  } else {
    controlsBody.append(btnRow(createButton({ labelKey: 'ctl.strike', variant: 'primary', onClick: () => { st.struck = now; refresh(); } })));
  }
  ui.sv = createSegmented({
    labelKey: 'ctl.sv', options: SVS.map((v) => ({ value: String(v), labelKey: `sv${v}` })), value: String(st.sv),
    onChange: (v) => { st.sv = Number(v); refresh(); },
  });
  ui.sh = createSegmented({
    labelKey: 'ctl.sh', options: SHS.map((v) => ({ value: String(v), labelKey: `sh${v}` })), value: String(st.sh),
    onChange: (v) => { st.sh = Number(v); refresh(); },
  });
  controlsBody.append(ui.sv.root, ui.sh.root,
    btnRow(createButton({ labelKey: 'ctl.recordScope', variant: 'primary', onClick: () => recordScope() })),
    hint('hint.scope'), resetBtn('scope'));
  ui.dl = el('dl', { class: 'meas' });
  ui.table = el('table', { class: 'data' });
  ui.clear = clearRow(() => { st.rows = []; st.fb = null; refresh(); });
  ui.status = statusBox();
  measuresBody.append(ui.dl, ui.table, ui.clear, ui.status);
}
function recordScope() {
  const st = S.scope;
  const f = scopeF(st);
  const x = 1000 / (f * st.sh); // divisions of one period
  if (st.input === 'fork' && forkAmp(st) < 0.05) st.fb = { type: 'warn', key: 'fb.noSignal' };
  else if (x > DIV_X) st.fb = { type: 'warn', key: 'fb.tooFew' };
  else if (x < 1) st.fb = { type: 'warn', key: 'fb.tooMany' };
  else { st.rows.push({ sh: st.sh, x, T: 1000 / f, f }); st.fb = null; }
  refresh();
}
function updateScope() {
  const st = S.scope;
  const fork = st.input === 'fork';
  measRows(ui.dl, [
    [t('m.sv'), svText(st.sv)],
    [t('m.sh'), vbText(st.sh / 1000)],
    fork ? [t('m.fork'), t(forkAmp(st) > 0.05 ? 'fork.on' : 'fork.off')]
      : [t('m.fGen'), st.hidden ? '?' : qty(FREQS[st.fIdx], 0, 'Hz')],
    [t('m.form'), fork ? t('shape.sine') : t(`shape.${st.shape}`)],
  ]);
  const sig = calcSig(st.rows) + st.rows.length;
  if (sig !== tableSig) {
    tableSig = sig;
    const head = el('tr', {}, ['col.sh', 'col.x', 'col.Ts', 'col.fs'].map((k) => el('th', {}, t(k))));
    const body = st.rows.map((r) => el('tr', {}, [
      el('td', {}, num(r.sh, r.sh < 1 ? 1 : 0)),
      calcCell(r, 'x', { expected: r.x, decimals: 1, tol: 0.15, onCheck: (res) => { st.fb = fbOf(res, 'fb.xOk', 'fb.xWrong'); refresh(); } }),
      calcCell(r, 'T', { expected: r.T, decimals: r.T < 1 ? 2 : 1, tol: Math.max(relTol(r.T, 0.03), 0.15 * r.sh), disabled: !calcDone(r, 'x'), onCheck: (res) => { st.fb = fbOf(res, 'fb.TsOk', 'fb.TsWrong'); refresh(); } }),
      calcCell(r, 'f', { expected: r.f, decimals: 0, tol: relTol(r.f, 0.04), disabled: !calcDone(r, 'T'), onCheck: (res) => { st.fb = fbOf(res, 'fb.fsOk', 'fb.fsWrong'); refresh(); } }),
    ]));
    ui.table.replaceChildren(el('thead', {}, head), el('tbody', {}, body));
    tableSig = calcSig(st.rows) + st.rows.length;
  }
  ui.table.hidden = st.rows.length === 0;
  ui.clear.hidden = ui.table.hidden;
  showStatus(ui.status, st.fb);
}

/* ---------- Tab switching ---------- */
function buildTab(id) {
  controlsBody.replaceChildren();
  measuresBody.replaceChildren();
  ui = {};
  tableSig = '';
  if (id === 'periodic') buildPeriodic();
  else if (id === 'wave') buildWave();
  else buildScope();
  loop.start();
  refresh();
}
function updateMeasures() {
  if (!shell || !ui.dl) return;
  if (shell.tab === 'periodic') updatePeriodic();
  else if (shell.tab === 'wave') updateWave();
  else updateScope();
}
function refresh() { updateMeasures(); requestDraw(); }
function resetTab(id) { S[id] = initialState(id); buildTab(id); }

// Labels built from numbers, formatted in each language
const extra = { en: { 'unit.day': 'days' }, fr: { 'unit.day': 'jours' } };
for (const lang of ['en', 'fr']) {
  for (const n of [1, 2, 5, 10]) extra[lang][`nn${n}`] = String(n);
  for (const f of FREQS) extra[lang][`fq${f}`] = `${num(f, 0, lang)} Hz`;
  for (const v of SVS) extra[lang][`sv${v}`] = `${num(v, v < 1 ? 1 : 0, lang)} V/div`;
  for (const v of SHS) extra[lang][`sh${v}`] = `${num(v, v < 1 ? 1 : 0, lang)} ms/div`;
}
onLangChange(() => { if (shell) buildTab(shell.tab); });

shell = initSim({
  strings: { en: { ...strings.en, ...extra.en }, fr: { ...strings.fr, ...extra.fr } },
  tabs: TABS.map((id) => ({ id, labelKey: `tab.${id}` })),
  initialTab: 'periodic',
  onTab: buildTab,
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, get now() { return now; }, OBJ, scopeF, getLang };
