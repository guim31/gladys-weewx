// -----------------------------------------------------------------------------
// Quiet logs: nothing at info level for a normal cycle, one line when a
// failure starts and one when it ends, never a password.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BROKER_URL,
  FIXTURES,
  JSON_URL,
  addStation,
  createWorld,
  flush,
  loopPacket,
} from './helpers/world.js';

const SECOND = 1000;
const MINUTE = 60 * SECOND;

/** Capture every log line at the given level and above. */
function captureLogs(t, level = 'debug') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  const lines = [];
  const record = (...args) => lines.push(args.map(String).join(' '));
  t.mock.method(console, 'log', record);
  t.mock.method(console, 'error', record);
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  return lines;
}

const atLevel = (lines, level) => lines.filter((line) => line.includes(`[${level}]`));

async function tick(t, ms) {
  t.mock.timers.tick(ms);
  for (let i = 0; i < 5; i += 1) {
    await flush();
  }
}

test('a normal cycle writes nothing at info level', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: Date.now() });
  const world = await createWorld({ config: { mqtt_url: BROKER_URL, http_url: JSON_URL } });
  t.after(() => world.app.stop());
  world.broker.accept();
  world.broker.publish(FIXTURES.loop);
  await flush();
  await addStation(world);
  const lines = captureLogs(t, 'info');
  for (let i = 1; i <= 30; i += 1) {
    world.broker.publish(loopPacket(3 * i, { outTemp_C: String(10 + i / 10) }));
    await tick(t, 3 * SECOND);
  }
  await tick(t, 2 * MINUTE);
  assert.deepEqual(lines, []);
});

test('a failure is told once, its end once, the rest goes to debug', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: Date.now() });
  const world = await createWorld({ config: { http_url: JSON_URL } });
  t.after(() => world.app.stop());
  const lines = captureLogs(t, 'info');
  world.server.failure = 'down';
  for (let i = 0; i < 4; i += 1) {
    await tick(t, MINUTE);
  }
  assert.equal(atLevel(lines, 'WARN').length, 1);
  world.server.failure = null;
  await tick(t, MINUTE);
  const info = atLevel(lines, 'INFO');
  assert.equal(info.length, 1, info.join('\n'));
  assert.match(info[0], /readable again/);
});

test('the passwords never appear in the logs, at any level', async (t) => {
  const lines = captureLogs(t, 'debug');
  const world = await createWorld({
    config: {
      mqtt_url: 'mqtt://alice:url-secret@broker.example:1883',
      mqtt_password: 'field-secret',
      http_url: 'http://bob:http-secret@weewx.example/json/weewx.json?key=query-secret',
    },
  });
  world.server.failure = 'down';
  const refused = new Error('Connection refused: Not authorized');
  refused.code = 5;
  world.broker.client.emit('error', refused);
  world.broker.accept();
  world.broker.publish('garbage');
  await world.gladys.fake.action('check_sources', {});
  await world.gladys.fake.configUpdated({ mqtt_url: BROKER_URL, mqtt_password: 'field-secret' });
  await flush();
  world.app.stop();
  assert.ok(lines.length > 5, 'the scenario logs something');
  for (const line of lines) {
    for (const secret of ['url-secret', 'field-secret', 'http-secret', 'query-secret']) {
      assert.ok(!line.includes(secret), `${secret} in: ${line}`);
    }
  }
});
