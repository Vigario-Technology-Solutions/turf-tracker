import { describe, expect, it } from "vitest";
import {
  PRIORITY_INFORMATIONAL,
  PRIORITY_RECOMMENDED,
  RULE_GYPSUM_MAINTENANCE_DUE,
} from "@/lib/constants";
import { gypsumMaintenanceDue } from "./gypsum-maintenance-due";
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

function daysBefore(d: Date, days: number): Date {
  return new Date(d.getTime() - days * 24 * 60 * 60 * 1000);
}

describe("gypsumMaintenanceDue", () => {
  it("returns informational nudge when no Ca-delivering app exists", () => {
    const result = gypsumMaintenanceDue(ctx());
    expect(result).not.toBeNull();
    expect(result!.kind).toBe(RULE_GYPSUM_MAINTENANCE_DUE);
    expect(result!.priority).toBe(PRIORITY_INFORMATIONAL);
    expect(result!.payload).toEqual({ daysSinceLastCaApp: null });
  });

  it("ignores apps that delivered no Ca", () => {
    const result = gypsumMaintenanceDue(
      ctx({
        applications: [{ appliedAt: daysBefore(NOW, 5), productTags: [], deliveredCaLb: 0 }],
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.priority).toBe(PRIORITY_INFORMATIONAL);
  });

  it("returns null when last Ca app is within the 180-day window", () => {
    expect(
      gypsumMaintenanceDue(
        ctx({
          applications: [{ appliedAt: daysBefore(NOW, 30), productTags: [], deliveredCaLb: 5 }],
        }),
      ),
    ).toBeNull();
    expect(
      gypsumMaintenanceDue(
        ctx({
          applications: [{ appliedAt: daysBefore(NOW, 179), productTags: [], deliveredCaLb: 5 }],
        }),
      ),
    ).toBeNull();
  });

  it("flags `recommended` once last Ca app is ≥ 180 days old", () => {
    const result = gypsumMaintenanceDue(
      ctx({
        applications: [{ appliedAt: daysBefore(NOW, 200), productTags: [], deliveredCaLb: 5 }],
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.priority).toBe(PRIORITY_RECOMMENDED);
    expect(result!.summary).toMatch(/200 days ago/);
  });

  it("uses the most-recent Ca app, not the oldest", () => {
    // Newest first by orchestrator contract; rule trusts ordering.
    const result = gypsumMaintenanceDue(
      ctx({
        applications: [
          { appliedAt: daysBefore(NOW, 30), productTags: [], deliveredCaLb: 5 },
          { appliedAt: daysBefore(NOW, 400), productTags: [], deliveredCaLb: 5 },
        ],
      }),
    );
    expect(result).toBeNull(); // because newest Ca app was 30d ago
  });
});
