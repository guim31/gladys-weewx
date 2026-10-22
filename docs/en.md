# WeeWX

Brings your **WeeWX** weather station into Gladys, whatever its brand (Davis, Fine Offset / Ecowitt,
Oregon Scientific, La Crosse, WeatherFlow…): temperature, humidity, pressure, wind, rain, UV,
solar radiation and more, as WeeWX measures them.

> Developed without the hardware: this integration was tested against WeeWX 5.4 and its built-in
> Simulator driver, with the real messages of weewx-mqtt, weewx-json and Belchertown, but not yet
> with a real station. Feedback is welcome on the GitHub repository.

This integration is not affiliated with the WeeWX project.

## Overview

[WeeWX](https://weewx.com) is the free software that reads a weather station and archives its
measurements. This integration reads WeeWX from one of two sources, or both:

- **MQTT**, with the [weewx-mqtt](https://github.com/matthewwall/weewx-mqtt) extension: live, a
  measurement every few seconds (recommended);
- **HTTP**, the JSON file of a WeeWX skin: [weewx-json](https://github.com/teeks99/weewx-json)
  (`weewx.json` or `current_minimal.json`) or
  [Belchertown](https://github.com/poblabs/weewx-belchertown) (`weewx_data.json`), rewritten by
  WeeWX at each report (every 5 minutes by default).

You get one Gladys device for the station, four scene triggers, one scene action and one dashboard
widget. Everything is read-only and stays on your local network: no account, no cloud.

The US, METRIC and METRICWX unit systems of WeeWX are all supported: Gladys receives °C, km/h, hPa
and mm, and converts them to your own preferences where it can.

## Requirements

- Gladys 5.1 or newer.
- WeeWX 4 or 5, reachable from Gladys over the network.
- For MQTT: an MQTT broker (Mosquitto, or the one of Gladys) and the weewx-mqtt extension.
- For HTTP: a web server serving the WeeWX `public_html` folder and the weewx-json or Belchertown
  skin.

### Setting up weewx-mqtt

Install the extension, then point it at your broker in `weewx.conf`:

```ini
[StdRESTful]
    [[MQTT]]
        server_url = mqtt://user:password@192.0.2.10:1883/
        topic = weather
        unit_system = METRIC
        binding = archive, loop
        aggregation = aggregate
```

`binding = loop` sends every loop packet (every 2 to 5 seconds, depending on the station),
`archive` every archive record. Keep both for live values and an exact rain of the day. weewx-mqtt
publishes its JSON packets on the `topic` followed by `/loop`: `weather/loop` here.

### Setting up a JSON skin

Install weewx-json (or Belchertown) and note the address of its file, for example
`http://192.0.2.10/weewx/json/weewx.json` or `http://192.0.2.10/weewx/belchertown/json/weewx_data.json`.
Open it in a browser first: you should see JSON, not an error page.

## Configuration

In Gladys, open **Integrations → WeeWX → Configuration**:

| Field                     | What to enter                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| MQTT broker               | `mqtt://address:1883` (or `mqtts://` with TLS). Empty: HTTP only.                                 |
| MQTT user name / password | Only if the broker requires them.                                                                 |
| MQTT topic                | `weather/loop` by default: the `topic` of weewx-mqtt followed by `/loop`. Wildcards are accepted. |
| JSON file address         | The address of `weewx.json`, `current_minimal.json` or `weewx_data.json`. Empty: MQTT only.       |
| File reading interval (s) | 60 by default, 15 at least. WeeWX rewrites the file once per archive interval.                    |
| Language of the texts     | Feature names (set when the station is added), scene sentence and action messages.                |

Save, then click **Check the sources**: it tells whether the broker and the file answer and how many
values WeeWX sent last. Once a first measurement has arrived, open the **Discovery** tab and add the
station.

## The station device

The station only gets the features it measures: a value WeeWX never sent does not appear. A sensor
added later (a UV sensor, say) appears in the Discovery tab, which then offers to update the device.

| Feature                   | Unit   | WeeWX source                                                 |
| ------------------------- | ------ | ------------------------------------------------------------ |
| Temperature               | °C     | `outTemp`                                                    |
| Feels like                | °C     | `appTemp`, else heat index or wind chill                     |
| Dew point                 | °C     | `dewpoint`                                                   |
| Humidity                  | %      | `outHumidity`                                                |
| Indoor temperature        | °C     | `inTemp` (console)                                           |
| Indoor humidity           | %      | `inHumidity` (console)                                       |
| Sea-level pressure        | hPa    | `barometer`                                                  |
| Station pressure          | hPa    | `pressure` (MQTT only)                                       |
| Average wind / Wind gusts | km/h   | `windSpeed`, `windGust`                                      |
| Wind direction            | °      | `windDir`                                                    |
| Rain intensity            | mm/h   | `rainRate`                                                   |
| Rain today                | mm     | `dayRain`, or the loop packets added up since midnight       |
| Raining                   | yes/no | rain rate above zero, or rain since the previous measurement |
| UV index                  |        | `UV`                                                         |
| Solar radiation (W/m²)    |        | `radiation`                                                  |
| Low battery               | yes/no | any `…BatteryStatus` other than 0 (MQTT only)                |
| Last measurement          | min    | minutes since the integration received a new measurement     |

The **Last measurement** feature counts by the clock of Gladys, not by the one of WeeWX: a WeeWX
clock running late or early does not matter.

## Widget

**WeeWX station** shows the current conditions: live tiles (temperature, humidity, wind, rain today,
pressure, those the station measures), then the feels-like temperature, the wind with its direction
and gusts, the rain, the UV index, the indoor console and a low battery, and how long ago the last
measurement arrived. Values follow your metric or imperial preference.

## Scene triggers

- **It starts raining**: the station measures rain after at least 30 minutes without any. Once per
  rain episode, whatever the showers in between. Variable: station name.
- **The rain stops**: no rain for the chosen time (15, 30, 60 or 120 minutes) after rain. Once per
  dry spell. Variables: rain today (mm), station name.
- **Strong wind gust**: a gust above the chosen speed (30 to 120 km/h), the first one for 30
  minutes. Variables: gust (km/h), station name.
- **Station silent**: no new measurement for the chosen time (5 to 120 minutes): WeeWX, the station
  or the network is down. Once per silence. Variables: minutes without measurement, station name.

After a restart of the integration, the first measurement is a reference: rain already falling or a
strong wind already blowing fires nothing.

## Scene action

**Current conditions** returns the latest measurements as a sentence ready for a message — for
example `12.4 °C, feels like 10 °C, humidity 81 %, wind SW 15 km/h, gusts 32 km/h.` — and as
numbers: temperature, humidity, average wind, gusts, rain today, raining, minutes since the
measurement. The sentence follows the language of the configuration.

## Scene examples

- _Morning message_: at 7:00, **Current conditions**, then send a message
  `Weather at home: {{summary}}`.
- _Close the awning_: **Strong wind gust** above 50 km/h → close the awning and send a message with
  the gust.
- _Laundry outside_: **It starts raining** → send a message "bring the laundry in".
- _Watering_: **The rain stops** after 120 minutes, with the condition "Rain today below 2 mm" →
  start the watering.
- _Station watch_: **Station silent** for 60 minutes → send a message.

## Refresh and data use

- MQTT: every packet is read as it arrives (a few seconds apart), but the states are sent to Gladys
  at most every 15 seconds, and only those that changed. The triggers see every packet.
- HTTP: the file is read at the chosen interval; WeeWX rewrites it once per archive interval, so the
  values move every 5 minutes or so.
- A value that does not change is sent again every 6 hours, so that Gladys never shows it as
  outdated.
- Nothing leaves your local network.

## Troubleshooting

- **No station in the Discovery tab**: no measurement arrived yet. Click **Check the sources**.
- **"The MQTT broker refused the connection"**: wrong user name or password.
- **"The MQTT broker cannot be reached"**: wrong address or port, or the broker is stopped. Gladys
  runs the integration in a container: `localhost` is the container itself, use the address of the
  machine instead.
- **Connected, but "no message yet"**: weewx-mqtt publishes elsewhere. Check its `topic` (and the
  `/loop` suffix) with an MQTT client such as MQTT Explorer.
- **"The file is not one of the supported WeeWX formats"**: the address shows another file (an HTML
  page, the `day.json` of Belchertown…). Use `weewx.json`, `current_minimal.json` or
  `weewx_data.json`.
- **Rain today missing over MQTT**: weewx-mqtt only adds `dayRain` when `augment_record` is on (the
  default). With loop packets only and no `dayRain`, the integration adds up the rain itself from
  the next midnight.
- **Station silent fires too often over HTTP**: the file is only rewritten every archive interval;
  pick a duration well above it (15 minutes or more for the default 5-minute interval).
- **Logs**: set `LOG_LEVEL=debug` on the container for the details of each cycle.

## Limits

- One WeeWX instance, hence one station, per integration.
- WeeWX extra sensors (`extraTemp1`, soil, leaf, lightning, air quality…) are not read yet.
- The weewx-json and Belchertown files carry fewer values than MQTT: no station pressure, no
  battery, and no UV or radiation with weewx-json.
- The one-value topics of weewx-mqtt (`weather/outTemp_C`…) are ignored: keep the `aggregate`
  aggregation.
- Developed and tested with the WeeWX Simulator driver, not with a real station.
