// Live bar diagram of energies (Ek, Ep, Em, ΔU…), with a zero line and negative values below it.
import { cssVar, font, roundRect } from './draw.js';
import { num } from './format.js';

// drawEnergyBars(ctx, { x, y, w, h, bars: [{ label, value, color }], max, min = 0, unit = 'J', decimals = 2, values = true, title })
// x, y: top-left corner of the box; values in the same unit as max/min.
export function drawEnergyBars(ctx, o) {
  const { x, y, w, h, bars } = o;
  const min = Math.min(0, o.min ?? 0), max = Math.max(o.max, 1e-9);
  const top = y + (o.title ? 18 : 4), bottom = y + h - 30;
  const Y = (v) => bottom - ((v - min) / (max - min)) * (bottom - top);
  ctx.save();
  ctx.fillStyle = cssVar('--surface');
  ctx.strokeStyle = cssVar('--border');
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, w, h, 10); ctx.fill(); ctx.stroke();
  if (o.title) {
    ctx.fillStyle = cssVar('--muted'); ctx.font = font(11, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(o.title, x + w / 2, y + 4);
  }
  const n = bars.length, gap = 6, bw = (w - 12 - gap * (n - 1)) / n;
  const y0 = Y(0);
  bars.forEach((b, i) => {
    const bx = x + 6 + i * (bw + gap);
    const v = Math.max(min, Math.min(max, b.value));
    ctx.fillStyle = b.color;
    const yv = Y(v);
    ctx.fillRect(bx, Math.min(yv, y0), bw, Math.abs(y0 - yv));
    ctx.fillStyle = cssVar('--text');
    ctx.font = font(11, 800); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(b.label, bx + bw / 2, bottom + 4);
    if (o.values !== false) {
      ctx.font = font(10, 600); ctx.fillStyle = cssVar('--muted');
      ctx.fillText(num(b.value, o.decimals ?? 2), bx + bw / 2, bottom + 17);
    }
  });
  ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x + 4, y0); ctx.lineTo(x + w - 4, y0); ctx.stroke();
  if (o.unit) {
    ctx.fillStyle = cssVar('--muted'); ctx.font = font(10, 600); ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText(`(${o.unit})`, x + 6, top + 10);
  }
  ctx.restore();
}

// plotCurves(ctx, { x, y, w, h, xMin, xMax, yMin, yMax, xLabel, yLabel, curves: [{ f, color, dash, label }], marker })
// A small plot drawn inside a scene canvas; f(x) → y. marker: x value of a vertical line with dots on each curve.
export function plotCurves(ctx, o) {
  const { x, y, w, h } = o;
  const M = { l: 42, r: 10, t: 16, b: 30 };
  const pw = w - M.l - M.r, ph = h - M.t - M.b;
  const X = (v) => x + M.l + ((v - o.xMin) / (o.xMax - o.xMin)) * pw;
  const Y = (v) => y + M.t + ph - ((v - o.yMin) / (o.yMax - o.yMin)) * ph;
  ctx.save();
  ctx.fillStyle = cssVar('--surface'); ctx.strokeStyle = cssVar('--border'); ctx.lineWidth = 1;
  roundRect(ctx, x, y, w, h, 10); ctx.fill(); ctx.stroke();
  const step = (span) => { const raw = span / 5, p = 10 ** Math.floor(Math.log10(raw)), m = raw / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; };
  const sx = o.xStep ?? step(o.xMax - o.xMin), sy = o.yStep ?? step(o.yMax - o.yMin);
  const dec = (s) => (s < 0.1 ? 2 : s < 1 ? 1 : 0);
  ctx.font = font(10); ctx.fillStyle = cssVar('--muted'); ctx.strokeStyle = cssVar('--border');
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let v = Math.ceil(o.xMin / sx) * sx; v <= o.xMax + 1e-9; v += sx) {
    ctx.beginPath(); ctx.moveTo(X(v), y + M.t); ctx.lineTo(X(v), y + M.t + ph); ctx.stroke();
    ctx.fillText(num(v, dec(sx)), X(v), y + M.t + ph + 3);
  }
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let v = Math.ceil(o.yMin / sy) * sy; v <= o.yMax + 1e-9; v += sy) {
    ctx.beginPath(); ctx.moveTo(x + M.l, Y(v)); ctx.lineTo(x + M.l + pw, Y(v)); ctx.stroke();
    ctx.fillText(num(v, dec(sy)), x + M.l - 4, Y(v));
  }
  ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x + M.l, y + M.t); ctx.lineTo(x + M.l, y + M.t + ph); ctx.lineTo(x + M.l + pw, y + M.t + ph); ctx.stroke();
  ctx.fillStyle = cssVar('--text'); ctx.font = font(11, 700);
  ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText(o.xLabel, x + w - 6, y + h - 2);
  ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(o.yLabel, x + M.l + 4, y + 2);
  ctx.beginPath(); ctx.rect(x + M.l, y + M.t - 2, pw, ph + 4); ctx.clip();
  for (const c of o.curves) {
    ctx.strokeStyle = c.color; ctx.lineWidth = 2.5; ctx.setLineDash(c.dash ? [7, 5] : []);
    ctx.beginPath();
    for (let i = 0; i <= 120; i++) {
      const v = o.xMin + ((o.xMax - o.xMin) * i) / 120;
      const py = Y(c.f(v));
      if (i) ctx.lineTo(X(v), py); else ctx.moveTo(X(v), py);
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);
  if (o.marker != null) {
    ctx.strokeStyle = cssVar('--muted'); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(X(o.marker), y + M.t); ctx.lineTo(X(o.marker), y + M.t + ph); ctx.stroke();
    for (const c of o.curves) {
      ctx.fillStyle = c.color; ctx.beginPath(); ctx.arc(X(o.marker), Y(c.f(o.marker)), 4.5, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
  // legend
  let lx = x + M.l + 8;
  ctx.font = font(11, 800); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  for (const c of o.curves) {
    if (!c.label) continue;
    ctx.fillStyle = c.color; ctx.fillRect(lx, y + M.t + 6, 14, 4);
    ctx.fillText(c.label, lx + 18, y + M.t + 8);
    lx += 26 + ctx.measureText(c.label).width;
  }
}
