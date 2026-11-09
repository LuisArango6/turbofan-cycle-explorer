// International Standard Atmosphere (ISA) and air properties at ambient conditions.
// Matches the Python library `ambiance` used in the reference notebook (0–20 km).

const G0 = 9.80665;          // standard gravity [m/s²]
const R_ISA = 287.05287;     // specific gas constant used by ISA [J/(kg·K)]
const R_EARTH = 6356766;     // Earth radius for geopotential altitude [m]
const KAPPA = 1.4;           // ratio of specific heats used by ISA for the speed of sound
const T_SL = 288.15;         // sea-level temperature [K]
const P_SL = 101325;         // sea-level pressure [Pa]
const LAPSE = -0.0065;       // troposphere lapse rate [K/m]
const H_TROPO = 11000;       // tropopause geopotential altitude [m]
const T_TROPO = T_SL + LAPSE * H_TROPO;                                  // 216.65 K
const P_TROPO = P_SL * (T_TROPO / T_SL) ** (-G0 / (R_ISA * LAPSE));       // ≈ 22632 Pa

export const ISA_MAX_ALTITUDE = 20000; // [m] geometric

/**
 * ISA ambient state at a geometric altitude.
 * @param {number} h geometric altitude [m], 0 ≤ h ≤ 20 000
 * @returns {{h:number, H:number, T:number, P:number, rho:number, a:number}}
 *   T [K], P [Pa], rho [kg/m³], a [m/s]
 */
export function isa(h) {
  if (!(h >= 0 && h <= ISA_MAX_ALTITUDE)) {
    throw new RangeError(`Altitude must be between 0 and ${ISA_MAX_ALTITUDE} m (got ${h})`);
  }
  const H = (R_EARTH * h) / (R_EARTH + h); // geopotential altitude
  let T, P;
  if (H <= H_TROPO) {
    T = T_SL + LAPSE * H;
    P = P_SL * (T / T_SL) ** (-G0 / (R_ISA * LAPSE));
  } else {
    T = T_TROPO;
    P = P_TROPO * Math.exp((-G0 * (H - H_TROPO)) / (R_ISA * T_TROPO));
  }
  return { h, H, T, P, rho: P / (R_ISA * T), a: Math.sqrt(KAPPA * R_ISA * T) };
}

// cp and cv of air fitted to CoolProp (real-gas air) along the ISA curve, 0–20 km.
// Form: c = a0 + a1·T + a2·T² + a3·P[kPa]. Max deviation from CoolProp: 0.001 % (cp), 0.002 % (cv).
const CP_FIT = [1000.4466141173908, 0.01761381104104937, -3.6647654009205966e-05, 0.03484273833521641];
const CV_FIT = [722.0182034375074, -0.06651546371358592, 0.0001678539735353872, 0.006533192528283597];

const fit = (c, T, PkPa) => c[0] + c[1] * T + c[2] * T * T + c[3] * PkPa;

/**
 * Specific heats of ambient air (valid only for ISA ambient states, about 216–288 K).
 * @param {number} T temperature [K]
 * @param {number} P pressure [Pa]
 * @returns {{cp:number, cv:number, gamma:number}} cp, cv [J/(kg·K)]
 */
export function airProperties(T, P) {
  const cp = fit(CP_FIT, T, P / 1000);
  const cv = fit(CV_FIT, T, P / 1000);
  return { cp, cv, gamma: cp / cv };
}
