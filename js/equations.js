// LaTeX templates for the calculation steps recorded by engine.js.
// For every step: a short label, the symbolic equation, and the same equation with numbers.
// Equations are shown in SI (pressures in kPa, powers in MW, specific heats in J/(kg·K)).

// ---------------------------------------------------------------- number formatting for LaTeX
/** Fixed decimals with thin-space thousands separators: 1\,092.12 */
export function n(x, d = 2) {
  if (x === null || x === undefined || !Number.isFinite(x)) return '\\text{—}';
  const neg = x < 0;
  const [int, frac] = Math.abs(x).toFixed(d).split('.');
  const grouped = int.length > 4 ? int.replace(/\B(?=(\d{3})+(?!\d))/g, '\\,') : int;
  return `${neg ? '-' : ''}${grouped}${frac ? `.${frac}` : ''}`;
}
const kPa = (p, d = 2) => n(p / 1000, d);          // Pa → kPa
const MW = (w, d = 2) => n(w / 1e6, d);            // W → MW
const g = (x) => n(x, 4);                          // ratios of specific heats
const e = (x) => n(x, 3);                          // efficiencies and fractions
const paren = (s) => `\\left(${s}\\right)`;

/** How each engine unit is shown in the panel: factor from SI and the LaTeX unit. */
export const RESULT_UNITS = {
  K: { f: 1, unit: '\\text{K}', d: 2 },
  Pa: { f: 1e-3, unit: '\\text{kPa}', d: 2 },
  'm/s': { f: 1, unit: '\\text{m/s}', d: 2 },
  'kg/s': { f: 1, unit: '\\text{kg/s}', d: 3 },
  'kg/m³': { f: 1, unit: '\\text{kg/m}^3', d: 4 },
  'm²': { f: 1, unit: '\\text{m}^2', d: 4 },
  W: { f: 1e-6, unit: '\\text{MW}', d: 3 },
  N: { f: 1e-3, unit: '\\text{kN}', d: 3 },
  'kg/(N·s)': { f: 1e6, unit: '\\text{g}/(\\text{kN}\\cdot\\text{s})', d: 3 },
  'km/gal': { f: 1, unit: '\\text{km/gal}', d: 4 },
  '-': { f: 1, unit: '', d: 4 },
};

// ---------------------------------------------------------------- shared pieces
const compressorT = (Tout, Tin, pr, eta) => ({
  eq: `${Tout} = ${Tin}\\left[1 + \\frac{1}{${eta}}\\left(${pr}^{\\frac{\\gamma-1}{\\gamma}} - 1\\right)\\right]`,
});
const compressorTsub = (Tin, pr, eta, gamma) =>
  `${n(Tin)}\\left[1 + \\frac{1}{${e(eta)}}\\left(${n(pr, 2)}^{\\frac{${g(gamma)}-1}{${g(gamma)}}} - 1\\right)\\right]`;

const turbineP = (Pout, Pin, Tout, Tin) =>
  `${Pout} = ${Pin}\\left[1 - \\frac{1}{\\eta_t}\\left(1 - \\frac{${Tout}}{${Tin}}\\right)\\right]^{\\frac{\\gamma_g}{\\gamma_g-1}}`;
const turbinePsub = (v, pin, tout, tin) =>
  `${kPa(pin)}\\left[1 - \\frac{1}{${e(v.etaT)}}\\left(1 - \\frac{${n(tout)}}{${n(tin)}}\\right)\\right]^{\\frac{${g(v.gammaG)}}{${g(v.gammaG)}-1}}`;

const turbinePower = (W, Tin, Tout) => `${W} = \\dot m_{core}(1+f-b)\\,c_{pg}\\,(${Tin} - ${Tout})`;
const turbinePowerSub = (v, tin, tout) =>
  `${n(v.mdotCore, 3)}\\,(1+${n(v.f, 5)}-${e(v.b)})\\,(${n(v.cpg, 0)})\\,(${n(tin)} - ${n(tout)})`;

/** Nozzle templates, shared by the fan nozzle (13 → 19) and the core nozzle (7 → 9). */
function nozzleTemplates(i, e9, gammaSym, cpSym, flowSym) {
  // i: inlet station ('013' or '07'); e9: exit station ('19' or '9')
  return {
    criticalRatio: {
      label: 'Critical pressure ratio of a nozzle with losses',
      eq: `\\left(\\frac{p_{${i}}}{p_c}\\right) = \\left[1 - \\frac{1}{\\eta_n}\\,\\frac{${gammaSym}-1}{${gammaSym}+1}\\right]^{-\\frac{${gammaSym}}{${gammaSym}-1}}`,
      sub: (v) => `\\left[1 - \\frac{1}{${e(v.etaN)}}\\,\\frac{${g(v.gamma)}-1}{${g(v.gamma)}+1}\\right]^{-\\frac{${g(v.gamma)}}{${g(v.gamma)}-1}}`,
    },
    pressureRatio: {
      label: 'Available pressure ratio',
      eq: `\\frac{p_{${i}}}{p_0}`,
      sub: (v) => `\\frac{${kPa(v[`p${i}`])}}{${kPa(v.p0)}}`,
    },
    choked: {
      label: 'Choking check',
      custom: (item) => {
        const v = item.vars;
        const rel = item.value ? '\\ge' : '<';
        const verdict = item.value ? '\\text{choked: the exit runs at Mach 1}' : '\\text{not choked: the jet expands to } p_0';
        return `\\frac{p_{${i}}}{p_0} = ${n(v.pressureRatio, 3)} \\; ${rel} \\; ${n(v.criticalRatio, 3)} = \\left(\\frac{p_{${i}}}{p_c}\\right) \\;\\Rightarrow\\; ${verdict}`;
      },
    },
    [`P${e9}`]: {
      label: 'Exit static pressure',
      eq: (v) => (v.criticalRatio !== undefined ? `p_{${e9}} = p_c = \\frac{p_{${i}}}{\\left(p_{${i}}/p_c\\right)}` : `p_{${e9}} = p_0`),
      sub: (v) => (v.criticalRatio !== undefined ? `\\frac{${kPa(v[`p${i}`])}}{${n(v.criticalRatio, 4)}}` : null),
    },
    [`T${e9}`]: {
      label: 'Exit static temperature',
      eq: (v) => (v.etaN === undefined
        ? `T_{${e9}} = T_{${i}}\\,\\frac{2}{${gammaSym}+1}`
        : `T_{${e9}} = T_{${i}}\\left[1 - \\eta_n\\left(1 - \\left(\\frac{p_{${e9}}}{p_{${i}}}\\right)^{\\frac{${gammaSym}-1}{${gammaSym}}}\\right)\\right]`),
      sub: (v) => (v.etaN === undefined
        ? `${n(v[`T${i}`])}\\,\\frac{2}{${g(v.gamma)}+1}`
        : `${n(v[`T${i}`])}\\left[1 - ${e(v.etaN)}\\left(1 - \\left(\\frac{${kPa(v[`p${e9}`])}}{${kPa(v[`p${i}`])}}\\right)^{\\frac{${g(v.gamma)}-1}{${g(v.gamma)}}}\\right)\\right]`),
    },
    [`C${e9}`]: {
      label: 'Jet velocity',
      eq: (v) => (v.R !== undefined ? `C_{${e9}} = \\sqrt{${gammaSym}\\,R\\,T_{${e9}}}` : `C_{${e9}} = \\sqrt{2\\,${cpSym}\\,(T_{${i}} - T_{${e9}})}`),
      sub: (v) => (v.R !== undefined
        ? `\\sqrt{${g(v.gamma)}\\,(${n(v.R, 0)})\\,(${n(v[`T${e9}`])})}`
        : `\\sqrt{2\\,(${n(v.cp, 1)})\\,(${n(v[`T${i}`])} - ${n(v[`T${e9}`])})}`),
    },
    [`A${e9}`]: {
      label: 'Exit area',
      eq: `A_{${e9}} = \\frac{${flowSym}}{\\rho_{${e9}}\\,C_{${e9}}} = \\frac{${flowSym}\\,R\\,T_{${e9}}}{p_{${e9}}\\,C_{${e9}}}`,
      sub: (v) => {
        const m = v.mdotBypass ?? v.mdotGas;
        return `\\frac{${n(m, 2)}\\,(${n(v.R, 0)})\\,(${n(v[`T${e9}`])})}{(${n(v[`p${e9}`], 0)})\\,(${n(v[`C${e9}`])})}`;
      },
    },
  };
}

// ---------------------------------------------------------------- component templates
export const TEMPLATES = {
  inlet: {
    summary: 'The intake slows the incoming air. Its kinetic energy becomes a rise in pressure (ram compression); η_in accounts for the losses.',
    items: {
      C0: { label: 'Flight speed', eq: 'C_0 = M_0\\,a_0', sub: (v) => `${n(v.M0, 3)}\\times${n(v.a0)}` },
      T02: {
        label: 'Total temperature at the fan face (adiabatic: no change across the intake)',
        eq: 'T_{02} = T_0\\left(1 + \\frac{\\gamma-1}{2}M_0^2\\right)',
        sub: (v) => `${n(v.T0)}\\left(1 + \\frac{${g(v.gamma)}-1}{2}\\,${n(v.M0, 3)}^2\\right)`,
      },
      P02: {
        label: 'Total pressure at the fan face',
        eq: 'p_{02} = p_0\\left(1 + \\eta_{in}\\frac{\\gamma-1}{2}M_0^2\\right)^{\\frac{\\gamma}{\\gamma-1}}',
        sub: (v) => `${kPa(v.p0)}\\left(1 + ${e(v.etaInlet)}\\,\\frac{${g(v.gamma)}-1}{2}\\,${n(v.M0, 3)}^2\\right)^{\\frac{${g(v.gamma)}}{${g(v.gamma)}-1}}`,
      },
    },
  },

  massFlow: {
    summary: 'The air mass flow is set at the fan face: the flow reaches it at Mach M₂ over the whole fan disc.',
    items: {
      T2: { label: 'Static temperature at the fan face', eq: 'T_2 = \\frac{T_{02}}{1 + \\frac{\\gamma-1}{2}M_2^2}', sub: (v) => `\\frac{${n(v.T02)}}{1 + \\frac{${g(v.gamma)}-1}{2}\\,${n(v.M2, 2)}^2}` },
      P2: { label: 'Static pressure at the fan face', eq: 'p_2 = p_{02}\\left(\\frac{T_2}{T_{02}}\\right)^{\\frac{\\gamma}{\\gamma-1}}', sub: (v) => `${kPa(v.p02)}\\left(\\frac{${n(v.T2)}}{${n(v.T02)}}\\right)^{\\frac{${g(v.gamma)}}{${g(v.gamma)}-1}}` },
      rho2: { label: 'Density at the fan face', eq: '\\rho_2 = \\frac{p_2}{R\\,T_2}', sub: (v) => `\\frac{${n(v.p2, 0)}}{(${n(v.R, 0)})\\,(${n(v.T2)})}` },
      C2: { label: 'Axial velocity at the fan face', eq: 'C_2 = M_2\\sqrt{\\gamma\\,R\\,T_2}', sub: (v) => `${n(v.M2, 2)}\\sqrt{${g(v.gamma)}\\,(${n(v.R, 0)})\\,(${n(v.T2)})}` },
      Afan: { label: 'Fan disc area', eq: 'A_{fan} = \\frac{\\pi D_{fan}^2}{4}', sub: (v) => `\\frac{\\pi\\,(${n(v.Dfan)})^2}{4}` },
      mdot: { label: 'Total air mass flow', eq: '\\dot m = \\rho_2\\,A_{fan}\\,C_2', sub: (v) => `(${n(v.rho2, 4)})\\,(${n(v.Afan, 4)})\\,(${n(v.C2)})` },
      mdotCore: { label: 'Core mass flow', eq: '\\dot m_{core} = \\frac{\\dot m}{1 + BPR}', sub: (v) => `\\frac{${n(v.mdot)}}{1 + ${n(v.BPR, 2)}}` },
    },
  },

  fan: {
    summary: 'The fan compresses all the air. The outer part goes to the bypass (13), the root goes to the core (21) with the same pressure ratio: p₀₂₁ = p₀₁₃, T₀₂₁ = T₀₁₃.',
    items: {
      P013: { label: 'Total pressure after the fan', eq: 'p_{013} = FPR\\cdot p_{02}', sub: (v) => `${n(v.FPR, 2)}\\times${kPa(v.p02)}` },
      T013: { label: 'Total temperature after the fan', ...compressorT('T_{013}', 'T_{02}', 'FPR', '\\eta_f'), sub: (v) => compressorTsub(v.T02, v.FPR, v.etaFan, v.gamma) },
      Wfan: { label: 'Power absorbed by the fan', eq: '\\dot W_{fan} = (1+BPR)\\,\\dot m_{core}\\,c_{pa}\\,(T_{013} - T_{02})', sub: (v) => `(1+${n(v.BPR, 2)})\\,(${n(v.mdotCore, 3)})\\,(${n(v.cp, 1)})\\,(${n(v.T013)} - ${n(v.T02)})` },
    },
  },

  fanNozzle: {
    summary: 'The bypass air expands in a convergent nozzle. If the available pressure ratio exceeds the critical one, the exit chokes at Mach 1 and the leftover pressure gives pressure thrust.',
    items: nozzleTemplates('013', '19', '\\gamma', 'c_{pa}', '\\dot m_{bypass}'),
  },

  ipc: {
    summary: 'The intermediate-pressure compressor raises the core air pressure by π_IPC. The IP turbine drives it.',
    items: {
      P023: { label: 'Total pressure after the IPC', eq: 'p_{023} = \\pi_{IPC}\\cdot p_{021}', sub: (v) => `${n(v.IPCR, 2)}\\times${kPa(v.p021)}` },
      T023: { label: 'Total temperature after the IPC', ...compressorT('T_{023}', 'T_{021}', '\\pi_{IPC}', '\\eta_c'), sub: (v) => compressorTsub(v.T021, v.IPCR, v.etaC, v.gamma) },
      Wipc: { label: 'Power absorbed by the IPC', eq: '\\dot W_{IPC} = \\dot m_{core}\\,c_{pa}\\,(T_{023} - T_{021})', sub: (v) => `(${n(v.mdotCore, 3)})\\,(${n(v.cp, 1)})\\,(${n(v.T023)} - ${n(v.T021)})` },
    },
  },

  hpc: {
    summary: 'The high-pressure compressor raises the pressure by π_HPC. Part of the air (b) is bled at an intermediate point, so only (1 − b) is compressed all the way to station 3.',
    items: {
      T0b: { label: 'Total temperature at the bleed point (problem statement)', eq: 'T_{0b} = 1.43\\,T_{023}', sub: (v) => `${n(v.k, 2)}\\times${n(v.T023)}` },
      P0b: { label: 'Total pressure at the bleed point (problem statement)', eq: 'p_{0b} = 3\\,p_{023}', sub: (v) => `${n(v.k, 1)}\\times${kPa(v.p023)}` },
      P03: { label: 'Total pressure after the HPC', eq: 'p_{03} = \\pi_{HPC}\\cdot p_{023}', sub: (v) => `${n(v.HPCR, 2)}\\times${kPa(v.p023)}` },
      T03: { label: 'Total temperature after the HPC', ...compressorT('T_{03}', 'T_{023}', '\\pi_{HPC}', '\\eta_c'), sub: (v) => compressorTsub(v.T023, v.HPCR, v.etaC, v.gamma) },
      Whpc: {
        label: 'Power absorbed by the HPC: full flow up to the bleed point, (1 − b) after it',
        eq: '\\dot W_{HPC} = \\dot m_{core}\\left[c_{pa}(T_{0b} - T_{023}) + (1-b)\\,c_{pa}(T_{03} - T_{0b})\\right]',
        sub: (v) => `${n(v.mdotCore, 3)}\\left[(${n(v.cp, 1)})(${n(v.T0b)} - ${n(v.T023)}) + (1-${e(v.b)})(${n(v.cp, 1)})(${n(v.T03)} - ${n(v.T0b)})\\right]`,
      },
      OPR: { label: 'Overall pressure ratio', eq: 'OPR = \\frac{p_{03}}{p_{02}} = FPR\\cdot\\pi_{IPC}\\cdot\\pi_{HPC}', sub: (v) => `${n(v.FPR, 2)}\\times${n(v.IPCR, 2)}\\times${n(v.HPCR, 2)}` },
    },
  },

  combustor: {
    summary: 'Fuel burns at nearly constant pressure until the gas reaches the turbine inlet temperature. The bleed ratio b is an input; the fuel-air ratio f follows from the energy balance.',
    items: {
      P04: { label: 'Total pressure after the combustor', eq: 'p_{04} = (1 - \\Delta p_b)\\,p_{03}', sub: (v) => `(1 - ${n(v.dpb, 3)})\\times${kPa(v.p03)}` },
      f: {
        label: 'Fuel-air ratio, solved from the combustor energy balance',
        eq: 'f = (1-b)\\,\\frac{c_{pg}T_{04} - c_{pa}T_{03}}{\\eta_b\\,LHV - c_{pg}T_{04}}',
        sub: (v) => `(1-${e(v.b)})\\,\\frac{(${n(v.cpg, 0)})(${n(v.T04)}) - (${n(v.cpa, 1)})(${n(v.T03)})}{${e(v.etaB)}\\,(${n(v.LHV, 0)}) - (${n(v.cpg, 0)})(${n(v.T04)})}`,
      },
      mdotFuel: { label: 'Fuel mass flow', eq: '\\dot m_f = f\\,\\dot m_{core}', sub: (v) => `${n(v.f, 5)}\\times${n(v.mdotCore, 3)}` },
      T04check: {
        label: 'Check: the energy balance returns the turbine inlet temperature',
        eq: 'T_{04} = \\frac{(1-b)\\,c_{pa}T_{03} + \\eta_b\\,f\\,LHV}{(1+f-b)\\,c_{pg}}',
        sub: (v) => `\\frac{(1-${e(v.b)})(${n(v.cpa, 1)})(${n(v.T03)}) + ${e(v.etaB)}\\,(${n(v.f, 5)})(${n(v.LHV, 0)})}{(1+${n(v.f, 5)}-${e(v.b)})(${n(v.cpg, 0)})}`,
      },
    },
  },

  hpt: {
    summary: 'HP spool balance: the HP turbine delivers exactly the HPC power, divided by the mechanical efficiency. The gas flow is (1 + f − b) per unit of core air.',
    items: {
      dT: {
        label: 'HPT temperature drop: turbine power × η_m = HPC power',
        eq: 'T_{04} - T_{041} = \\frac{c_{pa}(T_{0b} - T_{023}) + (1-b)\\,c_{pa}(T_{03} - T_{0b})}{\\eta_m\\,(1+f-b)\\,c_{pg}}',
        sub: (v) => `\\frac{(${n(v.cpa, 1)})(${n(v.T0b)} - ${n(v.T023)}) + (1-${e(v.b)})(${n(v.cpa, 1)})(${n(v.T03)} - ${n(v.T0b)})}{${e(v.etaM)}\\,(1+${n(v.f, 5)}-${e(v.b)})\\,(${n(v.cpg, 0)})}`,
      },
      T041: { label: 'Total temperature after the HPT', eq: 'T_{041} = T_{04} - \\Delta T_{0,HPT}', sub: (v) => `${n(v.T04)} - ${n(v.dT)}` },
      P041: { label: 'Total pressure after the HPT', eq: turbineP('p_{041}', 'p_{04}', 'T_{041}', 'T_{04}'), sub: (v) => turbinePsub(v, v.p04, v.T041, v.T04) },
      Whpt: { label: 'Power extracted from the gas by the HPT', eq: turbinePower('\\dot W_{HPT}', 'T_{04}', 'T_{041}'), sub: (v) => turbinePowerSub(v, v.T04, v.T041) },
    },
  },

  ipt: {
    summary: 'IP spool balance: the IP turbine drives the IPC and the electric generator (P_IPC).',
    items: {
      dT: {
        label: 'IPT temperature drop: turbine power × η_m = IPC power + generator power',
        eq: 'T_{041} - T_{043} = \\frac{c_{pa}(T_{023} - T_{021}) + P_{IPC}/\\dot m_{core}}{\\eta_m\\,(1+f-b)\\,c_{pg}}',
        sub: (v) => `\\frac{(${n(v.cpa, 1)})(${n(v.T023)} - ${n(v.T021)}) + ${n(v.P_IPC, 0)}/${n(v.mdotCore, 3)}}{${e(v.etaM)}\\,(1+${n(v.f, 5)}-${e(v.b)})\\,(${n(v.cpg, 0)})}`,
      },
      T043: { label: 'Total temperature after the IPT', eq: 'T_{043} = T_{041} - \\Delta T_{0,IPT}', sub: (v) => `${n(v.T041)} - ${n(v.dT)}` },
      P043: { label: 'Total pressure after the IPT', eq: turbineP('p_{043}', 'p_{041}', 'T_{043}', 'T_{041}'), sub: (v) => turbinePsub(v, v.p041, v.T043, v.T041) },
      Wipt: { label: 'Power extracted from the gas by the IPT', eq: turbinePower('\\dot W_{IPT}', 'T_{041}', 'T_{043}'), sub: (v) => turbinePowerSub(v, v.T041, v.T043) },
    },
  },

  lpt: {
    summary: 'LP spool balance: the LP turbine drives the whole fan, bypass and core air together.',
    items: {
      dT: {
        label: 'LPT temperature drop: turbine power × η_m = fan power',
        eq: 'T_{043} - T_{05} = \\frac{(1+BPR)\\,c_{pa}(T_{013} - T_{02})}{\\eta_m\\,(1+f-b)\\,c_{pg}}',
        sub: (v) => `\\frac{(1+${n(v.BPR, 2)})(${n(v.cpa, 1)})(${n(v.T013)} - ${n(v.T02)})}{${e(v.etaM)}\\,(1+${n(v.f, 5)}-${e(v.b)})\\,(${n(v.cpg, 0)})}`,
      },
      T05: { label: 'Total temperature after the LPT', eq: 'T_{05} = T_{043} - \\Delta T_{0,LPT}', sub: (v) => `${n(v.T043)} - ${n(v.dT)}` },
      P05: { label: 'Total pressure after the LPT', eq: turbineP('p_{05}', 'p_{043}', 'T_{05}', 'T_{043}'), sub: (v) => turbinePsub(v, v.p043, v.T05, v.T043) },
      Wlpt: { label: 'Power extracted from the gas by the LPT', eq: turbinePower('\\dot W_{LPT}', 'T_{043}', 'T_{05}'), sub: (v) => turbinePowerSub(v, v.T043, v.T05) },
    },
  },

  jetPipe: {
    summary: 'The jet pipe carries the gas to the core nozzle. No work and no heat: the total temperature stays, the total pressure drops by the duct loss.',
    items: {
      T07: { label: 'Total temperature at the core nozzle inlet', eq: 'T_{07} = T_{05}' },
      P07: { label: 'Total pressure at the core nozzle inlet', eq: 'p_{07} = (1 - \\Delta p_{LPT})\\,p_{05}', sub: (v) => `(1 - ${n(v.dpj, 3)})\\times${kPa(v.p05)}` },
    },
  },

  coreNozzle: {
    summary: 'The hot gas expands in a convergent nozzle, with the same choking check as the fan nozzle but with the hot-gas properties γ_g and c_pg.',
    items: nozzleTemplates('07', '9', '\\gamma_g', 'c_{pg}', '\\dot m_{gas}'),
  },

  thrust: {
    summary: 'Net thrust is the momentum the engine adds to the air and gas, plus pressure thrust from any choked nozzle, minus the ram drag of the incoming air.',
    items: {
      Ffan: {
        label: 'Fan (bypass) thrust',
        eq: 'F_{fan} = BPR\\,\\dot m_{core}\\,(C_{19} - C_0) + A_{19}\\,(p_{19} - p_0)',
        sub: (v) => `${n(v.BPR, 2)}\\,(${n(v.mdotCore, 3)})\\,(${n(v.C19)} - ${n(v.C0)}) + ${v.choked ? `(${n(v.A19, 4)})\\,(${n(v.p19, 0)} - ${n(v.p0, 0)})` : '0'}`,
      },
      Fcore: {
        label: 'Core thrust',
        eq: 'F_{core} = \\dot m_{core}\\left[(1+f-b)\\,C_9 - C_0\\right] + A_9\\,(p_9 - p_0)',
        sub: (v) => `${n(v.mdotCore, 3)}\\left[(1+${n(v.f, 5)}-${e(v.b)})\\,(${n(v.C9)}) - ${n(v.C0)}\\right] + ${v.choked ? `(${n(v.A9, 4)})\\,(${n(v.p9, 0)} - ${n(v.p0, 0)})` : '0'}`,
      },
      F: { label: 'Net thrust', eq: 'F = F_{fan} + F_{core}', sub: (v) => `${n(v.Ffan / 1000, 3)} + ${n(v.Fcore / 1000, 3)}\\ \\text{kN}` },
      St: { label: 'Specific thrust (per unit of total air flow)', eq: 'S_t = \\frac{F}{\\dot m}', sub: (v) => `\\frac{${n(v.F, 0)}}{${n(v.mdot)}}` },
      TSFC: { label: 'Thrust-specific fuel consumption', eq: 'TSFC = \\frac{\\dot m_f}{F}', sub: (v) => `\\frac{${n(v.mdotFuel, 4)}}{${n(v.F, 0)}}\\ \\text{kg}/(\\text{N}\\cdot\\text{s})` },
      eta0: { label: 'Overall efficiency: useful work over fuel energy', eq: '\\eta_0 = \\frac{F\\,C_0}{\\dot m_f\\,LHV}', sub: (v) => `\\frac{(${n(v.F, 0)})\\,(${n(v.C0)})}{(${n(v.mdotFuel, 4)})\\,(${n(v.LHV, 0)})}` },
      C19eq: {
        label: 'Fan jet: fully-expanded equivalent velocity (pressure thrust converted to velocity)',
        eq: 'C_{19,eq} = C_{19} + \\frac{A_{19}\\,(p_{19}-p_0)}{\\dot m_{bypass}}',
        sub: (v) => `${n(v.C19)} + \\frac{${v.choked ? `(${n(v.A19, 4)})(${n(v.p19, 0)} - ${n(v.p0, 0)})` : '0'}}{${n(v.mdotBypass, 2)}}`,
      },
      C9eq: {
        label: 'Core jet: fully-expanded equivalent velocity',
        eq: 'C_{9,eq} = C_9 + \\frac{A_9\\,(p_9-p_0)}{\\dot m_{gas}}',
        sub: (v) => `${n(v.C9)} + \\frac{${v.choked ? `(${n(v.A9, 4)})(${n(v.p9, 0)} - ${n(v.p0, 0)})` : '0'}}{${n(v.mdotGas, 2)}}`,
      },
      dKE: {
        label: 'Kinetic energy added to the flow per second',
        eq: '\\Delta\\dot{KE} = \\tfrac{1}{2}\\left[\\dot m_{gas}C_{9,eq}^2 + \\dot m_{bypass}C_{19,eq}^2 - \\dot m\\,C_0^2\\right]',
        sub: (v) => `\\tfrac{1}{2}\\left[(${n(v.mdotGas, 2)})(${n(v.C9eq)})^2 + (${n(v.mdotBypass, 2)})(${n(v.C19eq)})^2 - (${n(v.mdot, 2)})(${n(v.C0)})^2\\right]`,
      },
      etaTh: { label: 'Thermal efficiency: jet kinetic energy over fuel energy', eq: '\\eta_{th} = \\frac{\\Delta\\dot{KE}}{\\dot m_f\\,LHV}', sub: (v) => `\\frac{${n(v.dKE, 0)}}{(${n(v.mdotFuel, 4)})(${n(v.LHV, 0)})}` },
      etaP: { label: 'Propulsive efficiency: useful thrust power over jet kinetic energy', eq: '\\eta_p = \\frac{F\\,C_0}{\\Delta\\dot{KE}} \\qquad \\eta_0 = \\eta_{th}\\,\\eta_p', sub: (v) => `\\frac{(${n(v.F, 0)})(${n(v.C0)})}{${n(v.dKE, 0)}}` },
      specificRange: {
        label: 'Specific range with two engines (Jet A at 3.103 kg/gal)',
        eq: 'SR = \\frac{C_0}{2\\,\\dot m_f}\\cdot\\rho_{fuel}',
        sub: (v) => `\\frac{${n(v.C0 / 1000, 5)}\\ \\text{km/s}}{2\\times${n(v.mdotFuel, 4)}\\ \\text{kg/s}}\\times${n(v.kgPerGal, 3)}\\ \\text{kg/gal}`,
      },
    },
  },
};

/** Read a brace group starting at s[i] === '{'; returns [content, indexAfter]. */
function group(s, i) {
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === '{') depth++;
    else if (s[j] === '}' && --depth === 0) return [s.slice(i + 1, j), j + 1];
  }
  return [s.slice(i + 1), s.length];
}
const wrap = (x) => (/[+\-]/.test(x.replace(/^-/, '')) ? `(${x})` : x);

/** Exponents written as ^{\frac{a}{b}} are tiny in print; rewrite them as ^{a/b}, which reads better. */
export function flattenExponentFractions(latex) {
  const key = '^{';
  let out = '', i = 0;
  while (i < latex.length) {
    const k = latex.indexOf(key, i);
    if (k < 0) { out += latex.slice(i); break; }
    out += latex.slice(i, k);
    const [inner, after] = group(latex, k + 1);
    const m = /^(-?)\\frac\{/.exec(inner);
    if (m) {
      const [a, ia] = group(inner, m[1].length + 5);
      const [b, ib] = group(inner, ia);
      if (ib === inner.length) {
        out += `^{${m[1]}${m[1] ? '(' : ''}${wrap(flattenExponentFractions(a))}/${wrap(flattenExponentFractions(b))}${m[1] ? ')' : ''}}`;
        i = after;
        continue;
      }
    }
    out += `^{${flattenExponentFractions(inner)}}`;
    i = after;
  }
  return out;
}

/**
 * Build the LaTeX lines for one recorded step.
 * Returns {label, symbolic, numeric} where numeric already ends with "= result unit", or null when no template exists.
 */
export function stepLatex(componentId, item) {
  const t = TEMPLATES[componentId]?.items?.[item.key];
  if (!t) return null;
  if (t.custom) return { label: t.label, symbolic: null, numeric: flattenExponentFractions(t.custom(item)) };
  const eq = typeof t.eq === 'function' ? t.eq(item.vars) : t.eq;
  const sub = t.sub ? t.sub(item.vars) : null;
  const u = RESULT_UNITS[item.unit] ?? { f: 1, unit: '', d: 4 };
  const value = ['eta0', 'etaTh', 'etaP'].includes(item.key) ? `${n(item.value * 100, 2)}\\,\\%` : `${n(item.value * u.f, u.d)}${u.unit ? `\\ ${u.unit}` : ''}`;
  const lhs = item.symbol;
  const numeric = sub ? `${lhs} = ${sub} = ${value}` : `${lhs} = ${value}`;
  return { label: t.label, symbolic: flattenExponentFractions(eq), numeric: flattenExponentFractions(numeric) };
}
