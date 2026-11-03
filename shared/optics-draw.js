// Drawing helpers for geometrical optics (Grade 8 Ch.15–16, later Grade 9 lenses):
// light rays with arrows, lamp, eye, plane mirror with hatching, candle, screen.
import { cssVar } from './draw.js';

export const LIGHT = '#f2b705';     // colour of light rays (as in the book's figures)
export const LIGHT_SOFT = 'rgba(255, 214, 80, 0.28)';

// A light ray from (x1, y1) to (x2, y2) with arrow heads in the direction of propagation.
// arrows: number of arrow heads spread along the ray (0 = none). dash: dashed (virtual) part.
export function drawRay(ctx, x1, y1, x2, y2, { color = LIGHT, width = 2, arrows = 1, dash = null, head = 7 } = {}) {
  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.setLineDash([]);
  const L = Math.hypot(x2 - x1, y2 - y1);
  if (arrows > 0 && L > 20) {
    const ux = (x2 - x1) / L, uy = (y2 - y1) / L;
    for (let k = 1; k <= arrows; k++) {
      const s = (k / (arrows + 1)) * L;
      const ax = x1 + ux * (s + head / 2), ay = y1 + uy * (s + head / 2);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax - ux * head - uy * head * 0.55, ay - uy * head + ux * head * 0.55);
      ctx.lineTo(ax - ux * head + uy * head * 0.55, ay - uy * head - ux * head * 0.55);
      ctx.closePath(); ctx.fill();
    }
  }
  ctx.restore();
}

// A plane mirror along (x1, y1)–(x2, y2). The silvered back is hatched on the side given by
// back: +1 or −1 (side of the left normal of the segment direction).
export function drawMirror(ctx, x1, y1, x2, y2, { back = 1, thick = 5 } = {}) {
  const L = Math.hypot(x2 - x1, y2 - y1);
  const ux = (x2 - x1) / L, uy = (y2 - y1) / L;
  const nx = -uy * back, ny = ux * back;
  ctx.save();
  ctx.strokeStyle = cssVar('--muted'); ctx.lineWidth = 1.2;
  for (let s = 6; s < L; s += 9) {
    const px = x1 + ux * s, py = y1 + uy * s;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + nx * 9 - ux * 6, py + ny * 9 - uy * 6); ctx.stroke();
  }
  ctx.strokeStyle = '#8fb8d8'; ctx.lineWidth = thick; ctx.lineCap = 'butt';
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.strokeStyle = '#e8f3fb'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x1 - nx * 1.5, y1 - ny * 1.5); ctx.lineTo(x2 - nx * 1.5, y2 - ny * 1.5); ctx.stroke();
  ctx.restore();
}

// A small lamp (bulb) seen from the side; glow when on.
export function drawLamp(ctx, x, y, { r = 10, on = true } = {}) {
  ctx.save();
  if (on) {
    const g = ctx.createRadialGradient(x, y, 2, x, y, r * 3.2);
    g.addColorStop(0, 'rgba(255,230,120,0.85)'); g.addColorStop(1, 'rgba(255,230,120,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 3.2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = on ? '#fff3b0' : '#e5e5dc'; ctx.strokeStyle = '#a89c62'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.restore();
}

// An eye looking in direction angle (rad; 0 = to the right).
export function drawEye(ctx, x, y, angle = 0, { size = 14, sees = null } = {}) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(angle);
  ctx.fillStyle = '#fafafa'; ctx.strokeStyle = '#555'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(-size, 0); ctx.quadraticCurveTo(0, -size * 0.85, size, 0); ctx.quadraticCurveTo(0, size * 0.85, -size, 0); ctx.fill(); ctx.stroke();
  ctx.fillStyle = sees === true ? '#2e9d4f' : '#3b6ea5';
  ctx.beginPath(); ctx.arc(size * 0.35, 0, size * 0.42, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(size * 0.45, 0, size * 0.18, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// A candle standing at (x, yBase); ghost: drawn as a virtual image (dashed, transparent).
export function drawCandle(ctx, x, yBase, { lit = false, h = 56, w = 16, ghost = false, flame = null, t = 0 } = {}) {
  ctx.save();
  if (ghost) ctx.globalAlpha = 0.55;
  ctx.fillStyle = '#f4efe2'; ctx.strokeStyle = '#b9ae92'; ctx.lineWidth = 1.2;
  if (ghost) ctx.setLineDash([4, 3]);
  ctx.fillRect(x - w / 2, yBase - h, w, h); ctx.strokeRect(x - w / 2, yBase - h, w, h);
  ctx.setLineDash([]);
  ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x, yBase - h); ctx.lineTo(x, yBase - h - 6); ctx.stroke();
  if (lit || flame) {
    const fl = 1 + 0.08 * Math.sin(t * 13) + 0.05 * Math.sin(t * 7.3);
    const fy = yBase - h - 6;
    const g = ctx.createRadialGradient(x, fy - 8, 1, x, fy - 8, 26);
    g.addColorStop(0, 'rgba(255,220,120,0.6)'); g.addColorStop(1, 'rgba(255,220,120,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, fy - 8, 26, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffb020';
    ctx.beginPath(); ctx.moveTo(x, fy - 20 * fl); ctx.quadraticCurveTo(x + 7, fy - 6, x, fy + 1); ctx.quadraticCurveTo(x - 7, fy - 6, x, fy - 20 * fl); ctx.fill();
    ctx.fillStyle = '#fff3c0';
    ctx.beginPath(); ctx.moveTo(x, fy - 12 * fl); ctx.quadraticCurveTo(x + 3, fy - 4, x, fy); ctx.quadraticCurveTo(x - 3, fy - 4, x, fy - 12 * fl); ctx.fill();
  }
  ctx.restore();
}

// Point helpers
export const reflectPoint = (px, py, x1, y1, x2, y2) => {
  const dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy;
  const u = ((px - x1) * dx + (py - y1) * dy) / L2;
  const fx = x1 + u * dx, fy = y1 + u * dy;
  return [2 * fx - px, 2 * fy - py];
};
// distance from point P to the line through A and B
export const distToLine = (px, py, ax, ay, bx, by) => Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / Math.hypot(bx - ax, by - ay);
