// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with blanks, strings or `undefined`.
//
// Two sources, either or both: an MQTT broker fed by the weewx-mqtt extension,
// and the JSON file of a WeeWX skin read over HTTP.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

export const HTTP_INTERVAL_MIN_S = 15;
export const HTTP_INTERVAL_MAX_S = 3600;

export const DEFAULT_CONFIG = {
  mqtt_url: '',
  mqtt_username: '',
  mqtt_password: '',
  mqtt_topic: 'weather/loop',
  http_url: '',
  http_interval: 60,
  language: 'fr',
};

const text = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * The broker address, with its scheme: users type `192.0.2.10`,
 * `192.0.2.10:1883` or a full `mqtt://` URL.
 * @returns {string} '' when absent or not a broker URL
 */
export function normalizeBrokerUrl(value) {
  const raw = text(value);
  if (raw === '') {
    return '';
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `mqtt://${raw}`;
  try {
    const url = new URL(withScheme);
    return ['mqtt:', 'mqtts:', 'ws:', 'wss:'].includes(url.protocol) && url.hostname
      ? withScheme
      : '';
  } catch {
    return '';
  }
}

/**
 * The address of the JSON file: http(s) only.
 * @returns {string} '' when absent or not an http(s) URL
 */
export function normalizeHttpUrl(value) {
  const raw = text(value);
  if (raw === '') {
    return '';
  }
  try {
    const url = new URL(raw);
    return ['http:', 'https:'].includes(url.protocol) ? raw : '';
  } catch {
    return '';
  }
}

/**
 * @param {object} [raw] the values received from Gladys
 */
export function normalizeConfig(raw = {}) {
  const source = raw ?? {};
  const interval = Number(source.http_interval);
  return {
    mqtt_url: normalizeBrokerUrl(source.mqtt_url),
    mqtt_username: text(source.mqtt_username),
    // A password may legitimately start or end with a space: kept as typed.
    mqtt_password: typeof source.mqtt_password === 'string' ? source.mqtt_password : '',
    mqtt_topic: text(source.mqtt_topic) || DEFAULT_CONFIG.mqtt_topic,
    http_url: normalizeHttpUrl(source.http_url),
    http_interval: Number.isFinite(interval)
      ? Math.min(HTTP_INTERVAL_MAX_S, Math.max(HTTP_INTERVAL_MIN_S, Math.round(interval)))
      : DEFAULT_CONFIG.http_interval,
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}

/** At least one source is configured. */
export const isConfigured = (config) => config.mqtt_url !== '' || config.http_url !== '';

/**
 * An address safe for the logs and the messages: no user name, no password,
 * no query string (a token may hide there).
 */
export function safeUrl(value) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}${url.pathname === '/' ? '' : url.pathname}`;
  } catch {
    return '(invalid address)';
  }
}
