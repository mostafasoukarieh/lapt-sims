// Magnets and compasses (Grade 7 Ch.14–15): pole-charge model of a magnet, bar magnet and compass drawings.
import { cssVar, font } from './draw.js';

/* ================================================================
   Model: a bar magnet = a north "pole charge" +q at one end and −q at the other.
   Field at a point = Σ q r̂ / r² (+ the field of the Earth, towards the north = up on the drawing).
   ================================================================ */
export function poleField(poles, x, y, out) {
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
export function barPoles(x, y, a, L, q = 1, out = []) {
  const c = Math.cos(a), s = Math.sin(a), h = L / 2 - 6;
  out.push({ x: x + c * h, y: y + s * h, q }, { x: x - c * h, y: y - s * h, q: -q });
  return out;
}
// Draw a bar magnet: N half red, S half blue (as in the book). hidden: grey with no letters (unknown poles).
export function drawBar(ctx, x, y, a, L, W = 26, { hidden = false, labels = true } = {}) {
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
export function drawCompass(ctx, x, y, ang, r = 24) {
  ctx.fillStyle = cssVar('--surface'); ctx.strokeStyle = cssVar('--glass-stroke'); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.fillStyle = cssVar('--mag-n'); ctx.beginPath(); ctx.moveTo(r - 4, 0); ctx.lineTo(0, -5); ctx.lineTo(0, 5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = cssVar('--mag-s'); ctx.beginPath(); ctx.moveTo(-r + 4, 0); ctx.lineTo(0, -5); ctx.lineTo(0, 5); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.fillStyle = cssVar('--box'); ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
}
