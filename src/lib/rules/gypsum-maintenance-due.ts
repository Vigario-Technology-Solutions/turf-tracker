import {
  PRIORITY_INFORMATIONAL,
  PRIORITY_RECOMMENDED,
  RULE_GYPSUM_MAINTENANCE_DUE,
} from "@/lib/constants";
import type { RuleFn } from "./types";

/**
 * Defensive gypsum cadence — every 180 days at maintenance rate
 * (~25 lb/1k sq ft). From SPEC §6.7. CLAUDE.md guardrail: gypsum
 * here is *defensive maintenance*, NOT reclamation; the salt influx
 * mathematically exceeds the displacement budget by ~2.7×, so the
 * rule prompts a regular pass rather than a corrective dose.
 *
 * "Gypsum-like" is detected by `deliveredCaLb > 0` on a logged
 * application — not by tag. Liming, gypsum-by-another-brand, dolomite
 * blends, etc. all qualify. Means we don't need a `tag_gypsum` to
 * land this rule, and the rule survives the user using a niche
 * Ca-source product.
 *
 * Areas without any Ca delivery on record get an `informational`
 * nudge — Ca delivery cadence is opt-in per the user's program;
 * we surface it but don't push it as `recommended` until the user
 * has at least one Ca application logged (i.e., they're already
 * running the program).
 */

const RECOMMENDED_AFTER_DAYS = 180;

export const gypsumMaintenanceDue: RuleFn = (ctx) => {
  const lastCaApp = ctx.applications.find((a) => a.deliveredCaLb > 0);

  if (!lastCaApp) {
    return {
      kind: RULE_GYPSUM_MAINTENANCE_DUE,
      ruleId: RULE_GYPSUM_MAINTENANCE_DUE,
      priority: PRIORITY_INFORMATIONAL,
      summary: "No Ca-delivering application on record — defensive gypsum cadence not started.",
      computedAt: ctx.now,
      payload: { daysSinceLastCaApp: null },
    };
  }

  const daysSinceLastCaApp = daysBetween(lastCaApp.appliedAt, ctx.now);
  if (daysSinceLastCaApp < RECOMMENDED_AFTER_DAYS) return null;

  return {
    kind: RULE_GYPSUM_MAINTENANCE_DUE,
    ruleId: RULE_GYPSUM_MAINTENANCE_DUE,
    priority: PRIORITY_RECOMMENDED,
    summary: `Defensive gypsum maintenance pass due (~25 lb/1k) — last Ca app was ${Math.floor(daysSinceLastCaApp)} days ago.`,
    computedAt: ctx.now,
    payload: { daysSinceLastCaApp },
  };
};

function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
}
