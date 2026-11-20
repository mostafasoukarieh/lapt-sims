// Sec 1 — Chapter 6: Electric circuits (Circuits électriques) — p.82–90.
// Circuits are drawn with the symbols of the book; the student solves, then shows the meters to check.
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num } from '../../../shared/format.js';
import { createButton, createSegmented, createSlider, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, font } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { calcCell, calcSig } from '../../../shared/calc-cell.js';
import { drawCurrentArrows } from '../../../shared/circuit-draw.js';
import { createGraph } from '../../../shared/graph.js';
import { label } from '../../../shared/figures.js';
import { board as boardBg, line, tag, dot, resBox, lampAt } from '../../../shared/board-draw.js';

const W = 600, H = 440;
const TABS = ['diagram', 'series', 'mixed', 'graph'];
const BAT = { E: 4.27, r: 1.9 }, R_LAMP = 12;

/* ================================================================
   Circuits to solve. Path from P (+ pole) to N: items placed in slots.
   item: { type: 'K' | 'R' | 'M' (motor) | 'X' (other receiver) | 'G2' (generator in opposition) | 'par', slot, name, R, e, r, exit (node after it) }
   par: { branches: [[{ name, R }, …], [{ name, R }, …]] }
   rows: what the student calculates
   ================================================================ */
const PRESETS = {
  series: {
    ex61: { E: 6, r: 1, items: [{ type: 'K', slot: 'K', exit: 'A' }, { type: 'R', slot: 'b1', name: 'R1', R: 10, exit: 'B' }, { type: 'R', slot: 'b3', name: 'R2', R: 14 }],
      rows: [['I'], ['V', 'P', 'N'], ['V', 'P', 'A'], ['V', 'A', 'B'], ['V', 'B', 'N']] },
    ex62: { E: 12, r: 0.5, items: [{ type: 'R', slot: 'L', name: 'R1', R: 4, exit: 'A' }, { type: 'M', slot: 'b2', name: 'M', e: 9, r: 10, exit: 'B' }, { type: 'R', slot: 'b3', name: 'R2', R: 5.5 }, { type: 'K', slot: 'R' }],
      rows: [['I'], ['V', 'P', 'N'], ['V', 'P', 'A'], ['V', 'A', 'B'], ['V', 'B', 'N']] },
    p1: { E: 4.5, r: 1.5, items: [{ type: 'K', slot: 'K' }, { type: 'R', slot: 'b2', name: 'R', R: 18.5 }],
      rows: [['I'], ['V', 'P', 'N']] },
    p2: { E: 4.5, r: 1.5, items: [{ type: 'K', slot: 'K' }, { type: 'R', slot: 'b1', name: 'R1', R: 25, exit: 'A' }, { type: 'R', slot: 'b3', name: 'R2', R: 18.5 }],
      rows: [['I'], ['V', 'P', 'N'], ['V', 'A', 'N']] },
    p4: { E: 16, r: 1, items: [{ type: 'X', slot: 'b1', name: 'X', e: 4, r: 6, exit: 'A' }, { type: 'R', slot: 'b3', name: 'R', R: 3 }],
      rows: [['I'], ['V', 'N', 'P'], ['V', 'A', 'N'], ['V', 'P', 'A']] },
    p6: { E: 48, r: 1.5, g1: 'G1', items: [{ type: 'G2', slot: 'L', name: 'G2', e: 24, r: 0.5, exit: 'C' }, { type: 'R', slot: 'b2', name: 'R', R: 10 }],
      rows: [['I'], ['V', 'P', 'N'], ['V', 'P', 'C']] },
  },
  mixed: {
    ex63: { E: 6, r: 1, items: [{ type: 'K', slot: 'K' }, { type: 'X', slot: 'L', name: 'X', e: 2, r: 4, exit: 'A' }, { type: 'R', slot: 'b1', name: 'R3', R: 3, exit: 'B' }, { type: 'par', slot: 'par', branches: [[{ name: 'R1', R: 3 }], [{ name: 'R2', R: 6 }]] }],
      rows: [['I'], ['Ib', 0], ['Ib', 1], ['V', 'P', 'A'], ['V', 'A', 'B'], ['V', 'B', 'N']] },
    p3: { E: 4, r: 1.2, items: [{ type: 'par', slot: 'par', exit: 'B', branches: [[{ name: 'R1', R: 12 }], [{ name: 'R2', R: 8 }]] }, { type: 'R', slot: 'R', name: 'R3', R: 4 }], parFirst: true,
      rows: [['Req'], ['I'], ['Ib', 0], ['Ib', 1]] },
    p5: { E: 12, r: 0.6, g1: 'G', items: [{ type: 'M', slot: 'L', name: 'M', e: 4, r: 2, exit: 'B' }, { type: 'par', slot: 'par', exit: 'C', branches: [[{ name: 'R1', R: 1 }, { name: 'R3', R: 3 }], [{ name: 'R2', R: 2 }, { name: 'R4', R: 4 }]] }],
      startName: 'A', rows: [['Rpar'], ['I'], ['V', 'B', 'C'], ['Ib', 0], ['Ib', 1]] },
  },
};

/* ================================================================
   Physics of a preset
   ================================================================ */
const parR = (it) => 1 / it.branches.reduce((a, b) => a + 1 / b.reduce((s, x) => s + x.R, 0), 0);
function solve(c) {
  let emf = c.E, R = c.r;
  for (const it of c.items) {
    if (it.type === 'R') R += it.R;
    else if (it.type === 'M' || it.type === 'X' || it.type === 'G2') { emf -= it.e; R += it.r; }
    else if (it.type === 'par') R += parR(it);
  }
  const I = Math.max(0, emf / R);
  // potentials: N = 0, P = E − r I, then drops along the path
  const V = { P: c.E - c.r * I, N: 0 };
  let v = V.P;
  const drops = [];
  for (const it of c.items) {
    let d = 0;
    if (it.type === 'R') d = it.R * I;
    else if (it.type === 'M' || it.type === 'X' || it.type === 'G2') d = it.e + it.r * I;
    else if (it.type === 'par') d = parR(it) * I;
    drops.push(d); v -= d;
    if (it.exit) V[it.exit] = v;
  }
  let Ib = [];
  const par = c.items.find((it) => it.type === 'par');
  if (par) {
    const g = par.branches.map((b) => 1 / b.reduce((s, x) => s + x.R, 0)), G = g.reduce((a, b) => a + b, 0);
    Ib = g.map((x) => (I * x) / G);
  }
  const Req = c.items.reduce((a, it) => a + (it.type === 'R' ? it.R : it.type === 'par' ? parR(it) : 0), 0);
  return { I, V, drops, Ib, Req, Rpar: par ? parR(par) : 0 };
}
function expected(c, sol, row) {
  const [k, a, b] = row;
  if (k === 'I') return sol.I;
  if (k === 'Ib') return sol.Ib[a];
  if (k === 'Req') return sol.Req;
  if (k === 'Rpar') return sol.Rpar;
  return sol.V[a] - sol.V[b];
}

// "New values": a circuit of the same type with other numbers
const pick = (a) => a[Math.floor(Math.random() * a.length)];
function randomSeries() {
  const E = pick([4.5, 6, 9, 12]), r = pick([0.5, 1, 1.5, 2]);
  const withM = Math.random() < 0.5;
  const items = [{ type: 'K', slot: 'K', exit: 'A' }, { type: 'R', slot: 'b1', name: 'R1', R: pick([4, 5, 8, 10, 12, 15]), exit: 'B' }];
  if (withM) items.push({ type: 'M', slot: 'b2', name: 'M', e: pick([1.5, 2, 3]), r: pick([1, 2, 4]), exit: 'C' });
  items.push({ type: 'R', slot: 'b3', name: 'R2', R: pick([2, 3, 6, 10, 14, 20]) });
  const rows = [['I'], ['V', 'P', 'N'], ['V', 'A', 'B']];
  rows.push(withM ? ['V', 'B', 'C'] : ['V', 'B', 'N']);
  return { E, r, items, rows };
}
function randomMixed() {
  const E = pick([6, 9, 12]), r = pick([0.5, 1, 1.5]);
  const R1 = pick([3, 4, 6, 12]), R2 = pick([4, 6, 12, 24]);
  return { E, r, items: [{ type: 'K', slot: 'K' }, { type: 'R', slot: 'L', name: 'R3', R: pick([2, 3, 5, 8]), exit: 'B' },
    { type: 'par', slot: 'par', branches: [[{ name: 'R1', R: R1 }], [{ name: 'R2', R: R2 }]] }], rows: [['Rpar'], ['I'], ['Ib', 0], ['Ib', 1], ['V', 'B', 'N']] };
}

function initialState(tab) {
  switch (tab) {
    case 'diagram': return { k1: false, k2: false, fb: null };
    case 'series': return { preset: 'ex61', circ: PRESETS.series.ex61, meters: false, calc: {}, fb: null };
    case 'mixed': return { preset: 'ex63', circ: PRESETS.mixed.ex63, meters: false, calc: {}, fb: null };
    case 'graph': return { gen: 'p7', R: 14, calc: {}, fb: null };
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
const graph = createGraph(document.getElementById('graph'), { width: 360, height: 240, maxHeightVh: 36 });
const graphCard = document.getElementById('graph-card');
function requestDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; draw(); });
}
onThemeChange(() => requestDraw());
function board(ctx) { boardBg(ctx, W, H); }
function hint(ctx, text) { label(ctx, text, W / 2, H - 20, { size: 13, weight: 600, color: cssVar('--muted') }); }
const phase = () => (performance.now() / 25) % 1000;

/* ================================================================
   Symbols
   ================================================================ */
function genSym(ctx, x, y, vertical, plusFirst, text) {
  // long plate = + pole; plusFirst: + on the left (horizontal) or on the top (vertical)
  ctx.fillStyle = cssVar('--board');
  if (vertical) ctx.fillRect(x - 24, y - 10, 48, 20); else ctx.fillRect(x - 10, y - 24, 20, 48);
  ctx.strokeStyle = cssVar('--text'); ctx.lineCap = 'butt';
  const a = plusFirst ? -6 : 6, b = -a;
  ctx.lineWidth = 3;
  ctx.beginPath();
  if (vertical) { ctx.moveTo(x - 20, y + a); ctx.lineTo(x + 20, y + a); } else { ctx.moveTo(x + a, y - 20); ctx.lineTo(x + a, y + 20); }
  ctx.stroke();
  ctx.lineWidth = 6;
  ctx.beginPath();
  if (vertical) { ctx.moveTo(x - 10, y + b); ctx.lineTo(x + 10, y + b); } else { ctx.moveTo(x + b, y - 10); ctx.lineTo(x + b, y + 10); }
  ctx.stroke();
  ctx.lineCap = 'round';
  if (text) { if (vertical) tag(ctx, text, x - 30, y, cssVar('--text'), 13, 'right', 700); else tag(ctx, text, x, y - 34, cssVar('--text'), 13, 'center', 700); }
}
function recSym(ctx, x, y, type, text, vertical) {
  ctx.fillStyle = cssVar('--surface'); ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(x, y, 20, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  if (type === 'M') tag(ctx, 'M', x, y + 1, cssVar('--text'), 15);
  else {
    ctx.lineWidth = 3; ctx.beginPath();
    if (vertical) { ctx.moveTo(x - 10, y - 5); ctx.lineTo(x + 10, y - 5); ctx.moveTo(x - 10, y + 5); ctx.lineTo(x + 10, y + 5); }
    else { ctx.moveTo(x - 5, y - 10); ctx.lineTo(x - 5, y + 10); ctx.moveTo(x + 5, y - 10); ctx.lineTo(x + 5, y + 10); }
    ctx.stroke();
  }
  if (text) { if (vertical) tag(ctx, text, x + 28, y, cssVar('--text'), 13, 'left', 700); else tag(ctx, text, x, y + 34, cssVar('--text'), 13, 'center', 700); }
}
function switchSym(ctx, x1, x2, y, open) {
  ctx.fillStyle = cssVar('--board'); ctx.fillRect(x1 + 3, y - 30, x2 - x1 - 6, 34);
  ctx.strokeStyle = cssVar('--wire'); ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y);
  if (open) ctx.lineTo(x2 - 6, y - (x2 - x1) * 0.5); else ctx.lineTo(x2 - 3, y - 6);
  ctx.stroke();
  for (const x of [x1, x2]) { ctx.fillStyle = cssVar('--surface'); ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
}
function meterTag(ctx, text, x, y, kind = 'V', align = 'center') {
  ctx.font = font(12, 800);
  const w = ctx.measureText(text).width + 12;
  const x0 = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
  ctx.fillStyle = cssVar(kind === 'A' ? '--meter-a' : '--meter-v');
  roundRect(ctx, x0, y - 10, w, 20, 6); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x0 + w / 2, y + 1);
}

/* ================================================================
   Tab 1 — Setting up a circuit from a diagram (Exp. 6.1, Fig. 6.7)
   ================================================================ */
function diagValues(st) {
  if (!st.k1) return { I: 0, L1: 0, L2: 0 };
  const R = st.k2 ? R_LAMP : 2 * R_LAMP;
  const I = BAT.E / (BAT.r + R);
  return { I, L1: I, L2: st.k2 ? 0 : I };
}
let hits = [];
function drawDiagram(ctx, st) {
  board(ctx); hits = [];
  const v = diagValues(st);
  // battery P at the top left, K1 at the top right; L1 in series; K2 across L2
  line(ctx, [[150, 80], [100, 80], [100, 250], [228, 250]]);
  line(ctx, [[180, 80], [400, 80]]); line(ctx, [[460, 80], [520, 80], [520, 250], [436, 250]]);
  genSym(ctx, 165, 80, false, true, '');
  tag(ctx, 'P', 140, 58, cssVar('--text'), 15);
  switchSym(ctx, 400, 460, 80, !st.k1); tag(ctx, 'K1', 430, 108, cssVar('--text'), 15);
  // L1 then the node, then L2 down a loop; K2 parallel to L2
  lampAt(ctx, 250, 250, Math.min(1, v.L1 / 0.2), 'L1');
  line(ctx, [[272, 250], [330, 250]]);
  switchSym(ctx, 330, 390, 250, !st.k2); tag(ctx, 'K2', 360, 228 - 12, cssVar('--text'), 15);
  line(ctx, [[390, 250], [436, 250]]);
  line(ctx, [[310, 250], [310, 340], [388, 340]]); line(ctx, [[412, 340], [412, 340]]);
  lampAt(ctx, 410, 340, Math.min(1, v.L2 / 0.2), 'L2');
  line(ctx, [[432, 340], [480, 340], [480, 250]]);
  dot(ctx, 310, 250); dot(ctx, 480, 250);
  hits.push({ id: 'k1', x: 430, y: 70, r: 34 }, { id: 'k2', x: 360, y: 240, r: 34 });
  if (v.I > 0) {
    const ph = phase();
    const main = st.k2
      ? [[150, 80], [100, 80], [100, 250], [480, 250], [520, 250], [520, 80], [180, 80]]
      : [[150, 80], [100, 80], [100, 250], [310, 250], [310, 340], [480, 340], [480, 250], [520, 250], [520, 80], [180, 80]];
    // the conventional current leaves the battery by P towards the left
    drawCurrentArrows(ctx, main, ph * 0.8, (x, y) => (y === 250 && x > 225 && x < 275) || (y === 340 && x > 385 && x < 435) || (y === 80 && x > 395 && x < 465) || (y === 250 && x > 325 && x < 395));
  }
  hint(ctx, t('hint.diag'));
}

/* ================================================================
   Tabs 2 and 3 — Solving a circuit
   ================================================================ */
// slot geometry: centre, orientation, exit node position
const SLOTS = {
  K: { x1: 130, x2: 190, y: 90, exit: [100, 90] },
  L: { x: 60, y: 200, v: true, exit: [60, 270] },
  b1: { x: 160, y: 310, exit: [215, 310] },
  b2: { x: 265, y: 310, exit: [318, 310] },
  b3: { x: 430, y: 310, exit: [520, 310] },
  par: { x1: 340, x2: 510, y: 310, exit: [525, 310] },
  R: { x: 540, y: 200, v: true, exit: [540, 140] },
};
const ROUTE = [[270, 90], [60, 90], [60, 310], [540, 310], [540, 90], [330, 90]];
function itemText(it) {
  if (it.type === 'R') return `${it.name} = ${dec(String(it.R))} Ω`;
  if (it.type === 'M' || it.type === 'X') return `(${dec(String(it.e))} V ; ${dec(String(it.r))} Ω)`;
  if (it.type === 'G2') return `${it.name} (${dec(String(it.e))} V ; ${dec(String(it.r))} Ω)`;
  return '';
}
function drawSolve(ctx, st) {
  board(ctx);
  const c = st.circ;
  const sol = solve(c);
  line(ctx, ROUTE);
  // generator at the top, + pole P on the left
  genSym(ctx, 300, 90, false, true, `${c.g1 ? `${c.g1} ` : ''}(${dec(String(c.E))} V ; ${dec(String(c.r))} Ω)`);
  dot(ctx, 270, 90); dot(ctx, 330, 90);
  tag(ctx, c.startName || 'P', 262, 112, cssVar('--text'), 15, 'right'); tag(ctx, 'N', 338, 112, cssVar('--text'), 15, 'left');
  const par = c.items.find((it) => it.type === 'par');
  if (par) {
    const P = SLOTS.par;
    ctx.fillStyle = cssVar('--board'); ctx.fillRect(P.x1 + 4, P.y - 6, P.x2 - P.x1 - 8, 12);
    const ys = [P.y - 45, P.y + 45];
    for (const [k, br] of par.branches.entries()) {
      const y = ys[k];
      line(ctx, [[P.x1, P.y], [P.x1, y], [P.x2, y], [P.x2, P.y]]);
      const xs = br.length === 1 ? [(P.x1 + P.x2) / 2] : [P.x1 + 50, P.x2 - 50];
      br.forEach((r, j) => { resBox(ctx, xs[j], y, `${r.name} = ${dec(String(r.R))} Ω`); });
      if (st.meters) meterTag(ctx, `I${k + 1} = ${num(sol.Ib[k], 3)} A`, (P.x1 + P.x2) / 2, y + (k ? 28 : -42), 'A');
    }
    dot(ctx, P.x1, P.y); dot(ctx, P.x2, P.y);
  }
  c.items.forEach((it, i) => {
    const s = SLOTS[it.slot];
    if (it.type === 'K') switchSym(ctx, s.x1, s.x2, s.y, false);
    else if (it.type === 'R') resBox(ctx, s.x, s.y, s.v ? '' : itemText(it), !!s.v);
    else if (it.type === 'M' || it.type === 'X') recSym(ctx, s.x, s.y, it.type, s.v ? '' : itemText(it), !!s.v);
    else if (it.type === 'G2') genSym(ctx, s.x, s.y, true, true, ''); // the current enters through its + pole
    if (s.v && it.type !== 'K') {
      const right = it.slot === 'L';
      tag(ctx, itemText(it), s.x + (right ? 30 : -30), s.y + (it.type === 'G2' ? 0 : 0), cssVar('--text'), 13, right ? 'left' : 'right', 700);
    }
    if (it.exit) { dot(ctx, ...s.exit); tag(ctx, it.exit, s.exit[0] + (s.v ? 14 : 0), s.exit[1] + (s.v ? 0 : 22), cssVar('--text'), 15, s.v ? 'left' : 'center'); }
    if (st.meters && it.type !== 'par') {
      const txt = `${num(sol.drops[i], 2)} V`;
      if (it.type === 'K') meterTag(ctx, txt, (s.x1 + s.x2) / 2, s.y + 26);
      else if (s.v) meterTag(ctx, txt, s.x + (it.slot === 'L' ? 30 : -30), s.y + (it.slot === 'R' ? -26 : 26), 'V', it.slot === 'L' ? 'left' : 'right');
      else meterTag(ctx, txt, s.x, s.y + (it.type === 'R' ? 24 : 54));
    }
  });
  if (st.meters) {
    meterTag(ctx, `${num(c.E - c.r * sol.I, 2)} V`, 300, 136);
    meterTag(ctx, `I = ${num(sol.I, 3)} A`, 90, 150, 'A', 'left');
  }
  if (sol.I > 0) {
    const skip = (x, y) => (y === 90 && x > 120 && x < 200 && c.items.some((it) => it.type === 'K'))
      || c.items.some((it) => { const s = SLOTS[it.slot]; if (it.type === 'par') return y === s.y && x > s.x1 - 5 && x < s.x2 + 5; if (it.type === 'K') return false; return s.v ? (x === s.x && Math.abs(y - s.y) < 40) : (y === s.y && Math.abs(x - s.x) < 40); });
    drawCurrentArrows(ctx, ROUTE, phase() * 0.8, skip);
    if (par) {
      const P = SLOTS.par;
      [P.y - 45, P.y + 45].forEach((y, k) => drawCurrentArrows(ctx, [[P.x1, P.y], [P.x1, y], [P.x2, y], [P.x2, P.y]], phase() * 0.8 * (sol.Ib[k] / sol.I),
        (x, yy) => yy === y && x > P.x1 + 10 && x < P.x2 - 10));
    }
  }
  hint(ctx, t(st.meters ? 'hint.meters' : 'hint.solve'));
}

/* ================================================================
   Tab 4 — Graphical solution (Problem 7)
   ================================================================ */
const GG = { p7: { E: 1.5, r: 1 }, flat: { E: 4.27, r: 1.9 } };
function graphValues(st) {
  const G = GG[st.gen];
  const I = G.E / (G.r + st.R);
  return { I, V: st.R * I };
}
function drawGraphTab(ctx, st) {
  board(ctx);
  const G = GG[st.gen];
  const v = graphValues(st);
  line(ctx, [[270, 120], [150, 120], [150, 300], [270, 300]]); line(ctx, [[330, 120], [450, 120], [450, 300], [330, 300]]);
  genSym(ctx, 300, 120, false, true, `(${dec(String(G.E))} V ; ${dec(String(G.r))} Ω)`);
  tag(ctx, 'P', 262, 142, cssVar('--text'), 15, 'right'); tag(ctx, 'N', 338, 142, cssVar('--text'), 15, 'left');
  resBox(ctx, 300, 300, `R = ${num(st.R, 0)} Ω`);
  drawCurrentArrows(ctx, [[270, 120], [150, 120], [150, 300], [450, 300], [450, 120], [330, 120]], phase() * 0.8, (x, y) => y === 300 && x > 260 && x < 340);
  hint(ctx, t('hint.graph'));
  graphCard.hidden = false;
  const xMax = G.E / G.r > 1.2 ? 2.4 : 1.6;
  const ok = st.calc?.gI?.ok;
  graph.draw({
    xLabel: 'I (A)', yLabel: `${t('sym.U')} (V)`, xMax, yMax: G.E > 2 ? 5 : 2,
    series: [
      { color: cssVar('--accent'), points: ok ? [[v.I, v.V]] : [[0, G.E]], slope: -G.r, intercept: G.E },
      { color: cssVar('--meter-v'), points: [[0, 0]], slope: st.R, intercept: 0 },
    ],
  });
}

/* ================================================================
   Draw, loop, taps
   ================================================================ */
function draw() {
  if (!shell) return;
  const ctx = view.begin();
  const st = cur();
  switch (shell.tab) {
    case 'diagram': drawDiagram(ctx, st); break;
    case 'series': case 'mixed': drawSolve(ctx, st); break;
    case 'graph': drawGraphTab(ctx, st); break;
    default: break;
  }
}
const loop = createLoop({ dt: 1 / 60, step() { return !!shell; }, render() { draw(); } });
canvas.addEventListener('pointerdown', (ev) => {
  if (shell.tab !== 'diagram') return;
  const p = view.toLogical(ev);
  const h = hits.find((q) => Math.hypot(p.x - q.x, p.y - q.y) < q.r);
  if (!h) return;
  ev.preventDefault();
  const st = cur(); st[h.id] = !st[h.id]; buildTab();
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
const sub = (sym, s) => el('span', { class: 'keep-case' }, [sym, el('sub', {}, s)]);

function build() {
  const tab = shell.tab, st = cur();
  const items = [];
  if (tab === 'diagram') {
    items.push(seg('ctl.k1', [['off', 'sw.open'], ['on', 'sw.closed']], st.k1 ? 'on' : 'off', (v) => { st.k1 = v === 'on'; updateMeasures(); }));
    items.push(seg('ctl.k2', [['off', 'sw.open'], ['on', 'sw.closed']], st.k2 ? 'on' : 'off', (v) => { st.k2 = v === 'on'; updateMeasures(); }));
    items.push(btnRow(resetBtn(tab)));
    items.push(hintP('hint.diagCtl'));
  } else if (tab === 'series' || tab === 'mixed') {
    const keys = Object.keys(PRESETS[tab]);
    items.push(seg('ctl.circuit', [...keys.map((k) => [k, `pre.${k}`]), ['new', 'pre.new']], st.preset, (v) => {
      st.preset = v; st.circ = v === 'new' ? (tab === 'series' ? randomSeries() : randomMixed()) : PRESETS[tab][v];
      st.calc = {}; st.meters = false; st.fb = null; buildTab();
    }));
    if (st.preset === 'new') items.push(btnRow(createButton({ labelKey: 'ctl.newValues', onClick: () => { st.circ = tab === 'series' ? randomSeries() : randomMixed(); st.calc = {}; st.meters = false; st.fb = null; buildTab(); } })));
    items.push(btnRow(
      createButton({ labelKey: st.meters ? 'ctl.hideMeters' : 'ctl.showMeters', variant: 'primary', onClick: () => { st.meters = !st.meters; buildTab(); } }),
      resetBtn(tab)));
    items.push(hintP(`hint.${tab}Ctl`));
  } else if (tab === 'graph') {
    items.push(seg('ctl.gen', [['p7', 'gen.p7'], ['flat', 'gen.flat']], st.gen, (v) => { st.gen = v; st.calc = {}; st.fb = null; ui.sig = null; updateMeasures(); }));
    items.push(createSlider({ labelKey: 'ctl.R', min: 1, max: 30, step: 1, value: st.R, format: (x) => `${num(x, 0)} Ω`, onInput: (x) => { st.R = x; st.calc = {}; st.fb = null; ui.sig = null; updateMeasures(); } }).root);
    items.push(btnRow(resetBtn(tab)));
    items.push(hintP('hint.graphCtl'));
  }
  controlsBody.append(...items);
  ui.dl = el('dl', { class: 'meas' });
  ui.status = el('div', { class: 'status', hidden: '' });
  ui.tables = el('div');
  measuresBody.append(ui.dl, ui.status, ui.tables);
}

function onCheckFor(st) {
  return (res) => {
    st.fb = res === 'invalid' ? { type: 'warn', key: 'calc.invalid' } : res === 'ok' ? { type: 'good', key: 'fb.ok' } : { type: 'bad', key: 'fb.wrong' };
    ui.sig = null; updateMeasures();
  };
}
const cell = (st, key, v, d) => calcCell(st, key, { expected: v, decimals: d, tol: Math.max(0.006, Math.abs(v) * 0.01), onCheck: onCheckFor(st) });
function rowLabel(row) {
  const [k, a, b] = row;
  if (k === 'I') return t('row.I');
  if (k === 'Ib') return el('span', { class: 'keep-case' }, [t('row.Ib'), ' ', sub('I', String(a + 1)), ' (A)']);
  if (k === 'Req') return t('row.Req');
  if (k === 'Rpar') return t('row.Rpar');
  return el('span', { class: 'keep-case' }, [sub(t('sym.U'), `${a}${b}`), ' = ', sub('V', a), ' − ', sub('V', b), ' (V)']);
}

function updateMeasures() {
  if (!shell || !ui.dl) return;
  const tab = shell.tab, st = cur();
  const rows = [];
  let tableBuilder = null;
  graphCard.hidden = tab !== 'graph';
  if (tab === 'diagram') {
    const v = diagValues(st);
    rows.push(['L1', t(v.L1 > 0 ? 'lamp.on' : 'lamp.off')], ['L2', t(v.L2 > 0 ? 'lamp.on' : 'lamp.off')]);
  } else if (tab === 'series' || tab === 'mixed') {
    const c = st.circ;
    tableBuilder = () => {
      const sol = solve(c);
      const decs = (r) => (r[0] === 'I' || r[0] === 'Ib' ? 3 : 2);
      return [el('table', { class: 'data' }, [el('thead', {}, el('tr', {}, [th(t('col.qty')), th(t('col.answer'))])),
        el('tbody', {}, c.rows.map((r, i) => el('tr', {}, [td(rowLabel(r)), cell(st, `q${i}`, expected(c, sol, r), decs(r))])))]),
      el('p', { class: 'muted', style: 'margin:8px 0 0;font-size:0.88rem' }, t('tbl.strategy'))];
    };
  } else if (tab === 'graph') {
    tableBuilder = () => {
      const v = graphValues(st);
      return [el('table', { class: 'data' }, [el('thead', {}, el('tr', {}, [th(t('col.qty')), th(t('col.answer'))])), el('tbody', {}, [
        el('tr', {}, [td(t('row.gI')), cell(st, 'gI', v.I, 3)]),
        el('tr', {}, [td(t('row.gV')), cell(st, 'gV', v.V, 2)]),
      ])])];
    };
  }
  ui.dl.replaceChildren(...rows.flatMap(([k, val]) => [el('dt', {}, k), el('dd', {}, val)]));
  if (!st.fb) ui.status.hidden = true;
  else { ui.status.hidden = false; ui.status.className = `status ${st.fb.type || ''}`; ui.status.textContent = t(st.fb.key); }
  if (tableBuilder) {
    const sig = JSON.stringify([tab, st.preset, st.gen, st.R, st.circ?.E, st.circ?.items?.length]) + JSON.stringify(st.circ?.items || '') + calcSig([st]);
    if (sig !== ui.sig) { ui.sig = sig; ui.tables.replaceChildren(...tableBuilder()); }
  } else { ui.sig = null; ui.tables.replaceChildren(); }
}

function buildTab() {
  controlsBody.replaceChildren(); measuresBody.replaceChildren();
  ui = {};
  build(); updateMeasures();
  loop.start(); requestDraw();
}
onLangChange(() => { if (shell) buildTab(); });

shell = initSim({
  strings,
  tabs: TABS.map((id) => ({ id, labelKey: `tab.${id}` })),
  initialTab: 'diagram',
  onTab: buildTab,
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, get tab() { return shell.tab; }, solve, PRESETS };
