# WeeWX for Gladys Assistant

A [Gladys Assistant](https://gladysassistant.com) integration for **[WeeWX](https://weewx.com)**,
the free weather station software: the measurements of your station, whatever its brand (Davis,
Fine Offset / Ecowitt, Oregon Scientific, La Crosse, WeatherFlow…), read locally over MQTT or HTTP.

> **Developed without the hardware: feedback welcome.** The integration was tested against WeeWX
> 5.4 and its built-in Simulator driver, with the real messages of weewx-mqtt, weewx-json and
> Belchertown (see `test/fixtures/weewx/`), but not with a real weather station yet. Please open an
> issue with what you see.

## Features

- **Two sources**, either or both:
  - **MQTT** with the [weewx-mqtt](https://github.com/matthewwall/weewx-mqtt) extension
    (`weather/loop`): live, every loop packet;
  - **HTTP**: the JSON file of the [weewx-json](https://github.com/teeks99/weewx-json) skin
    (`weewx.json`, `current_minimal.json`) or of the
    [Belchertown](https://github.com/poblabs/weewx-belchertown) skin (`weewx_data.json`).
- The **US, METRIC and METRICWX** unit systems of WeeWX, with or without the unit labels of
  weewx-mqtt: Gladys receives °C, km/h, hPa, mm and mm/h.
- **One device for the station**, with the features it measures: temperature, feels like, dew
  point, humidity, indoor temperature and humidity, sea-level and station pressure, average wind,
  gusts, direction, rain intensity, rain today, raining, UV index, solar radiation, low battery,
  minutes since the last measurement.
- **Rain today** from `dayRain`, kept up to date between archive records by adding up the loop
  packets, and back to zero at midnight.
- **Scene triggers**: it starts raining (once per episode), the rain stops (after 15 to 120 dry
  minutes), strong wind gust (30 to 120 km/h), station silent (5 to 120 minutes).
- **Scene action**: current conditions, as a ready-made sentence plus its numbers.
- **Dashboard widget**: live tiles and the current conditions.
- **Check the sources** button in the configuration.
- Four languages: English, French, German, Spanish. Read-only, local only: no account, no cloud.

## Requirements

- Gladys 5.1.0 or later.
- WeeWX 4 or 5 reachable from Gladys, with the weewx-mqtt extension and an MQTT broker, or the
  weewx-json or Belchertown skin served over HTTP.

## Installation

In Gladys: **Integrations → Install from GitHub**, with this repository's URL
(`https://github.com/guim31/gladys-weewx`), or from the store once published. Fill in the broker
or the file address in the Configuration tab, click **Check the sources**, then add the station
from the Discovery tab once a first measurement has arrived. The user documentation is in
[`docs/`](docs/en.md) (English, French, German, Spanish).

## Limitations

- Developed and tested with the WeeWX Simulator, not with a real station (see above).
- One WeeWX instance, hence one station, per integration.
- WeeWX extra sensors (`extraTemp1`, soil, leaf, lightning, air quality…) are not read yet.
- The one-value topics of weewx-mqtt are ignored: keep its `aggregate` aggregation.
- Feature names are frozen when the station is added in Gladys.
- Scene filters only test equality: the gust, dry-spell and silence triggers offer fixed thresholds.

## Development

Node.js 22+, ESM, no build step. Runtime dependencies:
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js) and
[`mqtt`](https://github.com/mqttjs/MQTT.js) (MIT); HTTP uses the `fetch` built into Node.

```bash
npm install
npm test              # node --test, on the SDK's fake Gladys, a fake broker and a fake web server
npm run lint
npm run format:check
npx github:GladysAssistant/integration-store .   # store validator
```

```
index.js                  SDK wiring (src/app.js registers the handlers)
src/app.js                handlers: discovery, action, scene action, widget, configuration
src/hub.js                sources, latest reading, throttled states, scene events, clock
src/devices.js            the station device, its features and states
src/rain.js               rain of the day from dayRain and loop packets
src/triggers.js           rain episodes, dry spells, gust thresholds, silences
src/scenes.js             "current conditions" scene action
src/widgets.js            "WeeWX station" dashboard widget
src/i18n.js               every text, in en/fr/de/es
src/weewx/units.js        WeeWX units -> °C, km/h, hPa, mm
src/weewx/parse.js        weewx-mqtt, weewx-json and Belchertown payloads -> readings
src/weewx/mqttSource.js   MQTT client (credentials never logged)
src/weewx/httpSource.js   JSON file reader (basic auth from the URL, Last-Modified fallback)
test/                     node --test; real WeeWX captures in test/fixtures/weewx/
```

`test/gladys-rules.test.js` checks every discovered device against the category/type table
extracted from the Gladys core.

To run the integration outside Gladys:

```bash
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="weewx" \
npm start
```

Releases are made by the **Release** workflow (Actions → Release); never edit the versions by
hand. A hand-pushed `vX.Y.Z` tag also builds the image and the GitHub Release, but then `version`
in `package.json` and in the manifest (with the `docker_image` tag) must be bumped and committed
before tagging. See [`CLAUDE.md`](CLAUDE.md) for the project rules.

## Credits

- [WeeWX](https://github.com/weewx/weewx) by Tom Keffer, Matthew Wall and contributors (GPL-3.0):
  observation names, unit systems and unit groups, the Simulator driver used for the fixtures.
- [weewx-mqtt](https://github.com/matthewwall/weewx-mqtt) by Matthew Wall (GPL-3.0): the packet
  format and unit labels (`outTemp_C`, `rain_cm`…).
- [weewx-json](https://github.com/teeks99/weewx-json) by Tom Kent (GPL-3.0) and
  [Belchertown](https://github.com/poblabs/weewx-belchertown) by Pat O'Brien (GPL-3.0): the JSON
  file formats.
- Cover: the official WeeWX logo (`docs_src/images/logo-weewx.png` of the WeeWX repository,
  GPL-3.0), upscaled.
- No code of these projects is included: the fixtures are their outputs, captured from a simulated
  station.

## Disclaimer

This project is not affiliated with, endorsed or sponsored by the WeeWX project. "WeeWX" is the name
of its owners' software.

## License

[Apache-2.0](LICENSE)
