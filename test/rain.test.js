// -----------------------------------------------------------------------------
// The rain of the day: the `dayRain` of WeeWX when a message carries it, the
// loop packets on top, zero at midnight, unknown rather than wrong.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDayRain } from '../src/rain.js';
import { emptyReading } from '../src/weewx/parse.js';

// Days of 1000 ms: day N is ]N * 1000, (N + 1) * 1000].
const dayOf = (ms) => Math.floor(ms / 1000);
const at = (time, values) => ({ ...emptyReading(), time, ...values });

test('dayRain is the truth, loop packets after it add up', () => {
  const rain = createDayRain({ dayOf });
  rain.update(at(5100, { rainToday: 2, archive: true, rainInterval: 0.5 }));
  assert.equal(rain.value(5150), 2);
  rain.update(at(5200, { rainInterval: 0.2 }));
  rain.update(at(5300, { rainInterval: 0.3 }));
  assert.equal(rain.value(5300), 2.5);
  // A late archive record: the packets newer than it are replayed.
  rain.update(at(5250, { rainToday: 2.4, archive: true, rainInterval: 0.4 }));
  assert.equal(Math.round(rain.value(5300) * 10) / 10, 2.7);
});

test('loop packets alone: unknown on the first day, exact from midnight', () => {
  const rain = createDayRain({ dayOf });
  rain.update(at(5100, { rainInterval: 1 }));
  assert.equal(rain.value(5100), null);
  rain.update(at(5900, { rainInterval: 1 }));
  assert.equal(rain.value(5900), null);
  rain.update(at(6100, { rainInterval: 0.2 }));
  rain.update(at(6200, { rainInterval: 0.3 }));
  assert.equal(rain.value(6200), 0.5);
});

test('midnight: a record of 00:00 closes the previous day, then zero', () => {
  const rain = createDayRain({ dayOf });
  rain.update(at(5500, { rainToday: 3 }));
  rain.update(at(6000, { rainToday: 4, archive: true }));
  assert.equal(rain.value(5999), 4);
  // Midnight passed, nothing received since: nothing fallen today.
  assert.equal(rain.value(6100), 0);
  rain.update(at(6100, { rainInterval: 0.1 }));
  assert.equal(rain.value(6100), 0.1);
  // Yesterday's total arriving late changes nothing.
  rain.update(at(5990, { rainToday: 3.9, archive: true }));
  assert.equal(rain.value(6100), 0.1);
});

test('a source without rain says nothing', () => {
  const rain = createDayRain({ dayOf });
  rain.update(at(5100, {}));
  rain.update(at(null, { rainToday: 1 }));
  assert.equal(rain.value(5100), null);
});
