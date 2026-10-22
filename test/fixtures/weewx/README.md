# WeeWX fixtures

Real payloads, captured on 22/10/2026 from WeeWX 5.4.0 (`felddy/weewx` image) running its
built-in **Simulator** driver, with:

- the [weewx-mqtt](https://github.com/matthewwall/weewx-mqtt) extension (GPL-3.0, Matthew Wall),
  `aggregation = aggregate`, read on `weather/loop` from an Eclipse Mosquitto broker:
  - `mqtt-loop-metric.json`: a loop packet, `unit_system = METRIC` (°C, km/h, mbar, cm);
  - `mqtt-archive-metric.json`: an archive record, METRIC, augmented with `dayRain`;
  - `mqtt-loop-metricwx.json`: a loop packet, `unit_system = METRICWX` (°C, m/s, mbar, mm);
  - `mqtt-loop-us-nolabel.json`: a loop packet, `unit_system = US`, `append_units_label = false`;
- the [weewx-json](https://github.com/teeks99/weewx-json) skin (GPL-3.0, Tom Kent), default US
  units: `weewx-json.json` (`weewx.json`) and `weewx-json-minimal.json` (`current_minimal.json`);
- the [Belchertown](https://github.com/poblabs/weewx-belchertown) skin (GPL-3.0, Pat O'Brien),
  default US units: `belchertown.json` (`weewx_data.json`).

The simulated station sits at 0° N, 0° E: no real place nor address. The simulator toggles its
battery statuses at random (`outTempBatteryStatus: "1.0"` in the METRIC loop packet).
