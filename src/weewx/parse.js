// -----------------------------------------------------------------------------
// WeeWX payloads, turned into one flat "reading" in the published units.
//
// Three shapes reach the integration:
//   - the flat JSON of weewx-mqtt (`weather/loop`): one key per observation,
//     with its unit label (`outTemp_C`, `rain_cm`), every value a string;
//   - the `weewx.json` / `current_minimal.json` file of the weewx-json skin:
//     `current.temperature = { value, units }`, and the rain of the day in
//     `day["rain total"]`;
//   - the `weewx_data.json` file of the Belchertown skin: formatted strings
//     with their unit (`"12.3°C"`, `"1013.2 mbar"`, `"N/A"`).
// A key the station does not have stays null: nothing is published for it.
//
// Reading: { time (ms), temperature, feelsLike, dewPoint, humidity,
// indoorTemperature, indoorHumidity, pressure (sea level), stationPressure,
// windSpeed, windGust, windDirection, rainRate, rainToday, rainInterval, uv,
// radiation, batteryLow, archive, stationName }, in °C, %, hPa, km/h, °, mm/h,
// mm, W/m².
// -----------------------------------------------------------------------------

import { GROUPS, convert, toNumber } from './units.js';

const { TEMPERATURE, SPEED, PRESSURE, RAIN, RAIN_RATE } = GROUPS;

export const FORMATS = {
  FLAT: 'flat',
  WEEWX_JSON: 'weewx-json',
  BELCHERTOWN: 'belchertown',
};

/** An empty reading: every value unknown. */
export function emptyReading() {
  return {
    time: null,
    temperature: null,
    feelsLike: null,
    dewPoint: null,
    humidity: null,
    indoorTemperature: null,
    indoorHumidity: null,
    pressure: null,
    stationPressure: null,
    windSpeed: null,
    windGust: null,
    windDirection: null,
    rainRate: null,
    rainToday: null,
    rainInterval: null,
    uv: null,
    radiation: null,
    batteryLow: null,
    archive: false,
    stationName: null,
  };
}

const percent = (value) => (value === null ? null : Math.min(100, Math.max(0, value)));
const direction = (value) => (value === null ? null : ((value % 360) + 360) % 360);
const nonNegative = (value) => (value === null ? null : Math.max(0, value));

/**
 * What the body feels: WeeWX's apparent temperature when it has one, else its
 * heat index or wind chill (each equals the temperature outside its range).
 */
function feelsLike({ apparent, heatIndex, windChill, temperature }) {
  if (apparent !== null) {
    return apparent;
  }
  // Neither index: the station does not compute it (a bare temperature is
  // not a "feels like").
  if (temperature === null || (heatIndex === null && windChill === null)) {
    return null;
  }
  if (heatIndex !== null && heatIndex > temperature) {
    return heatIndex;
  }
  if (windChill !== null && windChill < temperature) {
    return windChill;
  }
  return temperature;
}

// A battery status of WeeWX: 0 is fine, anything else is low (a bit mask on
// the Davis consoles). Some drivers put a voltage there instead (2.61):
// not a status, ignored.
const BATTERY_STATUS = /^(\w+BatteryStatus|batteryStatus\d+)$/;

function batteryLow(entries) {
  let seen = false;
  for (const value of entries) {
    if (value === null || !Number.isInteger(value) || value < 0) {
      continue;
    }
    if (value > 0) {
      return true;
    }
    seen = true;
  }
  return seen ? false : null;
}

/**
 * A weewx-mqtt packet (or any flat WeeWX record).
 * @param {object} payload
 * @returns {object|null} null when it is not a WeeWX record
 */
export function readingFromFlat(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  // `outTemp_C` → { outTemp: { value, label: 'C' } }. WeeWX observation names
  // have no underscore; the label may have some (`cm_per_hour`).
  const obs = {};
  for (const [key, raw] of Object.entries(payload)) {
    const cut = key.indexOf('_');
    const name = cut === -1 ? key : key.slice(0, cut);
    const label = cut === -1 ? null : key.slice(cut + 1);
    const value = toNumber(raw);
    if (value !== null && !(name in obs)) {
      obs[name] = { value, label };
    }
  }
  const usUnits = obs.usUnits?.value ?? null;
  const time = obs.dateTime?.value ?? null;
  if (time === null) {
    return null;
  }
  const plain = (name) => obs[name]?.value ?? null;
  const read = (name, group) =>
    obs[name] ? convert(obs[name].value, group, obs[name].label, usUnits) : null;

  const temperature = read('outTemp', TEMPERATURE);
  return {
    ...emptyReading(),
    time: time * 1000,
    temperature,
    feelsLike: feelsLike({
      apparent: read('appTemp', TEMPERATURE),
      heatIndex: read('heatindex', TEMPERATURE),
      windChill: read('windchill', TEMPERATURE),
      temperature,
    }),
    dewPoint: read('dewpoint', TEMPERATURE),
    humidity: percent(plain('outHumidity')),
    indoorTemperature: read('inTemp', TEMPERATURE),
    indoorHumidity: percent(plain('inHumidity')),
    pressure: read('barometer', PRESSURE),
    stationPressure: read('pressure', PRESSURE),
    windSpeed: nonNegative(read('windSpeed', SPEED)),
    windGust: nonNegative(read('windGust', SPEED)),
    windDirection: direction(plain('windDir')),
    rainRate: nonNegative(read('rainRate', RAIN_RATE)),
    rainToday: nonNegative(read('dayRain', RAIN)),
    rainInterval: nonNegative(read('rain', RAIN)),
    uv: nonNegative(plain('UV')),
    radiation: nonNegative(plain('radiation')),
    batteryLow: batteryLow(
      Object.entries(obs)
        .filter(([name]) => BATTERY_STATUS.test(name))
        .map(([, entry]) => entry.value),
    ),
    // An archive record carries its interval; a loop packet does not.
    archive: obs.interval !== undefined,
  };
}

/** `{ value, units }` of the weewx-json skin. */
function measure(entry, group) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  const value = toNumber(entry.value);
  return group ? convert(value, group, entry.units) : value;
}

/** A date of a skin: ISO with a `+0200` offset, or a date Date can parse. */
function parseDate(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    return null;
  }
  const iso = text.trim().replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const time = Date.parse(iso);
  return Number.isFinite(time) ? time : null;
}

const stationName = (payload) => {
  const location = payload?.station?.location;
  return typeof location === 'string' && location.trim() !== '' ? location.trim() : null;
};

/**
 * The weewx-json skin file.
 * @param {object} payload
 * @returns {object|null}
 */
export function readingFromWeewxJson(payload) {
  const current = payload?.current;
  if (!current || typeof current !== 'object') {
    return null;
  }
  const day = payload.day && typeof payload.day === 'object' ? payload.day : {};
  const temperature = measure(current.temperature, TEMPERATURE);
  return {
    ...emptyReading(),
    time: parseDate(payload.generation?.time),
    temperature,
    feelsLike: feelsLike({
      apparent: null,
      heatIndex: measure(current['heat index'], TEMPERATURE),
      windChill: measure(current['wind chill'], TEMPERATURE),
      temperature,
    }),
    dewPoint: measure(current.dewpoint, TEMPERATURE),
    humidity: percent(measure(current.humidity)),
    indoorTemperature: measure(current['inside temperature'], TEMPERATURE),
    indoorHumidity: percent(measure(current['inside humidity'])),
    pressure: measure(current.barometer, PRESSURE),
    windSpeed: nonNegative(measure(current['wind speed'], SPEED)),
    windGust: nonNegative(measure(current['wind gust'], SPEED)),
    windDirection: direction(measure(current['wind direction'])),
    rainRate: nonNegative(measure(current['rain rate'], RAIN_RATE)),
    rainToday: nonNegative(measure(day['rain total'], RAIN)),
    stationName: stationName(payload),
  };
}

// Belchertown writes its labels as HTML entities ("32.7 &#176;F", "W/m&#178;").
const ENTITIES = { deg: '°', sup2: '²', nbsp: ' ', amp: '&' };

function decodeEntities(text) {
  return text.replace(/&(#x?[0-9a-f]+|[a-z0-9]+);/gi, (entity, code) => {
    if (code[0] === '#') {
      const point =
        code[1] === 'x' || code[1] === 'X'
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10);
      return Number.isFinite(point) ? String.fromCodePoint(point) : entity;
    }
    return ENTITIES[code.toLowerCase()] ?? entity;
  });
}

/**
 * A formatted value of Belchertown: "12.3 &#176;C", "1013.2 mbar", "65%", "N/A".
 * @returns {{ value: number, label: string }|null}
 */
function formatted(text) {
  if (typeof text === 'number') {
    return Number.isFinite(text) ? { value: text, label: '' } : null;
  }
  if (typeof text !== 'string') {
    return null;
  }
  const match = decodeEntities(text)
    .trim()
    .match(/^([-+]?\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (!match) {
    return null;
  }
  const value = toNumber(match[1]);
  return value === null ? null : { value, label: match[2].trim() };
}

function belchertown(text, group) {
  const parsed = formatted(text);
  if (!parsed) {
    return null;
  }
  return group ? convert(parsed.value, group, parsed.label) : parsed.value;
}

/**
 * The Belchertown skin file.
 * @param {object} payload
 * @returns {object|null}
 */
export function readingFromBelchertown(payload) {
  const current = payload?.current;
  if (!current || typeof current !== 'object' || !('datetime_raw' in current)) {
    return null;
  }
  const seconds = toNumber(current.datetime_raw);
  const temperature = belchertown(current.outTemp, TEMPERATURE);
  return {
    ...emptyReading(),
    time: seconds === null ? null : seconds * 1000,
    temperature,
    feelsLike: feelsLike({
      apparent: belchertown(current.appTemp, TEMPERATURE),
      heatIndex: belchertown(current.heatindex, TEMPERATURE),
      windChill: belchertown(current.windchill, TEMPERATURE),
      temperature,
    }),
    dewPoint: belchertown(current.dewpoint, TEMPERATURE),
    humidity: percent(belchertown(current.outHumidity)),
    pressure: belchertown(current.barometer, PRESSURE),
    windSpeed: nonNegative(belchertown(current.windspeed, SPEED)),
    windGust: nonNegative(belchertown(current.windGust, SPEED)),
    windDirection: direction(belchertown(current.winddir)),
    rainRate: nonNegative(belchertown(current.rainRate, RAIN_RATE)),
    rainToday: nonNegative(belchertown(payload.day?.rain?.sum, RAIN)),
    uv: nonNegative(belchertown(current.uv)),
    radiation: nonNegative(belchertown(current.solar_radiation)),
    stationName: stationName(payload),
  };
}

/**
 * A JSON file read over HTTP, whatever its skin.
 * @param {object} payload
 * @returns {{ format: string, reading: object }|null}
 */
export function parseHttpPayload(payload) {
  const belch = readingFromBelchertown(payload);
  if (belch) {
    return { format: FORMATS.BELCHERTOWN, reading: belch };
  }
  const json = readingFromWeewxJson(payload);
  if (json) {
    return { format: FORMATS.WEEWX_JSON, reading: json };
  }
  const flat = readingFromFlat(payload);
  if (flat) {
    return { format: FORMATS.FLAT, reading: flat };
  }
  return null;
}

/** How many values a reading carries (the "check the source" action). */
export const countValues = (reading) =>
  Object.entries(reading).filter(
    ([key, value]) =>
      !['time', 'archive', 'stationName', 'rainInterval'].includes(key) &&
      value !== null &&
      value !== undefined,
  ).length;
