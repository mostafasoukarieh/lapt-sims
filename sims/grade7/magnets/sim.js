// Grade 7 — Magnets (Ch.14 Act. 1–9, Ex. 4–10) — not required in 2026–2027
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { createButton, createSegmented, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, font, arrow } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { label } from '../../../shared/figures.js';
import { rng } from '../../../shared/particles.js';

const SCENE = { w: 600, h: 440 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ================================================================
   Model: a bar magnet = a north "pole charge" +q at one end and −q at the other.
   Field at a point = Σ q r̂ / r² (+ the field of the Earth, towards the north = up on the drawing).
   ================================================================ */
function poleField(poles, x, y, out) {
  let bx = 0, by = 0;
  for (const p of poles) {
    const dx = x - p.x, dy = y - p.y, r2 = dx * dx + dy * dy + 60;
    const k = p.q / (r2 * Math.sqrt(r2));
    bx += k * dx; by += k * dy;
  }
  out.bx = bx; out.by = by;
  return out;
}
// Bar magnet centred at (x, y), angle a (0: N on the right), length L → its two poles
function barPoles(x, y, a, L, q = 1, out = []) {
  const c = Math.cos(a), s = Math.sin(a), h = L / 2 - 6;
  out.push({ x: x + c * h, y: y + s * h, q }, { x: x - c * h, y: y - s * h, q: -q });
  return out;
}
// Draw a bar magnet: N half red, S half blue (as in the book). hidden: grey with no letters (unknown poles).
function drawBar(ctx, x, y, a, L, W = 26, { hidden = false, labels = true } = {}) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  ctx.fillStyle = hidden ? cssVar('--metal') : cssVar('--mag-s');
  ctx.fillRect(-L / 2, -W / 2, L / 2, W);
  ctx.fillStyle = hidden ? cssVar('--metal') : cssVar('--mag-n');
  ctx.fillRect(0, -W / 2, L / 2, W);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.2; ctx.strokeRect(-L / 2, -W / 2, L, W);
  if (hidden) { ctx.beginPath(); ctx.moveTo(0, -W / 2); ctx.lineTo(0, W / 2); ctx.stroke(); }
  if (labels && !hidden) {
    ctx.fillStyle = '#ffffff'; ctx.font = font(Math.min(16, W * 0.6), 800); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.save(); ctx.translate(L / 2 - 12, 0); ctx.rotate(-a); ctx.fillText('N', 0, 1); ctx.restore();
    ctx.save(); ctx.translate(-L / 2 + 12, 0); ctx.rotate(-a); ctx.fillText('S', 0, 1); ctx.restore();
  }
  ctx.restore();
}
function drawCompass(ctx, x, y, ang, r = 24) {
  ctx.fillStyle = cssVar('--surface'); ctx.strokeStyle = cssVar('--glass-stroke'); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.fillStyle = cssVar('--mag-n'); ctx.beginPath(); ctx.moveTo(r - 4, 0); ctx.lineTo(0, -5); ctx.lineTo(0, 5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = cssVar('--mag-s'); ctx.beginPath(); ctx.moveTo(-r + 4, 0); ctx.lineTo(0, -5); ctx.lineTo(0, 5); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.fillStyle = cssVar('--box'); ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
}
function northArrow(ctx, x, y) {
  ctx.strokeStyle = cssVar('--text'); ctx.fillStyle = cssVar('--text'); ctx.lineWidth = 2;
  arrow(ctx, x, y + 30, x, y - 10, 9);
  label(ctx, t('lbl.north'), x, y - 22, { size: 12, weight: 800 });
}

/* ================================================================
   State
   ================================================================ */
// Book Act. 2 and Ex. 9 (+ cobalt, owner's decision): name → magnetic?
const OBJECTS = [
  ['nail', true], ['ring', false], ['ruler', false], ['compassTool', true], ['sharpener', false], ['coin', true],
  ['key', true], ['marble', false], ['thread', false], ['wood', false], ['cup', false], ['cobalt', true],
];
function initialState() {
  return {
    subs: { exp: 'objects', mx: 300, my: 120, objs: OBJECTS.map(([id, mag], i) => ({ id, mag, x: 105 + (i % 4) * 130, y: 250 + Math.floor(i / 4) * 66, stuck: false, dx: 0, tested: false, attracted: false })), dust: null },
    poles: { exp: 'filings', dipped: 0, lift: 0, ang: 0.9, w: 0, drag: false },
    inter: { x1: 200, v1: 0, x2: 430, flip1: false, flip2: false, unknown: false, hiddenFlip: Math.random() < 0.5, answer: null, fb: null },
    comp: { pieces: 'whole', magnet: true, mx: 300, my: 230, ma: 0, comps: [[120, 120], [300, 120], [480, 120], [120, 340], [300, 340], [480, 340]].map(([x, y]) => ({ x, y, a: -Math.PI / 2, w: 0 })) },
    mag: { nail: 'steel', contact: false, rem: 0, rub: 0, rubbing: 0, fb: null },
  };
}
let S = initialState();

/* ================================================================
   Canvas
   ================================================================ */
let shell;
const canvas = document.getElementById('stage');
const view = setupCanvas(canvas, { width: SCENE.w, height: SCENE.h, maxHeightVh: () => (window.innerWidth < 880 ? 52 : 76), onResize: () => draw() });
onThemeChange(() => draw());
let clock = 0;
const tmp = { bx: 0, by: 0 };

function draw() {
  if (!shell) return;
  const ctx = view.begin();
  ctx.fillStyle = cssVar('--board'); roundRect(ctx, 6, 6, SCENE.w - 12, SCENE.h - 12, 14); ctx.fill();
  ({ subs: drawSubs, poles: drawPoles, inter: drawInter, comp: drawComp, mag: drawMag })[shell.tab](ctx);
}

/* ---------- Tab 1: magnetic substances (Act. 1–2, Ex. 8–9) ---------- */
const MAG_L = 150;
function objShape(ctx, o) {
  const { x, y } = o;
  ctx.save(); ctx.translate(x, y);
  const metal = cssVar('--metal');
  switch (o.id) {
    case 'nail': ctx.fillStyle = metal; ctx.fillRect(-22, -2, 40, 4); ctx.fillRect(-24, -6, 4, 12); break;
    case 'ring': ctx.strokeStyle = cssVar('--silver'); ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.stroke(); break;
    case 'ruler': ctx.fillStyle = 'rgba(90,160,230,0.7)'; ctx.fillRect(-28, -5, 56, 10); break;
    case 'compassTool': ctx.strokeStyle = metal; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-12, 12); ctx.lineTo(0, -12); ctx.lineTo(12, 12); ctx.stroke(); break;
    case 'sharpener': ctx.fillStyle = cssVar('--alu'); ctx.fillRect(-10, -7, 20, 14); break;
    case 'coin': ctx.fillStyle = cssVar('--silver'); ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = cssVar('--muted'); ctx.font = font(8, 800); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('500', 0, 0); break;
    case 'key': ctx.fillStyle = metal; ctx.beginPath(); ctx.arc(-12, 0, 7, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(-6, -2, 24, 4); ctx.fillRect(12, 0, 3, 6); break;
    case 'marble': ctx.fillStyle = 'rgba(80,170,200,0.7)'; ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill(); break;
    case 'thread': ctx.strokeStyle = cssVar('--paper'); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-20, 0); ctx.bezierCurveTo(-8, -10, 8, 10, 20, 0); ctx.stroke(); break;
    case 'wood': ctx.fillStyle = cssVar('--wood'); ctx.fillRect(-28, -5, 56, 10); break;
    case 'cup': ctx.fillStyle = cssVar('--ball'); ctx.strokeStyle = cssVar('--glass-stroke'); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-12, -10); ctx.lineTo(12, -10); ctx.lineTo(9, 10); ctx.lineTo(-9, 10); ctx.closePath(); ctx.fill(); ctx.stroke(); break;
    case 'cobalt': ctx.fillStyle = '#6f7f9a'; ctx.beginPath(); ctx.moveTo(-10, 6); ctx.lineTo(-6, -8); ctx.lineTo(8, -6); ctx.lineTo(11, 7); ctx.closePath(); ctx.fill(); break;
    default: break;
  }
  ctx.restore();
}
function drawSubs(ctx) {
  const st = S.subs;
  if (st.exp === 'objects') {
    for (const o of st.objs) {
      if (!o.stuck) label(ctx, t(`obj.${o.id}`), o.x, o.y + 22, { size: 11, weight: 700, color: o.tested ? (o.attracted ? cssVar('--good') : cssVar('--muted')) : cssVar('--text') });
      objShape(ctx, o);
    }
  } else {
    // tray of sand mixed with iron powder (Ex. 8)
    ctx.fillStyle = cssVar('--sand'); roundRect(ctx, 150, 300, 300, 90, 10); ctx.fill();
    ctx.fillStyle = cssVar('--soot');
    for (const d of st.dust) { if (!d.stuck) ctx.fillRect(d.x, d.y, 2, 2); }
    label(ctx, t('lbl.mixture'), 300, 410, { size: 12, weight: 700 });
  }
  drawBar(ctx, st.mx, st.my, 0, MAG_L, 30);
  if (st.exp === 'mixture') { ctx.fillStyle = cssVar('--soot'); for (const d of st.dust) if (d.stuck) ctx.fillRect(st.mx + d.dx, st.my + 15 + d.dy, 2, 2); }
  label(ctx, t('lbl.dragMagnet'), 300, 30, { size: 12, color: cssVar('--muted') });
}
function makeDust() {
  const r = rng(5);
  return Array.from({ length: 260 }, () => ({ x: 158 + r() * 284, y: 306 + r() * 78, stuck: false, dx: 0, dy: 0 }));
}
function stepSubs(dt) {
  const st = S.subs;
  if (st.exp === 'objects') {
    for (const o of st.objs) {
      if (o.stuck) { o.x = st.mx + o.dx; o.y = st.my + 24; continue; }
      const nearX = clamp(o.x, st.mx - MAG_L / 2, st.mx + MAG_L / 2);
      const d = Math.hypot(o.x - nearX, o.y - (st.my + 15));
      if (d < 70) {
        o.tested = true;
        if (o.mag) { o.attracted = true; o.stuck = true; o.dx = clamp(o.x - st.mx, -MAG_L / 2 + 14, MAG_L / 2 - 14); }
      }
    }
  } else {
    for (const d of st.dust) {
      if (d.stuck) continue;
      if (Math.abs(d.x - st.mx) < MAG_L / 2 && d.y - (st.my + 15) < 50 && d.y > st.my) { d.stuck = true; d.dx = d.x - st.mx; d.dy = Math.random() * 6; }
    }
  }
}

/* ---------- Tab 2: poles (Act. 3–4) ---------- */
const FIL = (() => { const r = rng(11); return Array.from({ length: 260 }, () => ({ u: r(), v: r(), a: r() * Math.PI, w: r() })); })();
function drawPoles(ctx) {
  const st = S.poles;
  if (st.exp === 'filings') {
    ctx.fillStyle = cssVar('--surface-2'); roundRect(ctx, 120, 300, 360, 90, 10); ctx.fill();
    ctx.strokeStyle = cssVar('--soot'); ctx.lineWidth = 1.2;
    for (const f of FIL) { const x = 130 + f.u * 340, y = 312 + f.v * 70; ctx.beginPath(); ctx.moveTo(x - 3 * Math.cos(f.a), y - 3 * Math.sin(f.a)); ctx.lineTo(x + 3 * Math.cos(f.a), y + 3 * Math.sin(f.a)); ctx.stroke(); }
    label(ctx, t('lbl.filings'), 300, 410, { size: 12, weight: 700 });
    const y = 150 + (1 - st.lift) * 170, L = 220;
    drawBar(ctx, 300, y, 0, L, 34);
    // filings collected: many at the poles, almost none in the middle
    if (st.dipped) {
      // tufts of filings: thick at the two ends (poles), almost nothing in the middle
      ctx.strokeStyle = cssVar('--soot'); ctx.lineWidth = 1.3;
      FIL.forEach((f, i) => {
        const end = i % 2 ? 1 : -1;
        const along = Math.pow(f.u, 2.6) * 0.9; // 0 = at the end, 0.9 = near the middle
        const h = 4 + 20 * Math.pow(1 - along, 3); // tuft height
        let x, yy, ang;
        if (f.w < 0.18) { // on the end face, pointing outwards
          x = 300 + end * (L / 2 + f.a / Math.PI * 14); yy = y + (f.v - 0.5) * 36; ang = (f.v - 0.5) * 1.2;
        } else {
          const side = f.v < 0.5 ? -1 : 1;
          x = 300 + end * (L / 2 - along * L / 2) + end * (f.a / Math.PI) * h * 0.4;
          yy = y + side * (17 + (f.a / Math.PI) * h);
          ang = side * (Math.PI / 2 - end * 0.5 * (1 - along));
        }
        ctx.beginPath(); ctx.moveTo(x - 3.5 * Math.cos(ang), yy - 3.5 * Math.sin(ang)); ctx.lineTo(x + 3.5 * Math.cos(ang), yy + 3.5 * Math.sin(ang)); ctx.stroke();
      });
    }
  } else {
    // magnet hanging by strings, seen from above, free to rotate in the horizontal plane
    const cx = 300, cy = 220;
    ctx.strokeStyle = cssVar('--border'); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, 150, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = cssVar('--muted'); ctx.font = font(13, 800); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    [['dir.N', 0, -165], ['dir.S', 0, 165], ['dir.E', 165, 0], ['dir.W', -165, 0]].forEach(([k, dx, dy]) => ctx.fillText(t(k), cx + dx, cy + dy));
    drawBar(ctx, cx, cy, st.ang, 220, 30);
    ctx.fillStyle = cssVar('--thread'); ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();
    label(ctx, t('lbl.dragRotate'), cx, 420, { size: 11, color: cssVar('--muted') });
    northArrow(ctx, 525, 70);
  }
}
function stepPoles(dt) {
  const st = S.poles;
  if (st.exp === 'filings') {
    if (st.dipped === 1 && st.lift < 1) st.lift = Math.min(1, st.lift + dt * 1.2);
  } else if (!st.drag) {
    // torque of the Earth's field: the N pole turns towards the north (angle −π/2), with damping
    const target = -Math.PI / 2;
    let d = ((st.ang - target + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    st.w += (-6 * Math.sin(d) - 2.2 * st.w) * dt;
    st.ang += st.w * dt;
  }
}

/* ---------- Tab 3: interaction between poles (Act. 5, Ex. 6, 10) ---------- */
const BAR = 170, CART_Y = 250;
function interPoles(st) {
  const p = [];
  barPoles(st.x1, CART_Y, st.flip1 ? Math.PI : 0, BAR, 1, p);
  const f2 = st.unknown ? st.hiddenFlip : st.flip2;
  barPoles(st.x2, CART_Y, f2 ? Math.PI : 0, BAR, 1, p);
  return p;
}
function forceOn1(st) {
  const p = interPoles(st);
  let F = 0;
  for (const a of p.slice(0, 2)) for (const b of p.slice(2)) { const dx = a.x - b.x; F += (a.q * b.q * Math.sign(dx)) / (dx * dx + 30); }
  return F;
}
function drawInter(ctx) {
  const st = S.inter;
  ctx.fillStyle = cssVar('--wood'); ctx.fillRect(20, CART_Y + 30, 560, 10); // table
  // magnet 1 on a small cart (rolls freely)
  ctx.fillStyle = cssVar('--box'); roundRect(ctx, st.x1 - BAR / 2 + 10, CART_Y + 14, BAR - 20, 8, 3); ctx.fill();
  for (const dx of [-BAR / 2 + 24, BAR / 2 - 24]) { ctx.beginPath(); ctx.arc(st.x1 + dx, CART_Y + 24, 6, 0, Math.PI * 2); ctx.fill(); }
  drawBar(ctx, st.x1, CART_Y, st.flip1 ? Math.PI : 0, BAR, 28);
  label(ctx, t('lbl.magnet1'), st.x1, CART_Y - 34, { size: 12, weight: 800 });
  // magnet 2 held in the hand (drag it)
  drawBar(ctx, st.x2, CART_Y - 2, (st.unknown ? st.hiddenFlip : st.flip2) ? Math.PI : 0, BAR, 28, { hidden: st.unknown });
  ctx.fillStyle = cssVar('--skin'); ctx.beginPath(); ctx.ellipse(st.x2 + 20, CART_Y - 26, 30, 14, 0, 0, Math.PI * 2); ctx.fill();
  label(ctx, st.unknown ? t('lbl.unknown') : t('lbl.magnet2'), st.x2, CART_Y - 54, { size: 12, weight: 800 });
  if (st.unknown) { label(ctx, 'A', st.x2 - BAR / 2 + 12, CART_Y + 26, { size: 13, weight: 800 }); label(ctx, 'B', st.x2 + BAR / 2 - 12, CART_Y + 26, { size: 13, weight: 800 }); }
  const F = forceOn1(st);
  const gap = (st.x2 - BAR / 2) - (st.x1 + BAR / 2);
  if (gap < 120 && Math.abs(F) > 0.0004) {
    const attract = F > 0; // force on magnet 1 towards magnet 2 (to the right)
    label(ctx, t(attract ? 'lbl.attract' : 'lbl.repel'), (st.x1 + st.x2) / 2, CART_Y - 90, { size: 16, weight: 800, color: attract ? cssVar('--good') : cssVar('--bad') });
  }
  label(ctx, t('lbl.dragMagnet2'), 300, 410, { size: 11, color: cssVar('--muted') });
}
function stepInter(dt) {
  const st = S.inter;
  const F = forceOn1(st);
  const gap = (st.x2 - BAR / 2) - (st.x1 + BAR / 2);
  const a = Math.abs(F) > 0.0008 ? F * 9e5 : 0; // static friction below a small force
  st.v1 = (st.v1 + a * dt) * Math.exp(-dt * 3);
  st.x1 += st.v1 * dt;
  if (st.x1 + BAR / 2 > st.x2 - BAR / 2) { st.x1 = st.x2 - BAR; st.v1 = 0; } // stuck together
  st.x1 = clamp(st.x1, BAR / 2 + 20, 580 - BAR / 2);
  if (st.x1 <= BAR / 2 + 20) st.v1 = 0;
  void gap;
}

/* ---------- Tab 4: compasses, broken magnet, Earth (Act. 6, 9, Ex. 7) ---------- */
const EARTH = 0.00004; // field of the Earth, towards the north (up)
function compPoles(st) {
  const p = [];
  if (!st.magnet) return p;
  const n = st.pieces === 'whole' ? 1 : st.pieces === 'two' ? 2 : 4;
  const L = 240 / n, gap = n > 1 ? 36 : 0;
  const total = n * L + (n - 1) * gap;
  for (let k = 0; k < n; k++) {
    const off = -total / 2 + L / 2 + k * (L + gap);
    barPoles(st.mx + Math.cos(st.ma) * off, st.my + Math.sin(st.ma) * off, st.ma, L, 1.4, p);
  }
  return p;
}
function drawComp(ctx) {
  const st = S.comp;
  if (st.magnet) {
    const n = st.pieces === 'whole' ? 1 : st.pieces === 'two' ? 2 : 4;
    const L = 240 / n, gap = n > 1 ? 36 : 0, total = n * L + (n - 1) * gap;
    for (let k = 0; k < n; k++) { const off = -total / 2 + L / 2 + k * (L + gap); drawBar(ctx, st.mx + Math.cos(st.ma) * off, st.my + Math.sin(st.ma) * off, st.ma, L - 4, 24, { labels: true }); }
  }
  for (const c of st.comps) drawCompass(ctx, c.x, c.y, c.a);
  northArrow(ctx, 525, 60);
  label(ctx, t(st.magnet ? 'lbl.dragAll' : 'lbl.dragComp'), 300, 425, { size: 11, color: cssVar('--muted') });
}
function stepComp(dt) {
  const st = S.comp;
  const p = compPoles(st);
  for (const c of st.comps) {
    poleField(p, c.x, c.y, tmp);
    const bx = tmp.bx, by = tmp.by - EARTH;
    const target = Math.atan2(by, bx);
    const d = Math.atan2(Math.sin(c.a - target), Math.cos(c.a - target));
    c.w += (-30 * Math.sin(d) - 5 * c.w) * dt;
    c.a += c.w * dt;
  }
}

/* ---------- Tab 5: magnetization (Act. 7–8, Ex. 5) ---------- */
const NAIL = { x: 300, y: 200, L: 180 };
function nailM(st) { return st.contact ? 1 : st.rem; }
function drawMag(ctx) {
  const st = S.mag;
  // pile of pins under the nail
  ctx.strokeStyle = cssVar('--metal'); ctx.lineWidth = 1.4;
  for (let i = 0; i < 40; i++) { const x = 220 + ((i * 37) % 160), y = 380 + ((i * 13) % 30); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 14 * Math.cos(i), y + 14 * Math.sin(i) * 0.3); ctx.stroke(); }
  label(ctx, t('lbl.pins'), 300, 425, { size: 11, weight: 700 });
  // nail (horizontal) and the pins it holds
  const m = nailM(st);
  const n = Math.round(10 * m);
  ctx.strokeStyle = cssVar('--metal'); ctx.lineWidth = 1.4;
  for (let i = 0; i < n; i++) { const x = NAIL.x - NAIL.L / 2 + 10 + (i % 5) * 8, y = NAIL.y + 6 + Math.floor(i / 5) * 14; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 2, y + 14); ctx.stroke(); }
  ctx.fillStyle = st.nail === 'steel' ? cssVar('--metal') : cssVar('--silver');
  ctx.fillRect(NAIL.x - NAIL.L / 2, NAIL.y - 4, NAIL.L, 8);
  ctx.fillRect(NAIL.x + NAIL.L / 2 - 4, NAIL.y - 10, 8, 20);
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1; ctx.strokeRect(NAIL.x - NAIL.L / 2, NAIL.y - 4, NAIL.L, 8);
  label(ctx, t(`nail.${st.nail}`), NAIL.x, NAIL.y - 24, { size: 12, weight: 800 });
  // magnet: in contact with the head of the nail, rubbing along it, or away
  let mx = 520, my = 110, a = Math.PI / 2;
  if (st.contact) { mx = NAIL.x + NAIL.L / 2 + 4 + 75; my = NAIL.y; a = Math.PI; }
  if (st.rubbing > 0) { const u = (st.rubbing % 1); mx = NAIL.x - NAIL.L / 2 + u * NAIL.L; my = NAIL.y - 80 + Math.abs(Math.sin(u * Math.PI)) * 0; a = Math.PI / 2; my = NAIL.y - 76; }
  drawBar(ctx, mx, my, a, 150, 30);
  if (st.rubbing > 0) label(ctx, t('lbl.rubbing', { n: Math.min(10, Math.floor(st.rubbing) + 1) }), 300, 40, { size: 13, weight: 800 });
}
function stepMag(dt) {
  const st = S.mag;
  if (st.rubbing > 0) {
    st.rubbing += dt * 2.5;
    if (st.rubbing >= 10) { st.rubbing = 0; if (st.nail === 'steel') st.rem = Math.max(st.rem, 0.8); st.fb = { type: 'good', key: st.nail === 'steel' ? 'fb.rubSteel' : 'fb.rubIron' }; }
  }
}

/* ================================================================
   Loop and pointer
   ================================================================ */
let measT = 0;
const loop = createLoop({
  dt: 1 / 60,
  step: (dt) => {
    clock += dt;
    if (!shell) return true;
    ({ subs: stepSubs, poles: stepPoles, inter: stepInter, comp: stepComp, mag: stepMag })[shell.tab](dt);
    measT += dt;
    return true;
  },
  render: () => { draw(); if (measT > 0.15) { measT = 0; updateMeasures(); } },
});

let drag = null;
canvas.addEventListener('pointerdown', (ev) => {
  const p = view.toLogical(ev), tab = shell.tab;
  if (tab === 'subs') { const st = S.subs; if (Math.abs(p.x - st.mx) < MAG_L / 2 + 10 && Math.abs(p.y - st.my) < 40) drag = { k: 'subs', dx: st.mx - p.x, dy: st.my - p.y }; }
  else if (tab === 'poles' && S.poles.exp === 'hang') { S.poles.drag = true; drag = { k: 'hang' }; }
  else if (tab === 'inter') { const st = S.inter; if (Math.abs(p.x - st.x2) < BAR / 2 + 10 && Math.abs(p.y - CART_Y) < 60) drag = { k: 'inter', dx: st.x2 - p.x }; }
  else if (tab === 'comp') {
    const st = S.comp;
    const c = st.comps.find((cc) => Math.hypot(cc.x - p.x, cc.y - p.y) < 30);
    if (c) drag = { k: 'compass', c, dx: c.x - p.x, dy: c.y - p.y };
    else if (st.magnet && Math.hypot(st.mx - p.x, st.my - p.y) < 140 && Math.abs((p.x - st.mx) * Math.sin(st.ma) - (p.y - st.my) * Math.cos(st.ma)) < 30) drag = { k: 'cmag', dx: st.mx - p.x, dy: st.my - p.y };
  }
  if (drag) { canvas.setPointerCapture(ev.pointerId); ev.preventDefault(); }
});
canvas.addEventListener('pointermove', (ev) => {
  if (!drag) return;
  const p = view.toLogical(ev);
  if (drag.k === 'subs') { S.subs.mx = clamp(p.x + drag.dx, 80, 520); S.subs.my = clamp(p.y + drag.dy, 60, 340); }
  else if (drag.k === 'hang') { S.poles.ang = Math.atan2(p.y - 220, p.x - 300); S.poles.w = 0; }
  else if (drag.k === 'inter') { const st = S.inter; st.x2 = clamp(p.x + drag.dx, st.x1 + BAR, 580 - BAR / 2); }
  else if (drag.k === 'compass') { drag.c.x = clamp(p.x + drag.dx, 30, 570); drag.c.y = clamp(p.y + drag.dy, 30, 410); }
  else if (drag.k === 'cmag') { S.comp.mx = clamp(p.x + drag.dx, 60, 540); S.comp.my = clamp(p.y + drag.dy, 40, 400); }
});
const endDrag = () => { if (drag?.k === 'hang') S.poles.drag = false; drag = null; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

/* ================================================================
   Panels
   ================================================================ */
const controlsBody = document.getElementById('controls-body');
const measuresBody = document.getElementById('measures-body');
let ui = {};
function showStatus(fb) {
  if (!ui.status) return;
  if (!fb) { ui.status.hidden = true; return; }
  ui.status.hidden = false; ui.status.className = `status ${fb.type || ''}`; ui.status.textContent = t(fb.key, fb.params);
}
function measRows(rows) {
  const sig = JSON.stringify(rows);
  if (ui.dlSig === sig) return;
  ui.dlSig = sig;
  ui.dl.replaceChildren(...rows.flatMap(([k, v, cls]) => [el('dt', {}, k), el('dd', cls ? { class: cls } : {}, v)]));
}
function panel(controls, extra = []) {
  controlsBody.append(...controls.map((c) => c.root ?? c));
  ui.dl = el('dl', { class: 'meas' });
  ui.status = el('div', { class: 'status', hidden: '' });
  measuresBody.append(ui.dl, ...extra, ui.status);
}
const seg = (labelKey, values, prefix, value, onChange) => createSegmented({ labelKey, options: values.map((v) => ({ value: v, labelKey: `${prefix}.${v}` })), value, onChange });
const btn = (k, f, v) => createButton({ labelKey: k, onClick: f, variant: v });
const row = (...c) => el('div', { class: 'btn-row' }, c);
const resetBtn = (id) => btn('ui.reset', () => { const f = initialState(); if (f[id].exp) f[id].exp = S[id].exp; S[id] = f[id]; if (id === 'subs' && S.subs.exp === 'mixture') S.subs.dust = makeDust(); buildTab(id); }, 'ghost');

function buildSubs() {
  const st = S.subs;
  ui.table = el('table', { class: 'data' });
  panel([seg('ctl.exp', ['objects', 'mixture'], 'expS', st.exp, (v) => { st.exp = v; st.mx = 300; st.my = 120; if (v === 'mixture' && !st.dust) st.dust = makeDust(); shell.refreshActivity(); buildTab('subs'); }), row(resetBtn('subs'))], st.exp === 'objects' ? [ui.table] : []);
}
function updateSubs() {
  const st = S.subs;
  if (st.exp === 'objects') {
    const tested = st.objs.filter((o) => o.tested);
    measRows([[t('m.tested'), `${tested.length} / ${st.objs.length}`]]);
    const sig = tested.map((o) => o.id + o.attracted).join() + t('m.objCol');
    if (ui.tableSig !== sig) {
      ui.tableSig = sig;
      ui.table.replaceChildren(el('thead', {}, el('tr', {}, [el('th', {}, t('m.objCol')), el('th', {}, t('m.attrCol'))])),
        el('tbody', {}, tested.map((o) => el('tr', {}, [el('td', {}, t(`obj.${o.id}`)), el('td', { class: o.attracted ? 'good-text' : '' }, t(o.attracted ? 'opt.yes' : 'opt.no'))]))));
    }
    ui.table.hidden = !tested.length;
  } else {
    const got = st.dust.filter((d) => d.stuck).length;
    measRows([[t('m.dust'), `${Math.round((100 * got) / st.dust.length)} %`]]);
  }
  showStatus(null);
}

function buildPoles() {
  const st = S.poles;
  const ctl = [seg('ctl.exp', ['filings', 'hang'], 'expP', st.exp, (v) => { st.exp = v; shell.refreshActivity(); buildTab('poles'); })];
  if (st.exp === 'filings') ctl.push(row(btn('ctl.dip', () => { st.dipped = 1; st.lift = 0; }, 'primary'), btn('ctl.clean', () => { st.dipped = 0; st.lift = 0; })));
  else ctl.push(row(btn('ctl.turn', () => { st.ang = Math.random() * 6.28; st.w = 3; }, 'primary')));
  ctl.push(row(resetBtn('poles')));
  panel(ctl);
}
function updatePoles() {
  const st = S.poles;
  if (st.exp === 'filings') measRows([[t('m.filings'), t(st.dipped ? 'fil.ends' : 'fil.none')]]);
  else {
    const deg = ((((st.ang + Math.PI / 2) * 180) / Math.PI) % 360 + 360) % 360;
    const towardsN = Math.min(deg, 360 - deg) < 8 && Math.abs(st.w) < 0.3;
    measRows([[t('m.npoint'), t(towardsN ? 'np.north' : 'np.moving'), towardsN ? 'good-text' : '']]);
  }
  showStatus(null);
}

function buildInter() {
  const st = S.inter;
  const ctl = [
    seg('ctl.m2', ['known', 'unknown'], 'm2', st.unknown ? 'unknown' : 'known', (v) => { st.unknown = v === 'unknown'; st.hiddenFlip = Math.random() < 0.5; st.answer = null; st.fb = null; buildTab('inter'); }),
    row(btn('ctl.flip1', () => { st.flip1 = !st.flip1; }), st.unknown ? null : btn('ctl.flip2', () => { st.flip2 = !st.flip2; })),
  ];
  if (st.unknown) {
    ctl.push(seg('ctl.endA', ['N', 'S'], 'pole', st.answer, (v) => { st.answer = v; }));
    ctl.push(row(btn('ctl.checkPole', () => { if (!st.answer) { st.fb = { type: 'warn', key: 'fb.choose' }; } else { const aIsN = st.hiddenFlip; st.fb = (st.answer === 'N') === aIsN ? { type: 'good', key: 'fb.poleOk' } : { type: 'bad', key: 'fb.poleWrong' }; } updateMeasures(); }, 'primary'), btn('ctl.newUnknown', () => { st.hiddenFlip = Math.random() < 0.5; st.answer = null; st.fb = null; buildTab('inter'); })));
  }
  ctl.push(row(resetBtn('inter')));
  panel(ctl);
}
function updateInter() {
  const st = S.inter;
  const facing1 = st.flip1 ? 'S' : 'N'; // pole of magnet 1 on its right (facing magnet 2)
  const facing2 = st.unknown ? 'A' : (st.flip2 ? 'N' : 'S');
  const F = forceOn1(st);
  const gap = (st.x2 - BAR / 2) - (st.x1 + BAR / 2);
  measRows([
    [t('m.facing'), `${t(`pole.${facing1}`)} — ${st.unknown ? 'A' : t(`pole.${facing2}`)}`],
    [t('m.action'), gap > 120 ? t('ia.far') : t(F > 0 ? 'ia.attract' : 'ia.repel'), gap > 120 ? '' : F > 0 ? 'good-text' : 'bad-text'],
  ]);
  showStatus(st.fb);
}

function buildComp() {
  const st = S.comp;
  panel([
    seg('ctl.magnet', ['none', 'whole', 'two', 'four'], 'pieces', st.magnet ? st.pieces : 'none', (v) => { if (v === 'none') st.magnet = false; else { st.magnet = true; st.pieces = v; } }),
    row(btn('ctl.rotate', () => { st.ma = (st.ma + Math.PI / 2) % (2 * Math.PI); }), resetBtn('comp')),
  ]);
}
function updateComp() {
  const st = S.comp;
  const n = !st.magnet ? 0 : st.pieces === 'whole' ? 1 : st.pieces === 'two' ? 2 : 4;
  measRows([[t('m.pieces'), String(n)], [t('m.poles'), String(2 * n)]]);
  showStatus(null);
}

function buildMag() {
  const st = S.mag;
  panel([
    seg('ctl.nail', ['steel', 'iron'], 'nail', st.nail, (v) => { S.mag = { ...initialState().mag, nail: v }; buildTab('mag'); }),
    row(btn('ctl.contact', () => { st.contact = true; st.rubbing = 0; if (st.nail === 'steel') st.rem = Math.max(st.rem, 0.6); st.fb = null; }, 'primary'), btn('ctl.separate', () => { st.contact = false; st.fb = st.rem > 0 ? { type: 'good', key: 'fb.keeps' } : { type: 'warn', key: 'fb.loses' }; })),
    row(btn('ctl.rub', () => { st.contact = false; st.rubbing = 0.001; st.fb = null; }), resetBtn('mag')),
  ]);
}
function updateMag() {
  const st = S.mag;
  const n = Math.round(10 * nailM(st));
  measRows([[t('m.nail'), t(`nail.${st.nail}`)], [t('m.contact'), t(st.contact ? 'opt.yes' : 'opt.no')], [t('m.pinsHeld'), String(n)], [t('m.magnet'), t(n > 0 ? (st.contact ? 'mz.while' : 'mz.perm') : 'mz.none')]]);
  showStatus(st.fb);
}

function buildTab(id) {
  controlsBody.replaceChildren(); measuresBody.replaceChildren(); ui = {};
  ({ subs: buildSubs, poles: buildPoles, inter: buildInter, comp: buildComp, mag: buildMag })[id]();
  updateMeasures(); draw();
}
function updateMeasures() {
  if (!shell || !ui.dl) return;
  ({ subs: updateSubs, poles: updatePoles, inter: updateInter, comp: updateComp, mag: updateMag })[shell.tab]();
}
onLangChange(() => { if (shell) buildTab(shell.tab); });

shell = initSim({
  strings,
  notRequired: true, // Ch.14 is not in the CRDP 2026–2027 list (curriculum-scope.md)
  tabs: [
    { id: 'subs', labelKey: 'tab.subs' },
    { id: 'poles', labelKey: 'tab.poles' },
    { id: 'inter', labelKey: 'tab.inter' },
    { id: 'comp', labelKey: 'tab.comp' },
    { id: 'mag', labelKey: 'tab.mag' },
  ],
  initialTab: 'subs',
  onTab: buildTab,
  activityKey: (tab) => (S[tab].exp ? `act.${tab}.${S[tab].exp}` : `act.${tab}`),
});
shell.start();
loop.start();
if (DEBUG) window.__sim = { S, forceOn1 };
