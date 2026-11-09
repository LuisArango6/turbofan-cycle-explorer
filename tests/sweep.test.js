// Trade-study sweeps: values match single runs, and the infeasible region is detected.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCycle, DEFAULT_INPUTS, PRESETS } from '../js/engine.js';
import { sweep, infeasibleBands, SWEEP_X } from '../js/sweep.js';

test('each swept point equals a single run at that value', () => {
  const pts = sweep(DEFAULT_INPUTS, 'TiT', 'tsfc', 11);
  for (const p of pts.filter((q) => q.feasible)) {
    const r = runCycle({ ...DEFAULT_INPUTS, TiT: p.x }).results;
    assert.ok(Math.abs(r.tsfc - p.y) < 1e-15);
  }
});

test('low turbine inlet temperature is marked as infeasible, high is feasible', () => {
  const pts = sweep(DEFAULT_INPUTS, 'TiT', 'thrust', 23);
  assert.equal(pts[0].feasible, false);          // 1400 K
  assert.equal(pts.at(-1).feasible, true);       // 1950 K
  const bands = infeasibleBands(pts);
  assert.equal(bands.length, 1);
  assert.equal(bands[0][0], SWEEP_X.TiT.min);
  assert.ok(bands[0][1] > 1650 && bands[0][1] < 1720, `boundary at ${bands[0][1]} K`);
});

test('the infeasible bypass ratio range starts where the core runs out of pressure', () => {
  const pts = sweep(DEFAULT_INPUTS, 'BPR', 'tsfc', 41);
  const firstBad = pts.find((p) => !p.feasible);
  assert.ok(firstBad && firstBad.x > 10, 'BPR 10 (the default) must be feasible');
  // TSFC falls with bypass ratio while the cycle closes
  const ok = pts.filter((p) => p.feasible && p.x >= 6);
  assert.ok(ok[0].y > ok.at(-1).y);
});

test('bands handle all-feasible and all-infeasible sweeps', () => {
  assert.deepEqual(infeasibleBands([{ x: 0, feasible: true }, { x: 1, feasible: true }]), []);
  assert.deepEqual(infeasibleBands([{ x: 0, feasible: false }, { x: 1, feasible: false }]), [[0, 1]]);
});

test('specific range can be plotted and matches a single run', () => {
  const pts = sweep(DEFAULT_INPUTS, 'altitude', 'specificRange', 7);
  for (const p of pts.filter((q) => q.feasible)) {
    const c = runCycle({ ...DEFAULT_INPUTS, altitude: p.x });
    assert.ok(Math.abs(p.y - c.results.specificRange) <= 1e-12 * Math.max(1, Math.abs(p.y)));
  }
});
