import type { MetadataRoute } from "next";
import { getBrand } from "@/lib/brand";

/**
 * PWA manifest served at /manifest.webmanifest by the App Router.
 *
 * Why a route, not /public/manifest.json: brand fields (`name`,
 * `short_name`) are per-deployment DB-backed config (see
 * docs/platform/branding.md), so the manifest can't be static. Each
 * request hits getBrand() which is unstable_cache-backed — sub-ms
 * after the first request, negligible against the once-per-install
 * browser cache for manifest fetches. getBrand()'s `await
 * connection()` opts this route out of prerender automatically.
 *
 * `description`, `theme_color`, `background_color`, `display`, `id`,
 * `categories`, `lang`, `dir`, `launch_handler`, `scope`, and the
 * icon set are app-design constants. If an operator argues otherwise
 * for any of them, that's a separate spec discussion — not currently
 * configurable.
 *
 * Icons: a single SVG at /branding/icon.svg covers every size + both
 * purposes (any + maskable) via `sizes: "any"` + `type:
 * "image/svg+xml"`. The SVG is bundled at public/branding/ and Next
 * serves it as a static asset.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const brand = await getBrand();
  return {
    name: brand.appName,
    short_name: brand.appShortName,
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
