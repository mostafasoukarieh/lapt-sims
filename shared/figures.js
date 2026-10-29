// Simple scene figures shared by several simulations: haloed labels and stick people.
import { cssVar, font } from './draw.js';

// Text with a halo of the scene background, so it stays readable over drawings.
export function label(ctx, text, x, y, { size = 13, weight = 600, color = cssVar('--text'), align = 'center', base = 'middle', halo = true } = {}) {
  ctx.font = font(size, weight);
  ctx.textAlign = align;
  ctx.textBaseline = base;
  if (halo) {
    ctx.lineWidth = 4;
    ctx.strokeStyle = cssVar('--scene-bg');
    ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

// person(ctx, x, yFeet, { color, h, walk (phase in rad or null), sit, name, face (+1 right, −1 left), run })
export function person(ctx, x, yFeet, { color, h = 46, walk = null, sit = false, name = null, face = 1, run = false }) {
  const skin = cssVar('--skin');
  const headR = h * 0.11;
  const hip = sit ? yFeet - h * 0.3 : yFeet - h * 0.45;
  const neck = hip - h * 0.33;
  const lean = run ? face * h * 0.08 : 0;
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  if (sit) {
    ctx.beginPath(); ctx.moveTo(x, hip); ctx.lineTo(x + face * h * 0.22, hip); ctx.lineTo(x + face * h * 0.22, yFeet); ctx.stroke();
  } else {
    const amp = run ? 0.6 : 0.35;
    const s = walk == null ? 0.18 : Math.sin(walk) * amp;
    ctx.beginPath();
    ctx.moveTo(x + Math.sin(s) * h * 0.45, yFeet); ctx.lineTo(x, hip); ctx.lineTo(x - Math.sin(s) * h * 0.45, yFeet);
    ctx.stroke();
  }
  ctx.lineWidth = 7;
  ctx.beginPath(); ctx.moveTo(x, hip); ctx.lineTo(x + lean, neck); ctx.stroke();
  ctx.lineWidth = 4;
  if (run && walk != null) {
    const s = Math.sin(walk) * 0.7;
    ctx.beginPath();
    ctx.moveTo(x + lean - Math.sin(s) * h * 0.25, neck + h * 0.2); ctx.lineTo(x + lean, neck + 4); ctx.lineTo(x + lean + Math.sin(s) * h * 0.25, neck + h * 0.2);
    ctx.stroke();
  } else {
    ctx.beginPath(); ctx.moveTo(x + lean, neck + 4); ctx.lineTo(x + face * h * 0.16, hip - 2); ctx.stroke();
  }
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(x + lean, neck - headR - 1, headR, 0, Math.PI * 2); ctx.fill();
  if (name) label(ctx, name, x + lean, neck - 2 * headR - 12, { size: 14, weight: 800, color });
}
