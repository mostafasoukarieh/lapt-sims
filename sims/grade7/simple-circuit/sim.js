// Grade 7 — Electric circuit (Ch.10 Act. 3–7, Ch.11 Act. 1–2)
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num, qty } from '../../../shared/format.js';
import { createButton, createSegmented, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, font } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';

/* ================================================================
   Data and model
   ================================================================ */
const OBJECTS = [
  { id: 'nail', conductor: true },
  { id: 'eraser', conductor: false },
  { id: 'nylon', conductor: false },
  { id: 'nut', conductor: true },
  { id: 'wood', conductor: false },
  { id: 'ruler', conductor: false },
  { id: 'coin', conductor: true },
];
const CELLS = [1.5, 4.5, 6, 9];
const LAMPS = [3.5, 6, 9, 12];
const R_DIM = 0.2, R_NORMAL = 0.85, R_BURN = 1.35, BURN_TIME = 2; // see Info panel
const MOTOR_REF = 3; // V: motor speed ∝ U / MOTOR_REF

function initialState() {
  return {
    circuit: { receiver: 'lamp', sw: 'open', connected: true },
    conductors: { obj: 'none', tested: [] },
    adapt: { cell: 6, lamp: 6, sw: 'open', burnt: false, burnT: 0, tried: [], fb: null },
    current: { receiver: 'motor', n: 1, reversed: false, sw: 'closed' },
  };
}
let S = initialState();

// Electrical state of the circuit shown in the current tab.
function evaluate(tab) {
  let U = 4.5, receiver = 'lamp', Ur = 3.5, closed = false, reversed = false, burnt = false, cells = { kind: 'box', U: 4.5 };
  if (tab === 'circuit') {
    const st = S.circuit;
    receiver = st.receiver;
    closed = st.sw === 'closed' && st.connected;
  } else if (tab === 'conductors') {
    const o = OBJECTS.find((x) => x.id === S.conductors.obj);
    closed = !!o && o.conductor;
  } else if (tab === 'adapt') {
    const st = S.adapt;
    U = st.cell; Ur = st.lamp; burnt = st.burnt;
    closed = st.sw === 'closed' && !burnt;
    cells = st.cell === 1.5 ? { kind: 'aa', n: 1 } : { kind: 'box', U: st.cell };
  } else {
    const st = S.current;
    U = st.n * 1.5; receiver = st.receiver; reversed = st.reversed;
    closed = st.sw === 'closed';
    cells = { kind: 'aa', n: st.n };
  }
  const r = receiver === 'lamp' ? U / Ur : U / MOTOR_REF;
  let lamp = 'off';
  if (receiver === 'lamp') {
    if (burnt) lamp = 'burnt';
    else if (!closed || r < R_DIM) lamp = 'off';
    else if (r < R_NORMAL) lamp = 'dim';
    else if (r <= R_BURN) lamp = 'normal';
    else lamp = 'bright';
  }
  const glow = receiver === 'lamp' && closed && r >= R_DIM ? Math.min(2.2, r * r) : 0;
  const k = closed ? (receiver === 'lamp' ? Math.min(r, 1.8) : r) : 0; // qualitative "size" of the current
  return { U, Ur, receiver, closed, r, lamp, glow, k, reversed, burnt, cells };
}

/* ================================================================
   Scene geometry (logical 600 × 360)
   ================================================================ */
const SCENE = { w: 600, h: 360 };
const CY = 80, BY = 296, X0 = 64, X1 = 536, LX = 168, GX = 412;
let shell;
let anim = { phase: 0, angle: 0 };
let hit = { sw: null, wire: null };
let drawQueued = false;

const canvas = document.getElementById('stage');
const view = setupCanvas(canvas, { width: SCENE.w, height: SCENE.h, maxHeightVh: () => (window.innerWidth < 880 ? 40 : 70), onResize: () => requestDraw() });
const diagCanvas = document.getElementById('diagram');
const diag = setupCanvas(diagCanvas, { width: 360, height: 200, maxHeightVh: 30, onResize: () => requestDraw() });
function requestDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; draw(); });
}
onThemeChange(() => requestDraw());

function cellWidth(cells) {
  if (cells.kind === 'aa') return cells.n * 84 + (cells.n - 1) * 4;
  return { 4.5: 96, 6: 104, 9: 70 }[cells.U] ?? 96;
}
// Polyline of the loop, from the left terminal of the cell around to its right terminal.
function loopPoints(cells) {
  const hw = cellWidth(cells) / 2 + 8;
  return [[300 - hw, CY], [X0, CY], [X0, BY], [X1, BY], [X1, CY], [300 + hw, CY]];
}

/* ---------- Drawing ---------- */
function draw() {
  if (!shell) return;
  const e = evaluate(shell.tab);
  const ctx = view.begin();
  ctx.fillStyle = cssVar('--board');
  roundRect(ctx, 14, 20, SCENE.w - 28, SCENE.h - 34, 14);
  ctx.fill();
  drawWires(ctx, e);
  drawCells(ctx, e);
  if (e.receiver === 'lamp') drawLamp(ctx, e); else drawMotor(ctx, e);
  if (shell.tab === 'conductors') drawClips(ctx); else drawSwitch(ctx);
  if (e.closed) drawCurrent(ctx, e);
  if (DEBUG) {
    ctx.fillStyle = 'red'; ctx.font = font(11); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(`U=${e.U} Ur=${e.Ur} r=${e.r.toFixed(3)} glow=${e.glow.toFixed(2)} lamp=${e.lamp} k=${e.k.toFixed(2)}`, 20, 2);
  }
  drawDiagram(e);
}

function wirePath(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
}
function drawWires(ctx, e) {
  const pts = loopPoints(e.cells);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 5;
  ctx.strokeStyle = cssVar('--wire');
  const disconnected = shell.tab === 'circuit' && !S.circuit.connected;
  // left part: from the cell's left terminal down to the appliance
  if (disconnected) {
    wirePath(ctx, [[pts[0][0] - 30, CY + 26], [pts[0][0] - 50, CY], [X0, CY], [X0, BY], [LX - 30, BY]]);
    drawClipEnd(ctx, pts[0][0] - 30, CY + 26);
  } else {
    wirePath(ctx, [pts[0], [X0, CY], [X0, BY], [LX - 30, BY]]);
  }
  hit.wire = { x: pts[0][0] - 30, y: CY + 12, r: 34 };
  wirePath(ctx, [[LX + 30, BY], [GX - 50, BY]]);
  wirePath(ctx, [[GX + 50, BY], [X1, BY], [X1, CY], pts[5]]);
}
function drawClipEnd(ctx, x, y) {
  ctx.fillStyle = cssVar('--accent');
  roundRect(ctx, x - 7, y - 5, 16, 10, 3);
  ctx.fill();
}

function drawCells(ctx, e) {
  const c = e.cells;
  const w = cellWidth(c);
  const x0 = 300 - w / 2;
  const plusRight = !e.reversed;
  ctx.lineWidth = 1.5;
  if (c.kind === 'aa') {
    for (let i = 0; i < c.n; i++) {
      const x = x0 + i * 88;
      ctx.fillStyle = cssVar('--cell');
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      roundRect(ctx, x, CY - 15, 84, 30, 6);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = cssVar('--cell-band');
      ctx.fillRect(plusRight ? x + 56 : x + 6, CY - 15, 22, 30);
      // positive nub
      ctx.fillStyle = cssVar('--pan-metal');
      ctx.fillRect(plusRight ? x + 84 : x - 4, CY - 5, 4, 10);
      ctx.fillStyle = '#ffffff';
      ctx.font = font(12, 700);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${num(1.5, 1)} V`, x + (plusRight ? 30 : 54), CY + 1);
    }
  } else {
    const h = { 4.5: 58, 6: 66, 9: 46 }[c.U] ?? 58;
    ctx.fillStyle = cssVar('--cell');
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    roundRect(ctx, x0, CY - h / 2, w, h, 6);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = cssVar('--cell-band');
    ctx.fillRect(x0, CY + h / 2 - 14, w, 10);
    ctx.fillStyle = '#ffffff';
    ctx.font = font(15, 800);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${num(c.U, c.U % 1 ? 1 : 0)} V`, 300, CY - 4);
    ctx.fillStyle = cssVar('--pan-metal');
    ctx.fillRect(x0 - 8, CY - 4, 8, 8);
    ctx.fillRect(x0 + w, CY - 4, 8, 8);
  }
  // pole signs
  ctx.font = font(18, 800);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = cssVar('--accent');
  ctx.fillText('+', plusRight ? 300 + w / 2 + 12 : 300 - w / 2 - 12, CY - 12);
  ctx.fillStyle = cssVar('--text');
  ctx.fillText('−', plusRight ? 300 - w / 2 - 12 : 300 + w / 2 + 12, CY - 12);
}

function drawLamp(ctx, e) {
  const cx = LX, cy = BY - 46, R = 24;
  // glow
  if (e.glow > 0.01 && !e.burnt) {
    const rad = R + 18 + 46 * Math.min(1.6, e.glow);
    const g = ctx.createRadialGradient(cx, cy, R * 0.4, cx, cy, rad);
    const a = Math.min(0.9, 0.25 + 0.4 * e.glow);
    g.addColorStop(0, `rgba(255, 214, 80, ${a})`);
    g.addColorStop(1, 'rgba(255, 214, 80, 0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill();
  }
  // glass
  ctx.fillStyle = e.burnt ? cssVar('--burnt-glass') : cssVar('--glass-fill');
  ctx.strokeStyle = cssVar('--glass-stroke');
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, R, Math.PI * 0.72, Math.PI * 2.28);
  ctx.lineTo(cx + 10, cy + R + 8);
  ctx.lineTo(cx - 10, cy + R + 8);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  // filament
  const hot = e.burnt ? 0 : Math.min(1, e.glow);
  ctx.strokeStyle = hot > 0.05 ? `rgb(255, ${Math.round(140 + 115 * hot)}, ${Math.round(40 + 200 * Math.max(0, hot - 0.5))})` : cssVar('--glass-stroke');
  ctx.lineWidth = hot > 0.05 ? 2.2 : 1.4;
  ctx.beginPath();
  ctx.moveTo(cx - 8, cy + R + 6); ctx.lineTo(cx - 8, cy + 2);
  if (e.burnt) {
    ctx.lineTo(cx - 3, cy - 2);
    ctx.moveTo(cx + 2, cy - 4); ctx.lineTo(cx + 8, cy + 2);
  } else {
    for (let i = 0; i <= 6; i++) ctx.lineTo(cx - 8 + (16 * i) / 6, cy + (i % 2 ? -5 : 2));
  }
  ctx.lineTo(cx + 8, cy + R + 6);
  ctx.stroke();
  // base + socket
  ctx.fillStyle = cssVar('--pan-metal');
  ctx.fillRect(cx - 11, cy + R + 8, 22, 10);
  ctx.fillStyle = cssVar('--socket');
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 1.2;
  roundRect(ctx, cx - 36, BY - 12, 72, 22, 5);
  ctx.fill(); ctx.stroke();
  screw(ctx, cx - 30, BY); screw(ctx, cx + 30, BY);
}
function screw(ctx, x, y) {
  ctx.fillStyle = cssVar('--pan-metal');
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}

function drawMotor(ctx, e) {
  const cx = LX;
  ctx.fillStyle = cssVar('--motor');
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, cx - 36, BY - 50, 72, 44, 8);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = font(16, 800);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('M', cx, BY - 28);
  ctx.fillStyle = cssVar('--socket');
  roundRect(ctx, cx - 36, BY - 8, 72, 16, 4);
  ctx.fill(); ctx.stroke();
  screw(ctx, cx - 30, BY); screw(ctx, cx + 30, BY);
  // axle and paper flag (seen from the front)
  const ay = BY - 86;
  ctx.strokeStyle = cssVar('--glass-stroke');
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(cx, BY - 50); ctx.lineTo(cx, ay + 22); ctx.stroke();
  ctx.fillStyle = cssVar('--surface');
  ctx.strokeStyle = cssVar('--glass-stroke');
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, ay, 22, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.save();
  ctx.translate(cx, ay);
  ctx.rotate(anim.angle);
  ctx.fillStyle = cssVar('--flag');
  ctx.fillRect(0, -5, 20, 10);
  ctx.restore();
  ctx.fillStyle = cssVar('--glass-stroke');
  ctx.beginPath(); ctx.arc(cx, ay, 3, 0, Math.PI * 2); ctx.fill();
}

function drawSwitch(ctx) {
  const st = shell.tab === 'adapt' ? S.adapt : shell.tab === 'current' ? S.current : S.circuit;
  const open = st.sw === 'open';
  ctx.fillStyle = cssVar('--socket');
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 1.2;
  roundRect(ctx, GX - 60, BY - 6, 120, 18, 5);
  ctx.fill(); ctx.stroke();
  screw(ctx, GX - 50, BY); screw(ctx, GX + 50, BY);
  // contact
  ctx.fillStyle = cssVar('--pan-metal');
  ctx.fillRect(GX + 44, BY - 16, 12, 12);
  // lever
  const a = open ? -0.6 : 0;
  const len = 102;
  ctx.strokeStyle = cssVar('--lever');
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(GX - 50, BY - 10);
  ctx.lineTo(GX - 50 + len * Math.cos(a), BY - 10 + len * Math.sin(a));
  ctx.stroke();
  ctx.fillStyle = cssVar('--switch-knob');
  ctx.beginPath(); ctx.arc(GX - 50 + (len - 4) * Math.cos(a), BY - 10 + (len - 4) * Math.sin(a) - 8, 9, 0, Math.PI * 2); ctx.fill();
  hit.sw = { x: GX - 64, y: BY - 90, w: 128, h: 110 };
}

function drawClips(ctx) {
  for (const [x, s] of [[GX - 50, 1], [GX + 50, -1]]) {
    ctx.fillStyle = cssVar('--accent');
    ctx.beginPath();
    ctx.moveTo(x - s * 6, BY - 6);
    ctx.lineTo(x + s * 18, BY - 10);
    ctx.lineTo(x + s * 18, BY - 2);
    ctx.lineTo(x - s * 6, BY + 6);
    ctx.closePath();
    ctx.fill();
  }
  const id = S.conductors.obj;
  const y = BY - 6;
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  if (id === 'nail') {
    ctx.fillStyle = cssVar('--metal');
    ctx.fillRect(GX - 40, y - 3, 74, 6);
    ctx.fillRect(GX + 30, y - 8, 5, 16);
    ctx.beginPath(); ctx.moveTo(GX - 40, y - 3); ctx.lineTo(GX - 48, y); ctx.lineTo(GX - 40, y + 3); ctx.fill();
  } else if (id === 'eraser') {
    ctx.fillStyle = cssVar('--eraser');
    roundRect(ctx, GX - 34, y - 12, 68, 24, 5); ctx.fill(); ctx.stroke();
  } else if (id === 'nylon') {
    ctx.strokeStyle = cssVar('--nylon');
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(GX - 40, y); ctx.quadraticCurveTo(GX, y + 10, GX + 40, y); ctx.stroke();
  } else if (id === 'nut') {
    ctx.fillStyle = cssVar('--metal');
    ctx.beginPath();
    for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + (i * Math.PI) / 3; ctx.lineTo(GX + 18 * Math.cos(a), y + 18 * Math.sin(a)); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = cssVar('--board');
    ctx.beginPath(); ctx.arc(GX, y, 7, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = cssVar('--metal'); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(GX - 40, y); ctx.lineTo(GX - 18, y); ctx.moveTo(GX + 18, y); ctx.lineTo(GX + 40, y); ctx.stroke();
  } else if (id === 'wood') {
    ctx.fillStyle = cssVar('--wood');
    roundRect(ctx, GX - 42, y - 7, 84, 14, 3); ctx.fill(); ctx.stroke();
  } else if (id === 'ruler') {
    ctx.fillStyle = cssVar('--ruler');
    ctx.fillRect(GX - 44, y - 9, 88, 18); ctx.strokeRect(GX - 44, y - 9, 88, 18);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
    for (let x = GX - 40; x < GX + 44; x += 8) { ctx.beginPath(); ctx.moveTo(x, y - 9); ctx.lineTo(x, y - (x % 16 ? 4 : 1)); ctx.stroke(); }
  } else if (id === 'coin') {
    ctx.fillStyle = cssVar('--gold');
    ctx.beginPath(); ctx.ellipse(GX, y, 20, 20, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = cssVar('--gold'); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(GX - 40, y); ctx.lineTo(GX - 20, y); ctx.moveTo(GX + 20, y); ctx.lineTo(GX + 40, y); ctx.stroke();
  }
}

// Moving chevrons along the wires, in the conventional direction (from + around to −).
function drawCurrent(ctx, e) {
  let pts = loopPoints(e.cells);
  if (!e.reversed) pts = pts.slice().reverse(); // + is on the right: the current starts there
  const segs = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
    const L = Math.hypot(x2 - x1, y2 - y1);
    segs.push({ x1, y1, dx: (x2 - x1) / L, dy: (y2 - y1) / L, L, s0: total });
    total += L;
  }
  const gapSkip = (x, y) => Math.abs(y - BY) < 1 && (Math.abs(x - LX) < 46 || Math.abs(x - GX) < 62);
  ctx.fillStyle = cssVar('--current');
  const step = 34;
  for (let s = anim.phase % step; s < total; s += step) {
    const sg = segs.find((g) => s >= g.s0 && s < g.s0 + g.L);
    if (!sg) continue;
    const x = sg.x1 + sg.dx * (s - sg.s0), y = sg.y1 + sg.dy * (s - sg.s0);
    if (gapSkip(x, y)) continue;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.atan2(sg.dy, sg.dx));
    ctx.beginPath();
    ctx.moveTo(6, 0); ctx.lineTo(-4, -5); ctx.lineTo(-1, 0); ctx.lineTo(-4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  // Label "I" next to the wires: the arrows show the (conventional) electric current, not electrons.
  const down = !e.reversed; // + on the right → I goes down the right wire, up the left wire, leftwards at the bottom
  const hw = cellWidth(e.cells) / 2 + 8;
  labelI(ctx, X1 + 18, (CY + BY) / 2, down ? Math.PI / 2 : -Math.PI / 2);
  labelI(ctx, X0 - 26, (CY + BY) / 2, down ? -Math.PI / 2 : Math.PI / 2);
  labelI(ctx, (300 + hw + X1) / 2, CY - 18, down ? 0 : Math.PI);
  labelI(ctx, (LX + GX) / 2, BY + 22, down ? Math.PI : 0);
}
function labelI(ctx, x, y, a) {
  const c = cssVar('--current');
  ctx.fillStyle = c;
  ctx.strokeStyle = c;
  ctx.font = font(17, 800);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('I', x, y);
  // small arrow in the direction of the current: above the letter when horizontal, beside it when vertical
  const dx = Math.round(Math.cos(a)), dy = Math.round(Math.sin(a));
  const cx = dx ? x : x + 11, cy = dx ? y - 13 : y;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx - 8 * dx, cy - 8 * dy); ctx.lineTo(cx + 6 * dx, cy + 6 * dy); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + 10 * dx, cy + 10 * dy);
  ctx.lineTo(cx + 4 * dx - 4 * dy, cy + 4 * dy - 4 * dx);
  ctx.lineTo(cx + 4 * dx + 4 * dy, cy + 4 * dy + 4 * dx);
  ctx.closePath();
  ctx.fill();
}

/* ---------- Diagram with the book's symbols ---------- */
function drawDiagram(e) {
  const ctx = diag.begin();
  const L = 40, R = 320, T = 40, B = 160, cx = 180;
  const ink = cssVar('--text');
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  // cells: one symbol per cell (long thin plate = +, short thick plate = −)
  const n = e.cells.kind === 'aa' ? e.cells.n : 1;
  const cw = 18, totalW = n * cw + (n - 1) * 10;
  const c0 = cx - totalW / 2;
  for (let i = 0; i < n; i++) {
    const x = c0 + i * (cw + 10);
    const xNeg = e.reversed ? x + cw - 4 : x + 4;
    const xPos = e.reversed ? x + 4 : x + cw - 4;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(xPos, T - 14); ctx.lineTo(xPos, T + 14); ctx.stroke();
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(xNeg, T - 7); ctx.lineTo(xNeg, T + 7); ctx.stroke();
    if (i < n - 1) { ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + cw - 4, T); ctx.lineTo(x + cw + 14, T); ctx.stroke(); }
  }
  ctx.font = font(14, 800);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(e.reversed ? '+' : '−', c0 - 6, T - 10);
  ctx.fillText(e.reversed ? '−' : '+', c0 + totalW + 6, T - 10);
  ctx.lineWidth = 2;
  const left = c0 + (e.reversed ? 0 : 4), right = c0 + totalW - (e.reversed ? 0 : 4);
  // wires
  const disconnected = shell.tab === 'circuit' && !S.circuit.connected;
  ctx.beginPath();
  if (disconnected) { ctx.moveTo(left - 30, T + 12); ctx.lineTo(L + 10, T); ctx.lineTo(L, T); }
  else { ctx.moveTo(left, T); ctx.lineTo(L, T); }
  ctx.lineTo(L, B); ctx.lineTo(95, B);
  ctx.moveTo(125, B); ctx.lineTo(235, B);
  ctx.moveTo(275, B); ctx.lineTo(R, B); ctx.lineTo(R, T); ctx.lineTo(right, T);
  ctx.stroke();
  // receiver
  ctx.beginPath(); ctx.arc(110, B, 15, 0, Math.PI * 2); ctx.stroke();
  if (e.receiver === 'lamp') {
    const d = 15 * Math.SQRT1_2;
    ctx.beginPath(); ctx.moveTo(110 - d, B - d); ctx.lineTo(110 + d, B + d); ctx.moveTo(110 + d, B - d); ctx.lineTo(110 - d, B + d); ctx.stroke();
    if (e.glow > 0.01 && !e.burnt) {
      ctx.strokeStyle = cssVar('--gold');
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        ctx.beginPath(); ctx.moveTo(110 + dx * 20, B + dy * 20); ctx.lineTo(110 + dx * 28, B + dy * 28); ctx.stroke();
      }
      ctx.strokeStyle = ink;
    }
  } else {
    ctx.font = font(14, 800);
    ctx.textBaseline = 'middle';
    ctx.fillText('M', 110, B + 1);
  }
  // switch or object
  ctx.beginPath(); ctx.arc(239, B, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(271, B, 3, 0, Math.PI * 2); ctx.fill();
  if (shell.tab === 'conductors') {
    if (S.conductors.obj !== 'none') { ctx.strokeRect(243, B - 6, 24, 12); }
  } else {
    const st = shell.tab === 'adapt' ? S.adapt : shell.tab === 'current' ? S.current : S.circuit;
    ctx.beginPath(); ctx.moveTo(239, B);
    if (st.sw === 'open') ctx.lineTo(268, B - 14); else ctx.lineTo(271, B);
    ctx.stroke();
  }
  // current arrows (conventional direction)
  if (e.closed) {
    ctx.fillStyle = cssVar('--current');
    const down = !e.reversed; // + on the right → current goes down the right wire
    arrowHead(ctx, R, (T + B) / 2, down ? Math.PI / 2 : -Math.PI / 2);
    arrowHead(ctx, L, (T + B) / 2, down ? -Math.PI / 2 : Math.PI / 2);
    arrowHead(ctx, 180, B, down ? Math.PI : 0);
    ctx.font = font(13, 800);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('I', R + 10, (T + B) / 2);
  }
}
function arrowHead(ctx, x, y, a) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-6, -6); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill();
  ctx.restore();
}

/* ================================================================
   Animation: current dots, motor, burning lamp
   ================================================================ */
const loop = createLoop({
  dt: 1 / 60,
  step(dt) {
    if (!shell) return false;
    const e = evaluate(shell.tab);
    if (!e.closed) return false;
    anim.phase += 60 * e.k * dt;
    if (e.receiver === 'motor') anim.angle += (e.reversed ? -1 : 1) * 7 * e.k * dt;
    if (shell.tab === 'adapt' && e.lamp === 'bright') {
      const st = S.adapt;
      st.burnT += dt;
      if (st.burnT >= BURN_TIME) {
        st.burnt = true;
        st.fb = { type: 'bad', key: 'fb.burnt' };
        noteTried();
        updateMeasures();
      }
    }
    return true;
  },
  render: () => draw(),
});
function refresh() {
  updateMeasures();
  if (shell && evaluate(shell.tab).closed) loop.start(); else { loop.stop(); requestDraw(); }
  requestDraw();
}

/* ================================================================
   Pointer: tap the switch, tap the wire end
   ================================================================ */
canvas.addEventListener('pointerdown', (ev) => {
  const p = view.toLogical(ev);
  if (shell.tab !== 'conductors' && hit.sw && p.x >= hit.sw.x && p.x <= hit.sw.x + hit.sw.w && p.y >= hit.sw.y && p.y <= hit.sw.y + hit.sw.h) {
    toggleSwitch(); ev.preventDefault(); return;
  }
  if (shell.tab === 'circuit' && hit.wire && Math.hypot(p.x - hit.wire.x, p.y - hit.wire.y) < hit.wire.r) {
    S.circuit.connected = !S.circuit.connected; refresh(); ev.preventDefault();
  }
});
function switchState() { return shell.tab === 'adapt' ? S.adapt : shell.tab === 'current' ? S.current : S.circuit; }
function toggleSwitch() {
  const st = switchState();
  st.sw = st.sw === 'open' ? 'closed' : 'open';
  if (shell.tab === 'adapt') onAdaptChange();
  refresh();
}

/* ================================================================
   Panels
   ================================================================ */
const controlsBody = document.getElementById('controls-body');
const measuresBody = document.getElementById('measures-body');
let ui = {};
const statusBox = () => el('div', { class: 'status', hidden: '' });
function showStatus(box, fb) {
  if (!fb) { box.hidden = true; return; }
  box.hidden = false;
  box.className = `status ${fb.type || ''}`;
  box.textContent = t(fb.key, fb.params);
}
function measRows(dl, rows) {
  dl.replaceChildren(...rows.flatMap(([k, v, cls]) => [el('dt', {}, k), el('dd', cls ? { class: cls } : {}, v)]));
}
const volts = (v) => qty(v, v % 1 ? 1 : 0, 'V');
function switchSeg(st) {
  return createSegmented({
    labelKey: 'ctl.switch',
    options: [{ value: 'open', labelKey: 'ctl.open' }, { value: 'closed', labelKey: 'ctl.closed' }],
    value: st.sw,
    onChange: (v) => { st.sw = v; if (shell.tab === 'adapt') onAdaptChange(); refresh(); },
  });
}
function receiverSeg(st) {
  return createSegmented({
    labelKey: 'ctl.receiver',
    options: [{ value: 'lamp', labelKey: 'comp.lamp' }, { value: 'motor', labelKey: 'comp.motor' }],
    value: st.receiver,
    onChange: (v) => { st.receiver = v; shell.refreshActivity(); refresh(); },
  });
}
function receiverRow(e) {
  if (e.receiver === 'lamp') return [t('m.lamp'), t(`lamp.${e.lamp}`), e.lamp === 'normal' ? 'good-text' : e.lamp === 'burnt' || e.lamp === 'bright' ? 'bad-text' : ''];
  const m = !e.closed ? 'off' : e.reversed ? 'ccw' : 'cw';
  return [t('m.motor'), t(`motor.${m}`)];
}
const hint = () => el('p', { class: 'muted', style: 'margin:8px 0 0;font-size:0.88rem', dataset: { i18n: 'hint.tap' } }, t('hint.tap'));

/* ---------- Tab: closed and open circuit ---------- */
function buildCircuit() {
  const st = S.circuit;
  ui.recv = receiverSeg(st);
  ui.sw = switchSeg(st);
  ui.wire = createSegmented({
    labelKey: 'ctl.wire',
    options: [{ value: 'yes', labelKey: 'ctl.connected' }, { value: 'no', labelKey: 'ctl.disconnected' }],
    value: st.connected ? 'yes' : 'no',
    onChange: (v) => { st.connected = v === 'yes'; refresh(); },
  });
  controlsBody.append(ui.recv.root, ui.sw.root, ui.wire.root,
    el('div', { class: 'btn-row' }, [createButton({ labelKey: 'ui.reset', onClick: () => resetTab('circuit'), variant: 'ghost' })]), hint());
  ui.dl = el('dl', { class: 'meas' });
  measuresBody.append(ui.dl);
}
function updateCircuit() {
  const st = S.circuit;
  const e = evaluate('circuit');
  ui.sw.set(st.sw);
  ui.wire.set(st.connected ? 'yes' : 'no');
  ui.recv.set(st.receiver);
  measRows(ui.dl, [
    [t('m.circuit'), t(e.closed ? 'state.closed' : 'state.open')],
    [t('m.current'), t(e.closed ? 'cur.yes' : 'cur.no'), e.closed ? 'good-text' : ''],
    receiverRow(e),
  ]);
}

/* ---------- Tab: conductors and insulators ---------- */
function buildConductors() {
  const st = S.conductors;
  ui.obj = createSegmented({
    labelKey: 'ctl.object',
    options: [{ value: 'none', labelKey: 'obj.none' }, ...OBJECTS.map((o) => ({ value: o.id, labelKey: `obj.${o.id}` }))],
    value: st.obj,
    onChange: (v) => {
      st.obj = v;
      if (v !== 'none' && !st.tested.includes(v)) st.tested.push(v);
      refresh();
    },
  });
  controlsBody.append(ui.obj.root, el('div', { class: 'btn-row' }, [
    createButton({ labelKey: 'ui.reset', onClick: () => resetTab('conductors'), variant: 'ghost' }),
  ]));
  ui.dl = el('dl', { class: 'meas' });
  ui.table = el('table', { class: 'data' });
  ui.clear = createButton({ labelKey: 'ctl.clearTable', onClick: () => { st.tested = []; refresh(); }, variant: 'ghost' });
  ui.clearRow = el('div', { class: 'btn-row', style: 'margin-top:8px' }, [ui.clear]);
  measuresBody.append(ui.dl, ui.table, ui.clearRow);
}
function updateConductors() {
  const st = S.conductors;
  const e = evaluate('conductors');
  const o = OBJECTS.find((x) => x.id === st.obj);
  ui.obj.set(st.obj);
  measRows(ui.dl, [
    [t('m.object'), t(`obj.${st.obj}`)],
    receiverRow(e),
    [t('m.body'), o ? t(o.conductor ? 'body.conductor' : 'body.insulator') : t('none'), o?.conductor ? 'good-text' : ''],
  ]);
  const head = el('tr', {}, [el('th', {}, t('col.object')), el('th', {}, t('col.lamp')), el('th', {}, t('col.body'))]);
  const body = st.tested.map((id) => {
    const ob = OBJECTS.find((x) => x.id === id);
    return el('tr', {}, [el('td', {}, t(`obj.${id}`)), el('td', {}, t(ob.conductor ? 'glows' : 'noGlow')), el('td', {}, t(ob.conductor ? 'body.conductor' : 'body.insulator'))]);
  });
  ui.table.replaceChildren(el('thead', {}, head), el('tbody', {}, body));
  ui.table.hidden = st.tested.length === 0;
  if (ui.clearRow) ui.clearRow.hidden = ui.table.hidden;
}

/* ---------- Tab: lamp and dry cell ---------- */
function onAdaptChange() {
  const st = S.adapt;
  if (st.burnt && st.sw === 'closed') st.fb = { type: 'bad', key: 'fb.burntOpen' };
  else if (!st.burnt) st.fb = null;
  if (st.sw === 'closed' && !st.burnt) noteTried();
}
function noteTried() {
  const st = S.adapt;
  const e = evaluate('adapt');
  const res = st.burnt ? 'burnt' : e.lamp;
  const row = st.tried.find((r) => r.cell === st.cell && r.lamp === st.lamp);
  if (row) { if (row.res !== 'burnt') row.res = res; } else st.tried.push({ cell: st.cell, lamp: st.lamp, res });
  if (st.tried.length > 8) st.tried.shift();
}
function buildAdapt() {
  const st = S.adapt;
  ui.cell = createSegmented({
    labelKey: 'ctl.cell',
    options: CELLS.map((v) => ({ value: String(v), labelKey: `v${v}` })),
    value: String(st.cell),
    onChange: (v) => { st.cell = Number(v); st.burnT = 0; onAdaptChange(); refresh(); },
  });
  ui.lamp = createSegmented({
    labelKey: 'ctl.lampV',
    options: LAMPS.map((v) => ({ value: String(v), labelKey: `v${v}` })),
    value: String(st.lamp),
    onChange: (v) => { st.lamp = Number(v); st.burnt = false; st.burnT = 0; st.fb = null; onAdaptChange(); refresh(); },
  });
  ui.sw = switchSeg(st);
  ui.replace = createButton({ labelKey: 'ctl.replace', onClick: () => { st.burnt = false; st.burnT = 0; st.fb = null; onAdaptChange(); refresh(); }, variant: 'primary' });
  controlsBody.append(ui.cell.root, ui.lamp.root, ui.sw.root,
    el('div', { class: 'btn-row' }, [ui.replace,
      createButton({ labelKey: 'ui.reset', onClick: () => resetTab('adapt'), variant: 'ghost' })]), hint());
  ui.dl = el('dl', { class: 'meas' });
  ui.table = el('table', { class: 'data' });
  ui.status = statusBox();
  ui.clear = createButton({ labelKey: 'ctl.clearTable', onClick: () => { st.tried = []; refresh(); }, variant: 'ghost' });
  ui.clearRow = el('div', { class: 'btn-row', style: 'margin-top:8px' }, [ui.clear]);
  measuresBody.append(ui.dl, ui.table, ui.clearRow, ui.status);
}
function updateAdapt() {
  const st = S.adapt;
  const e = evaluate('adapt');
  ui.cell.set(String(st.cell));
  ui.lamp.set(String(st.lamp));
  ui.sw.set(st.sw);
  ui.replace.disabled = !st.burnt;
  const adapted = e.r >= R_NORMAL && e.r <= R_BURN;
  measRows(ui.dl, [
    [t('m.cellV'), volts(st.cell)],
    [t('m.lampV'), volts(st.lamp)],
    [t('m.circuit'), t(e.closed ? 'state.closed' : 'state.open')],
    receiverRow(e),
    [t('m.adapted'), t(adapted ? 'yes' : 'no'), adapted ? 'good-text' : 'bad-text'],
  ]);
  const head = el('tr', {}, [el('th', {}, t('col.cell')), el('th', {}, t('col.lampV')), el('th', {}, t('col.result'))]);
  const body = st.tried.map((r) => el('tr', {}, [el('td', {}, volts(r.cell)), el('td', {}, volts(r.lamp)), el('td', {}, t(`lamp.${r.res}`))]));
  ui.table.replaceChildren(el('thead', {}, head), el('tbody', {}, body));
  ui.table.hidden = st.tried.length === 0;
  if (ui.clearRow) ui.clearRow.hidden = ui.table.hidden;
  showStatus(ui.status, st.fb);
}

/* ---------- Tab: the electric current ---------- */
function buildCurrent() {
  const st = S.current;
  ui.recv = receiverSeg(st);
  ui.n = createSegmented({
    labelKey: 'ctl.cells',
    options: [1, 2, 3].map((v) => ({ value: String(v), labelKey: `n${v}` })),
    value: String(st.n),
    onChange: (v) => { st.n = Number(v); refresh(); },
  });
  ui.sw = switchSeg(st);
  controlsBody.append(ui.recv.root, ui.n.root, ui.sw.root,
    el('div', { class: 'btn-row' }, [
      createButton({ labelKey: 'ctl.reverse', onClick: () => { st.reversed = !st.reversed; refresh(); }, variant: 'primary' }),
      createButton({ labelKey: 'ui.reset', onClick: () => resetTab('current'), variant: 'ghost' })]), hint());
  ui.dl = el('dl', { class: 'meas' });
  measuresBody.append(ui.dl);
}
function updateCurrent() {
  const st = S.current;
  const e = evaluate('current');
  ui.recv.set(st.receiver);
  ui.n.set(String(st.n));
  ui.sw.set(st.sw);
  const rows = [
    [t('m.totalV'), `${st.n} × ${volts(1.5)} = ${volts(e.U)}`],
    [t('m.current'), t(e.closed ? 'cur.yes' : 'cur.no'), e.closed ? 'good-text' : ''],
  ];
  if (e.closed) rows.push([t('m.direction'), t('dir.out')]);
  if (e.receiver === 'lamp') rows.push([t('m.lampV'), volts(3.5)]);
  rows.push(receiverRow(e));
  measRows(ui.dl, rows);
}

/* ---------- Tab switching / reset ---------- */
function buildTab(id) {
  loop.stop();
  controlsBody.replaceChildren();
  measuresBody.replaceChildren();
  ui = {};
  if (id === 'circuit') buildCircuit();
  else if (id === 'conductors') buildConductors();
  else if (id === 'adapt') buildAdapt();
  else buildCurrent();
  refresh();
}
function updateMeasures() {
  if (!shell) return;
  if (shell.tab === 'circuit') updateCircuit();
  else if (shell.tab === 'conductors') updateConductors();
  else if (shell.tab === 'adapt') updateAdapt();
  else updateCurrent();
}
function resetTab(id) {
  S[id] = initialState()[id];
  shell.refreshActivity();
  anim = { phase: 0, angle: 0 };
  buildTab(id);
}

// Number labels for the segmented controls (formatted per language)
function numberStrings() {
  const s = { en: {}, fr: {} };
  for (const lang of ['en', 'fr']) {
    for (const v of [...CELLS, ...LAMPS]) s[lang][`v${v}`] = `${num(v, v % 1 ? 1 : 0, lang)} V`;
    for (const n of [1, 2, 3]) s[lang][`n${n}`] = `${n} × ${num(1.5, 1, lang)} V`;
  }
  return s;
}
const allStrings = { en: { ...strings.en, ...numberStrings().en }, fr: { ...strings.fr, ...numberStrings().fr } };

onLangChange(() => { if (shell) buildTab(shell.tab); });

shell = initSim({
  strings: allStrings,
  tabs: [
    { id: 'circuit', labelKey: 'tab.circuit' },
    { id: 'conductors', labelKey: 'tab.conductors' },
    { id: 'adapt', labelKey: 'tab.adapt' },
    { id: 'current', labelKey: 'tab.current' },
  ],
  initialTab: 'circuit',
  onTab: buildTab,
  activityKey: (tab) => (tab === 'circuit' && S.circuit.receiver === 'motor' ? 'act.circuitMotor' : `act.${tab}`),
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, evaluate };
