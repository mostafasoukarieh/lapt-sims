// Canvas helpers: DPR-sharp canvas with a logical coordinate system, theme colors, shapes.

// setupCanvas(canvas, { width, height, maxHeightVh, onResize })
// Drawing code always works in logical units (width × height); the canvas scales to its container.
export function setupCanvas(canvas, opts) {
  const ctx = canvas.getContext('2d');
  const s = { lw: opts.width, lh: opts.height, scale: 1, dpr: 1, cssW: 0, cssH: 0 };

  function resize() {
    const parent = canvas.parentElement;
    const cs = getComputedStyle(parent);
    const availW = parent.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const vh = typeof opts.maxHeightVh === 'function' ? opts.maxHeightVh() : (opts.maxHeightVh ?? 78);
    const maxH = (window.innerHeight * vh) / 100;
    let cssW = availW;
    let cssH = (cssW * s.lh) / s.lw;
    if (cssH > maxH) { cssH = maxH; cssW = (cssH * s.lw) / s.lh; }
    s.cssW = cssW; s.cssH = cssH;
    s.dpr = Math.min(window.devicePixelRatio || 1, 3);
    s.scale = cssW / s.lw;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.width = Math.round(cssW * s.dpr);
    canvas.height = Math.round(cssH * s.dpr);
    opts.onResize?.();
  }

  const ro = new ResizeObserver(() => resize());
  ro.observe(canvas.parentElement);
  window.addEventListener('resize', resize);
  resize();

  return {
    ctx,
    get width() { return s.lw; },
    get height() { return s.lh; },
    setLogicalSize(w, h) { s.lw = w; s.lh = h; resize(); },
    // Prepare a frame: identity → clear → logical transform
    begin() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const k = s.scale * s.dpr;
      ctx.setTransform(k, 0, 0, k, 0, 0);
      return ctx;
    },
    // Convert a pointer event to logical coordinates
    toLogical(ev) {
      const r = canvas.getBoundingClientRect();
      return { x: ((ev.clientX - r.left) / r.width) * s.lw, y: ((ev.clientY - r.top) / r.height) * s.lh };
    },
    // Logical units per CSS pixel (for hit radii)
    get unitsPerPx() { return 1 / s.scale; },
  };
}

// Theme colors from CSS variables, refreshed when the color scheme changes.
const cache = new Map();
export function cssVar(name) {
  if (!cache.has(name)) cache.set(name, getComputedStyle(document.documentElement).getPropertyValue(name).trim());
  return cache.get(name);
}
export function onThemeChange(fn) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', () => { cache.clear(); fn(); });
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Arrow from (x1,y1) to (x2,y2) — used for vectors in later simulations.
export function arrow(ctx, x1, y1, x2, y2, head = 8) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - head * Math.cos(a - 0.4), y2 - head * Math.sin(a - 0.4));
  ctx.lineTo(x2 - head * Math.cos(a + 0.4), y2 - head * Math.sin(a + 0.4));
  ctx.closePath();
  ctx.fill();
}

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
export function font(size, weight = 400) { return `${weight} ${size}px ${FONT}`; }
