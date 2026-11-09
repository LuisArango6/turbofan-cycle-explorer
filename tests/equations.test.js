// Every recorded calculation step has a LaTeX template, and KaTeX renders all of them without errors.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { runCycle, PRESETS, COMPONENTS } from '../js/engine.js';
import { TEMPLATES, stepLatex, n } from '../js/equations.js';

const katex = createRequire(import.meta.url)('../vendor/katex/katex.min.js');
const render = (s) => katex.renderToString(s, { displayMode: true, throwOnError: true, strict: 'ignore' });

const CASES = {
  takeoff: PRESETS.takeoff,
  cruise: PRESETS.cruise,                                   // choked fan nozzle
  'core nozzle choked': { ...PRESETS.cruise, TiT: 1700 },   // choked core nozzle branch
  'sea level, infeasible': { altitude: 0, mach: 0 },
};

for (const [name, inputs] of Object.entries(CASES)) {
  test(`${name}: every step has a template that KaTeX renders`, () => {
    const c = runCycle(inputs);
    for (const step of c.steps) {
      for (const item of step.items) {
        const l = stepLatex(step.id, item);
        assert.ok(l, `no template for ${step.id}.${item.key}`);
        assert.ok(l.label, `${step.id}.${item.key} has no label`);
        if (l.symbolic) assert.doesNotThrow(() => render(l.symbolic), `${step.id}.${item.key} symbolic`);
        assert.doesNotThrow(() => render(l.numeric), `${step.id}.${item.key} numeric: ${l.numeric}`);
        assert.ok(!l.numeric.includes('NaN') && !l.numeric.includes('undefined'), `${step.id}.${item.key}: ${l.numeric}`);
      }
    }
  });
}

test('the choked core nozzle case really takes the choked branch', () => {
  const c = runCycle(CASES['core nozzle choked']);
  assert.equal(c.feasible, true);
  assert.equal(c.results.nozzles.core.choked, true);
});

test('every component has a summary', () => {
  for (const comp of COMPONENTS) assert.ok(TEMPLATES[comp.id]?.summary, comp.id);
});

test('number formatting', () => {
  assert.equal(n(1092.1246, 2), '1092.12');
  assert.equal(n(43400000, 0), '43\\,400\\,000');
  assert.equal(n(-5.5, 1), '-5.5');
  assert.equal(n(NaN), '\\text{—}');
});
