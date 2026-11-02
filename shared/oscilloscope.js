// Oscilloscope (Grade 9 and later): screen of 10 × 8 divisions, vertical sensitivity Sv and time base.
// The caller computes what the trace is; this module draws the instrument and the trace.
import { cssVar, roundRect, font } from './draw.js';
import { num } from './format.js';

export const SV_LIST = [0.5, 1, 2, 5, 10]; // V/div
export const VB_LIST = [2, 0.5, 0.1, 0.02, 0.002, 0.0002]; // s/div (time base)
export const DIV_X = 10, DIV_Y = 8;
export const PERSISTENCE = 0.12; // s: how long the screen keeps the light of the spot

// 0.002 → { value: 2, unit: 'ms/div' }
export function vbParts(vb) {
  if (vb >= 0.1) return { value: vb, unit: 's/div', dec: vb < 1 ? 1 : 0 };
  const ms = vb * 1000;
  return { value: ms, unit: 'ms/div', dec: ms < 1 ? 1 : 0 };
}
export const vbText = (vb) => { const p = vbParts(vb); return `${num(p.value, p.dec)} ${p.unit}`; };
export const svText = (sv) => `${num(sv, sv < 1 ? 1 : 0)} V/div`;

// Length (in divisions) of the lit part of the trace, and whether it looks like a steady line.
export function traceLength(vb) {
  const len = PERSISTENCE / vb;
  return { len: Math.min(DIV_X, len), steady: len >= DIV_X };
}

// drawScope(ctx, { x, y, d, level, spotX, len, steady, svLabel, vbLabel, gnd, title })
//   d: size of one division; level: height of the trace in divisions (null → no trace);
//   spotX: position of the spot in divisions (0…10) when the trace is not steady; len: lit length behind it.
// Returns { A: [x, y], M: [x, y], screen: { x, y, w, h } }
export function drawScope(ctx, o) {
  const d = o.d, sw = DIV_X * d, sh = DIV_Y * d;
  const W = sw + 40, H = sh + 112;
  const x = o.x, y = o.y;
  ctx.fillStyle = cssVar('--scope-body');
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, x, y, W, H, 14);
  ctx.fill(); ctx.stroke();
  const sx = x + 20, sy = y + 18;
  ctx.fillStyle = cssVar('--scope-screen');
  roundRect(ctx, sx - 6, sy - 6, sw + 12, sh + 12, 8);
  ctx.fill();
  // grid
  ctx.strokeStyle = cssVar('--scope-grid');
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= DIV_X; i++) { ctx.moveTo(sx + i * d, sy); ctx.lineTo(sx + i * d, sy + sh); }
  for (let j = 0; j <= DIV_Y; j++) { ctx.moveTo(sx, sy + j * d); ctx.lineTo(sx + sw, sy + j * d); }
  ctx.stroke();
  // sub-divisions (0.2 div) on the central axes
  ctx.beginPath();
  const mx = sx + sw / 2, my = sy + sh / 2;
  for (let k = 0; k <= DIV_Y * 5; k++) { const yy = sy + (k * d) / 5; ctx.moveTo(mx - 4, yy); ctx.lineTo(mx + 4, yy); }
  for (let k = 0; k <= DIV_X * 5; k++) { const xx = sx + (k * d) / 5; ctx.moveTo(xx, my - 4); ctx.lineTo(xx, my + 4); }
  ctx.stroke();
  // trace
  if (o.level != null && Math.abs(o.level) <= DIV_Y / 2 + 0.05) {
    const ty = my - o.level * d;
    ctx.save();
    ctx.beginPath(); ctx.rect(sx, sy - 2, sw, sh + 4); ctx.clip();
    ctx.shadowColor = cssVar('--scope-trace');
    ctx.shadowBlur = 8;
    ctx.strokeStyle = cssVar('--scope-trace');
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    if (o.steady) {
      ctx.beginPath(); ctx.moveTo(sx, ty); ctx.lineTo(sx + sw, ty); ctx.stroke();
    } else {
      const head = o.spotX * d, tail = head - o.len * d;
      const g = ctx.createLinearGradient(sx + tail, 0, sx + head, 0);
      g.addColorStop(0, 'rgba(120, 255, 160, 0)');
      g.addColorStop(1, cssVar('--scope-trace'));
      ctx.strokeStyle = g;
      ctx.beginPath(); ctx.moveTo(sx + Math.max(0, tail), ty); ctx.lineTo(sx + head, ty); ctx.stroke();
      ctx.fillStyle = cssVar('--scope-trace');
      ctx.beginPath(); ctx.arc(sx + head, ty, 3.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  // knobs with their settings
  const ky = sy + sh + 46;
  const knob = (kx, label, value) => {
    ctx.fillStyle = cssVar('--meter-knob');
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(kx, ky, 17, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = cssVar('--meter-grip');
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(kx, ky - 14); ctx.stroke();
    ctx.fillStyle = cssVar('--scope-ink');
    ctx.font = font(11, 800);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, kx, ky - 28);
    ctx.font = font(12, 800);
    ctx.fillText(value, kx, ky + 28);
  };
  knob(sx + 40, o.svName || 'Sv', o.svLabel || '');
  knob(sx + 136, o.vbName || 'Vb', o.vbLabel || '');
  // input A and ground M
  const A = [sx + sw - 70, ky], M = [sx + sw - 18, ky];
  for (const [p, name, col] of [[A, 'A', cssVar('--accent')], [M, 'M', '#1d1f24']]) {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(p[0], p[1], 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0b0c0e';
    ctx.beginPath(); ctx.arc(p[0], p[1], 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = cssVar('--scope-ink');
    ctx.font = font(13, 800);
    ctx.textAlign = 'center';
    ctx.fillText(name, p[0], p[1] - 22);
  }
  if (o.gnd) {
    ctx.fillStyle = cssVar('--scope-ink');
    ctx.font = font(11, 800);
    ctx.fillText('GND', sx + 88, ky + 28);
  }
  return { A, M, screen: { x: sx, y: sy, w: sw, h: sh }, W, H };
}
