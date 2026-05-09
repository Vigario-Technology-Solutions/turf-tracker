import { describe, expect, it } from "vitest";
import {
  PRIORITY_INFORMATIONAL,
  PRIORITY_RECOMMENDED,
  PRIORITY_URGENT,
  RULE_LEACHING_DUE,
  RULE_SOIL_TEST_STALE,
} from "@/lib/constants";
import { aggregateStatus } from "./aggregate";
import type { AreaDiagnostic } from "./types";

const NOW = new Date("2026-05-09T12:00:00Z");

function diag(overrides: Partial<AreaDiagnostic>): AreaDiagnostic {
  return {
    kind: RULE_SOIL_TEST_STALE,
    ruleId: RULE_SOIL_TEST_STALE,
    priority: PRIORITY_RECOMMENDED,
    summary: "stub",
    computedAt: NOW,
    ...overrides,
  };
}

describe("aggregateStatus", () => {
  it("rolls up to `ok` when there are no diagnostics", () => {
    const status = aggregateStatus([], NOW);
    expect(status.status).toBe("ok");
    expect(status.statusDescription).toBe("All caught up.");
    expect(status.diagnostics).toEqual([]);
    expect(status.diagnosticCounts).toEqual({});
  });

  it("rolls up to `ok` when only informational diagnostics are present", () => {
    const status = aggregateStatus([diag({ priority: PRIORITY_INFORMATIONAL })], NOW);
    expect(status.status).toBe("ok");
    expect(status.statusDescription).toMatch(/1 informational note/);
  });

  it("rolls up to `attention` for any recommended diagnostic", () => {
    const status = aggregateStatus(
      [
        diag({ priority: PRIORITY_INFORMATIONAL }),
        diag({
          priority: PRIORITY_RECOMMENDED,
          kind: RULE_LEACHING_DUE,
          ruleId: RULE_LEACHING_DUE,
        }),
      ],
      NOW,
    );
    expect(status.status).toBe("attention");
    expect(status.statusDescription).toMatch(/1 recommended/);
  });

  it("rolls up to `urgent` for any urgent diagnostic", () => {
    const status = aggregateStatus(
      [
        diag({ priority: PRIORITY_RECOMMENDED }),
        diag({ priority: PRIORITY_URGENT, kind: RULE_LEACHING_DUE, ruleId: RULE_LEACHING_DUE }),
      ],
      NOW,
    );
    expect(status.status).toBe("urgent");
    expect(status.statusDescription).toMatch(/1 urgent/);
  });

  it("sorts diagnostics highest-priority first", () => {
    const sorted = aggregateStatus(
      [
        diag({ priority: PRIORITY_INFORMATIONAL }),
        diag({ priority: PRIORITY_URGENT, kind: RULE_LEACHING_DUE, ruleId: RULE_LEACHING_DUE }),
        diag({ priority: PRIORITY_RECOMMENDED }),
      ],
      NOW,
    );
    expect(sorted.diagnostics.map((d) => d.priority)).toEqual([
      PRIORITY_URGENT,
      PRIORITY_RECOMMENDED,
      PRIORITY_INFORMATIONAL,
    ]);
  });

  it("counts diagnostics per kind", () => {
    const status = aggregateStatus(
      [
        diag({ kind: RULE_SOIL_TEST_STALE, ruleId: RULE_SOIL_TEST_STALE }),
        diag({ kind: RULE_LEACHING_DUE, ruleId: RULE_LEACHING_DUE }),
        diag({ kind: RULE_LEACHING_DUE, ruleId: RULE_LEACHING_DUE }),
      ],
      NOW,
    );
    expect(status.diagnosticCounts).toEqual({
      [RULE_SOIL_TEST_STALE]: 1,
      [RULE_LEACHING_DUE]: 2,
    });
  });

  it("drops snoozed diagnostics from both verdict and counts", () => {
    const futureDate = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
    const pastDate = new Date(NOW.getTime() - 24 * 60 * 60 * 1000);
    const status = aggregateStatus(
      [
        diag({ priority: PRIORITY_URGENT, dismissedUntil: futureDate }),
        diag({ priority: PRIORITY_INFORMATIONAL, dismissedUntil: pastDate }),
      ],
      NOW,
    );
    expect(status.status).toBe("ok");
    expect(status.diagnostics).toHaveLength(1);
    expect(status.diagnostics[0].priority).toBe(PRIORITY_INFORMATIONAL);
  });
});
