// Wave optics helpers (Sec 3 GS-LS Ch.13–14): colour of a wavelength, diffraction intensities, patterns drawn on a screen.

// Approximate RGB colour of a monochromatic light of wavelength nm (380–800 nm); dimmer near the ends.
export function lambdaRGB(nm) {
  let r = 0, g = 0, b = 0;
  if (nm < 440) { r = (440 - nm) / 60; b = 1; }
  else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
  else if (nm < 510) { g = 1; b = (510 - nm) / 20; }
  else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
  else if (nm < 645) { r = 1; g = (645 - nm) / 65; }
  else r = 1;
  let k = 1;
  if (nm > 700) k = 0.3 + (0.7 * (800 - nm)) / 100; else if (nm < 420) k = 0.3 + (0.7 * (nm - 380)) / 40;
  k = Math.max(0.15, Math.min(1, k));
  return [Math.round(255 * Math.max(0, r) * k), Math.round(255 * Math.max(0, g) * k), Math.round(255 * Math.max(0, b) * k)];
}
export const lambdaCSS = (nm, a = 1) => { const [r, g, b] = lambdaRGB(nm); return `rgba(${r},${g},${b},${a})`; };

// (sin u / u)²
export function sinc2(u) { if (Math.abs(u) < 1e-9) return 1; const s = Math.sin(u) / u; return s * s; }
// Bessel function J1 (Abramowitz & Stegun 9.4.4 / 9.4.6)
export function besselJ1(x) {
  const ax = Math.abs(x);
  if (ax < 8) {
    const y = x * x;
    const a = x * (72362614232 + y * (-7895059235 + y * (242396853.1 + y * (-2972611.439 + y * (15704.4826 + y * -30.16036606)))));
    const b = 144725228442 + y * (2300535178 + y * (18583304.74 + y * (99447.43394 + y * (376.9991397 + y))));
    return a / b;
  }
  const z = 8 / ax, y = z * z, xx = ax - 2.356194491;
  const p = 1 + y * (0.183105e-2 + y * (-0.3516396496e-4 + y * (0.2457520174e-5 + y * -0.240337019e-6)));
  const q = 0.04687499995 + y * (-0.2002690873e-3 + y * (0.8449199096e-5 + y * (-0.88228987e-6 + y * 0.105787412e-6)));
  const r = Math.sqrt(0.636619772 / ax) * (Math.cos(xx) * p - z * Math.sin(xx) * q);
  return x < 0 ? -r : r;
}
// Intensity of the diffraction by a circular hole: (2 J1(u) / u)²
export function airy(u) { if (Math.abs(u) < 1e-9) return 1; const v = (2 * besselJ1(u)) / u; return v * v; }

// Draw a pattern I(X, Y) (0…1, X and Y in screen units) in the rectangle (x, y, w, h), coloured with rgb.
// unitsPerPx converts canvas pixels into the units of I. gamma < 1 makes the faint fringes visible.
const cache = new Map();
export function drawPattern(ctx, x, y, w, h, I, { rgb = [255, 40, 40], unitsPerPx = 0.1, gamma = 0.45, key = null, res = 1, rgbFn = null } = {}) {
  const pw = Math.max(2, Math.round(w / res)), ph = Math.max(2, Math.round(h / res));
  let off = key ? cache.get(key) : null;
  if (!off) {
    off = document.createElement('canvas'); off.width = pw; off.height = ph;
    const c = off.getContext('2d'), img = c.createImageData(pw, ph), d = img.data;
    for (let j = 0; j < ph; j++) {
      const Y = (j + 0.5 - ph / 2) * unitsPerPx * res;
      for (let i = 0; i < pw; i++) {
        const X = (i + 0.5 - pw / 2) * unitsPerPx * res;
        const k = (j * pw + i) * 4;
        if (rgbFn) { // coloured pattern (white light): rgbFn returns [r, g, b] intensities 0…1
          const c3 = rgbFn(X, Y);
          d[k] = 255 * Math.pow(Math.min(1, c3[0]), gamma); d[k + 1] = 255 * Math.pow(Math.min(1, c3[1]), gamma); d[k + 2] = 255 * Math.pow(Math.min(1, c3[2]), gamma); d[k + 3] = 255;
          continue;
        }
        const v = Math.pow(Math.max(0, Math.min(1, I(X, Y))), gamma);
        d[k] = rgb[0] * v; d[k + 1] = rgb[1] * v; d[k + 2] = rgb[2] * v; d[k + 3] = 255;
      }
    }
    c.putImageData(img, 0, 0);
    if (key) { cache.set(key, off); if (cache.size > 40) cache.delete(cache.keys().next().value); }
  }
  ctx.save(); ctx.imageSmoothingEnabled = true; ctx.drawImage(off, x, y, w, h); ctx.restore();
}
