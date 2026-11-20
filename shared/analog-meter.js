// Analog (needle) meter seen from the front: case, dial with one or two graduations,
// arc-shaped mirror, needle, scale text and the two terminals.
// Used by Sec 1 `potential-difference` (voltmeter, 100 and 30 divisions) and `electric-current` (ammeter, 100 divisions).
import { cssVar, roundRect, font } from './draw.js';

function text(ctx, s, x, y, color, size, align = 'center', weight = 800) {
  ctx.fillStyle = color; ctx.font = font(size, weight); ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(s, x, y);
}

/**
 * @param {object} o
 *   width      canvas logical width (the meter is centred)
 *   needle     deviation as a fraction of full scale (pegged outside −0.06…1.06)
 *   grads      graduations: [100] or [100, 30] (outer one first)
 *   unit       letter written on the dial ('V' or 'A')
 *   scaleText  e.g. "Scale : 30 V"
 *   divsText   e.g. "(30 divisions)"
 */
export function drawAnalogDial(ctx, { width, needle, grads = [100], unit = 'V', scaleText = '', divsText = '' }) {
  const cx = width / 2, cy = 330, R = 220;
  ctx.fillStyle = cssVar('--meter-body'); ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1.5;
  roundRect(ctx, 40, 40, width - 80, 340, 18); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fbfbf7'; roundRect(ctx, 60, 60, width - 120, 230, 10); ctx.fill();
  const a0 = -Math.PI / 2 - 0.85, a1 = -Math.PI / 2 + 0.85;
  const ang = (f) => a0 + (a1 - a0) * f;
  ctx.strokeStyle = '#222'; ctx.lineWidth = 1.2;
  grads.forEach((N, gi) => {
    const r = gi === 0 ? R : R - 26;
    const out = gi === 0 ? 1 : -1; // outer graduation: ticks outwards; inner: inwards
    const major = N === 100 ? 10 : 5, mid = N === 100 ? 5 : 0;
    ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1); ctx.stroke();
    for (let i = 0; i <= N; i++) {
      const a = ang(i / N), l = i % major === 0 ? 13 : mid && i % mid === 0 ? 9 : 5;
      ctx.beginPath(); ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a)); ctx.lineTo(cx + (r + out * l) * Math.cos(a), cy + (r + out * l) * Math.sin(a)); ctx.stroke();
      if (i % major === 0) text(ctx, String(i), cx + (r + out * 25) * Math.cos(a), cy + (r + out * 25) * Math.sin(a), '#222', gi === 0 ? 12 : 11, 'center', 700);
    }
  });
  // arc-shaped mirror: the reading is right when the needle hides its image
  ctx.strokeStyle = 'rgba(150,170,190,0.9)'; ctx.lineWidth = 7;
  ctx.beginPath(); ctx.arc(cx, cy, R - 12, a0, a1); ctx.stroke();
  text(ctx, unit, cx, 245, '#222', 26);
  const f = Math.max(-0.06, Math.min(1.06, needle));
  const a = ang(f);
  ctx.strokeStyle = '#111'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx + 40 * Math.cos(a), cy + 40 * Math.sin(a)); ctx.lineTo(cx + (R + 8) * Math.cos(a), cy + (R + 8) * Math.sin(a)); ctx.stroke();
  ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(cx, cy, 9, 0, Math.PI * 2); ctx.fill();
  const on = cssVar('--text-on-meter');
  text(ctx, scaleText, 120, 320, on, 15, 'left');
  if (divsText) text(ctx, divsText, 120, 344, on, 13, 'left', 700);
  ctx.fillStyle = '#1d1f24'; ctx.beginPath(); ctx.arc(width - 180, 330, 11, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = cssVar('--accent'); ctx.beginPath(); ctx.arc(width - 120, 330, 11, 0, Math.PI * 2); ctx.fill();
  text(ctx, '−', width - 180, 306, on, 18); text(ctx, '+', width - 120, 306, on, 18);
  return { minus: [width - 180, 330], plus: [width - 120, 330], overload: needle > 1.02, reversed: needle < -0.02 };
}
