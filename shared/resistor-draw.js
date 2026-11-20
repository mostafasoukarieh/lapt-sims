// Carbon resistors with colour rings, the international colour code, and the ohmmeter ranges of the
// digital multimeter (drawn by multimeter-draw.js). Used by Grade 9 `resistors` and Sec 1 `ohmic-resistors`.
import { cssVar, roundRect } from './draw.js';

export const COLORS = ['black', 'brown', 'red', 'orange', 'yellow', 'green', 'blue', 'violet', 'grey', 'white'];
export const HEX = { black: '#1b1b1b', brown: '#7b4a26', red: '#d22a2a', orange: '#f08a1c', yellow: '#f2d21b', green: '#2e9e4a', blue: '#2b5fd9', violet: '#8a3fc4', grey: '#8c8c8c', white: '#f4f4f4', gold: '#c9a227', silver: '#b9bec4' };
export const TOL = { gold: 5, silver: 10 };
export const E12 = [10, 12, 15, 18, 22, 27, 33, 39, 47, 56, 68, 82];

// Four rings of a nominal value: tens digit, units digit, multiplier, tolerance
export function bandsOf(nominal, tol = 'gold') {
  let zeros = 0, v = Math.round(nominal);
  while (v >= 100) { v = Math.round(v / 10); zeros++; }
  return [COLORS[Math.floor(v / 10)], COLORS[v % 10], COLORS[zeros], tol];
}
export const valueOf = (b) => (COLORS.indexOf(b[0]) * 10 + COLORS.indexOf(b[1])) * 10 ** COLORS.indexOf(b[2]);

// Horizontal carbon resistor with its leads; returns the x of the four rings.
// flip: the resistor is turned round (the tolerance ring is then on the left)
export function drawResistor(ctx, x, y, bands, len = 90, h = 24, flip = false) {
  ctx.strokeStyle = cssVar('--metal'); ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - len / 2 - 14, y); ctx.lineTo(x + len / 2 + 14, y); ctx.stroke();
  ctx.fillStyle = '#e8d3a8';
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1.2;
  roundRect(ctx, x - len / 2, y - h / 2, len, h, h / 2); ctx.fill(); ctx.stroke();
  const xs = [0.24, 0.38, 0.52, 0.8].map((f) => (flip ? 1 - f : f));
  bands.forEach((b, i) => {
    ctx.fillStyle = HEX[b];
    ctx.fillRect(x - len / 2 + xs[i] * len - len * 0.04, y - h / 2 + 1, len * 0.08, h - 2);
  });
  return xs.map((f) => x - len / 2 + f * len);
}

// Ohmmeter ranges of a usual 3½-digit multimeter (label, display unit and decimals)
export const OHM_RANGES = {
  off: { kind: null, angle: 180 },
  r200: { kind: 'O', max: 199.9, dec: 1, k: 1, unit: 'Ω', jack: 'VΩ', label: '200', angle: -150 },
  r2k: { kind: 'O', max: 1.999, dec: 3, k: 1e-3, unit: 'kΩ', jack: 'VΩ', label: '2k', angle: -120 },
  r20k: { kind: 'O', max: 19.99, dec: 2, k: 1e-3, unit: 'kΩ', jack: 'VΩ', label: '20k', angle: -90 },
  r200k: { kind: 'O', max: 199.9, dec: 1, k: 1e-3, unit: 'kΩ', jack: 'VΩ', label: '200k', angle: -60 },
  r2M: { kind: 'O', max: 1.999, dec: 3, k: 1e-6, unit: 'MΩ', jack: 'VΩ', label: '2M', angle: -30 },
  r20M: { kind: 'O', max: 19.99, dec: 2, k: 1e-6, unit: 'MΩ', jack: 'VΩ', label: '20M', angle: 0 },
};
export const OHM_DIAL = ['off', 'r200', 'r2k', 'r20k', 'r200k', 'r2M', 'r20M'];
export const OHM_JACKS = [{ name: '10A' }, { name: 'mA' }, { name: 'COM' }, { name: 'VΩ', label: 'VΩ' }];
// Smallest range that can display R
export const bestOhmRange = (R) => OHM_DIAL.slice(1).find((id) => R * OHM_RANGES[id].k <= OHM_RANGES[id].max);
