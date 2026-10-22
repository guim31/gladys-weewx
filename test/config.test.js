import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, isConfigured, normalizeConfig, safeUrl } from '../src/config.js';

test('defaults: nothing configured, French, weather/loop, one minute', () => {
  const config = normalizeConfig();
  assert.deepEqual(config, DEFAULT_CONFIG);
  assert.equal(isConfigured(config), false);
});

test('the broker address gets its scheme; anything else is refused', () => {
  assert.equal(normalizeConfig({ mqtt_url: ' 192.0.2.10 ' }).mqtt_url, 'mqtt://192.0.2.10');
  assert.equal(normalizeConfig({ mqtt_url: 'broker:1883' }).mqtt_url, 'mqtt://broker:1883');
  assert.equal(normalizeConfig({ mqtt_url: 'mqtts://b:8883' }).mqtt_url, 'mqtts://b:8883');
  assert.equal(normalizeConfig({ mqtt_url: 'http://b' }).mqtt_url, '');
  assert.equal(normalizeConfig({ http_url: 'ftp://h/x.json' }).http_url, '');
  assert.equal(normalizeConfig({ http_url: 'http://h/x.json' }).http_url, 'http://h/x.json');
  assert.equal(isConfigured(normalizeConfig({ http_url: 'http://h/x.json' })), true);
});

test('interval bounded, topic defaulted, language checked, password kept as typed', () => {
  const config = normalizeConfig({
    http_interval: '5',
    mqtt_topic: '  ',
    language: 'it',
    mqtt_password: ' secret ',
  });
  assert.equal(config.http_interval, 15);
  assert.equal(normalizeConfig({ http_interval: 99999 }).http_interval, 3600);
  assert.equal(normalizeConfig({ http_interval: 'abc' }).http_interval, 60);
  assert.equal(config.mqtt_topic, 'weather/loop');
  assert.equal(config.language, 'fr');
  assert.equal(config.mqtt_password, ' secret ');
});

test('addresses in logs and messages lose their credentials and query', () => {
  assert.equal(safeUrl('mqtt://user:pass@192.0.2.10:1883'), 'mqtt://192.0.2.10:1883');
  assert.equal(safeUrl('http://u:p@h/json/weewx.json?token=x'), 'http://h/json/weewx.json');
  assert.equal(safeUrl('nope'), '(invalid address)');
});
