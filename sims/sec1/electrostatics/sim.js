// Sec 1 — Chapter 1: Electrostatics (1.1–1.8 and the home experiments; 1.9 Coulomb's law is not in the 2026–2027 list).
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num } from '../../../shared/format.js';
import { createButton, createSegmented, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, font } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { calcCell, calcSig } from '../../../shared/calc-cell.js';
import { label } from '../../../shared/figures.js';

/* ================================================================
   Charges are counted in "charge symbols" (one + or − drawn = one unit).
   A rubbed rod carries 8 units on its rubbed end. Forces use simple laws
   tuned for the screen (Coulomb's law is not used numerically: 1.9 is not taught).
   ================================================================ */
const ROD_Q = { plastic: -8, glass: 8, fur: 8, silk: -8, neutral: 0 }; // plastic/fur and glass/silk (Exp. 1.1–1.3)
const W = 600, H = 430;
const TABS = ['interaction', 'contact', 'electroscope', 'conductors', 'charge'];

function initialState(tab) {
  switch (tab) {
    case 'interaction': return { hang: 'plastic', hand: 'plastic', target: 'rod', show: false, th: 0, om: 0, hx: 410, hy: 262 };
    case 'contact': return { rod: 'plastic', ball0: 'neutral', show: false, qr: -8, qb: 0, ph: 0, om: 0, hx: 390, hy: 255, touched: false, wasTouching: false };
    case 'electroscope': return { rod: 'glass', show: false, qr: 8, qe: 0, finger: false, hx: 400, hy: 110, a: 0, touching: false };
    case 'conductors': return { rod: 'metalWood', show: false, qr: 0, qe: 0, rubbed: false, finger: false, hx: 400, hy: 110, a: 0, touching: false, fb: null };
    case 'charge': return { kase: 'a', q1: 2, q2: -2, bx: 470, touched: false, calc: {}, fb: null };
    default: return {};
  }
}
let S = Object.fromEntries(TABS.map((k) => [k, initialState(k)]));
let shell;
const cur = () => S[shell.tab];

let drawQueued = false;
const canvas = document.getElementById('stage');
const view = setupCanvas(canvas, { width: W, height: H, maxHeightVh: () => (window.innerWidth < 880 ? 52 : 76), onResize: () => requestDraw() });
function requestDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; draw(); });
}
onThemeChange(() => requestDraw());

/* ================================================================
   Drawing helpers
   ================================================================ */
function charge(ctx, x, y, sign, r = 6.5) {
  ctx.fillStyle = cssVar('--surface');
  ctx.strokeStyle = cssVar(sign > 0 ? '--plus' : '--minus'); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - r * 0.55, y); ctx.lineTo(x + r * 0.55, y);
  if (sign > 0) { ctx.moveTo(x, y - r * 0.55); ctx.lineTo(x, y + r * 0.55); }
  ctx.stroke();
}
// n charges spread along a segment
function chargesAlong(ctx, x1, y1, x2, y2, q) {
  const n = Math.min(14, Math.round(Math.abs(q)));
  for (let i = 0; i < n; i++) {
    const f = n === 1 ? 0.5 : i / (n - 1);
    charge(ctx, x1 + (x2 - x1) * f, y1 + (y2 - y1) * f + (i % 2 ? -3 : 3), Math.sign(q));
  }
}
// n charges on a disc
function chargesOnDisc(ctx, x, y, R, q) {
  const n = Math.min(12, Math.round(Math.abs(q)));
  for (let i = 0; i < n; i++) {
    const a = (i / Math.max(1, n)) * Math.PI * 2 + 0.4;
    const rr = n === 1 ? 0 : R * (i % 2 ? 0.45 : 0.75);
    charge(ctx, x + rr * Math.cos(a), y + rr * Math.sin(a), Math.sign(q), 5.5);
  }
}
function rodColor(kind) {
  return kind === 'glass' ? cssVar('--glass-rod') : kind === 'metal' ? cssVar('--metal') : cssVar('--plastic-rod');
}
function rod(ctx, x1, y1, x2, y2, kind, w = 13) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = kind === 'glass' ? cssVar('--glass-stroke') : 'rgba(0,0,0,0.35)';
  ctx.lineWidth = w + 2.5;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.strokeStyle = rodColor(kind); ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
  const nx = (y1 - y2), ny = (x2 - x1), k = (w / 4) / Math.hypot(nx, ny);
  ctx.beginPath(); ctx.moveTo(x1 - nx * k, y1 - ny * k); ctx.lineTo(x2 - nx * k, y2 - ny * k); ctx.stroke();
}
function hand(ctx, x, y) {
  ctx.fillStyle = cssVar('--skin'); ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.5;
  roundRect(ctx, x - 18, y - 16, 40, 32, 12); ctx.fill(); ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < 3; i++) { ctx.moveTo(x - 8 + i * 9, y - 16); ctx.lineTo(x - 8 + i * 9, y - 6); }
  ctx.stroke();
}
function cloth(ctx, x, y, kind) {
  ctx.fillStyle = cssVar(kind === 'fur' ? '--fur' : '--silk');
  ctx.strokeStyle = cssVar(kind === 'fur' ? '--fur-light' : '--silk-line'); ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const r = (kind === 'fur' ? 30 + (i % 2) * 6 : 32 + 3 * Math.sin(a * 3));
    const px = x + r * Math.cos(a) * 1.1, py = y + r * Math.sin(a) * 0.75;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  if (kind === 'fur') {
    ctx.strokeStyle = cssVar('--fur-light'); ctx.lineWidth = 1.5;
    for (let i = 0; i < 9; i++) { const a = i * 0.7; ctx.beginPath(); ctx.moveTo(x + 18 * Math.cos(a), y + 12 * Math.sin(a)); ctx.lineTo(x + 24 * Math.cos(a + 0.2), y + 16 * Math.sin(a + 0.2)); ctx.stroke(); }
  }
}
function board(ctx) {
  ctx.fillStyle = cssVar('--board');
  roundRect(ctx, 6, 6, W - 12, H - 12, 14); ctx.fill();
}
function stand(ctx, x, yTop, yBase) {
  ctx.strokeStyle = cssVar('--stone'); ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, yBase); ctx.lineTo(x, yTop); ctx.stroke();
  ctx.fillStyle = cssVar('--stone'); roundRect(ctx, x - 40, yBase - 4, 80, 12, 4); ctx.fill();
}
function hint(ctx, text) { label(ctx, text, W / 2, H - 22, { size: 13, weight: 600, color: cssVar('--muted') }); }

/* ================================================================
   Tab 1 — Interaction (Exp. 1.1–1.3) and a thread of water (home Exp. 1.8)
   Hanging rod seen slightly from above: plane coordinates (x, z), screen y = PY + 0.42 z.
   ================================================================ */
const PIV = { x: 250, y: 215 }, LROD = 150, SQ = 0.42;
function handQ(kind) { return ROD_Q[kind]; }
function stepInteraction(st, dt) {
  if (st.target !== 'rod') return;
  const qh = ROD_Q[st.hang], qo = handQ(st.hand);
  const tipX = st.hx, tipZ = (st.hy - PIV.y) / SQ;
  const ex = LROD * Math.cos(st.th), ez = LROD * Math.sin(st.th);
  const dx = ex - (tipX - PIV.x), dz = ez - tipZ;
  const r2 = dx * dx + dz * dz, r = Math.sqrt(r2);
  const k = 2.4 * qh * qo / Math.max(r2 * r, 900 * 30);
  const fx = k * dx, fz = k * dz;
  const tau = ex * fz - ez * fx;
  st.om += (tau * 0.9 - 2.4 * st.om - 0.15 * Math.sin(st.th)) * dt;
  const th0 = st.th;
  st.th += st.om * dt;
  // the rods cannot go through each other
  const ex2 = LROD * Math.cos(st.th), ez2 = LROD * Math.sin(st.th);
  if (Math.hypot(ex2 - (tipX - PIV.x), ez2 - tipZ) < 22) { st.th = th0; st.om = 0; }
}
function interactionState(st) {
  // force on the end, sign of the interaction (for the measurements)
  const qh = ROD_Q[st.hang], qo = handQ(st.hand);
  if (st.target === 'water') {
    const d = Math.hypot(st.hx - WATER.x, st.hy - 260);
    return qo === 0 ? 'none' : d < 200 ? 'attract' : 'far';
  }
  const ex = PIV.x + LROD * Math.cos(st.th), ey = PIV.y + SQ * LROD * Math.sin(st.th);
  const d = Math.hypot(st.hx - ex, (st.hy - ey) / SQ);
  if (qo === 0) return 'none';
  if (d > 230) return 'far';
  return qh * qo > 0 ? 'repel' : 'attract';
}
const WATER = { x: 250, y0: 86, y1: 352 };
function waterPath(st) {
  const q = Math.abs(handQ(st.hand));
  const pts = [];
  let x = WATER.x, y = WATER.y0, vx = 0, vy = 40;
  const dt = 0.004;
  for (let i = 0; i < 400 && y < WATER.y1; i++) {
    const dx = st.hx - x, dy = st.hy - y;
    const r = Math.max(14, Math.hypot(dx, dy));
    const a = 1.5e5 * q / (r * r * r);
    vx += a * dx * dt; vy += 900 * dt;
    vx *= 0.97; // the thread of water only bends slightly
    x += vx * dt; y += vy * dt;
    x = Math.max(WATER.x - 25, Math.min(WATER.x + 25, x));
    if (i % 3 === 0) pts.push([x, y]);
  }
  pts.push([x, y]);
  return pts;
}
function drawHandObject(ctx, st, kind, q, show) {
  const x = st.hx, y = st.hy;
  if (kind === 'fur' || kind === 'silk') {
    cloth(ctx, x, y, kind);
    hand(ctx, x + 34, y + 18);
    if (show) chargesOnDisc(ctx, x, y, 24, q);
    return;
  }
  const len = 175;
  rod(ctx, x, y, x + len, y, kind === 'neutral' ? 'plastic' : kind);
  hand(ctx, x + len - 30, y);
  if (show && q) chargesAlong(ctx, x + 6, y, x + 70, y, q);
}
function drawInteraction(ctx, st) {
  board(ctx);
  const show = st.show;
  if (st.target === 'rod') {
    // support and thread
    ctx.strokeStyle = cssVar('--stone'); ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(60, 400); ctx.lineTo(60, 40); ctx.lineTo(PIV.x, 40); ctx.stroke();
    ctx.fillStyle = cssVar('--stone'); roundRect(ctx, 20, 396, 90, 14, 4); ctx.fill();
    ctx.strokeStyle = cssVar('--thread'); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(PIV.x, 40); ctx.lineTo(PIV.x, PIV.y - 10); ctx.stroke();
    // horizontal disc of the motion (light ellipse)
    ctx.strokeStyle = cssVar('--border'); ctx.setLineDash([4, 5]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(PIV.x, PIV.y, LROD, LROD * SQ, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    const c = Math.cos(st.th), s = Math.sin(st.th);
    const ex = PIV.x + LROD * c, ey = PIV.y + SQ * LROD * s;
    const bx = PIV.x - LROD * c, by = PIV.y - SQ * LROD * s;
    const handBehind = st.hy < PIV.y; // farther from the viewer: drawn first
    if (handBehind) drawHandObject(ctx, st, st.hand, handQ(st.hand), show);
    rod(ctx, bx, by, ex, ey, st.hang);
    // stirrup
    ctx.strokeStyle = cssVar('--thread'); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(PIV.x, PIV.y - 2, 9, Math.PI, 0, false); ctx.stroke();
    if (show) {
      const q = ROD_Q[st.hang];
      chargesAlong(ctx, PIV.x + LROD * 0.55 * c, PIV.y + SQ * LROD * 0.55 * s, ex - 6 * c, ey - 6 * SQ * s, q * 0.6);
    }
    label(ctx, t('lbl.rubbedEnd'), ex - 30 * c, ey - 24, { size: 12, color: cssVar('--muted') });
    if (!handBehind) drawHandObject(ctx, st, st.hand, handQ(st.hand), show);
  } else {
    // tap and a thin thread of falling water
    ctx.fillStyle = cssVar('--metal');
    roundRect(ctx, WATER.x - 70, 50, 80, 18, 6); ctx.fill();
    roundRect(ctx, WATER.x - 10, 60, 20, 26, 4); ctx.fill();
    const pts = waterPath(st);
    ctx.strokeStyle = cssVar('--water'); ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(WATER.x, WATER.y0);
    for (const [x, y] of pts) ctx.lineTo(x, y);
    ctx.stroke();
    // basin
    ctx.strokeStyle = cssVar('--glass-stroke'); ctx.lineWidth = 3; ctx.fillStyle = cssVar('--glass-fill');
    ctx.beginPath(); ctx.moveTo(WATER.x - 110, 335); ctx.lineTo(WATER.x - 95, 385); ctx.lineTo(WATER.x + 95, 385); ctx.lineTo(WATER.x + 110, 335); ctx.fill(); ctx.stroke();
    ctx.fillStyle = cssVar('--water'); ctx.globalAlpha = 0.5; ctx.fillRect(WATER.x - 100, 358, 200, 26); ctx.globalAlpha = 1;
    drawHandObject(ctx, st, st.hand, handQ(st.hand), show);
  }
  hint(ctx, t('hint.drag'));
}

/* ================================================================
   Tab 2 — Charging by contact (Exp. 1.4, Question 2)
   Metal-coated ball on an insulating thread (pendulum). The charged end of the rod (its tip)
   attracts a neutral conductor (induction) and repels a ball with a charge of the same sign.
   ================================================================ */
const PEN = { x: 250, y: 40, L: 215, R: 15 };
function ballPos(st) { return { x: PEN.x + PEN.L * Math.sin(st.ph), y: PEN.y + PEN.L * Math.cos(st.ph) }; }
// distance from the ball centre to the rod (segment from the tip to the right)
function rodDist(b, hx, hy) {
  const px = Math.max(hx, Math.min(hx + 175, b.x));
  return { d: Math.hypot(b.x - px, b.y - hy), px };
}
function stepContact(st, dt) {
  const b = ballPos(st);
  const dx = b.x - st.hx, dy = b.y - st.hy;
  const r = Math.max(20, Math.hypot(dx, dy));
  // Coulomb-like (sign) + induction (always attractive towards a charged rod)
  const kc = 2.6e5 * st.qb * st.qr / (r * r * r);
  const ki = -3e8 * st.qr * st.qr * Math.exp(-Math.abs(st.qb)) / (r ** 5);
  const ax = (kc + ki) * dx, ay = (kc + ki) * dy;
  const at = ax * Math.cos(st.ph) - ay * Math.sin(st.ph); // tangential component
  st.om += (-20 * Math.sin(st.ph) + at / PEN.L - 1.6 * st.om) * dt;
  const ph0 = st.ph;
  st.ph += st.om * dt;
  const b2 = ballPos(st);
  const { d, px } = rodDist(b2, st.hx, st.hy);
  const touching = d < PEN.R + 8;
  if (touching) {
    st.ph = ph0; st.om = -0.2 * st.om;
    if (!st.wasTouching && px - st.hx < 50) {
      // contact on the charged end: the charges are shared (total conserved)
      const tot = st.qr + st.qb;
      st.qb = tot / 2; st.qr = tot / 2;
      st.touched = true;
    }
  }
  st.wasTouching = touching || d < PEN.R + 10;
}
function contactState(st) {
  const b = ballPos(st);
  const d = Math.hypot(b.x - st.hx, b.y - st.hy);
  if (Math.abs(st.qr) < 0.5) return 'none';
  if (st.wasTouching) return 'touch';
  if (d > 190) return 'far';
  if (Math.abs(st.qb) < 0.25) return 'attract';
  return st.qb * st.qr > 0 ? 'repel' : 'attract';
}
function drawContact(ctx, st) {
  board(ctx);
  ctx.strokeStyle = cssVar('--stone'); ctx.lineWidth = 7; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(60, 400); ctx.lineTo(60, PEN.y); ctx.lineTo(PEN.x + 20, PEN.y); ctx.stroke();
  ctx.fillStyle = cssVar('--stone'); roundRect(ctx, 20, 396, 90, 14, 4); ctx.fill();
  const b = ballPos(st);
  ctx.strokeStyle = cssVar('--thread'); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(PEN.x, PEN.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  // metal-coated ball
  const g = ctx.createRadialGradient(b.x - 5, b.y - 5, 2, b.x, b.y, PEN.R);
  g.addColorStop(0, '#ffffff'); g.addColorStop(1, cssVar('--metal'));
  ctx.fillStyle = g; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(b.x, b.y, PEN.R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  const kind = st.rod;
  rod(ctx, st.hx, st.hy, st.hx + 175, st.hy, kind);
  hand(ctx, st.hx + 145, st.hy);
  if (st.show) {
    chargesOnDisc(ctx, b.x, b.y, PEN.R - 2, st.qb);
    if (Math.abs(st.qb) < 0.25 && Math.abs(st.qr) > 0.5) {
      // neutral conductor near a charged rod: charges separate (the ball stays neutral)
      const ux = (st.hx - b.x), uy = (st.hy - b.y), n = Math.hypot(ux, uy) || 1;
      const near = Math.hypot(ux, uy) < 160;
      if (near) {
        const s = Math.sign(st.qr);
        charge(ctx, b.x + 8 * ux / n, b.y + 8 * uy / n, -s, 5);
        charge(ctx, b.x - 8 * ux / n, b.y - 8 * uy / n, s, 5);
      }
    }
    chargesAlong(ctx, st.hx + 6, st.hy, st.hx + 60, st.hy, st.qr);
  }
  hint(ctx, t('hint.dragRod'));
}

/* ================================================================
   Tab 3 and 4 — Metal-leaf electroscope (1.6, Exp. 1.5, grounding) and Exp. 1.7
   qe: charge of the electroscope (knob + stem + leaves). A charged rod at a distance d from the knob
   pushes a part s of the free electrons to the knob or to the leaves (induction).
   ================================================================ */
const ES = { x: 230, knobY: 150, knobR: 20, pivY: 292, boxTop: 210, boxBot: 380, leaf: 62 };
function induced(st) {
  const d = Math.hypot(st.hx - ES.x, st.hy - ES.knobY);
  const g = Math.min(1, (60 / Math.max(d, 1)) ** 3);
  return 0.5 * st.qr * g;
}
function leafCharge(st) {
  const s = induced(st);
  if (st.finger) return 0;
  return 0.65 * st.qe + 0.6 * s;
}
function knobCharge(st) { return st.qe - leafCharge(st); }
function stepElectroscope(st, dt) {
  const s = induced(st);
  if (st.finger) st.qe = -0.6 * s / 0.65; // the Earth gives or takes electrons until the leaves are neutral
  const d = Math.hypot(st.hx - ES.x, st.hy - ES.knobY);
  const touching = d < ES.knobR + 9;
  if (touching && !st.touching && Math.abs(st.qr) > 0.01) {
    const tot = st.qr + st.qe;
    st.qe = tot / 2; st.qr = tot / 2;
  }
  st.touching = touching;
  const q = Math.abs(leafCharge(st));
  const target = 50 * (1 - Math.exp(-q / 3.2));
  st.a += (target - st.a) * Math.min(1, 6 * dt);
}
function drawElectroscope(ctx, st, rodKind) {
  const { x, knobY, knobR, pivY, boxTop, boxBot, leaf } = ES;
  // glass box
  ctx.fillStyle = cssVar('--glass-fill'); ctx.strokeStyle = cssVar('--glass-stroke'); ctx.lineWidth = 2.5;
  roundRect(ctx, x - 95, boxTop, 190, boxBot - boxTop, 10); ctx.fill(); ctx.stroke();
  ctx.fillStyle = cssVar('--stone'); roundRect(ctx, x - 105, boxBot, 210, 14, 4); ctx.fill();
  // insulating stopper
  ctx.fillStyle = cssVar('--rubber'); roundRect(ctx, x - 18, boxTop - 8, 36, 18, 4); ctx.fill();
  // stem and knob
  ctx.strokeStyle = cssVar('--brass'); ctx.lineWidth = 6; ctx.lineCap = 'butt';
  ctx.beginPath(); ctx.moveTo(x, knobY); ctx.lineTo(x, pivY + 4); ctx.stroke();
  const g = ctx.createRadialGradient(x - 6, knobY - 6, 2, x, knobY, knobR);
  g.addColorStop(0, '#fff6d8'); g.addColorStop(1, cssVar('--brass'));
  ctx.fillStyle = g; ctx.strokeStyle = cssVar('--brass-dark'); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(x, knobY, knobR, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // leaves
  const a = (st.a * Math.PI) / 180;
  ctx.fillStyle = cssVar('--leaf'); ctx.strokeStyle = cssVar('--brass-dark'); ctx.lineWidth = 1;
  for (const sgn of [-1, 1]) {
    const tx = x + sgn * leaf * Math.sin(a), ty = pivY + leaf * Math.cos(a);
    const nx = Math.cos(a) * 5 * sgn, ny = -Math.sin(a) * 5;
    ctx.beginPath(); ctx.moveTo(x, pivY); ctx.lineTo(x + nx * 0.6, pivY + ny * 0.6 + 3); ctx.lineTo(tx + nx, ty + ny); ctx.lineTo(tx, ty); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  if (st.show) {
    const ql = leafCharge(st), qk = knobCharge(st);
    chargesOnDisc(ctx, x, knobY, knobR - 3, qk);
    const n = Math.min(8, Math.round(Math.abs(ql)));
    for (let i = 0; i < n; i++) {
      const sgn = i % 2 ? 1 : -1, f = 0.35 + 0.55 * (Math.floor(i / 2) / Math.max(1, Math.ceil(n / 2) - 1 || 1));
      charge(ctx, x + sgn * leaf * f * Math.sin(a) + sgn * 9, pivY + leaf * f * Math.cos(a), Math.sign(ql), 5);
    }
  }
  // finger on the knob (grounding)
  if (st.finger) {
    ctx.fillStyle = cssVar('--skin'); ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.5;
    roundRect(ctx, 40, knobY - 12, x - knobR - 34, 24, 12); ctx.fill(); ctx.stroke();
    label(ctx, t('lbl.toEarth'), 70, knobY + 30, { size: 12, color: cssVar('--muted') });
  }
  // the rod in the hand
  drawProbeRod(ctx, st, rodKind);
}
function drawProbeRod(ctx, st, rodKind) {
  const x = st.hx, y = st.hy;
  if (rodKind === 'metalWood' || rodKind === 'metalHand') {
    const metalLen = rodKind === 'metalWood' ? 110 : 175;
    rod(ctx, x, y, x + metalLen, y, 'metal', 12);
    if (rodKind === 'metalWood') {
      ctx.strokeStyle = cssVar('--wood'); ctx.lineWidth = 18; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x + metalLen, y); ctx.lineTo(x + 180, y); ctx.stroke();
    }
    hand(ctx, x + 150, y);
    if (st.show && Math.abs(st.qr) > 0.4) chargesAlong(ctx, x + 6, y, x + metalLen - 10, y, st.qr);
  } else {
    rod(ctx, x, y, x + 175, y, rodKind);
    hand(ctx, x + 145, y);
    if (st.show && Math.abs(st.qr) > 0.4) chargesAlong(ctx, x + 6, y, x + 66, y, st.qr);
  }
}
function drawTabElectroscope(ctx, st) {
  board(ctx);
  drawElectroscope(ctx, st, st.rod);
  hint(ctx, t('hint.dragRodKnob'));
}
function drawConductors(ctx, st) {
  board(ctx);
  drawElectroscope(ctx, st, st.rod);
  if (st.rubbing > 0) {
    cloth(ctx, st.hx + 50 + 20 * Math.sin(st.rubbing * 25), st.hy, 'silk');
  }
  hint(ctx, t('hint.dragRodKnob'));
}

/* ================================================================
   Tab 5 — Quantity of charge (1.8, Example 1.1, Problems 1 and 3)
   Two identical metal balls A and B on insulating stands; B is dragged to touch A.
   Charges in units of 10⁻⁸ C.
   ================================================================ */
const E_CHARGE = 1.6e-19;
const CASES = { a: [2, -2], b: [1.5, -2] };
const BALL = { ax: 200, y: 200, R: 42 };
function drawCharge(ctx, st) {
  board(ctx);
  const drawBall = (x, q, name) => {
    stand(ctx, x, BALL.y + BALL.R, 380);
    ctx.fillStyle = cssVar('--glass-rod'); ctx.fillRect(x - 5, BALL.y + BALL.R - 4, 10, 140);
    const g = ctx.createRadialGradient(x - 12, BALL.y - 12, 4, x, BALL.y, BALL.R);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, cssVar('--metal'));
    ctx.fillStyle = g; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, BALL.y, BALL.R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    chargesOnDisc(ctx, x, BALL.y, BALL.R - 8, q * 2.5);
    label(ctx, name, x, BALL.y - BALL.R - 18, { size: 18, weight: 800 });
    label(ctx, `q = ${num(q, 2)} × 10⁻⁸ C`, x, BALL.y + BALL.R + 22, { size: 13, weight: 700, color: cssVar('--muted') });
  };
  const [qa, qb] = chargeNow(st);
  drawBall(BALL.ax, qa, 'A');
  drawBall(st.bx, qb, 'B');
  hint(ctx, t(st.touched ? 'hint.touched' : 'hint.dragB'));
}
function chargeNow(st) { return st.touched ? [(st.q1 + st.q2) / 2, (st.q1 + st.q2) / 2] : [st.q1, st.q2]; }

/* ================================================================
   Main draw and loop
   ================================================================ */
function draw() {
  if (!shell) return;
  const ctx = view.begin();
  const st = cur();
  switch (shell.tab) {
    case 'interaction': drawInteraction(ctx, st); break;
    case 'contact': drawContact(ctx, st); break;
    case 'electroscope': drawTabElectroscope(ctx, st); break;
    case 'conductors': drawConductors(ctx, st); break;
    case 'charge': drawCharge(ctx, st); break;
    default: break;
  }
}
let measTimer = 0;
const loop = createLoop({
  dt: 1 / 120,
  step(dt) {
    if (!shell) return true;
    const st = cur();
    const sub = 1;
    for (let i = 0; i < sub; i++) {
      if (shell.tab === 'interaction') stepInteraction(st, dt);
      else if (shell.tab === 'contact') stepContact(st, dt);
      else if (shell.tab === 'electroscope' || shell.tab === 'conductors') stepElectroscope(st, dt);
    }
    if (st.rubbing > 0) { st.rubbing -= dt; if (st.rubbing <= 0) finishRub(st); }
    return shell.tab !== 'charge';
  },
  render() {
    draw();
    measTimer += 1;
    if (measTimer % 8 === 0) updateMeasures();
  },
});

/* ================================================================
   Dragging (Pointer Events)
   ================================================================ */
let drag = null;
canvas.style.touchAction = 'none';
function grabbable(st, p) {
  const tab = shell.tab;
  if (tab === 'charge') return Math.hypot(p.x - st.bx, p.y - BALL.y) < BALL.R + 14 ? 'b' : null;
  // the object in the hand: along the rod or around the cloth
  const onRod = p.x > st.hx - 30 && p.x < st.hx + 200 && Math.abs(p.y - st.hy) < 34;
  return onRod ? 'hand' : null;
}
canvas.addEventListener('pointerdown', (ev) => {
  const st = cur();
  const p = view.toLogical(ev);
  const g = grabbable(st, p);
  if (!g) return;
  ev.preventDefault();
  canvas.setPointerCapture(ev.pointerId);
  drag = g === 'b' ? { kind: 'b', ox: st.bx - p.x } : { kind: 'hand', ox: st.hx - p.x, oy: st.hy - p.y };
});
canvas.addEventListener('pointermove', (ev) => {
  if (!drag) return;
  const st = cur();
  const p = view.toLogical(ev);
  if (drag.kind === 'b') {
    st.bx = Math.max(BALL.ax + 2 * BALL.R, Math.min(540, p.x + drag.ox));
    if (st.bx <= BALL.ax + 2 * BALL.R + 0.5 && !st.touched) { st.touched = true; st.fb = null; ui.sig = null; updateMeasures(); }
    requestDraw();
    return;
  }
  let x = p.x + drag.ox, y = p.y + drag.oy;
  const tab = shell.tab;
  if (tab === 'interaction' && st.target === 'rod') {
    y = Math.max(PIV.y - 62, Math.min(PIV.y + 62, y));
    x = Math.max(PIV.x - 120, Math.min(W - 180, x));
  } else {
    x = Math.max(40, Math.min(W - 180, x)); y = Math.max(40, Math.min(370, y));
  }
  if (tab === 'contact') {
    // the rod cannot go through the ball
    const b = ballPos(st);
    const { d } = rodDist(b, x, y);
    if (d < PEN.R + 8) { if (Math.abs(y - b.y) < PEN.R + 8 && x < b.x + 30 && x > b.x - 300) x = Math.max(x, b.x + Math.sqrt(Math.max(0, (PEN.R + 8) ** 2 - (y - b.y) ** 2))); }
  }
  if (tab === 'electroscope' || tab === 'conductors') {
    const d = Math.hypot(x - ES.x, y - ES.knobY);
    const m = ES.knobR + 8;
    if (d < m) { const k = m / (d || 1); x = ES.x + (x - ES.x) * k; y = ES.knobY + (y - ES.knobY) * k; }
    if (x < ES.x + 100 && y > ES.boxTop - 20) y = ES.boxTop - 20; // stay above the box
  }
  st.hx = x; st.hy = y;
  requestDraw();
});
const endDrag = () => { drag = null; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

/* ================================================================
   Panels
   ================================================================ */
const controlsBody = document.getElementById('controls-body');
const measuresBody = document.getElementById('measures-body');
let ui = {};
function seg(labelKey, options, value, onChange) {
  return createSegmented({ labelKey, options: options.map(([v, k]) => ({ value: String(v), labelKey: k })), value: String(value), onChange });
}
const btnRow = (...b) => el('div', { class: 'btn-row', style: 'margin-top:8px' }, b);
const hintP = (key) => el('p', { class: 'muted', style: 'margin:8px 0 0;font-size:0.88rem', dataset: { i18n: key } }, t(key));
const showSeg = (st) => seg('ctl.show', [['no', 'ctl.no'], ['yes', 'ctl.yes']], st.show ? 'yes' : 'no', (v) => { st.show = v === 'yes'; requestDraw(); updateMeasures(); });
const resetBtn = (tab) => createButton({ labelKey: 'ui.reset', variant: 'ghost', onClick: () => { S[tab] = initialState(tab); buildTab(); } });

function finishRub(st) {
  st.rubbing = 0;
  st.rubbed = true;
  if (st.rod === 'metalHand') { st.qr = 0; st.fb = { type: '', key: 'fb.rubbedHand' }; } else { st.qr = -6; st.fb = { type: '', key: 'fb.rubbed' }; }
  updateMeasures();
}

function build() {
  const tab = shell.tab;
  const st = cur();
  const items = [];
  if (tab === 'interaction') {
    items.push(seg('ctl.target', [['rod', 'target.rod'], ['water', 'target.water']], st.target, (v) => { st.target = v; st.hx = v === 'water' ? 300 : 410; st.hy = v === 'water' ? 230 : 262; st.th = 0; st.om = 0; buildTab(); }).root);
    if (st.target === 'rod') items.push(seg('ctl.hang', [['plastic', 'obj.plasticFur'], ['glass', 'obj.glassSilk']], st.hang, (v) => { st.hang = v; requestDraw(); }).root);
    items.push(seg('ctl.hand', [['plastic', 'obj.plasticFur'], ['glass', 'obj.glassSilk'], ['fur', 'obj.fur'], ['silk', 'obj.silk'], ['neutral', 'obj.neutral']], st.hand, (v) => { st.hand = v; requestDraw(); }).root);
    items.push(showSeg(st).root);
    items.push(btnRow(resetBtn(tab)));
    items.push(hintP(st.target === 'rod' ? 'hint.interaction' : 'hint.water'));
  } else if (tab === 'contact') {
    items.push(seg('ctl.rod', [['plastic', 'obj.plasticFur'], ['glass', 'obj.glassSilk']], st.rod, (v) => { st.rod = v; st.qr = ROD_Q[v]; requestDraw(); }).root);
    items.push(seg('ctl.ball0', [['neutral', 'ball.neutral'], ['positive', 'ball.positive']], st.ball0, (v) => { st.ball0 = v; st.qb = v === 'positive' ? 3 : 0; st.touched = false; requestDraw(); }).root);
    items.push(showSeg(st).root);
    items.push(btnRow(
      createButton({ labelKey: 'ctl.rubAgain', variant: 'primary', onClick: () => { st.qr = ROD_Q[st.rod]; updateMeasures(); requestDraw(); } }),
      createButton({ labelKey: 'ctl.discharge', onClick: () => { st.qb = st.ball0 === 'positive' ? 3 : 0; st.touched = false; updateMeasures(); requestDraw(); } }),
      resetBtn(tab)));
    items.push(hintP('hint.contact'));
  } else if (tab === 'electroscope') {
    items.push(seg('ctl.rod', [['plastic', 'obj.plasticFur'], ['glass', 'obj.glassSilk']], st.rod, (v) => { st.rod = v; st.qr = ROD_Q[v]; requestDraw(); }).root);
    ui.finger = seg('ctl.finger', [['no', 'ctl.no'], ['yes', 'ctl.yes']], st.finger ? 'yes' : 'no', (v) => { st.finger = v === 'yes'; requestDraw(); });
    items.push(ui.finger.root, showSeg(st).root);
    items.push(btnRow(
      createButton({ labelKey: 'ctl.rubAgain', variant: 'primary', onClick: () => { st.qr = ROD_Q[st.rod]; updateMeasures(); } }),
      createButton({ labelKey: 'ctl.awayRod', onClick: () => { st.hx = 400; st.hy = 110; } }),
      resetBtn(tab)));
    items.push(hintP('hint.electroscope'));
  } else if (tab === 'conductors') {
    items.push(seg('ctl.probe', [['metalHand', 'obj.metalHand'], ['metalWood', 'obj.metalWood'], ['plastic', 'obj.plasticHand']], st.rod, (v) => { st.rod = v; st.qr = 0; st.rubbed = false; st.fb = null; requestDraw(); updateMeasures(); }).root);
    ui.finger = seg('ctl.finger', [['no', 'ctl.no'], ['yes', 'ctl.yes']], st.finger ? 'yes' : 'no', (v) => { st.finger = v === 'yes'; requestDraw(); });
    items.push(ui.finger.root, showSeg(st).root);
    items.push(btnRow(
      createButton({ labelKey: 'ctl.rubCloth', variant: 'primary', onClick: () => { st.hx = 400; st.hy = 110; st.rubbing = 0.8; st.fb = null; updateMeasures(); } }),
      createButton({ labelKey: 'ctl.dischargeEs', onClick: () => { st.qe = 0; requestDraw(); } }),
      resetBtn(tab)));
    items.push(hintP('hint.conductors'));
  } else if (tab === 'charge') {
    items.push(seg('ctl.case', [['a', 'case.a'], ['b', 'case.b'], ['r', 'case.r']], st.kase, (v) => {
      st.kase = v;
      if (v === 'r') {
        const pick = () => (Math.round((Math.random() * 8 - 4) * 2) / 2) || 1;
        let a = pick(), b = pick();
        while (a + b === 0 && Math.random() < 0.7) b = pick();
        st.q1 = a; st.q2 = b;
      } else [st.q1, st.q2] = CASES[v];
      st.touched = false; st.bx = 470; st.calc = {}; st.fb = null; ui.sig = null; updateMeasures(); requestDraw();
    }).root);
    items.push(btnRow(
      createButton({ labelKey: 'ctl.separate', onClick: () => { st.bx = 470; requestDraw(); } }),
      resetBtn(tab)));
    items.push(hintP('hint.charge'));
  }
  controlsBody.append(...items);
  ui.dl = el('dl', { class: 'meas' });
  ui.status = el('div', { class: 'status', hidden: '' });
  ui.tables = el('div');
  measuresBody.append(ui.dl, ui.status, ui.tables);
}

const signWord = (q) => (Math.abs(q) < 0.25 ? t('q.neutral') : q > 0 ? t('q.positive') : t('q.negative'));
function updateMeasures() {
  if (!shell || !ui.dl) return;
  const tab = shell.tab;
  const st = cur();
  const rows = [];
  let fb = st.fb || null;
  if (tab === 'interaction') {
    const r = interactionState(st);
    if (st.target === 'rod') rows.push([t('m.hang'), t(st.hang === 'plastic' ? 'obj.plasticFur' : 'obj.glassSilk')]);
    rows.push([t('m.hand'), t(`obj.${{ plastic: 'plasticFur', glass: 'glassSilk', fur: 'fur', silk: 'silk', neutral: 'neutral' }[st.hand]}`)]);
    if (st.show) {
      if (st.target === 'rod') rows.push([t('m.chargeHang'), signWord(ROD_Q[st.hang])]);
      rows.push([t('m.chargeHand'), signWord(handQ(st.hand))]);
    }
    rows.push([t('m.observe'), t(`obs.${r}`)]);
  } else if (tab === 'contact') {
    rows.push([t('m.rod'), t(st.rod === 'plastic' ? 'obj.plasticFur' : 'obj.glassSilk')]);
    rows.push([t('m.observe'), t(`obsC.${contactState(st)}`)]);
    if (st.show) { rows.push([t('m.chargeBall'), signWord(st.qb)]); rows.push([t('m.chargeRod'), signWord(st.qr)]); }
    rows.push([t('m.touched'), t(st.touched ? 'ctl.yes' : 'ctl.no')]);
  } else if (tab === 'electroscope' || tab === 'conductors') {
    if (tab === 'conductors') rows.push([t('m.probe'), t(`obj.${st.rod}`)]);
    rows.push([t('m.leaves'), st.a < 2.5 ? t('leaves.closed') : `${t('leaves.open')} (${num(2 * st.a, 0)}°)`]);
    if (st.show) {
      rows.push([t('m.chargeEs'), signWord(st.qe)]);
      rows.push([t('m.chargeLeaves'), signWord(leafCharge(st))]);
      rows.push([t('m.chargeRod'), signWord(st.qr)]);
    }
    if (st.finger) rows.push([t('m.finger'), t('ctl.yes')]);
  } else if (tab === 'charge') {
    const [qa, qb] = chargeNow(st);
    rows.push([t('m.qA'), `${num(qa, 2)} × 10⁻⁸ C`], [t('m.qB'), `${num(qb, 2)} × 10⁻⁸ C`]);
    rows.push([t('m.total'), `${num(qa + qb, 2)} × 10⁻⁸ C`]);
    rows.push([t('m.e'), 'e = 1.6 × 10⁻¹⁹ C'.replace('1.6', num(1.6, 1))]);
  }
  ui.dl.replaceChildren(...rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)]));
  if (!fb) ui.status.hidden = true;
  else { ui.status.hidden = false; ui.status.className = `status ${fb.type || ''}`; ui.status.textContent = t(fb.key); }
  if (tab === 'charge') buildChargeTable(st);
}

function buildChargeTable(st) {
  const sig = `${st.q1}|${st.q2}|${st.touched}|${calcSig([st])}`;
  if (sig === ui.sig) return;
  ui.sig = sig;
  const onCheck = (res) => {
    st.fb = res === 'invalid' ? { type: 'warn', key: 'calc.invalid' } : res === 'ok' ? { type: 'good', key: 'fb.ok' } : { type: 'bad', key: 'fb.wrong' };
    ui.sig = null; updateMeasures();
  };
  const qf = (st.q1 + st.q2) / 2;
  const N = Math.abs(qf) * 1e-8 / E_CHARGE / 1e10; // in units of 10¹⁰
  const th = (k) => el('th', { class: 'keep-case' }, t(k));
  const td = (s) => el('td', { class: 'keep-case' }, s);
  const tables = [];
  if (!st.touched) {
    tables.push(el('p', { class: 'muted', style: 'margin:8px 0 0;font-size:0.88rem' }, t('tbl.afterContact')));
  } else {
    tables.push(el('table', { class: 'data' }, [
      el('thead', {}, el('tr', {}, [th('col.qty'), th('col.value')])),
      el('tbody', {}, [
        el('tr', {}, [td(t('row.qEach')), calcCell(st, 'q', { expected: qf, decimals: 2, onCheck })]),
        el('tr', {}, [td(t(qf < 0 ? 'row.Nexcess' : 'row.Ndeficit')), qf === 0 ? td('0') : calcCell(st, 'N', { expected: N, decimals: 3, onCheck })]),
      ]),
    ]));
  }
  // Example 1.1 and Problem 1
  tables.push(el('h3', { style: 'margin:14px 0 0;font-size:0.95rem' }, t('tbl.more')));
  tables.push(el('table', { class: 'data' }, [
    el('thead', {}, el('tr', {}, [th('col.qty'), th('col.value')])),
    el('tbody', {}, [
      el('tr', {}, [td(t('row.ex11')), calcCell(st, 'ex11', { expected: 6.25, decimals: 2, onCheck })]),
      el('tr', {}, [td(t('row.p1')), calcCell(st, 'p1', { expected: 2.5, decimals: 1, onCheck })]),
    ]),
  ]));
  ui.tables.replaceChildren(...tables);
}

function buildTab() {
  controlsBody.replaceChildren();
  measuresBody.replaceChildren();
  ui = {};
  build();
  updateMeasures();
  loop.start();
  requestDraw();
}
onLangChange(() => { if (shell) buildTab(); });

shell = initSim({
  strings,
  tabs: TABS.map((id) => ({ id, labelKey: `tab.${id}` })),
  initialTab: 'interaction',
  onTab: buildTab,
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, get tab() { return shell.tab; }, leafCharge, induced };
