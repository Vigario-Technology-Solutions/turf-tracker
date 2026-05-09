import {
  PRIORITY_INFORMATIONAL,
  PRIORITY_RECOMMENDED,
  RULE_SOIL_TEST_STALE,
} from "@/lib/constants";
import type { RuleFn } from "./types";

/**
 * Soil test goes stale at 12 months — the SPEC's threshold for
 * "re-test recommended." Two priority bands:
 *   - never tested            → recommended (null soil test)
 *   - 12+ months since test   → recommended
 *   - 18+ months since test   → still recommended (unchanged kind, but
 *     payload carries `monthsSinceTest` so UI can call out severity)
 *
 * No `urgent` priority — even a missing soil test isn't blocking; it
 * just means downstream rate calcs use defaults. The rules engine's
 * job is to prompt, not to gate.
 */

const STALE_AFTER_MONTHS = 12;

export const soilTestStale: RuleFn = (ctx) => {
  const now = ctx.now;

  if (!ctx.latestSoilTest) {
    return {
      kind: RULE_SOIL_TEST_STALE,
      ruleId: RULE_SOIL_TEST_STALE,
      priority: PRIORITY_RECOMMENDED,
      summary: "No soil test on file — schedule one to unlock accurate rate math.",
      computedAt: now,
      payload: { monthsSinceTest: null },
    };
  }

  const monthsSinceTest = monthsBetween(ctx.latestSoilTest.testDate, now);
  if (monthsSinceTest < STALE_AFTER_MONTHS) return null;

  return {
    kind: RULE_SOIL_TEST_STALE,
    ruleId: RULE_SOIL_TEST_STALE,
    // Stale soil tests are background context, not blocking — keep them
    // informational so they don't crowd out rate-driven recommendations.
    priority: PRIORITY_INFORMATIONAL,
    summary: `Soil test is ${Math.floor(monthsSinceTest)} months old — re-test recommended.`,
    computedAt: now,
    payload: { monthsSinceTest },
  };
};

function monthsBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  // Average month length to avoid calendar-edge stutter (Feb 28 → Mar 28
  // shouldn't toggle the threshold a day early). 30.4375 = 365.25 / 12.
  return ms / (1000 * 60 * 60 * 24 * 30.4375);
}
