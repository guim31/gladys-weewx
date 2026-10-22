// -----------------------------------------------------------------------------
// The "WeeWX station" dashboard widget: the current conditions.
//
// Content budget of the core: 8 components, 2 texts at most. Here: up to 5
// live tiles bound to the station's features (they follow the published
// states without any refresh, and only the features the station measures),
// 1 status list, 1 caption. The content is pre-localized from the viewer's
// `language` and `units` (the core caches it per settings, language and
// units).
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { stationIds } from './devices.js';
import { compassPoint, formatNumber, pick, relativeTime } from './i18n.js';
import { WIDGET_KEY } from './hub.js';

export const WIDGET = {
  STATION: WIDGET_KEY,
};

export const CONTENT_TTL_SECONDS = 60;

// Beyond this, the caption warns that the station is silent.
const STALE_MINUTES = 15;

export const TEXT = {
  en: {
    notConfigured:
      'Enter the MQTT broker or the JSON file of WeeWX in the integration configuration.',
    pickStation: 'Pick the station in the widget settings.',
    unknownStation: 'Add the WeeWX station to Gladys first (Discovery tab), then pick it here.',
    waiting: 'Waiting for the first measurement of WeeWX…',
    temperature: 'Temperature',
    humidity: 'Humidity',
    wind: 'Wind',
    rainToday: 'Rain today',
    pressure: 'Pressure',
    feelsLike: 'Feels like',
    windDetail: 'Wind',
    gusts: (value) => `gusts ${value}`,
    calm: 'Calm',
    rain: 'Rain',
    raining: (rate) => `Raining${rate ? `, ${rate}` : ''}`,
    dry: 'No rain',
    uv: 'UV index',
    indoor: 'Indoor',
    battery: 'Station battery',
    batteryLow: 'Low',
    measured: (ago) => `Measured ${ago}`,
    stale: (ago) => `Station silent: last measurement ${ago}`,
  },
  fr: {
    notConfigured:
      "Saisissez le broker MQTT ou le fichier JSON de WeeWX dans la configuration de l'intégration.",
    pickStation: 'Choisissez la station dans les réglages du widget.',
    unknownStation:
      "Ajoutez d'abord la station WeeWX à Gladys (onglet Découverte), puis choisissez-la ici.",
    waiting: 'En attente de la première mesure de WeeWX…',
    temperature: 'Température',
    humidity: 'Humidité',
    wind: 'Vent',
    rainToday: 'Pluie du jour',
    pressure: 'Pression',
    feelsLike: 'Ressenti',
    windDetail: 'Vent',
    gusts: (value) => `rafales ${value}`,
    calm: 'Calme',
    rain: 'Pluie',
    raining: (rate) => `Il pleut${rate ? `, ${rate}` : ''}`,
    dry: 'Pas de pluie',
    uv: 'Indice UV',
    indoor: 'Intérieur',
    battery: 'Batterie de la station',
    batteryLow: 'Faible',
    measured: (ago) => `Mesuré ${ago}`,
    stale: (ago) => `Station muette : dernière mesure ${ago}`,
  },
  de: {
    notConfigured:
      'Gib den MQTT-Broker oder die JSON-Datei von WeeWX in der Konfiguration der Integration ein.',
    pickStation: 'Wähle die Station in den Einstellungen des Widgets.',
    unknownStation:
      'Füge die WeeWX-Station zuerst zu Gladys hinzu (Tab „Erkennung“) und wähle sie dann hier.',
    waiting: 'Warte auf die erste Messung von WeeWX…',
    temperature: 'Temperatur',
    humidity: 'Feuchtigkeit',
    wind: 'Wind',
    rainToday: 'Regen heute',
    pressure: 'Luftdruck',
    feelsLike: 'Gefühlt',
    windDetail: 'Wind',
    gusts: (value) => `Böen ${value}`,
    calm: 'Windstill',
    rain: 'Regen',
    raining: (rate) => `Es regnet${rate ? `, ${rate}` : ''}`,
    dry: 'Kein Regen',
    uv: 'UV-Index',
    indoor: 'Innen',
    battery: 'Batterie der Station',
    batteryLow: 'Schwach',
    measured: (ago) => `Gemessen ${ago}`,
    stale: (ago) => `Station stumm: letzte Messung ${ago}`,
  },
  es: {
    notConfigured:
      'Introduzca el broker MQTT o el archivo JSON de WeeWX en la configuración de la integración.',
    pickStation: 'Elija la estación en los ajustes del widget.',
    unknownStation:
      'Añada primero la estación WeeWX a Gladys (pestaña Descubrimiento) y luego elíjala aquí.',
    waiting: 'Esperando la primera medición de WeeWX…',
    temperature: 'Temperatura',
    humidity: 'Humedad',
    wind: 'Viento',
    rainToday: 'Lluvia de hoy',
    pressure: 'Presión',
    feelsLike: 'Sensación',
    windDetail: 'Viento',
    gusts: (value) => `ráfagas ${value}`,
    calm: 'Calma',
    rain: 'Lluvia',
    raining: (rate) => `Está lloviendo${rate ? `, ${rate}` : ''}`,
    dry: 'Sin lluvia',
    uv: 'Índice UV',
    indoor: 'Interior',
    battery: 'Batería de la estación',
    batteryLow: 'Baja',
    measured: (ago) => `Medido ${ago}`,
    stale: (ago) => `Estación sin datos: última medición ${ago}`,
  },
};

const textContent = (text) => ({
  ttl_seconds: CONTENT_TTL_SECONDS,
  components: [{ type: 'text', variant: 'body', text }],
});

function temperature(celsius, units, language) {
  const value = units === 'us' ? (celsius * 9) / 5 + 32 : celsius;
  return `${formatNumber(value, language, 0)}°`;
}

function speed(kmh, units, language) {
  return units === 'us'
    ? `${formatNumber(kmh / 1.609344, language, 0)} mph`
    : `${formatNumber(kmh, language, 0)} km/h`;
}

function rainRate(mmh, units, language) {
  return units === 'us'
    ? `${formatNumber(mmh / 25.4, language, 2)} in/h`
    : `${formatNumber(mmh, language, 1)} mm/h`;
}

const known = (value) => value !== null && value !== undefined;

// The live tiles: feature key, label key, icon.
const TILES = [
  ['temperature', 'temperature', 'thermometer'],
  ['humidity', 'humidity', 'droplet'],
  ['wind_speed', 'wind', 'wind'],
  ['rain_today', 'rainToday', 'umbrella'],
  ['pressure_sea_level', 'pressure', 'activity'],
];

/**
 * Pure builder of the widget content.
 * @param {object} input
 * @param {object} input.gladys
 * @param {{ reading: object|null, rainToday: number|null, raining: boolean|null, ageMinutes: number|null }} input.data
 * @param {Set<string>} input.features the feature keys of the added device
 * @param {string} input.language
 * @param {string} input.units 'metric' | 'us'
 * @param {number|null} input.lastDataAt ms
 * @param {number} input.now ms
 */
export function buildStationContent({ gladys, data, features, language, units, lastDataAt, now }) {
  const text = pick(TEXT, language);
  const { reading } = data;
  if (!reading) {
    return textContent(text.waiting);
  }
  const ids = stationIds(gladys);
  const components = TILES.filter(([key]) => features.has(key)).map(([key, label, icon]) => ({
    type: 'value',
    label: text[label],
    icon,
    device_feature: ids.feature(key),
  }));

  const items = [];
  if (known(reading.feelsLike)) {
    items.push({
      label: text.feelsLike,
      value: temperature(reading.feelsLike, units, language),
      icon: 'thermometer',
    });
  }
  if (known(reading.windSpeed)) {
    const calm = reading.windSpeed < 1;
    const direction =
      calm || !known(reading.windDirection)
        ? ''
        : `${compassPoint(reading.windDirection, language)} `;
    const gusts =
      known(reading.windGust) && reading.windGust >= 1
        ? `, ${text.gusts(speed(reading.windGust, units, language))}`
        : '';
    items.push({
      label: text.windDetail,
      value:
        calm && !gusts
          ? text.calm
          : `${direction}${speed(reading.windSpeed, units, language)}${gusts}`,
      icon: 'navigation',
    });
  }
  if (known(data.raining)) {
    const rate =
      known(reading.rainRate) && reading.rainRate > 0
        ? rainRate(reading.rainRate, units, language)
        : null;
    items.push({
      label: text.rain,
      value: data.raining ? text.raining(rate) : text.dry,
      icon: 'cloud-rain',
      color: data.raining ? WIDGET_COLORS.INFO : WIDGET_COLORS.NEUTRAL,
    });
  }
  if (known(reading.uv)) {
    items.push({
      label: text.uv,
      value: formatNumber(reading.uv, language, 1),
      icon: 'sun',
      color:
        reading.uv >= 8
          ? WIDGET_COLORS.DANGER
          : reading.uv >= 6
            ? WIDGET_COLORS.WARNING
            : WIDGET_COLORS.NEUTRAL,
    });
  }
  if (known(reading.indoorTemperature)) {
    const humidity = known(reading.indoorHumidity)
      ? `, ${formatNumber(reading.indoorHumidity, language, 0)} %`
      : '';
    items.push({
      label: text.indoor,
      value: `${temperature(reading.indoorTemperature, units, language)}${humidity}`,
      icon: 'home',
    });
  }
  if (reading.batteryLow === true) {
    items.push({
      label: text.battery,
      value: text.batteryLow,
      icon: 'battery',
      color: WIDGET_COLORS.DANGER,
    });
  }
  if (items.length > 0) {
    components.push({ type: 'status', items });
  }
  if (lastDataAt !== null) {
    const seconds = (now - lastDataAt) / 1000;
    const ago = relativeTime(seconds, language);
    components.push({
      type: 'text',
      variant: 'caption',
      text: seconds >= STALE_MINUTES * 60 ? text.stale(ago) : text.measured(ago),
    });
  }
  return { ttl_seconds: CONTENT_TTL_SECONDS, components };
}

/**
 * The onWidgetGet handler of the station widget.
 * @param {import('./hub.js').WeewxHub} hub
 * @param {{ settings?: object, language?: string, units?: string }} request
 */
export function getStationWidget(hub, { settings = {}, language = 'en', units = 'metric' } = {}) {
  const text = pick(TEXT, language);
  if (!hub.config || (!hub.config.mqtt_url && !hub.config.http_url)) {
    return textContent(text.notConfigured);
  }
  if (!settings.device) {
    return textContent(text.pickStation);
  }
  const device = hub.addedDevice();
  if (!device || device.external_id !== settings.device) {
    return textContent(text.unknownStation);
  }
  // Tiles only for the features of the device as added: a feature seen since
  // is not in Gladys until the user updates the device.
  const features = new Set((device.features ?? []).map((feature) => feature.external_id));
  const ids = stationIds(hub.gladys);
  const keys = new Set(TILES.map(([key]) => key).filter((key) => features.has(ids.feature(key))));
  return buildStationContent({
    gladys: hub.gladys,
    data: hub.data(),
    features: keys,
    language,
    units,
    lastDataAt: hub.lastNewDataAt,
    now: hub.now(),
  });
}
