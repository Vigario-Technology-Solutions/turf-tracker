/**
 * Per-deployment branding — domain wrapper on top of the typed
 * singleton Settings row. Adds:
 *
 *   1. unstable_cache (tag: "brand", revalidate: 60s) so chrome
 *      renders don't hit Postgres per request.
 *   2. `await connection()` for the request-context read path —
 *      every getBrand() consumer is automatically dynamic, no
 *      per-route `export const dynamic = "force-dynamic"` needed.
 *      This is the canonical fix for the prerender-baked-build-time
 *      branding bug. Pre-v2.85 turf-tracker had env-based branding
 *      (APP_NAME / APP_OWNER / BRANDING_DIR in
 *      /etc/sysconfig/turf-tracker) and the chrome routes are
 *      SSG-prerendered with `runtime-config.ts` consts evaluated at
 *      build time — the build runner has no branding env set, the
 *      build-time fallbacks got baked into static HTML, runtime env
 *      changes could never reach them. DB reads are request-time by
 *      construction.
 *   3. chromeLogoSrc derivation — null logoFile → bundled fallback.
 *
 * Logo storage: `Settings.logoFile` is a basename under
 * `/var/lib/turf-tracker/branding/`. The `/api/branding/logo` route
 * serves the file. Null = chrome falls back to the bundled SVG.
 */

import { revalidateTag, unstable_cache } from "next/cache";
import { connection } from "next/server";
import { getSettings } from "@/lib/settings";

export interface Brand {
  appName: string;
  /** Falls back to appName at read time when null in the DB. */
  appShortName: string;
  /** Null when unset — auth chrome omits the subtitle. */
  appOwner: string | null;
  /** Null when no operator logo. */
  logoFile: string | null;
  /** URL the chrome <Image>/<img> renders. /api/branding/logo when logoFile set; bundled SVG otherwise. */
  chromeLogoSrc: string;
}

// Bundled chrome-logo fallback. Lives at public/branding/icon.svg;
// Next serves it as /branding/icon.svg automatically (no route
// handler needed, /public is the static root).
const FALLBACK_LOGO_SRC = "/branding/icon.svg";

// 60s revalidate window is the floor: admin UI writes also call
// revalidateTag("brand") for immediate feedback; the TTL covers the
// CLI write path (`turf brand:set` from an operator shell can't
// reach Next's revalidate primitives, so brand changes from there
// land within 60s without requiring a service restart).
const _readBrand = unstable_cache(
  async (): Promise<Brand> => {
    const row = await getSettings();
    return {
      appName: row.appName,
      appShortName: row.appShortName ?? row.appName,
      appOwner: row.appOwner,
      logoFile: row.logoFile,
      chromeLogoSrc: row.logoFile ? "/api/branding/logo" : FALLBACK_LOGO_SRC,
    };
  },
  ["brand"],
  { tags: ["brand"], revalidate: 60 },
);

/**
 * Read the current brand. Opts the caller out of static prerender so
 * the value can change with admin writes. Use from Next request
 * contexts (server components, route handlers, server actions).
 */
export async function getBrand(): Promise<Brand> {
  await connection();
  return _readBrand();
}

/**
 * Same brand data, no prerender opt-out. For code paths that run
 * outside a Next request context (CLI subcommands invoking brand-
 * dependent rendering). Still cached.
 */
export async function readBrand(): Promise<Brand> {
  return _readBrand();
}

// setBrand lives in @/lib/settings — a Next-free module — so CLI
// commands that write brand fields don't drag next/cache and
// next/server through the import graph into the CLI bundle. Next-
// side server actions import it from there too; the brand-cache
// invalidation step (Next-only primitive) stays here as
// invalidateBrandCache().
export { setBrand } from "@/lib/settings";

/**
 * Invalidate the brand cache. Call after `setBrand()` from inside a
 * server action or route handler (the only contexts where
 * `revalidateTag` is callable). CLI writes skip this and pick up
 * the change via the 60s revalidate window.
 */
export function invalidateBrandCache(): void {
  // Next 16 dropped the single-arg signature; profile arg is now
  // required. `{ expire: 0 }` is the codebase's pattern for
  // immediate invalidation (no grace window).
  revalidateTag("brand", { expire: 0 });
}
