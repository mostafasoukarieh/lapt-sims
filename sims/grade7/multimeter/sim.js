// Grade 7 — Measuring current and voltage with a multimeter (Ch.11 Act. 3–5)
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num } from '../../../shared/format.js';
import { createButton, createSegmented, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, font } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { drawLamp, drawSwitch, drawCurrentArrows, labelI, arrowHead, symLamp, symMeter, symCell, symSwitch } from '../../../shared/circuit-draw.js';

/* ================================================================
   Model (values from the book's photos, p.92–93)
   ================================================================ */
const E = 6.28; // V, dry cell alone
const R_INT = 0.88; // Ω, internal resistance → 6.19 V across the lamp
const R_LAMP = 60.7; // Ω → I = 0.102 A
const LAMP_RATED = 6; // V
const FUSE = 2; // A

// Selector positions. kind: 'A' (current) or 'V' (voltage); max = largest value shown; dec = decimals; k = display factor
const RANGES = {
  off: { kind: null },
  v200: { kind: 'V', max: 199.9, dec: 1, k: 1, unit: 'V', label: '200 V' },
  v20: { kind: 'V', max: 19.99, dec: 2, k: 1, unit: 'V', label: '20 V' },
  v2: { kind: 'V', max: 1.999, dec: 3, k: 1, unit: 'V', label: '2 V' },
  a2: { kind: 'A', max: 1.999, dec: 3, k: 1, unit: 'A', label: '2A' },
  ma200: { kind: 'A', max: 199.9, dec: 1, k: 1000, unit: 'mA', label: '200 mA' },
};
const DIAL_ORDER = ['off', 'v200', 'v20', 'v2', 'ma200', 'a2'];
const DIAL_ANGLE = { off: -90, v200: -145, v20: 180, v2: 145, ma200: 35, a2: -35 }; // degrees
const POSITIONS = ['series', 'cell', 'lamp', 'wire'];

function initialState(tab) {
  return {
    jack: 'V', range: 'off', pos: tab === 'ammeter' ? 'series' : 'cell', sw: tab === 'ammeter' ? 'closed' : 'open',
    reversed: false, fuseBlown: false, rows: [], fb: null,
  };
}
let S = { ammeter: initialState('ammeter'), voltmeter: initialState('voltmeter') };

// true if the 2A input (very small resistance) is connected in parallel with the dry cell or the lit lamp
const wouldShort = (st) => st.jack === '2A' && (st.pos === 'cell' || (st.pos === 'lamp' && st.sw === 'closed'));

// Electrical state + what the display shows.
function evaluate(st) {
  let lowR = st.jack === '2A' && !st.fuseBlown; // the 2A input is a very small resistance
  let shortNow = false;
  if (lowR && wouldShort(st)) shortNow = true;
  if (shortNow) lowR = false; // the fuse melts at once
  const loopClosed = st.sw === 'closed' && (st.pos !== 'series' || lowR);
  const I = loopClosed ? E / (R_INT + R_LAMP) : 0;
  const Ulamp = I * R_LAMP;
  const Ucell = E - R_INT * I;
  // quantity seen by the meter (sign: + when the wires are the right way round)
  let current = 0, voltage = 0;
  if (lowR) current = st.pos === 'series' ? I : 0;
  else voltage = st.pos === 'series' ? (st.sw === 'closed' ? E : 0) : st.pos === 'cell' ? Ucell : st.pos === 'lamp' ? Ulamp : 0;
  const s = st.reversed ? -1 : 1;
  current *= s; voltage *= s;
  const R = RANGES[st.range];
  let fn = 'off', value = null, overload = false;
  if (R.kind) {
    const match = (R.kind === 'A' && st.jack === '2A') || (R.kind === 'V' && st.jack === 'V');
    fn = match ? (R.kind === 'A' ? 'ammeter' : 'voltmeter') : 'mismatch';
    const raw = match ? (R.kind === 'A' ? current : voltage) : 0;
    value = raw * R.k;
    overload = Math.abs(value) > R.max + 1e-9;
  }
  return { I, Ulamp, Ucell, lowR, shortNow, loopClosed, fn, value, overload, range: R, glow: (Ulamp / LAMP_RATED) ** 2 };
}
function displayText(st, e) {
  if (!e.range.kind) return '';
  if (e.overload) return (e.value < 0 ? '−' : '') + '1';
  return num(e.value, e.range.dec);
}

/* ================================================================
   Scene geometry (logical 600 × 380)
   ================================================================ */
const SCENE = { w: 600, h: 380 };
const CY = 70, BY = 296, XL = 50, XR = 350;
const CELL = { x: 200, w: 112 };
const N1 = [CELL.x - CELL.w / 2 - 6, CY], N2 = [CELL.x + CELL.w / 2 + 6, CY]; // − and + terminals
const LAMP_X = 118, SW_X = 262;
const L1 = [LAMP_X - 30, BY], L2 = [LAMP_X + 30, BY]; // lamp terminals (− side, + side)
const PB = [XL, 128], PA = [XL, 236]; // series gap on the left wire: PB on the cell side, PA on the lamp side
const W_TOP = [XR, 110], W_BOT = [XR, 236]; // ends of the right wire used for "between the ends of a wire"
const METER = { x: 404, y: 18, w: 180, h: 330 };
const DIAL = { cx: 494, cy: 190, r: 40, lr: 72 };
const JACKS = { '2A': [436, 316], COM: [494, 316], V: [552, 316] };
// Where the two leads end for each position: [red end, black (COM) end] — red on the + side when not reversed
const ENDS = { series: [PA, PB], cell: [N2, N1], lamp: [L2, L1], wire: [W_TOP, W_BOT] };

let shell;
let anim = { phase: 0 };
let hit = { sw: null, dial: [], jacks: [] };
let drawQueued = false;
const canvas = document.getElementById('stage');
const view = setupCanvas(canvas, { width: SCENE.w, height: SCENE.h, maxHeightVh: () => (window.innerWidth < 880 ? 44 : 72), onResize: () => requestDraw() });
const diag = setupCanvas(document.getElementById('diagram'), { width: 360, height: 210, maxHeightVh: 30, onResize: () => requestDraw() });
function requestDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; draw(); });
}
onThemeChange(() => requestDraw());
const cur = () => S[shell.tab];

/* ---------- Drawing ---------- */
function draw() {
  if (!shell) return;
  const st = cur();
  const e = evaluate(st);
  const ctx = view.begin();
  ctx.fillStyle = cssVar('--board');
  roundRect(ctx, 14, 14, 376, SCENE.h - 28, 14);
  ctx.fill();
  drawWires(ctx, st);
  drawCell(ctx);
  drawLamp(ctx, { x: LAMP_X, y: BY, glow: e.glow });
  hit.sw = drawSwitch(ctx, { x: SW_X, y: BY, open: st.sw === 'open' });
  if (e.I > 0) drawCurrent(ctx, st, e);
  drawMeter(ctx, st, e);
  drawLeads(ctx, st);
  if (DEBUG) {
    ctx.fillStyle = 'red'; ctx.font = font(11); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(`I=${e.I.toFixed(4)} Ulamp=${e.Ulamp.toFixed(3)} Ucell=${e.Ucell.toFixed(3)} fn=${e.fn} v=${e.value}`, 18, 0);
  }
  drawDiagram(st, e);
}

function line(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
}
function drawWires(ctx, st) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 5;
  ctx.strokeStyle = cssVar('--wire');
  line(ctx, [N2, [XR, CY], [XR, BY], [SW_X + 50, BY]]);
  line(ctx, [[SW_X - 50, BY], L2]);
  if (st.pos === 'series') {
    line(ctx, [L1, [XL, BY], PA]);
    line(ctx, [PB, [XL, CY], N1]);
  } else {
    line(ctx, [L1, [XL, BY], [XL, CY], N1]);
  }
}
function drawCell(ctx) {
  const x0 = CELL.x - CELL.w / 2, h = 56;
  ctx.fillStyle = cssVar('--battery');
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, x0, CY - h / 2, CELL.w, h, 6);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = cssVar('--gold');
  ctx.fillRect(x0 + 8, CY + 6, CELL.w - 16, 12);
  ctx.fillStyle = '#ffffff';
  ctx.font = font(15, 800);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('6 V', CELL.x, CY - 9);
  ctx.fillStyle = cssVar('--pan-metal');
  ctx.fillRect(N1[0], CY - 5, 7, 10);
  ctx.fillRect(N2[0] - 7, CY - 5, 7, 10);
  ctx.font = font(18, 800);
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = cssVar('--text');
  ctx.fillText('−', N1[0] + 2, CY - 14);
  ctx.fillStyle = cssVar('--accent');
  ctx.fillText('+', N2[0] - 2, CY - 14);
}
function drawCurrent(ctx, st, e) {
  // conventional direction: from + around the loop to −
  const pts = [N2, [XR, CY], [XR, BY], [XL, BY], [XL, CY], N1];
  const skip = (x, y) => (Math.abs(y - BY) < 1 && (Math.abs(x - LAMP_X) < 46 || Math.abs(x - SW_X) < 62))
    || (st.pos === 'series' && Math.abs(x - XL) < 1 && y > PB[1] - 4 && y < PA[1] + 4);
  drawCurrentArrows(ctx, pts, anim.phase, skip);
  labelI(ctx, XR + 20, (CY + BY) / 2 + 30, Math.PI / 2);
  labelI(ctx, (LAMP_X + SW_X) / 2, BY + 24, Math.PI);
  labelI(ctx, (N2[0] + XR) / 2, CY - 20, 0);
}

function drawMeter(ctx, st, e) {
  const M = METER;
  ctx.fillStyle = cssVar('--meter-body');
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, M.x, M.y, M.w, M.h, 16);
  ctx.fill(); ctx.stroke();
  // display
  const dx = M.x + 14, dy = M.y + 14, dw = M.w - 28, dh = 62;
  ctx.fillStyle = cssVar('--lcd-bg');
  roundRect(ctx, dx, dy, dw, dh, 6);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = cssVar('--lcd-ink');
  const txt = displayText(st, e);
  ctx.textBaseline = 'middle';
  if (txt) {
    ctx.font = '700 34px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';
    ctx.textAlign = e.overload ? 'left' : 'right';
    ctx.fillText(txt, e.overload ? dx + 14 : dx + dw - 40, dy + dh / 2 + 2);
    ctx.font = font(14, 800);
    ctx.textAlign = 'right';
    ctx.fillText(e.range.unit, dx + dw - 8, dy + dh / 2 + 6);
  }
  // zones
  ctx.font = font(11, 800);
  ctx.textAlign = 'center';
  ctx.fillStyle = cssVar('--meter-v');
  ctx.fillText('V ⎓', DIAL.cx - 62, DIAL.cy - 70);
  ctx.fillStyle = cssVar('--meter-a');
  ctx.fillText('A ⎓', DIAL.cx + 62, DIAL.cy - 70);
  // selector labels
  hit.dial = [];
  for (const id of DIAL_ORDER) {
    const a = (DIAL_ANGLE[id] * Math.PI) / 180;
    const x = DIAL.cx + DIAL.lr * Math.cos(a), y = DIAL.cy + DIAL.lr * Math.sin(a);
    const on = st.range === id;
    ctx.fillStyle = on ? cssVar('--primary') : id === 'off' ? cssVar('--text') : RANGES[id].kind === 'V' ? cssVar('--meter-v') : cssVar('--meter-a');
    ctx.font = font(on ? 13 : 12, on ? 800 : 700);
    ctx.fillText(id === 'off' ? t('dial.off') : RANGES[id].label, x, y);
    hit.dial.push({ id, x, y, r: 24 });
  }
  // knob
  const a = (DIAL_ANGLE[st.range] * Math.PI) / 180;
  ctx.fillStyle = cssVar('--meter-knob');
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath(); ctx.arc(DIAL.cx, DIAL.cy, DIAL.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.save();
  ctx.translate(DIAL.cx, DIAL.cy);
  ctx.rotate(a);
  ctx.fillStyle = cssVar('--meter-grip');
  roundRect(ctx, -DIAL.r + 4, -9, 2 * DIAL.r - 8, 18, 8);
  ctx.fill();
  ctx.fillStyle = cssVar('--accent');
  ctx.beginPath(); ctx.moveTo(DIAL.r - 4, 0); ctx.lineTo(DIAL.r - 18, -6); ctx.lineTo(DIAL.r - 18, 6); ctx.closePath(); ctx.fill();
  ctx.restore();
  // inputs
  hit.jacks = [];
  for (const [name, [x, y]] of Object.entries(JACKS)) {
    ctx.fillStyle = name === 'COM' ? '#1d1f24' : cssVar('--accent');
    ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0b0c0e';
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = cssVar('--text-on-meter');
    ctx.font = font(12, 800);
    ctx.fillText(name, x, y - 22);
    if (name !== 'COM') hit.jacks.push({ name, x, y, r: 24 });
  }
  if (st.fuseBlown) {
    ctx.fillStyle = cssVar('--bad');
    ctx.font = font(11, 800);
    ctx.fillText('FUSE', JACKS['2A'][0], JACKS['2A'][1] + 22);
  }
}

function drawLeads(ctx, st) {
  const [redEnd, blackEnd] = st.reversed ? [ENDS[st.pos][1], ENDS[st.pos][0]] : ENDS[st.pos];
  lead(ctx, JACKS[st.jack], redEnd, cssVar('--accent'));
  lead(ctx, JACKS.COM, blackEnd, cssVar('--lead-black'));
}
function lead(ctx, [x1, y1], [x2, y2], color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.bezierCurveTo(x1, 372, Math.min(x2 + 60, 380), Math.min(372, y2 + 90), x2, y2);
  ctx.stroke();
  ctx.fillStyle = color;
  roundRect(ctx, x2 - 7, y2 - 7, 14, 14, 4);
  ctx.fill();
}

/* ---------- Diagram ---------- */
function drawDiagram(st, e) {
  const ctx = diag.begin();
  const L = 40, R = 300, T = 56, B = 150;
  const ink = cssVar('--text');
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  const cx = 170;
  symCell(ctx, cx, T, true);
  // loop wires (gaps for the components)
  ctx.beginPath();
  ctx.moveTo(cx + 5, T); ctx.lineTo(R, T); ctx.lineTo(R, B); ctx.lineTo(250, B);
  ctx.moveTo(214, B); ctx.lineTo(125, B);
  ctx.moveTo(95, B); ctx.lineTo(L, B);
  if (st.pos === 'series') { ctx.lineTo(L, 117); ctx.moveTo(L, 89); ctx.lineTo(L, T); }
  else ctx.lineTo(L, T);
  ctx.lineTo(cx - 5, T);
  ctx.stroke();
  symLamp(ctx, 110, B, e.glow > 0.05);
  symSwitch(ctx, 214, 250, B, st.sw === 'open');
  // meter symbol
  const letter = st.jack === '2A' && !st.fuseBlown ? 'A' : 'V';
  ctx.lineWidth = 2;
  if (st.pos === 'series') symMeter(ctx, L, 103, letter);
  else if (st.pos === 'cell') {
    ctx.beginPath(); ctx.moveTo(cx - 34, T); ctx.lineTo(cx - 34, 22); ctx.lineTo(cx - 14, 22); ctx.moveTo(cx + 14, 22); ctx.lineTo(cx + 34, 22); ctx.lineTo(cx + 34, T); ctx.stroke();
    symMeter(ctx, cx, 22, letter);
  } else if (st.pos === 'lamp') {
    ctx.beginPath(); ctx.moveTo(80, B); ctx.lineTo(80, B + 36); ctx.lineTo(96, B + 36); ctx.moveTo(124, B + 36); ctx.lineTo(140, B + 36); ctx.lineTo(140, B); ctx.stroke();
    symMeter(ctx, 110, B + 36, letter);
  } else {
    ctx.beginPath(); ctx.moveTo(R, 78); ctx.lineTo(R + 34, 78); ctx.lineTo(R + 34, 89); ctx.moveTo(R + 34, 117); ctx.lineTo(R + 34, 128); ctx.lineTo(R, 128); ctx.stroke();
    symMeter(ctx, R + 34, 103, letter);
  }
  if (e.I > 0) {
    ctx.fillStyle = cssVar('--current');
    arrowHead(ctx, R, 103 + (st.pos === 'wire' ? 34 : 0), Math.PI / 2);
    arrowHead(ctx, 170, B, Math.PI);
    ctx.font = font(13, 800);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('I', R - 18, 103 + (st.pos === 'wire' ? 34 : 0));
  }
}

/* ================================================================
   Animation of the current
   ================================================================ */
const loop = createLoop({
  dt: 1 / 60,
  step(dt) {
    if (!shell) return false;
    const e = evaluate(cur());
    if (e.I <= 0) return false;
    anim.phase += 60 * 1.2 * dt;
    return true;
  },
  render: () => draw(),
});

/* ================================================================
   State changes
   ================================================================ */
function change(fn) {
  const st = cur();
  const before = { jack: st.jack, pos: st.pos };
  fn(st);
  // An ammeter is never connected between the two ends of a wire (owner decision): refuse this combination.
  if (st.jack === '2A' && st.pos === 'wire') {
    st.jack = before.jack; st.pos = before.pos;
    st.fb = { type: 'warn', key: 'fb.noAmmWire' };
    refresh();
    return;
  }
  const e = evaluate(st);
  if (e.shortNow) st.fuseBlown = true; // the message comes from advice()
  st.fb = null;
  refresh();
}
function refresh() {
  updateMeasures();
  if (shell && evaluate(cur()).I > 0) loop.start(); else { loop.stop(); requestDraw(); }
  requestDraw();
}

canvas.addEventListener('pointerdown', (ev) => {
  const p = view.toLogical(ev);
  const near = (h) => Math.hypot(p.x - h.x, p.y - h.y) < h.r;
  const d = hit.dial.find(near);
  if (d) { change((st) => { st.range = d.id; }); ev.preventDefault(); return; }
  const j = hit.jacks.find(near);
  if (j) { change((st) => { st.jack = j.name; }); ev.preventDefault(); return; }
  if (hit.sw && p.x >= hit.sw.x && p.x <= hit.sw.x + hit.sw.w && p.y >= hit.sw.y && p.y <= hit.sw.y + hit.sw.h) {
    change((st) => { st.sw = st.sw === 'open' ? 'closed' : 'open'; }); ev.preventDefault();
  }
});

/* ================================================================
   Panels
   ================================================================ */
const controlsBody = document.getElementById('controls-body');
const measuresBody = document.getElementById('measures-body');
let ui = {};
function showStatus(box, fb) {
  if (!fb) { box.hidden = true; return; }
  box.hidden = false;
  box.className = `status ${fb.type || ''}`;
  box.textContent = t(fb.key, fb.params);
}
function measRows(dl, rows) {
  dl.replaceChildren(...rows.flatMap(([k, v, cls]) => [el('dt', {}, k), el('dd', cls ? { class: cls } : {}, v)]));
}
function readingText(st, e) {
  if (!e.range.kind) return t('m.blank');
  if (e.overload) return t('m.overload');
  return `${displayText(st, e)} ${e.range.unit}`;
}
// Advice shown when nothing else is said
function advice(st, e) {
  if (st.fuseBlown && wouldShort(st)) return { type: 'bad', key: 'fb.fuseFirst' };
  if (st.fuseBlown && st.jack === '2A') return { type: 'bad', key: 'fb.fuse' };
  if (!e.range.kind) return { type: 'warn', key: 'fb.off' };
  if (e.fn === 'mismatch') return { type: 'warn', key: e.range.kind === 'A' ? 'fb.mismatchA' : 'fb.mismatchV' };
  if (e.overload) return { type: 'warn', key: 'fb.overload' };
  if (st.pos === 'series' && !e.lowR && st.sw === 'closed') return { type: 'warn', key: 'fb.voltSeries' };
  if (e.value != null && e.value < -1e-9) return { type: 'warn', key: 'fb.negative' };
  return null;
}

function build() {
  const st = cur();
  ui.jack = createSegmented({
    labelKey: 'ctl.input',
    options: [{ value: '2A', labelKey: 'jack.2A' }, { value: 'V', labelKey: 'jack.V' }],
    value: st.jack,
    onChange: (v) => change((s) => { s.jack = v; }),
  });
  ui.range = createSegmented({
    labelKey: 'ctl.range',
    options: DIAL_ORDER.map((id) => ({ value: id, labelKey: `range.${id}` })),
    value: st.range,
    onChange: (v) => change((s) => { s.range = v; }),
  });
  ui.pos = createSegmented({
    labelKey: 'ctl.position',
    options: POSITIONS.map((id) => ({ value: id, labelKey: `pos.${id}` })),
    value: st.pos,
    onChange: (v) => change((s) => { s.pos = v; }),
  });
  ui.sw = createSegmented({
    labelKey: 'ctl.switch',
    options: [{ value: 'open', labelKey: 'ctl.open' }, { value: 'closed', labelKey: 'ctl.closed' }],
    value: st.sw,
    onChange: (v) => change((s) => { s.sw = v; }),
  });
  ui.fuse = createButton({ labelKey: 'ctl.fuse', onClick: () => change((s) => { s.fuseBlown = false; s.fb = null; }), variant: 'primary' });
  const record = () => {
    const s = cur();
    const e = evaluate(s);
    if (!e.range.kind || e.fn === 'mismatch') { s.fb = { type: 'warn', key: 'fb.nothing' }; updateMeasures(); return; }
    const r = readingText(s, e);
    s.rows.push({ pos: s.pos, fn: e.fn, r });
    if (s.rows.length > 8) s.rows.shift();
    s.fb = { type: 'good', key: 'fb.recorded', params: { r } };
    updateMeasures();
  };
  controlsBody.append(
    ui.jack.root, ui.range.root, ui.pos.root, ui.sw.root,
    el('div', { class: 'btn-row' }, [
      createButton({ labelKey: 'ctl.reverse', onClick: () => change((s) => { s.reversed = !s.reversed; }) }),
      createButton({ labelKey: 'ctl.record', onClick: record, variant: 'primary' }),
    ]),
    el('div', { class: 'btn-row', style: 'margin-top:8px' }, [ui.fuse, createButton({ labelKey: 'ui.reset', onClick: resetTab, variant: 'ghost' })]),
    el('p', { class: 'muted', style: 'margin:8px 0 0;font-size:0.88rem', dataset: { i18n: 'hint.tap' } }, t('hint.tap')),
  );
  ui.dl = el('dl', { class: 'meas' });
  ui.table = el('table', { class: 'data' });
  ui.clear = createButton({ labelKey: 'ctl.clearTable', onClick: () => { cur().rows = []; cur().fb = null; updateMeasures(); }, variant: 'ghost' });
  ui.clearRow = el('div', { class: 'btn-row', style: 'margin-top:8px' }, [ui.clear]);
  ui.status = el('div', { class: 'status', hidden: '' });
  measuresBody.append(ui.dl, ui.status, ui.table, ui.clearRow);
}

function updateMeasures() {
  if (!shell || !ui.dl) return;
  const st = cur();
  const e = evaluate(st);
  ui.jack.set(st.jack);
  ui.range.set(st.range);
  ui.pos.set(st.pos);
  const wireBtn = ui.pos.root.querySelector('[data-value="wire"]');
  if (wireBtn) wireBtn.disabled = st.jack === '2A';
  ui.sw.set(st.sw);
  ui.fuse.hidden = !st.fuseBlown;
  ui.fuse.disabled = wouldShort(st);
  measRows(ui.dl, [
    [t('m.function'), t(`fn.${e.fn}`), e.fn === 'mismatch' ? 'warn-text' : ''],
    [t('m.connection'), t(`pos.${st.pos}`)],
    [t('m.display'), readingText(st, e)],
    [t('m.lamp'), t(e.glow > 0.05 ? 'lamp.on' : 'lamp.off')],
    [t('m.fuse'), t(st.fuseBlown ? 'fuse.blown' : 'fuse.ok'), st.fuseBlown ? 'bad-text' : ''],
  ]);
  showStatus(ui.status, st.fb ?? advice(st, e));
  const head = el('tr', {}, [el('th', {}, t('col.connection')), el('th', {}, t('col.reading'))]);
  const body = st.rows.map((r) => el('tr', {}, [el('td', {}, `${t(`fn.${r.fn}`)} — ${t(`pos.${r.pos}`)}`), el('td', {}, r.r)]));
  ui.table.replaceChildren(el('thead', {}, head), el('tbody', {}, body));
  ui.table.hidden = st.rows.length === 0;
  ui.clearRow.hidden = ui.table.hidden;
}

function buildTab() {
  loop.stop();
  controlsBody.replaceChildren();
  measuresBody.replaceChildren();
  ui = {};
  build();
  refresh();
}
function resetTab() {
  S[shell.tab] = initialState(shell.tab);
  buildTab();
}

// Labels of the inputs and ranges (same in both languages, numbers formatted per language)
function extraStrings() {
  const s = { en: {}, fr: {} };
  for (const lang of ['en', 'fr']) {
    s[lang]['jack.2A'] = '2A';
    s[lang]['jack.V'] = 'V';
    s[lang]['range.off'] = 'OFF';
    for (const id of DIAL_ORDER.slice(1)) s[lang][`range.${id}`] = RANGES[id].label;
  }
  return s;
}
const xs = extraStrings();
onLangChange(() => { if (shell) buildTab(); });

shell = initSim({
  strings: { en: { ...strings.en, ...xs.en }, fr: { ...strings.fr, ...xs.fr } },
  tabs: [{ id: 'ammeter', labelKey: 'tab.ammeter' }, { id: 'voltmeter', labelKey: 'tab.voltmeter' }],
  initialTab: 'ammeter',
  onTab: buildTab,
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, evaluate, cur: () => cur(), displayText };
