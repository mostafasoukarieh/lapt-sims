// Sec 3 GS-LS — Chapter 18: Atomic nucleus. Built as cards (owner, 12 Nov 2026): one card per topic,
// each with its rule, a diagram and one small interactive element.
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num, qty } from '../../../shared/format.js';
import { createButton, createSegmented, createSlider, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect } from '../../../shared/draw.js';
import { label } from '../../../shared/figures.js';
import { calcCell, calcSig, calcDone } from '../../../shared/calc-cell.js';

const TAU = 2 * Math.PI;
const W = 600;
const TABS = ['composition', 'size', 'units', 'binding', 'stability'];
const HEIGHTS = { composition: 400, size: 400, units: 380, binding: 420, stability: 440 };
// book values
const R0 = 1.2;                      // fm
const M_NUCLEON = 1.7e-27;           // kg, average mass of a nucleon (18.4)
const U_KG = 1.66053e-27, U_MEV = 931.5;
const MP = 1.00728, MN = 1.00866;    // u (Application 18.4 and exercise)

const SYM = ['n', 'H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne', 'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar', 'K', 'Ca', 'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn', 'Ga', 'Ge', 'As', 'Se', 'Br', 'Kr', 'Rb', 'Sr', 'Y', 'Zr', 'Nb', 'Mo', 'Tc', 'Ru', 'Rh', 'Pd', 'Ag', 'Cd', 'In', 'Sn', 'Sb', 'Te', 'I', 'Xe', 'Cs', 'Ba', 'La', 'Ce', 'Pr', 'Nd', 'Pm', 'Sm', 'Eu', 'Gd', 'Tb', 'Dy', 'Ho', 'Er', 'Tm', 'Yb', 'Lu', 'Hf', 'Ta', 'W', 'Re', 'Os', 'Ir', 'Pt', 'Au', 'Hg', 'Tl', 'Pb', 'Bi', 'Po', 'At', 'Rn', 'Fr', 'Ra', 'Ac', 'Th', 'Pa', 'U', 'Np', 'Pu', 'Am', 'Cm', 'Bk', 'Cf', 'Es', 'Fm'];
const NAMED = new Set([...Array(21).keys()].slice(1).concat([26, 92]));
// isotopes table of the book (18.2): [A, abundance %]
const ISO = { 1: [[1, '99.985'], [2, '0.015'], [3, '0.0001']], 6: [[12, '98.89']], 8: [[16, '99.759'], [17, '0.037'], [18, '0.204']], 17: [[35, '75.4'], [37, '24.6']], 92: [[234, '0.006'], [235, '0.718'], [238, '99.276']] };
const PRESETS = [[1, 1], [1, 2], [1, 3], [2, 4], [6, 12], [6, 14], [8, 16], [17, 35], [17, 37], [26, 56], [92, 235], [92, 238]];
// nuclei of the binding-energy card: Z, A, mass of the nucleus (u). He-4 and U-235: book; others: nuclear masses
// from tables (atomic mass − Z × electron mass), chosen for the simulation.
const NUCLEI = { H2: [1, 2, 2.01355], He4: [2, 4, 4.00150], Li7: [3, 7, 7.01436], C12: [6, 12, 11.99671], O16: [8, 16, 15.99053], Fe56: [26, 56, 55.92068], U235: [92, 235, 235.044], U238: [92, 238, 238.00031] };
const PARTICLES = { p: 1.67261e-27, n: 1.67492e-27, e: 9.10953e-31, H: 1.67261e-27 + 9.10953e-31 };
const EB = (k) => { const [Z, A, m] = NUCLEI[k], dm = Z * MP + (A - Z) * MN - m; return { dm, E: dm * U_MEV, EA: (dm * U_MEV) / A }; };

const sup = (n) => String(n).split('').map((d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]).join('');
const sub = (n) => String(n).split('').map((d) => '₀₁₂₃₄₅₆₇₈₉'[d]).join('');
const nuclide = (Z, A) => `${sup(A)}${sub(Z)}${SYM[Z] ?? '?'}`;

function initialState(tab) {
  switch (tab) {
    case 'composition': return { Z: 2, N: 2 };
    case 'size': return { A: 238, rows: [], fb: null };
    case 'units': return { part: 'p', rows: [], fb: null };
    case 'binding': return { nuc: 'He4', rows: [], fb: null };
    default: return { Z: 26, N: 30 };
  }
}
let S = Object.fromEntries(TABS.map((k) => [k, initialState(k)]));

/* ================================================================
   Canvas
   ================================================================ */
let shell;
let drawQueued = false;
const canvas = document.getElementById('stage');
canvas.style.touchAction = 'none';
const view = setupCanvas(canvas, { width: W, height: 400, maxHeightVh: () => (window.innerWidth < 880 ? 54 : 78), onResize: () => requestDraw() });
function requestDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; draw(); });
}
onThemeChange(() => requestDraw());

const ink = (ctx, w = 2) => { ctx.strokeStyle = cssVar('--text'); ctx.fillStyle = cssVar('--text'); ctx.lineWidth = w; };
// rule of the card, in a highlighted box at the top
function rule(ctx, key, h = 46, params) {
  ctx.fillStyle = 'rgba(29,95,199,0.10)'; roundRect(ctx, 12, 10, W - 24, h, 10); ctx.fill();
  ctx.strokeStyle = 'rgba(29,95,199,0.45)'; ctx.lineWidth = 1.2; roundRect(ctx, 12, 10, W - 24, h, 10); ctx.stroke();
  const lines = t(key, params).split('\n');
  lines.forEach((s, i) => label(ctx, s, W / 2, 10 + (h * (i + 0.5)) / lines.length, { size: 13, weight: 800, halo: false }));
}
function ball(ctx, x, y, r, proton) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  g.addColorStop(0, proton ? '#ff9a8f' : '#d7dde3'); g.addColorStop(1, proton ? '#c8352b' : '#7d8994');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
}
// nucleons packed on a sunflower spiral, protons and neutrons mixed regularly
function drawNucleus(ctx, cx, cy, Z, N, r) {
  const A = Z + N, R = r * 1.05 * Math.sqrt(A);
  const pts = [];
  for (let i = 0; i < A; i++) { const rr = R * Math.sqrt((i + 0.5) / A), a = i * 2.39996; pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]); }
  pts.sort((p, q) => p[1] - q[1]);
  let zLeft = Z;
  pts.forEach(([x, y], i) => { const p = zLeft > 0 && (Z * (i + 1)) / A >= Z - zLeft + 0.5; if (p) zLeft--; ball(ctx, x, y, r, p); });
}

function draw() {
  if (!shell) return;
  const tab = shell.tab;
  if (view.height !== HEIGHTS[tab]) view.setLogicalSize(W, HEIGHTS[tab]);
  const ctx = view.begin();
  ctx.fillStyle = cssVar('--scene-bg');
  roundRect(ctx, 0, 0, W, HEIGHTS[tab], 14);
  ctx.fill();
  ({ composition: drawComposition, size: drawSize, units: drawUnits, binding: drawBinding, stability: drawStability })[tab](ctx, S[tab]);
}

/* ---------- Card 1: composition, isotopes (18.1–18.2) ---------- */
function drawComposition(ctx, st) {
  rule(ctx, 'co.rule');
  const A = st.Z + st.N;
  const r = A > 60 ? 4.2 : A > 20 ? 7 : 11;
  drawNucleus(ctx, 160, 200, st.Z, st.N, r);
  // symbol
  ctx.font = '800 72px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = cssVar('--text');
  const sx = 390; ctx.fillText(SYM[st.Z] ?? '?', sx, 200);
  ctx.font = '800 26px system-ui, sans-serif'; ctx.textAlign = 'right';
  ctx.fillStyle = cssVar('--s5'); ctx.fillText(String(A), sx - 4, 146);
  ctx.fillStyle = cssVar('--plus'); ctx.fillText(String(st.Z), sx - 4, 200);
  label(ctx, `A = ${A}`, sx - 70, 128, { size: 12, weight: 800, color: cssVar('--s5'), align: 'right' });
  label(ctx, `Z = ${st.Z}`, sx - 70, 192, { size: 12, weight: 800, color: cssVar('--plus'), align: 'right' });
  label(ctx, NAMED.has(st.Z) ? t(`el.${st.Z}`) : '', sx + 50, 226, { size: 14, weight: 800 });
  // legend
  ball(ctx, 40, 352, 7, true); label(ctx, t('co.proton', { n: st.Z }), 54, 352, { size: 12, weight: 700, align: 'left' });
  ball(ctx, 40, 376, 7, false); label(ctx, t('co.neutron', { n: st.N }), 54, 376, { size: 12, weight: 700, align: 'left' });
  // isotopes table of the book
  const iso = ISO[st.Z];
  if (iso) {
    label(ctx, t('co.isotopes', { el: t(`el.${st.Z}`) }), 440, 268, { size: 12, weight: 800 });
    iso.forEach(([a, p], i) => {
      const x = 330 + i * 80 + (3 - iso.length) * 40, on = a === A;
      ctx.fillStyle = on ? 'rgba(29,138,75,0.18)' : cssVar('--surface-2'); roundRect(ctx, x - 36, 282, 72, 50, 8); ctx.fill();
      if (on) { ctx.strokeStyle = cssVar('--good'); ctx.lineWidth = 2; roundRect(ctx, x - 36, 282, 72, 50, 8); ctx.stroke(); }
      label(ctx, nuclide(st.Z, a), x, 298, { size: 15, weight: 800, halo: false });
      label(ctx, `${num(+p, p.split('.')[1]?.length ?? 0)} %`, x, 320, { size: 11, weight: 700, halo: false, color: cssVar('--muted') });
    });
    if (st.Z === 6) label(ctx, t('co.carbon'), 440, 346, { size: 10, weight: 600, color: cssVar('--muted') });
  } else label(ctx, t('co.noTable'), 440, 300, { size: 11, weight: 600, color: cssVar('--muted') });
}

/* ---------- Card 2: dimensions and density (18.3–18.4) ---------- */
function drawSize(ctx, st) {
  rule(ctx, 'sz.rule');
  const r = R0 * Math.cbrt(st.A), k = 20; // px per fm
  const cx = 200, cy = 220;
  // fm grid
  ctx.strokeStyle = 'rgba(127,127,127,0.18)'; ctx.lineWidth = 1;
  for (let x = cx - 8 * k; x <= cx + 8 * k; x += k) { ctx.beginPath(); ctx.moveTo(x, cy - 150); ctx.lineTo(x, cy + 150); ctx.stroke(); }
  for (let y = cy - 7 * k; y <= cy + 7 * k; y += k) { ctx.beginPath(); ctx.moveTo(cx - 160, y); ctx.lineTo(cx + 160, y); ctx.stroke(); }
  const g = ctx.createRadialGradient(cx - r * k * 0.35, cy - r * k * 0.35, 2, cx, cy, r * k);
  g.addColorStop(0, '#ffc0a8'); g.addColorStop(1, '#c8552b');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r * k, 0, TAU); ctx.fill();
  ink(ctx, 2); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + r * k, cy); ctx.stroke();
  label(ctx, 'r', cx + (r * k) / 2, cy - 10, { size: 13, weight: 800 });
  ink(ctx, 2); ctx.beginPath(); ctx.moveTo(cx - 160, cy + 166); ctx.lineTo(cx - 160 + k, cy + 166); ctx.stroke();
  label(ctx, '1 fm', cx - 160 + k + 6, cy + 166, { size: 11, weight: 700, align: 'left' });
  // the atom: 10⁴ times larger
  const ax = 482, ay = 200;
  ctx.strokeStyle = 'rgba(47,116,200,0.6)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(ax, ay, 90, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(47,116,200,0.08)'; ctx.beginPath(); ctx.arc(ax, ay, 90, 0, TAU); ctx.fill();
  ctx.fillStyle = '#c8552b'; ctx.beginPath(); ctx.arc(ax, ay, 0.9, 0, TAU); ctx.fill();
  label(ctx, t('sz.atom'), ax, ay + 108, { size: 11, weight: 700 });
  label(ctx, t('sz.atomB'), ax, ay + 126, { size: 11, weight: 700 });
  label(ctx, t('sz.atom2'), ax, ay + 144, { size: 11, weight: 600, color: cssVar('--muted') });
  label(ctx, t('sz.dot'), ax, ay - 14, { size: 10, weight: 600, color: cssVar('--muted') });
  label(ctx, `A = ${st.A}`, 40, 80, { size: 14, weight: 800, align: 'left' });
}

/* ---------- Card 3: atomic mass unit (18.4) ---------- */
function drawUnits(ctx, st) {
  rule(ctx, 'un.rule', 58);
  const boxes = [['kg', 100], ['u', 300], ['MeV/c²', 500]];
  boxes.forEach(([u, x], i) => {
    ctx.fillStyle = cssVar('--surface-2'); roundRect(ctx, x - 80, 150, 160, 70, 12); ctx.fill();
    ink(ctx, 1.5); roundRect(ctx, x - 80, 150, 160, 70, 12); ctx.stroke();
    label(ctx, t('un.in', { u }), x, 172, { size: 12, weight: 700, color: cssVar('--muted'), halo: false });
    label(ctx, i === 0 ? `${num(PARTICLES[st.part] / (st.part === 'e' ? 1e-31 : 1e-27), 5)} × 10${st.part === 'e' ? '⁻³¹' : '⁻²⁷'}` : '?', x, 198, { size: 15, weight: 800, halo: false });
  });
  for (const [x0, key] of [[180, 'un.div'], [380, 'un.mul']]) {
    ink(ctx, 2); ctx.beginPath(); ctx.moveTo(x0 + 4, 185); ctx.lineTo(x0 + 36, 185); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x0 + 36, 185); ctx.lineTo(x0 + 28, 180); ctx.lineTo(x0 + 28, 190); ctx.closePath(); ctx.fill();
    label(ctx, t(key), x0 + 20, 245, { size: 11, weight: 800, color: cssVar('--s1') });
  }
  label(ctx, t(`pa.${st.part}`), W / 2, 112, { size: 15, weight: 800 });
  label(ctx, t('un.mev'), W / 2, 290, { size: 12, weight: 700, color: cssVar('--muted') });
  label(ctx, t('un.note'), W / 2, 320, { size: 12, weight: 700, color: cssVar('--muted') });
}

/* ---------- Card 4: mass defect, binding energy, Aston's curve (18.5) ---------- */
function semf(A) { // binding energy per nucleon along the valley of stability (liquid-drop formula), for the curve
  const Z = A / (1.98 + 0.0155 * A ** (2 / 3));
  const B = 15.75 * A - 17.8 * A ** (2 / 3) - 0.711 * (Z * Z) / A ** (1 / 3) - 23.7 * ((A - 2 * Z) ** 2) / A;
  return B / A;
}
const LBL = { H2: [8, -8, 'left'], He4: [8, 14, 'left'], Li7: [8, 0, 'left'], C12: [10, 6, 'left'], O16: [6, -12, 'left'], Fe56: [0, 16, 'center'], U235: [-8, 12, 'right'], U238: [-8, -12, 'right'] };
function drawBinding(ctx, st) {
  rule(ctx, 'bi.rule', 50);
  const [Z, A, m] = NUCLEI[st.nuc], sep = Z * MP + (A - Z) * MN;
  // bars: nucleons separated / nucleus (Figure 18.1)
  const x0 = 30, yB = 330, hMax = 230, scale = hMax / sep, zoom = 60; // the difference is drawn ×60
  const hN = hMax, hX = hMax - (sep - m) * scale * zoom;
  ctx.fillStyle = 'rgba(200,53,43,0.75)'; ctx.fillRect(x0, yB - (hN * Z * MP) / sep, 60, (hN * Z * MP) / sep);
  ctx.fillStyle = 'rgba(125,137,148,0.8)'; ctx.fillRect(x0, yB - hN, 60, hN - (hN * Z * MP) / sep);
  ctx.fillStyle = 'rgba(200,85,43,0.85)'; ctx.fillRect(x0 + 100, yB - hX, 60, hX);
  ctx.strokeStyle = cssVar('--good'); ctx.setLineDash([4, 3]); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x0, yB - hN); ctx.lineTo(x0 + 170, yB - hN); ctx.stroke(); ctx.setLineDash([]);
  ink(ctx, 1.5); ctx.beginPath(); ctx.moveTo(x0 + 175, yB - hN); ctx.lineTo(x0 + 175, yB - hX); ctx.stroke();
  label(ctx, 'Δm', x0 + 182, (2 * yB - hN - hX) / 2, { size: 13, weight: 800, align: 'left', color: cssVar('--good') });
  label(ctx, `${Z} p + ${A - Z} n`, x0 + 30, yB + 16, { size: 11, weight: 800 });
  label(ctx, nuclide(Z, A), x0 + 130, yB + 16, { size: 13, weight: 800 });
  label(ctx, t('bi.sep'), x0 + 30, yB + 34, { size: 10, weight: 600, color: cssVar('--muted') });
  label(ctx, t('bi.nucleus'), x0 + 130, yB + 34, { size: 10, weight: 600, color: cssVar('--muted') });
  label(ctx, t('bi.zoom'), x0 + 100, yB + 58, { size: 10, weight: 600, color: cssVar('--muted') });
  label(ctx, `${num(sep, 5)} u`, x0 + 30, yB - hN - 12, { size: 11, weight: 800 });
  label(ctx, `${num(m, A > 200 ? 3 : 5)} u`, x0 + 130, yB - hX - 12, { size: 11, weight: 800 });
  // Aston's curve
  const gx = 290, gy = 80, gw = 290, gh = 250, X = (a) => gx + (a / 250) * gw, Y = (e) => gy + gh - (e / 10) * gh;
  ink(ctx, 1.2); ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx, gy + gh); ctx.lineTo(gx + gw, gy + gh); ctx.stroke();
  for (let e = 0; e <= 10; e += 2) { label(ctx, String(e), gx - 6, Y(e), { size: 10, weight: 600, align: 'right', halo: false }); ctx.strokeStyle = 'rgba(127,127,127,0.18)'; ctx.beginPath(); ctx.moveTo(gx, Y(e)); ctx.lineTo(gx + gw, Y(e)); ctx.stroke(); }
  for (let a = 0; a <= 250; a += 50) label(ctx, String(a), X(a), gy + gh + 12, { size: 10, weight: 600, halo: false });
  label(ctx, t('bi.yAxis'), gx, gy - 12, { size: 10, weight: 800, align: 'left', halo: false });
  label(ctx, 'A', gx + gw, gy + gh + 26, { size: 11, weight: 800, align: 'right', halo: false });
  ctx.strokeStyle = cssVar('--s4'); ctx.setLineDash([5, 4]); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(gx, Y(8)); ctx.lineTo(gx + gw, Y(8)); ctx.stroke(); ctx.setLineDash([]);
  for (const a of [20, 190]) { ctx.strokeStyle = 'rgba(127,127,127,0.5)'; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(X(a), gy); ctx.lineTo(X(a), gy + gh); ctx.stroke(); ctx.setLineDash([]); }
  ctx.strokeStyle = cssVar('--s1'); ctx.lineWidth = 2; ctx.beginPath();
  for (let a = 12; a <= 250; a += 2) { const y = Y(semf(a)); if (a === 12) ctx.moveTo(X(a), y); else ctx.lineTo(X(a), y); }
  ctx.stroke();
  for (const k of Object.keys(NUCLEI)) {
    const on = k === st.nuc, [z, a] = NUCLEI[k], e = EB(k).EA;
    ctx.fillStyle = on ? cssVar('--good') : cssVar('--text'); ctx.beginPath(); ctx.arc(X(a), Y(e), on ? 6 : 3.5, 0, TAU); ctx.fill();
    const [dx, dy, al] = LBL[k];
    label(ctx, nuclide(z, a), X(a) + dx, Y(e) + dy, { size: 10, weight: 800, align: al });
  }
  label(ctx, t('bi.stable'), X(110), Y(9.6), { size: 10, weight: 700, color: cssVar('--good') });
}

/* ---------- Card 5: interactions and stability (18.6, Figure 18.3) ---------- */
// zone of stability drawn from the valley formula (approximate), with the real light stable nuclei
const LIGHT = [[1, 0], [1, 1], [2, 1], [2, 2], [3, 3], [3, 4], [4, 5], [5, 5], [5, 6], [6, 6], [6, 7], [7, 7], [7, 8], [8, 8], [8, 9], [8, 10], [9, 10], [10, 10], [10, 11], [10, 12]];
const STABLE = (() => {
  const s = LIGHT.slice();
  for (let A = 23; A <= 209; A++) {
    const z0 = A / (1.98 + 0.0155 * A ** (2 / 3));
    const zs = A % 2 ? [Math.round(z0)] : [Math.round(z0 - 0.5), Math.round(z0 + 0.5)];
    for (const Z of new Set(zs)) if (Z <= 83 && Z !== 43 && Z !== 61) s.push([Z, A - Z]);
  }
  return s;
})();
const stableSet = new Set(STABLE.map(([z, n]) => `${z},${n}`));
const CH = { x: 70, y: 70, w: 380, h: 330, zMax: 100, nMax: 160 };
const cX = (z) => CH.x + (z / CH.zMax) * CH.w, cY = (n) => CH.y + CH.h - (n / CH.nMax) * CH.h;
function drawStability(ctx, st) {
  rule(ctx, 'st.rule', 50);
  ink(ctx, 1.2); ctx.beginPath(); ctx.moveTo(CH.x, CH.y); ctx.lineTo(CH.x, CH.y + CH.h); ctx.lineTo(CH.x + CH.w, CH.y + CH.h); ctx.stroke();
  for (let z = 0; z <= 100; z += 20) label(ctx, String(z), cX(z), CH.y + CH.h + 12, { size: 10, weight: 600, halo: false });
  for (let n = 0; n <= 160; n += 40) label(ctx, String(n), CH.x - 6, cY(n), { size: 10, weight: 600, align: 'right', halo: false });
  label(ctx, 'Z', CH.x + CH.w, CH.y + CH.h + 26, { size: 12, weight: 800, align: 'right', halo: false });
  label(ctx, 'N', CH.x - 40, CH.y + 6, { size: 12, weight: 800, halo: false });
  // N = Z and Z = 82
  ctx.strokeStyle = cssVar('--s1'); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cX(0), cY(0)); ctx.lineTo(cX(100), cY(100)); ctx.stroke();
  label(ctx, 'N = Z', cX(92), cY(92) - 12, { size: 11, weight: 800, color: cssVar('--s1') });
  ctx.strokeStyle = 'rgba(214,52,44,0.6)'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(cX(82), CH.y); ctx.lineTo(cX(82), CH.y + CH.h); ctx.stroke(); ctx.setLineDash([]);
  label(ctx, 'Z = 82', cX(82) + 6, CH.y + CH.h - 12, { size: 10, weight: 800, color: cssVar('--bad'), align: 'left' });
  ctx.fillStyle = cssVar('--text');
  for (const [z, n] of STABLE) { ctx.fillRect(cX(z) - 1.6, cY(n) - 1.6, 3.2, 3.2); }
  // selected point
  const x = cX(st.Z), y = cY(st.N);
  ctx.strokeStyle = cssVar('--good'); ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(CH.x, y); ctx.lineTo(x, y); ctx.lineTo(x, CH.y + CH.h); ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = cssVar('--good'); ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, 7, 0, TAU); ctx.stroke();
  label(ctx, nuclide(st.Z, st.Z + st.N), x + 10, y - 12, { size: 13, weight: 800, align: 'left' });
  muted(ctx, 'st.tap', CH.x + CH.w / 2, 428);
  muted(ctx, 'st.approx', CH.x + 8, CH.y + 10, 'left');
  // forces inside the nucleus (log scale)
  const fx = 470, fy0 = 120, bars = [['st.grav', 0, cssVar('--muted')], ['st.elec', 37, cssVar('--s5')], ['st.strong', 39, cssVar('--plus')]];
  label(ctx, t('st.forces'), fx + 55, fy0 - 26, { size: 11, weight: 800 });
  bars.forEach(([k, e, c], i) => {
    const y0 = fy0 + i * 62;
    ctx.fillStyle = cssVar('--surface-2'); ctx.fillRect(fx, y0, 110, 18);
    ctx.fillStyle = c; ctx.fillRect(fx, y0, Math.max(3, (110 * e) / 40), 18);
    label(ctx, t(k), fx, y0 - 9, { size: 10, weight: 700, align: 'left' });
    label(ctx, e ? `10${sup(e)} N` : '1 N', fx + 110, y0 + 32, { size: 11, weight: 800, align: 'right' });
  });
  label(ctx, t('st.range'), 592, fy0 + 200, { size: 10, weight: 600, color: cssVar('--muted'), align: 'right' });
  label(ctx, t('st.range2'), 592, fy0 + 216, { size: 10, weight: 600, color: cssVar('--muted'), align: 'right' });
}
const muted = (ctx, key, x, y, align = 'center') => label(ctx, t(key), x, y, { size: 10, weight: 600, color: cssVar('--muted'), align });

/* ---------- Pointer: tap on the N–Z chart ---------- */
let dragging = false;
function pick(ev) {
  const p = view.toLogical(ev), st = S.stability;
  const z = Math.round(((p.x - CH.x) / CH.w) * CH.zMax), n = Math.round(((CH.y + CH.h - p.y) / CH.h) * CH.nMax);
  st.Z = Math.max(1, Math.min(100, z)); st.N = Math.max(0, Math.min(160, n));
  refresh();
}
canvas.addEventListener('pointerdown', (ev) => {
  if (shell?.tab !== 'stability') return;
  const p = view.toLogical(ev);
  if (p.x < CH.x - 10 || p.x > CH.x + CH.w + 10 || p.y < CH.y - 10 || p.y > CH.y + CH.h + 10) return;
  dragging = true; canvas.setPointerCapture(ev.pointerId); pick(ev);
});
canvas.addEventListener('pointermove', (ev) => { if (dragging) pick(ev); });
canvas.addEventListener('pointerup', () => { dragging = false; });
canvas.addEventListener('pointercancel', () => { dragging = false; });

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
function dlOnly() { ui.dl = el('dl', { class: 'meas' }); measuresBody.append(ui.dl); }
function tableBlock(st) {
  dlOnly();
  ui.tableWrap = el('div', { class: 'table-scroll' });
  ui.table = el('table', { class: 'data' });
  ui.tableWrap.append(ui.table);
  ui.clear = el('div', { class: 'btn-row', style: 'margin-top:8px' }, [createButton({ labelKey: 'ctl.clearTable', variant: 'ghost', onClick: () => { st.rows = []; st.fb = null; refresh(); } })]);
  ui.status = el('p', { class: 'status', hidden: '' });
  measuresBody.append(ui.tableWrap, ui.clear, ui.status);
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
const seg = (st, key, prop, opts, after) => createSegmented({ labelKey: key, options: opts, value: st[prop], onChange: (v) => { st[prop] = v; after?.(); refresh(); } }).root;

/* ---------- Card 1 ---------- */
function stepper(st, prop, key, min, max) {
  const minus = createButton({ labelKey: 'ctl.minus', variant: 'secondary', onClick: () => { st[prop] = Math.max(min, st[prop] - 1); refresh(); } });
  const plus = createButton({ labelKey: 'ctl.plus', variant: 'secondary', onClick: () => { st[prop] = Math.min(max, st[prop] + 1); refresh(); } });
  return el('div', {}, [el('p', { style: 'margin:10px 0 4px;font-weight:600', dataset: { i18n: key } }, t(key)), btnRow(minus, plus)]);
}
function buildComposition() {
  const st = S.composition;
  ui.preset = createSegmented({ labelKey: 'ctl.preset', options: PRESETS.map(([z, a], i) => ({ value: i, labelKey: `pr.${i}` })), value: -1, onChange: (i) => { st.Z = PRESETS[i][0]; st.N = PRESETS[i][1] - PRESETS[i][0]; refresh(); } });
  controlsBody.append(stepper(st, 'Z', 'ctl.protons', 1, 92), stepper(st, 'N', 'ctl.neutrons', 0, 146), ui.preset.root, hint('hint.composition'), resetBtn('composition'));
  dlOnly();
}
function updateComposition() {
  const st = S.composition, A = st.Z + st.N;
  measRows(ui.dl, [[t('m.Z'), String(st.Z)], [t('m.N'), String(st.N)], [t('m.A'), String(A)], [t('m.nuclide'), nuclide(st.Z, A)], [t('m.element'), NAMED.has(st.Z) ? t(`el.${st.Z}`) : SYM[st.Z]]]);
}

/* ---------- Card 2 ---------- */
function buildSize() {
  const st = S.size;
  controlsBody.append(
    createSlider({ labelKey: 'ctl.A', min: 1, max: 240, step: 1, value: st.A, decimals: 0, onInput: (v) => { st.A = v; refresh(); } }).root,
    btnRow(recordBtn(() => { st.rows.push({ A: st.A }); st.fb = null; refresh(); })), hint('hint.size'), resetBtn('size'));
  tableBlock(st);
}
function updateSize() {
  const st = S.size;
  measRows(ui.dl, [[t('m.A'), String(st.A)], [t('m.r0'), qty(R0, 1, 'fm')], [t('m.mN'), '1.7 × 10⁻²⁷ kg'.replace('1.7', num(1.7, 1))]]);
  renderTable(st, st.rows, ['col.A', 'col.r', 'col.m', 'col.rho'], (r) => {
    const rr = R0 * Math.cbrt(r.A), m = r.A * 1.7, V = (4 / 3) * Math.PI * (rr * 1e-15) ** 3, rho = (r.A * M_NUCLEON) / V / 1e17;
    return el('tr', {}, [td(String(r.A)),
      cell(st, r, 'r', rr, 2, relTol(rr, 0.006), 'fb.rOk', 'fb.rWrong'),
      cell(st, r, 'm', m, 1, relTol(m, 0.006), 'fb.mOk', 'fb.mWrong', !calcDone(r, 'r')),
      cell(st, r, 'p', rho, 2, relTol(rho, 0.03), 'fb.rhoOk', 'fb.rhoWrong', !calcDone(r, 'm'))]);
  });
}

/* ---------- Card 3 ---------- */
function buildUnits() {
  const st = S.units;
  controlsBody.append(seg(st, 'ctl.part', 'part', ['p', 'n', 'e', 'H'].map((v) => ({ value: v, labelKey: `pa.${v}` }))),
    btnRow(recordBtn(() => { st.rows.push({ part: st.part }); st.fb = null; refresh(); })), hint('hint.units'), resetBtn('units'));
  tableBlock(st);
}
function updateUnits() {
  const st = S.units;
  measRows(ui.dl, [[t('m.mkg'), `${num(PARTICLES[st.part] / (st.part === 'e' ? 1e-31 : 1e-27), 5)} × 10${st.part === 'e' ? '⁻³¹' : '⁻²⁷'} kg`], [t('m.u'), `${num(1.66053, 5)} × 10⁻²⁷ kg`], [t('m.uMeV'), `${num(931.5, 1)} MeV/c²`]]);
  renderTable(st, st.rows, ['col.part', 'col.mu', 'col.mMeV'], (r) => {
    const mu = PARTICLES[r.part] / U_KG, mev = mu * U_MEV, e = r.part === 'e';
    return el('tr', {}, [td(t(`pa.${r.part}`)),
      cell(st, r, 'u', mu, e ? 7 : 5, relTol(mu, e ? 0.003 : 4e-5), 'fb.muOk', 'fb.muWrong'),
      cell(st, r, 'M', mev, e ? 3 : 1, relTol(mev, e ? 0.003 : 2e-4), 'fb.mMeVOk', 'fb.mMeVWrong', !calcDone(r, 'u'))]);
  });
}

/* ---------- Card 4 ---------- */
function buildBinding() {
  const st = S.binding;
  controlsBody.append(seg(st, 'ctl.nuc', 'nuc', Object.keys(NUCLEI).map((k) => ({ value: k, labelKey: `nu.${k}` }))),
    btnRow(recordBtn(() => { st.rows.push({ nuc: st.nuc }); st.fb = null; refresh(); })), hint('hint.binding'), resetBtn('binding'));
  tableBlock(st);
}
function updateBinding() {
  const st = S.binding, [Z, A, m] = NUCLEI[st.nuc];
  measRows(ui.dl, [[t('m.nuclide'), nuclide(Z, A)], [t('m.mX'), `${num(m, A > 200 ? 3 : 5)} u`], [t('m.mp'), `${num(MP, 5)} u`], [t('m.mn'), `${num(MN, 5)} u`]]);
  renderTable(st, st.rows, ['col.nuc', 'col.dm', 'col.EB', 'col.EA'], (r) => {
    const [z, a] = NUCLEI[r.nuc], b = EB(r.nuc);
    return el('tr', {}, [td(nuclide(z, a)),
      cell(st, r, 'd', b.dm, 5, relTol(b.dm, 0.004, 2e-5), 'fb.dmOk', 'fb.dmWrong'),
      cell(st, r, 'E', b.E, 2, relTol(b.E, 0.005), 'fb.EBOk', 'fb.EBWrong', !calcDone(r, 'd')),
      cell(st, r, 'a', b.EA, 2, relTol(b.EA, 0.006), 'fb.EAOk', 'fb.EAWrong', !calcDone(r, 'E'))]);
  });
}

/* ---------- Card 5 ---------- */
function buildStability() {
  controlsBody.append(hint('hint.stability'), resetBtn('stability'));
  dlOnly();
}
function updateStability() {
  const st = S.stability, A = st.Z + st.N, inZone = stableSet.has(`${st.Z},${st.N}`);
  const zone = inZone ? 'st.inZone' : st.Z > 83 ? 'st.tooHeavy' : 'st.outZone';
  measRows(ui.dl, [[t('m.nuclide'), nuclide(st.Z, A)], [t('m.Z'), String(st.Z)], [t('m.N'), String(st.N)], [t('m.A'), String(A)], [t('m.NZ'), num(st.N / st.Z, 2)], [t('m.zone'), t(zone)]]);
}

/* ---------- Tab switching ---------- */
function buildTab(id) {
  controlsBody.replaceChildren();
  measuresBody.replaceChildren();
  ui = {};
  tableSig = '';
  ({ composition: buildComposition, size: buildSize, units: buildUnits, binding: buildBinding, stability: buildStability })[id]();
  shell?.refreshActivity();
  refresh();
}
function updateMeasures() {
  if (!shell || !ui.dl) return;
  ({ composition: updateComposition, size: updateSize, units: updateUnits, binding: updateBinding, stability: updateStability })[shell.tab]();
}
function refresh() { updateMeasures(); requestDraw(); }
function resetTab(id) { S[id] = initialState(id); buildTab(id); }
onLangChange(() => { if (shell) buildTab(shell.tab); });

shell = initSim({
  strings,
  tabs: TABS.map((id) => ({ id, labelKey: `tab.${id}` })),
  initialTab: 'composition',
  onTab: buildTab,
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, EB, semf };
