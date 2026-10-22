// -----------------------------------------------------------------------------
// The integration end to end, against the SDK's fake Gladys, a fake broker
// and a fake web server fed with real WeeWX payloads.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BROKER_URL,
  FIXTURES,
  JSON_URL,
  LOOP_TIME_MS,
  addStation,
  createWorld,
  featureId,
  flush,
  loopPacket,
} from './helpers/world.js';

const SECOND = 1000;
const MINUTE = 60 * SECOND;

/** Mock the clock and the timers, starting at the loop fixture's time. */
function mockTime(t, start = LOOP_TIME_MS) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: start });
  return async (ms) => {
    t.mock.timers.tick(ms);
    for (let i = 0; i < 5; i += 1) {
      await flush();
    }
  };
}

async function mqttWorld(t, options = {}) {
  const advance = mockTime(t);
  const world = await createWorld({ config: { mqtt_url: BROKER_URL, ...options.config } });
  t.after(() => world.app.stop());
  world.broker.accept();
  await flush();
  return { ...world, advance };
}

test('MQTT: credentials in the options, the topic subscribed, Gladys told it is connected', async (t) => {
  const world = await mqttWorld(t, {
    config: { mqtt_username: 'weewx', mqtt_password: 'p@ss', mqtt_topic: 'meteo/loop' },
  });
  const { url, options } = world.broker.connections[0];
  assert.equal(url, 'mqtt://broker.example:1883');
  assert.equal(options.username, 'weewx');
  assert.equal(options.password, 'p@ss');
  assert.deepEqual(world.broker.client.subscriptions, ['meteo/loop']);
  assert.equal(world.gladys.fake.connectionStatus.connected, true);
});

test('MQTT: nothing to discover before the first packet, then the features the station has', async (t) => {
  const world = await mqttWorld(t);
  await world.gladys.fake.scanRequest();
  assert.deepEqual(world.gladys.fake.discoveredDevices, []);
  world.broker.publish(FIXTURES.loop);
  await flush();
  const [device] = world.gladys.fake.discoveredDevices;
  assert.equal(device.name, 'WeeWX');
  assert.equal(device.should_poll, false);
  const keys = device.features.map((f) => f.external_id.split(':').pop());
  assert.deepEqual(keys, [
    'temperature',
    'feels_like',
    'dew_point',
    'humidity',
    'indoor_temperature',
    'indoor_humidity',
    'pressure_sea_level',
    'pressure_station',
    'wind_speed',
    'wind_gust',
    'wind_direction',
    'rain_rate',
    'rain_today',
    'raining',
    'uv',
    'solar_radiation',
    'battery_low',
    'data_age',
  ]);
  // French names by default.
  assert.equal(device.features[0].name, 'Température');
});

test('a station with fewer sensors gets fewer features; a new sensor is added later', async (t) => {
  const world = await mqttWorld(t);
  world.broker.publish({ dateTime: '1792648073.0', usUnits: '16.0', outTemp_C: '12.5' });
  await flush();
  let keys = world.gladys.fake.discoveredDevices[0].features.map((f) =>
    f.external_id.split(':').pop(),
  );
  assert.deepEqual(keys, ['temperature', 'data_age']);
  world.broker.publish({ dateTime: '1792648075.0', usUnits: '16.0', outHumidity: '60' });
  await flush();
  keys = world.gladys.fake.discoveredDevices[0].features.map((f) => f.external_id.split(':').pop());
  assert.deepEqual(keys, ['temperature', 'humidity', 'data_age']);
});

test('the features of an added device never leave it', async (t) => {
  const first = await mqttWorld(t);
  first.broker.publish(FIXTURES.loop);
  await flush();
  const added = first.gladys.fake.discoveredDevices[0];
  first.app.stop();

  const world = await createWorld({ config: { mqtt_url: BROKER_URL }, devices: [added] });
  t.after(() => world.app.stop());
  world.broker.accept();
  world.broker.publish({ dateTime: '1792648080.0', usUnits: '16.0', outTemp_C: '12.5' });
  await flush();
  assert.equal(world.gladys.fake.discoveredDevices[0].features.length, added.features.length);
});

test('states: everything when the station is added, then only changes, at most every 15 s', async (t) => {
  const world = await mqttWorld(t);
  world.broker.publish(FIXTURES.loop);
  await flush();
  // Not added yet: nothing published.
  await world.advance(20 * SECOND);
  assert.equal(world.gladys.fake.states.length, 0);

  await addStation(world);
  const temperature = featureId(world.gladys, 'temperature');
  assert.equal(world.gladys.fake.lastState(temperature), 0.3);
  assert.equal(world.gladys.fake.lastState(featureId(world.gladys, 'rain_today')), 0);
  assert.equal(world.gladys.fake.lastState(featureId(world.gladys, 'battery_low')), 1);
  assert.equal(world.gladys.fake.lastState(featureId(world.gladys, 'data_age')), 0);
  assert.equal(world.gladys.fake.widgetRefreshes.length, 1);
  const published = world.gladys.fake.states.length;

  // Three packets within a few seconds: one publication, of what changed.
  world.broker.publish(loopPacket(3, { outTemp_C: '5.0' }));
  world.broker.publish(loopPacket(5, { outTemp_C: '5.5' }));
  world.broker.publish(loopPacket(8, { outTemp_C: '6.04' }));
  await flush();
  assert.equal(world.gladys.fake.states.length, published);
  await world.advance(15 * SECOND);
  assert.equal(world.gladys.fake.lastState(temperature), 6);
  const changed = world.gladys.fake.states.slice(published);
  assert.ok(
    changed.every(
      (state) => state.device_feature_external_id !== featureId(world.gladys, 'humidity'),
    ),
    'an unchanged humidity is not published again',
  );
});

test('the last measurement ages by the minute, the station silent fires', async (t) => {
  const world = await mqttWorld(t);
  world.broker.publish(FIXTURES.loop);
  await flush();
  await addStation(world);
  await world.advance(5 * MINUTE);
  assert.equal(world.gladys.fake.lastState(featureId(world.gladys, 'data_age')), 5);
  const events = world.gladys.fake.sceneEvents.filter((e) => e.key === 'station_silent');
  assert.equal(events.length, 1);
  assert.equal(events[0].data.after_minutes, '5');
  assert.equal(events[0].data.minutes, 5);
  assert.equal(events[0].data.station, 'WeeWX');
  // Back: the age drops to zero, the silence count restarts.
  world.broker.publish(loopPacket(300));
  await world.advance(30 * SECOND);
  assert.equal(world.gladys.fake.lastState(featureId(world.gladys, 'data_age')), 0);
});

test('rain: starts once per episode, stops after the dry thresholds', async (t) => {
  const world = await mqttWorld(t);
  world.broker.publish(FIXTURES.loop);
  await flush();
  await addStation(world);
  world.broker.publish(loopPacket(3, { rain_cm: '0.02', rainRate_cm_per_hour: '0.3' }));
  await world.advance(SECOND);
  world.broker.publish(loopPacket(6, { rain_cm: '0.02', rainRate_cm_per_hour: '0.5' }));
  await world.advance(15 * SECOND);
  const keys = () => world.gladys.fake.sceneEvents.map((e) => e.key);
  assert.deepEqual(keys(), ['rain_started']);
  assert.equal(world.gladys.fake.lastState(featureId(world.gladys, 'raining')), 1);
  assert.equal(world.gladys.fake.lastState(featureId(world.gladys, 'rain_rate')), 5);

  world.broker.publish(loopPacket(30, { rain_cm: '0.0', rainRate_cm_per_hour: '0.0' }));
  await world.advance(4 * MINUTE);
  // A packet a minute keeps the station alive.
  for (let i = 1; i <= 12; i += 1) {
    world.broker.publish(loopPacket(30 + 60 * i));
    await world.advance(MINUTE);
  }
  const stopped = world.gladys.fake.sceneEvents.filter((e) => e.key === 'rain_stopped');
  assert.deepEqual(
    stopped.map((e) => e.data.after_minutes),
    ['15'],
  );
  assert.equal(world.gladys.fake.lastState(featureId(world.gladys, 'raining')), 0);
});

test('gust above a threshold: every threshold crossed, with the gust', async (t) => {
  const world = await mqttWorld(t);
  world.broker.publish(FIXTURES.loop);
  await flush();
  await addStation(world);
  world.broker.publish(loopPacket(3, { windGust_kph: '52.4' }));
  await flush();
  const gusts = world.gladys.fake.sceneEvents.filter((e) => e.key === 'gust_above');
  assert.deepEqual(
    gusts.map((e) => [e.data.above_kmh, e.data.gust_kmh]),
    [
      ['30', 52],
      ['40', 52],
      ['50', 52],
    ],
  );
  assert.ok(
    gusts.every((e) => e.data.device === world.gladys.externalIds('station', 'weewx').device),
  );
});

test('no scene event for a station not added to Gladys', async (t) => {
  const world = await mqttWorld(t);
  world.broker.publish(FIXTURES.loop);
  world.broker.publish(loopPacket(3, { windGust_kph: '52.4' }));
  await world.advance(10 * MINUTE);
  assert.deepEqual(world.gladys.fake.sceneEvents, []);
});

test('broker refusing the credentials, broker down: told to Gladys in the language', async (t) => {
  mockTime(t);
  const world = await createWorld({ config: { mqtt_url: BROKER_URL, language: 'en' } });
  t.after(() => world.app.stop());
  const refused = new Error('Connection refused: Not authorized');
  refused.code = 5;
  world.broker.client.emit('error', refused);
  await flush();
  assert.equal(world.gladys.fake.connectionStatus.connected, false);
  assert.match(world.gladys.fake.connectionStatus.message, /user name and the password/);
  world.broker.accept();
  await flush();
  assert.equal(world.gladys.fake.connectionStatus.connected, true);
  world.broker.client.emit('offline');
  await flush();
  assert.match(world.gladys.fake.connectionStatus.message, /cannot be reached/);
});

test('a message that is not a WeeWX packet is ignored', async (t) => {
  const world = await mqttWorld(t);
  world.broker.publish('not json');
  world.broker.publish({ hello: 'world' });
  world.broker.publish('21.5', 'weather/outTemp_C');
  await flush();
  assert.deepEqual(world.gladys.fake.discoveredDevices, []);
});

test('HTTP: the file read at once, then every interval; its station name used', async (t) => {
  const advance = mockTime(t, Date.parse('2026-10-22T05:47:30Z'));
  const world = await createWorld({ config: { http_url: JSON_URL, http_interval: 60 } });
  t.after(() => world.app.stop());
  assert.equal(world.server.requests.length, 1);
  const [device] = world.gladys.fake.discoveredDevices;
  assert.equal(device.name, 'Test station');
  const keys = device.features.map((f) => f.external_id.split(':').pop());
  assert.ok(keys.includes('rain_today') && keys.includes('indoor_temperature'));
  assert.ok(!keys.includes('uv') && !keys.includes('battery_low'));
  await addStation(world);
  assert.equal(world.gladys.fake.lastState(featureId(world.gladys, 'temperature')), 0.4);
  await advance(60 * SECOND);
  assert.equal(world.server.requests.length, 2);
  assert.equal(world.gladys.fake.connectionStatus.connected, true);
});

test('HTTP: a server down, an unknown file, a file without date', async (t) => {
  const advance = mockTime(t);
  const world = await createWorld({ config: { http_url: JSON_URL, language: 'en' } });
  t.after(() => world.app.stop());
  world.server.failure = 'down';
  await advance(60 * SECOND);
  assert.equal(world.gladys.fake.connectionStatus.connected, false);
  assert.match(world.gladys.fake.connectionStatus.message, /cannot be read/);
  world.server.failure = null;
  world.server.files[JSON_URL] = { hello: 'world' };
  await advance(60 * SECOND);
  assert.match(world.gladys.fake.connectionStatus.message, /not one of the supported/);
  const dateless = structuredClone(FIXTURES.weewxJson);
  dateless.generation.time = 'Thu, 22 Oct 2026 05:47:00 UTC-ish';
  world.server.files[JSON_URL] = dateless;
  world.server.headers = { 'last-modified': 'Thu, 22 Oct 2026 05:48:00 GMT' };
  await advance(60 * SECOND);
  assert.equal(world.gladys.fake.connectionStatus.connected, true);
  assert.equal(world.hub.reading.time, Date.parse('2026-10-22T05:48:00Z'));
});

test('HTTP: credentials in the address become a basic auth header', async (t) => {
  mockTime(t);
  const url = 'http://user:s%40cret@weewx.example/json/weewx.json';
  const world = await createWorld({ config: { http_url: url } });
  t.after(() => world.app.stop());
  const [request] = world.server.requests;
  assert.equal(request.url, JSON_URL);
  assert.equal(
    request.headers.authorization,
    `Basic ${Buffer.from('user:s@cret').toString('base64')}`,
  );
});

test('nothing configured: Gladys says what to fill in', async (t) => {
  mockTime(t);
  const world = await createWorld({ config: {} });
  t.after(() => world.app.stop());
  assert.equal(world.gladys.fake.connectionStatus.connected, false);
  assert.match(world.gladys.fake.connectionStatus.message, /broker MQTT/);
  const ack = await world.gladys.fake.action('check_sources', {});
  assert.equal(ack.success, false);
});

test('"Check the sources" tells what each source gives, in four languages', async (t) => {
  const advance = mockTime(t, Date.parse('2026-10-22T05:47:30Z'));
  const world = await createWorld({
    config: { mqtt_url: BROKER_URL, http_url: JSON_URL, language: 'en' },
  });
  t.after(() => world.app.stop());
  world.broker.accept();
  await advance(SECOND);
  const ack = await world.gladys.fake.action('check_sources', {});
  assert.equal(ack.success, true, ack.error);
  const { message } = ack.data;
  assert.deepEqual(Object.keys(message).sort(), ['de', 'en', 'es', 'fr']);
  assert.match(message.en, /MQTT: connected to mqtt:\/\/broker\.example:1883, topic weather\/loop/);
  assert.match(message.en, /No message yet/);
  assert.match(message.en, /HTTP: http:\/\/weewx\.example\/json\/weewx\.json read \(weewx-json\)/);
  assert.match(message.fr, /valeurs, dernière mesure/);
});

test('scene action: the current conditions as a sentence and numbers', async (t) => {
  const world = await mqttWorld(t, { config: { language: 'en' } });
  const before = await world.gladys.fake.sceneAction('current_conditions', {});
  assert.equal(before.success, false);
  world.broker.publish(
    loopPacket(0, {
      outTemp_C: '12.44',
      appTemp_C: '10.1',
      outHumidity: '81',
      windSpeed_kph: '15.2',
      windDir: '225',
      windGust_kph: '32',
      dayRain_cm: '0.32',
      rainRate_cm_per_hour: '0.0',
      rain_cm: '0.0',
    }),
  );
  await flush();
  const ack = await world.gladys.fake.sceneAction('current_conditions', {});
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, {
    summary:
      '12.4 °C, feels like 10 °C, humidity 81 %, wind SW 15 km/h, gusts 32 km/h, 3.2 mm of rain today.',
    temperature: 12.4,
    humidity: 81,
    wind_speed: 15.2,
    wind_gust: 32,
    rain_today: 3.2,
    raining: false,
    minutes_since_measurement: 0,
  });
});

test('features are read-only', async (t) => {
  const world = await mqttWorld(t);
  world.broker.publish(FIXTURES.loop);
  await flush();
  const device = await addStation(world);
  const ack = await world.gladys.fake.setValue(device, device.features[0], 1);
  assert.equal(ack.success, false);
});

test('a new configuration replaces the broker connection', async (t) => {
  const world = await mqttWorld(t);
  await world.gladys.fake.configUpdated({ mqtt_url: 'mqtt://other.example' });
  assert.equal(world.broker.clients[0].ended, true);
  assert.equal(world.broker.connections[1].url, 'mqtt://other.example');
});

test('closing the broker connection on purpose is not an outage', async (t) => {
  const world = await mqttWorld(t);
  const first = world.broker.client;
  await world.gladys.fake.configUpdated({ http_url: JSON_URL });
  first.emit('close');
  first.emit('error', new Error('client disconnecting'));
  await flush();
  assert.equal(world.gladys.fake.connectionStatus.connected, true);
});

test('a value the packets stop carrying is forgotten after 30 minutes', async (t) => {
  const world = await mqttWorld(t, { config: { language: 'en' } });
  world.broker.publish(FIXTURES.loop);
  await flush();
  for (let i = 1; i <= 31; i += 1) {
    const packet = loopPacket(60 * i);
    delete packet.outTemp_C;
    world.broker.publish(packet);
    await world.advance(MINUTE);
  }
  const ack = await world.gladys.fake.sceneAction('current_conditions', {});
  assert.equal(ack.data.outputs.temperature, null);
  assert.equal(ack.data.outputs.humidity, 80);
});

test('a WeeWX clock in the future does not freeze the readings', async (t) => {
  const world = await mqttWorld(t);
  world.broker.publish(loopPacket(3600));
  await flush();
  world.broker.publish(loopPacket(10, { outTemp_C: '7.0' }));
  await world.advance(SECOND);
  world.broker.publish(loopPacket(20, { outTemp_C: '8.0' }));
  await world.advance(SECOND);
  assert.equal(world.hub.data().reading.temperature, 8);
});

test('a refused discovery, then accepted: Gladys told the integration is fine again', async (t) => {
  const world = await mqttWorld(t);
  const original = world.gladys.publishDiscoveredDevices.bind(world.gladys);
  let fail = true;
  t.mock.method(world.gladys, 'publishDiscoveredDevices', async (devices) => {
    if (fail) {
      throw new Error('400');
    }
    return original(devices);
  });
  world.broker.publish(FIXTURES.loop);
  await flush();
  assert.equal(world.gladys.fake.connectionStatus.connected, false);
  fail = false;
  await world.gladys.fake.scanRequest();
  assert.equal(world.gladys.fake.connectionStatus.connected, true);
});
