// Grade 9 — Series and parallel connections: currents and voltages (Ch.5 Exercise 11, Fig. 14)
// Requested by teacher Kawthar Awada (4 Nov 2026).
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num } from '../../../shared/format.js';
import { createButton, createSegmented, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, font } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { calcCell, calcSig } from '../../../shared/calc-cell.js';
import { drawCurrentArrows } from '../../../shared/circuit-draw.js';

/* ================================================================
   Model — the circuit of Fig. 14: L1 in series with [L2 in parallel with (L3 in series with L4)]
   P → L1 → A; A → L2 → C; A → L3 → B → L4 → C; C → N.
   A set of values gives the data of the exercise; the resistances of the lamps follow from it
   (each lamp is treated as a resistor of constant resistance).
   ================================================================ */
const BOOK = { I: 2, I3: 0.5, UPA: 5, UBC: 3, UAC: 7 }; // table of Exercise 11
function derive(v) {
  const I2 = v.I - v.I3, UAB = v.UAC - v.UBC, E = v.UPA + v.UAC;
  return { ...v, I2, UAB, E, R: [v.UPA / v.I, v.UAC / I2, UAB / v.I3, v.UBC / v.I3] };
}
const pick = (a) => a[Math.floor(Math.random() * a.length)];
function randomValues() {
  const I = pick([1, 1.5, 2, 2.5, 3]);
  const I3 = pick([0.25, 0.5, 0.75, 1, 1.25].filter((x) => x < I - 0.2));
  const UAC = pick([4, 5, 6, 7, 8, 9]);
  const UBC = pick([1, 1.5, 2, 2.5, 3, 4, 5].filter((x) => x < UAC - 0.5));
  const UPA = pick([2, 3, 4, 5, 6]);
  return { I, I3, UPA, UBC, UAC };
}
// Potentials (N at 0 V) and current in each branch of the table
function solve(v) {
  const d = derive(v);
  const V = { P: d.E, A: d.UAC, B: d.UBC, C: 0, N: 0 };
  const branchI = { NP: d.I, PA: d.I, AB: d.I3, BC: d.I3, AC: d.I2 };
  return { ...d, V, branchI };
}
const POINTS = ['P', 'A', 'B', 'C', 'N'];
const BRANCHES = ['NP', 'PA', 'AB', 'BC', 'AC'];

function initialState(tab) {
  return tab === 'measure'
    ? { amm: 'PA', red: 'P', com: 'A', arrows: true, fb: null }
    : { amm: 'none', red: 'P', com: 'N', arrows: false, show: false, calc: {}, fb: null };
}
let VALUES = { ...BOOK };
let isBook = true;
const TABS = ['measure', 'solve'];
let S = Object.fromEntries(TABS.map((k) => [k, initialState(k)]));

/* ================================================================
   Canvas
   ================================================================ */
const H = 470;
// the source sits between P and N; the NP ammeter goes on the same wire, between P and the source
const SRC = [168, 268]; // top and bottom of the source block
const G = { XL: 100, XA: 480, XC: 240, TOP: 70, BOT: 330 };
const PT = { P: [100, 88], A: [480, 70], B: [480, 330], C: [240, 330], N: [100, 298] };
const LAMPS = [[280, 70], [360, 200], [480, 170], [360, 330]]; // L1 … L4 (L2 on the diagonal A → C)
const AMM_AT = { NP: [100, 130], PA: [400, 70], AB: [480, 250], BC: [420, 330], AC: [420, 135] };
const VM = [300, 418];
let shell;
let hit = [];
const anim = { ph: 0 };
let drawQueued = false;
const canvas = document.getElementById('stage');
const view = setupCanvas(canvas, { width: 600, height: H, maxHeightVh: () => (window.innerWidth < 880 ? 50 : 74), onResize: () => requestDraw() });
const diag = setupCanvas(document.getElementById('diagram'), { width: 360, height: 220, maxHeightVh: 30, onResize: () => requestDraw() });
function requestDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; draw(); });
}
onThemeChange(() => requestDraw());
const cur = () => S[shell.tab];

function line(ctx, pts, color = cssVar('--wire'), w = 4) {
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
}
function tag(ctx, s, x, y, color = cssVar('--text'), size = 14, align = 'center') {
  ctx.fillStyle = color; ctx.font = font(size, 800); ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(s, x, y);
}
function lamp(ctx, [x, y], name, glow, side = false) {
  if (glow > 0.02) {
    const g = ctx.createRadialGradient(x, y, 4, x, y, 44);
    g.addColorStop(0, `rgba(255, 214, 90, ${0.75 * glow})`); g.addColorStop(1, 'rgba(255, 214, 90, 0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 44, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = glow > 0.02 ? `rgb(255, ${Math.round(236 - 30 * glow)}, ${Math.round(170 - 110 * glow)})` : cssVar('--surface');
  ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(x, y, 19, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  const k = 19 * Math.SQRT1_2;
  ctx.beginPath(); ctx.moveTo(x - k, y - k); ctx.lineTo(x + k, y + k); ctx.moveTo(x + k, y - k); ctx.lineTo(x - k, y + k); ctx.stroke();
  if (side) tag(ctx, name, x + 28, y, cssVar('--text'), 15, 'left'); else tag(ctx, name, x, y - 32, cssVar('--text'), 15);
}
function meter(ctx, [x, y], letter, text, kind, beside = false) {
  ctx.fillStyle = cssVar('--meter-body');
  ctx.strokeStyle = cssVar(kind === 'A' ? '--meter-a' : '--meter-v'); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(x, y, 17, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  tag(ctx, letter, x, y + 1, cssVar(kind === 'A' ? '--meter-a' : '--meter-v'), 16);
  if (text != null) {
    ctx.font = '700 15px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';
    const w = ctx.measureText(text).width + 14;
    const bx = beside ? x + 24 : x - w / 2, by = beside ? y - 13 : y + 21;
    ctx.fillStyle = cssVar('--lcd-bg'); ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
    roundRect(ctx, bx, by, w, 26, 5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = cssVar('--lcd-ink'); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + 7, by + 14);
  }
}
function dot(ctx, [x, y], r = 5) { ctx.fillStyle = cssVar('--wire'); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }

function draw() {
  if (!shell) return;
  const st = cur();
  const s = solve(VALUES);
  const ctx = view.begin();
  ctx.fillStyle = cssVar('--board');
  roundRect(ctx, 8, 8, 584, H - 16, 14); ctx.fill();
  hit = [];
  const { XL, XA, XC, TOP, BOT } = G;
  // wires
  line(ctx, [PT.P, [XL, TOP], PT.A]);
  line(ctx, [PT.A, PT.B]);
  line(ctx, [PT.A, PT.C]);
  line(ctx, [PT.N, [XL, BOT], PT.B]);
  // generator (vertical, P on top)
  ctx.fillStyle = cssVar('--battery');
  roundRect(ctx, XL - 30, SRC[0], 60, SRC[1] - SRC[0], 8); ctx.fill();
  tag(ctx, `${num(s.E, s.E % 1 ? 1 : 0)} V`, XL, (SRC[0] + SRC[1]) / 2, '#ffffff', 15);
  tag(ctx, '+', XL + 44, SRC[0] + 12, cssVar('--accent'), 20); tag(ctx, '−', XL + 44, SRC[1] - 10, cssVar('--text'), 20);
  line(ctx, [PT.P, [XL, SRC[0]]]); line(ctx, [[XL, SRC[1]], PT.N]);
  // current arrows (conventional direction) in each branch
  if (st.arrows) {
    const near = (x, y, p, r) => Math.hypot(x - p[0], y - p[1]) < r;
    const skip = (x, y) => LAMPS.some((p) => near(x, y, p, 24)) || near(x, y, AMM_AT[st.amm] || [-99, -99], 22) || (x === XL && y > SRC[0] - 4 && y < SRC[1] + 4);
    const sp = (I) => anim.ph * I;
    drawCurrentArrows(ctx, [PT.P, [XL, TOP], PT.A], sp(s.I), skip);
    drawCurrentArrows(ctx, [PT.A, PT.C], sp(s.I2), skip);
    drawCurrentArrows(ctx, [PT.A, PT.B, PT.C], sp(s.I3), skip);
    drawCurrentArrows(ctx, [PT.C, [XL, BOT], PT.N], sp(s.I), skip);
    tag(ctx, 'I', 190, TOP - 22, cssVar('--current'), 17);
    tag(ctx, 'I2', 300, 230, cssVar('--current'), 17);
    tag(ctx, 'I3', XA + 30, 120, cssVar('--current'), 17);
  }
  // lamps: brightness from their power (illustrative)
  const P = s.R.map((R, i) => [s.I, s.I2, s.I3, s.I3][i] ** 2 * R);
  const Pmax = Math.max(...P);
  LAMPS.forEach((p, i) => lamp(ctx, p, `L${i + 1}`, 0.25 + 0.75 * P[i] / Pmax, i === 2));
  // points
  for (const k of POINTS) {
    dot(ctx, PT[k]);
    const off = { P: [-22, -10], A: [16, -18], B: [18, 18], C: [-4, 22], N: [-22, 10] }[k];
    tag(ctx, k, PT[k][0] + off[0], PT[k][1] + off[1], cssVar('--text'), 16);
    hit.push({ kind: 'point', id: k, x: PT[k][0], y: PT[k][1], r: 22 });
  }
  const hidden = shell.tab === 'solve' && !st.show;
  // ammeter in the chosen branch (the current enters by its red terminal: positive reading)
  if (st.amm !== 'none') meter(ctx, AMM_AT[st.amm], 'A', hidden ? '? A' : `${num(s.branchI[st.amm], 2)} A`, 'A', st.amm === 'NP');
  for (const b of BRANCHES) hit.push({ kind: 'branch', id: b, x: AMM_AT[b][0], y: AMM_AT[b][1], r: 20 });
  // voltmeter between the red lead (V) and COM
  if (st.red !== st.com) {
    const U = s.V[st.red] - s.V[st.com];
    const lead = (to, color, dx) => {
      ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.setLineDash([2, 0]);
      ctx.beginPath(); ctx.moveTo(VM[0] + dx, VM[1]);
      // P is reached from the left so the lead does not cross the NP ammeter
      const viaLeft = to === PT.P;
      const c1 = viaLeft ? [20, VM[1] + 10] : [VM[0] + dx * 4, VM[1] - 40];
      const c2 = viaLeft ? [10, to[1] - 30] : [to[0] + (to[0] < 300 ? -40 : 40), to[1] + 50];
      ctx.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], to[0], to[1]); ctx.stroke();
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(to[0], to[1], 6, 0, Math.PI * 2); ctx.fill();
    };
    lead(PT[st.red], cssVar('--accent'), -14);
    lead(PT[st.com], cssVar('--lead-black'), 14);
    meter(ctx, VM, 'V', hidden ? '? V' : `${num(U, 2)} V`, 'V');
    tag(ctx, `U${st.red}${st.com}`, VM[0] - 22, VM[1] - 26, cssVar('--meter-v'), 15, 'right');
  }
  drawDiagram(st, s);
}

function drawDiagram(st, s) {
  const ctx = diag.begin();
  const ink = cssVar('--text');
  const L = (pts) => line(ctx, pts, ink, 2);
  const X = (x) => 40 + (x - 100) * 0.7, Y = (y) => 28 + (y - 70) * 0.62;
  const p = (k) => [X(PT[k][0]), Y(PT[k][1])];
  L([p('P'), [X(100), Y(70)], p('A')]); L([p('A'), p('B')]); L([p('A'), p('C')]); L([p('N'), [X(100), Y(330)], p('B')]);
  // generator symbol
  const gx = X(100), gy = Y((SRC[0] + SRC[1]) / 2);
  ctx.fillStyle = cssVar('--surface'); ctx.fillRect(gx - 14, gy - 16, 28, 32);
  L([[gx - 14, gy - 6], [gx + 14, gy - 6]]); line(ctx, [[gx - 7, gy + 6], [gx + 7, gy + 6]], ink, 4);
  L([p('P'), [gx, gy - 6]]); L([[gx, gy + 6], p('N')]);
  ctx.font = font(11, 800); ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('+', gx + 20, gy - 10); ctx.fillText('−', gx + 20, gy + 10);
  LAMPS.forEach(([x, y], i) => {
    const cx = X(x), cy = Y(y);
    ctx.fillStyle = cssVar('--surface'); ctx.strokeStyle = ink; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    const k = 7;
    ctx.beginPath(); ctx.moveTo(cx - k, cy - k); ctx.lineTo(cx + k, cy + k); ctx.moveTo(cx + k, cy - k); ctx.lineTo(cx - k, cy + k); ctx.stroke();
    ctx.fillStyle = ink; ctx.fillText(`L${i + 1}`, cx + (i === 2 ? 20 : 0), cy - (i === 2 ? 0 : 18));
  });
  for (const k of POINTS) {
    const [x, y] = p(k);
    ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    const off = { P: [-12, -6], A: [10, -10], B: [10, 10], C: [0, 12], N: [-12, 6] }[k];
    ctx.fillText(k, x + off[0], y + off[1]);
  }
  if (st.amm !== 'none') {
    const [x, y] = [X(AMM_AT[st.amm][0]), Y(AMM_AT[st.amm][1])];
    ctx.fillStyle = cssVar('--surface'); ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = ink; ctx.fillText('A', x, y + 1);
  }
}

/* ================================================================
   Animation
   ================================================================ */
const loop = createLoop({ dt: 1 / 60, step(dt) { anim.ph += 40 * dt; return !!(shell && cur().arrows); }, render: () => draw() });

/* ================================================================
   Panels
   ================================================================ */
const controlsBody = document.getElementById('controls-body');
const measuresBody = document.getElementById('measures-body');
let ui = {};
function change(fn) { const st = cur(); fn(st); st.fb = null; refresh(); }
function refresh() { updateMeasures(); if (cur().arrows) loop.start(); else loop.stop(); requestDraw(); }
function seg(labelKey, options, value, onChange) {
  return createSegmented({ labelKey, options: options.map(([v, k]) => ({ value: String(v), labelKey: k })), value: String(value), onChange });
}
const btnRow = (...b) => el('div', { class: 'btn-row', style: 'margin-top:8px' }, b);
const hintP = (key) => el('p', { class: 'muted', style: 'margin:8px 0 0;font-size:0.88rem', dataset: { i18n: key } }, t(key));

// Tap a point: first tap sets the red lead, second tap sets COM. Tap a branch: put the ammeter there.
let nextLead = 'red';
canvas.addEventListener('pointerdown', (ev) => {
  const p = view.toLogical(ev);
  const h = hit.find((q) => Math.hypot(p.x - q.x, p.y - q.y) < q.r);
  if (!h) return;
  ev.preventDefault();
  if (h.kind === 'point') {
    const key = nextLead;
    nextLead = key === 'red' ? 'com' : 'red';
    change((s) => { s[key] = h.id; });
  } else change((s) => { s.amm = h.id; });
});

function build() {
  const tab = shell.tab;
  const st = cur();
  const items = [];
  ui.amm = seg('ctl.amm', [['none', 'amm.none'], ...BRANCHES.map((b) => [b, `br.${b}`])], st.amm, (v) => change((s) => { s.amm = v; }));
  ui.red = seg('ctl.red', POINTS.map((k) => [k, `pt.${k}`]), st.red, (v) => change((s) => { s.red = v; }));
  ui.com = seg('ctl.com', POINTS.map((k) => [k, `pt.${k}`]), st.com, (v) => change((s) => { s.com = v; }));
  ui.arrows = seg('ctl.arrows', [['yes', 'ctl.yes'], ['no', 'ctl.no']], st.arrows ? 'yes' : 'no', (v) => change((s) => { s.arrows = v === 'yes'; }));
  items.push(ui.amm.root, ui.red.root, ui.com.root, ui.arrows.root);
  if (tab === 'solve') {
    ui.show = seg('ctl.show', [['no', 'show.no'], ['yes', 'show.yes']], st.show ? 'yes' : 'no', (v) => change((s) => { s.show = v === 'yes'; }));
    items.push(ui.show.root);
  }
  const newValues = () => { VALUES = randomValues(); isBook = false; for (const k of TABS) { S[k].calc = {}; S[k].fb = null; } ui.sig = null; refresh(); };
  const bookValues = () => { VALUES = { ...BOOK }; isBook = true; for (const k of TABS) { S[k].calc = {}; S[k].fb = null; } ui.sig = null; refresh(); };
  items.push(btnRow(createButton({ labelKey: 'ctl.newValues', variant: 'primary', onClick: newValues }), createButton({ labelKey: 'ctl.bookValues', onClick: bookValues }),
    createButton({ labelKey: 'ui.reset', variant: 'ghost', onClick: () => { S[tab] = initialState(tab); bookValues(); buildTab(); } })));
  items.push(hintP(tab === 'solve' ? 'hint.solve' : 'hint.measure'));
  controlsBody.append(...items);
  ui.dl = el('dl', { class: 'meas' });
  ui.status = el('div', { class: 'status', hidden: '' });
  ui.tables = el('div');
  measuresBody.append(ui.dl, ui.status, ui.tables);
}

function updateMeasures() {
  if (!shell || !ui.dl) return;
  const st = cur();
  const s = solve(VALUES);
  ui.amm.set(st.amm); ui.red.set(st.red); ui.com.set(st.com); ui.arrows.set(st.arrows ? 'yes' : 'no');
  if (ui.show) ui.show.set(st.show ? 'yes' : 'no');
  const hidden = shell.tab === 'solve' && !st.show;
  const rows = [[t('m.values'), t(isBook ? 'm.book' : 'm.random')]];
  if (st.amm !== 'none') rows.push([`${t('m.ammIn')} ${t(`br.${st.amm}`)}`, hidden ? '?' : `${num(s.branchI[st.amm], 2)} A`]);
  if (st.red !== st.com) rows.push([`U${st.red}${st.com}`, hidden ? '?' : `${num(s.V[st.red] - s.V[st.com], 2)} V`]);
  ui.dl.replaceChildren(...rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)]));
  let fb = st.fb;
  if (!fb && st.red === st.com) fb = { type: '', key: 'fb.samePoint' };
  if (!fb && st.red !== st.com && s.V[st.red] - s.V[st.com] < -1e-9 && !hidden) fb = { type: 'warn', key: 'fb.negative' };
  if (!fb) { ui.status.hidden = true; } else { ui.status.hidden = false; ui.status.className = `status ${fb.type || ''}`; ui.status.textContent = t(fb.key); }
  buildTable(st, s);
}

function buildTable(st, s) {
  const c = st.calc || {};
  const sig = `${shell.tab}|${JSON.stringify(VALUES)}|${calcSig([c])}`;
  if (sig === ui.sig) return;
  ui.sig = sig;
  if (shell.tab !== 'solve') {
    // reference table of the measurements: all values
    ui.tables.replaceChildren();
    return;
  }
  const onCheck = (res) => {
    st.fb = res === 'invalid' ? { type: 'warn', key: 'calc.invalid' } : res === 'ok' ? { type: 'good', key: 'fb.calcOk' } : { type: 'bad', key: 'fb.calcWrong' };
    updateMeasures();
  };
  const given = (v) => el('td', { class: 'keep-case' }, num(v, v % 1 ? (v * 10) % 1 ? 2 : 1 : 0));
  const cell = (key, v) => calcCell(c, key, { expected: v, decimals: 2, tol: 0.011, onCheck });
  // the book's pattern: given I(NP), U(PA), I(AB), U(BC), U(AC); to find the others
  const rows = [
    ['NP', given(s.I), cell('U_NP', s.E)],
    ['PA', cell('I_PA', s.I), given(s.UPA)],
    ['AB', given(s.I3), cell('U_AB', s.UAB)],
    ['BC', cell('I_BC', s.I3), given(s.UBC)],
    ['AC', cell('I_AC', s.I2), given(s.UAC)],
  ];
  const th = (k) => el('th', { class: 'keep-case' }, t(k));
  ui.tables.replaceChildren(el('table', { class: 'data' }, [
    el('thead', {}, el('tr', {}, [th('col.branch'), th('col.I'), th('col.U')])),
    el('tbody', {}, rows.map(([b, i, u]) => el('tr', {}, [el('td', {}, b), i, u]))),
  ]));
}

function buildTab() {
  loop.stop();
  controlsBody.replaceChildren();
  measuresBody.replaceChildren();
  ui = {};
  build();
  refresh();
}
const xs = { en: {}, fr: {} };
for (const lang of ['en', 'fr']) {
  for (const k of POINTS) xs[lang][`pt.${k}`] = k;
  for (const b of BRANCHES) xs[lang][`br.${b}`] = b;
}
onLangChange(() => { if (shell) buildTab(); });

shell = initSim({
  strings: { en: { ...strings.en, ...xs.en }, fr: { ...strings.fr, ...xs.fr } },
  tabs: TABS.map((id) => ({ id, labelKey: `tab.${id}` })),
  initialTab: 'measure',
  onTab: buildTab,
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, solve: () => solve(VALUES), setValues: (v) => { VALUES = v; refresh(); } };
