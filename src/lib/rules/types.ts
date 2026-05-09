import type {
  RULE_APPLICATION_OVERLAP,
  RULE_GYPSUM_MAINTENANCE_DUE,
  RULE_LEACHING_DUE,
  RULE_NUTRIENT_BELOW_TARGET,
  RULE_PGR_CYCLE_DUE,
  RULE_SALT_BALANCE_NEGATIVE,
  RULE_SOIL_TEST_STALE,
  PRIORITY_INFORMATIONAL,
  PRIORITY_RECOMMENDED,
  PRIORITY_URGENT,
} from "@/lib/constants";

/**
 * Rules-engine primitive — `Status<V, K>` + `Diagnostic<K>`.
 *
 * Industry lineage: Kubernetes `.status.conditions[]` (aggregate verdict
 * with typed condition list) + LSP `Diagnostic[]` (per-issue shape with
 * navigation). Adopted from vis-daily-tracker's pipe-tree query layer
 * (see `docs/pipe-tree/status-diagnostics.md` over there).
 *
 * Why not booleans:
 *   - "is this area OK?"     → consumer checks `status === "ok"`.
 *   - "what's wrong with it?" → consumer iterates `diagnostics`.
 *   - "how many of kind K?"   → consumer reads `diagnosticCounts[K]`.
 *
 * All three views are derived from the same row of data. New rules add
 * a new `DiagnosticKind` variant and a pure rule function — never modify
 * existing rule code.
 */

/** Aggregate verdict for an area. One word; sortable; same shape per SPEC §5.10. */
export type AreaStatusVerdict = "ok" | "attention" | "urgent";

/** Per-diagnostic priority (orthogonal to severity in vis-daily-tracker). */
export type DiagnosticPriority =
  | typeof PRIORITY_URGENT
  | typeof PRIORITY_RECOMMENDED
  | typeof PRIORITY_INFORMATIONAL;

/**
 * Closed set of rule kinds. The constants live in `lib/constants.ts` so
 * the strings stay grep-able and a single rename touches both the rule
 * implementation and any cache/UI consumer. Adding a new rule:
 *   1. Add a `RULE_*` constant.
 *   2. Add the literal here.
 *   3. Write the pure rule + register it.
 */
export type DiagnosticKind =
  | typeof RULE_LEACHING_DUE
  | typeof RULE_NUTRIENT_BELOW_TARGET
  | typeof RULE_GYPSUM_MAINTENANCE_DUE
  | typeof RULE_PGR_CYCLE_DUE
  | typeof RULE_SOIL_TEST_STALE
  | typeof RULE_SALT_BALANCE_NEGATIVE
  | typeof RULE_APPLICATION_OVERLAP;

export interface AreaDiagnostic {
  kind: DiagnosticKind;
  /** Stable rule id. Equal to `kind` for v1; kept distinct so future
   *  per-rule variants (e.g. "soil_test_stale_critical") can share a
   *  kind while differentiating UX. */
  ruleId: string;
  priority: DiagnosticPriority;
  /** One-line user-facing summary. Rule-formatted; no UI templating. */
  summary: string;
  computedAt: Date;
  /** Rule-specific details. Whatever the UI needs to deep-link or quantify. */
  payload?: Record<string, unknown>;
  /** Snooze. Set by the user via dismiss action; respected at aggregation. */
  dismissedUntil?: Date | null;
}

export interface AreaStatus {
  status: AreaStatusVerdict;
  /** One-line summary matching `status` — for area-card subtitles. */
  statusDescription: string;
  diagnostics: AreaDiagnostic[];
  /** Per-kind count, precomputed so UI filters/badges don't re-iterate. */
  diagnosticCounts: Partial<Record<DiagnosticKind, number>>;
}

/**
 * Inputs every rule receives. The orchestrator does all the IO once and
 * passes a single context — rules stay synchronous + pure + trivially
 * unit-testable.
 *
 * Time is injected (`now`) so tests don't depend on real-clock drift.
 *
 * Numeric constants (thresholds, cadences) are not in the context —
 * each rule owns its own constants in-file. Keeps the context thin and
 * the rule self-documenting.
 */
export interface RuleContext {
  area: {
    id: string;
    name: string;
    areaSqFt: number;
    /** AreaType.code, e.g. "turf". Lets type-aware rules (PGR season)
     *  filter without re-joining lookup. */
    areaTypeCode: string;
  };
  now: Date;

  /** Most recent SoilTest row for the area, or null. */
  latestSoilTest: { testDate: Date } | null;

  /** Most recent IrrigationEvent where `isLeachingCycle = true`, or null. */
  lastLeachingCycle: { eventAt: Date } | null;

  /**
   * Application history for the area, newest first. Each row carries
   * the product's tag list (joined by the orchestrator) plus the
   * delivered Ca snapshot — gypsum-detection uses
   * `deliveredCaLb > 0`, not a tag, so unmarked Ca-source products
   * (lime, gypsum-by-another-name) still count.
   */
  applications: Array<{
    appliedAt: Date;
    productTags: string[];
    deliveredCaLb: number;
  }>;
}

/**
 * Pure rule signature. Returns 0 or 1 diagnostic per call — never an
 * array. A condition that produces multiple diagnostics gets split into
 * separate rule files.
 */
export type RuleFn = (ctx: RuleContext) => AreaDiagnostic | null;
