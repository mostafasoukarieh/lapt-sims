// Recording of an air table drawn as a paper strip (dots M0, M1, …), a ruler in millimetres,
// and the dots of a puck sliding on an incline. The table itself is drawn by air-table.js.
// Used by Sec 1 `motion-description` (later `rectilinear-motion`, `newton-laws`).
import { cssVar, roundRect, font } from './draw.js';

// Positions (m) of the puck on an incline: release from rest at t = −t0, dots every tau.
// Returns the abscissas (mm, rounded to 0.5 mm) of the dots measured from the first one.
export function inclineDots({ a, tau, t0 = 0.11, maxMm = 68, minDots = 5, maxDots = 12 }) {
  const out = [];
  const x0 = 0.5 * a * t0 * t0;
  for (let n = 0; n < maxDots; n++) {
    const t = t0 + n * tau;
    const mm = Math.round((0.5 * a * t * t - x0) * 2000) / 2;
    if (mm > maxMm && out.length >= minDots) break;
    out.push(mm);
  }
  return out;
}

// Recording strip (white paper) with the dots M0, M1, … and their labels.
export function drawRecording(ctx, { x, y, w, dots, k, x0 = 20, name = 'M', highlight = [] }) {
  ctx.fillStyle = '#ffffff'; ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
  ctx.fillRect(x, y - 30, w, 60); ctx.strokeRect(x, y - 30, w, 60);
  ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.setLineDash([3, 4]);
  ctx.beginPath(); ctx.moveTo(x + 6, y); ctx.lineTo(x + w - 6, y); ctx.stroke(); ctx.setLineDash([]);
  let below = false;
  dots.forEach((d, i) => {
    const px = x + x0 + d * k;
    // labels of dots closer than 22 px alternate below the line
    below = i > 0 && (d - dots[i - 1]) * k < 22 ? !below : false;
    ctx.fillStyle = highlight.includes(i) ? cssVar('--accent') : '#111111';
    ctx.beginPath(); ctx.arc(px, y, highlight.includes(i) ? 4.5 : 3.2, 0, Math.PI * 2); ctx.fill();
    const ly = below ? y + 22 : y - 9;
    ctx.font = font(12, 800); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(name, px - 3, ly);
    ctx.font = font(9, 800); ctx.textBaseline = 'middle'; ctx.fillText(String(i), px + 6, ly - 3);
  });
  return (i) => x + x0 + dots[i] * k;
}

// Transparent ruler graduated in mm; x is the position of its zero. Returns the zero x.
export function drawRuler(ctx, { x, y, k, lenMm = 80 }) {
  const w = lenMm * k;
  ctx.fillStyle = 'rgba(255, 236, 160, 0.82)'; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
  roundRect(ctx, x - 12, y, w + 24, 46, 4); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#222222'; ctx.fillStyle = '#222222'; ctx.font = font(10, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let mm = 0; mm <= lenMm; mm++) {
    const px = x + mm * k;
    const L = mm % 10 === 0 ? 16 : mm % 5 === 0 ? 11 : 7;
    ctx.lineWidth = mm % 10 === 0 ? 1.4 : 1;
    ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px, y + L); ctx.stroke();
    if (mm % 10 === 0) ctx.fillText(String(mm / 10), px, y + 18);
  }
  ctx.textAlign = 'right'; ctx.fillText('cm', x + w + 8, y + 32);
  return x;
}
