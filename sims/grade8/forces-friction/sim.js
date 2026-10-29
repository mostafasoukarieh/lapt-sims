// Grade 8 — Forces at a distance, contact forces and friction (Ch.5 Act. 1–8, exercises)
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num, qty } from '../../../shared/format.js';
import { createButton, createSegmented, createSlider, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, arrow, font } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { label } from '../../../shared/figures.js';
import { G } from '../../../shared/constants.js';

/* ================================================================
   Model constants
   ================================================================ */
const PXCM = 20; // drawing scale for distances in tab 1: 20 px ↔ 1 cm
const MAG = { P: { x: 230, y: 40 }, L: 160, nailLen: 64, A: 0.45, y: 0 };
MAG.y = MAG.P.y + MAG.L + MAG.nailLen / 2; // height of the middle of the nail
const ELEC = { P: { x: 230, y: 40 }, L: 170, r: 13, A: 0.32, y: 0 };
ELEC.y = ELEC.P.y + ELEC.L + ELEC.r;
const MIN_GAP = 10; // px — the bodies never touch
const CHALK = { x: 300, yHand: 120, yGround: 300, pxPerM: 100, slow: 0.45 };
const SURF = {
  glass: { mu: Math.tan((15 * Math.PI) / 180) },
  sand: { mu: Math.tan((35 * Math.PI) / 180) },
  oil: { mu: Math.tan((8 * Math.PI) / 180) },
};
const KINETIC = 0.8; // sliding friction / largest friction at rest
const PIECE = { m: 0.1, len: 44, h: 16 };
const W = PIECE.m * G; // 0.98 N
const SHEET = { P: { x: 70, y: 292 }, L: 400, pxPerM: 640 };
const S0 = SHEET.L - 34; // start position of the piece (centre) along the sheet
const S_END = 26;
const ITEMS = [
  ['case', 'c'], ['ball', 'c'], ['hammer', 'c'], ['apple', 'd'], ['crane', 'c'], ['magnet', 'd'], ['rod', 'd'],
  ['spring', 'c'], ['horse', 'c'], ['moon', 'd'], ['chandelier', 'c'], ['book', 'c'], ['air', 'c'], ['earth', 'd'],
];
const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

function initialState() {
  return {
    distance: { exp: 'magnet', magX: 470, rodX: 470, charged: false, rub: 0, chalk: { mode: 'hand', y: CHALK.yHand, vy: 0, trail: [] } },
    contact: {
      exp: 'support', table: true, boxY: 0, boxV: 0,
      pushX: 200, handX: 140, movedAt: -1,
      cut: false, objY: 0, objV: 0,
    },
    friction: {
      part: 'incline', surf: 'glass', alpha: 0, s: S0, v: 0, sliding: false, bottom: false, rows: [], fb: null,
      tool: 'paper', oiled: false, strokes: [], lastAlpha: null,
    },
    sort: { order: shuffle(ITEMS), idx: 0, answered: null, ok: 0, total: 0, placed: { c: [], d: [] } },
  };
}
let S = initialState();

/* ================================================================
   Canvas and loop
   ================================================================ */
const SCENE = { w: 600, h: 340 };
let shell;
let drawQueued = false;
let clock = 0;
const canvas = document.getElementById('stage');
const view = setupCanvas(canvas, { width: SCENE.w, height: SCENE.h, maxHeightVh: () => (window.innerWidth < 880 ? 48 : 72), onResize: () => requestDraw() });
function requestDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; draw(); });
}
onThemeChange(() => requestDraw());

const loop = createLoop({
  step(dt) {
    clock += dt;
    if (!shell) return false;
    let busy = false;
    if (shell.tab === 'distance') busy = stepDistance(dt);
    else if (shell.tab === 'contact') busy = stepContact(dt);
    else if (shell.tab === 'friction') busy = stepFriction(dt);
    return busy;
  },
  render() { draw(); updateMeasures(); },
});

/* ================================================================
   Physics of tab 1: equilibrium of the nail / sphere on its thread
   ================================================================ */
// Smallest deflection θ where tanθ = A / gap² (gap in cm). Returns null if the body would touch.
function equilibrium(P, L, halfW, srcX, A) {
  if (A === 0) return { th: 0, gap: srcX - P.x - halfW };
  for (let th = 0; th < 0.9; th += 0.0015) {
    const gap = srcX - (P.x + L * Math.sin(th)) - halfW;
    if (gap < MIN_GAP) return null;
    if (Math.tan(th) >= A / (gap / PXCM) ** 2) return { th, gap };
  }
  return null;
}
const magEq = () => equilibrium(MAG.P, MAG.L + MAG.nailLen / 2, 3, S.distance.magX, MAG.A);
const elecEq = () => equilibrium(ELEC.P, ELEC.L + ELEC.r, ELEC.r, S.distance.rodX, S.distance.charged ? ELEC.A : 0);

function stepDistance(dt) {
  const st = S.distance;
  let busy = false;
  if (st.rub > 0) { st.rub = Math.max(0, st.rub - dt); busy = st.rub > 0; }
  const c = st.chalk;
  if (c.mode === 'up' || c.mode === 'falls') {
    const tt = dt * CHALK.slow;
    c.vy += G * CHALK.pxPerM * tt;
    c.y += c.vy * tt;
    if (c.vy > 0 && c.mode === 'up') c.mode = 'falls';
    c.tAcc = (c.tAcc || 0) + tt;
    if (c.tAcc > 0.05) { c.tAcc = 0; c.trail.push(c.y); }
    if (c.y >= CHALK.yGround - 5) { c.y = CHALK.yGround - 5; c.mode = 'ground'; c.vy = 0; }
    busy = busy || c.mode !== 'ground';
  }
  return busy;
}
function stepContact(dt) {
  const st = S.contact;
  let busy = false;
  if (st.exp === 'support' && !st.table && st.boxY < 1) {
    st.boxV += G * 120 * dt; st.boxY = Math.min(1, st.boxY + (st.boxV * dt) / 100);
    busy = st.boxY < 1;
  }
  if (st.exp === 'spring' && st.cut && st.objY < 1) {
    st.objV += G * 120 * dt; st.objY = Math.min(1, st.objY + (st.objV * dt) / 150);
    busy = st.objY < 1;
  }
  if (st.exp === 'push' && clock - st.movedAt < 0.3) busy = true;
  return busy;
}
function frictionNow() {
  const st = S.friction;
  const a = (st.alpha * Math.PI) / 180;
  const mu = SURF[st.surf].mu;
  if (st.sliding) return KINETIC * mu * W * Math.cos(a);
  return W * Math.sin(a);
}
function checkSlideStart(record = true) {
  const st = S.friction;
  if (st.sliding || st.bottom) return;
  const a = (st.alpha * Math.PI) / 180;
  if (Math.tan(a) >= SURF[st.surf].mu - 1e-9) {
    st.sliding = true; st.v = 0;
    if (record) {
      st.rows.push({ surf: st.surf, alpha: st.alpha });
      st.fb = { type: 'good', key: 'fb.slid', params: { a: `${num(st.alpha, 0)}°` } };
    } else st.fb = { type: 'warn', key: 'fb.tooSteep' };
    loop.start();
  }
}
function stepFriction(dt) {
  const st = S.friction;
  if (!st.sliding) return false;
  const a = (st.alpha * Math.PI) / 180;
  const acc = G * (Math.sin(a) - KINETIC * SURF[st.surf].mu * Math.cos(a)); // m/s² down the sheet
  st.v += acc * dt;
  if (st.v <= 0) { st.v = 0; st.sliding = false; return false; }
  st.s -= st.v * dt * SHEET.pxPerM;
  if (st.s <= S_END) { st.s = S_END; st.v = 0; st.sliding = false; st.bottom = true; refresh(); return false; }
  return true;
}

/* ================================================================
   Drawing helpers
   ================================================================ */
function hand(ctx, x, y, name = true) {
  ctx.fillStyle = cssVar('--skin');
  ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = cssVar('--wire'); ctx.lineWidth = 1.5; ctx.stroke();
  if (name) label(ctx, t('hand'), x, y + 25, { size: 11, color: cssVar('--muted') });
}
function stand(ctx, P, baseY = 322) {
  ctx.fillStyle = cssVar('--wire');
  ctx.fillRect(P.x - 150, baseY, 110, 9);
  ctx.fillRect(P.x - 100, P.y - 8, 7, baseY - P.y + 8);
  ctx.fillRect(P.x - 100, P.y - 8, 100 + 4, 6);
  label(ctx, t('stand'), P.x - 86, baseY - 12, { size: 11, color: cssVar('--muted'), align: 'left' });
}
function force(ctx, x1, y1, x2, y2, name, side = 1) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len < 4) return;
  ctx.strokeStyle = cssVar('--accent'); ctx.fillStyle = cssVar('--accent'); ctx.lineWidth = 3.5;
  arrow(ctx, x1, y1, x2, y2, 10);
  ctx.beginPath(); ctx.arc(x1, y1, 3.5, 0, Math.PI * 2); ctx.fill();
  if (name) {
    const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
    label(ctx, name, x2 - uy * 14 * side + ux * 6, y2 + ux * 14 * side + uy * 6, { size: 12, weight: 700, color: cssVar('--accent'), align: side * -uy > 0.3 ? 'left' : side * -uy < -0.3 ? 'right' : 'center' });
  }
}
function wrap(ctx, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}
function floor(ctx, y = 300) {
  ctx.fillStyle = cssVar('--bench');
  ctx.fillRect(10, y, SCENE.w - 20, SCENE.h - y - 6);
  label(ctx, t('ground'), 560, y + 16, { size: 11, color: cssVar('--muted'), halo: false });
}

function draw() {
  if (!shell) return;
  const ctx = view.begin();
  ctx.fillStyle = cssVar('--scene-bg');
  ctx.fillRect(0, 0, SCENE.w, SCENE.h);
  if (shell.tab === 'distance') drawDistance(ctx);
  else if (shell.tab === 'contact') drawContact(ctx);
  else if (shell.tab === 'friction') drawFriction(ctx);
  else drawSort(ctx);
}

/* ---------- Tab 1 ---------- */
function drawDistance(ctx) {
  const st = S.distance;
  if (st.exp === 'magnet') {
    stand(ctx, MAG.P);
    const eq = magEq() || { th: 0 };
    const top = { x: MAG.P.x + MAG.L * Math.sin(eq.th), y: MAG.P.y + MAG.L * Math.cos(eq.th) };
    const s = Math.sin(eq.th), c = Math.cos(eq.th);
    ctx.strokeStyle = cssVar('--thread'); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(MAG.P.x, MAG.P.y); ctx.lineTo(top.x, top.y); ctx.stroke();
    // nail along the thread direction
    const tip = { x: top.x + MAG.nailLen * s, y: top.y + MAG.nailLen * c };
    ctx.strokeStyle = '#5c6670'; ctx.lineWidth = 5; ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.moveTo(top.x, top.y + 4); ctx.lineTo(tip.x, tip.y); ctx.stroke();
    ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(top.x - 7 * c, top.y + 7 * s); ctx.lineTo(top.x + 7 * c, top.y - 7 * s); ctx.stroke();
    label(ctx, t('nail'), top.x - 16, tip.y - 6, { size: 11, color: cssVar('--muted'), align: 'right' });
    // magnet
    const mx = st.magX, my = MAG.y;
    ctx.fillStyle = '#d23c3c'; ctx.fillRect(mx, my - 13, 60, 26);
    ctx.fillStyle = '#2f6db5'; ctx.fillRect(mx + 60, my - 13, 60, 26);
    ctx.fillStyle = '#fff'; ctx.font = font(14, 800); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('N', mx + 30, my + 1); ctx.fillText('S', mx + 90, my + 1);
    label(ctx, t('barMagnet'), mx + 60, my + 28, { size: 11, color: cssVar('--muted') });
    const mid = { x: top.x + (MAG.nailLen / 2) * s, y: top.y + (MAG.nailLen / 2) * c };
    const k = Math.tan(eq.th);
    if (k > 0.004) force(ctx, mid.x + 4, mid.y, mid.x + 4 + Math.min(120, 24 + k * 1500), mid.y, t('f.magnetic'), -1);
  } else if (st.exp === 'electric') {
    stand(ctx, ELEC.P);
    const eq = elecEq() || { th: 0 };
    const L = ELEC.L + ELEC.r;
    const cx = ELEC.P.x + L * Math.sin(eq.th), cy = ELEC.P.y + L * Math.cos(eq.th);
    ctx.strokeStyle = cssVar('--thread'); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(ELEC.P.x, ELEC.P.y); ctx.lineTo(cx - ELEC.r * Math.sin(eq.th), cy - ELEC.r * Math.cos(eq.th)); ctx.stroke();
    const gr = ctx.createRadialGradient(cx - 4, cy - 4, 1, cx, cy, ELEC.r);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, cssVar('--alu'));
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, cy, ELEC.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#8a929c'; ctx.lineWidth = 1; ctx.stroke();
    label(ctx, t('sphere'), cx, cy + 30, { size: 11, color: cssVar('--muted') });
    // rod
    const rx = st.rodX, ry = ELEC.y;
    ctx.fillStyle = '#e8d36a'; roundRect(ctx, rx, ry - 6, 180, 12, 6); ctx.fill();
    ctx.strokeStyle = '#b39b2a'; ctx.lineWidth = 1; ctx.stroke();
    if (st.charged) {
      ctx.fillStyle = '#1d4f91'; ctx.font = font(13, 800); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let i = 0; i < 6; i++) ctx.fillText('−', rx + 14 + i * 16, ry - 14);
    }
    label(ctx, t('rod'), rx + 90, ry + 22, { size: 11, color: cssVar('--muted') });
    // wool cloth
    const wx = st.rub > 0 ? rx + 30 + 110 * (0.5 + 0.5 * Math.sin(st.rub * 18)) : 460, wy = st.rub > 0 ? ry : 300;
    ctx.fillStyle = '#c9b6e4'; roundRect(ctx, wx - 26, wy - 16, 52, 32, 8); ctx.fill();
    ctx.strokeStyle = '#9b85bd'; ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
    if (st.rub === 0) label(ctx, t('wool'), wx, wy + 26, { size: 11, color: cssVar('--muted') });
    const k = Math.tan(eq.th);
    if (k > 0.004) force(ctx, cx + ELEC.r, cy, cx + ELEC.r + Math.min(120, 24 + k * 1500), cy, t('f.electric'), -1);
  } else {
    floor(ctx, CHALK.yGround);
    const c = st.chalk;
    ctx.fillStyle = 'rgba(120,120,120,0.25)';
    for (const y of c.trail) { ctx.fillRect(CHALK.x - 4, y - 9, 8, 18); }
    if (c.mode === 'hand') hand(ctx, CHALK.x - 14, CHALK.yHand + 2);
    else hand(ctx, CHALK.x - 14, CHALK.yHand + 2);
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#9a9a9a'; ctx.lineWidth = 1;
    if (c.mode === 'ground') { ctx.fillRect(CHALK.x - 10, c.y - 4, 20, 8); ctx.strokeRect(CHALK.x - 10, c.y - 4, 20, 8); }
    else { ctx.fillRect(CHALK.x - 4, c.y - 10, 8, 20); ctx.strokeRect(CHALK.x - 4, c.y - 10, 8, 20); }
    label(ctx, t('chalkPiece'), CHALK.x + 14, c.y, { size: 11, color: cssVar('--muted'), align: 'left' });
    if (c.mode !== 'ground') force(ctx, CHALK.x, c.y + 10, CHALK.x, c.y + 58, t('f.gravity'), -1);
    if (c.mode === 'up' || c.mode === 'falls') label(ctx, '×0.45', 560, 24, { size: 11, color: cssVar('--muted') });
  }
}

/* ---------- Tab 2 ---------- */
const TBL = { x0: 150, x1: 470, y: 200 };
function tableDraw(ctx, x0, x1, y) {
  ctx.fillStyle = cssVar('--wood');
  ctx.fillRect(x0, y, x1 - x0, 14);
  ctx.fillRect(x0 + 14, y + 14, 12, 300 - y - 14); ctx.fillRect(x1 - 26, y + 14, 12, 300 - y - 14);
  label(ctx, t('table'), (x0 + x1) / 2, y + 7, { size: 11, weight: 700, color: '#fff', halo: false });
}
function sandBox(ctx, x, yBottom, w = 90, h = 60) {
  ctx.fillStyle = '#c99a5b'; ctx.fillRect(x, yBottom - h, w, h);
  ctx.strokeStyle = '#8f6a3a'; ctx.lineWidth = 1.5; ctx.strokeRect(x, yBottom - h, w, h);
  ctx.fillStyle = '#e8cf95'; ctx.fillRect(x + 5, yBottom - h + 5, w - 10, 12);
  label(ctx, t('box'), x + w / 2, yBottom - h - 12, { size: 11, color: cssVar('--muted') });
}
function drawContact(ctx) {
  const st = S.contact;
  floor(ctx);
  if (st.exp === 'support') {
    if (st.table) tableDraw(ctx, TBL.x0, TBL.x1, TBL.y);
    const yb = TBL.y + st.boxY * (300 - TBL.y);
    sandBox(ctx, 265, yb);
    if (st.table) {
      force(ctx, 310, TBL.y, 310, TBL.y - 54, null);
      label(ctx, t('f.reaction'), 362, TBL.y - 30, { size: 12, weight: 700, color: cssVar('--accent'), align: 'left' });
    }
  } else if (st.exp === 'push') {
    tableDraw(ctx, 40, 560, TBL.y);
    sandBox(ctx, st.pushX, TBL.y);
    const hy = TBL.y - 30;
    hand(ctx, st.handX, hy, false);
    label(ctx, t('hand'), st.handX, hy - 24, { size: 11, color: cssVar('--muted') });
    if (pushTouch()) {
      force(ctx, st.pushX, hy, st.pushX + 50, hy, null);
      label(ctx, t('f.muscular'), st.handX - 20, hy - 48, { size: 12, weight: 700, color: cssVar('--accent'), align: 'left' });
    }
    else { ctx.strokeStyle = cssVar('--accent'); ctx.fillStyle = cssVar('--accent'); ctx.lineWidth = 2; ctx.setLineDash([5, 4]); arrow(ctx, st.handX + 20, hy - 26, st.handX + 60, hy - 26, 8); ctx.setLineDash([]); }
  } else {
    const P = { x: 330, y: 40 };
    stand(ctx, P, 322);
    floor(ctx, 300);
    const objTop = 178, coils = 12;
    const drawSpring = (y0, y1) => {
      ctx.strokeStyle = '#6f7a86'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(P.x, y0);
      const n = coils * 2;
      for (let i = 1; i < n; i++) ctx.lineTo(P.x + (i % 2 ? 10 : -10), y0 + ((y1 - y0) * i) / n);
      ctx.lineTo(P.x, y1); ctx.stroke();
    };
    if (!st.cut) drawSpring(P.y - 2, objTop);
    else drawSpring(P.y - 2, P.y + 46);
    const oy = objTop + st.objY * (300 - 40 - objTop);
    ctx.fillStyle = cssVar('--metal'); ctx.fillRect(P.x - 26, oy, 52, 40);
    ctx.strokeStyle = '#59626e'; ctx.strokeRect(P.x - 26, oy, 52, 40);
    label(ctx, t('object'), P.x + 36, oy + 20, { size: 11, color: cssVar('--muted'), align: 'left' });
    label(ctx, t('spring'), P.x + 18, (P.y + (st.cut ? P.y + 46 : objTop)) / 2, { size: 11, color: cssVar('--muted'), align: 'left' });
    if (!st.cut) {
      force(ctx, P.x, oy, P.x, oy - 50, null);
      label(ctx, t('f.elastic'), P.x - 20, oy - 30, { size: 12, weight: 700, color: cssVar('--accent'), align: 'right' });
    }
  }
}
function pushTouch() { const st = S.contact; return st.handX + 14 >= st.pushX - 0.5; }

/* ---------- Tab 3 ---------- */
function sheetEnd() {
  const a = (S.friction.alpha * Math.PI) / 180;
  return { x: SHEET.P.x + SHEET.L * Math.cos(a), y: SHEET.P.y - SHEET.L * Math.sin(a), a };
}
function drawFriction(ctx) {
  const st = S.friction;
  if (st.part === 'writing') { drawWriting(ctx); return; }
  ctx.fillStyle = cssVar('--wood');
  ctx.fillRect(10, SHEET.P.y + 4, SCENE.w - 20, 14);
  label(ctx, t('table'), 520, SHEET.P.y + 11, { size: 11, weight: 700, color: '#fff', halo: false });
  const E = sheetEnd();
  const a = E.a;
  // prop under the raised end
  if (E.y < SHEET.P.y - 2) {
    ctx.fillStyle = cssVar('--book'); ctx.fillRect(E.x - 16, E.y + 4, 32, SHEET.P.y + 4 - E.y - 4);
    ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.strokeRect(E.x - 16, E.y + 4, 32, SHEET.P.y + 4 - E.y - 4);
  }
  // sheet
  ctx.save();
  ctx.translate(SHEET.P.x, SHEET.P.y); ctx.rotate(-a);
  const thick = 7;
  if (st.surf === 'sand') {
    ctx.fillStyle = '#c7a877'; ctx.fillRect(0, -thick, SHEET.L, thick);
    ctx.fillStyle = '#8c6d42';
    for (let i = 0; i < 140; i++) ctx.fillRect((i * 37) % SHEET.L, -thick + ((i * 13) % 6), 1.6, 1.6);
  } else {
    ctx.fillStyle = st.surf === 'oil' ? 'rgba(214,190,84,0.75)' : 'rgba(150,200,230,0.85)';
    ctx.fillRect(0, -thick, SHEET.L, thick);
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(0, -thick, SHEET.L, 1.5);
    if (st.surf === 'oil') { ctx.fillStyle = 'rgba(170,130,20,0.6)'; for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.ellipse(30 + i * 42, -thick - 1, 5, 1.6, 0, 0, Math.PI * 2); ctx.fill(); } }
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1; ctx.strokeRect(0, -thick, SHEET.L, thick);
  // piece of metal
  const x = st.s - PIECE.len / 2;
  ctx.fillStyle = cssVar('--metal'); ctx.fillRect(x, -thick - PIECE.h, PIECE.len, PIECE.h);
  ctx.strokeStyle = '#59626e'; ctx.strokeRect(x, -thick - PIECE.h, PIECE.len, PIECE.h);
  ctx.restore();
  const surfName = t(`surf.${st.surf}`);
  label(ctx, surfName, SHEET.P.x + 0.55 * SHEET.L * Math.cos(a) + 18 * Math.sin(a), SHEET.P.y - 0.55 * SHEET.L * Math.sin(a) + 18 * Math.cos(a), { size: 11, weight: 700, color: cssVar('--muted') });
  // piece label
  const pc = { x: SHEET.P.x + st.s * Math.cos(a) - (thick + PIECE.h / 2) * Math.sin(a), y: SHEET.P.y - st.s * Math.sin(a) - (thick + PIECE.h / 2) * Math.cos(a) };
  label(ctx, t('piece'), pc.x - 34 * Math.sin(a), pc.y - 34 * Math.cos(a), { size: 11, color: cssVar('--muted') });
  // angle arc
  ctx.strokeStyle = cssVar('--muted'); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(SHEET.P.x, SHEET.P.y, 54, -a, 0); ctx.stroke();
  label(ctx, `α = ${num(st.alpha, 0)}°`, SHEET.P.x + 74, SHEET.P.y - 14 - 30 * Math.sin(a / 2), { size: 13, weight: 800, color: cssVar('--text'), align: 'left' });
  // force of friction: on the contact surface, up the sheet
  const f = frictionNow();
  if (f > 0.004 && !st.bottom) {
    const cx = SHEET.P.x + st.s * Math.cos(a) - thick * Math.sin(a), cy = SHEET.P.y - st.s * Math.sin(a) - thick * Math.cos(a);
    const len = 12 + (f / W) * 130;
    force(ctx, cx, cy, cx + len * Math.cos(a), cy - len * Math.sin(a), 'f', 1);
  }
  // handle on the raised end
  ctx.fillStyle = cssVar('--accent'); ctx.globalAlpha = 0.25;
  ctx.beginPath(); ctx.arc(E.x, E.y - 4, 16, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
  ctx.fillStyle = cssVar('--accent'); ctx.beginPath(); ctx.arc(E.x, E.y - 4, 5, 0, Math.PI * 2); ctx.fill();
}
const WR = { x0: 60, y0: 30, x1: 540, y1: 300 };
function drawWriting(ctx) {
  const st = S.friction;
  const board = st.tool === 'board';
  ctx.fillStyle = board ? '#28493a' : '#ffffff';
  ctx.fillRect(WR.x0, WR.y0, WR.x1 - WR.x0, WR.y1 - WR.y0);
  if (board) { ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = 8; ctx.strokeRect(WR.x0, WR.y0, WR.x1 - WR.x0, WR.y1 - WR.y0); }
  else { ctx.strokeStyle = '#cfd6de'; ctx.lineWidth = 1; ctx.strokeRect(WR.x0, WR.y0, WR.x1 - WR.x0, WR.y1 - WR.y0); }
  if (st.oiled) {
    ctx.fillStyle = board ? 'rgba(40,30,0,0.35)' : 'rgba(236,206,96,0.45)';
    ctx.fillRect(WR.x0, WR.y0, WR.x1 - WR.x0, WR.y1 - WR.y0);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath(); ctx.ellipse(200, 110, 90, 20, -0.3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const s of st.strokes) {
    ctx.strokeStyle = board ? `rgba(255,255,255,${s.alpha})` : `rgba(40,40,46,${s.alpha})`;
    ctx.lineWidth = board ? 5 : 2.6;
    ctx.beginPath();
    s.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  }
  const name = board ? t('board') : t(st.oiled ? 'oiledPaper' : 'paper');
  label(ctx, name, (WR.x0 + WR.x1) / 2, WR.y1 + 18, { size: 12, weight: 700, color: cssVar('--muted') });
  if (!st.strokes.length) label(ctx, t('hint.write'), (WR.x0 + WR.x1) / 2, (WR.y0 + WR.y1) / 2, { size: 13, color: board ? '#cfe3d6' : '#8a94a0', halo: false });
}

/* ---------- Tab 4 ---------- */
function drawSort(ctx) {
  const st = S.sort;
  const bins = [{ id: 'c', x: 16, key: 'sort.contact' }, { id: 'd', x: 306, key: 'sort.distance' }];
  for (const b of bins) {
    ctx.fillStyle = b.id === 'c' ? 'rgba(3,86,196,0.08)' : 'rgba(230,0,0,0.07)';
    roundRect(ctx, b.x, 150, 278, 180, 12); ctx.fill();
    ctx.strokeStyle = b.id === 'c' ? '#0356c4' : '#e60000'; ctx.lineWidth = 1.5; ctx.stroke();
    label(ctx, t(b.key), b.x + 139, 166, { size: 13, weight: 800, color: b.id === 'c' ? '#0356c4' : '#e60000', halo: false });
    ctx.font = font(11, 500); ctx.fillStyle = cssVar('--text'); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    st.placed[b.id].slice(-10).forEach((id, i) => {
      let txt = t(`it.${id}`);
      while (ctx.measureText(`• ${txt}`).width > 262 && txt.length > 4) txt = `${txt.slice(0, -2).trimEnd()}…`.replace('……', '…');
      ctx.fillText(`• ${txt}`, b.x + 10, 186 + i * 14.5);
    });
  }
  // the card
  const item = st.order[st.idx];
  ctx.fillStyle = cssVar('--surface'); roundRect(ctx, 90, 18, 420, 112, 14); ctx.fill();
  ctx.strokeStyle = cssVar('--border'); ctx.lineWidth = 1.5; ctx.stroke();
  if (!item) {
    label(ctx, t('sort.done'), 300, 74, { size: 16, weight: 800, halo: false });
    return;
  }
  label(ctx, `${t('m.item')} ${st.idx + 1} / ${st.order.length}`, 300, 36, { size: 11, weight: 700, color: cssVar('--muted'), halo: false });
  ctx.font = font(17, 700); ctx.fillStyle = cssVar('--text'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const lines = wrap(ctx, t(`it.${item[0]}`), 390);
  lines.forEach((ln, i) => ctx.fillText(ln, 300, 76 + (i - (lines.length - 1) / 2) * 22));
}

/* ================================================================
   Pointer
   ================================================================ */
let dragging = null;
let dragOff = 0;
canvas.addEventListener('pointerdown', (ev) => {
  if (!shell) return;
  const p = view.toLogical(ev);
  const tab = shell.tab;
  if (tab === 'distance') {
    const st = S.distance;
    if (st.exp === 'magnet' && p.x > st.magX - 20 && p.x < st.magX + 140 && Math.abs(p.y - MAG.y) < 34) { dragging = 'magnet'; dragOff = p.x - st.magX; }
    if (st.exp === 'electric' && p.x > st.rodX - 20 && p.x < st.rodX + 200 && Math.abs(p.y - ELEC.y) < 30) { dragging = 'rod'; dragOff = p.x - st.rodX; }
  } else if (tab === 'contact') {
    const st = S.contact;
    if (st.exp === 'push' && Math.abs(p.x - st.handX) < 44 && Math.abs(p.y - (TBL.y - 30)) < 44) { dragging = 'hand'; dragOff = p.x - st.handX; }
  } else if (tab === 'friction') {
    const st = S.friction;
    if (st.part === 'incline') {
      const E = sheetEnd();
      if (Math.hypot(p.x - E.x, p.y - E.y) < 44) dragging = 'sheet';
    } else if (p.x > WR.x0 && p.x < WR.x1 && p.y > WR.y0 && p.y < WR.y1) {
      dragging = 'write';
      const alpha = st.oiled ? 0.1 : 0.92;
      st.strokes.push({ pts: [[p.x, p.y]], alpha });
      st.lastAlpha = alpha;
      refresh();
    }
  }
  if (dragging) { canvas.setPointerCapture(ev.pointerId); ev.preventDefault(); }
});
canvas.addEventListener('pointermove', (ev) => {
  if (!dragging) return;
  const p = view.toLogical(ev);
  if (dragging === 'magnet') {
    const st = S.distance, old = st.magX;
    st.magX = Math.max(MAG.P.x + 30, Math.min(470, p.x - dragOff));
    if (!magEq()) st.magX = old;
    refresh();
  } else if (dragging === 'rod') {
    const st = S.distance, old = st.rodX;
    st.rodX = Math.max(ELEC.P.x + 30, Math.min(470, p.x - dragOff));
    if (!elecEq()) st.rodX = old;
    refresh();
  } else if (dragging === 'hand') {
    const st = S.contact;
    const x = Math.max(40, Math.min(560 - 90 - 14, p.x - dragOff));
    st.handX = x;
    if (x + 14 > st.pushX) { st.pushX = Math.min(560 - 90, x + 14); st.movedAt = clock; loop.start(); }
    refresh();
  } else if (dragging === 'sheet') {
    const a = Math.atan2(SHEET.P.y - p.y, p.x - SHEET.P.x) * 180 / Math.PI;
    setAlpha(Math.round(Math.max(0, Math.min(45, a))));
  } else if (dragging === 'write') {
    const st = S.friction;
    const s = st.strokes[st.strokes.length - 1];
    s.pts.push([Math.max(WR.x0, Math.min(WR.x1, p.x)), Math.max(WR.y0, Math.min(WR.y1, p.y))]);
    requestDraw();
  }
});
const endDrag = () => { dragging = null; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

function setAlpha(a) {
  const st = S.friction;
  if (a === st.alpha) return;
  st.alpha = a;
  if (ui.angle) ui.angle.set(a);
  checkSlideStart();
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
  box.textContent = t(fb.key, fb.params);
}
function hint(key) { return el('p', { class: 'muted', style: 'font-size:0.88rem;margin:10px 0 0', dataset: { i18n: key } }, t(key)); }
const yn = (b) => t(b ? 'yes' : 'no');
const btnRow = (...b) => el('div', { class: 'btn-row' }, b);
const resetBtn = (id) => btnRow(createButton({ labelKey: 'ui.reset', variant: 'ghost', onClick: () => resetTab(id) }));

/* ---------- Tab 1 ---------- */
function buildDistance() {
  const st = S.distance;
  ui.exp = createSegmented({
    labelKey: 'ctl.exp',
    options: [{ value: 'magnet', labelKey: 'exp.magnet' }, { value: 'electric', labelKey: 'exp.electric' }, { value: 'gravity', labelKey: 'exp.gravity' }],
    value: st.exp,
    onChange: (v) => { st.exp = v; buildTab('distance'); },
  });
  controlsBody.append(ui.exp.root);
  if (st.exp === 'magnet') controlsBody.append(hint('hint.magnet'));
  else if (st.exp === 'electric') {
    controlsBody.append(btnRow(
      createButton({ labelKey: 'ctl.rub', variant: 'primary', onClick: () => { st.charged = true; st.rub = 0.9; if (!elecEq()) st.rodX = 470; loop.start(); refresh(); } }),
      createButton({ labelKey: 'ctl.discharge', variant: 'secondary', onClick: () => { st.charged = false; st.rub = 0; refresh(); } }),
    ), hint('hint.electric'));
  } else {
    const c = st.chalk;
    const go = (vy) => { Object.assign(c, { mode: vy < 0 ? 'up' : 'falls', y: CHALK.yHand, vy, trail: [], tAcc: 0 }); loop.start(); refresh(); };
    controlsBody.append(btnRow(
      createButton({ labelKey: 'ctl.release', variant: 'primary', onClick: () => go(0) }),
      createButton({ labelKey: 'ctl.throwUp', variant: 'primary', onClick: () => go(-420) }),
      createButton({ labelKey: 'ctl.pickUp', variant: 'secondary', onClick: () => { Object.assign(c, { mode: 'hand', y: CHALK.yHand, vy: 0, trail: [] }); refresh(); } }),
    ));
  }
  controlsBody.append(resetBtn('distance'));
  ui.dl = el('dl', { class: 'meas' });
  measuresBody.append(ui.dl);
}
function updateDistance() {
  const st = S.distance;
  const kd = t('kind.distance');
  if (st.exp === 'magnet') {
    const eq = magEq() || { th: 0, gap: 0 };
    const att = (MAG.L + MAG.nailLen / 2) * Math.sin(eq.th) > 1.5;
    measRows(ui.dl, [
      [t('m.gap'), qty(eq.gap / PXCM, 1, 'cm')], [t('m.contact'), yn(false)], [t('m.attracted'), yn(att), att ? 'good-text' : ''],
      [t('m.byWhom'), t('by.magnet')], [t('m.kind'), `${t('f.magnetic')}${t('sep')}${kd}`],
    ]);
  } else if (st.exp === 'electric') {
    const eq = elecEq() || { th: 0, gap: 0 };
    const att = (ELEC.L + ELEC.r) * Math.sin(eq.th) > 1.5;
    measRows(ui.dl, [
      [t('m.rod'), t(st.charged ? 'rod.charged' : 'rod.neutral')],
      [t('m.gap'), qty(eq.gap / PXCM, 1, 'cm')], [t('m.contact'), yn(false)], [t('m.attracted'), yn(att), att ? 'good-text' : ''],
      [t('m.kind'), st.charged ? `${t('f.electric')}${t('sep')}${kd}` : t('kind.none')],
    ]);
  } else {
    const c = st.chalk;
    const mode = { hand: 'chalk.hand', falls: 'chalk.falls', up: 'chalk.up', ground: 'chalk.ground' }[c.mode];
    measRows(ui.dl, [
      [t('m.chalk'), t(mode)],
      [t('m.contact'), yn(false)],
      [t('m.byWhom'), t('by.earth')], [t('m.kind'), `${t('f.gravity')}${t('sep')}${kd}`],
    ]);
  }
}

/* ---------- Tab 2 ---------- */
function buildContact() {
  const st = S.contact;
  ui.exp = createSegmented({
    labelKey: 'ctl.exp',
    options: [{ value: 'support', labelKey: 'exp.support' }, { value: 'push', labelKey: 'exp.push' }, { value: 'spring', labelKey: 'exp.spring' }],
    value: st.exp,
    onChange: (v) => { st.exp = v; buildTab('contact'); },
  });
  controlsBody.append(ui.exp.root);
  if (st.exp === 'support') {
    ui.toggle = createButton({ labelKey: st.table ? 'ctl.removeTable' : 'ctl.putTable', variant: 'primary', onClick: () => {
      st.table = !st.table; st.boxY = 0; st.boxV = 0;
      if (!st.table) loop.start();
      buildTab('contact');
    } });
    controlsBody.append(btnRow(ui.toggle));
  } else if (st.exp === 'push') controlsBody.append(hint('hint.push'));
  else {
    controlsBody.append(btnRow(createButton({ labelKey: st.cut ? 'ctl.hang' : 'ctl.cut', variant: 'primary', onClick: () => {
      st.cut = !st.cut; st.objY = 0; st.objV = 0;
      if (st.cut) loop.start();
      buildTab('contact');
    } })));
  }
  controlsBody.append(resetBtn('contact'));
  ui.dl = el('dl', { class: 'meas' });
  measuresBody.append(ui.dl);
}
function updateContact() {
  const st = S.contact;
  const kc = t('kind.contact');
  if (st.exp === 'support') {
    measRows(ui.dl, [
      [t('m.falls'), yn(!st.table), !st.table ? 'bad-text' : ''],
      [t('m.byWhom'), st.table ? t('by.table') : t('by.none')],
      [t('m.kind'), st.table ? `${t('f.reaction')}${t('sep')}${kc}` : t('kind.none')],
    ]);
  } else if (st.exp === 'push') {
    const touch = pushTouch();
    const moving = clock - st.movedAt < 0.3;
    measRows(ui.dl, [
      [t('m.touch'), yn(touch)], [t('m.moves'), yn(moving), moving ? 'good-text' : ''],
      [t('m.byWhom'), touch ? t('by.hand') : t('by.none')],
      [t('m.kind'), touch ? `${t('f.muscular')}${t('sep')}${kc}` : t('kind.none')],
    ]);
  } else {
    measRows(ui.dl, [
      [t('m.falls'), yn(st.cut), st.cut ? 'bad-text' : ''],
      [t('m.byWhom'), st.cut ? t('by.none') : t('by.spring')],
      [t('m.kind'), st.cut ? t('kind.none') : `${t('f.elastic')}${t('sep')}${kc}`],
    ]);
  }
}

/* ---------- Tab 3 ---------- */
function backToTop() {
  const st = S.friction;
  Object.assign(st, { s: S0, v: 0, sliding: false, bottom: false, fb: null });
  checkSlideStart(false);
}
function buildFriction() {
  const st = S.friction;
  ui.part = createSegmented({
    labelKey: 'ctl.part',
    options: [{ value: 'incline', labelKey: 'part.incline' }, { value: 'writing', labelKey: 'part.writing' }],
    value: st.part,
    onChange: (v) => { st.part = v; buildTab('friction'); },
  });
  controlsBody.append(ui.part.root);
  ui.dl = el('dl', { class: 'meas' });
  if (st.part === 'incline') {
    ui.surf = createSegmented({
      labelKey: 'ctl.surface',
      options: ['glass', 'sand', 'oil'].map((v) => ({ value: v, labelKey: `surf.${v}` })),
      value: st.surf,
      onChange: (v) => { st.surf = v; backToTop(); refresh(); },
    });
    ui.angle = createSlider({ labelKey: 'ctl.angle', min: 0, max: 45, step: 1, value: st.alpha, unit: '°', onInput: (v) => setAlpha(v) });
    controlsBody.append(ui.surf.root, ui.angle.root,
      btnRow(createButton({ labelKey: 'ctl.back', variant: 'secondary', onClick: () => { backToTop(); refresh(); } })),
      hint('hint.incline'), resetBtn('friction'));
    ui.status = statusBox();
    ui.tblTitle = el('p', { class: 'muted', style: 'font-size:0.9rem;margin:12px 0 4px', dataset: { i18n: 'tbl.title' } }, t('tbl.title'));
    ui.table = el('table', { class: 'data' });
    ui.clearRow = el('div', { class: 'btn-row', style: 'margin-top:8px' }, [createButton({ labelKey: 'ctl.clearTable', variant: 'ghost', onClick: () => { st.rows = []; refresh(); } })]);
    measuresBody.append(ui.dl, ui.status, ui.tblTitle, ui.table, ui.clearRow);
  } else {
    const board = st.tool === 'board';
    ui.tool = createSegmented({
      labelKey: 'ctl.tool',
      options: [{ value: 'paper', labelKey: 'tool.paper' }, { value: 'board', labelKey: 'tool.board' }],
      value: st.tool,
      onChange: (v) => { Object.assign(st, { tool: v, oiled: false, strokes: [], lastAlpha: null }); buildTab('friction'); },
    });
    controlsBody.append(ui.tool.root,
      btnRow(
        createButton({ labelKey: board ? 'ctl.oilBoard' : 'ctl.oil', variant: 'primary', onClick: () => { st.oiled = true; st.lastAlpha = null; refresh(); } }),
        createButton({ labelKey: board ? 'ctl.cleanBoard' : 'ctl.newSheet', variant: 'secondary', onClick: () => { Object.assign(st, { oiled: false, strokes: [], lastAlpha: null }); refresh(); } }),
      ),
      hint('hint.write'), resetBtn('friction'));
    measuresBody.append(ui.dl);
  }
}
let rowsSig = '';
function updateFriction() {
  const st = S.friction;
  ui.part.set(st.part);
  if (st.part === 'incline') {
    ui.surf.set(st.surf);
    ui.angle.set(st.alpha);
    const f = frictionNow();
    const state = st.bottom ? 'state.bottom' : st.sliding ? 'state.slides' : 'state.rest';
    measRows(ui.dl, [
      [t('m.angle'), `${num(st.alpha, 0)}°`],
      [t('m.surface'), t(`surf.${st.surf}`)],
      [t('m.state'), t(state), st.sliding ? 'bad-text' : ''],
      [t('m.friction'), st.bottom ? '—' : `f = ${qty(f, 2, 'N')}`],
      [t('m.fDir'), !st.bottom && f > 0.004 ? t('fdir.up') : t('fdir.none')],
    ]);
    showStatus(ui.status, st.fb);
    const sig = JSON.stringify(st.rows) + t('col.surface');
    if (sig !== rowsSig) {
      rowsSig = sig;
      const head = el('tr', {}, [el('th', {}, t('col.surface')), el('th', {}, t('col.angle'))]);
      const body = st.rows.map((r) => el('tr', {}, [el('td', {}, t(`surf.${r.surf}`)), el('td', {}, `${num(r.alpha, 0)}°`)]));
      ui.table.replaceChildren(el('thead', {}, head), el('tbody', {}, body));
    }
    ui.table.hidden = st.rows.length === 0;
    ui.clearRow.hidden = ui.table.hidden;
    ui.tblTitle.hidden = ui.table.hidden;
  } else {
    ui.tool.set(st.tool);
    const m = st.lastAlpha == null ? 'marks.none' : st.lastAlpha > 0.5 ? 'marks.well' : 'marks.hardly';
    measRows(ui.dl, [
      [t('m.oiled'), t(st.oiled ? 'oiled.yes' : 'oiled.no')],
      [t('m.marks'), t(m), m === 'marks.hardly' ? 'bad-text' : ''],
      [t('m.fWrite'), t(st.oiled ? 'fw.small' : 'fw.large')],
    ]);
  }
}

/* ---------- Tab 4 ---------- */
function buildSort() {
  const st = S.sort;
  const answer = (kind) => {
    const item = st.order[st.idx];
    if (!item || st.answered) return;
    const ok = item[1] === kind;
    st.total += 1; if (ok) st.ok += 1;
    st.answered = { ok, key: ok ? 'fb.sortOk' : 'fb.sortWrong' };
    st.placed[item[1]].push(item[0]);
    refresh();
  };
  ui.bC = createButton({ labelKey: 'ctl.isContact', variant: 'primary', onClick: () => answer('c') });
  ui.bD = createButton({ labelKey: 'ctl.isDistance', variant: 'primary', onClick: () => answer('d') });
  ui.next = createButton({ labelKey: 'ctl.next', variant: 'secondary', onClick: () => { if (!st.answered) return; st.idx += 1; st.answered = null; refresh(); } });
  controlsBody.append(btnRow(ui.bC, ui.bD), btnRow(ui.next,
    createButton({ labelKey: 'ctl.restart', variant: 'ghost', onClick: () => resetTab('sort') })));
  ui.dl = el('dl', { class: 'meas' });
  ui.status = statusBox();
  measuresBody.append(ui.dl, ui.status);
}
function updateSort() {
  const st = S.sort;
  const item = st.order[st.idx];
  ui.bC.disabled = ui.bD.disabled = !item || !!st.answered;
  ui.next.disabled = !st.answered;
  measRows(ui.dl, [[t('m.item'), `${Math.min(st.idx + 1, st.order.length)} / ${st.order.length}`], [t('m.score'), `${st.ok} / ${st.total}`]]);
  if (st.answered && item) showStatus(ui.status, { type: st.answered.ok ? 'good' : 'bad', key: st.answered.key, params: { by: t(`it.${item[0]}.by`) } });
  else if (!item) showStatus(ui.status, { type: 'good', key: 'sort.done' });
  else showStatus(ui.status, null);
}

/* ---------- Tab switching ---------- */
function buildTab(id) {
  controlsBody.replaceChildren();
  measuresBody.replaceChildren();
  ui = {};
  rowsSig = '';
  if (id === 'distance') buildDistance();
  else if (id === 'contact') buildContact();
  else if (id === 'friction') buildFriction();
  else buildSort();
  loop.start();
  refresh();
}
function updateMeasures() {
  if (!shell || !ui.dl) return;
  if (shell.tab === 'distance') updateDistance();
  else if (shell.tab === 'contact') updateContact();
  else if (shell.tab === 'friction') updateFriction();
  else updateSort();
}
function refresh() { updateMeasures(); requestDraw(); }
function resetTab(id) {
  S[id] = initialState()[id];
  buildTab(id);
}

onLangChange(() => { if (shell) buildTab(shell.tab); });

shell = initSim({
  strings,
  tabs: [
    { id: 'distance', labelKey: 'tab.distance' },
    { id: 'contact', labelKey: 'tab.contact' },
    { id: 'friction', labelKey: 'tab.friction' },
    { id: 'sort', labelKey: 'tab.sort' },
  ],
  initialTab: 'distance',
  onTab: buildTab,
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, magEq, elecEq, frictionNow, setAlpha };
