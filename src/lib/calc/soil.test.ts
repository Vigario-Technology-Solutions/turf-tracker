import { describe, expect, it } from "vitest";
import {
  sar,
  esp,
  caMgRatio,
  naLbPerInchPer1k,
  naLbDeposited,
  inchesAppliedFromRuntime,
  runtimeMinForInches,
  gallonsForInches,
} from "./soil";

describe("SAR / ESP / Ca:Mg", () => {
  // Tyler's Riverdale CA soil (from user_lawn_garden.md): Ca ~1500, Mg ~400, Na ~285
  // (high Na, modest Ca:Mg, sodic). Hand-calculated:
  //   Ca_meq = 1500 / (20.04*10) ≈ 7.485
  //   Mg_meq =  400 / (12.155*10) ≈ 3.291
  //   Na_meq =  285 / (22.99*10) ≈ 1.239
  //   SAR = 1.239 / sqrt((7.485 + 3.291) / 2) ≈ 0.534
  //   Ca:Mg = 7.485 / 3.291 ≈ 2.275
  it("computes SAR / Ca:Mg for the current owner's soil", () => {
    const input = { caPpm: 1500, mgPpm: 400, naPpm: 285 };
    expect(sar(input)).toBeCloseTo(0.534, 2);
    expect(caMgRatio(input)).toBeCloseTo(2.275, 2);
  });

  it("ESP from CEC takes priority when CEC is present", () => {
    // 285 ppm Na = 1.239 meq/100g; CEC = 12 meq/100g → ESP = 100 * 1.239/12 ≈ 10.32%
    const input = { caPpm: 1500, mgPpm: 400, naPpm: 285, cecMeq100g: 12 };
    const result = esp(input);
    expect(result).toBeCloseTo(10.32, 1);
  });

  it("ESP from SAR when CEC is absent (USDA Handbook 60 fit)", () => {
    // For SAR ≈ 0.534, ESR = -0.0126 + 0.01475*0.534 ≈ -0.00472 (negative → clamp to 0)
    const lowSarInput = { caPpm: 1500, mgPpm: 400, naPpm: 285 };
    expect(esp(lowSarInput)).toBe(0);

    // Severely sodic case (SAR > 13 is the classical threshold). Hand-calc:
    //   Ca_meq =  100 / 200.4   = 0.499
    //   Mg_meq = 6.08 / 121.55  = 0.0500
    //   Na_meq = 2299 / 229.9   = 10.0
    //   SAR    = 10 / sqrt((0.499 + 0.0500)/2) = 10 / sqrt(0.2745) ≈ 19.09
    //   ESR    = -0.0126 + 0.01475 × 19.09     ≈ 0.2690
    //   ESP    = 100 × 0.2690 / (1 + 0.2690)    ≈ 21.20
    const sodic = { caPpm: 100, mgPpm: 6.08, naPpm: 2299 };
    expect(sar(sodic)).toBeCloseTo(19.09, 1);
    expect(esp(sodic)).toBeCloseTo(21.2, 1);
  });

  it("returns null when required cations are missing", () => {
    expect(sar({ caPpm: null, mgPpm: 400, naPpm: 285 })).toBeNull();
    expect(caMgRatio({ caPpm: 1500, mgPpm: null, naPpm: 285 })).toBeNull();
    expect(esp({ caPpm: null, mgPpm: null, naPpm: null })).toBeNull();
  });

  it("returns null when Ca + Mg is zero (avoid divide-by-zero)", () => {
    expect(sar({ caPpm: 0, mgPpm: 0, naPpm: 100 })).toBeNull();
    expect(caMgRatio({ caPpm: 100, mgPpm: 0, naPpm: 0 })).toBeNull();
  });
});

describe("salt clock — Na deposition", () => {
  // SPEC §6.3 sanity check: 240 ppm Na water = 240 × 0.0052 = 1.248 lb Na per inch per 1k sq ft.
  it("240 ppm tap water deposits ≈ 1.248 lb Na / inch / 1k sq ft", () => {
    expect(naLbPerInchPer1k(240)).toBeCloseTo(1.248, 3);
  });

  it("scales linearly across a real area + watering depth", () => {
    // 1.5 inches over Tyler's 3,318 sq ft backyard at 240 ppm:
    //   1.5 × 3.318 × (240 × 0.0052) = 6.21 lb Na for that single watering.
    const lb = naLbDeposited({ inchesApplied: 1.5, areaSqFt: 3318, waterNaPpm: 240 });
    expect(lb).toBeCloseTo(6.21, 1);
  });

  it("zero in any input → zero", () => {
    expect(naLbDeposited({ inchesApplied: 0, areaSqFt: 1000, waterNaPpm: 240 })).toBe(0);
    expect(naLbDeposited({ inchesApplied: 1, areaSqFt: 0, waterNaPpm: 240 })).toBe(0);
    expect(naLbDeposited({ inchesApplied: 1, areaSqFt: 1000, waterNaPpm: 0 })).toBe(0);
  });
});

describe("sprinkler runtime ↔ inches", () => {
  it("MP rotator at 0.4 in/hr running 30 min → 0.2 inches", () => {
    expect(inchesAppliedFromRuntime({ runtimeMin: 30, precipRateInPerHr: 0.4 })).toBeCloseTo(
      0.2,
      4,
    );
  });

  it("0.5 inch target at 0.4 in/hr → 75 min", () => {
    expect(runtimeMinForInches({ targetInches: 0.5, precipRateInPerHr: 0.4 })).toBeCloseTo(75, 4);
  });

  it("returns Infinity when precip rate is zero (caller must guard)", () => {
    expect(runtimeMinForInches({ targetInches: 0.5, precipRateInPerHr: 0 })).toBe(Infinity);
  });
});

describe("gallons for inches", () => {
  it("1 inch over 1,000 sq ft = 623.4 gal", () => {
    expect(gallonsForInches({ inches: 1, areaSqFt: 1000 })).toBeCloseTo(623.4, 1);
  });

  it("1.5 inches over 3,318 sq ft ≈ 3,103 gal", () => {
    expect(gallonsForInches({ inches: 1.5, areaSqFt: 3318 })).toBeCloseTo(1.5 * 3.318 * 623.4, 0);
  });
});
