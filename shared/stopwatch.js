// Stopwatch (chronometer) as in the Grade 8 book (Ch.3 Act. 2): reading mm':ss'':cc,
// three push buttons START, STOP, RESET. Also clock helpers (hh:mm:ss).
import { cssVar, font, roundRect } from './draw.js';

const pad = (n, w = 2) => String(Math.floor(n)).padStart(w, '0');

// 20.82 s → "00':20'':82" (book style). Hundredths are truncated, like a real stopwatch.
export function fmtStopwatch(t) {
  const cs = Math.floor(Math.max(0, t) * 100 + 1e-6);
  const m = Math.floor(cs / 6000), s = Math.floor((cs % 6000) / 100), c = cs % 100;
  return `${pad(m)}':${pad(s)}'':${pad(c)}`;
}

// seconds since midnight → "08:50:05"
export function fmtClock(sec) {
  const s = ((Math.round(sec) % 86400) + 86400) % 86400;
  return `${pad(s / 3600)}:${pad((s % 3600) / 60)}:${pad(s % 60)}`;
}
export const hms = (h, m, s = 0) => h * 3600 + m * 60 + s;

// drawStopwatch(ctx, cx, cy, r, t, { running, pressed: 'start'|'stop'|'reset'|null }) → hit areas of the 3 buttons
export function drawStopwatch(ctx, cx, cy, r, t, { pressed = null, running = false } = {}) {
  const hits = {};
  // buttons on top: START (left), STOP (middle), RESET (right) as in Fig. 2-a
  const btns = [['start', -0.62], ['stop', 0], ['reset', 0.62]];
  for (const [id, a] of btns) {
    const bx = cx + Math.sin(a) * r * 1.02, by = cy - Math.cos(a) * r * 1.02;
    const down = pressed === id ? 3 : 0;
    ctx.save();
    ctx.translate(bx, by + down * 0.3);
    ctx.rotate(a);
    ctx.fillStyle = id === 'start' ? cssVar('--good') : id === 'stop' ? cssVar('--accent') : cssVar('--s3');
    roundRect(ctx, -r * 0.16, -r * 0.2 + down, r * 0.32, r * 0.22, 4);
    ctx.fill();
    ctx.restore();
    hits[id] = { x: bx, y: by, r: r * 0.24 };
  }
  // case
  ctx.fillStyle = cssVar('--box');
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = cssVar('--metal'); ctx.lineWidth = r * 0.07;
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.94, 0, Math.PI * 2); ctx.stroke();
  // LCD
  const w = r * 1.5, h = r * 0.56;
  ctx.fillStyle = cssVar('--lcd-bg');
  roundRect(ctx, cx - w / 2, cy - h / 2, w, h, 6);
  ctx.fill();
  ctx.fillStyle = cssVar('--lcd-ink');
  ctx.font = font(Math.round(r * 0.22), 700);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(fmtStopwatch(t), cx, cy + 1);
  ctx.font = font(Math.round(r * 0.12), 700);
  ctx.fillStyle = '#ffffff';
  ctx.fillText('START', cx - r * 0.42, cy - r * 0.5);
  ctx.fillText('STOP', cx, cy - r * 0.58);
  ctx.fillText('RESET', cx + r * 0.42, cy - r * 0.5);
  if (running) {
    ctx.fillStyle = cssVar('--lcd-ink');
    ctx.beginPath(); ctx.arc(cx - w / 2 + 10, cy - h / 2 + 9, 3, 0, Math.PI * 2); ctx.fill();
  }
  return hits;
}

// Analog wall clock with hands, seconds since midnight
export function drawClock(ctx, cx, cy, r, sec) {
  ctx.fillStyle = cssVar('--surface');
  ctx.strokeStyle = cssVar('--text');
  ctx.lineWidth = r * 0.06;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.lineWidth = 2;
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2, big = i % 5 === 0;
    const r1 = r * (big ? 0.8 : 0.88);
    ctx.lineWidth = big ? 2.5 : 1;
    ctx.beginPath(); ctx.moveTo(cx + Math.sin(a) * r1, cy - Math.cos(a) * r1); ctx.lineTo(cx + Math.sin(a) * r * 0.94, cy - Math.cos(a) * r * 0.94); ctx.stroke();
  }
  ctx.fillStyle = cssVar('--text');
  ctx.font = font(Math.round(r * 0.17), 600);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let h = 1; h <= 12; h++) {
    const a = (h / 12) * Math.PI * 2;
    ctx.fillText(String(h), cx + Math.sin(a) * r * 0.66, cy - Math.cos(a) * r * 0.66);
  }
  const s = sec % 60, m = (sec / 60) % 60, h = (sec / 3600) % 12;
  const hand = (frac, len, w, color) => {
    const a = frac * Math.PI * 2;
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(a) * len, cy - Math.cos(a) * len); ctx.stroke();
  };
  hand(h / 12, r * 0.5, r * 0.07, cssVar('--text'));
  hand(m / 60, r * 0.75, r * 0.05, cssVar('--text'));
  hand(Math.floor(s) / 60, r * 0.82, r * 0.02, cssVar('--accent'));
  ctx.fillStyle = cssVar('--accent');
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.05, 0, Math.PI * 2); ctx.fill();
}
