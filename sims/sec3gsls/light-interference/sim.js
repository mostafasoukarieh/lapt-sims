// Sec 3 GS-LS — Chapter 14: Interference of light. Taught only in General Sciences in 2026–2027 (owner, 21 Nov 2026:
// it may also be required for Life Sciences next year) — gsOnly with the sentence "ui.gsOnlyYear".
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num, qty } from '../../../shared/format.js';
import { createButton, createSegmented, createSlider, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, arrow } from '../../../shared/draw.js';
import { label } from '../../../shared/figures.js';
import { calcCell, calcSig, calcDone } from '../../../shared/calc-cell.js';
import { lambdaRGB, lambdaCSS, sinc2, drawPattern } from '../../../shared/wave-optics.js';

const TAU = 2 * Math.PI;
const W = 600;
const TABS = ['young', 'path', 'coherence', 'medium'];
const HEIGHTS = { young: 420, path: 440, coherence: 420, medium: 420 };
const B_SLIT = 0.08; // mm: width of each slit (chosen) → diffraction envelope

function initialState(tab) {
  switch (tab) {
    case 'young': return { a: 0.5, D: 2, lam: 633, rows: [], fb: null };
    case 'path': return { x: 3.8, rows: [], fb: null };
    case 'coherence': return { mode: 'laser' };
    default: return { n: 1, rows: [], fb: null };
  }
}
let S = Object.fromEntries(TABS.map((k) => [k, initialState(k)]));
const PATH = { a: 0.5, D: 2, lam: 633 }; // set-up of the path-difference tab (chosen)
const MED = { a: 0.5, D: 2, lam: 633 };

// two-slit intensity at abscissa X (mm) on the screen
function young(X, a, D, lamNm, { both = true, coherent = true } = {}) {
  const lam = lamNm * 1e-6, Dm = D * 1000;
  const env = sinc2((Math.PI * B_SLIT * X) / (lam * Dm));
  if (!both) return env * 0.5;
  if (!coherent) return env;
  const c = Math.cos((Math.PI * a * X) / (lam * Dm));
  return env * c * c;
}

/* ================================================================
   Canvas (static pages)
   ================================================================ */
let shell;
let drawQueued = false;
const canvas = document.getElementById('stage');
const view = setupCanvas(canvas, { width: W, height: 420, maxHeightVh: () => (window.innerWidth < 880 ? 54 : 78), onResize: () => requestDraw() });
function requestDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; draw(); });
}
onThemeChange(() => requestDraw());
const ink = (ctx, w = 2) => { ctx.strokeStyle = cssVar('--text'); ctx.fillStyle = cssVar('--text'); ctx.lineWidth = w; };
function note(ctx, key, x, y, align = 'center', params) { label(ctx, t(key, params), x, y, { size: 12, weight: 600, color: cssVar('--muted'), align }); }
function ruler(ctx, x0, x1, y, mmPerPx) {
  ink(ctx, 1);
  const cx = (x0 + x1) / 2, half = ((x1 - x0) / 2) * mmPerPx;
  ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
  for (let m = -Math.floor(half); m <= half + 1e-9; m += 1) {
    const X = cx + m / mmPerPx, big = m % 10 === 0;
    ctx.beginPath(); ctx.moveTo(X, y); ctx.lineTo(X, y + (big ? 10 : 5)); ctx.stroke();
    if (big) label(ctx, num(m, 0), X, y + 19, { size: 10, weight: 600, halo: false });
  }
  label(ctx, 'mm', x1, y + 32, { size: 10, weight: 700, align: 'right', halo: false });
}
// side view: laser → two slits S1, S2 → screen E
function setup(ctx, nmColor, y, txtSlits, dTxt, cover = null) {
  ctx.fillStyle = cssVar('--metal'); roundRect(ctx, 20, y - 14, 70, 28, 5); ctx.fill();
  label(ctx, t('laser'), 55, y, { size: 10, weight: 800, color: '#fff', halo: false });
  ctx.strokeStyle = nmColor; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(90, y); ctx.lineTo(170, y); ctx.stroke();
  ink(ctx, 4); ctx.beginPath(); ctx.moveTo(170, y - 40); ctx.lineTo(170, y - 12); ctx.moveTo(170, y - 6); ctx.lineTo(170, y + 6); ctx.moveTo(170, y + 12); ctx.lineTo(170, y + 40); ctx.stroke();
  ctx.fillStyle = nmColor.replace(/,1\)$/, ',0.16)');
  for (const dy of [-9, 9]) { if (cover === dy) continue; ctx.beginPath(); ctx.moveTo(170, y + dy); ctx.lineTo(560, y - 34 + dy); ctx.lineTo(560, y + 34 + dy); ctx.closePath(); ctx.fill(); }
  label(ctx, 'S₁', 156, y - 9, { size: 11, weight: 800 }); label(ctx, 'S₂', 156, y + 9, { size: 11, weight: 800 });
  ink(ctx, 5); ctx.beginPath(); ctx.moveTo(560, y - 46); ctx.lineTo(560, y + 46); ctx.stroke();
  label(ctx, 'E', 576, y - 40, { size: 13, weight: 800 });
  label(ctx, txtSlits, 170, y - 54, { size: 11, weight: 700 });
  ink(ctx, 1.2); arrow(ctx, 175, y + 58, 555, y + 58, 6); arrow(ctx, 555, y + 58, 175, y + 58, 6);
  label(ctx, dTxt, 365, y + 70, { size: 12, weight: 800 });
}

function draw() {
  if (!shell) return;
  const tab = shell.tab;
  if (view.height !== HEIGHTS[tab]) view.setLogicalSize(W, HEIGHTS[tab]);
  const ctx = view.begin();
  ctx.fillStyle = cssVar('--scene-bg');
  roundRect(ctx, 0, 0, W, HEIGHTS[tab], 14);
  ctx.fill();
  ({ young: drawYoung, path: drawPath, coherence: drawCoherence, medium: drawMedium })[tab](ctx, S[tab]);
}
function screen(ctx, y0, h, I, key, rgb, opts = {}) {
  const x0 = 20, w = 560, mmPerPx = 60 / w;
  ctx.fillStyle = '#000'; ctx.fillRect(x0, y0, w, h);
  drawPattern(ctx, x0, y0, w, h, (X, Y) => I(X) * Math.exp(-(Y * Y) / 9), { rgb, unitsPerPx: mmPerPx, key, res: 2, ...opts });
  ruler(ctx, x0, x0 + w, y0 + h + 6, mmPerPx);
}

/* ---------- Tab 1: Young's double-slit experiment (Exp. 14.1) ---------- */
function drawYoung(ctx, st) {
  setup(ctx, lambdaCSS(st.lam), 70, `a = ${qty(st.a, 2, 'mm')}`, `D = ${qty(st.D, 1, 'm')}`);
  screen(ctx, 170, 170, (X) => young(X, st.a, st.D, st.lam), `y${st.a}${st.D}${st.lam}`, lambdaRGB(st.lam));
  note(ctx, 'yo.note', W / 2, HEIGHTS.young - 18);
}

/* ---------- Tab 2: optical path difference, nature and order of a fringe ---------- */
const pathDelta = (x) => (PATH.a * x) / (PATH.D * 1000) * 1000; // µm (a, x in mm, D in m)
function drawPath(ctx, st) {
  // magnified geometry (not to scale)
  const sx = 90, s1y = 150, s2y = 230, ex = 470, k = 16; // px per mm on the screen axis
  const oy = (s1y + s2y) / 2, py = oy - st.x * k;
  ink(ctx, 4); ctx.beginPath(); ctx.moveTo(sx, 40); ctx.lineTo(sx, s1y - 6); ctx.moveTo(sx, s1y + 6); ctx.lineTo(sx, s2y - 6); ctx.moveTo(sx, s2y + 6); ctx.lineTo(sx, 340); ctx.stroke();
  ink(ctx, 5); ctx.beginPath(); ctx.moveTo(ex, 40); ctx.lineTo(ex, 340); ctx.stroke();
  label(ctx, 'S₁', sx - 18, s1y, { size: 12, weight: 800 }); label(ctx, 'S₂', sx - 18, s2y, { size: 12, weight: 800 });
  label(ctx, "O′", sx - 18, oy, { size: 12, weight: 800 }); label(ctx, 'O', ex + 14, oy, { size: 12, weight: 800 }); label(ctx, 'E', ex + 14, 46, { size: 13, weight: 800 });
  ctx.save(); ctx.strokeStyle = cssVar('--muted'); ctx.setLineDash([5, 4]); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(sx, oy); ctx.lineTo(ex, oy); ctx.stroke(); ctx.restore();
  ctx.lineWidth = 2;
  ctx.strokeStyle = cssVar('--s1'); ctx.beginPath(); ctx.moveTo(sx, s1y); ctx.lineTo(ex, py); ctx.stroke();
  ctx.strokeStyle = cssVar('--s5'); ctx.beginPath(); ctx.moveTo(sx, s2y); ctx.lineTo(ex, py); ctx.stroke();
  label(ctx, 'd₁', (sx + ex) / 2, (s1y + py) / 2 - 12, { size: 12, weight: 800, color: cssVar('--s1') });
  label(ctx, 'd₂', (sx + ex) / 2, (s2y + py) / 2 + 14, { size: 12, weight: 800, color: cssVar('--s5') });
  ctx.fillStyle = cssVar('--text'); ctx.beginPath(); ctx.arc(ex, py, 5, 0, TAU); ctx.fill();
  label(ctx, 'P', ex + 14, py - 2, { size: 13, weight: 800 });
  ink(ctx, 1.2); arrow(ctx, ex + 34, oy, ex + 34, py, 6); label(ctx, 'x', ex + 46, (oy + py) / 2, { size: 13, weight: 800 });
  // the real pattern beside the screen, at the same vertical scale
  ctx.fillStyle = '#000'; ctx.fillRect(500, 40, 80, 300);
  drawPattern(ctx, 500, 40, 80, 300, (X, Y) => young(-Y, PATH.a, PATH.D, PATH.lam), { rgb: lambdaRGB(PATH.lam), unitsPerPx: 1 / k, key: 'pathstrip', res: 2 });
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(500, py); ctx.lineTo(580, py); ctx.stroke();
  label(ctx, t('pa.notScale'), 280, 360, { size: 11, weight: 700, color: cssVar('--muted') });
  label(ctx, `a = ${qty(PATH.a, 1, 'mm')} · D = ${qty(PATH.D, 0, 'm')} · λ = ${qty(PATH.lam, 0, 'nm')}`, 280, 384, { size: 12, weight: 800 });
  label(ctx, 'δ = d₂ − d₁ = a x / D', 280, 410, { size: 13, weight: 800 });
}

/* ---------- Tab 3: coherence of the sources ---------- */
const WHITE = [400, 430, 460, 490, 520, 550, 580, 610, 640, 670, 700];
function drawCoherence(ctx, st) {
  const a = 0.5, D = 2;
  const m = st.mode;
  const col = m === 'white' ? 'rgba(255,255,255,1)' : m === 'filters' ? lambdaCSS(600) : lambdaCSS(633);
  setup(ctx, col, 70, `a = ${qty(a, 1, 'mm')}`, `D = ${qty(D, 0, 'm')}`, m === 'cover' ? -9 : null);
  if (m === 'lamps') { // two distinct sources, one in front of each slit
    for (const dy of [-9, 9]) { ctx.fillStyle = '#ffcf40'; ctx.beginPath(); ctx.arc(130, 70 + dy * 3.5, 9, 0, TAU); ctx.fill(); }
  }
  if (m === 'filters') { ctx.fillStyle = 'rgba(255,220,0,0.8)'; ctx.fillRect(176, 52, 8, 16); ctx.fillStyle = 'rgba(230,30,30,0.8)'; ctx.fillRect(176, 72, 8, 16); }
  const rgbFn = (X) => {
    if (m === 'white') {
      let r = 0, g = 0, b = 0;
      for (const nm of WHITE) { const v = young(X, a, D, nm); const c = lambdaRGB(nm); r += v * c[0]; g += v * c[1]; b += v * c[2]; }
      const kk = 1 / (WHITE.length * 120); return [r * kk, g * kk, b * kk];
    }
    if (m === 'filters') { // yellow (580 nm) through S1, red (650 nm) through S2: no interference, the two diffraction patterns add
      const y = young(X, a, D, 580, { both: false }), rr = young(X, a, D, 650, { both: false }), cy = lambdaRGB(580), cr = lambdaRGB(650);
      return [(y * cy[0] + rr * cr[0]) / 255, (y * cy[1] + rr * cr[1]) / 255, (y * cy[2] + rr * cr[2]) / 255];
    }
    if (m === 'colors') { // red and blue sources through both slits (exercise 7): two systems of fringes
      const r = young(X, a, D, 650), bl = young(X, a, D, 450), cr = lambdaRGB(650), cb = lambdaRGB(450);
      return [(r * cr[0] + bl * cb[0]) / 255, (r * cr[1] + bl * cb[1]) / 255, (r * cr[2] + bl * cb[2]) / 255];
    }
    const v = m === 'laser' ? young(X, a, D, 633) : m === 'cover' ? young(X, a, D, 633, { both: false }) : young(X, a, D, 633, { coherent: false }) * 0.6;
    const c = lambdaRGB(633); return [v * c[0] / 255, v * c[1] / 255, v * c[2] / 255];
  };
  const x0 = 20, y0 = 170, w = 560, h = 170;
  ctx.fillStyle = '#000'; ctx.fillRect(x0, y0, w, h);
  drawPattern(ctx, x0, y0, w, h, () => 0, { rgbFn: (X, Y) => rgbFn(X).map((v) => v * Math.exp(-(Y * Y) / 9)), unitsPerPx: 60 / w, key: `coh${m}`, res: 2 });
  ruler(ctx, x0, x0 + w, y0 + h + 6, 60 / w);
  note(ctx, `co.${m}Note`, W / 2, HEIGHTS.coherence - 18);
}

/* ---------- Tab 4: device in a transparent medium (Application 14.2) ---------- */
function drawMedium(ctx, st) {
  ctx.fillStyle = st.n > 1 ? `rgba(80,150,230,${0.12 * (st.n - 0.9) * 4})` : 'transparent';
  ctx.fillRect(10, 10, 580, 140);
  setup(ctx, lambdaCSS(MED.lam), 70, `a = ${qty(MED.a, 1, 'mm')}`, `D = ${qty(MED.D, 0, 'm')} · n = ${num(st.n, 2)}`);
  screen(ctx, 170, 170, (X) => young(X, MED.a, MED.D, MED.lam / st.n), `m${st.n}`, lambdaRGB(MED.lam));
  note(ctx, 'me.note', W / 2, HEIGHTS.medium - 18, 'center', { i: qty((MED.lam * 1e-6 * MED.D * 1000) / MED.a / st.n, 2, 'mm') });
}

/* ================================================================
   Controls and measurements
   ================================================================ */
const controlsBody = document.getElementById('controls-body');
const measuresBody = document.getElementById('measures-body');
let ui = {};
let tableSig = '';
function measRows(dl, rows) { dl.replaceChildren(...rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)])); }
function showStatus(box, fb) {
  if (!fb) { box.hidden = true; return; }
  box.hidden = false; box.className = `status ${fb.type || ''}`; box.textContent = t(fb.key, fb.params);
}
function hint(key) { return el('p', { class: 'muted', style: 'font-size:0.88rem;margin:10px 0 0', dataset: { i18n: key } }, t(key)); }
const btnRow = (...b) => el('div', { class: 'btn-row' }, b);
const resetBtn = (id) => btnRow(createButton({ labelKey: 'ui.reset', variant: 'ghost', onClick: () => resetTab(id) }));
const fbOf = (res, okKey, badKey) => (res === 'invalid' ? { type: 'warn', key: 'calcInvalid' } : res === 'wrong' ? { type: 'bad', key: badKey } : { type: 'good', key: okKey });
const relTol = (v, p, min = 1e-9) => Math.max(Math.abs(v) * p, min);
function tableBlock(st) {
  ui.dl = el('dl', { class: 'meas' });
  ui.tableWrap = el('div', { class: 'table-scroll' });
  ui.table = el('table', { class: 'data' });
  ui.tableWrap.append(ui.table);
  ui.clear = el('div', { class: 'btn-row', style: 'margin-top:8px' }, [createButton({ labelKey: 'ctl.clearTable', variant: 'ghost', onClick: () => { st.rows = []; st.fb = null; refresh(); } })]);
  ui.status = el('p', { class: 'status', hidden: '' });
  measuresBody.append(ui.dl, ui.tableWrap, ui.clear, ui.status);
}
function renderTable(st, rows, cols, rowFn) {
  const sig = calcSig(rows) + rows.length + cols.join();
  if (sig !== tableSig) {
    ui.table.replaceChildren(el('thead', {}, el('tr', {}, cols.map((k) => el('th', {}, t(k))))), el('tbody', {}, rows.map(rowFn)));
    tableSig = sig;
  }
  ui.tableWrap.hidden = rows.length === 0;
  ui.clear.hidden = ui.tableWrap.hidden;
  showStatus(ui.status, st.fb);
}
const cell = (st, r, key, expected, decimals, tol, okKey, badKey, disabled = false) =>
  calcCell(r, key, { expected, decimals, tol, disabled, onCheck: (res) => { st.fb = fbOf(res, okKey, badKey); refresh(); } });
const td = (v) => el('td', {}, v);
const recordBtn = (fn) => createButton({ labelKey: 'ctl.record', variant: 'secondary', onClick: fn });
const sliderEl = (st, key, prop, min, max, step, unit, dec, after) => createSlider({ labelKey: key, min, max, step, value: st[prop], unit, decimals: dec, onInput: (v) => { st[prop] = v; after?.(); refresh(); } }).root;
const seg = (st, key, prop, opts, after) => createSegmented({ labelKey: key, options: opts, value: st[prop], onChange: (v) => { st[prop] = v; after?.(); refresh(); } }).root;
const interfringe = (lam, D, a) => (lam * 1e-6 * D * 1000) / a; // mm

/* ---------- Tab 1 ---------- */
function buildYoung() {
  const st = S.young;
  controlsBody.append(sliderEl(st, 'ctl.a', 'a', 0.1, 1, 0.05, 'mm', 2), sliderEl(st, 'ctl.D', 'D', 1, 3, 0.25, 'm', 2), sliderEl(st, 'ctl.lam', 'lam', 400, 750, 10, 'nm', 0),
    btnRow(recordBtn(() => { st.rows.push({ a: st.a, D: st.D, lam: st.lam }); st.fb = null; refresh(); })), hint('hint.young'), resetBtn('young'));
  tableBlock(st);
}
function updateYoung() {
  const st = S.young;
  measRows(ui.dl, [[t('m.a'), qty(st.a, 2, 'mm')], [t('m.D'), qty(st.D, 2, 'm')], [t('m.lam'), qty(st.lam, 0, 'nm')]]);
  renderTable(st, st.rows, ['col.a', 'col.D', 'col.lam', 'col.i', 'col.10i'], (r) => {
    const i = interfringe(r.lam, r.D, r.a);
    return el('tr', {}, [td(num(r.a, 2)), td(num(r.D, 2)), td(num(r.lam, 0)),
      cell(st, r, 'i', i, 2, relTol(i, 0.01, 0.006), 'fb.iOk', 'fb.iWrong'),
      cell(st, r, 'ten', 10 * i, 1, relTol(10 * i, 0.01, 0.06), 'fb.tenOk', 'fb.tenWrong', !calcDone(r, 'i'))]);
  });
}

/* ---------- Tab 2 ---------- */
function buildPath() {
  const st = S.path;
  controlsBody.append(sliderEl(st, 'ctl.x', 'x', -8, 8, 0.1, 'mm', 1),
    btnRow(recordBtn(() => { st.rows.push({ x: st.x }); st.fb = null; refresh(); })), hint('hint.path'), resetBtn('path'));
  tableBlock(st);
}
function updatePath() {
  const st = S.path;
  measRows(ui.dl, [[t('m.x'), qty(st.x, 1, 'mm')], [t('m.i'), qty(interfringe(PATH.lam, PATH.D, PATH.a), 2, 'mm')]]);
  renderTable(st, st.rows, ['col.x', 'col.delta', 'col.ratio', 'col.nature'], (r) => {
    const d = pathDelta(r.x), p = d / (PATH.lam / 1000);
    const near = Math.round(p * 2) / 2, isInt = Math.abs(near - Math.round(near)) < 1e-9;
    const close = Math.abs(p - near) < 0.08;
    const nat = !close ? t('na.between') : isInt ? t('na.bright', { k: Math.round(near) }) : t('na.dark', { k: Math.floor(near) });
    return el('tr', {}, [td(num(r.x, 1)),
      cell(st, r, 'd', d, 2, relTol(d, 0.01, 0.006), 'fb.deltaOk', 'fb.deltaWrong'),
      cell(st, r, 'p', p, 2, 0.02, 'fb.ratioOk', 'fb.ratioWrong', !calcDone(r, 'd')),
      td(calcDone(r, 'p') ? nat : '—')]);
  });
}

/* ---------- Tab 3 ---------- */
function buildCoherence() {
  const st = S.coherence;
  controlsBody.append(seg(st, 'ctl.mode', 'mode', ['laser', 'cover', 'lamps', 'colors', 'white', 'filters'].map((v) => ({ value: v, labelKey: `co.${v}` }))),
    hint('hint.coherence'), resetBtn('coherence'));
  ui.dl = el('dl', { class: 'meas' }); measuresBody.append(ui.dl);
}
function updateCoherence() {
  const st = S.coherence;
  measRows(ui.dl, [[t('m.fringes'), t(['laser', 'colors', 'white'].includes(st.mode) ? 'co.yes' : 'co.no')], [t('m.sources'), t(`co.${st.mode}Src`)]]);
}

/* ---------- Tab 4 ---------- */
function buildMedium() {
  const st = S.medium;
  controlsBody.append(seg(st, 'ctl.n', 'n', [1, 1.33, 1.5].map((v) => ({ value: v, labelKey: `n.${String(v).replace('.', '_')}` })), () => { st.n = Number(st.n); }),
    btnRow(recordBtn(() => { st.rows.push({ n: st.n }); st.fb = null; refresh(); })), hint('hint.medium'), resetBtn('medium'));
  tableBlock(st);
}
function updateMedium() {
  const st = S.medium;
  measRows(ui.dl, [[t('m.lam'), qty(MED.lam, 0, 'nm')], [t('m.n'), num(st.n, 2)], [t('m.i0'), qty(interfringe(MED.lam, MED.D, MED.a), 2, 'mm')]]);
  renderTable(st, st.rows, ['col.n', 'col.lamN', 'col.iN'], (r) => {
    const ln = MED.lam / r.n, i = interfringe(ln, MED.D, MED.a);
    return el('tr', {}, [td(num(r.n, 2)),
      cell(st, r, 'l', ln, 0, relTol(ln, 0.01, 0.6), 'fb.lamNOk', 'fb.lamNWrong'),
      cell(st, r, 'i', i, 2, relTol(i, 0.01, 0.006), 'fb.iNOk', 'fb.iNWrong', !calcDone(r, 'l'))]);
  });
}

/* ---------- Tab switching ---------- */
function buildTab(id) {
  controlsBody.replaceChildren();
  measuresBody.replaceChildren();
  ui = {};
  tableSig = '';
  ({ young: buildYoung, path: buildPath, coherence: buildCoherence, medium: buildMedium })[id]();
  shell?.refreshActivity();
  refresh();
}
function updateMeasures() {
  if (!shell || !ui.dl) return;
  ({ young: updateYoung, path: updatePath, coherence: updateCoherence, medium: updateMedium })[shell.tab]();
}
function refresh() { updateMeasures(); requestDraw(); }
function resetTab(id) { S[id] = initialState(id); buildTab(id); }
onLangChange(() => { if (shell) buildTab(shell.tab); });

shell = initSim({
  strings,
  tabs: TABS.map((id) => ({ id, labelKey: `tab.${id}` })),
  initialTab: 'young',
  onTab: buildTab,
  gsOnly: 'ui.gsOnlyYear',
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, young, pathDelta, interfringe };
