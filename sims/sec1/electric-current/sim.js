// Sec 1 — Chapter 3: Electric current (Courant électrique). Whole chapter (p.42–52).
// Owner (4 Nov 2026): Sec 1 batteries have an emf E and an internal resistance r (book Table 5.1).
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num } from '../../../shared/format.js';
import { createButton, createSegmented, createSlider, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, font } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { calcCell, calcSig } from '../../../shared/calc-cell.js';
import { drawMeterBox, drawCurrentArrows, labelI, METER_HALF } from '../../../shared/circuit-draw.js';
import { drawScope, svText, vbText, DIV_X } from '../../../shared/oscilloscope.js';
import { drawAnalogDial } from '../../../shared/analog-meter.js';
import { label } from '../../../shared/figures.js';

/* ================================================================
   Model values
   ================================================================ */
const E = 4.27, R_INT = 1.9;               // 4.5 V flat battery (Table 5.1)
const E_CHARGE = 1.6e-19;
const W = 600, H = 440;
const TABS = ['nature', 'magnitude', 'dcac', 'ammeter', 'laws'];
// Table 3.1 (orders of magnitude)
const DEVICES = { torch: 0.5, tv: 0.7, flashers: 1, vacuum: 3, iron: 4, radiator: 10, washing: 15, starter: 50 };
// ammeter tab: loads on the flat battery (Example 3.3: about 3 mA, 70 mA, 1.5 A)
const LOADS = { r1500: 1500, r56: 56, lamp: 12, motor: 1.0 };
const A_SCALES = [0.01, 0.02, 0.1, 1, 2, 5, 10];
// laws tab: lamp 12 Ω, fan 8 Ω (fixed resistances), rheostat 0–20 Ω
const R_LAMP = 12, R_FAN = 8;

function initialState(tab) {
  switch (tab) {
    case 'nature': return { scene: 'metal', on: false, showI: true, parts: null, push: 0 };
    case 'magnitude': return { dev: 'torch', running: false, t: 0, rows: [], calc: {}, fb: null };
    case 'dcac': return { src: 'battery', closed: true, speed: 1, ph: 0, time: 0 };
    case 'ammeter': return { load: 'r56', scale: 10, conn: 'series', rows: [], practice: false, pq: null, calc: {}, fb: null, needle: 0 };
    case 'laws': return { mode: 'series', closed: true, rh: 10, rows: [], fb: null };
    default: return {};
  }
}
let S = Object.fromEntries(TABS.map((k) => [k, initialState(k)]));
let shell;
const cur = () => S[shell.tab];
const dec = (s) => s.replace('.', t('dec'));

let drawQueued = false;
const canvas = document.getElementById('stage');
const view = setupCanvas(canvas, { width: W, height: H, maxHeightVh: () => (window.innerWidth < 880 ? 52 : 76), onResize: () => requestDraw() });
function requestDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; draw(); });
}
onThemeChange(() => requestDraw());

/* ================================================================
   Helpers
   ================================================================ */
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
// 3.12 × 10¹⁸ (decimal separator of the language)
function sci(x, d = 2) {
  if (x === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(x)));
  const m = x / 10 ** e;
  return `${num(m, d)} × 10${String(e).split('').map((c) => SUP[c]).join('')}`;
}
function board(ctx) { ctx.fillStyle = cssVar('--board'); roundRect(ctx, 6, 6, W - 12, H - 12, 14); ctx.fill(); }
function line(ctx, pts, color = cssVar('--wire'), w = 4) {
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
}
function tag(ctx, s, x, y, color = cssVar('--text'), size = 14, align = 'center', weight = 800) {
  ctx.fillStyle = color; ctx.font = font(size, weight); ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(s, x, y);
}
function hint(ctx, text) { label(ctx, text, W / 2, H - 20, { size: 13, weight: 600, color: cssVar('--muted') }); }
function particle(ctx, x, y, sign, r = 6) {
  ctx.fillStyle = cssVar(sign > 0 ? '--plus' : '--minus');
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(x - r * 0.5, y); ctx.lineTo(x + r * 0.5, y);
  if (sign > 0) { ctx.moveTo(x, y - r * 0.5); ctx.lineTo(x, y + r * 0.5); }
  ctx.stroke();
}
function batteryH(ctx, x, y, w = 110) {
  ctx.fillStyle = cssVar('--battery'); ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.5;
  roundRect(ctx, x - w / 2, y - 22, w, 44, 7); ctx.fill(); ctx.stroke();
  tag(ctx, dec('4.5 V'), x, y, '#ffffff', 14);
  tag(ctx, '+', x - w / 2 - 12, y, cssVar('--accent'), 20); tag(ctx, '−', x + w / 2 + 12, y, cssVar('--text'), 22);
}
function batteryV(ctx, x, y1, y2) {
  const h = y2 - y1;
  ctx.fillStyle = cssVar('--battery'); ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.5;
  roundRect(ctx, x - 30, y1, 60, h, 8); ctx.fill(); ctx.stroke();
  ctx.fillStyle = cssVar('--gold'); ctx.fillRect(x - 22, y1 + h / 2 + 4, 44, 10);
  tag(ctx, dec('4.5 V'), x, y1 + h / 2 - 10, '#ffffff', 14);
  tag(ctx, '+', x + 42, y1 + 12, cssVar('--accent'), 20);
  tag(ctx, '−', x + 42, y2 - 12, cssVar('--text'), 22);
}
function lampAt(ctx, x, y, glow, name, below = false) {
  if (glow > 0.02) {
    const g = ctx.createRadialGradient(x, y, 4, x, y, 40);
    g.addColorStop(0, `rgba(255, 214, 90, ${0.75 * glow})`); g.addColorStop(1, 'rgba(255, 214, 90, 0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 40, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = glow > 0.02 ? `rgb(255, ${Math.round(236 - 30 * glow)}, ${Math.round(170 - 110 * glow)})` : cssVar('--surface');
  ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(x, y, 18, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  const k = 18 * Math.SQRT1_2;
  ctx.beginPath(); ctx.moveTo(x - k, y - k); ctx.lineTo(x + k, y + k); ctx.moveTo(x + k, y - k); ctx.lineTo(x - k, y + k); ctx.stroke();
  if (name) tag(ctx, name, x, below ? y + 32 : y - 31, cssVar('--text'), 14);
}
function fanAt(ctx, x, y, spin, name, below = false) {
  ctx.fillStyle = cssVar('--surface'); ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(x, y, 18, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.save(); ctx.translate(x, y); ctx.rotate(spin);
  ctx.fillStyle = cssVar('--accent');
  for (let i = 0; i < 3; i++) { ctx.rotate((2 * Math.PI) / 3); ctx.beginPath(); ctx.ellipse(0, -8, 4, 8, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
  if (name) tag(ctx, name, x, below ? y + 32 : y - 31, cssVar('--text'), 14);
}
function switchH(ctx, x1, x2, y, open) {
  ctx.strokeStyle = cssVar('--wire'); ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y);
  if (open) ctx.lineTo(x1 + (x2 - x1) * 0.9, y - (x2 - x1) * 0.45); else ctx.lineTo(x2 - 4, y - 7);
  ctx.stroke();
  for (const x of [x1, x2]) {
    ctx.fillStyle = cssVar('--surface'); ctx.strokeStyle = cssVar('--wire'); ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
}
function rheostatH(ctx, x, y, frac) {
  ctx.fillStyle = cssVar('--surface'); ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 2.5;
  ctx.fillRect(x - 32, y - 10, 64, 20); ctx.strokeRect(x - 32, y - 10, 64, 20);
  // cursor arrow
  const cx = x - 32 + 64 * frac;
  ctx.strokeStyle = cssVar('--accent'); ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(cx - 14, y + 22); ctx.lineTo(cx + 14, y - 22); ctx.stroke();
  ctx.fillStyle = cssVar('--accent'); ctx.beginPath(); ctx.moveTo(cx + 16, y - 25); ctx.lineTo(cx + 5, y - 20); ctx.lineTo(cx + 12, y - 12); ctx.fill();
}
const meterAt = (ctx, x, y, name, I) => drawMeterBox(ctx, { x, y, kind: 'A', name, text: num(I, 3), unit: 'A' });

/* ================================================================
   Tab 1 — Nature of the electric current (3.1–3.2)
   ================================================================ */
const BOX = { x0: 60, x1: 540, y0: 150, y1: 250 };
function makeParts(scene) {
  const rnd = (a, b) => a + Math.random() * (b - a);
  const list = [];
  const n = scene === 'metal' ? 34 : 26;
  for (let i = 0; i < n; i++) {
    const sign = scene === 'metal' ? -1 : i % 2 ? 1 : -1;
    const ang = rnd(0, Math.PI * 2), sp = rnd(40, 90);
    list.push({ x: rnd(BOX.x0 + 10, BOX.x1 - 10), y: rnd(BOX.y0 + 10, BOX.y1 - 10), vx: sp * Math.cos(ang), vy: sp * Math.sin(ang), sign });
  }
  return list;
}
function stepNature(st, dt) {
  if (st.scene === 'balls') { if (st.push > 0) st.push = Math.min(2, st.push + dt); return; }
  if (!st.parts) st.parts = makeParts(st.scene);
  const drift = 30; // screen drift speed (greatly enlarged: real drift speed is a few mm/s)
  for (const p of st.parts) {
    // random thermal motion with occasional collisions (direction changes)
    if (Math.random() < 1.5 * dt) { const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 50; p.vx = s * Math.cos(a); p.vy = s * Math.sin(a); }
    // + terminal on the left: electrons / negative ions drift to the left, positive ions to the right
    const d = st.on ? (p.sign < 0 ? -drift : drift) : 0;
    p.x += (p.vx + d) * dt; p.y += p.vy * dt;
    if (p.y < BOX.y0 + 6) { p.y = BOX.y0 + 6; p.vy = Math.abs(p.vy); }
    if (p.y > BOX.y1 - 6) { p.y = BOX.y1 - 6; p.vy = -Math.abs(p.vy); }
    if (p.x < BOX.x0 + 4) p.x = BOX.x1 - 6; else if (p.x > BOX.x1 - 4) p.x = BOX.x0 + 6;
  }
}
function drawNature(ctx, st) {
  board(ctx);
  if (st.scene === 'balls') {
    // balls in a groove (Fig. 3.4): pushing ball A moves them all almost instantly, but slowly
    const y = 220, r = 20;
    ctx.fillStyle = cssVar('--wood'); roundRect(ctx, 40, y + r - 2, 520, 18, 6); ctx.fill();
    const shift = Math.min(1, st.push) * 40;
    for (let i = 0; i < 10; i++) {
      const x = 120 + i * 2 * r + shift;
      const g = ctx.createRadialGradient(x - 6, y - 6, 2, x, y, r);
      g.addColorStop(0, '#ffffff'); g.addColorStop(1, cssVar('--marble'));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      if (i === 0) tag(ctx, 'A', x, y, cssVar('--text'), 14);
    }
    if (st.push > 0 && st.push < 1) {
      ctx.fillStyle = cssVar('--accent');
      ctx.beginPath(); ctx.moveTo(70 + shift, y); ctx.lineTo(54 + shift, y - 10); ctx.lineTo(54 + shift, y + 10); ctx.fill();
    }
    hint(ctx, t(st.push > 0 ? 'hint.ballsMove' : 'hint.balls'));
    return;
  }
  const metal = st.scene === 'metal';
  // conductor or electrolytic cell
  if (metal) {
    ctx.fillStyle = cssVar('--copper'); ctx.globalAlpha = 0.25; ctx.fillRect(BOX.x0, BOX.y0, BOX.x1 - BOX.x0, BOX.y1 - BOX.y0); ctx.globalAlpha = 1;
    ctx.strokeStyle = cssVar('--copper'); ctx.lineWidth = 3; ctx.strokeRect(BOX.x0, BOX.y0, BOX.x1 - BOX.x0, BOX.y1 - BOX.y0);
    // fixed positive ions of the metal (lattice)
    ctx.fillStyle = 'rgba(120,120,120,0.35)';
    for (let x = BOX.x0 + 20; x < BOX.x1; x += 40) for (let y = BOX.y0 + 20; y < BOX.y1; y += 30) { ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill(); }
    tag(ctx, t('lbl.metal'), (BOX.x0 + BOX.x1) / 2, BOX.y0 - 16, cssVar('--muted'), 13, 'center', 700);
  } else {
    ctx.fillStyle = cssVar('--water'); ctx.globalAlpha = 0.35; ctx.fillRect(BOX.x0, BOX.y0, BOX.x1 - BOX.x0, BOX.y1 - BOX.y0); ctx.globalAlpha = 1;
    ctx.strokeStyle = cssVar('--glass-stroke'); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(BOX.x0, BOX.y0 - 30); ctx.lineTo(BOX.x0, BOX.y1); ctx.lineTo(BOX.x1, BOX.y1); ctx.lineTo(BOX.x1, BOX.y0 - 30); ctx.stroke();
    ctx.fillStyle = cssVar('--metal');
    ctx.fillRect(BOX.x0 + 6, BOX.y0 - 40, 12, BOX.y1 - BOX.y0 + 34); ctx.fillRect(BOX.x1 - 18, BOX.y0 - 40, 12, BOX.y1 - BOX.y0 + 34);
    tag(ctx, t('lbl.electrolyte'), (BOX.x0 + BOX.x1) / 2, BOX.y0 - 16, cssVar('--muted'), 13, 'center', 700);
  }
  for (const p of st.parts || []) particle(ctx, p.x, p.y, p.sign, metal ? 5.5 : 7);
  // battery and connecting wires: + on the left
  const by = 370;
  const lx = metal ? BOX.x0 : BOX.x0 + 12, rx = metal ? BOX.x1 : BOX.x1 - 12;
  const ly = metal ? (BOX.y0 + BOX.y1) / 2 : BOX.y0 - 40;
  if (st.on) {
    line(ctx, metal ? [[lx, ly], [30, ly], [30, by], [240, by]] : [[lx, ly], [lx, 90], [30, 90], [30, by], [240, by]]);
    line(ctx, metal ? [[rx, ly], [570, ly], [570, by], [360, by]] : [[rx, ly], [rx, 90], [570, 90], [570, by], [360, by]]);
    batteryH(ctx, 300, by, 110);
    if (st.showI) {
      // conventional direction: from the + pole, through the conductor, to the − pole
      const yA = metal ? BOX.y1 + 26 : BOX.y1 + 26;
      ctx.strokeStyle = cssVar('--current'); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(220, yA); ctx.lineTo(380, yA); ctx.stroke();
      labelI(ctx, 380, yA, 0);
      tag(ctx, t('lbl.conv'), 300, yA + 22, cssVar('--current'), 12, 'center', 700);
    }
  } else {
    batteryH(ctx, 300, by, 110);
    tag(ctx, t('lbl.notConnected'), 300, by - 40, cssVar('--muted'), 13, 'center', 700);
  }
  hint(ctx, t(metal ? (st.on ? 'hint.metalOn' : 'hint.metalOff') : st.on ? 'hint.elecOn' : 'hint.elecOff'));
}

/* ================================================================
   Tab 2 — Magnitude of the current I = Q / t (3.3, Table 3.1, Examples 3.1–3.2)
   ================================================================ */
let flowPh = 0;
function drawMagnitude(ctx, st) {
  board(ctx);
  const I = DEVICES[st.dev];
  // a wire with a cross-section S
  const y = 170;
  ctx.fillStyle = cssVar('--copper'); ctx.globalAlpha = 0.3; ctx.fillRect(40, y - 45, 520, 90); ctx.globalAlpha = 1;
  ctx.strokeStyle = cssVar('--copper'); ctx.lineWidth = 3; ctx.strokeRect(40, y - 45, 520, 90);
  ctx.strokeStyle = cssVar('--accent'); ctx.lineWidth = 3; ctx.setLineDash([6, 4]);
  ctx.beginPath(); ctx.ellipse(300, y, 16, 47, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  tag(ctx, t('lbl.section'), 300, y - 62, cssVar('--accent'), 13);
  // electrons crossing from right to left; the density shown grows with I (log scale)
  const n = Math.round(6 + 4 * Math.log10(I * 10));
  for (let k = 0; k < n; k++) {
    for (let j = 0; j < 3; j++) {
      const u = ((k / n + flowPh) % 1);
      const x = 556 - u * 512, yy = y - 30 + j * 30 + ((k * 7) % 11) - 5;
      particle(ctx, x, yy, -1, 5);
    }
  }
  ctx.strokeStyle = cssVar('--current'); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(380, y + 70); ctx.lineTo(500, y + 70); ctx.stroke(); labelI(ctx, 500, y + 70, 0);
  // stopwatch and the (imaginary) counter of electrons that crossed S
  const N = (I * Math.round(st.t * 10) / 10) / E_CHARGE;
  ctx.fillStyle = cssVar('--meter-body'); roundRect(ctx, 60, 280, 220, 100, 12); ctx.fill();
  tag(ctx, t('lbl.time'), 170, 302, cssVar('--text-on-meter'), 13);
  ctx.fillStyle = cssVar('--lcd-bg'); roundRect(ctx, 80, 318, 180, 44, 6); ctx.fill();
  ctx.fillStyle = cssVar('--lcd-ink'); ctx.font = '700 26px ui-monospace, Menlo, Consolas, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(`${dec(st.t.toFixed(1))} s`, 170, 341);
  ctx.fillStyle = cssVar('--meter-body'); roundRect(ctx, 320, 280, 220, 100, 12); ctx.fill();
  tag(ctx, t('lbl.counter'), 430, 302, cssVar('--text-on-meter'), 13);
  ctx.fillStyle = cssVar('--lcd-bg'); roundRect(ctx, 336, 318, 188, 44, 6); ctx.fill();
  tag(ctx, `N = ${sci(N)}`, 430, 341, cssVar('--lcd-ink'), 18);
  hint(ctx, t('hint.magnitude'));
}

/* ================================================================
   Tab 3 — Direct and alternating current (3.4, Fig. 3.10–3.13)
   ================================================================ */
const GEN_UMAX = 3; // V at 1 turn per second (illustrative)
function dcacValues(st) {
  if (st.src === 'battery') {
    const I = st.closed ? E / (R_LAMP + R_INT) : 0;
    return { I, U: I * R_LAMP };
  }
  const um = GEN_UMAX * st.speed;
  const u = st.closed ? um * Math.sin(st.ph) : 0;
  return { I: u / R_LAMP, U: u, Imax: um / R_LAMP };
}
function galvanometer(ctx, x, y, frac) {
  ctx.fillStyle = cssVar('--meter-body'); ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1.5;
  roundRect(ctx, x - 70, y - 50, 140, 90, 10); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fbfbf7'; roundRect(ctx, x - 60, y - 42, 120, 56, 6); ctx.fill();
  const cx = x, cy = y + 28, R = 58;
  ctx.strokeStyle = '#222'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, R - 6, -Math.PI / 2 - 0.7, -Math.PI / 2 + 0.7); ctx.stroke();
  for (let i = -5; i <= 5; i++) {
    const a = -Math.PI / 2 + (i / 5) * 0.7, l = i === 0 ? 10 : 5;
    ctx.beginPath(); ctx.moveTo(cx + (R - 6) * Math.cos(a), cy + (R - 6) * Math.sin(a)); ctx.lineTo(cx + (R - 6 + l) * Math.cos(a), cy + (R - 6 + l) * Math.sin(a)); ctx.stroke();
  }
  tag(ctx, '0', cx, cy - R - 10 + 16, '#222', 10);
  const a = -Math.PI / 2 + Math.max(-1, Math.min(1, frac)) * 0.7;
  ctx.strokeStyle = cssVar('--bad'); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + (R - 2) * Math.cos(a), cy + (R - 2) * Math.sin(a)); ctx.stroke();
  tag(ctx, 'G', x, y + 30, cssVar('--text-on-meter'), 14);
}
function drawDcac(ctx, st) {
  board(ctx);
  const v = dcacValues(st);
  // circuit: source — lamp — galvanometer with central zero
  line(ctx, [[60, 70], [240, 70]]); line(ctx, [[60, 70], [60, 380], [240, 380]]);
  line(ctx, [[240, 70], [240, 100]]); line(ctx, [[240, 380], [240, 340]]);
  if (st.src === 'battery') {
    batteryV(ctx, 60, 150, 300);
  } else {
    // bicycle generator turned at a constant rate: a wheel with a mark
    ctx.fillStyle = cssVar('--surface'); ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(60, 225, 46, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.save(); ctx.translate(60, 225); ctx.rotate(st.ph);
    ctx.strokeStyle = cssVar('--accent'); ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -40); ctx.stroke(); ctx.restore();
    tag(ctx, t('lbl.generator'), 60, 290, cssVar('--text'), 12);
  }
  const glow = Math.min(1, Math.abs(v.I) / 0.3);
  line(ctx, [[240, 100], [240, 152]]);
  lampAt(ctx, 240, 170, st.closed ? glow : 0, t('lbl.load'));
  line(ctx, [[240, 188], [240, 250]]);
  const Imax = st.src === 'battery' ? 0.6 : 0.6;
  galvanometer(ctx, 240, 290, v.I / Imax);
  // oscilloscope across the load (voltage visualised)
  const sv = 2, vb = 0.2;
  const tNow = st.time;
  const curve = st.src === 'battery'
    ? null
    : (x) => (st.closed ? GEN_UMAX * st.speed * Math.sin(st.ph - (DIV_X - x) * vb * 2 * Math.PI * st.speed) : 0) / sv;
  const o = { x: 338, y: 40, d: 20, svLabel: dec(svText(sv)), vbLabel: dec(vbText(vb)), svName: 'Sv', vbName: ' ', steady: true };
  if (curve) o.curve = curve; else o.level = v.U / sv;
  drawScope(ctx, o);
  tag(ctx, t('lbl.scopeLoad'), 458, 330, cssVar('--muted'), 12, 'center', 700);
  hint(ctx, t(st.src === 'battery' ? 'hint.dc' : 'hint.ac'));
  void tNow;
}

/* ================================================================
   Tab 4 — Analog ammeter (Fig. 3.15–3.16, Examples 3.3–3.4)
   ================================================================ */
function loadCurrent(st) {
  if (st.conn === 'parallel') return E / R_INT; // the ammeter short-circuits the load
  return E / (LOADS[st.load] + R_INT);
}
function ammeterTarget(st) {
  if (st.practice && st.pq) return st.pq.n / 100;
  const I = loadCurrent(st);
  return ((st.conn === 'reversed' ? -1 : 1) * I) / st.scale;
}
const scaleText = (s) => (s < 1 ? `${num(s * 1000, 0)} mA` : `${num(s, 0)} A`);
function drawAmmeter(ctx, st) {
  board(ctx);
  const s = st.practice && st.pq ? st.pq.scale : st.scale;
  drawAnalogDial(ctx, { width: W, needle: st.needle, grads: [100], unit: 'A', scaleText: `${t('lbl.scale')} : ${scaleText(s)}`, divsText: `(100 ${t('lbl.divs')})` });
  if (!st.practice) {
    tag(ctx, `${t(`load.${st.load}`)} — ${t(`conn.${st.conn}`)}`, W / 2, 404, st.conn === 'parallel' ? cssVar('--bad') : cssVar('--text'), 13, 'center', 700);
  }
  if (!st.practice && st.conn === 'parallel') {
    label(ctx, t('warn.parallel'), W / 2, 282, { size: 14, weight: 800, color: cssVar('--bad') });
  } else if (st.needle > 1.02 || st.needle < -0.02) {
    label(ctx, t(st.needle < 0 ? 'warn.reversed' : 'warn.over'), W / 2, 282, { size: 14, weight: 800, color: cssVar('--bad') });
  }
}

/* ================================================================
   Tab 5 — Laws of current (Exp. 3.1 uniqueness, Exp. 3.2 junction rule)
   ================================================================ */
function seriesI(st) { return st.closed ? E / (R_LAMP + R_FAN + R_INT) : 0; }
function parallelI(st) {
  if (!st.closed) return { I: 0, I1: 0, I2: 0 };
  const Rp = (R_LAMP * R_FAN) / (R_LAMP + R_FAN);
  const r3 = (x) => Math.round(x * 1000) / 1000;
  const I = r3(E / (Rp + st.rh + R_INT));
  // readings rounded like the ammeters' displays; I2 = I − I1 so that the displayed values obey the junction rule exactly
  const I1 = r3((I * R_FAN) / (R_LAMP + R_FAN));
  return { I, I1, I2: r3(I - I1) };
}
let spin = 0;
function drawLaws(ctx, st) {
  board(ctx);
  const ph = (performance.now() / 25) % 1000;
  if (st.mode === 'series') {
    const I = seriesI(st);
    // top: + → A1 → lamp → A2 → fan; right side down; bottom: A3 → K → −
    line(ctx, [[100, 120], [100, 80], [170 - METER_HALF, 80]]);
    line(ctx, [[170 + METER_HALF, 80], [262, 80]]); line(ctx, [[298, 80], [380 - METER_HALF, 80]]);
    line(ctx, [[380 + METER_HALF, 80], [472, 80]]); line(ctx, [[508, 80], [540, 80], [540, 360], [400 + METER_HALF, 360]]);
    line(ctx, [[400 - METER_HALF, 360], [270, 360]]); line(ctx, [[210, 360], [100, 360], [100, 320]]);
    batteryV(ctx, 100, 120, 320);
    meterAt(ctx, 170, 80, 'A1', I); meterAt(ctx, 380, 80, 'A2', I); meterAt(ctx, 400, 360, 'A3', I);
    lampAt(ctx, 280, 80, Math.min(1, I * 4), t('lbl.lamp'), true);
    fanAt(ctx, 490, 80, spin, t('lbl.fan'), true);
    switchH(ctx, 210, 270, 360, !st.closed);
    tag(ctx, 'K', 240, 386, cssVar('--text'), 15);
    if (I > 0) {
      const skip = (x, y) => (y === 80 && ((x > 120 && x < 220) || (x > 330 && x < 430) || (x > 255 && x < 305) || (x > 465 && x < 515))) || (y === 360 && x > 350 && x < 450) || (x === 100 && y > 115 && y < 325);
      drawCurrentArrows(ctx, [[100, 120], [100, 80], [540, 80], [540, 360], [100, 360], [100, 320]], ph * (I / 0.2), skip);
    }
    hint(ctx, t('hint.series'));
  } else {
    const { I, I1, I2 } = parallelI(st);
    // main branch: + → A → junction M; branches M → lamp → A1 → N and M → fan → A2 → N; N → rheostat → K → −
    line(ctx, [[100, 120], [100, 80], [190 - METER_HALF, 80]]); line(ctx, [[190 + METER_HALF, 80], [290, 80]]);
    line(ctx, [[290, 80], [342, 80]]); line(ctx, [[378, 80], [470 - METER_HALF, 80]]); line(ctx, [[470 + METER_HALF, 80], [550, 80]]);
    line(ctx, [[290, 80], [290, 220], [342, 220]]); line(ctx, [[378, 220], [470 - METER_HALF, 220]]); line(ctx, [[470 + METER_HALF, 220], [550, 220], [550, 80]]);
    line(ctx, [[550, 220], [550, 360], [452, 360]]); line(ctx, [[388, 360], [270, 360]]); line(ctx, [[210, 360], [100, 360], [100, 320]]);
    batteryV(ctx, 100, 120, 320);
    meterAt(ctx, 190, 80, 'A', I); meterAt(ctx, 470, 80, 'A1', I1); meterAt(ctx, 470, 220, 'A2', I2);
    lampAt(ctx, 360, 80, Math.min(1, I1 * 4), t('lbl.lamp'), true);
    fanAt(ctx, 360, 220, spin, t('lbl.fan'), true);
    rheostatH(ctx, 420, 360, st.rh / 20);
    tag(ctx, t('lbl.rheostat'), 420, 396, cssVar('--text'), 13);
    switchH(ctx, 210, 270, 360, !st.closed);
    tag(ctx, 'K', 240, 386, cssVar('--text'), 15);
    for (const [x, y, n] of [[290, 80, 'M'], [550, 80, 'N']]) {
      ctx.fillStyle = cssVar('--wire'); ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
      tag(ctx, n, x, y - 22, cssVar('--text'), 15);
    }
    ctx.fillStyle = cssVar('--wire'); ctx.beginPath(); ctx.arc(550, 220, 6, 0, Math.PI * 2); ctx.fill();
    if (I > 0) {
      labelI(ctx, 255, 80, 0, 'I'); labelI(ctx, 320, 80, 0, 'I1'); labelI(ctx, 320, 220, 0, 'I2');
      const skipM = (x, y) => (y === 80 && x > 140 && x < 240) || (x === 100 && y > 115 && y < 325) || (y === 360 && x > 380 && x < 460);
      drawCurrentArrows(ctx, [[100, 120], [100, 80], [290, 80]], ph * (I / 0.3), skipM);
      drawCurrentArrows(ctx, [[550, 220], [550, 360], [100, 360], [100, 320]], ph * (I / 0.3), skipM);
      drawCurrentArrows(ctx, [[290, 80], [550, 80]], ph * (I1 / 0.3), (x) => (x > 335 && x < 385) || (x > 420 && x < 520));
      drawCurrentArrows(ctx, [[290, 80], [290, 220], [550, 220]], ph * (I2 / 0.3), (x, y) => y === 220 && ((x > 335 && x < 385) || (x > 420 && x < 520)));
    }
    hint(ctx, t('hint.parallel'));
  }
}

/* ================================================================
   Draw and loop
   ================================================================ */
function draw() {
  if (!shell) return;
  const ctx = view.begin();
  const st = cur();
  switch (shell.tab) {
    case 'nature': drawNature(ctx, st); break;
    case 'magnitude': drawMagnitude(ctx, st); break;
    case 'dcac': drawDcac(ctx, st); break;
    case 'ammeter': drawAmmeter(ctx, st); break;
    case 'laws': drawLaws(ctx, st); break;
    default: break;
  }
}
let tick = 0;
const loop = createLoop({
  dt: 1 / 60,
  step(dt) {
    if (!shell) return false;
    const st = cur();
    switch (shell.tab) {
      case 'nature': stepNature(st, dt); break;
      case 'magnitude': if (st.running) st.t += dt; flowPh = (flowPh + dt * 0.25) % 1; break;
      case 'dcac': st.time += dt; if (st.src === 'generator' && st.closed) st.ph += 2 * Math.PI * st.speed * dt; break;
      case 'ammeter': st.needle += (ammeterTarget(st) - st.needle) * Math.min(1, 7 * dt); break;
      case 'laws': {
        const I = st.mode === 'series' ? seriesI(st) : parallelI(st).I2;
        spin += dt * 40 * I;
        break;
      }
      default: break;
    }
    return true;
  },
  render() {
    draw();
    if (++tick % 6 === 0 && (shell.tab === 'magnitude' || shell.tab === 'dcac')) updateMeasures();
  },
});

/* ================================================================
   Panels
   ================================================================ */
const controlsBody = document.getElementById('controls-body');
const measuresBody = document.getElementById('measures-body');
let ui = {};
const seg = (labelKey, options, value, onChange) => createSegmented({ labelKey, options: options.map(([v, k]) => ({ value: String(v), labelKey: k })), value: String(value), onChange }).root;
const btnRow = (...b) => el('div', { class: 'btn-row', style: 'margin-top:8px;flex-wrap:wrap' }, b);
const hintP = (key) => el('p', { class: 'muted', style: 'margin:8px 0 0;font-size:0.88rem' }, t(key));
const resetBtn = (tab) => createButton({ labelKey: 'ui.reset', variant: 'ghost', onClick: () => { S[tab] = initialState(tab); buildTab(); } });
const th = (c) => el('th', { class: 'keep-case' }, c);
const td = (c) => el('td', { class: 'keep-case' }, c);

function build() {
  const tab = shell.tab, st = cur();
  const items = [];
  if (tab === 'nature') {
    items.push(seg('ctl.scene', [['metal', 'scene.metal'], ['electrolyte', 'scene.electrolyte'], ['balls', 'scene.balls']], st.scene, (v) => { st.scene = v; st.parts = null; st.push = 0; st.on = false; buildTab(); }));
    if (st.scene === 'balls') {
      items.push(btnRow(createButton({ labelKey: 'ctl.push', variant: 'primary', onClick: () => { st.push = 0.001; } }), resetBtn(tab)));
    } else {
      items.push(btnRow(createButton({ labelKey: st.on ? 'ctl.disconnect' : 'ctl.connect', variant: 'primary', onClick: () => { st.on = !st.on; buildTab(); } }), resetBtn(tab)));
      items.push(seg('ctl.showI', [['yes', 'ctl.yes'], ['no', 'ctl.no']], st.showI ? 'yes' : 'no', (v) => { st.showI = v === 'yes'; }));
    }
    items.push(hintP(st.scene === 'balls' ? 'hint.ballsCtl' : 'hint.natureCtl'));
  } else if (tab === 'magnitude') {
    items.push(seg('ctl.dev', Object.keys(DEVICES).map((k) => [k, `dev.${k}`]), st.dev, (v) => { st.dev = v; st.t = 0; st.running = false; buildTab(); }));
    items.push(btnRow(
      createButton({ labelKey: st.running ? 'ctl.stop' : 'ctl.start', variant: 'primary', onClick: () => { st.running = !st.running; buildTab(); } }),
      createButton({ labelKey: 'ctl.record', onClick: () => recordMagnitude(st) }),
      createButton({ labelKey: 'ctl.zero', variant: 'ghost', onClick: () => { st.t = 0; st.running = false; buildTab(); } })));
    items.push(hintP('hint.magnitudeCtl'));
  } else if (tab === 'dcac') {
    items.push(seg('ctl.src', [['battery', 'src.battery'], ['generator', 'src.generator']], st.src, (v) => { st.src = v; buildTab(); }));
    items.push(seg('ctl.switch', [['closed', 'sw.closed'], ['open', 'sw.open']], st.closed ? 'closed' : 'open', (v) => { st.closed = v === 'closed'; }));
    if (st.src === 'generator') {
      const s = createSlider({ labelKey: 'ctl.speed', min: 0.25, max: 1.5, step: 0.25, value: st.speed, format: (x) => `${num(x, 2)} ${t('unit.tps')}`, onInput: (x) => { st.speed = x; } });
      items.push(s.root);
    }
    items.push(btnRow(resetBtn(tab)));
    items.push(hintP('hint.dcacCtl'));
  } else if (tab === 'ammeter') {
    items.push(seg('ctl.amode', [['measure', 'amode.measure'], ['practice', 'amode.practice']], st.practice ? 'practice' : 'measure', (v) => {
      st.practice = v === 'practice'; if (st.practice) newPractice(st); st.fb = null; buildTab();
    }));
    if (!st.practice) {
      items.push(seg('ctl.load', Object.keys(LOADS).map((k) => [k, `load.${k}`]), st.load, (v) => { st.load = v; st.fb = null; updateMeasures(); }));
      items.push(seg('ctl.scale', A_SCALES.map((s) => [s, `scale.${s}`]), st.scale, (v) => { st.scale = Number(v); st.fb = null; updateMeasures(); }));
      items.push(seg('ctl.conn', [['series', 'conn.series'], ['reversed', 'conn.reversed'], ['parallel', 'conn.parallel']], st.conn, (v) => { st.conn = v; st.fb = null; updateMeasures(); }));
      items.push(btnRow(createButton({ labelKey: 'ctl.record', variant: 'primary', onClick: () => recordAmmeter(st) }), resetBtn(tab)));
      items.push(hintP('hint.ammeterCtl'));
    } else {
      items.push(btnRow(createButton({ labelKey: 'ctl.newReading', variant: 'primary', onClick: () => { newPractice(st); st.fb = null; ui.sig = null; updateMeasures(); } })));
      items.push(hintP('hint.practice'));
    }
  } else if (tab === 'laws') {
    items.push(seg('ctl.mode', [['series', 'mode.series'], ['parallel', 'mode.parallel']], st.mode, (v) => { st.mode = v; st.fb = null; buildTab(); }));
    items.push(seg('ctl.switch', [['closed', 'sw.closed'], ['open', 'sw.open']], st.closed ? 'closed' : 'open', (v) => { st.closed = v === 'closed'; updateMeasures(); }));
    if (st.mode === 'parallel') {
      const s = createSlider({ labelKey: 'ctl.rh', min: 0, max: 20, step: 1, value: st.rh, format: (x) => `${num(x, 0)} Ω`, onInput: (x) => { st.rh = x; updateMeasures(); } });
      items.push(s.root);
      items.push(btnRow(createButton({ labelKey: 'ctl.recordI', variant: 'primary', onClick: () => recordLaws(st) }), resetBtn(tab)));
    } else items.push(btnRow(resetBtn(tab)));
    items.push(hintP(st.mode === 'series' ? 'hint.seriesCtl' : 'hint.parallelCtl'));
  }
  controlsBody.append(...items);
  ui.dl = el('dl', { class: 'meas' });
  ui.status = el('div', { class: 'status', hidden: '' });
  ui.tables = el('div');
  ui.clear = createButton({ labelKey: 'ctl.clearTable', variant: 'ghost', onClick: () => { const s = cur(); s.rows = []; s.fb = null; ui.sig = null; updateMeasures(); } });
  ui.clearRow = el('div', { class: 'btn-row', style: 'margin-top:8px' }, [ui.clear]);
  measuresBody.append(ui.dl, ui.status, ui.tables, ui.clearRow);
}

function recordMagnitude(st) {
  if (st.t < 0.5) { st.fb = { type: 'warn', key: 'fb.startFirst' }; updateMeasures(); return; }
  const tR = Math.round(st.t * 10) / 10;
  const N = (DEVICES[st.dev] * tR) / E_CHARGE;
  const e = Math.floor(Math.log10(N)), m = Math.round((N / 10 ** e) * 100) / 100;
  st.rows.push({ dev: st.dev, t: tR, m, e });
  st.running = false; st.fb = null; ui.sig = null; buildTab();
}
function newPractice(st) {
  const scale = A_SCALES[Math.floor(Math.random() * A_SCALES.length)];
  st.pq = { scale, n: Math.round(10 + Math.random() * 88) };
  st.calc = {};
}
function recordAmmeter(st) {
  if (st.conn === 'parallel') { st.fb = { type: 'bad', key: 'fb.parallelNo' }; updateMeasures(); return; }
  if (st.conn === 'reversed') { st.fb = { type: 'bad', key: 'fb.revNo' }; updateMeasures(); return; }
  const I = loadCurrent(st);
  if (I > st.scale) { st.fb = { type: 'bad', key: 'fb.overNo' }; updateMeasures(); return; }
  st.rows.push({ load: st.load, scale: st.scale, n: (I / st.scale) * 100, mA: I * 1000, best: A_SCALES.find((s) => s >= I) === st.scale });
  st.fb = null; ui.sig = null; updateMeasures();
}
function recordLaws(st) {
  if (!st.closed) { st.fb = { type: 'warn', key: 'fb.closeFirst' }; updateMeasures(); return; }
  const { I, I1, I2 } = parallelI(st);
  const r3 = (x) => Math.round(x * 1000) / 1000;
  st.rows.push({ rh: st.rh, I: r3(I), I1: r3(I1), I2: r3(I2) });
  st.fb = null; ui.sig = null; updateMeasures();
}
function onCheckFor(st) {
  return (res) => {
    st.fb = res === 'invalid' ? { type: 'warn', key: 'calc.invalid' } : res === 'ok' ? { type: 'good', key: 'fb.ok' } : { type: 'bad', key: 'fb.wrong' };
    ui.sig = null; updateMeasures();
  };
}

function updateMeasures() {
  if (!shell || !ui.dl) return;
  const tab = shell.tab, st = cur();
  const rows = [];
  let tableBuilder = null;
  ui.clearRow.hidden = true;
  if (tab === 'nature') {
    if (st.scene !== 'balls') {
      rows.push([t('m.carriers'), t(st.scene === 'metal' ? 'car.metal' : 'car.elec')]);
      rows.push([t('m.motion'), t(st.on ? (st.scene === 'metal' ? 'mot.metalOn' : 'mot.elecOn') : 'mot.off')]);
      rows.push([t('m.current'), t(st.on ? 'cur.yes' : 'cur.no')]);
    } else {
      rows.push([t('m.speedEst'), t('val.speedEst')], [t('m.speedEl'), t('val.speedEl')]);
    }
  } else if (tab === 'magnitude') {
    const I = DEVICES[st.dev];
    rows.push([t('m.device'), t(`dev.${st.dev}`)], [t('m.I'), `${dec(String(I))} A`]);
    rows.push([t('m.t'), `${dec(st.t.toFixed(1))} s`], ['N', sci((I * Math.round(st.t * 10) / 10) / E_CHARGE)]);
    if (st.rows.length) ui.clearRow.hidden = false;
    tableBuilder = () => magnitudeTables(st);
  } else if (tab === 'dcac') {
    const v = dcacValues(st);
    rows.push([t('m.src'), t(`src.${st.src}`)]);
    rows.push([t('m.galva'), t(st.src === 'battery' ? (v.I > 0 ? 'galva.dc' : 'galva.zero') : st.closed ? 'galva.ac' : 'galva.zero')]);
    if (st.src === 'battery') rows.push(['I', `${num(v.I, 3)} A`], ['U', `${num(v.U, 2)} V`]);
    else rows.push([t('m.f'), `${num(st.speed, 2)} Hz`], [t('m.Imax'), `${num(v.Imax, 3)} A`]);
  } else if (tab === 'ammeter') {
    const s = st.practice ? st.pq.scale : st.scale;
    rows.push([t('m.scale'), scaleText(s)], [t('m.N'), '100']);
    if (!st.practice && st.rows.length) ui.clearRow.hidden = false;
    tableBuilder = () => (st.practice ? practiceTable(st) : ammeterTable(st));
  } else if (tab === 'laws') {
    if (st.mode === 'series') {
      const I = seriesI(st);
      rows.push(['A1', `${num(I, 3)} A`], ['A2', `${num(I, 3)} A`], ['A3', `${num(I, 3)} A`]);
    } else {
      const { I, I1, I2 } = parallelI(st);
      rows.push([t('m.rh'), `${num(st.rh, 0)} Ω`], ['A (I)', `${num(I, 3)} A`], ['A1 (I1)', `${num(I1, 3)} A`], ['A2 (I2)', `${num(I2, 3)} A`]);
      if (st.rows.length) ui.clearRow.hidden = false;
      tableBuilder = () => lawsTable(st);
    }
  }
  ui.dl.replaceChildren(...rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)]));
  if (!st.fb) ui.status.hidden = true;
  else { ui.status.hidden = false; ui.status.className = `status ${st.fb.type || ''}`; ui.status.textContent = t(st.fb.key); }
  if (tableBuilder) {
    const sig = JSON.stringify([tab, st.mode, st.rows?.length, st.pq, st.practice]) + calcSig([st, ...(st.rows || [])]);
    if (sig !== ui.sig) { ui.sig = sig; ui.tables.replaceChildren(...tableBuilder()); }
  } else { ui.sig = null; ui.tables.replaceChildren(); }
}

const relTol = (x, r = 0.01) => Math.max(Math.abs(x) * r, 1e-9);
function magnitudeTables(st) {
  const out = [];
  if (!st.rows.length) out.push(el('p', { class: 'muted', style: 'margin:8px 0 0;font-size:0.88rem' }, t('tbl.magEmpty')));
  else {
    const body = st.rows.map((r) => {
      const Q = r.m * 10 ** r.e * E_CHARGE;
      return el('tr', {}, [td(t(`dev.${r.dev}`)), td(`${dec(r.t.toFixed(1))} s`), td(sci(r.m * 10 ** r.e)),
        calcCell(r, 'Q', { expected: Q, decimals: 2, tol: relTol(Q, 0.02), onCheck: onCheckFor(st) }),
        calcCell(r, 'I', { expected: Q / r.t, decimals: 2, tol: relTol(Q / r.t, 0.02), onCheck: onCheckFor(st) })]);
    });
    out.push(el('div', { class: 'table-scroll' }, el('table', { class: 'data' }, [
      el('thead', {}, el('tr', {}, [th(t('col.dev')), th('t'), th('N'), th('Q = N e (C)'), th('I = Q / t (A)')])), el('tbody', {}, body)])));
  }
  out.push(el('h3', { style: 'margin:14px 0 0;font-size:0.95rem' }, t('tbl.book')));
  const ex = [
    ['ex31', 0.9375, 2], ['ex32', 2.5, 1], ['t6', 0.48, 2], ['t7', 0.6, 1], ['t8', 25000, 0], ['p1', 16666.7, 0], ['p4', 16, 0],
  ];
  out.push(el('table', { class: 'data' }, [
    el('thead', {}, el('tr', {}, [th(t('col.q')), th(t('col.answer'))])),
    el('tbody', {}, ex.map(([k, v, d]) => el('tr', {}, [td(t(`row.${k}`)), calcCell(st, k, { expected: v, decimals: d, tol: relTol(v, 0.012), onCheck: onCheckFor(st) })]))),
  ]));
  return out;
}
function ammeterTable(st) {
  if (!st.rows.length) return [el('p', { class: 'muted', style: 'margin:8px 0 0;font-size:0.88rem' }, t('tbl.ammEmpty'))];
  const body = st.rows.map((r) => el('tr', {}, [
    td(t(`load.${r.load}`)), td(scaleText(r.scale)),
    calcCell(r, 'n', { expected: r.n, decimals: 1, tol: 0.6, onCheck: onCheckFor(st) }),
    calcCell(r, 'I', { expected: r.mA, decimals: 2, tol: (r.scale * 1000 * 0.6) / 100, onCheck: onCheckFor(st) }),
  ]));
  return [el('div', { class: 'table-scroll' }, el('table', { class: 'data' }, [
    el('thead', {}, el('tr', {}, [th(t('col.load')), th(t('col.scale')), th(t('col.n')), th('I (mA)')])), el('tbody', {}, body)]))];
}
function practiceTable(st) {
  const { scale, n } = st.pq;
  return [el('table', { class: 'data' }, [
    el('thead', {}, el('tr', {}, [th(t('col.n')), th('I (mA)')])),
    el('tbody', {}, el('tr', {}, [calcCell(st, 'pn', { expected: n, decimals: 0, tol: 0.5, onCheck: onCheckFor(st) }), calcCell(st, 'pi', { expected: scale * n * 10, decimals: 2, tol: Math.max(0.001, scale * 1000 * 0.005), onCheck: onCheckFor(st) })])),
  ])];
}
function lawsTable(st) {
  const body = st.rows.map((r) => el('tr', {}, [td(`${num(r.rh, 0)} Ω`), td(num(r.I, 3)), td(num(r.I1, 3)), td(num(r.I2, 3)),
    calcCell(r, 's', { expected: r.I1 + r.I2, decimals: 3, tol: 0.0015, onCheck: onCheckFor(st) })]));
  if (!body.length) return [el('p', { class: 'muted', style: 'margin:8px 0 0;font-size:0.88rem' }, t('tbl.lawsEmpty'))];
  return [el('div', { class: 'table-scroll' }, el('table', { class: 'data' }, [
    el('thead', {}, el('tr', {}, [th(t('col.rh')), th('I (A)'), th('I1 (A)'), th('I2 (A)'), th('I1 + I2 (A)')])), el('tbody', {}, body)]))];
}

function buildTab() {
  controlsBody.replaceChildren(); measuresBody.replaceChildren();
  ui = {};
  const st = cur();
  if (shell.tab === 'ammeter' && st.practice && !st.pq) newPractice(st);
  build(); updateMeasures();
  loop.start(); requestDraw();
}
onLangChange(() => { if (shell) buildTab(); });

shell = initSim({
  strings,
  tabs: TABS.map((id) => ({ id, labelKey: `tab.${id}` })),
  initialTab: 'nature',
  onTab: buildTab,
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, get tab() { return shell.tab; }, seriesI, parallelI, loadCurrent, dcacValues };
