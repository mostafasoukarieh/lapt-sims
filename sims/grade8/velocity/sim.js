// Grade 8 — Instant, duration and velocity (Ch.3 parts 1–2: Act. 1–4)
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num, qty } from '../../../shared/format.js';
import { createButton, createSegmented, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, font } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { label, person } from '../../../shared/figures.js';
import { drawStopwatch, drawClock, fmtStopwatch, fmtClock, hms } from '../../../shared/stopwatch.js';
import { calcCell, calcSig, calcDone, matches } from '../../../shared/calc-cell.js';

/* ================================================================
   Model
   ================================================================ */
const RACE = { L: 100, T: 20.82 }; // m, s (book reading 00':20'':82)
const TRIP = { d: 60, T: 45, t1: hms(9, 0, 0), odo0: 319241 }; // km, min
const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

// Speed profile of the car (km/h) along the trip, scaled so that 60 km take exactly 45 min.
const PROFILE = (() => {
  const N = 4500, dt = TRIP.T / N; // min
  const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  const raw = (tau) => smooth(tau / 2.2) * smooth((TRIP.T - tau) / 2.2)
    * (1 + 0.24 * Math.sin((2 * Math.PI * tau) / 13 + 0.6) + 0.11 * Math.sin((2 * Math.PI * tau) / 4.7 + 1.9) - 0.18 * Math.exp(-(((tau - 24) / 2.2) ** 2)));
  let sum = 0;
  for (let i = 0; i < N; i++) sum += raw((i + 0.5) * dt) * dt;
  const k = (TRIP.d * 60) / sum; // km/h scale: ∫v dτ/60 = d
  const dist = new Float64Array(N + 1);
  for (let i = 0; i < N; i++) dist[i + 1] = dist[i] + (k * raw((i + 0.5) * dt) * dt) / 60;
  return { v: (tau) => k * raw(tau), x: (tau) => { const f = Math.max(0, Math.min(N, tau / dt)); const i = Math.floor(f); return i >= N ? dist[N] : dist[i] + (dist[i + 1] - dist[i]) * (f - i); } };
})();

function initialState() {
  return {
    instant: { t1: hms(8, 0, 0), t2: hms(8, 50, 5), book: true, input: '', fb: null, ok: 0, total: 0, solved: false },
    stopwatch: {
      mode: 'race', sw: 0, running: false, raceT: 0, raceOn: false, pressed: null, pressT: 0,
      tries: [], fb: null, readT: 20.82, readInput: '', readOk: 0, readTotal: 0,
    },
    trip: { tau: 0, running: false, slow: false, row: {}, notes: [], fb: null },
  };
}
let S = initialState();

/* ================================================================
   Canvas and loop
   ================================================================ */
const SCENE = { w: 600, h: 340 };
let shell;
let drawQueued = false;
let phase = 0;
const canvas = document.getElementById('stage');
const view = setupCanvas(canvas, { width: SCENE.w, height: SCENE.h, maxHeightVh: () => (window.innerWidth < 880 ? 46 : 72), onResize: () => requestDraw() });
function requestDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; draw(); });
}
onThemeChange(() => requestDraw());

const loop = createLoop({
  step(dt) {
    if (!shell) return false;
    phase += dt;
    const tab = shell.tab;
    if (tab === 'stopwatch') {
      const st = S.stopwatch;
      if (st.pressed && phase - st.pressT > 0.15) st.pressed = null;
      if (st.running) st.sw += dt;
      if (st.raceOn) st.raceT += dt;
      if (st.running && st.sw > 60) stopSw();
      return st.running || st.raceOn || !!st.pressed;
    }
    if (tab === 'average' || tab === 'speedometer') {
      const st = S.trip;
      if (!st.running) return false;
      st.tau = Math.min(TRIP.T, st.tau + dt * (st.slow ? 1 : 3));
      if (st.tau >= TRIP.T) { st.running = false; syncPlay(false); refresh(true); return false; }
      return true;
    }
    return false;
  },
  render() { draw(); updateMeasures(); },
});

/* ================================================================
   Drawing
   ================================================================ */
function draw() {
  if (!shell) return;
  const ctx = view.begin();
  ctx.fillStyle = cssVar('--scene-bg');
  ctx.fillRect(0, 0, SCENE.w, SCENE.h);
  if (shell.tab === 'instant') drawInstant(ctx);
  else if (shell.tab === 'stopwatch') drawStopwatchTab(ctx);
  else drawTrip(ctx);
}

function digital(ctx, x, y, w, h, text, size = 26) {
  ctx.fillStyle = cssVar('--box');
  roundRect(ctx, x - w / 2, y - h / 2, w, h, 8);
  ctx.fill();
  ctx.fillStyle = '#7dfc9b';
  ctx.font = font(size, 700);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 1);
}

/* ---------- Tab 1: instant and duration ---------- */
function drawInstant(ctx) {
  const st = S.instant;
  ctx.fillStyle = cssVar('--board');
  roundRect(ctx, 8, 8, SCENE.w - 16, SCENE.h - 16, 12);
  ctx.fill();
  const items = [[150, st.t1, st.book ? 'clock1' : 'clockA'], [450, st.t2, st.book ? 'clock2' : 'clockB']];
  for (const [x, sec, key] of items) {
    label(ctx, t(key), x, 34, { size: 14, weight: 700 });
    drawClock(ctx, x, 140, 86, sec);
    digital(ctx, x, 270, 170, 46, fmtClock(sec));
  }
  // the duration between the two instants (asked to the student)
  ctx.strokeStyle = cssVar('--accent'); ctx.fillStyle = cssVar('--accent'); ctx.lineWidth = 2.5;
  const y = 318;
  ctx.beginPath(); ctx.moveTo(150, y); ctx.lineTo(450, y); ctx.stroke();
  for (const [x, d] of [[150, 1], [450, -1]]) {
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + d * 10, y - 6); ctx.lineTo(x + d * 10, y + 6); ctx.closePath(); ctx.fill();
  }
  const dur = st.solved ? qty(st.t2 - st.t1, 0, 's') : '?';
  label(ctx, t('durLabel', { d: dur }), 300, y - 14, { size: 13, weight: 700, color: cssVar('--accent') });
}

/* ---------- Tab 2: stopwatch ---------- */
const TRACK = { x0: 40, x1: 400, y: 250 };
let swHits = {};
function drawStopwatchTab(ctx) {
  const st = S.stopwatch;
  ctx.fillStyle = cssVar('--sky');
  roundRect(ctx, 8, 8, SCENE.w - 16, SCENE.h - 16, 12);
  ctx.fill();
  if (st.mode === 'race') {
    // track
    ctx.fillStyle = '#c0573e';
    ctx.fillRect(8, TRACK.y - 30, SCENE.w - 16, 56);
    ctx.fillStyle = cssVar('--grass');
    ctx.fillRect(8, TRACK.y + 26, SCENE.w - 16, SCENE.h - TRACK.y - 34);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
    for (const yy of [TRACK.y - 28, TRACK.y + 24]) { ctx.beginPath(); ctx.moveTo(8, yy); ctx.lineTo(SCENE.w - 8, yy); ctx.stroke(); }
    ctx.lineWidth = 4;
    for (const [x, key] of [[TRACK.x0, 'start'], [TRACK.x1, 'finish']]) {
      ctx.beginPath(); ctx.moveTo(x, TRACK.y - 28); ctx.lineTo(x, TRACK.y + 24); ctx.stroke();
      label(ctx, t(key), x, TRACK.y + 40, { size: 12, weight: 700 });
    }
    // distance marks every 10 m
    ctx.lineWidth = 1;
    for (let m = 10; m < RACE.L; m += 10) {
      const x = TRACK.x0 + (m / RACE.L) * (TRACK.x1 - TRACK.x0);
      ctx.beginPath(); ctx.moveTo(x, TRACK.y + 20); ctx.lineTo(x, TRACK.y + 24); ctx.stroke();
    }
    // runner: constant speed during the race, slows down after the line
    const v = RACE.L / RACE.T;
    let xm = 0;
    if (st.raceT > 0) xm = st.raceT <= RACE.T ? v * st.raceT : RACE.L + Math.min(10, v * (st.raceT - RACE.T) * 0.5);
    const x = TRACK.x0 + (xm / RACE.L) * (TRACK.x1 - TRACK.x0);
    const moving = st.raceOn && st.raceT < RACE.T + 2;
    person(ctx, x, TRACK.y + 14, { color: cssVar('--s2'), h: 58, walk: moving ? phase * 11 : null, run: moving, face: 1 });
    label(ctx, `${num(Math.min(xm, RACE.L), 0)} m`, x, TRACK.y - 64, { size: 12, weight: 600, color: cssVar('--muted') });
    swHits = drawStopwatch(ctx, 500, 128, 76, st.sw, { pressed: st.pressed, running: st.running });
  } else {
    swHits = {};
    drawStopwatch(ctx, 300, 180, 120, st.readT, {});
  }
}

/* ---------- Tabs 3–4: trip Jounieh → Tripoli ---------- */
const ROAD = { x0: 60, x1: 540, y: 86 };
function drawTrip(ctx) {
  const st = S.trip;
  const x = PROFILE.x(st.tau);
  const v = PROFILE.v(st.tau);
  // map strip: sea to the West (top), road along the coast, Tripoli to the North (right)
  ctx.fillStyle = cssVar('--land');
  roundRect(ctx, 8, 8, SCENE.w - 16, 140, 12);
  ctx.fill();
  ctx.fillStyle = cssVar('--sea');
  ctx.beginPath(); ctx.moveTo(8, 20); ctx.lineTo(SCENE.w - 8, 20); ctx.lineTo(SCENE.w - 8, 52);
  for (let xx = SCENE.w - 8; xx >= 8; xx -= 20) ctx.lineTo(xx, 54 + Math.sin(xx / 31) * 5);
  ctx.closePath(); ctx.fill();
  label(ctx, t('sea'), 300, 36, { size: 12, weight: 600, color: cssVar('--water-dark'), halo: false });
  ctx.strokeStyle = cssVar('--road'); ctx.lineWidth = 12; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(ROAD.x0, ROAD.y); ctx.lineTo(ROAD.x1, ROAD.y); ctx.stroke();
  ctx.strokeStyle = cssVar('--road-line'); ctx.lineWidth = 1.5; ctx.setLineDash([8, 8]);
  ctx.beginPath(); ctx.moveTo(ROAD.x0, ROAD.y); ctx.lineTo(ROAD.x1, ROAD.y); ctx.stroke();
  ctx.setLineDash([]);
  for (const [xx, key] of [[ROAD.x0, 'jounieh'], [ROAD.x1, 'tripoli']]) {
    ctx.fillStyle = cssVar('--text');
    ctx.beginPath(); ctx.arc(xx, ROAD.y, 6, 0, Math.PI * 2); ctx.fill();
    label(ctx, t(key), xx, ROAD.y + 24, { size: 13, weight: 700 });
  }
  // north arrow
  ctx.strokeStyle = cssVar('--text'); ctx.fillStyle = cssVar('--text'); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(500, 128); ctx.lineTo(540, 128); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(546, 128); ctx.lineTo(536, 123); ctx.lineTo(536, 133); ctx.closePath(); ctx.fill();
  label(ctx, t('north'), 488, 128, { size: 12, weight: 800 });
  // car
  const cx = ROAD.x0 + (x / TRIP.d) * (ROAD.x1 - ROAD.x0);
  ctx.fillStyle = cssVar('--s1');
  roundRect(ctx, cx - 13, ROAD.y - 7, 26, 14, 4); ctx.fill();
  ctx.fillStyle = 'rgba(220, 238, 252, 0.9)';
  ctx.fillRect(cx + 3, ROAD.y - 5, 6, 10);
  // dashboard
  ctx.fillStyle = cssVar('--box');
  roundRect(ctx, 8, 156, SCENE.w - 16, SCENE.h - 164, 14);
  ctx.fill();
  speedometer(ctx, 170, 254, 80, v);
  // clock and odometer on the right
  label(ctx, t('clock'), 430, 178, { size: 12, weight: 600, color: '#c8d0dc', halo: false });
  digital(ctx, 430, 214, 190, 50, fmtClock(TRIP.t1 + st.tau * 60), 30);
  const odo = TRIP.odo0 + Math.floor(x + 1e-9);
  label(ctx, t('odometer'), 430, 260, { size: 12, weight: 600, color: '#c8d0dc', halo: false });
  ctx.fillStyle = '#e8e8e8';
  roundRect(ctx, 370, 276, 120, 34, 4); ctx.fill();
  ctx.fillStyle = '#111111'; ctx.font = font(22, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(odo), 430, 294);
}
function speedometer(ctx, cx, cy, r, v) {
  const a0 = Math.PI * 0.8, a1 = Math.PI * 2.2, vmax = 220;
  const ang = (s) => a0 + (s / vmax) * (a1 - a0);
  ctx.strokeStyle = '#3a4150'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1); ctx.stroke();
  ctx.strokeStyle = '#f0b13a'; ctx.fillStyle = '#f0b13a';
  ctx.font = font(11, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let s = 0; s <= vmax; s += 10) {
    const a = ang(s), big = s % 20 === 0;
    ctx.lineWidth = big ? 2.5 : 1.2;
    const r1 = r - (big ? 11 : 6);
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); ctx.stroke();
    if (big) ctx.fillText(String(s), cx + Math.cos(a) * (r - 22), cy + Math.sin(a) * (r - 22));
  }
  ctx.fillStyle = '#c8d0dc'; ctx.font = font(10, 600);
  ctx.fillText(t('speedo'), cx, cy + 22);
  const a = ang(Math.max(0, Math.min(vmax, v)));
  ctx.strokeStyle = '#ff8a3d'; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx - Math.cos(a) * 10, cy - Math.sin(a) * 10); ctx.lineTo(cx + Math.cos(a) * (r - 8), cy + Math.sin(a) * (r - 8)); ctx.stroke();
  ctx.fillStyle = '#3a4150';
  ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.fill();
}

/* ================================================================
   Stopwatch actions
   ================================================================ */
function press(id) {
  const st = S.stopwatch;
  st.pressed = id; st.pressT = phase;
  if (id === 'start') {
    if (st.running) return;
    if (st.sw > 0 && !st.raceOn) { st.fb = { type: 'warn', key: 'fb.resetFirst' }; refresh(); loop.start(); return; }
    st.running = true; st.fb = null;
    if (!st.raceOn && st.raceT === 0) st.raceOn = true; // the start signal is given with START
  } else if (id === 'stop') {
    stopSw();
  } else if (id === 'reset') {
    if (st.running) return;
    st.sw = 0; st.raceT = 0; st.raceOn = false; st.fb = null;
  }
  loop.start();
  refresh();
}
function stopSw() {
  const st = S.stopwatch;
  if (!st.running) return;
  st.running = false;
  if (st.raceOn) {
    const reading = Math.floor(st.sw * 100 + 1e-6) / 100;
    st.tries.push(reading);
    if (st.tries.length > 8) st.tries.shift();
    st.fb = st.raceT < RACE.T ? { type: 'warn', key: 'fb.early' } : null;
  }
  refresh();
}

canvas.addEventListener('pointerdown', (ev) => {
  if (!shell || shell.tab !== 'stopwatch' || S.stopwatch.mode !== 'race') return;
  const p = view.toLogical(ev);
  for (const [id, h] of Object.entries(swHits)) {
    if (Math.hypot(p.x - h.x, p.y - h.y) < Math.max(h.r, 22)) { press(id); return; }
  }
});

/* ================================================================
   Controls and measurements
   ================================================================ */
const controlsBody = document.getElementById('controls-body');
const measuresBody = document.getElementById('measures-body');
let ui = {};

function measRows(dl, rows) {
  dl.replaceChildren(...rows.flatMap(([k, v, cls]) => [el('dt', {}, k), el('dd', cls ? { class: cls } : {}, v)]));
}
function statusBox() { return el('p', { class: 'status', hidden: '' }); }
function showStatus(box, fb) {
  if (!fb) { box.hidden = true; return; }
  box.hidden = false;
  box.className = `status ${fb.type || ''}`;
  box.textContent = t(fb.key, fb.params);
}
function hint(key) { return el('p', { class: 'muted', style: 'font-size:0.88rem;margin:10px 0 0', dataset: { i18n: key } }, t(key)); }
function answerInput(id, labelKey, value, onInput, onEnter) {
  const input = el('input', { class: 'text-input', type: 'text', inputmode: 'decimal', autocomplete: 'off', id });
  input.value = value;
  input.addEventListener('input', () => onInput(input.value));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') onEnter(); });
  const lab = el('label', { for: id, dataset: { i18n: labelKey } }, t(labelKey));
  return { input, root: el('div', { class: 'ctl' }, [lab, el('div', { class: 'input-row' }, [input, createButton({ labelKey: 'ctl.check', variant: 'primary', onClick: onEnter })])]) };
}
const fmtDur = (s) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return [h ? `${h} h` : '', m ? `${m} min` : '', x ? `${x} s` : ''].filter(Boolean).join(' ') || '0 s';
};

/* ---------- Tab 1 ---------- */
function buildInstant() {
  const st = S.instant;
  const check = () => {
    const ok = matches(st.input, st.t2 - st.t1);
    if (ok === null) st.fb = { type: 'warn', key: 'fb.invalid' };
    else {
      st.total += 1;
      if (ok) { st.ok += 1; st.solved = true; st.fb = { type: 'good', key: 'fb.correct', params: { v: num(st.t2 - st.t1, 0) } }; }
      else st.fb = { type: 'bad', key: 'fb.wrong' };
    }
    refresh();
  };
  ui.ans = answerInput('dur-input', 'ctl.duration', st.input, (v) => { st.input = v; }, check);
  controlsBody.append(
    el('div', { class: 'btn-row', style: 'margin-bottom:12px' }, [
      createButton({ labelKey: 'ctl.book', variant: 'secondary', onClick: () => newPair(true) }),
      createButton({ labelKey: 'ctl.newInstants', variant: 'primary', onClick: () => newPair(false) }),
    ]),
    ui.ans.root,
    el('div', { class: 'btn-row' }, [
      createButton({ labelKey: 'ctl.showAnswer', variant: 'ghost', onClick: () => { st.solved = true; st.fb = { type: 'warn', key: 'fb.answer', params: { d: fmtDur(st.t2 - st.t1), v: num(st.t2 - st.t1, 0) } }; refresh(); } }),
      createButton({ labelKey: 'ui.reset', variant: 'ghost', onClick: () => resetTab('instant') }),
    ]),
    hint('units.hint'),
  );
  ui.dl = el('dl', { class: 'meas' });
  ui.status = statusBox();
  measuresBody.append(ui.dl, ui.status);
}
function newPair(book) {
  const st = S.instant;
  if (book) { st.t1 = hms(8, 0, 0); st.t2 = hms(8, 50, 5); } else {
    st.t1 = hms(randInt(7, 14), randInt(0, 59), randInt(0, 59));
    st.t2 = st.t1 + randInt(1, 150) * 60 + randInt(1, 59);
  }
  st.book = book; st.input = ''; st.fb = null; st.solved = false;
  if (ui.ans) ui.ans.input.value = '';
  refresh();
}
function updateInstant() {
  const st = S.instant;
  measRows(ui.dl, [
    [t('m.t1'), fmtClock(st.t1)],
    [t('m.t2'), fmtClock(st.t2)],
    [t('m.score'), `${st.ok} / ${st.total}`],
  ]);
  showStatus(ui.status, st.fb);
}

/* ---------- Tab 2 ---------- */
function buildStopwatch() {
  const st = S.stopwatch;
  ui.mode = createSegmented({
    labelKey: 'ctl.mode',
    options: [{ value: 'race', labelKey: 'mode.race' }, { value: 'read', labelKey: 'mode.read' }],
    value: st.mode,
    onChange: (v) => { st.mode = v; buildTab('stopwatch'); },
  });
  controlsBody.append(ui.mode.root);
  if (st.mode === 'race') {
    controlsBody.append(el('div', { class: 'btn-row' }, [
      createButton({ labelKey: 'btn.start', variant: 'primary', onClick: () => press('start') }),
      createButton({ labelKey: 'btn.stop', variant: 'primary', onClick: () => press('stop') }),
      createButton({ labelKey: 'btn.reset', variant: 'secondary', onClick: () => press('reset') }),
    ]), hint('hint.sw'));
    ui.dl = el('dl', { class: 'meas' });
    ui.table = el('table', { class: 'data' });
    ui.clearRow = el('div', { class: 'btn-row', style: 'margin-top:8px' }, [createButton({ labelKey: 'ctl.clearTable', variant: 'ghost', onClick: () => { st.tries = []; refresh(); } })]);
    ui.status = statusBox();
    measuresBody.append(ui.dl, ui.table, ui.clearRow, ui.status);
  } else {
    const check = () => {
      const ok = matches(st.readInput, st.readT);
      if (ok === null) st.fb = { type: 'warn', key: 'fb.invalid' };
      else {
        st.readTotal += 1;
        if (ok) { st.readOk += 1; st.fb = { type: 'good', key: 'fb.readOk', params: { v: num(st.readT, 2) } }; } else st.fb = { type: 'bad', key: 'fb.readWrong' };
      }
      refresh();
    };
    ui.ans = answerInput('read-input', 'ctl.readValue', st.readInput, (v) => { st.readInput = v; }, check);
    controlsBody.append(ui.ans.root, el('div', { class: 'btn-row' }, [
      createButton({ labelKey: 'ctl.newReading', variant: 'primary', onClick: () => {
        let v; do { v = randInt(150, 59999) / 100; } while (Math.abs(v - st.readT) < 0.01);
        st.readT = v; st.readInput = ''; ui.ans.input.value = ''; st.fb = null; refresh();
      } }),
      createButton({ labelKey: 'ctl.showAnswer', variant: 'ghost', onClick: () => { st.fb = { type: 'warn', key: 'fb.readAnswer', params: { r: fmtStopwatch(st.readT), v: num(st.readT, 2) } }; refresh(); } }),
    ]));
    ui.dl = el('dl', { class: 'meas' });
    ui.status = statusBox();
    measuresBody.append(ui.dl, ui.status);
  }
}
let triesSig = '';
function updateStopwatch() {
  const st = S.stopwatch;
  if (st.mode === 'read') {
    measRows(ui.dl, [[t('m.reading'), fmtStopwatch(st.readT)], [t('m.score'), `${st.readOk} / ${st.readTotal}`]]);
    showStatus(ui.status, st.fb);
    return;
  }
  const state = st.running ? 'sw.running' : (st.sw === 0 ? 'sw.ready' : 'sw.stopped');
  measRows(ui.dl, [
    [t('m.reading'), fmtStopwatch(st.sw)],
    [t('m.state'), t(state)],
    [t('m.race'), qty(RACE.T, 2, 's')],
  ]);
  const sig = st.tries.join(',') + t('col.try');
  if (sig !== triesSig) {
    triesSig = sig;
    const head = el('tr', {}, [el('th', {}, t('col.try')), el('th', {}, t('col.reading')), el('th', {}, t('col.diff'))]);
    const body = st.tries.map((r, i) => {
      const d = r - RACE.T;
      return el('tr', {}, [el('td', {}, String(i + 1)), el('td', {}, `${fmtStopwatch(r)} = ${qty(r, 2, 's')}`),
        el('td', { class: Math.abs(d) <= 0.1 ? 'good-text' : '' }, `${d > 0 ? '+' : ''}${qty(d, 2, 's')}`)]);
    });
    ui.table.replaceChildren(el('thead', {}, head), el('tbody', {}, body));
  }
  ui.table.hidden = st.tries.length === 0;
  ui.clearRow.hidden = ui.table.hidden;
  showStatus(ui.status, st.fb);
}

/* ---------- Tabs 3–4: trip ---------- */
function tripControls(tab) {
  const st = S.trip;
  ui.play = createButton({ labelKey: 'ui.play', variant: 'primary', onClick: () => {
    if (st.running) { st.running = false; loop.stop(); syncPlay(false); return; }
    if (st.tau >= TRIP.T) st.tau = 0; // start the trip again
    st.running = true; st.fb = null; loop.start(); syncPlay(true); refresh();
  } });
  ui.speed = createSegmented({
    labelKey: 'ctl.speed',
    options: [{ value: 'normal', labelKey: 'speed.normal' }, { value: 'slow', labelKey: 'speed.slow' }],
    value: st.slow ? 'slow' : 'normal',
    onChange: (v) => { st.slow = v === 'slow'; ui.speed.set(v); },
  });
  const row = [ui.play];
  if (tab === 'speedometer') {
    row.push(createButton({ labelKey: 'ctl.note', variant: 'secondary', onClick: () => {
      if (!st.running) { st.fb = { type: 'warn', key: 'fb.notMoving' }; refresh(); return; }
      st.notes.push({ tau: st.tau, v: Math.round(PROFILE.v(st.tau)) });
      if (st.notes.length > 12) st.notes.shift();
      st.fb = null; refresh(true);
    } }));
  }
  row.push(createButton({ labelKey: 'ui.reset', variant: 'ghost', onClick: () => resetTrip(tab) }));
  controlsBody.append(el('div', { class: 'btn-row', style: 'margin-bottom:12px' }, row), ui.speed.root);
}
function syncPlay(running) {
  if (!ui.play) return;
  ui.play.dataset.i18n = running ? 'ui.pause' : 'ui.play';
  ui.play.textContent = t(ui.play.dataset.i18n);
}
function tripRows() {
  const st = S.trip;
  const x = PROFILE.x(st.tau);
  const where = st.tau <= 0 ? 'where.start' : (st.tau >= TRIP.T ? 'where.end' : 'where.road');
  return [
    [t('m.instant'), fmtClock(TRIP.t1 + st.tau * 60)],
    [t('m.odo'), `${TRIP.odo0 + Math.floor(x + 1e-9)} km`],
    [t('m.speedo'), qty(Math.round(PROFILE.v(st.tau)), 0, 'km/h')],
    [t('m.where'), t(where), st.tau >= TRIP.T ? 'good-text' : ''],
  ];
}
function buildAverage() {
  tripControls('average');
  ui.dl = el('dl', { class: 'meas' });
  ui.calcHead = el('h3', { style: 'font-size:0.95rem;margin:14px 0 0', dataset: { i18n: 'calcTitle' } }, t('calcTitle'));
  ui.table = el('table', { class: 'data' });
  ui.status = statusBox();
  measuresBody.append(ui.dl, ui.calcHead, ui.table, ui.status);
}
const CALCS = [
  { key: 'd', label: 'calc.d', expected: TRIP.d * 1000, decimals: 0 },
  { key: 't', label: 'calc.t', expected: TRIP.T * 60, decimals: 0 },
  { key: 'v', label: 'calc.v', expected: (TRIP.d * 1000) / (TRIP.T * 60), decimals: 1 },
  { key: 'vkm', label: 'calc.vkm', expected: TRIP.d / (TRIP.T / 60), decimals: 0 },
];
let calcTableSig = '';
function updateAverage(force) {
  const st = S.trip;
  measRows(ui.dl, tripRows());
  const arrived = st.tau >= TRIP.T;
  const sig = calcSig([st.row]) + arrived;
  if (force || sig !== calcTableSig) {
    calcTableSig = sig;
    const head = el('tr', {}, [el('th', {}, t('col.q')), el('th', {}, t('col.res'))]);
    let open = arrived;
    const body = CALCS.map((c) => {
      const cell = calcCell(st.row, c.key, {
        expected: c.expected, decimals: c.decimals, disabled: !open,
        onCheck: (res) => {
          if (res === 'invalid') st.fb = { type: 'warn', key: 'calc.invalid' };
          else if (res === 'wrong') st.fb = { type: 'bad', key: c.key === 'v' ? 'calc.hintV' : c.key === 'vkm' ? 'calc.hintKm' : 'calc.wrong' };
          else st.fb = CALCS.every((k) => calcDone(st.row, k.key)) ? { type: 'good', key: 'calc.done' } : null;
          refresh(true);
        },
      });
      if (!calcDone(st.row, c.key)) open = false;
      return el('tr', {}, [el('td', {}, t(c.label)), cell]);
    });
    ui.table.replaceChildren(el('thead', {}, head), el('tbody', {}, body));
  }
  showStatus(ui.status, arrived ? st.fb : { key: 'calc.wait' });
}
function buildSpeedometer() {
  tripControls('speedometer');
  ui.dl = el('dl', { class: 'meas' });
  ui.table = el('table', { class: 'data' });
  ui.clearRow = el('div', { class: 'btn-row', style: 'margin-top:8px' }, [createButton({ labelKey: 'ctl.clearTable', variant: 'ghost', onClick: () => { S.trip.notes = []; refresh(true); } })]);
  ui.status = statusBox();
  measuresBody.append(ui.dl, ui.table, ui.clearRow, ui.status);
}
let notesSig = '';
function updateSpeedometer(force) {
  const st = S.trip;
  measRows(ui.dl, tripRows());
  const sig = st.notes.length + t('col.V');
  if (force || sig !== notesSig) {
    notesSig = sig;
    const head = el('tr', {}, [el('th', {}, t('col.instant')), el('th', {}, t('col.V'))]);
    const body = st.notes.map((n) => el('tr', {}, [el('td', {}, fmtClock(TRIP.t1 + n.tau * 60)), el('td', {}, num(n.v, 0))]));
    ui.table.replaceChildren(el('thead', {}, head), el('tbody', {}, body));
  }
  ui.table.hidden = st.notes.length === 0;
  ui.clearRow.hidden = ui.table.hidden;
  showStatus(ui.status, st.fb);
}
function resetTrip(tab) {
  const keepRow = tab === 'speedometer' ? S.trip.row : {};
  const keepNotes = tab === 'average' ? S.trip.notes : [];
  S.trip = { ...initialState().trip, row: keepRow, notes: keepNotes };
  buildTab(tab);
}

/* ---------- Tab switching ---------- */
function buildTab(id) {
  loop.stop();
  if (S.trip.running) S.trip.running = false;
  controlsBody.replaceChildren();
  measuresBody.replaceChildren();
  ui = {};
  triesSig = ''; calcTableSig = ''; notesSig = '';
  if (id === 'instant') buildInstant();
  else if (id === 'stopwatch') buildStopwatch();
  else if (id === 'average') buildAverage();
  else buildSpeedometer();
  refresh(true);
}
function updateMeasures(force) {
  if (!shell || !ui.dl) return;
  if (shell.tab === 'instant') updateInstant();
  else if (shell.tab === 'stopwatch') updateStopwatch();
  else if (shell.tab === 'average') updateAverage(force);
  else updateSpeedometer(force);
}
function refresh(force) { updateMeasures(force); requestDraw(); }
function resetTab(id) {
  S[id] = initialState()[id];
  buildTab(id);
}

onLangChange(() => { if (shell) buildTab(shell.tab); });

shell = initSim({
  strings,
  tabs: [
    { id: 'instant', labelKey: 'tab.instant' },
    { id: 'stopwatch', labelKey: 'tab.stopwatch' },
    { id: 'average', labelKey: 'tab.average' },
    { id: 'speedometer', labelKey: 'tab.speedometer' },
  ],
  initialTab: 'instant',
  onTab: buildTab,
});
shell.start();

if (DEBUG) window.__sim = { get S() { return S; }, PROFILE };
