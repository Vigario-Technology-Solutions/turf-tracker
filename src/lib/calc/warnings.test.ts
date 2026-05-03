import { describe, expect, it } from "vitest";
import { TAG_CONTAINS_P, TAG_CONTAINS_B, TAG_CONTAINS_NA, TAG_ACIDIFYING } from "@/lib/constants";
import { evaluateWarnings, hasHardWarning } from "./warnings";

describe("evaluateWarnings", () => {
  // Tyler's Riverdale soil: P = 74 ppm (vs 11 optimal max), B = 0.74 ppm (vs 0.5), pH = 6.37
  const ownerSoil = { pH: 6.37, pPpm: 74, bPpm: 0.74 };

  it("flags contains_p as HARD when soil P is already over the optimal max", () => {
    const w = evaluateWarnings({
      product: { tags: [TAG_CONTAINS_P] },
      soilTest: ownerSoil,
    });
    expect(w).toHaveLength(1);
    expect(w[0].severity).toBe("hard");
    expect(w[0].code).toBe("p_excess");
    expect(w[0].message).toMatch(/6\.7×/);
    expect(hasHardWarning(w)).toBe(true);
  });

  it("flags contains_b as HARD when soil B is high", () => {
    const w = evaluateWarnings({
      product: { tags: [TAG_CONTAINS_B] },
      soilTest: ownerSoil,
    });
    expect(w[0]?.severity).toBe("hard");
    expect(w[0]?.code).toBe("b_excess");
  });

  it("flags contains_na as SOFT (always — Na is never welcome on sodic ground)", () => {
    const w = evaluateWarnings({
      product: { tags: [TAG_CONTAINS_NA] },
      soilTest: ownerSoil,
    });
    expect(w[0]?.severity).toBe("soft");
    expect(w[0]?.code).toBe("contains_na");
  });

  it("flags acidifying as SOFT only when pH is below neutral", () => {
    const ackBelow = evaluateWarnings({
      product: { tags: [TAG_ACIDIFYING] },
      soilTest: ownerSoil,
    });
    expect(ackBelow[0]?.code).toBe("acidifying_below_neutral");
    expect(ackBelow[0]?.severity).toBe("soft");

    const ackAbove = evaluateWarnings({
      product: { tags: [TAG_ACIDIFYING] },
      soilTest: { pH: 7.5, pPpm: 8, bPpm: 0.2 },
    });
    expect(ackAbove).toHaveLength(0);
  });

  it("doesn't fire P/B warnings when there's no soil test on file", () => {
    const w = evaluateWarnings({
      product: { tags: [TAG_CONTAINS_P, TAG_CONTAINS_B] },
      soilTest: null,
    });
    expect(w).toHaveLength(0);
  });

  it("returns empty for an untagged product on healthy soil", () => {
    const w = evaluateWarnings({
      product: { tags: [] },
      soilTest: { pH: 6.8, pPpm: 8, bPpm: 0.3 },
    });
    expect(w).toEqual([]);
    expect(hasHardWarning(w)).toBe(false);
  });

  it("stacks multiple warnings (real owner case: P-containing product on this soil)", () => {
    const w = evaluateWarnings({
      product: { tags: [TAG_CONTAINS_P, TAG_CONTAINS_NA, TAG_ACIDIFYING] },
      soilTest: ownerSoil,
    });
    const codes = w.map((x) => x.code);
    expect(codes).toEqual(["p_excess", "contains_na", "acidifying_below_neutral"]);
    expect(hasHardWarning(w)).toBe(true);
  });
});
