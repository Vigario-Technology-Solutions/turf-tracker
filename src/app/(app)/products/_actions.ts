"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import prisma from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/server-session";

/**
 * Product mutations. Products are user-scoped (createdByUserId);
 * `sharedInHousehold` makes them visible to property contributors but
 * only the creator can edit / delete. Phase 1 scope is the user's own
 * library — sharing UX (toggle exposure across properties they belong
 * to) lands when member management does.
 */

export type ActionResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

const optionalNumber = z
  .string()
  .trim()
  .transform((v) => (v.length === 0 ? null : Number(v)))
  .pipe(z.number().nonnegative("Must be ≥ 0").nullable());

const optionalLookupId = z
  .string()
  .trim()
  .transform((v) => (v.length === 0 ? null : Number(v)))
  .pipe(z.number().int().positive().nullable());

const productInput = z.object({
  brand: z.string().trim().min(1, "Brand is required").max(120),
  name: z.string().trim().min(1, "Product name is required").max(160),
  formId: z.coerce.number().int().positive(),

  nPct: z.coerce.number().min(0).max(100),
  p2o5Pct: z.coerce.number().min(0).max(100),
  k2oPct: z.coerce.number().min(0).max(100),
  caPct: z.coerce.number().min(0).max(100),
  mgPct: z.coerce.number().min(0).max(100),
  sPct: z.coerce.number().min(0).max(100),
  naPct: z.coerce.number().min(0).max(100),
  fePct: z.coerce.number().min(0).max(100),
  mnPct: z.coerce.number().min(0).max(100),
  znPct: z.coerce.number().min(0).max(100),
  cuPct: z.coerce.number().min(0).max(100),
  bPct: z.coerce.number().min(0).max(100),

  densityLbPerGal: optionalNumber,

  pkgSizeValue: z.coerce.number().positive("Package size must be > 0"),
  pkgSizeUnitId: z.coerce.number().int().positive("Package size unit is required"),
  pkgCostUsd: z.coerce.number().nonnegative(),

  mfgRateValue: optionalNumber,
  mfgRateUnitId: optionalLookupId,
  mfgRatePerValue: optionalNumber,
  mfgRateBasisId: optionalLookupId,

  // Tags ship as a string array on the model. We collect them as
  // repeated `tags` form fields plus a free-text "custom" entry that
  // gets split on commas/spaces.
  tags: z.array(z.string().trim()).default([]),
  sharedInHousehold: z.boolean().default(false),

  notes: z
    .string()
    .trim()
    .max(2000)
    .transform((v) => (v.length === 0 ? null : v)),
});

function readForm(form: FormData) {
  const get = (name: string) => {
    const v = form.get(name);
    return typeof v === "string" ? v : "";
  };
  // FormData.getAll for repeated checkboxes; merge with the free-text custom tag field.
  const tagSet = new Set<string>();
  for (const t of form.getAll("tags")) {
    if (typeof t === "string" && t.trim().length > 0) tagSet.add(t.trim());
  }
  const custom = get("customTags");
  for (const t of custom.split(/[,\s]+/)) {
    const trimmed = t.trim();
    if (trimmed.length > 0) tagSet.add(trimmed);
  }

  return productInput.safeParse({
    brand: get("brand"),
    name: get("name"),
    formId: get("formId"),

    nPct: get("nPct") || "0",
    p2o5Pct: get("p2o5Pct") || "0",
    k2oPct: get("k2oPct") || "0",
    caPct: get("caPct") || "0",
    mgPct: get("mgPct") || "0",
    sPct: get("sPct") || "0",
    naPct: get("naPct") || "0",
    fePct: get("fePct") || "0",
    mnPct: get("mnPct") || "0",
    znPct: get("znPct") || "0",
    cuPct: get("cuPct") || "0",
    bPct: get("bPct") || "0",

    densityLbPerGal: get("densityLbPerGal"),

    pkgSizeValue: get("pkgSizeValue"),
    pkgSizeUnitId: get("pkgSizeUnitId"),
    pkgCostUsd: get("pkgCostUsd") || "0",

    mfgRateValue: get("mfgRateValue"),
    mfgRateUnitId: get("mfgRateUnitId"),
    mfgRatePerValue: get("mfgRatePerValue"),
    mfgRateBasisId: get("mfgRateBasisId"),

    tags: Array.from(tagSet),
    sharedInHousehold: form.get("sharedInHousehold") === "on",

    notes: get("notes"),
  });
}

export async function createProduct(form: FormData): Promise<ActionResult<{ id: string }>> {
  const user = await requireSessionUser();
  const parsed = readForm(form);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const created = await prisma.product.create({
    data: { ...parsed.data, createdByUserId: user.id },
  });

  revalidatePath("/products");
  redirect(`/products/${created.id}`);
}

export async function updateProduct(
  id: string,
  form: FormData,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireSessionUser();
  const existing = await prisma.product.findUnique({
    where: { id },
    select: { createdByUserId: true },
  });
  if (!existing || existing.createdByUserId !== user.id) {
    return { ok: false, error: "You can only edit products you created." };
  }

  const parsed = readForm(form);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await prisma.product.update({ where: { id }, data: parsed.data });
  revalidatePath("/products");
  revalidatePath(`/products/${id}`);
  redirect(`/products/${id}`);
}

export async function deleteProduct(id: string): Promise<ActionResult<null>> {
  const user = await requireSessionUser();
  const existing = await prisma.product.findUnique({
    where: { id },
    select: { createdByUserId: true, _count: { select: { applications: true } } },
  });
  if (!existing || existing.createdByUserId !== user.id) {
    return { ok: false, error: "You can only delete products you created." };
  }
  if (existing._count.applications > 0) {
    return {
      ok: false,
      error: `Can't delete — ${existing._count.applications} application${existing._count.applications === 1 ? "" : "s"} reference this product.`,
    };
  }
  await prisma.product.delete({ where: { id } });
  revalidatePath("/products");
  redirect("/products");
}
