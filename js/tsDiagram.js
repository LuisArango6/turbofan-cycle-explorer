// T-s diagram of the cycle (SVG).
// Total states for stations 2 to 7, static states for the ambient (0) and the nozzle exits (9, 19),
// as in the course figure. Entropy is measured from the ambient air state:
//   s − s0 = cp·ln(T/T0) − R·ln(p/p0), with cpa for air and cpg for hot gas.
// For air, R is taken as cpa·(γ−1)/γ, the same γ the engine uses for compression, so an
// ideal compressor plots as an exactly vertical line (the real-gas γ differs slightly from cpa/(cpa−287)).

import { R_GAS } from './engine.js';
import { convert, formatNumber } from './units.js';

// Full size (760 × 460) or compact for a narrow side column (480 × 400).
const SIZES = { full: { W: 760, H: 460, M: { l: 64, r: 84, t: 20, b: 52 } }, compact: { W: 480, H: 400, M: { l: 52, r: 54, t: 14, b: 46 } } };
let W = 760, H = 460, M = SIZES.full.M;

/** The plotted states: id, label, temperature, pressure, flow, entropy. */
export function cyclePoints(cycle) {
  const S = cycle.stations, A = cycle.ambient;
  if (!A) return [];
  const pts = [];
  const add = (id, label, T, P, flow, kind) => {
    if (!Number.isFinite(T) || !Number.isFinite(P)) return;
    const cp = flow === 'gas' ? A.cpg : A.cp;
    const R = flow === 'gas' ? R_GAS : (A.cp * (A.gamma - 1)) / A.gamma;
    pts.push({ id, label, T, P, flow, kind, s: cp * Math.log(T / A.T) - R * Math.log(P / A.P) });
  };
  add('0', '0', A.T, A.P, 'air', 'static');
  if (S['2']) add('2', '02', S['2'].T0, S['2'].P0, 'air', 'total');
  if (S['13']) add('13', '013 = 021', S['13'].T0, S['13'].P0, 'air', 'total');
  if (S['19']) add('19', '19', S['19'].T, S['19'].P, 'air', 'static');
  if (S['23']) add('23', '023', S['23'].T0, S['23'].P0, 'air', 'total');
  if (S['3']) add('3', '03', S['3'].T0, S['3'].P0, 'air', 'total');
  if (S['4']) add('4', '04', S['4'].T0, S['4'].P0, 'gas', 'total');
  if (S['41']) add('41', '041', S['41'].T0, S['41'].P0, 'gas', 'total');
  if (S['43']) add('43', '043', S['43'].T0, S['43'].P0, 'gas', 'total');
  if (S['5']) add('5', '05', S['5'].T0, S['5'].P0, 'gas', 'total');
  if (S['7']) add('7', '07', S['7'].T0, S['7'].P0, 'gas', 'total');
  if (S['9'] && Number.isFinite(S['9'].T)) add('9', '9', S['9'].T, S['9'].P, 'gas', 'static');
  return pts;
}

/** Round, evenly spaced tick values covering [lo, hi]. */
export function niceTicks(lo, hi, count = 6) {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => span / s <= count) ?? 10 * mag;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toPrecision(12));
  return out;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** "p" + subscript as SVG text content. */
const subLabel = (base, sub) => `${base}<tspan class="ts-sub" dy="4">${esc(sub)}</tspan>`;

/**
 * Draw the diagram into `el` (a container element).
 * @param {object} cycle result of runCycle
 * @param {'si'} units  display units (SI only)
 */
export function renderTs(el, cycle, units = 'si', { compact = false } = {}) {
  ({ W, H, M } = compact ? SIZES.compact : SIZES.full);
  el.classList.toggle('ts-compact', compact);
  const pts = cyclePoints(cycle);
  if (pts.length < 2) {
    el.innerHTML = '<p class="math-empty">The T-s diagram needs a valid flight condition.</p>';
    return;
  }
  const A = cycle.ambient;
  const by = Object.fromEntries(pts.map((p) => [p.id, p]));

  // ---- scales (SI internally; tick labels converted)
  const sMin = Math.min(...pts.map((p) => p.s)), sMax = Math.max(...pts.map((p) => p.s));
  const tMax = Math.max(...pts.map((p) => p.T));
  const sPad = (sMax - sMin) * 0.06 || 50;
  const s0 = sMin - sPad, s1 = sMax + sPad;
  const t0 = Math.max(0, Math.floor((A.T - 60) / 50) * 50), t1 = Math.ceil((tMax + 80) / 50) * 50;
  const X = (s) => M.l + ((s - s0) / (s1 - s0)) * (W - M.l - M.r);
  const Y = (T) => H - M.b - ((T - t0) / (t1 - t0)) * (H - M.t - M.b);

  const Tu = convert('temperature', 1, units);
  const Su = convert('entropy', 1, units);
  const tTicks = niceTicks(t0 * Tu.value, t1 * Tu.value, 7);
  const sTicks = niceTicks(s0 * Su.value, s1 * Su.value, 7);

  // ---- isobars: T(s) = T* · exp((s − s*)/cp) through a state (T*, s*)
  const isoPath = (T, s, cp, sa, sb, steps = 24) => {
    let d = '';
    for (let i = 0; i <= steps; i++) {
      const sv = sa + ((sb - sa) * i) / steps;
      const Tv = T * Math.exp((sv - s) / cp);
      d += `${i ? 'L' : 'M'}${X(sv).toFixed(1)} ${Y(Tv).toFixed(1)}`;
    }
    return d;
  };
  const w = (s1 - s0) * 0.09;
  const isobars = [];
  const iso = (id, sub, side = 'right', wl = w, wr = w) => {
    const p = by[id];
    if (!p) return;
    const cp = p.flow === 'gas' ? A.cpg : A.cp;
    const sa = Math.max(s0, p.s - wl), sb = Math.min(s1, p.s + wr);
    const end = side === 'right' ? sb : sa;
    const Tend = p.T * Math.exp((end - p.s) / cp);
    isobars.push(`<g class="ts-isobar"><path d="${isoPath(p.T, p.s, cp, sa, sb)}"/>
      <text x="${(X(end) + (side === 'right' ? 6 : -6)).toFixed(1)}" y="${(Y(Tend) + 4).toFixed(1)}" text-anchor="${side === 'right' ? 'start' : 'end'}">${subLabel('p', sub)}</text></g>`);
  };
  iso('2', '02', 'right', w * 0.5, w * 0.9);
  iso('13', '013', 'right', w * 0.5, w * 0.9);
  iso('23', '023', 'right', w * 0.5, w);
  iso('3', '03', 'right', w * 0.5, w);
  iso('4', '04', 'right');
  iso('41', '041', 'right');
  iso('43', '043', 'right');
  iso('5', '05', 'left', w, w * 0.3);
  iso('7', '07', 'right', w * 0.3, w);
  if (cycle.nozzles?.fan?.choked) iso('19', '19', 'right', w * 0.6, w * 0.6);
  if (cycle.nozzles?.core?.choked) iso('9', '9', 'right', w * 0.6, w * 0.6);

  // ambient pressure line across the plot (air); exits that expand fully end on it
  // Ambient-pressure isobars. Air and hot gas use different cp, so p0 is drawn once for each:
  // the air one under the compression side, the gas one under the expansion side.
  // A gas state above the gas p0 line still has pressure to expand; below it, it does not.
  const airS = pts.filter((p) => p.flow === 'air').map((p) => p.s);
  const gasS = pts.filter((p) => p.flow === 'gas').map((p) => p.s);
  let ambient = '';
  {
    const sb = Math.min(s1, Math.max(...airS) + w * 1.5);
    ambient += `<g class="ts-isobar ts-ambient"><path d="${isoPath(A.T, 0, A.cp, s0, sb, 32)}"/>
      <text x="${(X(sb) + 6).toFixed(1)}" y="${(Y(A.T * Math.exp(sb / A.cp)) + 4).toFixed(1)}">${subLabel('p', '0')}</text></g>`;
  }
  if (gasS.length) {
    const sa = Math.max(s0, Math.min(...gasS) - w * 1.2);
    ambient += `<g class="ts-isobar ts-ambient"><path d="${isoPath(A.T, 0, A.cpg, sa, s1, 32)}"/>
      <text x="${(X(sa) - 6).toFixed(1)}" y="${(Y(A.T * Math.exp(sa / A.cpg)) + 4).toFixed(1)}" text-anchor="end">${subLabel('p', '0')}</text></g>`;
  }

  // ---- cycle lines
  const seg = (ids, cls) => {
    const list = ids.map((i) => by[i]).filter(Boolean);
    if (list.length < 2) return '';
    return `<path class="${cls}" d="${list.map((p, i) => `${i ? 'L' : 'M'}${X(p.s).toFixed(1)} ${Y(p.T).toFixed(1)}`).join('')}"/>`;
  };
  const lines = [
    seg(['0', '2', '13', '23', '3'], 'ts-line ts-air'),
    seg(['3', '4'], 'ts-line ts-burn'),
    seg(['4', '41', '43', '5', '7', '9'], 'ts-line ts-gas'),
    seg(['13', '19'], 'ts-line ts-bypass'),
  ].join('');

  // ---- points with labels (offset to avoid the line)
  const labelPos = { 0: [-10, 14, 'end'], 2: [-10, 2, 'end'], 13: [-10, -8, 'end'], 19: [10, 16, 'start'], 23: [-10, -6, 'end'], 3: [-10, -6, 'end'],
    4: [-8, -8, 'end'], 41: [10, -4, 'start'], 43: [10, -4, 'start'], 5: [-10, 4, 'end'], 7: [10, -6, 'start'], 9: [10, 16, 'start'] };
  const points = pts.map((p) => {
    const [dx, dy, anchor] = labelPos[p.id] ?? [8, -6, 'start'];
    const x = X(p.s).toFixed(1), y = Y(p.T).toFixed(1);
    return `<g class="ts-point pt-${p.flow}" data-station="${p.id}" tabindex="0" role="button" aria-label="Station ${esc(p.label)}: ${formatNumber(p.T, 1)} K, ${formatNumber(p.P / 1000, 2)} kPa">
      <circle cx="${x}" cy="${y}" r="9" class="ts-hit"/>
      <circle cx="${x}" cy="${y}" r="4.5" class="ts-dot"/>
      <text x="${(+x + dx).toFixed(1)}" y="${(+y + dy).toFixed(1)}" text-anchor="${anchor}">${esc(p.label)}</text>
    </g>`;
  }).join('');

  // ---- axes
  const plotL = M.l, plotR = W - M.r, plotT = M.t, plotB = H - M.b;
  const grid = [
    ...tTicks.map((tv) => {
      const y = Y(tv / Tu.value).toFixed(1);
      return `<line class="ts-grid" x1="${plotL}" x2="${plotR}" y1="${y}" y2="${y}"/><text class="ts-tick" x="${plotL - 8}" y="${+y + 4}" text-anchor="end">${formatNumber(tv, 0)}</text>`;
    }),
    ...sTicks.map((sv) => {
      const x = X(sv / Su.value).toFixed(1);
      return `<line class="ts-grid" x1="${x}" x2="${x}" y1="${plotT}" y2="${plotB}"/><text class="ts-tick" x="${x}" y="${plotB + 18}" text-anchor="middle">${formatNumber(sv, units === 'si' ? 0 : 2)}</text>`;
    }),
  ].join('');
  const axes = `<line class="ts-axis" x1="${plotL}" x2="${plotR}" y1="${plotB}" y2="${plotB}"/><line class="ts-axis" x1="${plotL}" x2="${plotL}" y1="${plotT}" y2="${plotB}"/>
    <text class="ts-axis-label" x="${(plotL + plotR) / 2}" y="${H - 10}" text-anchor="middle">s − s₀ [${esc(Su.unit)}]</text>
    <text class="ts-axis-label" x="16" y="${(plotT + plotB) / 2}" text-anchor="middle" transform="rotate(-90 16 ${(plotT + plotB) / 2})">T [${esc(Tu.unit)}]</text>`;

  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="ts-svg" role="img" aria-labelledby="ts-svg-title">
    <title id="ts-svg-title">T-s diagram of the core and bypass cycles</title>
    <defs><clipPath id="ts-clip"><rect x="${plotL}" y="${plotT}" width="${plotR - plotL + M.r}" height="${plotB - plotT}"/></clipPath></defs>
    ${grid}${axes}
    <g clip-path="url(#ts-clip)">${ambient}${isobars.join('')}${lines}</g>
    ${points}
  </svg>
  <div class="ts-tooltip" hidden></div>`;
}

/** Tooltip text for one state, in the chosen units. */
export function pointTooltip(cycle, id, units) {
  const p = cyclePoints(cycle).find((q) => q.id === id);
  if (!p) return '';
  const T = convert('temperature', p.T, units), P = convert('pressure', p.P, units), s = convert('entropy', p.s, units);
  const kind = p.kind === 'static' ? 'static' : 'total';
  return `<strong>Station ${esc(p.label)}</strong> <span class="ts-kind">${kind}</span><br>
    T = ${formatNumber(T.value, 1)} ${esc(T.unit)}<br>p = ${formatNumber(P.value, P.decimals)} ${esc(P.unit)}<br>s − s₀ = ${formatNumber(s.value, units === 'si' ? 1 : 3)} ${esc(s.unit)}`;
}
