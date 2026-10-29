// Real sounds with the Web Audio API (owner's decision, 28 Oct 2026). The audio context is created and
// resumed only after a tap of the student (browsers refuse sound before a user gesture).
let ctx = null;
let master = null;
let muted = false;
const voices = new Set();

export function audioCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch { return null; }
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}
export const audioAvailable = () => !!(window.AudioContext || window.webkitAudioContext);
export function setMuted(m) {
  muted = m;
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.02);
}
export const isMuted = () => muted;

// A continuous tone. harmonics: relative amplitudes of the partials 1, 2, 3… (default: pure sine).
export function createVoice({ freq = 440, harmonics = null, gain = 0 } = {}) {
  const c = audioCtx();
  if (!c) return null;
  const osc = c.createOscillator();
  if (harmonics) {
    const real = new Float32Array(harmonics.length + 1), imag = new Float32Array(harmonics.length + 1);
    harmonics.forEach((a, i) => { imag[i + 1] = a; });
    osc.setPeriodicWave(c.createPeriodicWave(real, imag));
  }
  osc.frequency.value = freq;
  const g = c.createGain();
  g.gain.value = gain;
  osc.connect(g).connect(master);
  osc.start();
  const v = {
    setFreq(f) { osc.frequency.setTargetAtTime(f, c.currentTime, 0.015); },
    setGain(x, tau = 0.03) { g.gain.setTargetAtTime(Math.max(0, x), c.currentTime, tau); },
    // exponential decay to silence with time constant tau (s), like a struck tuning fork
    strike(peak, tau) {
      const t0 = c.currentTime;
      g.gain.cancelScheduledValues(t0);
      g.gain.setValueAtTime(g.gain.value, t0);
      g.gain.linearRampToValueAtTime(peak, t0 + 0.01);
      g.gain.setTargetAtTime(0, t0 + 0.01, tau);
    },
    stop() {
      try { g.gain.setTargetAtTime(0, c.currentTime, 0.02); osc.stop(c.currentTime + 0.15); } catch { /* already stopped */ }
      voices.delete(v);
    },
  };
  voices.add(v);
  return v;
}

// A short burst of filtered noise (a shout, a knock). delay in s, duration in s.
export function noiseBurst({ delay = 0, duration = 0.25, gain = 0.3, freq = 900, q = 1.2 } = {}) {
  const c = audioCtx();
  if (!c) return;
  const n = Math.floor(c.sampleRate * duration);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const env = Math.min(1, i / (0.02 * c.sampleRate)) * Math.exp(-3 * i / n);
    d[i] = (Math.random() * 2 - 1) * env;
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(bp).connect(g).connect(master);
  src.start(c.currentTime + delay);
}

// A continuous filtered noise (the hiss of a radio tuned on an empty frequency). Same interface as a voice.
export function createNoise({ gain = 0, freq = 2500, q = 0.5 } = {}) {
  const c = audioCtx();
  if (!c) return null;
  const n = c.sampleRate * 2;
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf; src.loop = true;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(bp).connect(g).connect(master);
  src.start();
  const v = {
    setFreq(f) { bp.frequency.setTargetAtTime(f, c.currentTime, 0.02); },
    setGain(x, tau = 0.03) { g.gain.setTargetAtTime(Math.max(0, x), c.currentTime, tau); },
    stop() {
      try { g.gain.setTargetAtTime(0, c.currentTime, 0.02); src.stop(c.currentTime + 0.15); } catch { /* already stopped */ }
      voices.delete(v);
    },
  };
  voices.add(v);
  return v;
}

export function stopAll() { for (const v of [...voices]) v.stop(); }
document.addEventListener('visibilitychange', () => { if (document.hidden) stopAll(); });
