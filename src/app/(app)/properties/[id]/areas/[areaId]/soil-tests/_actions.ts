"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import prisma from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/server-session";
import { canAccessArea } from "@/lib/auth/guards";
import { ROLE_CONTRIBUTOR, ROLE_OWNER } from "@/lib/constants";

/**
 * Soil-test mutations. Per SPEC §5.5 every nutrient field is nullable —
 * different labs report different sets. We accept blank → null for
 * everything except `testDate`. The newly-created test is set as the
 * area's `currentSoilTestId` (single-test workflow); a separate action
 * lets the user pick a different test as current later.
 */

export type ActionResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

const optionalNumber = z
  .string()
  .trim()
  .transform((v) => (v.length === 0 ? null : Number(v)))
  .pipe(z.number().nonnegative("Must be ≥ 0").nullable());

const optionalString = z
  .string()
  .trim()
  .max(200)
  .transform((v) => (v.length === 0 ? null : v));

const soilTestInput = z.object({
  testDate: z
    .string()
    .min(1, "Test date is required")
    .transform((v, ctx) => {
      const d = new Date(v);
      if (isNaN(d.getTime())) {
        ctx.addIssue({ code: "custom", message: "Invalid test date" });
        return z.NEVER;
      }
      return d;
    }),
  lab: optionalString,
  labReportId: optionalString,
  pH: z
    .string()
    .trim()
    .transform((v) => (v.length === 0 ? null : Number(v)))
    .pipe(z.number().min(0).max(14).nullable()),
  nPpm: optionalNumber,
  pPpm: optionalNumber,
  kPpm: optionalNumber,
  sPpm: optionalNumber,
  caPpm: optionalNumber,
  mgPpm: optionalNumber,
  naPpm: optionalNumber,
  fePpm: optionalNumber,
  mnPpm: optionalNumber,
  znPpm: optionalNumber,
  cuPpm: optionalNumber,
  bPpm: optionalNumber,
  omPct: z
    .string()
    .trim()
    .transform((v) => (v.length === 0 ? null : Number(v)))
    .pipe(z.number().min(0).max(100).nullable()),
  cecMeq100g: optionalNumber,
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
  return soilTestInput.safeParse({
    testDate: get("testDate"),
    lab: get("lab"),
    labReportId: get("labReportId"),
    pH: get("pH"),
    nPpm: get("nPpm"),
    pPpm: get("pPpm"),
    kPpm: get("kPpm"),
    sPpm: get("sPpm"),
    caPpm: get("caPpm"),
    mgPpm: get("mgPpm"),
    naPpm: get("naPpm"),
    fePpm: get("fePpm"),
    mnPpm: get("mnPpm"),
    znPpm: get("znPpm"),
    cuPpm: get("cuPpm"),
    bPpm: get("bPpm"),
    omPct: get("omPct"),
    cecMeq100g: get("cecMeq100g"),
    notes: get("notes"),
  });
}

export async function createSoilTest(
  propertyId: string,
  areaId: string,
  form: FormData,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireSessionUser();
  if (!(await canAccessArea(user.id, areaId, ROLE_CONTRIBUTOR))) {
    return { ok: false, error: "You don't have permission to add soil tests for this area." };
  }
  const parsed = readForm(form);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  // The new test becomes "current" for the area in the same transaction
  // so the area never points at a deleted/orphaned test.
  await prisma.$transaction(async (tx) => {
    const test = await tx.soilTest.create({ data: { ...parsed.data, areaId } });
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
