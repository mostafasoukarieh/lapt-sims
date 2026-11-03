// Liquid thermometer (reservoir + stem + graduated plate), reusable in every heat simulation.
// Canvas coordinates (y downwards). The scale is linear: T = t0 at y0, T = t1 at y1.
import { cssVar, roundRect, font } from './draw.js';
import { num } from './format.js';

// thermoGeom(o) → { yOfT, tOfY, ... } — o: { x, yBulb, yTop, t0, t1, y0, y1, bulbR, stemW }
export function thermoGeom(o) {
  const g = { bulbR: 10, stemW: 7, ...o };
  g.k = (g.y1 - g.y0) / (g.t1 - g.t0); // px per °C (negative: y decreases when T rises)
  g.yOfT = (T) => g.y0 + (T - g.t0) * g.k;
  g.tOfY = (y) => g.t0 + (y - g.y0) / g.k;
  g.yNeck = g.yBulb - g.bulbR + 2;
  // top of the liquid column, kept between the reservoir and the top of the stem
  g.colY = (T) => Math.max(g.yTop + 4, Math.min(g.yNeck - 2, g.yOfT(T)));
  return g;
}

// drawThermometer(ctx, g, o)
// o: { T, liquid: 'alcohol' | 'mercury', plate: true, scale: { minor, mid, major, label, from, to } | null,
//      marks: [{ T, text }] (lines drawn by the student), unit: '°C', plateRight }
export function drawThermometer(ctx, g, o = {}) {
  const { x, yBulb, yTop, bulbR, stemW } = g;
  const liquidCol = cssVar(o.liquid === 'mercury' ? '--thermo-hg' : '--thermo-red');
  const half = stemW / 2;
  const right = o.plateRight ?? 46;

  // backing plate (as in the book's laboratory thermometer)
  if (o.plate !== false) {
    ctx.fillStyle = cssVar('--thermo-plate');
    ctx.strokeStyle = cssVar('--glass-stroke');
    ctx.lineWidth = 1.2;
    roundRect(ctx, x - 14, yTop - 12, 14 + right, g.yNeck - yTop + 6, 6);
    ctx.fill(); ctx.stroke();
  }

  // stem (glass tube)
  ctx.fillStyle = cssVar('--glass-fill');
  ctx.strokeStyle = cssVar('--glass-stroke');
  ctx.lineWidth = 1.6;
  roundRect(ctx, x - half, yTop - 6, stemW, g.yNeck - yTop + 8, half);
  ctx.fill(); ctx.stroke();

  // liquid column (in the capillary)
  const yc = g.colY(o.T ?? g.t0);
  ctx.fillStyle = liquidCol;
  ctx.fillRect(x - 1.6, yc, 3.2, g.yNeck - yc + 3);

  // reservoir (bulb) full of liquid
  ctx.beginPath();
  ctx.ellipse(x, yBulb, bulbR * 0.78, bulbR, 0, 0, Math.PI * 2);
  ctx.fillStyle = liquidCol;
  ctx.fill();
  ctx.strokeStyle = cssVar('--glass-stroke');
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.ellipse(x - bulbR * 0.3, yBulb - bulbR * 0.35, bulbR * 0.18, bulbR * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();

  // graduations
  const sc = o.scale;
  if (sc) {
    const from = sc.from ?? g.t0, to = sc.to ?? g.t1;
    ctx.strokeStyle = cssVar('--scale');
    ctx.fillStyle = cssVar('--scale');
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = font(sc.size ?? 11, 700);
    const n = Math.round((to - from) / sc.minor);
    for (let i = 0; i <= n; i++) {
      const T = from + i * sc.minor;
      const y = g.yOfT(T);
      const isMajor = isMult(T, sc.major), isMid = sc.mid && isMult(T, sc.mid);
      const len = isMajor ? 13 : isMid ? 9 : 6;
      ctx.lineWidth = isMajor ? 1.3 : 0.9;
      ctx.beginPath();
      ctx.moveTo(x + half + 2, y);
      ctx.lineTo(x + half + 2 + len, y);
      ctx.stroke();
      if (isMult(T, sc.label)) ctx.fillText(num(T, sc.decimals ?? 0), x + half + 18, y);
    }
    if (o.unit) { ctx.font = font(11, 700); ctx.fillText(o.unit, x + half + 18, yTop - 2); }
  }

  // marks drawn by the student (graduation of a thermometer)
  for (const m of o.marks || []) {
    const y = g.yOfT(m.T);
    ctx.strokeStyle = cssVar('--mark');
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - half - 6, y);
    ctx.lineTo(x + half + 16, y);
    ctx.stroke();
    if (m.text) {
      ctx.fillStyle = cssVar('--mark');
      ctx.font = font(12, 700);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(m.text, x - half - 9, y);
    }
  }
}

function isMult(v, step) {
  if (!step) return false;
  const r = v / step;
  return Math.abs(r - Math.round(r)) < 1e-6;
}

// Bunsen burner standing on the bench; the flame flickers with time (s). o: { x, yBench, h = 110, on, t, scale = 1 }
export function drawBunsen(ctx, { x, yBench, h = 110, on = true, t = 0, scale = 1 }) {
  const metal = cssVar('--lever');
  ctx.fillStyle = metal;
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1;
  // base and tube
  ctx.beginPath();
  ctx.moveTo(x - 28 * scale, yBench); ctx.lineTo(x - 20 * scale, yBench - 12 * scale);
  ctx.lineTo(x + 20 * scale, yBench - 12 * scale); ctx.lineTo(x + 28 * scale, yBench);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillRect(x - 6 * scale, yBench - h, 12 * scale, h - 12 * scale);
  ctx.strokeRect(x - 6 * scale, yBench - h, 12 * scale, h - 12 * scale);
  ctx.fillStyle = cssVar('--box');
  ctx.fillRect(x - 8 * scale, yBench - 34 * scale, 16 * scale, 8 * scale); // air collar
  if (!on) return;
  const top = yBench - h;
  const f = 1 + 0.06 * Math.sin(t * 23) + 0.04 * Math.sin(t * 37);
  const fh = 62 * scale * f;
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = cssVar('--flame-out');
  ctx.beginPath();
  ctx.moveTo(x - 9 * scale, top);
  ctx.quadraticCurveTo(x - 13 * scale, top - fh * 0.5, x + Math.sin(t * 9) * 2, top - fh);
  ctx.quadraticCurveTo(x + 13 * scale, top - fh * 0.5, x + 9 * scale, top);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = cssVar('--flame-in');
  ctx.beginPath();
  ctx.moveTo(x - 5 * scale, top);
  ctx.quadraticCurveTo(x - 6 * scale, top - fh * 0.3, x, top - fh * 0.5);
  ctx.quadraticCurveTo(x + 6 * scale, top - fh * 0.3, x + 5 * scale, top);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

// Colour of a temperature (°C) for a temperature map: blue (cold) → yellow → red (hot)
export function heatColor(T, Tmin = 20, Tmax = 300) {
  const u = Math.max(0, Math.min(1, (T - Tmin) / (Tmax - Tmin)));
  const hue = 220 - 220 * Math.min(1, u * 1.25);
  const light = 52 + 8 * Math.sin(u * Math.PI);
  return `hsl(${hue}, 85%, ${light}%)`;
}
