// Realistic digital multimeter (Grade 9 and later): display, selector with zones, input jacks.
// The caller describes the ranges and the jacks; this module only draws and returns tap areas.
import { cssVar, roundRect, font } from './draw.js';
import { num } from './format.js';

// Range description: { kind: 'V' | 'A', max, dec, k, unit, jack, label, angle }
//   max: largest value the display can show (in display units), dec: decimals, k: display factor (1000 for mA),
//   jack: input the red lead must use, angle: position of the label around the selector (degrees, 0 = right).
// reading(range, value, jackUsed) → { text, overload, match }
export function reading(range, value, jack) {
  if (!range || !range.kind) return { text: '', overload: false, match: false };
  const match = jack === range.jack;
  const v = match ? value * range.k : 0;
  const overload = Math.abs(v) > range.max + 1e-9;
  if (overload) return { text: (v < 0 ? '−' : '') + '1', overload, match, value: v };
  let text = num(Math.abs(v), range.dec);
  if (range.dec === 0) text = text.padStart(3, '0'); // as on the book's photo: 006
  const shownZero = Number(Math.abs(v).toFixed(range.dec)) === 0;
  return { text: (v < 0 && !shownZero ? '−' : '') + text, overload, match, value: v };
}

// drawMultimeter(ctx, { x, y, w, h, ranges: { id: range }, order: [ids], value: id, offLabel,
//   jacks: [{ name, label }], text, unit, overload, zoneV, zoneA })
// Returns { dial: [{ id, x, y, r }], jacks: { name: [x, y] }, jackHits: [{ name, x, y, r }] }
export function drawMultimeter(ctx, o) {
  const { x, y, w, h } = o;
  ctx.fillStyle = cssVar('--meter-body');
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, x, y, w, h, 16);
  ctx.fill(); ctx.stroke();
  // display
  const dx = x + 14, dy = y + 14, dw = w - 28, dh = 60;
  ctx.fillStyle = cssVar('--lcd-bg');
  roundRect(ctx, dx, dy, dw, dh, 6);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = cssVar('--lcd-ink');
  ctx.textBaseline = 'middle';
  if (o.text) {
    ctx.font = '700 33px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';
    ctx.textAlign = o.overload ? 'left' : 'right';
    ctx.fillText(o.text, o.overload ? dx + 14 : dx + dw - 40, dy + dh / 2 + 2);
    ctx.font = font(14, 800);
    ctx.textAlign = 'right';
    ctx.fillText(o.unit || '', dx + dw - 8, dy + dh / 2 + 6);
  }
  // selector
  const cx = x + w / 2, cy = y + 172, r = 36, lr = 70;
  ctx.font = font(11, 800);
  ctx.textAlign = 'center';
  ctx.fillStyle = cssVar('--meter-v');
  ctx.fillText(o.zoneV || 'V ⎓', cx - 64, cy - 78);
  ctx.fillStyle = cssVar('--meter-a');
  ctx.fillText(o.zoneA || 'A ⎓', cx + 64, cy - 78);
  const dial = [];
  for (const id of o.order) {
    const R = o.ranges[id];
    const a = (R.angle * Math.PI) / 180;
    const lx = cx + lr * Math.cos(a), ly = cy + lr * Math.sin(a);
    const on = o.value === id;
    ctx.fillStyle = on ? cssVar('--primary') : !R.kind ? cssVar('--text-on-meter') : R.kind === 'V' ? cssVar('--meter-v') : cssVar('--meter-a');
    ctx.font = font(on ? 13 : 11, on ? 800 : 700);
    ctx.fillText(R.kind ? R.label : o.offLabel || 'OFF', lx, ly);
    dial.push({ id, x: lx, y: ly, r: 22 });
  }
  const a = ((o.ranges[o.value]?.angle ?? -90) * Math.PI) / 180;
  ctx.fillStyle = cssVar('--meter-knob');
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(a);
  ctx.fillStyle = cssVar('--meter-grip');
  roundRect(ctx, -r + 4, -8, 2 * r - 8, 16, 7);
  ctx.fill();
  ctx.fillStyle = cssVar('--accent');
  ctx.beginPath(); ctx.moveTo(r - 4, 0); ctx.lineTo(r - 17, -6); ctx.lineTo(r - 17, 6); ctx.closePath(); ctx.fill();
  ctx.restore();
  // input jacks, evenly spaced along the bottom
  const jacks = {}, jackHits = [];
  const n = o.jacks.length, jy = y + h - 30, gap = (w - 40) / (n - 1);
  o.jacks.forEach((j, i) => {
    const jx = x + 20 + i * gap;
    jacks[j.name] = [jx, jy];
    ctx.fillStyle = j.name === 'COM' ? '#1d1f24' : j.name === '10A' ? cssVar('--gold') : cssVar('--accent');
    ctx.beginPath(); ctx.arc(jx, jy, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0b0c0e';
    ctx.beginPath(); ctx.arc(jx, jy, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = cssVar('--text-on-meter');
    ctx.font = font(11, 800);
    ctx.textAlign = 'center';
    ctx.fillText(j.label ?? j.name, jx, jy - 21);
    if (j.name !== 'COM') jackHits.push({ name: j.name, x: jx, y: jy, r: 22 });
  });
  return { dial, jacks, jackHits };
}

// Flexible lead from a jack (x1, y1) down and round to a terminal (x2, y2).
// c1, c2: optional Bézier control points (default: down from the jack, then up to the terminal).
export function meterLead(ctx, [x1, y1], [x2, y2], color, c1 = [x1, y1 + 60], c2 = [x2 + (x1 > x2 ? 70 : -70), y2 + 60]) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], x2, y2);
  ctx.stroke();
  ctx.fillStyle = color;
  roundRect(ctx, x2 - 7, y2 - 7, 14, 14, 4);
  ctx.fill();
}
