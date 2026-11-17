// Sec 3 SE-LH — Chapter 3: Sources of energy and the pollution they cause (whole chapter).
import strings from './strings.js';
import { initSim, DEBUG } from '../../../shared/sim-shell.js';
import { t, onLangChange } from '../../../shared/i18n.js';
import { num, qty } from '../../../shared/format.js';
import { createButton, createSegmented, createSlider, el } from '../../../shared/controls.js';
import { setupCanvas, cssVar, onThemeChange, roundRect, arrow } from '../../../shared/draw.js';
import { createLoop } from '../../../shared/loop.js';
import { label } from '../../../shared/figures.js';
import { calcCell, calcSig, calcDone } from '../../../shared/calc-cell.js';

const TAU = 2 * Math.PI;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const W = 600;
const TABS = ['plants', 'sun', 'history', 'pollution', 'practice'];
const HEIGHTS = { plants: 340, sun: 320, history: 330, pollution: 340, practice: 300 };

/* ================================================================
   Book data
   ================================================================ */
// Power plants: renewable?, kind of chimney output, and the forms of energy in the chain.
const PLANTS = {
  hydro: { renew: true, smoke: null },
  wind: { renew: true, smoke: null },
  solar: { renew: true, smoke: null },
  coal: { renew: false, smoke: 'dark' },
  oil: { renew: false, smoke: 'grey' },
  gas: { renew: false, smoke: 'light' },
  nuclear: { renew: false, smoke: 'steam' },
  geo: { renew: true, smoke: 'steam' },
  biomass: { renew: true, smoke: 'grey' },
};
const SUN = { bright: 1, average: 0.2 }; // kW per m² (page 31)
// History (pages 30): dominant source by period; gas and nuclear: "also used" (years approximate, not in the book)
const ERAS = [
  { key: 'wood', from: 1700, to: 1880 },
  { key: 'coal', from: 1880, to: 1948 },
  { key: 'oil', from: 1948, to: 2000 },
];
const ALSO = [
  { key: 'gas', from: 1950, to: 2000 },
  { key: 'nuclear', from: 1956, to: 2000 },
];
const EVENTS = [
  { year: 1775, key: 'ev.steam' },
  { year: 1880, key: 'ev.coal' },
  { year: 1890, key: 'ev.ice' },
  { year: 1948, key: 'ev.oil' },
  { year: 1950, key: 'ev.gas' },
  { year: 1956, key: 'ev.nuclear' },
];
// Practice cards: [question key, options, answer]
const SETS = {
  renew: { options: ['o.renew', 'o.nonrenew'], items: [['sunlight', 0], ['wind', 0], ['water', 0], ['wood', 0], ['geo', 0], ['tides', 0], ['coal', 1], ['oil', 1], ['gas', 1], ['u235', 1], ['pu239', 1]] },
  primary: { options: ['o.primary', 'o.secondary'], items: [['electricity', 1], ['coal', 0], ['sunlight', 0], ['waterfall', 0], ['gas', 0], ['wood', 0]] },
  degrad: { options: ['o.bio', 'o.nondeg'], items: [['sewage', 0], ['wastewater', 0], ['ddt', 1], ['dioxins', 1], ['mercury', 1], ['lead', 1], ['radio', 1]] },
  where: { options: ['o.air', 'o.water', 'o.soil'], items: [['co', 0], ['smog', 0], ['so2', 0], ['untreated', 1], ['coolwater', 1], ['salts', 2], ['pathogens', 2]] },
  health: { options: ['o.bronchitis', 'o.blood', 'o.cancerMetal', 'o.lung'], items: [['so2h', 0], ['coh', 1], ['metals', 2], ['cigarette', 3]] },
  tf: { options: ['o.true', 'o.false'], items: [['tfa', 1], ['tfb', 1], ['tfc', 0], ['tfd', 0], ['tfe', 0], ['tff', 1], ['tfg', 1], ['tfh', 1], ['tfi', 1], ['tfj', 0], ['tfk', 0], ['tfl', 1]] },
};

function initialState(tab) {
  switch (tab) {
    case 'plants': return { plant: 'hydro', run: true, phase: 0 };
    case 'sun': return { device: 'cells', light: 'bright', S: 4, h: 5, rows: [], fb: null };
    case 'history': return { year: 1700 };
    case 'pollution': return { mode: 'smog', traffic: 60, filters: false, gases: 1, spray: false, ddt: 0 };
    default: return { set: 'renew', order: [], i: 0, picked: null, ok: 0, total: 0 };
  }
}
let S = Object.fromEntries(TABS.map((k) => [k, initialState(k)]));

/* ================================================================
   Canvas and loop
   ================================================================ */
let shell;
let drawQueued = false;
let now = 0;
const canvas = document.getElementById('stage');
const view = setupCanvas(canvas, { width: W, height: 340, maxHeightVh: () => (window.innerWidth < 880 ? 50 : 76), onResize: () => requestDraw() });
function requestDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; draw(); });
}
onThemeChange(() => requestDraw());
const loop = createLoop({
  step(dt) {
    now += dt;
    if (!shell) return false;
    if (shell.tab === 'pollution') {
      const st = S.pollution;
      if (st.mode === 'ddt') st.ddt = st.spray ? Math.min(1, st.ddt + dt / 12) : Math.max(0, st.ddt - dt / 30);
    }
    return true;
  },
  render() { draw(); updateMeasures(); },
});

/* ================================================================
   Drawing helpers
   ================================================================ */
function note(ctx, s, x, y, o = {}) { label(ctx, s, x, y, { size: 12, weight: 600, color: cssVar('--muted'), ...o }); }
function wrapLines(ctx, text, maxW, font) {
  ctx.save(); ctx.font = font;
  const words = String(text).split(' '), lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  ctx.restore();
  return lines;
}
function sun(ctx, x, y, r = 30, rays = true) {
  ctx.fillStyle = cssVar('--sun');
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  if (rays) {
    ctx.strokeStyle = cssVar('--sun'); ctx.lineWidth = 3;
    for (let k = 0; k < 10; k++) {
      const a = k * TAU / 10 + now * 0.3;
      ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * (r + 6), y + Math.sin(a) * (r + 6)); ctx.lineTo(x + Math.cos(a) * (r + 16), y + Math.sin(a) * (r + 16)); ctx.stroke();
    }
  }
}
function smokePuffs(ctx, x, y, kind, n = 10, spread = 1) {
  const col = { dark: 'rgba(40,40,40,0.55)', grey: 'rgba(110,110,110,0.45)', light: 'rgba(170,170,170,0.3)', steam: 'rgba(235,240,245,0.85)' }[kind];
  ctx.fillStyle = col;
  for (let k = 0; k < n; k++) {
    const u = ((now * 0.25 + k / n) % 1);
    ctx.beginPath(); ctx.arc(x + Math.sin(k * 1.7 + now) * 6 * spread + u * 40 * spread, y - u * 90, 6 + u * 16, 0, TAU); ctx.fill();
  }
}
function building(ctx, x, y, w, h, color = cssVar('--box')) {
  ctx.fillStyle = color; ctx.fillRect(x, y - h, w, h);
  ctx.fillStyle = cssVar('--sky');
  for (let k = 0; k < Math.floor(w / 18); k++) ctx.fillRect(x + 6 + k * 18, y - h + 10, 8, 8);
}
function turbineGen(ctx, x, y, spin) {
  // turbine (blades) + generator (G)
  ctx.save(); ctx.translate(x, y); ctx.rotate(spin);
  ctx.fillStyle = cssVar('--metal');
  for (let k = 0; k < 6; k++) { ctx.rotate(TAU / 6); ctx.fillRect(-2, 2, 4, 14); }
  ctx.restore();
  ctx.fillStyle = cssVar('--s5'); ctx.beginPath(); ctx.arc(x + 38, y, 14, 0, TAU); ctx.fill();
  label(ctx, 'G', x + 38, y, { size: 12, weight: 800, color: '#fff', halo: false });
  ctx.strokeStyle = cssVar('--metal'); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + 4, y); ctx.lineTo(x + 24, y); ctx.stroke();
}
function windmill(ctx, x, y, h, spin) {
  ctx.strokeStyle = cssVar('--silver'); ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - h); ctx.stroke();
  ctx.save(); ctx.translate(x, y - h); ctx.rotate(spin);
  ctx.fillStyle = cssVar('--paper');
  for (let k = 0; k < 3; k++) { ctx.rotate(TAU / 3); ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(0, -h * 0.55); ctx.lineTo(4, 0); ctx.fill(); }
  ctx.restore();
  ctx.fillStyle = cssVar('--metal'); ctx.beginPath(); ctx.arc(x, y - h, 4, 0, TAU); ctx.fill();
}
function pylonsAndTown(ctx, x0, yG, lit) {
  // power line from the plant to the town
  ctx.strokeStyle = cssVar('--wire'); ctx.lineWidth = 1.5;
  for (const px of [x0 + 20, x0 + 80]) {
    ctx.beginPath(); ctx.moveTo(px - 8, yG); ctx.lineTo(px, yG - 70); ctx.lineTo(px + 8, yG); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px - 10, yG - 62); ctx.lineTo(px + 10, yG - 62); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(x0 - 30, yG - 62); ctx.quadraticCurveTo(x0 + 50, yG - 50, x0 + 80, yG - 62); ctx.quadraticCurveTo(x0 + 110, yG - 52, x0 + 130, yG - 40); ctx.stroke();
  if (lit) {
    ctx.fillStyle = cssVar('--gold');
    for (let k = 0; k < 3; k++) { const u = (now * 0.6 + k / 3) % 1; ctx.beginPath(); ctx.arc(x0 - 30 + u * 160, yG - 62 + Math.sin(u * Math.PI) * 10, 3, 0, TAU); ctx.fill(); }
  }
  // houses
  for (let k = 0; k < 3; k++) {
    const hx = x0 + 120 + k * 26, hh = 26 + (k % 2) * 10;
    ctx.fillStyle = cssVar('--stone'); ctx.fillRect(hx, yG - hh, 22, hh);
    ctx.fillStyle = lit ? cssVar('--gold') : cssVar('--soot');
    ctx.fillRect(hx + 4, yG - hh + 6, 5, 5); ctx.fillRect(hx + 13, yG - hh + 6, 5, 5);
  }
}
function radSign(ctx, x, y, r) {
  ctx.fillStyle = cssVar('--gold'); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.fillStyle = '#222';
  for (let k = 0; k < 3; k++) { const a = -Math.PI / 2 + k * TAU / 3; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r * 0.85, a - 0.5, a + 0.5); ctx.closePath(); ctx.fill(); }
  ctx.fillStyle = cssVar('--gold'); ctx.beginPath(); ctx.arc(x, y, r * 0.22, 0, TAU); ctx.fill();
  ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(x, y, r * 0.14, 0, TAU); ctx.fill();
}

function draw() {
  if (!shell) return;
  const tab = shell.tab;
  if (view.height !== HEIGHTS[tab]) view.setLogicalSize(W, HEIGHTS[tab]);
  const ctx = view.begin();
  ctx.fillStyle = cssVar('--scene-bg');
  roundRect(ctx, 0, 0, W, HEIGHTS[tab], 14);
  ctx.fill();
  ({ plants: drawPlants, sun: drawSun, history: drawHistory, pollution: drawPollution, practice: drawPractice })[tab](ctx, S[tab]);
}

/* ---------- Tab 1: power plants ---------- */
function drawPlants(ctx, st) {
  const yG = 270, P = PLANTS[st.plant], run = st.run;
  const spin = run ? now * 4 : 0;
  ctx.fillStyle = cssVar('--sky'); ctx.fillRect(8, 8, W - 16, yG - 8);
  ctx.fillStyle = cssVar('--grass'); ctx.fillRect(8, yG, W - 16, 40);
  label(ctx, t(`plant.${st.plant}`), 300, 24, { size: 15, weight: 800 });
  const plantX = 230; // building / generator area
  switch (st.plant) {
    case 'hydro': {
      // mountain lake behind a dam, pipe to the turbine house
      ctx.fillStyle = cssVar('--land'); ctx.beginPath(); ctx.moveTo(8, yG); ctx.lineTo(8, 80); ctx.lineTo(150, 80); ctx.lineTo(200, yG); ctx.fill();
      ctx.fillStyle = cssVar('--water'); ctx.fillRect(14, 80, 120, 34);
      ctx.fillStyle = cssVar('--stone'); ctx.fillRect(134, 74, 14, 46);
      ctx.strokeStyle = cssVar('--water'); ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(148, 112); ctx.lineTo(plantX + 10, yG - 30); ctx.stroke();
      if (run) { ctx.fillStyle = '#fff'; for (let k = 0; k < 5; k++) { const u = (now * 0.8 + k / 5) % 1; ctx.beginPath(); ctx.arc(148 + u * (plantX + 10 - 148), 112 + u * (yG - 30 - 112), 2.5, 0, TAU); ctx.fill(); } }
      building(ctx, plantX, yG, 90, 60);
      turbineGen(ctx, plantX + 24, yG - 22, spin);
      note(ctx, t('pl.lake'), 74, 70, { size: 11 });
      break;
    }
    case 'wind':
      for (let k = 0; k < 4; k++) windmill(ctx, 60 + k * 70, yG, 110 - k * 8, spin * 0.7 + k);
      note(ctx, t('pl.windNote'), 160, 60, { size: 11 });
      break;
    case 'solar':
      sun(ctx, 60, 60, 26);
      for (let k = 0; k < 8; k++) {
        const px = 30 + (k % 4) * 60, py = yG - 30 - Math.floor(k / 4) * 40;
        ctx.save(); ctx.translate(px, py); ctx.transform(1, 0, -0.4, 1, 0, 0);
        ctx.fillStyle = cssVar('--panel'); ctx.fillRect(0, -20, 50, 22);
        ctx.strokeStyle = cssVar('--silver'); ctx.lineWidth = 1;
        for (let g = 1; g < 4; g++) { ctx.beginPath(); ctx.moveTo(g * 12.5, -20); ctx.lineTo(g * 12.5, 2); ctx.stroke(); }
        ctx.restore();
      }
      if (run) { ctx.strokeStyle = cssVar('--sun'); ctx.lineWidth = 2; ctx.setLineDash([6, 6]); ctx.lineDashOffset = -now * 20; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(80 + k * 10, 80); ctx.lineTo(60 + k * 60, yG - 60); ctx.stroke(); } ctx.setLineDash([]); }
      break;
    case 'nuclear': {
      ctx.fillStyle = cssVar('--water'); ctx.fillRect(8, yG + 8, W - 16, 12);
      note(ctx, t('pl.river'), 14, yG + 30, { size: 11, align: 'left' });
      // radioactive waste barrels
      for (let k = 0; k < 2; k++) { ctx.fillStyle = cssVar('--box'); ctx.fillRect(16 + k * 26, yG - 26, 20, 26); }
      radSign(ctx, 26, yG - 13, 7); radSign(ctx, 52, yG - 13, 7);
      ctx.fillStyle = cssVar('--stone'); ctx.beginPath(); ctx.arc(125, yG - 50, 45, Math.PI, 0); ctx.fill(); ctx.fillRect(80, yG - 50, 90, 50);
      label(ctx, t('pl.reactor'), 125, yG - 30, { size: 11, weight: 800, color: '#fff', halo: false });
      // cooling tower
      ctx.fillStyle = cssVar('--silver'); ctx.beginPath(); ctx.moveTo(180, yG); ctx.quadraticCurveTo(198, yG - 60, 190, yG - 110); ctx.lineTo(232, yG - 110); ctx.quadraticCurveTo(224, yG - 60, 244, yG); ctx.fill();
      if (run) smokePuffs(ctx, 211, yG - 115, 'steam', 10, 1.2);
      building(ctx, plantX + 30, yG, 90, 60); turbineGen(ctx, plantX + 54, yG - 22, spin);
      break;
    }
    case 'geo':
      ctx.fillStyle = cssVar('--hot'); ctx.globalAlpha = 0.5; ctx.fillRect(8, yG + 18, W - 16, 22); ctx.globalAlpha = 1;
      note(ctx, t('pl.hotCore'), 170, yG + 30, { size: 11, align: 'left' });
      ctx.strokeStyle = cssVar('--metal'); ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(150, yG + 26); ctx.lineTo(150, yG - 20); ctx.lineTo(plantX, yG - 20); ctx.stroke();
      building(ctx, plantX, yG, 90, 60); turbineGen(ctx, plantX + 24, yG - 22, spin);
      if (run) smokePuffs(ctx, plantX + 70, yG - 66, 'steam', 8);
      break;
    default: {
      // thermal plants (coal, oil, natural gas) and biomass: fuel → boiler → steam → turbine → generator
      const fx = 70;
      if (st.plant === 'coal' || st.plant === 'biomass') {
        ctx.fillStyle = st.plant === 'coal' ? cssVar('--soot') : cssVar('--wood');
        ctx.beginPath(); ctx.moveTo(fx - 50, yG); ctx.quadraticCurveTo(fx, yG - 70, fx + 50, yG); ctx.fill();
      } else if (st.plant === 'oil') {
        ctx.fillStyle = cssVar('--metal'); roundRect(ctx, fx - 40, yG - 70, 80, 70, 8); ctx.fill();
        label(ctx, t('pl.oilTank'), fx, yG - 36, { size: 11, weight: 800, color: '#fff', halo: false });
      } else {
        ctx.strokeStyle = cssVar('--gold'); ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(8, yG - 20); ctx.lineTo(plantX - 50, yG - 20); ctx.stroke();
        label(ctx, t('pl.gasPipe'), fx, yG - 36, { size: 11, weight: 800 });
      }
      // boiler with flame and chimney
      ctx.fillStyle = cssVar('--brick'); ctx.fillRect(plantX - 70, yG - 80, 60, 80);
      ctx.fillRect(plantX - 60, yG - 150, 16, 70);
      if (run) {
        ctx.fillStyle = cssVar('--flame-out'); ctx.beginPath(); ctx.ellipse(plantX - 40, yG - 18, 18, 12 + 3 * Math.sin(now * 15), 0, 0, TAU); ctx.fill();
        smokePuffs(ctx, plantX - 52, yG - 150, P.smoke, 10);
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 3; ctx.setLineDash([4, 4]); ctx.lineDashOffset = -now * 30;
        ctx.beginPath(); ctx.moveTo(plantX - 10, yG - 60); ctx.lineTo(plantX + 24, yG - 22); ctx.stroke(); ctx.setLineDash([]);
      }
      label(ctx, t('pl.boiler'), plantX - 40, yG - 66, { size: 11, weight: 800, color: '#fff', halo: false });
      building(ctx, plantX, yG, 90, 60); turbineGen(ctx, plantX + 24, yG - 22, spin);
      break;
    }
  }
  pylonsAndTown(ctx, 380, yG, run);
  // energy chain under the scene
  label(ctx, t(`chain.${st.plant}`), 300, yG + 52, { size: 12, weight: 800, color: cssVar('--brand-navy') });
}

/* ---------- Tab 2: sunlight ---------- */
function drawSun(ctx, st) {
  const p = SUN[st.light], yG = 280;
  ctx.fillStyle = st.light === 'bright' ? cssVar('--sky') : cssVar('--sky-cloudy');
  ctx.fillRect(8, 8, W - 16, yG - 8);
  sun(ctx, 70, 60, 30, st.light === 'bright');
  if (st.light === 'average') { ctx.fillStyle = 'rgba(255,255,255,0.85)'; for (const [x, y] of [[90, 70], [120, 60], [105, 50]]) { ctx.beginPath(); ctx.arc(x, y, 20, 0, TAU); ctx.fill(); } }
  ctx.fillStyle = cssVar('--bench'); ctx.fillRect(8, yG, W - 16, 30);
  // roof with S panels of 1 m² each (up to 20)
  ctx.fillStyle = cssVar('--stone'); ctx.fillRect(180, yG - 100, 300, 100);
  ctx.fillStyle = cssVar('--brick'); ctx.beginPath(); ctx.moveTo(160, yG - 100); ctx.lineTo(500, yG - 100); ctx.lineTo(470, yG - 120); ctx.lineTo(190, yG - 120); ctx.fill();
  const n = st.S;
  for (let k = 0; k < n; k++) {
    const col = k % 10, row = Math.floor(k / 10);
    const x = 200 + col * 27, y = yG - 140 - row * 21;
    ctx.fillStyle = st.device === 'cells' ? cssVar('--panel') : cssVar('--collector');
    ctx.fillRect(x, y, 24, 18);
    ctx.strokeStyle = cssVar('--silver'); ctx.lineWidth = 1; ctx.strokeRect(x, y, 24, 18);
  }
  label(ctx, `S = ${qty(st.S, 0, 'm²')}`, 330, yG - 180, { size: 13, weight: 800 });
  // rays
  ctx.strokeStyle = cssVar('--sun'); ctx.lineWidth = st.light === 'bright' ? 2.5 : 1.2; ctx.setLineDash([8, 6]); ctx.lineDashOffset = -now * 30;
  for (let k = 0; k < (st.light === 'bright' ? 6 : 3); k++) { ctx.beginPath(); ctx.moveTo(100, 80 + k * 6); ctx.lineTo(212 + k * 45, yG - 135); ctx.stroke(); }
  ctx.setLineDash([]);
  label(ctx, `${qty(p, 1, 'kW')} ${t('sun.perM2')}`, 140, 120, { size: 13, weight: 800, color: cssVar('--brand-red'), align: 'left' });
  // use: hot water tank or lamp/battery
  if (st.device === 'heater') {
    ctx.fillStyle = cssVar('--metal'); roundRect(ctx, 510, yG - 170, 60, 34, 14); ctx.fill();
    label(ctx, t('sun.tank'), 540, yG - 186, { size: 11, weight: 800 });
    ctx.strokeStyle = cssVar('--hot'); ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(470, yG - 150); ctx.lineTo(510, yG - 150); ctx.stroke();
  } else {
    ctx.fillStyle = cssVar('--box'); roundRect(ctx, 515, yG - 70, 50, 70, 6); ctx.fill();
    label(ctx, t('sun.battery'), 540, yG - 80, { size: 11, weight: 800 });
    ctx.strokeStyle = cssVar('--wire'); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(470, yG - 150); ctx.lineTo(540, yG - 150); ctx.lineTo(540, yG - 70); ctx.stroke();
  }
  note(ctx, t(st.device === 'cells' ? 'sun.cellsNote' : 'sun.heaterNote'), 300, yG + 16, { size: 11 });
}

/* ---------- Tab 3: history ---------- */
const HX = (y) => 50 + ((y - 1700) / 300) * 500;
function drawHistory(ctx, st) {
  const yAxis = 220;
  label(ctx, t('hi.title'), 300, 22, { size: 14, weight: 800 });
  // dominant source bands
  const colors = { wood: cssVar('--wood'), coal: cssVar('--soot'), oil: cssVar('--brand-navy'), gas: cssVar('--gold'), nuclear: cssVar('--s5') };
  ERAS.forEach((e) => {
    ctx.fillStyle = colors[e.key]; ctx.fillRect(HX(e.from), yAxis - 60, HX(e.to) - HX(e.from), 40);
    label(ctx, t(`src.${e.key}`), (HX(e.from) + HX(e.to)) / 2, yAxis - 40, { size: 12, weight: 800, color: '#fff', halo: false });
  });
  note(ctx, t('hi.dominant'), 50, yAxis - 70, { size: 11, align: 'left' });
  ALSO.forEach((e, i) => {
    const y = yAxis - 100 - i * 18;
    ctx.fillStyle = colors[e.key]; ctx.fillRect(HX(e.from), y, HX(e.to) - HX(e.from), 12);
    label(ctx, t(`src.${e.key}`), HX(e.from) - 6, y + 6, { size: 11, weight: 800, align: 'right' });
  });
  // axis
  ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(50, yAxis); ctx.lineTo(550, yAxis); ctx.stroke();
  for (let y = 1700; y <= 2000; y += 50) {
    ctx.beginPath(); ctx.moveTo(HX(y), yAxis); ctx.lineTo(HX(y), yAxis + 6); ctx.stroke();
    label(ctx, String(y), HX(y), yAxis + 18, { size: 11, weight: 600, color: cssVar('--muted') });
  }
  // events
  EVENTS.forEach((e) => {
    const past = st.year >= e.year;
    ctx.fillStyle = past ? cssVar('--brand-red') : cssVar('--muted');
    ctx.beginPath(); ctx.arc(HX(e.year), yAxis, 4, 0, TAU); ctx.fill();
  });
  // year marker
  ctx.strokeStyle = cssVar('--brand-red'); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(HX(st.year), 40); ctx.lineTo(HX(st.year), yAxis + 30); ctx.stroke();
  label(ctx, String(st.year), HX(st.year), yAxis + 42, { size: 13, weight: 800, color: cssVar('--brand-red') });
  const ev = [...EVENTS].reverse().find((e) => st.year >= e.year);
  const lines = wrapLines(ctx, ev ? t(ev.key) : t('hi.start'), 520, '600 13px system-ui');
  lines.slice(0, 3).forEach((l, i) => label(ctx, l, 300, yAxis + 66 + i * 18, { size: 13, weight: 600 }));
}
function dominantAt(year) { return (ERAS.find((e) => year >= e.from && year < e.to) || ERAS[ERAS.length - 1]).key; }

/* ---------- Tab 4: pollution ---------- */
function drawPollution(ctx, st) {
  if (st.mode === 'smog') drawSmog(ctx, st);
  else if (st.mode === 'greenhouse') drawGreenhouse(ctx, st);
  else drawDDT(ctx, st);
}
function smogLevel(st) { return (st.traffic / 100) * (st.filters ? 0.75 : 1); }
function drawSmog(ctx, st) {
  const yG = 260, haze = smogLevel(st);
  ctx.fillStyle = cssVar('--sky'); ctx.fillRect(8, 8, W - 16, yG - 8);
  // hills and Beirut skyline, sea on the left
  ctx.fillStyle = cssVar('--sea'); ctx.fillRect(8, yG - 20, 90, 20);
  ctx.fillStyle = cssVar('--land'); ctx.beginPath(); ctx.moveTo(400, yG); ctx.quadraticCurveTo(500, 60, W - 8, 90); ctx.lineTo(W - 8, yG); ctx.fill();
  for (let k = 0; k < 14; k++) { const h = 30 + ((k * 37) % 70); ctx.fillStyle = cssVar('--stone'); ctx.fillRect(100 + k * 22, yG - h, 18, h); }
  label(ctx, t('po.beirut'), 250, yG + 18, { size: 12, weight: 800 });
  // traffic
  const nCars = Math.round(st.traffic / 10);
  for (let k = 0; k < nCars; k++) { const x = ((k * 53 + now * 40) % 420) + 100; ctx.fillStyle = k % 2 ? cssVar('--brand-red') : cssVar('--brand-blue'); roundRect(ctx, x, yG - 8, 16, 8, 2); ctx.fill(); }
  // smog layer: brownish haze over the city
  const g = ctx.createLinearGradient(0, 40, 0, yG);
  g.addColorStop(0, `rgba(150,110,60,${0.05 * haze})`); g.addColorStop(1, `rgba(140,100,50,${0.65 * haze})`);
  ctx.fillStyle = g; ctx.fillRect(90, 40, 330, yG - 40);
  // observer on the hill
  ctx.fillStyle = cssVar('--text'); ctx.beginPath(); ctx.arc(520, 92, 5, 0, TAU); ctx.fill();
  note(ctx, t('po.fromHills'), 520, 70, { size: 11 });
  label(ctx, `${t('po.haze')} ${num(Math.round(haze * 100), 0)} %`, 160, 30, { size: 13, weight: 800, color: cssVar('--brand-red') });
  note(ctx, t('po.illustrative'), 300, yG + 40, { size: 11 });
}
function ghRise(gases) { return [0, 0.6, 2.25][gases]; } // °C: before industry, today (illustrative), 2100 (book: between 1 and 3.5 °C)
function drawGreenhouse(ctx, st) {
  // Earth, Sun, incoming light passes, heat going out is partly sent back by the greenhouse gases
  ctx.fillStyle = cssVar('--night'); ctx.fillRect(8, 8, W - 16, HEIGHTS.pollution - 16);
  sun(ctx, 70, 70, 34);
  const ex = 380, ey = 420, R = 260;
  ctx.fillStyle = cssVar('--earth-sea'); ctx.beginPath(); ctx.arc(ex, ey, R, 0, TAU); ctx.fill();
  ctx.fillStyle = cssVar('--earth-land'); ctx.beginPath(); ctx.ellipse(ex - 60, ey - R + 40, 70, 22, 0, 0, TAU); ctx.fill();
  // greenhouse gas layer
  const a = [0.12, 0.28, 0.5][st.gases];
  ctx.strokeStyle = `rgba(200,200,200,${a})`; ctx.lineWidth = 26;
  ctx.beginPath(); ctx.arc(ex, ey, R + 40, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
  label(ctx, t('po.gasLayer'), 300, 104, { size: 11, weight: 800, color: '#fff', halo: false });
  // sunlight in (yellow), passes the layer
  ctx.strokeStyle = cssVar('--sun'); ctx.fillStyle = cssVar('--sun'); ctx.lineWidth = 3;
  for (let k = 0; k < 3; k++) arrow(ctx, 110 + k * 20, 100 + k * 10, 280 + k * 50, 190 + k * 6, 9);
  // heat out (red): part escapes, part is sent back
  const back = [1, 2, 3][st.gases];
  ctx.strokeStyle = cssVar('--hot'); ctx.fillStyle = cssVar('--hot');
  for (let k = 0; k < 4; k++) {
    const x = 330 + k * 45;
    if (k < back) { arrow(ctx, x, 170, x + 10, 125, 8); arrow(ctx, x + 12, 125, x + 20, 165, 8); }
    else arrow(ctx, x, 170, x + 20, 40, 9);
  }
  label(ctx, t('po.lightIn'), 160, 150, { size: 11, weight: 800, color: cssVar('--sun'), halo: false });
  label(ctx, t('po.heatOut'), 480, 30, { size: 11, weight: 800, color: cssVar('--hot'), halo: false });
  const rise = ghRise(st.gases);
  label(ctx, t(`po.gh${st.gases}`), 300, HEIGHTS.pollution - 50, { size: 13, weight: 800, color: '#fff', halo: false });
  label(ctx, st.gases === 2 ? t('po.rise2100') : st.gases === 1 ? t('po.riseToday') : t('po.rise0'), 300, HEIGHTS.pollution - 28, { size: 12, weight: 700, color: cssVar('--gold'), halo: false });
}
function drawDDT(ctx, st) {
  // water → plankton → fish → bird → eggs: DDT dots accumulate up the chain
  const y = 150, xs = [70, 190, 310, 430, 540];
  const keys = ['water', 'plankton', 'fish', 'bird', 'eggs'];
  label(ctx, t('po.ddtTitle'), 300, 24, { size: 14, weight: 800 });
  keys.forEach((k, i) => {
    ctx.fillStyle = [cssVar('--water'), cssVar('--leaf'), cssVar('--s3'), cssVar('--box'), cssVar('--paper')][i];
    ctx.beginPath(); ctx.arc(xs[i], y, 38, 0, TAU); ctx.fill();
    label(ctx, t(`po.${k}`), xs[i], y + 56, { size: 12, weight: 800 });
    // DDT dots: more at each level (accumulation)
    const n = Math.round(st.ddt * [3, 6, 12, 24, 24][i]);
    ctx.fillStyle = cssVar('--brand-red');
    for (let d = 0; d < n; d++) { const a = d * 2.4, r = 6 + (d % 5) * 5.5; ctx.beginPath(); ctx.arc(xs[i] + Math.cos(a) * r, y + Math.sin(a) * r, 2.6, 0, TAU); ctx.fill(); }
    if (i < keys.length - 1) { ctx.strokeStyle = cssVar('--muted'); ctx.fillStyle = cssVar('--muted'); ctx.lineWidth = 2; arrow(ctx, xs[i] + 42, y, xs[i + 1] - 42, y, 8); }
  });
  if (st.ddt > 0.75) {
    // eggs fail to hatch
    ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(xs[4] - 20, y - 20); ctx.lineTo(xs[4] - 4, y - 4); ctx.lineTo(xs[4] - 12, y + 6); ctx.lineTo(xs[4] + 8, y + 22); ctx.stroke();
    label(ctx, t('po.noHatch'), 300, y + 100, { size: 13, weight: 800, color: cssVar('--brand-red') });
  }
  note(ctx, t('po.ddtNote'), 300, HEIGHTS.pollution - 20, { size: 11 });
}

/* ---------- Tab 5: practice ---------- */
function drawPractice(ctx, st) {
  const card = currentCard(st);
  label(ctx, t(`set.${st.set}`), 300, 24, { size: 13, weight: 800, color: cssVar('--muted') });
  ctx.fillStyle = cssVar('--surface'); ctx.strokeStyle = cssVar('--border'); ctx.lineWidth = 1.5;
  roundRect(ctx, 50, 44, 500, 150, 16); ctx.fill(); ctx.stroke();
  if (card) {
    const lines = wrapLines(ctx, t(`card.${card[0]}`), 440, '800 18px system-ui');
    lines.slice(0, 4).forEach((l, i) => label(ctx, l, 300, 119 - (lines.length - 1) * 12 + i * 24, { size: 18, weight: 800 }));
  }
  if (st.picked != null && card) {
    const ok = st.picked === card[1];
    label(ctx, ok ? '✓' : '✗', 530, 64, { size: 22, weight: 800, color: ok ? cssVar('--good') : cssVar('--bad') });
  }
  // score ring
  const frac = st.total ? st.ok / st.total : 0;
  ctx.strokeStyle = cssVar('--border'); ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(300, 248, 32, 0, TAU); ctx.stroke();
  ctx.strokeStyle = cssVar('--good'); ctx.beginPath(); ctx.arc(300, 248, 32, -Math.PI / 2, -Math.PI / 2 + frac * TAU); ctx.stroke();
  label(ctx, `${st.ok} / ${st.total}`, 300, 248, { size: 14, weight: 800 });
  note(ctx, `${t('pr.card')} ${Math.min(st.i + 1, st.order.length)} / ${st.order.length}`, 300, 292, { size: 11 });
}
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function startSet(st) { st.order = shuffle(SETS[st.set].items.map((_, i) => i)); st.i = 0; st.picked = null; st.ok = 0; st.total = 0; }
function currentCard(st) { const set = SETS[st.set]; const idx = st.order[st.i]; return idx == null ? null : set.items[idx]; }

/* ================================================================
   Controls and measurements
   ================================================================ */
const controlsBody = document.getElementById('controls-body');
const measuresBody = document.getElementById('measures-body');
let ui = {};
let tableSig = '';
function measRows(dl, rows) { dl.replaceChildren(...rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)])); }
function statusBox() { return el('p', { class: 'status', hidden: '' }); }
function showStatus(box, fb) {
  if (!fb) { box.hidden = true; return; }
  box.hidden = false; box.className = `status ${fb.type || ''}`; box.textContent = t(fb.key, fb.params);
}
function hint(key) { return el('p', { class: 'muted', style: 'font-size:0.88rem;margin:10px 0 0', dataset: { i18n: key } }, t(key)); }
const btnRow = (...b) => el('div', { class: 'btn-row' }, b);
const resetBtn = (id) => btnRow(createButton({ labelKey: 'ui.reset', variant: 'ghost', onClick: () => resetTab(id) }));
const fbOf = (res, okKey, badKey) => (res === 'invalid' ? { type: 'warn', key: 'calcInvalid' } : res === 'wrong' ? { type: 'bad', key: badKey } : { type: 'good', key: okKey });

/* ---------- Tab 1 ---------- */
function buildPlants() {
  const st = S.plants;
  controlsBody.append(
    createSegmented({ labelKey: 'ctl.plant', options: Object.keys(PLANTS).map((v) => ({ value: v, labelKey: `plantS.${v}` })), value: st.plant, onChange: (v) => { st.plant = v; refresh(); } }).root,
    createSegmented({ labelKey: 'ctl.run', options: [{ value: 'on', labelKey: 'run.on' }, { value: 'off', labelKey: 'run.off' }], value: st.run ? 'on' : 'off', onChange: (v) => { st.run = v === 'on'; refresh(); } }).root,
    hint('hint.plants'), resetBtn('plants'),
  );
  ui.dl = el('dl', { class: 'meas' });
  measuresBody.append(ui.dl);
}
function updatePlants() {
  const st = S.plants, P = PLANTS[st.plant];
  measRows(ui.dl, [
    [t('m.source'), t(`src.of.${st.plant}`)],
    [t('m.renew'), t(P.renew ? 'o.renew' : 'o.nonrenew')],
    [t('m.chain'), t(`chain.${st.plant}`)],
    [t('m.emits'), t(`emits.${st.plant}`)],
    [t('m.drawback'), t(`draw.${st.plant}`)],
    [t('m.fact'), t(`fact.${st.plant}`)],
  ]);
}

/* ---------- Tab 2 ---------- */
function buildSun() {
  const st = S.sun;
  controlsBody.append(
    createSegmented({ labelKey: 'ctl.device', options: [{ value: 'cells', labelKey: 'dev.cells' }, { value: 'heater', labelKey: 'dev.heater' }], value: st.device, onChange: (v) => { st.device = v; refresh(); } }).root,
    createSegmented({ labelKey: 'ctl.light', options: [{ value: 'bright', labelKey: 'light.bright' }, { value: 'average', labelKey: 'light.average' }], value: st.light, onChange: (v) => { st.light = v; refresh(); } }).root,
    createSlider({ labelKey: 'ctl.S', min: 1, max: 20, step: 1, value: st.S, unit: 'm²', onInput: (v) => { st.S = v; refresh(); } }).root,
    createSlider({ labelKey: 'ctl.hours', min: 1, max: 10, step: 1, value: st.h, unit: 'h', onInput: (v) => { st.h = v; refresh(); } }).root,
    btnRow(createButton({ labelKey: 'ctl.record', variant: 'primary', onClick: () => { st.rows.push({ S: st.S, p: SUN[st.light], h: st.h }); st.fb = null; refresh(); } })),
    hint('hint.sun'), resetBtn('sun'),
  );
  ui.dl = el('dl', { class: 'meas' });
  ui.tableWrap = el('div', { class: 'table-scroll' });
  ui.table = el('table', { class: 'data' });
  ui.tableWrap.append(ui.table);
  ui.clear = el('div', { class: 'btn-row', style: 'margin-top:8px' }, [createButton({ labelKey: 'ctl.clearTable', variant: 'ghost', onClick: () => { st.rows = []; st.fb = null; refresh(); } })]);
  ui.status = statusBox();
  measuresBody.append(ui.dl, ui.tableWrap, ui.clear, ui.status);
}
function updateSun() {
  const st = S.sun;
  measRows(ui.dl, [[t('m.S'), qty(st.S, 0, 'm²')], [t('m.p'), `${qty(SUN[st.light], 1, 'kW')} ${t('sun.perM2')}`], [t('m.hours'), qty(st.h, 0, 'h')]]);
  const rows = st.rows, sig = calcSig(rows) + rows.length;
  if (sig !== tableSig) {
    const cb = (okK, badK) => (res) => { st.fb = fbOf(res, okK, badK); refresh(); };
    ui.table.replaceChildren(
      el('thead', {}, el('tr', {}, ['col.S', 'col.p', 'col.P', 'col.h', 'col.E'].map((k) => el('th', {}, t(k))))),
      el('tbody', {}, rows.map((r) => el('tr', {}, [
        el('td', {}, num(r.S, 0)), el('td', {}, num(r.p, 1)),
        calcCell(r, 'P', { expected: r.S * r.p, decimals: 1, tol: 0.05, onCheck: cb('fb.POk', 'fb.PWrong') }),
        el('td', {}, num(r.h, 0)),
        calcCell(r, 'E', { expected: r.S * r.p * r.h, decimals: 1, tol: 0.05, disabled: !calcDone(r, 'P'), onCheck: cb('fb.EOk', 'fb.EWrong') }),
      ]))),
    );
    tableSig = sig;
  }
  ui.tableWrap.hidden = rows.length === 0;
  ui.clear.hidden = ui.tableWrap.hidden;
  showStatus(ui.status, st.fb);
}

/* ---------- Tab 3 ---------- */
function buildHistory() {
  const st = S.history;
  controlsBody.append(
    createSlider({ labelKey: 'ctl.year', min: 1700, max: 2000, step: 5, value: st.year, unit: '', onInput: (v) => { st.year = v; refresh(); } }).root,
    hint('hint.history'), resetBtn('history'),
  );
  ui.dl = el('dl', { class: 'meas' });
  measuresBody.append(ui.dl);
}
function updateHistory() {
  const st = S.history;
  const d = dominantAt(st.year);
  const order = { wood: 1, coal: 2, oil: 3 }[d];
  measRows(ui.dl, [[t('m.year'), String(st.year)], [t('m.dominant'), t(`src.${d}`)], [t('m.rank'), t(`rank.${order}`)]]);
}

/* ---------- Tab 4 ---------- */
function buildPollution() {
  const st = S.pollution;
  controlsBody.append(createSegmented({ labelKey: 'ctl.pollution', options: ['smog', 'greenhouse', 'ddt'].map((v) => ({ value: v, labelKey: `mode.${v}` })), value: st.mode,
    onChange: (v) => { if (v === st.mode) return; S.pollution = { ...initialState('pollution'), mode: v }; buildTab('pollution'); } }).root);
  if (st.mode === 'smog') {
    controlsBody.append(
      createSlider({ labelKey: 'ctl.traffic', min: 0, max: 100, step: 10, value: st.traffic, unit: '%', onInput: (v) => { st.traffic = v; refresh(); } }).root,
      createSegmented({ labelKey: 'ctl.filters', options: [{ value: 'no', labelKey: 'no' }, { value: 'yes', labelKey: 'yes' }], value: st.filters ? 'yes' : 'no', onChange: (v) => { st.filters = v === 'yes'; refresh(); } }).root,
    );
  } else if (st.mode === 'greenhouse') {
    controlsBody.append(createSegmented({ labelKey: 'ctl.gases', options: [0, 1, 2].map((v) => ({ value: String(v), labelKey: `gas.${v}` })), value: String(st.gases), onChange: (v) => { st.gases = Number(v); refresh(); } }).root);
  } else {
    ui.go = createButton({ labelKey: 'ctl.spray', variant: 'primary', onClick: () => { st.spray = !st.spray; refresh(); } });
    controlsBody.append(btnRow(ui.go));
  }
  controlsBody.append(hint(`hint.${st.mode}`), resetBtn('pollution'));
  ui.dl = el('dl', { class: 'meas' });
  measuresBody.append(ui.dl);
}
function updatePollution() {
  const st = S.pollution;
  if (st.mode === 'smog') {
    measRows(ui.dl, [
      [t('m.pollutants'), t('po.list')],
      [t('m.lead'), t(st.filters ? 'po.metalsLow' : 'po.metalsHigh')],
      [t('m.health'), t('po.healthList')],
      [t('m.breathe'), t('po.breathe')],
    ]);
  } else if (st.mode === 'greenhouse') {
    measRows(ui.dl, [[t('m.gases'), t('po.gasesList')], [t('m.rise'), t(st.gases === 2 ? 'po.rise2100v' : st.gases === 1 ? 'po.riseTodayV' : 'po.rise0v')], [t('m.effects'), t('po.effects')]]);
  } else {
    if (ui.go) { const k = st.spray ? 'ctl.stopSpray' : 'ctl.spray'; if (ui.go.dataset.i18n !== k) { ui.go.dataset.i18n = k; ui.go.textContent = t(k); } }
    measRows(ui.dl, [[t('m.ddt'), `${num(Math.round(st.ddt * 100), 0)} %`], [t('m.kind'), t('o.nondeg')], [t('m.birds'), t(st.ddt > 0.75 ? 'po.birdsBad' : 'po.birdsOk')]]);
  }
}

/* ---------- Tab 5 ---------- */
function buildPractice() {
  const st = S.practice;
  if (!st.order.length) startSet(st);
  controlsBody.append(createSegmented({ labelKey: 'ctl.set', options: Object.keys(SETS).map((v) => ({ value: v, labelKey: `setS.${v}` })), value: st.set, onChange: (v) => { st.set = v; startSet(st); buildTab('practice'); } }).root);
  ui.opts = el('div', { class: 'btn-row' });
  ui.fb = statusBox();
  ui.next = createButton({ labelKey: 'ctl.next', variant: 'primary', onClick: () => {
    if (st.i < st.order.length - 1) { st.i++; st.picked = null; } else startSet(st);
    renderOptions(); refresh();
  } });
  controlsBody.append(ui.opts, ui.fb, btnRow(ui.next), hint('hint.practice'), resetBtn('practice'));
  ui.dl = el('dl', { class: 'meas' });
  measuresBody.append(ui.dl);
  renderOptions();
}
function renderOptions() {
  const st = S.practice, set = SETS[st.set], card = currentCard(st);
  ui.opts.replaceChildren(...set.options.map((o, k) => {
    const b = createButton({ labelKey: o, variant: st.picked == null ? 'secondary' : k === card[1] ? 'primary' : 'ghost', onClick: () => {
      if (st.picked != null) return;
      st.picked = k; st.total++; if (k === card[1]) st.ok++;
      renderOptions(); refresh();
    } });
    if (st.picked != null && k === st.picked && k !== card[1]) b.classList.add('is-wrong');
    return b;
  }));
  if (st.picked == null) showStatus(ui.fb, null);
  else showStatus(ui.fb, { type: st.picked === card[1] ? 'good' : 'bad', key: `why.${st.set}.${card[0]}` });
  ui.next.hidden = st.picked == null;
  const k = st.i >= st.order.length - 1 ? 'ctl.newRound' : 'ctl.next';
  if (ui.next.dataset.i18n !== k) { ui.next.dataset.i18n = k; ui.next.textContent = t(k); }
}
function updatePractice() {
  const st = S.practice;
  measRows(ui.dl, [[t('m.set'), t(`set.${st.set}`)], [t('m.score'), `${st.ok} / ${st.total}`], [t('m.left'), num(Math.max(0, st.order.length - st.i - (st.picked == null ? 0 : 1)), 0)]]);
}

/* ---------- Tab switching ---------- */
function buildTab(id) {
  controlsBody.replaceChildren();
  measuresBody.replaceChildren();
  ui = {};
  tableSig = '';
  ({ plants: buildPlants, sun: buildSun, history: buildHistory, pollution: buildPollution, practice: buildPractice })[id]();
  loop.start();
  shell?.refreshActivity();
  refresh();
}
function updateMeasures() {
  if (!shell || !ui.dl) return;
  ({ plants: updatePlants, sun: updateSun, history: updateHistory, pollution: updatePollution, practice: updatePractice })[shell.tab]();
}
function refresh() { updateMeasures(); requestDraw(); }
function resetTab(id) { const keep = id === 'pollution' ? { mode: S.pollution.mode } : id === 'practice' ? { set: S.practice.set } : {}; S[id] = { ...initialState(id), ...keep }; buildTab(id); }
onLangChange(() => { if (shell) buildTab(shell.tab); });
shell = initSim({
  strings,
  tabs: TABS.map((id) => ({ id, labelKey: `tab.${id}` })),
  initialTab: 'plants',
  onTab: buildTab,
  activityKey: (tab) => (tab === 'pollution' ? `act.pollution.${S.pollution.mode}` : `act.${tab}`),
});
shell.start();
if (DEBUG) window.__sim = { get S() { return S; } };
