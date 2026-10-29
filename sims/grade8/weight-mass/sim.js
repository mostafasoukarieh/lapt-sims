// Grade 8 — Weight and mass (Ch.6 Act. 1–4, §3, exercises 4 and 9)
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange, getLang } from '../../../shared/i18n.js';
import { num, qty } from '../../../shared/format.js';
import { createButton, createSegmented, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, arrow, font } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { label } from '../../../shared/figures.js';
import { BALANCES, drawSpringBalance } from '../../../shared/spring-balance.js';
import { createGraph } from '../../../shared/graph.js';
import { calcCell, calcSig, calcDone } from '../../../shared/calc-cell.js';
import { G } from '../../../shared/constants.js';

/* ================================================================
   Model
   ================================================================ */
const OBJ_W = { A: 1.0, B: 1.3 }; // N, as in Fig. 2-a and 2-b
const MASSES = [20, 40, 60, 80, 100]; // g
const PLACES = { lebanon: G, pole: 9.83, equator: 9.78, moon: 1.6 }; // N/kg
const BODIES = { 500: 0.5, 1000: 1 }; // kg
const BAL10 = BALANCES[2];
const round2 = (x) => Math.round(x * 100) / 100;
const round3 = (x) => Math.round(x * 1000) / 1000;

// Pieces of cardboard: polygons (px) shifted so that their center of gravity is at the origin, and 3 holes.
function polyCentroid(P) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < P.length; i++) {
    const [x0, y0] = P[i], [x1, y1] = P[(i + 1) % P.length];
    const c = x0 * y1 - x1 * y0;
    a += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c;
  }
  return [cx / (3 * a), cy / (3 * a)];
}
const RAW = {
  irregular: { poly: [[-95, -55], [20, -92], [105, -40], [88, 40], [10, 88], [-62, 70], [-105, 20]], holes: [0, 2, 4] },
  square: { poly: [[-78, -78], [78, -78], [78, 78], [-78, 78]], holes: [0, 1, 2] },
  rectangle: { poly: [[-110, -62], [110, -62], [110, 62], [-110, 62]], holes: [0, 1, 3] },
  rhombus: { poly: [[0, -78], [115, 0], [0, 78], [-115, 0]], holes: [0, 1, 3] },
  triangle: { poly: [[-110, 70], [110, 70], [-30, -105]], holes: [0, 1, 2] },
};
const SHAPES = {};
for (const [id, r] of Object.entries(RAW)) {
  const [gx, gy] = polyCentroid(r.poly);
  const poly = r.poly.map(([x, y]) => [x - gx, y - gy]);
  // holes a little inside the vertices
  const holes = r.holes.map((i) => [poly[i][0] * 0.84, poly[i][1] * 0.84]);
  SHAPES[id] = { poly, holes };
}
const PIVOT = { x: 300, y: 34 };

function initialState() {
  return {
    weight: { part: 'plumb', cut: false, fallY: 0, fallV: 0, obj: 'A' },
    gravity: { shape: 'irregular', hole: 0, phi: 0, om: 0, lines: [], fb: null },
    proportion: { m: 20, rows: [], fb: null },
    places: { place: 'lebanon', body: 1000, rows: [], fb: null },
  };
}
let S = initialState();
function targetPhi(sh, hole) {
  const [hx, hy] = SHAPES[sh].holes[hole];
  // rotate so that the vector hole → G (= −h) points straight down
  return Math.PI / 2 - Math.atan2(-hy, -hx);
}
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
function settleGravity(st) { st.phi = targetPhi(st.shape, st.hole) + 0.5; st.om = 0; }
settleGravity(S.gravity);

/* ================================================================
   Canvas and loop
   ================================================================ */
const SCENE = { w: 600, h: 340 };
let shell;
let drawQueued = false;
const canvas = document.getElementById('stage');
const view = setupCanvas(canvas, { width: SCENE.w, height: SCENE.h, maxHeightVh: () => (window.innerWidth < 880 ? 48 : 72), onResize: () => requestDraw() });
function requestDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; draw(); });
}
onThemeChange(() => requestDraw());
const graphCard = document.getElementById('graph-card');
const graphHint = document.getElementById('graph-hint');
const graph = createGraph(document.getElementById('graph'), { width: 360, height: 230, maxHeightVh: 36 });

const loop = createLoop({
  step(dt) {
    if (!shell) return false;
    if (shell.tab === 'weight') {
      const st = S.weight;
      if (st.part === 'plumb' && st.cut && st.fallY < 1) {
        st.fallV += G * 1.6 * dt; st.fallY = Math.min(1, st.fallY + st.fallV * dt);
        return st.fallY < 1;
      }
      return false;
    }
    if (shell.tab === 'gravity') {
      const st = S.gravity;
      const d = wrap(st.phi - targetPhi(st.shape, st.hole));
      const h = Math.hypot(...SHAPES[st.shape].holes[st.hole]);
      const k = 9.8 * 9 * (h / 100);
      for (let i = 0; i < 4; i++) {
        const dd = st.phi - targetPhi(st.shape, st.hole);
        st.om += (-k * Math.sin(dd) - 4.2 * st.om) * (dt / 4);
        st.phi += st.om * (dt / 4);
      }
      return Math.abs(d) > 0.0015 || Math.abs(st.om) > 0.003;
    }
    return false;
  },
  render() { draw(); updateMeasures(); },
});
function gravityStill() {
  const st = S.gravity;
  return Math.abs(wrap(st.phi - targetPhi(st.shape, st.hole))) < 0.01 && Math.abs(st.om) < 0.03;
}

/* ================================================================
   Drawing helpers
   ================================================================ */
function stand(ctx, P, baseY = 324) {
  ctx.fillStyle = cssVar('--wire');
  ctx.fillRect(P.x - 160, baseY, 110, 9);
  ctx.fillRect(P.x - 110, P.y - 8, 7, baseY - P.y + 8);
  ctx.fillRect(P.x - 110, P.y - 8, 110 + 4, 6);
  label(ctx, t('stand'), P.x - 96, baseY - 12, { size: 11, color: cssVar('--muted'), align: 'left' });
}
function wArrow(ctx, x, y, len, txt) {
  ctx.strokeStyle = cssVar('--accent'); ctx.fillStyle = cssVar('--accent'); ctx.lineWidth = 3.5;
  arrow(ctx, x, y, x, y + len, 10);
  ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
  label(ctx, txt ?? t('sym'), x + 12, y + len - 6, { size: 15, weight: 800, color: cssVar('--accent'), align: 'left' });
}
function massPiece(ctx, x, yTop, g, scale = 1) {
  const h = (g > 100 ? (g >= 1000 ? 40 : 32) : 14 + g * 0.22) * scale, w = (g > 100 ? 34 : 26) * scale;
  ctx.strokeStyle = '#7a5c12'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(x, yTop + 5, 4, Math.PI, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, yTop + 1); ctx.lineTo(x, yTop + 8); ctx.stroke();
  const gr = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  gr.addColorStop(0, '#b38b2e'); gr.addColorStop(0.45, '#f0d27a'); gr.addColorStop(1, '#a37b22');
  ctx.fillStyle = gr; roundRect(ctx, x - w / 2, yTop + 8, w, h, 3); ctx.fill();
  ctx.fillStyle = '#4a3a10'; ctx.font = font(9 * scale, 800); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(g >= 1000 ? `${g / 1000} kg` : `${g} g`, x, yTop + 8 + Math.min(h / 2, 10 * scale));
  return yTop + 8 + h;
}
function supportFor(ctx, x, y, r) {
  ctx.fillStyle = cssVar('--wire');
  ctx.fillRect(x - 150, 324, 110, 9);
  ctx.fillRect(x - 100, 14, 7, 312);
  ctx.fillRect(x - 100, 14, 100 + 4, 6);
  ctx.strokeStyle = cssVar('--wire'); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x, 20); ctx.lineTo(x, y - r - 20); ctx.stroke();
}

function draw() {
  if (!shell) return;
  const ctx = view.begin();
  ctx.fillStyle = cssVar('--scene-bg');
  ctx.fillRect(0, 0, SCENE.w, SCENE.h);
  if (shell.tab === 'weight') drawWeight(ctx);
  else if (shell.tab === 'gravity') drawGravity(ctx);
  else if (shell.tab === 'proportion') drawProportion(ctx);
  else drawPlaces(ctx);
}

/* ---------- Tab 1 ---------- */
function drawWeight(ctx) {
  const st = S.weight;
  ctx.fillStyle = cssVar('--bench'); ctx.fillRect(10, 300, SCENE.w - 20, 34);
  if (st.part === 'plumb') {
    const P = { x: 320, y: 40 };
    stand(ctx, P, 324);
    ctx.strokeStyle = cssVar('--muted'); ctx.setLineDash([6, 6]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(P.x, P.y); ctx.lineTo(P.x, 300); ctx.stroke(); ctx.setLineDash([]);
    label(ctx, t('vertical'), P.x + 40, 120, { size: 11, color: cssVar('--muted') });
    const L = 170;
    const bobTop = P.y + L + st.fallY * (300 - 46 - (P.y + L));
    ctx.strokeStyle = cssVar('--thread'); ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(P.x, P.y); ctx.lineTo(P.x, st.cut ? P.y + L * 0.55 : bobTop); ctx.stroke();
    if (st.cut && st.fallY < 0.05) { ctx.fillStyle = '#ff9a2e'; ctx.beginPath(); ctx.arc(P.x, P.y + L * 0.58, 6, 0, Math.PI * 2); ctx.fill(); }
    // body (plumb bob)
    ctx.fillStyle = cssVar('--lead');
    ctx.beginPath(); ctx.moveTo(P.x - 14, bobTop); ctx.lineTo(P.x + 14, bobTop); ctx.lineTo(P.x + 14, bobTop + 26); ctx.lineTo(P.x, bobTop + 46); ctx.lineTo(P.x - 14, bobTop + 26); ctx.closePath(); ctx.fill();
    label(ctx, t('plumbBob'), P.x - 24, bobTop + 18, { size: 11, color: cssVar('--muted'), align: 'right' });
    if (st.fallY < 1) wArrow(ctx, P.x, bobTop + 20, 52);
    label(ctx, t('ground'), 560, 316, { size: 11, color: cssVar('--muted'), halo: false });
  } else {
    const x = 300, y = 118, r = 84;
    supportFor(ctx, x, y, r);
    const F = OBJ_W[st.obj];
    const h = drawSpringBalance(ctx, { x, y, r, bal: BALANCES[0], F, zero: 0, rodTravel: 40, lang: getLang() });
    // object
    ctx.strokeStyle = cssVar('--thread'); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(h.hookX, h.hookY); ctx.lineTo(h.hookX, h.hookY + 12); ctx.stroke();
    const w = st.obj === 'A' ? 40 : 50, hh = st.obj === 'A' ? 32 : 40;
    ctx.fillStyle = cssVar('--metal'); ctx.fillRect(h.hookX - w / 2, h.hookY + 12, w, hh);
    ctx.strokeStyle = '#59626e'; ctx.lineWidth = 1; ctx.strokeRect(h.hookX - w / 2, h.hookY + 12, w, hh);
    wArrow(ctx, h.hookX, h.hookY + 12 + hh / 2, 24 + F * 30);
  }
}

/* ---------- Tab 2 ---------- */
function toScreen(st, [x, y]) {
  const [hx, hy] = SHAPES[st.shape].holes[st.hole];
  const c = Math.cos(st.phi), s = Math.sin(st.phi);
  const dx = x - hx, dy = y - hy;
  return [PIVOT.x + c * dx - s * dy, PIVOT.y + 12 + s * dx + c * dy];
}
function drawGravity(ctx) {
  const st = S.gravity;
  const sh = SHAPES[st.shape];
  // stand arm and nail
  ctx.fillStyle = cssVar('--wire');
  ctx.fillRect(40, 18, 270, 6); ctx.fillRect(40, 18, 7, 310); ctx.fillRect(10, 324, 110, 9);
  label(ctx, t('stand'), 56, 312, { size: 11, color: cssVar('--muted'), align: 'left' });
  // cardboard
  const pts = sh.poly.map((p) => toScreen(st, p));
  ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
  ctx.fillStyle = '#e2c99a'; ctx.fill();
  ctx.strokeStyle = '#a3865a'; ctx.lineWidth = 1.5; ctx.stroke();
  // traced lines (clipped to the cardboard)
  ctx.save(); ctx.clip();
  ctx.strokeStyle = '#2a4f9a'; ctx.lineWidth = 2;
  for (const i of st.lines) {
    const [hx, hy] = sh.holes[i];
    const len = Math.hypot(hx, hy);
    const a = toScreen(st, [hx + (hx / len) * 40, hy + (hy / len) * 40]);
    const b = toScreen(st, [-hx * 3, -hy * 3]);
    ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke();
  }
  ctx.restore();
  // holes
  sh.holes.forEach((h, i) => {
    const [x, y] = toScreen(st, h);
    ctx.fillStyle = cssVar('--scene-bg');
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#7d6440'; ctx.lineWidth = 1.2; ctx.stroke();
    if (i !== st.hole) { ctx.strokeStyle = cssVar('--accent'); ctx.globalAlpha = 0.35; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; }
    label(ctx, String(i + 1), x + 13, y + 11, { size: 11, weight: 800, color: '#7d6440' });
  });
  // the string from the nail to the hole (short) and the plumb line from the nail
  ctx.strokeStyle = cssVar('--thread'); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(PIVOT.x, PIVOT.y - 10); ctx.lineTo(...toScreen(st, sh.holes[st.hole])); ctx.stroke();
  ctx.strokeStyle = '#555'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PIVOT.x, PIVOT.y - 10); ctx.lineTo(PIVOT.x, 304); ctx.stroke();
  ctx.fillStyle = cssVar('--lead');
  ctx.beginPath(); ctx.moveTo(PIVOT.x - 6, 304); ctx.lineTo(PIVOT.x + 6, 304); ctx.lineTo(PIVOT.x, 322); ctx.closePath(); ctx.fill();
  label(ctx, t('vertical'), PIVOT.x + 10, 296, { size: 11, color: cssVar('--muted'), align: 'left' });
  ctx.fillStyle = cssVar('--wire'); ctx.beginPath(); ctx.arc(PIVOT.x, PIVOT.y - 10, 4, 0, Math.PI * 2); ctx.fill();
  // G when two lines are traced
  if (st.lines.length >= 2) {
    const [gx, gy] = toScreen(st, [0, 0]);
    ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.arc(gx, gy, 4.5, 0, Math.PI * 2); ctx.fill();
    label(ctx, 'G', gx - 12, gy - 10, { size: 15, weight: 800, color: '#c0392b' });
    if (gravityStill()) wArrow(ctx, gx, gy, 56);
  }
}

/* ---------- Tab 3 ---------- */
function drawProportion(ctx) {
  const st = S.proportion;
  ctx.fillStyle = cssVar('--bench'); ctx.fillRect(10, 300, SCENE.w - 20, 34);
  const x = 230, y = 98, r = 72;
  supportFor(ctx, x, y, r);
  const F = (st.m / 1000) * G;
  const h = drawSpringBalance(ctx, { x, y, r, bal: BALANCES[0], F, zero: 0, rodTravel: 40, lang: getLang() });
  const bottom = massPiece(ctx, h.hookX, h.hookY - 2, st.m, 1.25);
  wArrow(ctx, h.hookX, (h.hookY + bottom) / 2 + 3, 14 + F * 26);
  // box of marked masses
  ctx.fillStyle = cssVar('--wood'); roundRect(ctx, 382, 250, 200, 50, 8); ctx.fill();
  label(ctx, t('marked'), 482, 316, { size: 11, color: cssVar('--muted'), halo: false });
  MASSES.forEach((g, i) => {
    if (g === st.m) return;
    const mx = 404 + i * 39;
    const hgt = (14 + g * 0.22) + 8;
    massPiece(ctx, mx, 290 - hgt, g, 1);
  });
}

/* ---------- Tab 4 ---------- */
function drawPlaces(ctx) {
  const st = S.places;
  const moon = st.place === 'moon';
  ctx.fillStyle = moon ? '#1b2233' : cssVar('--sky');
  ctx.fillRect(0, 0, SCENE.w, 300);
  if (moon) {
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 40; i++) ctx.fillRect((i * 97) % 600, (i * 53) % 280, 1.5, 1.5);
    ctx.fillStyle = '#3d6fd1'; ctx.beginPath(); ctx.arc(530, 56, 24, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4ea35a'; ctx.beginPath(); ctx.arc(524, 50, 9, 0, Math.PI * 2); ctx.fill();
  }
  if (st.place === 'pole') {
    ctx.fillStyle = '#eef6fb'; ctx.beginPath(); ctx.moveTo(380, 300); ctx.lineTo(450, 230); ctx.lineTo(520, 300); ctx.fill();
  }
  ctx.fillStyle = moon ? '#8d8f94' : st.place === 'pole' ? '#f4f8fb' : st.place === 'equator' ? '#e7cf8a' : cssVar('--bench');
  ctx.fillRect(0, 300, SCENE.w, 40);
  if (moon) { ctx.fillStyle = '#76787d'; for (const cx of [70, 260, 480]) { ctx.beginPath(); ctx.ellipse(cx, 318, 26, 6, 0, 0, Math.PI * 2); ctx.fill(); } }
  label(ctx, t(`pl.${st.place}`), 20, 22, { size: 14, weight: 800, color: moon ? '#ffffff' : cssVar('--text'), align: 'left', halo: !moon });
  const m = BODIES[st.body], w = round2(m * PLACES[st.place]);
  // spring balance with the body
  const x = 190, y = 110, r = 68;
  supportFor(ctx, x, y, r);
  const h = drawSpringBalance(ctx, { x, y, r, bal: BAL10, F: w, zero: 0, rodTravel: 34, lang: getLang() });
  const bw = st.body === 1000 ? 46 : 36;
  ctx.strokeStyle = cssVar('--thread'); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(h.hookX, h.hookY); ctx.lineTo(h.hookX, h.hookY + 10); ctx.stroke();
  ctx.fillStyle = cssVar('--metal'); ctx.fillRect(h.hookX - bw / 2, h.hookY + 10, bw, bw * 0.8);
  ctx.strokeStyle = '#59626e'; ctx.lineWidth = 1; ctx.strokeRect(h.hookX - bw / 2, h.hookY + 10, bw, bw * 0.8);
  label(ctx, t('springBalance'), x, y - r - 30, { size: 11, color: moon ? '#cfd6e4' : cssVar('--muted'), halo: !moon });
  wArrow(ctx, h.hookX, h.hookY + 10 + bw * 0.4, 14 + w * 6);
  // ordinary balance: always in equilibrium with the same marked masses
  const bx = 450, by = 196;
  ctx.fillStyle = cssVar('--device');
  ctx.fillRect(bx - 50, 290, 100, 10); ctx.fillRect(bx - 5, by, 10, 92);
  ctx.strokeStyle = cssVar('--wire'); ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(bx - 90, by); ctx.lineTo(bx + 90, by); ctx.stroke();
  ctx.fillStyle = cssVar('--accent'); ctx.beginPath(); ctx.moveTo(bx, by - 30); ctx.lineTo(bx - 4, by); ctx.lineTo(bx + 4, by); ctx.fill();
  for (const sx of [-1, 1]) {
    const px = bx + sx * 80;
    ctx.strokeStyle = cssVar('--wire'); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(px, by); ctx.lineTo(px - 26, by + 46); ctx.moveTo(px, by); ctx.lineTo(px + 26, by + 46); ctx.stroke();
    ctx.fillStyle = cssVar('--pan-metal'); ctx.fillRect(px - 32, by + 46, 64, 5);
  }
  ctx.fillStyle = cssVar('--metal'); ctx.fillRect(bx - 80 - bw / 2 + 6, by + 46 - bw * 0.7, bw - 12, bw * 0.7);
  massPiece(ctx, bx + 80, by + 46 - 8 - (st.body === 1000 ? 40 : 32), st.body, 1);
  label(ctx, t('balance'), bx, 320, { size: 11, color: moon ? '#ffffff' : cssVar('--muted'), halo: !moon });
}

/* ================================================================
   Pointer
   ================================================================ */
canvas.addEventListener('pointerdown', (ev) => {
  if (!shell || shell.tab !== 'gravity') return;
  const p = view.toLogical(ev);
  const st = S.gravity;
  const sh = SHAPES[st.shape];
  for (let i = 0; i < sh.holes.length; i++) {
    const [x, y] = toScreen(st, sh.holes[i]);
    if (i !== st.hole && Math.hypot(p.x - x, p.y - y) < 26) {
      // hang from hole i: keep the cardboard's orientation, it swings to its new rest position
      st.hole = i; st.om = 0; st.fb = null;
      loop.start(); refresh();
      ev.preventDefault();
      return;
    }
  }
});

/* ================================================================
   Controls and measurements
   ================================================================ */
const controlsBody = document.getElementById('controls-body');
const measuresBody = document.getElementById('measures-body');
let ui = {};
function measRows(dl, rows) {
  dl.replaceChildren(...rows.flatMap(([k, v, cls]) => [el('dt', {}, k), el('dd', cls ? { class: cls } : {}, v)]));
}
function statusBox() { return el('p', { class: 'status', hidden: '' }); }
function showStatus(box, fb) {
  if (!fb) { box.hidden = true; return; }
  box.hidden = false;
  box.className = `status ${fb.type || ''}`;
  box.textContent = t(fb.key, fb.params);
}
function hint(key) { return el('p', { class: 'muted', style: 'font-size:0.88rem;margin:10px 0 0', dataset: { i18n: key } }, t(key)); }
const btnRow = (...b) => el('div', { class: 'btn-row' }, b);
const resetBtn = (id) => btnRow(createButton({ labelKey: 'ui.reset', variant: 'ghost', onClick: () => resetTab(id) }));
const seg = (labelKey, options, value, onChange) => createSegmented({ labelKey, options, value, onChange });
const newton = (v, d = 2) => qty(v, d, 'N');

/* ---------- Tab 1 ---------- */
function buildWeight() {
  const st = S.weight;
  ui.part = seg('ctl.part', [{ value: 'plumb', labelKey: 'part.plumb' }, { value: 'balance', labelKey: 'part.balance' }], st.part, (v) => { st.part = v; buildTab('weight'); });
  controlsBody.append(ui.part.root);
  if (st.part === 'plumb') {
    controlsBody.append(btnRow(createButton({ labelKey: st.cut ? 'ctl.hang' : 'ctl.cut', variant: 'primary', onClick: () => {
      st.cut = !st.cut; st.fallY = 0; st.fallV = 0;
      if (st.cut) loop.start();
      buildTab('weight');
    } })));
  } else {
    ui.obj = seg('ctl.object', [{ value: 'A', labelKey: 'obj.A' }, { value: 'B', labelKey: 'obj.B' }], st.obj, (v) => { st.obj = v; refresh(); });
    controlsBody.append(ui.obj.root);
  }
  controlsBody.append(resetBtn('weight'));
  ui.dl = el('dl', { class: 'meas' });
  measuresBody.append(ui.dl);
}
function updateWeight() {
  const st = S.weight;
  if (st.part === 'plumb') {
    const fall = !st.cut ? 'fall.hangs' : st.fallY < 1 ? 'fall.falls' : 'fall.ground';
    measRows(ui.dl, [
      [t('m.string'), t('v.vertical')], [t('m.fall'), t(fall)],
      [t('m.line'), t('v.vertical')], [t('m.dir'), t('v.down')],
    ]);
  } else {
    measRows(ui.dl, [
      [t('m.reading'), newton(OBJ_W[st.obj], 1)], [t('m.cause'), t('cause.weight')],
      [t('m.line'), t('v.vertical')], [t('m.dir'), t('v.down')],
    ]);
  }
}

/* ---------- Tab 2 ---------- */
function buildGravity() {
  const st = S.gravity;
  ui.shape = seg('ctl.shape', Object.keys(SHAPES).map((v) => ({ value: v, labelKey: `sh.${v}` })), st.shape, (v) => {
    Object.assign(st, { shape: v, hole: 0, lines: [], fb: null }); settleGravity(st); loop.start(); refresh();
  });
  controlsBody.append(ui.shape.root, hint('hint.holes'),
    btnRow(
      createButton({ labelKey: 'ctl.trace', variant: 'primary', onClick: () => {
        if (!gravityStill()) st.fb = { type: 'warn', key: 'fb.notStill' };
        else if (st.lines.includes(st.hole)) st.fb = { type: 'warn', key: 'fb.sameHole' };
        else { st.lines.push(st.hole); st.fb = st.lines.length >= 2 ? { type: 'good', key: 'fb.meet' } : null; }
        refresh();
      } }),
      createButton({ labelKey: 'ctl.erase', variant: 'secondary', onClick: () => { st.lines = []; st.fb = null; refresh(); } }),
    ), resetBtn('gravity'));
  ui.dl = el('dl', { class: 'meas' });
  ui.status = statusBox();
  measuresBody.append(ui.dl, ui.status);
}
function updateGravity() {
  const st = S.gravity;
  ui.shape.set(st.shape);
  const still = gravityStill();
  measRows(ui.dl, [
    [t('m.hole'), String(st.hole + 1)],
    [t('m.stringV'), t(still ? 'str.vertical' : 'str.moving')],
    [t('m.lines'), String(st.lines.length)],
    [t('m.meet'), st.lines.length >= 2 ? t('yes') : t('meet.need'), st.lines.length >= 2 ? 'good-text' : ''],
  ]);
  showStatus(ui.status, st.fb);
}

/* ---------- Tab 3 ---------- */
let tableSig = '';
function buildProportion() {
  const st = S.proportion;
  ui.mass = seg('ctl.mass', MASSES.map((g) => ({ value: String(g), labelKey: `mg${g}` })), String(st.m), (v) => { st.m = Number(v); st.fb = null; refresh(); });
  controlsBody.append(ui.mass.root,
    btnRow(createButton({ labelKey: 'ctl.record', variant: 'primary', onClick: () => {
      if (st.rows.some((r) => r.g === st.m)) st.fb = { type: 'warn', key: 'fb.already' };
      else { st.rows.push({ g: st.m, m: st.m / 1000, w: round3((st.m / 1000) * G) }); st.rows.sort((a, b) => a.g - b.g); st.fb = null; }
      refresh();
    } })), resetBtn('proportion'));
  ui.dl = el('dl', { class: 'meas' });
  ui.table = el('table', { class: 'data' });
  ui.clearRow = el('div', { class: 'btn-row', style: 'margin-top:8px' }, [createButton({ labelKey: 'ctl.clearTable', variant: 'ghost', onClick: () => { st.rows = []; st.fb = null; refresh(); } })]);
  ui.status = statusBox();
  measuresBody.append(ui.dl, ui.table, ui.clearRow, ui.status);
}
function updateProportion() {
  const st = S.proportion;
  ui.mass.set(String(st.m));
  const w = (st.m / 1000) * G;
  measRows(ui.dl, [
    [t('m.m'), `${qty(st.m, 0, 'g')} = ${qty(st.m / 1000, 2, 'kg')}`],
    [t('m.w'), `${newton(w, 3)} (${t('approx', { v: newton(w, 1) })})`],
  ]);
  const sig = calcSig(st.rows) + st.rows.length;
  if (sig !== tableSig) {
    tableSig = sig;
    const head = el('tr', {}, [el('th', {}, t('col.m')), el('th', {}, t('col.w')), el('th', {}, t('col.ratio'))]);
    const body = st.rows.map((r) => el('tr', {}, [
      el('td', {}, num(r.m, 2)), el('td', {}, num(r.w, 3)),
      calcCell(r, 'ratio', { expected: r.w / r.m, decimals: 1, onCheck: (res) => {
        if (res === 'invalid') st.fb = { type: 'warn', key: 'calcInvalid' };
        else if (res === 'wrong') st.fb = { type: 'bad', key: 'fb.ratioWrong' };
        else st.fb = st.rows.length >= 3 && st.rows.every((x) => calcDone(x, 'ratio')) ? { type: 'good', key: 'fb.allRatio' } : { type: 'good', key: 'fb.ratioOk' };
        refresh();
      } }),
    ]));
    ui.table.replaceChildren(el('thead', {}, head), el('tbody', {}, body));
  }
  ui.table.hidden = st.rows.length === 0;
  ui.clearRow.hidden = ui.table.hidden;
  showStatus(ui.status, st.fb);
  const pts = st.rows.map((r) => [r.m, r.w]);
  const anyRatio = st.rows.some((r) => calcDone(r, 'ratio'));
  graph.draw({
    xLabel: t('graph.x'), yLabel: t('graph.y'), xMax: 0.12, yMax: 1.2,
    series: [{ color: cssVar('--accent'), points: pts, slope: anyRatio && pts.length >= 2 ? G : undefined }],
  });
  graphHint.hidden = pts.length >= 2;
}

/* ---------- Tab 4 ---------- */
let placesSig = '';
function buildPlaces() {
  const st = S.places;
  ui.place = seg('ctl.place', Object.keys(PLACES).map((v) => ({ value: v, labelKey: `pl.${v}` })), st.place, (v) => { st.place = v; st.fb = null; refresh(); });
  ui.body = seg('ctl.body', [{ value: '1000', labelKey: 'bd.1000' }, { value: '500', labelKey: 'bd.500' }], String(st.body), (v) => { st.body = Number(v); st.fb = null; refresh(); });
  controlsBody.append(ui.place.root, ui.body.root,
    btnRow(createButton({ labelKey: 'ctl.record', variant: 'primary', onClick: () => {
      if (st.rows.some((r) => r.place === st.place && r.body === st.body)) st.fb = { type: 'warn', key: 'fb.placeAlready' };
      else { const m = BODIES[st.body]; st.rows.push({ place: st.place, body: st.body, m, w: round2(m * PLACES[st.place]) }); st.fb = null; }
      refresh();
    } })), resetBtn('places'));
  ui.dl = el('dl', { class: 'meas' });
  ui.table = el('table', { class: 'data' });
  ui.clearRow = el('div', { class: 'btn-row', style: 'margin-top:8px' }, [createButton({ labelKey: 'ctl.clearTable', variant: 'ghost', onClick: () => { st.rows = []; st.fb = null; refresh(); } })]);
  ui.status = statusBox();
  measuresBody.append(ui.dl, ui.table, ui.clearRow, ui.status);
}
function updatePlaces() {
  const st = S.places;
  ui.place.set(st.place); ui.body.set(String(st.body));
  const m = BODIES[st.body];
  measRows(ui.dl, [
    [t('m.place'), t(`pl.${st.place}`)],
    [t('m.mass'), qty(m, 1, 'kg')],
    [t('m.weight'), newton(round2(m * PLACES[st.place]), 2)],
  ]);
  const sig = calcSig(st.rows) + st.rows.length + t('col.place');
  if (sig !== placesSig) {
    placesSig = sig;
    const head = el('tr', {}, [el('th', {}, t('col.place')), el('th', {}, t('col.m')), el('th', {}, t('col.w')), el('th', {}, t('col.ratio'))]);
    const body = st.rows.map((r) => el('tr', {}, [
      el('td', {}, t(`pl.${r.place}`)), el('td', {}, num(r.m, 1)), el('td', {}, num(r.w, 2)),
      calcCell(r, 'g', { expected: r.w / r.m, decimals: 2, onCheck: (res) => {
        st.fb = res === 'invalid' ? { type: 'warn', key: 'calcInvalid' } : res === 'wrong' ? { type: 'bad', key: 'fb.gWrong' } : { type: 'good', key: 'fb.gOk' };
        refresh();
      } }),
    ]));
    ui.table.replaceChildren(el('thead', {}, head), el('tbody', {}, body));
  }
  ui.table.hidden = st.rows.length === 0;
  ui.clearRow.hidden = ui.table.hidden;
  showStatus(ui.status, st.fb);
}

/* ---------- Tab switching ---------- */
function buildTab(id) {
  controlsBody.replaceChildren();
  measuresBody.replaceChildren();
  ui = {};
  tableSig = ''; placesSig = '';
  graphCard.hidden = id !== 'proportion';
  if (id === 'weight') buildWeight();
  else if (id === 'gravity') buildGravity();
  else if (id === 'proportion') buildProportion();
  else buildPlaces();
  loop.start();
  refresh();
}
function updateMeasures() {
  if (!shell || !ui.dl) return;
  if (shell.tab === 'weight') updateWeight();
  else if (shell.tab === 'gravity') updateGravity();
  else if (shell.tab === 'proportion') updateProportion();
  else updatePlaces();
}
function refresh() { updateMeasures(); requestDraw(); }
function resetTab(id) {
  S[id] = initialState()[id];
  if (id === 'gravity') settleGravity(S.gravity);
  buildTab(id);
}

const extra = { en: {}, fr: {} };
for (const lang of ['en', 'fr']) for (const g of MASSES) extra[lang][`mg${g}`] = `${g} g`;
onLangChange(() => { if (shell) buildTab(shell.tab); });

shell = initSim({
  strings: { en: { ...strings.en, ...extra.en }, fr: { ...strings.fr, ...extra.fr } },
  tabs: [
    { id: 'weight', labelKey: 'tab.weight' },
    { id: 'gravity', labelKey: 'tab.gravity' },
    { id: 'proportion', labelKey: 'tab.proportion' },
    { id: 'places', labelKey: 'tab.places' },
  ],
  initialTab: 'weight',
  onTab: buildTab,
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, gravityStill, SHAPES, toScreen: (p) => toScreen(S.gravity, p) };
