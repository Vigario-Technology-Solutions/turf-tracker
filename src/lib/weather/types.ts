/**
 * Client-safe types + pure helpers for weather data.
 *
 * Lives in its own module (no `"server-only"`) so client components
 * can import the `WeatherSummary` type and the pure `compassFromDeg`
 * helper without dragging the NWS / geocoder fetch code into the
 * browser bundle. Same split pattern as ./password vs
 * ./password-policy in the auth lib.
 */

export interface WeatherSummary {
  /** Air temperature, °F. */
  tempF: number | null;
  /** Dewpoint, °F. */
  dewpointF: number | null;
  /** Relative humidity, percent. */
  humidityPct: number | null;
  /** Wind speed, mph. */
  windMph: number | null;
  /** Wind direction in degrees (meteorological — from where wind comes). */
  windDirDeg: number | null;
  /** Free-text conditions (e.g. "Partly cloudy"). */
  conditions: string | null;
  /** Observation time, ISO. */
  observedAt: string | null;
  /** Reporting station id (e.g. "KFAT"). */
  stationId: string | null;
  /** Today's high °F (from forecast). */
  todayHighF: number | null;
  /** Today's low °F (from forecast). */
  todayLowF: number | null;
  /** Maximum probability of precipitation, percent, across next 6h forecast periods. */
  precipProbNext6hPct: number | null;
}

/** Compass label for a wind direction in degrees ("NNE", "WSW", …). */
export function compassFromDeg(deg: number | null): string | null {
  if (deg == null) return null;
  const labels = [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
  ];
  return labels[Math.round((deg % 360) / 22.5) % 16];
}
