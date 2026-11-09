// Turbofan Cycle Explorer — page controller.
// Builds the input form, runs the engine on every change and renders results and stations.

import { runCycle, DEFAULT_INPUTS, PRESETS } from './engine.js';
import { display, convert, formatNumber } from './units.js';
import { renderTabs, renderPanel, STATION_COMPONENT } from './mathPanel.js';
import { COMPONENTS } from './engine.js';
import { renderTs, pointTooltip } from './tsDiagram.js';
import { EngineView } from './engineView.js';
import { renderSweep, SWEEP_X, SWEEP_Y } from './sweep.js';
import { TOUR } from './tour.js';

let view = null;

// ---------------------------------------------------------------- input definitions
// scale: factor from the engine (SI) value to the value typed in the box (e.g. W → kW, fraction → %).
const INPUTS = [
  { group: 'flight', key: 'altitude', label: 'Altitude', sym: 'h', unit: 'm', min: 0, max: 13000, step: 100, dec: 0, alt: 'length' },
  { group: 'flight', key: 'mach', label: 'Flight Mach number', sym: 'M<sub>0</sub>', unit: '', min: 0, max: 0.9, step: 0.01, dec: 2 },

  { group: 'cycle', key: 'TiT', label: 'Turbine inlet temperature', sym: 'T<sub>04</sub>', unit: 'K', min: 1400, max: 1900, step: 5, dec: 1, limit: true },
  { group: 'cycle', key: 'FPR', label: 'Fan pressure ratio', sym: 'FPR', unit: '', min: 1.3, max: 1.8, step: 0.01, dec: 2, limit: true },
  { group: 'cycle', key: 'IPCR', label: 'IP compressor pressure ratio', sym: 'π<sub>IPC</sub>', unit: '', min: 2, max: 10, step: 0.01, dec: 2 },
  { group: 'cycle', key: 'HPCR', label: 'HP compressor pressure ratio', sym: 'π<sub>HPC</sub>', unit: '', min: 2, max: 10, step: 0.01, dec: 2 },
  { group: 'cycle', key: 'BPR', label: 'Bypass ratio', sym: 'BPR', unit: '', min: 4, max: 12, step: 0.1, dec: 1, limit: true },
  { group: 'cycle', key: 'bleed', label: 'Bleed ratio', sym: 'b', unit: '', min: 0, max: 0.15, step: 0.001, dec: 3, limit: true },
  { group: 'cycle', key: 'fanDiameter', label: 'Fan diameter', sym: 'D<sub>fan</sub>', unit: 'm', min: 1.5, max: 3.5, step: 0.01, dec: 2 },

  { group: 'advanced', key: 'P_IPC', label: 'IP spool power offtake', sym: 'P<sub>IPC</sub>', unit: 'kW', scale: 1e-3, min: 0, max: 1000, step: 10, dec: 0 },
  { group: 'advanced', key: 'etaInlet', label: 'Inlet efficiency', sym: 'η<sub>in</sub>', unit: '', min: 0.8, max: 1, step: 0.005, dec: 3 },
  { group: 'advanced', key: 'etaFan', label: 'Fan efficiency', sym: 'η<sub>f</sub>', unit: '', min: 0.8, max: 0.95, step: 0.005, dec: 3 },
  { group: 'advanced', key: 'etaCompressor', label: 'Compressor efficiency (IPC, HPC)', sym: 'η<sub>c</sub>', unit: '', min: 0.8, max: 0.95, step: 0.005, dec: 3 },
  { group: 'advanced', key: 'etaBurner', label: 'Combustion efficiency', sym: 'η<sub>b</sub>', unit: '', min: 0.9, max: 1, step: 0.005, dec: 3 },
  { group: 'advanced', key: 'etaTurbine', label: 'Turbine efficiency (all)', sym: 'η<sub>t</sub>', unit: '', min: 0.8, max: 0.95, step: 0.005, dec: 3 },
  { group: 'advanced', key: 'etaFanNozzle', label: 'Fan nozzle efficiency', sym: 'η<sub>n,fan</sub>', unit: '', min: 0.9, max: 1, step: 0.005, dec: 3 },
  { group: 'advanced', key: 'etaCoreNozzle', label: 'Core nozzle efficiency', sym: 'η<sub>n,core</sub>', unit: '', min: 0.9, max: 1, step: 0.005, dec: 3 },
  { group: 'advanced', key: 'etaMech', label: 'Mechanical efficiency (spools)', sym: 'η<sub>m</sub>', unit: '', min: 0.95, max: 1, step: 0.001, dec: 3 },
  { group: 'advanced', key: 'burnerPressureLoss', label: 'Combustor pressure loss', sym: 'Δp<sub>b</sub>', unit: '%', scale: 100, min: 0, max: 8, step: 0.1, dec: 1 },
  { group: 'advanced', key: 'jetPipePressureLoss', label: 'Jet pipe pressure loss', sym: 'Δp<sub>LPT</sub>', unit: '%', scale: 100, min: 0, max: 5, step: 0.1, dec: 1 },
  { group: 'advanced', key: 'fanFaceMach', label: 'Fan face Mach number', sym: 'M<sub>2</sub>', unit: '', min: 0.5, max: 0.75, step: 0.01, dec: 2 },
  { group: 'advanced', key: 'LHV', label: 'Fuel lower heating value', sym: 'LHV', unit: 'MJ/kg', scale: 1e-6, dec: 1, fixed: true },
  { group: 'advanced', key: 'cpGas', label: 'Hot gas specific heat', sym: 'c<sub>pg</sub>', unit: 'J/kg·K', dec: 0, fixed: true },
  { group: 'advanced', key: 'bleedTempFactor', label: 'Bleed point temperature', sym: 'T<sub>0b</sub>/T<sub>023</sub>', unit: '', dec: 2, fixed: true },
  { group: 'advanced', key: 'bleedPressureFactor', label: 'Bleed point pressure', sym: 'p<sub>0b</sub>/p<sub>023</sub>', unit: '', dec: 1, fixed: true },
];
const GROUPS = [
  { id: 'flight', title: 'Flight condition' },
  { id: 'cycle', title: 'Engine design' },
  { id: 'advanced', title: 'Advanced: efficiencies and losses', collapsible: true },
];
const byKey = Object.fromEntries(INPUTS.map((d) => [d.key, d]));

// ---------------------------------------------------------------- state
const state = {
  values: { ...DEFAULT_INPUTS },
  component: 'inlet',
  sweep: { x: 'BPR', y: 'tsfc' },
};

const UNITS = 'si'; // all values are shown in SI units
const $ = (sel, root = document) => root.querySelector(sel);
const shown = (def, v) => v * (def.scale ?? 1);
const fromShown = (def, v) => v / (def.scale ?? 1);

// ---------------------------------------------------------------- URL hash (shareable case)
function readHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  for (const [k, v] of params) {
    if (k === 'step' && COMPONENTS.some((c) => c.id === v)) state.component = v;
    else if (k in DEFAULT_INPUTS && byKey[k] && !byKey[k].fixed) {
      const n = Number(v);
      if (Number.isFinite(n)) state.values[k] = n;
    }
  }
}

function writeHash() {
  const params = new URLSearchParams();
  for (const d of INPUTS) {
    if (d.fixed) continue;
    const v = state.values[d.key];
    if (v !== DEFAULT_INPUTS[d.key]) params.set(d.key, String(+v.toPrecision(10)));
  }
  if (state.component !== 'inlet') params.set('step', state.component);
  const hash = params.toString();
  history.replaceState(null, '', hash ? `#${hash}` : location.pathname + location.search);
}

// ---------------------------------------------------------------- input form
function inputRow(d) {
  const id = `in-${d.key}`;
  const v = shown(d, state.values[d.key]);
  if (d.fixed) {
    return `<div class="field field-fixed" data-key="${d.key}">
      <span class="field-label">${d.label} <span class="sym">${d.sym}</span></span>
      <span class="field-fixed-value">${formatNumber(v, d.dec)}<span class="unit">${d.unit}</span></span>
    </div>`;
  }
  return `<div class="field" data-key="${d.key}">
    <label class="field-label" for="${id}">${d.label} <span class="sym">${d.sym}</span></label>
    <div class="field-controls">
      <input type="range" id="${id}-range" min="${d.min}" max="${d.max}" step="${d.step}" value="${v}" aria-label="${d.label} slider" tabindex="-1">
      <span class="number-box">
        <input type="number" id="${id}" step="${d.step}" value="${+v.toFixed(d.dec)}" inputmode="decimal">
        <span class="unit">${d.unit}</span>
      </span>
    </div>
    ${d.alt ? `<span class="field-alt" id="${id}-alt"></span>` : ''}
  </div>`;
}

function buildForm() {
  const form = $('#inputs');
  form.innerHTML = GROUPS.map((g) => {
    const rows = INPUTS.filter((d) => d.group === g.id).map(inputRow).join('');
    const extra = g.id === 'cycle' ? '<div class="derived" id="opr"></div>' : '';
    if (g.collapsible) {
      return `<details class="group" id="group-${g.id}"><summary>${g.title}</summary><div class="group-body">${rows}</div></details>`;
    }
    return `<fieldset class="group" id="group-${g.id}"><legend>${g.title}</legend><div class="group-body">${rows}${extra}</div></fieldset>`;
  }).join('');

  form.addEventListener('input', (e) => {
    const field = e.target.closest('.field');
    if (!field) return;
    const d = byKey[field.dataset.key];
    const raw = Number(e.target.value);
    if (e.target.value === '' || !Number.isFinite(raw)) return;
    state.values[d.key] = fromShown(d, raw);
    // keep the twin control in step
    const range = $(`#in-${d.key}-range`), box = $(`#in-${d.key}`);
    if (e.target === range) box.value = +raw.toFixed(d.dec);
    else range.value = raw;
    update();
  });
  form.addEventListener('submit', (e) => e.preventDefault());
}

function syncForm() {
  for (const d of INPUTS) {
    if (d.fixed) continue;
    const v = shown(d, state.values[d.key]);
    $(`#in-${d.key}`).value = +v.toFixed(d.dec);
    $(`#in-${d.key}-range`).value = v;
  }
}

// ---------------------------------------------------------------- rendering helpers
const u = (q, v, dec) => display(q, v, UNITS, dec);
const cell = (q, v, dec) => (v === null || v === undefined || !Number.isFinite(v)) ? '<td class="num empty">—</td>' : `<td class="num">${u(q, v, dec).text}</td>`;
const row = (label, q, v, dec, sym = '') => {
  const d = u(q, v, dec);
  return `<div class="kv"><dt>${label}${sym ? ` <span class="sym">${sym}</span>` : ''}</dt><dd><span class="num">${d.text}</span><span class="unit">${d.unit}</span></dd></div>`;
};
const textRow = (label, text, sym = '') => `<div class="kv"><dt>${label}${sym ? ` <span class="sym">${sym}</span>` : ''}</dt><dd>${text}</dd></div>`;

const STATION_ROWS = [
  ['0', 'Ambient / free stream'],
  ['2', 'Fan face'],
  ['13', 'Fan exit, bypass'],
  ['19', 'Fan nozzle exit'],
  ['21', 'Fan exit, core'],
  ['23', 'IPC exit'],
  ['b', 'HPC bleed point'],
  ['3', 'HPC exit'],
  ['4', 'Combustor exit'],
  ['41', 'HPT exit'],
  ['43', 'IPT exit'],
  ['5', 'LPT exit'],
  ['7', 'Core nozzle inlet'],
  ['9', 'Core nozzle exit'],
];

function renderStations(cycle) {
  const T = convert('temperature', 1, UNITS).unit;
  const P = convert('pressure', 1, UNITS).unit;
  const V = convert('velocity', 1, UNITS).unit;
  const head = `<thead><tr><th scope="col">Station</th><th scope="col" class="loc">Location</th>
    <th scope="col" class="num">T<sub>0</sub> <span class="unit">${T}</span></th>
    <th scope="col" class="num">p<sub>0</sub> <span class="unit">${P}</span></th>
    <th scope="col" class="num">T <span class="unit">${T}</span></th>
    <th scope="col" class="num">p <span class="unit">${P}</span></th>
    <th scope="col" class="num">C <span class="unit">${V}</span></th>
    <th scope="col" class="num">M</th></tr></thead>`;
  const body = STATION_ROWS.map(([id, name]) => {
    const s = cycle.stations[id];
    const flow = s?.flow ?? (['4', '41', '43', '5', '7', '9'].includes(id) ? 'gas' : 'air');
    return `<tr class="${s ? '' : 'missing'} flow-${flow}" data-station="${id}"><th scope="row"><button type="button" class="station-id" data-component="${STATION_COMPONENT[id]}" title="Show how station ${id} is calculated">${id}</button></th><td class="loc">${name}</td>
      ${cell('temperature', s?.T0)}${cell('pressure', s?.P0)}${cell('temperature', s?.T)}${cell('pressure', s?.P)}${cell('velocity', s?.C)}${s?.M != null ? `<td class="num">${formatNumber(s.M, 3)}</td>` : '<td class="num empty">—</td>'}</tr>`;
  }).join('');
  $('#stations').innerHTML = head + `<tbody>${body}</tbody>`;
}

function renderStatus(cycle) {
  const el = $('#status');
  document.querySelectorAll('.field.at-limit').forEach((f) => f.classList.remove('at-limit'));
  if (cycle.feasible) {
    const r = cycle.results;
    const noz = (n) => (n.choked ? 'choked' : 'not choked');
    el.className = 'status ok';
    el.innerHTML = `<strong>Cycle closes.</strong> Fan nozzle ${noz(r.nozzles.fan)}, core nozzle ${noz(r.nozzles.core)}. Combustor balance and all three spools check out.`;
    return;
  }
  const issue = cycle.issues[0];
  el.className = 'status warn';
  let hint = '';
  if (issue.code === 'spool' || issue.code === 'coreNozzle') {
    hint = ' Raise the turbine inlet temperature, or lower the bleed ratio, bypass ratio or fan pressure ratio. A warmer, lower altitude also asks more of the turbines.';
    INPUTS.filter((d) => d.limit).forEach((d) => document.querySelector(`.field[data-key="${d.key}"]`)?.classList.add('at-limit'));
  }
  el.innerHTML = `<strong>This combination is not a working engine.</strong> ${cycle.issues.map((i) => i.message).join(' ')}${hint}`;
}

function renderResults(cycle) {
  const el = $('#results');
  if (!cycle.feasible || !cycle.results) {
    el.innerHTML = '<p class="empty-state">Results appear when the cycle closes. Adjust the highlighted inputs.</p>';
    return;
  }
  const r = cycle.results;
  const F = u('thrust', r.thrust.net);
  const tsfc = u('tsfc', r.tsfc);
  const st = u('specificThrust', r.specificThrust);
  const eta0 = cycle.inputs.mach > 0 ? formatNumber(r.eta0 * 100, 1) : '—';
  el.innerHTML = `
    <div class="metrics">
      <div class="metric"><span class="metric-label">Net thrust</span><span class="metric-value">${F.text}<span class="unit">${F.unit}</span></span></div>
      <div class="metric"><span class="metric-label">Specific thrust</span><span class="metric-value">${st.text}<span class="unit">${st.unit}</span></span></div>
      <div class="metric"><span class="metric-label">TSFC</span><span class="metric-value">${tsfc.text}<span class="unit">${tsfc.unit}</span></span></div>
      <div class="metric"><span class="metric-label">Overall efficiency η<sub>0</sub></span><span class="metric-value">${eta0}<span class="unit">%</span></span></div>
    </div>
    <div class="eff-split" aria-label="Overall efficiency split">
      <span class="eff-term"><span class="eff-sym">η<sub>0</sub></span><span class="num">${eta0}%</span></span>
      <span class="eff-op">=</span>
      <span class="eff-term"><span class="eff-sym">η<sub>th</sub></span><span class="num">${cycle.inputs.mach > 0 ? formatNumber(r.etaTh * 100, 1) : formatNumber(r.etaTh * 100, 1)}%</span><span class="eff-cap">thermal</span></span>
      <span class="eff-op">×</span>
      <span class="eff-term"><span class="eff-sym">η<sub>p</sub></span><span class="num">${cycle.inputs.mach > 0 ? formatNumber(r.etaP * 100, 1) : '—'}%</span><span class="eff-cap">propulsive</span></span>
    </div>
    <p class="note">Thermal: how much fuel energy becomes jet kinetic energy. Propulsive: how much of that kinetic energy becomes useful thrust work. TSFC rises with flight speed because ram drag eats into thrust, yet η<sub>0</sub> rises too. Compare conditions with η<sub>0</sub>, engines at one condition with TSFC.</p>

    <h3>Thrust breakdown</h3>
    <dl class="kv-list">
      ${row('Fan, momentum', 'thrust', r.thrust.fanMomentum)}
      ${row('Fan, pressure', 'thrust', r.thrust.fanPressure)}
      ${row('Core, momentum', 'thrust', r.thrust.coreMomentum)}
      ${row('Core, pressure', 'thrust', r.thrust.corePressure)}
      ${row('Fan share of thrust', 'percent', r.thrust.fan / r.thrust.net)}
    </dl>

    <h3>Mass flow</h3>
    <dl class="kv-list">
      ${row('Total air', 'massFlow', r.massFlow.air, undefined, 'ṁ')}
      ${row('Bypass', 'massFlow', r.massFlow.bypass)}
      ${row('Core', 'massFlow', r.massFlow.core, undefined, 'ṁ<sub>core</sub>')}
      ${row('Bleed', 'massFlow', r.massFlow.bleed)}
      ${row('Fuel', 'fuelFlow', r.massFlow.fuel, undefined, 'ṁ<sub>f</sub>')}
      ${textRow('Fuel-air ratio', `<span class="num">${formatNumber(r.f, 5)}</span>`, 'f')}
    </dl>

    <h3>Power</h3>
    <dl class="kv-list">
      ${row('Fan', 'power', r.power.fan)}
      ${row('IP compressor', 'power', r.power.ipc)}
      ${row('HP compressor', 'power', r.power.hpc)}
      ${row('HP turbine', 'power', r.power.hpt)}
      ${row('IP turbine', 'power', r.power.ipt)}
      ${row('LP turbine', 'power', r.power.lpt)}
      ${row('All turbines', 'power', r.power.turbines)}
    </dl>

    <h3>Nozzles</h3>
    <dl class="kv-list">
      ${textRow('Fan nozzle', r.nozzles.fan.choked ? '<span class="pill pill-choked">choked</span>' : '<span class="pill">not choked</span>')}
      ${row('Fan exit area', 'area', r.nozzles.fan.area, undefined, 'A<sub>19</sub>')}
      ${textRow('Core nozzle', r.nozzles.core.choked ? '<span class="pill pill-choked">choked</span>' : '<span class="pill">not choked</span>')}
      ${row('Core exit area', 'area', r.nozzles.core.area, undefined, 'A<sub>9</sub>')}
    </dl>

    <h3>Mission</h3>
    <dl class="kv-list">
      ${row('Specific range, twin-engine', 'specificRange', r.specificRange)}
    </dl>`;
}

function renderDerived(cycle) {
  const opr = state.values.FPR * state.values.IPCR * state.values.HPCR;
  $('#opr').innerHTML = `<span>Overall pressure ratio <span class="sym">OPR</span></span><strong class="num">${formatNumber(opr, 2)}</strong>`;
  const alt = $('#in-altitude-alt');
  if (alt) {
    alt.textContent = `ISA ${formatNumber(cycle.ambient?.T ?? NaN, 1)} K, ${formatNumber((cycle.ambient?.P ?? NaN) / 1000, 2)} kPa`;
  }
}


/** Highlight the flight-condition preset whose values (altitude, Mach, TiT, bleed) are the current ones. */
function renderPresets() {
  document.querySelectorAll('[data-preset]').forEach((b) => {
    const p = PRESETS[b.dataset.preset];
    const active = Object.entries(p).every(([k, v]) => Math.abs(state.values[k] - v) <= 1e-9 * Math.max(1, Math.abs(v)));
    b.setAttribute('aria-pressed', String(active));
  });
}

// ---------------------------------------------------------------- update loop
let lastCycle = null;
function update() {
  const cycle = runCycle(state.values);
  lastCycle = cycle;
  renderStatus(cycle);
  renderResults(cycle);
  renderStations(cycle);
  renderDerived(cycle);
  renderPresets();
  renderMath(cycle);
  renderTs($('#ts'), cycle, UNITS, { compact: true });
  view?.setCycle(cycle, UNITS);
  renderCard(cycle);
  renderSweepPanel();
  renderTour();
  writeHash();
}

// ---------------------------------------------------------------- first-visit hint
// A short line on how to use the 3D view. It goes away on the first drag or click in the view,
// with its × or when the tour starts, and is not shown again in this browser after that.
let hideHint = () => {};
function initHint() {
  const el = $('#engine-hint');
  if (!el || !view || view.failed) return;
  let seen = false;
  try { seen = localStorage.getItem('tce-hint-seen') === '1'; } catch { /* storage blocked: show it */ }
  if (seen) return;
  if (matchMedia('(pointer: coarse)').matches) {
    el.querySelector('.engine-hint-text').innerHTML = '<b>Drag</b> to rotate · <b>Pinch</b> to zoom · <b>Tap a part</b> for its calculation';
  }
  el.hidden = false;
  hideHint = () => {
    if (el.hidden || el.classList.contains('is-leaving')) return;
    el.classList.add('is-leaving');
    setTimeout(() => { el.hidden = true; }, 250);
    try { localStorage.setItem('tce-hint-seen', '1'); } catch { /* not remembered */ }
  };
  el.querySelector('.engine-hint-close').addEventListener('click', hideHint);
  view.canvas.addEventListener('pointerdown', hideHint, { once: true });
}

// ---------------------------------------------------------------- guided tour
let tourStep = -1;
function renderTour() {
  if (tourStep < 0 || !lastCycle) return;
  const s = TOUR[tourStep];
  $('#tour-count').textContent = `Stop ${tourStep + 1} of ${TOUR.length}`;
  $('#tour-title').textContent = s.title;
  $('#tour-text').innerHTML = s.text(lastCycle, UNITS);
  $('#tour-prev').disabled = tourStep === 0;
  $('#tour-next').textContent = tourStep === TOUR.length - 1 ? 'Finish' : 'Next →';
  $('#tour-dots').innerHTML = TOUR.map((_, i) => `<span class="${i === tourStep ? 'on' : ''}"></span>`).join('');
}
function goTour(i) {
  if (i < 0) return;
  if (i >= TOUR.length) { endTour(); return; }
  tourStep = i;
  const s = TOUR[i];
  if (view?.state.exploded) { view.set('exploded', false); document.querySelector('[data-view="exploded"]')?.setAttribute('aria-pressed', 'false'); }
  if (!view?.state.cutaway) { view.set('cutaway', true); document.querySelector('[data-view="cutaway"]')?.setAttribute('aria-pressed', 'true'); }
  view?.flyTo(s.cam, s.target);
  selectComponent(s.component);
  renderTour();
}
function startTour() {
  hideHint();
  $('#tour').hidden = false;
  $('#engine-view').classList.add('touring');
  $('#tour-start-3d').hidden = true;
  view?.setFocus(true);
  goTour(0);
  $('#tour-next').focus({ preventScroll: true });
}
function endTour() {
  tourStep = -1;
  $('#tour').hidden = true;
  $('#engine-view').classList.remove('touring');
  $('#tour-start-3d').hidden = false;
  view?.setFocus(false);
  view?.flyTo(null, null);
}
function initTour() {
  for (const id of ['#tour-start', '#tour-start-3d']) $(id).addEventListener('click', () => (tourStep < 0 ? startTour() : endTour()));
  $('#tour-next').addEventListener('click', () => goTour(tourStep + 1));
  $('#tour-prev').addEventListener('click', () => goTour(tourStep - 1));
  $('#tour-close').addEventListener('click', endTour);
  document.addEventListener('keydown', (e) => {
    if (tourStep < 0 || e.target.closest?.('input, select, textarea')) return;
    if (e.key === 'ArrowRight') goTour(tourStep + 1);
    if (e.key === 'ArrowLeft') goTour(tourStep - 1);
  });
}

// ---------------------------------------------------------------- trade study
let sweepScale = null;
function renderSweepPanel() {
  sweepScale = renderSweep($('#sweep'), { values: state.values, xKey: state.sweep.x, yKey: state.sweep.y, units: UNITS });
}
function initSweep() {
  const xs = $('#sweep-x'), ys = $('#sweep-y');
  xs.innerHTML = Object.entries(SWEEP_X).map(([k, d]) => `<option value="${k}">${d.label}</option>`).join('');
  ys.innerHTML = Object.entries(SWEEP_Y).map(([k, d]) => `<option value="${k}">${d.label}</option>`).join('');
  xs.value = state.sweep.x; ys.value = state.sweep.y;
  xs.addEventListener('change', () => { state.sweep.x = xs.value; renderSweepPanel(); });
  ys.addEventListener('change', () => { state.sweep.y = ys.value; renderSweepPanel(); });
  // selecting a point on the chart sets that input
  $('#sweep').addEventListener('click', (e) => {
    const svg = e.target.closest('svg');
    if (!svg || !sweepScale) return;
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * sweepScale.W;
    if (px < sweepScale.plotL || px > sweepScale.plotR) return;
    const X = SWEEP_X[state.sweep.x];
    const v = +sweepScale.invX(px).toFixed(X.dec);
    applyValues({ [state.sweep.x]: v });
  });
}

// ---------------------------------------------------------------- selected-part card in the 3D view
// Key values per component: [label, quantity, value getter]
const CARD = {
  inlet: [['T₀₂', 'temperature', (c) => c.stations['2']?.T0], ['p₀₂', 'pressure', (c) => c.stations['2']?.P0], ['Flight speed C₀', 'velocity', (c) => c.stations['0']?.C]],
  massFlow: [['Air mass flow', 'massFlow', (c) => c.results?.massFlow.air], ['Core mass flow', 'massFlow', (c) => c.results?.massFlow.core]],
  fan: [['T₀₁₃', 'temperature', (c) => c.stations['13']?.T0], ['p₀₁₃', 'pressure', (c) => c.stations['13']?.P0], ['Fan power', 'power', (c) => c.results?.power.fan]],
  fanNozzle: [['Jet velocity C₁₉', 'velocity', (c) => c.stations['19']?.C], ['Exit pressure p₁₉', 'pressure', (c) => c.stations['19']?.P], ['Fan thrust', 'thrust', (c) => c.results?.thrust.fan]],
  ipc: [['T₀₂₃', 'temperature', (c) => c.stations['23']?.T0], ['p₀₂₃', 'pressure', (c) => c.stations['23']?.P0], ['IPC power', 'power', (c) => c.results?.power.ipc]],
  hpc: [['T₀₃', 'temperature', (c) => c.stations['3']?.T0], ['p₀₃', 'pressure', (c) => c.stations['3']?.P0], ['HPC power', 'power', (c) => c.results?.power.hpc]],
  combustor: [['T₀₄', 'temperature', (c) => c.stations['4']?.T0], ['p₀₄', 'pressure', (c) => c.stations['4']?.P0], ['Fuel flow', 'fuelFlow', (c) => c.results?.massFlow.fuel]],
  hpt: [['T₀₄₁', 'temperature', (c) => c.stations['41']?.T0], ['p₀₄₁', 'pressure', (c) => c.stations['41']?.P0], ['HPT power', 'power', (c) => c.results?.power.hpt]],
  ipt: [['T₀₄₃', 'temperature', (c) => c.stations['43']?.T0], ['p₀₄₃', 'pressure', (c) => c.stations['43']?.P0], ['IPT power', 'power', (c) => c.results?.power.ipt]],
  lpt: [['T₀₅', 'temperature', (c) => c.stations['5']?.T0], ['p₀₅', 'pressure', (c) => c.stations['5']?.P0], ['LPT power', 'power', (c) => c.results?.power.lpt]],
  jetPipe: [['T₀₇', 'temperature', (c) => c.stations['7']?.T0], ['p₀₇', 'pressure', (c) => c.stations['7']?.P0]],
  coreNozzle: [['Jet velocity C₉', 'velocity', (c) => c.stations['9']?.C], ['Exit pressure p₉', 'pressure', (c) => c.stations['9']?.P], ['Core thrust', 'thrust', (c) => c.results?.thrust.core]],
  thrust: [['Net thrust', 'thrust', (c) => c.results?.thrust.net], ['TSFC', 'tsfc', (c) => c.results?.tsfc]],
};

function renderCard(cycle) {
  const el = view?.selectedEl?.querySelector('.engine-selected-values');
  if (!el || !cycle) return;
  const rows = (CARD[state.component] ?? []).map(([label, q, get]) => {
    const v = get(cycle);
    const d = display(q, v, UNITS);
    return `<span class="ev-label">${label}</span><span class="ev-value"><span class="num">${d.text}</span><span class="unit">${d.unit}</span></span>`;
  }).join('');
  const issue = cycle.issues.find((i) => i.component === state.component);
  el.innerHTML = rows + (issue ? '<span class="ev-warn">The cycle stops here</span>' : '');
}

// ---------------------------------------------------------------- calculation drawer
let drawerReturn = null;
function showTab(name) {
  for (const t of ['steps', 'stations']) {
    $(`#tab-${t}`).setAttribute('aria-selected', String(t === name));
    $(`#pane-${t}`).hidden = t !== name;
  }
}
function openCalc(tab = 'steps') {
  const d = $('#calc-drawer');
  drawerReturn = document.activeElement;
  showTab(tab);
  d.hidden = false;
  requestAnimationFrame(() => d.classList.add('is-open'));
  $('#open-calc').setAttribute('aria-expanded', 'true');
  $('#close-calc').focus({ preventScroll: true });
}
function closeCalc() {
  const d = $('#calc-drawer');
  if (d.hidden) return;
  d.classList.remove('is-open');
  $('#open-calc').setAttribute('aria-expanded', 'false');
  const done = () => { d.hidden = true; };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) done(); else setTimeout(done, 220);
  drawerReturn?.focus?.({ preventScroll: true });
}
// ---------------------------------------------------------------- full-screen 3D
// The engine card is pinned over the whole window (CSS class) and, where the browser allows it,
// the page also goes full screen. The calculation drawer stays above it, so it still works.
function setExpanded(on) {
  document.body.classList.toggle('engine-expanded', on);
  const b = $('#engine-expand');
  b.setAttribute('aria-pressed', String(on));
  b.querySelector('.engine-expand-label').textContent = on ? 'Exit full screen' : 'Full screen';
  b.title = on ? 'Exit full screen (Esc)' : 'Full screen (Esc to exit)';
}
function toggleExpanded() {
  const on = !document.body.classList.contains('engine-expanded');
  setExpanded(on);
  const root = document.documentElement;
  if (on && root.requestFullscreen && document.fullscreenEnabled) root.requestFullscreen().catch(() => {});
  if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
}
function initExpand() {
  $('#engine-expand').addEventListener('click', toggleExpanded);
  // leaving browser full screen with Esc or F11 also leaves the expanded view
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) setExpanded(false); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#calc-drawer').hidden && tourStep < 0 && document.body.classList.contains('engine-expanded')) setExpanded(false);
  });
}

function initDrawer() {
  $('#open-calc').addEventListener('click', () => ($('#calc-drawer').hidden ? openCalc('steps') : closeCalc()));
  $('#close-calc').addEventListener('click', closeCalc);
  $('#tab-steps').addEventListener('click', () => showTab('steps'));
  $('#tab-stations').addEventListener('click', () => showTab('stations'));
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (tourStep >= 0) { endTour(); e.stopImmediatePropagation(); return; }
    closeCalc();
  });
  // tabs, prev/next buttons and station numbers carry data-component
  $('#calc-drawer').addEventListener('click', (e) => {
    const b = e.target.closest('[data-component]');
    if (!b) return;
    selectComponent(b.dataset.component);
    if (b.classList.contains('station-id')) { showTab('steps'); $('.drawer-body').scrollTop = 0; }
  });
}

// ---------------------------------------------------------------- T-s ↔ station table linking
const TS_ID = { 21: '13' };            // station 21 shares the state of 13 in the T-s diagram
const ROWS_FOR = { 13: ['13', '21'] };  // and the T-s point 13 stands for both rows

function highlight(tsId) {
  document.querySelectorAll('.is-hl').forEach((e) => e.classList.remove('is-hl'));
  view?.highlightStation(tsId);
  if (!tsId) return;
  document.querySelector(`.ts-point[data-station="${tsId}"]`)?.classList.add('is-hl');
  for (const r of ROWS_FOR[tsId] ?? [tsId]) document.querySelector(`#stations tr[data-station="${r}"]`)?.classList.add('is-hl');
}

function showTooltip(g) {
  const wrap = $('#ts'), tip = $('.ts-tooltip', wrap);
  if (!tip) return;
  if (!g) { tip.hidden = true; return; }
  tip.innerHTML = pointTooltip(lastCycle, g.dataset.station, UNITS);
  tip.hidden = false;
  const dot = g.querySelector('.ts-dot').getBoundingClientRect(), box = wrap.getBoundingClientRect();
  const x = dot.left + dot.width / 2 - box.left, y = dot.top - box.top;
  const right = x > box.width * 0.6;
  tip.style.left = `${right ? x - tip.offsetWidth - 12 : x + 12}px`;
  tip.style.top = `${Math.max(0, y - tip.offsetHeight / 2)}px`;
}

function initTsLinking() {
  const ts = $('#ts');
  const onPoint = (e) => {
    const g = e.target.closest('.ts-point');
    highlight(g?.dataset.station);
    showTooltip(g);
  };
  ts.addEventListener('pointerover', onPoint);
  ts.addEventListener('focusin', onPoint);
  ts.addEventListener('pointerleave', () => { highlight(null); showTooltip(null); });
  ts.addEventListener('focusout', () => { highlight(null); showTooltip(null); });
  const open = (g) => g && selectComponent(STATION_COMPONENT[g.dataset.station]);
  ts.addEventListener('click', (e) => open(e.target.closest('.ts-point')));
  ts.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(e.target.closest('.ts-point')); }
  });
  const table = $('#stations');
  table.addEventListener('pointerover', (e) => {
    const tr = e.target.closest('tr[data-station]');
    if (tr) highlight(TS_ID[tr.dataset.station] ?? tr.dataset.station);
  });
  table.addEventListener('pointerleave', () => highlight(null));
}

// ---------------------------------------------------------------- 3D engine
function initEngineView() {
  view = new EngineView($('#engine-view'), {
    onSelect: (id) => selectComponent(id),
    onSelectStation: (id) => selectComponent(STATION_COMPONENT[id]),
    onOpenPanel: () => openCalc('steps'),
    onHoverStation: (id) => highlight(id ? (TS_ID[id] ?? id) : null),
  });
  if (view.failed) { document.querySelector('.engine-tools').hidden = true; return; }
  view.select(state.component);
  document.querySelectorAll('[data-view]').forEach((b) => {
    b.setAttribute('aria-pressed', String(!!view.state[b.dataset.view]));
    b.addEventListener('click', () => {
      const on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(on));
      view.set(b.dataset.view, on);
    });
  });
  document.querySelectorAll('[data-color]').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('[data-color]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    view.set('colorBy', b.dataset.color);
  }));
  $('#view-reset').addEventListener('click', () => view.resetView());
  $('#view-core').addEventListener('click', () => view.focusCore());
}

function renderMath(cycle) {
  renderTabs($('#component-tabs'), cycle, state.component);
  renderPanel($('#math-panel'), cycle, state.component);
}

function selectComponent(id) {
  if (!COMPONENTS.some((c) => c.id === id)) return;
  state.component = id;
  view?.select(id);
  renderMath(lastCycle);
  renderCard(lastCycle);
  writeHash();
}

function applyValues(values) {
  state.values = { ...state.values, ...values };
  syncForm();
  update();
}

function init() {
  readHash();
  buildForm();
  document.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => applyValues(PRESETS[b.dataset.preset])));
  $('#reset').addEventListener('click', () => { state.values = { ...DEFAULT_INPUTS }; syncForm(); update(); });
  // component selection: tabs, prev/next buttons and station numbers all carry data-component
  initTsLinking();
  initEngineView();
  initDrawer();
  initExpand();
  initSweep();
  initTour();
  initHint();
  update();
}

init();

// exposed for debugging in the browser console
window.tce = { get cycle() { return lastCycle; }, get view() { return view; }, state };
