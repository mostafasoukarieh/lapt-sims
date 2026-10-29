// Particle model of matter: small discs in constant and random motion, with elastic collisions.
// Canvas coordinates (y downwards). A container is a rectangle { x0, y0, x1, y1 } or a circle { cx, cy, r }.

// Seeded random numbers, so a simulation starts the same way each time (Reset).
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// n particles of radius r placed at random (without overlap, as far as possible) inside region.
export function scatter(n, { r, kind = 0, region, speed = 60, rand = Math.random, avoid = [] }) {
  const out = [];
  const all = [...avoid];
  for (let i = 0; i < n; i++) {
    let x, y, ok = false;
    for (let tries = 0; tries < 60 && !ok; tries++) {
      x = region.x0 + r + rand() * (region.x1 - region.x0 - 2 * r);
      y = region.y0 + r + rand() * (region.y1 - region.y0 - 2 * r);
      ok = all.every((q) => (q.x - x) ** 2 + (q.y - y) ** 2 > (q.r + r) ** 2);
    }
    const a = rand() * Math.PI * 2;
    const p = { x, y, vx: speed * Math.cos(a), vy: speed * Math.sin(a), r, kind };
    out.push(p); all.push(p);
  }
  return out;
}

// Particles on a triangular lattice filling region (solid state), each vibrating about its site.
export function lattice(region, { r, kind = 0, gap = 0.12 }) {
  const d = 2 * r * (1 + gap), h = d * Math.sqrt(3) / 2;
  const out = [];
  for (let j = 0, y = region.y1 - r; y >= region.y0 + r; j++, y -= h) {
    for (let x = region.x0 + r + (j % 2 ? d / 2 : 0); x <= region.x1 - r; x += d) out.push({ x, y, sx: x, sy: y, vx: 0, vy: 0, r, kind, ph: (x * 7.3 + y * 3.1) % 6.28 });
  }
  return out;
}

// One time step: free motion (+ gravity), walls, collisions between particles, thermostat towards speed v0.
// opts: { box | circle, g = 0, v0 = 60, tau = 0.5, damp = 0 }
export function step(ps, dt, opts) {
  const { box, circle, g = 0, v0 = 60, tau = 0.5 } = opts;
  for (const p of ps) {
    p.vy += g * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (box) {
      if (p.x < box.x0 + p.r) { p.x = box.x0 + p.r; p.vx = Math.abs(p.vx); }
      if (p.x > box.x1 - p.r) { p.x = box.x1 - p.r; p.vx = -Math.abs(p.vx); }
      if (p.y < box.y0 + p.r) { p.y = box.y0 + p.r; p.vy = Math.abs(p.vy); }
      if (p.y > box.y1 - p.r) { p.y = box.y1 - p.r; p.vy = -Math.abs(p.vy); }
    }
    if (circle) {
      const dx = p.x - circle.cx, dy = p.y - circle.cy, d = Math.hypot(dx, dy), lim = circle.r - p.r;
      if (d > lim) {
        const nx = dx / d, ny = dy / d;
        p.x = circle.cx + nx * lim; p.y = circle.cy + ny * lim;
        const vn = p.vx * nx + p.vy * ny;
        if (vn > 0) { p.vx -= 2 * vn * nx; p.vy -= 2 * vn * ny; }
      }
    }
  }
  // collisions (equal masses): exchange the normal components of the velocities
  const n = ps.length;
  for (let i = 0; i < n; i++) {
    const a = ps[i];
    for (let j = i + 1; j < n; j++) {
      const b = ps[j];
      const dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r;
      if (dx > rr || dx < -rr || dy > rr || dy < -rr) continue;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 === 0) continue;
      const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, over = (rr - d) / 2;
      a.x -= nx * over; a.y -= ny * over; b.x += nx * over; b.y += ny * over;
      const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rel < 0) { a.vx += rel * nx; a.vy += rel * ny; b.vx -= rel * nx; b.vy -= rel * ny; }
    }
  }
  // thermostat: the agitation stays as chosen (the particles never stop)
  if (n && v0 > 0) {
    let ke = 0;
    for (const p of ps) ke += p.vx * p.vx + p.vy * p.vy;
    const vrms = Math.sqrt(ke / n) || 1;
    const k = Math.sqrt(1 + (dt / tau) * ((v0 * v0) / (vrms * vrms) - 1));
    for (const p of ps) { p.vx *= k; p.vy *= k; }
  }
}

// Vibration of a solid about its lattice sites (amplitude a in px).
export function vibrate(ps, time, a) {
  for (const p of ps) {
    p.x = p.sx + a * Math.sin(time * 9 + p.ph);
    p.y = p.sy + a * Math.cos(time * 11 + p.ph * 1.7);
  }
}

// Mean distance between the centres of nearest neighbours, in particle diameters (collision radius).
export function meanNearest(ps) {
  if (ps.length < 2) return 0;
  let s = 0;
  for (const a of ps) {
    let best = Infinity;
    for (const b of ps) { if (a === b) continue; const d = (a.x - b.x) ** 2 + (a.y - b.y) ** 2; if (d < best) best = d; }
    s += Math.sqrt(best) / (2 * a.r);
  }
  return s / ps.length;
}

// A particle may be drawn smaller (p.dr) than its collision radius p.r, to keep small spaces between neighbours.
export function drawParticles(ctx, ps, colors) {
  for (const p of ps) {
    ctx.fillStyle = colors[p.kind] ?? colors[0];
    ctx.beginPath(); ctx.arc(p.x, p.y, p.dr ?? p.r, 0, Math.PI * 2); ctx.fill();
  }
}

// Mean distance between particles (centre to centre), in diameters of the drawn particles:
// square root of the area per particle; the area is the region they occupy (width × height of the layer).
export function meanSpacing(ps, x0, x1, yTop, yBottom) {
  if (!ps.length) return 0;
  const d = 2 * (ps[0].dr ?? ps[0].r);
  return Math.sqrt(((x1 - x0) * (yBottom - yTop)) / ps.length) / d;
}
