import { PRIORITY_RECOMMENDED, PRIORITY_URGENT, RULE_LEACHING_DUE } from "@/lib/constants";
import type { RuleFn } from "./types";

/**
 * Leaching cadence — push 1.5–2× normal water depth every 30 days to
 * displace accumulated salts. From SPEC §6.7 + the salt-clock rationale
 * in CLAUDE.md.
 *
 * Two bands:
 *   - 30+ days since last leaching → recommended
 *   - 45+ days since last leaching → urgent (well past cadence; salt
 *     load is mathematically dominating the displacement budget)
 *
 * Areas without irrigation history (no leaching cycles ever) get a
 * `recommended` nudge — same shape as soil-test-stale's "never tested"
 * branch. The user sees it once they've defined the area; it goes away
 * the moment they log a leaching cycle.
 */

const RECOMMENDED_AFTER_DAYS = 30;
const URGENT_AFTER_DAYS = 45;

export const leachingDue: RuleFn = (ctx) => {
  const now = ctx.now;

  if (!ctx.lastLeachingCycle) {
    return {
      kind: RULE_LEACHING_DUE,
      ruleId: RULE_LEACHING_DUE,
      priority: PRIORITY_RECOMMENDED,
      summary: "No leaching cycle on record — run a 1.5–2× volume push to start the salt clock.",
      computedAt: now,
      payload: { daysSinceLastCycle: null },
    };
  }

  const daysSinceLastCycle = daysBetween(ctx.lastLeachingCycle.eventAt, now);
  if (daysSinceLastCycle < RECOMMENDED_AFTER_DAYS) return null;

  const priority = daysSinceLastCycle >= URGENT_AFTER_DAYS ? PRIORITY_URGENT : PRIORITY_RECOMMENDED;
  const overdue = Math.max(0, daysSinceLastCycle - RECOMMENDED_AFTER_DAYS);

  return {
    kind: RULE_LEACHING_DUE,
    ruleId: RULE_LEACHING_DUE,
    priority,
    summary:
      overdue >= 1
        ? `Leaching cycle ${Math.floor(overdue)} day${overdue >= 2 ? "s" : ""} overdue (last was ${Math.floor(daysSinceLastCycle)} days ago).`
        : `Leaching cycle due — last was ${Math.floor(daysSinceLastCycle)} days ago.`,
    computedAt: now,
    payload: { daysSinceLastCycle },
  };
};

function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
}
