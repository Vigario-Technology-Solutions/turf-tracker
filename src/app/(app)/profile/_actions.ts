"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { APIError } from "better-auth/api";
import prisma from "@/lib/db";
import { auth } from "@/lib/auth/server";
import { requireSessionUser } from "@/lib/auth/server-session";
import {
  passwordChangeFormSchema,
  profileFormSchema,
  type PasswordChangeFormValues,
  type ProfileFormValues,
} from "@/lib/forms/profile";

/**
 * Profile mutations as server actions. Both go through Better-Auth so
 * the session cookie + `additionalFields` plumbing stays in one place
 * — we don't write to User directly here, even for the simple identity
 * fields. `auth.api.updateUser` filters the body against the configured
 * `additionalFields` on its own.
 *
 * Better-Auth throws `APIError` (3xx/4xx with a body.message) instead
 * of returning result shapes, so each call is wrapped to flatten back
 * into our `{ ok, error }` contract.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

function flattenAuthError(err: unknown, fallback: string): string {
  if (err instanceof APIError) {
    const body = err.body as { message?: unknown } | undefined;
    if (typeof body?.message === "string") return body.message;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

export async function updateProfile(values: ProfileFormValues): Promise<ActionResult> {
  const user = await requireSessionUser();
  const parsed = profileFormSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  // FK exists on User.defaultPropertyId, but a user could (theoretically)
  // pick someone else's property by id. Verify membership before write.
  const defaultPropertyId = data.defaultPropertyId.length === 0 ? null : data.defaultPropertyId;
  if (defaultPropertyId) {
    const membership = await prisma.propertyMember.findUnique({
      where: { propertyId_userId: { propertyId: defaultPropertyId, userId: user.id } },
      select: { propertyId: true },
    });
    if (!membership) return { ok: false, error: "Selected property is not yours." };
  }

  try {
    await auth.api.updateUser({
      headers: await headers(),
      body: {
        name: data.name,
        displayName: data.displayName.length === 0 ? null : data.displayName,
        defaultPropertyId,
        unitSystem: data.unitSystem,
      },
    });
  } catch (err) {
    return { ok: false, error: flattenAuthError(err, "Could not update profile.") };
  }

  revalidatePath("/profile");
  // The header in (app)/layout.tsx renders displayName/name from the
  // session — refresh the shell so the change is visible on next nav.
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function changePassword(values: PasswordChangeFormValues): Promise<ActionResult> {
  await requireSessionUser();
  const parsed = passwordChangeFormSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await auth.api.changePassword({
      headers: await headers(),
      body: {
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
        revokeOtherSessions: true,
      },
    });
  } catch (err) {
    return { ok: false, error: flattenAuthError(err, "Could not change password.") };
  }

  return { ok: true };
}
