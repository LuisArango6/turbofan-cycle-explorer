// Calculation-steps panel: shows, for one component, what it does, the symbolic equations,
// the same equations with the current numbers, and the results. Rendered with KaTeX.

import { COMPONENTS } from './engine.js';
import { TEMPLATES, stepLatex } from './equations.js';

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Render LaTeX with KaTeX when it is loaded; plain code otherwise. */
export function tex(latex, displayMode = true) {
  const k = globalThis.katex;
  if (!k) return `<code>${escapeHtml(latex)}</code>`;
  return k.renderToString(latex, { displayMode, throwOnError: false, strict: 'ignore', output: 'html' });
}

/** Which component produces each station (used when a station row is clicked). */
export const STATION_COMPONENT = {
  0: 'inlet', 2: 'massFlow', 13: 'fan', 21: 'fan', 19: 'fanNozzle', 23: 'ipc', b: 'hpc', 3: 'hpc',
  4: 'combustor', 41: 'hpt', 43: 'ipt', 5: 'lpt', 7: 'jetPipe', 9: 'coreNozzle',
};

function componentState(cycle, id) {
  const step = cycle.steps.find((s) => s.id === id);
  if (cycle.issues.some((i) => i.component === id)) return 'failed';
  if (!step || step.items.length === 0) return 'skipped';
  return 'done';
}

/** Why the cycle stops at this component, written as the inequality that fails. */
function failureCheck(cycle, id) {
  const S = cycle.stations, I = cycle.inputs;
  const f2 = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—');
  if (id === 'coreNozzle' && S['7']) {
    const r = S['7'].P0 / S['0'].P;
    return `<div class="math-step"><p class="math-label">The gas reaches the nozzle below ambient pressure, so it cannot expand and leave</p>
      <div class="math-eq math-numeric">${tex(`\\frac{p_{07}}{p_0} = \\frac{${f2(S['7'].P0 / 1000)}}{${f2(S['0'].P / 1000)}} = ${f2(r, 3)} \\; < \\; 1`)}</div></div>`;
  }
  const turb = { hpt: ['04', '041'], ipt: ['041', '043'], lpt: ['043', '05'] }[id];
  if (turb) {
    const dT = cycle.steps.find((s) => s.id === id)?.items.find((i) => i.key === 'dT')?.value;
    const Tin = S[turb[0].replace(/^0/, '')]?.T0;
    const base = 1 - dT / (I.etaTurbine * Tin);
    return `<div class="math-step"><p class="math-label">The required temperature drop is more than this turbine can deliver, even expanding to zero pressure</p>
      <div class="math-eq math-numeric">${tex(`1 - \\frac{\\Delta T_0}{\\eta_t\\,T_{${turb[0]}}} = 1 - \\frac{${f2(dT)}}{${f2(I.etaTurbine, 3)}\\times${f2(Tin)}} = ${f2(base, 4)} \\; \\le \\; 0`)}</div></div>`;
  }
  return '';
}

/** Component selector in flow order. */
export function renderTabs(el, cycle, activeId) {
  el.innerHTML = COMPONENTS.map((c, i) => {
    const st = cycle.steps.length ? componentState(cycle, c.id) : 'skipped';
    const sep = i ? '<span class="tab-sep" aria-hidden="true">›</span>' : '';
    return `${sep}<button type="button" class="tab tab-${st}" data-component="${c.id}" aria-pressed="${c.id === activeId}"
      title="${escapeHtml(c.name)}${c.stations ? ` · stations ${escapeHtml(c.stations)}` : ''}">${escapeHtml(c.name)}</button>`;
  }).join('');
}

/** The steps of one component. */
export function renderPanel(el, cycle, id) {
  const idx = COMPONENTS.findIndex((c) => c.id === id);
  const comp = COMPONENTS[idx];
  const tpl = TEMPLATES[id];
  const step = cycle.steps.find((s) => s.id === id);
  const issue = cycle.issues.find((i) => i.component === id);
  const prev = COMPONENTS[idx - 1], next = COMPONENTS[idx + 1];

  let body;
  if (cycle.issues.some((i) => i.code === 'input')) {
    body = `<p class="math-empty">Fix the inputs to see the calculation: ${cycle.issues.map((i) => escapeHtml(i.message)).join(' ')}</p>`;
  } else if (issue && (issue.code === 'spool' || issue.code === 'coreNozzle')) {
    body = (step?.items ?? []).map((item) => {
      const l = stepLatex(id, item);
      return l ? `<div class="math-step"><p class="math-label">${escapeHtml(l.label)}</p>${l.symbolic ? `<div class="math-eq math-symbolic">${tex(l.symbolic)}</div>` : ''}<div class="math-eq math-numeric">${tex(l.numeric)}</div></div>` : '';
    }).join('') + failureCheck(cycle, id);
  } else if (!step || step.items.length === 0) {
    const stop = COMPONENTS.find((c) => cycle.issues.some((i) => i.component === c.id));
    body = `<p class="math-empty">Not calculated: the cycle stops earlier${stop ? `, at the ${escapeHtml(stop.name.toLowerCase())}` : ''}.</p>`;
  } else {
    body = step.items.map((item) => {
      const l = stepLatex(id, item);
      if (!l) return '';
      return `<div class="math-step">
        <p class="math-label">${escapeHtml(l.label)}</p>
        ${l.symbolic ? `<div class="math-eq math-symbolic">${tex(l.symbolic)}</div>` : ''}
        <div class="math-eq math-numeric">${tex(l.numeric)}</div>
      </div>`;
    }).join('');
  }

  el.innerHTML = `
    <header class="math-head">
      <div>
        <h3>${escapeHtml(comp.name)}${comp.stations ? ` <span class="math-stations">${escapeHtml(comp.stations)}</span>` : ''}</h3>
        <p class="math-summary">${escapeHtml(tpl?.summary ?? '')}</p>
      </div>
    </header>
    ${issue ? `<div class="status warn math-issue"><strong>The cycle does not close here.</strong> ${escapeHtml(issue.message)}</div>` : ''}
    <div class="math-steps">${body}</div>
    <footer class="math-nav">
      ${prev ? `<button type="button" class="btn" data-component="${prev.id}">← ${escapeHtml(prev.name)}</button>` : '<span></span>'}
      ${next ? `<button type="button" class="btn" data-component="${next.id}">${escapeHtml(next.name)} →</button>` : '<span></span>'}
    </footer>`;
}
