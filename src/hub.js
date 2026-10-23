// -----------------------------------------------------------------------------
// The state of the integration: the configured sources, the latest reading of
// the station, and what is published to Gladys.
//
// Measurements arrive whenever WeeWX sends them (a loop packet every 2 to 5 s
// over MQTT, a file every few minutes over HTTP). The states are published at
// most once per PUBLISH_MIN_MS, and only those that changed: the core caps an
// integration at 300 states a minute and re-evaluates the scenes at each one.
// The triggers, on the contrary, see every measurement.
//
// A one-minute clock in the container ages the last measurement, fires the
// "dry for N minutes" and "silent for N minutes" triggers, starts the new day
// of rain at midnight and sends the heartbeat.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { isConfigured, safeUrl } from './config.js';
import { buildDevice, buildStates, featureKeyOf, featuresOf, stationIds } from './devices.js';
import { MESSAGES, REPORT_TEXT, relativeTime } from './i18n.js';
import { createIssueLog } from './issues.js';
import { createDayRain } from './rain.js';
import { TRIGGER, createTriggerTracker } from './triggers.js';
import { readHttpSource } from './weewx/httpSource.js';
import { createMqttSource } from './weewx/mqttSource.js';
import { countValues } from './weewx/parse.js';

const logger = createLogger({ name: 'weewx' });

export const WIDGET_KEY = 'station';

export const DEFAULT_TIMINGS = {
  publishMinMs: 15 * 1000,
  tickMs: 60 * 1000,
  // Republish an unchanged value at least this often, or the front shows "no
  // recent value" after 48 h.
  heartbeatMs: 6 * 60 * 60 * 1000,
};

const LANGS = ['en', 'fr', 'de', 'es'];

// Silence after which the logs say the measurements are lost (and back).
const LOST_AFTER_MINUTES = 15;

// A value the measurements stopped carrying (a dead sensor) is forgotten
// after this, rather than shown forever.
export const VALUE_EXPIRY_MS = 30 * 60 * 1000;

// A WeeWX clock running ahead: its time is not trusted beyond this, or every
// later measurement would look older and be dropped.
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

const META_KEYS = new Set(['time', 'archive', 'stationName', 'rainInterval']);

/** Rain right now: a rain rate, or rain since the previous measurement. */
export function isRaining(reading) {
  if (!reading) {
    return null;
  }
  const { rainRate, rainInterval } = reading;
  if (rainRate === null && rainInterval === null) {
    return null;
  }
  return (rainRate ?? 0) > 0 || (rainInterval ?? 0) > 0;
}

/** A newer reading on top of the previous one: a value it lacks keeps the last known. */
function mergeReading(previous, next) {
  if (!previous) {
    return { ...next };
  }
  const merged = { ...previous };
  for (const [key, value] of Object.entries(next)) {
    if (value !== null && value !== undefined) {
      merged[key] = value;
    }
  }
  merged.archive = next.archive;
  merged.rainInterval = next.rainInterval;
  return merged;
}

export class WeewxHub {
  /**
   * @param {object} options
   * @param {object} options.gladys
   * @param {() => number} [options.now]
   * @param {Function} [options.connectMqtt] test seam: mqtt.connect
   * @param {typeof fetch} [options.fetch] test seam
   * @param {object} [options.timings]
   */
  constructor({ gladys, now = () => Date.now(), connectMqtt, fetch, timings = {} }) {
    this.gladys = gladys;
    this.now = now;
    this.connectMqtt = connectMqtt;
    this.fetch = fetch;
    this.timings = { ...DEFAULT_TIMINGS, ...timings };
    this.issues = createIssueLog(logger);
    this.config = null;
    this.reading = null;
    this.readingSource = null;
    this.httpFormat = null;
    this.stationName = null;
    this.seen = new Set();
    this.valueAt = new Map();
    this.dayRain = createDayRain();
    this.triggers = createTriggerTracker({ now });
    this.lastNewDataAt = null;
    this.mqtt = null;
    this.http = { state: null, error: null };
    this.httpTimer = null;
    this.tickTimer = null;
    this.publishTimer = null;
    this.lastPublishAt = 0;
    this.status = null;
    this.generation = 0;
  }

  // --- Configuration and sources --------------------------------------------

  /** (Re)start everything with a configuration. */
  async configure(config) {
    this.stopSources();
    this.generation += 1;
    this.config = config;
    // Sent again after a reconnection: Gladys may have restarted.
    this.status = null;
    this.http = { state: null, error: null };
    this.triggers.resetSilence();
    if (!isConfigured(config)) {
      logger.warn('No source configured: waiting for the MQTT broker or the JSON file address');
      await this.updateStatus();
      return;
    }
    const sources = [];
    if (config.mqtt_url) {
      sources.push(`MQTT ${safeUrl(config.mqtt_url)} (${config.mqtt_topic})`);
      this.startMqtt(config);
    }
    if (config.http_url) {
      sources.push(`HTTP ${safeUrl(config.http_url)} every ${config.http_interval} s`);
    }
    logger.info(`Reading WeeWX from ${sources.join(' and ')}`);
    this.startTick();
    if (config.http_url) {
      await this.pollHttp();
    }
    await this.updateStatus();
  }

  startMqtt(config) {
    const url = safeUrl(config.mqtt_url);
    this.mqtt = createMqttSource({
      url: config.mqtt_url,
      username: config.mqtt_username,
      password: config.mqtt_password,
      topic: config.mqtt_topic,
      connect: this.connectMqtt,
      onReading: (reading) => {
        this.onReading(reading, 'mqtt').catch((err) =>
          logger.error(`Processing an MQTT packet failed: ${err.message}`),
        );
      },
      // A wildcard topic also brings the one-value topics of weewx-mqtt
      // (`weather/outTemp_C`): normal, not worth a warning.
      onInvalid: (why) => logger.debug(`MQTT: a message on the topic is ignored (${why})`),
      onState: (state, detail) => {
        if (state === 'connected') {
          this.issues.ok('mqtt', `MQTT: connected again to ${url}`);
          if (!this.issues.isFailing('mqtt')) {
            logger.info(`MQTT: connected to ${url}, topic ${config.mqtt_topic}`);
          }
        } else {
          this.issues.fail(
            'mqtt',
            `MQTT: ${state === 'refused' ? 'connection refused by' : 'cannot reach'} ${url} (${detail ?? state})`,
          );
        }
        this.updateStatus().catch(() => {});
      },
    });
  }

  /** Read the JSON file once, then schedule the next read. */
  async pollHttp() {
    clearTimeout(this.httpTimer);
    this.httpTimer = null;
    const { config } = this;
    if (!config?.http_url) {
      return;
    }
    const generation = this.generation;
    const url = safeUrl(config.http_url);
    try {
      const { format, reading } = await readHttpSource(config.http_url, { fetch: this.fetch });
      if (generation !== this.generation) {
        return;
      }
      if (this.httpFormat !== format) {
        logger.info(`HTTP: ${url} read (${format} format)`);
        this.httpFormat = format;
      }
      this.http = { state: 'ok', error: null };
      this.issues.ok('http', `HTTP: ${url} readable again`);
      await this.onReading(reading, 'http');
    } catch (err) {
      if (generation !== this.generation) {
        return;
      }
      this.http = { state: err.kind ?? 'unreachable', error: err.message };
      this.issues.fail('http', `HTTP: reading ${url} failed (${err.message})`);
    }
    await this.updateStatus();
    if (generation === this.generation && this.tickTimer !== null) {
      this.httpTimer = setTimeout(() => this.pollHttp(), config.http_interval * 1000);
      this.httpTimer.unref?.();
    }
  }

  startTick() {
    clearInterval(this.tickTimer);
    this.tickTimer = setInterval(() => {
      this.tick().catch((err) => logger.error(`Clock tick failed: ${err.message}`));
    }, this.timings.tickMs);
    this.tickTimer.unref?.();
  }

  stopSources() {
    this.mqtt?.stop();
    this.mqtt = null;
    clearTimeout(this.httpTimer);
    this.httpTimer = null;
    clearInterval(this.tickTimer);
    this.tickTimer = null;
  }

  stop() {
    this.stopSources();
    clearTimeout(this.publishTimer);
    this.publishTimer = null;
  }

  /** The connection status shown by Gladys, sent when it changes. */
  async updateStatus() {
    const { config } = this;
    let message = null;
    if (!config || !isConfigured(config)) {
      message = MESSAGES.notConfigured;
    } else if (this.mqtt?.state === 'refused') {
      message = MESSAGES.brokerRefused;
    } else if (this.mqtt?.state === 'unreachable') {
      message = MESSAGES.brokerUnreachable;
    } else if (this.http.state === 'format') {
      message = MESSAGES.httpUnknownFormat;
    } else if (this.http.state === 'unreachable') {
      message = MESSAGES.httpFailed;
    }
    const pending = message === null && this.mqtt !== null && this.mqtt.state === null;
    const status = pending ? null : message === null ? 'ok' : message.en;
    if (status === this.status) {
      return;
    }
    this.status = status;
    if (pending) {
      return;
    }
    // The core wants every language ({ en, fr, de, es }) and answers 400 to a
    // plain string: Gladys picks the user's language itself.
    await this.gladys
      .setConnectionStatus(message === null, message === null ? undefined : message)
      .catch(() => {});
  }

  // --- Measurements ----------------------------------------------------------

  /**
   * A reading from a source.
   * @param {object} reading
   * @param {'mqtt'|'http'} source
   */
  async onReading(reading, source) {
    if (reading.time === null) {
      return;
    }
    if (reading.time > this.now() + FUTURE_TOLERANCE_MS) {
      this.issues.fail('clock', 'WeeWX dates its measurements in the future: check its clock');
      reading = { ...reading, time: this.now() };
    } else {
      this.issues.ok('clock', 'WeeWX clock back in time');
    }
    this.dayRain.update(reading);
    if (reading.stationName) {
      this.stationName = reading.stationName;
    }
    const previousTime = this.reading?.time ?? null;
    const isNew = previousTime === null || reading.time > previousTime;
    if (previousTime === null || reading.time >= previousTime) {
      this.reading = mergeReading(this.reading, reading);
      this.readingSource = source;
    }
    if (isNew) {
      for (const [key, value] of Object.entries(reading)) {
        if (value !== null && value !== undefined && !META_KEYS.has(key)) {
          this.valueAt.set(key, this.now());
        }
      }
      if (this.lastNewDataAt === null) {
        logger.info(`First measurement received from WeeWX (${source})`);
      } else if (this.now() - this.lastNewDataAt >= LOST_AFTER_MINUTES * 60 * 1000) {
        logger.info('WeeWX measurements are back');
      }
      this.lastNewDataAt = this.now();
    }

    const before = this.seen.size;
    for (const key of featuresOf(reading)) {
      this.seen.add(key);
    }
    if (this.seen.size !== before) {
      await this.publishDiscovery();
    }
    if (isNew) {
      await this.fireObservationTriggers(reading);
    }
    this.schedulePublish();
  }

  /** The latest reading, without the values not refreshed for VALUE_EXPIRY_MS. */
  currentReading() {
    if (!this.reading) {
      return null;
    }
    const reading = { ...this.reading };
    for (const [key, at] of this.valueAt) {
      if (this.now() - at > VALUE_EXPIRY_MS) {
        reading[key] = null;
      }
    }
    return reading;
  }

  /** The data the features and the widget read. */
  data() {
    const reading = this.currentReading();
    return {
      reading,
      rainToday: this.dayRain.value(this.now()),
      raining: isRaining(reading),
      ageMinutes:
        this.lastNewDataAt === null
          ? null
          : Math.max(0, Math.floor((this.now() - this.lastNewDataAt) / 60000)),
    };
  }

  /** The clock: age, dry spells, silences, midnight, heartbeat. */
  async tick() {
    const { dry, silent, silentMinutes } = this.triggers.onTick();
    for (const minutes of dry) {
      await this.fireScene(TRIGGER.RAIN_STOPPED, {
        after_minutes: String(minutes),
        rain_today_mm: roundOrNull(this.dayRain.value(this.now()), 1),
      });
    }
    for (const minutes of silent) {
      // A JSON file is only rewritten every archive interval (5 minutes by
      // default): a short silence is the normal pace, not worth a line.
      if (minutes === LOST_AFTER_MINUTES) {
        logger.info(`No measurement from WeeWX for ${silentMinutes} minutes`);
      }
      await this.fireScene(TRIGGER.STATION_SILENT, {
        after_minutes: String(minutes),
        minutes: silentMinutes,
      });
    }
    this.schedulePublish();
  }

  // --- Gladys side -------------------------------------------------------------

  /** The device of the station as Gladys knows it, if added. */
  addedDevice() {
    const externalId = stationIds(this.gladys).device;
    return (this.gladys.devices ?? []).find((device) => device.external_id === externalId) ?? null;
  }

  /** The discovered devices: the station, once it sent something. */
  discoveredDevices() {
    const features = new Set(this.seen);
    for (const feature of this.addedDevice()?.features ?? []) {
      const key = featureKeyOf(this.gladys, feature.external_id);
      if (key !== null) {
        features.add(key);
      }
    }
    if (features.size === 0) {
      return [];
    }
    return [
      buildDevice(this.gladys, {
        name: this.stationName,
        features,
        language: this.config?.language ?? 'fr',
      }),
    ];
  }

  async publishDiscovery() {
    try {
      await this.gladys.publishDiscoveredDevices(this.discoveredDevices());
      this.issues.ok('discovery', 'Gladys accepts the station again');
      if (this.status === 'publish-failed') {
        this.status = null;
        await this.updateStatus();
      }
    } catch (err) {
      this.issues.fail('discovery', `Publishing the station failed: ${err.message}`);
      await this.gladys.setConnectionStatus(false, MESSAGES.publishFailed).catch(() => {});
      this.status = 'publish-failed';
    }
  }

  /** Publish soon: at most once per publishMinMs. */
  schedulePublish() {
    if (this.publishTimer !== null) {
      return;
    }
    const wait = Math.max(0, this.lastPublishAt + this.timings.publishMinMs - this.now());
    this.publishTimer = setTimeout(() => {
      this.publishTimer = null;
      this.publish().catch((err) => logger.error(`Publishing failed: ${err.message}`));
    }, wait);
    this.publishTimer.unref?.();
  }

  /** Publish the changed states now (the device just added: everything). */
  async publish() {
    if (!this.addedDevice()) {
      return;
    }
    this.lastPublishAt = this.now();
    const states = buildStates(this.gladys, this.data());
    if (states.length === 0) {
      return;
    }
    try {
      const { count } = await this.gladys.publishChangedStates(states, {
        heartbeat: this.timings.heartbeatMs,
      });
      if (count > 0) {
        logger.debug(`${count} state(s) published`);
      }
      this.issues.ok('publish', 'Gladys accepts the states again');
    } catch (err) {
      this.issues.fail('publish', `Publishing the states failed: ${err.message}`);
    }
  }

  async fireObservationTriggers(reading) {
    const { rainStarted, gusts } = this.triggers.onObservation({
      raining: isRaining(reading),
      gust: reading.windGust,
    });
    if (rainStarted) {
      await this.fireScene(TRIGGER.RAIN_STARTED, {});
    }
    for (const threshold of gusts) {
      await this.fireScene(TRIGGER.GUST_ABOVE, {
        above_kmh: String(threshold),
        gust_kmh: roundOrNull(reading.windGust, 0),
      });
    }
  }

  async fireScene(key, extra) {
    const device = this.addedDevice();
    if (!device) {
      return;
    }
    try {
      await this.gladys.publishSceneEvent(key, {
        device: device.external_id,
        station: device.name ?? this.stationName ?? 'WeeWX',
        ...extra,
      });
      logger.debug(`Scene event ${key} fired`);
      this.issues.ok('scene', 'Gladys accepts the scene events again');
    } catch (err) {
      this.issues.fail('scene', `Firing the scene event ${key} failed: ${err.message}`);
    }
  }

  /** Fire-and-forget nudge: the dashboards re-pull the widget content. */
  requestWidgetRefresh() {
    try {
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    } catch (err) {
      logger.debug(`Widget refresh not sent: ${err.message}`);
    }
  }

  // --- "Check the source" action ----------------------------------------------

  /**
   * What each source gives right now, in the four languages.
   * @returns {Promise<Record<string, string>>}
   */
  async checkSources() {
    const { config } = this;
    if (!config || !isConfigured(config)) {
      throw new Error(
        MESSAGES.notConfigured[config?.language ?? 'en'] ?? MESSAGES.notConfigured.en,
      );
    }
    const lines = Object.fromEntries(LANGS.map((lang) => [lang, []]));
    const add = (fn) => {
      for (const lang of LANGS) {
        lines[lang].push(fn(REPORT_TEXT[lang], lang));
      }
    };
    if (config.http_url) {
      await this.pollHttp();
    }
    if (config.mqtt_url) {
      const url = safeUrl(config.mqtt_url);
      if (this.mqtt?.state === 'connected') {
        add((text) => text.mqttOk(url, config.mqtt_topic));
        if (this.mqtt.lastMessageAt === null) {
          add((text) => text.mqttSilent);
        }
      } else {
        add((text) => text.mqttDown(url));
      }
    }
    if (config.http_url) {
      const url = safeUrl(config.http_url);
      add((text) =>
        this.http.state === 'ok'
          ? text.httpOk(url, this.httpFormat)
          : text.httpDown(url, this.http.error ?? '?'),
      );
    }
    if (this.reading && this.lastNewDataAt !== null) {
      const seconds = (this.now() - this.lastNewDataAt) / 1000;
      add((text, lang) => text.received(countValues(this.reading), relativeTime(seconds, lang)));
    }
    return Object.fromEntries(LANGS.map((lang) => [lang, lines[lang].join(' ')]));
  }
}

function roundOrNull(value, decimals) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
