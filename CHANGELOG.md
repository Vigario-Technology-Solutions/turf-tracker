# Changelog
## [0.1.0](https://github.com/TylerVigario/turf-tracker/releases/tag/v0.1.0) (2026-05-04)

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

