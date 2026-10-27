// Fixed-timestep animation loop. step(dt) advances the physics; render(alpha) draws.
// Pauses automatically when the page is hidden.
export function createLoop({ step, render, dt = 1 / 120 }) {
  let running = false;
  let acc = 0;
  let last = 0;
  let raf = 0;

  function frame(ts) {
    if (!running) return;
    const elapsed = Math.min(0.1, (ts - last) / 1000); // avoid spiral after a long pause
    last = ts;
    acc += elapsed;
    while (acc >= dt) { if (step(dt) === false) { stop(); break; } acc -= dt; }
    render?.(acc / dt);
    if (running) raf = requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    acc = 0;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function stop() { running = false; cancelAnimationFrame(raf); }

  let wasRunning = false;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { wasRunning = running; stop(); } else if (wasRunning) start();
  });

  return { start, stop, get running() { return running; } };
}
