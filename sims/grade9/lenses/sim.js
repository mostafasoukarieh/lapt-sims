// Grade 9 — Lenses (Ch.2 parts 1–2: Act. 1–7; Ex. 1–2, 5–8, 10, 12–13, 16). Part 3 (vergence) is suspended in 2026–2027.
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num } from '../../../shared/format.js';
import { createButton, createSegmented, createSlider, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, font } from '../../../shared/draw.js';
import { drawRay, LIGHT } from '../../../shared/optics-draw.js';

/* ================================================================
   Model: thin lens, scale 1 cm = PX px on the screen
   A ray reaching the lens at height h (upward) with slope u leaves with slope u − h / f.
   ================================================================ */
const PX = 10;
const AXIS = 190, LX = 300, HALF = 70; // optical axis, lens position, half-height of the lens
const SHAPES = [
  { id: 'biconvex', conv: true }, { id: 'planoconvex', conv: true }, { id: 'meniscusConv', conv: true },
  { id: 'biconcave', conv: false }, { id: 'planoconcave', conv: false }, { id: 'meniscusDiv', conv: false },
];
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const rand = (a) => a[Math.floor(Math.random() * a.length)];

function newPractice() {
  const conv = Math.random() < 0.5;
  const f = (conv ? 1 : -1) * rand([6, 8, 10, 12]);
  const kind = rand(['O', 'par', 'F']);
  const ax = rand([60, 80, 100]), ay = AXIS - rand([-40, -30, 30, 40, 50]);
  return { conv, f, kind, A: { x: ax, y: ay } };
}
function initialState(tab) {
  switch (tab) {
    case 'shapes': return { order: shuffle(SHAPES.map((s) => s.id)), answers: {}, checked: false, fb: null };
    case 'beam': return { lens: 'conv', f: 10, mystery: false, myst: null, guess: '', ext: true, fb: null };
    case 'reading': return { lens: 'conv', d: 6, fb: null };
    default: return { mode: 'explore', lens: 'conv', f: 10, kind: 'par', A: { x: 80, y: AXIS - 40 }, I: { y: AXIS - 40 }, ext: true, pr: newPractice(), guess: '', revealed: false, score: 0, tries: 0, fb: null };
  }
}
const TABS = ['shapes', 'beam', 'reading', 'rays'];
let S = Object.fromEntries(TABS.map((k) => [k, initialState(k)]));

// Emergent ray: given the point A of the incident ray and the point I on the lens (x = LX), returns the slope after the lens (y down)
function emergentSlope(A, Iy, fcm) {
  const uIn = (Iy - A.y) / (LX - A.x); // dy/dx with y down
  const h = AXIS - Iy;                 // height above the axis
  return uIn + h / (fcm * PX);         // y down: −(−u − h/f) … equivalent to u − h/f with y up
}
// The incident point I on the lens for each particular ray
function incidentI(kind, A, fcm) {
  if (kind === 'O') return AXIS;
  if (kind === 'par') return A.y;
  const Fx = LX - fcm * PX; // object focus F (left for a converging lens, right for a diverging lens)
  return A.y + ((LX - A.x) * (AXIS - A.y)) / (Fx - A.x);
}

/* ================================================================
   Canvas
   ================================================================ */
const H = 380;
let shell;
let hit = [];
let drag = null;
let drawQueued = false;
const canvas = document.getElementById('stage');
canvas.style.touchAction = 'none';
const view = setupCanvas(canvas, { width: 600, height: H, maxHeightVh: () => (window.innerWidth < 880 ? 46 : 74), onResize: () => requestDraw() });
const diag = setupCanvas(document.getElementById('diagram'), { width: 360, height: 200, maxHeightVh: 30, onResize: () => requestDraw() });
function requestDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; draw(); });
}
onThemeChange(() => requestDraw());
const cur = () => S[shell.tab];
function tag(ctx, s, x, y, color = cssVar('--text'), size = 14, align = 'center') {
  ctx.fillStyle = color; ctx.font = font(size, 800); ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(s, x, y);
}

// Cross-section of a lens centred at (x, y), half-height hh. Glass colour, thin or thick edges.
function lensPath(ctx, id, x, y, hh) {
  const t0 = 6, bulge = hh * 0.42;
  ctx.beginPath();
  const top = y - hh, bot = y + hh;
  const curve = (x0, b) => ctx.quadraticCurveTo(x0 + b, y, x0, bot);
  const curveUp = (x0, b) => ctx.quadraticCurveTo(x0 + b, y, x0, top);
  switch (id) {
    case 'biconvex': ctx.moveTo(x - t0, top); ctx.lineTo(x + t0, top); curve(x + t0, bulge); ctx.lineTo(x - t0, bot); curveUp(x - t0, -bulge); break;
    case 'planoconvex': ctx.moveTo(x - t0, top); ctx.lineTo(x + t0, top); curve(x + t0, bulge * 1.6); ctx.lineTo(x - t0, bot); ctx.closePath(); break;
    case 'meniscusConv': ctx.moveTo(x - t0, top); ctx.lineTo(x + t0, top); curve(x + t0, bulge * 1.8); ctx.lineTo(x - t0, bot); curveUp(x - t0, bulge * 0.7); break;
    case 'biconcave': ctx.moveTo(x - 3 * t0, top); ctx.lineTo(x + 3 * t0, top); curve(x + 3 * t0, -bulge); ctx.lineTo(x - 3 * t0, bot); curveUp(x - 3 * t0, bulge); break;
    case 'planoconcave': ctx.moveTo(x - 2 * t0, top); ctx.lineTo(x + 3 * t0, top); curve(x + 3 * t0, -bulge * 1.5); ctx.lineTo(x - 2 * t0, bot); ctx.closePath(); break;
    default: ctx.moveTo(x - 3 * t0, top); ctx.lineTo(x + 3 * t0, top); curve(x + 3 * t0, bulge * 0.6); ctx.lineTo(x - 3 * t0, bot); curveUp(x - 3 * t0, bulge * 1.6); break; // meniscusDiv
  }
  ctx.closePath();
}
function drawLensShape(ctx, id, x, y, hh) {
  lensPath(ctx, id, x, y, hh);
  ctx.fillStyle = 'rgba(140, 200, 235, 0.45)'; ctx.fill();
  ctx.strokeStyle = 'rgba(40, 110, 160, 0.9)'; ctx.lineWidth = 2; ctx.stroke();
}
// Symbol of a thin lens (double arrow outward = converging, inward = diverging)
function drawSymbol(ctx, x, y, hh, conv, color = cssVar('--text')) {
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(x, y - hh); ctx.lineTo(x, y + hh); ctx.stroke();
  const head = (yy, dir) => {
    ctx.beginPath();
    if (conv) { ctx.moveTo(x - 8, yy + 9 * dir); ctx.lineTo(x, yy); ctx.lineTo(x + 8, yy + 9 * dir); }
    else { ctx.moveTo(x - 8, yy - 9 * dir); ctx.lineTo(x, yy); ctx.lineTo(x + 8, yy - 9 * dir); }
    ctx.stroke();
  };
  head(y - hh, 1); head(y + hh, -1);
}
function drawAxis(ctx, fcm, { showF = true } = {}) {
  ctx.strokeStyle = cssVar('--muted'); ctx.lineWidth = 1.2; ctx.setLineDash([8, 5]);
  ctx.beginPath(); ctx.moveTo(16, AXIS); ctx.lineTo(584, AXIS); ctx.stroke(); ctx.setLineDash([]);
  tag(ctx, 'O', LX + 10, AXIS + 14, cssVar('--text'), 13);
  if (!showF) return;
  const Fx = LX - fcm * PX, F2x = LX + fcm * PX;
  for (const [x, name] of [[Fx, 'F'], [F2x, 'F’']]) {
    ctx.fillStyle = cssVar('--accent'); ctx.beginPath(); ctx.arc(x, AXIS, 4, 0, Math.PI * 2); ctx.fill();
    tag(ctx, name, x, AXIS + 16, cssVar('--accent'), 14);
  }
}

function draw() {
  if (!shell) return;
  const tab = shell.tab;
  const st = cur();
  if (view.height !== H) view.setLogicalSize(600, H);
  const ctx = view.begin();
  ctx.fillStyle = cssVar('--board');
  roundRect(ctx, 8, 8, 584, H - 16, 14); ctx.fill();
  hit = [];
  ({ shapes: drawShapes, beam: drawBeam, reading: drawReading, rays: drawRays })[tab](ctx, st);
  drawDiagram(tab, st);
}

/* ---------- Activity 1: thin-edge and thick-edge lenses ---------- */
function drawShapes(ctx, st) {
  st.order.forEach((id, i) => {
    const x = 110 + (i % 3) * 190, y = 110 + Math.floor(i / 3) * 170;
    drawLensShape(ctx, id, x, y, 52);
    tag(ctx, `(${'abcdef'[i]})`, x - 60, y - 50, cssVar('--text'), 15);
    const ans = st.answers[id];
    const sh = SHAPES.find((s) => s.id === id);
    if (ans) tag(ctx, t(`edge.${ans}`), x, y + 68, cssVar('--primary'), 12);
    if (st.checked && ans) {
      const ok = (ans === 'thin') === sh.conv;
      tag(ctx, ok ? '✓' : '✗', x + 56, y - 46, ok ? cssVar('--good') : cssVar('--bad'), 20);
      drawSymbol(ctx, x + 70, y, 26, sh.conv, cssVar('--muted'));
    }
  });
}

/* ---------- Activities 2–3 and Ex. 16: cylindrical beam ---------- */
function beamLens(st) {
  if (st.mystery) return st.myst;
  return { conv: st.lens === 'conv', f: (st.lens === 'conv' ? 1 : -1) * st.f };
}
function drawBeam(ctx, st) {
  const L = beamLens(st);
  drawAxis(ctx, L.f, { showF: !st.mystery });
  const hs = [-48, -16, 16, 48];
  for (const h of hs) {
    const y = AXIS - h;
    drawRay(ctx, 20, y, LX, y, { arrows: 1 });
    const u = emergentSlope({ x: 20, y }, y, L.f);
    const x2 = 584, y2 = y + u * (x2 - LX);
    drawRay(ctx, LX, y, x2, y2, { arrows: 1 });
    if (!L.conv && st.ext && !st.mystery) drawRay(ctx, LX, y, LX + L.f * PX, AXIS, { arrows: 0, dash: [5, 5], width: 1.4 });
  }
  if (st.mystery) {
    ctx.fillStyle = cssVar('--device'); roundRect(ctx, LX - 50, AXIS - 90, 100, 180, 12); ctx.fill();
    tag(ctx, '?', LX, AXIS, cssVar('--text-on-meter'), 48);
  } else drawLensShape(ctx, L.conv ? 'biconvex' : 'biconcave', LX, AXIS, HALF);
}

/* ---------- Activity 4: reading through a lens ---------- */
function drawReading(ctx, st) {
  // a page of text
  ctx.fillStyle = '#fbfaf5'; roundRect(ctx, 40, 40, 520, 300, 8); ctx.fill();
  const lines = t('read.text').split('\n');
  const paint = () => {
    ctx.fillStyle = '#1b1f27'; ctx.font = font(15, 500); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    lines.forEach((ln, i) => ctx.fillText(ln, 60, 70 + i * 26));
  };
  paint();
  // the lens above the page: apparent magnification of a thin lens used as a magnifier, m = f / (f − d)
  const f = st.lens === 'conv' ? 10 : -10;
  const m = f / (f - st.d);
  const cx = 300, cy = 190, r = 80;
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = '#fbfaf5'; ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
  ctx.translate(cx, cy); ctx.scale(m, m); ctx.translate(-cx, -cy);
  paint();
  ctx.restore();
  ctx.fillStyle = 'rgba(140, 200, 235, 0.18)'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#5b636e'; ctx.lineWidth = 7; ctx.stroke();
  ctx.strokeStyle = '#3b414a'; ctx.lineWidth = 12; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx + r * 0.72, cy + r * 0.72); ctx.lineTo(cx + r * 1.25, cy + r * 1.25); ctx.stroke();
  tag(ctx, `${t('read.lensIs')} ${t(st.lens === 'conv' ? 'lens.convShort' : 'lens.divShort')}`, 300, 362, cssVar('--text'), 13);
}

/* ---------- Activities 5–7, Ex. 12–13: particular rays ---------- */
function raysLens(st) {
  return st.mode === 'practice' ? { conv: st.pr.conv, f: st.pr.f } : { conv: st.lens === 'conv', f: (st.lens === 'conv' ? 1 : -1) * st.f };
}
function drawRays(ctx, st) {
  const L = raysLens(st);
  drawAxis(ctx, L.f);
  drawSymbol(ctx, LX, AXIS, 110, L.conv);
  const A = st.mode === 'practice' ? st.pr.A : st.A;
  const kind = st.mode === 'practice' ? st.pr.kind : st.kind;
  const Iy = kind === 'free' ? st.I.y : incidentI(kind, A, L.f);
  // incident ray (from A to I, continued backwards to the left edge)
  const u0 = (Iy - A.y) / (LX - A.x);
  const x0 = 16, y0 = A.y + u0 * (x0 - A.x);
  drawRay(ctx, x0, y0, LX, Iy, { arrows: 2, width: 2.5 });
  // when the ray is aimed towards F of a diverging lens (F on the right), show the aim as dashes
  if (kind === 'F' && !L.conv) drawRay(ctx, LX, Iy, LX - L.f * PX, AXIS, { arrows: 0, dash: [5, 5], width: 1.4, color: cssVar('--muted') });
  const showOut = st.mode !== 'practice' || st.revealed;
  if (showOut) {
    const u = emergentSlope(A, Iy, L.f);
    const x2 = 584, y2 = Iy + u * (x2 - LX);
    drawRay(ctx, LX, Iy, x2, y2, { arrows: 2, width: 2.5, color: '#f08a1c' });
    // backward extension of the emergent ray (it seems to come from F’ for a diverging lens)
    if (st.ext) drawRay(ctx, LX, Iy, 16, Iy + u * (16 - LX), { arrows: 0, dash: [5, 5], width: 1.3, color: '#f08a1c' });
  }
  // handles
  if (st.mode !== 'practice') {
    ctx.fillStyle = cssVar('--primary'); ctx.beginPath(); ctx.arc(A.x, A.y, 9, 0, Math.PI * 2); ctx.fill();
    tag(ctx, 'A', A.x - 16, A.y - 14, cssVar('--primary'), 14);
    hit.push({ kind: 'A', x: A.x, y: A.y, r: 26 });
    if (kind === 'free') {
      ctx.strokeStyle = cssVar('--primary'); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(LX, Iy, 9, 0, Math.PI * 2); ctx.stroke();
      tag(ctx, 'I', LX + 16, Iy - 12, cssVar('--primary'), 14);
      hit.push({ kind: 'I', x: LX, y: Iy, r: 26 });
    }
  } else {
    ctx.fillStyle = LIGHT; ctx.beginPath(); ctx.arc(A.x, A.y, 6, 0, Math.PI * 2); ctx.fill();
  }
  tag(ctx, `f = OF’ = ${num(L.f, 0)} cm`, 500, 40, cssVar('--text'), 14);
}

/* ---------- Diagrams ---------- */
function drawDiagram(tab, st) {
  const ctx = diag.begin();
  const ink = cssVar('--text');
  if (tab === 'shapes' || tab === 'reading') {
    drawSymbol(ctx, 110, 95, 55, true); drawSymbol(ctx, 250, 95, 55, false);
    tag(ctx, t('lens.convShort'), 110, 172, ink, 12); tag(ctx, t('lens.divShort'), 250, 172, ink, 12);
    tag(ctx, t('diag.symbols'), 180, 20, cssVar('--muted'), 11);
    return;
  }
  const L = tab === 'beam' ? beamLens(st) : raysLens(st);
  const ax = 100, x0 = 180, s = 4.2;
  ctx.strokeStyle = cssVar('--muted'); ctx.lineWidth = 1; ctx.setLineDash([5, 4]);
  ctx.beginPath(); ctx.moveTo(20, ax); ctx.lineTo(340, ax); ctx.stroke(); ctx.setLineDash([]);
  if (tab === 'beam' && st.mystery) { tag(ctx, '?', x0, ax, ink, 30); return; }
  drawSymbol(ctx, x0, ax, 60, L.conv);
  const f = L.f * s;
  for (const [x, n] of [[x0 - f, 'F'], [x0 + f, 'F’']]) { ctx.fillStyle = cssVar('--accent'); ctx.beginPath(); ctx.arc(x, ax, 3, 0, 7); ctx.fill(); tag(ctx, n, x, ax + 14, cssVar('--accent'), 12); }
  tag(ctx, 'O', x0 + 9, ax + 12, ink, 11);
  // the three particular rays
  const col = '#f08a1c';
  const y1 = ax - 35;
  drawRay(ctx, 30, y1, x0, y1, { arrows: 1, width: 1.6 });
  drawRay(ctx, x0, y1, 340, y1 + ((340 - x0) * 35) / f, { arrows: 1, width: 1.6, color: col });
  drawRay(ctx, 60, ax - 30, 300, ax + (30 * 120) / (x0 - 60), { arrows: 1, width: 1.6 });
  tag(ctx, t(L.conv ? 'diag.conv' : 'diag.div'), 180, 186, ink, 11);
}

/* ================================================================
   Pointer
   ================================================================ */
canvas.addEventListener('pointerdown', (ev) => {
  const p = view.toLogical(ev);
  const h = hit.find((q) => Math.hypot(p.x - q.x, p.y - q.y) < q.r);
  if (!h) return;
  ev.preventDefault();
  drag = h.kind;
  canvas.setPointerCapture(ev.pointerId);
});
canvas.addEventListener('pointermove', (ev) => {
  if (!drag) return;
  const p = view.toLogical(ev);
  const st = cur();
  if (drag === 'A') { st.A.x = Math.max(24, Math.min(LX - 30, p.x)); st.A.y = Math.max(30, Math.min(H - 30, p.y)); }
  else st.I.y = Math.max(AXIS - 100, Math.min(AXIS + 100, p.y));
  refresh();
});
const endDrag = () => { drag = null; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

/* ================================================================
   Panels
   ================================================================ */
const controlsBody = document.getElementById('controls-body');
const measuresBody = document.getElementById('measures-body');
let ui = {};
function change(fn, keepFb = false) { const st = cur(); fn(st); if (!keepFb) st.fb = null; refresh(); }
function refresh() { updateMeasures(); requestDraw(); }
function seg(labelKey, options, value, onChange) {
  return createSegmented({ labelKey, options: options.map(([v, k]) => ({ value: String(v), labelKey: k })), value: String(value), onChange });
}
const btnRow = (...b) => el('div', { class: 'btn-row', style: 'margin-top:8px' }, b);
const resetBtn = () => createButton({ labelKey: 'ui.reset', variant: 'ghost', onClick: () => { S[shell.tab] = initialState(shell.tab); buildTab(); } });
const hintP = (key) => el('p', { class: 'muted', style: 'margin:8px 0 0;font-size:0.88rem', dataset: { i18n: key } }, t(key));
const lensSeg = (st) => seg('ctl.lens', [['conv', 'lens.thin'], ['div', 'lens.thick']], st.lens, (v) => change((s) => { s.lens = v; }));

function build() {
  const tab = shell.tab;
  const st = cur();
  const items = [];
  if (tab === 'shapes') {
    ui.ans = st.order.map((id, i) => createSegmented({ labelKey: `shape.${i}`, options: [{ value: 'thin', labelKey: 'edge.thin' }, { value: 'thick', labelKey: 'edge.thick' }], value: st.answers[id] || '', onChange: (v) => change((s) => { s.answers[id] = v; s.checked = false; }) }));
    items.push(...ui.ans.map((c) => c.root), btnRow(createButton({ labelKey: 'ctl.check', variant: 'primary', onClick: () => change((s) => {
      s.checked = true;
      const n = SHAPES.filter((sh) => (s.answers[sh.id] === 'thin') === sh.conv && s.answers[sh.id]).length;
      s.fb = { type: n === SHAPES.length ? 'good' : 'warn', key: 'fb.shapes', params: { n } };
    }, true) }), createButton({ labelKey: 'ctl.shuffle', onClick: () => { S.shapes = initialState('shapes'); buildTab(); } })), hintP('hint.shapes'));
  } else if (tab === 'beam') {
    ui.myst = seg('ctl.beamMode', [['no', 'bmode.known'], ['yes', 'bmode.mystery']], st.mystery ? 'yes' : 'no', (v) => {
      const s = cur(); s.mystery = v === 'yes'; s.guess = ''; s.fb = null;
      if (s.mystery) s.myst = (() => { const c = Math.random() < 0.5; return { conv: c, f: (c ? 1 : -1) * rand([8, 10, 12, 15]) }; })();
      buildTab();
    });
    items.push(ui.myst.root);
    if (!st.mystery) {
      ui.lens = lensSeg(st);
      items.push(ui.lens.root, createSlider({ labelKey: 'ctl.f', min: 5, max: 20, step: 1, value: st.f, unit: 'cm', decimals: 0, onInput: (v) => change((s) => { s.f = v; }) }).root);
      ui.ext = seg('ctl.ext', [['yes', 'ctl.yes'], ['no', 'ctl.no']], st.ext ? 'yes' : 'no', (v) => change((s) => { s.ext = v === 'yes'; }));
      items.push(ui.ext.root);
    } else {
      ui.guess = seg('ctl.guess', [['conv', 'lens.convShort'], ['div', 'lens.divShort']], st.guess, (v) => change((s) => { s.guess = v; }));
      items.push(ui.guess.root, btnRow(createButton({ labelKey: 'ctl.check', variant: 'primary', onClick: () => change((s) => {
        if (!s.guess) { s.fb = { type: 'warn', key: 'fb.chooseFirst' }; return; }
        s.fb = (s.guess === 'conv') === s.myst.conv ? { type: 'good', key: s.myst.conv ? 'fb.mystConv' : 'fb.mystDiv' } : { type: 'bad', key: 'fb.mystWrong' };
      }, true) }), createButton({ labelKey: 'ctl.newLens', onClick: () => { const s = cur(); const c = Math.random() < 0.5; s.myst = { conv: c, f: (c ? 1 : -1) * rand([8, 10, 12, 15]) }; s.guess = ''; s.fb = null; buildTab(); } })));
    }
  } else if (tab === 'reading') {
    ui.lens = seg('ctl.lens', [['conv', 'lens.convShort'], ['div', 'lens.divShort']], st.lens, (v) => change((s) => { s.lens = v; }));
    items.push(ui.lens.root, createSlider({ labelKey: 'ctl.d', min: 1, max: 9, step: 0.5, value: st.d, unit: 'cm', decimals: 1, onInput: (v) => change((s) => { s.d = v; }) }).root, hintP('hint.reading'));
  } else {
    ui.mode = seg('ctl.rmode', [['explore', 'rmode.explore'], ['practice', 'rmode.practice']], st.mode, (v) => { cur().mode = v; cur().fb = null; buildTab(); });
    items.push(ui.mode.root);
    if (st.mode === 'explore') {
      ui.lens = lensSeg(st);
      ui.kind = seg('ctl.kind', [['O', 'kind.O'], ['par', 'kind.par'], ['F', 'kind.F'], ['free', 'kind.free']], st.kind, (v) => change((s) => { s.kind = v; if (v === 'free') s.I.y = s.A.y; }));
      items.push(ui.lens.root, createSlider({ labelKey: 'ctl.f', min: 5, max: 20, step: 1, value: st.f, unit: 'cm', decimals: 0, onInput: (v) => change((s) => { s.f = v; }) }).root, ui.kind.root);
      ui.ext = seg('ctl.extRay', [['yes', 'ctl.yes'], ['no', 'ctl.no']], st.ext ? 'yes' : 'no', (v) => change((s) => { s.ext = v === 'yes'; }));
      items.push(ui.ext.root, btnRow(resetBtn()), hintP('hint.rays'));
    } else {
      ui.guess = seg('ctl.predict', [['undev', 'pred.undev'], ['F2', 'pred.F2'], ['fromF2', 'pred.fromF2'], ['par', 'pred.par']], st.guess, (v) => change((s) => { s.guess = v; }));
      items.push(ui.guess.root, btnRow(createButton({ labelKey: 'ctl.check', variant: 'primary', onClick: () => change((s) => {
        if (!s.guess) { s.fb = { type: 'warn', key: 'fb.chooseFirst' }; return; }
        const right = s.pr.kind === 'O' ? 'undev' : s.pr.kind === 'F' ? 'par' : s.pr.conv ? 'F2' : 'fromF2';
        s.revealed = true; s.tries += 1;
        if (s.guess === right) s.score += 1;
        s.fb = s.guess === right ? { type: 'good', key: 'fb.predOk', params: { s: s.score, n: s.tries } } : { type: 'bad', key: 'fb.predWrong', params: { a: t(`pred.${right}`), s: s.score, n: s.tries } };
      }, true) }), createButton({ labelKey: 'ctl.newRay', onClick: () => { const s = cur(); s.pr = newPractice(); s.guess = ''; s.revealed = false; s.fb = null; buildTab(); } })), hintP('hint.practice'));
    }
  }
  controlsBody.append(...items);
  ui.dl = el('dl', { class: 'meas' });
  ui.status = el('div', { class: 'status', hidden: '' });
  measuresBody.append(ui.dl, ui.status);
}

function updateMeasures() {
  if (!shell || !ui.dl) return;
  const tab = shell.tab;
  const st = cur();
  const rows = [];
  let fb = st.fb;
  if (tab === 'shapes') {
    st.order.forEach((id, i) => ui.ans[i].set(st.answers[id] || ''));
    rows.push([t('m.answered'), `${Object.keys(st.answers).length} / 6`]);
  } else if (tab === 'beam') {
    ui.myst.set(st.mystery ? 'yes' : 'no');
    if (!st.mystery) {
      ui.lens.set(st.lens); ui.ext.set(st.ext ? 'yes' : 'no');
      const L = beamLens(st);
      rows.push([t('m.lens'), t(L.conv ? 'lens.convShort' : 'lens.divShort')], [t('m.beam'), t(L.conv ? 'beam.conv' : 'beam.div')], ['f = OF’', `${num(L.f, 0)} cm`]);
    } else { ui.guess.set(st.guess); rows.push([t('m.lens'), '?']); }
  } else if (tab === 'reading') {
    ui.lens.set(st.lens);
    const f = st.lens === 'conv' ? 10 : -10;
    const m = f / (f - st.d);
    rows.push([t('m.lens'), `${t(st.lens === 'conv' ? 'lens.convShort' : 'lens.divShort')} (f = ${num(f, 0)} cm)`], [t('m.letters'), t(m > 1 ? 'read.larger' : 'read.smaller')]);
  } else {
    ui.mode.set(st.mode);
    const L = raysLens(st);
    if (st.mode === 'explore') {
      ui.lens.set(st.lens); ui.kind.set(st.kind); ui.ext.set(st.ext ? 'yes' : 'no');
      rows.push([t('m.lens'), t(L.conv ? 'lens.convShort' : 'lens.divShort')], ['f = OF’', `${num(L.f, 0)} cm`], [t('m.rule'), t(`rule.${st.kind}.${L.conv ? 'c' : 'd'}`)]);
    } else {
      ui.guess.set(st.guess);
      rows.push([t('m.lens'), t(L.conv ? 'lens.convShort' : 'lens.divShort')], [t('m.incident'), t(`inc.${st.pr.kind}.${L.conv ? 'c' : 'd'}`)], [t('m.score'), `${st.score} / ${st.tries}`]);
    }
  }
  ui.dl.replaceChildren(...rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)]));
  if (!fb) ui.status.hidden = true;
  else { ui.status.hidden = false; ui.status.className = `status ${fb.type || ''}`; ui.status.textContent = t(fb.key, fb.params); }
}

function buildTab() {
  controlsBody.replaceChildren();
  measuresBody.replaceChildren();
  ui = {};
  build();
  refresh();
}
const xs = { en: {}, fr: {} };
for (const lang of ['en', 'fr']) [0, 1, 2, 3, 4, 5].forEach((i) => { xs[lang][`shape.${i}`] = `(${'abcdef'[i]})`; });
onLangChange(() => { if (shell) buildTab(); });

shell = initSim({
  strings: { en: { ...strings.en, ...xs.en }, fr: { ...strings.fr, ...xs.fr } },
  tabs: TABS.map((id) => ({ id, labelKey: `tab.${id}` })),
  initialTab: 'shapes',
  onTab: buildTab,
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, cur: () => cur(), emergentSlope, incidentI };
