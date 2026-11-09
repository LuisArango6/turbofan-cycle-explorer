// 3D model: every engine component with a physical part can be selected, and clicks on the casing map to the right one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEngine, componentAtX, STATION_POS, CORE_PATH } from '../js/engineModel.js';
import { COMPONENTS } from '../js/engine.js';

test('each physical component has at least one selectable part', () => {
  const { components } = buildEngine();
  const physical = COMPONENTS.map((c) => c.id).filter((id) => !['massFlow', 'thrust', 'jetPipe'].includes(id));
  for (const id of physical) assert.ok(components[id]?.length, `no 3D part tagged ${id}`);
  for (const id of Object.keys(components)) assert.ok(COMPONENTS.some((c) => c.id === id), `unknown component ${id}`);
});

test('casing clicks map to the component at that axial position', () => {
  assert.equal(componentAtX(0.5), 'inlet');
  assert.equal(componentAtX(2.0), 'ipc');
  assert.equal(componentAtX(2.8), 'hpc');
  assert.equal(componentAtX(3.3), 'combustor');
  assert.equal(componentAtX(3.65), 'hpt');
  assert.equal(componentAtX(3.85), 'ipt');
  assert.equal(componentAtX(4.2), 'lpt');
  assert.equal(componentAtX(4.55), 'jetPipe');
  assert.equal(componentAtX(5.0), 'coreNozzle');
});

test('station markers run downstream along the core in flow order', () => {
  const order = ['2', '21', '23', '3', '4', '41', '43', '5', '7', '9'];
  for (let i = 1; i < order.length; i++) assert.ok(STATION_POS[order[i]][0] > STATION_POS[order[i - 1]][0], order[i]);
});

test('core gas path is ordered and the annulus never closes', () => {
  for (let i = 0; i < CORE_PATH.length; i++) {
    const [x, rh, ro] = CORE_PATH[i];
    assert.ok(ro > rh + 0.05, `annulus too thin at x = ${x}`);
    if (i) assert.ok(x > CORE_PATH[i - 1][0]);
  }
});
