import { p2o5ToP, k2oToK } from "./conversions";

/**
 * Product application math. All formulas from SPEC §6.4–§6.5.
 *
 * `Nutrient` keys match the Application snapshot columns in the Prisma
 * schema (delivered{N,P,K,Ca,Mg,S,Fe,Mn,Zn,Cu,B,Na}Lb) and the soil
 * test report fields. P and K are always elemental — caller is
 * responsible for converting product label P2O5 / K2O via
 * `productElementalAnalysis()` before passing.
 */

export type Nutrient = "N" | "P" | "K" | "Ca" | "Mg" | "S" | "Fe" | "Mn" | "Zn" | "Cu" | "B" | "Na";

export interface ProductLabel {
  /** N percent. */
  nPct: number;
  /** P2O5 percent (oxide form, as on the label). */
  p2o5Pct: number;
  /** K2O percent (oxide form, as on the label). */
  k2oPct: number;
  /** Calcium percent. */
  caPct: number;
  /** Magnesium percent. */
  mgPct: number;
  /** Sulfur percent. */
  sPct: number;
  /** Sodium percent. */
  naPct: number;
  /** Iron percent. */
  fePct: number;
  /** Manganese percent. */
  mnPct: number;
  /** Zinc percent. */
  znPct: number;
  /** Copper percent. */
  cuPct: number;
  /** Boron percent. */
  bPct: number;
  /** Density (lb / gal) — required for liquid products. */
  densityLbPerGal?: number | null;
}

/** All-elemental percents for a product label — what the math operates on. */
export interface ElementalAnalysis {
  N: number;
  P: number;
  K: number;
  Ca: number;
  Mg: number;
  S: number;
  Fe: number;
  Mn: number;
  Zn: number;
  Cu: number;
  B: number;
  Na: number;
}

export function productElementalAnalysis(label: ProductLabel): ElementalAnalysis {
  return {
    N: label.nPct,
    P: p2o5ToP(label.p2o5Pct),
    K: k2oToK(label.k2oPct),
    Ca: label.caPct,
    Mg: label.mgPct,
    S: label.sPct,
    Fe: label.fePct,
    Mn: label.mnPct,
    Zn: label.znPct,
    Cu: label.cuPct,
    B: label.bPct,
    Na: label.naPct,
  };
}

/**
 * Granular: how much PRODUCT to apply to deliver `targetLbPer1k` of the
 * picked nutrient over `areaSqFt` of ground.
 *
 *   product_lb_per_1k = need_lb_per_1k / (product_pct_X / 100)
 *   total_product_lb  = product_lb_per_1k × area_sq_ft / 1000
 *
 * Throws if the product contains 0% of the requested nutrient — that's
 * a UI-side bug (the picker should never let it happen).
 */
export interface GranularPlan {
  /** lb of product per 1,000 sq ft. */
  productLbPer1k: number;
  /** Total lb of product for the whole area. */
  totalProductLb: number;
  /** Delivered lb of every nutrient at the chosen rate (snapshot for Application row). */
  delivered: ElementalAnalysis;
}

export function planGranular(opts: {
  product: ProductLabel;
  /** Which nutrient the user picked a target rate for. */
  targetNutrient: Nutrient;
  /** lb of that nutrient per 1,000 sq ft. */
  targetLbPer1k: number;
  /** Area being treated. */
  areaSqFt: number;
}): GranularPlan {
  const { product, targetNutrient, targetLbPer1k, areaSqFt } = opts;
  const elemental = productElementalAnalysis(product);
  const pct = elemental[targetNutrient];
  if (pct <= 0) {
    throw new Error(`Product contains 0% ${targetNutrient}; pick a different product or nutrient.`);
  }
  const productLbPer1k = targetLbPer1k / (pct / 100);
  const totalProductLb = (productLbPer1k * areaSqFt) / 1000;
  return {
    productLbPer1k,
    totalProductLb,
    delivered: deliveredForProductLb(elemental, totalProductLb, areaSqFt),
  };
}

/**
 * Liquid: how much PRODUCT (fl oz) to mix into `carrierTotalGal` to
 * deliver `targetLbPer1k` of the picked nutrient over `areaSqFt`.
 *
 *   total_nutrient_lb       = need_lb_per_1k × area_sq_ft / 1000
 *   total_product_lb        = total_nutrient_lb / (pct_X / 100)
 *   total_product_fl_oz     = total_product_lb × 128 / density_lb_per_gal
 *   product_fl_oz_per_gal   = total_product_fl_oz / carrier_total_gal
 *
 * Throws if density is missing (required for liquids) or pct_X is 0.
 *
 * `minCarrierGalPer1k` warns when the spray volume per 1k sq ft is
 * below the manufacturer's minimum (e.g. 1 gal/1k for foliars). Passes
 * the warning back so the UI can suggest doubling carrier; it does not
 * silently inflate the carrier.
 */
export interface LiquidPlan {
  /** Total lb of product needed. */
  totalProductLb: number;
  /** Total fl oz of product needed. */
  totalProductFlOz: number;
  /** fl oz of product per gal of carrier. */
  productFlOzPerGalCarrier: number;
  /** Gal of carrier per 1,000 sq ft (for the foliar-minimum warning). */
  carrierGalPer1k: number;
  /** True if carrierGalPer1k is below `minCarrierGalPer1k` (informational). */
  belowFoliarMinimum: boolean;
  /** Delivered lb of every nutrient (snapshot for Application row). */
  delivered: ElementalAnalysis;
}

export function planLiquid(opts: {
  product: ProductLabel;
  targetNutrient: Nutrient;
  targetLbPer1k: number;
  areaSqFt: number;
  /** Total carrier gallons the user plans to mix. */
  carrierTotalGal: number;
  /** Optional foliar minimum, e.g. 1 gal/1k. Default 1. */
  minCarrierGalPer1k?: number;
}): LiquidPlan {
  const {
    product,
    targetNutrient,
    targetLbPer1k,
    areaSqFt,
    carrierTotalGal,
    minCarrierGalPer1k = 1,
  } = opts;
  if (product.densityLbPerGal == null || product.densityLbPerGal <= 0) {
    throw new Error("Liquid product is missing density (lb/gal); can't convert weight to volume.");
  }
  if (carrierTotalGal <= 0) {
    throw new Error("Carrier volume must be greater than 0 gallons.");
  }
  const elemental = productElementalAnalysis(product);
  const pct = elemental[targetNutrient];
  if (pct <= 0) {
    throw new Error(`Product contains 0% ${targetNutrient}; pick a different product or nutrient.`);
  }

  const totalNutrientLb = (targetLbPer1k * areaSqFt) / 1000;
  const totalProductLb = totalNutrientLb / (pct / 100);
  const totalProductFlOz = (totalProductLb * 128) / product.densityLbPerGal;
  const productFlOzPerGalCarrier = totalProductFlOz / carrierTotalGal;
  const carrierGalPer1k = carrierTotalGal / (areaSqFt / 1000);

  return {
    totalProductLb,
    totalProductFlOz,
    productFlOzPerGalCarrier,
    carrierGalPer1k,
    belowFoliarMinimum: carrierGalPer1k < minCarrierGalPer1k,
    delivered: deliveredForProductLb(elemental, totalProductLb, areaSqFt),
  };
}

/** Pure helper: delivered nutrients for a known total product weight. */
function deliveredForProductLb(
  elemental: ElementalAnalysis,
  totalProductLb: number,
  _areaSqFt: number,
): ElementalAnalysis {
  const factor = totalProductLb / 100;
  return {
    N: elemental.N * factor,
    P: elemental.P * factor,
    K: elemental.K * factor,
    Ca: elemental.Ca * factor,
    Mg: elemental.Mg * factor,
    S: elemental.S * factor,
    Fe: elemental.Fe * factor,
    Mn: elemental.Mn * factor,
    Zn: elemental.Zn * factor,
    Cu: elemental.Cu * factor,
    B: elemental.B * factor,
    Na: elemental.Na * factor,
  };
}

/** Cost per pound of nutrient X delivered, given product packaging info. */
export function costPerLbNutrient(opts: {
  product: ProductLabel;
  pkgSizeLb: number;
  pkgCostUsd: number;
  nutrient: Nutrient;
}): number {
  const elemental = productElementalAnalysis(opts.product);
  const pct = elemental[opts.nutrient];
  if (pct <= 0) return Infinity;
  if (opts.pkgSizeLb <= 0) return Infinity;
  const costPerLbProduct = opts.pkgCostUsd / opts.pkgSizeLb;
  return costPerLbProduct / (pct / 100);
}
