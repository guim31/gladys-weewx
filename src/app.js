// -----------------------------------------------------------------------------
// Registers every SDK handler on a GladysIntegration (or the SDK's fake
// Gladys), so index.js stays a few lines and the tests drive the very same
// wiring.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import { stationIds } from './devices.js';
import { WeewxHub } from './hub.js';
import { MESSAGES } from './i18n.js';
import { SCENE_ACTION, currentConditions } from './scenes.js';
import { WIDGET, getStationWidget } from './widgets.js';

const logger = createLogger({ name: 'weewx-app' });

export const ACTION = {
  CHECK_SOURCES: 'check_sources',
};

/**
 * @param {object} gladys
 * @param {object} [options] test seams: connectMqtt, fetch, now, timings
 * @returns {{ hub: WeewxHub, stop: () => void }}
 */
export function registerHandlers(gladys, options = {}) {
  const hub = new WeewxHub({
    gladys,
    now: options.now,
    connectMqtt: options.connectMqtt,
    fetch: options.fetch,
    timings: options.timings,
  });

  const isStation = (device) => device?.external_id === stationIds(gladys).device;

  // --- Discovery: the station, once WeeWX sent something ---------------------
  gladys.onScanRequest(async () => {
    logger.info('Scan requested');
    await hub.publishDiscovery();
  });

  // --- Read-only device ----------------------------------------------------------
  gladys.onSetValue(async (device, feature) => {
    throw new Error(`${feature.external_id} is read-only`);
  });

  // No poll: the measurements are pushed (MQTT) or read on the container's
  // own timer (HTTP). Registered anyway for a device published by an older
  // version with polling: nothing to do.
  gladys.onPoll(async () => {});

  // The station just added (or updated) in Gladys: the SDK forgot what it
  // had published and the core dropped the states sent before it existed.
  // Send everything now, and refresh the open widgets.
  const onStationChanged = async (device) => {
    if (!isStation(device)) {
      return;
    }
    await hub.publish();
    hub.requestWidgetRefresh();
  };
  gladys.onDeviceCreated(onStationChanged);
  gladys.onDeviceUpdated(onStationChanged);

  // --- Configuration screen action ----------------------------------------------
  gladys.onAction(ACTION.CHECK_SOURCES, async () => {
    logger.info('Action check_sources');
    return hub.checkSources();
  });

  // --- Scene action ---------------------------------------------------------------
  gladys.onSceneAction(SCENE_ACTION.CURRENT_CONDITIONS, () => currentConditions(hub));

  // --- Dashboard widget -----------------------------------------------------------
  gladys.onWidgetGet(WIDGET.STATION, (request) => getStationWidget(hub, request));

  // --- Configuration -------------------------------------------------------------
  gladys.onConfigUpdated(async (raw) => {
    logger.info('Configuration updated');
    await hub.configure(normalizeConfig(raw));
  });

  // --- Connection lifecycle (the SDK logs the Gladys link itself) -------------
  gladys.on('connected', async () => {
    try {
      await hub.configure(normalizeConfig(await gladys.getConfig()));
    } catch (err) {
      logger.error(`Post-connection initialization failed: ${err.message}`);
      await gladys.setConnectionStatus(false, MESSAGES.publishFailed).catch(() => {});
    }
  });

  return {
    hub,
    stop() {
      hub.stop();
    },
  };
}
