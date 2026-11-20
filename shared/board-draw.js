// Circuit pieces drawn on a canvas board: wires, labels, resistor box, lamp, adjustable source,
// knife switch, rheostat. Used by Sec 1 `ohmic-resistors` and `generators-receivers`.
import { cssVar, roundRect, font } from './draw.js';

export function board(ctx, W = 600, H = 440) { ctx.fillStyle = cssVar('--board'); roundRect(ctx, 6, 6, W - 12, H - 12, 14); ctx.fill(); }
export function line(ctx, pts, color = cssVar('--wire'), w = 4) {
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
}
export function tag(ctx, s, x, y, color = cssVar('--text'), size = 14, align = 'center', weight = 800) {
  ctx.fillStyle = color; ctx.font = font(size, weight); ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(s, x, y);
}
export function dot(ctx, x, y, r = 6) { ctx.fillStyle = cssVar('--wire'); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
// resistor symbol (rectangle) on a horizontal or vertical wire
export function resBox(ctx, x, y, name, vertical = false, glow = 0, burnt = false) {
  const w = vertical ? 20 : 60, h = vertical ? 60 : 20;
  if (glow > 0.03 && !burnt) {
    const g = ctx.createRadialGradient(x, y, 4, x, y, 46);
    g.addColorStop(0, `rgba(255, 120, 40, ${0.7 * glow})`); g.addColorStop(1, 'rgba(255, 120, 40, 0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 46, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = burnt ? '#2a2420' : glow > 0.03 ? `rgb(255, ${Math.round(240 - 120 * glow)}, ${Math.round(220 - 200 * glow)})` : cssVar('--surface');
  ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 2.5;
  ctx.fillRect(x - w / 2, y - h / 2, w, h); ctx.strokeRect(x - w / 2, y - h / 2, w, h);
  if (name) { if (vertical) tag(ctx, name, x + 18, y, cssVar('--text'), 14, 'left'); else tag(ctx, name, x, y - 24, cssVar('--text'), 14); }
}
export function lampAt(ctx, x, y, glow, name, vertical = false) {
  if (glow > 0.02) {
    const g = ctx.createRadialGradient(x, y, 4, x, y, 40);
    g.addColorStop(0, `rgba(255, 214, 90, ${0.75 * glow})`); g.addColorStop(1, 'rgba(255, 214, 90, 0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 40, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = glow > 0.02 ? `rgb(255, ${Math.round(236 - 30 * glow)}, ${Math.round(170 - 110 * glow)})` : cssVar('--surface');
  ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(x, y, 18, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  const k = 18 * Math.SQRT1_2;
  ctx.beginPath(); ctx.moveTo(x - k, y - k); ctx.lineTo(x + k, y + k); ctx.moveTo(x + k, y - k); ctx.lineTo(x - k, y + k); ctx.stroke();
  if (name) { if (vertical) tag(ctx, name, x + 26, y, cssVar('--text'), 14, 'left'); else tag(ctx, name, x, y - 31, cssVar('--text'), 14); }
}
export function sourceV(ctx, x, y1, y2, text) {
  // adjustable DC source / battery standing vertically, + at the top
  const h = y2 - y1;
  ctx.fillStyle = cssVar('--battery'); ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.5;
  roundRect(ctx, x - 32, y1, 64, h, 8); ctx.fill(); ctx.stroke();
  tag(ctx, text, x, y1 + h / 2, '#ffffff', 13);
  tag(ctx, '+', x + 44, y1 + 12, cssVar('--accent'), 20); tag(ctx, '−', x + 44, y2 - 12, cssVar('--text'), 22);
}
export function switchH(ctx, x1, x2, y, open) {
  ctx.strokeStyle = cssVar('--wire'); ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y);
  if (open) ctx.lineTo(x1 + (x2 - x1) * 0.9, y - (x2 - x1) * 0.45); else ctx.lineTo(x2 - 4, y - 7);
  ctx.stroke();
  for (const x of [x1, x2]) { ctx.fillStyle = cssVar('--surface'); ctx.strokeStyle = cssVar('--wire'); ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
}
export function rheostatH(ctx, x, y, frac, w = 120) {
  ctx.fillStyle = cssVar('--surface'); ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 2.5;
  ctx.fillRect(x - w / 2, y - 11, w, 22); ctx.strokeRect(x - w / 2, y - 11, w, 22);
  // turns of wire
  ctx.strokeStyle = cssVar('--copper'); ctx.lineWidth = 1.2;
  for (let i = 1; i < 20; i++) { const xx = x - w / 2 + (i * w) / 20; ctx.beginPath(); ctx.moveTo(xx, y - 10); ctx.lineTo(xx - 3, y + 10); ctx.stroke(); }
  return x - w / 2 + w * frac;
}
