// Simple live graph: labeled axes with quantity and unit, points and lines through the origin.
import { setupCanvas, cssVar, font, onThemeChange } from './draw.js';
import { num } from './format.js';

// Step of about `target` ticks between 0 and max: 1, 2 or 5 × 10^n.
export function niceStep(max, target = 5) {
  const raw = max / target;
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}
export const niceMax = (v, target = 5) => { const s = niceStep(v, target); return Math.ceil(v / s) * s; };

// createGraph(canvas, { width, height, maxHeightVh })
// draw({ xLabel, yLabel, xMax, yMax, series: [{ color, points: [[x, y]...], slope (optional line y = slope·x), label }] })
export function createGraph(canvas, opts = {}) {
  const W = opts.width ?? 360, H = opts.height ?? 240;
  let last = null;
  const view = setupCanvas(canvas, { width: W, height: H, maxHeightVh: opts.maxHeightVh ?? 40, onResize: () => last && draw(last) });
  onThemeChange(() => last && draw(last));
  const M = { l: 46, r: 14, t: 14, b: 36 };

  function draw(d) {
    last = d;
    const ctx = view.begin();
    const pw = W - M.l - M.r, ph = H - M.t - M.b;
    const xMax = d.xMax, yMax = d.yMax;
    const X = (x) => M.l + (x / xMax) * pw;
    const Y = (y) => M.t + ph - (y / yMax) * ph;
    const sx = niceStep(xMax), sy = niceStep(yMax);
    const decX = sx < 1 ? 1 : 0, decY = sy < 1 ? 1 : 0;
    // grid + ticks
    ctx.strokeStyle = cssVar('--border');
    ctx.fillStyle = cssVar('--muted');
    ctx.lineWidth = 1;
    ctx.font = font(10);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let x = 0; x <= xMax + 1e-9; x += sx) {
      ctx.beginPath(); ctx.moveTo(X(x), M.t); ctx.lineTo(X(x), M.t + ph); ctx.stroke();
      ctx.fillText(num(x, decX), X(x), M.t + ph + 4);
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let y = 0; y <= yMax + 1e-9; y += sy) {
      ctx.beginPath(); ctx.moveTo(M.l, Y(y)); ctx.lineTo(M.l + pw, Y(y)); ctx.stroke();
      ctx.fillText(num(y, decY), M.l - 5, Y(y));
    }
    // axes
    ctx.strokeStyle = cssVar('--text');
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(M.l, M.t); ctx.lineTo(M.l, M.t + ph); ctx.lineTo(M.l + pw, M.t + ph); ctx.stroke();
    ctx.fillStyle = cssVar('--text');
    ctx.font = font(11, 700);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(d.xLabel, M.l + pw, H - 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(d.yLabel, M.l + 4, M.t - 12 < 0 ? 0 : M.t - 12);
    // series
    ctx.save();
    ctx.beginPath(); ctx.rect(M.l, M.t, pw, ph); ctx.clip();
    for (const s of d.series) {
      if (s.slope != null && s.points.length) {
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(xMax), Y(s.slope * xMax)); ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.fillStyle = s.color;
      ctx.strokeStyle = cssVar('--surface');
      for (const [x, y] of s.points) {
        ctx.beginPath(); ctx.arc(X(x), Y(y), 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    }
    ctx.restore();
  }
  return { draw };
}
