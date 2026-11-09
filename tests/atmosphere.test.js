// ISA and air properties against the Python reference (ambiance + CoolProp).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isa, airProperties } from '../js/atmosphere.js';

const ref = JSON.parse(readFileSync(new URL('./isa_reference.json', import.meta.url), 'utf8'));
const close = (actual, expected, relTol, label) => {
  const err = Math.abs(actual - expected) / Math.abs(expected);
  assert.ok(err <= relTol, `${label}: got ${actual}, expected ${expected} (error ${(err * 100).toFixed(4)} %)`);
};

for (const r of ref) {
  test(`ISA at ${r.h} m matches ambiance`, () => {
    const a = isa(r.h);
    close(a.T, r.T, 1e-6, 'T');
    close(a.P, r.P, 1e-5, 'P');
    close(a.a, r.a, 1e-6, 'a');
  });
  test(`air cp and cv at ${r.h} m match CoolProp`, () => {
    const p = airProperties(r.T, r.P);
    close(p.cp, r.cp, 1e-4, 'cp');
    close(p.cv, r.cv, 1e-4, 'cv');
  });
}

test('altitude outside 0–20 km is rejected', () => {
  assert.throws(() => isa(-1), RangeError);
  assert.throws(() => isa(20001), RangeError);
});
