// Engine against the corrected reference notebook (Analisis_Turbo_Fan_RR_Trent_1000_corregido.ipynb).
// Acceptance: every value within 0.2 % (covers the cp fit that replaces CoolProp).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCycle, PRESETS, DEFAULT_INPUTS } from '../js/engine.js';

const TOL = 0.002;
const kPa = 1000;

// Values copied from the executed corrected notebook (pressures converted kPa → Pa, thrust kN → N, power kW → W).
const REFERENCE = {
  takeoff: {
    inputs: PRESETS.takeoff,
    T02: 274.66629003820475, P02: 76.77524550309565 * kPa, C0: 82.54207416847292,
    mdot: 1092.1246092398596, mdotCore: 99.28405538544179,
    T013: 313.6059995739207, P013: 118.2338780747673 * kPa, C19: 275.340617591187, P19: 73.75879496258182 * kPa,
    T023: 560.5998269828184, P023: 777.9789177319689 * kPa, T03: 918.0766419426462, P03: 3835.4360644186063 * kPa,
    f: 0.023910496517452955, mdotFuel: 2.3739310605322124,
    T041: 1416.974152179503, P041: 1488.935979794492 * kPa, T043: 1173.648314759418, P043: 658.048233344221 * kPa,
    T05: 760.0624954773021, P05: 97.91625161599966 * kPa, P07: 95.95792658367967 * kPa,
    C9: 324.8689416801716, T9: 714.0956708830536,
    Fcore: 21346.94555880022, Ffan: 191418.21263413248, F: 212.7651581929327e3,
    St: 194.8176576123685, TSFC_lb: 0.3939037309199463,
    Wturb: 103343.27263965785e3, Wfan: 42744.010372199955e3, SR: 0.053945976023278046,
    fanChoked: false, coreChoked: false,
  },
  cruise: {
    inputs: PRESETS.cruise,
    T02: 248.25650423437642, P02: 35.15333655656688 * kPa, C0: 250.88055273347925,
    mdot: 525.956638843885, mdotCore: 47.814239894898634,
    T013: 283.4408455514338, P013: 54.13613829711299 * kPa, C19: 308.16038628326686, P19: 27.539913260710513 * kPa,
    T023: 506.59012432705083, P023: 356.2157899950035 * kPa, T03: 829.5058830484364, P03: 1756.143844675367 * kPa,
    f: 0.01989863540852037, mdotFuel: 0.9514381270041173,
    T041: 1193.8022960257258, P041: 655.7884104742102 * kPa, T043: 976.2678607578731, P043: 274.1118123405906 * kPa,
    T05: 615.8137133973318, P05: 36.23906963811973 * kPa, P07: 35.514288245357335 * kPa,
    C9: 377.0847423319441, T9: 553.8830065595492,
    Fcore: 5094.968734367683, Ffan: 45857.47260483369, F: 50.95244133920137e3,
    St: 96.87574521580501, TSFC_lb: 0.6592316584464513,
    Wturb: 45354.59111388741e3, Wfan: 18567.19351090515e3, SR: 0.40910823995632106,
    fanChoked: true, coreChoked: false,
  },
};

const KG_NS_TO_LBM_LBFH = 3600 * 2.20462 * 4.44822;

function pick(c) {
  const S = c.stations, R = c.results;
  return {
    T02: S['2'].T0, P02: S['2'].P0, C0: S['0'].C,
    mdot: R.massFlow.air, mdotCore: R.massFlow.core,
    T013: S['13'].T0, P013: S['13'].P0, C19: S['19'].C, P19: S['19'].P,
    T023: S['23'].T0, P023: S['23'].P0, T03: S['3'].T0, P03: S['3'].P0,
    f: R.f, mdotFuel: R.massFlow.fuel,
    T041: S['41'].T0, P041: S['41'].P0, T043: S['43'].T0, P043: S['43'].P0,
    T05: S['5'].T0, P05: S['5'].P0, P07: S['7'].P0,
    C9: S['9'].C, T9: S['9'].T,
    Fcore: R.thrust.core, Ffan: R.thrust.fan, F: R.thrust.net,
    St: R.specificThrust, TSFC_lb: R.tsfc * KG_NS_TO_LBM_LBFH,
    Wturb: R.power.turbines, Wfan: R.power.fan, SR: R.specificRange,
  };
}

for (const [name, ref] of Object.entries(REFERENCE)) {
  test(`${name}: every value within 0.2 % of the notebook`, () => {
    const c = runCycle(ref.inputs);
    assert.equal(c.feasible, true, JSON.stringify(c.issues));
    const got = pick(c);
    const failures = [];
    for (const [k, v] of Object.entries(got)) {
      const err = Math.abs(v - ref[k]) / Math.abs(ref[k]);
      if (!(err <= TOL)) failures.push(`${k}: got ${v}, expected ${ref[k]} (${(err * 100).toFixed(3)} %)`);
    }
    assert.deepEqual(failures, []);
  });

  test(`${name}: nozzle states match the notebook`, () => {
    const c = runCycle(ref.inputs);
    assert.equal(c.results.nozzles.fan.choked, ref.fanChoked);
    assert.equal(c.results.nozzles.core.choked, ref.coreChoked);
  });

  test(`${name}: combustor balance returns T04 = TiT`, () => {
    const c = runCycle(ref.inputs);
    const check = c.steps.find((s) => s.id === 'combustor').items.find((i) => i.key === 'T04check').value;
    assert.ok(Math.abs(check - ref.inputs.TiT) < 0.01, `T04 check = ${check}`);
  });
}

test('defaults are the take-off case', () => {
  for (const [k, v] of Object.entries(PRESETS.takeoff)) assert.equal(DEFAULT_INPUTS[k], v);
});

test('cruise TiT is 85 % of take-off', () => {
  assert.equal(PRESETS.cruise.TiT, 1487.5);
});

test('TiT = 1650 K at take-off is infeasible: no pressure left for the core nozzle', () => {
  const c = runCycle({ ...PRESETS.takeoff, TiT: 1650 });
  assert.equal(c.feasible, false);
  assert.equal(c.results, null);
  assert.ok(c.issues.some((i) => i.code === 'spool' || i.code === 'coreNozzle'));
});

test('bleed b = 0.15 at take-off is infeasible: the spools do not balance', () => {
  const c = runCycle({ ...PRESETS.takeoff, bleed: 0.15 });
  assert.equal(c.feasible, false);
  assert.ok(c.issues.some((i) => i.code === 'spool' || i.code === 'coreNozzle'));
});

test('bleed b = 0.14 at take-off is still feasible', () => {
  assert.equal(runCycle({ ...PRESETS.takeoff, bleed: 0.14 }).feasible, true);
});

test('more bleed means less thrust (take-off)', () => {
  const F = (b) => runCycle({ ...PRESETS.takeoff, bleed: b }).results.thrust.net;
  assert.ok(F(0) > F(0.05) && F(0.05) > F(0.108));
});

test('TSFC is higher at cruise but overall efficiency is higher too', () => {
  const to = runCycle(PRESETS.takeoff).results, cr = runCycle(PRESETS.cruise).results;
  assert.ok(cr.tsfc > to.tsfc);
  assert.ok(cr.eta0 > to.eta0);
});

test('static condition (M0 = 0) gives eta0 = 0 and finite thrust', () => {
  // with b = 0.108 the sea-level cycle does not close (see next test), so use b = 0.05
  const c = runCycle({ altitude: 0, mach: 0, bleed: 0.05 });
  assert.equal(c.feasible, true, JSON.stringify(c.issues));
  assert.equal(c.results.eta0, 0);
  assert.ok(c.results.thrust.net > 0);
});

test('sea-level static with b = 0.108 and TiT = 1750 K is infeasible', () => {
  // warmer air at sea level raises fan and compressor work; with that much bleed the turbines run out of pressure
  assert.equal(runCycle({ altitude: 0, mach: 0 }).feasible, false);
});

test('invalid inputs are reported, not thrown', () => {
  const c = runCycle({ FPR: -1, altitude: 30000 });
  assert.equal(c.feasible, false);
  assert.ok(c.issues.length >= 2);
  assert.ok(c.issues.every((i) => i.code === 'input'));
});

test('every component records its steps', () => {
  const c = runCycle(PRESETS.takeoff);
  for (const s of c.steps) assert.ok(s.items.length > 0, `${s.id} has no steps`);
  for (const s of c.steps) for (const i of s.items) {
    assert.ok(i.formula && i.symbol && i.unit !== undefined, `${s.id}.${i.key} incomplete`);
  }
});

test('overall efficiency splits into thermal × propulsive', () => {
  for (const preset of [PRESETS.takeoff, PRESETS.cruise]) {
    const r = runCycle(preset).results;
    assert.ok(Math.abs(r.eta0 - r.etaTh * r.etaP) < 1e-9, `${r.eta0} vs ${r.etaTh * r.etaP}`);
  }
  const cr = runCycle(PRESETS.cruise).results;
  // values found when reviewing the cruise efficiency with the notebook data
  assert.ok(Math.abs(cr.etaTh - 0.373) < 0.003, `eta_th = ${cr.etaTh}`);
  assert.ok(Math.abs(cr.etaP - 0.829) < 0.003, `eta_p = ${cr.etaP}`);
});
