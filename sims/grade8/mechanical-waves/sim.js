// Grade 8 — Mechanical waves and vibratory motion (Ch.11 Act. 1, 2, 4, 5, 6)
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num, qty } from '../../../shared/format.js';
import { createButton, createSegmented, createSlider, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, font } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { label } from '../../../shared/figures.js';
import { drawStopwatch, fmtStopwatch } from '../../../shared/stopwatch.js';
import { calcCell, calcSig, calcDone } from '../../../shared/calc-cell.js';
import { G } from '../../../shared/constants.js';

/* ================================================================
   Model
   ================================================================ */
const RIP = { pxPerCm: 4, v: 100 }; // 25 cm/s on water
const ROPE = { x0: 52, x1: 532, y0: 176, v: 187.5, pxPerM: 120 }; // 4 m cord, 1.5 m/s
const PEG_X = ROPE.x0 + 2 * ROPE.pxPerM;
const LENGTHS = [0.5, 0.75, 1, 1.25];
const PEND = { pivot: { x: 190, y: 26 }, pxPerM: 220, theta0: (8 * Math.PI) / 180 };
const SPR = { x0: 70, x1: 600, y0: 170, v: 260, pxPerCm: 8 };
const M_DIST = 170; // point M from the tap, px
const period = (L) => 2 * Math.PI * Math.sqrt(L / G);

let now = 0; // simulation clock (s)

// A line driven at its left end: y(x, t) = source(t − x / v). The source history is sampled each frame.
function makeLine(v) {
  return {
    v, hist: [], src: 0,
    push(time) { this.hist.push([time, this.src]); while (this.hist.length > 2 && this.hist[0][0] < time - 8) this.hist.shift(); },
    at(time) {
      const h = this.hist;
      if (!h.length || time < h[0][0]) return 0;
      for (let i = h.length - 1; i > 0; i--) {
        if (h[i - 1][0] <= time) {
          const [t0, y0] = h[i - 1], [t1, y1] = h[i];
          return t1 === t0 ? y1 : y0 + ((y1 - y0) * (time - t0)) / (t1 - t0);
        }
      }
      return h[h.length - 1][1];
    },
    y(dx) { return this.at(now - dx / this.v); },
    clear() { this.hist = []; this.src = 0; },
  };
}
const rope = makeLine(ROPE.v);
const spring = makeLine(SPR.v);

function initialState() {
  return {
    ripples: { drops: [], rows: [], fb: null },
    rope: { pulseAt: null, dragging: false, handY: 0, handleMoved: false, pegMax: 0, sent: false, arrived: false },
    pendulum: { L: 1, released: false, tRel: 0, n: 10, running: false, sw: 0, swStart: 0, count: 0, pressed: null, rows: [], fb: null },
    periodic: { part: 'drops', T: 1, tapOn: true, lastDrop: -10, drops: [], passes: [], A: 3, Ts: 1, ampMax: 0 },
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
    now += dt;
    if (!shell) return false;
    const tab = shell.tab;
    if (tab === 'ripples') {
      const st = S.ripples;
      st.drops = st.drops.filter((d) => (now - d.t0) * RIP.v < 760);
      return st.drops.length > 0;
    }
    if (tab === 'rope') {
      const st = S.rope;
      if (st.pulseAt != null && !st.dragging) {
        const u = (now - st.pulseAt) / 0.45;
        st.handY = u < 1 ? -46 * Math.sin(Math.PI * u) : 0;
        if (u >= 1) st.pulseAt = null;
      }
      rope.src = st.handY;
      rope.push(now);
      const pegY = rope.y(PEG_X - ROPE.x0) * damp(PEG_X);
      st.pegMax = Math.max(st.pegMax, Math.abs(pegY));
      const endY = rope.y(ROPE.x1 - ROPE.x0) * damp(ROPE.x1);
      if (Math.abs(endY) > 4) { st.handleMoved = true; st.arrived = true; }
      if (Math.abs(st.handY) > 2) st.sent = true;
      return true;
    }
    if (tab === 'pendulum') {
      const st = S.pendulum;
      if (st.running) { st.sw = now - st.swStart; st.count = Math.floor(st.sw / period(st.L) + 1e-6); }
      return st.released || st.running;
    }
    if (tab === 'periodic') {
      const st = S.periodic;
      if (st.part === 'drops') {
        if (st.tapOn && now - st.lastDrop >= st.T - 1e-6) { st.lastDrop = now; st.drops.push(now); }
        for (const d of st.drops) {
          const r0 = (now - dt - d) * RIP.v, r1 = (now - d) * RIP.v;
          if (r0 < M_DIST && r1 >= M_DIST) { st.passes.push(d + M_DIST / RIP.v); if (st.passes.length > 6) st.passes.shift(); }
        }
        st.drops = st.drops.filter((d) => (now - d) * RIP.v < 700);
        return true;
      }
      spring.src = st.A * SPR.pxPerCm * Math.sin((2 * Math.PI * now) / st.Ts);
      spring.push(now);
      return true;
    }
    return false;
  },
  render() { draw(); updateMeasures(); },
});
function damp(x) { return 1 - 0.18 * ((x - ROPE.x0) / (ROPE.x1 - ROPE.x0)); }

/* ================================================================
   Drawing
   ================================================================ */
function hand(ctx, x, y) {
  ctx.fillStyle = cssVar('--skin');
  ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = cssVar('--wire'); ctx.lineWidth = 1.5; ctx.stroke();
}
function waterBg(ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, SCENE.h);
  g.addColorStop(0, '#5aa7d6'); g.addColorStop(1, '#3d86bd');
  ctx.fillStyle = g; ctx.fillRect(0, 0, SCENE.w, SCENE.h);
}
function rings(ctx, cx, cy, r, alpha) {
  for (let k = 0; k < 3; k++) {
    const rr = r - k * 13;
    if (rr <= 1) continue;
    ctx.strokeStyle = `rgba(255,255,255,${(alpha * (1 - k * 0.3)).toFixed(3)})`;
    ctx.lineWidth = 3 - k * 0.7;
    ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke();
  }
}
function draw() {
  if (!shell) return;
  const ctx = view.begin();
  ctx.fillStyle = cssVar('--scene-bg');
  ctx.fillRect(0, 0, SCENE.w, SCENE.h);
  if (shell.tab === 'ripples') drawRipples(ctx);
  else if (shell.tab === 'rope') drawRope(ctx);
  else if (shell.tab === 'pendulum') drawPendulum(ctx);
  else drawPeriodic(ctx);
}

/* ---------- Tab 1 ---------- */
function drawRipples(ctx) {
  const st = S.ripples;
  waterBg(ctx);
  label(ctx, t('water'), 14, 16, { size: 11, weight: 700, color: '#eaf5ff', align: 'left', halo: false });
  for (const d of st.drops) {
    const age = now - d.t0;
    if (age < 0.25) { // pebble falling / splash
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath(); ctx.arc(d.x, d.y, 6 * (1 - age * 2), 0, Math.PI * 2); ctx.fill();
    }
    rings(ctx, d.x, d.y, age * RIP.v, Math.max(0, 0.95 - age * 0.14));
  }
  // radius of the last ripple, measured with a ruler
  const d = st.drops[st.drops.length - 1];
  if (d) {
    const r = (now - d.t0) * RIP.v;
    ctx.strokeStyle = '#ffe36b'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + r, d.y); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#ffe36b'; ctx.beginPath(); ctx.arc(d.x, d.y, 3, 0, Math.PI * 2); ctx.fill();
    if (r < 560) label(ctx, `r = ${qty(r / RIP.pxPerCm, 1, 'cm')}`, d.x + r / 2, d.y - 12, { size: 12, weight: 800, color: '#ffe36b', halo: false });
  }
  // ruler at the bottom
  ctx.fillStyle = 'rgba(255,248,220,0.92)'; ctx.fillRect(0, 314, SCENE.w, 26);
  ctx.strokeStyle = '#5b4a1c'; ctx.fillStyle = '#5b4a1c'; ctx.lineWidth = 1; ctx.font = font(9, 600); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let c = 0; c <= 150; c++) {
    const x = c * RIP.pxPerCm;
    const big = c % 10 === 0, mid = c % 5 === 0;
    ctx.beginPath(); ctx.moveTo(x, 314); ctx.lineTo(x, 314 + (big ? 10 : mid ? 7 : 4)); ctx.stroke();
    if (big) ctx.fillText(String(c), Math.max(6, Math.min(594, x)), 326);
  }
}

/* ---------- Tab 2 ---------- */
function drawRope(ctx) {
  const st = S.rope;
  ctx.fillStyle = cssVar('--bench'); ctx.fillRect(0, 300, SCENE.w, 40);
  // door and handle
  ctx.fillStyle = cssVar('--wood'); ctx.fillRect(546, 30, 50, 270);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.strokeRect(546, 30, 50, 270);
  label(ctx, t('door'), 571, 46, { size: 11, color: '#fff', halo: false });
  const endY = rope.y(ROPE.x1 - ROPE.x0) * damp(ROPE.x1);
  const ang = Math.max(-0.7, Math.min(0.7, endY * 0.02));
  ctx.save(); ctx.translate(556, ROPE.y0); ctx.rotate(ang);
  ctx.fillStyle = '#c9a23a'; roundRect(ctx, -26, -5, 34, 10, 4); ctx.fill();
  ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  label(ctx, t('handle'), 530, ROPE.y0 + 46, { size: 11, color: cssVar('--muted'), align: 'right' });
  // cord
  ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let x = ROPE.x0; x <= ROPE.x1 + 0.1; x += 4) {
    const y = ROPE.y0 + rope.y(x - ROPE.x0) * damp(x);
    if (x === ROPE.x0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.lineTo(ROPE.x1 + 8, ROPE.y0 + endY * 0.5);
  ctx.stroke();
  label(ctx, t('cord'), 150, ROPE.y0 + 40, { size: 11, color: cssVar('--muted') });
  // peg: moves up and down only
  const py = ROPE.y0 + rope.y(PEG_X - ROPE.x0) * damp(PEG_X);
  ctx.strokeStyle = cssVar('--muted'); ctx.setLineDash([3, 4]); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PEG_X, 40); ctx.lineTo(PEG_X, 296); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#e04b4b'; roundRect(ctx, PEG_X - 5, py - 22, 10, 22, 3); ctx.fill();
  ctx.fillStyle = '#b83232'; ctx.fillRect(PEG_X - 5, py - 12, 10, 3);
  label(ctx, t('peg'), PEG_X, 32, { size: 11, weight: 700, color: '#c0392b' });
  // distance markers
  ctx.fillStyle = cssVar('--muted'); ctx.font = font(10, 600); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let m = 0; m <= 4; m++) {
    const x = ROPE.x0 + m * ROPE.pxPerM;
    ctx.fillRect(x - 0.5, 304, 1, 8);
    ctx.fillText(`${num(m, 0)} m`, x, 314);
  }
  hand(ctx, ROPE.x0 - 10, ROPE.y0 + st.handY);
  label(ctx, t('hand'), ROPE.x0 - 10, ROPE.y0 + st.handY + 26, { size: 11, color: cssVar('--muted') });
}

/* ---------- Tab 3 ---------- */
let swHits = {};
function pendAngle() {
  const st = S.pendulum;
  if (!st.released) return 0;
  return PEND.theta0 * Math.cos(((2 * Math.PI) / period(st.L)) * (now - st.tRel)) * Math.exp(-(now - st.tRel) * 0.004);
}
function drawPendulum(ctx) {
  const st = S.pendulum;
  const P = PEND.pivot;
  ctx.fillStyle = cssVar('--wire');
  ctx.fillRect(40, 16, 200, 7); ctx.fillRect(40, 16, 7, 312); ctx.fillRect(10, 322, 100, 9);
  const L = st.L * PEND.pxPerM;
  const a = st.released ? pendAngle() : PEND.theta0;
  // rest position
  ctx.strokeStyle = cssVar('--muted'); ctx.setLineDash([4, 5]); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(P.x, P.y); ctx.lineTo(P.x, P.y + L + 24); ctx.stroke(); ctx.setLineDash([]);
  const bx = P.x + L * Math.sin(a), by = P.y + L * Math.cos(a);
  ctx.strokeStyle = cssVar('--thread'); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(P.x, P.y); ctx.lineTo(bx, by); ctx.stroke();
  const gr = ctx.createRadialGradient(bx - 3, by - 3, 1, bx, by, 11);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, cssVar('--metal'));
  ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(bx, by, 11, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#59626e'; ctx.lineWidth = 1; ctx.stroke();
  if (!st.released) {
    ctx.fillStyle = cssVar('--skin'); ctx.beginPath(); ctx.arc(bx + 16, by, 10, 0, Math.PI * 2); ctx.fill();
  }
  label(ctx, `L = ${qty(st.L, 2, 'm')}`, P.x - 14, P.y + L / 2, { size: 12, weight: 800, align: 'right' });
  label(ctx, t('sphere'), bx + 20, by + 22, { size: 11, color: cssVar('--muted'), align: 'left' });
  // stopwatch
  swHits = drawStopwatch(ctx, 470, 150, 92, st.sw, { pressed: st.pressed, running: st.running });
  label(ctx, `${t('m.count')}: ${st.count}`, 470, 300, { size: 13, weight: 800, color: cssVar('--accent') });
}

/* ---------- Tab 4 ---------- */
const TAP = { x: 230, y: 170 };
function drawPeriodic(ctx) {
  const st = S.periodic;
  if (st.part === 'drops') {
    waterBg(ctx);
    for (const d of st.drops) rings(ctx, TAP.x, TAP.y, (now - d) * RIP.v, Math.max(0, 0.9 - (now - d) * 0.12));
    // tap seen from above
    ctx.fillStyle = 'rgba(40,50,60,0.55)'; roundRect(ctx, TAP.x - 70, TAP.y - 9, 70, 18, 6); ctx.fill();
    ctx.fillStyle = '#c7ced6'; ctx.beginPath(); ctx.arc(TAP.x, TAP.y, 9, 0, Math.PI * 2); ctx.fill();
    label(ctx, t('tapLbl'), TAP.x - 40, TAP.y - 20, { size: 11, weight: 700, color: '#eaf5ff', halo: false });
    if (st.tapOn && now - st.lastDrop < 0.15) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(TAP.x, TAP.y, 4, 0, Math.PI * 2); ctx.fill(); }
    // point M
    const mx = TAP.x + M_DIST;
    ctx.fillStyle = '#ffe36b'; ctx.beginPath(); ctx.arc(mx, TAP.y, 5, 0, Math.PI * 2); ctx.fill();
    label(ctx, 'M', mx + 12, TAP.y - 12, { size: 14, weight: 800, color: '#ffe36b', halo: false });
    // ruler
    ctx.fillStyle = 'rgba(255,248,220,0.92)'; ctx.fillRect(0, 314, SCENE.w, 26);
    ctx.strokeStyle = '#5b4a1c'; ctx.fillStyle = '#5b4a1c'; ctx.lineWidth = 1; ctx.font = font(9, 600); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let c = 0; c <= 150; c++) {
      const x = c * RIP.pxPerCm;
      const big = c % 10 === 0, mid = c % 5 === 0;
      ctx.beginPath(); ctx.moveTo(x, 314); ctx.lineTo(x, 314 + (big ? 10 : mid ? 7 : 4)); ctx.stroke();
      if (big) ctx.fillText(String(c), Math.max(6, Math.min(594, x)), 326);
    }
    return;
  }
  // long spring on the ground (seen from above), moved to and fro by the hand
  ctx.fillStyle = cssVar('--bench'); ctx.fillRect(0, 0, SCENE.w, SCENE.h);
  ctx.strokeStyle = cssVar('--muted'); ctx.setLineDash([6, 5]); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(SPR.x0, SPR.y0); ctx.lineTo(SPR.x1, SPR.y0); ctx.stroke(); ctx.setLineDash([]);
  label(ctx, t('rest'), 300, SPR.y0 + 104, { size: 11, color: cssVar('--muted') });
  ctx.strokeStyle = '#6f7a86'; ctx.lineWidth = 1.6;
  let ampNow = 0;
  for (let x = SPR.x0; x <= SPR.x1; x += 7) {
    const y = SPR.y0 + spring.y(x - SPR.x0);
    ampNow = Math.max(ampNow, Math.abs(y - SPR.y0));
    ctx.beginPath(); ctx.ellipse(x, y, 4, 11, 0, 0, Math.PI * 2); ctx.stroke();
  }
  // the spring is very long: it goes on beyond the picture (no wave comes back from the far end)
  ctx.fillStyle = cssVar('--bench');
  for (let i = 0; i < 10; i++) { ctx.globalAlpha = (i + 1) / 10; ctx.fillRect(SCENE.w - 90 + i * 9, SPR.y0 - 70, 9, 140); }
  ctx.globalAlpha = 1;
  label(ctx, `${t('goesOn')} →`, SCENE.w - 12, SPR.y0 + 58, { size: 11, weight: 700, color: cssVar('--muted'), align: 'right' });
  hand(ctx, SPR.x0 - 18, SPR.y0 + spring.src);
  // amplitude marker
  const A = st.A * SPR.pxPerCm;
  if (A > 1) {
    ctx.strokeStyle = cssVar('--accent'); ctx.fillStyle = cssVar('--accent'); ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(SPR.x0, SPR.y0 - A); ctx.lineTo(SPR.x1 - 90, SPR.y0 - A); ctx.moveTo(SPR.x0, SPR.y0 + A); ctx.lineTo(SPR.x1 - 90, SPR.y0 + A); ctx.stroke();
    ctx.setLineDash([]);
    const ax = 300;
    ctx.beginPath(); ctx.moveTo(ax, SPR.y0); ctx.lineTo(ax, SPR.y0 - A); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ax - 4, SPR.y0 - A + 6); ctx.lineTo(ax, SPR.y0 - A); ctx.lineTo(ax + 4, SPR.y0 - A + 6); ctx.stroke();
    label(ctx, `A = ${qty(st.A, 1, 'cm')}`, ax + 10, SPR.y0 - A - 12, { size: 12, weight: 800, color: cssVar('--accent'), align: 'left' });
  }
  label(ctx, t('spring'), 140, 24, { size: 12, weight: 700, color: cssVar('--muted') });
  // energy bar
  const e = (st.A / 5) ** 2;
  ctx.fillStyle = cssVar('--surface'); roundRect(ctx, 380, 290, 200, 18, 6); ctx.fill();
  ctx.fillStyle = '#e67e22'; roundRect(ctx, 380, 290, Math.max(0, Math.min(1, e)) * 200, 18, 6); ctx.fill();
  label(ctx, t('m.energy'), 480, 278, { size: 11, weight: 700, color: cssVar('--text') });
  void ampNow;
}

/* ================================================================
   Pointer
   ================================================================ */
let dragging = null;
canvas.addEventListener('pointerdown', (ev) => {
  if (!shell) return;
  const p = view.toLogical(ev);
  if (shell.tab === 'ripples') {
    if (p.y < 312) { dropPebble(p.x, p.y); ev.preventDefault(); }
  } else if (shell.tab === 'rope') {
    const st = S.rope;
    if (Math.hypot(p.x - (ROPE.x0 - 10), p.y - (ROPE.y0 + st.handY)) < 44) {
      dragging = 'hand'; st.dragging = true; st.pulseAt = null;
      canvas.setPointerCapture(ev.pointerId); ev.preventDefault();
    }
  } else if (shell.tab === 'pendulum') {
    for (const [id, h] of Object.entries(swHits)) {
      if (Math.hypot(p.x - h.x, p.y - h.y) < Math.max(h.r, 22)) { press(id); return; }
    }
  }
});
canvas.addEventListener('pointermove', (ev) => {
  if (dragging !== 'hand') return;
  const p = view.toLogical(ev);
  S.rope.handY = Math.max(-70, Math.min(70, p.y - ROPE.y0));
});
const endDrag = () => {
  if (dragging === 'hand') { S.rope.dragging = false; S.rope.handY = 0; }
  dragging = null;
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

function dropPebble(x = 300, y = 160) {
  S.ripples.drops.push({ x, y, t0: now });
  S.ripples.fb = null;
  loop.start(); refresh();
}
function press(id) {
  const st = S.pendulum;
  st.pressed = id;
  setTimeout(() => { st.pressed = null; requestDraw(); }, 160);
  if (id === 'start' && !st.running) { st.running = true; st.swStart = now - st.sw; st.fb = null; }
  else if (id === 'stop' && st.running) { st.running = false; st.sw = now - st.swStart; }
  else if (id === 'reset' && !st.running) { st.sw = 0; st.count = 0; }
  loop.start(); refresh();
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
const btnRow = (...b) => el('div', { class: 'btn-row' }, b);
const yn = (b) => t(b ? 'yes' : 'no');
const resetBtn = (id) => btnRow(createButton({ labelKey: 'ui.reset', variant: 'ghost', onClick: () => resetTab(id) }));
let tableSig = '';
function clearRow(onClick) { return el('div', { class: 'btn-row', style: 'margin-top:8px' }, [createButton({ labelKey: 'ctl.clearTable', variant: 'ghost', onClick })]); }

/* ---------- Tab 1 ---------- */
function buildRipples() {
  const st = S.ripples;
  controlsBody.append(
    btnRow(
      createButton({ labelKey: 'ctl.pebble', variant: 'primary', onClick: () => dropPebble(300, 160) }),
      createButton({ labelKey: 'ctl.record', variant: 'secondary', onClick: () => {
        const d = st.drops[st.drops.length - 1];
        const age = d ? now - d.t0 : 0;
        if (!d || age < 0.3 || age * RIP.v > 560) st.fb = { type: 'warn', key: 'fb.noRipple' };
        else {
          const tt = Math.round(age * 100) / 100, r = Math.round((age * RIP.v) / RIP.pxPerCm * 10) / 10;
          st.rows.push({ t: tt, r }); st.fb = null;
        }
        refresh();
      } }),
    ), hint('hint.pebble'), resetBtn('ripples'));
  ui.dl = el('dl', { class: 'meas' });
  ui.table = el('table', { class: 'data' });
  ui.clear = clearRow(() => { st.rows = []; st.fb = null; refresh(); });
  ui.status = statusBox();
  measuresBody.append(ui.dl, ui.table, ui.clear, ui.status);
}
function updateRipples() {
  const st = S.ripples;
  const d = st.drops[st.drops.length - 1];
  const age = d ? now - d.t0 : null;
  measRows(ui.dl, [
    [t('m.t'), age != null ? qty(age, 2, 's') : '—'],
    [t('m.r'), age != null ? qty((age * RIP.v) / RIP.pxPerCm, 1, 'cm') : '—'],
    [t('m.prop'), d ? t('yes') : '—'],
  ]);
  const sig = calcSig(st.rows) + st.rows.length;
  if (sig !== tableSig) {
    tableSig = sig;
    const head = el('tr', {}, [el('th', {}, t('col.t')), el('th', {}, t('col.r')), el('th', {}, t('col.v'))]);
    const body = st.rows.map((r) => el('tr', {}, [el('td', {}, num(r.t, 2)), el('td', {}, num(r.r, 1)),
      calcCell(r, 'v', { expected: r.r / r.t, decimals: 1, onCheck: (res) => {
        st.fb = res === 'invalid' ? { type: 'warn', key: 'calcInvalid' } : res === 'wrong' ? { type: 'bad', key: 'fb.vWrong' }
          : (st.rows.filter((x) => calcDone(x, 'v')).length >= 2 ? { type: 'good', key: 'fb.vSame' } : { type: 'good', key: 'fb.vOk' });
        refresh();
      } })]));
    ui.table.replaceChildren(el('thead', {}, head), el('tbody', {}, body));
    tableSig = calcSig(st.rows) + st.rows.length;
  }
  ui.table.hidden = st.rows.length === 0;
  ui.clear.hidden = ui.table.hidden;
  showStatus(ui.status, st.fb);
}

/* ---------- Tab 2 ---------- */
function buildRope() {
  const st = S.rope;
  controlsBody.append(btnRow(createButton({ labelKey: 'ctl.shake', variant: 'primary', onClick: () => {
    st.pulseAt = now; st.handleMoved = false; st.arrived = false; st.pegMax = 0; st.sent = true; loop.start();
  } })), hint('hint.rope'), resetBtn('rope'));
  ui.dl = el('dl', { class: 'meas' });
  measuresBody.append(ui.dl);
}
function updateRope() {
  const st = S.rope;
  const going = st.sent && !st.arrived;
  measRows(ui.dl, [
    [t('m.wave'), t(!st.sent ? 'wave.none' : going ? 'wave.going' : 'wave.arrived')],
    [t('m.pegX'), qty(2, 2, 'm')],
    [t('m.pegMoved'), yn(false)],
    [t('m.pegUp'), st.pegMax > 3 ? t('yes') : '—', st.pegMax > 3 ? 'good-text' : ''],
    [t('m.handle'), st.handleMoved ? t('yes') : '—', st.handleMoved ? 'good-text' : ''],
  ]);
}

/* ---------- Tab 3 ---------- */
function buildPendulum() {
  const st = S.pendulum;
  ui.L = createSegmented({
    labelKey: 'ctl.length', options: LENGTHS.map((L) => ({ value: String(L), labelKey: `L${L}` })), value: String(st.L),
    onChange: (v) => { Object.assign(st, { L: Number(v), released: false, running: false, sw: 0, count: 0, fb: null }); refresh(); },
  });
  ui.n = createSegmented({
    labelKey: 'ctl.n', options: [10, 15].map((n) => ({ value: String(n), labelKey: `n${n}` })), value: String(st.n),
    onChange: (v) => { st.n = Number(v); refresh(); },
  });
  ui.rel = createButton({ labelKey: 'ctl.release', variant: 'primary', onClick: () => {
    if (st.released) st.released = false; else { st.released = true; st.tRel = now; }
    buildTab('pendulum');
  } });
  if (st.released) { ui.rel.dataset.i18n = 'ctl.stopPend'; ui.rel.textContent = t('ctl.stopPend'); }
  controlsBody.append(ui.L.root, btnRow(ui.rel), ui.n.root,
    btnRow(
      createButton({ labelKey: 'ctl.start', variant: 'secondary', onClick: () => press('start') }),
      createButton({ labelKey: 'ctl.stop', variant: 'secondary', onClick: () => press('stop') }),
      createButton({ labelKey: 'ctl.reset', variant: 'secondary', onClick: () => press('reset') }),
    ),
    btnRow(createButton({ labelKey: 'ctl.recordPend', variant: 'primary', onClick: () => {
      if (st.running) st.fb = { type: 'warn', key: 'fb.notStopped' };
      else if (st.sw < 0.5) st.fb = { type: 'warn', key: 'fb.zero' };
      else {
        const tr = Math.round(st.sw * 100) / 100;
        const err = Math.abs(tr - st.n * period(st.L)) > 0.5 * period(st.L);
        st.rows.push({ L: st.L, n: st.n, t: tr, err });
        st.fb = err ? { type: 'bad', key: 'fb.countOff', params: { n: st.n, c: st.count } } : null;
      }
      refresh();
    } })),
    hint('hint.pend'), resetBtn('pendulum'));
  ui.dl = el('dl', { class: 'meas' });
  ui.table = el('table', { class: 'data' });
  ui.clear = clearRow(() => { st.rows = []; st.fb = null; refresh(); });
  ui.status = statusBox();
  measuresBody.append(ui.dl, ui.table, ui.clear, ui.status);
}
function updatePendulum() {
  const st = S.pendulum;
  ui.L.set(String(st.L)); ui.n.set(String(st.n));
  measRows(ui.dl, [
    [t('m.L'), qty(st.L, 2, 'm')],
    [t('m.watch'), `${fmtStopwatch(st.sw)} = ${qty(st.sw, 2, 's')}`],
    [t('m.count'), String(st.count)],
  ]);
  const sig = calcSig(st.rows) + st.rows.length;
  if (sig !== tableSig) {
    tableSig = sig;
    const head = el('tr', {}, ['col.L', 'col.n', 'col.tn', 'col.T', 'col.f'].map((k) => el('th', {}, t(k))));
    const body = st.rows.map((r) => {
      const T = r.t / r.n;
      const tTyped = r.calc?.T?.ok ? T : null;
      return el('tr', { class: r.err ? 'bad-row' : '' }, [
        el('td', {}, num(r.L, 2)), el('td', {}, String(r.n)), el('td', { class: r.err ? 'bad-cell' : '' }, num(r.t, 2)),
        calcCell(r, 'T', { expected: T, decimals: 2, err: r.err, onCheck: (res) => {
          st.fb = res === 'invalid' ? { type: 'warn', key: 'calcInvalid' } : res === 'wrong' ? { type: 'bad', key: 'fb.TWrong' } : { type: 'good', key: 'fb.TOk' };
          refresh();
        } }),
        calcCell(r, 'f', { expected: 1 / T, decimals: 2, err: r.err, disabled: tTyped == null, onCheck: (res) => {
          st.fb = res === 'invalid' ? { type: 'warn', key: 'calcInvalid' } : res === 'wrong' ? { type: 'bad', key: 'fb.fWrong' } : { type: 'good', key: 'fb.fOk' };
          refresh();
        } }),
      ]);
    });
    ui.table.replaceChildren(el('thead', {}, head), el('tbody', {}, body));
    tableSig = calcSig(st.rows) + st.rows.length;
  }
  ui.table.hidden = st.rows.length === 0;
  ui.clear.hidden = ui.table.hidden;
  showStatus(ui.status, st.fb);
}

/* ---------- Tab 4 ---------- */
function buildPeriodic() {
  const st = S.periodic;
  ui.part = createSegmented({
    labelKey: 'ctl.part', options: [{ value: 'drops', labelKey: 'part.drops' }, { value: 'spring', labelKey: 'part.spring' }], value: st.part,
    onChange: (v) => { st.part = v; spring.clear(); buildTab('periodic'); },
  });
  controlsBody.append(ui.part.root);
  if (st.part === 'drops') {
    ui.tap = createSegmented({
      labelKey: 'ctl.tap', options: [{ value: 'on', labelKey: 'tap.on' }, { value: 'off', labelKey: 'tap.off' }], value: st.tapOn ? 'on' : 'off',
      onChange: (v) => { st.tapOn = v === 'on'; refresh(); },
    });
    ui.T = createSlider({ labelKey: 'ctl.period', min: 0.5, max: 2, step: 0.1, value: st.T, unit: 's', decimals: 1, onInput: (v) => { st.T = v; st.passes = []; refresh(); } });
    controlsBody.append(ui.tap.root, ui.T.root);
  } else {
    ui.A = createSlider({ labelKey: 'ctl.amp', min: 0, max: 5, step: 0.5, value: st.A, unit: 'cm', decimals: 1, onInput: (v) => { st.A = v; refresh(); } });
    ui.Ts = createSlider({ labelKey: 'ctl.periodHand', min: 0.5, max: 2, step: 0.1, value: st.Ts, unit: 's', decimals: 1, onInput: (v) => { st.Ts = v; spring.clear(); refresh(); } });
    controlsBody.append(ui.A.root, ui.Ts.root);
  }
  controlsBody.append(resetBtn('periodic'));
  ui.dl = el('dl', { class: 'meas' });
  measuresBody.append(ui.dl);
}
function updatePeriodic() {
  const st = S.periodic;
  if (st.part === 'drops') {
    const p = st.passes;
    const dtM = p.length >= 2 ? p[p.length - 1] - p[p.length - 2] : null;
    measRows(ui.dl, [
      [t('m.Tdrops'), qty(st.T, 1, 's')],
      [t('m.Tripples'), dtM != null ? qty(dtM, 1, 's') : '—'],
      [t('m.spaced'), st.drops.length >= 2 ? t('yes') : '—'],
    ]);
  } else {
    const e = Math.round((st.A / 5) ** 2 * 100);
    measRows(ui.dl, [
      [t('m.amp'), qty(st.A, 1, 'cm')],
      [t('m.Tspring'), qty(st.Ts, 1, 's')],
      [t('m.energy'), `${e} %`],
    ]);
  }
}

/* ---------- Tab switching ---------- */
function buildTab(id) {
  controlsBody.replaceChildren();
  measuresBody.replaceChildren();
  ui = {};
  tableSig = '';
  if (id === 'rope') rope.clear();
  if (id === 'periodic') spring.clear();
  if (id === 'ripples') buildRipples();
  else if (id === 'rope') buildRope();
  else if (id === 'pendulum') buildPendulum();
  else buildPeriodic();
  loop.start();
  refresh();
}
function updateMeasures() {
  if (!shell || !ui.dl) return;
  if (shell.tab === 'ripples') updateRipples();
  else if (shell.tab === 'rope') updateRope();
  else if (shell.tab === 'pendulum') updatePendulum();
  else updatePeriodic();
}
function refresh() { updateMeasures(); requestDraw(); }
function resetTab(id) { S[id] = initialState()[id]; buildTab(id); }

const extra = { en: {}, fr: {} };
for (const lang of ['en', 'fr']) {
  for (const L of LENGTHS) extra[lang][`L${L}`] = L < 1 ? `${num(L * 100, 0, lang)} cm` : `${num(L, L % 1 ? 2 : 0, lang)} m`;
  for (const n of [10, 15]) extra[lang][`n${n}`] = strings[lang]['n.v'].replace('{n}', n);
}
onLangChange(() => { if (shell) buildTab(shell.tab); });

shell = initSim({
  strings: { en: { ...strings.en, ...extra.en }, fr: { ...strings.fr, ...extra.fr } },
  tabs: [
    { id: 'ripples', labelKey: 'tab.ripples' },
    { id: 'rope', labelKey: 'tab.rope' },
    { id: 'pendulum', labelKey: 'tab.pendulum' },
    { id: 'periodic', labelKey: 'tab.periodic' },
  ],
  initialTab: 'ripples',
  onTab: buildTab,
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, get now() { return now; }, period, press };
