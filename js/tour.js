// Guided tour: the camera follows the air through the engine, one stop per component,
// with a short explanation and the values calculated for the current inputs.

import { display, formatNumber } from './units.js';

const v = (q, x, units) => { const d = display(q, x, units); return `${d.text} ${d.unit}`; };

/**
 * Stops in flow order. cam / target are engine coordinates (m, before scaling);
 * text(cycle, units) returns HTML with live numbers.
 */
export const TOUR = [
  {
    component: 'inlet', title: 'Inlet: ram compression', cam: [-2.4, 1.5, 4.6], target: [0.4, 0.55, 0],
    text: (c, u) => `Air arrives at ${v('velocity', c.stations['0']?.C, u)}. The intake slows it down, so its kinetic energy becomes pressure: the total pressure at the fan face is <b>${v('pressure', c.stations['2']?.P0, u)}</b> against ${v('pressure', c.ambient.P, u)} outside.`,
  },
  {
    component: 'fan', title: 'Fan: most of the thrust starts here', cam: [-0.2, 1.7, 4.0], target: [1.05, 0.7, 0],
    text: (c, u) => `The fan raises the pressure of all the air by FPR = ${formatNumber(c.inputs.FPR, 2)}. Then the flow splits: <b>${formatNumber(c.inputs.BPR, 1)} parts</b> go round the core through the bypass for each part that enters it. The fan absorbs ${v('power', c.results?.power.fan, u)}.`,
  },
  {
    component: 'fanNozzle', title: 'Bypass duct and fan nozzle', cam: [1.6, 2.6, 4.8], target: [2.6, 1.1, 0],
    text: (c, u) => `The bypass air leaves at <b>${v('velocity', c.stations['19']?.C, u)}</b>${c.results?.nozzles.fan.choked ? ', choked at Mach 1' : ''}. It never meets fuel, yet it gives <b>${c.results ? formatNumber((c.results.thrust.fan / c.results.thrust.net) * 100, 0) : '—'} %</b> of the net thrust.`,
  },
  {
    component: 'ipc', title: 'IP compressor: 8 stages', cam: [1.3, 1.25, 2.7], target: [2.0, 0.5, 0],
    text: (c, u) => `Each stage adds a little pressure. Over 8 stages π<sub>IPC</sub> = ${formatNumber(c.inputs.IPCR, 2)} takes the core air to <b>${v('pressure', c.stations['23']?.P0, u)}</b> and ${v('temperature', c.stations['23']?.T0, u)}. It is driven by the IP turbine.`,
  },
  {
    component: 'hpc', title: 'HP compressor: 6 stages and the bleed', cam: [2.2, 1.15, 2.3], target: [2.78, 0.44, 0],
    text: (c, u) => `π<sub>HPC</sub> = ${formatNumber(c.inputs.HPCR, 2)} brings the overall pressure ratio to <b>${c.results ? formatNumber(c.results.OPR, 1) : '—'}</b>. ${formatNumber(c.inputs.bleed * 100, 1)} % of the air is bled part-way along; the rest reaches <b>${v('temperature', c.stations['3']?.T0, u)}</b> before the combustor.`,
  },
  {
    component: 'combustor', title: 'Combustor', cam: [2.8, 1.15, 2.2], target: [3.32, 0.46, 0],
    text: (c, u) => `Fuel burns at almost constant pressure and the gas reaches the turbine inlet temperature, <b>${v('temperature', c.inputs.TiT, u)}</b>. The fuel-air ratio comes out of the energy balance: f = ${c.results ? formatNumber(c.results.f, 4) : '—'}, ${v('fuelFlow', c.results?.massFlow.fuel, u)} of fuel.`,
  },
  {
    component: 'hpt', title: 'HP turbine: one stage, the hottest', cam: [3.25, 1.05, 2.0], target: [3.66, 0.46, 0],
    text: (c, u) => `A single stage extracts <b>${v('power', c.results?.power.hpt, u)}</b> to drive the HP compressor through the HP shaft. The gas cools to ${v('temperature', c.stations['41']?.T0, u)}.`,
  },
  {
    component: 'ipt', title: 'IP turbine', cam: [3.5, 1.05, 2.0], target: [3.86, 0.48, 0],
    text: (c, u) => `Drives the IP compressor and the electrical generator (${v('power', c.inputs.P_IPC, u)}). It takes ${v('power', c.results?.power.ipt, u)} from the gas.`,
  },
  {
    component: 'lpt', title: 'LP turbine: 6 stages for the fan', cam: [3.7, 1.3, 2.5], target: [4.22, 0.55, 0],
    text: (c, u) => `The biggest job: <b>${v('power', c.results?.power.lpt, u)}</b> to turn the fan. After it, only ${v('pressure', c.stations['5']?.P0, u)} is left for the core nozzle, against ${v('pressure', c.ambient.P, u)} outside.`,
  },
  {
    component: 'coreNozzle', title: 'Core nozzle', cam: [5.9, 1.6, 4.2], target: [4.6, 0.4, 0],
    text: (c, u) => `The hot gas expands and leaves at <b>${v('velocity', c.stations['9']?.C, u)}</b>, giving ${v('thrust', c.results?.thrust.core, u)} of thrust.`,
  },
  {
    component: 'thrust', title: 'The whole engine', cam: null, target: null,
    text: (c, u) => `Net thrust <b>${v('thrust', c.results?.thrust.net, u)}</b>, TSFC ${v('tsfc', c.results?.tsfc, u)}, overall efficiency η<sub>0</sub> = ${c.results ? formatNumber(c.results.eta0 * 100, 1) : '—'} %. Change any input on the left and every number on this tour follows.`,
  },
];
