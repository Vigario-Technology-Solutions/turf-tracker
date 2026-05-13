import type { MetadataRoute } from "next";
import { APP_NAME, APP_SHORT_NAME } from "@/lib/runtime-config";

// Force per-request evaluation so the operator's APP_NAME /
// APP_SHORT_NAME at runtime wins over whatever was set during the
// build. Without this, Next prerenders the manifest statically using
// build-time env — the RPM would ship with the build's brand and
// ignore /etc/sysconfig overrides. The route is hit once per browser
// install (cached aggressively after) so the dynamic-rendering cost
// is negligible.
export const dynamic = "force-dynamic";

/**
 * PWA manifest served at /manifest.webmanifest by the App Router.
 *
 * Why a route, not /public/manifest.json: brand is per-deployment env
 * (APP_NAME / APP_SHORT_NAME — see docs/platform/branding.md), so the
 * manifest can't be static. The consts are frozen at module-load, so
 * the per-request cost is "build a small object" — negligible,
 * especially against the once-per-install browser cache for manifest
 * fetches.
 *
 * `description`, `theme_color`, `background_color`, `display`, `id`,
 * `categories`, `lang`, `dir`, `launch_handler`, `scope`, and the
 * icon set are app-design constants. If an operator argues otherwise
 * for any of them, that's a separate spec discussion — not currently
 * configurable.
 *
 * Icons: a single SVG at /branding/icon.svg covers every size + both
 * purposes (any + maskable) via `sizes: "any"` + `type:
 * "image/svg+xml"`. The SVG is bundled at public/branding/ and routed
 * through src/app/branding/[...path]/route.ts so an operator's
 * BRANDING_DIR override transparently swaps the icon without code
 * changes.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_SHORT_NAME,
    description: "Field decision tool for area-based plant nutrition",
    id: "turf-tracker",
    lang: "en-US",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    launch_handler: {
      client_mode: "navigate-existing",
    },
    background_color: "#ffffff",
    theme_color: "#171717",
    categories: ["productivity", "utilities"],
    icons: [
      { src: "/branding/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/branding/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
