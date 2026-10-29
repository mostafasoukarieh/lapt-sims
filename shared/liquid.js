// Liquids in 2-D vessels (canvas coordinates, y downwards): free surface, level, communicating vessels.
// A vessel cavity is a polygon [[x, y], …]. The liquid is the part of the cavity below its free surface.

export function polyArea(poly) {
  let s = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % n];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

// Part of the polygon where f(x, y) = a·x + b·y + c ≥ 0 (Sutherland–Hodgman against one half-plane).
export function clipHalfPlane(poly, a, b, c) {
  const out = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const P = poly[i], Q = poly[(i + 1) % n];
    const fp = a * P[0] + b * P[1] + c, fq = a * Q[0] + b * Q[1] + c;
    if (fp >= 0) out.push(P);
    if ((fp >= 0) !== (fq >= 0)) {
      const k = fp / (fp - fq);
      out.push([P[0] + k * (Q[0] - P[0]), P[1] + k * (Q[1] - P[1])]);
    }
  }
  return out;
}

// Liquid side of a free surface through (x0, y0) making the angle phi (rad) with the horizontal.
// phi = 0 → everything below the horizontal line y = y0.
export function belowSurface(poly, x0, y0, phi = 0) {
  const s = Math.sin(phi), c = Math.cos(phi);
  return clipHalfPlane(poly, -s, c, s * x0 - c * y0);
}

export function rotatePoly(poly, cx, cy, ang) {
  const s = Math.sin(ang), c = Math.cos(ang);
  return poly.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]);
}
export function translatePoly(poly, dx, dy) { return poly.map(([x, y]) => [x + dx, y + dy]); }

function bounds(polys) {
  let top = Infinity, bottom = -Infinity;
  for (const p of polys) for (const [, y] of p) { if (y < top) top = y; if (y > bottom) bottom = y; }
  return { top, bottom };
}

// Level y0 of a free surface (through x0, angle phi) such that the liquid in all the polygons has the given area.
// Several polygons that touch along an edge (branches of communicating vessels) share the same free surface.
export function levelFor(polys, area, x0 = 0, phi = 0) {
  const { top, bottom } = bounds(polys);
  let lo = top - 400, hi = bottom + 400; // area(lo) = full, area(hi) = 0
  const areaAt = (y0) => polys.reduce((s, p) => s + polyArea(belowSurface(p, x0, y0, phi)), 0);
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (areaAt(mid) > area) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// Area of liquid when the level is y0 (horizontal surface).
export function areaBelow(polys, y0) {
  return polys.reduce((s, p) => s + polyArea(belowSurface(p, 0, y0, 0)), 0);
}

export function fillPoly(ctx, poly) {
  if (poly.length < 3) return;
  ctx.beginPath();
  poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();
}

// Damped oscillator used for sloshing: x'' = −ω²x − 2ζωx'. Mutates s = { x, v }; stops below eps (rest).
export function dampStep(s, dt, omega = 7, zeta = 0.22, eps = 1e-3) {
  const a = -omega * omega * s.x - 2 * zeta * omega * s.v;
  s.v += a * dt;
  s.x += s.v * dt;
  if (Math.abs(s.x) < eps && Math.abs(s.v) < eps * omega) { s.x = 0; s.v = 0; }
}

// Part of the polygon above the horizontal line y = y0 (trapped air at the top of an upside-down vessel).
export function aboveLine(poly, y0) { return clipHalfPlane(poly, 0, -1, y0); }
