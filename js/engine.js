// Turbofan Cycle Explorer — calculation engine.
// Design-point analysis of a three-spool, separate-flow turbofan.
// Pure function: inputs → stations, results, checks and the calculation steps of every component.
// No DOM access, so it runs the same in the browser and in Node (tests).
//
// Internal units are SI base units: K, Pa, m/s, kg/s, W, N, J/kg.
// Station numbering follows the course figure (adapted from El-Sayed, 2017):
//   0 ambient · 2 fan face · 13 fan exit (bypass) · 19 fan nozzle exit
//   21 fan exit (core) · 23 IPC exit · b HPC bleed point · 3 HPC exit · 4 combustor exit
//   41 HPT exit · 43 IPT exit · 5 LPT exit · 7 core nozzle inlet · 9 core nozzle exit

import { isa, airProperties } from './atmosphere.js';

export const R_GAS = 287;                 // [J/(kg·K)] gas constant used in the cycle
export const JET_A_KG_PER_GAL = 3.103;    // [kg/gal] fuel density for specific range

/** Rolls-Royce Trent 1000 values from the course problem statement (take-off). */
export const DEFAULT_INPUTS = Object.freeze({
  // flight condition
  altitude: 2600,            // [m]
  mach: 0.25,                // [-] flight Mach number M0
  // main design parameters
  TiT: 1750,                 // [K] turbine inlet total temperature T04
  FPR: 1.54,                 // [-] fan pressure ratio
  IPCR: 6.58,                // [-] IP compressor pressure ratio
  HPCR: 4.93,                // [-] HP compressor pressure ratio
  BPR: 10,                   // [-] bypass ratio
  bleed: 0.108,              // [-] bleed ratio b = m_bleed / m_core
  fanDiameter: 2.85,         // [m]
  // advanced
  P_IPC: 500e3,              // [W] electric power taken from the IP spool
  LHV: 43.4e6,               // [J/kg] fuel lower heating value
  etaInlet: 0.92,
  etaFan: 0.93,
  etaCompressor: 0.91,       // IPC and HPC
  etaBurner: 0.98,
  etaTurbine: 0.93,          // HPT, IPT and LPT
  etaFanNozzle: 0.95,
  etaCoreNozzle: 0.95,
  etaMech: 0.99,             // every spool
  burnerPressureLoss: 0.03,  // [-] fraction of p03
  jetPipePressureLoss: 0.02, // [-] fraction of p05
  fanFaceMach: 0.7,          // [-] M2, sets the mass flow
  cpGas: 1148,               // [J/(kg·K)] hot gas, stations 4 to 9
  bleedTempFactor: 1.43,     // [-] T0b / T023 (problem statement)
  bleedPressureFactor: 3,    // [-] p0b / p023 (problem statement)
});

/** Flight-condition presets from the problem statement. Other inputs stay as they are. */
export const PRESETS = Object.freeze({
  takeoff: Object.freeze({ altitude: 2600, mach: 0.25, TiT: 1750, bleed: 0.108 }),
  cruise: Object.freeze({ altitude: 11000, mach: 0.85, TiT: 0.85 * 1750, bleed: 0.072 }),
});

/** Components in flow order, with the stations each one spans. */
export const COMPONENTS = Object.freeze([
  { id: 'inlet', name: 'Inlet', stations: '0 → 2' },
  { id: 'massFlow', name: 'Mass flow', stations: '2' },
  { id: 'fan', name: 'Fan', stations: '2 → 13 / 21' },
  { id: 'fanNozzle', name: 'Fan nozzle', stations: '13 → 19' },
  { id: 'ipc', name: 'IP compressor', stations: '21 → 23' },
  { id: 'hpc', name: 'HP compressor + bleed', stations: '23 → 3' },
  { id: 'combustor', name: 'Combustor', stations: '3 → 4' },
  { id: 'hpt', name: 'HP turbine', stations: '4 → 41' },
  { id: 'ipt', name: 'IP turbine', stations: '41 → 43' },
  { id: 'lpt', name: 'LP turbine', stations: '43 → 5' },
  { id: 'jetPipe', name: 'Jet pipe', stations: '5 → 7' },
  { id: 'coreNozzle', name: 'Core nozzle', stations: '7 → 9' },
  { id: 'thrust', name: 'Thrust and performance', stations: '' },
]);

// ---------------------------------------------------------------- helpers

/** Stagnation temperature after a compressor with pressure ratio pr. */
function compress(T0in, pr, eta, gamma) {
  return T0in * (1 + (pr ** ((gamma - 1) / gamma) - 1) / eta);
}

/** Convergent nozzle with isentropic efficiency eta. Returns the exit state. */
function nozzle({ T0i, P0i, Pamb, eta, gamma, cp, mdot }) {
  const criticalRatio = (1 - (1 / eta) * ((gamma - 1) / (gamma + 1))) ** (-gamma / (gamma - 1)); // p0i / pc
  const Pc = P0i / criticalRatio;
  const choked = P0i / Pamb >= criticalRatio;
  let Pe, Te, Ce;
  if (choked) {
    Pe = Pc;
    Te = (2 * T0i) / (gamma + 1);
    Ce = Math.sqrt(gamma * R_GAS * Te);
  } else {
    Pe = Pamb;
    Te = T0i * (1 - eta * (1 - (Pamb / P0i) ** ((gamma - 1) / gamma)));
    Ce = Math.sqrt(Math.max(0, 2 * cp * (T0i - Te)));
  }
  const rhoE = Pe / (R_GAS * Te);
  const Ae = Ce > 0 ? mdot / (rhoE * Ce) : NaN;
  return { criticalRatio, Pc, choked, Pe, Te, Ce, Ae, Me: Ce / Math.sqrt(gamma * R_GAS * Te) };
}

/**
 * Turbine pressure for a required total-temperature drop.
 * Returns null when the drop exceeds what the turbine can deliver
 * (1 − dT/(eta·T0in) ≤ 0: the spool cannot balance).
 */
function expand(T0in, P0in, dT, eta, gammaG) {
  const base = 1 - dT / (eta * T0in);
  if (!(base > 0)) return null;
  return { T0out: T0in - dT, P0out: P0in * base ** (gammaG / (gammaG - 1)), base };
}

function validate(inp) {
  const issues = [];
  for (const [k, v] of Object.entries(inp)) {
    if (typeof v !== 'number' || !Number.isFinite(v)) issues.push(`${k} must be a finite number`);
  }
  if (issues.length) return issues;
  const positive = ['TiT', 'FPR', 'IPCR', 'HPCR', 'fanDiameter', 'LHV', 'fanFaceMach', 'cpGas',
    'bleedTempFactor', 'bleedPressureFactor'];
  for (const k of positive) if (!(inp[k] > 0)) issues.push(`${k} must be greater than 0`);
  for (const k of ['FPR', 'IPCR', 'HPCR']) if (!(inp[k] >= 1)) issues.push(`${k} must be at least 1`);
  if (!(inp.BPR >= 0)) issues.push('BPR must be 0 or more');
  if (!(inp.mach >= 0 && inp.mach < 1)) issues.push('Flight Mach number must be between 0 and 1');
  if (!(inp.altitude >= 0 && inp.altitude <= 20000)) issues.push('Altitude must be between 0 and 20 000 m');
  if (!(inp.bleed >= 0 && inp.bleed < 1)) issues.push('Bleed ratio must be between 0 and 1');
  if (!(inp.P_IPC >= 0)) issues.push('IP spool power offtake must be 0 or more');
  for (const k of ['etaInlet', 'etaFan', 'etaCompressor', 'etaBurner', 'etaTurbine', 'etaFanNozzle', 'etaCoreNozzle', 'etaMech']) {
    if (!(inp[k] > 0 && inp[k] <= 1)) issues.push(`${k} must be between 0 and 1`);
  }
  for (const k of ['burnerPressureLoss', 'jetPipePressureLoss']) {
    if (!(inp[k] >= 0 && inp[k] < 1)) issues.push(`${k} must be between 0 and 1`);
  }
  return issues;
}

// ---------------------------------------------------------------- main

/**
 * Run the design-point cycle.
 * @param {Partial<typeof DEFAULT_INPUTS>} overrides values that replace the defaults
 * @returns {{
 *   inputs: object,
 *   feasible: boolean,
 *   issues: {code:string, component?:string, message:string}[],
 *   ambient: object,
 *   stations: Record<string, object>,
 *   nozzles: {fan?: object, core?: object},
 *   results: object|null,
 *   steps: {id:string, name:string, stations:string, items:object[]}[]
 * }}
 */
export function runCycle(overrides = {}) {
  const inp = { ...DEFAULT_INPUTS, ...overrides };
  const out = { inputs: inp, feasible: true, issues: [], ambient: null, stations: {}, nozzles: {}, results: null, steps: [] };

  const inputIssues = validate(inp);
  if (inputIssues.length) {
    out.feasible = false;
    out.issues = inputIssues.map((message) => ({ code: 'input', message }));
    return out;
  }

  const stepsById = Object.fromEntries(COMPONENTS.map((c) => [c.id, { ...c, items: [] }]));
  out.steps = COMPONENTS.map((c) => stepsById[c.id]);
  /** Record one calculated quantity: its symbol, value, unit, formula key and the values it used. */
  const rec = (component, key, symbol, value, unit, vars = {}) => {
    stepsById[component].items.push({ key, symbol, value, unit, formula: `${component}.${key}`, vars });
    return value;
  };
  const fail = (code, component, message) => {
    out.feasible = false;
    out.issues.push({ code, component, message });
    return out;
  };

  const S = out.stations;
  const { BPR, bleed: b, etaMech } = inp;
  const cpg = inp.cpGas;
  const gammaG = cpg / (cpg - R_GAS);

  // ---- ambient
  const amb = isa(inp.altitude);
  const air = airProperties(amb.T, amb.P);
  const { cp, gamma } = air;
  const T0 = amb.T, P0 = amb.P;
  out.ambient = { ...amb, cp, cv: air.cv, gamma, gammaG, cpg };
  S['0'] = { T: T0, P: P0, T0: T0 * (1 + ((gamma - 1) / 2) * inp.mach ** 2), P0: null, flow: 'air' };

  // ---- inlet 0 → 2
  const C0 = rec('inlet', 'C0', 'C_0', inp.mach * amb.a, 'm/s', { M0: inp.mach, a0: amb.a });
  const T02 = rec('inlet', 'T02', 'T_{02}', T0 * (1 + ((gamma - 1) / 2) * inp.mach ** 2), 'K', { T0, gamma, M0: inp.mach });
  const P02 = rec('inlet', 'P02', 'p_{02}',
    P0 * (1 + inp.etaInlet * ((gamma - 1) / 2) * inp.mach ** 2) ** (gamma / (gamma - 1)), 'Pa',
    { p0: P0, etaInlet: inp.etaInlet, gamma, M0: inp.mach });
  S['0'].P0 = P0 * (1 + ((gamma - 1) / 2) * inp.mach ** 2) ** (gamma / (gamma - 1)); // ideal ram total pressure
  S['0'].C = C0;
  S['0'].M = inp.mach;

  // ---- mass flow at the fan face (station 2)
  const M2 = inp.fanFaceMach;
  const T2 = rec('massFlow', 'T2', 'T_2', T02 / (1 + ((gamma - 1) / 2) * M2 ** 2), 'K', { T02, gamma, M2 });
  const P2 = rec('massFlow', 'P2', 'p_2', P02 * (T2 / T02) ** (gamma / (gamma - 1)), 'Pa', { p02: P02, T2, T02, gamma });
  const rho2 = rec('massFlow', 'rho2', '\\rho_2', P2 / (R_GAS * T2), 'kg/m³', { p2: P2, R: R_GAS, T2 });
  const C2 = rec('massFlow', 'C2', 'C_2', M2 * Math.sqrt(gamma * R_GAS * T2), 'm/s', { M2, gamma, R: R_GAS, T2 });
  const Afan = rec('massFlow', 'Afan', 'A_{fan}', Math.PI * inp.fanDiameter ** 2 / 4, 'm²', { Dfan: inp.fanDiameter });
  const mdot = rec('massFlow', 'mdot', '\\dot m', rho2 * Afan * C2, 'kg/s', { rho2, Afan, C2 });
  const mc = rec('massFlow', 'mdotCore', '\\dot m_{core}', mdot / (1 + BPR), 'kg/s', { mdot, BPR });
  const mb = BPR * mc;
  S['2'] = { T0: T02, P0: P02, T: T2, P: P2, C: C2, M: M2, flow: 'air' };

  // ---- fan 2 → 13 (bypass) and 2 → 21 (core), same pressure ratio
  const P013 = rec('fan', 'P013', 'p_{013}', P02 * inp.FPR, 'Pa', { p02: P02, FPR: inp.FPR });
  const T013 = rec('fan', 'T013', 'T_{013}', compress(T02, inp.FPR, inp.etaFan, gamma), 'K',
    { T02, FPR: inp.FPR, etaFan: inp.etaFan, gamma });
  const Wfan = rec('fan', 'Wfan', '\\dot W_{fan}', (1 + BPR) * mc * cp * (T013 - T02), 'W',
    { BPR, mdotCore: mc, cp, T013, T02 });
  const T021 = T013, P021 = P013;
  S['13'] = { T0: T013, P0: P013, flow: 'air' };
  S['21'] = { T0: T021, P0: P021, flow: 'air' };

  // ---- fan nozzle 13 → 19
  const fn = nozzle({ T0i: T013, P0i: P013, Pamb: P0, eta: inp.etaFanNozzle, gamma, cp, mdot: mb });
  out.nozzles.fan = fn;
  rec('fanNozzle', 'criticalRatio', '\\left(p_{013}/p_c\\right)', fn.criticalRatio, '-', { etaN: inp.etaFanNozzle, gamma });
  rec('fanNozzle', 'pressureRatio', 'p_{013}/p_0', P013 / P0, '-', { p013: P013, p0: P0 });
  rec('fanNozzle', 'choked', '\\text{choked}', fn.choked, '', { criticalRatio: fn.criticalRatio, pressureRatio: P013 / P0 });
  rec('fanNozzle', 'P19', 'p_{19}', fn.Pe, 'Pa', fn.choked ? { p013: P013, criticalRatio: fn.criticalRatio } : { p0: P0 });
  rec('fanNozzle', 'T19', 'T_{19}', fn.Te, 'K', fn.choked ? { T013, gamma }
    : { T013, etaN: inp.etaFanNozzle, p19: fn.Pe, p013: P013, gamma });
  rec('fanNozzle', 'C19', 'C_{19}', fn.Ce, 'm/s', fn.choked ? { gamma, R: R_GAS, T19: fn.Te } : { cp, T013, T19: fn.Te });
  rec('fanNozzle', 'A19', 'A_{19}', fn.Ae, 'm²', { mdotBypass: mb, p19: fn.Pe, R: R_GAS, T19: fn.Te, C19: fn.Ce });
  S['19'] = { T0: T013, P0: P013 * 1, T: fn.Te, P: fn.Pe, C: fn.Ce, M: fn.Me, flow: 'air' };

  // ---- IP compressor 21 → 23
  const P023 = rec('ipc', 'P023', 'p_{023}', P021 * inp.IPCR, 'Pa', { p021: P021, IPCR: inp.IPCR });
  const T023 = rec('ipc', 'T023', 'T_{023}', compress(T021, inp.IPCR, inp.etaCompressor, gamma), 'K',
    { T021, IPCR: inp.IPCR, etaC: inp.etaCompressor, gamma });
  const Wipc = rec('ipc', 'Wipc', '\\dot W_{IPC}', mc * cp * (T023 - T021), 'W', { mdotCore: mc, cp, T023, T021 });
  S['23'] = { T0: T023, P0: P023, flow: 'air' };

  // ---- HP compressor 23 → 3 with bleed at an intermediate point
  const T0b = rec('hpc', 'T0b', 'T_{0b}', inp.bleedTempFactor * T023, 'K', { k: inp.bleedTempFactor, T023 });
  const P0b = rec('hpc', 'P0b', 'p_{0b}', inp.bleedPressureFactor * P023, 'Pa', { k: inp.bleedPressureFactor, p023: P023 });
  const P03 = rec('hpc', 'P03', 'p_{03}', P023 * inp.HPCR, 'Pa', { p023: P023, HPCR: inp.HPCR });
  const T03 = rec('hpc', 'T03', 'T_{03}', compress(T023, inp.HPCR, inp.etaCompressor, gamma), 'K',
    { T023, HPCR: inp.HPCR, etaC: inp.etaCompressor, gamma });
  const Whpc = rec('hpc', 'Whpc', '\\dot W_{HPC}', mc * (cp * (T0b - T023) + (1 - b) * cp * (T03 - T0b)), 'W',
    { mdotCore: mc, cp, T0b, T023, b, T03 });
  rec('hpc', 'OPR', 'OPR', P03 / P02, '-', { FPR: inp.FPR, IPCR: inp.IPCR, HPCR: inp.HPCR });
  S['b'] = { T0: T0b, P0: P0b, flow: 'air' };
  S['3'] = { T0: T03, P0: P03, flow: 'air' };

  // ---- combustor 3 → 4: b is an input, f follows from the energy balance
  const T04 = inp.TiT;
  const P04 = rec('combustor', 'P04', 'p_{04}', P03 * (1 - inp.burnerPressureLoss), 'Pa',
    { p03: P03, dpb: inp.burnerPressureLoss });
  const f = rec('combustor', 'f', 'f',
    ((1 - b) * (cpg * T04 - cp * T03)) / (inp.etaBurner * inp.LHV - cpg * T04), '-',
    { b, cpg, T04, cpa: cp, T03, etaB: inp.etaBurner, LHV: inp.LHV });
  const mf = rec('combustor', 'mdotFuel', '\\dot m_f', f * mc, 'kg/s', { f, mdotCore: mc });
  const mg = 1 + f - b; // hot-gas flow per unit of core flow
  rec('combustor', 'T04check', 'T_{04}',
    ((1 - b) * cp * T03 + inp.etaBurner * f * inp.LHV) / (mg * cpg), 'K',
    { b, cpa: cp, T03, etaB: inp.etaBurner, f, LHV: inp.LHV, cpg });
  S['4'] = { T0: T04, P0: P04, flow: 'gas' };
  if (!(T04 > T03)) return fail('combustor', 'combustor', 'Turbine inlet temperature must be higher than the HP compressor exit temperature.');
  if (!(f > 0 && f < 0.05)) return fail('combustor', 'combustor', `Fuel-air ratio f = ${f.toFixed(4)} is outside the physical range (0 to 0.05).`);

  // ---- spool balances: each turbine delivers its compressor power / eta_mech
  const NO_PRESSURE = 'The turbines cannot drive the fan and compressors with these inputs: no pressure is left for the core nozzle.';

  const dThp = rec('hpt', 'dT', '\\Delta T_{0,HPT}', (cp * (T0b - T023) + (1 - b) * cp * (T03 - T0b)) / (etaMech * mg * cpg), 'K',
    { cpa: cp, T0b, T023, b, T03, etaM: etaMech, f, cpg });
  const hpt = expand(T04, P04, dThp, inp.etaTurbine, gammaG);
  if (!hpt) return fail('spool', 'hpt', NO_PRESSURE);
  const T041 = rec('hpt', 'T041', 'T_{041}', hpt.T0out, 'K', { T04, dT: dThp });
  const P041 = rec('hpt', 'P041', 'p_{041}', hpt.P0out, 'Pa', { p04: P04, etaT: inp.etaTurbine, T041, T04, gammaG });
  const Whpt = rec('hpt', 'Whpt', '\\dot W_{HPT}', mc * mg * cpg * dThp, 'W', { mdotCore: mc, f, b, cpg, T04, T041 });
  S['41'] = { T0: T041, P0: P041, flow: 'gas' };

  const dTip = rec('ipt', 'dT', '\\Delta T_{0,IPT}', (cp * (T023 - T021) + inp.P_IPC / mc) / (etaMech * mg * cpg), 'K',
    { cpa: cp, T023, T021, P_IPC: inp.P_IPC, mdotCore: mc, etaM: etaMech, f, b, cpg });
  const ipt = expand(T041, P041, dTip, inp.etaTurbine, gammaG);
  if (!ipt) return fail('spool', 'ipt', NO_PRESSURE);
  const T043 = rec('ipt', 'T043', 'T_{043}', ipt.T0out, 'K', { T041, dT: dTip });
  const P043 = rec('ipt', 'P043', 'p_{043}', ipt.P0out, 'Pa', { p041: P041, etaT: inp.etaTurbine, T043, T041, gammaG });
  const Wipt = rec('ipt', 'Wipt', '\\dot W_{IPT}', mc * mg * cpg * dTip, 'W', { mdotCore: mc, f, b, cpg, T041, T043 });
  S['43'] = { T0: T043, P0: P043, flow: 'gas' };

  const dTlp = rec('lpt', 'dT', '\\Delta T_{0,LPT}', ((1 + BPR) * cp * (T013 - T02)) / (etaMech * mg * cpg), 'K',
    { BPR, cpa: cp, T013, T02, etaM: etaMech, f, b, cpg });
  const lpt = expand(T043, P043, dTlp, inp.etaTurbine, gammaG);
  if (!lpt) return fail('spool', 'lpt', NO_PRESSURE);
  const T05 = rec('lpt', 'T05', 'T_{05}', lpt.T0out, 'K', { T043, dT: dTlp });
  const P05 = rec('lpt', 'P05', 'p_{05}', lpt.P0out, 'Pa', { p043: P043, etaT: inp.etaTurbine, T05, T043, gammaG });
  const Wlpt = rec('lpt', 'Wlpt', '\\dot W_{LPT}', mc * mg * cpg * dTlp, 'W', { mdotCore: mc, f, b, cpg, T043, T05 });
  S['5'] = { T0: T05, P0: P05, flow: 'gas' };

  // ---- jet pipe 5 → 7
  const T07 = rec('jetPipe', 'T07', 'T_{07}', T05, 'K', { T05 });
  const P07 = rec('jetPipe', 'P07', 'p_{07}', P05 * (1 - inp.jetPipePressureLoss), 'Pa', { p05: P05, dpj: inp.jetPipePressureLoss });
  S['7'] = { T0: T07, P0: P07, flow: 'gas' };
  if (!(P07 > P0)) return fail('coreNozzle', 'coreNozzle', NO_PRESSURE);

  // ---- core nozzle 7 → 9
  const cn = nozzle({ T0i: T07, P0i: P07, Pamb: P0, eta: inp.etaCoreNozzle, gamma: gammaG, cp: cpg, mdot: mc * mg });
  out.nozzles.core = cn;
  rec('coreNozzle', 'criticalRatio', '\\left(p_{07}/p_c\\right)', cn.criticalRatio, '-', { etaN: inp.etaCoreNozzle, gamma: gammaG });
  rec('coreNozzle', 'pressureRatio', 'p_{07}/p_0', P07 / P0, '-', { p07: P07, p0: P0 });
  rec('coreNozzle', 'choked', '\\text{choked}', cn.choked, '', { criticalRatio: cn.criticalRatio, pressureRatio: P07 / P0 });
  rec('coreNozzle', 'P9', 'p_9', cn.Pe, 'Pa', cn.choked ? { p07: P07, criticalRatio: cn.criticalRatio } : { p0: P0 });
  rec('coreNozzle', 'T9', 'T_9', cn.Te, 'K', cn.choked ? { T07, gamma: gammaG }
    : { T07, etaN: inp.etaCoreNozzle, p9: cn.Pe, p07: P07, gamma: gammaG });
  rec('coreNozzle', 'C9', 'C_9', cn.Ce, 'm/s', cn.choked ? { gamma: gammaG, R: R_GAS, T9: cn.Te } : { cp: cpg, T07, T9: cn.Te });
  rec('coreNozzle', 'A9', 'A_9', cn.Ae, 'm²', { mdotGas: mc * mg, p9: cn.Pe, R: R_GAS, T9: cn.Te, C9: cn.Ce });
  S['9'] = { T0: T07, P0: P07, T: cn.Te, P: cn.Pe, C: cn.Ce, M: cn.Me, flow: 'gas' };

  // ---- thrust and performance
  const FfanMom = BPR * mc * (fn.Ce - C0);
  const FfanPress = fn.choked ? fn.Ae * (fn.Pe - P0) : 0;
  const FcoreMom = mc * mg * cn.Ce - mc * C0;
  const FcorePress = cn.choked ? cn.Ae * (cn.Pe - P0) : 0;
  const Ffan = rec('thrust', 'Ffan', 'F_{fan}', FfanMom + FfanPress, 'N',
    { BPR, mdotCore: mc, C19: fn.Ce, C0, A19: fn.Ae, p19: fn.Pe, p0: P0, choked: fn.choked });
  const Fcore = rec('thrust', 'Fcore', 'F_{core}', FcoreMom + FcorePress, 'N',
    { mdotCore: mc, f, b, C9: cn.Ce, C0, A9: cn.Ae, p9: cn.Pe, p0: P0, choked: cn.choked });
  const F = rec('thrust', 'F', 'F', Ffan + Fcore, 'N', { Ffan, Fcore });
  const St = rec('thrust', 'St', 'S_t', F / mdot, 'm/s', { F, mdot });
  const tsfc = rec('thrust', 'TSFC', 'TSFC', mf / F, 'kg/(N·s)', { mdotFuel: mf, F });
  const eta0 = rec('thrust', 'eta0', '\\eta_0', inp.mach > 0 ? (F * C0) / (mf * inp.LHV) : 0, '-',
    { F, C0, mdotFuel: mf, LHV: inp.LHV });
  // η0 = η_th · η_p. Choked nozzles are replaced by the fully-expanded velocity that gives the same thrust,
  // so the pressure thrust is counted in the jet kinetic energy.
  const C19eq = rec('thrust', 'C19eq', 'C_{19,eq}', fn.Ce + (mb > 0 ? FfanPress / mb : 0), 'm/s', { C19: fn.Ce, A19: fn.Ae, p19: fn.Pe, p0: P0, mdotBypass: mb, choked: fn.choked });
  const C9eq = rec('thrust', 'C9eq', 'C_{9,eq}', cn.Ce + FcorePress / (mc * mg), 'm/s', { C9: cn.Ce, A9: cn.Ae, p9: cn.Pe, p0: P0, mdotGas: mc * mg, choked: cn.choked });
  const dKE = rec('thrust', 'dKE', '\Delta\dot{KE}', 0.5 * (mc * mg * C9eq ** 2 + mb * C19eq ** 2 - (1 + BPR) * mc * C0 ** 2), 'W',
    { mdotGas: mc * mg, C9eq, mdotBypass: mb, C19eq, mdot: (1 + BPR) * mc, C0 });
  const etaTh = rec('thrust', 'etaTh', '\eta_{th}', dKE / (mf * inp.LHV), '-', { dKE, mdotFuel: mf, LHV: inp.LHV });
  const etaP = rec('thrust', 'etaP', '\eta_p', inp.mach > 0 ? (F * C0) / dKE : 0, '-', { F, C0, dKE });
  const specificRange = rec('thrust', 'specificRange', 'SR', (C0 / 1000) / (2 * mf) * JET_A_KG_PER_GAL, 'km/gal',
    { C0, mdotFuel: mf, kgPerGal: JET_A_KG_PER_GAL });

  if (!(F > 0)) fail('thrust', 'thrust', 'Net thrust is zero or negative with these inputs.');

  out.results = {
    thrust: { net: F, fan: Ffan, core: Fcore, fanMomentum: FfanMom, fanPressure: FfanPress, coreMomentum: FcoreMom, corePressure: FcorePress },
    massFlow: { air: mdot, core: mc, bypass: mb, fuel: mf, bleed: b * mc, gas: mc * mg },
    f, b, OPR: P03 / P02,
    specificThrust: St,
    tsfc,
    eta0,
    etaTh,
    etaP,
    jetKineticPower: dKE,
    specificRange,
    power: { fan: Wfan, ipc: Wipc, hpc: Whpc, hpt: Whpt, ipt: Wipt, lpt: Wlpt, turbines: Whpt + Wipt + Wlpt },
    nozzles: { fan: { choked: fn.choked, area: fn.Ae, exitMach: fn.Me }, core: { choked: cn.choked, area: cn.Ae, exitMach: cn.Me } },
  };
  return out;
}
