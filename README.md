# Turf Tracker

A mobile-first PWA for area-based plant nutrition decisions. Open the app standing at the property with a sprayer or spreader; three taps to get exact dosage with side-effect warnings and one-tap logging.

Built for any cultivated area — lawn, vegetable bed, rose bed, individual tree. The system uses your soil test, your product library, and your application history to compute rates at the moment of decision rather than making you re-derive the same math every time.

## Status

Phase 0 — initial scaffolding. See [`docs/SPEC.md`](docs/SPEC.md) for the full build plan and architecture. See [`HANDOFF.md`](HANDOFF.md) for the bring-up checklist (delete after first read).

## Stack

Next.js 16 · Prisma 7 · Postgres · Better-Auth · Serwist (PWA) · Tailwind 4 · shadcn/ui · React Hook Form + Zod · Vitest

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

- [`docs/SPEC.md`](docs/SPEC.md) — architecture, data model, calculations, workflows, deployment
- [`docs/deployment.md`](docs/deployment.md) — inherited v2 artifact contract
- [`CLAUDE.md`](CLAUDE.md) — vocabulary + guardrails for AI-assisted work

## License

Private. Personal project.
