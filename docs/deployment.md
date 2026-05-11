# Deployment

This doc is turf-tracker's source-side deploy contract. It mirrors
the structure of [`vis-daily-tracker/docs/deployment.md`](../../vis-daily-tracker/docs/deployment.md) —
turf-tracker standardizes on that contract and only the values change.
For the canonical rationale of any section here (model, supply-chain
notes, prune-safety, etc.), read the vis-daily-tracker version.

## Model

**Build-on-prod.** Production clones a tagged commit, runs
`npm ci && npm run build`, and runs the resulting bundle.

The prior contract (CI-built tarballs with `output: "standalone"`)
relied on Next's static-trace machinery to ship a minimized
`node_modules/`. Apps with CLI tooling, dynamic requires, custom
server entrypoints, or CJS/ESM interop edges keep violating its
preconditions. Build-on-prod removes the translation step.

## Required runtime

| Requirement | Source of truth |
| --- | --- |
| Node major | `package.json#engines.node` (currently `24.x`) |
| npm | bundled with Node |
| git | for `git clone` |
| PostgreSQL client libraries (`libpq`, `openssl`) | native `pg` driver + Prisma engines |

Native-module policy, source-repo access, external-dependency uptime,
and supply-chain trust — same notes as vis-daily-tracker. The clone
URL is `github.com/TylerVigario/turf-tracker`.

## What the repository provides

A tagged commit on `main` whose tree, after `npm ci && npm run build`,
contains:

| Path | Purpose |
| --- | --- |
| `package.json` | `engines.node`, `scripts.start`, `scripts.build`, `dependencies` / `devDependencies` |
| `package-lock.json` | Lockfile for deterministic `npm ci` |
| `src/lib/required-env.json` | The required-env contract. Imported by `src/lib/runtime-config.ts` so deploy-time and runtime checks stay in lockstep. |
| `server.js` | Custom entrypoint (after build). Graceful SIGTERM/SIGINT — in-flight drain, Prisma disconnect, Sentry flush, exit 0. |
| `prisma.config.ts` | Schema path and datasource URL config. Read by the `prisma` CLI from cwd. |
| `prisma/schema.prisma` + `prisma/migrations/*` | Schema and migration SQL files. |
| `bin/seed.js` (after build) | Pre-compiled seed runner. Idempotent upserts of all lookup data. |
| `bin/turf.js` (after build) | Operational CLI binary. See [cli.md](cli.md). |
| `.next/` (after build) | Next.js build output. |

## Build

`npm run build` runs the prebuild chain
(`check:public-env`, `build:seed`, `build:cli`, `build:server`), then
`next build && serwist build`, then a postbuild step that real-boot
smokes the just-built bundle.

**`check:public-env` is strict.** Same shape as vis-daily-tracker —
scans `src/` for `process.env.NEXT_PUBLIC_*`, fails the build if any
referenced var is missing from the build-time environment. Allowlist
is currently `NEXT_PUBLIC_SENTRY_DSN` (warn-only when absent).

**The postbuild smoke** spawns `node server.js` on a random loopback
port with a hermetic stub environment, waits up to 30 seconds for
the port to bind, sends SIGTERM, asserts a clean exit-0 within a
further 10-second budget.

**Hermetic stub environment.** Every required-env value is forced
regardless of inherited env:

- `DATABASE_URL` → `postgresql://smoke:smoke@db.smoke.invalid:5432/smoke`. The `.invalid` TLD is RFC 6761-reserved as guaranteed-unresolvable; eager DB touch at module-load fails `ENOTFOUND` and the build aborts.
- `SENTRY_DSN` → empty string. Sentry init no-ops.
- `NODE_ENV` → `production`.
- `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `AUTH_PASSWORD_PEPPER` → long-enough placeholder strings.

**Clean-exit assertion.** SIGTERM and wait up to 10s for `exit(0)`.
Non-zero exit, signal-driven exit, or no exit fails the build —
catches the shutdown-handler-bug class. Skipped on Windows
(POSIX-only — Node's child_process can't deliver real signals on
Windows).

**What the smoke catches:** module resolution failures, ESM/CJS
interop errors, runtime-config validation, startup import-graph
errors, listen() succeeding, shutdown reaching exit 0.

**What it doesn't:** real DB connectivity, real Sentry transport,
real SMTP, real filesystem layout, real env shape. Those belong to
the production-side pre-swap smoke.

## Start

`npm start` invokes `node server.js`. The entrypoint binds `PORT`
(default `3000`) on `HOSTNAME` (default `127.0.0.1`). The loopback
default is safe-by-default: a deploy without an explicit `HOSTNAME`
override is reachable only through the local reverse proxy.
Production exposes by overriding `HOSTNAME=0.0.0.0`.

## Environment variables

### Runtime required

Canonical list at [`src/lib/required-env.json`](../src/lib/required-env.json):

```json
["DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "AUTH_PASSWORD_PEPPER"]
```

Validated at startup by [`src/lib/runtime-config.ts`](../src/lib/runtime-config.ts).

- `BETTER_AUTH_URL` is the public origin (e.g. `https://turf.example.com`). Server-side absolute URL generation and CSRF origin checks rely on it.
- `AUTH_PASSWORD_PEPPER` rotation invalidates all existing passwords.

### Runtime optional

App silently degrades when these are missing:

```text
CIMIS_API_KEY        (ET₀ auto-fetch — deferred to Phase 4)
SMTP_HOST
SMTP_PORT
SMTP_FROM
SMTP_FROM_NAME
SMTP_REPLY_TO
SENTRY_DSN
```

### Build + runtime

```text
NEXT_PUBLIC_SENTRY_DSN           (optional — SDK no-ops if absent)
```

Currently the only `NEXT_PUBLIC_*` referenced in `src/`. The
geocoder (US Census) and weather (NWS) integrations are key-free.

### Build-time only (optional)

Sentry source-map upload during `next build`:

```text
SENTRY_AUTH_TOKEN
SENTRY_ORG
SENTRY_PROJECT
```

Write-scoped credentials, build-only. Absent → upload skipped, build
succeeds, stack traces in Sentry stay minified.

## Health endpoint

`GET /api/health` returns `200 {"status":"ok"}` when the DB is
reachable, `503` when not. Served by
[`src/app/api/health/route.ts`](../src/app/api/health/route.ts).

The route does `SELECT 1` — schema-agnostic. Compatible with any
schema state including the previous release's. Required for the
migration backward-compatibility invariant (see vis-daily-tracker
deployment.md).

The path is hardcoded in this contract. Any change to it gets
reflected here.

## Database

Migrations: `npm run db:migrate` (= `prisma migrate deploy`). Run
from the release directory so prisma reads `prisma.config.ts` from
cwd. Idempotent.

Seed: `node bin/seed.js`, run after migrations. Idempotent (`upsert`
by `code`). Bundled by `build:seed` so it works after `npm prune
--omit=dev` strips the seed-script's tsx dev dependency. Same applies
to `bin/turf.js` (the operational CLI).

**Prune-safety.** `prisma` is classified in `dependencies` (not
`devDependencies`) because `npm run db:migrate` needs it after any
prune step. `npm prune --omit=dev` is therefore safe to run at any
point in the deploy sequence.

**Migration backward-compatibility invariant.** New code must boot
against the previous release's schema. Enforced by the production-
side pre-swap smoke (boots new bundle against the live DB before
applying migrations). Build's postbuild smoke is hermetic and never
touches a DB — does not contribute to this invariant.

## Shutdown contract

`server.js` handles SIGTERM and SIGINT gracefully:

1. `server.close()` + `server.closeIdleConnections()`.
2. Drain in-flight HTTP with a 30-second hard cap (then `closeAllConnections()`).
3. `await prisma.$disconnect()`.
4. `await Sentry.close(2000)`.
5. `process.exit(0)`.

Same shape as vis-daily-tracker but without the WebSocket close step
— turf-tracker has no WS surface yet. Add it when the realtime
transport lands.

systemd's `KillSignal=SIGTERM` and `TimeoutStopSec=90s` are both
correct for this contract.

## What's not in this doc

These belong to the production environment:

- Deploy trigger (webhook, operator command, etc.)
- Release directory layout and retention
- Pre-swap smoke against the real environment
- Atomic symlink swap mechanics
- Post-swap health check and rollback
- Database snapshot/backup strategy

## Diffs from vis-daily-tracker

| Field | vis-daily-tracker | turf-tracker | Reason |
| --- | --- | --- | --- |
| `requiredEnv` | includes `STORAGE_PATH` | omits | No photo uploads yet. Add in Phase 4. |
| `optionalEnv` | `GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_KEY` | `CIMIS_API_KEY` | Different external integrations; geocoder + weather are key-free. |
| Custom server | hosts WebSocket upgrade | shutdown handler only | No realtime transport yet. |
| `serverExternalPackages` | sharp, prisma client+adapter, libheif-js, exifr | prisma client+adapter, argon2 | No image pipeline. |
| CSP `connect-src` | allows `*.googleapis.com` / `*.gstatic.com` | `'self'` only | No Google Maps. Sentry uses same-origin `tunnelRoute: "/monitoring"`. |
