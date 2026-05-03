import "server-only";
import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { ROLE_OWNER, ROLE_CONTRIBUTOR, ROLE_VIEWER } from "@/lib/constants";
import type { ApiContext } from "./api-auth";

/**
 * Authorization helpers for API routes + server actions.
 *
 * Roles in turf-tracker are per-property — every check needs (userId,
 * propertyId, minRole). The role hierarchy is:
 *
 *   viewer < contributor < owner
 *
 * Higher role = strictly more allowed. A "min" of `contributor` lets
 * contributors and owners through; viewers bounce.
 */

export type PropertyRole = typeof ROLE_OWNER | typeof ROLE_CONTRIBUTOR | typeof ROLE_VIEWER;

const ROLE_RANK: Record<PropertyRole, number> = {
  [ROLE_VIEWER]: 1,
  [ROLE_CONTRIBUTOR]: 2,
  [ROLE_OWNER]: 3,
};

/** 401 — caller has no valid session at all. */
export function unauthorized(): NextResponse {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/** 403 — caller has a session but lacks permission for this resource. */
export function forbidden(message = "Forbidden"): NextResponse {
  return NextResponse.json({ error: message }, { status: 403 });
}

/**
 * Resolve the caller's role on a property, or null if they're not a
 * member. Result is the literal stored on PropertyMember.role.
 */
export async function getPropertyRole(
  userId: string,
  propertyId: string,
): Promise<PropertyRole | null> {
  const member = await prisma.propertyMember.findUnique({
    where: { propertyId_userId: { propertyId, userId } },
    select: { role: true },
  });
  if (!member) return null;
  if (member.role in ROLE_RANK) return member.role as PropertyRole;
  return null;
}

/**
 * True iff the caller's role on `propertyId` is at least `min`. Use as
 * the standard guard at the top of write handlers:
 *
 *   if (!(await canAccessProperty(ctx.userId, propId, ROLE_CONTRIBUTOR))) {
 *     return forbidden();
 *   }
 */
export async function canAccessProperty(
  userId: string,
  propertyId: string,
  min: PropertyRole,
): Promise<boolean> {
  const role = await getPropertyRole(userId, propertyId);
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

/**
 * Convenience: fetch the property's owning area's propertyId, then
 * check role. Useful when handlers receive an areaId and need the
 * property-level permission check.
 */
export async function canAccessArea(
  userId: string,
  areaId: string,
  min: PropertyRole,
): Promise<boolean> {
  const area = await prisma.area.findUnique({
    where: { id: areaId },
    select: { propertyId: true },
  });
  if (!area) return false;
  return canAccessProperty(userId, area.propertyId, min);
}

export type ApiContextOk = ApiContext;
