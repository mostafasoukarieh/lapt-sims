// Sound equipment drawn on a canvas — Sec 2 S chapters 3–5 (emission, reception, energy of sound).
import { cssVar, roundRect } from './draw.js';

const TAU = Math.PI * 2;

// Tuning fork standing on its resonance box. d: outward displacement of the tips (px, drawn larger than it is).
// Returns the position of the tip of the right tine.
export function drawTuningFork(ctx, { x, yBox, height = 170, gap = 16, d = 0, box = true, width = 9 }) {
  if (box) {
    ctx.fillStyle = cssVar('--wood');
    roundRect(ctx, x - 60, yBox, 120, 32, 5);
    ctx.fill();
  }
  const base = yBox - 26, top = yBox - height;
  ctx.strokeStyle = cssVar('--fork');
  ctx.lineCap = 'round';
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x, yBox + 2); ctx.lineTo(x, base + 10);
  ctx.moveTo(x - gap - d, top); ctx.quadraticCurveTo(x - gap - d * 0.4, base - 30, x - gap, base);
  ctx.quadraticCurveTo(x, base + 22, x + gap, base);
  ctx.quadraticCurveTo(x + gap + d * 0.4, base - 30, x + gap + d, top);
  ctx.stroke();
  ctx.lineCap = 'butt';
  return [x + gap + d, top];
}

// Loudspeaker seen from the side, facing right (dir = 1) or left (dir = −1), or up (dir = 'up').
// cone: displacement of the membrane (px). Returns the centre of the membrane.
export function drawSpeaker(ctx, { x, y, size = 1, dir = 1, cone = 0 }) {
  ctx.save();
  ctx.translate(x, y);
  if (dir === 'up') ctx.rotate(-Math.PI / 2);
  else if (dir === -1) ctx.scale(-1, 1);
  ctx.scale(size, size);
  // magnet (back)
  ctx.fillStyle = cssVar('--magnet-dark') || '#3a3f48';
  roundRect(ctx, -46, -16, 22, 32, 4); ctx.fill();
  // salad bowl (frame)
  ctx.strokeStyle = cssVar('--metal') || '#9aa4b0';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-24, -14); ctx.lineTo(10, -46); ctx.moveTo(-24, 14); ctx.lineTo(10, 46); ctx.stroke();
  // cone (membrane)
  ctx.fillStyle = cssVar('--cone') || '#5b4a3a';
  ctx.beginPath();
  ctx.moveTo(-22 + cone, -10); ctx.lineTo(8 + cone, -44); ctx.lineTo(10 + cone * 0.6, -44); ctx.lineTo(10 + cone * 0.6, 44); ctx.lineTo(8 + cone, 44); ctx.lineTo(-22 + cone, 10);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#2b2f36';
  ctx.beginPath(); ctx.ellipse(-20 + cone, 0, 5, 10, 0, 0, TAU); ctx.fill(); // dust cap
  ctx.restore();
  if (dir === 'up') return [x, y - (10 + cone) * size];
  return [x + dir * (10 + cone) * size, y];
}

// Microphone on a stand, the head pointing left (dir = −1) or right (dir = 1). Returns the head position.
export function drawMicrophone(ctx, { x, y, dir = -1, stand = 0 }) {
  if (stand > 0) {
    ctx.strokeStyle = cssVar('--wire');
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y + 10); ctx.lineTo(x, y + stand);
    ctx.moveTo(x - 20, y + stand); ctx.lineTo(x + 20, y + stand);
    ctx.stroke();
  }
  ctx.fillStyle = cssVar('--box');
  roundRect(ctx, x - 14, y - 9, 28, 18, 6); ctx.fill();
  ctx.fillStyle = cssVar('--metal') || '#9aa4b0';
  ctx.beginPath(); ctx.arc(x + dir * 16, y, 10, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
  for (let k = -6; k <= 6; k += 4) { ctx.beginPath(); ctx.moveTo(x + dir * 16 + k, y - 8); ctx.lineTo(x + dir * 16 + k, y + 8); ctx.stroke(); }
  return [x + dir * 24, y];
}

// Arcs of a sound wave leaving a source (fade with amplitude 0…1). phase in [0, 1) moves them outward.
export function drawSoundArcs(ctx, { x, y, dir = 1, amp = 1, phase = 0, n = 3, step = 16, spread = 0.7, color }) {
  if (amp <= 0.01) return;
  ctx.strokeStyle = color || cssVar('--muted');
  ctx.lineWidth = 2;
  const a0 = dir === 1 ? 0 : Math.PI;
  for (let k = 0; k < n; k++) {
    const r = step * (k + 1 + phase);
    ctx.globalAlpha = Math.min(1, amp) * (1 - (k + phase) / (n + 0.5));
    ctx.beginPath(); ctx.arc(x, y, r, a0 - spread, a0 + spread); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
