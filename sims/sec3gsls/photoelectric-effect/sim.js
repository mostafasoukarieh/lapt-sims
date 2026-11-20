// Sec 3 GS-LS — Chapter 16: Corpuscular aspect of light – Photoelectric effect (whole chapter, SG and SV).
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num, qty } from '../../../shared/format.js';
import { createButton, createSegmented, createSlider, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, arrow } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { label } from '../../../shared/figures.js';
import { calcCell, calcSig, calcDone } from '../../../shared/calc-cell.js';
import { lambdaCSS } from '../../../shared/wave-optics.js';

const TAU = 2 * Math.PI;
const W = 600;
const TABS = ['hallwachs', 'threshold', 'einstein', 'duality'];
const HEIGHTS = { hallwachs: 420, threshold: 420, einstein: 430, duality: 420 };
// constants as in the book's exercises
const H = 6.6e-34, C0 = 3e8, E1 = 1.6e-19, ME = 9.1e-31;
// Table 16.1: threshold wavelengths (µm); Table 16.2: work functions (eV)
const T161 = { Cs: 0.66, K: 0.55, Ca: 0.45, Zn: 0.37, Cu: 0.29, Ag: 0.27, Pt: 0.19 };
// Rb left out: its value is not legible the same way in the two books (2.13 / 2,18).
const T162 = { Li: 2.39, Cs: 1.89, K: 2.15, Na: 2.27, Zn: 4.31, X: 3.4, Wt: 4.5 }; // X: metal of Application 16.2; Wt: tungsten (exercise)
const eV = (nm) => (H * C0) / (nm * 1e-9) / E1 + 1e-9; // + 1e-9: 4.125 shown as 4.13, as in the book

function initialState(tab) {
  switch (tab) {
    case 'hallwachs': return { lamp: 'uv', on: false, a: 34, t: 0, tOn: 0 };
    case 'threshold': return { metal: 'Zn', lam: 300, inten: 50, on: true, ph: [], el: [], count: 0, t: 0, rows: [], fb: null };
    case 'einstein': return { metal: 'X', lam: 300, rows: [], fb: null };
    default: return { ph: 'diffraction' };
  }
}
let S = Object.fromEntries(TABS.map((k) => [k, initialState(k)]));

/* ================================================================
   Canvas and loop
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
let rnd = 12345;
const rand = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);

const loop = createLoop({
  step(dt) {
    if (!shell) return false;
    const tab = shell.tab, st = S[tab];
    if (tab === 'hallwachs') {
      st.t += dt;
      if (st.on) st.tOn += dt;
      if (st.on && st.lamp === 'uv') st.a = Math.max(0, st.a - 40 * dt); // almost instantaneous
      return true;
    }
    if (tab === 'threshold') {
      st.t += dt;
      // photons: emitted from the lamp at a rate ∝ intensity, travel to the plate
      if (st.on) {
        const rate = st.inten * 0.6;
        if (rand() < rate * dt) st.ph.push({ x: 126, y: 104 + rand() * 12, vx: 300, vy: 20 + rand() * 150 });
      }
      for (const p of st.ph) { p.x += p.vx * dt; p.y += p.vy * dt; }
      const hit = st.ph.filter((p) => p.x >= 300);
      st.ph = st.ph.filter((p) => p.x < 300);
      const ok = st.lam <= T161[st.metal] * 1000;
      const Ek = eV(st.lam) - (H * C0) / (T161[st.metal] * 1e-6) / E1;
      for (const p of hit) {
        if (!ok) continue;
        const sp = 40 + 70 * Math.sqrt(Math.max(0, Ek)) * (0.6 + 0.4 * rand());
        const a = Math.PI + (rand() - 0.5) * 1.6;
        st.el.push({ x: 298, y: p.y, vx: sp * Math.cos(a), vy: sp * Math.sin(a), life: 1.4 });
        st.count += 1;
      }
      for (const e of st.el) { e.x += e.vx * dt; e.y += e.vy * dt; e.life -= dt; }
      st.el = st.el.filter((e) => e.life > 0);
      return true;
    }
    return false;
  },
  render() { draw(); updateMeasures(); },
});

/* ================================================================
   Drawing
   ================================================================ */
const ink = (ctx, w = 2) => { ctx.strokeStyle = cssVar('--text'); ctx.fillStyle = cssVar('--text'); ctx.lineWidth = w; };
function note(ctx, key, x, y, align = 'center', params) { label(ctx, t(key, params), x, y, { size: 12, weight: 600, color: cssVar('--muted'), align }); }
// colour of a radiation (UV and IR shown in grey-violet / dark red)
const radColor = (nm, a = 1) => (nm < 380 ? `rgba(150,90,220,${a})` : nm > 780 ? `rgba(140,30,30,${a})` : lambdaCSS(nm, a));

function draw() {
  if (!shell) return;
  const tab = shell.tab;
  if (view.height !== HEIGHTS[tab]) view.setLogicalSize(W, HEIGHTS[tab]);
  const ctx = view.begin();
  ctx.fillStyle = cssVar('--scene-bg');
  roundRect(ctx, 0, 0, W, HEIGHTS[tab], 14);
  ctx.fill();
  ({ hallwachs: drawHallwachs, threshold: drawThreshold, einstein: drawEinstein, duality: drawDuality })[tab](ctx, S[tab]);
}

/* ---------- Tab 1: Hallwachs' experiment (16.1 a) ---------- */
function drawHallwachs(ctx, st) {
  const x = 380, top = 130, bot = 360, piv = 230, leaf = 80;
  // glass box and stem
  ctx.fillStyle = cssVar('--glass-fill'); ctx.strokeStyle = cssVar('--glass-stroke'); ctx.lineWidth = 2.5;
  roundRect(ctx, x - 90, top + 40, 180, bot - top - 40, 10); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = cssVar('--brass'); ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, piv + 4); ctx.stroke();
  // zinc plate on the platform
  ctx.fillStyle = '#b8c2cc'; ctx.strokeStyle = '#6c7884'; ctx.lineWidth = 1.5;
  ctx.fillRect(x - 70, top - 10, 140, 10); ctx.strokeRect(x - 70, top - 10, 140, 10);
  label(ctx, t('hw.zinc'), x + 100, top - 5, { size: 11, weight: 700, align: 'left' });
  // charges on the plate
  const n = Math.round((st.a / 34) * 8);
  for (let k = 0; k < n; k++) label(ctx, '−', x - 60 + k * 17, top - 20, { size: 14, weight: 800, color: cssVar('--minus') });
  // leaves
  const a = (st.a * Math.PI) / 180;
  ctx.fillStyle = cssVar('--leaf'); ctx.strokeStyle = cssVar('--brass-dark'); ctx.lineWidth = 1;
  for (const s of [-1, 1]) {
    const tx = x + s * leaf * Math.sin(a), ty = piv + leaf * Math.cos(a);
    ctx.beginPath(); ctx.moveTo(x, piv); ctx.lineTo(x + s * 4, piv + 3); ctx.lineTo(tx + s * 4, ty); ctx.lineTo(tx, ty); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  // lamp
  const lx = 70, ly = 60;
  ctx.fillStyle = cssVar('--metal'); roundRect(ctx, lx - 40, ly - 22, 80, 44, 8); ctx.fill();
  label(ctx, t(st.lamp === 'vis' ? 'hw.visLamp' : 'hw.uvLamp'), lx, ly, { size: 11, weight: 800, color: '#fff', halo: false });
  if (st.on) {
    const col = st.lamp === 'vis' ? 'rgba(255,220,90,0.35)' : 'rgba(150,90,220,0.35)';
    const stopX = st.lamp === 'glass' ? 200 : x - 70;
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(lx + 40, ly - 14); ctx.lineTo(stopX, top - 30); ctx.lineTo(stopX + (st.lamp === 'glass' ? 0 : 140), top - 12); ctx.lineTo(lx + 40, ly + 14); ctx.closePath(); ctx.fill();
  }
  if (st.lamp === 'glass') { ctx.fillStyle = 'rgba(160,210,240,0.6)'; ctx.fillRect(196, 40, 8, 110); label(ctx, t('hw.glass'), 200, 30, { size: 11, weight: 700 }); }
  // electrons leaving the plate
  if (st.on && st.lamp === 'uv' && st.a > 0.5) {
    for (let k = 0; k < 6; k++) {
      const u = ((st.t * 1.5 + k / 6) % 1);
      ctx.fillStyle = cssVar('--minus'); ctx.beginPath(); ctx.arc(x - 50 + k * 20, top - 14 - u * 60, 3.5, 0, TAU); ctx.fill();
    }
    label(ctx, t('hw.electrons'), x + 20, top - 90, { size: 11, weight: 700, color: cssVar('--minus') });
  }
  label(ctx, `${t('hw.leaves')} ${qty(st.a, 0, '°')}`, x, bot + 26, { size: 12, weight: 800 });
}

/* ---------- Tab 2: threshold of photoelectric emission (Table 16.1) ---------- */
function drawThreshold(ctx, st) {
  const nm = st.lam, l0 = T161[st.metal] * 1000, ok = nm <= l0;
  // lamp (monochromatic source)
  ctx.fillStyle = cssVar('--metal'); roundRect(ctx, 40, 80, 80, 60, 8); ctx.fill();
  ctx.fillStyle = radColor(nm); ctx.beginPath(); ctx.arc(120, 110, 7, 0, TAU); ctx.fill();
  label(ctx, qty(nm, 0, 'nm'), 80, 110, { size: 12, weight: 800, color: '#fff', halo: false });
  // metal plate in a vacuum tube
  ctx.strokeStyle = cssVar('--glass-stroke'); ctx.fillStyle = cssVar('--glass-fill'); ctx.lineWidth = 2;
  roundRect(ctx, 180, 40, 380, 300, 40); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#9aa4ae'; ctx.fillRect(300, 120, 14, 200);
  label(ctx, st.metal, 307, 106, { size: 14, weight: 800 });
  // photons
  for (const p of st.ph) {
    ctx.fillStyle = radColor(nm, 0.3); ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, TAU); ctx.fill();
    ctx.fillStyle = radColor(nm); ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, TAU); ctx.fill();
  }
  label(ctx, t('th.photons'), 200, 140, { size: 11, weight: 700, color: radColor(nm) });
  // photoelectrons
  ctx.fillStyle = cssVar('--minus');
  for (const e of st.el) { ctx.globalAlpha = Math.min(1, e.life); ctx.beginPath(); ctx.arc(e.x, e.y, 3, 0, TAU); ctx.fill(); }
  if (st.el.length) label(ctx, t('th.electrons'), 240, 320, { size: 11, weight: 700, color: cssVar('--minus') });
  ctx.globalAlpha = 1;
  label(ctx, t(ok ? 'th.emission' : 'th.none'), 380, 70, { size: 14, weight: 800, color: ok ? cssVar('--good') : cssVar('--bad') });
  label(ctx, `λ0(${st.metal}) = ${qty(T161[st.metal], 2, 'µm')}`, 440, 300, { size: 12, weight: 800 });
  // wavelength scale with the threshold
  const sx0 = 40, sx1 = 560, sy = 370, X = (v) => sx0 + ((v - 150) / 650) * (sx1 - sx0);
  for (let v = 150; v < 800; v += 5) { ctx.fillStyle = radColor(v, v < 380 ? 0.5 : 1); ctx.fillRect(X(v), sy, X(v + 5) - X(v) + 0.5, 14); }
  ink(ctx, 1); ctx.strokeRect(sx0, sy, sx1 - sx0, 14);
  ctx.fillStyle = 'rgba(0,160,80,0.25)'; ctx.fillRect(sx0, sy - 6, X(l0) - sx0, 4);
  ink(ctx, 2); ctx.beginPath(); ctx.moveTo(X(l0), sy - 10); ctx.lineTo(X(l0), sy + 22); ctx.stroke();
  label(ctx, 'λ0', X(l0), sy - 18, { size: 12, weight: 800 });
  ctx.fillStyle = cssVar('--text'); ctx.beginPath(); ctx.moveTo(X(nm), sy + 16); ctx.lineTo(X(nm) - 6, sy + 28); ctx.lineTo(X(nm) + 6, sy + 28); ctx.closePath(); ctx.fill();
  for (const v of [200, 400, 600, 800]) label(ctx, `${v}`, X(v), sy + 40, { size: 10, weight: 600, halo: false });
  label(ctx, 'λ (nm)', sx1, sy - 12, { size: 10, weight: 700, align: 'right', halo: false });
  label(ctx, 'UV', X(250), sy + 7, { size: 10, weight: 800, color: '#fff', halo: false });
}

/* ---------- Tab 3: Einstein's relation, energy diagram ---------- */
function drawEinstein(ctx, st) {
  const E = eV(st.lam), W0 = T162[st.metal], Ek = E - W0;
  const base = 360, k = 55; // px per eV
  const bx = 120, bw = 90;
  // photon energy bar
  ctx.fillStyle = radColor(st.lam, 0.85); ctx.fillRect(bx, base - E * k, bw, E * k);
  label(ctx, `hν = ${qty(E, 2, 'eV')}`, bx + bw / 2, base - E * k - 14, { size: 13, weight: 800 });
  label(ctx, t('ei.photon'), bx + bw / 2, base + 18, { size: 12, weight: 700 });
  // work function and kinetic energy
  const cx = 330;
  ctx.fillStyle = cssVar('--s4'); ctx.fillRect(cx, base - Math.min(E, W0) * k, bw, Math.min(E, W0) * k);
  ctx.strokeStyle = cssVar('--s4'); ctx.setLineDash([5, 4]); ctx.lineWidth = 2; ctx.strokeRect(cx, base - W0 * k, bw, W0 * k); ctx.setLineDash([]);
  label(ctx, `W0 = ${qty(W0, 2, 'eV')}`, cx + bw / 2, base - W0 * k + 16, { size: 12, weight: 800, color: '#fff', halo: false });
  if (Ek > 0) {
    ctx.fillStyle = cssVar('--minus'); ctx.fillRect(cx, base - E * k, bw, Ek * k);
    label(ctx, `${t('sym.Ek')} = ${qty(Ek, 2, 'eV')}`, cx + bw + 12, base - W0 * k - (Ek * k) / 2, { size: 13, weight: 800, align: 'left', color: cssVar('--minus') });
  }
  label(ctx, t('ei.electron'), cx + bw / 2, base + 18, { size: 12, weight: 700 });
  ink(ctx, 1.5); ctx.beginPath(); ctx.moveTo(60, base); ctx.lineTo(560, base); ctx.stroke();
  ctx.strokeStyle = cssVar('--muted'); ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(bx + bw, base - E * k); ctx.lineTo(cx, base - E * k); ctx.stroke(); ctx.setLineDash([]);
  label(ctx, t(Math.abs(Ek) < 0.005 ? 'ei.zero' : Ek > 0 ? 'ei.ejected' : 'ei.notExtracted'), W / 2, 30, { size: 14, weight: 800, color: Ek >= 0 ? cssVar('--good') : cssVar('--bad') });
  label(ctx, `${t(`me.${st.metal}`)} · λ = ${qty(st.lam, 0, 'nm')}`, W / 2, 56, { size: 12, weight: 700, color: cssVar('--muted') });
}

/* ---------- Tab 4: light, wave or particle? (16.3) ---------- */
const PHEN = { diffraction: 'wave', interference: 'wave', polarization: 'wave', photoelectric: 'particle', blackbody: 'particle', electrons: 'deBroglie' };
function drawDuality(ctx, st) {
  const kind = PHEN[st.ph];
  const box = (x, on, key) => {
    ctx.fillStyle = on ? 'rgba(29,138,75,0.16)' : cssVar('--surface'); roundRect(ctx, x, 14, 280, 250, 12); ctx.fill();
    if (on) { ctx.strokeStyle = cssVar('--good'); ctx.lineWidth = 3; roundRect(ctx, x, 14, 280, 250, 12); ctx.stroke(); }
    label(ctx, t(key), x + 140, 38, { size: 13, weight: 800, color: on ? cssVar('--good') : cssVar('--text') });
  };
  box(14, kind === 'wave' || kind === 'deBroglie', 'du.wave');
  box(306, kind === 'particle', 'du.particle');
  // wave: a diffraction pattern; with electrons, the same kind of pattern (Davisson and Germer)
  const ring = kind === 'deBroglie';
  for (let x = 30; x < 280; x += 2) {
    const u = (x - 154) / 12, v = u === 0 ? 1 : (Math.sin(u) / u) ** 2;
    ctx.fillStyle = ring ? `rgba(123,79,184,${Math.pow(v, 0.45)})` : `rgba(230,40,40,${Math.pow(v, 0.45)})`;
    ctx.fillRect(x, 70, 2, 100);
  }
  note(ctx, ring ? 'du.waveNoteE' : 'du.waveNote', 154, 200); note(ctx, 'du.waveNote2', 154, 222);
  // particle: photons absorbed one by one, each gives its energy to one electron
  ctx.fillStyle = '#9aa4ae'; ctx.fillRect(520, 70, 12, 100);
  for (let k = 0; k < 6; k++) { ctx.fillStyle = 'rgba(150,90,220,1)'; ctx.beginPath(); ctx.arc(340 + k * 28, 80 + k * 15, 5, 0, TAU); ctx.fill(); }
  ctx.fillStyle = cssVar('--minus'); for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(505 - k * 18, 100 + k * 25, 4, 0, TAU); ctx.fill(); }
  label(ctx, 'hν', 380, 78, { size: 12, weight: 800, color: 'rgb(150,90,220)' });
  label(ctx, 'e⁻', 470, 160, { size: 12, weight: 800, color: cssVar('--minus') });
  note(ctx, 'du.partNote', 446, 200); note(ctx, 'du.partNote2', 446, 222);
  label(ctx, t(`ph.${st.ph}`), W / 2, 300, { size: 15, weight: 800 });
  label(ctx, t(`du.ans.${st.ph}`), W / 2, 330, { size: 13, weight: 700, color: cssVar('--good') });
  label(ctx, t('du.duality'), W / 2, 380, { size: 12, weight: 700, color: cssVar('--muted') });
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

/* ---------- Tab 1 ---------- */
function buildHallwachs() {
  const st = S.hallwachs;
  const again = () => Object.assign(st, { on: false, a: 34, tOn: 0 });
  ui.on = createButton({ labelKey: 'ctl.lampOn', variant: 'primary', onClick: () => { st.on = !st.on; refresh(); } });
  controlsBody.append(
    seg(st, 'ctl.lamp', 'lamp', [{ value: 'uv', labelKey: 'hw.uv' }, { value: 'glass', labelKey: 'hw.uvGlass' }, { value: 'vis', labelKey: 'hw.vis' }], again),
    btnRow(ui.on, createButton({ labelKey: 'ctl.recharge', variant: 'ghost', onClick: () => { again(); refresh(); } })), hint('hint.hallwachs'), resetBtn('hallwachs'));
  ui.dl = el('dl', { class: 'meas' }); measuresBody.append(ui.dl);
}
function updateHallwachs() {
  const st = S.hallwachs;
  const k = st.on ? 'ctl.lampOff' : 'ctl.lampOn';
  if (ui.on.dataset.i18n !== k) { ui.on.dataset.i18n = k; ui.on.textContent = t(k); }
  measRows(ui.dl, [[t('m.leaves'), qty(st.a, 0, '°')], [t('m.tOn'), qty(st.tOn, 1, 's')], [t('m.state'), t(st.a < 1 ? 'hw.discharged' : 'hw.charged')]]);
}

/* ---------- Tab 2 ---------- */
function buildThreshold() {
  const st = S.threshold;
  controlsBody.append(
    seg(st, 'ctl.metal', 'metal', Object.keys(T161).map((m) => ({ value: m, labelKey: `me.${m}` })), () => { st.el = []; }),
    sliderEl(st, 'ctl.lam', 'lam', 150, 800, 5, 'nm', 0), sliderEl(st, 'ctl.inten', 'inten', 0, 100, 5, '%', 0),
    btnRow(recordBtn(() => { st.rows.push({ metal: st.metal }); st.fb = null; refresh(); })), hint('hint.threshold'), resetBtn('threshold'));
  tableBlock(st);
}
function updateThreshold() {
  const st = S.threshold, l0 = T161[st.metal] * 1000;
  measRows(ui.dl, [[t('m.lam'), qty(st.lam, 0, 'nm')], [t('m.region'), t(st.lam < 400 ? 'rg.uv' : st.lam <= 800 ? 'rg.vis' : 'rg.ir')], [t('m.emission'), t(st.lam <= l0 ? 'th.yes' : 'th.no')], [t('m.count'), String(st.count)]]);
  renderTable(st, st.rows, ['col.metal', 'col.l0', 'col.nu0', 'col.W0'], (r) => {
    const l = T161[r.metal], nu0 = C0 / (l * 1e-6) / 1e14, W0 = (H * C0) / (l * 1e-6) / E1;
    return el('tr', {}, [td(t(`me.${r.metal}`)), td(num(l, 2)),
      cell(st, r, 'n', nu0, 2, relTol(nu0, 0.01), 'fb.nu0Ok', 'fb.nu0Wrong'),
      cell(st, r, 'w', W0, 2, relTol(W0, 0.012), 'fb.W0Ok', 'fb.W0Wrong', !calcDone(r, 'n'))]);
  });
}

/* ---------- Tab 3 ---------- */
function buildEinstein() {
  const st = S.einstein;
  controlsBody.append(
    seg(st, 'ctl.metal2', 'metal', Object.keys(T162).map((m) => ({ value: m, labelKey: `me.${m}` }))),
    sliderEl(st, 'ctl.lam', 'lam', 150, 800, 5, 'nm', 0),
    btnRow(recordBtn(() => { st.rows.push({ metal: st.metal, lam: st.lam }); st.fb = null; refresh(); })), hint('hint.einstein'), resetBtn('einstein'));
  tableBlock(st);
}
function updateEinstein() {
  const st = S.einstein, E = eV(st.lam), W0 = T162[st.metal];
  measRows(ui.dl, [[t('m.W0'), qty(W0, 2, 'eV')], [t('m.lam'), qty(st.lam, 0, 'nm')]]);
  renderTable(st, st.rows, ['col.metal', 'col.lam', 'col.EJ', 'col.EeV', 'col.Ek', 'col.v'], (r) => {
    const EJ = (H * C0) / (r.lam * 1e-9), Ee = EJ / E1, Ek = Ee - T162[r.metal];
    const v = Ek > 0 ? Math.sqrt((2 * Ek * E1) / ME) / 1e5 : 0;
    return el('tr', {}, [td(t(`me.${r.metal}`)), td(num(r.lam, 0)),
      cell(st, r, 'J', EJ * 1e19, 2, relTol(EJ * 1e19, 0.01), 'fb.EJOk', 'fb.EJWrong'),
      cell(st, r, 'e', Ee, 2, relTol(Ee, 0.012), 'fb.EeVOk', 'fb.EeVWrong', !calcDone(r, 'J')),
      cell(st, r, 'k', Math.max(0, Ek), 2, 0.025, Ek > 0 ? 'fb.EkOk' : 'fb.Ek0Ok', 'fb.EkWrong', !calcDone(r, 'e')),
      cell(st, r, 'v', v, 1, relTol(v, 0.02, 0.06), 'fb.vOk', 'fb.vWrong', !calcDone(r, 'k'))]);
  });
}

/* ---------- Tab 4 ---------- */
function buildDuality() {
  const st = S.duality;
  controlsBody.append(seg(st, 'ctl.ph', 'ph', Object.keys(PHEN).map((p) => ({ value: p, labelKey: `ph.${p}` }))), hint('hint.duality'), resetBtn('duality'));
  ui.dl = el('dl', { class: 'meas' }); measuresBody.append(ui.dl);
}
function updateDuality() {
  const st = S.duality;
  measRows(ui.dl, [[t('m.ph'), t(`ph.${st.ph}`)], [t('m.aspect'), t(`du.asp.${PHEN[st.ph]}`)]]);
}

/* ---------- Tab switching ---------- */
function buildTab(id) {
  controlsBody.replaceChildren();
  measuresBody.replaceChildren();
  ui = {};
  tableSig = '';
  ({ hallwachs: buildHallwachs, threshold: buildThreshold, einstein: buildEinstein, duality: buildDuality })[id]();
  loop.start();
  shell?.refreshActivity();
  refresh();
}
function updateMeasures() {
  if (!shell || !ui.dl) return;
  ({ hallwachs: updateHallwachs, threshold: updateThreshold, einstein: updateEinstein, duality: updateDuality })[shell.tab]();
}
function refresh() { updateMeasures(); requestDraw(); }
function resetTab(id) { S[id] = initialState(id); buildTab(id); }
onLangChange(() => { if (shell) buildTab(shell.tab); });

shell = initSim({
  strings,
  tabs: TABS.map((id) => ({ id, labelKey: `tab.${id}` })),
  initialTab: 'hallwachs',
  onTab: buildTab,
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, eV };
void ME;
void arrow;
