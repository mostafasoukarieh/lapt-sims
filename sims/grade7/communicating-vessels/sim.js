// Grade 7 — Free surface of a liquid and communicating vessels (Ch.1 Act. 3–4, Ex. 5, 6, 7, 9)
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num, qty } from '../../../shared/format.js';
import { createSlider, createButton, createSegmented, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, font } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { polyArea, belowSurface, rotatePoly, translatePoly, levelFor, areaBelow, fillPoly, dampStep } from '../../../shared/liquid.js';

const SCENE = { w: 600, h: 440 };
const TABLE_Y = 404; // top of the bench (canvas y)
const PX_PER_CM = 10;
const DEG = Math.PI / 180;

/* ================================================================
   Tab 1 — vessels of Fig. 6 (cavity polygons, "up" coordinates: base centre at 0, y upwards)
   Each outline starts at the top-left of the opening and ends at its top-right.
   ================================================================ */
function flaskShape() {
  const R = 95, neck = 18, a0 = Math.asin(neck / R);
  const pts = [[-neck, 262]];
  for (let i = 0; i <= 36; i++) {
    const th = a0 + ((2 * Math.PI - 2 * a0) * i) / 36;
    pts.push([-R * Math.sin(th), R + R * Math.cos(th)]);
  }
  pts.push([neck, 262]);
  return pts;
}
const SHAPES = {
  beaker: { poly: [[-80, 210], [-80, 0], [80, 0], [80, 210]], pivot: 80 },
  bottle: { poly: [[-18, 250], [-18, 205], [-70, 175], [-70, 0], [70, 0], [70, 175], [18, 205], [18, 250]], pivot: 70 },
  narrow: { poly: [[-13, 262], [-13, 214], [-36, 190], [-36, 0], [36, 0], [36, 190], [13, 214], [13, 262]], pivot: 36 },
  glass: { poly: [[-112, 205], [0, 78], [112, 205]], pivot: 52, stem: true, max: 20 },
  flask: { poly: flaskShape(), centre: 95, ring: true, max: 30 },
};
const SHAPE_IDS = ['beaker', 'bottle', 'narrow', 'glass', 'flask'];
const V1X = 215; // vessel position (base centre)
const PLUMB_X = 470, PLUMB_TOP = 58;
const SQ = { side: 96, xLen: 112 }; // set square: vertical side y and horizontal side x
const MAX_TILT = 35;

function initialState(tab) {
  if (tab === 'surface') {
    return { shape: 'beaker', liquid: 'water', tilt: 0, fill: 45, area: null, sq: 250, rot: 0, slosh: { x: 0, v: 0 }, spilled: false };
  }
  return { set: 'book', liquid: 'water', fill: 50, tilt: 0, off: [0, 0], line: false, d: [], y0: null };
}
let S = { surface: initialState('surface'), vessels: initialState('vessels') };

// World polygon of the tilted vessel (canvas coordinates)
function vesselPoly(st) {
  const sh = SHAPES[st.shape];
  const local = sh.poly.map(([x, y]) => [V1X + x, TABLE_Y - y]);
  // the vessel turns about the bottom edge on the side towards which it leans (the flask turns in its ring)
  const piv = sh.centre ? [V1X, TABLE_Y - sh.centre] : [V1X + Math.sign(st.tilt || 1) * sh.pivot, TABLE_Y];
  return { poly: rotatePoly(local, piv[0], piv[1], st.tilt * DEG), piv };
}
const capacity = (shape) => polyArea(SHAPES[shape].poly);
function surfaceState(st) {
  const { poly, piv } = vesselPoly(st);
  if (st.area == null) st.area = (capacity(st.shape) * st.fill) / 100;
  const xs = poly.map((p) => p[0]);
  const x0 = (Math.min(...xs) + Math.max(...xs)) / 2;
  const phi = st.slosh.x;
  const y0 = levelFor([poly], st.area, x0, phi);
  return { poly, piv, x0, y0, phi, liquid: belowSurface(poly, x0, y0, phi) };
}
// Liquid that rises above the lowest edge of the opening flows out (checked with the surface at rest).
function checkSpill(st) {
  const { poly } = vesselPoly(st);
  const rimLow = Math.max(poly[0][1], poly[poly.length - 1][1]);
  const y0 = levelFor([poly], st.area, 0, 0);
  if (y0 < rimLow - 0.5) {
    st.area = areaBelow([poly], rimLow);
    st.spilled = true;
    st.fill = Math.round((100 * st.area) / capacity(st.shape));
  }
}

/* ================================================================
   Tab 2 — communicating vessels
   ================================================================ */
function sidePoly(left, right) { return [...left, ...[...right].reverse()]; }
function bulbSide(cx, cy, r, neck, sign, yBase, yTop) {
  const pts = [[cx + sign * neck, yBase]];
  const a0 = Math.asin(neck / r);
  pts.push([cx + sign * neck, cy + r * Math.cos(a0)]);
  for (let i = 1; i < 18; i++) {
    const a = a0 + ((Math.PI - 2 * a0) * i) / 18;
    pts.push([cx + sign * r * Math.sin(a), cy + r * Math.cos(a)]);
  }
  pts.push([cx + sign * neck, cy - r * Math.cos(a0)], [cx + sign * neck, yTop]);
  return pts;
}
// Book apparatus (Fig. 4): a horizontal tube with four branches of different shapes
function bookSet() {
  const TB = 340, TT = 320, TOP = 108;
  const branches = [
    { left: [[160, TT], [160, TOP]], right: [[186, TT], [186, TOP]] },
    { left: bulbSide(240, 214, 38, 10, -1, TT, TOP), right: bulbSide(240, 214, 38, 10, 1, TT, TOP) },
    { left: [[300, TT], [352, TOP]], right: [[324, TT], [376, TOP]] },
    { left: [[418, TT], [400, TOP]], right: [[442, TT], [464, TOP]] },
  ];
  return { tube: [[150, TT], [150, TB], [470, TB], [470, TT]], branches, centre: [310, 300] };
}
// Fuel tank with a transparent level tube (Ex. 6, Fig. 7)
function tankSet() {
  return {
    tank: [[110, 176], [110, 394], [380, 394], [380, 176]],
    low: [[380, 372], [380, 384], [430, 384], [430, 372]],
    gauge: [[430, 196], [430, 384], [446, 384], [446, 196]],
    high: [[380, 196], [380, 208], [430, 208], [430, 196]],
  };
}
// Two vessels joined by a rubber tube (Ex. 7, Fig. 8): a narrow tube and a funnel, each can be raised or lowered
const TUBE_X = [130, 160], FUN = { x: 430, top: 150, w: 210, neckY: 236, neck: 30, stem: 16, bottom: 330 };
function tubeSet(off) {
  const [a, b] = TUBE_X;
  const left = [[a, 120 + off[0]], [a, 330 + off[0]], [b, 330 + off[0]], [b, 120 + off[0]]];
  const o = off[1], hw = FUN.w / 2, hn = FUN.neck / 2, hs = FUN.stem / 2;
  const funnel = [
    [FUN.x - hw, FUN.top + o], [FUN.x - hn, FUN.neckY + o], [FUN.x - hs, FUN.neckY + 10 + o], [FUN.x - hs, FUN.bottom + o],
    [FUN.x + hs, FUN.bottom + o], [FUN.x + hs, FUN.neckY + 10 + o], [FUN.x + hn, FUN.neckY + o], [FUN.x + hw, FUN.top + o],
  ];
  return { left, funnel };
}
// Polygons that hold the liquid, one per "branch" whose level is shown (plus connectors)
function vesselGeometry(st) {
  if (st.set === 'book') {
    const g = bookSet();
    const rot = (p) => rotatePoly(p, g.centre[0], g.centre[1], st.tilt * DEG);
    const branches = g.branches.map((b) => ({ poly: rot(sidePoly(b.left, b.right)), left: b.left.map((p) => rot([p])[0]), right: b.right.map((p) => rot([p])[0]) }));
    return { kind: 'book', connectors: [rot(g.tube)], branches, tube: rot(g.tube) };
  }
  if (st.set === 'tank') {
    const g = tankSet();
    return { kind: 'tank', connectors: [g.low, g.high], branches: [{ poly: g.tank }, { poly: g.gauge }] };
  }
  const g = tubeSet(st.off);
  return { kind: 'tube', connectors: [], branches: [{ poly: g.left }, { poly: g.funnel }] };
}
const allPolys = (geo) => [...geo.connectors, ...geo.branches.map((b) => b.poly)];
function vesselsCapacity(st) {
  const geo = vesselGeometry({ ...st, tilt: 0, off: [0, 0] });
  // book set and tank: up to the lowest opening / top of the tank; tube set: both vessels to the top of the narrow tube
  if (geo.kind === 'tube') return areaBelow(allPolys(geo), 150) ;
  return allPolys(geo).reduce((s, p) => s + polyArea(p), 0);
}
function vesselsLevel(st, geo = vesselGeometry(st)) {
  if (st.area == null) st.area = (vesselsCapacity(st) * st.fill) / 100;
  return levelFor(allPolys(geo), st.area, 0, 0);
}
// After a change: every branch keeps for a moment the level it had, then oscillates towards the common level.
function resettle(st, before, shift = []) {
  const y0 = vesselsLevel(st);
  const geo = vesselGeometry(st);
  st.d = geo.branches.map((_, k) => {
    const old = before?.[k];
    const x = old == null ? 0 : old + (shift[k] || 0) - y0;
    return { x: Math.max(-90, Math.min(90, x)), v: 0 };
  });
  st.y0 = y0;
}
const branchLevels = (st) => st.d.map((d) => st.y0 + d.x);

/* ================================================================
   Canvas
   ================================================================ */
let shell;
let drawQueued = false;
let drag = null;
const canvas = document.getElementById('stage');
canvas.style.touchAction = 'none';
const view = setupCanvas(canvas, { width: SCENE.w, height: SCENE.h, maxHeightVh: () => (window.innerWidth < 880 ? 50 : 74), onResize: () => requestDraw() });
function requestDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; draw(); });
}
onThemeChange(() => requestDraw());
const cur = () => S[shell.tab];
const liquidColor = (id) => cssVar(id === 'alcohol' ? '--alcohol' : id === 'fuel' ? '--oil' : '--water');

function draw() {
  if (!shell) return;
  const ctx = view.begin();
  ctx.fillStyle = cssVar('--scene-bg');
  roundRect(ctx, 0, 0, SCENE.w, SCENE.h, 12);
  ctx.fill();
  ctx.fillStyle = cssVar('--bench');
  ctx.fillRect(0, TABLE_Y, SCENE.w, SCENE.h - TABLE_Y);
  if (shell.tab === 'surface') drawSurfaceTab(ctx, cur());
  else drawVesselsTab(ctx, cur());
}

function strokePoly(ctx, poly, close = false) {
  ctx.beginPath();
  poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  if (close) ctx.closePath();
  ctx.stroke();
}
function glassFill(ctx, poly) {
  ctx.fillStyle = cssVar('--glass-fill');
  fillPoly(ctx, poly);
}
// Bright line on the free surface: the edges of the liquid polygon that lie on the surface line
function drawSurfaceLine(ctx, liquid, x0, y0, phi) {
  const s = Math.sin(phi), c = Math.cos(phi);
  const on = liquid.filter(([x, y]) => Math.abs(-s * (x - x0) + c * (y - y0)) < 0.6);
  if (on.length < 2) return;
  on.sort((p, q) => p[0] - q[0]);
  ctx.strokeStyle = cssVar('--water-dark');
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(...on[0]); ctx.lineTo(...on[on.length - 1]); ctx.stroke();
}

/* ---------- Tab 1 ---------- */
function drawSurfaceTab(ctx, st) {
  const sh = SHAPES[st.shape];
  const s = surfaceState(st);
  // stand for the plumb line (potence)
  ctx.fillStyle = cssVar('--metal');
  ctx.fillRect(PLUMB_X + 60, PLUMB_TOP - 6, 8, TABLE_Y - PLUMB_TOP + 6);
  ctx.fillRect(PLUMB_X - 6, PLUMB_TOP - 6, 74, 7);
  ctx.fillRect(PLUMB_X + 40, TABLE_Y - 8, 48, 8);
  // vessel
  ctx.save();
  if (sh.ring) {
    ctx.fillStyle = cssVar('--wood');
    roundRect(ctx, V1X - 46, TABLE_Y - 12, 92, 12, 5); ctx.fill();
  }
  if (sh.stem) {
    // stem + foot of the glass, or cork ring of the flask, rotate with the vessel
    ctx.translate(s.piv[0], s.piv[1]);
    ctx.rotate(st.tilt * DEG);
    ctx.translate(-s.piv[0], -s.piv[1]);
    ctx.fillStyle = cssVar('--glass-fill');
    ctx.strokeStyle = cssVar('--glass-stroke');
    ctx.lineWidth = 2;
    ctx.fillRect(V1X - 5, TABLE_Y - 78, 10, 72);
    ctx.strokeRect(V1X - 5, TABLE_Y - 78, 10, 72);
    roundRect(ctx, V1X - 52, TABLE_Y - 8, 104, 8, 4); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
  glassFill(ctx, s.poly);
  ctx.fillStyle = liquidColor(st.liquid);
  fillPoly(ctx, s.liquid);
  drawSurfaceLine(ctx, s.liquid, s.x0, s.y0, s.phi);
  ctx.strokeStyle = cssVar('--glass-stroke');
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  strokePoly(ctx, s.poly);
  // plumb line and bob
  const bobY = TABLE_Y - 34;
  ctx.strokeStyle = cssVar('--thread');
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(PLUMB_X, PLUMB_TOP); ctx.lineTo(PLUMB_X, bobY); ctx.stroke();
  ctx.fillStyle = cssVar('--metal');
  ctx.beginPath(); ctx.moveTo(PLUMB_X - 9, bobY); ctx.lineTo(PLUMB_X + 9, bobY); ctx.lineTo(PLUMB_X, bobY + 20); ctx.closePath(); ctx.fill();
  drawSetSquare(ctx, st, s);
}
function drawSetSquare(ctx, st, s) {
  const y = st.sq, k = Math.cos(st.rot * DEG), L = SQ.xLen * k;
  const level = Math.abs(s.phi) < 0.004 && Math.abs(y - s.y0) < 3;
  // extension of side (x) across the vessel, to compare with the free surface
  ctx.setLineDash([6, 5]);
  ctx.strokeStyle = level ? cssVar('--good') : cssVar('--muted');
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(PLUMB_X, y); ctx.lineTo(70, y); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = cssVar('--wood');
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(PLUMB_X - 2, y);
  ctx.lineTo(PLUMB_X - 2 - L, y);
  ctx.lineTo(PLUMB_X - 2, y - SQ.side);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  // labels of the sides
  ctx.fillStyle = cssVar('--text');
  ctx.font = font(13, 800);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  if (Math.abs(L) > 20) ctx.fillText('(x)', PLUMB_X - 2 - L / 2, y + 4);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('(y)', PLUMB_X + 6, y - SQ.side / 2);
  // grip
  ctx.fillStyle = level ? cssVar('--good') : cssVar('--primary');
  ctx.beginPath(); ctx.arc(PLUMB_X - 2, y, 6, 0, Math.PI * 2); ctx.fill();
}

/* ---------- Tab 2 ---------- */
function drawRuler(ctx) {
  const x = 30, top = TABLE_Y - 30 * PX_PER_CM;
  ctx.fillStyle = cssVar('--ruler');
  ctx.fillRect(x - 12, top - 8, 30, TABLE_Y - top + 8);
  ctx.strokeStyle = cssVar('--text');
  ctx.fillStyle = cssVar('--text');
  ctx.font = font(10, 700);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (let cm = 0; cm <= 30; cm++) {
    const y = TABLE_Y - cm * PX_PER_CM;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + 18, y); ctx.lineTo(x + (cm % 5 ? 12 : 6), y); ctx.stroke();
    if (cm % 5 === 0) ctx.fillText(String(cm), x - 10, y);
  }
  ctx.textBaseline = 'bottom';
  ctx.fillText('cm', x - 10, top - 10);
}
function drawVesselsTab(ctx, st) {
  if (st.y0 == null) resettle(st, null);
  const geo = vesselGeometry(st);
  const levels = branchLevels(st);
  const col = liquidColor(st.set === 'tank' ? 'fuel' : st.liquid);
  drawRuler(ctx);
  if (geo.kind === 'book') {
    // pedestal
    ctx.fillStyle = cssVar('--wood');
    ctx.fillRect(296, 340, 14, TABLE_Y - 350);
    roundRect(ctx, 250, TABLE_Y - 14, 110, 14, 6); ctx.fill();
  }
  if (geo.kind === 'tube') drawRubberTube(ctx, st, col);
  for (const p of geo.connectors) glassFill(ctx, p);
  geo.branches.forEach((b) => glassFill(ctx, b.poly));
  // liquid
  ctx.fillStyle = col;
  ctx.strokeStyle = col;
  ctx.lineWidth = 1;
  for (const p of geo.connectors) { const l = belowSurface(p, 0, st.y0, 0); fillPoly(ctx, l); }
  geo.branches.forEach((b, k) => {
    const l = belowSurface(b.poly, 0, levels[k], 0);
    ctx.fillStyle = col;
    fillPoly(ctx, l);
    drawSurfaceLine(ctx, l, 0, levels[k], 0);
  });
  // walls
  ctx.strokeStyle = cssVar('--glass-stroke');
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  if (geo.kind === 'book') strokeBook(ctx, geo);
  else if (geo.kind === 'tank') drawTank(ctx, st, geo);
  else geo.branches.forEach((b) => strokePoly(ctx, b.poly.slice(0)));
  if (st.line) {
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = cssVar('--accent');
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(48, st.y0); ctx.lineTo(SCENE.w - 10, st.y0); ctx.stroke();
    ctx.setLineDash([]);
  }
  // branch numbers / names
  ctx.fillStyle = cssVar('--text');
  ctx.font = font(13, 800);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  if (geo.kind === 'book') geo.branches.forEach((b, k) => { const top = b.left[b.left.length - 1], tr = b.right[b.right.length - 1]; ctx.fillText(String(k + 1), (top[0] + tr[0]) / 2, Math.min(top[1], tr[1]) - 6); });
  if (geo.kind === 'tube') {
    ctx.fillText(t('name.tube'), (TUBE_X[0] + TUBE_X[1]) / 2, 112 + st.off[0]);
    ctx.fillText(t('name.funnel'), FUN.x, FUN.top - 8 + st.off[1]);
    ctx.font = font(18, 800);
    ctx.fillStyle = cssVar('--primary');
    ctx.fillText('⇕', TUBE_X[1] + 22, 230 + st.off[0]);
    ctx.fillText('⇕', FUN.x + FUN.w / 2 + 16, 200 + st.off[1]);
  }
}
function strokeBook(ctx, geo) {
  // outline of the whole apparatus, open at the top of each branch
  const tube = geo.tube; // [TL, BL, BR, TR]
  ctx.beginPath();
  ctx.moveTo(...tube[0]); ctx.lineTo(...tube[1]); ctx.lineTo(...tube[2]); ctx.lineTo(...tube[3]);
  ctx.stroke();
  // top of the tube between branches
  const tops = geo.branches.map((b) => [b.left[0], b.right[0]]);
  ctx.beginPath();
  ctx.moveTo(...tube[0]);
  for (const [l, r] of tops) { ctx.lineTo(...l); ctx.moveTo(...r); }
  ctx.lineTo(...tube[3]);
  ctx.stroke();
  for (const b of geo.branches) { strokePoly(ctx, b.left); strokePoly(ctx, b.right); }
}
function drawTank(ctx, st, geo) {
  const [tank, gauge] = [geo.branches[0].poly, geo.branches[1].poly];
  if (!st.inside) {
    ctx.fillStyle = cssVar('--metal');
    fillPoly(ctx, tank);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(122, 186, 20, 196);
    ctx.fillStyle = '#ffffff';
    ctx.font = font(15, 800);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t('name.fuel'), 245, 285);
  }
  ctx.strokeStyle = cssVar('--glass-stroke');
  strokePoly(ctx, tank, true);
  for (const p of geo.connectors) strokePoly(ctx, p, true);
  strokePoly(ctx, gauge, true);
  // filler cap and tap
  ctx.fillStyle = cssVar('--metal');
  ctx.fillRect(140, 166, 30, 10);
  ctx.fillRect(446, 370, 18, 10);
  ctx.fillRect(456, 380, 8, 14);
}
function drawRubberTube(ctx, st, col) {
  const a = [(TUBE_X[0] + TUBE_X[1]) / 2, 330 + st.off[0]], b = [FUN.x, FUN.bottom + st.off[1]];
  const low = Math.max(a[1], b[1]) + 56;
  ctx.lineCap = 'butt';
  ctx.strokeStyle = cssVar('--lead-black');
  ctx.lineWidth = 18;
  const path = () => { ctx.beginPath(); ctx.moveTo(a[0], a[1] - 4); ctx.bezierCurveTo(a[0], low, b[0], low, b[0], b[1] - 4); };
  path(); ctx.stroke();
  ctx.strokeStyle = col;
  ctx.lineWidth = 10;
  path(); ctx.stroke();
}

/* ================================================================
   Animation (sloshing, flow until the levels are equal)
   ================================================================ */
const loop = createLoop({
  dt: 1 / 60,
  step(dt) {
    if (!shell) return false;
    const st = cur();
    if (shell.tab === 'surface') {
      dampStep(st.slosh, dt, 7, 0.28, 0.0015);
      return st.slosh.x !== 0 || st.slosh.v !== 0;
    }
    let moving = false;
    for (const d of st.d) { dampStep(d, dt, 4.5, 0.25, 0.25); if (d.x || d.v) moving = true; }
    return moving;
  },
  render: () => { draw(); updateMeasures(); },
});
function kick() { loop.start(); requestDraw(); }

/* ================================================================
   Pointer: tilt the vessel, slide the set square, raise / lower the vessels joined by the rubber tube
   ================================================================ */
canvas.addEventListener('pointerdown', (ev) => {
  const p = view.toLogical(ev);
  const st = cur();
  if (shell.tab === 'surface') {
    if (Math.abs(p.x - (PLUMB_X - 30)) < 60 && p.y > st.sq - SQ.side - 10 && p.y < st.sq + 20) drag = { kind: 'sq', dy: st.sq - p.y };
    else if (Math.abs(p.x - V1X) < 150 && p.y > 100 && p.y < TABLE_Y) drag = { kind: 'tilt', x: p.x, tilt: st.tilt };
  } else if (st.set === 'tube') {
    if (p.x < 230 && p.x > 90) drag = { kind: 'off', k: 0, y: p.y, off: st.off[0] };
    else if (p.x > 300) drag = { kind: 'off', k: 1, y: p.y, off: st.off[1] };
  }
  if (drag) { canvas.setPointerCapture(ev.pointerId); ev.preventDefault(); }
});
canvas.addEventListener('pointermove', (ev) => {
  if (!drag) return;
  const p = view.toLogical(ev);
  if (drag.kind === 'sq') setSquare(p.y + drag.dy);
  else if (drag.kind === 'tilt') setTilt(drag.tilt + (p.x - drag.x) * 0.25);
  else setOffset(drag.k, drag.off + (p.y - drag.y));
});
const endDrag = () => {
  if (drag?.kind === 'sq') { const st = cur(); const s = surfaceState(st); if (Math.abs(st.sq - s.y0) < 6 && Math.abs(s.phi) < 0.01) setSquare(s.y0); }
  drag = null;
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

function setTilt(v) {
  const st = cur();
  const mx = SHAPES[st.shape].max ?? MAX_TILT;
  const nt = Math.round(Math.max(-mx, Math.min(mx, v)));
  if (nt === st.tilt) return;
  st.slosh.x = Math.max(-0.5, Math.min(0.5, st.slosh.x + (nt - st.tilt) * DEG * 0.85));
  st.tilt = nt;
  checkSpill(st);
  ui.tilt?.set(nt);
  ui.fill?.set(st.fill);
  updateMeasures();
  kick();
}
function setSquare(y) {
  const st = cur();
  st.sq = Math.max(PLUMB_TOP + SQ.side + 6, Math.min(TABLE_Y - 40, y));
  updateMeasures();
  requestDraw();
}
function setOffset(k, v) {
  const st = cur();
  const before = branchLevels(st);
  const old = st.off[k];
  st.off[k] = Math.round(Math.max(-110, Math.min(40, v)));
  if (st.off[k] === old) return;
  // both vessels must keep some liquid: otherwise refuse the move
  const geo = vesselGeometry(st);
  const y0 = vesselsLevel(st, geo);
  const bottoms = [330 + st.off[0], FUN.bottom + st.off[1]];
  if (bottoms.some((b) => y0 > b - 8)) { st.off[k] = old; st.fb = { type: 'warn', key: 'fb.empty' }; updateMeasures(); return; }
  st.fb = null;
  const shift = [0, 0];
  shift[k] = st.off[k] - old; // the liquid in the moved vessel moves with it
  resettle(st, before, shift);
  updateMeasures();
  kick();
}

/* ================================================================
   Panels
   ================================================================ */
const controlsBody = document.getElementById('controls-body');
const measuresBody = document.getElementById('measures-body');
let ui = {};
function measRows(dl, rows) {
  dl.replaceChildren(...rows.flatMap(([k, v, cls]) => [el('dt', {}, k), el('dd', cls ? { class: cls } : {}, v)]));
}
function statusBox() { return el('div', { class: 'status', hidden: '' }); }
function showStatus(box, fb) {
  if (!fb) { box.hidden = true; return; }
  box.hidden = false;
  box.className = `status ${fb.type || ''}`;
  box.textContent = t(fb.key, fb.params);
}

function buildSurface() {
  const st = S.surface;
  ui.shape = createSegmented({
    labelKey: 'ctl.vessel',
    options: SHAPE_IDS.map((id) => ({ value: id, labelKey: `shape.${id}` })),
    value: st.shape,
    onChange: (v) => { st.shape = v; st.tilt = 0; st.area = null; st.fill = 45; st.spilled = false; st.slosh = { x: 0, v: 0 }; buildTab(); },
  });
  ui.liquid = createSegmented({
    labelKey: 'ctl.liquid',
    options: [{ value: 'water', labelKey: 'liq.water' }, { value: 'alcohol', labelKey: 'liq.alcohol' }],
    value: st.liquid,
    onChange: (v) => { st.liquid = v; st.slosh.x += 0.12; updateMeasures(); kick(); },
  });
  ui.fill = createSlider({
    labelKey: 'ctl.fill', min: 10, max: 80, step: 1, value: st.fill, unit: '%', decimals: 0,
    onInput: (v) => { st.fill = v; st.area = (capacity(st.shape) * v) / 100; st.spilled = false; checkSpill(st); st.slosh.x += 0.04; updateMeasures(); kick(); },
  });
  const mx = SHAPES[st.shape].max ?? MAX_TILT;
  ui.tilt = createSlider({ labelKey: 'ctl.tilt', min: -mx, max: mx, step: 1, value: st.tilt, unit: '°', decimals: 0, onInput: (v) => setTilt(v) });
  ui.rot = createSlider({
    labelKey: 'ctl.rotate', min: 0, max: 180, step: 5, value: st.rot, unit: '°', decimals: 0,
    onInput: (v) => { st.rot = v; updateMeasures(); requestDraw(); },
  });
  controlsBody.append(
    ui.shape.root, ui.liquid.root, ui.fill.root, ui.tilt.root, ui.rot.root,
    el('div', { class: 'btn-row', style: 'margin-top:8px' }, [createButton({ labelKey: 'ui.reset', onClick: resetTab, variant: 'ghost' })]),
    el('p', { class: 'muted', style: 'margin:8px 0 0;font-size:0.88rem', dataset: { i18n: 'hint.surface' } }, t('hint.surface')),
  );
  ui.dl = el('dl', { class: 'meas' });
  ui.status = statusBox();
  measuresBody.append(ui.dl, ui.status);
}
function updateSurface() {
  const st = S.surface;
  const s = surfaceState(st);
  const rest = st.slosh.x === 0 && st.slosh.v === 0;
  const ang = Math.abs(s.phi) / DEG;
  const level = rest && Math.abs(st.sq - s.y0) < 3;
  measRows(ui.dl, [
    [t('m.tilt'), qty(st.tilt, 0, '°')],
    [t('m.state'), t(rest ? 'state.rest' : 'state.moving'), rest ? 'good-text' : 'warn-text'],
    [t('m.surfAngle'), qty(ang < 0.05 ? 0 : ang, ang < 0.05 ? 0 : 1, '°')],
    [t('m.plumbAngle'), qty(90 - (ang < 0.05 ? 0 : ang), ang < 0.05 ? 0 : 1, '°')],
    [t('m.square'), t(level ? 'sq.level' : 'sq.notLevel'), level ? 'good-text' : ''],
  ]);
  showStatus(ui.status, st.spilled ? { type: 'warn', key: 'fb.spilled' } : null);
}

function buildVessels() {
  const st = S.vessels;
  ui.set = createSegmented({
    labelKey: 'ctl.set',
    options: [{ value: 'book', labelKey: 'set.book' }, { value: 'tank', labelKey: 'set.tank' }, { value: 'tube', labelKey: 'set.tube' }],
    value: st.set,
    onChange: (v) => { S.vessels = { ...initialState('vessels'), set: v, liquid: st.liquid }; buildTab(); shell.refreshActivity(); },
  });
  const items = [ui.set.root];
  if (st.set !== 'tank') {
    ui.liquid = createSegmented({
      labelKey: 'ctl.liquid',
      options: [{ value: 'water', labelKey: 'liq.colored' }, { value: 'alcohol', labelKey: 'liq.alcohol' }],
      value: st.liquid,
      onChange: (v) => { st.liquid = v; requestDraw(); updateMeasures(); },
    });
    items.push(ui.liquid.root);
  }
  ui.fill = createSlider({
    labelKey: 'ctl.fillSet', min: st.set === 'tube' ? 25 : 15, max: st.set === 'tube' ? 70 : 90, step: 1, value: st.fill, unit: '%', decimals: 0,
    onInput: (v) => {
      const before = branchLevels(st);
      st.fill = v; st.area = (vesselsCapacity(st) * v) / 100;
      resettle(st, before);
      updateMeasures(); kick();
    },
  });
  items.push(ui.fill.root);
  if (st.set === 'book') {
    ui.tilt = createSlider({
      labelKey: 'ctl.tiltSet', min: -12, max: 12, step: 1, value: st.tilt, unit: '°', decimals: 0,
      onInput: (v) => { const before = branchLevels(st); st.tilt = v; resettle(st, before); updateMeasures(); kick(); },
    });
    items.push(ui.tilt.root);
  }
  if (st.set === 'tank') {
    ui.inside = createSegmented({
      labelKey: 'ctl.inside',
      options: [{ value: 'no', labelKey: 'inside.no' }, { value: 'yes', labelKey: 'inside.yes' }],
      value: st.inside ? 'yes' : 'no',
      onChange: (v) => { st.inside = v === 'yes'; updateMeasures(); requestDraw(); },
    });
    items.push(ui.inside.root);
  }
  if (st.set === 'tube') {
    ui.offL = createSlider({ labelKey: 'ctl.raiseTube', min: -40, max: 110, step: 1, value: -st.off[0], unit: 'mm', decimals: 0, onInput: (v) => setOffset(0, -v) });
    ui.offR = createSlider({ labelKey: 'ctl.raiseFunnel', min: -40, max: 110, step: 1, value: -st.off[1], unit: 'mm', decimals: 0, onInput: (v) => setOffset(1, -v) });
    items.push(ui.offL.root, ui.offR.root);
  }
  ui.line = createSegmented({
    labelKey: 'ctl.line',
    options: [{ value: 'no', labelKey: 'line.no' }, { value: 'yes', labelKey: 'line.yes' }],
    value: st.line ? 'yes' : 'no',
    onChange: (v) => { st.line = v === 'yes'; requestDraw(); },
  });
  items.push(ui.line.root,
    el('div', { class: 'btn-row', style: 'margin-top:8px' }, [createButton({ labelKey: 'ui.reset', onClick: resetTab, variant: 'ghost' })]));
  if (st.set === 'tube') items.push(el('p', { class: 'muted', style: 'margin:8px 0 0;font-size:0.88rem', dataset: { i18n: 'hint.tube' } }, t('hint.tube')));
  controlsBody.append(...items);
  ui.dl = el('dl', { class: 'meas' });
  ui.status = statusBox();
  measuresBody.append(ui.dl, ui.status);
}
const cm = (y) => qty((TABLE_Y - y) / PX_PER_CM, 1, 'cm');
function updateVessels() {
  const st = S.vessels;
  if (st.y0 == null) resettle(st, null);
  const levels = branchLevels(st);
  const rest = st.d.every((d) => d.x === 0 && d.v === 0);
  const names = st.set === 'book' ? levels.map((_, k) => t('m.branch', { k: k + 1 })) : st.set === 'tank' ? [t('m.inTank'), t('m.inGauge')] : [t('m.inTube'), t('m.inFunnel')];
  const rows = levels.map((y, k) => [names[k], st.set === 'tank' && k === 0 && !st.inside ? t('m.hidden') : cm(y)]);
  rows.unshift([t('m.state'), t(rest ? 'state.rest' : 'state.flowing'), rest ? 'good-text' : 'warn-text']);
  measRows(ui.dl, rows);
  if (st.set === 'tube') { ui.offL.set(-st.off[0]); ui.offR.set(-st.off[1]); }
  showStatus(ui.status, st.fb);
}

function updateMeasures() {
  if (!shell || !ui.dl) return;
  if (shell.tab === 'surface') updateSurface(); else updateVessels();
}
function buildTab() {
  loop.stop();
  controlsBody.replaceChildren();
  measuresBody.replaceChildren();
  ui = {};
  if (shell.tab === 'surface') buildSurface(); else buildVessels();
  updateMeasures();
  requestDraw();
}
function resetTab() {
  const keep = shell.tab === 'vessels' ? S.vessels.set : null;
  S[shell.tab] = initialState(shell.tab);
  if (keep) S.vessels.set = keep;
  buildTab();
}
onLangChange(() => { if (shell) buildTab(); });

shell = initSim({
  strings,
  tabs: [{ id: 'surface', labelKey: 'tab.surface' }, { id: 'vessels', labelKey: 'tab.vessels' }],
  initialTab: 'surface',
  onTab: buildTab,
  activityKey: (tab) => (tab === 'vessels' ? `act.vessels.${S.vessels.set}` : 'act.surface'),
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, surfaceState, vesselGeometry, vesselsLevel, branchLevels, cur: () => cur() };
