import "server-only";
import { unstable_cache } from "next/cache";
import { compassFromDeg, type WeatherSummary } from "./types";

/**
 * NWS (api.weather.gov) client. Free, no API key, US-only. NWS asks
 * every consumer to identify itself in a User-Agent header so they can
 * contact misbehaving clients.
 *
 * Two-step lookup:
 *   1. /points/{lat},{lon}     → gridpoint + station list URL
 *   2. /stations/{id}/observations/latest → current conditions
 *      /gridpoints/{office}/{x},{y}/forecast → today's high/low + precip prob
 *
 * Cached at 10-minute granularity, keyed on rounded lat/lon — small
 * coordinate jitter from rerunning a geocode shouldn't bust the cache.
 *
 * Returns null on any failure so the apply-flow can fall back to
 * manual entry. Don't throw — this runs in render.
 *
 * `WeatherSummary` lives in ./types so client components can use the
 * shape without dragging this file into the browser bundle.
 */

const USER_AGENT =
  "turf-tracker (https://github.com/Vigario-Technology-Solutions/turf-tracker, contact: tylervigario90@gmail.com)";

export type { WeatherSummary } from "./types";

interface PointsResponse {
  properties?: {
    observationStations?: string;
    forecast?: string;
    gridId?: string;
    gridX?: number;
    gridY?: number;
    relativeLocation?: { properties?: { city?: string; state?: string } };
  };
}

interface StationsResponse {
  features?: Array<{ properties?: { stationIdentifier?: string } }>;
}

interface ObservationResponse {
  properties?: {
    timestamp?: string;
    temperature?: { value: number | null; unitCode?: string };
    dewpoint?: { value: number | null; unitCode?: string };
    relativeHumidity?: { value: number | null };
    windSpeed?: { value: number | null; unitCode?: string };
    windDirection?: { value: number | null };
    textDescription?: string;
  };
}

interface ForecastResponse {
  properties?: {
    periods?: Array<{
      number: number;
      isDaytime: boolean;
      temperature: number;
      temperatureUnit: string;
      probabilityOfPrecipitation?: { value: number | null };
      shortForecast?: string;
    }>;
  };
}

/**
 * Round coordinates to 3 decimals (~111m) before keying the cache.
 * Two geocode runs of the same address can produce micro-jitter that
 * would otherwise miss the cache.
 */
function cacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(3)},${lon.toFixed(3)}`;
}

async function nwsFetch(url: string): Promise<unknown> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/geo+json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function celsiusToF(c: number | null | undefined): number | null {
  if (c == null) return null;
  return Math.round((c * 9) / 5 + 32);
}

function kmhToMph(kmh: number | null | undefined): number | null {
  if (kmh == null) return null;
  return Math.round(kmh / 1.609);
}

async function loadWeather(lat: number, lon: number): Promise<WeatherSummary | null> {
  const points = (await nwsFetch(
    `https://api.weather.gov/points/${lat},${lon}`,
  )) as PointsResponse | null;
  if (!points?.properties?.observationStations || !points.properties.forecast) return null;

  // Run station lookup + forecast in parallel — independent endpoints.
  const [stations, forecast] = await Promise.all([
    nwsFetch(points.properties.observationStations) as Promise<StationsResponse | null>,
    nwsFetch(points.properties.forecast) as Promise<ForecastResponse | null>,
  ]);

  const stationId = stations?.features?.[0]?.properties?.stationIdentifier ?? null;
  const observation = stationId
    ? ((await nwsFetch(
        `https://api.weather.gov/stations/${stationId}/observations/latest`,
      )) as ObservationResponse | null)
    : null;

  const obsProps = observation?.properties;

  const tempF = celsiusToF(obsProps?.temperature?.value);
  const dewpointF = celsiusToF(obsProps?.dewpoint?.value);
  const humidityPct =
    obsProps?.relativeHumidity?.value != null ? Math.round(obsProps.relativeHumidity.value) : null;
  const windMph = kmhToMph(obsProps?.windSpeed?.value);
  const windDirDeg =
    obsProps?.windDirection?.value != null ? Math.round(obsProps.windDirection.value) : null;

  // Forecast periods 1+2 are usually "today" + "tonight" (or "this afternoon" etc).
  // Walk the first 4 periods (~next 24h) for high / low / max precip prob.
  const periods = forecast?.properties?.periods ?? [];
  let todayHighF: number | null = null;
  let todayLowF: number | null = null;
  let precipProbNext6hPct: number | null = null;
  for (const p of periods.slice(0, 4)) {
    const tF = p.temperatureUnit === "F" ? p.temperature : celsiusToF(p.temperature);
    if (tF != null) {
      if (p.isDaytime) {
        todayHighF = todayHighF == null ? tF : Math.max(todayHighF, tF);
      } else {
        todayLowF = todayLowF == null ? tF : Math.min(todayLowF, tF);
      }
    }
  }
  // Next ~6h ≈ first period (NWS hourly periods are 1h, but /forecast
  // periods are 6-12h). Use just the first period for the precip prob.
  const firstPrecip = periods[0]?.probabilityOfPrecipitation?.value;
  if (firstPrecip != null) precipProbNext6hPct = Math.round(firstPrecip);

  return {
    tempF,
    dewpointF,
    humidityPct,
    windMph,
    windDirDeg,
    conditions: obsProps?.textDescription ?? periods[0]?.shortForecast ?? null,
    observedAt: obsProps?.timestamp ?? null,
    stationId,
    todayHighF,
    todayLowF,
    precipProbNext6hPct,
  };
}

/**
 * Cached entry point. Tag is `weather:<key>` so individual cells can
 * be invalidated; revalidate window is 10 minutes.
 *
 * `unstable_cache` round-trips through structured clone — `WeatherSummary`
 * is intentionally a flat record of primitives so the wrapper survives
 * (the `LookupMap` bug from earlier in this branch).
 */
export async function getCachedWeather(lat: number, lon: number): Promise<WeatherSummary | null> {
  const key = cacheKey(lat, lon);
  const cached = unstable_cache(() => loadWeather(lat, lon), ["weather", key], {
    revalidate: 600,
    tags: [`weather:${key}`],
  });
  return cached();
}

/** One-line summary suitable for stuffing into Application.weatherNotes. */
export function summarizeForNotes(w: WeatherSummary): string {
  const bits: string[] = [];
  if (w.conditions) bits.push(w.conditions);
  if (w.humidityPct != null) bits.push(`${w.humidityPct}% RH`);
  if (w.windMph != null) {
    const dir = compassFromDeg(w.windDirDeg);
    bits.push(`wind ${w.windMph} mph${dir ? " " + dir : ""}`);
  }
  if (w.precipProbNext6hPct != null && w.precipProbNext6hPct > 0) {
    bits.push(`${w.precipProbNext6hPct}% precip soon`);
  }
  return bits.join(" · ");
}
