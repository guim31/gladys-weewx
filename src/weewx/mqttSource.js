// -----------------------------------------------------------------------------
// The MQTT source: the JSON packets the weewx-mqtt extension publishes
// (`weather/loop` by default: every loop packet, a few seconds apart, and/or
// every archive record, depending on its `binding`).
//
// mqtt.js reconnects by itself; this module only reports the link state
// (connected, refused, unreachable) and the readings. The credentials go in
// the connection options, never in a logged address.
// -----------------------------------------------------------------------------

import mqtt from 'mqtt';
import { randomBytes } from 'node:crypto';
import { readingFromFlat } from './parse.js';

export const RECONNECT_PERIOD_MS = 15 * 1000;
export const CONNECT_TIMEOUT_MS = 10 * 1000;

/**
 * @param {object} options
 * @param {string} options.url broker URL (mqtt://, mqtts://, ws://, wss://)
 * @param {string} [options.username]
 * @param {string} [options.password]
 * @param {string} options.topic
 * @param {(reading: object) => void} options.onReading
 * @param {(state: 'connected'|'refused'|'unreachable', detail?: string) => void} options.onState
 * @param {(message: string) => void} [options.onInvalid] a message that is not a WeeWX packet
 * @param {Function} [options.connect] test seam: mqtt.connect
 */
export function createMqttSource({
  url,
  username = '',
  password = '',
  topic,
  onReading,
  onState,
  onInvalid = () => {},
  connect = mqtt.connect,
}) {
  let state = null;
  let lastMessageAt = null;
  const parsed = new URL(url);
  // Credentials typed in the URL (mqtt://user:pass@host) are honoured, the
  // dedicated fields win.
  const user = username || decodeURIComponent(parsed.username);
  const pass = password || decodeURIComponent(parsed.password);
  parsed.username = '';
  parsed.password = '';

  const client = connect(parsed.toString(), {
    clientId: `gladys-weewx-${randomBytes(4).toString('hex')}`,
    ...(user ? { username: user } : {}),
    ...(pass ? { password: pass } : {}),
    reconnectPeriod: RECONNECT_PERIOD_MS,
    connectTimeout: CONNECT_TIMEOUT_MS,
    clean: true,
  });

  const setState = (next, detail) => {
    if (state === next) {
      return;
    }
    state = next;
    onState(next, detail);
  };

  client.on('connect', () => {
    client.subscribe(topic, { qos: 0 }, (err) => {
      if (err) {
        setState('unreachable', `subscription refused (${err.message})`);
        return;
      }
      setState('connected');
    });
  });

  client.on('message', (_topic, payload) => {
    let json;
    try {
      json = JSON.parse(payload.toString('utf8'));
    } catch {
      onInvalid('not JSON');
      return;
    }
    const reading = readingFromFlat(json);
    if (!reading) {
      onInvalid('no dateTime: not a weewx-mqtt packet');
      return;
    }
    lastMessageAt = Date.now();
    onReading(reading);
  });

  client.on('error', (err) => {
    // MQTT CONNACK codes 4 and 5 (v3.1.1), 134 and 135 (v5): bad credentials.
    const refused = [4, 5, 134, 135].includes(err?.code) || /not authori[sz]ed/i.test(err?.message);
    setState(refused ? 'refused' : 'unreachable', err?.message);
  });

  client.on('offline', () => setState('unreachable', 'offline'));
  client.on('close', () => {
    if (state === 'connected') {
      setState('unreachable', 'connection closed');
    }
  });

  return {
    get state() {
      return state;
    },
    get lastMessageAt() {
      return lastMessageAt;
    },
    stop() {
      client.removeAllListeners('message');
      client.end(true);
    },
  };
}
