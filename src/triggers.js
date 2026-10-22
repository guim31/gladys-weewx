// -----------------------------------------------------------------------------
// The scene triggers, as transitions.
//
// Scene filters only compare for equality (a threshold belongs to a device
// feature), so a trigger with a threshold fires once per threshold crossed,
// and the scene author picks one (required filter): a 65 km/h gust fires
// `above_kmh: "30"`, `"40"`, `"50"` and `"60"`.
//
// `rain_started` — the first sign of rain after 30 minutes without any. The
// "Raining" feature flaps between two showers: a scene bound to it would run
// at every lull, this trigger runs once per rain episode.
// `rain_stopped` — no rain for N minutes after rain: once per dry spell and
// per threshold.
// `gust_above` — a gust above N km/h, the first one for 30 minutes.
// `station_silent` — no new measurement for N minutes: once per silence and
// per threshold.
//
// After a restart, the first reading is a baseline: rain already falling or a
// gust already strong fires nothing (it would re-run every scene).
// -----------------------------------------------------------------------------

export const TRIGGER = {
  RAIN_STARTED: 'rain_started',
  RAIN_STOPPED: 'rain_stopped',
  GUST_ABOVE: 'gust_above',
  STATION_SILENT: 'station_silent',
};

export const QUIET_PERIOD_MS = 30 * 60 * 1000;

// Thresholds offered to the scene author.
export const DRY_MINUTES = [15, 30, 60, 120];
export const GUST_THRESHOLDS_KMH = [30, 40, 50, 60, 70, 80, 90, 100, 120];
export const SILENT_MINUTES = [5, 10, 15, 30, 60, 120];

const MINUTE = 60 * 1000;

/**
 * @param {object} options
 * @param {() => number} [options.now]
 */
export function createTriggerTracker({ now = () => Date.now() } = {}) {
  let baseline = false;
  let lastRainAt = null;
  // Dry thresholds already fired since the last rain.
  let dryFired = new Set();
  const lastGustAt = new Map();
  let lastDataAt = now();
  let silentFired = new Set();

  return {
    /**
     * A new measurement.
     * @param {{ raining: boolean|null, gust: number|null }} observation gust in km/h
     * @returns {{ rainStarted: boolean, gusts: number[] }}
     */
    onObservation({ raining, gust }) {
      const at = now();
      lastDataAt = at;
      silentFired = new Set();
      if (!baseline) {
        baseline = true;
        if (raining) {
          lastRainAt = at;
        }
        for (const threshold of GUST_THRESHOLDS_KMH) {
          if (gust !== null && gust > threshold) {
            lastGustAt.set(threshold, at);
          }
        }
        return { rainStarted: false, gusts: [] };
      }
      let rainStarted = false;
      if (raining) {
        rainStarted = lastRainAt === null || at - lastRainAt >= QUIET_PERIOD_MS;
        lastRainAt = at;
        dryFired = new Set();
      }
      const gusts = [];
      if (gust !== null) {
        for (const threshold of GUST_THRESHOLDS_KMH) {
          if (gust <= threshold) {
            continue;
          }
          const last = lastGustAt.get(threshold);
          lastGustAt.set(threshold, at);
          if (last === undefined || at - last >= QUIET_PERIOD_MS) {
            gusts.push(threshold);
          }
        }
      }
      return { rainStarted, gusts };
    },

    /**
     * The clock ticked (once a minute): dry spells and silences.
     * @returns {{ dry: number[], silent: number[], silentMinutes: number }}
     */
    onTick() {
      const at = now();
      const dry = [];
      if (lastRainAt !== null) {
        for (const minutes of DRY_MINUTES) {
          if (!dryFired.has(minutes) && at - lastRainAt >= minutes * MINUTE) {
            dryFired.add(minutes);
            dry.push(minutes);
          }
        }
      }
      const silentMinutes = Math.floor((at - lastDataAt) / MINUTE);
      const silent = [];
      for (const minutes of SILENT_MINUTES) {
        if (!silentFired.has(minutes) && at - lastDataAt >= minutes * MINUTE) {
          silentFired.add(minutes);
          silent.push(minutes);
        }
      }
      return { dry, silent, silentMinutes };
    },

    /** Minutes since the last measurement (or since the start). */
    silentMinutes() {
      return Math.floor((now() - lastDataAt) / MINUTE);
    },

    /** Restart the silence count (new configuration). */
    resetSilence() {
      lastDataAt = now();
      silentFired = new Set();
    },
  };
}
