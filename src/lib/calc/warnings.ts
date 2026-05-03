import { TAG_CONTAINS_P, TAG_CONTAINS_B, TAG_CONTAINS_NA, TAG_ACIDIFYING } from "@/lib/constants";

/**
 * Side-effect warnings from SPEC §6.8. These run at calculation time,
 * before the user confirms an application — the apply flow renders
 * them above the "Confirm + log" button.
 *
 * Severity:
 *   - "hard" — blocks unless user explicitly overrides ("I know, do it anyway").
 *   - "soft" — inline informational, never blocks.
 *
 * The thresholds below are the current owner's per-area defaults
 * (Riverdale CA, severely sodic + 7× P + high B). They live here for
 * Phase 1 so the rules engine has a single place to evolve from. When
 * we add per-area-type reference tables (SPEC §5.5 derived row), the
 * threshold lookup moves into the soil-test row and these stay as the
 * fallbacks.
 */

export const OPTIMAL_MAX = {
  P_PPM: 11,
  B_PPM: 0.5,
  PH_NEUTRAL: 7.0,
} as const;

export interface ProductTagInput {
  tags: readonly string[];
}

export interface SoilTestInput {
  pH: number | null | undefined;
  pPpm: number | null | undefined;
  bPpm: number | null | undefined;
}

export type WarningSeverity = "hard" | "soft";

export interface ApplicationWarning {
  severity: WarningSeverity;
  code: string;
  message: string;
}

export function evaluateWarnings(opts: {
  product: ProductTagInput;
  soilTest: SoilTestInput | null | undefined;
}): ApplicationWarning[] {
  const out: ApplicationWarning[] = [];
  const tags = new Set(opts.product.tags);
  const t = opts.soilTest;

  if (tags.has(TAG_CONTAINS_P) && t?.pPpm != null && t.pPpm > OPTIMAL_MAX.P_PPM) {
    const ratio = t.pPpm / OPTIMAL_MAX.P_PPM;
    out.push({
      severity: "hard",
      code: "p_excess",
      message: `Product contains P — soil P (${t.pPpm.toFixed(0)} ppm) is already ${ratio.toFixed(1)}× optimal max.`,
    });
  }

  if (tags.has(TAG_CONTAINS_B) && t?.bPpm != null && t.bPpm > OPTIMAL_MAX.B_PPM) {
    out.push({
      severity: "hard",
      code: "b_excess",
      message: `Product contains B — soil B (${t.bPpm.toFixed(2)} ppm) is already above optimal.`,
    });
  }

  if (tags.has(TAG_CONTAINS_NA)) {
    out.push({
      severity: "soft",
      code: "contains_na",
      message: "Product contains Na — adds to salt load.",
    });
  }

  if (tags.has(TAG_ACIDIFYING) && t?.pH != null && t.pH < OPTIMAL_MAX.PH_NEUTRAL) {
    out.push({
      severity: "soft",
      code: "acidifying_below_neutral",
      message: `Acidifying product — soil pH already ${t.pH.toFixed(2)}.`,
    });
  }

  return out;
}

export function hasHardWarning(warnings: readonly ApplicationWarning[]): boolean {
  return warnings.some((w) => w.severity === "hard");
}
