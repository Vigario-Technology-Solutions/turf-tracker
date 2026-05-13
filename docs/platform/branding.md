# Branding

The codebase identity is `turf-tracker` (package, binary, repo, systemd units, file paths, dev/maintainer artifacts). The **brand the operator's users see** — manifest name, page titles, nav heading, login chrome, logos/icons — is per-deployment configuration. A different operator running the same RPM on a different host sets a different brand without touching the build.

This contract covers four operator-controlled surfaces:

- **`APP_NAME`** — full product name (browser title, nav heading, auth chrome, manifest `name`)
- **`APP_SHORT_NAME`** — constrained-space variant (manifest `short_name`, iOS home-screen pin)
- **`APP_OWNER`** — entity providing the service (auth-page subtitle / company byline)
- **`BRANDING_DIR`** — operator-managed asset directory (logo and icon overrides over the bundled default)

`APP_NAME` / `APP_SHORT_NAME` mirror the W3C Web App Manifest's `name` / `short_name` directly. `APP_OWNER` and `BRANDING_DIR` cover surfaces the manifest doesn't speak to.

## The text contract

| | `APP_NAME` | `APP_SHORT_NAME` | `APP_OWNER` |
| - | - | - | - |
| **Purpose** | Full product name | Constrained-space variant for home-screen labels | Entity providing the service (operator's company) |
| **Default** | `Turf Tracker` (shipped in `/usr/lib/turf-tracker/default.env`) | `APP_NAME` when unset | Unset — auth chrome renders no subtitle |
| **Required?** | No — silently falls back. | No — falls back to `APP_NAME`. | No — surface gracefully omits the subtitle. |
| **Length** | Any length the surface accepts. Long strings elide naturally in OS shortcut UIs. | W3C spec recommends ≤12 chars for reliable home-screen rendering; not enforced. | Any. Auth chrome wraps if it has to. |
| **Override location** | `/etc/sysconfig/turf-tracker` | `/etc/sysconfig/turf-tracker` | `/etc/sysconfig/turf-tracker` |
| **Read semantics** | **Freeze-at-startup.** Captured once at module load, surfaced as a `const`. No `process.env` reads on hot paths. Brand changes require `systemctl restart turf-tracker.service`. | Same. | Same. |

## Consumers

| Surface | Source file | Reads | Notes |
| - | - | - | - |
| PWA manifest `name` | `src/app/manifest.ts` | `APP_NAME` | Install dialogs, app switcher |
| PWA manifest `short_name` | `src/app/manifest.ts` | `APP_SHORT_NAME` | Home-screen icon label on Android |
| Apple home-screen pin title | `src/app/layout.tsx` — `metadata.appleWebApp.title` | `APP_SHORT_NAME` | iOS displays this under the home-screen icon |
| Browser tab / OS window title | `src/app/layout.tsx` — `metadata.title.template` | `APP_NAME` | Wraps every page title as `<page> — <APP_NAME>` |
| App `applicationName` meta | `src/app/layout.tsx` — `metadata.applicationName` | `APP_NAME` | Some browsers + OS shortcut UIs |
| Auth-page brand title | `src/app/(auth)/layout.tsx` | `APP_NAME` | Above the sign-in / sign-up card |
| Auth-page subtitle / byline | `src/app/(auth)/layout.tsx` | `APP_OWNER` | Conditionally rendered — unset → no subtitle DOM at all |
| App-shell nav heading | `src/app/(app)/layout.tsx` | `APP_NAME` | Brand link in the top bar |
| Favicon + apple-touch-icon | `src/app/layout.tsx` — `metadata.icons` | Asset URL at `/branding/icon.svg` | Routed through `/branding/[...path]` |
| Manifest icons (any + maskable) | `src/app/manifest.ts` | Asset URL at `/branding/icon.svg` | Same SVG covers every size and both purposes via `sizes: "any"` |

All consumers read the const at module-load time. There's no per-request env read on a hot path, and there's no brand env var baked into the client bundle (server-only — no `NEXT_PUBLIC_` prefix). Client components needing a brand string receive it as a prop from a server parent.

## The manifest route

`public/manifest.json` is removed; `src/app/manifest.ts` replaces it as a Next App Router route handler.

```typescript
// src/app/manifest.ts (excerpt)
export const dynamic = "force-dynamic";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_SHORT_NAME,
    /* ... app-design constants ... */
    icons: [
      { src: "/branding/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/branding/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
```

`force-dynamic` is load-bearing: without it Next prerenders the manifest statically at build time and the operator's `/etc/sysconfig/turf-tracker` overrides have no effect (the prerendered file ships with the build's `APP_NAME`). The route is hit once per browser install (cached aggressively after), so per-request rendering is negligible.

`description`, `theme_color`, `background_color`, `display`, `id`, `categories`, `lang`, `dir`, `launch_handler`, `scope`, and the icon set are app-design constants. If a future operator argues otherwise for any of them, that's a separate spec discussion.

## Asset override

### `CHROME_LOGO_SRC`

```typescript
export const CHROME_LOGO_SRC: string = ((): string => {
  if (BRANDING_DIR) {
    for (const ext of ["svg", "png"] as const) {
      if (existsSync(path.join(BRANDING_DIR, `logo.${ext}`))) {
        return `/branding/logo.${ext}`;
      }
    }
  }
  return "/branding/icon.svg";
})();
```

Resolves at module load. Operator drops `logo.svg` (preferred) or `logo.png` inside `BRANDING_DIR` and the const points at it. Without one, the bundled icon fills in so the chrome still renders something sensible. (Currently the auth chrome doesn't reference `CHROME_LOGO_SRC` — it's exported for future use when a logo affordance lands.)

### The `/branding/` route

`src/app/branding/[...path]/route.ts` serves every asset under the `/branding/` URL space:

- If `BRANDING_DIR` is set AND `${BRANDING_DIR}/<requested-path>` exists → serve operator file.
- Otherwise → serve bundled `public/branding/<requested-path>`.
- Path traversal guard: requested path must resolve under the chosen base dir (no `../escapes`).
- Cache headers: `Cache-Control: public, max-age=3600` — moderate cache (operator may swap files during a branding session); browsers won't re-fetch hot icons every minute.

All asset URLs in the codebase route through `/branding/<file>`. The Next route picks the source.

### Bundled files (`public/branding/`)

Repo ships a single SVG covering every icon need:

```text
public/branding/
└── icon.svg            (green ground + white "T" — neutral default,
                         scales to any size, used for favicon + PWA
                         icons + apple-touch-icon)
```

A single SVG works because modern PWA manifests accept `sizes: "any"` + `type: "image/svg+xml"` for unified scaling. Chrome / Firefox / Edge handle it directly; iOS rasterizes for the home-screen icon. Operators who want PNG bytes for tighter control drop them in `BRANDING_DIR` (e.g. `icon-192.png`) and update the manifest entries via a fork; or, more commonly, just override `icon.svg` itself.

### Operator workflow

```bash
sudo mkdir -p /etc/turf-tracker/branding

# (Optional) Drop a chrome logo if you have a distinct product brand:
sudo cp /path/to/our-logo.svg /etc/turf-tracker/branding/logo.svg

# (Optional) Replace the bundled icon with your own:
sudo cp /path/to/icon.svg /etc/turf-tracker/branding/icon.svg

echo 'BRANDING_DIR=/etc/turf-tracker/branding' | sudo tee -a /etc/sysconfig/turf-tracker
sudo systemctl restart turf-tracker.service
```

Operator drops only the files they want to override; any file missing from `BRANDING_DIR` falls through to the bundled default. Partial brands (just the logo, generic icon) are supported.

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
- **Brand** (`APP_NAME`) is what end-users see in the browser. Operator-configurable per deployment.

Conflating them — e.g., letting an operator change `package.json#name` — breaks dnf, breaks Sentry release tracking, breaks the deploy contract. They are not the same axis.

## Default-vs-override semantics

The two-layer env mechanism (`/usr/lib/turf-tracker/default.env` shipped + `/etc/sysconfig/turf-tracker` operator override) governs every branding var with no special-casing:

```bash
# /usr/lib/turf-tracker/default.env   (RPM-owned, do NOT edit)
APP_NAME=
APP_SHORT_NAME=
APP_OWNER=
BRANDING_DIR=

# /etc/sysconfig/turf-tracker         (operator-owned, optional)
APP_NAME=Acme Lawn Care
APP_SHORT_NAME=Acme
APP_OWNER=Acme Property Management
BRANDING_DIR=/etc/turf-tracker/branding
```

Default-env keys ship empty (not "Turf Tracker") so the operator's intent is unambiguous: every key they set in the override is theirs; every key they leave out falls through to the codebase default in `runtime-config.ts`. `turf setup` does not prompt for branding — operators who want to brand edit `/etc/sysconfig/turf-tracker` directly after first install.
