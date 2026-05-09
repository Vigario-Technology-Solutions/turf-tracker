import { gypsumMaintenanceDue } from "./gypsum-maintenance-due";
import { leachingDue } from "./leaching-due";
import { pgrCycleDue } from "./pgr-cycle-due";
import { soilTestStale } from "./soil-test-stale";
import type { RuleFn } from "./types";

/**
 * Registry of every rule the engine evaluates per area. Order is
 * intentional but not load-bearing — the aggregator sorts diagnostics
 * by priority before returning. Add a new rule by registering it here.
 *
 * Rules in the SPEC §6.7 table that are NOT yet registered:
 *   - `nutrient_below_target`     (needs season-target schema; deferred)
 *   - `salt_balance_negative`     (needs running ytd Na vs Ca totals)
 *   - `application_overlap`       (apply-flow concern; lives there)
 *
 * Their kind literals exist in `DiagnosticKind` and `lib/constants.ts`
 * so this file is the only place that has to change when they land.
 */
export const RULES: readonly RuleFn[] = [
  soilTestStale,
  leachingDue,
  gypsumMaintenanceDue,
  pgrCycleDue,
];
