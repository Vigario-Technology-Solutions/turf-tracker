import { AREA_TYPE_TURF, PRIORITY_RECOMMENDED, RULE_PGR_CYCLE_DUE, TAG_PGR } from "@/lib/constants";
import type { RuleFn } from "./types";

/**
 * Plant growth regulator cadence — every 21 days during active growth.
 * SPEC §6.7. Only emits a diagnostic when:
 *   - the area is `turf` (PGRs are a turf-management practice; bed/tree
 *     PGR programs aren't a thing in our scope)
 *   - we're inside the active growing season (April–October, Northern
 *     Hemisphere bermuda assumption — see CLAUDE.md auto-memory link)
 *   - the area has at least one PGR app on record (we don't push PGR
 *     onto users who aren't running a PGR program)
 *   - 21+ days have passed since the last PGR app
 *
 * "PGR app" is detected by `productTags` including `pgr` — that tag is
 * canonical (TAG_PGR) so detection here matches the apply-flow's
 * warnings system.
 *
 * The active-season window is hardcoded for v1. The "real" thing is
 * an ET / GDD calculation (see SPEC §6.1's Kc table); a calendar window
 * is a deliberate stand-in until the season-target work lands.
 */

const RECOMMENDED_AFTER_DAYS = 21;
/** Inclusive month indices (0 = Jan). April through October. */
const ACTIVE_MONTHS = new Set([3, 4, 5, 6, 7, 8, 9]);

export const pgrCycleDue: RuleFn = (ctx) => {
  if (ctx.area.areaTypeCode !== AREA_TYPE_TURF) return null;
  if (!ACTIVE_MONTHS.has(ctx.now.getUTCMonth())) return null;

  const lastPgr = ctx.applications.find((a) => a.productTags.includes(TAG_PGR));
  if (!lastPgr) return null;

  const daysSinceLastPgr = daysBetween(lastPgr.appliedAt, ctx.now);
  if (daysSinceLastPgr < RECOMMENDED_AFTER_DAYS) return null;

  return {
    kind: RULE_PGR_CYCLE_DUE,
    ruleId: RULE_PGR_CYCLE_DUE,
    priority: PRIORITY_RECOMMENDED,
    summary: `PGR cycle due — last app was ${Math.floor(daysSinceLastPgr)} days ago (cadence: every 21).`,
    computedAt: ctx.now,
    payload: { daysSinceLastPgr },
  };
};

function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
}
