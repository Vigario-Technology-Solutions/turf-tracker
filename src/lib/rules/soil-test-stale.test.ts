import { describe, expect, it } from "vitest";
import {
  PRIORITY_INFORMATIONAL,
  PRIORITY_RECOMMENDED,
  RULE_SOIL_TEST_STALE,
} from "@/lib/constants";
import { soilTestStale } from "./soil-test-stale";
import type { RuleContext } from "./types";

const NOW = new Date("2026-05-09T12:00:00Z");

function ctx(overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    area: { id: "a1", name: "Backyard", areaSqFt: 3000, areaTypeCode: "turf" },
    now: NOW,
    latestSoilTest: null,
    lastLeachingCycle: null,
    applications: [],
    ...overrides,
  };
}

function monthsBefore(d: Date, months: number): Date {
  return new Date(d.getTime() - months * 30.4375 * 24 * 60 * 60 * 1000);
}

describe("soilTestStale", () => {
  it("flags `recommended` when no soil test has ever been taken", () => {
    const result = soilTestStale(ctx());
    expect(result).not.toBeNull();
    expect(result!.kind).toBe(RULE_SOIL_TEST_STALE);
    expect(result!.priority).toBe(PRIORITY_RECOMMENDED);
    expect(result!.payload).toEqual({ monthsSinceTest: null });
  });

  it("returns null when the latest test is < 12 months old", () => {
    expect(soilTestStale(ctx({ latestSoilTest: { testDate: monthsBefore(NOW, 6) } }))).toBeNull();
    expect(soilTestStale(ctx({ latestSoilTest: { testDate: monthsBefore(NOW, 11) } }))).toBeNull();
  });

  it("flags `informational` once the latest test is ≥ 12 months old", () => {
    const result = soilTestStale(ctx({ latestSoilTest: { testDate: monthsBefore(NOW, 13) } }));
    expect(result).not.toBeNull();
    expect(result!.priority).toBe(PRIORITY_INFORMATIONAL);
    expect(result!.summary).toMatch(/13 months old/);
  });

  it("uses average month length so a 12-month-and-1-day gap trips the threshold", () => {
    // 12 months + 1 day = 365.25 + 1 days. Should be > 12.
    const days = 365.25 + 1;
    const testDate = new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
    expect(soilTestStale(ctx({ latestSoilTest: { testDate } }))).not.toBeNull();
  });
});
