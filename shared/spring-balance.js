// Dial spring balance (dynamomètre à cadran) as in the Grade 8 book (Ch.4 Fig. 6–7):
// a round dial with a needle, a zero-adjustment knob, and a rod with a hook below that moves down when pulled.
import { cssVar, font, roundRect } from './draw.js';
import { num } from './format.js';

export const BALANCES = [
  { max: 2, major: 0.2, minor: 0.05, labelEvery: 0.2 },
  { max: 5, major: 0.5, minor: 0.1, labelEvery: 1 },
  { max: 10, major: 1, minor: 0.2, labelEvery: 2 },
];
const A0 = (-150 * Math.PI) / 180; // angle of 0 (measured from the top, clockwise)
const SWEEP = (300 * Math.PI) / 180;

// Needle position in N (with the zero error and the stops of the dial)
export const shown = (F, zero, max) => Math.max(-0.08 * max, Math.min(max * 1.02, F + zero));

// drawSpringBalance(ctx, { x, y, r, bal, F, zero, rodTravel, highlight }) → { hookX, hookY, knob: {x, y, r} }
// x, y: centre of the dial; F: force pulling the hook (N); zero: zero error (N, + = needle after 0).
export function drawSpringBalance(ctx, { x, y, r = 56, bal = BALANCES[0], F = 0, zero = 0, rodTravel = 46, lang }) {
  const max = bal.max;
  // ring to hang it
  ctx.strokeStyle = cssVar('--metal'); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(x, y - r - 12, 8, 0, Math.PI * 2); ctx.stroke();
  // body
  ctx.fillStyle = cssVar('--surface');
  ctx.strokeStyle = cssVar('--glass-stroke'); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // graduations
  const ang = (v) => A0 + (v / max) * SWEEP;
  ctx.strokeStyle = cssVar('--text');
  const nMinor = Math.round(max / bal.minor);
  for (let i = 0; i <= nMinor; i++) {
    const v = i * bal.minor;
    const isMajor = Math.abs(v / bal.major - Math.round(v / bal.major)) < 1e-6;
    const a = ang(v);
    const r1 = r * (isMajor ? 0.78 : 0.86);
    ctx.lineWidth = isMajor ? 2 : 1;
    ctx.beginPath(); ctx.moveTo(x + Math.sin(a) * r1, y - Math.cos(a) * r1); ctx.lineTo(x + Math.sin(a) * r * 0.94, y - Math.cos(a) * r * 0.94); ctx.stroke();
  }
  ctx.fillStyle = cssVar('--accent');
  ctx.font = font(Math.round(r * 0.17), 700);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const nLab = Math.round(max / bal.labelEvery);
  for (let i = 0; i <= nLab; i++) {
    const v = i * bal.labelEvery;
    const a = ang(v);
    ctx.fillText(num(v, bal.labelEvery < 1 ? 1 : 0, lang), x + Math.sin(a) * r * 0.62, y - Math.cos(a) * r * 0.62);
  }
  ctx.fillStyle = cssVar('--text');
  ctx.font = font(Math.round(r * 0.2), 800);
  ctx.fillText('N', x, y + r * 0.55);
  // needle
  const a = ang(shown(F, zero, max));
  ctx.strokeStyle = cssVar('--accent'); ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - Math.sin(a) * r * 0.15, y + Math.cos(a) * r * 0.15); ctx.lineTo(x + Math.sin(a) * r * 0.86, y - Math.cos(a) * r * 0.86); ctx.stroke();
  // zero-adjustment knob in the centre
  const kr = r * 0.17;
  ctx.fillStyle = cssVar('--metal');
  ctx.beginPath(); ctx.arc(x, y, kr, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = cssVar('--wire'); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x - kr * 0.6, y); ctx.lineTo(x + kr * 0.6, y); ctx.stroke();
  // rod and hook (the rod comes out further when the force is larger)
  const ext = Math.max(0, Math.min(1.02, F / max)) * rodTravel;
  const y0 = y + r;
  ctx.fillStyle = cssVar('--metal');
  roundRect(ctx, x - 5, y0 - 2, 10, 10, 2); ctx.fill();
  ctx.strokeStyle = cssVar('--metal'); ctx.lineWidth = 3;
  const hookY = y0 + 14 + ext + 10;
  ctx.beginPath(); ctx.moveTo(x, y0 + 6); ctx.lineTo(x, hookY - 10); ctx.stroke();
  ctx.beginPath(); ctx.arc(x, hookY - 4, 6, -Math.PI / 2, Math.PI * 0.9); ctx.stroke();
  return { hookX: x, hookY: hookY + 2, knob: { x, y, r: kr } };
}
