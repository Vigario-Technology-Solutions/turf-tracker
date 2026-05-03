"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import prisma from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/server-session";
import { canAccessArea, canAccessProperty } from "@/lib/auth/guards";
import { ROLE_CONTRIBUTOR, ROLE_OWNER } from "@/lib/constants";

/**
 * Area mutations. Permission rules:
 *   - Create / update: contributor or owner on the parent property.
 *   - Delete: owner only — areas carry application + irrigation history,
 *     deletion cascades through both, so it's a strictly higher bar.
 *
 * `targetPropertyIdAfterDelete` is needed because the redirect after a
 * delete leaves the deleted page; callers pass the parent propertyId.
 */

const areaInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  areaSqFt: z.coerce
    .number()
    .int("Must be a whole number")
    .positive("Must be greater than 0")
    .max(10_000_000),
  areaTypeId: z.coerce.number().int().positive(),
  irrigationSourceId: z.coerce.number().int().positive(),
  cropOrSpecies: z
    .string()
    .trim()
    .max(120)
    .transform((v) => (v.length === 0 ? null : v)),
  waterNaPpm: z
    .string()
    .trim()
    .transform((v) => (v.length === 0 ? null : Number(v)))
    .pipe(z.number().nonnegative("Must be ≥ 0").max(10_000).nullable()),
  precipRateInPerHr: z
    .string()
    .trim()
    .transform((v) => (v.length === 0 ? null : Number(v)))
    .pipe(z.number().nonnegative("Must be ≥ 0").max(50).nullable()),
  headType: z
    .string()
    .trim()
    .max(40)
    .transform((v) => (v.length === 0 ? null : v)),
  notes: z
    .string()
    .trim()
    .max(2000)
    .transform((v) => (v.length === 0 ? null : v)),
});

export type ActionResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

function readForm(form: FormData) {
  const get = (name: string) => {
    const v = form.get(name);
    return typeof v === "string" ? v : "";
  };
  return areaInput.safeParse({
    name: get("name"),
    areaSqFt: get("areaSqFt"),
    areaTypeId: get("areaTypeId"),
    irrigationSourceId: get("irrigationSourceId"),
    cropOrSpecies: get("cropOrSpecies"),
    waterNaPpm: get("waterNaPpm"),
    precipRateInPerHr: get("precipRateInPerHr"),
    headType: get("headType"),
    notes: get("notes"),
  });
}

export async function createArea(
  propertyId: string,
  form: FormData,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireSessionUser();
  if (!(await canAccessProperty(user.id, propertyId, ROLE_CONTRIBUTOR))) {
    return { ok: false, error: "You don't have permission to add areas to this property." };
  }
  const parsed = readForm(form);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const created = await prisma.area.create({
    data: { ...parsed.data, propertyId },
  });

  revalidatePath(`/properties/${propertyId}`);
  redirect(`/properties/${propertyId}/areas/${created.id}`);
}

export async function updateArea(
  propertyId: string,
  areaId: string,
  form: FormData,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireSessionUser();
  if (!(await canAccessArea(user.id, areaId, ROLE_CONTRIBUTOR))) {
    return { ok: false, error: "You don't have permission to edit this area." };
  }
  const parsed = readForm(form);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await prisma.area.update({ where: { id: areaId }, data: parsed.data });
  revalidatePath(`/properties/${propertyId}`);
  revalidatePath(`/properties/${propertyId}/areas/${areaId}`);
  redirect(`/properties/${propertyId}/areas/${areaId}`);
}

export async function deleteArea(propertyId: string, areaId: string): Promise<ActionResult<null>> {
  const user = await requireSessionUser();
  if (!(await canAccessArea(user.id, areaId, ROLE_OWNER))) {
    return { ok: false, error: "Only an owner can delete an area." };
  }
  await prisma.area.delete({ where: { id: areaId } });
  revalidatePath(`/properties/${propertyId}`);
  redirect(`/properties/${propertyId}`);
}
