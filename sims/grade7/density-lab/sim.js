// Grade 7 — Density and relative density (Ch.3, Act. 6–8)
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, getLang, onLangChange } from '../../../shared/i18n.js';
import { num, qty } from '../../../shared/format.js';
import { createSlider, createButton, createSegmented, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, font } from '../../../shared/draw.js';
import { DENSITY } from '../../../shared/materials.js';
import { drawDigitalBalance, drawGradCylinder } from '../../../shared/lab-draw.js';
import { createGraph, niceMax } from '../../../shared/graph.js';

/* ================================================================
   Data
   ================================================================ */
const RHO = { ...DENSITY, plasticine: 1.5 }; // owner decision: plasticine 1.5 g/cm³
const SOLIDS = ['plasticine', 'aluminium', 'iron', 'copper', 'lead'];
const MYSTERY = ['aluminium', 'iron', 'copper', 'silver', 'lead', 'gold'];
const LIQUIDS = ['water', 'oil', 'alcohol'];
// Table 1 order (book p.32), glycerin left out (EN book only)
const TABLE = ['osmium', 'platinum', 'gold', 'lead', 'silver', 'copper', 'iron', 'aluminium', 'ice', 'wood', 'mercury', 'water', 'benzene', 'oil', 'alcohol'];
const CYL_EMPTY = 112.4; // g, empty graduated cylinder (liquid tab)
const V1 = 50; // mL of water in the cylinder for immersion
const SERIES = { plasticine: '--s1', aluminium: '--s2', iron: '--s3', copper: '--s4', lead: '--s5', water: '--s2', oil: '--s4', alcohol: '--s6' };
const COLOR = { plasticine: '--plasticine', aluminium: '--alu', iron: '--metal', copper: '--copper', lead: '--lead', silver: '--silver', gold: '--gold', mystery: '--stone' };

const round1 = (x) => Math.round(x * 10) / 10;
const massOfPiece = (sub, V) => round1(RHO[sub] * V);
const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const lcName = (key) => { const s = t(`sub.${key}`); return s.charAt(0).toLocaleLowerCase(getLang()) + s.slice(1); };

/* ================================================================
   State
   ================================================================ */
function newPiece(sub, V) { return { sub, V, where: 'bench', m: null, V2: null }; }
function initialState() {
  return {
    solid: { piece: newPiece('plasticine', 30), rows: [], fb: null },
    liquid: { liquid: 'water', V: 50, filled: false, m1: null, rows: [], fb: null },
    rd: { choice: {}, checked: false, showRd: false, fb: null },
    mystery: { piece: newPiece('copper', 12), secret: 'copper', answer: null, ok: 0, total: 0, fb: null },
  };
}
let S = initialState();
function newMysteryPiece() {
  const st = S.mystery;
  let sub;
  do { sub = MYSTERY[randInt(0, MYSTERY.length - 1)]; } while (sub === st.secret && Math.random() < 0.8);
  st.secret = sub;
  st.piece = newPiece(sub, randInt(6, 30));
  st.answer = null;
  st.fb = null;
}
newMysteryPiece();

/* ================================================================
   Canvas
   ================================================================ */
const SCENE = { w: 600, h: 380 };
const BENCH = 346;
const BAL = { cx: 170, plateY: 232 };
const CYL = { cx: 470, yb: BENCH, w: 58, perML: 2.6, capacity: 100, minor: 2, major: 10, label: 10 };
const LCYL = { w: 48, perML: 1.6, capacity: 100, minor: 2, major: 10, label: 20 };

let shell;
let drawQueued = false;
const canvas = document.getElementById('stage');
const view = setupCanvas(canvas, { width: SCENE.w, height: SCENE.h, maxHeightVh: () => (window.innerWidth < 880 ? 44 : 70), onResize: () => requestDraw() });
function requestDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; draw(); });
}
onThemeChange(() => requestDraw());

const graphCard = document.getElementById('graph-card');
const graphHint = document.getElementById('graph-hint');
const graph = createGraph(document.getElementById('graph'), { width: 360, height: 230, maxHeightVh: 36 });

function draw() {
  const ctx = view.begin();
  if (!shell) return;
  if (shell.tab === 'rd') { drawChart(ctx); return; }
  ctx.fillStyle = cssVar('--bench');
  ctx.fillRect(0, BENCH, SCENE.w, SCENE.h - BENCH);
  if (shell.tab === 'liquid') drawLiquidScene(ctx);
  else drawSolidScene(ctx, shell.tab === 'mystery' ? S.mystery.piece : S.solid.piece, shell.tab === 'mystery');
  if (DEBUG) {
    ctx.fillStyle = 'red'; ctx.font = font(11); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    const p = shell.tab === 'mystery' ? S.mystery.piece : S.solid.piece;
    ctx.fillText(shell.tab === 'liquid' ? `m=${num(massOfLiquid(), 1)} V=${S.liquid.V}` : `${p.sub} V=${p.V} m=${massOfPiece(p.sub, p.V)} rho=${RHO[p.sub]}`, 6, 6);
  }
}

/* ---------- Pieces ---------- */
function pieceSize(p) {
  const s = 11.5 * Math.cbrt(p.V);
  return p.sub === 'plasticine' ? { w: s * 0.62, h: s * 1.55 } : { w: s * 1.12, h: s * 0.82 };
}
function drawPiece(ctx, p, cx, yb, hidden) {
  const { w, h } = pieceSize(p);
  const key = hidden ? 'mystery' : p.sub;
  ctx.fillStyle = cssVar(COLOR[key]);
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 1.2;
  roundRect(ctx, cx - w / 2, yb - h, w, h, p.sub === 'plasticine' && !hidden ? w / 2.4 : 3);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillRect(cx - w / 2 + 3, yb - h + 3, Math.max(2, w * 0.14), h - 6);
  if (hidden) {
    ctx.fillStyle = '#ffffff';
    ctx.font = font(Math.min(20, h * 0.8), 800);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', cx, yb - h / 2 + 1);
  }
}

function drawSolidScene(ctx, p, hidden) {
  const shown = p.where === 'balance' ? massOfPiece(p.sub, p.V) : 0;
  drawDigitalBalance(ctx, { cx: BAL.cx, plateY: BAL.plateY, bench: BENCH, value: shown, zeroLabel: t('dev.zero') });
  if (p.where === 'balance') drawPiece(ctx, p, BAL.cx, BAL.plateY, hidden);
  const inCyl = p.where === 'cylinder';
  drawGradCylinder(ctx, {
    ...CYL, V: V1 + (inCyl ? p.V : 0), color: cssVar('--water'), colorDark: cssVar('--water-dark'),
    behind: (yOfV) => { if (inCyl) drawPiece(ctx, p, CYL.cx, yOfV(0) - 1, hidden); },
  });
  if (p.where === 'bench') drawPiece(ctx, p, 330, BENCH, hidden);
  // reading label next to the cylinder
  const V = V1 + (inCyl ? p.V : 0);
  ctx.fillStyle = cssVar('--text');
  ctx.font = font(14, 700);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(qty(V, 0, 'mL'), CYL.cx + CYL.w / 2 + 10, BENCH - 8 - V * CYL.perML);
}

function massOfLiquid() { return S.liquid.filled ? round1(RHO[S.liquid.liquid] * S.liquid.V) : 0; }
function liquidColors(l) {
  if (l === 'oil') return [cssVar('--oil'), cssVar('--oil-dark')];
  if (l === 'alcohol') return [cssVar('--alcohol'), cssVar('--glass-stroke')];
  return [cssVar('--water'), cssVar('--water-dark')];
}
function drawLiquidScene(ctx) {
  const st = S.liquid;
  const cx = 300, plateY = 232;
  drawDigitalBalance(ctx, { cx, plateY, bench: BENCH, value: round1(CYL_EMPTY + massOfLiquid()), zeroLabel: t('dev.zero') });
  const [c, cd] = liquidColors(st.liquid);
  drawGradCylinder(ctx, { ...LCYL, cx, yb: plateY, V: st.filled ? st.V : 0, color: c, colorDark: cd });
  if (st.filled) {
    ctx.fillStyle = cssVar('--text');
    ctx.font = font(14, 700);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(qty(st.V, 0, 'mL'), cx + LCYL.w / 2 + 10, plateY - 8 - st.V * LCYL.perML);
  }
}

/* ---------- Relative density chart (Table 1) ---------- */
function drawChart(ctx) {
  const st = S.rd;
  const L = 112, R = 560, top = 14, rowH = 23.4;
  const xMax = 24;
  const X = (v) => L + (v / xMax) * (R - L);
  ctx.font = font(12);
  ctx.textBaseline = 'middle';
  // grid
  ctx.strokeStyle = cssVar('--border');
  ctx.fillStyle = cssVar('--muted');
  ctx.lineWidth = 1;
  ctx.textAlign = 'center';
  for (let v = 0; v <= xMax; v += 4) {
    ctx.beginPath(); ctx.moveTo(X(v), top); ctx.lineTo(X(v), top + rowH * TABLE.length); ctx.stroke();
    ctx.fillText(num(v), X(v), top + rowH * TABLE.length + 10);
  }
  ctx.fillText('ρ (g/cm³)', (L + R) / 2, top + rowH * TABLE.length + 28);
  TABLE.forEach((key, i) => {
    const y = top + rowH * i + rowH / 2;
    const rho = RHO[key];
    let col = cssVar('--glass-stroke');
    if (key === 'water') col = cssVar('--water');
    else if (st.checked) col = rho > 1 ? cssVar('--accent') : cssVar('--primary');
    ctx.fillStyle = col;
    roundRect(ctx, X(0), y - 7, Math.max(2, X(rho) - X(0)), 14, 3);
    ctx.fill();
    ctx.fillStyle = cssVar('--text');
    ctx.textAlign = 'right';
    ctx.fillText(t(`sub.${key}`).replace(' (4 °C)', ''), L - 8, y);
    ctx.textAlign = 'left';
    ctx.fillText(num(rho, rho < 1 ? 2 : 1), X(rho) + 5, y);
  });
  // water line
  ctx.strokeStyle = cssVar('--water-dark');
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);
  ctx.beginPath(); ctx.moveTo(X(1), top - 4); ctx.lineTo(X(1), top + rowH * TABLE.length); ctx.stroke();
  ctx.setLineDash([]);
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
const rhoText = (r) => qty(r, 2, 'g/cm³');
const kgText = (r) => qty(Math.round(r * 1000), 0, 'kg/m³');

/* ---------- Moving a piece (solid and mystery tabs) ---------- */
function movePiece(st, where) {
  const p = st.piece;
  p.where = where;
  if (where === 'balance') p.m = massOfPiece(p.sub, p.V);
  if (where === 'cylinder') p.V2 = V1 + p.V;
  if (st.fb && st.fb.type !== 'good') st.fb = null;
  updateMeasures();
  requestDraw();
}
function placeButtons(st) {
  return el('div', { class: 'btn-row' }, [
    createButton({ labelKey: 'ctl.toBalance', onClick: () => movePiece(st, 'balance') }),
    createButton({ labelKey: 'ctl.toCylinder', onClick: () => movePiece(st, 'cylinder') }),
    createButton({ labelKey: 'ctl.toBench', onClick: () => movePiece(st, 'bench'), variant: 'ghost' }),
  ]);
}
function pieceRows(p, hideRho) {
  const measured = p.m != null && p.V2 != null;
  return [
    [t('m.where'), t(`where.${p.where}`)],
    [t('m.mass'), p.m == null ? t('m.notYet') : qty(p.m, 1, 'g')],
    [t('m.V1'), qty(V1, 0, 'mL')],
    [t('m.V2'), p.V2 == null ? t('m.notYet') : qty(p.V2, 0, 'mL')],
    [t('m.V'), p.V2 == null ? t('m.notYet') : qty(p.V2 - V1, 0, 'cm³')],
    [t('m.rho'), hideRho ? '?' : measured ? `${rhoText(p.m / (p.V2 - V1))} = ${kgText(p.m / (p.V2 - V1))}` : t('none')],
  ];
}

/* ---------- Tab: solid ---------- */
function buildSolid() {
  const st = S.solid;
  ui.sub = createSegmented({
    labelKey: 'ctl.substance',
    options: SOLIDS.map((v) => ({ value: v, labelKey: `sub.${v}` })),
    value: st.piece.sub,
    onChange: (v) => { st.piece = newPiece(v, st.piece.V); st.fb = null; updateMeasures(); requestDraw(); },
  });
  ui.size = createSlider({
    labelKey: 'ctl.size', min: 5, max: 40, step: 1, value: st.piece.V, unit: 'cm³', decimals: 0,
    onInput: (v) => { st.piece = newPiece(st.piece.sub, v); st.fb = null; updateMeasures(); requestDraw(); },
  });
  const record = () => {
    const p = st.piece;
    if (p.m == null || p.V2 == null) { st.fb = { type: 'warn', key: 'fb.needBoth' }; updateMeasures(); return; }
    const V = p.V2 - V1, r = p.m / V;
    st.rows.push({ sub: p.sub, m: p.m, V });
    if (st.rows.length > 10) st.rows.shift();
    st.fb = { type: 'good', key: 'fb.recorded', params: { r: num(r, 2), k: num(Math.round(r * 1000)) } };
    updateMeasures();
  };
  controlsBody.append(
    ui.sub.root, ui.size.root, placeButtons(st),
    el('div', { class: 'btn-row', style: 'margin-top:12px' }, [createButton({ labelKey: 'ctl.record', onClick: record, variant: 'primary' })]),
    el('div', { class: 'btn-row', style: 'margin-top:8px' }, [
      createButton({ labelKey: 'ui.reset', onClick: () => resetTab('solid'), variant: 'ghost' }),
    ]),
  );
  ui.dl = el('dl', { class: 'meas' });
  ui.table = el('table', { class: 'data' });
  ui.status = statusBox();
  ui.clear = createButton({ labelKey: 'ctl.clearTable', onClick: () => { st.rows = []; st.fb = null; updateMeasures(); }, variant: 'ghost' });
  ui.clearRow = el('div', { class: 'btn-row', style: 'margin-top:8px' }, [ui.clear]);
  measuresBody.append(ui.dl, ui.table, ui.clearRow, ui.status);
}

function rowsTable(rows, nameOf) {
  const head = el('tr', {}, [el('th', {}, t('col.substance')), el('th', {}, 'm (g)'), el('th', {}, 'V (cm³)'), el('th', {}, 'm/V (g/cm³)')]);
  const body = rows.map((r) => el('tr', {}, [el('td', {}, nameOf(r)), el('td', {}, num(r.m, 1)), el('td', {}, num(r.V)), el('td', {}, num(r.m / r.V, 2))]));
  ui.table.replaceChildren(el('thead', {}, head), el('tbody', {}, body));
  ui.table.hidden = rows.length === 0;
  if (ui.clearRow) ui.clearRow.hidden = ui.table.hidden;
}

function drawGraph(rows, keyOf, xMaxDefault) {
  const groups = new Map();
  for (const r of rows) {
    const k = keyOf(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push([r.V, r.m]);
  }
  const maxV = Math.max(xMaxDefault, ...rows.map((r) => r.V));
  const maxM = Math.max(10, ...rows.map((r) => r.m));
  const series = [...groups.entries()].map(([k, pts]) => ({ color: cssVar(SERIES[k]), points: pts, slope: pts.length >= 2 ? RHO[k] : null }));
  graph.draw({ xLabel: t('graph.x'), yLabel: t('graph.y'), xMax: niceMax(maxV), yMax: niceMax(maxM * 1.05), series });
  // legend + hint
  const legend = [...groups.keys()].map((k) => el('span', { class: 'legend-item' }, [el('span', { class: 'legend-dot', style: `background:${cssVar(SERIES[k])}` }), k === 'water' ? t('liq.water') : t(`sub.${k}`)]));
  ui.legend.replaceChildren(...legend);
  graphHint.hidden = [...groups.values()].some((p) => p.length >= 2);
}

function updateSolid() {
  const st = S.solid;
  measRows(ui.dl, pieceRows(st.piece, false));
  rowsTable(st.rows, (r) => t(`sub.${r.sub}`));
  drawGraph(st.rows, (r) => r.sub, 40);
  ui.sub.set(st.piece.sub);
  showStatus(ui.status, st.fb);
}

/* ---------- Tab: liquid ---------- */
function buildLiquid() {
  const st = S.liquid;
  ui.liq = createSegmented({
    labelKey: 'ctl.liquid',
    options: LIQUIDS.map((v) => ({ value: v, labelKey: v === 'water' ? 'liq.water' : `sub.${v}` })),
    value: st.liquid,
    onChange: (v) => { if (st.filled) { ui.liq.set(st.liquid); return; } st.liquid = v; st.fb = null; updateMeasures(); requestDraw(); },
  });
  ui.vol = createSlider({
    labelKey: 'ctl.volume', min: 10, max: 100, step: 1, value: st.V, unit: 'mL', decimals: 0,
    onInput: (v) => { st.V = v; updateMeasures(); requestDraw(); },
  });
  ui.recM1 = createButton({ labelKey: 'ctl.recordM1', onClick: () => {
    if (st.filled) st.fb = { type: 'warn', key: 'fb.emptyFirst' };
    else { st.m1 = CYL_EMPTY; st.fb = { type: 'good', key: 'fb.m1Saved', params: { v: num(st.m1, 1) } }; }
    updateMeasures();
  }, variant: 'primary' });
  ui.pour = createButton({ labelKey: 'ctl.pour', onClick: () => { st.filled = true; st.fb = null; updateMeasures(); requestDraw(); }, variant: 'primary' });
  ui.empty = createButton({ labelKey: 'ctl.empty', onClick: () => { st.filled = false; st.fb = null; updateMeasures(); requestDraw(); } });
  ui.recM2 = createButton({ labelKey: 'ctl.recordM2', onClick: () => {
    if (st.m1 == null) st.fb = { type: 'warn', key: 'fb.needM1' };
    else if (!st.filled) st.fb = { type: 'warn', key: 'fb.needLiquid' };
    else {
      const m2 = round1(CYL_EMPTY + massOfLiquid());
      const m = round1(m2 - st.m1);
      st.rows.push({ sub: st.liquid, m, V: st.V, m1: st.m1, m2 });
      if (st.rows.length > 10) st.rows.shift();
      st.fb = { type: 'good', key: 'fb.m2Saved', params: { m: num(m, 1), v: num(st.V), r: num(m / st.V, 2) } };
    }
    updateMeasures();
  }, variant: 'primary' });
  controlsBody.append(
    ui.liq.root, ui.vol.root,
    el('div', { class: 'btn-row' }, [ui.recM1, ui.pour, ui.empty, ui.recM2]),
    el('div', { class: 'btn-row', style: 'margin-top:8px' }, [
      createButton({ labelKey: 'ui.reset', onClick: () => resetTab('liquid'), variant: 'ghost' }),
    ]),
  );
  ui.dl = el('dl', { class: 'meas' });
  ui.table = el('table', { class: 'data' });
  ui.status = statusBox();
  ui.clear = createButton({ labelKey: 'ctl.clearTable', onClick: () => { st.rows = []; st.fb = null; updateMeasures(); }, variant: 'ghost' });
  ui.clearRow = el('div', { class: 'btn-row', style: 'margin-top:8px' }, [ui.clear]);
  measuresBody.append(ui.dl, ui.table, ui.clearRow, ui.status);
}

function updateLiquid() {
  const st = S.liquid;
  const reading = round1(CYL_EMPTY + massOfLiquid());
  measRows(ui.dl, [
    [t('m.reading'), qty(reading, 1, 'g')],
    [t('m.m1'), st.m1 == null ? t('m.notYet') : qty(st.m1, 1, 'g')],
    [t('m.Vliq'), st.filled ? qty(st.V, 0, 'cm³') : t('none')],
  ]);
  const nameOf = (r) => (r.sub === 'water' ? t('liq.water') : t(`sub.${r.sub}`));
  const head = el('tr', {}, [el('th', {}, t('col.substance')), el('th', {}, 'm2 − m1 (g)'), el('th', {}, 'V (cm³)'), el('th', {}, 'ρ (g/cm³)')]);
  const body = st.rows.map((r) => el('tr', {}, [el('td', {}, nameOf(r)), el('td', {}, `${num(r.m2, 1)} − ${num(r.m1, 1)} = ${num(r.m, 1)}`), el('td', {}, num(r.V)), el('td', {}, num(r.m / r.V, 2))]));
  ui.table.replaceChildren(el('thead', {}, head), el('tbody', {}, body));
  ui.table.hidden = st.rows.length === 0;
  if (ui.clearRow) ui.clearRow.hidden = ui.table.hidden;
  drawGraph(st.rows, (r) => r.sub, 100);
  ui.liq.set(st.liquid);
  ui.liq.setDisabled(st.filled);
  ui.vol.setDisabled(st.filled);
  ui.recM1.disabled = st.filled;
  ui.pour.hidden = st.filled;
  ui.empty.hidden = !st.filled;
  ui.recM2.disabled = !st.filled;
  showStatus(ui.status, st.fb);
}

/* ---------- Tab: relative density (classification) ---------- */
function buildRd() {
  const st = S.rd;
  const list = el('div', { class: 'classify' });
  ui.rows = {};
  for (const key of TABLE) {
    const rho = RHO[key];
    const name = el('div', { class: 'cl-name' }, [el('strong', {}, t(`sub.${key}`)), el('span', { class: 'muted' }, ` ${qty(rho, rho < 1 ? 2 : 1, 'g/cm³')} = ${qty(Math.round(rho * 1000), 0, 'kg/m³')}`)]);
    const mark = el('span', { class: 'cl-mark' });
    let seg = null;
    if (key === 'water') {
      list.append(el('div', { class: 'cl-row' }, [name, el('div', { class: 'muted', style: 'font-size:0.9rem' }, t('ctl.reference'))]));
    } else {
      seg = createSegmented({
        options: [{ value: 'd', labelKey: 'ctl.denser' }, { value: 'l', labelKey: 'ctl.lessDense' }],
        value: st.choice[key] ?? '',
        onChange: (v) => { st.choice[key] = v; st.checked = false; st.fb = null; updateMeasures(); requestDraw(); },
      });
      list.append(el('div', { class: 'cl-row' }, [el('div', { class: 'cl-head' }, [name, mark]), seg.root]));
    }
    ui.rows[key] = { seg, mark };
  }
  ui.showRd = createButton({ labelKey: st.showRd ? 'ctl.hideRd' : 'ctl.showRd', onClick: () => {
    st.showRd = !st.showRd;
    ui.showRd.dataset.i18n = st.showRd ? 'ctl.hideRd' : 'ctl.showRd';
    ui.showRd.textContent = t(ui.showRd.dataset.i18n);
    updateMeasures();
  } });
  const check = () => {
    const keys = TABLE.filter((k) => k !== 'water');
    if (keys.some((k) => !st.choice[k])) { st.fb = { type: 'warn', key: 'fb.classMissing' }; updateMeasures(); return; }
    const n = keys.filter((k) => st.choice[k] === (RHO[k] > 1 ? 'd' : 'l')).length;
    st.checked = true;
    st.fb = n === keys.length ? { type: 'good', key: 'fb.classOk' } : { type: 'bad', key: 'fb.classSome', params: { n, t: keys.length } };
    updateMeasures();
    requestDraw();
  };
  controlsBody.append(
    list,
    el('div', { class: 'btn-row', style: 'margin-top:12px' }, [createButton({ labelKey: 'ctl.check', onClick: check, variant: 'primary' }), ui.showRd]),
    el('div', { class: 'btn-row', style: 'margin-top:8px' }, [createButton({ labelKey: 'ui.reset', onClick: () => resetTab('rd'), variant: 'ghost' })]),
  );
  ui.dl = el('dl', { class: 'meas' });
  ui.table = el('table', { class: 'data' });
  ui.status = statusBox();
  measuresBody.append(ui.dl, ui.table, ui.status);
}

function updateRd() {
  const st = S.rd;
  const keys = TABLE.filter((k) => k !== 'water');
  const n = keys.filter((k) => st.choice[k] === (RHO[k] > 1 ? 'd' : 'l')).length;
  measRows(ui.dl, [[t('m.classified'), st.checked ? `${n} / ${keys.length}` : t('none')]]);
  for (const k of keys) {
    const { seg, mark } = ui.rows[k];
    seg.set(st.choice[k] ?? '');
    const ok = st.choice[k] === (RHO[k] > 1 ? 'd' : 'l');
    mark.textContent = st.checked ? (ok ? '✓' : '✗') : '';
    mark.className = `cl-mark ${st.checked ? (ok ? 'good-text' : 'bad-text') : ''}`;
  }
  if (st.showRd) {
    const head = el('tr', {}, [el('th', {}, t('col.substance')), el('th', {}, 'ρ (g/cm³)'), el('th', {}, t('col.rd'))]);
    const body = TABLE.map((k) => el('tr', {}, [el('td', {}, t(`sub.${k}`)), el('td', {}, num(RHO[k], RHO[k] < 1 ? 2 : 1)), el('td', {}, `${num(RHO[k], RHO[k] < 1 ? 2 : 1)} / 1 = ${num(RHO[k], RHO[k] < 1 ? 2 : 1)}`)]));
    ui.table.replaceChildren(el('thead', {}, head), el('tbody', {}, body));
  }
  ui.table.hidden = !st.showRd;
  if (ui.clearRow) ui.clearRow.hidden = ui.table.hidden;
  showStatus(ui.status, st.fb);
}

/* ---------- Tab: unknown substance ---------- */
function buildMystery() {
  const st = S.mystery;
  ui.answer = createSegmented({
    labelKey: 'ctl.yourAnswer',
    options: MYSTERY.map((v) => ({ value: v, labelKey: `sub.${v}` })),
    value: st.answer ?? '',
    onChange: (v) => { st.answer = v; if (st.fb?.type !== 'good') st.fb = null; updateMeasures(); },
  });
  const check = () => {
    const p = st.piece;
    if (p.m == null || p.V2 == null) { st.fb = { type: 'warn', key: 'fb.measureFirst' }; updateMeasures(); return; }
    if (!st.answer) return;
    st.total += 1;
    if (st.answer === st.secret) { st.ok += 1; st.fb = { type: 'good', key: 'fb.correct', params: { r: num(RHO[st.secret], 1), s: lcName(st.secret) } }; }
    else st.fb = { type: 'bad', key: 'fb.wrong' };
    updateMeasures();
  };
  controlsBody.append(
    placeButtons(st),
    el('div', { style: 'margin-top:12px' }, ui.answer.root),
    el('div', { class: 'btn-row' }, [
      createButton({ labelKey: 'ctl.check', onClick: check, variant: 'primary' }),
      createButton({ labelKey: 'ctl.newPiece', onClick: () => { newMysteryPiece(); updateMeasures(); requestDraw(); } }),
      createButton({ labelKey: 'ctl.showAnswer', onClick: () => { st.fb = { type: 'warn', key: 'fb.answer', params: { s: lcName(st.secret), r: num(RHO[st.secret], 1) } }; updateMeasures(); }, variant: 'ghost' }),
    ]),
    el('div', { class: 'btn-row', style: 'margin-top:8px' }, [createButton({ labelKey: 'ui.reset', onClick: () => resetTab('mystery'), variant: 'ghost' })]),
  );
  ui.dl = el('dl', { class: 'meas' });
  ui.status = statusBox();
  measuresBody.append(ui.dl, ui.status);
}

function updateMystery() {
  const st = S.mystery;
  const rows = pieceRows(st.piece, true);
  rows.push([t('m.score'), `${st.ok} / ${st.total}`]);
  measRows(ui.dl, rows);
  ui.answer.set(st.answer ?? '');
  showStatus(ui.status, st.fb);
}

/* ---------- Tab switching / reset ---------- */
function buildTab(id) {
  controlsBody.replaceChildren();
  measuresBody.replaceChildren();
  ui = { legend: document.getElementById('graph-legend') };
  graphCard.hidden = !(id === 'solid' || id === 'liquid');
  if (id === 'solid') buildSolid();
  else if (id === 'liquid') buildLiquid();
  else if (id === 'rd') buildRd();
  else buildMystery();
  view.setLogicalSize(SCENE.w, id === 'rd' ? 400 : SCENE.h);
  updateMeasures();
  requestDraw();
}

function updateMeasures() {
  if (!shell) return;
  if (shell.tab === 'solid') updateSolid();
  else if (shell.tab === 'liquid') updateLiquid();
  else if (shell.tab === 'rd') updateRd();
  else updateMystery();
}

function resetTab(id) {
  const fresh = initialState();
  S[id] = fresh[id];
  if (id === 'mystery') newMysteryPiece();
  buildTab(id);
}

onLangChange(() => { if (shell) buildTab(shell.tab); });

shell = initSim({
  strings,
  tabs: [
    { id: 'solid', labelKey: 'tab.solid' },
    { id: 'liquid', labelKey: 'tab.liquid' },
    { id: 'rd', labelKey: 'tab.rd' },
    { id: 'mystery', labelKey: 'tab.mystery' },
  ],
  initialTab: 'solid',
  onTab: buildTab,
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, RHO, massOfPiece, massOfLiquid };
