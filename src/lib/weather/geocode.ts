import "server-only";

/**
 * US Census Geocoder — free, no API key, accurate for US civic
 * addresses. Picked over Nominatim because rate limits are looser and
 * we don't need a User-Agent contact line. NWS-only weather coverage
 * is US-only anyway, so coupling the geocode to a US-only service is
 * not a regression.
 *
 * Returns null on any failure (HTTP error, no match, parse error) so
 * callers can fail-soft — geocoding misses shouldn't block a property
 * save.
 *
 * Endpoint:
 *   https://geocoding.geo.census.gov/geocoder/locations/onelineaddress
 *     ?address=...&benchmark=Public_AR_Current&format=json
 */

const ENDPOINT = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";

export interface GeocodeResult {
  lat: number;
  lon: number;
  matchedAddress: string;
}

interface CensusResponse {
  result?: {
    addressMatches?: Array<{
      coordinates?: { x?: number; y?: number };
      matchedAddress?: string;
    }>;
  };
}

export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  const trimmed = address.trim();
  if (trimmed.length === 0) return null;

  const url = new URL(ENDPOINT);
  url.searchParams.set("address", trimmed);
  url.searchParams.set("benchmark", "Public_AR_Current");
  url.searchParams.set("format", "json");

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      // 5s budget — geocode runs inline on property save, so a slow
      // census endpoint shouldn't visibly hang the form.
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as CensusResponse;
    const match = data.result?.addressMatches?.[0];
    if (!match?.coordinates?.x || !match.coordinates.y) return null;
    return {
      // Census returns x = longitude, y = latitude.
      lat: match.coordinates.y,
      lon: match.coordinates.x,
      matchedAddress: match.matchedAddress ?? trimmed,
    };
  } catch {
    return null;
  }
}
