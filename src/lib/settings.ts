import prisma from "@/lib/db";

/**
 * Read the singleton Settings row. Defaults live at the DB layer via
 * @default on each column; the migration INSERTed id = 1 with those
 * defaults applied, and the seed re-creates the row if it ever goes
 * missing. Callers get a typed row back; nullable columns are real
 * `string | null`.
 *
 * Brand consumers should go through src/lib/brand.ts's getBrand()
 * instead, which adds unstable_cache + null/fallback translation +
 * chromeLogoSrc derivation.
 */
export async function getSettings() {
  return prisma.settings.findUniqueOrThrow({ where: { id: 1 } });
}
