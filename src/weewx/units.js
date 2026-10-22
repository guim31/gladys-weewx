// -----------------------------------------------------------------------------
// WeeWX units, turned into the ones the integration publishes.
//
// WeeWX reports in the unit system of its configuration: US (°F, mph, inHg,
// in), METRIC (°C, km/h, mbar, cm) or METRICWX (°C, m/s, mbar, mm). The
// sources name the unit three ways:
//   - weewx-mqtt appends a label to each key: `outTemp_C`, `windSpeed_kph`,
//     `rain_cm`, `rainRate_cm_per_hour`, `barometer_mbar`…;
//   - the JSON skins write the display label: `°C`, `km/h`, ` mbar`, `in/h`…;
//   - without any label (weewx-mqtt `append_units_label = false`), the
//     `usUnits` field of the packet tells the unit system (1, 16 or 17).
// Everything is converted to °C, km/h, hPa, mm and mm/h. A unit this module
// does not know drops the value: a wrong number is worse than none.
// -----------------------------------------------------------------------------

export const GROUPS = {
  TEMPERATURE: 'temperature',
  SPEED: 'speed',
  PRESSURE: 'pressure',
  RAIN: 'rain',
  RAIN_RATE: 'rain_rate',
};

// Unit system constants of WeeWX (`usUnits`).
export const UNIT_SYSTEMS = { US: 1, METRIC: 16, METRICWX: 17 };

// The unit of each group when only `usUnits` is known.
const SYSTEM_UNITS = {
  [UNIT_SYSTEMS.US]: {
    temperature: 'F',
    speed: 'mph',
    pressure: 'inhg',
    rain: 'in',
    rain_rate: 'in/h',
  },
  [UNIT_SYSTEMS.METRIC]: {
    temperature: 'C',
    speed: 'km/h',
    pressure: 'hpa',
    rain: 'cm',
    rain_rate: 'cm/h',
  },
  [UNIT_SYSTEMS.METRICWX]: {
    temperature: 'C',
    speed: 'm/s',
    pressure: 'hpa',
    rain: 'mm',
    rain_rate: 'mm/h',
  },
};

// Every spelling met in WeeWX (unit names, weewx-mqtt labels, default skin
// labels), lower-cased and without spaces, to one canonical unit.
const ALIASES = {
  c: 'C',
  '°c': 'C',
  degree_c: 'C',
  degc: 'C',
  f: 'F',
  '°f': 'F',
  degree_f: 'F',
  degf: 'F',
  kph: 'km/h',
  'km/h': 'km/h',
  kmh: 'km/h',
  km_per_hour: 'km/h',
  km_per_hour2: 'km/h',
  mph: 'mph',
  mile_per_hour: 'mph',
  mile_per_hour2: 'mph',
  mps: 'm/s',
  'm/s': 'm/s',
  meter_per_second: 'm/s',
  meter_per_second2: 'm/s',
  knot: 'knot',
  knots: 'knot',
  knot2: 'knot',
  kn: 'knot',
  kt: 'knot',
  mbar: 'hpa',
  hpa: 'hpa',
  inhg: 'inhg',
  mmhg: 'mmhg',
  kpa: 'kpa',
  mm: 'mm',
  cm: 'cm',
  in: 'in',
  inch: 'in',
  mm_per_hour: 'mm/h',
  'mm/h': 'mm/h',
  'mm/hr': 'mm/h',
  cm_per_hour: 'cm/h',
  'cm/h': 'cm/h',
  'cm/hr': 'cm/h',
  inch_per_hour: 'in/h',
  'in/h': 'in/h',
  'in/hr': 'in/h',
};

// Conversion of each canonical unit to the published one.
const CONVERT = {
  temperature: {
    C: (v) => v,
    F: (v) => ((v - 32) * 5) / 9,
  },
  speed: {
    'km/h': (v) => v,
    mph: (v) => v * 1.609344,
    'm/s': (v) => v * 3.6,
    knot: (v) => v * 1.852,
  },
  pressure: {
    hpa: (v) => v,
    inhg: (v) => v * 33.8638866667,
    mmhg: (v) => v * 1.33322368,
    kpa: (v) => v * 10,
  },
  rain: {
    mm: (v) => v,
    cm: (v) => v * 10,
    in: (v) => v * 25.4,
  },
  rain_rate: {
    'mm/h': (v) => v,
    'cm/h': (v) => v * 10,
    'in/h': (v) => v * 25.4,
  },
};

/**
 * The canonical form of a unit label, or null when unknown.
 * @param {string|null|undefined} label e.g. "kph", " km/h", "°F", "cm_per_hour"
 */
export function canonicalUnit(label) {
  if (typeof label !== 'string') {
    return null;
  }
  const key = label.replace(/\s+/g, '').toLowerCase();
  return ALIASES[key] ?? null;
}

/**
 * A number from a WeeWX value: weewx-mqtt sends strings ("12.5",
 * "1.0e-06"), the skins numbers or "N/A".
 * @returns {number|null}
 */
export function toNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const text = value.trim();
  if (text === '' || !/^[-+]?(\d+([.,]\d*)?|[.,]\d+)(e[-+]?\d+)?$/i.test(text)) {
    return null;
  }
  const number = Number(text.replace(',', '.'));
  return Number.isFinite(number) ? number : null;
}

/**
 * Convert a value of a group to the published unit.
 * @param {number|null} value
 * @param {string} group one of GROUPS
 * @param {string|null} label the unit label, as the source wrote it
 * @param {number|null} [usUnits] the unit system, used when there is no label
 * @returns {number|null} null when the unit is unknown
 */
export function convert(value, group, label, usUnits = null) {
  if (value === null || value === undefined) {
    return null;
  }
  const unit =
    label === null || label === undefined || label === ''
      ? (SYSTEM_UNITS[usUnits]?.[group] ?? null)
      : canonicalUnit(label);
  const fn = unit === null ? undefined : CONVERT[group]?.[unit];
  return fn ? fn(value) : null;
}
