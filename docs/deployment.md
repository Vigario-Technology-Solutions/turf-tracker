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
| `/usr/share/turf-tracker/bin/turf.js` | Operational CLI core (esbuild-bundled). Invoked through `/usr/bin/turf` (the wrapper), not directly. See [cli.md](cli.md). |
| `/usr/share/turf-tracker/bin/seed.js` | Pre-compiled seed runner. Idempotent upserts of all lookup data. Invoked by `turf-tracker-seed.service`. |
| `/usr/share/turf-tracker/bin/cli-manifest.json` | Introspected subcommand list for operational tooling. |
| `/usr/share/turf-tracker/prisma/` | `schema.prisma` + `migrations/`. Read by the migrate oneshot's `prisma migrate deploy`. |
| `/usr/share/turf-tracker/prisma.config.ts` | Prisma config — schema path + datasource URL resolver. |
| `/usr/share/turf-tracker/generated/` | Generated Prisma client (output target `../generated/prisma`). |
| `/usr/share/turf-tracker/package.json` | Read by Node at startup. |
| `/usr/share/turf-tracker/apache-snippet.conf` | Reverse-proxy snippet — operator Includes from their own vhost. |
| `/usr/lib/turf-tracker/default.env` | Canonical env defaults — read-only, RPM-owned. |
| `/usr/lib/systemd/system/turf-tracker.service` | Main service unit. |
| `/usr/lib/systemd/system/turf-tracker-migrate.service` | Migration oneshot. Not enabled, no `[Install]` — invoked by `turf upgrade`. |
| `/usr/lib/systemd/system/turf-tracker-seed.service` | Lookup-data seed oneshot, ordered `After=turf-tracker-migrate.service`. Same lifecycle as migrate — invoked by `turf upgrade`, not enabled. |
| `/usr/lib/systemd/system/turf-tracker-upgrade.path` | Opt-in Path unit watching `/usr/share/turf-tracker/package.json` for changes. When enabled, triggers `turf-tracker-upgrade.service` on every `dnf upgrade`. Not enabled by default — operator opts in once with `sudo systemctl enable --now turf-tracker-upgrade.path`. |
| `/usr/lib/systemd/system/turf-tracker-upgrade.service` | Oneshot wrapper around `turf upgrade`, invoked by the Path unit OR directly by an operator (`sudo systemctl start turf-tracker-upgrade.service`). Not enabled at boot. |
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

## Database

Migrations and seed data are applied by `turf upgrade` — never on
boot, never on a plain `systemctl restart`, never as a side effect of
`dnf install` / `dnf upgrade`. The release files land first; the
operator (or the opt-in Path unit) drives the orchestration step
separately. Matches the canonical Fedora pattern (`dnf upgrade
postgresql-server` lands files; `postgresql-setup --upgrade` is a
separate operator step).

The mechanism is two systemd oneshot units that exist to be invoked
explicitly by `turf upgrade`:

- `turf-tracker-migrate.service` — runs `prisma migrate deploy` against the configured `DATABASE_URL`.
- `turf-tracker-seed.service` — runs `node bin/seed.js` (idempotent upsert of all lookup data).

Neither unit ships an `[Install]` section. Neither is enabled. The
main service does NOT pull them in via `Requires=`. They sit dormant
until `turf upgrade` (manual or auto-orchestrated via the Path unit)
invokes them — boot doesn't trigger them, plain `systemctl restart`
doesn't trigger them, and `dnf upgrade` doesn't trigger them from
the spec scriptlet either.

### Why operator-driven instead of auto-applied in %posttrans

Two earlier designs ran the migrate/seed/restart chain automatically:

1. **`Requires=` + `RemainAfterExit=yes` on migrate.service.** After
   first boot, migrate is `active (exited)` and stays that way; the
   `%systemd_postun_with_restart` macro then restarts main on upgrade
   but DOESN'T re-trigger migrate (systemd sees it as still active).
   Main restarts on new code against OLD schema. Silent breakage.
2. **`%posttrans` runs migrate + seed + try-restart on every dnf
   transaction.** Fixes the silent-breakage bug from (1), but conflates
   "files installed" with "data initialized" in a way the canonical
   Fedora pattern deliberately separates. First install hits a
   chicken-egg with `/etc/sysconfig` (need it before %posttrans, can't
   get the template until install lands). Operators in maintenance
   windows can't stage the file change separately from the schema
   change. Tyler-shaped UX optimization at the cost of canonicalness
   and operator agency.

Current design: `dnf install` / `dnf upgrade` only lands files +
runs `systemctl daemon-reload` so new unit files are visible. The
orchestration step (`turf upgrade`) is a discrete operator action —
manual by default, opt-in for auto-orchestration via the
`turf-tracker-upgrade.path` systemd Path unit. Mirrors
postgresql-setup / mariadb-secure-installation discipline while
preserving the one-command opt-in for operators who want it.

### Migrate unit

```ini
[Unit]
Description=Prisma migrations for turf-tracker
After=network-online.target postgresql.service
Wants=network-online.target postgresql.service

[Service]
Type=oneshot
User=turf-tracker
Group=turf-tracker
WorkingDirectory=/usr/share/turf-tracker
EnvironmentFile=/usr/lib/turf-tracker/default.env
EnvironmentFile=-/etc/sysconfig/turf-tracker
Environment=NODE_ENV=production
Environment=HOME=/var/lib/turf-tracker
ExecStart=/usr/bin/node-24 node_modules/.bin/prisma migrate deploy
TimeoutStartSec=infinity
```

`TimeoutStartSec=infinity` because a real production migration on a
large dataset can legitimately exceed systemd's default 90s start
timeout. An operator killing the run mid-migration is a worse
outcome than waiting.

### Seed unit

Same shape, ordered `After=turf-tracker-migrate.service` so when both
get invoked back-to-back from `turf upgrade`, seed runs against a
migrated schema.

```ini
[Unit]
Description=Lookup data seed for turf-tracker
After=network-online.target postgresql.service turf-tracker-migrate.service
Wants=network-online.target postgresql.service

[Service]
Type=oneshot
User=turf-tracker
Group=turf-tracker
WorkingDirectory=/usr/share/turf-tracker
EnvironmentFile=/usr/lib/turf-tracker/default.env
EnvironmentFile=-/etc/sysconfig/turf-tracker
Environment=NODE_ENV=production
Environment=HOME=/var/lib/turf-tracker
ExecStart=/usr/bin/node-24 bin/seed.js
TimeoutStartSec=infinity
```

### Spec %posttrans

```bash
%posttrans
if [ -d /run/systemd/system ]; then
    systemctl daemon-reload
    if [ "$1" -eq 1 ]; then
        # First install — point operator at the manual /etc/sysconfig
        # setup + `turf upgrade` sequence.
        cat <<'MSG' …
    elif systemctl is-enabled --quiet turf-tracker-upgrade.path; then
        # Operator has opted into auto-orchestration. The Path unit
        # will fire on package.json change and run `turf upgrade`.
        echo "Upgrade detected. ..."
    else
        # Upgrade, no opt-in — point operator at `turf upgrade`.
        cat <<'MSG' …
    fi
fi
```

The scriptlet does no schema/data work and doesn't restart the
service. Its only side effects are `daemon-reload` (so the newly-
installed unit files are visible to systemd) plus an informational
message routed on three conditions: first install, upgrade with
auto-orchestration enabled, and upgrade without it. The orchestration
itself happens in `turf upgrade` — driven by the operator or by the
Path unit when enabled.

`%systemd_postun_with_restart` is NOT used in this spec. The
non-restart `%systemd_postun` variant is used instead, so dnf
transactions never restart the running service via rpm macros.
Restart is driven by `turf upgrade` either way — manual or via the
Path unit's `turf-tracker-upgrade.service`.

### Migration backward-compatibility

Migrations must be **forward-compatible** with the previously
deployed code. `turf upgrade` runs migrate → seed → try-restart
in that order, which means the OLD code (still running against the
DB) sees the NEW schema briefly between migrate completion and the
main-service restart. The window also extends arbitrarily when the
operator delays running `turf upgrade` after `dnf upgrade` lands
new files — the OLD code continues running and any client request
hits the OLD app against whatever the current DB state is.

Practically: migrations don't drop columns, rename without aliases,
or change types in ways that break the previous release. A migration
that violates the invariant becomes a multi-step deploy: ship the
additive change first, let it land, then ship the destructive
cleanup in a later release.

Rollback (`dnf downgrade turf-tracker-<previous>`) installs the
previous RPM but does **not** roll migrations back. Forward-only
migrations are the only viable rollback path. See the "Production
cycle" section below for the concrete `turf upgrade` behavior on a
downgraded RPM.

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

**First install**:

1. Write the Apache vhost at `/etc/httpd/conf.d/turf-tracker.conf` (or wherever) with `ServerName`, TLS cert paths, log paths, the HTTP→HTTPS redirect, and `Include /usr/share/turf-tracker/apache-snippet.conf` inside the `<VirtualHost *:443>` block. The snippet ships the ProxyPass plumbing and security/cache headers so the operator vhost owns only host-specific config.
2. (Optional) Drop in `/etc/systemd/system/turf-tracker.service.d/notify.conf` with `OnFailure=` if you want failure notification routed somewhere.
3. (Optional) `sudo systemctl enable --now turf-tracker-upgrade.path` to opt into auto-orchestration on future `dnf upgrade` transactions. Skip if you prefer to drive every upgrade manually with `turf upgrade`.
4. `sudo dnf install turf-tracker`. The `%posttrans` detects first install, prints next-step instructions pointing at `/etc/sysconfig/turf-tracker` + `turf upgrade`, and exits without touching the DB or starting the service.
5. Write `/etc/sysconfig/turf-tracker` with real values for `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, and `AUTH_PASSWORD_PEPPER`. `/usr/lib/turf-tracker/default.env` lists every recognized key; copy the structure and fill in real values for the required keys (which ship empty by design so the RPM has no baked-in secrets). Permissions: `0640 root:turf-tracker` so the systemd units read it as PID 1 (before privilege drop) AND `turf` CLI invocations as a group member can read without sudo; `0640 root:root` is the stricter option if all CLI usage goes through `sudo turf`.
6. `sudo turf upgrade`. Runs migrate → seed → `try-restart turf-tracker.service`. The service starts up against the new schema.
7. `sudo systemctl enable --now turf-tracker.service` if it isn't already running (first install — `try-restart` is a no-op on a not-yet-started unit). Subsequent boots auto-start the service.
8. `sudo turf users:create --role admin` to create the initial admin user. Auth works after this.
9. `sudo turf status` — composite health check confirms the whole stack is wired correctly.

**Automation** (ansible / etc.): pre-stage `/etc/sysconfig/turf-tracker` before `dnf install`, then run `sudo turf upgrade && sudo systemctl enable --now turf-tracker.service`. The orchestration step is `sudo turf upgrade` for every subsequent transaction (or rely on `turf-tracker-upgrade.path` if enabled).

**Upgrade** — two paths, operator's choice:

*Manual (default)*:

```bash
sudo dnf --refresh upgrade turf-tracker
# `%posttrans` exits with: "Upgrade detected. Apply when ready: sudo turf upgrade"
sudo turf upgrade
sudo systemctl status turf-tracker
curl -sf https://turf.tylervigario.com/api/health
```

`turf upgrade` runs migrate → seed → try-restart main. Operator
controls timing. Useful when an upgrade ships a long migration that
the operator wants to schedule for a quiet window, or when changes
to `/etc/sysconfig/turf-tracker` need to land between file upgrade
and service restart. `--no-restart` applies schema/seed only —
useful when scheduling the service bounce separately from the
migration window.

*Auto-orchestrated* (operator opted in once with `sudo systemctl enable --now turf-tracker-upgrade.path`):

```bash
sudo dnf --refresh upgrade turf-tracker
# Path unit fires on package.json change, triggers
# turf-tracker-upgrade.service, which runs `turf upgrade`
# automatically — visible in journal:
#   journalctl -u turf-tracker-upgrade.service
curl -sf https://turf.tylervigario.com/api/health
```

`--refresh` invalidates dnf's cached repo metadata so a
just-published version is visible immediately. In both paths, a
failure in `turf upgrade` (most commonly migrate.service hitting a
schema conflict or a DB connectivity issue) leaves the host with
new files on disk and the OLD service still running on OLD schema.
Operator investigates via `systemctl status` + journal, fixes,
re-runs `sudo turf upgrade`.

**Composite health check**: `sudo turf status` reports env-file
presence, required-env presence, DB connectivity, latest applied
migration, service-unit states, Path-unit opt-in state, and
`/api/health` response in one command. Run before AND after each
upgrade for a clear delta.

**Rollback**:

```bash
sudo dnf downgrade turf-tracker-<previous-version>
# or
sudo dnf history list turf-tracker
sudo dnf history undo <id>
```

Downgrade triggers `%posttrans` with `$1 -gt 1` (rpm treats downgrade
as install-of-older-version while old is briefly still present), so
the same upgrade-detected message fires and the auto-orchestration
runs if opted in. Concrete behavior of `turf upgrade` against a
downgraded RPM:

- **Migrations**: `prisma migrate deploy` applies any unapplied migration in the on-disk migrations folder. The downgraded RPM ships an older — strictly-subset — migrations folder, so all entries are already in `_prisma_migrations`; migrate is a no-op. Migrations themselves are not rolled back. See "Migration backward-compatibility" above for the forward-only invariant.
- **Seed**: re-runs the older RPM's `bin/seed.js`. Upserts are idempotent and use stable `code` keys; rows present in both old and new shape stay put, rows added since the old release don't get reverted (the seed only adds; it doesn't delete). Practically a no-op for the normal additive-lookup case, but lookup rows that were RENAMED or REPURPOSED between releases would get their old `name` re-applied. Audit lookup-table changes before relying on dnf downgrade as a rollback path.

## Diffs from website (reference implementation)

| Field | website | turf-tracker | Reason |
| --- | --- | --- | --- |
| Distribution | Private (`/srv/dnf-repo-private/`, `http://repo.lan/`) | Public (`/srv/dnf-repo-public/`, `https://repo.tylervigario.com/`) | turf-tracker is shareable; website is a Tyler-business app. |
| Signing subkey | `private-signer` | `public-signer` | Matches distribution side. Both cross-signed by the same master, so consumers verify either against `RPM-GPG-KEY-server-admin`. |
| License | Proprietary | AGPL-3.0-or-later | turf-tracker is shareable open source; reciprocal license preserves the source-availability invariant for any modified network-deployed fork. |
| Native deps | `better-sqlite3` | `@node-rs/argon2` + prisma engines | Different DB + auth stack. |
| DB | SQLite, file on disk under StateDirectory | Postgres, external | Multi-user + multi-property scale needed Postgres. |
| Required env | `SQLITE_PATH` only | `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `AUTH_PASSWORD_PEPPER` | Auth not stubbed; Postgres connection string vs file path. |
| Migrate/seed mechanism | none (sqlite has no explicit migrations) | Operator-driven via `turf upgrade` (migrate + seed oneshots, plus opt-in `*-upgrade.path` / `*-upgrade.service` pair for auto-orchestration). | Prisma schema lifecycle needs to run before the new code, but it's release-scoped and operator-gated — `%posttrans` only does `daemon-reload` + an informational next-step message. |
| Health/diagnostic CLI | none | `turf status` composite check (env, DB, services, Path-unit opt-in, /api/health) | Mirrors `dailies status` / `occ status`; one command answers "is this deploy healthy?". |
| Bundled artifacts | server.js + Next tree + /usr/bin/dailies wrapper | + bin/turf.js (CLI core) + /usr/bin/turf wrapper + bin/seed.js + prisma/ + generated/ + prisma.config.ts | turf-tracker ships an operational CLI; Prisma needs schema + generated client at runtime. |
| Gate `Validate build` env | `NEXT_PUBLIC_SENTRY_DSN` only | + `BETTER_AUTH_SECRET` placeholder | Better-Auth's library-level default-secret check fires during `next build`. |
