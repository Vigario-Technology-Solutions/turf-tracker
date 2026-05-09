import { describe, expect, it } from "vitest";
import {
  AREA_TYPE_BED,
  AREA_TYPE_TURF,
  PRIORITY_RECOMMENDED,
  RULE_PGR_CYCLE_DUE,
  TAG_PGR,
} from "@/lib/constants";
import { pgrCycleDue } from "./pgr-cycle-due";
import type { RuleContext } from "./types";

const NOW_MAY = new Date("2026-05-09T12:00:00Z");
const NOW_JAN = new Date("2026-01-09T12:00:00Z");

function ctx(overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    area: { id: "a1", name: "Backyard", areaSqFt: 3000, areaTypeCode: AREA_TYPE_TURF },
    now: NOW_MAY,
    latestSoilTest: null,
    lastLeachingCycle: null,
    applications: [],
    ...overrides,
  };
}

function daysBefore(d: Date, days: number): Date {
  return new Date(d.getTime() - days * 24 * 60 * 60 * 1000);
}

describe("pgrCycleDue", () => {
  it("never fires on non-turf areas", () => {
    expect(
      pgrCycleDue(
        ctx({
          area: { id: "a1", name: "Bed", areaSqFt: 200, areaTypeCode: AREA_TYPE_BED },
          applications: [
            { appliedAt: daysBefore(NOW_MAY, 30), productTags: [TAG_PGR], deliveredCaLb: 0 },
          ],
        }),
      ),
    ).toBeNull();
  });

  it("never fires outside the active growing season", () => {
    expect(
      pgrCycleDue(
        ctx({
          now: NOW_JAN,
          applications: [
            { appliedAt: daysBefore(NOW_JAN, 30), productTags: [TAG_PGR], deliveredCaLb: 0 },
          ],
        }),
      ),
    ).toBeNull();
  });

  it("never fires when the area has no PGR history", () => {
    expect(
      pgrCycleDue(
        ctx({
          applications: [
            { appliedAt: daysBefore(NOW_MAY, 30), productTags: ["humic"], deliveredCaLb: 0 },
          ],
        }),
      ),
    ).toBeNull();
  });

  it("returns null when last PGR app is within the 21-day window", () => {
    expect(
      pgrCycleDue(
        ctx({
          applications: [
            { appliedAt: daysBefore(NOW_MAY, 14), productTags: [TAG_PGR], deliveredCaLb: 0 },
          ],
        }),
      ),
    ).toBeNull();
  });

  it("flags `recommended` once 21+ days have passed", () => {
    const result = pgrCycleDue(
      ctx({
        applications: [
          { appliedAt: daysBefore(NOW_MAY, 25), productTags: [TAG_PGR], deliveredCaLb: 0 },
        ],
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.kind).toBe(RULE_PGR_CYCLE_DUE);
    expect(result!.priority).toBe(PRIORITY_RECOMMENDED);
    expect(result!.summary).toMatch(/25 days ago/);
  });
});
