// Parameter sweeps (trade studies): vary one input, keep the others, and plot a performance figure.
// Inputs where the cycle does not close are marked instead of being drawn as if they were valid.

import { runCycle } from './engine.js';
import { convert, formatNumber } from './units.js';

/** Inputs that can be swept, with the range shown. Values in engine (SI) units. */
export const SWEEP_X = {
  BPR: { label: 'Bypass ratio', sym: 'BPR', unit: '', min: 4, max: 14, dec: 1 },
  TiT: { label: 'Turbine inlet temperature', sym: 'T₀₄', unit: 'K', min: 1400, max: 1950, dec: 0 },
  FPR: { label: 'Fan pressure ratio', sym: 'FPR', unit: '', min: 1.3, max: 1.9, dec: 2 },
  HPCR: { label: 'HP compressor pressure ratio', sym: 'π_HPC', unit: '', min: 2, max: 10, dec: 2 },
  IPCR: { label: 'IP compressor pressure ratio', sym: 'π_IPC', unit: '', min: 2, max: 10, dec: 2 },
  bleed: { label: 'Bleed ratio', sym: 'b', unit: '', min: 0, max: 0.2, dec: 3 },
  altitude: { label: 'Altitude', sym: 'h', unit: 'm', min: 0, max: 13000, dec: 0 },
  mach: { label: 'Flight Mach number', sym: 'M₀', unit: '', min: 0, max: 0.9, dec: 2 },
};

/** Figures that can be plotted: quantity (for units) and how to read them from the results. */
export const SWEEP_Y = {
  tsfc: { label: 'TSFC', q: 'tsfc', get: (r) => r.tsfc },
  thrust: { label: 'Net thrust', q: 'thrust', get: (r) => r.thrust.net },
  specificThrust: { label: 'Specific thrust', q: 'specificThrust', get: (r) => r.specificThrust },
  eta0: { label: 'Overall efficiency η₀', q: 'percent', get: (r) => r.eta0 },
  etaTh: { label: 'Thermal efficiency η_th', q: 'percent', get: (r) => r.etaTh },
  etaP: { label: 'Propulsive efficiency η_p', q: 'percent', get: (r) => r.etaP },
};

/**
 * Run the cycle across the range of one input.
 * @returns {{x:number, y:number|null, feasible:boolean}[]} y in SI; null where the cycle does not close
 */
export function sweep(values, xKey, yKey, n = 61) {
  const X = SWEEP_X[xKey], Y = SWEEP_Y[yKey];
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = X.min + ((X.max - X.min) * i) / (n - 1);
    const c = runCycle({ ...values, [xKey]: x });
    const ok = c.feasible && c.results;
    out.push({ x, y: ok ? Y.get(c.results) : null, feasible: !!ok });
  }
  return out;
}

/** Contiguous x ranges where the cycle does not close: [[x0, x1], …] (half a step beyond the last points). */
export function infeasibleBands(points) {
  const bands = [];
  const step = points.length > 1 ? points[1].x - points[0].x : 0;
  let start = null;
  points.forEach((p, i) => {
    if (!p.feasible && start === null) start = Math.max(points[0].x, p.x - step / 2);
    if ((p.feasible || i === points.length - 1) && start !== null) {
      bands.push([start, p.feasible ? p.x - step / 2 : p.x]);
      start = null;
    }
  });
  return bands;
}

function niceTicks(lo, hi, count = 5) {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / count, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => span / s <= count) ?? 10 * mag;
  const t = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) t.push(+v.toPrecision(12));
  return t;
}

const W = 480, H = 290, M = { l: 58, r: 16, t: 14, b: 44 };

/**
 * Draw the sweep chart. Returns the x scale inverse so the caller can turn a click into an input value.
 */
export function renderSweep(el, { values, xKey, yKey, units }) {
  const X = SWEEP_X[xKey], Y = SWEEP_Y[yKey];
  const pts = sweep(values, xKey, yKey);
  const conv = (v) => convert(Y.q, v, units).value;
  const yUnit = convert(Y.q, 1, units).unit;
  const ys = pts.filter((p) => p.feasible).map((p) => conv(p.y));
  const plotL = M.l, plotR = W - M.r, plotT = M.t, plotB = H - M.b;
  const sx = (x) => plotL + ((x - X.min) / (X.max - X.min)) * (plotR - plotL);
  const invX = (px) => X.min + ((px - plotL) / (plotR - plotL)) * (X.max - X.min);

  let body = '';
  let hoverData = null;
  if (!ys.length) {
    body = `<text class="sw-empty" x="${W / 2}" y="${H / 2}" text-anchor="middle">The cycle does not close anywhere in this range.</text>`;
  } else {
    let lo = Math.min(...ys), hi = Math.max(...ys);
    const pad = (hi - lo) * 0.12 || Math.abs(hi) * 0.1 || 1;
    lo -= pad; hi += pad;
    if (Y.q === 'percent' && lo < 0) lo = 0;
    const sy = (y) => plotB - ((y - lo) / (hi - lo)) * (plotB - plotT);
    const yt = niceTicks(lo, hi, 5), xt = niceTicks(X.min, X.max, 6);
    // as many decimals as the tick step needs (2.5 → 1, 0.02 → 2, 20 → 0)
    const decOf = (t) => {
      if (t.length < 2) return 0;
      const step = +(t[1] - t[0]).toPrecision(6), mag = Math.floor(Math.log10(step));
      return Math.max(0, Math.min(4, -mag + (+(step / 10 ** mag).toPrecision(6) % 1 ? 1 : 0)));
    };
    const yd = decOf(yt), xd = decOf(xt);
    const grid = yt.map((v) => `<line class="sw-grid" x1="${plotL}" x2="${plotR}" y1="${sy(v)}" y2="${sy(v)}"/><text class="sw-tick" x="${plotL - 6}" y="${sy(v) + 4}" text-anchor="end">${formatNumber(v, yd)}</text>`).join('')
      + xt.map((v) => `<text class="sw-tick" x="${sx(v)}" y="${plotB + 16}" text-anchor="middle">${formatNumber(v, xd)}</text><line class="sw-tickmark" x1="${sx(v)}" x2="${sx(v)}" y1="${plotB}" y2="${plotB + 4}"/>`).join('');
    const bands = infeasibleBands(pts).map(([a, b]) => {
      const x0 = sx(a), x1 = sx(b);
      return `<rect class="sw-band" x="${x0}" y="${plotT}" width="${Math.max(1, x1 - x0)}" height="${plotB - plotT}"/>`
        + (x1 - x0 > 60 ? `<text class="sw-band-label" x="${(x0 + x1) / 2}" y="${plotT + 16}" text-anchor="middle">cycle does not close</text>` : '');
    }).join('');
    // feasible segments as separate paths (line + soft area), so nothing bridges an infeasible gap
    const segs = [];
    let cur = [];
    for (const p of pts) {
      if (!p.feasible) { if (cur.length) segs.push(cur); cur = []; continue; }
      cur.push([sx(p.x), sy(conv(p.y))]);
    }
    if (cur.length) segs.push(cur);
    const line = segs.map((sg) => `<path class="sw-line" d="${sg.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('')}"/>`).join('');
    const area = segs.filter((sg) => sg.length > 1).map((sg) => `<path class="sw-area" d="M${sg[0][0].toFixed(1)} ${plotB}${sg.map(([x, y]) => `L${x.toFixed(1)} ${y.toFixed(1)}`).join('')}L${sg.at(-1)[0].toFixed(1)} ${plotB}Z"/>`).join('');
    const vd = Math.abs(hi - lo) < 1 ? 4 : Math.abs(hi - lo) < 10 ? 2 : 1;
    // current design point: dot with halo, guides to both axes, value in a tag
    const now = runCycle(values);
    const xNow = values[xKey];
    let marker = '';
    if (now.feasible && now.results && xNow >= X.min && xNow <= X.max) {
      const yNow = conv(Y.get(now.results));
      const mx = sx(xNow), my = sy(yNow);
      const right = mx > (plotL + plotR) / 2;
      const txt = formatNumber(yNow, vd);
      const tw = txt.length * 7.4 + 12;
      const tx = right ? mx - 10 - tw : mx + 10;
      marker = `<line class="sw-now-guide" x1="${mx}" x2="${mx}" y1="${my}" y2="${plotB}"/><line class="sw-now-guide" x1="${plotL}" x2="${mx}" y1="${my}" y2="${my}"/>
        <circle class="sw-now-halo" cx="${mx}" cy="${my}" r="10"/><circle class="sw-now" cx="${mx}" cy="${my}" r="5.5"/>
        <rect class="sw-tag" x="${tx}" y="${my - 30}" width="${tw}" height="20" rx="4"/><text class="sw-tag-text" x="${tx + tw / 2}" y="${my - 16}" text-anchor="middle">${txt}</text>`;
    }
    const hover = '<g class="sw-hover" visibility="hidden"><line class="sw-hover-line"/><circle class="sw-hover-dot" r="4.5"/><rect class="sw-hover-box" rx="4" height="36"/><text class="sw-hover-text"><tspan class="hx"/><tspan class="hy"/></text></g>';
    body = `${bands}${grid}${area}<line class="sw-axis" x1="${plotL}" x2="${plotR}" y1="${plotB}" y2="${plotB}"/>${line}${marker}${hover}`;
    hoverData = { pts, sx, sy, conv, plotT, plotB, plotL, plotR, vd, xd: X.dec, xUnit: X.unit, xSym: X.sym, yUnit };
  }
  const yLabel = `${Y.label}${yUnit ? ` [${yUnit}]` : ''}`;
  const xLabel = `${X.label}${X.unit ? ` [${X.unit}]` : ''}`;
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="sw-svg" role="img" aria-label="${yLabel} against ${xLabel}">
    ${body}
    <text class="sw-axis-label" x="${(plotL + plotR) / 2}" y="${H - 6}" text-anchor="middle">${xLabel}</text>
    <text class="sw-axis-label" x="14" y="${(plotT + plotB) / 2}" text-anchor="middle" transform="rotate(-90 14 ${(plotT + plotB) / 2})">${yLabel}</text>
  </svg>`;
  if (hoverData) attachHover(el.querySelector('svg'), hoverData);
  return { invX, plotL, plotR, W };
}

/** Read-out that follows the pointer: nearest feasible point, its x and y. */
function attachHover(svg, h) {
  const g = svg.querySelector('.sw-hover');
  const ln = g.querySelector('.sw-hover-line'), dot = g.querySelector('.sw-hover-dot'), box = g.querySelector('.sw-hover-box');
  const tx = g.querySelector('.hx'), ty = g.querySelector('.hy'), text = g.querySelector('.sw-hover-text');
  const ok = h.pts.filter((p) => p.feasible);
  svg.addEventListener('pointermove', (e) => {
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    if (!ok.length || px < h.plotL || px > h.plotR) { g.setAttribute('visibility', 'hidden'); return; }
    let best = ok[0], bd = Infinity;
    for (const p of ok) { const d = Math.abs(h.sx(p.x) - px); if (d < bd) { bd = d; best = p; } }
    if (bd > 18) { g.setAttribute('visibility', 'hidden'); return; }
    const x = h.sx(best.x), y = h.sy(h.conv(best.y));
    ln.setAttribute('x1', x); ln.setAttribute('x2', x); ln.setAttribute('y1', h.plotT); ln.setAttribute('y2', h.plotB);
    dot.setAttribute('cx', x); dot.setAttribute('cy', y);
    const l1 = `${h.xSym} = ${formatNumber(best.x, Math.min(3, h.xd))}${h.xUnit ? ` ${h.xUnit}` : ''}`, l2 = `${formatNumber(h.conv(best.y), h.vd)}${h.yUnit ? ` ${h.yUnit}` : ''}`;
    const w = Math.max(l1.length, l2.length) * 7 + 16;
    const left = x > (h.plotL + h.plotR) / 2;
    const bx = left ? x - w - 10 : x + 10, by = Math.max(h.plotT, Math.min(y - 18, h.plotB - 36));
    box.setAttribute('x', bx); box.setAttribute('y', by); box.setAttribute('width', w);
    tx.textContent = l1; ty.textContent = l2;
    tx.setAttribute('x', bx + 8); tx.setAttribute('y', by + 15); ty.setAttribute('x', bx + 8); ty.setAttribute('y', by + 30);
    text.removeAttribute('x');
    g.setAttribute('visibility', 'visible');
  });
  svg.addEventListener('pointerleave', () => g.setAttribute('visibility', 'hidden'));
}
