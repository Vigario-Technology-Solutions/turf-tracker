/**
 * Nutrient unit conversions. Soil tests report cations as elemental
 * (Ca, Mg, Na, K) in ppm; product labels report P + K as oxides
 * (P2O5, K2O) in percent. We always normalize to elemental internally.
 *
 * Equivalent weights are atomic mass / valence:
 *   Ca = 40.08 / 2 = 20.04
 *   Mg = 24.31 / 2 = 12.155
 *   Na = 22.99 / 1 = 22.99
 *   K  = 39.10 / 1 = 39.10
 *
 * For converting soil test ppm (mg/kg) → meq/100g:
 *   meq/100g = ppm / (eq weight × 10)
 * For converting saturated-paste extract ppm (mg/L) → meq/L:
 *   meq/L = ppm / eq weight
 *
 * Conversion ratios for oxide ↔ elemental:
 *   P  = P2O5 × 0.4364   (61.94 / 141.94)
 *   K  = K2O  × 0.8302   (78.20 /  94.20)
 */

/** Ratio P / P2O5 (elemental P per unit of P2O5). */
export const P_PER_P2O5 = 0.4364;
/** Ratio K / K2O (elemental K per unit of K2O). */
export const K_PER_K2O = 0.8302;

export const EQ_WEIGHT = {
  Ca: 20.04,
  Mg: 12.155,
  Na: 22.99,
  K: 39.1,
} as const;

export type Cation = keyof typeof EQ_WEIGHT;

/** P2O5 percent → elemental P percent. */
export function p2o5ToP(pct: number): number {
  return pct * P_PER_P2O5;
}

/** K2O percent → elemental K percent. */
export function k2oToK(pct: number): number {
  return pct * K_PER_K2O;
}

/** Soil test ppm (mg/kg) → meq/100g for the named cation. */
export function ppmToMeqPer100g(ppm: number, cation: Cation): number {
  return ppm / (EQ_WEIGHT[cation] * 10);
}

/** Saturated-paste / water-test ppm (mg/L) → meq/L for the named cation. */
export function ppmToMeqPerL(ppm: number, cation: Cation): number {
  return ppm / EQ_WEIGHT[cation];
}
