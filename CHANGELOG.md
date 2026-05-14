# Changelog
## [0.7.0](https://github.com/Vigario-Technology-Solutions/turf-tracker/compare/v0.6.0...v0.7.0) (2026-05-14)

### Features

* **branding:** DB-driven branding via typed Settings singleton
* **parity:** Port pipetree's recent packaging + CLI patterns
* **parity:** Port more pipetree v2.85-track patterns

### Bug Fixes

* **ci:** Mint App installation token + race-fix tag step + cache@v5

## [0.6.0](https://github.com/Vigario-Technology-Solutions/turf-tracker/compare/v0.5.2...v0.6.0) (2026-05-13)

### Features

* **branding:** Per-deployment branding contract (APP_NAME etc + asset override)
* **auth:** Self-serve password reset + nodemailer SMTP transport

### Bug Fixes

* **packaging:** Remove backticks from sysusers comment to unblock %pre
* **auth:** Password-reset quality pass — rate limit, sentry, unified errors
* **workflow:** Tag-after-artifact ordering in release job
* **cli:** Backup/restore strip prisma-only params before pg_dump

## [0.5.2](https://github.com/Vigario-Technology-Solutions/turf-tracker/compare/v0.5.1...v0.5.2) (2026-05-13)

### Bug Fixes

* **cli:** Turf setup is lossless on re-run + writes to .env in dev
* **packaging:** Parameterize backend port in apache snippet

## [0.5.0](https://github.com/Vigario-Technology-Solutions/turf-tracker/compare/v0.4.0...v0.5.0) (2026-05-13)

### Features

* **dev:** Household seed scenario + auditCli helper for destructive ops
* **packaging:** Operator-driven upgrades with opt-in auto-orchestration
* **cli:** Setup, backup, restore + close upgrade.path daemon-reload race
* **observability:** Wire Sentry init for CLI + seed runtimes

### Bug Fixes

* **cli:** Turf setup first-install user prompt no longer silently skips
* **observability:** External OTel monkey-patch chain + build-on-prod cutover docs
* **ci:** Two release-workflow bugs in "Determine next version"

### Refactoring

* **deploy:** Standardize on vis-daily-tracker build-on-prod contract
* **packaging:** Adopt canonical RPM contract from tylervigario
* **cli:** Externalize @sentry/* and zod from CLI + seed bundles

## [0.4.0](https://github.com/Vigario-Technology-Solutions/turf-tracker/compare/v0.3.0...v0.4.0) (2026-05-09)

### Features

* **cli:** Bundle for prod via esbuild + ship in standalone tar

### Bug Fixes

* **deploy:** Bundle server entry + trace off-tree bundles + standalone-tree smoke

## [0.3.0](https://github.com/Vigario-Technology-Solutions/turf-tracker/compare/v0.2.0...v0.3.0) (2026-05-09)

### Features

* Pull vis-daily-tracker deploy + observability upgrades
* **rules:** Cadence-rules engine + What's next? home view

## [0.2.0](https://github.com/Vigario-Technology-Solutions/turf-tracker/compare/v0.1.0...v0.2.0) (2026-05-04)

### Features

* Variable per-X quantity for product manufacturer rate
* **forms:** Rhf + zodResolver pattern, applied first to sign-up
* **forms:** Roll rhf + zodResolver across every form
* **cli:** Turf operational CLI with users:list + users:create
* **cli:** Users:delete with FK-aware pre-flight
* **ui:** Show APP_VERSION chip in auth + app shells
* **profile:** Editor for name, displayName, defaultProperty, units, password

## [0.1.0](https://github.com/Vigario-Technology-Solutions/turf-tracker/releases/tag/v0.1.0) (2026-05-04)

### Features

* Wire up Better-Auth with email + password
* Sign-up + sign-in pages, auth-gated app shell
* Lookup resolver, per-property guards, Property CRUD
* Area CRUD under property scope
* Calc module with vitest coverage of every spec formula
* Soil test entry with live ESP/SAR/Ca:Mg derivation
* Product CRUD with guaranteed-analysis form
* Apply flow with live math, side-effect warnings, and logging
* Pull live weather on apply via geocoded property + NWS
* Wire up serwist pwa (sw, manifest, offline page, updater)

### Bug Fixes

* Cache lookup rows, not the LookupMap wrapper
* Allow 2-decimal precision on macronutrient ppm fields
* **weather:** Split client-safe types from server-only modules

### Refactoring

* Convert product mfg rate fields from free-text to FK lookups
* Fk product.pkgSizeUnit + application.amountUnit to lookups
* Fk area.headType to IrrigationHeadType lookup
* Shared form Select component, unified empty label

