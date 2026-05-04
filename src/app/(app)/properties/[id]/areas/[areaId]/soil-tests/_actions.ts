"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/server-session";
import { canAccessArea } from "@/lib/auth/guards";
import { ROLE_CONTRIBUTOR, ROLE_OWNER } from "@/lib/constants";
import { soilTestFormSchema, type SoilTestFormValues } from "@/lib/forms/soil-test";

/**
 * Soil-test mutations. Per SPEC §5.5 every nutrient field is nullable
 * — different labs report different sets. The newly-created test is
 * set as the area's `currentSoilTestId` (single-test workflow); a
 * separate action lets the user pick a different test as current.
 */

export type ActionResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Coerce form values into the Prisma write shape. Empty strings on
 * optional numeric fields become null; non-empty get parsed.
 */
function dbWriteable(values: SoilTestFormValues, areaId: string) {
  const num = (v: string) => (v.length === 0 ? null : Number(v));
  return {
    areaId,
    testDate: new Date(values.testDate),
    lab: values.lab.length === 0 ? null : values.lab,
    labReportId: values.labReportId.length === 0 ? null : values.labReportId,
    pH: num(values.pH),
    nPpm: num(values.nPpm),
    pPpm: num(values.pPpm),
    kPpm: num(values.kPpm),
    sPpm: num(values.sPpm),
    caPpm: num(values.caPpm),
    mgPpm: num(values.mgPpm),
    naPpm: num(values.naPpm),
    fePpm: num(values.fePpm),
    mnPpm: num(values.mnPpm),
    znPpm: num(values.znPpm),
    cuPpm: num(values.cuPpm),
    bPpm: num(values.bPpm),
    omPct: num(values.omPct),
    cecMeq100g: num(values.cecMeq100g),
    notes: values.notes.length === 0 ? null : values.notes,
  };
}

export async function createSoilTest(
  propertyId: string,
  areaId: string,
  values: SoilTestFormValues,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireSessionUser();
  if (!(await canAccessArea(user.id, areaId, ROLE_CONTRIBUTOR))) {
    return { ok: false, error: "You don't have permission to add soil tests for this area." };
  }
  const parsed = soilTestFormSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  // The new test becomes "current" for the area in the same transaction
  // so the area never points at a deleted/orphaned test.
  await prisma.$transaction(async (tx) => {
    const test = await tx.soilTest.create({ data: dbWriteable(parsed.data, areaId) });
    await tx.area.update({ where: { id: areaId }, data: { currentSoilTestId: test.id } });
  });

  revalidatePath(`/properties/${propertyId}/areas/${areaId}`);
  redirect(`/properties/${propertyId}/areas/${areaId}`);
}

export async function setCurrentSoilTest(
  propertyId: string,
  areaId: string,
  soilTestId: string,
): Promise<ActionResult<null>> {
  const user = await requireSessionUser();
  if (!(await canAccessArea(user.id, areaId, ROLE_CONTRIBUTOR))) {
    return { ok: false, error: "You don't have permission to change this area." };
  }
  // Make sure the test belongs to this area before pointing the FK at it.
  const test = await prisma.soilTest.findFirst({
    where: { id: soilTestId, areaId },
    select: { id: true },
  });
  if (!test) return { ok: false, error: "Soil test not found on this area." };
  await prisma.area.update({ where: { id: areaId }, data: { currentSoilTestId: soilTestId } });
  revalidatePath(`/properties/${propertyId}/areas/${areaId}`);
  return { ok: true, data: null };
}

export async function deleteSoilTest(
  propertyId: string,
  areaId: string,
  soilTestId: string,
): Promise<ActionResult<null>> {
  const user = await requireSessionUser();
  if (!(await canAccessArea(user.id, areaId, ROLE_OWNER))) {
    return { ok: false, error: "Only an owner can delete soil tests." };
  }
  // Clear the FK first if this test is the area's current.
  await prisma.$transaction(async (tx) => {
    await tx.area.updateMany({
      where: { id: areaId, currentSoilTestId: soilTestId },
      data: { currentSoilTestId: null },
    });
    await tx.soilTest.delete({ where: { id: soilTestId } });
  });
  revalidatePath(`/properties/${propertyId}/areas/${areaId}`);
  return { ok: true, data: null };
}
