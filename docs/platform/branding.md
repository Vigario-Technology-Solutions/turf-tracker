# Branding

The codebase identity is `turf-tracker` (package, binary, repo, systemd units, file paths, dev/maintainer artifacts). The **brand the operator's users see** — manifest name, page titles, nav heading, auth chrome, logo — is per-deployment configuration stored in the database. A different operator running the same RPM on a different host sets a different brand without touching the build.

This contract covers four operator-controlled surfaces:

- **`appName`** — full product name (browser title via the root layout's `title.template`, nav heading, manifest `name`)
- **`appShortName`** — constrained-space variant (manifest `short_name`, iOS home-screen pin). Falls back to `appName` when null.
- **`appOwner`** — entity providing the service (auth-page subtitle / company byline). Null hides the subtitle DOM entirely.
- **`logoFile`** — basename under `/var/lib/turf-tracker/branding/` for an operator-uploaded chrome logo. Null falls back to the bundled SVG icon.

`appName` / `appShortName` mirror the W3C Web App Manifest's `name` / `short_name` pair directly. `appOwner` and `logoFile` cover surfaces the manifest doesn't speak to.

## Storage

Singleton `Settings` row (id = 1, enforced by `CHECK (id = 1)` in the migration). Defined in `prisma/schema.prisma`:

```prisma
model Settings {
  id              Int      @id
  appName         String   @default("Turf Tracker")
  appShortName    String?
  appOwner        String?
  logoFile        String?
  updatedAt       DateTime @updatedAt
}
```

DB-layer defaults apply at row creation. Nullable columns are real `string | null` — no empty-string sentinel translation layer.

## Read path: `src/lib/brand.ts`

```ts
import { getBrand } from "@/lib/brand";

// In a server component / route handler / server action:
const brand = await getBrand();
//   brand.appName        : string
//   brand.appShortName   : string  (falls back to appName when DB column is null)
//   brand.appOwner       : string | null
//   brand.logoFile       : string | null
//   brand.chromeLogoSrc  : string  ("/api/branding/logo" or "/branding/icon.svg")
```

`getBrand()` does three things at once:

1. **`await connection()`** opts the calling route out of static prerender. Every chrome page that reads brand is automatically dynamic — no per-route `export const dynamic = "force-dynamic"` needed.
2. **`unstable_cache`** with tag `"brand"` + 60s revalidate. First page render hits Postgres; subsequent renders return the cached value until an admin write calls `revalidateTag("brand", { expire: 0 })` or the TTL expires.
3. **Null/fallback translation.** Null `appShortName` → returns `appName`. Null `logoFile` → `chromeLogoSrc` resolves to the bundled SVG URL.

For non-request contexts (CLI subcommands — where `connection()` would throw "outside of a request"), use `readBrand()` instead. Same data, same cache, no prerender opt-out.

## Write path

Three entry points, all converge on `setBrand()` in `src/lib/brand.ts`:

| Surface | Path | Cache invalidation |
| --- | --- | --- |
| Admin UI (future) | Settings page → `PUT /api/settings` with brand fields | Calls `invalidateBrandCache()` after write — chrome re-renders immediately |
| CLI | `sudo turf brand:set --owner="Mariposa Lawn Care" --app-name="Turf Tracker"` | No revalidate primitive available outside a request context. 60s cache TTL covers it. |
| Direct DB | `psql` UPDATE | Same — 60s cache TTL |

`setBrand()` takes a partial — pass `undefined` to leave a field alone, `null` to clear (where the column is nullable). `appName` is non-nullable; you can change it but you can't clear it.

## Consumers

| Surface | Source file | Field |
| --- | --- | --- |
| PWA manifest `name` | `src/app/manifest.ts` | `appName` |
| PWA manifest `short_name` | `src/app/manifest.ts` | `appShortName` |
| Apple home-screen pin title | `src/app/layout.tsx` — `metadata.appleWebApp.title` | `appShortName` |
| Browser tab / OS window title | `src/app/layout.tsx` — `metadata.title` | `appName` |
| App `applicationName` meta | `src/app/layout.tsx` — `metadata.applicationName` | `appName` |
| Auth chrome heading | `src/app/(auth)/layout.tsx` | `appName` |
| Auth chrome subtitle | `src/app/(auth)/layout.tsx` | `appOwner` (DOM conditionally rendered) |
| App-shell nav heading | `src/app/(app)/layout.tsx` | `appName` |
| Email subject / body brand text | `src/lib/email/mailer.ts` + `src/emails/*.tsx` (threaded as `appName` prop) | `appName` |
| SMTP `From` display name | `src/lib/email/mailer.ts` | `appName` (override via `SMTP_FROM_NAME` env) |

## Chrome logo asset

`Settings.logoFile` holds a basename. Files live under `/var/lib/turf-tracker/branding/` (pre-created by tmpfiles at `0750 turf-tracker:turf-tracker`). The public `/api/branding/logo` route reads `Settings.logoFile`, validates the resolved path stays under the branding subdir (defense in depth against a malicious DB row pointing at `../../../etc/shadow`), and serves the file with `Cache-Control: public, max-age=31536000, immutable`.

Bundled fallback: when `logoFile` is null, `chromeLogoSrc` resolves to `/branding/icon.svg` (served from `public/branding/` by Next's static handler — no route handler needed). Every deploy renders something sensible even before an operator has uploaded a logo.

### Operator workflow

Text fields via CLI (admin UI multipart upload + form is a follow-up):

```bash
sudo turf brand:set --owner="Mariposa Lawn Care"
sudo turf brand:set --app-name="Turf Tracker" --short-name="Turf"
sudo turf brand:set --clear-owner   # remove the subtitle
```

Custom chrome logo (until the upload admin UI ships, manual):

```bash
sudo install -m 0644 -o turf-tracker -g turf-tracker /path/to/logo.png \
    /var/lib/turf-tracker/branding/mariposa.png
sudo turf brand:set --logo-file=mariposa.png
```

Verify what's set:

```bash
sudo -u turf-tracker psql -c 'SELECT * FROM "Settings";'
```

Running service picks up changes within 60 seconds (the unstable_cache revalidate window). Admin-UI saves invalidate the cache for immediate effect.

## Out of scope (codebase identity, not brand)

These stay `turf-tracker` regardless of operator brand setting — they're dev/maintainer-facing:

- `package.json` `name` field
- `README.md`, `CHANGELOG.md`, `CLAUDE.md`
- `docs/**` spec content (this file included)
- Source-code comments referencing the package
- `/usr/bin/turf` binary name
- systemd unit names (`turf-tracker.service`, `turf-tracker-migrate.service`, etc.)
- File paths (`/usr/share/turf-tracker/`, `/var/lib/turf-tracker/`, `/etc/sysconfig/turf-tracker`)
- Database name (operator-chosen via `DATABASE_URL`, conventionally still `turf_tracker`)
- RPM package name, repository identifier, GitHub repo name
- Sentry release identifier (`turf-tracker@${version}`)
- Commit messages, git tags, release notes
- AGPL §13 "Source" footer link — points at the canonical upstream repo, never an operator's fork. The brand changes; the source-disclosure obligation points back to the real source.

Two different audiences:

- **Codebase identity** (`turf-tracker`) is what developers, the package manager, sysadmins, and the Sentry dashboard see. Stable across deploys; never operator-configurable.
- **Brand** (`appName`) is what end-users see in the browser. Operator-configurable per deployment.

Conflating them — e.g., letting an operator change `package.json#name` — breaks dnf, breaks Sentry release tracking, breaks the deploy contract. They are not the same axis.

## Pre-history (do not recreate)

Earlier shape (pre-v0.7): per-deployment branding lived in env vars (`APP_NAME` / `APP_SHORT_NAME` / `APP_OWNER` / `BRANDING_DIR`) read at module load in `src/lib/runtime-config.ts`, surfaced as `const` exports.

That contract failed because Next.js's App Router prerenders pages with no dynamic data dependency at **build time**, not at process boot. The chrome routes (auth layout, app layout, `/manifest.webmanifest`) read the brand consts → static HTML gets generated during `next build` on the GitHub Actions runner → the runner has no operator branding env set, so the build-time fallbacks (`"Turf Tracker"`, `null`, bundled icon URL) get baked into the prerendered HTML → the RPM ships those frozen values → the running operator sets `APP_OWNER` in `/etc/sysconfig/turf-tracker` and restarts, but the HTML on disk in `.next/server/app/*.html` doesn't re-render and the env var never reaches the user.

The fix is structural: brand data must be **request-time** so it can't be baked at build time. DB reads via `getBrand()` + `await connection()` are request-time by construction. Restoring an env-based contract is the wrong direction; any future "settings should be env-driven" argument needs to confront this prerender constraint first.
