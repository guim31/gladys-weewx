# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- The WeeWX station in Gladys, read over MQTT (weewx-mqtt extension, live) or
  from the JSON file of the weewx-json or Belchertown skin over HTTP, or both.
- US, METRIC and METRICWX unit systems, with or without the unit labels of
  weewx-mqtt.
- One device with the features the station measures: temperature, feels like,
  dew point, humidity, indoor temperature and humidity, sea-level and station
  pressure, average wind, gusts, direction, rain intensity, rain today,
  raining, UV index, solar radiation, low battery, last measurement.
- Scene triggers: it starts raining, the rain stops, strong wind gust, station
  silent.
- Scene action "Current conditions": a sentence ready for a message, plus its
  numbers.
- Dashboard widget "WeeWX station".
- "Check the sources" button in the configuration.
- English, French, German and Spanish texts and documentation.
