# CLI tooling

How CLI scripts are categorized, built, and shipped (or not) to prod.
Standard Node-CLI pattern: **one binary, many subcommands**, dispatched
by `commander`. Same shape as `prisma`, `next`, `vitest`, `eslint`.

Mirrors vis-daily-tracker's [`docs/cli.md`](../../vis-daily-tracker/docs/cli.md);
read that for any rationale not duplicated here.

## Three classes

CLI scripts split by **runtime audience**. Each class has its own home
in the source tree and a different fate in the build.

### Dev-only — [`scripts/`](../scripts/)

Run via `tsx` during local development. Never invoked on prod.

| Script | Purpose |
| --- | --- |
| `check-public-env.ts` | Build-time check that every required `NEXT_PUBLIC_*` referenced in `src/` is set. Wired into `prebuild`. |
| `postbuild.ts` | Real-boot smoke against the just-built `server.js` with hermetic stub env. Wired into `postbuild`. |

### Build pipeline — [`scripts/`](../scripts/) (output ships in tar)

esbuild-bundled artifacts that the runtime invokes via plain `node`.
Each runs `--check` after build to catch cold-start failures at build
time.

| Script | Output | When it runs |
| --- | --- | --- |
| `build-seed.ts` | `bin/seed.js` | `prebuild` |
| `build-cli.ts` | `bin/turf.js` + `bin/cli-manifest.json` | `prebuild` |
| `build-server.ts` | `server.js` (at repo root) | `prebuild` |

### Prod ops — [`src/cli/commands/`](../src/cli/commands/)

Subcommands of the single shipped binary. Live under `src/cli/` so
they sit alongside the app code they import from (`@/lib/db`,
`@/lib/auth`, etc.) and bundle cleanly. Organized by namespace.

| Subcommand | Source | Purpose |
| --- | --- | --- |
| `users:create` | `src/cli/commands/users/create.ts` | Create a user with an email + password (mirrors web signup). |
| `users:list` | `src/cli/commands/users/list.ts` | List all users with their property-membership counts. |
| `users:delete` | `src/cli/commands/users/delete.ts` | Delete a user; refuses if they own history records (Property/Product/Application/IrrigationEvent — those don't cascade). |

## Layout

```text
src/cli/
├── index.ts                # entry; wraps program in error formatter
├── program.ts              # createProgram() — calls each namespace's register()
├── shared/
│   └── prompts.ts          # readline-based text/password/confirm/select + table()
└── commands/
    └── users/              # users:create, users:list, users:delete
```

`src/cli/index.ts` is the binary's entry point — it constructs the
`commander` program and dispatches. Each namespace's `index.ts` owns
its own subcommand registrations, so adding a new command is one
import + one call in the namespace index, plus the command file.

## Build pipeline

A single `esbuild` bundle, driven by
[`scripts/build-cli.ts`](../scripts/build-cli.ts). Output lands at
`bin/turf.js`, both locally (`npm run build:cli`) and on the deploy
host as part of `npm run build`.

Bundle settings:

- `format=esm`, `target=node24` — matches the prod runtime.
- **External**: `@prisma/*`, `prisma`, `@node-rs/argon2`. Resolved at
  runtime against the artifact's full `node_modules/` (build-on-prod
  ships every dep `npm ci --omit=dev` installs). Native + Prisma
  stays external.
- **Why bundle vs not**: the bundle has to survive
  `npm prune --omit=dev` so prod can run `node bin/turf.js` even
  after the prune step strips devDeps. Bundling pulls third-party
  JS deps into the binary so they're prune-safe; externals are
  runtime-resolved against `dependencies` (which `prune` leaves alone).
  `prisma` is in `dependencies` precisely for this reason.
- **Shebang** lives in `src/cli/index.ts` (esbuild preserves it).
- **Banner**: `createRequire` shim so bundled CJS deps can call
  `require()` from within the ESM bundle.
- `chmod +x` is applied by the build script after esbuild writes.
- A companion `bin/cli-manifest.json` is emitted alongside the
  bundle — `{ binary, subcommands }` introspected from the
  `commander` program. Available for operational tooling that
  wants a declarative subcommand list without invoking the binary.

`package.json#bin` declares the binary for npm-convention discovery:

```json
{
  "bin": { "turf": "./bin/turf.js" }
}
```

Not used by prod (we don't `npm install` the package globally), but
it's standard and lets dev workflows do `npm link` for local testing.

> **Dev caveat:** `bin/turf.js` only exists after a build. For
> day-to-day dev, run subcommands via `npm run turf -- <subcommand>`
> (which uses `tsx`) — no bundle needed. `bin/` is gitignored.

## The binary

Prod usage:

```sh
turf users:list
turf users:create --email tyler@example.com --name "Tyler"
turf users:delete --email tyler@example.com
turf --help
turf users:list --help
```

`commander` provides `--help`, validates flags, dispatches subcommands,
and produces real error messages on typos (`error: unknown command 'foo'`
instead of `Cannot find module`).

## Env loading

The binary itself does **not** source any env file. It assumes every
var in [`src/lib/required-env.json`](../src/lib/required-env.json) is
already exported into the process. Splitting source-vs-prod ownership:
source ships a pure dispatcher; prod handles environment loading.

The specific env-file path is prod's choice. What matters is that every
var in `required-env.json` is exported into the process before the
binary runs.

**Interactive SSH** — prod ships a thin shim at `/usr/local/bin/turf`:

```sh
#!/bin/sh
# /usr/local/bin/turf — prod-owned shim, regenerated per-deploy to
# invoke the same Node major as the server (matching
# package.json#engines.node, currently 24.x). Invoking node
# explicitly (instead of relying on the binary's
# `#!/usr/bin/env node` shebang) keeps the CLI on the same Node
# major as the server — @node-rs/argon2 is compiled per-major and
# a mismatch produces NODE_MODULE_VERSION failures.
set -a
. /opt/turf-tracker/.env
set +a
exec /usr/bin/node-24 /opt/turf-tracker/current/bin/turf.js "$@"
```

**Systemd-invoked ops** — direct invocation with `EnvironmentFile=`:

```ini
[Service]
EnvironmentFile=/opt/turf-tracker/.env
ExecStart=/usr/bin/node-24 /opt/turf-tracker/current/bin/turf.js users:list
WorkingDirectory=/opt/turf-tracker/current
```

Both patterns satisfy the env contract and runtime-alignment rule.
Pick per use case; the shim is the default for human ops because it
covers the interactive-shell case the systemd pattern can't.

## Subcommand conventions

- **Interactive when possible.** Prompt for missing required flags
  rather than failing — see `users:create` for the existing pattern.
- **Idempotent.** Re-runs are safe. Confirmation-gated destructive ops
  refuse on first call when state is unsafe (e.g. `users:delete`
  refuses if the user owns non-cascading history records).
- **Exit codes.** `0` success, non-zero on any failure. `commander`
  defaults are fine.
- **Logging to stderr.** Progress and status go to stderr so
  `journalctl` and direct invocations show output in real time.
  **stdout is currently unused** and reserved for future
  machine-readable output (JSON for piping); never emit
  human-readable progress there.
- **Error formatting.** The entry point catches uncaught errors from
  action handlers and renders them as a single `error: <message>`
  line to stderr, exiting with code `1`. Stack traces are
  suppressed — for dev debugging, run subcommands directly with
  `tsx src/cli/index.ts <subcommand>` and let Node print the trace.

## Bootstrap (first admin)

Chicken-egg: the app has no users on first deploy.

1. Deploy the first release.
2. SSH into prod.
3. `turf users:create --email <you> --name "Your Name"`.
4. Prompts for a password interactively and creates the user.
5. Log in via the web UI; create your first Property; you're now the
   `owner` on that property.

After bootstrap, all further user / property / area management can
happen via the web UI; the CLI stays as the escape hatch
(lost-admin recovery, ops scripting).

## Adding a new subcommand

1. Write the subcommand module under `src/cli/commands/<namespace>/`.
   Follow the conventions above. Each module exports
   `register(program: Command): void` that calls `program.command(...)`.
2. Add it to the namespace's `index.ts` (one import + one call to
   `register(program)`). New namespace? Create
   `src/cli/commands/<namespace>/index.ts` exporting
   `registerXxx(program)` and call it from `src/cli/program.ts`.
3. Document the subcommand in the table above.

No build pipeline changes needed — esbuild picks up new subcommands
automatically via the import graph, and `bin/cli-manifest.json` is
regenerated from the `commander` program on every build.
