// -----------------------------------------------------------------------------
// The station widget: valid against the core vocabulary and budget, bound to
// features of the added device, localized, with readable empty states.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import {
  BROKER_URL,
  FIXTURES,
  addStation,
  createWorld,
  flush,
  loopPacket,
} from './helpers/world.js';

async function liveWorld(t, config = {}) {
  const world = await createWorld({ config: { mqtt_url: BROKER_URL, ...config } });
  t.after(() => world.app.stop());
  world.broker.accept();
  world.broker.publish(FIXTURES.loop);
  await flush();
  return world;
}

const stationDevice = (gladys) => gladys.externalIds('station', 'weewx').device;

async function content(world, request) {
  const ack = await world.gladys.fake.widgetGet('station', request);
  assert.equal(ack.success, true, ack.error);
  return ack.data.content;
}

const bodyText = (widget) => widget.components[0].text;

for (const [language, units] of [
  ['en', 'metric'],
  ['fr', 'metric'],
  ['de', 'metric'],
  ['es', 'metric'],
  ['en', 'us'],
]) {
  test(`the content is valid and bound to real features (${language}, ${units})`, async (t) => {
    const world = await liveWorld(t);
    const device = await addStation(world);
    world.broker.publish(
      loopPacket(3, {
        windSpeed_kph: '18',
        windGust_kph: '35',
        windDir: '225',
        rain_cm: '0.02',
        rainRate_cm_per_hour: '0.25',
        UV: '6.4',
      }),
    );
    await flush();
    const widget = await content(world, {
      settings: { device: stationDevice(world.gladys) },
      language,
      units,
    });
    assert.deepEqual(validateWidgetContent(widget), []);
    const features = new Set(device.features.map((f) => f.external_id));
    const tiles = widget.components.filter((c) => c.device_feature);
    assert.equal(tiles.length, 5);
    for (const tile of tiles) {
      assert.ok(features.has(tile.device_feature), tile.device_feature);
    }
    const status = widget.components.find((c) => c.type === 'status');
    const wind = status.items.find((item) => item.icon === 'navigation');
    assert.match(wind.value, units === 'us' ? /11 mph.*22 mph/ : /18 km\/h.*35 km\/h/);
    assert.ok(
      status.items.some((item) => item.icon === 'battery'),
      'the low battery is shown',
    );
    const rain = status.items.find((item) => item.icon === 'cloud-rain');
    assert.match(rain.value, units === 'us' ? /0[.,]1 in\/h/ : /2[.,]5 mm\/h/);
    const caption = widget.components.find((c) => c.type === 'text');
    assert.ok(caption.text.length > 0);
  });
}

test('a station without wind or pressure sensor gets only the tiles it can fill', async (t) => {
  const world = await createWorld({ config: { mqtt_url: BROKER_URL } });
  t.after(() => world.app.stop());
  world.broker.accept();
  world.broker.publish({
    dateTime: '1792648073.0',
    usUnits: '16.0',
    outTemp_C: '8',
    outHumidity: '90',
  });
  await flush();
  await addStation(world);
  const widget = await content(world, {
    settings: { device: stationDevice(world.gladys) },
    language: 'en',
  });
  assert.deepEqual(validateWidgetContent(widget), []);
  assert.deepEqual(
    widget.components.filter((c) => c.device_feature).map((c) => c.label),
    ['Temperature', 'Humidity'],
  );
});

test('empty states: not configured, no station picked, station not added', async (t) => {
  const bare = await createWorld({ config: {} });
  t.after(() => bare.app.stop());
  assert.match(bodyText(await content(bare, { settings: {}, language: 'en' })), /MQTT broker/);

  const world = await liveWorld(t);
  assert.match(bodyText(await content(world, { settings: {}, language: 'fr' })), /Choisissez/);
  assert.match(
    bodyText(
      await content(world, { settings: { device: stationDevice(world.gladys) }, language: 'de' }),
    ),
    /Erkennung/,
  );
});

test('the caption warns when the station is silent', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: Date.now() });
  const world = await liveWorld(t);
  await addStation(world);
  t.mock.timers.tick(20 * 60 * 1000);
  const widget = await content(world, {
    settings: { device: stationDevice(world.gladys) },
    language: 'en',
  });
  const caption = widget.components.find((c) => c.type === 'text');
  assert.match(caption.text, /Station silent: last measurement 20 minutes ago/);
});
