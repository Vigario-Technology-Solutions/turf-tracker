import { ppmToMeqPer100g, EQ_WEIGHT } from "./conversions";

/**
 * Soil-test derivations. Inputs are the values the user types in (ppm
 * cations + optional CEC); outputs feed the UI's "what does this soil
 * actually look like" panel and the rules engine's hard warnings.
 *
 * Three derived values:
 *   - SAR (sodium adsorption ratio) — soil saturated paste extract
 *   - ESP (estimated exchangeable sodium percentage)
 *   - Ca:Mg meq ratio
 *
 * SAR formula (Richards 1954):
 *   SAR = Na_meq / sqrt((Ca_meq + Mg_meq) / 2)
 *
 * ESP from SAR (USDA Handbook 60, when CEC is absent):
 *   ESR = -0.0126 + 0.01475 × SAR
 *   ESP = 100 × ESR / (1 + ESR)
 *
 * If CEC is given AND we treat soil-extracted Na as exchangeable Na,
 * the direct estimate is preferred:
 *   ESP_direct = 100 × Na_meq_per_100g / CEC
 */

export interface SoilCations {
  /** Calcium, ppm. */
  caPpm: number | null | undefined;
  /** Magnesium, ppm. */
  mgPpm: number | null | undefined;
  /** Sodium, ppm. */
  naPpm: number | null | undefined;
  /** CEC, meq/100g. Optional — when present, ESP uses the direct estimate. */
  cecMeq100g?: number | null | undefined;
}

/** Cation amounts in meq/100g (or null if input was missing). */
export function cationsInMeq(input: SoilCations): {
  ca: number | null;
  mg: number | null;
  na: number | null;
} {
  return {
    ca: input.caPpm == null ? null : ppmToMeqPer100g(input.caPpm, "Ca"),
    mg: input.mgPpm == null ? null : ppmToMeqPer100g(input.mgPpm, "Mg"),
    na: input.naPpm == null ? null : ppmToMeqPer100g(input.naPpm, "Na"),
  };
}

/**
 * Sodium Adsorption Ratio. Returns null if any of Ca / Mg / Na is
 * missing, or if Ca + Mg is zero (avoid divide-by-zero).
 */
export function sar(input: SoilCations): number | null {
  const { ca, mg, na } = cationsInMeq(input);
  if (ca == null || mg == null || na == null) return null;
  const denom = (ca + mg) / 2;
  if (denom <= 0) return null;
  return na / Math.sqrt(denom);
}

/**
 * Calcium-to-magnesium ratio, in meq. Returns null if either is
 * missing or Mg is zero. The agronomically meaningful number — the
 * ppm-based ratio is misleading because Ca and Mg have very different
 * equivalent weights.
 */
export function caMgRatio(input: SoilCations): number | null {
  const { ca, mg } = cationsInMeq(input);
  if (ca == null || mg == null || mg <= 0) return null;
  return ca / mg;
}

/**
 * Estimated Exchangeable Sodium Percentage.
 *   - With CEC: direct (100 × Na_meq / CEC).
 *   - Without CEC: from SAR via the USDA Handbook 60 fit.
 * Returns null if neither path can be computed.
 */
export function esp(input: SoilCations): number | null {
  if (input.cecMeq100g != null && input.cecMeq100g > 0 && input.naPpm != null) {
    const naMeq = ppmToMeqPer100g(input.naPpm, "Na");
    return (100 * naMeq) / input.cecMeq100g;
  }

  const sarValue = sar(input);
  if (sarValue == null) return null;
  const esr = -0.0126 + 0.01475 * sarValue;
  if (esr <= 0) return 0;
  return (100 * esr) / (1 + esr);
}

/**
 * Pounds of Na deposited per inch of irrigation per 1k sq ft, given
 * the source water's Na in ppm.
 *
 * Derivation: 1 inch over 1,000 sq ft = 623.4 gal × 3.785 L/gal =
 * 2,360 L. At 1 mg/L = 2,360 mg = 0.0052 lb. So
 *   lb Na / (inch × 1k sq ft) = ppm × 2360 / 453,592 = ppm × 0.0052
 * which is the constant in SPEC §6.3. Linear in concentration.
 */
export const NA_LB_PER_INCH_PER_1K_PER_PPM = 0.0052;

export function naLbPerInchPer1k(waterNaPpm: number): number {
  return waterNaPpm * NA_LB_PER_INCH_PER_1K_PER_PPM;
}

/**
 * Total Na deposited by a single irrigation event over an area.
 *   inches × (areaSqFt / 1000) × ppm × 0.0052
 */
export function naLbDeposited(opts: {
  inchesApplied: number;
  areaSqFt: number;
  waterNaPpm: number;
}): number {
  const { inchesApplied, areaSqFt, waterNaPpm } = opts;
  return inchesApplied * (areaSqFt / 1000) * naLbPerInchPer1k(waterNaPpm);
}

/**
 * Inches applied during a sprinkler run, given runtime + precip rate.
 *   inches = runtime_min / 60 × precip_in_per_hr
 */
export function inchesAppliedFromRuntime(opts: {
  runtimeMin: number;
  precipRateInPerHr: number;
}): number {
  return (opts.runtimeMin / 60) * opts.precipRateInPerHr;
}

/**
 * Sprinkler runtime needed to apply a target depth.
 *   runtime_min = (target_inches / precip_rate) × 60
 * Returns Infinity if precip rate is zero/negative — caller must guard.
 */
export function runtimeMinForInches(opts: {
  targetInches: number;
  precipRateInPerHr: number;
}): number {
  if (opts.precipRateInPerHr <= 0) return Infinity;
  return (opts.targetInches / opts.precipRateInPerHr) * 60;
}

/** Inches of water = gallons / area / 0.6234. (1 in over 1k sq ft = 623.4 gal.) */
export const GAL_PER_INCH_PER_1K = 623.4;

export function gallonsForInches(opts: { inches: number; areaSqFt: number }): number {
  return opts.inches * (opts.areaSqFt / 1000) * GAL_PER_INCH_PER_1K;
}

// Re-export the conversion constant so consumers using only soil.ts
// don't need a second import for the eq weights when reasoning about
// non-Na cations.
export { EQ_WEIGHT };
