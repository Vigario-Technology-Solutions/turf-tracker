# CLAUDE.md

Context Claude Code needs at the start of every conversation to work effectively on this codebase. Vocabulary + guardrails + canonical paths. Everything else is discoverable via grep/glob — don't duplicate here.

See `docs/SPEC.md` for the build plan and the source-of-truth architecture. See `README.md` for the human-facing pitch.

## What this is

A mobile-first PWA that answers **"what should I do right now in this area?"** for any cultivated piece of ground — lawn, bed, tree, garden. Computes exact application rates from soil tests + product specs at the moment of decision. Logging is a side-effect of using the field tool, not the primary mode.

The lens is always **"what's next?"** never "what did I do?"

## Core vocabulary

- **Area** — the universal primitive. Lawn zone, vegetable bed, rose bed, individual tree (canopy drip line) all share the same `Area` row shape. Has `area_sq_ft`, current soil test, irrigation source.
- **Property** — a grouping of areas under one address. The 3-house operation is 3 Properties × N Areas each.
- **Application** — one product applied to one area at one time. Stored with a snapshot of all delivered nutrients (lb of N, P, K, Ca, Mg, S, micros, Na) so historical math doesn't drift if the product's analysis changes later.
- **Irrigation event** — runtime → inches → gallons → Na deposited. Drives the salt-balance running total per area.
- **Soil test** — input to the rules engine. ESP/SAR/Ca:Mg derived; deficiencies/excesses flagged; per-nutrient season targets generated.
- **Product** — fertilizer or amendment with full guaranteed analysis (NPK + secondary + micros + Na). Granular OR liquid. Tagged with hard-warning flags (`contains_p`, `contains_b`, `contains_na`, `acidifying`, `pgr`, etc.).
- **Recommendation / "What's Next?"** — per-area, ranked next actions computed by pure rule functions in `src/lib/rules/`. The `Recommendation` table is a CACHE; source of truth is the computation. Implements the `Status<V, K>` / `Diagnostic<K>` primitive: every area has `status` + `diagnostics[]` + `diagnosticCounts` rather than boolean rollups. Industry lineage: K8s conditions + LSP diagnostics.
- **Field tool vs desk tool** — the killer flow is the field tool (open app → pick area → pick product → math + warnings + log in 3 taps). Dashboards/season review are secondary.
- **Salt clock** — 240 ppm Na tap water deposits ~1.25 lb Na per inch per 1k sq ft. Reclamation gypsum can only neutralize ~37% of seasonal influx. Gypsum is *defensive maintenance*, not reclamation. This shapes every recommendation rule for the current owner's properties.

## Key paths

```text
src/
├── app/
│   ├── layout.tsx                       # Root layout
│   ├── page.tsx                         # Home (will become "What's next?" view)
│   ├── globals.css                      # Tailwind 4 entry
│   └── api/
│       └── health/route.ts              # Liveness probe (200/503), used by prod deploy script
├── lib/
│   ├── db.ts                            # Prisma client singleton (PrismaPg adapter)
│   ├── constants.ts                     # All lookup row codes + role/tag/rule literals
│   ├── runtime-config.ts                # Fail-fast required-env validator
│   ├── required-env.json                # Single source for required env names (release also reads)
│   ├── auth/                            # Better-Auth setup + getApiContext, guards (TBD Phase 1)
│   ├── calc/                            # Pure formulas (water demand, runtime, Na deposition,
│   │                                    #   product math, conversions). Vitest-tested.
│   └── rules/                           # "What's Next?" rule functions, one file per rule, each pure.
└── instrumentation.ts                   # Calls validateRuntimeConfig() at server start

prisma/
├── schema.prisma                        # Domain + lookup tables (see docs/SPEC.md §5)
├── seed/
│   └── index.ts                         # Idempotent upserts for all lookup rows
└── migrations/                          # Schema-only — no lookup data INSERTs

docs/
├── SPEC.md                              # Architecture + data model + calculations + workflows
├── deployment.md                        # RPM-as-artifact deploy contract — what the repo provides, what the host needs
└── cli.md                               # `turf` CLI surface — operational subcommands + build pipeline
```

## Inherited from sibling projects

This project explicitly inherits conventions and infrastructure from two sibling repos. Reference their `CLAUDE.md` and `docs/` when in doubt — when something here is ambiguous, the answer is "do it like the references do."

- **Reference repos** — `C:\Users\tyler\Projects\tylervigario\` (the landmark — `github.com/TylerVigario/website`, the original RPM-as-artifact pilot) and `C:\Users\tyler\Projects\vis-daily-tracker\` (sibling adopter, a.k.a. pipetree). Pipetree often has the most up-to-date code patterns; the landmark is the source of the deploy contract itself.
- **Deployment contract** — RPM-as-artifact: a tagged commit on `main` is built by CI on a self-hosted GitHub Actions runner running on the prod host, signed (public-signer subkey since turf is a public package, vs the landmark's private-signer), published to `/srv/dnf-repo-public/` (served at `https://repo.tylervigario.com/`), and attached to a GitHub Release. See [`docs/deployment.md`](docs/deployment.md) for the full contract.
- **Lookup table shape** — every `{ id, code, name, sortOrder, active }`. All rows in `prisma/seed/` as idempotent upserts. Migrations are schema-only.
- **DB-driven UI labels** — option lists rendered from lookups, not hardcoded arrays.
- **Form state holds FK IDs end-to-end** — no string-name intermediaries.
- **Constants pattern** — `src/lib/constants.ts` for every FK ID. Never hardcode raw integers.
- **Audit trail discipline** — don't add columns for state the audit log already captures.
- **Pure query-time derivation** — recommendations are computed, not stored. The `Recommendation` table is a cache.
- **Tooling** — Husky pre-commit (`lint-staged` + `typecheck` + `test`), commitlint with minimalist 6-type Conventional Commits (`feat`/`fix`/`refactor`/`docs`/`test`/`chore`), Prettier 100col double-quotes, ESLint flat config type-aware, Vitest.
- **Git workflow** — `pull.rebase=true` + `rebase.autoStash=true`. No merge commits, no force-push on main, no `--amend` on pushed commits, no `--no-verify`.
- **CLAUDE.md philosophy** — vocabulary + guardrails + canonical paths only. Don't duplicate what's discoverable via grep/glob.
- **Backlog** — GitHub Issues with `high`/`medium`/`low` labels. No local `TODO.md`, no `BACKLOG.md`.

## Stack

- **Framework**: Next.js 16 (App Router; RPM-as-artifact deploy, no `output: "standalone"`)
- **DB**: Postgres + Prisma 7 (with `@prisma/adapter-pg`)
- **Auth**: Better-Auth (NOT next-auth)
- **PWA / SW**: Serwist (NOT next-pwa — both deprecated libs, do not introduce)
- **UI**: Tailwind 4 + shadcn/ui (new-york style)
- **Forms**: React Hook Form + Zod
- **State**: Zustand for client UI; server state via Next.js cache + revalidation
- **Charts**: Recharts (when needed)
- **Test**: Vitest

## Commands

```bash
npm install                       # First-time setup (also runs prisma generate)
npm run dev                       # Next.js dev server
npm run dev:server                # tsx server.ts — runs the custom entry for local prod-mimic
npm run build                     # prebuild (check:public-env + build:seed/cli/server) → next build → serwist build → postbuild real-boot smoke
npm run start                     # node server.js (requires npm run build first)
npm run typecheck                 # tsc --noEmit
npm run lint:js                   # ESLint
npm run lint:js:fix               # ESLint with --fix
npm run lint:md                   # markdownlint-cli2
npm run format:fix                # Prettier --write
npm run db:migrate                # prisma migrate deploy
npm run db:seed                   # node bin/seed.js — bundled, prune-safe (requires build:seed first)
npm run ci                        # lint + typecheck + format + test (gate parity)
npm run clean                     # wipe .next, bin, server.js, caches
npm test                          # Vitest run
```

## Environment

- **Dev**: Windows 11 + git-bash. Node via `fnm`. PostgreSQL on localhost:5432 (DB name `turf_tracker`).
- **Prod**: Fedora 43 + systemd. RPM-as-artifact: CI on a self-hosted runner on the prod host produces a signed `.rpm` per release; `dnf upgrade turf-tracker` swaps files in place, then `sudo turf upgrade` (or the opt-in `turf-tracker-upgrade.path` Path unit) runs migrate + seed + restart. See [`docs/deployment.md`](docs/deployment.md).

## Code style & conventions

- Prettier: 100 col, double quotes, trailing commas, semicolons
- ESLint flat config with type-aware rules
- Husky hooks: `pre-commit` runs `lint-staged` + `typecheck` + `test`; `commit-msg` runs `commitlint`
- **Conventional Commits** — `feat` / `fix` / `refactor` / `chore` / `docs` / `test`. Fold elsewhere: `perf` → `refactor`/`fix`, `style` → `chore`, `revert` → `fix`/`chore`, `build` → `chore(build)`, `ci` → `chore(ci)`
- **Path aliases**: `@/*` → `src/*`, `@generated/*` → `generated/*`

## Guardrails — things that break correctness if ignored

- **Never hardcode FK IDs.** Use named constants in `src/lib/constants.ts`. Looking up `AreaType` rows by integer ID anywhere in app code is a bug.
- **Never put lookup data in migration SQL.** All lookup rows live in `prisma/seed/` as idempotent upserts. Migrations are schema-only.
- **Never hardcode option lists in UI.** Render from `getLookups()` results. Adding a new product form / area type means adding a seed row, not a UI change.
- **Never add columns to capture state the audit captures.** If "applied → reverted" needs tracking, that's an audit row, not a `revertedAt` column.
- **Never recommend a P-containing product against the current owner's areas without an explicit override.** Soil P is 7× optimal. The rules engine flags this as a **hard** warning, not a soft one. Same for B-containing products and Na-containing products.
- **Never recommend elemental sulfur** against current owner's areas. Soil pH is already 6.37; S would tank it.
- **Don't confuse the salt clock with the gypsum program.** Salt influx mathematically exceeds reclamation capacity by ~2.7×. Gypsum is defensive maintenance, NOT reclamation. Frame all gypsum recommendations accordingly.
- **Recommendations are derived, not stored.** The `Recommendation` table is a cache invalidated on every relevant write (new application, new soil test, new irrigation event). Source of truth is `computeAreaStatus(areaId)` in `src/lib/rules/`.
- **Don't introduce next-auth or next-pwa.** They're deprecated; we use Better-Auth and Serwist.
- **Don't force-push, amend, or merge-commit on `main`.** Rebase is the workflow.
- **Don't `--no-verify` to skip hooks.** If a hook fails, fix the underlying issue.

## Reference projects

- **website / landmark** (`C:\Users\tyler\Projects\tylervigario\` → `github.com/TylerVigario/website`) — the original RPM-as-artifact pilot. Source of the deploy contract; turf-tracker's `docs/deployment.md` mirrors its structure with turf-specific values + a public-repo + AGPL diff set captured in the "Diffs from website" table.
- **vis-daily-tracker / pipetree** (`C:\Users\tyler\Projects\vis-daily-tracker\`) — sibling adopter. Has the most up-to-date implementation of CLI patterns (setup / upgrade / status / backup / restore / users:create); turf-tracker's CLI mirrors its shape with the model-specific adaptations called out in setup/users:create comments.

## Auto-memory

User's auto-memory at `C:\Users\tyler\.claude\projects\C--Users-tyler\memory\` contains the lawn agronomy context (`user_lawn_garden.md`) and bermuda-cut-height feedback (`feedback_lawn_cut_height.md`) that drove the design of this project. Reference it for "why is the rule engine biased the way it is?" questions.
