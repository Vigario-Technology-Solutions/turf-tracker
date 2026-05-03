import { describe, expect, it } from "vitest";
import {
  costPerLbNutrient,
  planGranular,
  planLiquid,
  productElementalAnalysis,
  type ProductLabel,
} from "./product-math";

const ZEROS = {
  caPct: 0,
  mgPct: 0,
  sPct: 0,
  naPct: 0,
  fePct: 0,
  mnPct: 0,
  znPct: 0,
  cuPct: 0,
  bPct: 0,
};

describe("productElementalAnalysis", () => {
  it("16-4-8 → N=16, P≈1.745, K≈6.642", () => {
    const product: ProductLabel = { nPct: 16, p2o5Pct: 4, k2oPct: 8, ...ZEROS };
    const elem = productElementalAnalysis(product);
    expect(elem.N).toBe(16);
    expect(elem.P).toBeCloseTo(1.7456, 3);
    expect(elem.K).toBeCloseTo(6.6416, 3);
  });
});

describe("planGranular", () => {
  // K-Mag (langbeinite, 0-0-22 + 11 Mg + 22 S):
  //   K2O = 22% → K = 22 * 0.8302 = 18.27%
  //   To deliver 0.5 lb K / 1k:
  //     product_lb_per_1k = 0.5 / 0.1827 = 2.737 lb / 1k
  //     total_product_lb  = 2.737 × 3318/1000 = 9.080 lb
  //   Delivered breakdown for total = 9.080 lb:
  //     K  = 9.080 × 0.1827 = 1.659 lb
  //     Mg = 9.080 × 0.11   = 0.999 lb
  //     S  = 9.080 × 0.22   = 1.997 lb
  it("K-Mag delivers expected K + Mg + S to a 3,318 sq ft lawn at 0.5 lb K / 1k", () => {
    const product: ProductLabel = {
      nPct: 0,
      p2o5Pct: 0,
      k2oPct: 22,
      caPct: 0,
      mgPct: 11,
      sPct: 22,
      naPct: 0,
      fePct: 0,
      mnPct: 0,
      znPct: 0,
      cuPct: 0,
      bPct: 0,
    };
    const plan = planGranular({
      product,
      targetNutrient: "K",
      targetLbPer1k: 0.5,
      areaSqFt: 3318,
    });
    expect(plan.productLbPer1k).toBeCloseTo(2.737, 2);
    expect(plan.totalProductLb).toBeCloseTo(9.08, 1);
    expect(plan.delivered.K).toBeCloseTo(1.659, 2);
    expect(plan.delivered.Mg).toBeCloseTo(0.999, 2);
    expect(plan.delivered.S).toBeCloseTo(1.997, 2);
    expect(plan.delivered.P).toBe(0);
    expect(plan.delivered.Na).toBe(0);
  });

  it("throws when product has 0% of the target nutrient", () => {
    const product: ProductLabel = { nPct: 0, p2o5Pct: 0, k2oPct: 22, ...ZEROS };
    expect(() =>
      planGranular({ product, targetNutrient: "N", targetLbPer1k: 0.5, areaSqFt: 1000 }),
    ).toThrow(/contains 0% N/);
  });
});

describe("planLiquid", () => {
  // SLS 30-0-10 liquid example from SPEC §7.1:
  //   N = 30%, K2O = 10% → K = 8.302%
  //   density = 11.4 lb/gal (typical for high-N water-soluble)
  //   target = 0.4 lb N / 1k over 3,318 sq ft into 2 gal carrier
  //   total_N = 0.4 × 3.318 = 1.327 lb
  //   total_product_lb = 1.327 / 0.30 = 4.424 lb
  //   total_product_fl_oz = 4.424 × 128 / 11.4 ≈ 49.67 fl oz
  //   per_gal = 49.67 / 2 ≈ 24.83 fl oz/gal
  //   carrierGalPer1k = 2 / 3.318 ≈ 0.603 → BELOW 1 gal/1k foliar minimum
  it("SLS 30-0-10 mixes correctly + flags below-minimum carrier", () => {
    const product: ProductLabel = {
      nPct: 30,
      p2o5Pct: 0,
      k2oPct: 10,
      caPct: 0,
      mgPct: 0,
      sPct: 0,
      naPct: 0,
      fePct: 0,
      mnPct: 0,
      znPct: 0,
      cuPct: 0,
      bPct: 0,
      densityLbPerGal: 11.4,
    };
    const plan = planLiquid({
      product,
      targetNutrient: "N",
      targetLbPer1k: 0.4,
      areaSqFt: 3318,
      carrierTotalGal: 2,
    });
    expect(plan.totalProductLb).toBeCloseTo(4.424, 2);
    expect(plan.totalProductFlOz).toBeCloseTo(49.67, 1);
    expect(plan.productFlOzPerGalCarrier).toBeCloseTo(24.83, 1);
    expect(plan.belowFoliarMinimum).toBe(true);
    // Delivered N should match the target (within tiny float drift)
    expect(plan.delivered.N).toBeCloseTo(1.327, 2);
    expect(plan.delivered.K).toBeCloseTo(plan.totalProductLb * 0.08302, 3);
  });

  it("throws on missing density / zero carrier / 0% nutrient", () => {
    const noDensity: ProductLabel = { nPct: 30, p2o5Pct: 0, k2oPct: 10, ...ZEROS };
    expect(() =>
      planLiquid({
        product: noDensity,
        targetNutrient: "N",
        targetLbPer1k: 0.4,
        areaSqFt: 1000,
        carrierTotalGal: 1,
      }),
    ).toThrow(/density/);

    const product: ProductLabel = {
      nPct: 30,
      p2o5Pct: 0,
      k2oPct: 10,
      ...ZEROS,
      densityLbPerGal: 11.4,
    };
    expect(() =>
      planLiquid({
        product,
        targetNutrient: "N",
        targetLbPer1k: 0.4,
        areaSqFt: 1000,
        carrierTotalGal: 0,
      }),
    ).toThrow(/Carrier volume/);
    expect(() =>
      planLiquid({
        product,
        targetNutrient: "P",
        targetLbPer1k: 0.4,
        areaSqFt: 1000,
        carrierTotalGal: 1,
      }),
    ).toThrow(/contains 0% P/);
  });
});

describe("costPerLbNutrient", () => {
  // 50 lb of K-Mag (22% K2O = 18.27% K) at $30:
  //   $/lb product = 0.60
  //   $/lb K = 0.60 / 0.1827 ≈ $3.28
  it("ranks the cost per lb of elemental K from a K-Mag bag", () => {
    const product: ProductLabel = { nPct: 0, p2o5Pct: 0, k2oPct: 22, ...ZEROS };
    expect(
      costPerLbNutrient({ product, pkgSizeLb: 50, pkgCostUsd: 30, nutrient: "K" }),
    ).toBeCloseTo(3.28, 1);
  });

  it("returns Infinity when product has none of that nutrient (so it sorts last)", () => {
    const product: ProductLabel = { nPct: 0, p2o5Pct: 0, k2oPct: 22, ...ZEROS };
    expect(costPerLbNutrient({ product, pkgSizeLb: 50, pkgCostUsd: 30, nutrient: "N" })).toBe(
      Infinity,
    );
  });
});
