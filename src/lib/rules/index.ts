import "server-only";
import prisma from "@/lib/db";
import { aggregateStatus } from "./aggregate";
import { RULES } from "./registry";
import type { AreaDiagnostic, AreaStatus, RuleContext } from "./types";

/**
 * Orchestrator. Loads everything every registered rule could need for
 * one area in a single batch of parallel queries, builds the
 * `RuleContext`, runs every rule, then aggregates.
 *
 * Rules are pure + synchronous; this is the only async layer. Adding a
 * new rule that needs new context means widening `RuleContext` and the
 * fetch fan-out below — never `await`-ing inside the rule.
 *
 * No caching layer yet. The `Recommendation` table is in the schema as
 * the cache target (see SPEC §5.10) but compute is currently fast
 * enough that caching is premature. Wire it the moment a request shows
 * measurable latency from this function.
 */

export async function computeAreaStatus(
  areaId: string,
  now: Date = new Date(),
): Promise<AreaStatus> {
  const ctx = await loadRuleContext(areaId, now);
  const diagnostics: AreaDiagnostic[] = [];
  for (const rule of RULES) {
    const result = rule(ctx);
    if (result) diagnostics.push(result);
  }
  return aggregateStatus(diagnostics, now);
}

/**
 * Convenience for the home view: compute status for many areas in
 * parallel. Each call still does its own fan-out — fine for the
 * single-household scale we're at; revisit if a user genuinely has
 * dozens of areas and the home view starts dragging.
 */
export async function computeAreasStatus(
  areaIds: string[],
  now: Date = new Date(),
): Promise<Map<string, AreaStatus>> {
  const results = await Promise.all(
    areaIds.map(async (id) => [id, await computeAreaStatus(id, now)] as const),
  );
  return new Map(results);
}

async function loadRuleContext(areaId: string, now: Date): Promise<RuleContext> {
  const [area, latestSoilTest, lastLeachingCycle, applications] = await Promise.all([
    prisma.area.findUniqueOrThrow({
      where: { id: areaId },
      select: {
        id: true,
        name: true,
        areaSqFt: true,
        areaType: { select: { code: true } },
      },
    }),
    prisma.soilTest.findFirst({
      where: { areaId },
      orderBy: { testDate: "desc" },
      select: { testDate: true },
    }),
    prisma.irrigationEvent.findFirst({
      where: { areaId, isLeachingCycle: true },
      orderBy: { eventAt: "desc" },
      select: { eventAt: true },
    }),
    // Newest first — rules trust this ordering. 365-day window covers
    // the cadence rules' worst case (gypsum at 180 days) with margin.
    prisma.application.findMany({
      where: { areaId, appliedAt: { gte: yearAgo(now) } },
      orderBy: { appliedAt: "desc" },
      select: {
        appliedAt: true,
        deliveredCaLb: true,
        product: { select: { tags: true } },
      },
    }),
  ]);

  return {
    area: {
      id: area.id,
      name: area.name,
      areaSqFt: area.areaSqFt,
      areaTypeCode: area.areaType.code,
    },
    now,
    latestSoilTest,
    lastLeachingCycle,
    applications: applications.map((a) => ({
      appliedAt: a.appliedAt,
      productTags: a.product.tags,
      deliveredCaLb: a.deliveredCaLb,
    })),
  };
}

function yearAgo(from: Date): Date {
  return new Date(from.getTime() - 365 * 24 * 60 * 60 * 1000);
}

export type {
  AreaDiagnostic,
  AreaStatus,
  AreaStatusVerdict,
  DiagnosticKind,
  DiagnosticPriority,
  RuleContext,
  RuleFn,
} from "./types";
