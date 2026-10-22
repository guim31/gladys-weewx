// -----------------------------------------------------------------------------
// One Gladys device: the WeeWX station, and the states of its features.
//
// The integration reads one WeeWX instance, hence one station, keyed on a
// fixed id: changing the source (MQTT to HTTP, another broker) keeps the same
// device and its history. Feature keys are forever (Gladys keys the history,
// scenes and dashboards on them): add new ones, never rename one.
//
// A station only gets the features it measures: WeeWX supports hundreds of
// stations, few have a UV sensor or an indoor console. A feature appears once
// a value was received for it, and never leaves a device already added
// (the Discovery tab would offer a pointless "Update").
//
// Units: temperatures in °C, speeds in km/h (the Gladys front converts both to
// the user's preference), pressures in hPa, rain in mm.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_TYPES as T,
  DEVICE_FEATURE_UNITS as U,
} from '@gladysassistant/integration-sdk';
import { FEATURE_NAMES, pick } from './i18n.js';

export const DEVICE_TYPE = 'station';
export const STATION_ID = 'weewx';
export const DEFAULT_NAME = 'WeeWX';

const round = (value, decimals) => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const binary = (value) => (value === null || value === undefined ? null : value ? 1 : 0);

/**
 * The features of the station, in display order. `read` turns the station
 * data ({ reading, rainToday, raining, ageMinutes }) into the state, or null
 * when the value is unknown (nothing is published then).
 */
export const FEATURES = [
  {
    key: 'temperature',
    category: C.TEMPERATURE_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.CELSIUS,
    min: -60,
    max: 70,
    read: ({ reading }) => round(reading?.temperature, 1),
  },
  {
    key: 'feels_like',
    category: C.TEMPERATURE_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.CELSIUS,
    min: -80,
    max: 80,
    read: ({ reading }) => round(reading?.feelsLike, 1),
  },
  {
    key: 'dew_point',
    category: C.TEMPERATURE_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.CELSIUS,
    min: -80,
    max: 60,
    read: ({ reading }) => round(reading?.dewPoint, 1),
  },
  {
    key: 'humidity',
    category: C.HUMIDITY_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.PERCENT,
    min: 0,
    max: 100,
    read: ({ reading }) => round(reading?.humidity, 0),
  },
  {
    key: 'indoor_temperature',
    category: C.TEMPERATURE_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.CELSIUS,
    min: -20,
    max: 60,
    read: ({ reading }) => round(reading?.indoorTemperature, 1),
  },
  {
    key: 'indoor_humidity',
    category: C.HUMIDITY_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.PERCENT,
    min: 0,
    max: 100,
    read: ({ reading }) => round(reading?.indoorHumidity, 0),
  },
  {
    key: 'pressure_sea_level',
    category: C.PRESSURE_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.HECTO_PASCAL,
    min: 850,
    max: 1100,
    read: ({ reading }) => round(reading?.pressure, 1),
  },
  {
    key: 'pressure_station',
    category: C.PRESSURE_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.HECTO_PASCAL,
    min: 500,
    max: 1100,
    read: ({ reading }) => round(reading?.stationPressure, 1),
  },
  {
    key: 'wind_speed',
    category: C.SPEED_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.KILOMETER_PER_HOUR,
    min: 0,
    max: 300,
    read: ({ reading }) => round(reading?.windSpeed, 1),
  },
  {
    key: 'wind_gust',
    category: C.SPEED_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.KILOMETER_PER_HOUR,
    min: 0,
    max: 300,
    read: ({ reading }) => round(reading?.windGust, 1),
  },
  {
    key: 'wind_direction',
    category: C.ANGLE_SENSOR,
    type: T.SENSOR.INTEGER,
    unit: U.DEGREE,
    min: 0,
    max: 360,
    read: ({ reading }) => round(reading?.windDirection, 0),
  },
  {
    key: 'rain_rate',
    category: C.PRECIPITATION_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.MILLIMETER_PER_HOUR,
    min: 0,
    max: 500,
    read: ({ reading }) => round(reading?.rainRate, 1),
  },
  {
    key: 'rain_today',
    category: C.PRECIPITATION_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.MILLIMETER_PER_DAY,
    min: 0,
    max: 2000,
    // Kept by the day-rain tracker (src/rain.js), not by the reading.
    seen: (reading) => reading.rainToday !== null || reading.rainInterval !== null,
    read: ({ rainToday }) => round(rainToday, 1),
  },
  {
    key: 'raining',
    category: C.RAIN_SENSOR,
    type: T.SENSOR.BINARY,
    min: 0,
    max: 1,
    seen: (reading) => reading.rainRate !== null || reading.rainInterval !== null,
    read: ({ raining }) => binary(raining),
  },
  {
    key: 'uv',
    category: C.UV_SENSOR,
    type: T.SENSOR.INTEGER,
    unit: U.UV_INDEX,
    min: 0,
    max: 20,
    read: ({ reading }) => round(reading?.uv, 1),
  },
  {
    // No W/m² unit in Gladys: the unit is in the name.
    key: 'solar_radiation',
    category: C.LIGHT_SENSOR,
    type: T.SENSOR.DECIMAL,
    min: 0,
    max: 2000,
    read: ({ reading }) => round(reading?.radiation, 0),
  },
  {
    key: 'battery_low',
    category: C.BATTERY_LOW,
    type: T.SENSOR.BINARY,
    min: 0,
    max: 1,
    read: ({ reading }) => binary(reading?.batteryLow),
  },
  {
    // Minutes since the integration last received a new measurement, by its
    // own clock (a WeeWX clock running late or early does not matter). No
    // history: it would only repeat what the other features already date.
    key: 'data_age',
    category: C.DURATION,
    type: T.DURATION.INTEGER,
    unit: U.MINUTES,
    min: 0,
    max: 100000,
    keepHistory: false,
    seen: (reading) => reading.time !== null,
    read: ({ ageMinutes }) => (ageMinutes === null || ageMinutes === undefined ? null : ageMinutes),
  },
];

// The reading key behind each feature, for the default `seen` rule.
const READING_KEYS = {
  temperature: 'temperature',
  feels_like: 'feelsLike',
  dew_point: 'dewPoint',
  humidity: 'humidity',
  indoor_temperature: 'indoorTemperature',
  indoor_humidity: 'indoorHumidity',
  pressure_sea_level: 'pressure',
  pressure_station: 'stationPressure',
  wind_speed: 'windSpeed',
  wind_gust: 'windGust',
  wind_direction: 'windDirection',
  rain_rate: 'rainRate',
  uv: 'uv',
  solar_radiation: 'radiation',
  battery_low: 'batteryLow',
};

/**
 * The feature keys a reading proves the station has.
 * @param {object} reading
 * @returns {string[]}
 */
export function featuresOf(reading) {
  return FEATURES.filter((feature) =>
    feature.seen
      ? feature.seen(reading)
      : reading[READING_KEYS[feature.key]] !== null &&
        reading[READING_KEYS[feature.key]] !== undefined,
  ).map((feature) => feature.key);
}

/** The external ids of the station. */
export const stationIds = (gladys) => gladys.externalIds(DEVICE_TYPE, STATION_ID);

/**
 * The feature key behind a feature external id of the station, or null.
 */
export function featureKeyOf(gladys, externalId) {
  const prefix = `${stationIds(gladys).device}:`;
  if (typeof externalId !== 'string' || !externalId.startsWith(prefix)) {
    return null;
  }
  const key = externalId.slice(prefix.length);
  return FEATURES.some((feature) => feature.key === key) ? key : null;
}

/**
 * The discovered device of the station.
 * @param {object} gladys
 * @param {{ name?: string|null, features: Iterable<string>, language: string }} options
 */
export function buildDevice(gladys, { name, features, language }) {
  const ids = stationIds(gladys);
  const names = pick(FEATURE_NAMES, language);
  const keys = new Set(features);
  return {
    name: (name || DEFAULT_NAME).slice(0, 100),
    external_id: ids.device,
    model: 'WeeWX',
    // Measurements are pushed (MQTT) or read on the container's own timer
    // (HTTP): the core never polls this device.
    should_poll: false,
    features: FEATURES.filter((feature) => keys.has(feature.key)).map((feature) => ({
      name: names[feature.key],
      external_id: ids.feature(feature.key),
      category: feature.category,
      type: feature.type,
      ...(feature.unit ? { unit: feature.unit } : {}),
      min: feature.min,
      max: feature.max,
      read_only: true,
      has_feedback: false,
      keep_history: feature.keepHistory ?? true,
    })),
  };
}

/**
 * The states of the station, in the publishStates format.
 * @param {object} gladys
 * @param {{ reading: object|null, rainToday: number|null, raining: boolean|null, ageMinutes: number|null }} data
 * @param {(key: string) => boolean} [only] filter on the feature keys
 */
export function buildStates(gladys, data, only = () => true) {
  const ids = stationIds(gladys);
  const states = [];
  for (const feature of FEATURES) {
    if (!only(feature.key)) {
      continue;
    }
    const value = feature.read(data);
    if (value === null || value === undefined) {
      continue;
    }
    states.push({ device_feature_external_id: ids.feature(feature.key), state: value });
  }
  return states;
}
