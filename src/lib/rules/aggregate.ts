import { PRIORITY_INFORMATIONAL, PRIORITY_RECOMMENDED, PRIORITY_URGENT } from "@/lib/constants";
import type {
  AreaDiagnostic,
  AreaStatus,
  AreaStatusVerdict,
  DiagnosticKind,
  DiagnosticPriority,
} from "./types";

/**
 * Roll a list of per-rule diagnostics into a single `AreaStatus`.
 *
 * Verdict logic (mirrors K8s condition aggregation):
 *   - any `urgent` priority      → status = "urgent"
 *   - any `recommended` priority → status = "attention"
 *   - any `informational` only   → status = "ok" (informational is
 *     by-design non-blocking; it doesn't move the verdict)
 *   - empty                      → status = "ok"
 *
 * Diagnostics are sorted highest-priority first so UI can splice the
 * top-N without re-sorting. Snoozed diagnostics (`dismissedUntil >
 * now`) are dropped at this layer — the cache stores them but they
 * shouldn't influence the verdict during the snooze window.
 */

const PRIORITY_RANK: Record<DiagnosticPriority, number> = {
  [PRIORITY_URGENT]: 3,
  [PRIORITY_RECOMMENDED]: 2,
  [PRIORITY_INFORMATIONAL]: 1,
};

export function aggregateStatus(diagnostics: AreaDiagnostic[], now: Date): AreaStatus {
  const active = diagnostics.filter((d) => !isSnoozed(d, now));
  const sorted = [...active].sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]);

  const counts: Partial<Record<DiagnosticKind, number>> = {};
  for (const d of sorted) {
    counts[d.kind] = (counts[d.kind] ?? 0) + 1;
  }

  const verdict = rollUpVerdict(sorted);

  return {
    status: verdict,
    statusDescription: describeVerdict(verdict, sorted),
    diagnostics: sorted,
    diagnosticCounts: counts,
  };
}

function isSnoozed(d: AreaDiagnostic, now: Date): boolean {
  return d.dismissedUntil != null && d.dismissedUntil.getTime() > now.getTime();
}

function rollUpVerdict(sorted: AreaDiagnostic[]): AreaStatusVerdict {
  const top = sorted[0];
  if (!top) return "ok";
  if (top.priority === PRIORITY_URGENT) return "urgent";
  if (top.priority === PRIORITY_RECOMMENDED) return "attention";
  return "ok";
}

function describeVerdict(verdict: AreaStatusVerdict, sorted: AreaDiagnostic[]): string {
  if (verdict === "ok") {
    if (sorted.length === 0) return "All caught up.";
    return `${sorted.length} informational note${sorted.length === 1 ? "" : "s"}.`;
  }
  const urgent = sorted.filter((d) => d.priority === PRIORITY_URGENT).length;
  const recommended = sorted.filter((d) => d.priority === PRIORITY_RECOMMENDED).length;
  if (verdict === "urgent") {
    return `${urgent} urgent action${urgent === 1 ? "" : "s"} needed.`;
  }
  return `${recommended} recommended action${recommended === 1 ? "" : "s"}.`;
}
