// Grade 8 — Motion and trajectory (Ch.1 parts 1–2: Act. 1–3, Ex. 4 and 11)
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num, qty } from '../../../shared/format.js';
import { createButton, createSegmented, createSlider, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, arrow, font } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { G } from '../../../shared/constants.js';
import { label, person } from '../../../shared/figures.js';

/* ================================================================
   Model
   ================================================================ */
// Tab 1 — boy on a bicycle and a tree (metres, seconds)
const R1 = { k: 20, treeX: 20, bikeX0: 6, v: 2.5, xEnd: 26, groundY: 262 };
// Tab 2 — bus moving towards the East, C walking towards the West inside it
const R2 = { k: 12, vBus: 4, vC: 1, period: 8, busRear0: 3, busLen: 12, seatB: 6, c0: 10, xA: 27, roadY: 250 };
// Tab 3 — highway Beirut–Saida (km from Beirut, deduced from the two road signs of Fig. 2)
const TOWNS = [
  { id: 'beirut', km: 0 }, { id: 'naame', km: 15 }, { id: 'damour', km: 19 }, { id: 'jieh', km: 22 }, { id: 'saida', km: 37 },
];
const ORIGINS = ['beirut', 'damour', 'saida'];
const KM_END = 37;
// Tab 4 — marble on an inclined glass sheet (top view, x down the slope, y across)
const GLASS = { L: 0.60, W: 0.36, r: 0.012, k: 760, x0: 118, y0: 34 };
const MARBLE0 = { x: 0.045, y: 0.18 };
const DOT_DT = 0.1; // s between recorded positions
const VMAX = 0.4; // m/s, largest push

function initialState() {
  return {
    relativity: { pedal: false, ref: 'ground', t: 0, x: R1.bikeX0, ended: false },
    bus: { obs: 'A', t: 0 },
    position: { km: 15, dir: 'saida', origin: 'saida' },
    trajectory: {
      mode: 'release', angle: 10, dots: false, slow: false,
      m: { ...MARBLE0, vx: 0, vy: 0 }, run: false, stopped: false, time: 0, nextDot: 0,
      path: [], marks: [], old: [], drag: null, straight: null,
    },
  };
}
let S = initialState();

// Velocities along the West→East axis (m/s) for tab 2
const V2 = { A: 0, ground: 0, B: R2.vBus, bus: R2.vBus, C: R2.vBus - R2.vC };
function relMotion(who, obs) {
  const v = V2[who] - V2[obs];
  if (Math.abs(v) < 1e-9) return 'atRest';
  return v > 0 ? 'movesEast' : 'movesWest';
}

/* ================================================================
   Canvas
   ================================================================ */
const SCENE = { w: 600, h: 340 };
let shell;
let drawQueued = false;
let walkPhase = 0;
const canvas = document.getElementById('stage');
const view = setupCanvas(canvas, { width: SCENE.w, height: SCENE.h, maxHeightVh: () => (window.innerWidth < 880 ? 46 : 72), onResize: () => requestDraw() });
function requestDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; draw(); });
}
onThemeChange(() => requestDraw());

const loop = createLoop({
  step(dt) {
    if (!shell) return false;
    return stepTab(shell.tab, dt);
  },
  render() { draw(); updateMeasures(); },
});

function stepTab(tab, dt) {
  walkPhase += dt;
  if (tab === 'relativity') {
    const st = S.relativity;
    st.t += dt;
    if (st.pedal) {
      st.x += R1.v * dt;
      if (st.x >= R1.xEnd) { st.x = R1.xEnd; st.ended = true; syncPlay(false); return false; }
    }
    return true;
  }
  if (tab === 'bus') {
    const st = S.bus;
    st.t = (st.t + dt) % R2.period;
    return true;
  }
  if (tab === 'trajectory') {
    const st = S.trajectory;
    if (!st.run) return false;
    const h = dt * (st.slow ? 0.25 : 1);
    const a = (5 / 7) * G * Math.sin((st.angle * Math.PI) / 180);
    const m = st.m;
    m.vx += a * h;
    m.x += m.vx * h;
    m.y += m.vy * h;
    st.time += h;
    let hitEdge = false;
    const r = GLASS.r;
    if (m.x < r) { m.x = r; hitEdge = true; }
    if (m.x > GLASS.L - r) { m.x = GLASS.L - r; hitEdge = true; }
    if (m.y < r) { m.y = r; hitEdge = true; }
    if (m.y > GLASS.W - r) { m.y = GLASS.W - r; hitEdge = true; }
    const last = st.path[st.path.length - 1];
    if (!last || Math.hypot(m.x - last[0], m.y - last[1]) > 0.002) st.path.push([m.x, m.y]);
    while (st.time >= st.nextDot - 1e-9) { st.marks.push([m.x, m.y]); st.nextDot += DOT_DT; }
    if (hitEdge) { st.run = false; st.stopped = true; refresh(); return false; }
    return true;
  }
  return false;
}

/* ================================================================
   Drawing helpers
   ================================================================ */
function tree(ctx, x, y) {
  ctx.fillStyle = cssVar('--wood');
  ctx.fillRect(x - 6, y - 60, 12, 60);
  ctx.fillStyle = cssVar('--s6');
  for (const [dx, dy, r] of [[0, -92, 30], [-20, -74, 22], [20, -74, 22], [0, -66, 20]]) {
    ctx.beginPath(); ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2); ctx.fill();
  }
}

function bicycleWithBoy(ctx, x, y, phase, pedal) {
  const wr = 17, wb = 58;
  const xr = x - wb / 2, xf = x + wb / 2, yw = y - wr;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // wheels
  ctx.strokeStyle = cssVar('--wire');
  ctx.lineWidth = 3;
  for (const cx of [xr, xf]) {
    ctx.beginPath(); ctx.arc(cx, yw, wr, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 4; i++) {
      const a = phase * 3 + (i * Math.PI) / 4;
      ctx.beginPath(); ctx.moveTo(cx - Math.cos(a) * wr, yw - Math.sin(a) * wr); ctx.lineTo(cx + Math.cos(a) * wr, yw + Math.sin(a) * wr); ctx.stroke();
    }
    ctx.lineWidth = 3;
  }
  // frame
  const crank = { x: x - 4, y: yw };
  const seat = { x: x - 10, y: yw - 30 };
  const bar = { x: xf - 6, y: yw - 34 };
  ctx.strokeStyle = cssVar('--s2');
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(xr, yw); ctx.lineTo(crank.x, crank.y); ctx.lineTo(seat.x, seat.y); ctx.lineTo(xr, yw);
  ctx.moveTo(crank.x, crank.y); ctx.lineTo(bar.x - 4, seat.y + 2); ctx.lineTo(seat.x, seat.y);
  ctx.moveTo(xf, yw); ctx.lineTo(bar.x, bar.y);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(bar.x - 8, bar.y - 2); ctx.lineTo(bar.x + 6, bar.y - 4); ctx.stroke();
  // boy
  const skin = cssVar('--skin');
  const boyC = cssVar('--s1');
  const hip = { x: seat.x, y: seat.y - 4 };
  const sh = { x: seat.x + 10, y: seat.y - 34 };
  const a = pedal ? phase * 5 : 0.6;
  const pedalPts = [0, Math.PI].map((d) => ({ x: crank.x + Math.cos(a + d) * 9, y: crank.y + Math.sin(a + d) * 9 }));
  ctx.strokeStyle = cssVar('--s5');
  ctx.lineWidth = 5;
  for (const p of pedalPts) {
    // simple two-segment leg with the knee forward
    const mx = (hip.x + p.x) / 2 + 9, my = (hip.y + p.y) / 2 - 4;
    ctx.beginPath(); ctx.moveTo(hip.x, hip.y); ctx.lineTo(mx, my); ctx.lineTo(p.x, p.y); ctx.stroke();
  }
  ctx.strokeStyle = boyC;
  ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(hip.x, hip.y); ctx.lineTo(sh.x, sh.y); ctx.stroke();
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(sh.x, sh.y + 3); ctx.lineTo(bar.x - 4, bar.y - 2); ctx.stroke();
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(sh.x + 3, sh.y - 10, 7, 0, Math.PI * 2); ctx.fill();
  return { headX: sh.x + 3, headY: sh.y - 18 };
}

function refPin(ctx, x, yTop) {
  const c = cssVar('--accent');
  ctx.fillStyle = c;
  ctx.strokeStyle = c;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, yTop + 22); ctx.lineTo(x, yTop + 4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, yTop + 30); ctx.lineTo(x - 6, yTop + 20); ctx.lineTo(x + 6, yTop + 20); ctx.closePath(); ctx.fill();
  label(ctx, t('refPin'), x, yTop - 4, { size: 12, weight: 700, color: c });
}

function sky(ctx, groundY) {
  ctx.fillStyle = cssVar('--sky');
  roundRect(ctx, 8, 8, SCENE.w - 16, groundY - 8, 12);
  ctx.fill();
  ctx.fillStyle = cssVar('--grass');
  ctx.fillRect(8, groundY, SCENE.w - 16, SCENE.h - groundY - 8);
}

/* ================================================================
   Tab 1 — relativity
   ================================================================ */
function shift1() {
  const st = S.relativity;
  return st.ref === 'ground' ? 0 : st.x - R1.bikeX0;
}
function drawRelativity(ctx) {
  const st = S.relativity;
  const gy = R1.groundY;
  const sh = shift1();
  const sx = (xm) => 30 + (xm - sh) * R1.k;
  sky(ctx, gy);
  // road and dashes (fixed to the ground, so they move when the reference moves)
  ctx.fillStyle = cssVar('--road');
  ctx.fillRect(8, gy, SCENE.w - 16, 26);
  ctx.strokeStyle = cssVar('--road-line');
  ctx.lineWidth = 3;
  const first = Math.floor(sh) - 2;
  for (let m = first; m < first + 34; m += 2) {
    const x = sx(m);
    if (x < 8 || x > SCENE.w - 20) continue;
    ctx.beginPath(); ctx.moveTo(x, gy + 13); ctx.lineTo(Math.min(x + 12, SCENE.w - 8), gy + 13); ctx.stroke();
  }
  // bushes every 7 m
  ctx.fillStyle = cssVar('--s6');
  for (let m = Math.floor((sh - 4) / 7) * 7; m < sh + 36; m += 7) {
    const x = sx(m + 3);
    if (x < 20 || x > SCENE.w - 20 || Math.abs(m + 3 - R1.treeX) < 2) continue;
    ctx.beginPath(); ctx.arc(x, gy - 4, 8, Math.PI, 0); ctx.fill();
  }
  // tree
  const tx = sx(R1.treeX);
  if (tx > -40 && tx < SCENE.w + 40) tree(ctx, tx, gy);
  // bicycle and boy
  const bx = sx(st.x);
  const head = bicycleWithBoy(ctx, bx, gy + 6, st.pedal ? walkPhase : 0, st.pedal);
  // reference pin
  if (st.ref === 'ground') { if (tx > 10 && tx < SCENE.w - 10) refPin(ctx, tx, gy - 160); } else if (st.ref === 'bike') refPin(ctx, bx + 26, gy - 104);
  else refPin(ctx, head.headX, head.headY - 40);
  // distance boy – tree
  const d = Math.abs(R1.treeX - st.x);
  const y = gy + 46;
  const x1 = Math.max(14, Math.min(bx, tx)), x2 = Math.min(SCENE.w - 14, Math.max(bx, tx));
  ctx.strokeStyle = cssVar('--text');
  ctx.fillStyle = cssVar('--text');
  ctx.lineWidth = 1.5;
  if (x2 - x1 > 16) {
    arrow(ctx, (x1 + x2) / 2, y, x1, y, 7);
    arrow(ctx, (x1 + x2) / 2, y, x2, y, 7);
  }
  label(ctx, t('dLabel', { d: qty(d, 1, 'm') }), (x1 + x2) / 2, y - 12, { size: 13 });
}

/* ================================================================
   Tab 2 — bus
   ================================================================ */
function busState(tm) {
  const rear = R2.busRear0 + R2.vBus * tm;
  return { rear, xB: rear + R2.seatB, xC: rear + R2.c0 - R2.vC * tm, xA: R2.xA };
}
function obsX(obs, tm) {
  const b = busState(tm);
  if (obs === 'A' || obs === 'ground') return 0;
  if (obs === 'B' || obs === 'bus') return b.xB - (R2.busRear0 + R2.seatB);
  return b.xC - (R2.busRear0 + R2.c0);
}
function drawBus(ctx) {
  const st = S.bus;
  const gy = R2.roadY;
  const b = busState(st.t);
  const sh = obsX(st.obs, st.t);
  const sx = (xm) => 24 + (xm - sh) * R2.k;
  sky(ctx, gy - 14);
  ctx.fillStyle = cssVar('--road');
  ctx.fillRect(8, gy - 14, SCENE.w - 16, 40);
  ctx.strokeStyle = cssVar('--road-line');
  ctx.lineWidth = 3;
  const first = Math.floor(sh / 3) * 3 - 3;
  for (let m = first; m < first + 60; m += 3) {
    const x = sx(m);
    if (x < 8 || x > SCENE.w - 20) continue;
    ctx.beginPath(); ctx.moveTo(x, gy + 22); ctx.lineTo(Math.min(x + 16, SCENE.w - 8), gy + 22); ctx.stroke();
  }
  // houses every 16 m (fixed to the ground)
  for (let m = Math.floor((sh - 10) / 16) * 16; m < sh + 60; m += 16) {
    const x = sx(m + 8);
    if (x < -30 || x > SCENE.w + 30) continue;
    ctx.fillStyle = cssVar('--s4');
    ctx.fillRect(x - 18, gy - 64, 36, 50);
    ctx.fillStyle = cssVar('--s1');
    ctx.beginPath(); ctx.moveTo(x - 22, gy - 64); ctx.lineTo(x, gy - 84); ctx.lineTo(x + 22, gy - 64); ctx.closePath(); ctx.fill();
    ctx.fillStyle = cssVar('--sky');
    ctx.fillRect(x - 10, gy - 52, 8, 10); ctx.fillRect(x + 3, gy - 52, 8, 10);
  }
  // bus
  const x0 = sx(b.rear), x1 = sx(b.rear + R2.busLen);
  const top = gy - 96, bottom = gy - 4;
  ctx.fillStyle = cssVar('--bus');
  roundRect(ctx, x0, top, x1 - x0, bottom - top, 10);
  ctx.fill();
  ctx.fillStyle = 'rgba(220, 238, 252, 0.85)';
  roundRect(ctx, x0 + 8, top + 10, x1 - x0 - 16, 46, 6);
  ctx.fill();
  ctx.fillStyle = cssVar('--wire');
  for (const xm of [b.rear + 2.2, b.rear + R2.busLen - 2.2]) {
    ctx.beginPath(); ctx.arc(sx(xm), bottom, 11, 0, Math.PI * 2); ctx.fill();
  }
  // seat of B
  ctx.fillStyle = cssVar('--s3');
  ctx.fillRect(sx(b.xB) - 6, gy - 50, 16, 8);
  // people (inside the bus they stand on the floor at gy - 20)
  const walk = walkPhase * 6;
  person(ctx, sx(b.xB), gy - 22, { color: cssVar('--s2'), h: 40, sit: true, name: 'B', face: 1 });
  person(ctx, sx(b.xC), gy - 22, { color: cssVar('--s5'), h: 40, walk, name: 'C', face: -1 });
  person(ctx, sx(b.xA), gy - 12, { color: cssVar('--s1'), h: 48, name: 'A', face: -1 });
  // velocity arrows relative to the observer
  const items = [['A', sx(b.xA), gy - 92], ['B', sx(b.xB), gy - 112], ['C', sx(b.xC), gy - 130]];
  for (const [who, x, y] of items) {
    if (who === st.obs || (st.obs === 'bus' && who === 'B') || (st.obs === 'ground' && who === 'A')) {
      refPin(ctx, x, y - 34);
      continue;
    }
    const v = V2[who] - V2[st.obs];
    const color = cssVar('--current');
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 3;
    if (Math.abs(v) < 1e-9) { ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); } else arrow(ctx, x, y, x + v * 12, y, 9);
  }
  if (st.obs === 'bus') refPin(ctx, sx(b.rear + R2.busLen) - 18, top - 38);
  if (st.obs === 'ground') refPin(ctx, sx(R2.xA + 9), gy - 70);
  // compass
  compassEW(ctx, SCENE.w - 70, 30);
}
function compassEW(ctx, x, y) {
  ctx.strokeStyle = cssVar('--text'); ctx.fillStyle = cssVar('--text'); ctx.lineWidth = 2;
  arrow(ctx, x, y, x + 34, y, 7);
  arrow(ctx, x, y, x - 34, y, 7);
  label(ctx, t('west'), x - 46, y, { size: 13, weight: 800 });
  label(ctx, t('east'), x + 46, y, { size: 13, weight: 800 });
}

/* ================================================================
   Tab 3 — position on the highway
   ================================================================ */
const P3 = { x0: 52, x1: 548, y: 196 };
const kmX = (km) => P3.x0 + (km / KM_END) * (P3.x1 - P3.x0);
const xKm = (x) => ((x - P3.x0) / (P3.x1 - P3.x0)) * KM_END;
const townKm = (id) => TOWNS.find((tw) => tw.id === id).km;

function signLines(st) {
  const lines = [];
  const ahead = (km) => (st.dir === 'saida' ? km - st.km : st.km - km);
  const dam = ahead(townKm('damour'));
  if (dam > 0.01) lines.push(['damour', dam]);
  const endId = st.dir === 'saida' ? 'saida' : 'beirut';
  const end = ahead(townKm(endId));
  if (end > 0.01) lines.push([endId, end]);
  return lines;
}

function drawPosition(ctx) {
  const st = S.position;
  ctx.fillStyle = cssVar('--land');
  roundRect(ctx, 8, 8, SCENE.w - 16, SCENE.h - 16, 12);
  ctx.fill();
  // sea (to the West of the coastal road)
  ctx.fillStyle = cssVar('--sea');
  ctx.beginPath();
  ctx.moveTo(8, 20); ctx.lineTo(SCENE.w - 8, 20); ctx.lineTo(SCENE.w - 8, 110);
  for (let x = SCENE.w - 8; x >= 8; x -= 20) ctx.lineTo(x, 112 + Math.sin(x / 37) * 8);
  ctx.closePath(); ctx.fill();
  const seaX = kmX(st.km) < 300 ? 440 : 160;
  label(ctx, t('sea'), seaX, 98, { size: 13, weight: 600, color: cssVar('--water-dark'), halo: false });
  // north arrow (Beirut is north of Saida), bottom-right corner
  ctx.strokeStyle = cssVar('--text'); ctx.fillStyle = cssVar('--text'); ctx.lineWidth = 2;
  arrow(ctx, 540, 312, 500, 312, 7);
  label(ctx, t('north'), 486, 312, { size: 13, weight: 800 });
  // road
  ctx.strokeStyle = cssVar('--road'); ctx.lineWidth = 16; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(P3.x0, P3.y); ctx.lineTo(P3.x1, P3.y); ctx.stroke();
  ctx.strokeStyle = cssVar('--road-line'); ctx.lineWidth = 2; ctx.setLineDash([10, 10]);
  ctx.beginPath(); ctx.moveTo(P3.x0, P3.y); ctx.lineTo(P3.x1, P3.y); ctx.stroke();
  ctx.setLineDash([]);
  // towns
  for (const tw of TOWNS) {
    const x = kmX(tw.km);
    const isOrigin = tw.id === st.origin;
    ctx.fillStyle = isOrigin ? cssVar('--accent') : cssVar('--text');
    ctx.beginPath(); ctx.arc(x, P3.y, isOrigin ? 7 : 5, 0, Math.PI * 2); ctx.fill();
    const up = tw.id === 'naame' || tw.id === 'jieh';
    label(ctx, t(`town.${tw.id}`), x, up ? P3.y - 26 : P3.y + 26, { size: 13, weight: isOrigin ? 800 : 600, color: isOrigin ? cssVar('--accent') : cssVar('--text') });
  }
  // ruler of distances from the origin
  const o = townKm(st.origin);
  const ry = 262;
  ctx.strokeStyle = cssVar('--muted'); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(P3.x0, ry); ctx.lineTo(P3.x1, ry); ctx.stroke();
  for (let km = 0; km <= KM_END; km++) {
    const x = kmX(km);
    const dd = Math.abs(km - o);
    const major = dd % 5 === 0;
    ctx.beginPath(); ctx.moveTo(x, ry); ctx.lineTo(x, ry + (major ? 9 : 5)); ctx.stroke();
    if (major) label(ctx, String(dd), x, ry + 19, { size: 11, weight: 500, color: cssVar('--muted'), halo: false });
  }
  label(ctx, `${t('kmRuler')} (km)`, P3.x0, ry - 12, { size: 11, weight: 600, color: cssVar('--muted'), align: 'left', halo: false });
  // car
  const cx = kmX(st.km);
  const dirSign = st.dir === 'saida' ? 1 : -1;
  ctx.fillStyle = cssVar('--s2');
  roundRect(ctx, cx - 14, P3.y - 8, 28, 16, 5);
  ctx.fill();
  ctx.fillStyle = 'rgba(220, 238, 252, 0.9)';
  ctx.fillRect(cx + dirSign * 4 - 4, P3.y - 6, 8, 12);
  ctx.strokeStyle = cssVar('--current'); ctx.fillStyle = cssVar('--current'); ctx.lineWidth = 3;
  arrow(ctx, cx + dirSign * 16, P3.y - 18, cx + dirSign * 40, P3.y - 18, 8);
  // distance from the origin along the road
  if (Math.abs(st.km - o) > 0.01) {
    const y = 230;
    ctx.strokeStyle = cssVar('--accent'); ctx.fillStyle = cssVar('--accent'); ctx.lineWidth = 2;
    const xa = kmX(o), xb = cx;
    arrow(ctx, xa, y, xb, y, 7);
    const dd = Math.abs(st.km - o);
    label(ctx, qty(dd, dd % 1 ? 1 : 0, 'km'), (xa + xb) / 2, y - 11, { size: 12, weight: 700, color: cssVar('--accent') });
  }
  drawSign(ctx, st);
}
function drawSign(ctx, st) {
  const lines = signLines(st);
  if (!lines.length) return;
  const w = 168, h = 26 + lines.length * 24;
  const x = Math.max(16, Math.min(SCENE.w - w - 16, kmX(st.km) - w / 2));
  const y = 22;
  ctx.fillStyle = '#1f7a4a';
  roundRect(ctx, x, y, w, h, 6); ctx.fill();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
  roundRect(ctx, x + 3, y + 3, w - 6, h - 6, 4); ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = font(10, 600); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(t('signTitle'), x + 10, y + 13);
  lines.forEach(([id, d], i) => {
    const yy = y + 34 + i * 24;
    ctx.font = font(15, 700); ctx.textAlign = 'left';
    ctx.fillText(t(`town.${id}`), x + 12, yy);
    ctx.textAlign = 'right';
    ctx.fillText(qty(d, d % 1 ? 1 : 0, 'km'), x + w - 12, yy);
  });
}

/* ================================================================
   Tab 4 — trajectory on the blackened glass sheet
   ================================================================ */
const gx = (x) => GLASS.x0 + x * GLASS.k;
const gy = (y) => GLASS.y0 + y * GLASS.k;
function drawTrajectory(ctx) {
  const st = S.trajectory;
  ctx.fillStyle = cssVar('--bench');
  roundRect(ctx, 8, 8, SCENE.w - 16, SCENE.h - 16, 12);
  ctx.fill();
  // glass sheet (top view), blackened with soot
  const W = GLASS.L * GLASS.k, H = GLASS.W * GLASS.k;
  ctx.fillStyle = cssVar('--soot');
  ctx.fillRect(gx(0), gy(0), W, H);
  ctx.strokeStyle = cssVar('--glass-stroke'); ctx.lineWidth = 2;
  ctx.strokeRect(gx(0), gy(0), W, H);
  label(ctx, t('glassTop'), gx(GLASS.L / 2), gy(GLASS.W) + 13, { size: 11, weight: 600, color: cssVar('--text'), halo: false });
  label(ctx, `▲ ${t('high')}`, gx(0) + 4, gy(0) - 12, { size: 11, weight: 600, align: 'left', halo: false });
  label(ctx, `${t('low')} ▼`, gx(GLASS.L) - 4, gy(0) - 12, { size: 11, weight: 600, align: 'right', halo: false });
  // old traces then the current one: the marble wipes the soot
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const p of st.old) tracePath(ctx, p, 'rgba(242, 242, 242, 0.45)');
  tracePath(ctx, st.path, cssVar('--trace'));
  if (st.dots) {
    ctx.fillStyle = cssVar('--s4');
    for (const [x, y] of st.marks) { ctx.beginPath(); ctx.arc(gx(x), gy(y), 4, 0, Math.PI * 2); ctx.fill(); }
  }
  // marble
  const m = st.m;
  const r = GLASS.r * GLASS.k;
  const grad = ctx.createRadialGradient(gx(m.x) - r / 3, gy(m.y) - r / 3, 1, gx(m.x), gy(m.y), r);
  grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, cssVar('--marble'));
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(gx(m.x), gy(m.y), r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#7a8594'; ctx.lineWidth = 1; ctx.stroke();
  // push arrow
  if (st.drag) {
    ctx.strokeStyle = cssVar('--current'); ctx.fillStyle = cssVar('--current'); ctx.lineWidth = 3;
    arrow(ctx, gx(m.x), gy(m.y), gx(m.x) + st.drag.dx, gy(m.y) + st.drag.dy, 10);
  }
  drawSideView(ctx, st.angle);
}
function tracePath(ctx, p, color) {
  if (p.length < 2) return;
  ctx.strokeStyle = color; ctx.lineWidth = 3;
  ctx.beginPath();
  p.forEach(([x, y], i) => (i ? ctx.lineTo(gx(x), gy(y)) : ctx.moveTo(gx(x), gy(y))));
  ctx.stroke();
}
function drawSideView(ctx, angle) {
  // small inset at the bottom-left: pile of books, glass sheet and the inclination α
  const x0 = 16, y0 = 292, len = 72;
  label(ctx, t('sideView'), x0 + 46, y0 - 66, { size: 11, weight: 700, halo: false });
  const a = (angle * Math.PI) / 180;
  const hgt = Math.sin(a) * len;
  ctx.fillStyle = cssVar('--book');
  const nb = Math.max(1, Math.round(hgt / 8));
  for (let i = 0; i < nb; i++) { ctx.fillStyle = i % 2 ? cssVar('--copybook') : cssVar('--book'); ctx.fillRect(x0, y0 - (i + 1) * (hgt / nb), 22, hgt / nb - 1); }
  label(ctx, t('books'), x0 + 11, y0 + 12, { size: 10, weight: 600, halo: false });
  ctx.strokeStyle = cssVar('--glass-stroke'); ctx.lineWidth = 4;
  const xe = x0 + 22 + Math.cos(a) * len;
  ctx.beginPath(); ctx.moveTo(x0 + 22, y0 - hgt); ctx.lineTo(xe, y0); ctx.stroke();
  ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + 22 + len + 4, y0); ctx.stroke();
  ctx.beginPath(); ctx.arc(xe, y0, 22, Math.PI, Math.PI + a, false); ctx.stroke();
  label(ctx, 'α', xe - 30, y0 - 6, { size: 12, weight: 700, halo: false });
}

/* ================================================================
   Draw dispatcher
   ================================================================ */
function draw() {
  if (!shell) return;
  const ctx = view.begin();
  ctx.fillStyle = cssVar('--scene-bg');
  ctx.fillRect(0, 0, SCENE.w, SCENE.h);
  if (shell.tab === 'relativity') drawRelativity(ctx);
  else if (shell.tab === 'bus') drawBus(ctx);
  else if (shell.tab === 'position') drawPosition(ctx);
  else drawTrajectory(ctx);
}

/* ================================================================
   Pointer (car drag, marble push)
   ================================================================ */
let dragging = null;
canvas.addEventListener('pointerdown', (ev) => {
  if (!shell) return;
  const p = view.toLogical(ev);
  if (shell.tab === 'position') {
    const st = S.position;
    if (Math.abs(p.y - P3.y) < 40 && p.x > P3.x0 - 20 && p.x < P3.x1 + 20) {
      dragging = 'car';
      canvas.setPointerCapture(ev.pointerId);
      setCarKm(xKm(p.x));
    }
    void st;
  } else if (shell.tab === 'trajectory') {
    const st = S.trajectory;
    if (st.mode !== 'push' || st.run) return;
    if (st.stopped || st.time > 0) resetMarble();
    const m = st.m;
    if (Math.hypot(p.x - gx(m.x), p.y - gy(m.y)) < 40) {
      dragging = 'marble';
      st.drag = { dx: 0, dy: 0 };
      canvas.setPointerCapture(ev.pointerId);
      requestDraw();
    }
  }
});
canvas.addEventListener('pointermove', (ev) => {
  if (!dragging) return;
  const p = view.toLogical(ev);
  if (dragging === 'car') setCarKm(xKm(p.x));
  else if (dragging === 'marble') {
    const st = S.trajectory;
    let dx = p.x - gx(st.m.x), dy = p.y - gy(st.m.y);
    const len = Math.hypot(dx, dy), max = 120;
    if (len > max) { dx *= max / len; dy *= max / len; }
    st.drag = { dx, dy };
    requestDraw();
  }
});
function endDrag() {
  if (dragging === 'marble') {
    const st = S.trajectory;
    const { dx, dy } = st.drag || { dx: 0, dy: 0 };
    st.drag = null;
    const len = Math.hypot(dx, dy);
    if (len > 8) {
      const v = (len / 120) * VMAX;
      st.m.vx = (dx / len) * v;
      st.m.vy = (dy / len) * v;
      launch();
    } else requestDraw();
  }
  dragging = null;
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

function setCarKm(km) {
  S.position.km = Math.max(0, Math.min(KM_END, Math.round(km * 2) / 2));
  refresh();
}

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
  box.textContent = t(fb.key);
}
function playRow(tab) {
  ui.play = createButton({ labelKey: 'ui.play', variant: 'primary', onClick: () => togglePlay() });
  return el('div', { class: 'btn-row' }, [ui.play, createButton({ labelKey: 'ui.reset', variant: 'ghost', onClick: () => resetTab(tab) })]);
}
function syncPlay(running) {
  if (!ui.play) return;
  ui.play.dataset.i18n = running ? 'ui.pause' : 'ui.play';
  ui.play.textContent = t(ui.play.dataset.i18n);
}
function togglePlay() {
  if (loop.running) { loop.stop(); syncPlay(false); return; }
  if (shell.tab === 'relativity' && S.relativity.ended) return;
  loop.start(); syncPlay(true);
}

/* ---------- Tab 1 ---------- */
function buildRelativity() {
  const st = S.relativity;
  ui.boy = createSegmented({
    labelKey: 'ctl.boy',
    options: [{ value: 'still', labelKey: 'boy.still' }, { value: 'pedal', labelKey: 'boy.pedal' }],
    value: st.pedal ? 'pedal' : 'still',
    onChange: (v) => { st.pedal = v === 'pedal'; refresh(); },
  });
  ui.ref = createSegmented({
    labelKey: 'ctl.reference',
    options: [{ value: 'ground', labelKey: 'ref.ground' }, { value: 'bike', labelKey: 'ref.bike' }, { value: 'boy', labelKey: 'ref.boy' }],
    value: st.ref,
    onChange: (v) => { st.ref = v; refresh(); },
  });
  controlsBody.append(ui.boy.root, ui.ref.root, playRow('relativity'));
  ui.dl = el('dl', { class: 'meas' });
  ui.status = statusBox();
  measuresBody.append(ui.dl, ui.status);
}
function updateRelativity() {
  const st = S.relativity;
  ui.boy.set(st.pedal ? 'pedal' : 'still');
  ui.ref.set(st.ref);
  const moving = st.pedal && !st.ended;
  const m = (b) => t(b ? 'inMotion' : 'atRest');
  measRows(ui.dl, [
    [t('m.reference'), t(`ref.${st.ref}`)],
    [t('m.time'), qty(st.t, 1, 's')],
    [t('m.dTree'), qty(Math.abs(R1.treeX - st.x), 1, 'm')],
    [t('m.dBike'), qty(0, 0, 'm')],
    [t('m.boyTree'), m(moving), moving ? 'warn-text' : 'good-text'],
    [t('m.boyBike'), m(false), 'good-text'],
    [t('m.treeBoy'), m(moving), moving ? 'warn-text' : 'good-text'],
  ]);
  showStatus(ui.status, st.ended ? { type: 'warn', key: 'fb.endRoad' } : (!st.pedal && st.t > 0 ? { key: 'fb.noMove' } : null));
}

/* ---------- Tab 2 ---------- */
const OBS = ['A', 'B', 'C', 'ground', 'bus'];
function buildBus() {
  const st = S.bus;
  ui.obs = createSegmented({
    labelKey: 'ctl.observer',
    options: OBS.map((o) => ({ value: o, labelKey: `obs.${o}` })),
    value: st.obs,
    onChange: (v) => { st.obs = v; refresh(); },
  });
  controlsBody.append(ui.obs.root, playRow('bus'), el('p', { class: 'muted', style: 'font-size:0.88rem;margin:10px 0 0', dataset: { i18n: 'hint.bus' } }, t('hint.bus')));
  ui.table = el('table', { class: 'data' });
  measuresBody.append(ui.table);
}
function updateBus() {
  const st = S.bus;
  ui.obs.set(st.obs);
  const rows = [['A', 'who.A'], ['B', 'who.B'], ['C', 'who.C'], ['bus', 'who.bus'], ['ground', 'who.ground']];
  const isSelf = (who) => who === st.obs || (st.obs === 'bus' && who === 'B') || (st.obs === 'B' && who === 'bus')
    || (st.obs === 'ground' && who === 'A') || (st.obs === 'A' && who === 'ground');
  const head = el('tr', {}, [el('th', {}, t('col.who')), el('th', {}, t('col.motion'))]);
  const body = rows.map(([who, key]) => {
    const self = who === st.obs;
    const txt = self ? t('observerSelf') : t(relMotion(who, st.obs));
    const cls = self ? 'muted' : (isSelf(who) ? 'good-text' : '');
    return el('tr', {}, [el('td', {}, t(key)), el('td', { class: cls }, txt)]);
  });
  ui.table.replaceChildren(el('thead', {}, head), el('tbody', {}, body));
}

/* ---------- Tab 3 ---------- */
function buildPosition() {
  const st = S.position;
  ui.origin = createSegmented({
    labelKey: 'ctl.origin',
    options: ORIGINS.map((o) => ({ value: o, labelKey: `town.${o}` })),
    value: st.origin,
    onChange: (v) => { st.origin = v; refresh(); },
  });
  ui.dir = createSegmented({
    labelKey: 'ctl.direction',
    options: [{ value: 'saida', labelKey: 'dir.saida' }, { value: 'beirut', labelKey: 'dir.beirut' }],
    value: st.dir,
    onChange: (v) => { st.dir = v; refresh(); },
  });
  ui.km = createSlider({ labelKey: 'ctl.carPos', min: 0, max: KM_END, step: 0.5, value: st.km, unit: 'km', decimals: 1, onInput: (v) => { st.km = v; refresh(); } });
  controlsBody.append(
    el('div', { class: 'btn-row', style: 'margin-bottom:12px' }, [
      createButton({ labelKey: 'ctl.fig2a', variant: 'primary', onClick: () => { Object.assign(st, { km: townKm('naame'), dir: 'saida' }); refresh(); } }),
      createButton({ labelKey: 'ctl.fig2b', variant: 'primary', onClick: () => { Object.assign(st, { km: townKm('jieh'), dir: 'beirut' }); refresh(); } }),
    ]),
    ui.origin.root, ui.dir.root, ui.km.root,
    el('div', { class: 'btn-row' }, [createButton({ labelKey: 'ui.reset', variant: 'ghost', onClick: () => resetTab('position') })]),
    el('p', { class: 'muted', style: 'font-size:0.88rem;margin:10px 0 0', dataset: { i18n: 'hint.drag' } }, t('hint.drag')),
  );
  ui.dl = el('dl', { class: 'meas' });
  measuresBody.append(ui.dl);
}
function placeName(km) {
  const at = TOWNS.find((tw) => Math.abs(tw.km - km) < 0.26);
  if (at) return t(`town.${at.id}`);
  let a = TOWNS[0], b = TOWNS[TOWNS.length - 1];
  for (let i = 0; i < TOWNS.length - 1; i++) if (km > TOWNS[i].km && km < TOWNS[i + 1].km) { a = TOWNS[i]; b = TOWNS[i + 1]; }
  return t('m.between', { a: t(`town.${a.id}`), b: t(`town.${b.id}`) });
}
function updatePosition() {
  const st = S.position;
  ui.origin.set(st.origin);
  ui.dir.set(st.dir);
  ui.km.set(st.km);
  const o = townKm(st.origin);
  const d = Math.abs(st.km - o);
  const side = d < 0.01 ? 'side.at' : (st.km > o ? 'side.saida' : 'side.beirut');
  const dTxt = qty(d, d % 1 ? 1 : 0, 'km');
  const oName = t(`town.${st.origin}`);
  measRows(ui.dl, [
    [t('m.origin'), oName],
    [t('m.distOrigin'), dTxt],
    [t('m.side'), t(side)],
    [t('m.direction'), t('dir.to', { town: t(`dir.${st.dir}`) })],
    [t('m.place'), placeName(st.km)],
    [t('m.position'), d < 0.01 ? t('pos.atOrigin', { o: oName }) : t('pos.text', { d: dTxt, o: oName, side: t(side) }), 'good-text'],
  ]);
}

/* ---------- Tab 4 ---------- */
function resetMarble() {
  const st = S.trajectory;
  if (st.path.length > 1) { st.old.push(st.path); if (st.old.length > 6) st.old.shift(); }
  st.m = { ...MARBLE0, vx: 0, vy: 0 };
  st.path = []; st.marks = []; st.time = 0; st.nextDot = 0; st.run = false; st.stopped = false; st.straight = null;
}
function launch() {
  const st = S.trajectory;
  st.straight = Math.abs(st.m.vy) < 1e-6;
  st.path = [[st.m.x, st.m.y]];
  st.marks = [];
  st.time = 0; st.nextDot = 0;
  st.run = true;
  loop.start();
  refresh();
}
function buildTrajectory() {
  const st = S.trajectory;
  ui.mode = createSegmented({
    labelKey: 'ctl.mode',
    options: [{ value: 'release', labelKey: 'mode.release' }, { value: 'push', labelKey: 'mode.push' }],
    value: st.mode,
    onChange: (v) => { st.mode = v; if (!st.run) resetMarble(); refresh(); shell.refreshActivity(); },
  });
  ui.angle = createSlider({ labelKey: 'ctl.angle', min: 4, max: 20, step: 1, value: st.angle, unit: '°', decimals: 0, onInput: (v) => { st.angle = v; requestDraw(); updateMeasures(); } });
  ui.dots = createSegmented({
    labelKey: 'ctl.dots',
    options: [{ value: 'off', labelKey: 'hide' }, { value: 'on', labelKey: 'show' }],
    value: st.dots ? 'on' : 'off',
    onChange: (v) => { st.dots = v === 'on'; refresh(); },
  });
  ui.speed = createSegmented({
    labelKey: 'ctl.speed',
    options: [{ value: 'normal', labelKey: 'speed.normal' }, { value: 'slow', labelKey: 'speed.slow' }],
    value: st.slow ? 'slow' : 'normal',
    onChange: (v) => { st.slow = v === 'slow'; refresh(); },
  });
  ui.release = createButton({ labelKey: 'ctl.release', variant: 'primary', onClick: () => { if (st.run) return; resetMarble(); launch(); } });
  ui.hint = el('p', { class: 'muted', style: 'font-size:0.88rem;margin:10px 0 0', dataset: { i18n: 'hint.push' } }, t('hint.push'));
  controlsBody.append(ui.mode.root, ui.angle.root, ui.dots.root, ui.speed.root,
    el('div', { class: 'btn-row' }, [
      ui.release,
      createButton({ labelKey: 'ctl.clean', variant: 'secondary', onClick: () => { loop.stop(); resetMarble(); st.old = []; st.path = []; refresh(); } }),
      createButton({ labelKey: 'ui.reset', variant: 'ghost', onClick: () => resetTab('trajectory') }),
    ]), ui.hint);
  ui.dl = el('dl', { class: 'meas' });
  measuresBody.append(ui.dl);
}
function updateTrajectory() {
  const st = S.trajectory;
  ui.mode.set(st.mode);
  ui.angle.set(st.angle);
  ui.dots.set(st.dots ? 'on' : 'off');
  ui.speed.set(st.slow ? 'slow' : 'normal');
  ui.release.hidden = st.mode !== 'release';
  ui.hint.hidden = st.mode !== 'push';
  ui.angle.setDisabled(st.run);
  const state = st.run ? 'state.moving' : (st.stopped ? 'state.stopped' : 'state.ready');
  const shape = st.straight == null || st.marks.length < 2 ? 'shape.none' : (st.straight ? 'shape.straight' : 'shape.curved');
  measRows(ui.dl, [
    [t('m.angle'), `${num(st.angle, 0)}°`],
    [t('m.state'), t(state)],
    [t('m.time'), qty(st.time, 2, 's')],
    [t('m.positions'), num(st.marks.length, 0)],
    [t('m.shape'), t(shape), shape === 'shape.none' ? '' : 'good-text'],
  ]);
}

/* ---------- Tab switching / reset ---------- */
function buildTab(id) {
  loop.stop();
  controlsBody.replaceChildren();
  measuresBody.replaceChildren();
  ui = {};
  if (id === 'relativity') buildRelativity();
  else if (id === 'bus') buildBus();
  else if (id === 'position') buildPosition();
  else buildTrajectory();
  refresh();
}
function updateMeasures() {
  if (!shell || !ui.dl && !ui.table) return;
  if (shell.tab === 'relativity') updateRelativity();
  else if (shell.tab === 'bus') updateBus();
  else if (shell.tab === 'position') updatePosition();
  else updateTrajectory();
}
function refresh() { updateMeasures(); requestDraw(); }
function resetTab(id) {
  S[id] = initialState()[id];
  walkPhase = 0;
  buildTab(id);
}

onLangChange(() => { if (shell) buildTab(shell.tab); });

shell = initSim({
  strings,
  tabs: [
    { id: 'relativity', labelKey: 'tab.relativity' },
    { id: 'bus', labelKey: 'tab.bus' },
    { id: 'position', labelKey: 'tab.position' },
    { id: 'trajectory', labelKey: 'tab.trajectory' },
  ],
  initialTab: 'relativity',
  onTab: buildTab,
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, relMotion, signLines };
