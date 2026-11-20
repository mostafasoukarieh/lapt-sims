// Sec 1 — Chapter 2: Potential difference (Tension électrique). Whole chapter (p.26–41).
// Symbols: EN book V_AB, FR book U_AB (strings 'sym.U'); potentials V_A in both.
// Owner (4 Nov 2026): Sec 1 batteries have an emf E and an internal resistance r (book Table 5.1).
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num } from '../../../shared/format.js';
import { createButton, createSegmented, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, font } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { calcCell, calcSig } from '../../../shared/calc-cell.js';
import { drawMeterBox, drawLead, drawCurrentArrows, METER_HALF } from '../../../shared/circuit-draw.js';
import { drawScope, drawLFG, svText, vbText, traceLength, DIV_X, DIV_Y } from '../../../shared/oscilloscope.js';
import { label } from '../../../shared/figures.js';

/* ================================================================
   Model values
   ================================================================ */
const E = 4.27, R_INT = 1.9;            // 4.5 V flat battery (Table 5.1)
const R_LAMP = 12;                       // lamp of the measuring tab (Ω)
const R_SER = [6, 8, 10];                // L1, L2, L3 in series (Exp. 2.6)
const R_PAR = { lamp: 12, motor: 6 };    // second load in parallel (Exp. 2.7)
const W = 600, H = 440;
const TABS = ['analogy', 'measure', 'laws', 'potentials', 'analog', 'scope'];
const SCALES = [1, 3, 10, 30, 100, 300];
const divsOf = (s) => (s === 3 || s === 30 || s === 300 ? 30 : 100); // Fig. 2.17
const SOURCES = { cell: 1.55, flat: E, car: 12.6 };
const SV = [0.5, 1, 2, 5];

function initialState(tab) {
  switch (tab) {
    case 'analogy': return { scene: 'water', hA: 6, hB: 6, open: false, flow: 0, q: 0, q0: 6, wired: false, dots: [], acc: 0 };
    case 'measure': return { closed: true, red: 'A', com: 'B', next: 'red', arrows: false };
    case 'laws': return { mode: 'series', closed: true, red: 'P', com: 'A', next: 'red', load2: 'lamp', meas: {}, calc: {}, fb: null };
    case 'potentials': return { ground: 'N', calc: {}, fb: null };
    case 'analog': return { src: 'flat', unknown: 7.3, scale: 30, rev: false, rows: [], practice: false, pq: null, calc: {}, fb: null, needle: 0 };
    case 'scope': return { src: 'flat', rev: false, sv: 2, sweep: false, wave: 'sine', rows: [], fb: null, spot: 0 };
    default: return {};
  }
}
let S = Object.fromEntries(TABS.map((k) => [k, initialState(k)]));
let shell;
const cur = () => S[shell.tab];
const U = () => t('sym.U'); // V (EN) or U (FR)

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
   Drawing helpers
   ================================================================ */
function board(ctx) { ctx.fillStyle = cssVar('--board'); roundRect(ctx, 6, 6, W - 12, H - 12, 14); ctx.fill(); }
function line(ctx, pts, color = cssVar('--wire'), w = 4) {
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
}
function tag(ctx, s, x, y, color = cssVar('--text'), size = 14, align = 'center', weight = 800) {
  ctx.fillStyle = color; ctx.font = font(size, weight); ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(s, x, y);
}
// "V" with subscript "AB" (or "U" in French) drawn on the canvas
function symText(ctx, a, b, x, y, color = cssVar('--text'), size = 15, align = 'center') {
  ctx.font = font(size, 800);
  const main = U(), sub = `${a}${b}`;
  const w1 = ctx.measureText(main).width;
  ctx.font = font(size * 0.7, 800);
  const w2 = ctx.measureText(sub).width;
  let x0 = align === 'center' ? x - (w1 + w2) / 2 : align === 'right' ? x - w1 - w2 : x;
  ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.font = font(size, 800); ctx.fillText(main, x0, y);
  ctx.font = font(size * 0.7, 800); ctx.fillText(sub, x0 + w1, y + size * 0.3);
}
function lampAt(ctx, x, y, glow, name, vertical = false) {
  if (glow > 0.02) {
    const g = ctx.createRadialGradient(x, y, 4, x, y, 42);
    g.addColorStop(0, `rgba(255, 214, 90, ${0.75 * glow})`); g.addColorStop(1, 'rgba(255, 214, 90, 0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 42, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = glow > 0.02 ? `rgb(255, ${Math.round(236 - 30 * glow)}, ${Math.round(170 - 110 * glow)})` : cssVar('--surface');
  ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(x, y, 18, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  const k = 18 * Math.SQRT1_2;
  ctx.beginPath(); ctx.moveTo(x - k, y - k); ctx.lineTo(x + k, y + k); ctx.moveTo(x + k, y - k); ctx.lineTo(x - k, y + k); ctx.stroke();
  if (name) { if (vertical) tag(ctx, name, x + 26, y, cssVar('--text'), 15, 'left'); else tag(ctx, name, x, y - 31, cssVar('--text'), 15); }
}
function motorAt(ctx, x, y, name, vertical = false) {
  ctx.fillStyle = cssVar('--surface'); ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(x, y, 18, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  tag(ctx, 'M', x, y + 1, cssVar('--text'), 16);
  if (name) { if (vertical) tag(ctx, name, x + 26, y, cssVar('--text'), 15, 'left'); else tag(ctx, name, x, y - 31, cssVar('--text'), 15); }
}
// Flat battery standing vertically: + at the top, − at the bottom
function batteryV(ctx, x, y1, y2) {
  const h = y2 - y1;
  ctx.fillStyle = cssVar('--battery'); ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.5;
  roundRect(ctx, x - 30, y1, 60, h, 8); ctx.fill(); ctx.stroke();
  ctx.fillStyle = cssVar('--gold'); ctx.fillRect(x - 22, y1 + h / 2 + 4, 44, 10);
  tag(ctx, '4.5 V'.replace('.', t('dec')), x, y1 + h / 2 - 10, '#ffffff', 14);
  tag(ctx, '+', x + 42, y1 + 12, cssVar('--accent'), 20);
  tag(ctx, '−', x + 42, y2 - 12, cssVar('--text'), 22);
  tag(ctx, 'G', x - 44, (y1 + y2) / 2, cssVar('--text'), 16);
}
function switchH(ctx, x1, x2, y, open) {
  ctx.strokeStyle = cssVar('--wire'); ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y);
  if (open) ctx.lineTo(x1 + (x2 - x1) * 0.9, y - (x2 - x1) * 0.45); else ctx.lineTo(x2 - 4, y - 7);
  ctx.stroke();
  // terminals drawn as rings so that the switch is recognised even when closed
  for (const x of [x1, x2]) {
    ctx.fillStyle = cssVar('--surface'); ctx.strokeStyle = cssVar('--wire'); ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
}
function dot(ctx, [x, y], r = 5) { ctx.fillStyle = cssVar('--wire'); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
let hits = [];
// points the voltmeter leads can be put on
function points(ctx, PT, offs) {
  for (const [k, p] of Object.entries(PT)) {
    dot(ctx, p, 6);
    const o = offs[k] || [0, -18];
    tag(ctx, k, p[0] + o[0], p[1] + o[1], cssVar('--text'), 16);
    hits.push({ kind: 'point', id: k, x: p[0], y: p[1], r: 24 });
  }
}
// Digital voltmeter box with its leads to the points red / com
function voltmeter(ctx, at, PT, red, com, value) {
  const [x, y] = at;
  // the red terminal is put on the side of the red lead's point, so the leads do not cross the display
  const flip = PT[red][0] > PT[com][0];
  const rT = [x + (flip ? 1 : -1) * METER_HALF, y], cT = [x + (flip ? -1 : 1) * METER_HALF, y];
  const ctrl = (from, to) => [from[0] + (to[0] - from[0]) * 0.75, Math.max(from[1] + 70, to[1] + 30)];
  drawMeterBox(ctx, { x, y, kind: 'V', name: 'V', text: num(value, 2), unit: 'V', flip });
  drawLead(ctx, rT, PT[red], cssVar('--accent'), ctrl(rT, PT[red]));
  drawLead(ctx, cT, PT[com], cssVar('--lead-black'), ctrl(cT, PT[com]));
  tag(ctx, 'COM', cT[0] + (flip ? 4 : -4), y + 38, cssVar('--muted'), 11);
  symText(ctx, red, com, x, y - 48, cssVar('--meter-v'), 16);
}
function hint(ctx, text) { label(ctx, text, W / 2, H - 20, { size: 13, weight: 600, color: cssVar('--muted') }); }

/* ================================================================
   Tab 1 — Water analogy and two charged balls (Exp. 2.1, Fig. 2.2)
   ================================================================ */
const VESSEL = { ax: 150, bx: 400, w: 110, bottom: 330, cm: 14 };
function stepAnalogy(st, dt) {
  if (st.scene === 'water') {
    const d = st.hA - st.hB;
    st.flow = st.open ? 0.9 * d : 0;
    st.hA -= st.flow * dt; st.hB += st.flow * dt;
    if (Math.abs(d) < 0.01) st.flow = 0;
  } else if (st.wired && st.q > 0) {
    st.acc += dt * 2.2;
    while (st.acc > 1 && st.q > 0) {
      st.acc -= 1;
      st.dots.push(0);
    }
    for (let i = 0; i < st.dots.length; i++) st.dots[i] += dt * 0.9;
    while (st.dots.length && st.dots[0] >= 1) { st.dots.shift(); st.q -= 1; }
  }
}
function drawAnalogy(ctx, st) {
  board(ctx);
  if (st.scene === 'water') {
    const { ax, bx, w, bottom, cm } = VESSEL;
    const top = bottom - 14 * cm;
    for (const [x, h, name] of [[ax, st.hA, 'A'], [bx, st.hB, 'B']]) {
      ctx.fillStyle = cssVar('--water'); ctx.globalAlpha = 0.75;
      ctx.fillRect(x - w / 2, bottom - h * cm, w, h * cm); ctx.globalAlpha = 1;
      ctx.strokeStyle = cssVar('--glass-stroke'); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x - w / 2, top); ctx.lineTo(x - w / 2, bottom); ctx.lineTo(x + w / 2, bottom); ctx.lineTo(x + w / 2, top); ctx.stroke();
      tag(ctx, name, x, top - 18, cssVar('--text'), 18);
      tag(ctx, `${num(h, 1)} cm`, x, bottom - h * cm - 14, cssVar('--text'), 13);
    }
    // tube with the tap R
    const ty = bottom - 14;
    ctx.fillStyle = cssVar('--water'); ctx.globalAlpha = 0.75;
    ctx.fillRect(ax + w / 2, ty - 7, bx - ax - w, 14); ctx.globalAlpha = 1;
    ctx.strokeStyle = cssVar('--glass-stroke'); ctx.lineWidth = 2.5;
    ctx.strokeRect(ax + w / 2, ty - 8, bx - ax - w, 16);
    const rx = (ax + bx) / 2;
    ctx.fillStyle = cssVar('--metal'); roundRect(ctx, rx - 12, ty - 16, 24, 32, 5); ctx.fill();
    ctx.save(); ctx.translate(rx, ty - 30); ctx.rotate(st.open ? Math.PI / 2 : 0);
    ctx.fillStyle = cssVar('--accent'); roundRect(ctx, -22, -5, 44, 10, 5); ctx.fill(); ctx.restore();
    tag(ctx, 'R', rx, ty - 50, cssVar('--text'), 16);
    // flow arrows
    if (Math.abs(st.flow) > 0.02) {
      const dir = Math.sign(st.flow), ph = (performance.now() / 300) % 1;
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 4; i++) {
        const u = ((i + ph) / 4);
        const x = ax + w / 2 + 10 + u * (bx - ax - w - 20);
        const xx = dir > 0 ? x : ax + w / 2 + (bx - ax - w) - (x - ax - w / 2);
        ctx.beginPath(); ctx.moveTo(xx + 6 * dir, ty); ctx.lineTo(xx - 5 * dir, ty - 5); ctx.lineTo(xx - 5 * dir, ty + 5); ctx.fill();
      }
    }
    hint(ctx, t(st.open ? 'hint.tapOpen' : 'hint.tapClosed'));
  } else {
    // two identical metal balls on insulating stands, joined by a conducting wire (Fig. 2.2)
    const A = [170, 190], B = [430, 190], R = 46;
    const qA = -st.q, qB = st.q;
    for (const [p, q, name] of [[A, qA, 'A'], [B, qB, 'B']]) {
      ctx.fillStyle = cssVar('--glass-rod'); ctx.fillRect(p[0] - 5, p[1] + R - 4, 10, 150);
      ctx.fillStyle = cssVar('--stone'); roundRect(ctx, p[0] - 40, p[1] + R + 140, 80, 12, 4); ctx.fill();
      const g = ctx.createRadialGradient(p[0] - 12, p[1] - 12, 4, p[0], p[1], R);
      g.addColorStop(0, '#ffffff'); g.addColorStop(1, cssVar('--metal'));
      ctx.fillStyle = g; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(p[0], p[1], R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      const n = Math.round(Math.abs(q));
      for (let i = 0; i < n; i++) {
        const a = (i / Math.max(1, n)) * Math.PI * 2 + 0.3, rr = i % 2 ? 18 : 31;
        charge(ctx, p[0] + rr * Math.cos(a), p[1] + rr * Math.sin(a), Math.sign(q));
      }
      tag(ctx, name, p[0], p[1] - R - 18, cssVar('--text'), 18);
      tag(ctx, t(Math.abs(q) < 0.5 ? 'q.neutral' : q > 0 ? 'q.pos' : 'q.neg'), p[0], p[1] + R + 168, cssVar('--muted'), 13, 'center', 700);
    }
    if (st.wired) {
      const y = A[1] - 12;
      line(ctx, [[A[0] + R - 4, y], [B[0] - R + 4, y]], cssVar('--copper'), 4);
      for (const u of st.dots) charge(ctx, A[0] + R + u * (B[0] - A[0] - 2 * R), y, -1, 6);
    }
    hint(ctx, t(st.wired ? 'hint.wired' : 'hint.notWired'));
  }
}
function charge(ctx, x, y, sign, r = 7) {
  ctx.fillStyle = cssVar('--surface'); ctx.strokeStyle = cssVar(sign > 0 ? '--plus' : '--minus'); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - r * 0.55, y); ctx.lineTo(x + r * 0.55, y);
  if (sign > 0) { ctx.moveTo(x, y - r * 0.55); ctx.lineTo(x, y + r * 0.55); }
  ctx.stroke();
}

/* ================================================================
   Tab 2 — Measuring potential differences (Exp. 2.2 to 2.5)
   Battery G, connection wire MN, switch K (C–D), lamp L (A–B).
   ================================================================ */
const M_PT = { P: [100, 80], M: [170, 80], N: [300, 80], C: [370, 80], D: [450, 80], A: [530, 150], B: [530, 290], Q: [100, 360] };
function measurePotentials(st) {
  const I = st.closed ? E / (R_LAMP + R_INT) : 0;
  const Ub = E - R_INT * I;
  const hi = Ub;
  const V = { Q: 0, B: 0, P: hi, M: hi, N: hi, C: hi };
  V.D = st.closed ? hi : 0;
  V.A = V.D;
  return { V, I };
}
function drawMeasure(ctx, st) {
  board(ctx); hits = [];
  const { V, I } = measurePotentials(st);
  const P = M_PT;
  // wires
  line(ctx, [P.P, P.M]); line(ctx, [P.N, P.C]); line(ctx, [P.D, [530, 80], P.A]); line(ctx, [P.B, [530, 360], P.Q]);
  line(ctx, [P.M, P.N], cssVar('--copper'), 6); // the connection wire MN studied
  tag(ctx, t('lbl.wire'), (P.M[0] + P.N[0]) / 2, 104, cssVar('--muted'), 12, 'center', 700);
  line(ctx, [P.P, [100, 120]]); line(ctx, [[100, 320], P.Q]);
  batteryV(ctx, 100, 120, 320);
  switchH(ctx, P.C[0], P.D[0], 80, !st.closed);
  tag(ctx, 'K', (P.C[0] + P.D[0]) / 2, 116, cssVar('--text'), 16);
  line(ctx, [P.A, [530, 202]]); line(ctx, [[530, 238], P.B]);
  lampAt(ctx, 530, 220, st.closed ? 0.85 : 0, 'L', true);
  if (st.arrows && I > 0) {
    const ph = (performance.now() / 25) % 1000;
    const skip = (x, y) => (x === 100 && y > 110 && y < 330) || (x === 530 && y > 196 && y < 244);
    drawCurrentArrows(ctx, [P.P, P.C, P.D, [530, 80], [530, 360], P.Q], ph, skip);
  }
  points(ctx, P, { P: [-18, -14], Q: [-18, 14], A: [22, -10], B: [22, 10], C: [0, -20], D: [6, -22] });
  voltmeter(ctx, [300, 240], P, st.red, st.com, V[st.red] - V[st.com]);
  hint(ctx, t(st.next === 'red' ? 'hint.tapRed' : 'hint.tapCom'));
}

/* ================================================================
   Tab 3 — Laws: addition (series, Exp. 2.6) and uniqueness (parallel, Exp. 2.7)
   ================================================================ */
const SER_PT = { P: [100, 80], A: [250, 80], B: [400, 80], N: [520, 300] };
const PAR_PT = { A: [100, 80], B: [100, 360], C: [320, 130], D: [320, 310], E: [500, 130], F: [500, 310] };
function seriesValues(closed) {
  const Rt = R_SER[0] + R_SER[1] + R_SER[2];
  const I = closed ? E / (Rt + R_INT) : 0;
  const Ub = E - R_INT * I;
  const V = closed ? { N: 0, B: I * R_SER[2], A: I * (R_SER[1] + R_SER[2]), P: Ub } : { N: E, B: E, A: E, P: E };
  return { V, I };
}
function parallelValues(load2) {
  const R1 = R_LAMP, R2 = R_PAR[load2];
  const Rp = (R1 * R2) / (R1 + R2);
  const I = E / (Rp + R_INT);
  const Ub = E - R_INT * I;
  return { V: { A: Ub, C: Ub, E: Ub, B: 0, D: 0, F: 0 }, I, I1: Ub / R1, I2: Ub / R2 };
}
function drawSeries(ctx, closed, opts = {}) {
  const P = SER_PT;
  line(ctx, [P.P, [175 - 20, 80]]); line(ctx, [[175 + 20, 80], P.A]); line(ctx, [P.A, [325 - 20, 80]]); line(ctx, [[325 + 20, 80], P.B]);
  line(ctx, [P.B, [520, 80], [520, 172]]); line(ctx, [[520, 208], P.N]);
  line(ctx, [P.N, [520, 360], [340, 360]]); line(ctx, [[260, 360], [100, 360], [100, 320]]);
  line(ctx, [P.P, [100, 120]]);
  batteryV(ctx, 100, 120, 320);
  switchH(ctx, 260, 340, 360, !closed);
  tag(ctx, 'K', 300, 336, cssVar('--text'), 16);
  const { I } = seriesValues(closed);
  const glow = (R) => (closed ? Math.min(1, 0.25 + I * I * R * 5) : 0);
  lampAt(ctx, 175, 80, glow(R_SER[0]), 'L1'); lampAt(ctx, 325, 80, glow(R_SER[1]), 'L2'); lampAt(ctx, 520, 190, glow(R_SER[2]), 'L3', true);
  if (opts.ground) groundAt(ctx, P[opts.ground]);
}
function groundAt(ctx, [x, y]) {
  // common ground symbol (Fig. 2.14) hanging under the point
  const yy = y + 36;
  ctx.strokeStyle = cssVar('--accent'); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x, y + 6); ctx.lineTo(x, yy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - 16, yy); ctx.lineTo(x + 16, yy); ctx.moveTo(x - 10, yy + 7); ctx.lineTo(x + 10, yy + 7); ctx.moveTo(x - 4, yy + 14); ctx.lineTo(x + 4, yy + 14); ctx.stroke();
}
function drawParallel(ctx, load2) {
  const P = PAR_PT;
  line(ctx, [P.A, [500, 80], P.E]); line(ctx, [[320, 80], P.C]);
  line(ctx, [P.B, [500, 360], P.F]); line(ctx, [[320, 360], P.D]);
  line(ctx, [P.A, [100, 120]]); line(ctx, [[100, 320], P.B]);
  batteryV(ctx, 100, 120, 320);
  line(ctx, [P.C, [320, 202]]); line(ctx, [[320, 238], P.D]);
  line(ctx, [P.E, [500, 202]]); line(ctx, [[500, 238], P.F]);
  lampAt(ctx, 320, 220, 0.8, 'L1', true);
  if (load2 === 'motor') motorAt(ctx, 500, 220, t('lbl.motor'), true); else lampAt(ctx, 500, 220, 0.8, 'L2', true);
  tag(ctx, 'M', 320, 62, cssVar('--muted'), 13); tag(ctx, 'N', 320, 380, cssVar('--muted'), 13);
}
function drawLaws(ctx, st) {
  board(ctx); hits = [];
  if (st.mode === 'series') {
    drawSeries(ctx, st.closed);
    const { V } = seriesValues(st.closed);
    points(ctx, SER_PT, { P: [-18, -14], A: [0, -24], B: [0, -24], N: [22, 6] });
    voltmeter(ctx, [300, 230], SER_PT, st.red, st.com, V[st.red] - V[st.com]);
  } else {
    drawParallel(ctx, st.load2);
    const { V } = parallelValues(st.load2);
    points(ctx, PAR_PT, { A: [-18, -14], B: [-18, 14], C: [-18, -8], D: [-18, 8], E: [18, -8], F: [18, 8] });
    voltmeter(ctx, [210, 230], PAR_PT, st.red, st.com, V[st.red] - V[st.com]);
  }
  hint(ctx, t(st.next === 'red' ? 'hint.tapRed' : 'hint.tapCom'));
}

/* ================================================================
   Tab 4 — Reference potential (2.5): choose the common ground
   ================================================================ */
const POT_ROUND = (() => {
  const { V } = seriesValues(true);
  const r2 = (x) => Math.round(x * 100) / 100;
  const PA = r2(V.P - V.A), AB = r2(V.A - V.B), BN = r2(V.B - V.N);
  return { PA, AB, BN };
})();
function potentialsOf(ground) {
  const { PA, AB, BN } = POT_ROUND;
  const abs = { N: 0, B: BN, A: BN + AB, P: BN + AB + PA };
  const g = abs[ground];
  return Object.fromEntries(Object.entries(abs).map(([k, v]) => [k, Math.round((v - g) * 100) / 100]));
}
function drawPotentials(ctx, st) {
  board(ctx); hits = [];
  drawSeries(ctx, true, { ground: st.ground });
  points(ctx, SER_PT, { P: [-18, -14], A: [0, -24], B: [0, -24], N: [22, 6] });
  const { PA, AB, BN } = POT_ROUND;
  const box = (a, b, v, x, y) => {
    symText(ctx, a, b, x - 34, y, cssVar('--meter-v'), 16, 'right');
    tag(ctx, `= ${num(v, 2)} V`, x - 30, y, cssVar('--meter-v'), 16, 'left');
  };
  box('P', 'A', PA, 210, 150); box('A', 'B', AB, 360, 150); box('B', 'N', BN, 470, 250);
  { const gp = SER_PT[st.ground], right = gp[0] > 450; tag(ctx, t('lbl.ground'), gp[0] + (right ? -24 : 24), gp[1] + 44, cssVar('--accent'), 13, right ? 'right' : 'left'); }
  hint(ctx, t('hint.ground'));
}

/* ================================================================
   Tab 5 — Analog voltmeter (Fig. 2.17, Examples 2.3–2.4, Problem 3)
   ================================================================ */
function analogTarget(st) {
  if (st.practice && st.pq) return st.pq.n / divsOf(st.pq.scale); // fraction of full scale
  const v = st.src === 'unknown' ? st.unknown : SOURCES[st.src];
  return ((st.rev ? -1 : 1) * v) / st.scale;
}
function drawAnalog(ctx, st) {
  board(ctx); hits = [];
  const cx = W / 2, cy = 330, R = 220;
  // case
  ctx.fillStyle = cssVar('--meter-body'); ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1.5;
  roundRect(ctx, 40, 40, W - 80, 340, 18); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fbfbf7'; roundRect(ctx, 60, 60, W - 120, 230, 10); ctx.fill();
  const a0 = -Math.PI / 2 - 0.85, a1 = -Math.PI / 2 + 0.85;
  const ang = (f) => a0 + (a1 - a0) * f;
  // scale 0–100 (outer) and 0–30 (inner)
  ctx.strokeStyle = '#222'; ctx.fillStyle = '#222'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(cx, cy, R, a0, a1); ctx.stroke();
  for (let i = 0; i <= 100; i++) {
    const a = ang(i / 100), l = i % 10 === 0 ? 14 : i % 5 === 0 ? 9 : 5;
    ctx.beginPath(); ctx.moveTo(cx + R * Math.cos(a), cy + R * Math.sin(a)); ctx.lineTo(cx + (R + l) * Math.cos(a), cy + (R + l) * Math.sin(a)); ctx.stroke();
    if (i % 10 === 0) { ctx.font = font(12, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(i), cx + (R + 26) * Math.cos(a), cy + (R + 26) * Math.sin(a)); }
  }
  const R2 = R - 26;
  ctx.beginPath(); ctx.arc(cx, cy, R2, a0, a1); ctx.stroke();
  for (let i = 0; i <= 30; i++) {
    const a = ang(i / 30), l = i % 5 === 0 ? 12 : 6;
    ctx.beginPath(); ctx.moveTo(cx + R2 * Math.cos(a), cy + R2 * Math.sin(a)); ctx.lineTo(cx + (R2 - l) * Math.cos(a), cy + (R2 - l) * Math.sin(a)); ctx.stroke();
    if (i % 5 === 0) { ctx.font = font(11, 700); ctx.fillText(String(i), cx + (R2 - 22) * Math.cos(a), cy + (R2 - 22) * Math.sin(a)); }
  }
  // mirror strip
  ctx.strokeStyle = 'rgba(150,170,190,0.9)'; ctx.lineWidth = 7;
  ctx.beginPath(); ctx.arc(cx, cy, R - 12, a0, a1); ctx.stroke();
  tag(ctx, 'V', cx, 245, '#222', 26);
  // needle (pegged beyond the ends)
  const f = Math.max(-0.06, Math.min(1.06, st.needle));
  const a = ang(f);
  ctx.strokeStyle = '#111'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx + 40 * Math.cos(a), cy + 40 * Math.sin(a)); ctx.lineTo(cx + (R + 8) * Math.cos(a), cy + (R + 8) * Math.sin(a)); ctx.stroke();
  ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(cx, cy, 9, 0, Math.PI * 2); ctx.fill();
  // selector of scales and terminals
  const scaleNow = st.practice && st.pq ? st.pq.scale : st.scale;
  tag(ctx, `${t('lbl.scale')} : ${num(scaleNow, 0)} V`, 120, 320, cssVar('--text-on-meter'), 15, 'left');
  tag(ctx, `(${divsOf(scaleNow)} ${t('lbl.divs')})`, 120, 344, cssVar('--text-on-meter'), 13, 'left', 700);
  ctx.fillStyle = '#1d1f24'; ctx.beginPath(); ctx.arc(420, 330, 11, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = cssVar('--accent'); ctx.beginPath(); ctx.arc(480, 330, 11, 0, Math.PI * 2); ctx.fill();
  tag(ctx, '−', 420, 306, cssVar('--text-on-meter'), 18); tag(ctx, '+', 480, 306, cssVar('--text-on-meter'), 18);
  if (!st.practice) {
    const name = t(`src.${st.src}`);
    tag(ctx, `${t('lbl.measured')} : ${name}${st.rev ? ` — ${t('lbl.reversed')}` : ''}`, W / 2, 404, cssVar('--text'), 13, 'center', 700);
  }
  if (Math.abs(st.needle) > 1.02 || st.needle < -0.02) {
    label(ctx, t(st.needle < 0 ? 'warn.reversed' : 'warn.over'), W / 2, 282, { size: 14, weight: 800, color: cssVar('--bad') });
  }
}

/* ================================================================
   Tab 6 — Oscilloscope (2.6, Example 2.5, Test 4)
   ================================================================ */
const LFG_F = 100, LFG_AMP = 3;
const VB_FAST = 0.002, VB_SLOW = 0.5;
function scopeVoltage(st) { return (st.rev ? -1 : 1) * (st.src === 'cell' ? SOURCES.cell : E); }
function waveAt(st, tSec) {
  const ph = (tSec * LFG_F) % 1;
  const v = st.wave === 'sine' ? Math.sin(2 * Math.PI * ph) : st.wave === 'saw' ? 2 * ph - 1 : ph < 0.5 ? 1 : -1;
  return LFG_AMP * v;
}
let simTime = 0;
function drawScopeTab(ctx, st) {
  board(ctx); hits = [];
  const d = 30;
  const vb = st.sweep ? VB_FAST : null;
  const isLFG = st.src === 'lfg';
  let o = { x: 150, y: 20, d, svLabel: svText(st.sv).replace('.', t('dec')), vbLabel: st.sweep ? vbText(VB_FAST).replace('.', t('dec')) : t('lbl.sweepOff'), svName: 'Sv', vbName: t('lbl.tb') };
  if (isLFG) {
    if (st.sweep) Object.assign(o, { curve: (x) => waveAt(st, x * VB_FAST) / st.sv, steady: true });
  } else {
    const y = scopeVoltage(st) / st.sv;
    if (st.sweep) Object.assign(o, { level: y, steady: true });
    else Object.assign(o, { level: y, steady: false, spotX: DIV_X / 2, len: 0 });
  }
  const r = drawScope(ctx, o);
  if (isLFG && !st.sweep) {
    // without sweeping the spot moves up and down: a vertical line
    const sc = r.screen, mx = sc.x + sc.w / 2, my = sc.y + sc.h / 2;
    const top = Math.min(DIV_Y / 2, LFG_AMP / st.sv) * d;
    ctx.save(); ctx.shadowColor = cssVar('--scope-trace'); ctx.shadowBlur = 8;
    ctx.strokeStyle = cssVar('--scope-trace'); ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(mx, my - top); ctx.lineTo(mx, my + top); ctx.stroke(); ctx.restore();
  }
  // the source, connected to input A (Y1) and ground M
  const bx = 70, by = 400;
  if (isLFG) {
    const g = drawLFG(ctx, 20, 300, 120, { name: t('lbl.lfg'), display: `${LFG_F} Hz`, shape: st.wave === 'saw' ? 'triangular' : st.wave });
    drawLead(ctx, g.out1, r.A, cssVar('--accent'), [g.out1[0] + 140, g.out1[1] + 60]);
    drawLead(ctx, g.out2, r.M, cssVar('--lead-black'), [g.out2[0] + 160, g.out2[1] + 80]);
  } else {
    ctx.fillStyle = cssVar('--battery'); roundRect(ctx, bx - 50, by - 60, 100, 50, 8); ctx.fill();
    tag(ctx, st.src === 'cell' ? '1.5 V'.replace('.', t('dec')) : '4.5 V'.replace('.', t('dec')), bx, by - 35, '#ffffff', 14);
    const pP = [bx - 30, by - 66], pN = [bx + 30, by - 66];
    tag(ctx, 'P (+)', pP[0], pP[1] - 14, cssVar('--accent'), 12); tag(ctx, 'N (−)', pN[0], pN[1] - 14, cssVar('--text'), 12);
    const toA = st.rev ? pN : pP, toM = st.rev ? pP : pN;
    drawLead(ctx, r.A, toA, cssVar('--accent'), [r.A[0] - 120, r.A[1] + 110]);
    drawLead(ctx, r.M, toM, cssVar('--lead-black'), [r.M[0] - 160, r.M[1] + 130]);
  }
}

/* ================================================================
   Main draw, loop
   ================================================================ */
function draw() {
  if (!shell) return;
  const ctx = view.begin();
  const st = cur();
  switch (shell.tab) {
    case 'analogy': drawAnalogy(ctx, st); break;
    case 'measure': drawMeasure(ctx, st); break;
    case 'laws': drawLaws(ctx, st); break;
    case 'potentials': drawPotentials(ctx, st); break;
    case 'analog': drawAnalog(ctx, st); break;
    case 'scope': drawScopeTab(ctx, st); break;
    default: break;
  }
}
let tick = 0;
const loop = createLoop({
  dt: 1 / 60,
  step(dt) {
    if (!shell) return false;
    const st = cur();
    simTime += dt;
    if (shell.tab === 'analogy') stepAnalogy(st, dt);
    if (shell.tab === 'analog') {
      const target = analogTarget(st);
      st.needle += (target - st.needle) * Math.min(1, 7 * dt);
    }
    return true;
  },
  render() {
    draw();
    if (++tick % 10 === 0 && (shell.tab === 'analogy')) updateMeasures();
  },
});

/* ================================================================
   Tapping the points (voltmeter leads)
   ================================================================ */
canvas.addEventListener('pointerdown', (ev) => {
  const tab = shell.tab;
  if (tab !== 'measure' && tab !== 'laws') return;
  const st = cur();
  const p = view.toLogical(ev);
  const h = hits.find((q) => q.kind === 'point' && Math.hypot(p.x - q.x, p.y - q.y) < q.r);
  if (!h) return;
  ev.preventDefault();
  if (st.next === 'red') { if (h.id !== st.com) st.red = h.id; st.next = 'com'; } else { if (h.id !== st.red) st.com = h.id; st.next = 'red'; }
  afterMeterChange(st);
});
function afterMeterChange(st) {
  if (shell.tab === 'laws') recordLaw(st);
  updateMeasures(); requestDraw();
}
function recordLaw(st) {
  const key = st.red + st.com;
  const list = st.mode === 'series' ? ['PA', 'AB', 'BN', 'PN'] : ['AB', 'CD', 'EF'];
  if (!list.includes(key)) return;
  const v = st.mode === 'series' ? seriesValues(st.closed).V : parallelValues(st.load2).V;
  st.meas[`${st.mode}|${st.mode === 'series' ? (st.closed ? 'c' : 'o') : st.load2}|${key}`] = Math.round((v[st.red] - v[st.com]) * 100) / 100;
}

/* ================================================================
   Panels
   ================================================================ */
const controlsBody = document.getElementById('controls-body');
const measuresBody = document.getElementById('measures-body');
let ui = {};
const seg = (labelKey, options, value, onChange) => createSegmented({ labelKey, options: options.map(([v, k]) => ({ value: String(v), labelKey: k })), value: String(value), onChange }).root;
const btnRow = (...b) => el('div', { class: 'btn-row', style: 'margin-top:8px' }, b);
const hintP = (key) => el('p', { class: 'muted', style: 'margin:8px 0 0;font-size:0.88rem' }, t(key));
const resetBtn = (tab) => createButton({ labelKey: 'ui.reset', variant: 'ghost', onClick: () => { S[tab] = initialState(tab); buildTab(); } });
const symEl = (a, b) => el('span', { class: 'keep-case' }, [U(), el('sub', {}, `${a}${b}`)]);
const potEl = (a) => el('span', { class: 'keep-case' }, ['V', el('sub', {}, a)]);
function quick(st, pairs) {
  return el('div', { class: 'btn-row', style: 'margin-top:8px;flex-wrap:wrap' }, pairs.map(([k, red, com]) => createButton({
    labelKey: k, onClick: () => { st.red = red; st.com = com; st.next = 'red'; afterMeterChange(st); },
  })));
}
function swapBtn(st) {
  return createButton({ labelKey: 'ctl.swap', variant: 'primary', onClick: () => { [st.red, st.com] = [st.com, st.red]; afterMeterChange(st); } });
}

function build() {
  const tab = shell.tab, st = cur();
  const items = [];
  if (tab === 'analogy') {
    items.push(seg('ctl.scene', [['water', 'scene.water'], ['balls', 'scene.balls']], st.scene, (v) => { st.scene = v; buildTab(); }));
    if (st.scene === 'water') {
      items.push(btnRow(
        createButton({ labelKey: 'ctl.pour', variant: 'primary', onClick: () => { if (!st.open) { st.hA = Math.min(13, st.hA + 3); } else st.hA = Math.min(13, st.hA + 3); updateMeasures(); } }),
        createButton({ labelKey: st.open ? 'ctl.closeTap' : 'ctl.openTap', onClick: () => { st.open = !st.open; buildTab(); } }),
        resetBtn(tab)));
      items.push(hintP('hint.water'));
    } else {
      items.push(btnRow(
        createButton({ labelKey: st.wired ? 'ctl.unwire' : 'ctl.wire', variant: 'primary', onClick: () => { st.wired = !st.wired; st.dots = []; buildTab(); } }),
        createButton({ labelKey: 'ctl.recharge', onClick: () => { st.q = st.q0; st.wired = false; st.dots = []; buildTab(); } }),
        resetBtn(tab)));
      items.push(hintP('hint.balls'));
    }
  } else if (tab === 'measure') {
    items.push(seg('ctl.switch', [['closed', 'sw.closed'], ['open', 'sw.open']], st.closed ? 'closed' : 'open', (v) => { st.closed = v === 'closed'; updateMeasures(); requestDraw(); }));
    items.push(quick(st, [['q.lamp', 'A', 'B'], ['q.wire', 'M', 'N'], ['q.switch', 'C', 'D'], ['q.battery', 'P', 'Q']]));
    items.push(btnRow(swapBtn(st), resetBtn(tab)));
    items.push(seg('ctl.arrows', [['no', 'ctl.no'], ['yes', 'ctl.yes']], st.arrows ? 'yes' : 'no', (v) => { st.arrows = v === 'yes'; requestDraw(); }));
    items.push(hintP('hint.measure'));
  } else if (tab === 'laws') {
    items.push(seg('ctl.mode', [['series', 'mode.series'], ['parallel', 'mode.parallel']], st.mode, (v) => {
      st.mode = v; st.fb = null; [st.red, st.com] = v === 'series' ? ['P', 'A'] : ['A', 'B']; st.next = 'red'; recordLaw(st); buildTab();
    }));
    if (st.mode === 'series') {
      items.push(seg('ctl.switch', [['closed', 'sw.closed'], ['open', 'sw.open']], st.closed ? 'closed' : 'open', (v) => { st.closed = v === 'closed'; recordLaw(st); updateMeasures(); requestDraw(); }));
      items.push(quick(st, [['q.PA', 'P', 'A'], ['q.AB', 'A', 'B'], ['q.BN', 'B', 'N'], ['q.PN', 'P', 'N']]));
    } else {
      items.push(seg('ctl.load2', [['lamp', 'load.lamp'], ['motor', 'load.motor']], st.load2, (v) => { st.load2 = v; recordLaw(st); updateMeasures(); requestDraw(); }));
      items.push(quick(st, [['q.ABb', 'A', 'B'], ['q.CD', 'C', 'D'], ['q.EF', 'E', 'F']]));
    }
    items.push(btnRow(swapBtn(st), resetBtn(tab)));
    items.push(hintP(st.mode === 'series' ? 'hint.series' : 'hint.parallel'));
  } else if (tab === 'potentials') {
    items.push(seg('ctl.ground', [['N', 'g.N'], ['B', 'g.B'], ['A', 'g.A'], ['P', 'g.P']], st.ground, (v) => { st.ground = v; st.calc = {}; st.fb = null; ui.sig = null; updateMeasures(); requestDraw(); }));
    items.push(btnRow(resetBtn(tab)));
    items.push(hintP('hint.potentials'));
  } else if (tab === 'analog') {
    items.push(seg('ctl.amode', [['measure', 'amode.measure'], ['practice', 'amode.practice']], st.practice ? 'practice' : 'measure', (v) => {
      st.practice = v === 'practice'; if (st.practice) newPractice(st); st.fb = null; buildTab();
    }));
    if (!st.practice) {
      items.push(seg('ctl.src', [['cell', 'src.cell'], ['flat', 'src.flat'], ['car', 'src.car'], ['unknown', 'src.unknown']], st.src, (v) => { st.src = v; if (v === 'unknown') st.unknown = Math.round((2 + Math.random() * 20) * 10) / 10; st.fb = null; updateMeasures(); }));
      items.push(seg('ctl.scale', SCALES.map((s) => [s, `scale.${s}`]), st.scale, (v) => { st.scale = Number(v); st.fb = null; updateMeasures(); }));
      items.push(seg('ctl.conn', [['ok', 'conn.ok'], ['rev', 'conn.rev']], st.rev ? 'rev' : 'ok', (v) => { st.rev = v === 'rev'; updateMeasures(); }));
      items.push(btnRow(createButton({ labelKey: 'ctl.record', variant: 'primary', onClick: () => recordAnalog(st) }), resetBtn(tab)));
      items.push(hintP('hint.analog'));
    } else {
      items.push(btnRow(createButton({ labelKey: 'ctl.newReading', variant: 'primary', onClick: () => { newPractice(st); st.fb = null; ui.sig = null; updateMeasures(); } })));
      items.push(hintP('hint.practice'));
    }
  } else if (tab === 'scope') {
    items.push(seg('ctl.osrc', [['flat', 'src.flat'], ['cell', 'src.cell'], ['lfg', 'src.lfg']], st.src, (v) => { st.src = v; if (v === 'lfg') st.sweep = true; buildTab(); }));
    if (st.src === 'lfg') items.push(seg('ctl.wave', [['sine', 'wave.sine'], ['saw', 'wave.saw'], ['square', 'wave.square']], st.wave, (v) => { st.wave = v; requestDraw(); }));
    else items.push(seg('ctl.conn2', [['ok', 'conn2.ok'], ['rev', 'conn2.rev']], st.rev ? 'rev' : 'ok', (v) => { st.rev = v === 'rev'; updateMeasures(); }));
    items.push(seg('ctl.sv', SV.map((s) => [s, `sv.${s}`]), st.sv, (v) => { st.sv = Number(v); updateMeasures(); }));
    items.push(seg('ctl.sweep', [['off', 'sweep.off'], ['on', 'sweep.on']], st.sweep ? 'on' : 'off', (v) => { st.sweep = v === 'on'; updateMeasures(); }));
    if (st.src !== 'lfg') items.push(btnRow(createButton({ labelKey: 'ctl.recordScope', variant: 'primary', onClick: () => recordScope(st) }), resetBtn(tab)));
    else items.push(btnRow(resetBtn(tab)));
    items.push(hintP(st.src === 'lfg' ? 'hint.lfg' : 'hint.scope'));
  }
  controlsBody.append(...items);
  ui.dl = el('dl', { class: 'meas' });
  ui.status = el('div', { class: 'status', hidden: '' });
  ui.tables = el('div');
  ui.clear = createButton({ labelKey: 'ctl.clearTable', variant: 'ghost', onClick: () => { const s = cur(); s.rows = []; s.fb = null; ui.sig = null; updateMeasures(); } });
  ui.clearRow = el('div', { class: 'btn-row', style: 'margin-top:8px' }, [ui.clear]);
  measuresBody.append(ui.dl, ui.status, ui.tables, ui.clearRow);
}

function newPractice(st) {
  const scale = SCALES[Math.floor(Math.random() * SCALES.length)];
  const N = divsOf(scale);
  const n = Math.round((0.15 + Math.random() * 0.8) * N);
  st.pq = { scale, n };
  st.calc = {};
}
function recordAnalog(st) {
  const v = st.src === 'unknown' ? st.unknown : SOURCES[st.src];
  if (st.rev) { st.fb = { type: 'bad', key: 'fb.revNo' }; updateMeasures(); return; }
  if (v > st.scale) { st.fb = { type: 'bad', key: 'fb.overNo' }; updateMeasures(); return; }
  const N = divsOf(st.scale);
  st.rows.push({ src: st.src, scale: st.scale, N, n: (v / st.scale) * N, v, best: SCALES.find((s) => s >= v) === st.scale });
  st.fb = null; ui.sig = null; updateMeasures();
}
function recordScope(st) {
  const v = scopeVoltage(st);
  const y = v / st.sv;
  if (!st.sweep) { st.fb = { type: 'warn', key: 'fb.sweepFirst' }; updateMeasures(); return; }
  if (Math.abs(y) > DIV_Y / 2) { st.fb = { type: 'bad', key: 'fb.offScreen' }; updateMeasures(); return; }
  st.rows.push({ sv: st.sv, y, v });
  st.fb = null; ui.sig = null; updateMeasures();
}

function onCheckFor(st) {
  return (res) => {
    st.fb = res === 'invalid' ? { type: 'warn', key: 'calc.invalid' } : res === 'ok' ? { type: 'good', key: 'fb.ok' } : { type: 'bad', key: 'fb.wrong' };
    ui.sig = null; updateMeasures();
  };
}
const th = (c) => el('th', { class: 'keep-case' }, c);
const td = (c) => el('td', { class: 'keep-case' }, c);

function updateMeasures() {
  if (!shell || !ui.dl) return;
  const tab = shell.tab, st = cur();
  const rows = [];
  let tableBuilder = null;
  ui.clearRow.hidden = true;
  if (tab === 'analogy') {
    if (st.scene === 'water') {
      rows.push([t('m.hA'), `${num(st.hA, 1)} cm`], [t('m.hB'), `${num(st.hB, 1)} cm`], [t('m.tap'), t(st.open ? 'tap.open' : 'tap.closed')]);
      rows.push([t('m.flow'), t(Math.abs(st.flow) > 0.02 ? (st.flow > 0 ? 'flow.AB' : 'flow.BA') : 'flow.none')]);
    } else {
      rows.push([t('m.qA'), t(st.q < 0.5 ? 'q.neutral' : 'q.neg')], [t('m.qB'), t(st.q < 0.5 ? 'q.neutral' : 'q.pos')]);
      rows.push([t('m.electrons'), t(st.wired && st.q > 0 ? 'el.moving' : st.wired ? 'el.stopped' : 'el.none')]);
    }
  } else if (tab === 'measure') {
    const { V, I } = measurePotentials(st);
    rows.push([symEl(st.red, st.com), `${num(V[st.red] - V[st.com], 2)} V`]);
    rows.push([t('m.switch'), t(st.closed ? 'sw.closed' : 'sw.open')]);
    rows.push([t('m.lamp'), t(I > 0 ? 'lamp.on' : 'lamp.off')]);
    rows.push([t('m.label'), '4.5 V'.replace('.', t('dec'))]);
  } else if (tab === 'laws') {
    const v = st.mode === 'series' ? seriesValues(st.closed).V : parallelValues(st.load2).V;
    rows.push([symEl(st.red, st.com), `${num(v[st.red] - v[st.com], 2)} V`]);
    tableBuilder = () => lawsTable(st);
  } else if (tab === 'potentials') {
    rows.push([t('m.ground'), st.ground], [potEl(st.ground), '0 V']);
    tableBuilder = () => potTable(st);
  } else if (tab === 'analog') {
    if (st.practice) {
      rows.push([t('m.scale'), `${num(st.pq.scale, 0)} V`], [t('m.N'), `${divsOf(st.pq.scale)}`]);
      tableBuilder = () => practiceTable(st);
    } else {
      rows.push([t('m.scale'), `${num(st.scale, 0)} V`], [t('m.N'), `${divsOf(st.scale)}`]);
      if (st.rows.length) ui.clearRow.hidden = false;
      tableBuilder = () => analogTable(st);
    }
  } else if (tab === 'scope') {
    rows.push(['Sv', svText(st.sv).replace('.', t('dec'))]);
    rows.push([t('lbl.tb'), st.sweep ? vbText(VB_FAST).replace('.', t('dec')) : t('lbl.sweepOff')]);
    if (st.src !== 'lfg') rows.push([t('m.connA'), st.rev ? 'N (−)' : 'P (+)']);
    if (st.rows.length) ui.clearRow.hidden = false;
    if (st.src !== 'lfg') tableBuilder = () => scopeTable(st);
  }
  ui.dl.replaceChildren(...rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)]));
  const fb = st.fb;
  if (!fb) ui.status.hidden = true;
  else { ui.status.hidden = false; ui.status.className = `status ${fb.type || ''}`; ui.status.textContent = t(fb.key); }
  if (tableBuilder) {
    const sig = JSON.stringify([tab, st.mode, st.closed, st.load2, st.ground, st.meas, st.rows?.length, st.pq, st.practice]) + calcSig([st, ...(st.rows || [])]);
    if (sig !== ui.sig) { ui.sig = sig; ui.tables.replaceChildren(...tableBuilder()); }
  } else { ui.sig = null; ui.tables.replaceChildren(); }
}

function lawsTable(st) {
  const isS = st.mode === 'series';
  const variant = isS ? (st.closed ? 'c' : 'o') : st.load2;
  const list = isS ? [['P', 'A'], ['A', 'B'], ['B', 'N'], ['P', 'N']] : [['A', 'B'], ['C', 'D'], ['E', 'F']];
  const val = (a, b) => st.meas[`${st.mode}|${variant}|${a}${b}`];
  const body = list.map(([a, b]) => el('tr', {}, [td(symEl(a, b)), td(val(a, b) == null ? '—' : `${num(val(a, b), 2)} V`)]));
  const out = [el('p', { class: 'muted', style: 'margin:8px 0 4px;font-size:0.88rem' }, t(isS ? 'tbl.series' : 'tbl.parallel'))];
  if (isS) {
    const parts = [['P', 'A'], ['A', 'B'], ['B', 'N']].map(([a, b]) => val(a, b));
    const ready = parts.every((x) => x != null);
    st.calc[variant] ??= {};
    const rowObj = st.calc[variant];
    const sumCell = ready ? calcCell(rowObj, 'sum', { expected: parts.reduce((s, x) => s + x, 0), decimals: 2, tol: 0.011, onCheck: onCheckFor(st) }) : td(t('tbl.measureFirst'));
    body.push(el('tr', {}, [td(el('span', { class: 'keep-case' }, [symEl('P', 'A'), ' + ', symEl('A', 'B'), ' + ', symEl('B', 'N')])), sumCell]));
  }
  out.push(el('table', { class: 'data' }, [el('thead', {}, el('tr', {}, [th(t('col.voltage')), th(t('col.value'))])), el('tbody', {}, body)]));
  return out;
}
function potTable(st) {
  const V = potentialsOf(st.ground);
  const body = ['P', 'A', 'B', 'N'].map((k) => el('tr', {}, [td(potEl(k)), k === st.ground ? td('0 V') : calcCell(st, k, { expected: V[k], decimals: 2, tol: 0.011, onCheck: onCheckFor(st) })]));
  return [el('table', { class: 'data' }, [el('thead', {}, el('tr', {}, [th(t('col.point')), th(t('col.potential'))])), el('tbody', {}, body)])];
}
function analogTable(st) {
  if (!st.rows.length) return [el('p', { class: 'muted', style: 'margin:8px 0 0;font-size:0.88rem' }, t('tbl.analogEmpty'))];
  const body = st.rows.map((r) => el('tr', {}, [
    td(t(`src.${r.src}`)), td(`${num(r.scale, 0)} V`),
    calcCell(r, 'n', { expected: r.n, decimals: 1, tol: r.N === 30 ? 0.3 : 0.6, onCheck: onCheckFor(st) }),
    calcCell(r, 'v', { expected: r.v, decimals: 2, tol: (r.scale * (r.N === 30 ? 0.3 : 0.6)) / r.N, onCheck: onCheckFor(st) }),
  ]));
  return [el('div', { class: 'table-scroll' }, el('table', { class: 'data' }, [
    el('thead', {}, el('tr', {}, [th(t('col.src')), th(t('col.scale')), th(t('col.n')), th(el('span', { class: 'keep-case' }, [U(), ' (V)']))])),
    el('tbody', {}, body)]))];
}
function practiceTable(st) {
  const { scale, n } = st.pq;
  const v = (scale * n) / divsOf(scale);
  return [el('table', { class: 'data' }, [
    el('thead', {}, el('tr', {}, [th(t('col.n')), th(el('span', { class: 'keep-case' }, [U(), ' (V)']))])),
    el('tbody', {}, el('tr', {}, [calcCell(st, 'pn', { expected: n, decimals: 0, tol: 0.5, onCheck: onCheckFor(st) }), calcCell(st, 'pv', { expected: v, decimals: 2, tol: Math.max(0.005, (scale * 0.5) / divsOf(scale)), onCheck: onCheckFor(st) })])),
  ])];
}
function scopeTable(st) {
  if (!st.rows.length) return [el('p', { class: 'muted', style: 'margin:8px 0 0;font-size:0.88rem' }, t('tbl.scopeEmpty'))];
  const body = st.rows.map((r) => el('tr', {}, [
    td(svText(r.sv).replace('.', t('dec'))),
    calcCell(r, 'y', { expected: r.y, decimals: 1, tol: 0.1, onCheck: onCheckFor(st) }),
    calcCell(r, 'v', { expected: r.v, decimals: 2, tol: 0.1 * r.sv + 0.005, onCheck: onCheckFor(st) }),
  ]));
  return [el('div', { class: 'table-scroll' }, el('table', { class: 'data' }, [
    el('thead', {}, el('tr', {}, [th('Sv'), th(t('col.y')), th(el('span', { class: 'keep-case' }, [U(), ' = Sv × y (V)']))])),
    el('tbody', {}, body)]))];
}

function buildTab() {
  controlsBody.replaceChildren(); measuresBody.replaceChildren();
  ui = {};
  const st = cur();
  if (shell.tab === 'analog' && st.practice && !st.pq) newPractice(st);
  build(); updateMeasures();
  loop.start(); requestDraw();
}
onLangChange(() => { if (shell) buildTab(); });

shell = initSim({
  strings,
  tabs: TABS.map((id) => ({ id, labelKey: `tab.${id}` })),
  initialTab: 'analogy',
  onTab: buildTab,
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, get tab() { return shell.tab; }, measurePotentials, seriesValues, parallelValues, potentialsOf };
