// -----------------------------------------------------------------------------
// The WeeWX payloads, from real captures: the three shapes and the three unit
// systems give the same reading in the published units.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FORMATS, countValues, parseHttpPayload, readingFromFlat } from '../src/weewx/parse.js';
import { canonicalUnit, convert, toNumber } from '../src/weewx/units.js';
import { FIXTURES } from './helpers/world.js';

const close = (actual, expected, tolerance, what) =>
  assert.ok(
    actual !== null && Math.abs(actual - expected) <= tolerance,
    `${what}: ${actual} instead of ${expected} ± ${tolerance}`,
  );

test('a weewx-mqtt loop packet (METRIC) reads in °C, km/h, hPa and mm', () => {
  const reading = readingFromFlat(FIXTURES.loop);
  assert.equal(reading.time, Number(FIXTURES.loop.dateTime) * 1000);
  close(reading.temperature, 0.3319, 0.001, 'temperature');
  close(reading.feelsLike, -2.017, 0.01, 'feels like (appTemp)');
  close(reading.dewPoint, -2.709, 0.01, 'dew point');
  close(reading.humidity, 80, 0.01, 'humidity');
  close(reading.indoorTemperature, 17.22, 0.01, 'indoor temperature');
  close(reading.pressure, 1053.17, 0.01, 'barometer');
  assert.equal(reading.rainRate, 0);
  assert.equal(reading.rainInterval, 0);
  // weewx-mqtt augments loop packets with the rain of the day, from its
  // database (`augment_record`, on by default).
  assert.equal(reading.rainToday, 0);
  assert.equal(reading.uv, 0);
  assert.equal(reading.radiation, 0);
  // outTempBatteryStatus is 1 in this capture.
  assert.equal(reading.batteryLow, true);
  assert.equal(reading.archive, false);
});

test('an archive record carries the rain of the day and is flagged as such', () => {
  const reading = readingFromFlat(FIXTURES.archive);
  assert.equal(reading.archive, true);
  assert.equal(reading.rainToday, 0);
  assert.equal(reading.batteryLow, false);
});

test('METRICWX and unlabeled US packets give the same values', () => {
  const wx = readingFromFlat(FIXTURES.loopMetricWx);
  const us = readingFromFlat(FIXTURES.loopUsNoLabel);
  for (const key of ['temperature', 'pressure', 'indoorTemperature', 'dewPoint', 'feelsLike']) {
    close(us[key], wx[key], 0.01, key);
  }
  close(wx.temperature, 0.377, 0.001, 'METRICWX temperature');
});

test('units: speeds, rain and pressures are converted, an unknown unit drops the value', () => {
  close(readingFromFlat({ dateTime: '1', windSpeed_mps: '10' }).windSpeed, 36, 1e-9, 'm/s');
  close(readingFromFlat({ dateTime: '1', windSpeed_mph: '10' }).windSpeed, 16.09344, 1e-9, 'mph');
  close(readingFromFlat({ dateTime: '1', windGust_knot: '10' }).windGust, 18.52, 1e-9, 'knot');
  close(readingFromFlat({ dateTime: '1', dayRain_cm: '1.2' }).rainToday, 12, 1e-9, 'cm');
  close(readingFromFlat({ dateTime: '1', dayRain_in: '1' }).rainToday, 25.4, 1e-9, 'in');
  close(
    readingFromFlat({ dateTime: '1', rainRate_inch_per_hour: '0.1' }).rainRate,
    2.54,
    1e-9,
    'in/h',
  );
  close(readingFromFlat({ dateTime: '1', barometer_inHg: '30' }).pressure, 1015.92, 0.01, 'inHg');
  close(readingFromFlat({ dateTime: '1', outTemp_F: '212' }).temperature, 100, 1e-9, '°F');
  assert.equal(readingFromFlat({ dateTime: '1', outTemp_K: '300' }).temperature, null);
  // Without a label nor usUnits, nothing is guessed.
  assert.equal(readingFromFlat({ dateTime: '1', outTemp: '20' }).temperature, null);
  assert.equal(readingFromFlat({ dateTime: '1', usUnits: '16', outTemp: '20' }).temperature, 20);
  assert.equal(canonicalUnit(' km/h'), 'km/h');
  assert.equal(canonicalUnit('&deg;C'), null);
  assert.equal(convert(10, 'speed', 'furlong'), null);
});

test('values: strings, exponents, commas; garbage is null', () => {
  assert.equal(toNumber('1.0056955810157433e-06'), 1.0056955810157433e-6);
  assert.equal(toNumber('12,5'), 12.5);
  assert.equal(toNumber('N/A'), null);
  assert.equal(toNumber(''), null);
  assert.equal(toNumber(null), null);
  assert.equal(toNumber(Number.NaN), null);
});

test('a message that is not a WeeWX packet gives no reading', () => {
  assert.equal(readingFromFlat({ temperature: 12 }), null);
  assert.equal(readingFromFlat([1, 2]), null);
  assert.equal(readingFromFlat('12'), null);
});

test('battery statuses: a voltage in a status field is not a status', () => {
  assert.equal(readingFromFlat({ dateTime: '1', txBatteryStatus: '2.61' }).batteryLow, null);
  assert.equal(readingFromFlat({ dateTime: '1', batteryStatus3: '4' }).batteryLow, true);
  assert.equal(readingFromFlat({ dateTime: '1', windDir: '370' }).windDirection, 10);
});

test('the weewx-json skin (US units) reads like the MQTT archive record of the same minute', () => {
  const { format, reading } = parseHttpPayload(FIXTURES.weewxJson);
  const archive = readingFromFlat(FIXTURES.archive);
  assert.equal(format, FORMATS.WEEWX_JSON);
  assert.equal(reading.time, archive.time);
  assert.equal(reading.stationName, 'Test station');
  for (const key of ['temperature', 'dewPoint', 'humidity', 'indoorTemperature', 'pressure']) {
    close(reading[key], archive[key], 0.01, key);
  }
  assert.equal(reading.rainToday, 0);
  assert.equal(reading.rainRate, 0);
  // No apparent temperature in weewx-json: heat index or wind chill.
  close(reading.feelsLike, archive.temperature, 0.01, 'feels like');
});

test('the minimal weewx-json file has no rain of the day', () => {
  const { reading } = parseHttpPayload(FIXTURES.weewxJsonMinimal);
  assert.equal(reading.rainToday, null);
  assert.equal(reading.dewPoint, null);
  assert.ok(reading.temperature !== null);
});

test('the Belchertown skin: HTML entities, units in the strings, rain of the day', () => {
  const { format, reading } = parseHttpPayload(FIXTURES.belchertown);
  const archive = readingFromFlat(FIXTURES.archive);
  assert.equal(format, FORMATS.BELCHERTOWN);
  assert.equal(reading.time, archive.time);
  // Rounded to 0.1 °F by the skin.
  close(reading.temperature, archive.temperature, 0.06, 'temperature');
  close(reading.feelsLike, archive.feelsLike, 0.06, 'feels like');
  close(reading.pressure, archive.pressure, 0.05, 'barometer');
  assert.equal(reading.humidity, 80);
  assert.equal(reading.windDirection, 0);
  assert.equal(reading.rainToday, 0);
  assert.equal(reading.uv, 0);
  assert.equal(reading.radiation, 0);
});

test('Belchertown "N/A" values are unknown, comma decimals are read', () => {
  const payload = structuredClone(FIXTURES.belchertown);
  payload.current.outTemp = 'N/A';
  payload.current.barometer = '1013,2 mbar';
  const { reading } = parseHttpPayload(payload);
  assert.equal(reading.temperature, null);
  assert.equal(reading.pressure, 1013.2);
});

test('an unknown file is no format; the action counts the values', () => {
  assert.equal(parseHttpPayload({ hello: 'world' }), null);
  assert.ok(countValues(readingFromFlat(FIXTURES.loop)) >= 15);
});
