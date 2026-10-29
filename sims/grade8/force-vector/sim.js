// Grade 8 — Effects and characteristics of a force (Ch.4 Act. 1–7)
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange, getLang } from '../../../shared/i18n.js';
import { num, qty, parseNum } from '../../../shared/format.js';
import { createButton, createSegmented, createSlider, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, arrow, font } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { label } from '../../../shared/figures.js';
import { BALANCES, drawSpringBalance, shown } from '../../../shared/spring-balance.js';

/* ================================================================
   State
   ================================================================ */
const CASE = { x0: 120, w: 70, h: 26, y: 232, L0: 110 };
const BALL = { x0: 44, y0: 118, vx: 230, K: 3.2e6, magnet: { x: 330, y: 300 } };
const PULL = { L0: 120, maxStretch: 150 };
const POINTS = { O: { x: 340, y: 158 }, Op: { x: 252, y: 146 } };
const GRID = { x0: 258, y0: 24, x1: 584, y1: 320, cm: 26, A: { x: 414, y: 60 } };
const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

function newZero(bal) { return (Math.random() < 0.5 ? -1 : 1) * randInt(2, 4) * bal.minor; }

function initialState() {
  return {
    effects: {
      obj: 'case',
      caseX: CASE.x0, hand: { x: CASE.x0 + CASE.w + 60, y: CASE.y - 13 },
      magnet: false, ball: null, path: [], thrown: false, curved: false,
      press: 0,
    },
    characteristics: { point: 'O', hand: { x: 470, y: 158 } },
    balance: { mode: 'use', bi: 0, zero: 0.15, F: 0, fb: null, readF: 1.35, readInput: '', ok: 0, total: 0 },
    vector: { F: 1, scale: 0.5, tip: null, fb: null, book: true },
  };
}
let S = initialState();

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

const loop = createLoop({
  step(dt) {
    const st = S.effects;
    const b = st.ball;
    if (!shell || shell.tab !== 'effects' || !b || b.done) return false;
    if (st.magnet) {
      const dx = BALL.magnet.x - b.x, dy = BALL.magnet.y - b.y;
      const r = Math.hypot(dx, dy);
      if (r < 30) { b.done = true; b.stuck = true; refresh(); return false; }
      const a = BALL.K / (r * r);
      b.vx += (a * dx / r) * dt; b.vy += (a * dy / r) * dt;
    }
    b.vx *= 1 - 0.12 * dt; b.vy *= 1 - 0.12 * dt;
    b.x += b.vx * dt; b.y += b.vy * dt;
    const last = st.path[st.path.length - 1];
    if (!last || Math.hypot(b.x - last[0], b.y - last[1]) > 2) st.path.push([b.x, b.y]);
    if (st.magnet && Math.abs(b.y - BALL.y0) > 6) st.curved = true;
    if (b.x > 572 || b.x < 28 || b.y < 30 || b.y > 318 || Math.hypot(b.vx, b.vy) < 15) { b.done = true; refresh(); return false; }
    return true;
  },
  render() { draw(); updateMeasures(); },
});

/* ================================================================
   Drawing
   ================================================================ */
function hand(ctx, x, y) {
  ctx.fillStyle = cssVar('--skin');
  ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = cssVar('--wire'); ctx.lineWidth = 1.5; ctx.stroke();
  label(ctx, t('handLabel'), x, y + 24, { size: 11, weight: 600, color: cssVar('--muted') });
}
function draw() {
  if (!shell) return;
  const ctx = view.begin();
  ctx.fillStyle = cssVar('--scene-bg');
  ctx.fillRect(0, 0, SCENE.w, SCENE.h);
  if (shell.tab === 'effects') drawEffects(ctx);
  else if (shell.tab === 'characteristics') drawCharacteristics(ctx);
  else if (shell.tab === 'balance') drawBalanceTab(ctx);
  else drawVector(ctx);
}

/* ---------- Tab 1 ---------- */
function drawEffects(ctx) {
  const st = S.effects;
  if (st.obj === 'ball') { drawBall(ctx); return; }
  // side view: table top
  ctx.fillStyle = cssVar('--wood');
  ctx.fillRect(10, CASE.y + 12, SCENE.w - 20, 16);
  ctx.fillRect(40, CASE.y + 28, 14, 70); ctx.fillRect(SCENE.w - 54, CASE.y + 28, 14, 70);
  if (st.obj === 'case') {
    const x = st.caseX, top = CASE.y + 12 - CASE.h;
    ctx.fillStyle = cssVar('--s5');
    roundRect(ctx, x, top, CASE.w, CASE.h, 8); ctx.fill();
    ctx.fillStyle = cssVar('--s4'); ctx.fillRect(x + 6, top + CASE.h / 2 - 2, CASE.w - 12, 4);
    // string
    const ax = x + CASE.w, ay = top + CASE.h / 2;
    const d = Math.hypot(st.hand.x - ax, st.hand.y - ay);
    ctx.strokeStyle = cssVar('--thread'); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(ax, ay);
    if (d >= CASE.L0 - 1) ctx.lineTo(st.hand.x, st.hand.y);
    else ctx.quadraticCurveTo((ax + st.hand.x) / 2, Math.max(ay, st.hand.y) + (CASE.L0 - d) * 0.6, st.hand.x, st.hand.y);
    ctx.stroke();
    label(ctx, t('stringLabel'), (ax + st.hand.x) / 2, Math.min(ay, st.hand.y) - 14, { size: 11, color: cssVar('--muted') });
    hand(ctx, st.hand.x, st.hand.y);
    if (st.caseX > CASE.x0 + 1) {
      ctx.strokeStyle = cssVar('--accent'); ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5;
      ctx.strokeRect(CASE.x0, top, CASE.w, CASE.h); ctx.setLineDash([]);
    }
  } else {
    // balloon pressed by a hand from above
    const p = st.press;
    const rx = 62 * (1 + 0.32 * p), ry = 62 * (1 - 0.38 * p);
    const cx = 300, cy = CASE.y + 12 - ry;
    ctx.fillStyle = cssVar('--s1');
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.ellipse(cx - rx * 0.35, cy - ry * 0.4, rx * 0.18, ry * 0.12, -0.5, 0, Math.PI * 2); ctx.fill();
    // outline of the balloon before pressing
    if (p > 0.02) {
      ctx.strokeStyle = cssVar('--muted'); ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(cx, CASE.y + 12 - 62, 62, 62, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
    // hand (palm) on top
    const hy = cy - ry - 10;
    ctx.fillStyle = cssVar('--skin');
    roundRect(ctx, cx - 40, hy - 18, 80, 22, 10); ctx.fill();
    ctx.fillRect(cx - 12, hy - 70, 24, 56);
    if (p > 0.02) {
      ctx.strokeStyle = cssVar('--accent'); ctx.fillStyle = cssVar('--accent'); ctx.lineWidth = 3;
      arrow(ctx, cx + 70, hy - 60, cx + 70, hy - 60 + 20 + 40 * p, 9);
    }
  }
}
function drawBall(ctx) {
  const st = S.effects;
  ctx.fillStyle = cssVar('--wood');
  roundRect(ctx, 10, 18, SCENE.w - 20, SCENE.h - 26, 12); ctx.fill();
  ctx.fillStyle = '#f2f1ec';
  roundRect(ctx, 22, 28, SCENE.w - 44, SCENE.h - 46, 8); ctx.fill();
  label(ctx, t('chalk'), 300, 44, { size: 11, weight: 600, color: '#8a8a80', halo: false });
  // trace
  if (st.path.length > 1) {
    ctx.strokeStyle = '#7d7a70'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    st.path.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  }
  if (st.magnet) {
    const m = BALL.magnet;
    ctx.fillStyle = '#d23c3c'; ctx.fillRect(m.x - 50, m.y - 10, 50, 20);
    ctx.fillStyle = '#2f6db5'; ctx.fillRect(m.x, m.y - 10, 50, 20);
    ctx.fillStyle = '#ffffff'; ctx.font = font(12, 800); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('N', m.x - 25, m.y + 1); ctx.fillText('S', m.x + 25, m.y + 1);
    label(ctx, t('magnetLabel'), m.x, m.y - 22, { size: 11, weight: 600, color: '#5b5b54', halo: false });
  }
  const b = st.ball || { x: BALL.x0, y: BALL.y0 };
  const grad = ctx.createRadialGradient(b.x - 4, b.y - 4, 1, b.x, b.y, 10);
  grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, cssVar('--metal'));
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(b.x, b.y, 10, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#59626e'; ctx.lineWidth = 1; ctx.stroke();
  if (!st.ball) {
    ctx.strokeStyle = cssVar('--accent'); ctx.fillStyle = cssVar('--accent'); ctx.lineWidth = 2;
    arrow(ctx, b.x + 16, b.y, b.x + 56, b.y, 8);
  }
}

/* ---------- Tab 2 ---------- */
function pullState() {
  const st = S.characteristics;
  const P = POINTS[st.point];
  const dx = st.hand.x - P.x, dy = st.hand.y - P.y;
  const d = Math.hypot(dx, dy);
  const stretch = Math.max(0, d - PULL.L0);
  const angle = (Math.atan2(-dy, dx) * 180) / Math.PI; // + above the horizontal
  return { P, d, ux: dx / (d || 1), uy: dy / (d || 1), stretch, angle };
}
function drawCharacteristics(ctx) {
  const st = S.characteristics;
  const p = pullState();
  // floor and table (side view)
  ctx.fillStyle = cssVar('--bench');
  ctx.fillRect(10, 300, SCENE.w - 20, 30);
  ctx.fillStyle = cssVar('--wood');
  ctx.fillRect(120, 146, 222, 20);
  ctx.fillRect(132, 166, 16, 134); ctx.fillRect(316, 166, 16, 134);
  label(ctx, t('table'), 200, 156, { size: 11, weight: 700, color: '#ffffff', halo: false });
  // the two possible points
  for (const [id, pt] of Object.entries(POINTS)) {
    ctx.fillStyle = id === st.point ? cssVar('--accent') : cssVar('--muted');
    ctx.beginPath(); ctx.arc(pt.x, pt.y, 4.5, 0, Math.PI * 2); ctx.fill();
    label(ctx, id === 'O' ? 'O' : "O'", pt.x + (id === 'O' ? 12 : -12), pt.y + (id === 'O' ? 14 : -14), { size: 14, weight: 800, color: id === st.point ? cssVar('--accent') : cssVar('--muted') });
  }
  // line of action (dashed, through the point along the string)
  if (p.stretch > 0) {
    ctx.strokeStyle = cssVar('--muted'); ctx.setLineDash([6, 6]); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(p.P.x - p.ux * 400, p.P.y - p.uy * 400); ctx.lineTo(p.P.x + p.ux * 600, p.P.y + p.uy * 600); ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, t('lineOfAction'), p.P.x - p.ux * 190 + p.uy * 14, p.P.y - p.uy * 190 - p.ux * 14, { size: 11, weight: 600, color: cssVar('--muted') });
  }
  // string with a rubber band in the middle
  const L = p.d;
  const s1 = 40, rb = 40 + p.stretch; // plain string, rubber band (stretched)
  const at = (s) => [p.P.x + p.ux * s, p.P.y + p.uy * s];
  const taut = p.stretch > 0;
  ctx.lineCap = 'round';
  if (taut) {
    ctx.strokeStyle = cssVar('--thread'); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(...at(0)); ctx.lineTo(...at(s1)); ctx.moveTo(...at(s1 + rb)); ctx.lineTo(...at(L)); ctx.stroke();
    ctx.strokeStyle = '#b5651d'; ctx.lineWidth = 6 - Math.min(3, p.stretch / 50);
    ctx.beginPath(); ctx.moveTo(...at(s1)); ctx.lineTo(...at(s1 + rb)); ctx.stroke();
    const m = at(s1 + rb / 2);
    label(ctx, t('rubber'), m[0] + p.uy * 16, m[1] - p.ux * 16, { size: 11, weight: 600, color: '#b5651d' });
  } else {
    ctx.strokeStyle = cssVar('--thread'); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(p.P.x, p.P.y);
    ctx.quadraticCurveTo((p.P.x + st.hand.x) / 2, Math.max(p.P.y, st.hand.y) + (PULL.L0 - L) * 0.5, st.hand.x, st.hand.y);
    ctx.stroke();
  }
  hand(ctx, st.hand.x, st.hand.y);
  // force vector at the point of application
  if (taut) {
    const len = 24 + p.stretch * 0.7;
    ctx.strokeStyle = cssVar('--accent'); ctx.fillStyle = cssVar('--accent'); ctx.lineWidth = 3.5;
    arrow(ctx, p.P.x, p.P.y, p.P.x + p.ux * len, p.P.y + p.uy * len, 11);
    label(ctx, 'F', p.P.x + p.ux * len - p.uy * 16, p.P.y + p.uy * len + p.ux * 16, { size: 16, weight: 800, color: cssVar('--accent') });
  }
}

/* ---------- Tab 3 ---------- */
const BAL3 = { x: 300, y: 118, r: 92, pxPerMax: 190 };
let hook3 = null;
function standAndBalance(ctx, x, y, r, F, zero, bal) {
  // support: base, rod and arm
  ctx.fillStyle = cssVar('--wire');
  ctx.fillRect(x - 170, 322, 120, 10);
  ctx.fillRect(x - 116, 14, 8, 310);
  ctx.fillRect(x - 116, 14, 116 + 4, 8);
  ctx.strokeStyle = cssVar('--wire'); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x, 22); ctx.lineTo(x, y - r - 20); ctx.stroke();
  return drawSpringBalance(ctx, { x, y, r, bal, F, zero, rodTravel: 40, lang: getLang() });
}
function drawBalanceTab(ctx) {
  const st = S.balance;
  const bal = BALANCES[st.bi];
  const F = st.mode === 'read' ? st.readF : st.F;
  const zero = st.mode === 'read' ? 0 : st.zero;
  const h = standAndBalance(ctx, BAL3.x, BAL3.y, BAL3.r, Math.min(F, bal.max * 1.02), zero, bal);
  hook3 = h;
  if (F > 0) {
    ctx.strokeStyle = cssVar('--thread'); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(h.hookX, h.hookY); ctx.lineTo(h.hookX, h.hookY + 18); ctx.stroke();
    hand(ctx, h.hookX, h.hookY + 30);
  } else {
    ctx.strokeStyle = cssVar('--accent'); ctx.fillStyle = cssVar('--accent'); ctx.lineWidth = 2;
    if (st.mode === 'use') arrow(ctx, h.hookX + 26, h.hookY, h.hookX + 26, h.hookY + 36, 8);
  }
}

/* ---------- Tab 4 ---------- */
function vecBalance(F) { return F <= 2 ? BALANCES[0] : F <= 5 ? BALANCES[1] : BALANCES[2]; }
function drawVector(ctx) {
  const st = S.vector;
  // left: spring balance pulled down by the hand (Fig. 7-a)
  const bal = vecBalance(st.F);
  const h = standAndBalance(ctx, 140, 96, 62, st.F, 0, bal);
  ctx.strokeStyle = cssVar('--thread'); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(h.hookX, h.hookY); ctx.lineTo(h.hookX, h.hookY + 30); ctx.stroke();
  ctx.fillStyle = cssVar('--text');
  ctx.beginPath(); ctx.arc(h.hookX, h.hookY + 30, 3.5, 0, Math.PI * 2); ctx.fill();
  label(ctx, 'A', h.hookX - 12, h.hookY + 30, { size: 13, weight: 800 });
  ctx.strokeStyle = cssVar('--thread');
  ctx.beginPath(); ctx.moveTo(h.hookX, h.hookY + 30); ctx.lineTo(h.hookX, h.hookY + 44); ctx.stroke();
  hand(ctx, h.hookX, h.hookY + 56);
  // right: grid paper
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(GRID.x0, GRID.y0, GRID.x1 - GRID.x0, GRID.y1 - GRID.y0);
  ctx.strokeStyle = '#b9d3ec'; ctx.lineWidth = 1;
  for (let x = GRID.A.x - Math.floor((GRID.A.x - GRID.x0) / GRID.cm) * GRID.cm; x <= GRID.x1; x += GRID.cm) { ctx.beginPath(); ctx.moveTo(x, GRID.y0); ctx.lineTo(x, GRID.y1); ctx.stroke(); }
  for (let y = GRID.A.y - Math.floor((GRID.A.y - GRID.y0) / GRID.cm) * GRID.cm; y <= GRID.y1; y += GRID.cm) { ctx.beginPath(); ctx.moveTo(GRID.x0, y); ctx.lineTo(GRID.x1, y); ctx.stroke(); }
  ctx.strokeStyle = '#7fa7cf'; ctx.strokeRect(GRID.x0, GRID.y0, GRID.x1 - GRID.x0, GRID.y1 - GRID.y0);
  label(ctx, t('grid'), (GRID.x0 + GRID.x1) / 2, GRID.y1 + 11, { size: 11, weight: 600, color: cssVar('--muted') });
  ctx.fillStyle = '#1a2333';
  ctx.beginPath(); ctx.arc(GRID.A.x, GRID.A.y, 4, 0, Math.PI * 2); ctx.fill();
  ctx.font = font(14, 800); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  ctx.fillText('A', GRID.A.x - 8, GRID.A.y - 8);
  if (st.tip) {
    const ok = st.fb?.type === 'good';
    const c = ok ? '#1d8a4b' : (st.fb?.type === 'bad' ? '#c0392b' : '#e60000');
    ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = 3.5;
    arrow(ctx, GRID.A.x, GRID.A.y, st.tip.x, st.tip.y, 11);
    ctx.font = font(15, 800); ctx.textAlign = 'left';
    ctx.fillText('F', st.tip.x + 8, (GRID.A.y + st.tip.y) / 2);
  }
}
function vecMeasure() {
  const st = S.vector;
  if (!st.tip) return null;
  const dx = (st.tip.x - GRID.A.x) / GRID.cm, dy = (st.tip.y - GRID.A.y) / GRID.cm;
  const L = Math.hypot(dx, dy);
  const vertical = Math.abs(dx) <= 0.3;
  return { L, dir: L < 0.2 ? 'vdir.none' : vertical ? (dy > 0 ? 'vdir.down' : 'vdir.up') : 'vdir.other' };
}

/* ================================================================
   Pointer
   ================================================================ */
let dragging = null;
let dragStartY = 0, dragStartF = 0;
canvas.addEventListener('pointerdown', (ev) => {
  if (!shell) return;
  const p = view.toLogical(ev);
  const tab = shell.tab;
  if (tab === 'effects') {
    const st = S.effects;
    if (st.obj === 'case' && Math.hypot(p.x - st.hand.x, p.y - st.hand.y) < 40) dragging = 'caseHand';
  } else if (tab === 'characteristics') {
    dragging = 'pullHand'; movePull(p);
  } else if (tab === 'balance') {
    const st = S.balance;
    if (st.mode === 'use' && hook3 && Math.abs(p.x - hook3.hookX) < 60 && p.y > hook3.hookY - 40) {
      dragging = 'hook'; dragStartY = p.y; dragStartF = st.F;
    }
  } else if (tab === 'vector') {
    if (Math.hypot(p.x - GRID.A.x, p.y - GRID.A.y) < 40) { dragging = 'vec'; S.vector.fb = null; setTip(p); }
  }
  if (dragging) { canvas.setPointerCapture(ev.pointerId); ev.preventDefault(); }
});
canvas.addEventListener('pointermove', (ev) => {
  if (!dragging) return;
  const p = view.toLogical(ev);
  if (dragging === 'caseHand') moveCaseHand(p);
  else if (dragging === 'pullHand') movePull(p);
  else if (dragging === 'hook') {
    const st = S.balance;
    const bal = BALANCES[st.bi];
    const raw = dragStartF + ((p.y - dragStartY) / BAL3.pxPerMax) * bal.max;
    const F = Math.round(Math.max(0, Math.min(bal.max * 1.15, Math.round(raw / bal.minor) * bal.minor)) * 1e6) / 1e6;
    st.F = F;
    st.fb = F > bal.max + 1e-9 ? { type: 'bad', key: 'fb.over' } : (Math.abs(st.zero) > 1e-9 && F > 0 ? { type: 'warn', key: 'fb.zeroFirst' } : null);
    refresh();
  } else if (dragging === 'vec') setTip(p);
});
const endDrag = () => { dragging = null; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

function moveCaseHand(p) {
  const st = S.effects;
  const hy = Math.max(120, Math.min(CASE.y + 4, p.y));
  let hx = Math.max(60, Math.min(575, p.x));
  const top = CASE.y + 12 - CASE.h;
  const ay = top + CASE.h / 2;
  // the string is CASE.L0 long: if the hand goes further, it pulls the pencil case
  const dy = hy - ay;
  const reach = Math.sqrt(Math.max(0, CASE.L0 ** 2 - dy * dy));
  const ax = st.caseX + CASE.w;
  if (hx - ax > reach) st.caseX = Math.min(SCENE.w - 40 - CASE.w - reach, hx - reach - CASE.w);
  hx = Math.max(hx, st.caseX + CASE.w - reach);
  st.hand = { x: hx, y: hy };
  refresh();
}
function movePull(p) {
  const st = S.characteristics;
  const P = POINTS[st.point];
  let dx = p.x - P.x, dy = p.y - P.y;
  if (dx < 30) dx = 30; // pull away from the table, towards the right
  let d = Math.hypot(dx, dy);
  const maxD = PULL.L0 + PULL.maxStretch;
  if (d > maxD) { dx *= maxD / d; dy *= maxD / d; d = maxD; }
  st.hand = { x: Math.min(585, P.x + dx), y: Math.max(20, Math.min(292, P.y + dy)) };
  refresh();
}
function setTip(p) {
  const x = Math.max(GRID.x0, Math.min(GRID.x1, p.x)), y = Math.max(GRID.y0, Math.min(GRID.y1, p.y));
  // snap the length to 0.1 cm along the drawn direction
  const dx = x - GRID.A.x, dy = y - GRID.A.y;
  const L = Math.hypot(dx, dy) / GRID.cm;
  const Ls = Math.round(L * 10) / 10;
  const k = L > 0 ? Ls / L : 0;
  let tx = GRID.A.x + dx * k, ty = GRID.A.y + dy * k;
  if (Math.abs(tx - GRID.A.x) < 0.25 * GRID.cm) tx = GRID.A.x; // help to draw a vertical line
  S.vector.tip = { x: tx, y: ty };
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
const newton = (v, dec = 2) => qty(v, dec, 'N');
const decFor = (bal) => (bal.minor < 0.1 ? 2 : 1);

/* ---------- Tab 1 ---------- */
function buildEffects() {
  const st = S.effects;
  ui.obj = createSegmented({
    labelKey: 'ctl.object',
    options: [{ value: 'case', labelKey: 'obj.case' }, { value: 'ball', labelKey: 'obj.ball' }, { value: 'balloon', labelKey: 'obj.balloon' }],
    value: st.obj,
    onChange: (v) => { st.obj = v; buildTab('effects'); },
  });
  controlsBody.append(ui.obj.root);
  if (st.obj === 'case') controlsBody.append(hint('hint.case'));
  else if (st.obj === 'ball') {
    ui.mag = createSegmented({
      labelKey: 'ctl.magnet',
      options: [{ value: 'off', labelKey: 'magnet.off' }, { value: 'on', labelKey: 'magnet.on' }],
      value: st.magnet ? 'on' : 'off',
      onChange: (v) => { st.magnet = v === 'on'; clearBall(); refresh(); },
    });
    controlsBody.append(ui.mag.root, el('div', { class: 'btn-row' }, [
      createButton({ labelKey: 'ctl.throw', variant: 'primary', onClick: () => {
        clearBall();
        st.ball = { x: BALL.x0, y: BALL.y0, vx: BALL.vx, vy: 0, done: false };
        st.thrown = true; st.path = [[BALL.x0, BALL.y0]];
        loop.start(); refresh();
      } }),
      createButton({ labelKey: 'ctl.cleanPowder', variant: 'secondary', onClick: () => { clearBall(); refresh(); } }),
    ]));
  } else {
    ui.press = createSlider({ labelKey: 'ctl.press', min: 0, max: 100, step: 1, value: Math.round(st.press * 100), unit: '%', onInput: (v) => { st.press = v / 100; refresh(); } });
    controlsBody.append(ui.press.root);
  }
  controlsBody.append(el('div', { class: 'btn-row', style: 'margin-top:10px' }, [createButton({ labelKey: 'ui.reset', variant: 'ghost', onClick: () => resetTab('effects') })]));
  ui.dl = el('dl', { class: 'meas' });
  measuresBody.append(ui.dl);
}
function clearBall() {
  loop.stop();
  const st = S.effects;
  st.ball = null; st.path = []; st.thrown = false; st.curved = false;
}
function updateEffects() {
  const st = S.effects;
  const yn = (b) => t(b ? 'yes' : 'no');
  let rows;
  if (st.obj === 'case') {
    const moved = st.caseX > CASE.x0 + 1;
    rows = [[t('m.effect'), t(moved ? 'eff.motion' : 'eff.none'), moved ? 'good-text' : ''], [t('m.moves'), yn(moved)], [t('m.shape'), yn(false)]];
  } else if (st.obj === 'ball') {
    const done = st.ball?.done;
    const eff = !st.thrown ? 'eff.none' : (st.magnet ? (st.curved ? 'eff.modify' : 'eff.none') : 'eff.straight');
    rows = [
      [t('m.traj'), st.thrown && st.path.length > 4 ? t(st.curved ? 'traj.curved' : 'traj.straight') : '—'],
      [t('m.effect'), t(eff), eff === 'eff.modify' ? 'good-text' : ''],
    ];
    void done;
  } else {
    const p = st.press > 0.02;
    rows = [[t('m.effect'), t(p ? 'eff.deform' : 'eff.none'), p ? 'good-text' : ''], [t('m.moves'), yn(false)], [t('m.shape'), yn(p)]];
  }
  measRows(ui.dl, rows);
}

/* ---------- Tab 2 ---------- */
function buildCharacteristics() {
  const st = S.characteristics;
  ui.point = createSegmented({
    labelKey: 'ctl.point',
    options: [{ value: 'O', labelKey: 'pt.O' }, { value: 'Op', labelKey: 'pt.Op' }],
    value: st.point,
    onChange: (v) => { st.point = v; movePull(st.hand); },
  });
  controlsBody.append(ui.point.root, el('div', { class: 'btn-row' }, [createButton({ labelKey: 'ui.reset', variant: 'ghost', onClick: () => resetTab('characteristics') })]), hint('hint.pull'));
  ui.dl = el('dl', { class: 'meas' });
  measuresBody.append(ui.dl);
}
function updateCharacteristics() {
  const st = S.characteristics;
  ui.point.set(st.point);
  const p = pullState();
  const name = st.point === 'O' ? 'O' : "O'";
  const taut = p.stretch > 0;
  const elong = p.stretch / 30; // cm (drawing: 30 px ↔ 1 cm of elongation)
  const mag = !taut ? 'mag.none' : elong < 1.2 ? 'mag.small' : elong < 3 ? 'mag.medium' : 'mag.large';
  measRows(ui.dl, [
    [t('m.point'), taut ? name : '—'],
    [t('m.line'), taut ? t('line.text', { a: `${num(Math.abs(Math.round(p.angle)), 0)}°` }) : '—'],
    [t('m.dir'), taut ? t('dir.text', { p: name }) : '—'],
    [t('m.elong'), qty(elong, 1, 'cm')],
    [t('m.mag'), t(mag)],
  ]);
}

/* ---------- Tab 3 ---------- */
function buildBalance() {
  const st = S.balance;
  ui.mode = createSegmented({
    labelKey: 'ctl.mode',
    options: [{ value: 'use', labelKey: 'mode.use' }, { value: 'read', labelKey: 'mode.read' }],
    value: st.mode,
    onChange: (v) => { st.mode = v; st.fb = null; if (v === 'read') newReading(); buildTab('balance'); },
  });
  ui.range = createSegmented({
    labelKey: 'ctl.range',
    options: BALANCES.map((b, i) => ({ value: String(i), labelKey: `rng${i}` })),
    value: String(st.bi),
    onChange: (v) => {
      st.bi = Number(v); st.F = 0; st.fb = null;
      st.zero = newZero(BALANCES[st.bi]);
      if (st.mode === 'read') newReading();
      refresh();
    },
  });
  controlsBody.append(ui.mode.root, ui.range.root);
  ui.dl = el('dl', { class: 'meas' });
  ui.status = statusBox();
  if (st.mode === 'use') {
    const turn = (s) => {
      const bal = BALANCES[st.bi];
      st.zero = Math.round((st.zero + s * bal.minor / 2) / (bal.minor / 2)) * (bal.minor / 2);
      if (Math.abs(st.zero) < 1e-9) st.zero = 0;
      if (st.fb?.key === 'fb.zeroFirst' && st.zero === 0) st.fb = null;
      refresh();
    };
    controlsBody.append(
      el('div', { class: 'ctl' }, [el('span', { class: 'ctl-label', dataset: { i18n: 'ctl.zero' } }, t('ctl.zero')),
        el('div', { class: 'btn-row' }, [
          createButton({ labelKey: 'ctl.zeroMinus', variant: 'secondary', onClick: () => turn(-1) }),
          createButton({ labelKey: 'ctl.zeroPlus', variant: 'secondary', onClick: () => turn(1) }),
        ])]),
      el('div', { class: 'btn-row' }, [createButton({ labelKey: 'ui.reset', variant: 'ghost', onClick: () => resetTab('balance') })]),
      hint('hint.hook'),
    );
  } else {
    const check = () => {
      const bal = BALANCES[st.bi];
      const x = parseNum(st.readInput);
      if (!Number.isFinite(x)) st.fb = { type: 'warn', key: 'fb.invalid' };
      else {
        st.total += 1;
        if (Math.abs(x - st.readF) < bal.minor / 2) { st.ok += 1; st.fb = { type: 'good', key: 'fb.readOk', params: { v: newton(st.readF, decFor(bal)) } }; }
        else st.fb = { type: 'bad', key: 'fb.readWrong', params: { d: newton(bal.minor, decFor(bal)) } };
      }
      refresh();
    };
    const input = el('input', { class: 'text-input', type: 'text', inputmode: 'decimal', autocomplete: 'off', id: 'read-input' });
    input.value = st.readInput;
    input.addEventListener('input', () => { st.readInput = input.value; });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') check(); });
    ui.input = input;
    controlsBody.append(
      el('div', { class: 'ctl' }, [el('label', { for: 'read-input', dataset: { i18n: 'ctl.yourReading' } }, t('ctl.yourReading')),
        el('div', { class: 'input-row' }, [input, createButton({ labelKey: 'ctl.check', variant: 'primary', onClick: check })])]),
      el('div', { class: 'btn-row' }, [
        createButton({ labelKey: 'ctl.newReading', variant: 'primary', onClick: () => { newReading(); refresh(); } }),
        createButton({ labelKey: 'ctl.showAnswer', variant: 'ghost', onClick: () => { const bal = BALANCES[st.bi]; st.fb = { type: 'warn', key: 'fb.readAnswer', params: { v: newton(st.readF, decFor(bal)) } }; refresh(); } }),
      ]),
    );
  }
  measuresBody.append(ui.dl, ui.status);
}
function newReading() {
  const st = S.balance;
  const bal = BALANCES[st.bi];
  const n = Math.round(bal.max / bal.minor);
  let F;
  do { F = randInt(Math.round(n * 0.1), Math.round(n * 0.95)) * bal.minor; } while (Math.abs(F - st.readF) < 1e-9);
  st.readF = Math.round(F * 100) / 100;
  st.readInput = '';
  if (ui.input) ui.input.value = '';
  st.fb = null;
}
function updateBalance() {
  const st = S.balance;
  const bal = BALANCES[st.bi];
  ui.mode.set(st.mode);
  ui.range.set(String(st.bi));
  if (st.mode === 'use') {
    const reading = shown(Math.min(st.F, bal.max * 1.02), st.zero, bal.max);
    const zeroOk = Math.abs(st.zero) < 1e-9;
    measRows(ui.dl, [
      [t('m.zero'), t(zeroOk ? 'zero.ok' : 'zero.no'), zeroOk ? 'good-text' : 'bad-text'],
      [t('m.reading'), newton(Math.max(0, Math.min(bal.max, reading)), decFor(bal)), zeroOk ? '' : 'bad-text'],
      [t('m.max'), newton(bal.max, 0)],
    ]);
  } else {
    measRows(ui.dl, [[t('m.max'), newton(bal.max, 0)], [t('m.score'), `${st.ok} / ${st.total}`]]);
  }
  showStatus(ui.status, st.fb);
}

/* ---------- Tab 4 ---------- */
const SCALES = [0.5, 1, 2];
function buildVector() {
  const st = S.vector;
  ui.scale = createSegmented({
    labelKey: 'ctl.scale',
    options: SCALES.map((s) => ({ value: String(s), labelKey: `sc${s}` })),
    value: String(st.scale),
    onChange: (v) => { st.scale = Number(v); st.fb = null; refresh(); },
  });
  controlsBody.append(
    el('div', { class: 'btn-row', style: 'margin-bottom:12px' }, [
      createButton({ labelKey: 'ctl.taskBook', variant: 'secondary', onClick: () => { Object.assign(st, { F: 1, scale: 0.5, tip: null, fb: null, book: true }); refresh(); } }),
      createButton({ labelKey: 'ctl.taskNew', variant: 'primary', onClick: () => newTask() }),
    ]),
    ui.scale.root,
    el('div', { class: 'btn-row' }, [
      createButton({ labelKey: 'ctl.checkVector', variant: 'primary', onClick: () => checkVector() }),
      createButton({ labelKey: 'ctl.clearVector', variant: 'ghost', onClick: () => { st.tip = null; st.fb = null; refresh(); } }),
    ]),
    hint('hint.draw'),
  );
  ui.dl = el('dl', { class: 'meas' });
  ui.status = statusBox();
  measuresBody.append(ui.dl, ui.status);
}
function newTask() {
  const st = S.vector;
  let F, s;
  do {
    F = randInt(1, 16) * 0.5;
    s = SCALES[randInt(0, 2)];
  } while (F / s > 10 || F / s < 1 || (F === st.F && s === st.scale));
  Object.assign(st, { F, scale: s, tip: null, fb: null, book: false });
  refresh();
}
function checkVector() {
  const st = S.vector;
  const m = vecMeasure();
  const target = st.F / st.scale;
  const p = { F: newton(st.F, st.F % 1 ? 1 : 0), s: num(st.scale, st.scale % 1 ? 1 : 0), L: qty(target, target % 1 ? 1 : 0, 'cm') };
  if (!m || m.L < 0.2) st.fb = { type: 'warn', key: 'fb.vecNone' };
  else if (m.dir !== 'vdir.down') st.fb = { type: 'bad', key: 'fb.vecDir' };
  else if (Math.abs(m.L - target) > 0.15) st.fb = { type: 'bad', key: 'fb.vecLen', params: p };
  else st.fb = { type: 'good', key: 'fb.vecOk', params: p };
  refresh();
}
function updateVector() {
  const st = S.vector;
  ui.scale.set(String(st.scale));
  const m = vecMeasure();
  measRows(ui.dl, [
    [t('m.F'), newton(st.F, st.F % 1 ? 1 : 0)],
    [t('m.scale'), t('scale.v', { s: num(st.scale, st.scale % 1 ? 1 : 0) })],
    [t('m.char'), t('char.text')],
    [t('m.yourLen'), m ? qty(m.L, 1, 'cm') : '—'],
    [t('m.yourDir'), m ? t(m.dir) : '—'],
  ]);
  showStatus(ui.status, st.fb);
}

/* ---------- Tab switching ---------- */
function buildTab(id) {
  loop.stop();
  controlsBody.replaceChildren();
  measuresBody.replaceChildren();
  ui = {};
  if (id === 'effects') buildEffects();
  else if (id === 'characteristics') buildCharacteristics();
  else if (id === 'balance') buildBalance();
  else buildVector();
  refresh();
}
function updateMeasures() {
  if (!shell || !ui.dl) return;
  if (shell.tab === 'effects') updateEffects();
  else if (shell.tab === 'characteristics') updateCharacteristics();
  else if (shell.tab === 'balance') updateBalance();
  else updateVector();
}
function refresh() { updateMeasures(); requestDraw(); }
function resetTab(id) {
  S[id] = initialState()[id];
  if (id === 'balance') S.balance.zero = newZero(BALANCES[0]);
  buildTab(id);
}

// Labels of the segmented controls that contain numbers (formatted per language)
function numberStrings() {
  const s = { en: {}, fr: {} };
  for (const lang of ['en', 'fr']) {
    BALANCES.forEach((b, i) => { s[lang][`rng${i}`] = strings[lang]['range.v'].replace('{m}', num(b.max, 0, lang)); });
    for (const sc of SCALES) s[lang][`sc${sc}`] = strings[lang]['scale.v'].replace('{s}', num(sc, sc % 1 ? 1 : 0, lang));
    s[lang]['pt.O'] = 'O';
    s[lang]['pt.Op'] = "O'";
  }
  return s;
}
const ns = numberStrings();
const allStrings = { en: { ...strings.en, ...ns.en }, fr: { ...strings.fr, ...ns.fr } };

onLangChange(() => { if (shell) buildTab(shell.tab); });
S.balance.zero = newZero(BALANCES[0]);

shell = initSim({
  strings: allStrings,
  tabs: [
    { id: 'effects', labelKey: 'tab.effects' },
    { id: 'characteristics', labelKey: 'tab.characteristics' },
    { id: 'balance', labelKey: 'tab.balance' },
    { id: 'vector', labelKey: 'tab.vector' },
  ],
  initialTab: 'effects',
  onTab: buildTab,
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, pullState, vecMeasure };
