"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import prisma from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/server-session";
import { canAccessArea } from "@/lib/auth/guards";
import { ROLE_CONTRIBUTOR } from "@/lib/constants";
import {
  evaluateWarnings,
  hasHardWarning,
  planGranular,
  planLiquid,
  type ProductLabel,
} from "@/lib/calc";

/**
 * Log an application: validates the same math the client just rendered,
 * re-runs side-effect warnings server-side (don't trust the client),
 * computes per-nutrient delivered snapshot, persists Application + the
 * cost snapshot, and bounces back to the area page.
 *
 * `acceptedHardWarnings` is the explicit "I know, do it anyway" toggle —
 * required to be `true` if the calc surfaced any HARD warnings. Without
 * it, the server refuses regardless of what the form sent.
 */

const NUTRIENTS = ["N", "P", "K", "Ca", "Mg", "S", "Fe", "Mn", "Zn", "Cu", "B", "Na"] as const;

const applicationInput = z.object({
  productId: z.string().min(1),
  /** "granular" or "liquid" — picks the planning function. */
  mode: z.enum(["granular", "liquid"]),
  targetNutrient: z.enum(NUTRIENTS),
  targetLbPer1k: z.coerce.number().positive("Target rate must be > 0"),
  /** Required for liquid mode; ignored for granular. */
  carrierTotalGal: z.coerce.number().nonnegative().optional(),
  weatherTempF: z
    .string()
    .trim()
    .transform((v) => (v.length === 0 ? null : Number(v)))
    .pipe(z.number().nullable()),
  weatherNotes: z
    .string()
    .trim()
    .max(500)
    .transform((v) => (v.length === 0 ? null : v)),
  notes: z
    .string()
    .trim()
    .max(2000)
    .transform((v) => (v.length === 0 ? null : v)),
  acceptedHardWarnings: z
    .union([z.literal("on"), z.literal("")])
    .optional()
    .transform((v) => v === "on"),
});

export type ActionResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

function readForm(form: FormData) {
  const get = (name: string) => {
    const v = form.get(name);
    return typeof v === "string" ? v : "";
  };
  return applicationInput.safeParse({
    productId: get("productId"),
    mode: get("mode"),
    targetNutrient: get("targetNutrient"),
    targetLbPer1k: get("targetLbPer1k"),
    carrierTotalGal: get("carrierTotalGal") || undefined,
    weatherTempF: get("weatherTempF"),
    weatherNotes: get("weatherNotes"),
    notes: get("notes"),
    acceptedHardWarnings: form.get("acceptedHardWarnings") === "on" ? "on" : "",
  });
}

export async function logApplication(
  propertyId: string,
  areaId: string,
  form: FormData,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireSessionUser();
  if (!(await canAccessArea(user.id, areaId, ROLE_CONTRIBUTOR))) {
    return { ok: false, error: "You don't have permission to log applications for this area." };
  }

  const parsed = readForm(form);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const input = parsed.data;

  // Load the area + its current soil test + the product. The area's
  // soil-test FK is the source of truth for warnings — caller can't
  // smuggle a different test through the form.
  const [area, product] = await Promise.all([
    prisma.area.findFirst({
      where: { id: areaId, propertyId },
      include: { soilTests: { where: { id: { not: undefined } } } },
    }),
    prisma.product.findUnique({ where: { id: input.productId } }),
  ]);
  if (!area) return { ok: false, error: "Area not found." };
  if (!product) return { ok: false, error: "Product not found." };

  const currentSoilTest = area.soilTests.find((t) => t.id === area.currentSoilTestId) ?? null;

  // Re-evaluate warnings server-side. If any are HARD and the user
  // didn't tick the override, refuse.
  const warnings = evaluateWarnings({ product, soilTest: currentSoilTest });
  if (hasHardWarning(warnings) && !input.acceptedHardWarnings) {
    return {
      ok: false,
      error: "Hard warning(s) present — confirm the override checkbox to log anyway.",
    };
  }

  // Build the plan with the canonical math.
  const productLabel: ProductLabel = product;
  let totalProductLb: number;
  let amountValue: number;
  let amountUnit: "lb" | "fl_oz";
  let carrierWaterGal: number | null;
  let delivered;

  if (input.mode === "granular") {
    const plan = planGranular({
      product: productLabel,
      targetNutrient: input.targetNutrient,
      targetLbPer1k: input.targetLbPer1k,
      areaSqFt: area.areaSqFt,
    });
    totalProductLb = plan.totalProductLb;
    amountValue = plan.totalProductLb;
    amountUnit = "lb";
    carrierWaterGal = null;
    delivered = plan.delivered;
  } else {
    if (!input.carrierTotalGal || input.carrierTotalGal <= 0) {
      return { ok: false, error: "Liquid applications need a carrier volume in gallons." };
    }
    const plan = planLiquid({
      product: productLabel,
      targetNutrient: input.targetNutrient,
      targetLbPer1k: input.targetLbPer1k,
      areaSqFt: area.areaSqFt,
      carrierTotalGal: input.carrierTotalGal,
    });
    totalProductLb = plan.totalProductLb;
    amountValue = plan.totalProductFlOz;
    amountUnit = "fl_oz";
    carrierWaterGal = input.carrierTotalGal;
    delivered = plan.delivered;
  }

  // Cost snapshot: convert the package size to lb regardless of pkgSizeUnit
  // for the most common cases. For non-weight units we fall back to a
  // direct $ / unit computation rather than crashing — this is good
  // enough for v1; a unit-aware ledger lands later.
  const pkgSizeLbApprox = approxPkgSizeLb(
    product.pkgSizeUnit,
    product.pkgSizeValue,
    product.densityLbPerGal ?? null,
  );
  const costUsdSnapshot =
    pkgSizeLbApprox > 0 ? (product.pkgCostUsd / pkgSizeLbApprox) * totalProductLb : 0;

  await prisma.application.create({
    data: {
      areaId,
      productId: input.productId,
      appliedByUserId: user.id,
      amountValue,
      amountUnit,
      carrierWaterGal,
      targetNutrientLbPer1k: input.targetLbPer1k,
      weatherTempF: input.weatherTempF,
      weatherNotes: input.weatherNotes,
      costUsdSnapshot,
      deliveredNLb: delivered.N,
      deliveredPLb: delivered.P,
      deliveredKLb: delivered.K,
      deliveredCaLb: delivered.Ca,
      deliveredMgLb: delivered.Mg,
      deliveredSLb: delivered.S,
      deliveredFeLb: delivered.Fe,
      deliveredMnLb: delivered.Mn,
      deliveredZnLb: delivered.Zn,
      deliveredCuLb: delivered.Cu,
      deliveredBLb: delivered.B,
      deliveredNaLb: delivered.Na,
      notes: input.notes,
    },
  });

  revalidatePath(`/properties/${propertyId}/areas/${areaId}`);
  redirect(`/properties/${propertyId}/areas/${areaId}`);
}

/**
 * Approximate package size in lb. lb / oz_wt convert directly; gal +
 * fl_oz multiply by density. Returns 0 when we can't estimate (no
 * density on a liquid product) so the caller short-circuits cost.
 */
function approxPkgSizeLb(unit: string, value: number, density: number | null): number {
  switch (unit) {
    case "lb":
      return value;
    case "oz_wt":
      return value / 16;
    case "gal":
      return density != null ? value * density : 0;
    case "fl_oz":
      return density != null ? (value / 128) * density : 0;
    default:
      return 0;
  }
}
