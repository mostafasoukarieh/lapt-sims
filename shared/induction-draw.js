// Electromagnetic induction drawings (Sec 3 GS-LS Ch.8 and later): centre-zero galvanometer, solenoid seen from the side,
// LED, uniform field drawn as crosses / dots, rails with a sliding rod.
import { cssVar, font, roundRect } from './draw.js';
import { num } from './format.js';
import { arrowHead } from './circuit-draw.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Centre-zero galvanometer: reading i (same unit as max), scale −max … +max. letter: name written on the meter.
export function drawGalvanometer(ctx, x, y, i, { max = 5, unit = 'mA', letter = 'A', step = 1, labelEvery = 5 } = {}) {
  ctx.fillStyle = cssVar('--meter-body'); ctx.strokeStyle = cssVar('--meter-a'); ctx.lineWidth = 2.5;
  roundRect(ctx, x - 70, y - 60, 140, 92, 10); ctx.fill(); ctx.stroke();
  ctx.fillStyle = cssVar('--lcd-bg'); roundRect(ctx, x - 60, y - 52, 120, 64, 6); ctx.fill();
  ctx.strokeStyle = '#333'; ctx.fillStyle = '#333'; ctx.lineWidth = 1.2; ctx.font = font(10, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const cy = y + 6, R = 48, n = Math.round(max / step);
  for (let k = -n; k <= n; k++) {
    const a = -Math.PI / 2 + (k / n) * 0.95;
    const big = k % labelEvery === 0;
    const r1 = big ? R - 10 : R - 6;
    ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r1, cy + Math.sin(a) * r1); ctx.lineTo(x + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.stroke();
    if (big) ctx.fillText(num(k * step, 0), x + Math.cos(a) * (R - 18), cy + Math.sin(a) * (R - 18));
  }
  ctx.font = font(12, 800); ctx.fillText(unit, x, y + 22);
  const a = -Math.PI / 2 + clamp(i / max, -1.06, 1.06) * 0.95;
  ctx.strokeStyle = cssVar('--bad'); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, cy); ctx.lineTo(x + Math.cos(a) * (R - 4), cy + Math.sin(a) * (R - 4)); ctx.stroke();
  ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(x, cy, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = cssVar('--meter-a'); roundRect(ctx, x - 14, y - 70, 28, 18, 9); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = font(13, 800); ctx.fillText(letter, x, y - 61);
}

// Solenoid along x from x0 to x1, radius r (px). s = +1 / −1: current arrows on the front of the turns (up / down); 0: none.
export function drawSolenoid(ctx, x0, x1, y, r, { turns = 9, s = 0 } = {}) {
  const dx = (x1 - x0) / (turns - 1), rx = Math.min(7, dx * 0.45);
  ctx.lineWidth = 3.2;
  ctx.strokeStyle = cssVar('--copper'); ctx.globalAlpha = 0.45;
  for (let k = 0; k < turns; k++) { const x = x0 + k * dx; ctx.beginPath(); ctx.ellipse(x, y, rx, r, 0, Math.PI / 2, (3 * Math.PI) / 2); ctx.stroke(); }
  ctx.globalAlpha = 1;
  for (let k = 0; k < turns; k++) { const x = x0 + k * dx; ctx.beginPath(); ctx.ellipse(x, y, rx, r, 0, -Math.PI / 2, Math.PI / 2); ctx.stroke(); }
  if (s) { ctx.fillStyle = cssVar('--current'); for (let k = 1; k < turns; k += 2) arrowHead(ctx, x0 + k * dx + rx, y, s > 0 ? -Math.PI / 2 : Math.PI / 2); }
}

// LED drawn as a diagram symbol, pointing in direction a (rad): it conducts in the direction of its arrow. on: 0…1.
export function drawLED(ctx, x, y, a, color, on = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  if (on > 0) {
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 30);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalAlpha = Math.min(1, on); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
  }
  ctx.fillStyle = on > 0 ? color : cssVar('--surface'); ctx.strokeStyle = color; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-9, -10); ctx.lineTo(9, 0); ctx.lineTo(-9, 10); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(9, -10); ctx.lineTo(9, 10); ctx.stroke();
  ctx.restore();
  // two small emission arrows, always towards the top right
  ctx.save(); ctx.translate(x, y); ctx.strokeStyle = color; ctx.lineWidth = 1.5;
  for (const k of [0, 7]) {
    ctx.beginPath(); ctx.moveTo(-1 + k, -12); ctx.lineTo(5 + k, -20); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(5 + k, -20); ctx.lineTo(1 + k, -19); ctx.moveTo(5 + k, -20); ctx.lineTo(4 + k, -16); ctx.stroke();
  }
  ctx.restore();
}

// Uniform field perpendicular to the drawing: crosses (into the page) or dots (out of the page), in a rectangle.
export function drawFieldPerp(ctx, x, y, w, h, into = true, step = 40) {
  ctx.strokeStyle = cssVar('--muted'); ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 1.4;
  ctx.globalAlpha = 0.55;
  for (let yy = y + step / 2; yy < y + h; yy += step) {
    for (let xx = x + step / 2; xx < x + w; xx += step) {
      if (into) { ctx.beginPath(); ctx.moveTo(xx - 5, yy - 5); ctx.lineTo(xx + 5, yy + 5); ctx.moveTo(xx - 5, yy + 5); ctx.lineTo(xx + 5, yy - 5); ctx.stroke(); }
      else { ctx.beginPath(); ctx.arc(xx, yy, 6, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(xx, yy, 1.8, 0, Math.PI * 2); ctx.fill(); }
    }
  }
  ctx.globalAlpha = 1;
}
