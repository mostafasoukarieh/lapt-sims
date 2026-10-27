// Laboratory equipment drawn on canvas, shared by several simulations.
// All functions draw in the caller's logical coordinates.
import { cssVar, roundRect, font } from './draw.js';
import { num } from './format.js';

const LCD_FONT = '700 28px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';

// Digital balance standing on the bench (y = bench). The plate is at plateY; the body top at plateY + 14.
// value: number shown (grams, 1 decimal). zeroLabel: text on the ZERO key (from strings).
// Returns the ZERO key hit circle { x, y, r } in logical units.
export function drawDigitalBalance(ctx, { cx, plateY, bench, value, zeroLabel, plateW = 220 }) {
  const top = plateY + 14;
  ctx.fillStyle = cssVar('--device');
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - 160, bench);
  ctx.lineTo(cx + 160, bench);
  ctx.lineTo(cx + 148, top);
  ctx.lineTo(cx - 148, top);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(cx - 156, bench - 8, 312, 8);
  // plate support + plate
  ctx.fillStyle = cssVar('--pan-metal');
  ctx.fillRect(cx - 14, plateY + 6, 28, top - plateY - 6);
  ctx.strokeStyle = cssVar('--glass-stroke');
  roundRect(ctx, cx - plateW / 2, plateY, plateW, 8, 3);
  ctx.fill(); ctx.stroke();
  // display
  const dx = cx - 82, dy = top + 22, dw = 150, dh = 44;
  ctx.fillStyle = cssVar('--lcd-bg');
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  roundRect(ctx, dx, dy, dw, dh, 5);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = cssVar('--lcd-ink');
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  ctx.font = LCD_FONT;
  ctx.fillText(num(value, 1), dx + dw - 26, dy + dh / 2 + 1);
  ctx.font = font(15, 700);
  ctx.textAlign = 'left';
  ctx.fillText('g', dx + dw - 20, dy + dh / 2 + 3);
  // ZERO key
  const bx = cx + 112, by = dy + dh / 2;
  ctx.fillStyle = cssVar('--primary');
  ctx.beginPath();
  ctx.arc(bx, by, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = cssVar('--primary-ink');
  ctx.font = font(10, 800);
  ctx.textAlign = 'center';
  ctx.fillText(zeroLabel, bx, by + 1);
  return { x: bx, y: by, r: 30 };
}

// Graduated cylinder standing at yb (bottom of its foot), graduated in mL.
// o: { cx, yb, w, perML, capacity, minor, major, label, V (liquid volume in mL, 0 = empty), color, colorDark, behind (fn drawn inside, before the liquid) }
// Returns geometry { yBase, yOfV } so callers can place objects inside.
export function drawGradCylinder(ctx, o) {
  const foot = 8;
  const yBase = o.yb - foot;
  const yOfV = (v) => yBase - v * o.perML;
  const x0 = o.cx - o.w / 2, x1 = o.cx + o.w / 2;
  const yTop = yOfV(o.capacity) - 14;
  // foot
  ctx.fillStyle = cssVar('--glass-fill');
  ctx.strokeStyle = cssVar('--glass-stroke');
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(o.cx - o.w * 0.95, o.yb);
  ctx.lineTo(o.cx - o.w * 0.75, yBase);
  ctx.lineTo(o.cx + o.w * 0.75, yBase);
  ctx.lineTo(o.cx + o.w * 0.95, o.yb);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  o.behind?.(yOfV);
  // liquid
  if (o.V > 0.05) {
    const y = yOfV(o.V);
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, o.colorDark); g.addColorStop(0.45, o.color); g.addColorStop(1, o.colorDark);
    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x0, yBase);
    ctx.lineTo(x0, y - 3);
    ctx.quadraticCurveTo(o.cx, y + 3, x1, y - 3);
    ctx.lineTo(x1, yBase);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = o.colorDark;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x0, y - 3);
    ctx.quadraticCurveTo(o.cx, y + 3, x1, y - 3);
    ctx.stroke();
  }
  // tube
  ctx.fillStyle = cssVar('--glass-fill');
  ctx.strokeStyle = cssVar('--glass-stroke');
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x0 - 7, yTop - 3);
  ctx.quadraticCurveTo(x0 - 1, yTop - 1, x0, yTop + 6);
  ctx.lineTo(x0, yBase);
  ctx.lineTo(x1, yBase);
  ctx.lineTo(x1, yTop);
  ctx.stroke();
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillRect(x0, yTop, o.w, yBase - yTop);
  ctx.restore();
  ctx.fillStyle = cssVar('--glass-shine');
  ctx.fillRect(x1 - 9, yTop + 8, 4, yBase - yTop - 16);
  // graduations
  ctx.strokeStyle = cssVar('--scale');
  ctx.fillStyle = cssVar('--scale');
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = font(10, 700);
  for (let v = o.minor; v <= o.capacity + 1e-9; v += o.minor) {
    const y = yOfV(v);
    const major = Math.abs(v / o.major - Math.round(v / o.major)) < 1e-6;
    ctx.lineWidth = major ? 1.4 : 0.9;
    ctx.beginPath();
    ctx.moveTo(x0 + 1, y);
    ctx.lineTo(x0 + 1 + (major ? 12 : 7), y);
    ctx.stroke();
    if (Math.abs(v / o.label - Math.round(v / o.label)) < 1e-6) ctx.fillText(String(Math.round(v)), x0 + 15, y);
  }
  ctx.fillText('mL', x0 + 15, yTop + 4);
  return { yBase, yOfV, x0, x1, yTop };
}
