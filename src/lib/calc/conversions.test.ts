import { describe, expect, it } from "vitest";
import { p2o5ToP, k2oToK, ppmToMeqPer100g, ppmToMeqPerL, EQ_WEIGHT } from "./conversions";

describe("oxide ↔ elemental", () => {
  it("converts P2O5 to elemental P (~43.6%)", () => {
    expect(p2o5ToP(10)).toBeCloseTo(4.364, 3);
    expect(p2o5ToP(0)).toBe(0);
  });

  it("converts K2O to elemental K (~83.0%)", () => {
    expect(k2oToK(10)).toBeCloseTo(8.302, 3);
    expect(k2oToK(0)).toBe(0);
  });

  // A 16-4-8 fertilizer label = 16% N, 4% P2O5, 8% K2O.
  // The equivalent elemental analysis is 16-1.75-6.64.
  it("16-4-8 label converts to expected elemental values", () => {
    expect(p2o5ToP(4)).toBeCloseTo(1.7456, 3);
    expect(k2oToK(8)).toBeCloseTo(6.6416, 3);
  });
});

describe("ppm → meq", () => {
  it("100 ppm Ca = 0.499 meq/100g", () => {
    expect(ppmToMeqPer100g(100, "Ca")).toBeCloseTo(100 / (20.04 * 10), 4);
  });

  it("285 ppm Na (Tyler's tap-water Na) = 12.40 meq/L", () => {
    // 285 / 22.99 = 12.397
    expect(ppmToMeqPerL(285, "Na")).toBeCloseTo(285 / EQ_WEIGHT.Na, 4);
  });

  it("zero in, zero out", () => {
    expect(ppmToMeqPer100g(0, "Ca")).toBe(0);
    expect(ppmToMeqPerL(0, "Mg")).toBe(0);
  });
});
