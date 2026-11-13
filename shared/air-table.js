// Air table (top view) and air track: table surface, pucks, recording dots.
// Used by Sec 3 GS-LS linear-momentum (and later by any sim that needs an air-table recording).
import { cssVar, roundRect, font } from './draw.js';

// Frame mapping a table of size wM × hM (metres) into a screen box (x, y, w, h); y of the world points upward.
export function tableFrame(x, y, w, h, wM, hM) {
  const k = Math.min(w / wM, h / hM);
  const ox = x + (w - wM * k) / 2, oy = y + (h - hM * k) / 2;
  return {
    k, x: ox, y: oy, w: wM * k, h: hM * k,
    X: (xm) => ox + xm * k,
    Y: (ym) => oy + (hM - ym) * k,
  };
}

export function drawAirTable(ctx, f) {
  ctx.save();
  ctx.fillStyle = cssVar('--box');
  roundRect(ctx, f.x - 8, f.y - 8, f.w + 16, f.h + 16, 10); ctx.fill();
  ctx.fillStyle = cssVar('--air-table');
  ctx.fillRect(f.x, f.y, f.w, f.h);
  // faint grid, like the conducting paper of the table
  ctx.strokeStyle = cssVar('--air-grid'); ctx.lineWidth = 1;
  const step = f.k * 0.1;
  ctx.beginPath();
  for (let gx = f.x + step; gx < f.x + f.w - 1; gx += step) { ctx.moveTo(gx, f.y); ctx.lineTo(gx, f.y + f.h); }
  for (let gy = f.y + step; gy < f.y + f.h - 1; gy += step) { ctx.moveTo(f.x, gy); ctx.lineTo(f.x + f.w, gy); }
  ctx.stroke();
  ctx.restore();
}

// Puck seen from above: x, y screen centre, r radius (px). opts: { color, label, ring (elastic ring), overload, mark }
export function drawPuck(ctx, x, y, r, opts = {}) {
  ctx.save();
  if (opts.ring) {
    ctx.strokeStyle = cssVar('--rubber'); ctx.lineWidth = Math.max(3, r * 0.22);
    ctx.beginPath(); ctx.arc(x, y, r * 1.18, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.fillStyle = opts.color || cssVar('--s2');
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.5; ctx.stroke();
  if (opts.overload) {
    ctx.strokeStyle = cssVar('--metal'); ctx.lineWidth = r * 0.28;
    ctx.beginPath(); ctx.arc(x, y, r * 0.62, 0, Math.PI * 2); ctx.stroke();
  }
  // the marking point at the centre (centre of inertia)
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x, y, Math.max(2.5, r * 0.12), 0, Math.PI * 2); ctx.fill();
  if (opts.label) {
    ctx.fillStyle = '#fff'; ctx.font = font(Math.max(10, r * 0.55), 800);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(opts.label, x, y - r * 0.45 - 2);
  }
  ctx.restore();
}

// Recording: list of [x, y] screen points, one every τ; the first can be numbered.
export function drawDots(ctx, pts, color, opts = {}) {
  ctx.save();
  ctx.fillStyle = color;
  for (let i = 0; i < pts.length; i++) {
    ctx.beginPath(); ctx.arc(pts[i][0], pts[i][1], opts.r ?? 2.6, 0, Math.PI * 2); ctx.fill();
    if (opts.numbers && i % (opts.every ?? 1) === 0) {
      ctx.font = font(9, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(String(i), pts[i][0], pts[i][1] - 4);
    }
  }
  ctx.restore();
}

// Glider of an air track seen from the side: x centre, yTop of the track, width w (px).
export function drawGlider(ctx, x, yTrack, w, opts = {}) {
  ctx.save();
  const h = opts.h ?? 26;
  ctx.fillStyle = opts.color || cssVar('--s2');
  ctx.beginPath();
  ctx.moveTo(x - w / 2, yTrack); ctx.lineTo(x - w / 2 + 8, yTrack - h); ctx.lineTo(x + w / 2 - 8, yTrack - h); ctx.lineTo(x + w / 2, yTrack);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.5; ctx.stroke();
  if (opts.label) {
    ctx.fillStyle = '#fff'; ctx.font = font(12, 800); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(opts.label, x, yTrack - h / 2);
  }
  ctx.restore();
}

export function drawAirTrack(ctx, x1, x2, y) {
  ctx.save();
  ctx.fillStyle = cssVar('--metal');
  ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.lineTo(x2 - 10, y + 16); ctx.lineTo(x1 + 10, y + 16); ctx.closePath(); ctx.fill();
  ctx.fillStyle = cssVar('--muted');
  for (let px = x1 + 14; px < x2 - 10; px += 14) { ctx.beginPath(); ctx.arc(px, y + 5, 1.3, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = cssVar('--box');
  ctx.fillRect(x1 - 6, y - 22, 8, 40); ctx.fillRect(x2 - 2, y - 22, 8, 40);
  ctx.restore();
}
