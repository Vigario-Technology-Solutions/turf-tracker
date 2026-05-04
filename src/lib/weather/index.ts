// Server-only barrel — fine for server components / actions to import
// from "@/lib/weather", but client components MUST import the type +
// `compassFromDeg` from "@/lib/weather/types" to avoid pulling the
// "server-only" modules into their bundle.
export { geocodeAddress, type GeocodeResult } from "./geocode";
export { getCachedWeather, summarizeForNotes } from "./nws";
export { compassFromDeg, type WeatherSummary } from "./types";
