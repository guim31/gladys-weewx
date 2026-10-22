// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake MQTT broker, a fake web
// server for the skin files, and the integration wired on top through
// registerHandlers — the same wiring as index.js.
// -----------------------------------------------------------------------------

import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';

// The integration logs its lifecycle; keep the test output readable
// (LOG_LEVEL is read on every log call). LOG_LEVEL=debug npm test shows them.
process.env.LOG_LEVEL ??= 'silent';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/weewx/${name}.json`, import.meta.url), 'utf8'));

/** Real payloads of WeeWX 5.4 (Simulator driver), see test/fixtures/weewx/README.md. */
export const FIXTURES = {
  loop: fixture('mqtt-loop-metric'),
  archive: fixture('mqtt-archive-metric'),
  loopMetricWx: fixture('mqtt-loop-metricwx'),
  loopUsNoLabel: fixture('mqtt-loop-us-nolabel'),
  weewxJson: fixture('weewx-json'),
  weewxJsonMinimal: fixture('weewx-json-minimal'),
  belchertown: fixture('belchertown'),
};

// The time of the loop fixture, in ms.
export const LOOP_TIME_MS = Number(FIXTURES.loop.dateTime) * 1000;

export const BROKER_URL = 'mqtt://broker.example:1883';
export const JSON_URL = 'http://weewx.example/json/weewx.json';

/** A loop packet of the fixture, at another time and with other values. */
export function loopPacket(secondsAfter = 0, values = {}) {
  return {
    ...FIXTURES.loop,
    dateTime: `${Number(FIXTURES.loop.dateTime) + secondsAfter}.0`,
    ...values,
  };
}

/** A fake broker: mqtt.connect() returning a client the test drives. */
export function createFakeBroker() {
  const broker = {
    clients: [],
    connections: [],
    /** The latest client. */
    get client() {
      return broker.clients[broker.clients.length - 1];
    },
    connect(url, options) {
      const client = new EventEmitter();
      client.subscriptions = [];
      client.ended = false;
      client.subscribe = (topic, opts, callback) => {
        client.subscriptions.push(topic);
        callback?.(null);
      };
      client.end = () => {
        client.ended = true;
      };
      broker.clients.push(client);
      broker.connections.push({ url, options });
      return client;
    },
    /** The broker accepts the connection. */
    accept() {
      broker.client.emit('connect');
    },
    /** A message on the topic. */
    publish(payload, topic = 'weather/loop') {
      const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
      broker.client.emit('message', topic, Buffer.from(body));
    },
  };
  return broker;
}

/** A fake web server for the skin files. */
export function createFakeServer() {
  const server = {
    files: { [JSON_URL]: FIXTURES.weewxJson },
    failure: null,
    requests: [],
    async fetch(url, options = {}) {
      server.requests.push({ url, headers: options.headers });
      if (server.failure === 'down') {
        const err = new TypeError('fetch failed');
        err.cause = { code: 'ECONNREFUSED' };
        throw err;
      }
      if (typeof server.failure === 'number') {
        return new Response('error', { status: server.failure });
      }
      const body = server.files[url];
      if (body === undefined) {
        return new Response('not found', { status: 404 });
      }
      return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json', ...(server.headers ?? {}) },
      });
    },
  };
  return server;
}

/**
 * @param {object} [options]
 * @param {object} [options.config] raw integration config
 * @param {Array<object>} [options.devices] devices already created in Gladys
 * @param {boolean} [options.connect]
 * @param {object} [options.timings]
 */
export async function createWorld({
  config = { mqtt_url: BROKER_URL },
  devices = [],
  connect = true,
  timings,
} = {}) {
  const broker = createFakeBroker();
  const server = createFakeServer();
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    connectMqtt: broker.connect,
    fetch: server.fetch,
    timings,
  });
  if (connect) {
    await gladys.connect();
  }
  return { gladys, broker, server, app, hub: app.hub };
}

/** Create the discovered station in Gladys, as the user would. */
export async function addStation(world) {
  const [device] = world.gladys.fake.discoveredDevices;
  if (!device) {
    throw new Error('the station was not discovered');
  }
  await world.gladys.fake.deviceCreated(device);
  return device;
}

/** A feature external id of the station. */
export const featureId = (gladys, key) => gladys.externalIds('station', 'weewx').feature(key);

/** Let the pending promise callbacks run. */
export const flush = () => new Promise((resolve) => setImmediate(resolve));
