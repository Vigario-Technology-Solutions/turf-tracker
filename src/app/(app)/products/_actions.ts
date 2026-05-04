"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/server-session";
import { productFormSchema, type ProductFormOutput } from "@/lib/forms/product";

/**
 * Product mutations. Products are user-scoped (createdByUserId);
 * `sharedInHousehold` makes them visible to property contributors but
 * only the creator can edit / delete.
 *
 * Action takes the typed values RHF emits and re-runs `safeParse`
 * against the same `productFormSchema` — never trust the client's
 * parse. Empty optional strings collapse to null at write time
 * (`dbWriteable`).
 */

export type ActionResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Coerce form values into the Prisma write shape:
 *   - empty optional numeric strings → null
 *   - empty optional FK strings → null, otherwise Number(string)
 *   - merge custom-text tags with the checkbox set, dedup
 *   - drop the form-only `customTags` field
 */
function dbWriteable(values: ProductFormOutput) {
  const num = (v: string) => (v.length === 0 ? null : Number(v));

  const tagSet = new Set<string>(values.tags);
  for (const raw of values.customTags.split(/[,\s]+/)) {
    const t = raw.trim();
    if (t.length > 0) tagSet.add(t);
  }

  return {
    brand: values.brand,
    name: values.name,
    formId: values.formId,

    nPct: values.nPct,
    p2o5Pct: values.p2o5Pct,
    k2oPct: values.k2oPct,
    caPct: values.caPct,
    mgPct: values.mgPct,
    sPct: values.sPct,
    naPct: values.naPct,
    fePct: values.fePct,
    mnPct: values.mnPct,
    znPct: values.znPct,
    cuPct: values.cuPct,
    bPct: values.bPct,

    densityLbPerGal: num(values.densityLbPerGal),

    pkgSizeValue: values.pkgSizeValue,
    pkgSizeUnitId: values.pkgSizeUnitId,
    pkgCostUsd: values.pkgCostUsd,

    mfgRateValue: num(values.mfgRateValue),
    mfgRateUnitId: values.mfgRateUnitId.length === 0 ? null : Number(values.mfgRateUnitId),
    mfgRatePerValue: num(values.mfgRatePerValue),
    mfgRateBasisId: values.mfgRateBasisId.length === 0 ? null : Number(values.mfgRateBasisId),

    tags: Array.from(tagSet),
    sharedInHousehold: values.sharedInHousehold,

    notes: values.notes.length === 0 ? null : values.notes,
  };
}

export async function createProduct(
  values: ProductFormOutput,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireSessionUser();
  const parsed = productFormSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const created = await prisma.product.create({
    data: { ...dbWriteable(parsed.data), createdByUserId: user.id },
  });

  revalidatePath("/products");
  redirect(`/products/${created.id}`);
}

export async function updateProduct(
  id: string,
  values: ProductFormOutput,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireSessionUser();
  const existing = await prisma.product.findUnique({
    where: { id },
    select: { createdByUserId: true },
  });
  if (!existing || existing.createdByUserId !== user.id) {
    return { ok: false, error: "You can only edit products you created." };
  }

  const parsed = productFormSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await prisma.product.update({ where: { id }, data: dbWriteable(parsed.data) });
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
