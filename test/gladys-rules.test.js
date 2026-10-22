// -----------------------------------------------------------------------------
// Conformity with the Gladys core, on every device discovered from real WeeWX
// payloads (every source and unit system), in every feature-name language.
//
// The table (test/fixtures/gladys-feature-table.json) is extracted from the
// core code: a category/type couple missing there shows as "undefined" or
// without icon in Gladys, a poll frequency outside its list is a 400 on
// discovery, a feature without min/max is a 422 on "Add to Gladys".
// Do not loosen this test to make it pass: fix the integration.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FEATURES } from '../src/devices.js';
import { BROKER_URL, FIXTURES, JSON_URL, createWorld, flush } from './helpers/world.js';

const table = JSON.parse(
  await readFile(new URL('./fixtures/gladys-feature-table.json', import.meta.url), 'utf8'),
);

const mqttPayloads = ['loop', 'archive', 'loopMetricWx', 'loopUsNoLabel'];
const httpPayloads = ['weewxJson', 'weewxJsonMinimal', 'belchertown'];

const scenarios = [];
for (const language of [undefined, 'en', 'de', 'es']) {
  scenarios.push({
    label: `MQTT, every packet, ${language ?? 'default language (French)'}`,
    config: { mqtt_url: BROKER_URL, ...(language ? { language } : {}) },
    mqtt: mqttPayloads,
  });
}
for (const payload of httpPayloads) {
  scenarios.push({ label: `HTTP, ${payload}`, config: { http_url: JSON_URL }, http: payload });
}

function checkDevice(device) {
  const where = device.name;
  // should_poll: true if and only if poll_frequency is provided, in ms.
  if (device.poll_frequency === undefined) {
    assert.notEqual(device.should_poll, true, `${where}: should_poll without poll_frequency`);
  } else {
    assert.equal(device.should_poll, true, `${where}: poll_frequency without should_poll`);
    assert.ok(
      table.poll_frequencies_ms.includes(device.poll_frequency),
      `${where}: poll_frequency ${device.poll_frequency} is not one of ${table.poll_frequencies_ms}`,
    );
  }

  assert.ok(device.features.length > 0, `${where}: no feature`);
  const externalIds = new Set();
  const names = new Set();
  for (const feature of device.features) {
    const at = `${where} / ${feature.name}`;
    const pair = table.pairs[`${feature.category}/${feature.type}`];
    assert.ok(pair, `${at}: ${feature.category}/${feature.type} is not a couple Gladys knows`);
    assert.ok(pair.label_en && pair.label_fr && pair.icon, `${at}: couple without label or icon`);

    assert.equal(typeof feature.min, 'number', `${at}: min must be a number`);
    assert.equal(typeof feature.max, 'number', `${at}: max must be a number`);
    assert.ok(
      Number.isFinite(feature.min) && Number.isFinite(feature.max),
      `${at}: finite min/max`,
    );
    assert.ok(feature.min <= feature.max, `${at}: min > max`);
    assert.equal(typeof feature.read_only, 'boolean', `${at}: read_only must be a boolean`);
    assert.equal(typeof feature.has_feedback, 'boolean', `${at}: has_feedback must be a boolean`);
    if (feature.unit !== undefined) {
      assert.ok(table.units.includes(feature.unit), `${at}: unknown unit ${feature.unit}`);
    }

    assert.ok(!externalIds.has(feature.external_id), `${at}: duplicate external_id`);
    externalIds.add(feature.external_id);
    assert.ok(!names.has(feature.name), `${at}: duplicate feature name on the device`);
    names.add(feature.name);
  }
}

for (const scenario of scenarios) {
  test(`every discovered device follows the Gladys rules (${scenario.label})`, async () => {
    const world = await createWorld({ config: scenario.config, connect: false });
    if (scenario.http) {
      world.server.files[JSON_URL] = FIXTURES[scenario.http];
    }
    await world.gladys.connect();
    try {
      if (scenario.mqtt) {
        world.broker.accept();
        for (const payload of scenario.mqtt) {
          world.broker.publish(FIXTURES[payload]);
        }
        await flush();
      }
      const devices = world.gladys.fake.discoveredDevices;
      assert.equal(devices.length, 1, `expected the station, got ${devices.length}`);
      checkDevice(devices[0]);
      if (scenario.mqtt) {
        // The Simulator measures everything: every feature is there.
        assert.equal(devices[0].features.length, FEATURES.length);
      }
    } finally {
      world.app.stop();
    }
  });
}
