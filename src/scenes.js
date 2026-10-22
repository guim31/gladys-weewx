// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`).
//
// `current_conditions` — the current conditions of the station as a
// ready-made sentence ("12.4 °C, feels like 10 °C, humidity 81 %, wind SW
// 15 km/h, gusts 32 km/h.") plus its numbers, for a morning message or a
// "close the awning" scene. The values also exist as device features; the
// sentence is what a feature cannot give. Its language is the one of the
// configuration (a scene action does not receive the user's language).
// -----------------------------------------------------------------------------

import { conditionsSentence } from './i18n.js';

export const SCENE_ACTION = {
  CURRENT_CONDITIONS: 'current_conditions',
};

const rounded = (value, decimals = 1) => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

/**
 * @param {import('./hub.js').WeewxHub} hub
 */
export function currentConditions(hub) {
  const data = hub.data();
  const { reading } = data;
  if (!reading) {
    throw new Error('No measurement received from WeeWX yet');
  }
  return {
    summary: conditionsSentence(reading, data, hub.config?.language ?? 'fr'),
    temperature: rounded(reading.temperature),
    humidity: rounded(reading.humidity, 0),
    wind_speed: rounded(reading.windSpeed),
    wind_gust: rounded(reading.windGust),
    rain_today: rounded(data.rainToday),
    raining: data.raining ?? false,
    minutes_since_measurement: data.ageMinutes,
  };
}
