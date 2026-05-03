"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import prisma from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/server-session";
import { canAccessProperty } from "@/lib/auth/guards";
import { ROLE_OWNER } from "@/lib/constants";
import { geocodeAddress } from "@/lib/weather/geocode";

/**
 * Property mutations as server actions. Rules:
 *   - Create: any signed-in user. Creator is auto-added as `owner`.
 *   - Update / delete: owner-only on that property.
 *   - Members are managed by separate actions in member-actions.ts (deferred).
 *
 * Returns `{ ok: true, id }` or `{ ok: false, error }` so the client
 * form can render an inline error without throwing through the action
 * boundary. Redirects happen on success.
 */

const propertyInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  address: z
    .string()
    .trim()
    .max(200)
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
  return propertyInput.safeParse({
    name: get("name"),
    address: get("address"),
    notes: get("notes"),
  });
}

export async function createProperty(form: FormData): Promise<ActionResult<{ id: string }>> {
  const user = await requireSessionUser();
  const parsed = readForm(form);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const geocode = parsed.data.address ? await geocodeAddress(parsed.data.address) : null;

  // Single transaction so the creator's owner-membership is never absent.
  const created = await prisma.$transaction(async (tx) => {
    const property = await tx.property.create({
      data: {
        ...parsed.data,
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
  form: FormData,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireSessionUser();
  if (!(await canAccessProperty(user.id, id, ROLE_OWNER))) {
    return { ok: false, error: "You don't have owner permission on this property." };
  }
  const parsed = readForm(form);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  // Re-geocode if (a) the address changed, or (b) the row has an address
  // but no cached coords yet (covers backfill for rows created before
  // geocoding was wired). Casual edits with the same address + valid
  // coords don't burn the free Census quota.
  const existing = await prisma.property.findUnique({
    where: { id },
    select: { address: true, lat: true },
  });
  const addressChanged = (existing?.address ?? null) !== parsed.data.address;
  const needsBackfill = parsed.data.address != null && existing?.lat == null;
  const geocodeUpdate =
    addressChanged || needsBackfill
      ? parsed.data.address
        ? await geocodeAddress(parsed.data.address).then((g) => ({
            lat: g?.lat ?? null,
            lon: g?.lon ?? null,
            geocodedAt: g ? new Date() : null,
          }))
        : { lat: null, lon: null, geocodedAt: null }
      : {};

  await prisma.property.update({
    where: { id },
    data: { ...parsed.data, ...geocodeUpdate },
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
