// -----------------------------------------------------------------------------
// The triggers as transitions: once per episode, once per threshold, nothing
// on the first reading after a restart.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUIET_PERIOD_MS, createTriggerTracker } from '../src/triggers.js';

const MINUTE = 60 * 1000;

function clock() {
  let current = 1_000_000;
  const now = () => current;
  now.advance = (ms) => {
    current += ms;
  };
  return now;
}

test('rain: the first reading is a baseline, then once per episode', () => {
  const now = clock();
  const triggers = createTriggerTracker({ now });
  assert.deepEqual(triggers.onObservation({ raining: true, gust: null }), {
    rainStarted: false,
    gusts: [],
  });
  now.advance(MINUTE);
  assert.equal(triggers.onObservation({ raining: true, gust: null }).rainStarted, false);
  now.advance(QUIET_PERIOD_MS - MINUTE);
  assert.equal(triggers.onObservation({ raining: false, gust: null }).rainStarted, false);
  now.advance(MINUTE);
  // 31 minutes after the last rain: a new episode.
  assert.equal(triggers.onObservation({ raining: true, gust: null }).rainStarted, true);
});

test('rain stopped: each dry threshold once, again after new rain', () => {
  const now = clock();
  const triggers = createTriggerTracker({ now });
  triggers.onObservation({ raining: false, gust: null });
  assert.deepEqual(triggers.onTick().dry, []);
  triggers.onObservation({ raining: true, gust: null });
  now.advance(15 * MINUTE);
  triggers.onObservation({ raining: false, gust: null });
  assert.deepEqual(triggers.onTick().dry, [15]);
  assert.deepEqual(triggers.onTick().dry, []);
  now.advance(45 * MINUTE);
  assert.deepEqual(triggers.onTick().dry, [30, 60]);
  triggers.onObservation({ raining: true, gust: null });
  now.advance(16 * MINUTE);
  assert.deepEqual(triggers.onTick().dry, [15]);
});

test('gusts: every threshold crossed, once per 30 minutes each', () => {
  const now = clock();
  const triggers = createTriggerTracker({ now });
  // Baseline: a strong gust at startup fires nothing.
  assert.deepEqual(triggers.onObservation({ raining: null, gust: 45 }).gusts, []);
  now.advance(MINUTE);
  assert.deepEqual(triggers.onObservation({ raining: null, gust: 65 }).gusts, [50, 60]);
  now.advance(MINUTE);
  assert.deepEqual(triggers.onObservation({ raining: null, gust: 66 }).gusts, []);
  now.advance(QUIET_PERIOD_MS);
  assert.deepEqual(triggers.onObservation({ raining: null, gust: 31 }).gusts, [30]);
  now.advance(MINUTE);
  assert.deepEqual(triggers.onObservation({ raining: null, gust: 61 }).gusts, [40, 50, 60]);
});

test('silence: each threshold once per silence, counted from the start', () => {
  const now = clock();
  const triggers = createTriggerTracker({ now });
  now.advance(5 * MINUTE);
  assert.deepEqual(triggers.onTick().silent, [5]);
  now.advance(5 * MINUTE);
  const tick = triggers.onTick();
  assert.deepEqual(tick.silent, [10]);
  assert.equal(tick.silentMinutes, 10);
  triggers.onObservation({ raining: null, gust: null });
  now.advance(4 * MINUTE);
  assert.deepEqual(triggers.onTick().silent, []);
  now.advance(MINUTE);
  assert.deepEqual(triggers.onTick().silent, [5]);
  triggers.resetSilence();
  assert.equal(triggers.silentMinutes(), 0);
});
