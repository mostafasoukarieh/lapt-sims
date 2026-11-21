// Spectra: line data (nm) and drawing of continuous, emission and absorption spectra on a strip.
import { lambdaRGB } from './wave-optics.js';

// Visible lines (nm). Hydrogen: Balmer lines of the book (Sec 3 GS-LS Ch.17); sodium: D doublet;
// neon and helium: main visible lines; Sun: Fraunhofer lines (H, Na D, Mg b, Fe E, helium 587.6 nm).
export const LINES = {
  hydrogen: [656.3, 486.1, 434.1, 410.2],
  sodium: [589.0, 589.6],
  neon: [585.2, 588.2, 594.5, 597.6, 603.0, 607.4, 609.6, 614.3, 616.4, 621.7, 626.6, 630.5, 633.4, 638.3, 640.2, 650.6, 659.9, 667.8, 692.9, 703.2],
  helium: [447.1, 471.3, 492.2, 501.6, 587.6, 667.8, 706.5],
  sun: [656.3, 486.1, 434.1, 410.2, 589.0, 589.6, 518.4, 517.3, 527.0, 587.6, 430.8, 438.4, 495.8, 516.7],
};
// Relative brightness of the emission lines (1 = strongest), same order as LINES.
export const WEIGHTS = {
  hydrogen: [1, 0.7, 0.45, 0.3],
  neon: [0.8, 0.4, 0.6, 0.3, 0.5, 0.6, 0.5, 0.8, 0.6, 0.5, 0.5, 0.3, 0.6, 0.6, 1, 0.5, 0.4, 0.3, 0.4, 0.4],
  helium: [0.6, 0.2, 0.3, 0.5, 1, 0.6, 0.4],
};

// drawSpectrum(ctx, x, y, w, h, { lmin, lmax, mode, lines, weights, lineNm, gamma })
// mode: 'continuous' | 'emission' | 'absorption'; lineNm = drawn half-width of a line in nm.
export function drawSpectrum(ctx, x, y, w, h, { lmin = 380, lmax = 750, mode = 'continuous', lines = [], weights = null, lineNm = null, depth = 0.92 } = {}) {
  const X = (nm) => x + ((nm - lmin) / (lmax - lmin)) * w;
  const half = lineNm ?? Math.max(0.6, (lmax - lmin) / w * 1.6);
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = '#000'; ctx.fillRect(x, y, w, h);
  if (mode !== 'emission') {
    const step = (lmax - lmin) / w;
    for (let i = 0; i < w; i++) {
      const nm = lmin + (i + 0.5) * step;
      let a = 1;
      if (mode === 'absorption') for (const l of lines) { const d = Math.abs(nm - l) / half; if (d < 1.5) a = Math.min(a, 1 - depth * Math.exp(-d * d * 1.2)); }
      const [r, g, b] = lambdaRGB(nm);
      ctx.fillStyle = `rgb(${Math.round(r * a)},${Math.round(g * a)},${Math.round(b * a)})`;
      ctx.fillRect(x + i, y, 1.2, h);
    }
  } else {
    lines.forEach((l, k) => {
      if (l < lmin - 2 || l > lmax + 2) return;
      const [r, g, b] = lambdaRGB(l);
      const wt = weights ? weights[k] : 1;
      const px = Math.max(1.6, (half / (lmax - lmin)) * w * 2);
      ctx.fillStyle = `rgba(${r},${g},${b},${0.35 + 0.65 * wt})`;
      ctx.fillRect(X(l) - px / 2, y, px, h);
      ctx.fillStyle = `rgba(${r},${g},${b},${0.18 * wt})`;
      ctx.fillRect(X(l) - px * 1.6, y, px * 3.2, h);
    });
  }
  ctx.restore();
  return X;
}
