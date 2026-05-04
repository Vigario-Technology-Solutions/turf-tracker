"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/server-session";
import { canAccessArea, canAccessProperty } from "@/lib/auth/guards";
import { ROLE_CONTRIBUTOR, ROLE_OWNER } from "@/lib/constants";
import { areaFormSchema, type AreaFormOutput } from "@/lib/forms/area";

/**
 * Area mutations. Permission rules:
 *   - Create / update: contributor or owner on the parent property.
 *   - Delete: owner only — areas carry application + irrigation
 *     history, deletion cascades through both, so it's a strictly
 *     higher bar.
 */

export type ActionResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Coerce form values into the Prisma write shape — empty strings on
 * optional fields collapse to null; numeric strings become numbers.
 */
function dbWriteable(values: AreaFormOutput) {
  const num = (v: string) => (v.length === 0 ? null : Number(v));
  return {
    name: values.name,
    areaSqFt: values.areaSqFt,
    areaTypeId: values.areaTypeId,
    irrigationSourceId: values.irrigationSourceId,
    cropOrSpecies: values.cropOrSpecies.length === 0 ? null : values.cropOrSpecies,
    waterNaPpm: num(values.waterNaPpm),
    precipRateInPerHr: num(values.precipRateInPerHr),
    headTypeId: values.headTypeId.length === 0 ? null : Number(values.headTypeId),
    notes: values.notes.length === 0 ? null : values.notes,
  };
}

export async function createArea(
  propertyId: string,
  values: AreaFormOutput,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireSessionUser();
  if (!(await canAccessProperty(user.id, propertyId, ROLE_CONTRIBUTOR))) {
    return { ok: false, error: "You don't have permission to add areas to this property." };
  }
  const parsed = areaFormSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const created = await prisma.area.create({
    data: { ...dbWriteable(parsed.data), propertyId },
  });

  revalidatePath(`/properties/${propertyId}`);
  redirect(`/properties/${propertyId}/areas/${created.id}`);
}

export async function updateArea(
  propertyId: string,
  areaId: string,
  values: AreaFormOutput,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireSessionUser();
  if (!(await canAccessArea(user.id, areaId, ROLE_CONTRIBUTOR))) {
    return { ok: false, error: "You don't have permission to edit this area." };
  }
  const parsed = areaFormSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await prisma.area.update({ where: { id: areaId }, data: dbWriteable(parsed.data) });
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
