"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/server-session";
import { canAccessProperty } from "@/lib/auth/guards";
import { ROLE_OWNER } from "@/lib/constants";
import { geocodeAddress } from "@/lib/weather/geocode";
import { propertyFormSchema, type PropertyFormValues } from "@/lib/forms/property";

/**
 * Property mutations as server actions. Rules:
 *   - Create: any signed-in user. Creator is auto-added as `owner`.
 *   - Update / delete: owner-only on that property.
 *   - Members are managed by separate actions (deferred).
 *
 * Action receives the typed values from the client form's RHF resolver
 * and re-runs `safeParse` against the same schema — never trust the
 * client's parse. Returns `{ ok: true }` or `{ ok: false, error }` so
 * the form can show an inline server error without throwing through
 * the action boundary. Redirect on success.
 */

export type ActionResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Collapse blank optional strings into nullable DB values right at
 * the write boundary. Schema keeps strings end-to-end (no transform)
 * so client + server validate the same shape.
 */
function dbWriteable(values: PropertyFormValues) {
  return {
    name: values.name,
    address: values.address.length === 0 ? null : values.address,
    notes: values.notes.length === 0 ? null : values.notes,
  };
}

export async function createProperty(
  values: PropertyFormValues,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireSessionUser();
  const parsed = propertyFormSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const data = dbWriteable(parsed.data);
  const geocode = data.address ? await geocodeAddress(data.address) : null;

  // Single transaction so the creator's owner-membership is never absent.
  const created = await prisma.$transaction(async (tx) => {
    const property = await tx.property.create({
      data: {
        ...data,
        createdByUserId: user.id,
        lat: geocode?.lat ?? null,
        lon: geocode?.lon ?? null,
        geocodedAt: geocode ? new Date() : null,
      },
    });
    await tx.propertyMember.create({
      data: { propertyId: property.id, userId: user.id, role: ROLE_OWNER },
    });
    return property;
  });

  revalidatePath("/properties");
  redirect(`/properties/${created.id}`);
}

export async function updateProperty(
  id: string,
  values: PropertyFormValues,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireSessionUser();
  if (!(await canAccessProperty(user.id, id, ROLE_OWNER))) {
    return { ok: false, error: "You don't have owner permission on this property." };
  }
  const parsed = propertyFormSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const data = dbWriteable(parsed.data);

  // Re-geocode if (a) the address changed, or (b) the row has an address
  // but no cached coords yet (covers backfill for rows created before
  // geocoding was wired). Casual edits with the same address + valid
  // coords don't burn the free Census quota.
  const existing = await prisma.property.findUnique({
    where: { id },
    select: { address: true, lat: true },
  });
  const addressChanged = (existing?.address ?? null) !== data.address;
  const needsBackfill = data.address != null && existing?.lat == null;
  const geocodeUpdate =
    addressChanged || needsBackfill
      ? data.address
        ? await geocodeAddress(data.address).then((g) => ({
            lat: g?.lat ?? null,
            lon: g?.lon ?? null,
            geocodedAt: g ? new Date() : null,
          }))
        : { lat: null, lon: null, geocodedAt: null }
      : {};

  await prisma.property.update({
    where: { id },
    data: { ...data, ...geocodeUpdate },
  });
  revalidatePath("/properties");
  revalidatePath(`/properties/${id}`);
  redirect(`/properties/${id}`);
}

export async function deleteProperty(id: string): Promise<ActionResult<null>> {
  const user = await requireSessionUser();
  if (!(await canAccessProperty(user.id, id, ROLE_OWNER))) {
    return { ok: false, error: "You don't have owner permission on this property." };
  }
  await prisma.property.delete({ where: { id } });
  revalidatePath("/properties");
  redirect("/properties");
}
