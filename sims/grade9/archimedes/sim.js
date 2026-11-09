// Grade 9 — Archimedes up-thrust (Ch.15: Act. 1–5; Ex. 1–21). g = 10 N/kg as in the Grade 9 book.
// F = ρL × Vi × g ; Wapp = W − F ; a body floats when F = W.
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange, getLang } from '../../../shared/i18n.js';
import { num, qty } from '../../../shared/format.js';
import { createButton, createSegmented, createSlider, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, font, arrow } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { label } from '../../../shared/figures.js';
import { drawSpringBalance, BALANCES } from '../../../shared/spring-balance.js';
import { drawGradCylinder } from '../../../shared/lab-draw.js';
import { calcCell, calcSig, calcDone } from '../../../shared/calc-cell.js';
import { G_EB9 } from '../../../shared/constants.js';

/* ================================================================
   Data
   ================================================================ */
const W_ = 600, H_ = 360;
const CM = 26;                                        // 1 cm on the screen (force vectors)
const N_PER_G = G_EB9 / 1000;                         // weight of 1 g in N
// liquids: density in g/cm³
const LIQ = {
  water: { rho: 1, c: '--water', d: '--water-dark' },
  alcohol: { rho: 0.8, c: '--alcohol', d: '--glass-stroke' },
  salt: { rho: 1.2, c: '#2f9fb3', d: '#1d6b79' },
  oil: { rho: 0.9, c: '#e1c45a', d: '#a68b2a' },
  mercury: { rho: 13.6, c: '--mercury', d: '#6c7480' },
};
const col = (v) => (v.startsWith('--') ? cssVar(v) : v);
// Bodies hung from the spring balance. V in cm³, W in N, bal = index in BALANCES (2, 5 or 10 N).
// al, brass: illustrative; b1–b3: Exercise 11; ex13: Exercise 13 (6 N, 3 N in water); ex14: Exercise 14 (Fig. 7);
// ex21: Exercise 21 (100 cm³; its weight is illustrative).
const BODIES = {
  al: { V: 50, W: 1.35, bal: 0, color: '#c8ced6', h: 5 },
  brass: { V: 20, W: 1.70, bal: 0, color: '#d1ab45', h: 4 },
  b1: { V: 30, W: 0.5, bal: 0, color: '#9b7fd0', h: 4 },
  b2: { V: 30, W: 1.0, bal: 0, color: '#d17f9b', h: 4 },
  b3: { V: 50, W: 1.0, bal: 0, color: '#7fb0d1', h: 5 },
  ex13: { V: 300, W: 6, bal: 2, color: '#9aa3b0', ball: true },
  ex14: { V: 40, W: 1.02, bal: 0, color: '#6f86c9' },
  ex21: { V: 100, W: 2.7, bal: 1, color: '#c8ced6', r: 2 },
};
const APP_BODIES = ['al', 'brass', 'b1', 'b2', 'b3', 'ex13', 'unk'];
const MEAS_BODIES = ['al', 'ex14', 'ex21', 'brass'];
// Flotation tab
const FLASK = { V: 250, m0: 50, marble: 25, n0: 10 };  // cm³, g, g (illustrative)
const OBJECTS = {
  ice: { V: 100, m: 90, shape: 'box', color: '#d9eef8' },     // Ex. 15 and 17 (90 g of ice)
  wood: { V: 30, m: 12, shape: 'ball', color: '#c9955a' },    // Ex. 18 (30 cm³, 12 cm³ immersed)
  steel: { V: 10, m: 78, shape: 'ball', color: '#8e98a5' },   // Ex. 8
  egg: { V: 60, m: 64, shape: 'egg', color: '#f2e6cf' },      // Ex. 4
};
// Densimeter tab: a straw 20 cm long; immersed length 12 cm in water (illustrative)
const STRAW = { L: 20, lw: 12 };
const DENS_LIQ = ['water', 'alcohol', 'oil', 'salt', 'unk'];

function rndBody() {
  // an unknown body for the practice: reading on the 2 N balance (multiples of 0.05 N in air)
  for (;;) {
    const V = 15 + 5 * Math.floor(Math.random() * 10);          // 15 … 60 cm³
    const W = 0.05 * Math.round((0.6 + Math.random() * 1.3) / 0.05);
    const rho = W / N_PER_G / V;
    if (rho > 1.6 && rho < 9) return { V, W: +W.toFixed(2), bal: 0, color: '#8fb07a', h: 4, unk: true };
  }
}
const rndLiquid = () => +(0.82 + Math.random() * 0.4).toFixed(2);

function initialState(tab) {
  switch (tab) {
    case 'apparent': return { body: 'al', liq: 'water', lower: 0, forces: true, unk: rndBody(), rows: [], fb: null };
    case 'measure': return { method: 'cyl', body: 'al', liq: 'water', lower: 0, spilled: 0, drops: 0, rows: [], fb: null };
    case 'float': return { mode: 'flask', n: FLASK.n0, obj: 'ice', liq: 'water', y: null, v: 0, fb: null };
    default: return { liq: 'water', unk: rndLiquid(), scale: false, y: null, v: 0, rows: [], fb: null };
  }
}
const TABS = ['apparent', 'measure', 'float', 'densimeter'];
let S = Object.fromEntries(TABS.map((k) => [k, initialState(k)]));
const bodyOf = (st) => (st.body === 'unk' ? st.unk : BODIES[st.body]);
const symW = () => t('f.W'), symWapp = () => t('f.Wapp');

/* ================================================================
   Canvas helpers
   ================================================================ */
let shell;
let drawQueued = false;
const canvas = document.getElementById('stage');
canvas.style.touchAction = 'none';
const view = setupCanvas(canvas, { width: W_, height: H_, maxHeightVh: () => (window.innerWidth < 880 ? 52 : 74), onResize: () => requestDraw() });
function requestDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; draw(); });
}
onThemeChange(() => requestDraw());
const cur = () => S[shell.tab];
const txt = (ctx, s, x, y, o = {}) => label(ctx, s, x, y, { size: 13, weight: 700, ...o });
const muted = (ctx, s, x, y, align = 'left') => txt(ctx, s, x, y, { size: 11, weight: 600, align, color: cssVar('--muted') });
const COLW = '#2f6fd6', COLF = '#1d8a4b', COLAPP = '#c0392b';
function vec(ctx, x, y, dy, color, name, { dash = false, w = 3, side = 1 } = {}) {
  if (Math.abs(dy) < 2) return;
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = w;
  if (dash) ctx.setLineDash([5, 4]);
  arrow(ctx, x, y, x, y + dy, 10);
  ctx.setLineDash([]);
  ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill();
  label(ctx, name, x + side * 16, y + dy * 0.6, { size: 13, weight: 800, color, align: side > 0 ? 'left' : 'right' });
}
function beaker(ctx, x0, x1, yTop, yBot) {
  ctx.strokeStyle = cssVar('--glass-stroke'); ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(x0 - 6, yTop - 4); ctx.quadraticCurveTo(x0, yTop - 2, x0, yTop + 6); ctx.lineTo(x0, yBot); ctx.lineTo(x1, yBot); ctx.lineTo(x1, yTop); ctx.stroke();
  ctx.fillStyle = cssVar('--glass-fill'); ctx.fillRect(x0, yTop, x1 - x0, yBot - yTop);
}
function liquid(ctx, x0, x1, ySurf, yBot, liq, alpha = 0.62) {
  const L = typeof liq === 'string' ? LIQ[liq] : liq;
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, col(L.d)); g.addColorStop(0.45, col(L.c)); g.addColorStop(1, col(L.d));
  ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = g; ctx.fillRect(x0, ySurf, x1 - x0, yBot - ySurf); ctx.restore();
  ctx.strokeStyle = col(L.d); ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(x0, ySurf); ctx.lineTo(x1, ySurf); ctx.stroke();
}
function metalBody(ctx, x, top, w, h, color, ball) {
  const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  g.addColorStop(0, shade(color, -40)); g.addColorStop(0.4, shade(color, 40)); g.addColorStop(1, shade(color, -50));
  ctx.fillStyle = g; ctx.strokeStyle = shade(color, -80); ctx.lineWidth = 1.2;
  if (ball) { ctx.beginPath(); ctx.arc(x, top + h / 2, w / 2, 0, 7); ctx.fill(); ctx.stroke(); }
  else { roundRect(ctx, x - w / 2, top, w, h, 3); ctx.fill(); ctx.stroke(); }
  ctx.strokeStyle = cssVar('--wire'); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, top - 3, 3, 0, 7); ctx.stroke();
}
function shade(hex, d) {
  const n = parseInt(hex.slice(1), 16);
  const c = (s) => Math.max(0, Math.min(255, ((n >> s) & 255) + d));
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}
// immersed fraction of a body for an immersed depth u in [0,1] of its height
const fracBox = (u) => Math.max(0, Math.min(1, u));
const fracBall = (u) => { const v = Math.max(0, Math.min(1, u)); return v * v * (3 - 2 * v); };

// A body hanging from a dial spring balance whose ring is at ringY; the liquid surface may depend on Vi.
// Returns the geometry and forces (Wapp = W − F is what the balance shows).
const THREAD = 16, TRAVEL = 20;
function hang(body, { x, ringY, r, bodyH, ySurf, thread = THREAD }) {
  const bal = BALANCES[body.bal];
  let F = 0, g = null;
  const rho = body.rhoL;
  for (let i = 0; i < 8; i++) {
    const Wapp = Math.max(0, body.W - F);
    const yc = ringY + r + 12;
    const hookY = yc + r + 26 + Math.min(1.02, Wapp / bal.max) * TRAVEL;
    const top = hookY + thread, bottom = top + bodyH;
    let Vi = 0, ys = ySurf(0);
    for (let j = 0; j < 6; j++) {
      const u = (bottom - ys) / bodyH;
      Vi = body.V * (body.ball ? fracBall(u) : fracBox(u));
      ys = ySurf(Vi);
    }
    F = rho * Vi * N_PER_G;
    g = { x, yc, r, bal, hookY, top, bottom, ys, Vi, F, Wapp: Math.max(0, body.W - F), full: Vi >= body.V - 1e-6 };
  }
  return g;
}
function drawHanging(ctx, body, g, bodyW, bodyH) {
  drawSpringBalance(ctx, { x: g.x, y: g.yc, r: g.r, bal: g.bal, F: g.Wapp, rodTravel: TRAVEL, lang: getLang() });
  // stand above the ring
  ctx.strokeStyle = cssVar('--wire'); ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(g.x - 40, g.yc - g.r - 26); ctx.lineTo(g.x + 4, g.yc - g.r - 26); ctx.stroke();
  ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(g.x, g.yc - g.r - 26); ctx.lineTo(g.x, g.yc - g.r - 18); ctx.stroke();
  ctx.strokeStyle = cssVar('--thread'); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(g.x, g.hookY - 2); ctx.lineTo(g.x, g.top - 4); ctx.stroke();
  metalBody(ctx, g.x, g.top, bodyW, bodyH, body.color, body.ball);
}
// big copy of the dial so that it can be read (clipped in a card)
function dialZoom(ctx, g, bx, by, bw, bh) {
  ctx.fillStyle = cssVar('--surface'); roundRect(ctx, bx, by, bw, bh, 12); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.rect(bx, by + 18, bw, bh - 18); ctx.clip();
  drawSpringBalance(ctx, { x: bx + bw / 2, y: by + bh / 2 + 14, r: Math.min(bw, bh) / 2 - 22, bal: g.bal, F: g.Wapp, rodTravel: 0, lang: getLang() });
  ctx.restore();
  muted(ctx, t('lbl.dialZoom'), bx + 10, by + 12);
}

function draw() {
  if (!shell) return;
  const ctx = view.begin();
  ctx.fillStyle = cssVar('--scene-bg'); ctx.fillRect(0, 0, W_, H_);
  if (shell.tab === 'apparent') drawApparent(ctx);
  else if (shell.tab === 'measure') drawMeasure(ctx);
  else if (shell.tab === 'float') drawFloat(ctx);
  else drawDensimeter(ctx);
}

/* ---------- Activities 1–2: apparent weight ---------- */
const AP = { x: 230, px: 8, bx0: 158, bx1: 302, yBot: 350, h0: 9.5, area: 254, ring0: 34, top: 214 };
// size of the body on the screen (8 px per cm)
function apSize(b) {
  if (b.ball) { const R = Math.cbrt((3 * b.V) / (4 * Math.PI)); return { w: 2 * R * AP.px, h: 2 * R * AP.px }; }
  const r = Math.sqrt(b.V / (Math.PI * b.h)); return { w: 2 * r * AP.px, h: b.h * AP.px };
}
function apGeom(st) {
  const b = { ...bodyOf(st), rhoL: LIQ[st.liq].rho };
  const s = apSize(b);
  const ySurf0 = AP.yBot - AP.h0 * AP.px;
  const ySurf = (Vi) => ySurf0 - (Vi / AP.area) * AP.px;
  // ring position: the body starts 20 px above the water
  const r = 34;
  const ring0 = ySurf0 - 20 - s.h - THREAD - (2 * r + 38 + Math.min(1.02, b.W / BALANCES[b.bal].max) * TRAVEL);
  const maxLower = (AP.yBot - 4 - (ySurf0 - 20)) / AP.px; // the body must not touch the bottom
  const lower = Math.min(st.lower, maxLower);
  const g = hang(b, { x: AP.x, ringY: ring0 + lower * AP.px, r, bodyH: s.h, ySurf });
  return { b, s, g, maxLower };
}
function drawApparent(ctx) {
  const st = S.apparent;
  const { b, s, g } = apGeom(st);
  beaker(ctx, AP.bx0, AP.bx1, AP.top, AP.yBot);
  drawHanging(ctx, b, g, s.w, s.h);
  liquid(ctx, AP.bx0, AP.bx1, g.ys, AP.yBot, st.liq);
  // lab bench
  ctx.fillStyle = cssVar('--wood'); ctx.fillRect(20, AP.yBot, 400, 8);
  if (st.forces) {
    const sc = b.bal === 2 ? 4 : 0.5;                 // N per cm of drawing
    const k = CM / sc;
    const cy = (g.top + g.bottom) / 2;
    vec(ctx, g.x, cy, b.W * k, COLW, symW(), { side: -1 });
    if (g.F > 0.004) {
      const imm = Math.min(s.h, Math.max(0, g.bottom - g.ys));
      vec(ctx, g.x - 14, g.bottom - imm / 2, -g.F * k, COLF, 'F', { side: -1 });
    }
    vec(ctx, g.x + Math.max(22, s.w / 2 + 10), cy, g.Wapp * k, COLAPP, symWapp(), { dash: true, side: 1 });
    muted(ctx, t('lbl.scale', { s: num(sc, sc < 1 ? 1 : 0) }), 20, 14);
  }
  dialZoom(ctx, g, 430, 12, 160, 180);
  muted(ctx, t('lbl.liquidIs', { l: t(`liq.${st.liq}`) }), 430, 214);
  muted(ctx, g.full ? t('lbl.full') : g.Vi > 0 ? t('lbl.part') : t('lbl.air'), 430, 232);
}

/* ---------- Activity 3, Ex. 14 and 21: measuring F ---------- */
// The containers stand on a lab jack that is raised (the body stays hanging from the fixed spring balance).
const ME = {
  cyl: { x: 200, w: 56, yb: 352, perML: 0.64, cap: 200, V1: 80, r: 1.5 },      // inner diameter ≈ 4 cm
  ov: { x: 250, x0: 196, x1: 304, yTop: 236, yBot: 352, spoutY: 250, perML: 0.056 }, // vessel ≈ 13.5 cm wide
  catch: { x: 150, w: 40, yb: 352, perML: 0.6, cap: 100 },
  jack0: 10,                                     // height of the lowered lab jack (px)
};
const meMax = { key: '', v: 0 };
function meSize(b) { const r = b.r || ME.cyl.r; return { w: 2 * r * 8, h: (b.V / (Math.PI * r * r)) * 8 }; }
function meGeom(st) {
  const b = { ...BODIES[st.body], rhoL: LIQ[st.liq].rho };
  const s = meSize(b);
  const r = 30;
  // level of the liquid surface with the jack at height off (px above the bench)
  let level, floorAt;
  if (st.method === 'cyl') {
    const c = ME.cyl;
    level = (Vi, off) => c.yb - off - 8 - (c.V1 + Vi) * c.perML;
    floorAt = (off) => c.yb - off - 12;
  } else {
    const o = ME.ov;
    level = (Vi, off) => o.spoutY - off + Math.max(0, st.spilled - Vi) * o.perML;
    floorAt = (off) => o.yBot - off - 4;
  }
  const start = level(0, ME.jack0) - 14;         // bottom of the body with the jack lowered
  // the thread is long enough for the hook to stay above the rim of the container
  const thread = st.method === 'cyl' ? Math.max(16, 32 + (ME.cyl.cap - ME.cyl.V1 - b.V) * ME.cyl.perML) : 34;
  const ring = start - s.h - thread - (2 * r + 38 + Math.min(1.02, b.W / BALANCES[b.bal].max) * TRAVEL);
  const x = st.method === 'cyl' ? ME.cyl.x : ME.ov.x;
  const at = (lift) => hang(b, { x, ringY: ring, r, bodyH: s.h, thread, ySurf: (Vi) => level(Vi, ME.jack0 + lift * 8) });
  // the jack goes up until the body is totally immersed, plus 1.5 cm
  const key = `${st.method}|${st.body}|${st.liq}`;
  if (meMax.key !== key) {
    let L = 0;
    while (L < 20 && !at(L).full) L += 0.1;
    meMax.key = key; meMax.v = Math.min(L + 1.5, (floorAt(ME.jack0) - start) / 8);
  }
  const maxLower = meMax.v;
  const lift = Math.min(st.lower, maxLower);
  const off = ME.jack0 + lift * 8;
  const g = at(lift);
  return { b, s, g, maxLower, off };
}
function jack(ctx, x0, x1, off) {
  // lab jack between the bench (352) and the platform (352 − off)
  const yT = 352 - off;
  ctx.fillStyle = '#5f6875'; ctx.fillRect(x0, 348, x1 - x0, 4); ctx.fillRect(x0, yT, x1 - x0, 5);
  ctx.strokeStyle = '#5f6875'; ctx.lineWidth = 2.5;
  const n = 2, xm = (x0 + x1) / 2, hw = (x1 - x0) * 0.32, h = (348 - (yT + 5)) / n;
  for (let i = 0; i < n; i++) {
    const ya = yT + 5 + i * h, yb = ya + h;
    ctx.beginPath(); ctx.moveTo(xm - hw, ya); ctx.lineTo(xm + hw, yb); ctx.moveTo(xm + hw, ya); ctx.lineTo(xm - hw, yb); ctx.stroke();
  }
}
function volumeZoom(ctx, V, liq, bx, by, bw, bh, title) {
  // magnifier on the graduations of a graduated cylinder around the volume V (mL); 6 px per mL
  const Z = 6;
  ctx.fillStyle = cssVar('--surface'); roundRect(ctx, bx, by, bw, bh, 12); ctx.fill();
  muted(ctx, title, bx + 10, by + 12);
  const ix = bx + 10, iy = by + 22, iw = bw - 20, ih = bh - 30, cy = iy + ih / 2;
  ctx.save(); ctx.beginPath(); ctx.rect(ix, iy, iw, ih); ctx.clip();
  ctx.fillStyle = cssVar('--glass-fill'); ctx.fillRect(ix, iy, iw, ih);
  liquid(ctx, ix, ix + iw, cy, iy + ih, liq, 0.5);
  ctx.strokeStyle = cssVar('--scale'); ctx.fillStyle = cssVar('--scale'); ctx.font = font(12, 700); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  for (let v = Math.floor(V - ih / 2 / Z); v <= Math.ceil(V + ih / 2 / Z); v++) {
    if (v < 0 || v % 2) continue;
    const y = cy - (v - V) * Z;
    const major = v % 10 === 0;
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath(); ctx.moveTo(ix, y); ctx.lineTo(ix + (major ? 34 : 20), y); ctx.stroke();
    if (major) ctx.fillText(String(v), ix + 40, y);
  }
  ctx.restore();
  ctx.strokeStyle = cssVar('--muted'); ctx.lineWidth = 1; ctx.strokeRect(ix, iy, iw, ih);
  txt(ctx, 'mL', ix + iw - 16, iy + 10, { size: 11 });
}
function drawMeasure(ctx) {
  const st = S.measure;
  const { b, s, g, off } = meGeom(st);
  ctx.fillStyle = cssVar('--wood'); ctx.fillRect(20, 352, 400, 8);
  const up = (fn) => { ctx.save(); ctx.translate(0, -off); fn(); ctx.restore(); };
  if (st.method === 'cyl') {
    const c = ME.cyl;
    jack(ctx, c.x - 50, c.x + 50, off);
    drawHanging(ctx, b, g, s.w, s.h);
    // the cylinder is drawn over the body (glass and liquid in front)
    up(() => drawGradCylinder(ctx, { cx: c.x, yb: c.yb, w: c.w, perML: c.perML, capacity: c.cap, minor: 10, major: 50, label: 50, V: c.V1 + g.Vi, color: col(LIQ[st.liq].c), colorDark: col(LIQ[st.liq].d) }));
    volumeZoom(ctx, c.V1 + g.Vi, st.liq, 440, 200, 150, 150, t('lbl.cylZoom'));
  } else {
    const o = ME.ov, k = ME.catch;
    jack(ctx, k.x - 30, o.x1 + 6, off);
    up(() => {
      // overflow vessel with its spout on the left, above the graduated cylinder
      ctx.strokeStyle = cssVar('--glass-stroke'); ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(o.x0, o.yTop); ctx.lineTo(o.x0, o.spoutY - 6); ctx.lineTo(o.x0 - 44, o.spoutY + 12); ctx.moveTo(o.x0 - 44, o.spoutY + 20); ctx.lineTo(o.x0, o.spoutY + 4);
      ctx.lineTo(o.x0, o.yBot); ctx.lineTo(o.x1, o.yBot); ctx.lineTo(o.x1, o.yTop); ctx.stroke();
      ctx.fillStyle = cssVar('--glass-fill'); ctx.fillRect(o.x0, o.yTop, o.x1 - o.x0, o.yBot - o.yTop);
    });
    drawHanging(ctx, b, g, s.w, s.h);
    up(() => {
      liquid(ctx, o.x0, o.x1, g.ys + off, o.yBot, st.liq);
      if (st.drops > 0) {
        ctx.fillStyle = col(LIQ[st.liq].c);
        for (let i = 0; i < 3; i++) { const y = o.spoutY + 22 + ((i * 14 + (1 - st.drops) * 50) % 40); ctx.beginPath(); ctx.ellipse(o.x0 - 46, y, 3, 5, 0, 0, 7); ctx.fill(); }
      }
      drawGradCylinder(ctx, { cx: k.x, yb: k.yb, w: k.w, perML: k.perML, capacity: k.cap, minor: 10, major: 50, label: 50, V: st.spilled, color: col(LIQ[st.liq].c), colorDark: col(LIQ[st.liq].d) });
    });
    volumeZoom(ctx, st.spilled, st.liq, 440, 200, 150, 150, t('lbl.catchZoom'));
  }
  dialZoom(ctx, g, 440, 12, 150, 176);
}

/* ---------- Activity 4, Ex. 4–8, 15, 17, 18: flotation ---------- */
const FL = { x0: 150, x1: 450, yTop: 120, yBot: 345, ySurf: 150 };
function floatBody(st) {
  if (st.mode === 'flask') {
    const m = FLASK.m0 + st.n * FLASK.marble;
    return { V: FLASK.V, m, h: 128, w: 70, shape: 'box', px: 128 / 12 };
  }
  const o = OBJECTS[st.obj], P = 14;            // 14 px per cm
  if (o.shape === 'box') { const a = Math.cbrt(o.V); return { ...o, h: a * P, w: a * P }; }
  const R = Math.cbrt((3 * o.V) / (4 * Math.PI));
  return { ...o, h: 2 * R * P * (o.shape === 'egg' ? 1.25 : 1), w: 2 * R * P / (o.shape === 'egg' ? 1.12 : 1) };
}
function floatForces(st) {
  const b = floatBody(st);
  const y = st.y ?? FL.ySurf - 20;                // y = bottom of the body
  const u = (y - FL.ySurf) / b.h;
  const Vi = b.V * (b.shape === 'box' ? fracBox(u) : fracBall(u));
  const rho = LIQ[st.liq].rho;
  return { b, y, Vi, W: b.m * N_PER_G, F: rho * Vi * N_PER_G, onBottom: y >= FL.yBot - 0.5 };
}
function drawFloat(ctx) {
  const st = S.float;
  const f = floatForces(st);
  const { b, y } = f, x = (FL.x0 + FL.x1) / 2, top = y - b.h;
  beaker(ctx, FL.x0, FL.x1, FL.yTop, FL.yBot);
  if (st.mode === 'flask') {
    // closed flask (a jar with a stopper) containing marbles
    ctx.fillStyle = 'rgba(200, 225, 245, 0.45)'; ctx.strokeStyle = cssVar('--glass-stroke'); ctx.lineWidth = 2;
    roundRect(ctx, x - b.w / 2, top + 22, b.w, b.h - 22, 10); ctx.fill(); ctx.stroke();
    ctx.fillRect(x - 18, top + 6, 36, 18); ctx.strokeRect(x - 18, top + 6, 36, 18);
    ctx.fillStyle = '#7a5130'; ctx.fillRect(x - 20, top, 40, 10);
    const mc = t('marble.color');
    for (let i = 0; i < st.n; i++) {
      const cx = x - 22 + (i % 4) * 15, cy = y - 10 - Math.floor(i / 4) * 14;
      const gr = ctx.createRadialGradient(cx - 2, cy - 2, 1, cx, cy, 7); gr.addColorStop(0, '#f3f5f8'); gr.addColorStop(1, mc);
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, cy, 6.5, 0, 7); ctx.fill();
    }
  } else {
    const gr = ctx.createLinearGradient(x - b.w / 2, 0, x + b.w / 2, 0);
    gr.addColorStop(0, shade(b.color, -30)); gr.addColorStop(0.45, shade(b.color, 25)); gr.addColorStop(1, shade(b.color, -45));
    ctx.fillStyle = gr; ctx.strokeStyle = shade(b.color, -80); ctx.lineWidth = 1.2;
    if (b.shape === 'box') { roundRect(ctx, x - b.w / 2, top, b.w, b.h, 6); ctx.fill(); ctx.stroke(); }
    else { ctx.beginPath(); ctx.ellipse(x, top + b.h / 2, b.w / 2, b.h / 2, 0, 0, 7); ctx.fill(); ctx.stroke(); }
  }
  liquid(ctx, FL.x0, FL.x1, FL.ySurf, FL.yBot, st.liq, st.liq === 'mercury' ? 0.55 : 0.5);
  ctx.fillStyle = cssVar('--wood'); ctx.fillRect(100, FL.yBot, 400, 8);
  const sc = st.mode === 'flask' ? 2 : 0.25, k = CM / sc;
  const cy = top + b.h / 2;
  vec(ctx, x + 10, cy, Math.min(150, f.W * k), COLW, symW(), { side: 1 });
  if (f.F > 0.002) {
    const imm = Math.min(b.h, y - FL.ySurf);
    vec(ctx, x - 10, y - imm / 2, -Math.min(150, f.F * k), COLF, 'F', { side: -1 });
  }
  muted(ctx, t('lbl.scale', { s: num(sc, sc < 1 ? 2 : 0) }), 20, 14);
  muted(ctx, t('lbl.liquidIs', { l: t(`liq.${st.liq}`) }), 20, 32);
  const state = floatState(st, f);
  txt(ctx, t(`st.${state}`), 300, 66, { size: 14, color: state === 'floats' ? '#1d8a4b' : state === 'sinks' || state === 'bottom' ? '#c0392b' : cssVar('--text') });
}
function floatState(st, f) {
  if (f.onBottom && f.F < f.W - 1e-6) return 'bottom';
  if (Math.abs(st.v) < 4 && Math.abs(f.F - f.W) < 0.01 && !f.onBottom) return 'floats';
  return st.v > 0 ? 'sinks' : 'rises';
}

/* ---------- Activity 5, Ex. 16: densimeter (straw + plasticine) ---------- */
const DE = { x: 250, bx0: 170, bx1: 330, yTop: 110, yBot: 345, ySurf: 130, px: 12 };
const densRho = (st) => (st.liq === 'unk' ? st.unk : LIQ[st.liq].rho);
const immersedLen = (st) => STRAW.lw / densRho(st);    // cm (floating: ρ ℓ S = m)
function drawDensimeter(ctx) {
  const st = S.densimeter;
  const ell = st.y ?? immersedLen(st);
  const bottom = DE.ySurf + ell * DE.px, top = bottom - STRAW.L * DE.px;
  const liqDef = st.liq === 'unk' ? { c: '#b9a3d9', d: '#7a62a0' } : LIQ[st.liq];
  beaker(ctx, DE.bx0, DE.bx1, DE.yTop, DE.yBot);
  drawStraw(ctx, DE.x, top, bottom, DE.px, st.scale);
  liquid(ctx, DE.bx0, DE.bx1, DE.ySurf, DE.yBot, liqDef, 0.5);
  ctx.fillStyle = cssVar('--wood'); ctx.fillRect(120, DE.yBot, 260, 8);
  muted(ctx, t('lbl.liquidIs', { l: t(`liq.${st.liq}`) }), 20, 14);
  // magnifier on the straw around the liquid surface (5 ×)
  const zx = 410, zy = 40, zw = 175, zh = 270, Z = 60, cy = zy + zh / 2;
  ctx.fillStyle = cssVar('--surface'); roundRect(ctx, zx - 8, zy - 28, zw + 16, zh + 56, 12); ctx.fill();
  muted(ctx, t('lbl.strawZoom'), zx, zy - 14);
  ctx.save(); ctx.beginPath(); ctx.rect(zx, zy, zw, zh); ctx.clip();
  ctx.fillStyle = cssVar('--scene-bg'); ctx.fillRect(zx, zy, zw, zh);
  const sx = zx + zw / 2;
  ctx.fillStyle = 'rgba(245, 245, 240, 0.95)'; ctx.fillRect(sx - 30, zy, 60, zh);
  ctx.strokeStyle = '#9aa0a8'; ctx.lineWidth = 1.5; ctx.strokeRect(sx - 30, zy - 2, 60, zh + 4);
  ctx.strokeStyle = '#2b3140'; ctx.fillStyle = '#2b3140'; ctx.font = font(13, 700); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let mm = Math.max(0, Math.floor((ell - 2.5) * 10)); mm <= Math.min(STRAW.L * 10, Math.ceil((ell + 2.5) * 10)); mm++) {
    const y = cy - (mm / 10 - ell) * Z;
    const len = mm % 10 === 0 ? 30 : mm % 5 === 0 ? 20 : 11;
    ctx.lineWidth = mm % 10 === 0 ? 2 : 1;
    ctx.beginPath(); ctx.moveTo(sx + 30, y); ctx.lineTo(sx + 30 - len, y); ctx.stroke();
    if (mm % 10 === 0) ctx.fillText(String(mm / 10), sx - 6, y);
  }
  if (st.scale) {
    for (const d of [1, 1.1, 1.2, 1.3, 1.4, 1.5]) {
      const y = cy - (STRAW.lw / d - ell) * Z;
      ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx - 30, y); ctx.lineTo(sx - 8, y); ctx.stroke();
      if (d === 1) txt(ctx, 'R', sx - 40, y, { size: 13, color: '#c0392b' });
    }
  }
  liquid(ctx, zx, zx + zw, cy, zy + zh, liqDef, 0.42);
  ctx.restore();
  ctx.strokeStyle = cssVar('--muted'); ctx.lineWidth = 1; ctx.strokeRect(zx, zy, zw, zh);
  muted(ctx, t('lbl.strawCm'), zx, zy + zh + 16);
}
function drawStraw(ctx, x, top, bottom, px, scale) {
  const w = 12;
  ctx.fillStyle = 'rgba(245, 245, 240, 0.95)'; ctx.strokeStyle = '#9aa0a8'; ctx.lineWidth = 1.2;
  ctx.fillRect(x - w / 2, top, w, bottom - top); ctx.strokeRect(x - w / 2, top, w, bottom - top);
  ctx.strokeStyle = '#2b3140'; ctx.lineWidth = 1;
  for (let c = 1; c < STRAW.L; c++) {
    const y = bottom - c * px;
    ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2 - (c % 5 ? 4 : 8), y); ctx.stroke();
  }
  if (scale) {
    ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 1.5;
    for (const d of [1, 1.1, 1.2, 1.3, 1.4, 1.5]) { const y = bottom - (STRAW.lw / d) * px; ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.lineTo(x, y); ctx.stroke(); }
    txt(ctx, 'R', x - w / 2 - 10, bottom - STRAW.lw * px, { size: 12, color: '#c0392b' });
  }
  // plasticine at the bottom
  ctx.fillStyle = '#d9534f'; ctx.beginPath(); ctx.ellipse(x, bottom - 4, 10, 9, 0, 0, 7); ctx.fill();
}

/* ================================================================
   Animation (flotation, densimeter, drops)
   ================================================================ */
const loop = createLoop({
  step(dt) {
    if (!shell) return false;
    if (shell.tab === 'float') {
      const st = S.float;
      const f = floatForces(st);
      if (st.y == null) st.y = FL.ySurf - 20;
      // a = g (W − F) / W (downwards) with the drag of the liquid (illustrative dynamics, px/s²)
      const inLiq = f.Vi > 0;
      const a = 900 * (f.W - f.F) / Math.max(f.W, 0.05) - (inLiq ? 3.5 : 0.3) * st.v;
      st.v += a * dt; st.y += st.v * dt;
      if (st.y >= FL.yBot) { st.y = FL.yBot; if (st.v > 0) st.v = 0; }
      const g2 = floatForces(st);
      const still = Math.abs(st.v) < 1 && (Math.abs(g2.F - g2.W) < 0.002 || (g2.onBottom && g2.F <= g2.W));
      if (still) { st.v = 0; return false; }
      return true;
    }
    if (shell.tab === 'densimeter') {
      const st = S.densimeter;
      const target = immersedLen(st);
      if (st.y == null) st.y = target;
      st.v += (-(st.y - target) * 60 - st.v * 6) * dt; st.y += st.v * dt;
      if (Math.abs(st.y - target) < 0.002 && Math.abs(st.v) < 0.01) { st.y = target; st.v = 0; return false; }
      return true;
    }
    if (shell.tab === 'measure') {
      const st = S.measure;
      if (st.drops <= 0) return false;
      st.drops = Math.max(0, st.drops - dt * 0.8);
      return st.drops > 0;
    }
    return false;
  },
  render() { refresh(); },
});

/* ================================================================
   Panels
   ================================================================ */
const controlsBody = document.getElementById('controls-body');
const measuresBody = document.getElementById('measures-body');
let ui = {};
let tableSig = '';
function refresh() { updateMeasures(); requestDraw(); }
const seg = (labelKey, options, value, onChange) => createSegmented({ labelKey, options: options.map(([v, k]) => ({ value: String(v), labelKey: k })), value: String(value), onChange });
const btnRow = (...b) => el('div', { class: 'btn-row', style: 'margin-top:8px' }, b);
const hintP = (key) => el('p', { class: 'muted', style: 'margin:8px 0 0;font-size:0.88rem', dataset: { i18n: key } }, t(key));
const N_ = (v, d = 2) => qty(v, d, 'N');
function change(fn) { fn(cur()); refresh(); }
const resetRows = () => { const s = cur(); s.fb = null; };

function lowerSlider(st, maxLower, key = 'ctl.lower') {
  ui.lower = createSlider({ labelKey: key, min: 0, max: Math.floor(maxLower * 10) / 10, step: 0.1, value: Math.min(st.lower, maxLower), unit: 'cm', decimals: 1, onInput: (v) => change((s) => { s.lower = v; s.fb = null; commitSpill(); }) });
  return ui.lower.root;
}
function commitSpill() {
  if (shell.tab !== 'measure') return;
  const st = S.measure;
  if (st.method !== 'ov') return;
  const { g } = meGeom(st);
  if (g.Vi > st.spilled + 0.05) { st.spilled = g.Vi; st.drops = 1; loop.start(); }
}

function build() {
  const tab = shell.tab;
  const st = cur();
  const items = [];
  if (tab === 'apparent') {
    items.push(seg('ctl.body', APP_BODIES.map((k) => [k, `body.${k}`]), st.body, (v) => { const s = cur(); s.body = v; s.lower = 0; s.fb = null; buildTab(); }).root);
    if (st.body === 'unk') items.push(btnRow(createButton({ labelKey: 'ctl.newBody', onClick: () => { const s = cur(); s.unk = rndBody(); s.lower = 0; s.rows = s.rows.filter((r) => r.body !== 'unk'); s.fb = null; buildTab(); } })));
    items.push(seg('ctl.liquid', ['water', 'alcohol', 'salt'].map((k) => [k, `liq.${k}`]), st.liq, (v) => change((s) => { s.liq = v; s.fb = null; })).root,
      lowerSlider(st, apGeom(st).maxLower),
      seg('ctl.forces', [['yes', 'ctl.yes'], ['no', 'ctl.no']], st.forces ? 'yes' : 'no', (v) => change((s) => { s.forces = v === 'yes'; })).root,
      btnRow(createButton({ labelKey: 'ctl.record', variant: 'primary', onClick: () => change(recordApparent) })), hintP('hint.apparent'));
  } else if (tab === 'measure') {
    items.push(seg('ctl.method', [['cyl', 'method.cyl'], ['ov', 'method.ov']], st.method, (v) => { const s = cur(); s.method = v; s.lower = 0; s.spilled = 0; s.fb = null; buildTab(); }).root,
      seg('ctl.body', MEAS_BODIES.map((k) => [k, `body.${k}`]), st.body, (v) => { const s = cur(); s.body = v; s.lower = 0; s.spilled = 0; s.fb = null; buildTab(); }).root,
      seg('ctl.liquid', ['water', 'alcohol'].map((k) => [k, `liq.${k}`]), st.liq, (v) => { const s = cur(); s.liq = v; s.lower = 0; s.spilled = 0; s.fb = null; buildTab(); }).root,
      lowerSlider(st, meGeom(st).maxLower, 'ctl.raise'));
    const b2 = [createButton({ labelKey: 'ctl.record', variant: 'primary', onClick: () => change(recordMeasure) })];
    if (st.method === 'ov') b2.push(createButton({ labelKey: 'ctl.refill', variant: 'ghost', onClick: () => { const s = cur(); s.lower = 0; s.spilled = 0; s.fb = null; buildTab(); } }));
    items.push(btnRow(...b2), hintP(st.method === 'cyl' ? 'hint.cyl' : 'hint.ov'));
  } else if (tab === 'float') {
    items.push(seg('ctl.fmode', [['flask', 'fmode.flask'], ['objects', 'fmode.objects']], st.mode, (v) => { const s = cur(); s.mode = v; s.y = null; s.v = 0; s.liq = 'water'; buildTab(); }).root);
    if (st.mode === 'flask') {
      items.push(btnRow(
        createButton({ labelKey: 'ctl.removeMarble', variant: 'primary', onClick: () => change((s) => { if (s.n > 0) s.n--; loop.start(); }) }),
        createButton({ labelKey: 'ctl.addMarble', onClick: () => change((s) => { if (s.n < 12) s.n++; loop.start(); }) })),
      btnRow(createButton({ labelKey: 'ctl.toBottom', variant: 'ghost', onClick: () => change((s) => { s.y = FL.yBot; s.v = 0; loop.start(); }) }),
        createButton({ labelKey: 'ui.reset', variant: 'ghost', onClick: () => { const s = cur(); s.n = FLASK.n0; s.y = null; s.v = 0; buildTab(); } })),
      hintP('hint.flask'));
    } else {
      items.push(seg('ctl.object', Object.keys(OBJECTS).map((k) => [k, `obj.${k}`]), st.obj, (v) => change((s) => { s.obj = v; s.y = null; s.v = 0; loop.start(); })).root,
        seg('ctl.liquid', ['water', 'alcohol', 'salt', 'mercury'].map((k) => [k, `liq.${k}`]), st.liq, (v) => change((s) => { s.liq = v; s.y = null; s.v = 0; loop.start(); })).root,
        btnRow(createButton({ labelKey: 'ctl.drop', variant: 'primary', onClick: () => change((s) => { s.y = null; s.v = 0; loop.start(); }) })),
        hintP('hint.objects'));
    }
  } else {
    items.push(seg('ctl.liquid', DENS_LIQ.map((k) => [k, `liq.${k}`]), st.liq, (v) => change((s) => { s.liq = v; s.fb = null; loop.start(); })).root);
    if (st.liq === 'unk') items.push(btnRow(createButton({ labelKey: 'ctl.newLiquid', onClick: () => change((s) => { s.unk = rndLiquid(); s.rows = s.rows.filter((r) => r.liq !== 'unk'); s.fb = null; loop.start(); }) })));
    items.push(seg('ctl.scale', [['no', 'ctl.no'], ['yes', 'ctl.yes']], st.scale ? 'yes' : 'no', (v) => change((s) => { s.scale = v === 'yes'; })).root,
      btnRow(createButton({ labelKey: 'ctl.record', variant: 'primary', onClick: () => change(recordDens) })), hintP('hint.dens'));
  }
  controlsBody.append(...items);
  ui.dl = el('dl', { class: 'meas' });
  ui.status = el('div', { class: 'status', hidden: '' });
  ui.table = el('table', { class: 'data' });
  ui.tableWrap = el('div', { class: 'table-scroll', hidden: '' }, ui.table);
  ui.clear = el('div', { class: 'btn-row', style: 'margin-top:8px', hidden: '' }, [createButton({ labelKey: 'ctl.clearTable', variant: 'ghost', onClick: () => change((s) => { s.rows = []; s.fb = null; }) })]);
  measuresBody.append(ui.dl, ui.tableWrap, ui.clear, ui.status);
  tableSig = '';
}

function recordApparent(s) {
  const { b, g } = apGeom(s);
  if (!g.full) { s.fb = { type: 'warn', key: 'fb.notFull' }; return; }
  if (s.rows.some((r) => r.body === s.body && r.liq === s.liq && (s.body !== 'unk' || r.W === b.W))) { s.fb = { type: 'warn', key: 'fb.already' }; return; }
  s.rows.push({ body: s.body, liq: s.liq, W: b.W, Wapp: g.Wapp, bal: b.bal });
  s.fb = { type: 'good', key: 'fb.recorded' };
}
function recordMeasure(s) {
  const { b, g } = meGeom(s);
  if (!g.full) { s.fb = { type: 'warn', key: 'fb.notFull' }; return; }
  if (s.rows.some((r) => r.body === s.body && r.liq === s.liq && r.method === s.method)) { s.fb = { type: 'warn', key: 'fb.already' }; return; }
  s.rows.push({ body: s.body, liq: s.liq, method: s.method, W: b.W, Wapp: g.Wapp, bal: b.bal, Vi: b.V, rho: LIQ[s.liq].rho });
  s.fb = { type: 'good', key: s.method === 'cyl' ? 'fb.recordedCyl' : 'fb.recordedOv' };
}
function recordDens(s) {
  if (Math.abs(s.v) > 0.05) { s.fb = { type: 'warn', key: 'fb.wait' }; return; }
  if (s.rows.some((r) => r.liq === s.liq)) { s.fb = { type: 'warn', key: 'fb.already' }; return; }
  s.rows.push({ liq: s.liq, ell: immersedLen(s), rho: densRho(s) });
  s.fb = { type: 'good', key: 'fb.recordedDens' };
}

const th = (k) => el('th', {}, t(k));
function onCheckFor(st, okKey, badKey) {
  return (res) => {
    st.fb = res === 'invalid' ? { type: 'warn', key: 'fb.typeNumber' } : res === 'wrong' ? { type: 'bad', key: badKey } : { type: 'good', key: okKey };
    refresh();
  };
}
function updateMeasures() {
  if (!shell || !ui.dl) return;
  const tab = shell.tab;
  const st = cur();
  const rows = [];
  if (tab === 'apparent' || tab === 'measure') {
    const { b, g, maxLower } = tab === 'apparent' ? apGeom(st) : meGeom(st);
    if (ui.lower) ui.lower.set(Math.min(st.lower, maxLower));
    rows.push([t('m.balance'), `0 – ${num(g.bal.max, 0)} N`], [t('m.liquidRho'), qty(LIQ[st.liq].rho, 1, 'g/cm³')],
      [t('m.depth'), qty(Math.max(0, (g.bottom - g.ys) / 8), 1, 'cm')], [t('m.state'), g.full ? t('lbl.full') : g.Vi > 0 ? t('lbl.part') : t('lbl.air')]);
    if (b.ball && tab === 'apparent') rows.push([t('m.volume'), qty(b.V, 0, 'cm³')]);
    if (tab === 'measure' && st.method === 'cyl') rows.push([t('m.V1'), qty(ME.cyl.V1, 0, 'mL')]);
  } else if (tab === 'float') {
    const f = floatForces(st);
    if (st.mode === 'flask') rows.push([t('m.marbles'), String(st.n)], [t('m.massFlask'), qty(f.b.m, 0, 'g')], [t('m.volFlask'), qty(FLASK.V, 0, 'cm³')]);
    else rows.push([t('m.mass'), qty(f.b.m, 0, 'g')], [t('m.volume'), qty(f.b.V, 0, 'cm³')], [t('m.liquidRho'), qty(LIQ[st.liq].rho, 1, 'g/cm³')]);
    rows.push([t('m.W'), N_(f.W)], [t('m.F'), N_(f.F)], [t('m.state'), t(`st.${floatState(st, f)}`)]);
  } else {
    rows.push([t('m.strawL'), qty(STRAW.L, 0, 'cm')], [t('m.liquidRho'), st.liq === 'unk' ? '?' : qty(densRho(st), 1, 'g/cm³')]);
  }
  ui.dl.replaceChildren(...rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)]));
  renderTable(tab, st);
  const fb = st.fb;
  if (!fb) ui.status.hidden = true;
  else { ui.status.hidden = false; ui.status.className = `status ${fb.type || ''}`; ui.status.textContent = t(fb.key, fb.params); }
}
function renderTable(tab, st) {
  if (tab === 'float') { ui.tableWrap.hidden = true; ui.clear.hidden = true; return; }
  const sig = calcSig(st.rows) + st.rows.length + getLang() + tab;
  if (sig !== tableSig) {
    tableSig = sig;
    const C = (okKey, badKey) => onCheckFor(st, okKey, badKey);
    const name = (r) => t(r.body ? `body.${r.body}` : `liq.${r.liq}`);
    if (tab === 'apparent') {
      ui.table.replaceChildren(
        el('thead', {}, el('tr', {}, [th('col.body'), th('col.liq'), th('col.W'), th('col.Wapp'), th('col.F')])),
        el('tbody', {}, st.rows.map((r) => el('tr', {}, [
          el('td', {}, name(r)), el('td', {}, t(`liq.${r.liq}`)),
          calcCell(r, 'W', { expected: r.W, decimals: 2, tol: BALANCES[r.bal].minor / 2, onCheck: C('fb.WOk', 'fb.readBad') }),
          calcCell(r, 'Wapp', { expected: r.Wapp, decimals: 2, tol: BALANCES[r.bal].minor / 2, onCheck: C('fb.WappOk', 'fb.readBad') }),
          calcCell(r, 'F', { expected: r.W - r.Wapp, decimals: 2, disabled: !(calcDone(r, 'W') && calcDone(r, 'Wapp')), onCheck: C('fb.FOk', 'fb.FBad') }),
        ]))));
    } else if (tab === 'measure') {
      ui.table.replaceChildren(
        el('thead', {}, el('tr', {}, [th('col.body'), th('col.W'), th('col.Wapp'), th('col.F'), th('col.Vi'), th('col.Wliq')])),
        el('tbody', {}, st.rows.map((r) => el('tr', {}, [
          el('td', {}, `${name(r)} · ${t(`liq.${r.liq}`)}`),
          calcCell(r, 'W', { expected: r.W, decimals: 2, tol: BALANCES[r.bal].minor / 2, onCheck: C('fb.WOk', 'fb.readBad') }),
          calcCell(r, 'Wapp', { expected: r.Wapp, decimals: 2, tol: BALANCES[r.bal].minor / 2, onCheck: C('fb.WappOk', 'fb.readBad') }),
          calcCell(r, 'F', { expected: r.W - r.Wapp, decimals: 2, disabled: !(calcDone(r, 'W') && calcDone(r, 'Wapp')), onCheck: C('fb.FOk', 'fb.FBad') }),
          calcCell(r, 'Vi', { expected: r.Vi, decimals: 0, tol: 1, onCheck: C('fb.ViOk', r.method === 'cyl' ? 'fb.ViBadCyl' : 'fb.ViBadOv') }),
          calcCell(r, 'Wl', { expected: r.rho * r.Vi * N_PER_G, decimals: 2, disabled: !calcDone(r, 'Vi'), onCheck: C('fb.WlOk', 'fb.WlBad') }),
        ]))));
    } else {
      const water = st.rows.find((r) => r.liq === 'water');
      ui.table.replaceChildren(
        el('thead', {}, el('tr', {}, [th('col.liq'), th('col.ell'), th('col.emerg'), th('col.d')])),
        el('tbody', {}, st.rows.map((r) => el('tr', {}, [
          el('td', {}, t(`liq.${r.liq}`)),
          calcCell(r, 'ell', { expected: r.ell, decimals: 1, tol: 0.1, onCheck: C('fb.ellOk', 'fb.ellBad') }),
          calcCell(r, 'em', { expected: STRAW.L - r.ell, decimals: 1, tol: 0.1, disabled: !calcDone(r, 'ell'), onCheck: C('fb.emOk', 'fb.emBad') }),
          r.liq === 'water' ? el('td', {}, num(1, 1))
            : calcCell(r, 'd', { expected: STRAW.lw / r.ell, decimals: 2, disabled: !(calcDone(r, 'ell') && water && calcDone(water, 'ell')), onCheck: C('fb.dOk', 'fb.dBad') }),
        ]))));
    }
  }
  ui.tableWrap.hidden = !st.rows.length; ui.clear.hidden = !st.rows.length;
}

function buildTab() {
  loop.stop();
  controlsBody.replaceChildren();
  measuresBody.replaceChildren();
  ui = {};
  build();
  refresh();
  if (shell.tab === 'float' || shell.tab === 'densimeter') loop.start();
}
onLangChange(() => { if (shell) buildTab(); });

shell = initSim({
  strings,
  tabs: TABS.map((id) => ({ id, labelKey: `tab.${id}` })),
  initialTab: 'apparent',
  onTab: buildTab,
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, cur: () => cur(), apGeom, meGeom, floatForces, immersedLen, resetRows };
