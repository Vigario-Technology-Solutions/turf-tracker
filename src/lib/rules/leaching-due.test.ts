import { describe, expect, it } from "vitest";
import { PRIORITY_RECOMMENDED, PRIORITY_URGENT, RULE_LEACHING_DUE } from "@/lib/constants";
import { leachingDue } from "./leaching-due";
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

describe("leachingDue", () => {
  it("returns null when last cycle was recent", () => {
    expect(leachingDue(ctx({ lastLeachingCycle: { eventAt: daysBefore(NOW, 5) } }))).toBeNull();
    expect(leachingDue(ctx({ lastLeachingCycle: { eventAt: daysBefore(NOW, 29) } }))).toBeNull();
  });

  it("flags `recommended` between 30 and 45 days", () => {
    const result = leachingDue(ctx({ lastLeachingCycle: { eventAt: daysBefore(NOW, 32) } }));
    expect(result).not.toBeNull();
    expect(result!.kind).toBe(RULE_LEACHING_DUE);
    expect(result!.priority).toBe(PRIORITY_RECOMMENDED);
    expect(result!.summary).toMatch(/2 days overdue/);
  });

  it("escalates to `urgent` at 45+ days", () => {
    const result = leachingDue(ctx({ lastLeachingCycle: { eventAt: daysBefore(NOW, 60) } }));
    expect(result).not.toBeNull();
    expect(result!.priority).toBe(PRIORITY_URGENT);
    expect(result!.summary).toMatch(/30 days overdue/);
  });

  it("returns a `recommended` nudge when no leaching cycle is on record", () => {
    const result = leachingDue(ctx());
    expect(result).not.toBeNull();
    expect(result!.priority).toBe(PRIORITY_RECOMMENDED);
    expect(result!.payload).toEqual({ daysSinceLastCycle: null });
  });
});
