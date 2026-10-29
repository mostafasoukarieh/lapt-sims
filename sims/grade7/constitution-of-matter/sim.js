// Grade 7 — Constitution of matter (Ch.6): particle model (Act. 1–2, Ex. 3–4), diffusion (Act. 3–4, Ex. 6),
// incompressibility of liquids and solids (§3, Ex. 5)
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num, qty } from '../../../shared/format.js';
import { createSlider, createButton, createSegmented, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, font } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { label } from '../../../shared/figures.js';
import { rng, scatter, lattice, step, vibrate, meanSpacing, drawParticles } from '../../../shared/particles.js';

const SCENE = { w: 600, h: 440 };
const TABLE_Y = 404;

/* ================================================================
   State and particle sets
   ================================================================ */
const BOX = { x0: 150, y0: 60, x1: 450, y1: 380 };
const R = 9;
function makeState(st) {
  const rand = rng(7);
  const bottom = { x0: BOX.x0, y0: BOX.y1 - 125, x1: BOX.x1, y1: BOX.y1 };
  if (st.state === 'solid') return lattice(bottom, { r: R, gap: 0.04 });
  if (st.state === 'liquid') {
    const n = lattice(bottom, { r: R, gap: 0.04 }).length;
    // collision radius a little larger than the drawn particle: slightly larger spaces than in the solid
    const ps = scatter(n, { r: R * 1.12, region: { x0: BOX.x0, y0: BOX.y1 - 185, x1: BOX.x1, y1: BOX.y1 }, speed: 60, rand });
    ps.forEach((p) => { p.dr = R; });
    for (let i = 0; i < 240; i++) step(ps, 1 / 60, { box: BOX, g: 900, v0: 70, tau: 0.2 }); // let it settle
    return ps;
  }
  // gas: only a small part of the particles fit in the drawing (Info panel)
  const ps = scatter(25, { r: R, region: BOX, speed: 200, rand });
  if (st.air) ps.forEach((p, i) => { p.kind = i % 5 === 0 ? 2 : 1; }); // 4 particles of di-nitrogen for 1 of di-oxygen
  return ps;
}
const speedOf = (st) => ({ solid: 0, liquid: 30 + 0.9 * st.agit, gas: 80 + 3.2 * st.agit }[st.state]);

const FLASK = { cx: 300, cy: 250, r: 130 };
const GASBOX = { x0: 170, y0: 50, x1: 430, y1: 390, mid: 220 };
const INK = { x0: 70, y0: 150, x1: 330, y1: 390, nx: 52, ny: 48 };
const ROOM = { x0: 50, y0: 60, x1: 550, y1: 390, nx: 50, ny: 33 };
const SYR = { x0: 110, y0: 140, y1: 320, x1max: 490 };

function initialState(tab) {
  if (tab === 'model') { const st = { view: 'states', state: 'gas', agit: 50, air: false, time: 0, heat: false, f: 0, iodine: [], match: null }; st.ps = makeState(st); return st; }
  if (tab === 'diff') return { exp: 'gas', card: true, time: 0, ...newGas(), ink: null, inkZoom: null, room: null, open: false, smelt: null, speed: 1 };
  return { content: 'air', vol: 100, ps: makeSyringe('air', 100) };
}
let S = { model: initialState('model'), diff: initialState('diff'), comp: initialState('comp') };

function newGas() {
  const rand = rng(11);
  const a = scatter(34, { r: 5, kind: 3, region: { x0: GASBOX.x0, y0: GASBOX.y0, x1: GASBOX.x1, y1: GASBOX.mid - 6 }, speed: 150, rand });
  const b = scatter(34, { r: 5, kind: 4, region: { x0: GASBOX.x0, y0: GASBOX.mid + 6, x1: GASBOX.x1, y1: GASBOX.y1 }, speed: 150, rand, avoid: a });
  return { gas: [...a, ...b] };
}
function field(nx, ny) { return { nx, ny, c: new Float32Array(nx * ny), tmp: new Float32Array(nx * ny) }; }
function diffuse(f, D, dt, mask) {
  // explicit scheme, several small steps (stable when D·dt ≤ 0.2 in cell units)
  const nsub = Math.max(1, Math.ceil((D * dt) / 0.2));
  const k = (D * dt) / nsub;
  const { nx, ny } = f;
  for (let s = 0; s < nsub; s++) {
    const c = f.c, o = f.tmp;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const id = j * nx + i;
      const v = c[id];
      const l = i > 0 ? c[id - 1] : v, r = i < nx - 1 ? c[id + 1] : v, u = j > 0 ? c[id - nx] : v, d = j < ny - 1 ? c[id + nx] : v;
      o[id] = v + k * (l + r + u + d - 4 * v);
    }
    f.c = o; f.tmp = c;
  }
}
// Syringe seen through a "particle view": air (far apart) or water (close together)
function makeSyringe(content, vol) {
  const x1 = SYR.x0 + ((SYR.x1max - SYR.x0) * vol) / 100;
  const rand = rng(5);
  if (content === 'air') return scatter(26, { r: 8, kind: 4, region: { x0: SYR.x0, y0: SYR.y0, x1, y1: SYR.y1 }, speed: 160, rand });
  return lattice({ x0: SYR.x0, y0: SYR.y0, x1, y1: SYR.y1 }, { r: 10, kind: 0, gap: 0.06 }).map((p) => ({ ...p, vx: (rand() - 0.5) * 60, vy: (rand() - 0.5) * 60 }));
}
const minVol = (content) => (content === 'air' ? 30 : 97); // water: practically incompressible

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
const COLORS = () => [cssVar('--particle'), cssVar('--n2'), cssVar('--o2'), cssVar('--no2'), cssVar('--air-part'), cssVar('--iodine'), cssVar('--ink')];

function draw() {
  if (!shell) return;
  const ctx = view.begin();
  ctx.fillStyle = cssVar('--scene-bg');
  roundRect(ctx, 0, 0, SCENE.w, SCENE.h, 12);
  ctx.fill();
  const st = cur();
  if (shell.tab === 'model') drawModel(ctx, st);
  else if (shell.tab === 'diff') drawDiff(ctx, st);
  else drawComp(ctx, st);
}
function container(ctx, b) {
  ctx.fillStyle = cssVar('--surface');
  ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
  ctx.strokeStyle = cssVar('--glass-stroke');
  ctx.lineWidth = 3;
  ctx.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
}

/* ---------- Tab 1 ---------- */
function drawModel(ctx, st) {
  if (st.view === 'states') {
    container(ctx, BOX);
    drawParticles(ctx, st.ps, COLORS());
    label(ctx, t(`state.${st.state}`), (BOX.x0 + BOX.x1) / 2, BOX.y0 - 22, { size: 15, weight: 800 });
    if (st.state === 'gas' && st.air) {
      legend(ctx, [[cssVar('--n2'), t('lbl.n2s')]], BOX.x1 + 14, 120);
      legend(ctx, [[cssVar('--o2'), t('lbl.o2s')]], BOX.x1 + 14, 144);
    }
  } else if (st.view === 'iodine') drawIodine(ctx, st);
  else drawMatch(ctx, st);
}
function drawIodine(ctx, st) {
  const { cx, cy, r } = FLASK;
  // burner flame when heating
  ctx.fillStyle = cssVar('--metal');
  ctx.fillRect(cx - 40, TABLE_Y - 10, 80, 10);
  ctx.fillRect(cx - 8, cy + r + 18, 16, TABLE_Y - cy - r - 28);
  if (st.heat) {
    ctx.fillStyle = 'rgba(255,140,0,0.85)';
    ctx.beginPath(); ctx.moveTo(cx - 12, cy + r + 18); ctx.quadraticCurveTo(cx, cy + r - 16 + Math.sin(st.time * 20) * 3, cx + 12, cy + r + 18); ctx.fill();
  }
  ctx.fillStyle = cssVar('--bench');
  ctx.fillRect(0, TABLE_Y, SCENE.w, SCENE.h - TABLE_Y);
  // flask: violet tint grows with the gas
  ctx.fillStyle = cssVar('--surface');
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = `rgba(122, 52, 160, ${0.28 * st.f})`;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  drawParticles(ctx, st.iodine, COLORS());
  // solid iodine at the bottom
  const n = Math.round(9 * (1 - st.f));
  ctx.fillStyle = cssVar('--iodine');
  for (let i = 0; i < n; i++) {
    const x = cx - 40 + (i % 5) * 18 + (i > 4 ? 9 : 0), y = cy + r - 12 - (i > 4 ? 12 : 0);
    ctx.beginPath(); ctx.moveTo(x - 8, y + 6); ctx.lineTo(x - 3, y - 7); ctx.lineTo(x + 8, y - 3); ctx.lineTo(x + 6, y + 7); ctx.closePath(); ctx.fill();
  }
  ctx.strokeStyle = cssVar('--glass-stroke');
  ctx.lineWidth = 3;
  const a0 = Math.asin(24 / r);
  ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2 + a0, -Math.PI / 2 - a0 + 2 * Math.PI); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 24, cy - r * Math.cos(a0)); ctx.lineTo(cx - 24, cy - r - 50); ctx.moveTo(cx + 24, cy - r * Math.cos(a0)); ctx.lineTo(cx + 24, cy - r - 50); ctx.stroke();
  ctx.fillStyle = cssVar('--wood');
  ctx.fillRect(cx - 28, cy - r - 62, 56, 16);
}
// Ex. 4: three drawings of sodium particles in a random order
function makeMatch() {
  const order = ['solid', 'liquid', 'gas'];
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const panels = order.map((state, k) => {
    const b = { x0: 24 + k * 190, y0: 110, x1: 194 + k * 190, y1: 330 };
    const bottom = { x0: b.x0, y0: b.y1 - 90, x1: b.x1, y1: b.y1 };
    let ps;
    if (state === 'solid') ps = lattice(bottom, { r: 7 });
    else if (state === 'liquid') {
      ps = scatter(lattice(bottom, { r: 7 }).length, { r: 7, region: { x0: b.x0, y0: b.y1 - 130, x1: b.x1, y1: b.y1 }, speed: 40, rand: rng(3 + k) });
      for (let i = 0; i < 300; i++) step(ps, 1 / 60, { box: b, g: 900, v0: 50, tau: 0.2 });
    } else ps = scatter(9, { r: 7, region: b, speed: 0, rand: rng(9 + k) });
    return { state, b, ps, answer: null };
  });
  return { panels, checked: false };
}
function drawMatch(ctx, st) {
  st.match.panels.forEach((pn, k) => {
    container(ctx, pn.b);
    drawParticles(ctx, pn.ps, COLORS());
    label(ctx, t('lbl.drawing', { k: k + 1 }), (pn.b.x0 + pn.b.x1) / 2, pn.b.y0 - 18, { size: 14, weight: 800 });
    if (st.match.checked) {
      const ok = pn.answer === pn.state;
      label(ctx, ok ? `✓ ${t(`state.${pn.state}`)}` : `✗ ${t(`state.${pn.state}`)}`, (pn.b.x0 + pn.b.x1) / 2, pn.b.y1 + 22, { size: 14, weight: 800, color: ok ? cssVar('--good') : cssVar('--bad') });
    }
  });
  label(ctx, t('lbl.sodium'), 300, 60, { size: 14, weight: 700, color: cssVar('--muted') });
}

/* ---------- Tab 2 ---------- */
function drawDiff(ctx, st) {
  if (st.exp === 'gas') drawGasDiff(ctx, st);
  else if (st.exp === 'ink') drawInk(ctx, st);
  else drawRoom(ctx, st);
}
const no2InB = (st) => st.gas.filter((p) => p.kind === 3 && p.y > GASBOX.mid).length / Math.max(1, st.gas.filter((p) => p.kind === 3).length);
function drawGasDiff(ctx, st) {
  const { x0, x1, y0, y1, mid } = GASBOX;
  const fB = no2InB(st);
  container(ctx, { x0, y0, x1, y1: mid });
  container(ctx, { x0, y0: mid, x1, y1 });
  // brown tint following the share of nitrogen dioxide in each flask
  ctx.fillStyle = `rgba(168, 85, 28, ${0.35 * (1 - fB)})`;
  ctx.fillRect(x0, y0, x1 - x0, mid - y0);
  ctx.fillStyle = `rgba(168, 85, 28, ${0.35 * fB})`;
  ctx.fillRect(x0, mid, x1 - x0, y1 - mid);
  drawParticles(ctx, st.gas, COLORS());
  if (st.card) { ctx.fillStyle = cssVar('--wood'); ctx.fillRect(x0 - 26, mid - 4, x1 - x0 + 52, 8); }
  label(ctx, 'A', x0 - 22, (y0 + mid) / 2, { size: 18, weight: 800 });
  label(ctx, 'B', x0 - 22, (mid + y1) / 2, { size: 18, weight: 800 });
  legend(ctx, [[cssVar('--no2'), t('lbl.no2')]], x1 + 14, 80);
  legend(ctx, [[cssVar('--air-part'), t('lbl.air')]], x1 + 14, 104);
}
function inkColor(c) { return `rgba(35, 55, 154, ${Math.min(0.9, c)})`; }
// Draw a concentration field smoothly: one pixel per cell in a small canvas, scaled up with smoothing.
const fieldCanvas = document.createElement('canvas');
function drawField(ctx, f, x0, y0, w, h, [r, g, b], alpha) {
  if (fieldCanvas.width !== f.nx || fieldCanvas.height !== f.ny) { fieldCanvas.width = f.nx; fieldCanvas.height = f.ny; }
  const fc = fieldCanvas.getContext('2d');
  const img = fc.createImageData(f.nx, f.ny);
  for (let i = 0; i < f.c.length; i++) {
    img.data[4 * i] = r; img.data[4 * i + 1] = g; img.data[4 * i + 2] = b;
    img.data[4 * i + 3] = Math.round(255 * Math.min(1, alpha(f.c[i])));
  }
  fc.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(fieldCanvas, x0, y0, w, h);
}
function legend(ctx, items, x, y) {
  ctx.font = font(12, 700);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  let xx = x;
  for (const [color, text] of items) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(xx + 6, y, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = cssVar('--text');
    ctx.fillText(text, xx + 16, y);
    xx += 22 + ctx.measureText(text).width + 14;
  }
}
function drawInk(ctx, st) {
  ctx.fillStyle = cssVar('--bench');
  ctx.fillRect(0, TABLE_Y, SCENE.w, SCENE.h - TABLE_Y);
  const { x0, y0, x1, y1, nx, ny } = INK;
  ctx.fillStyle = cssVar('--water');
  ctx.globalAlpha = 0.35;
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  ctx.globalAlpha = 1;
  drawField(ctx, st.ink, x0, y0, x1 - x0, y1 - y0, [35, 55, 154], (c) => Math.min(0.92, 1.6 * c));
  ctx.strokeStyle = cssVar('--glass-stroke');
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x0, y0 - 40); ctx.lineTo(x0, y1); ctx.lineTo(x1, y1); ctx.lineTo(x1, y0 - 40); ctx.stroke();
  if (!st.dropped) {
    // dropper above the water
    ctx.fillStyle = cssVar('--glass-fill');
    ctx.fillRect((x0 + x1) / 2 - 7, 40, 14, 70);
    ctx.fillStyle = cssVar('--rubber');
    ctx.fillRect((x0 + x1) / 2 - 10, 26, 20, 18);
    ctx.fillStyle = inkColor(0.9);
    ctx.beginPath(); ctx.arc((x0 + x1) / 2, 118, 5, 0, Math.PI * 2); ctx.fill();
  }
  // particle view of a small part of the water (zoom)
  const z = { x0: 380, y0: 160, x1: 560, y1: 340 };
  container(ctx, z);
  ctx.save(); ctx.beginPath(); ctx.rect(z.x0, z.y0, z.x1 - z.x0, z.y1 - z.y0); ctx.clip();
  drawParticles(ctx, st.inkZoom, COLORS());
  ctx.restore();
  label(ctx, t('lbl.zoom'), (z.x0 + z.x1) / 2, z.y0 - 16, { size: 12, weight: 800 });
  legend(ctx, [[cssVar('--air-part'), t('lbl.water')], [cssVar('--ink'), t('lbl.ink')]], z.x0 + 10, z.y1 + 18);
}
function drawRoom(ctx, st) {
  const { x0, y0, x1, y1, nx, ny } = ROOM;
  ctx.fillStyle = cssVar('--surface');
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  drawField(ctx, st.room, x0, y0, x1 - x0, y1 - y0, [214, 80, 160], (c) => Math.min(0.5, 1.5 * c));
  ctx.strokeStyle = cssVar('--glass-stroke');
  ctx.lineWidth = 4;
  ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  // desks
  ctx.fillStyle = cssVar('--wood');
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) ctx.fillRect(190 + i * 110, 150 + j * 110, 70, 34);
  // perfume bottle (top left corner) and the student (bottom right)
  ctx.fillStyle = 'rgb(214, 80, 160)';
  roundRect(ctx, 72, 82, 22, 30, 5); ctx.fill();
  ctx.fillStyle = st.open ? cssVar('--muted') : cssVar('--text');
  ctx.fillRect(78, st.open ? 64 : 74, 10, 8);
  label(ctx, t('lbl.perfume'), 83, 128, { size: 12, weight: 800 });
  const sx = STUDENT[0], sy = STUDENT[1];
  ctx.fillStyle = cssVar('--skin');
  ctx.beginPath(); ctx.arc(sx, sy, 16, 0, Math.PI * 2); ctx.fill();
  label(ctx, st.smelt != null ? t('lbl.smell') : t('lbl.you'), sx, sy + 32, { size: 12, weight: 800, color: st.smelt != null ? cssVar('--accent') : cssVar('--text') });
}
const STUDENT = [500, 340];

/* ---------- Tab 3 ---------- */
const pistonX = (st) => SYR.x0 + ((SYR.x1max - SYR.x0) * st.vol) / 100;
function drawComp(ctx, st) {
  const xp = pistonX(st);
  ctx.fillStyle = cssVar('--surface');
  ctx.fillRect(SYR.x0, SYR.y0, xp - SYR.x0, SYR.y1 - SYR.y0);
  ctx.save(); ctx.beginPath(); ctx.rect(SYR.x0, SYR.y0, xp - SYR.x0, SYR.y1 - SYR.y0); ctx.clip();
  drawParticles(ctx, st.ps, COLORS());
  ctx.restore();
  ctx.strokeStyle = cssVar('--glass-stroke');
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(SYR.x1max + 40, SYR.y0); ctx.lineTo(SYR.x0, SYR.y0); ctx.lineTo(SYR.x0, SYR.y1); ctx.lineTo(SYR.x1max + 40, SYR.y1); ctx.stroke();
  // finger closing the opening
  ctx.fillStyle = cssVar('--skin');
  ctx.beginPath(); ctx.ellipse(SYR.x0 - 20, (SYR.y0 + SYR.y1) / 2, 22, 34, 0, 0, Math.PI * 2); ctx.fill();
  // piston + rod
  ctx.fillStyle = cssVar('--rubber');
  ctx.fillRect(xp, SYR.y0 + 2, 14, SYR.y1 - SYR.y0 - 4);
  ctx.fillStyle = cssVar('--glass-stroke');
  ctx.fillRect(xp + 14, (SYR.y0 + SYR.y1) / 2 - 7, 120, 14);
  ctx.fillRect(xp + 130, SYR.y0 - 10, 12, SYR.y1 - SYR.y0 + 20);
  label(ctx, t(`content.${st.content}`), 300, SYR.y0 - 30, { size: 15, weight: 800 });
  label(ctx, t('lbl.particleView'), 300, SYR.y1 + 30, { size: 12, color: cssVar('--muted') });
}

/* ================================================================
   Animation
   ================================================================ */
const loop = createLoop({
  dt: 1 / 60,
  step(dt) {
    if (!shell) return false;
    const st = cur();
    st.time = (st.time || 0) + dt;
    if (shell.tab === 'model') {
      if (st.view === 'states') {
        if (st.state === 'solid') vibrate(st.ps, st.time, 0.4 + 0.035 * st.agit);
        else step(st.ps, dt, { box: BOX, g: st.state === 'liquid' ? 900 : 0, v0: speedOf(st), tau: st.state === 'liquid' ? 0.15 : 0.6 });
      } else if (st.view === 'iodine') {
        const target = st.heat ? 1 : 0;
        st.f += (target - st.f) * Math.min(1, dt * (st.heat ? 0.35 : 0.15));
        if (Math.abs(st.f - target) < 0.002) st.f = target;
        const want = Math.round(40 * st.f);
        while (st.iodine.length < want) st.iodine.push(...scatter(1, { r: 5, kind: 5, region: { x0: FLASK.cx - 40, y0: FLASK.cy + FLASK.r - 40, x1: FLASK.cx + 40, y1: FLASK.cy + FLASK.r - 10 }, speed: 160 }));
        while (st.iodine.length > want) st.iodine.pop();
        step(st.iodine, dt, { circle: { cx: FLASK.cx, cy: FLASK.cy, r: FLASK.r - 2 }, v0: 160, tau: 0.6 });
      } else return false;
      updateMeasures();
      return true;
    }
    if (shell.tab === 'diff') {
      for (let k = 0; k < st.speed; k++) {
        if (st.exp === 'gas') {
          if (st.card) {
            step(st.gas.filter((p) => p.y < GASBOX.mid), dt, { box: { x0: GASBOX.x0, y0: GASBOX.y0, x1: GASBOX.x1, y1: GASBOX.mid - 4 }, v0: 150 });
            step(st.gas.filter((p) => p.y >= GASBOX.mid), dt, { box: { x0: GASBOX.x0, y0: GASBOX.mid + 4, x1: GASBOX.x1, y1: GASBOX.y1 }, v0: 150 });
          } else step(st.gas, dt, { box: GASBOX, v0: 150 });
        } else if (st.exp === 'ink') {
          if (st.dropped) { diffuse(st.ink, 3, dt); st.inkT += dt; }
          step(st.inkZoom, dt, { box: { x0: 380, y0: 160, x1: 560, y1: 340 }, v0: 70, tau: 0.2 });
        } else if (st.open) {
          const f = st.room;
          f.c[1 * f.nx + 2] = 1; // the open bottle keeps giving off perfume
          diffuse(f, 40, dt);
          st.roomT += dt;
          const ci = Math.floor(((STUDENT[0] - ROOM.x0) / (ROOM.x1 - ROOM.x0)) * f.nx), cj = Math.floor(((STUDENT[1] - ROOM.y0) / (ROOM.y1 - ROOM.y0)) * f.ny);
          if (st.smelt == null && f.c[cj * f.nx + ci] > 0.02) st.smelt = st.roomT;
        }
      }
      updateMeasures();
      return true;
    }
    step(st.ps, dt, { box: { x0: SYR.x0, y0: SYR.y0, x1: pistonX(st), y1: SYR.y1 }, v0: st.content === 'air' ? 160 : 40, tau: st.content === 'air' ? 0.6 : 0.15 });
    updateMeasures();
    return true;
  },
  render: () => draw(),
});
function kick() { loop.start(); requestDraw(); }

/* ================================================================
   Pointer: drag the piston (tab 3)
   ================================================================ */
canvas.addEventListener('pointerdown', (ev) => {
  const p = view.toLogical(ev);
  if (shell.tab === 'comp' && p.x > pistonX(cur()) - 10 && p.x < pistonX(cur()) + 160 && p.y > SYR.y0 - 20 && p.y < SYR.y1 + 20) {
    drag = { x: p.x, vol: cur().vol };
    canvas.setPointerCapture(ev.pointerId); ev.preventDefault();
  }
});
canvas.addEventListener('pointermove', (ev) => {
  if (!drag) return;
  const p = view.toLogical(ev);
  setVol(drag.vol + ((p.x - drag.x) * 100) / (SYR.x1max - SYR.x0));
});
const endDrag = () => { drag = null; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
function setVol(v) {
  const st = S.comp;
  const lo = minVol(st.content);
  const nv = Math.round(Math.max(lo, Math.min(100, v)));
  st.blocked = v < lo - 0.5;
  st.vol = nv;
  // particles beyond the piston are pushed back inside
  const xp = pistonX(st);
  for (const q of st.ps) if (q.x > xp - q.r) { q.x = xp - q.r - Math.random() * 4; q.vx = -Math.abs(q.vx); }
  ui.vol?.set(nv);
  updateMeasures(); kick();
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
function showStatus(box, fb) {
  if (!fb) { box.hidden = true; return; }
  box.hidden = false;
  box.className = `status ${fb.type || ''}`;
  box.textContent = t(fb.key, fb.params);
}
const hint = (key) => el('p', { class: 'muted', style: 'margin:8px 0 0;font-size:0.88rem', dataset: { i18n: key } }, t(key));
const resetRow = () => el('div', { class: 'btn-row', style: 'margin-top:8px' }, [createButton({ labelKey: 'ui.reset', onClick: resetTab, variant: 'ghost' })]);

/* ---------- Tab 1 ---------- */
function buildModel() {
  const st = S.model;
  ui.view = createSegmented({
    labelKey: 'ctl.view',
    options: ['states', 'iodine', 'match'].map((v) => ({ value: v, labelKey: `view.${v}` })),
    value: st.view,
    onChange: (v) => { st.view = v; if (v === 'match' && !st.match) st.match = makeMatch(); buildTab(); shell.refreshActivity(); },
  });
  const items = [ui.view.root];
  if (st.view === 'states') {
    ui.state = createSegmented({
      labelKey: 'ctl.state',
      options: ['solid', 'liquid', 'gas'].map((v) => ({ value: v, labelKey: `state.${v}` })),
      value: st.state,
      onChange: (v) => { st.state = v; st.ps = makeState(st); buildTab(); },
    });
    ui.agit = createSlider({ labelKey: 'ctl.agit', min: 10, max: 100, step: 1, value: st.agit, unit: '%', decimals: 0, onInput: (v) => { st.agit = v; } });
    items.push(ui.state.root, ui.agit.root);
    if (st.state === 'gas') {
      ui.air = createSegmented({
        labelKey: 'ctl.gas', options: [{ value: 'one', labelKey: 'gas.one' }, { value: 'air', labelKey: 'gas.air' }], value: st.air ? 'air' : 'one',
        onChange: (v) => { st.air = v === 'air'; st.ps.forEach((p, i) => { p.kind = st.air ? (i % 5 === 0 ? 2 : 1) : 0; }); requestDraw(); },
      });
      items.push(ui.air.root);
    }
  } else if (st.view === 'iodine') {
    ui.heat = createButton({ labelKey: st.heat ? 'ctl.stopHeat' : 'ctl.heat', variant: 'primary', onClick: () => { st.heat = !st.heat; buildTab(); } });
    items.push(el('div', { class: 'btn-row' }, [ui.heat]));
  } else {
    st.match.panels.forEach((pn, k) => {
      const seg = createSegmented({
        labelKey: `ctl.drawing${k + 1}`,
        options: ['solid', 'liquid', 'gas'].map((v) => ({ value: v, labelKey: `state.${v}` })),
        value: pn.answer ?? '',
        onChange: (v) => { pn.answer = v; st.match.checked = false; st.fb = null; updateMeasures(); requestDraw(); },
      });
      items.push(seg.root);
    });
    items.push(el('div', { class: 'btn-row' }, [
      createButton({ labelKey: 'ctl.check', variant: 'primary', onClick: () => {
        const m = st.match;
        if (m.panels.some((p) => !p.answer)) { st.fb = { type: 'warn', key: 'fb.chooseAll' }; updateMeasures(); return; }
        m.checked = true;
        const ok = m.panels.filter((p) => p.answer === p.state).length;
        st.fb = ok === 3 ? { type: 'good', key: 'fb.matchOk' } : { type: 'bad', key: 'fb.matchSome', params: { n: ok } };
        updateMeasures(); requestDraw();
      } }),
      createButton({ labelKey: 'ctl.newDrawings', onClick: () => { st.match = makeMatch(); st.fb = null; buildTab(); } }),
    ]));
  }
  items.push(resetRow());
  controlsBody.append(...items);
  ui.dl = el('dl', { class: 'meas' });
  ui.status = el('div', { class: 'status', hidden: '' });
  measuresBody.append(ui.dl, ui.status);
}
function updateModel() {
  const st = S.model;
  const rows = [];
  if (st.view === 'states') {
    const top = st.state === 'gas' ? BOX.y0 : Math.min(...st.ps.map((p) => p.y - p.r));
    const d = meanSpacing(st.ps, BOX.x0, BOX.x1, top, BOX.y1);
    rows.push(
      [t('m.state'), t(`state.${st.state}`)],
      [t('m.motion'), t(st.state === 'solid' ? 'motion.vibrate' : 'motion.random')],
      [t('m.dist'), `${num(d, 1)} × ${t('m.diam')}`],
      [t('m.spaces'), t(`spaces.${st.state}`)],
    );
    if (st.state === 'gas' && st.air) {
      const n2 = st.ps.filter((p) => p.kind === 1).length, o2 = st.ps.filter((p) => p.kind === 2).length;
      rows.push([t('m.count'), `${n2} ${t('lbl.n2s')} · ${o2} ${t('lbl.o2s')}`]);
    }
  } else if (st.view === 'iodine') {
    rows.push(
      [t('m.heating'), t(st.heat ? 'heat.on' : 'heat.off')],
      [t('m.iodine'), t(st.f > 0.95 ? 'iod.gas' : st.f < 0.05 ? 'iod.solid' : 'iod.both')],
      [t('m.space'), t(st.f > 0.5 ? 'space.all' : 'space.small')],
    );
  } else rows.push([t('m.answered'), `${st.match.panels.filter((p) => p.answer).length} / 3`]);
  measRows(ui.dl, rows);
  showStatus(ui.status, st.view === 'match' ? st.fb : null);
}

/* ---------- Tab 2 ---------- */
function startDiff(exp) {
  const base = { ...initialState('diff'), exp };
  if (exp === 'ink') {
    base.ink = field(INK.nx, INK.ny); base.dropped = false; base.inkT = 0;
    const rand = rng(21);
    const w = lattice({ x0: 380, y0: 160, x1: 560, y1: 340 }, { r: 8, kind: 4, gap: 0.5 }).map((p) => ({ ...p, vx: (rand() - 0.5) * 50, vy: (rand() - 0.5) * 50 }));
    base.inkZoom = w;
  }
  if (exp === 'perfume') { base.room = field(ROOM.nx, ROOM.ny); base.roomT = 0; }
  return base;
}
function dropInk(st) {
  if (st.dropped) return;
  st.dropped = true;
  const f = st.ink, i0 = Math.floor(f.nx / 2);
  for (let j = 0; j < 4; j++) for (let i = i0 - 2; i <= i0 + 2; i++) f.c[j * f.nx + i] = 30; // enough ink to color all the water a little
  // in the zoom, a few particles of ink take the place of particles of water on the left
  st.inkZoom.forEach((p) => { if (p.x < 435 && p.y < 245) p.kind = 6; });
}
function buildDiff() {
  const st = S.diff;
  ui.exp = createSegmented({
    labelKey: 'ctl.diffExp',
    options: ['gas', 'ink', 'perfume'].map((v) => ({ value: v, labelKey: `dexp.${v}` })),
    value: st.exp,
    onChange: (v) => { S.diff = startDiff(v); buildTab(); shell.refreshActivity(); },
  });
  const items = [ui.exp.root];
  if (st.exp === 'gas') items.push(el('div', { class: 'btn-row' }, [createButton({ labelKey: 'ctl.card', variant: 'primary', onClick: () => { st.card = false; updateMeasures(); } })]));
  if (st.exp === 'ink') items.push(el('div', { class: 'btn-row' }, [createButton({ labelKey: 'ctl.drop', variant: 'primary', onClick: () => { dropInk(st); updateMeasures(); } })]));
  if (st.exp === 'perfume') items.push(el('div', { class: 'btn-row' }, [createButton({ labelKey: 'ctl.open', variant: 'primary', onClick: () => { st.open = true; updateMeasures(); } })]));
  ui.speed = createSegmented({
    labelKey: 'ctl.speed', options: [{ value: '1', labelKey: 'speed.1' }, { value: '5', labelKey: 'speed.5' }], value: String(st.speed),
    onChange: (v) => { st.speed = Number(v); },
  });
  items.push(ui.speed.root, resetRow());
  controlsBody.append(...items);
  ui.dl = el('dl', { class: 'meas' });
  measuresBody.append(ui.dl);
}
function inkSpread(f) {
  let n = 0;
  for (let i = 0; i < f.c.length; i++) if (f.c[i] > 0.03) n++;
  return n / f.c.length;
}
function updateDiff() {
  const st = S.diff;
  const rows = [];
  if (st.exp === 'gas') {
    rows.push([t('m.card'), t(st.card ? 'card.in' : 'card.out')], [t('m.no2B'), qty(Math.round(100 * no2InB(st)), 0, '%')], [t('m.colorB'), t(no2InB(st) > 0.15 ? 'colB.yes' : 'colB.no')]);
  } else if (st.exp === 'ink') {
    rows.push([t('m.ink'), t(st.dropped ? 'ink.in' : 'ink.notYet')], [t('m.spread'), qty(Math.round(100 * inkSpread(st.ink)), 0, '%')]);
  } else {
    rows.push([t('m.bottleOpen'), t(st.open ? 'open.yes' : 'open.no')], [t('m.timeOpen'), qty(st.roomT || 0, 0, 's')], [t('m.smell'), st.smelt != null ? t('smell.yes', { s: num(st.smelt, 0) }) : t('smell.no')]);
  }
  measRows(ui.dl, rows);
}

/* ---------- Tab 3 ---------- */
function buildComp() {
  const st = S.comp;
  ui.content = createSegmented({
    labelKey: 'ctl.content', options: [{ value: 'air', labelKey: 'content.air' }, { value: 'water', labelKey: 'content.water' }], value: st.content,
    onChange: (v) => { S.comp = { content: v, vol: 100, ps: makeSyringe(v, 100) }; buildTab(); shell.refreshActivity(); },
  });
  ui.vol = createSlider({ labelKey: 'ctl.vol', min: 30, max: 100, step: 1, value: st.vol, unit: '%', decimals: 0, onInput: (v) => setVol(v) });
  controlsBody.append(ui.content.root, ui.vol.root, resetRow(), hint('hint.piston'));
  ui.dl = el('dl', { class: 'meas' });
  ui.status = el('div', { class: 'status', hidden: '' });
  measuresBody.append(ui.dl, ui.status);
}
function updateComp() {
  const st = S.comp;
  measRows(ui.dl, [
    [t('m.content'), t(`content.${st.content}`)],
    [t('m.vol'), qty(st.vol, 0, '%')],
    [t('m.dist'), `${num(meanSpacing(st.ps, SYR.x0, pistonX(st), SYR.y0, SYR.y1), 1)} × ${t('m.diam')}`],
  ]);
  showStatus(ui.status, st.blocked ? { type: 'warn', key: st.content === 'air' ? 'fb.airMin' : 'fb.waterStuck' } : null);
}

function updateMeasures() {
  if (!shell || !ui.dl) return;
  if (shell.tab === 'model') updateModel();
  else if (shell.tab === 'diff') updateDiff();
  else updateComp();
}
function buildTab() {
  loop.stop();
  controlsBody.replaceChildren();
  measuresBody.replaceChildren();
  ui = {};
  if (shell.tab === 'model') buildModel();
  else if (shell.tab === 'diff') buildDiff();
  else buildComp();
  updateMeasures();
  kick();
}
function resetTab() {
  if (shell.tab === 'model') { const v = S.model.view; S.model = initialState('model'); S.model.view = v; if (v === 'match') S.model.match = makeMatch(); }
  else if (shell.tab === 'diff') S.diff = startDiff(S.diff.exp);
  else S.comp = { content: S.comp.content, vol: 100, ps: makeSyringe(S.comp.content, 100) };
  buildTab();
}
onLangChange(() => { if (shell) buildTab(); });

shell = initSim({
  strings,
  tabs: [{ id: 'model', labelKey: 'tab.model' }, { id: 'diff', labelKey: 'tab.diff' }, { id: 'comp', labelKey: 'tab.comp' }],
  initialTab: 'model',
  onTab: buildTab,
  activityKey: (tab) => (tab === 'model' ? `act.model.${S.model.view}` : tab === 'diff' ? `act.diff.${S.diff.exp}` : 'act.comp'),
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, cur: () => cur(), meanSpacing, no2InB, inkSpread };
