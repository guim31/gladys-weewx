// -----------------------------------------------------------------------------
// The rain of the day, from whatever the source gives.
//
// WeeWX knows the rain of the day (`dayRain`), but only some messages carry
// it: the archive records of weewx-mqtt (augmented from its database) and the
// JSON skins do; the loop packets of weewx-mqtt do not, they only carry the
// rain since the previous packet (`rain`). So:
//   - a `dayRain` value is the truth, at its time;
//   - the loop packets after it add their rain on top;
//   - at local midnight the day starts again from zero, which is exact.
// Loop packets alone, after a restart, cannot know the rain fallen earlier in
// the day: the value stays unknown until midnight (or a `dayRain` value)
// rather than wrong.
// -----------------------------------------------------------------------------

// Loop packets kept to replay those newer than a late `dayRain` value: the
// archive record of weewx-mqtt is published a few seconds after its time,
// once some loop packets of the next interval have arrived.
const KEEP_MS = 2 * 60 * 60 * 1000;

/** The local day of a time, in the container's time zone (Gladys injects TZ). */
export function localDay(ms) {
  const date = new Date(ms);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

export function createDayRain({ dayOf = localDay } = {}) {
  let day = null;
  let base = null;
  let baseTime = null;
  /** Loop packets: { time, rain } */
  let packets = [];
  let latest = 0;

  const extra = () =>
    packets
      .filter(
        (packet) => (baseTime === null || packet.time > baseTime) && dayOf(packet.time - 1) === day,
      )
      .reduce((sum, packet) => sum + packet.rain, 0);

  return {
    /** @param {object} reading */
    update(reading) {
      if (reading.time === null) {
        return;
      }
      // WeeWX dates a record by the end of its interval: the one of 00:00
      // closes the previous day.
      const readingDay = dayOf(reading.time - 1);
      const newest = reading.time >= latest;
      latest = Math.max(latest, reading.time);
      if (reading.rainToday !== null) {
        // An older day's total (a late record) says nothing about today.
        if (day === null || readingDay === day || newest) {
          day = readingDay;
          base = reading.rainToday;
          baseTime = reading.time;
        }
        return;
      }
      if (reading.archive || reading.rainInterval === null) {
        return;
      }
      if (day !== readingDay) {
        if (!newest) {
          return;
        }
        // The first packet ever: the day started before us, its total is
        // unknown. A new day: it starts at zero.
        base = day === null ? null : 0;
        baseTime = day === null ? null : 0;
        day = readingDay;
      }
      packets.push({ time: reading.time, rain: reading.rainInterval });
      packets = packets.filter((packet) => packet.time > reading.time - KEEP_MS);
    },

    /**
     * The rain of the day in mm, or null when unknown.
     * @param {number} now ms
     */
    value(now) {
      if (day === null) {
        return null;
      }
      if (dayOf(now) !== day) {
        // Midnight passed and nothing since: a new day, nothing fallen yet
        // that the source told.
        return base === null ? null : 0;
      }
      return base === null ? null : base + extra();
    },
  };
}
