# Turf Tracker

A mobile-first PWA for area-based plant nutrition decisions. Open the app standing at the property with a sprayer or spreader; three taps to get exact dosage with side-effect warnings and one-tap logging.

Built for any cultivated area — lawn, vegetable bed, rose bed, individual tree. The system uses your soil test, your product library, and your application history to compute rates at the moment of decision rather than making you re-derive the same math every time.

## Status

Phase 1 done (auth, calc, rules engine, apply flow, soil-test entry, product CRUD, weather, PWA). Phase 2 cuts the first signed RPM via `workflow_dispatch` on the release workflow; prod runs `sudo dnf --refresh upgrade turf-tracker`. See [`docs/SPEC.md`](docs/SPEC.md) §8.4 for the phased rollout and [`docs/deployment.md`](docs/deployment.md) for the full deploy contract.

## Stack

Next.js 16 · Prisma 7 · Postgres · Better-Auth · Serwist (PWA) · Tailwind 4 · shadcn/ui · React Hook Form + Zod · Vitest · Sentry

## Quick start

```bash
npm install
cp .env.example .env   # fill in BETTER_AUTH_SECRET + AUTH_PASSWORD_PEPPER
createdb turf_tracker
npm run db:migrate
npm run db:seed
npm run dev
```

## Documentation

- [`docs/SPEC.md`](docs/SPEC.md) — architecture, data model, calculations, workflows
- [`docs/deployment.md`](docs/deployment.md) — RPM-as-artifact deploy contract (what the repo provides, what the host needs)
- [`docs/cli.md`](docs/cli.md) — `turf` operational CLI surface (setup / upgrade / status / backup / restore / users:\*)
- [`CLAUDE.md`](CLAUDE.md) — vocabulary + guardrails for AI-assisted work

## License

Source code: **AGPL-3.0-or-later** — see [LICENSE](LICENSE) for the verbatim license text. If you run a modified version of this code on a network-accessible server, AGPL §13 obligates you to offer the modified source to users interacting with it. This deployment discharges that obligation via the "Source" link in the app footer.
