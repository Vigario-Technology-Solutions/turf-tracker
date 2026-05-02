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
    "prisma": "^7.7.0"
  }
}
```

`MANIFEST.requiredEnv` mirrors [`src/lib/required-env.json`](../src/lib/required-env.json), which is also the input to [`src/lib/runtime-config.ts`](../src/lib/runtime-config.ts) for fail-fast startup validation. The release workflow reads from the same JSON so source / runtime / contract stay aligned.

## Diffs from vis-daily-tracker

| Field | vis-daily-tracker | turf-tracker | Reason |
| --- | --- | --- | --- |
| `requiredEnv` | includes `STORAGE_PATH` | omits `STORAGE_PATH` | Phase 0 has no photo uploads. Add when photo-attach lands in Phase 4. |
| `optionalEnv` | `GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_KEY` | `CIMIS_API_KEY` | Different external integrations. CIMIS for Phase 4 ET₀ auto-fetch. |
| `cli` | declares `bin/dailies.js` + subcommands | absent | No operator CLI shipped initially. Revisit when we have non-web admin tasks (e.g. soil test PDF import). |
| `serverExternalPackages` | sharp, prisma client+adapter, libheif-js, exifr | prisma client+adapter, argon2 | No image pipeline yet. |
| `requiredTools.prisma` | `^7.8.0` | `^7.7.0` | Pinned slightly looser; tighten when we lock a specific feature. |

## Source-side build contract

- `next.config.ts` uses `output: "standalone"` and declares native deps in `serverExternalPackages`
- `package.json` `engines.node` and `.nvmrc` pin Node 24 (matching `MANIFEST.nodeVersion`)
- `npm run build:seed` (TBD: add `scripts/build-seed.ts`) esbuild-bundles `prisma/seed/index.ts` → `bin/seed.js` so prod can run it via plain `node` without tsx installed
- Conventional Commits + semver tagging (same convention as vis-daily-tracker)

## Phase staging for the deploy contract

- **Phase 0 (now):** localhost only. No CI, no MANIFEST, no prod host. `npm run dev`.
- **Phase 1:** still local dev; deploy contract is dormant.
- **Phase 2 (first prod cut):** stand up GitHub Actions `release.yml` matching vis-daily-tracker's, tag `v0.1.0`, prod-Claude consumes the artifact on the prod host (or a parallel one). This is when the contract becomes load-bearing.
- **Phase 3+:** family/multi-user remote access via the prod host's public origin (`BETTER_AUTH_URL`).

Until Phase 2 there's nothing to do here — this file exists so when we get there, the contract is documented and prod-Claude can work against it without surprises.
