# Deployment

**Inherits the v2 artifact-based deploy contract from vis-daily-tracker verbatim.**

Source-of-truth document: [`C:\Users\tyler\Projects\vis-daily-tracker\docs\deployment.md`](../../vis-daily-tracker/docs/deployment.md). Read that for the full contract — what the tarball contains, how `MANIFEST` works, the schema versioning rules, the prod-installed tooling pattern, the pre-swap verification steps, and rollback semantics.

This document only captures **turf-tracker's specific MANIFEST values and the diffs from vis-daily-tracker's profile**. If you need to understand the contract itself, read the linked file.

---

## MANIFEST values for turf-tracker

```json
{
  "schemaVersion": 2,
  "tag": "v<X.Y.Z>",
  "startCommand": "node server.js",
  "preStartCommands": [
    "prisma migrate deploy",
    "node bin/seed.js"
  ],
  "port": 3000,
  "healthCheckPath": "/api/health",
  "requiredEnv": [
    "DATABASE_URL",
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL",
    "AUTH_PASSWORD_PEPPER"
  ],
  "optionalEnv": [
    "CIMIS_API_KEY",
    "SMTP_HOST", "SMTP_PORT", "SMTP_FROM", "SMTP_FROM_NAME", "SMTP_REPLY_TO"
  ],
  "nodeVersion": "24",
  "requiredTools": {
    "prisma": "^7.8.0"
  }
}
```

`MANIFEST.requiredEnv` mirrors [`src/lib/required-env.json`](../src/lib/required-env.json), which is also the input to [`src/lib/runtime-config.ts`](../src/lib/runtime-config.ts) for fail-fast startup validation. The release workflow reads from the same JSON via `--slurpfile` so source / runtime / contract stay aligned.

The two external integrations live now (US Census Geocoder for property addresses, NWS for current weather + forecast on the apply page) are both **API-key-free**, so neither shows up in `optionalEnv`. If we move to keyed providers — Google Maps for richer geocode / map UX, OpenWeatherMap for non-US coverage — they'd land in `optionalEnv` alongside `CIMIS_API_KEY`.

## Diffs from vis-daily-tracker

| Field | vis-daily-tracker | turf-tracker | Reason |
| --- | --- | --- | --- |
| `requiredEnv` | includes `STORAGE_PATH` | omits `STORAGE_PATH` | No photo uploads yet. Add when photo-attach lands in Phase 4. |
| `optionalEnv` | `GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_KEY` | `CIMIS_API_KEY` | Different external integrations. Geocoding (US Census) + weather (NWS) are key-free. CIMIS for Phase 4 ET₀ auto-fetch. |
| `cli` | declares `bin/dailies.js` + subcommands | absent | No operator CLI shipped. Revisit when we have non-web admin tasks (e.g. soil-test PDF import). |
| `serverExternalPackages` | sharp, prisma client+adapter, libheif-js, exifr | prisma client+adapter, argon2 | No image pipeline yet. |
| `requiredTools.prisma` | `^7.8.0` | `^7.8.0` | In lockstep. |

## Source-side build contract

- `next.config.ts` uses `output: "standalone"` and declares native deps in `serverExternalPackages`
- `package.json` `engines.node` and `.nvmrc` pin Node 24 (matching `MANIFEST.nodeVersion`)
- `npm run build:seed` (`scripts/build-seed.ts`) esbuild-bundles `prisma/seed/index.ts` → `bin/seed.js` so prod can run it via plain `node` without tsx installed. Native externals: `@prisma/*`, `prisma`, `@node-rs/argon2`.
- Conventional Commits (commitlint-enforced) drive semver via `git-cliff` (`cliff.toml`)
- Husky pre-commit hooks are skipped in CI via `HUSKY=0`

## CI / release workflow

`.github/workflows/release.yml` is `workflow_dispatch`-triggered (manual). Two jobs:

1. **gate** — spins up Postgres 17 service, runs `typecheck` + `lint` + `format` + `test`. Verifies Node major pins agree across `NODE_VERSION` env, `.nvmrc`, and `package.json` `engines.node`.
2. **release** — installs `git-cliff`, computes the next version from commit history (or accepts a manual `bump` input), bumps `package.json`, builds the seed bundle + standalone Next bundle, packages the tarball with `BUILD_INFO` + `MANIFEST`, computes `SHA256SUMS`, regenerates `CHANGELOG.md`, commits + tags + pushes, and creates a draft GH Release with the tarball + sums attached before flipping it to published. The two-step publish guarantees the `release.published` webhook only fires once both assets are uploaded.

The `MANIFEST` is built inline in the workflow via `jq` (slurpfile from `src/lib/required-env.json`), so source / runtime / contract stay aligned.

## Phase staging for the deploy contract

- **Phase 0 (done):** localhost only. No CI, no MANIFEST, no prod host. `npm run dev`.
- **Phase 1 (done):** local dev with the full app shape and the calc + apply flow.
- **Phase 2 (now):** `release.yml` lives in this repo. Run "Release" with no bump → first auto-detected tag. Prod-Claude consumes the artifact on the prod host. **This is when the contract becomes load-bearing.**
- **Phase 3+:** family/multi-user remote access via the prod host's public origin (`BETTER_AUTH_URL`).
