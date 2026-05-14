import prisma from "@/lib/db";

/**
 * Pure DB access for the singleton Settings row. Zero Next imports
 * so this module is safe to pull into the CLI bundle — a CLI command
 * that writes brand fields can `import { setBrand } from "@/lib/settings"`
 * without dragging next/cache or next/server (with its
 * top-level-await + __dirname bundling quirk) into bin/turf.js.
 *
 * Brand READ consumers in Next route code should go through
 * src/lib/brand.ts's getBrand() instead — that wraps this layer with
 * unstable_cache + connection() + chromeLogoSrc derivation for the
 * Next request path.
 *
 * Defaults: live at the DB layer via @default on each Settings column.
 * The initial migration INSERTs id=1 with those defaults; the seed
 * re-creates the row if it ever goes missing. Callers get a typed
 * row back; nullable columns are real `string | null`.
 */
export async function getSettings() {
  return prisma.settings.findUniqueOrThrow({ where: { id: 1 } });
}

/**
 * Update brand fields on the singleton Settings row. CLI writes
 * (`turf brand:set`) call this directly. Next-side server actions
 * call setBrand AND invalidateBrandCache() — the latter from
 * @/lib/brand, which is the only module that can revalidateTag
 * (Next-only primitive). CLI writes skip the cache invalidation and
 * pick up the change via @/lib/brand's 60s unstable_cache revalidate
 * window.
 */
export async function setBrand(data: {
  appName?: string;
  appShortName?: string | null;
  appOwner?: string | null;
  logoFile?: string | null;
}): Promise<void> {
  await prisma.settings.update({ where: { id: 1 }, data });
}
