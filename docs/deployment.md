# Deployment

This is the source-side deploy contract: what the repository provides
at a tagged commit, what the runtime needs, and the invariants
production can rely on. Operating the deployed service (cutover,
rollback, fleet management) is out of scope here.

Mirrors [`tylervigario/docs/deployment.md`](../../tylervigario/docs/deployment.md) —
turf-tracker standardizes on that contract and only the values change.

## Model

**RPM-as-artifact.** A tagged commit on `main` is built by CI on a
self-hosted GitHub Actions runner (running on the prod host) into a
signed `turf-tracker-<version>-1.fc43.x86_64.rpm`, copied into
`/srv/dnf-repo-public/` (served at `https://repo.tylervigario.com/`),
and attached to the GitHub Release. Production installs it with
`sudo dnf --refresh upgrade turf-tracker`.

`turf-tracker` is a **public** package — it goes to the WAN-facing
repo at `https://repo.tylervigario.com/`, not the LAN-only
`http://repo.lan/` (`/srv/dnf-repo-private/`, reserved for
Tyler-business apps without a wider audience).

The self-hosted runner sidesteps the GitHub→prod inbound network
problem. The runner connects outbound to GitHub for job pickup;
publish is a local file move into the dnf repo dir. No inbound SSH
or HTTPS to the home server is required.

## RPM dependencies

Declared by `packaging/turf-tracker.spec`'s `Requires:`:

| Package | Why |
| --- | --- |
| `nodejs24` | Runtime. Service unit's `ExecStart` is `/usr/bin/node-24` — the parallel-install package's versioned binary, not the unversioned `node`. |
| `systemd` | Service unit + `%systemd_post/_preun/_postun` macros, `%sysusers_create_package` in `%pre` (via `systemd-sysusers`), and `systemctl` in `%posttrans` for the migrate/seed/restart orchestration. Declared `Requires(pre/post/preun/postun/posttrans)` for every scriptlet phase that touches it. |

Deliberately NOT declared:

- **Apache (`httpd`, `mod_ssl`)** — the package ships an Apache *snippet*
  at `/usr/share/<pkg>/apache-snippet.conf` that the operator can
  Include from their own vhost, but doesn't dictate the reverse-proxy
  choice. Operators using nginx/Caddy/etc. simply ignore the snippet.
- **`shadow-utils`** — the package declares the `turf-tracker` system
  user via a sysusers.d snippet processed by `systemd-sysusers` (which
  is part of `systemd`). No `useradd` invocation in `%pre`.
- **Postgres** — the DB lives external to the application host (or on
  the same host, managed separately). `DATABASE_URL` in the operator's
  env override file points wherever your Postgres is.

No SELinux fcontext rules ship with the package either. Apache (or
whatever proxy) talks to `:3000` over TCP, so the default labels on
the RPM-owned paths (`usr_t`, `var_lib_t`, `var_cache_t`) are
sufficient — there's nothing for the proxy to read off-tree that
would need its own label.

## Infrastructure prerequisite

The host must already be subscribed to the public dnf repo
(`https://repo.tylervigario.com/`) with the signing key trusted.
Bootstrap:

```bash
sudo rpm --import https://repo.tylervigario.com/RPM-GPG-KEY-server-admin
sudo curl -fsSLo /etc/yum.repos.d/server-admin-public.repo \
    https://repo.tylervigario.com/server-admin-public.repo
```

Both `.repo` file and pubkey are served as static files from the repo
itself (not packaged) to avoid the bootstrap chicken-and-egg of
installing a package to discover where to install packages from. The
public endpoint requires no source-IP gate — it's WAN-facing and any
consumer can subscribe.

## Per-host runtime environment

Two-layer environment:

1. **Canonical defaults** at `/usr/lib/turf-tracker/default.env` —
   read-only, RPM-owned. Lists every env var the app understands and
   the documented defaults for the optional ones.
2. **Operator overrides** at `/etc/sysconfig/turf-tracker` —
   not RPM-owned, optional. Anything the operator sets here wins
   over the default.

The systemd unit loads both via two `EnvironmentFile=` directives
(later overrides earlier — standard systemd semantics). The operator
override file is loaded with `-` prefix, so its absence is not an
error — but the runtime-config validator at startup will refuse to
boot if the required keys are still empty after both files are
processed, so for prod the operator MUST create the override file
with real values for `DATABASE_URL`, `BETTER_AUTH_SECRET`,
`BETTER_AUTH_URL`, and `AUTH_PASSWORD_PEPPER`.

Required keys (validated at startup by
[`src/lib/runtime-config.ts`](../src/lib/runtime-config.ts) against
[`src/lib/required-env.json`](../src/lib/required-env.json)):

| Variable | Default | Notes |
| --- | --- | --- |
| `HOSTNAME` | `127.0.0.1` | Bind addr. Reverse-proxy fronts on `:443`. |
| `PORT` | `3000` | Bind port. |
| `DATABASE_URL` | (empty — required) | `postgresql://` URL. |
| `BETTER_AUTH_SECRET` | (empty — required) | Min 32 chars. `openssl rand -base64 32`. |
| `BETTER_AUTH_URL` | (empty — required) | Public origin (e.g. `https://turf.tylervigario.com`). |
| `AUTH_PASSWORD_PEPPER` | (empty — required) | Min 32 chars. Rotation invalidates all passwords. |
| `SMTP_*` | (empty) | Optional. Empty disables email send paths. |
| `CIMIS_API_KEY` | (empty) | Optional. Phase 4 ET₀ auto-fetch. |
| `SENTRY_DSN` | (empty) | Optional. Empty disables server-side Sentry. |

CI's `npm run build` exercises a hermetic postbuild smoke against
the required-env contract — drift between
`src/lib/required-env.json` and `runtime-config.ts` fails the build
before it can become a release. [`tests/required-env.test.ts`](../tests/required-env.test.ts)
asserts the JSON shape on every CI run and every pre-commit.

## What the RPM ships

All paths read-only, RPM-owned:

| Path | Purpose |
| --- | --- |
| `/usr/share/turf-tracker/server.js` | Custom Next.js entrypoint (compiled from `server.ts`). |
| `/usr/share/turf-tracker/.next/` | Next build output. |
| `/usr/share/turf-tracker/.next/cache` | Symlink → `/var/cache/turf-tracker/`. Next's runtime cache writes redirected into a writable, systemd-managed dir. |
| `/usr/share/turf-tracker/node_modules/` | Full prod dep tree incl. native bindings (@node-rs/argon2, prisma engines). |
| `/usr/share/turf-tracker/public/` | Static assets + service worker (`sw.js`). |
| `/usr/share/turf-tracker/bin/turf.js` | Operational CLI binary (esbuild-bundled). See [cli.md](cli.md). |
| `/usr/share/turf-tracker/bin/seed.js` | Pre-compiled seed runner. Idempotent upserts of all lookup data. Run by the seed oneshot from `%posttrans`. |
| `/usr/share/turf-tracker/bin/turf.js` | Operational CLI core (esbuild-bundled). See [cli.md](cli.md). |
| `/usr/share/turf-tracker/bin/cli-manifest.json` | Introspected subcommand list for operational tooling. |
| `/usr/share/turf-tracker/prisma/` | `schema.prisma` + `migrations/`. Read by the migrate oneshot's `prisma migrate deploy`. |
| `/usr/share/turf-tracker/prisma.config.ts` | Prisma config — schema path + datasource URL resolver. |
| `/usr/share/turf-tracker/generated/` | Generated Prisma client (output target `../generated/prisma`). |
| `/usr/share/turf-tracker/package.json` | Read by Node at startup. |
| `/usr/share/turf-tracker/apache-snippet.conf` | Reverse-proxy snippet — operator Includes from their own vhost. |
| `/usr/lib/turf-tracker/default.env` | Canonical env defaults — read-only, RPM-owned. |
| `/usr/lib/systemd/system/turf-tracker.service` | Main service unit. |
| `/usr/lib/systemd/system/turf-tracker-migrate.service` | One-shot that applies pending Prisma migrations. Started from `%posttrans` on every dnf transaction; no `[Install]` so it never runs on boot. |
| `/usr/lib/systemd/system/turf-tracker-seed.service` | One-shot that upserts lookup-table rows. Ordered `After=` the migrate unit; same lifecycle. |
| `/usr/lib/tmpfiles.d/turf-tracker.conf` | tmpfiles backstop for state dirs. |
| `/usr/lib/sysusers.d/turf-tracker.conf` | Declarative `turf-tracker` user/group definition (processed by `systemd-sysusers` from `%pre`). |
| `/usr/bin/turf` | CLI wrapper. Sources the two-layer env and exec's `node-24` against the bundled CLI core. Operators run `sudo turf <subcommand>` without knowing the env-file paths. |

NOT shipped, operator-owned:

| Path | Purpose |
| --- | --- |
| `/etc/httpd/conf.d/<vhost>.conf` (or wherever) | Operator's vhost — picks domain, TLS cert paths, log paths. `Include`s `/usr/share/turf-tracker/apache-snippet.conf` inside. |
| `/etc/sysconfig/turf-tracker` | Operator env overrides — `DATABASE_URL`, Better-Auth secrets, SMTP creds, Sentry DSN, anything host-specific. Required for the app to boot. |
| `/etc/systemd/system/turf-tracker.service.d/*.conf` | Operator drop-ins for resource limits, `OnFailure=` notification, etc. |
| `/etc/letsencrypt/live/<domain>/...` | TLS certs, certbot-managed. |
| The Postgres database itself | External; `DATABASE_URL` points at it. Backups operator-owned. |

Created at runtime by the service unit:
`/var/lib/turf-tracker/` (StateDirectory) and
`/var/cache/turf-tracker/` (CacheDirectory). The `.next/cache`
symlink resolves through the latter.

## Migrations + seed

Migrations and lookup-data seeding are scoped to **RPM transactions**,
not boot. The spec's `%posttrans` scriptlet runs once per
`dnf install/upgrade/downgrade turf-tracker`:

```
systemctl daemon-reload
systemctl start turf-tracker-migrate.service
systemctl start turf-tracker-seed.service
systemctl try-restart turf-tracker.service
```

Both unit files (`turf-tracker-migrate.service`,
`turf-tracker-seed.service`) are `Type=oneshot` with **no `[Install]`
section** — they aren't pulled in by the main unit's dependency chain
and don't run on boot. `systemctl start` on a `Type=oneshot` unit
blocks until `ExecStart` completes, so migrate finishes before seed
starts and seed finishes before main restarts. No `|| :` after each
— if migrate or seed fails, the scriptlet fails loudly and the
operator sees the error in `dnf`'s output.

Why this shape rather than `ExecStartPre=`:

- Migrations are something a *release* brings, not something *boot*
  brings. A transient DB unavailability at host boot becomes a
  Prisma connect-retry on the main service rather than an
  `ExecStartPre` failure that exhausts `StartLimitBurst`.
- Operators can manually retry: `sudo systemctl start
  turf-tracker-migrate.service`. No need to restart main (which would
  drop in-flight connections) just to retry a migration.
- Seed only runs when an RPM transaction lands, not on every restart.
  Lookup data changes infrequently and rides the upgrade.

The `%postun` scriptlet uses bare `%systemd_postun` (not
`%systemd_postun_with_restart`) — the `_with_restart` variant would
fire BEFORE `%posttrans` and restart main against the old schema.
Restart is owned by the `try-restart` line at the end of `%posttrans`,
which runs *after* migrate + seed.

**Migration backward-compatibility invariant.** New code must boot
against the previous release's schema for a brief window — the
main service is `RestartSec=5` and Prisma reconnects to the DB at
runtime, so during the gap between `dnf` unpacking the new files
and `%posttrans` finishing the migrate-then-restart sequence, the
already-running main process may briefly see the old schema. A
migration that drops columns, renames without aliases, or changes
types in ways the previous release can't tolerate becomes a
multi-step deploy: ship the additive change first, let it propagate,
then ship the destructive cleanup.

## Build

`packaging/turf-tracker.spec` drives the build. The self-hosted
runner invokes `rpmbuild -ba` directly on the prod host — the spec's
`%build` runs `npm ci && npm run build` (which also exercises
`scripts/build-server.ts`, `scripts/build-seed.ts`,
`scripts/build-cli.ts`, and `scripts/postbuild.ts`'s real-boot smoke).

Because the runner IS Fedora 43 on x86_64, the native bindings the
RPM ships (`@node-rs/argon2`'s `.node`, prisma engine binaries)
match the runtime glibc exactly. Hosts running anything else are
out of scope.

The build is `BuildArch: x86_64` (not `noarch`) for the same reason
— the bundled native bindings make the whole RPM arch-dependent.

The rpmbuild `_topdir` is `$RUNNER_TEMP/rpmbuild` (not
`$GITHUB_WORKSPACE/rpmbuild` or `$HOME/rpmbuild`). `RUNNER_TEMP` is
emptied at the start and end of every job, so the build is hermetic
across runs with no cleanup step. It also sits outside the workspace,
which avoids Turbopack's project-root walker resolving up to the
actions/checkout copy of the repo (whose `package-lock.json` one
directory above the rpmbuild BUILD tree would otherwise mis-chunk
the bundle and ship broken instrumentation-hook chunks).

## Required `NEXT_PUBLIC_*` at build time

`scripts/check-public-env.ts` scans `src/` for `process.env.NEXT_PUBLIC_*`
references and fails the build if any required public env var is
missing or empty in the build-time environment. Optional public vars
(allowlisted in the script — currently just `NEXT_PUBLIC_SENTRY_DSN`)
emit a warning instead.

The RPM build deliberately leaves `NEXT_PUBLIC_SENTRY_DSN` empty.
Client-side Sentry DSN is configured per-host at runtime via
`/etc/sysconfig/turf-tracker`, not baked into the build.

## Signing

Two signing subkeys live on the prod host's master keyring at
`/etc/server-admin/gnupg/` (root-only). Master fingerprint:
`EC7FD18BBAFFA8A05AD0FC2ADE09D5ECD557FA4B`.

| Subkey | Used by |
| --- | --- |
| **public-signer** | Public-facing packages including this one. Bound via `/root/.rpmmacros`'s `%_gpg_name` on the prod host's signing path. |
| **private-signer** | LAN-only packages (website, dailies, server-admin-*). Not used by this RPM. |

Both cross-signed by the master, so `RPM-GPG-KEY-server-admin` (the
pubkey snapshot consumers import) validates signatures from either.
Revoking one doesn't affect the other.

`github-runner` (the self-hosted Actions runner's system user) has
zero key material. The workflow calls `sudo /usr/bin/rpmsign --addsign`
via a narrow sudoers rule at `/etc/sudoers.d/github-runner-rpmsign`
(operator-managed on prod, not shipped by this package). The rule
scopes to RPMs under `/var/lib/github-runner/runner/_work/_temp/rpmbuild/RPMS/x86_64/*.rpm`.
Actual signing runs as root, which reads `/root/.rpmmacros` (bound to
public-signer's fingerprint for this repo's runner). Compromise scope
of `github-runner` is "can sign an RPM at the sudoers-allowed path,"
not "can take the subkey elsewhere."

Subkey rotation procedure: see
[`tylervigario/docs/deployment.md`](../../tylervigario/docs/deployment.md)
"Signing → Subkey rotation". The signing infrastructure is shared
across all apps under the same master keyring; rotating either subkey
affects every package using it.

## Versioning + tagging

`workflow_dispatch` on `release.yml` is the sole release entry
point. The workflow:

1. Determines the next version via `git-cliff --bumped-version` (or
   the `bump` workflow input).
2. Updates `package.json`, regenerates `CHANGELOG.md` +
   `RELEASE_NOTES.md`, commits `chore(release): v<version>`,
   annotated-tags, pushes.
3. Builds + signs the RPM on the self-hosted runner (sign via `sudo
   rpmsign`; public-signer subkey on prod's keyring), copies it into
   `/srv/dnf-repo-public/`, runs `createrepo_c --update`.
4. Creates the GitHub Release with the signed RPM attached.

Conventional Commits drives the bump magnitude:

| Type | Bump |
| --- | --- |
| `feat` | minor |
| `fix`, `refactor` | patch |
| `docs`, `test`, `chore` | none (no release) |

Dispatching with no releasable commits since the last tag is a no-op
— git-cliff says "nothing to bump" and the workflow's
`tag-already-exists` guard refuses. Force a bump by landing at
least one `fix`/`feat`/`refactor` commit first; the `bump` input
selects magnitude, not whether to bump.

## Production cycle

Reference, not contract:

```bash
sudo dnf --refresh upgrade turf-tracker
sudo systemctl status turf-tracker
curl -sf https://turf.tylervigario.com/api/health
```

`--refresh` invalidates dnf's cached repo metadata so a
just-published version is visible immediately.

Rollback:

```bash
sudo dnf downgrade turf-tracker-<previous-version>
# or
sudo dnf history list turf-tracker
sudo dnf history undo <id>
```

The downgrade transaction re-fires `%posttrans`, so the migrate +
seed oneshots run against the rolled-back version's bundled
`prisma/migrations/` directory — but `prisma migrate deploy` only
applies forward, never reverses. If a rollback hits an
incompatible-schema window, the operator runs the appropriate
`prisma migrate resolve` or down-migration manually before the
migrate oneshot can succeed.

## Diffs from website (reference implementation)

| Field | website | turf-tracker | Reason |
| --- | --- | --- | --- |
| Distribution | Private (`/srv/dnf-repo-private/`, `http://repo.lan/`) | Public (`/srv/dnf-repo-public/`, `https://repo.tylervigario.com/`) | turf-tracker is shareable; website is a Tyler-business app. |
| Signing subkey | `private-signer` | `public-signer` | Matches distribution side. Both cross-signed by the same master, so consumers verify either against `RPM-GPG-KEY-server-admin`. |
| License | Proprietary | AGPL-3.0-or-later | turf-tracker is shareable open source; reciprocal license preserves the source-availability invariant for any modified network-deployed fork. |
| Native deps | `better-sqlite3` | `@node-rs/argon2` + prisma engines | Different DB + auth stack. |
| DB | SQLite, file on disk under StateDirectory | Postgres, external | Multi-user + multi-property scale needed Postgres. |
| Required env | `SQLITE_PATH` only | `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `AUTH_PASSWORD_PEPPER` | Auth not stubbed; Postgres connection string vs file path. |
| Migrate/seed mechanism | none (sqlite has no explicit migrations) | Separate `*-migrate.service` + `*-seed.service` oneshots invoked from `%posttrans`. | Prisma schema lifecycle needs to run before the new code, but it's release-scoped (not boot-scoped) — decoupled units let a transient DB issue at boot become a Prisma reconnect rather than a `StartLimit`-exhausting `ExecStartPre` failure. |
| Bundled artifacts | server.js + Next tree + /usr/bin/dailies wrapper | + bin/turf.js (CLI core) + /usr/bin/turf wrapper + bin/seed.js + prisma/ + generated/ + prisma.config.ts | turf-tracker ships an operational CLI; Prisma needs schema + generated client at runtime. |
| Gate `Validate build` env | `NEXT_PUBLIC_SENTRY_DSN` only | + `BETTER_AUTH_SECRET` placeholder | Better-Auth's library-level default-secret check fires during `next build`. |
