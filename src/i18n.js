// -----------------------------------------------------------------------------
// Every text the container produces, in the four languages of the Gladys
// interface. German says "du", Spanish says "usted" (house rule, enforced by
// test/i18n.test.js). Vocabulary follows the Gladys front translations.
//
// An integration of type "device" does not receive the user's language: the
// feature names, the scene action outputs and the action messages follow the
// `language` field of the configuration (French by default). Widgets get the
// viewer's language with every request.
// -----------------------------------------------------------------------------

import { LANGUAGES } from './config.js';

/** Pick the text of a language, English as the fallback. */
export function pick(texts, language) {
  return texts[LANGUAGES.includes(language) ? language : 'en'] ?? texts.en;
}

// Feature names, by feature key (src/devices.js). Frozen at device creation
// in Gladys: changing one only affects stations added afterwards.
export const FEATURE_NAMES = {
  en: {
    temperature: 'Temperature',
    feels_like: 'Feels like',
    dew_point: 'Dew point',
    humidity: 'Humidity',
    indoor_temperature: 'Indoor temperature',
    indoor_humidity: 'Indoor humidity',
    pressure_sea_level: 'Sea-level pressure',
    pressure_station: 'Station pressure',
    wind_speed: 'Average wind',
    wind_gust: 'Wind gusts',
    wind_direction: 'Wind direction',
    rain_rate: 'Rain intensity',
    rain_today: 'Rain today',
    raining: 'Raining',
    uv: 'UV index',
    solar_radiation: 'Solar radiation (W/m²)',
    battery_low: 'Low battery',
    data_age: 'Last measurement',
  },
  fr: {
    temperature: 'Température',
    feels_like: 'Ressenti',
    dew_point: 'Point de rosée',
    humidity: 'Humidité',
    indoor_temperature: 'Température intérieure',
    indoor_humidity: 'Humidité intérieure',
    pressure_sea_level: 'Pression (niveau de la mer)',
    pressure_station: 'Pression (station)',
    wind_speed: 'Vent moyen',
    wind_gust: 'Rafales',
    wind_direction: 'Direction du vent',
    rain_rate: 'Intensité de pluie',
    rain_today: 'Pluie du jour',
    raining: 'Il pleut',
    uv: 'Indice UV',
    solar_radiation: 'Rayonnement solaire (W/m²)',
    battery_low: 'Batterie faible',
    data_age: 'Dernière mesure',
  },
  de: {
    temperature: 'Temperatur',
    feels_like: 'Gefühlte Temperatur',
    dew_point: 'Taupunkt',
    humidity: 'Luftfeuchtigkeit',
    indoor_temperature: 'Innentemperatur',
    indoor_humidity: 'Luftfeuchtigkeit innen',
    pressure_sea_level: 'Luftdruck (Meereshöhe)',
    pressure_station: 'Luftdruck (Station)',
    wind_speed: 'Mittlerer Wind',
    wind_gust: 'Windböen',
    wind_direction: 'Windrichtung',
    rain_rate: 'Regenintensität',
    rain_today: 'Regen heute',
    raining: 'Es regnet',
    uv: 'UV-Index',
    solar_radiation: 'Sonneneinstrahlung (W/m²)',
    battery_low: 'Batterie schwach',
    data_age: 'Letzte Messung',
  },
  es: {
    temperature: 'Temperatura',
    feels_like: 'Sensación térmica',
    dew_point: 'Punto de rocío',
    humidity: 'Humedad',
    indoor_temperature: 'Temperatura interior',
    indoor_humidity: 'Humedad interior',
    pressure_sea_level: 'Presión (nivel del mar)',
    pressure_station: 'Presión (estación)',
    wind_speed: 'Viento medio',
    wind_gust: 'Ráfagas',
    wind_direction: 'Dirección del viento',
    rain_rate: 'Intensidad de lluvia',
    rain_today: 'Lluvia de hoy',
    raining: 'Está lloviendo',
    uv: 'Índice UV',
    solar_radiation: 'Radiación solar (W/m²)',
    battery_low: 'Batería baja',
    data_age: 'Última medición',
  },
};

// Connection status messages (Gladys shows them on the integration page) and
// errors of the actions.
export const MESSAGES = {
  notConfigured: {
    en: 'Enter the address of your MQTT broker or of the JSON file of WeeWX in the configuration.',
    fr: "Saisissez l'adresse de votre broker MQTT ou du fichier JSON de WeeWX dans la configuration.",
    de: 'Gib die Adresse deines MQTT-Brokers oder der JSON-Datei von WeeWX in der Konfiguration ein.',
    es: 'Introduzca la dirección de su broker MQTT o del archivo JSON de WeeWX en la configuración.',
  },
  brokerUnreachable: {
    en: 'The MQTT broker cannot be reached: check its address and that it is running.',
    fr: 'Le broker MQTT est injoignable : vérifiez son adresse et qu’il fonctionne.',
    de: 'Der MQTT-Broker ist nicht erreichbar: Prüfe seine Adresse und ob er läuft.',
    es: 'No se puede acceder al broker MQTT: compruebe su dirección y que esté en marcha.',
  },
  brokerRefused: {
    en: 'The MQTT broker refused the connection: check the user name and the password.',
    fr: "Le broker MQTT refuse la connexion : vérifiez le nom d'utilisateur et le mot de passe.",
    de: 'Der MQTT-Broker lehnt die Verbindung ab: Prüfe Benutzername und Passwort.',
    es: 'El broker MQTT rechaza la conexión: compruebe el nombre de usuario y la contraseña.',
  },
  httpFailed: {
    en: 'The JSON file of WeeWX cannot be read: check its address.',
    fr: 'Le fichier JSON de WeeWX est illisible : vérifiez son adresse.',
    de: 'Die JSON-Datei von WeeWX kann nicht gelesen werden: Prüfe ihre Adresse.',
    es: 'No se puede leer el archivo JSON de WeeWX: compruebe su dirección.',
  },
  httpUnknownFormat: {
    en: 'The file is not one of the supported WeeWX formats (weewx-json, Belchertown, weewx-mqtt).',
    fr: "Le fichier n'est pas dans un format WeeWX pris en charge (weewx-json, Belchertown, weewx-mqtt).",
    de: 'Die Datei hat kein unterstütztes WeeWX-Format (weewx-json, Belchertown, weewx-mqtt).',
    es: 'El archivo no tiene un formato WeeWX compatible (weewx-json, Belchertown, weewx-mqtt).',
  },
  noData: {
    en: 'No measurement received yet from WeeWX.',
    fr: 'Aucune mesure reçue de WeeWX pour le moment.',
    de: 'Noch keine Messung von WeeWX empfangen.',
    es: 'Todavía no se ha recibido ninguna medición de WeeWX.',
  },
  publishFailed: {
    en: 'Gladys refused the station: see the integration logs.',
    fr: "Gladys a refusé la station : consultez les journaux de l'intégration.",
    de: 'Gladys hat die Station abgelehnt: Sieh dir die Protokolle der Integration an.',
    es: 'Gladys rechazó la estación: consulte los registros de la integración.',
  },
};

// The eight points of the compass, from the north, clockwise.
export const COMPASS = {
  en: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'],
  fr: ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'],
  de: ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'],
  es: ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'],
};

/** The compass point of a direction in degrees. */
export function compassPoint(degrees, language) {
  const points = pick(COMPASS, language);
  return points[Math.round((((degrees % 360) + 360) % 360) / 45) % 8];
}

// The "check the source" action report and the scene sentence.
export const REPORT_TEXT = {
  en: {
    mqttOk: (url, topic) => `MQTT: connected to ${url}, topic ${topic}.`,
    mqttDown: (url) => `MQTT: ${url} is not connected.`,
    mqttSilent: 'No message yet: does WeeWX publish to this topic?',
    httpOk: (url, format) => `HTTP: ${url} read (${format}).`,
    httpDown: (url, error) => `HTTP: ${url} failed (${error}).`,
    received: (count, ago) => `${count} values, last measurement ${ago}.`,
  },
  fr: {
    mqttOk: (url, topic) => `MQTT : connecté à ${url}, sujet ${topic}.`,
    mqttDown: (url) => `MQTT : ${url} n'est pas connecté.`,
    mqttSilent: 'Aucun message pour le moment : WeeWX publie-t-il sur ce sujet ?',
    httpOk: (url, format) => `HTTP : ${url} lu (${format}).`,
    httpDown: (url, error) => `HTTP : échec sur ${url} (${error}).`,
    received: (count, ago) => `${count} valeurs, dernière mesure ${ago}.`,
  },
  de: {
    mqttOk: (url, topic) => `MQTT: verbunden mit ${url}, Topic ${topic}.`,
    mqttDown: (url) => `MQTT: ${url} ist nicht verbunden.`,
    mqttSilent: 'Noch keine Nachricht: Veröffentlicht WeeWX in dieses Topic?',
    httpOk: (url, format) => `HTTP: ${url} gelesen (${format}).`,
    httpDown: (url, error) => `HTTP: ${url} fehlgeschlagen (${error}).`,
    received: (count, ago) => `${count} Werte, letzte Messung ${ago}.`,
  },
  es: {
    mqttOk: (url, topic) => `MQTT: conectado a ${url}, tema ${topic}.`,
    mqttDown: (url) => `MQTT: ${url} no está conectado.`,
    mqttSilent: 'Ningún mensaje todavía: ¿publica WeeWX en este tema?',
    httpOk: (url, format) => `HTTP: ${url} leído (${format}).`,
    httpDown: (url, error) => `HTTP: fallo en ${url} (${error}).`,
    received: (count, ago) => `${count} valores, última medición ${ago}.`,
  },
};

export const SUMMARY_TEXT = {
  en: {
    temperature: (t) => `${t} °C`,
    feelsLike: (t) => `feels like ${t} °C`,
    humidity: (h) => `humidity ${h} %`,
    wind: (point, speed) => `wind ${point}${speed} km/h`,
    gusts: (speed) => `gusts ${speed} km/h`,
    raining: 'raining',
    rainToday: (mm) => `${mm} mm of rain today`,
    noData: 'No measurement from the station yet.',
  },
  fr: {
    temperature: (t) => `${t} °C`,
    feelsLike: (t) => `ressenti ${t} °C`,
    humidity: (h) => `humidité ${h} %`,
    wind: (point, speed) => `vent ${point}${speed} km/h`,
    gusts: (speed) => `rafales ${speed} km/h`,
    raining: 'il pleut',
    rainToday: (mm) => `${mm} mm de pluie aujourd'hui`,
    noData: 'Aucune mesure de la station pour le moment.',
  },
  de: {
    temperature: (t) => `${t} °C`,
    feelsLike: (t) => `gefühlt ${t} °C`,
    humidity: (h) => `Luftfeuchtigkeit ${h} %`,
    wind: (point, speed) => `Wind ${point}${speed} km/h`,
    gusts: (speed) => `Böen ${speed} km/h`,
    raining: 'es regnet',
    rainToday: (mm) => `${mm} mm Regen heute`,
    noData: 'Noch keine Messung der Station.',
  },
  es: {
    temperature: (t) => `${t} °C`,
    feelsLike: (t) => `sensación ${t} °C`,
    humidity: (h) => `humedad ${h} %`,
    wind: (point, speed) => `viento ${point}${speed} km/h`,
    gusts: (speed) => `ráfagas ${speed} km/h`,
    raining: 'está lloviendo',
    rainToday: (mm) => `${mm} mm de lluvia hoy`,
    noData: 'Todavía no hay mediciones de la estación.',
  },
};

const LOCALES = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };

export const locale = (language) => LOCALES[language] ?? LOCALES.en;

/** "3 minutes ago", in the language. */
export function relativeTime(seconds, language) {
  const format = new Intl.RelativeTimeFormat(locale(language), { numeric: 'auto' });
  const abs = Math.max(0, seconds);
  if (abs < 60) {
    return format.format(-Math.round(abs), 'second');
  }
  if (abs < 3600) {
    return format.format(-Math.round(abs / 60), 'minute');
  }
  if (abs < 86400) {
    return format.format(-Math.round(abs / 3600), 'hour');
  }
  return format.format(-Math.round(abs / 86400), 'day');
}

/** A number with the decimal separator of the language. */
export function formatNumber(value, language, decimals = 0) {
  return new Intl.NumberFormat(locale(language), {
    maximumFractionDigits: decimals,
    minimumFractionDigits: 0,
  }).format(value);
}

/**
 * The current conditions as one sentence: "12 °C, feels like 10 °C, humidity
 * 80 %, wind SW 15 km/h, gusts 32 km/h, 3.2 mm of rain today."
 * @param {object|null} reading
 * @param {{ rainToday: number|null, raining: boolean|null }} extra
 * @param {string} language
 */
export function conditionsSentence(reading, { rainToday, raining }, language) {
  const text = pick(SUMMARY_TEXT, language);
  if (!reading) {
    return text.noData;
  }
  const n = (value, decimals = 0) => formatNumber(value, language, decimals);
  const parts = [];
  if (reading.temperature !== null) {
    parts.push(text.temperature(n(reading.temperature, 1)));
  }
  if (
    reading.feelsLike !== null &&
    reading.temperature !== null &&
    Math.abs(reading.feelsLike - reading.temperature) >= 1
  ) {
    parts.push(text.feelsLike(n(reading.feelsLike)));
  }
  if (reading.humidity !== null) {
    parts.push(text.humidity(n(reading.humidity)));
  }
  if (reading.windSpeed !== null) {
    const point =
      reading.windDirection === null || reading.windSpeed < 1
        ? ''
        : `${compassPoint(reading.windDirection, language)} `;
    parts.push(text.wind(point, n(reading.windSpeed)));
  }
  if (reading.windGust !== null && reading.windGust >= 1) {
    parts.push(text.gusts(n(reading.windGust)));
  }
  if (raining) {
    parts.push(text.raining);
  }
  if (rainToday !== null && rainToday > 0) {
    parts.push(text.rainToday(n(rainToday, 1)));
  }
  if (parts.length === 0) {
    return text.noData;
  }
  const sentence = parts.join(', ');
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}
