// Electric circuit components drawn on canvas, shared by the electricity simulations.
// All functions draw in the caller's logical coordinates. Wires are drawn by the caller.
import { cssVar, roundRect, font } from './draw.js';

export function screw(ctx, x, y) {
  ctx.fillStyle = cssVar('--pan-metal');
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}

// Lamp in its socket. Terminals (screws) at (x − 30, y) and (x + 30, y).
// glow: 0 = off, 1 = normal, > 1 = too bright. burnt: broken filament.
export function drawLamp(ctx, { x, y, glow = 0, burnt = false }) {
  const cx = x, cy = y - 46, R = 24;
  if (glow > 0.01 && !burnt) {
    const rad = R + 18 + 46 * Math.min(1.6, glow);
    const g = ctx.createRadialGradient(cx, cy, R * 0.4, cx, cy, rad);
    const a = Math.min(0.9, 0.25 + 0.4 * glow);
    g.addColorStop(0, `rgba(255, 214, 80, ${a})`);
    g.addColorStop(1, 'rgba(255, 214, 80, 0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = burnt ? cssVar('--burnt-glass') : cssVar('--glass-fill');
  ctx.strokeStyle = cssVar('--glass-stroke');
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, R, Math.PI * 0.72, Math.PI * 2.28);
  ctx.lineTo(cx + 10, cy + R + 8);
  ctx.lineTo(cx - 10, cy + R + 8);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  const hot = burnt ? 0 : Math.min(1, glow);
  ctx.strokeStyle = hot > 0.05 ? `rgb(255, ${Math.round(140 + 115 * hot)}, ${Math.round(40 + 200 * Math.max(0, hot - 0.5))})` : cssVar('--glass-stroke');
  ctx.lineWidth = hot > 0.05 ? 2.2 : 1.4;
  ctx.beginPath();
  ctx.moveTo(cx - 8, cy + R + 6); ctx.lineTo(cx - 8, cy + 2);
  if (burnt) {
    ctx.lineTo(cx - 3, cy - 2);
    ctx.moveTo(cx + 2, cy - 4); ctx.lineTo(cx + 8, cy + 2);
  } else {
    for (let i = 0; i <= 6; i++) ctx.lineTo(cx - 8 + (16 * i) / 6, cy + (i % 2 ? -5 : 2));
  }
  ctx.lineTo(cx + 8, cy + R + 6);
  ctx.stroke();
  ctx.fillStyle = cssVar('--pan-metal');
  ctx.fillRect(cx - 11, cy + R + 8, 22, 10);
  ctx.fillStyle = cssVar('--socket');
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 1.2;
  roundRect(ctx, cx - 36, y - 12, 72, 22, 5);
  ctx.fill(); ctx.stroke();
  screw(ctx, cx - 30, y); screw(ctx, cx + 30, y);
}

// Knife switch. Terminals at (x − 50, y) and (x + 50, y). Returns its tap area.
export function drawSwitch(ctx, { x, y, open }) {
  ctx.fillStyle = cssVar('--socket');
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 1.2;
  roundRect(ctx, x - 60, y - 6, 120, 18, 5);
  ctx.fill(); ctx.stroke();
  screw(ctx, x - 50, y); screw(ctx, x + 50, y);
  ctx.fillStyle = cssVar('--pan-metal');
  ctx.fillRect(x + 44, y - 16, 12, 12);
  const a = open ? -0.6 : 0;
  const len = 102;
  ctx.strokeStyle = cssVar('--lever');
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - 50, y - 10);
  ctx.lineTo(x - 50 + len * Math.cos(a), y - 10 + len * Math.sin(a));
  ctx.stroke();
  ctx.fillStyle = cssVar('--switch-knob');
  ctx.beginPath(); ctx.arc(x - 50 + (len - 4) * Math.cos(a), y - 10 + (len - 4) * Math.sin(a) - 8, 9, 0, Math.PI * 2); ctx.fill();
  return { x: x - 64, y: y - 90, w: 128, h: 110 };
}

// Moving chevrons along a polyline (from its first point to its last), in the conventional direction.
// skip(x, y) → true hides a chevron (e.g. where a component sits on the wire).
export function drawCurrentArrows(ctx, pts, phase, skip) {
  const segs = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
    const L = Math.hypot(x2 - x1, y2 - y1);
    if (L < 1e-6) continue;
    segs.push({ x1, y1, dx: (x2 - x1) / L, dy: (y2 - y1) / L, L, s0: total });
    total += L;
  }
  ctx.fillStyle = cssVar('--current');
  const step = 34;
  for (let s = ((phase % step) + step) % step; s < total; s += step) {
    const sg = segs.find((g) => s >= g.s0 && s < g.s0 + g.L);
    if (!sg) continue;
    const x = sg.x1 + sg.dx * (s - sg.s0), y = sg.y1 + sg.dy * (s - sg.s0);
    if (skip?.(x, y)) continue;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.atan2(sg.dy, sg.dx));
    ctx.beginPath();
    ctx.moveTo(6, 0); ctx.lineTo(-4, -5); ctx.lineTo(-1, 0); ctx.lineTo(-4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

// Letter I with a small arrow showing the direction of the current (angle a: 0 → right, π/2 → down).
export function labelI(ctx, x, y, a) {
  const c = cssVar('--current');
  ctx.fillStyle = c;
  ctx.strokeStyle = c;
  ctx.font = font(17, 800);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('I', x, y);
  const dx = Math.round(Math.cos(a)), dy = Math.round(Math.sin(a));
  const cx = dx ? x : x + 11, cy = dx ? y - 13 : y;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx - 8 * dx, cy - 8 * dy); ctx.lineTo(cx + 6 * dx, cy + 6 * dy); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + 10 * dx, cy + 10 * dy);
  ctx.lineTo(cx + 4 * dx - 4 * dy, cy + 4 * dy - 4 * dx);
  ctx.lineTo(cx + 4 * dx + 4 * dy, cy + 4 * dy + 4 * dx);
  ctx.closePath();
  ctx.fill();
}

export function arrowHead(ctx, x, y, a) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-6, -6); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill();
  ctx.restore();
}

/* ---------- Diagram symbols (book, Table 1 of Ch.10) ---------- */
// Lamp ⊗ centred at (x, y), radius 15. Rays when it glows.
export function symLamp(ctx, x, y, glowing) {
  ctx.beginPath(); ctx.arc(x, y, 15, 0, Math.PI * 2); ctx.stroke();
  const d = 15 * Math.SQRT1_2;
  ctx.beginPath(); ctx.moveTo(x - d, y - d); ctx.lineTo(x + d, y + d); ctx.moveTo(x + d, y - d); ctx.lineTo(x - d, y + d); ctx.stroke();
  if (glowing) {
    const ink = ctx.strokeStyle;
    ctx.strokeStyle = cssVar('--gold');
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      ctx.beginPath(); ctx.moveTo(x + dx * 20, y + dy * 20); ctx.lineTo(x + dx * 28, y + dy * 28); ctx.stroke();
    }
    ctx.strokeStyle = ink;
  }
}
// Measuring instrument: circle with a letter (A or V), centred at (x, y), radius 14.
export function symMeter(ctx, x, y, letter) {
  ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.stroke();
  ctx.font = font(14, 800);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, x, y + 1);
}
// One cell between x−9 and x+9 on a horizontal wire at y: long thin plate = +, short thick plate = −.
export function symCell(ctx, x, y, plusRight = true) {
  const xPos = plusRight ? x + 5 : x - 5, xNeg = plusRight ? x - 5 : x + 5;
  const lw = ctx.lineWidth;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(xPos, y - 14); ctx.lineTo(xPos, y + 14); ctx.stroke();
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(xNeg, y - 7); ctx.lineTo(xNeg, y + 7); ctx.stroke();
  ctx.lineWidth = lw;
  ctx.font = font(14, 800);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('+', plusRight ? x + 16 : x - 16, y - 10);
  ctx.fillText('−', plusRight ? x - 16 : x + 16, y - 10);
}
// Switch between (x1, y) and (x2, y): two dots and a lever.
export function symSwitch(ctx, x1, x2, y, open) {
  ctx.beginPath(); ctx.arc(x1, y, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x2, y, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x1, y);
  if (open) ctx.lineTo(x2 - 3, y - 14); else ctx.lineTo(x2, y);
  ctx.stroke();
}
