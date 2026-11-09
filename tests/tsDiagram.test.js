// Entropy of the plotted states follows the second law, and the axis ticks are sensible.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCycle, PRESETS } from '../js/engine.js';
import { cyclePoints, niceTicks } from '../js/tsDiagram.js';

const byId = (c) => Object.fromEntries(cyclePoints(c).map((p) => [p.id, p]));

test('ambient state is the entropy reference', () => {
  const p = byId(runCycle(PRESETS.takeoff));
  assert.ok(Math.abs(p['0'].s) < 1e-9);
});

test('with real components, entropy rises through every compression and expansion', () => {
  for (const preset of [PRESETS.takeoff, PRESETS.cruise]) {
    const p = byId(runCycle(preset));
    for (const [a, b] of [['0', '2'], ['2', '13'], ['13', '23'], ['23', '3'], ['4', '41'], ['41', '43'], ['43', '5'], ['5', '7'], ['13', '19'], ['7', '9']]) {
      assert.ok(p[b].s > p[a].s, `s${b} (${p[b].s}) should exceed s${a} (${p[a].s})`);
    }
  }
});

test('with ideal components, the air compressions are isentropic', () => {
  const ideal = { etaInlet: 1, etaFan: 1, etaCompressor: 1, etaTurbine: 1, etaFanNozzle: 1, etaCoreNozzle: 1, etaMech: 1 };
  const p = byId(runCycle({ ...PRESETS.takeoff, ...ideal }));
  for (const id of ['2', '13', '23', '3', '19']) assert.ok(Math.abs(p[id].s) < 1e-6, `s${id} = ${p[id].s}`);
});

test('with ideal turbines, the gas expansions keep the entropy of station 4', () => {
  const ideal = { etaTurbine: 1, etaCoreNozzle: 1, jetPipePressureLoss: 0 };
  const p = byId(runCycle({ ...PRESETS.takeoff, ...ideal }));
  for (const id of ['41', '43', '5', '7', '9']) assert.ok(Math.abs(p[id].s - p['4'].s) < 1e-6, `s${id} − s4 = ${p[id].s - p['4'].s}`);
});

test('an infeasible cycle still plots the stations it reached', () => {
  const p = byId(runCycle({ altitude: 0, mach: 0 }));
  assert.ok(p['7'] && !p['9']);
});

test('ticks are round and cover the range', () => {
  const t = niceTicks(200, 1850, 7);
  assert.deepEqual(t, [250, 500, 750, 1000, 1250, 1500, 1750]);
  const s = niceTicks(-120, 1430, 7);
  assert.ok(s[0] >= -120 && s.at(-1) <= 1430 && s.length >= 4);
});
