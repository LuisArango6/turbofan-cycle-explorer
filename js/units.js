// Display units. The engine works in SI base units; these factors give the SI units
// the page shows (kN, kPa, MW, g/(kN·s), ...).

/**
 * Each quantity: unit label, factor from the SI base value and decimals shown.
 * value_shown = value_SI * factor.
 */
export const QUANTITIES = {
  thrust:         { unit: 'kN', f: 1e-3, d: 2 },
  force:          { unit: 'kN', f: 1e-3, d: 2 },
  pressure:       { unit: 'kPa', f: 1e-3, d: 2 },
  temperature:    { unit: 'K', f: 1, d: 1 },
  velocity:       { unit: 'm/s', f: 1, d: 1 },
  massFlow:       { unit: 'kg/s', f: 1, d: 2 },
  fuelFlow:       { unit: 'kg/s', f: 1, d: 3 },
  power:          { unit: 'MW', f: 1e-6, d: 2 },
  tsfc:           { unit: 'g/(kN·s)', f: 1e6, d: 2 },
  specificThrust: { unit: 'm/s', f: 1, d: 1 },
  area:           { unit: 'm²', f: 1, d: 3 },
  length:         { unit: 'm', f: 1, d: 0 },
  specificRange:  { unit: 'km/gal', f: 1, d: 3 },
  entropy:        { unit: 'J/(kg·K)', f: 1, d: 1 },
  ratio:          { unit: '', f: 1, d: 3 },
  percent:        { unit: '%', f: 100, d: 1 },
};

/** Convert an SI base value to its display unit. Returns {value, unit, decimals}. */
export function convert(quantity, valueSI) {
  const q = QUANTITIES[quantity];
  if (!q) throw new Error(`Unknown quantity: ${quantity}`);
  return { value: valueSI * q.f, unit: q.unit, decimals: q.d };
}

const nf = new Map();
function formatter(decimals) {
  if (!nf.has(decimals)) {
    nf.set(decimals, new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }));
  }
  return nf.get(decimals);
}

/** Number with thousands separators and a fixed number of decimals; '—' for missing values. */
export function formatNumber(value, decimals) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return formatter(decimals).format(value);
}

/** Convert and format in one step. Returns {text, unit}. */
export function display(quantity, valueSI, _system, decimals) {
  const c = convert(quantity, valueSI);
  return { text: formatNumber(c.value, decimals ?? c.decimals), unit: c.unit };
}

