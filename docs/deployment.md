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
| `/usr/lib/tmpfiles.d/turf-tracker.conf` | tmpfiles backstop for state, cache, backup, and runtime-lock dirs (`/var/lib`, `/var/cache`, `/var/backups`, `/run/turf-tracker`). |
| `/usr/lib/sysusers.d/turf-tracker.conf` | Declarative `turf-tracker` user/group definition (processed by `systemd-sysusers` from `%pre`). |
| `/usr/bin/turf` | CLI wrapper. Sources the two-layer env and exec's `node-24` against the bundled CLI core. Operators run `sudo turf <subcommand>` without knowing the env-file paths. |

NOT shipped, operator-owned:

| Path | Purpose |
| --- | --- |
| `/etc/httpd/conf.d/<vhost>.conf` (or wherever) | Operator's vhost — picks domain, TLS cert paths, log paths. `Include`s `/usr/share/turf-tracker/apache-snippet.conf` inside. |
| `/etc/sysconfig/turf-tracker` | The env-override file. Required-env values (`DATABASE_URL`, `BETTER_AUTH_*`, `AUTH_PASSWORD_PEPPER`) live here — the service runtime-config-validates on startup and refuses to run if they're missing. **Canonical permissions: `0600 root:root`.** Both `turf setup` and `turf restore` write at this mode; the systemd units read as PID 1 (before privilege drop) regardless of perms; CLI invocations always go through `sudo turf`. The wrapper detects the permission case up front and emits a `run with sudo` directive error rather than letting bash's `Permission denied` surface mid-source. |
| `/etc/systemd/system/turf-tracker.service.d/*.conf` | Operator drop-ins for resource limits, `OnFailure=` notification, etc. |
| `/etc/letsencrypt/live/<domain>/...` | TLS certs, certbot-managed. |
| The Postgres database itself | External; `DATABASE_URL` points at it. Backups operator-owned. |

Created at runtime by the service unit:
`/var/lib/turf-tracker/` (StateDirectory) and
`/var/cache/turf-tracker/` (CacheDirectory). The `.next/cache`
symlink resolves through the latter.

Created by tmpfiles.d at boot (and re-created by `systemd-tmpfiles
--create` in `%post`): `/var/backups/turf-tracker/` (+ `preserve/`
subdir) for `turf backup` tarballs, 0700 root:root because the
default backup includes the operator's sysconfig (AUTH_PASSWORD_PEPPER,
BETTER_AUTH_SECRET); `/run/turf-tracker/` for the backup/restore
mutual-exclusion lock.

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

**First install** (one operator path; `turf setup` drives it):

1. Write the Apache vhost at `/etc/httpd/conf.d/turf-tracker.conf` (or wherever) with `ServerName`, TLS cert paths, log paths, the HTTP→HTTPS redirect, and `Include /usr/share/turf-tracker/apache-snippet.conf` inside the `<VirtualHost *:443>` block. The snippet ships the ProxyPass plumbing and security/cache headers so the operator vhost owns only host-specific config.
2. (Optional) Drop in `/etc/systemd/system/turf-tracker.service.d/notify.conf` with `OnFailure=` if you want failure notification routed somewhere.
3. `sudo dnf install turf-tracker`. The `%posttrans` detects first install, prints a one-line next-step pointing at `turf setup`, and exits without touching the DB or starting the service.
4. `sudo turf setup`. The CLI auto-detects the RPM context, reads `/usr/lib/turf-tracker/default.env` as the template, prompts for `DATABASE_URL` + `BETTER_AUTH_URL`, auto-generates `BETTER_AUTH_SECRET` + `AUTH_PASSWORD_PEPPER` (32-byte hex each), writes `/etc/sysconfig/turf-tracker` at 0o600, offers to run `systemctl start turf-tracker-migrate` → `start turf-tracker-seed` → `enable --now turf-tracker.service` in one prompt, AND offers to create the first user. Decline any prompt to inspect state and proceed manually.
5. `sudo turf status` — composite health check confirms the whole stack is wired correctly.
6. **AFTER `turf setup` has run successfully**, optionally `sudo systemctl enable --now turf-tracker-upgrade.path` to opt into auto-orchestration on future `dnf upgrade` transactions. Skip if you prefer to drive every upgrade manually with `turf upgrade`. **Do not enable this BEFORE the first `turf setup`** — the Path unit watches `package.json`, fires the moment `dnf install` writes it, and would invoke `turf upgrade` against an unconfigured host (no `/etc/sysconfig` yet). The migrate oneshot would fail on empty `DATABASE_URL` and the operator gets a confusing failure mid-install.

**Automation** (ansible / etc.): pre-stage `/etc/sysconfig/turf-tracker` before `dnf install`, then run `sudo turf setup --non-interactive`. Setup honors the existing file, generates only missing secrets, and prints the systemctl commands instead of prompting for orchestration. The orchestration step is then `sudo turf upgrade` (or rely on `turf-tracker-upgrade.path` if enabled, which is safe to enable on the host once a real sysconfig is in place).

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

**Secret rotation**:

`sudo turf setup --rotate` regenerates every secret in the
`SECRET_KEYS` set (currently `BETTER_AUTH_SECRET` and
`AUTH_PASSWORD_PEPPER`) and rewrites `/etc/sysconfig/turf-tracker`.
Without `--rotate`, re-running setup preserves existing secrets and
reports them under `Preserved secrets:` in the summary. Rotation
invalidates all existing sessions (`BETTER_AUTH_SECRET`) or all
existing passwords (`AUTH_PASSWORD_PEPPER`) — coordinate carefully.

After rotating, restart the running service to pick up the new
values: `sudo systemctl restart turf-tracker.service`.

## Backup / restore

`turf backup` and `turf restore` are opinionated single-tarball
commands mirroring the GitLab/GHE pattern. One command produces one
file with everything needed to recover; one command applies the
reverse. Building blocks (`pg_dump`, `tar`) are exposed via the
runtime check, not declared as hard `Requires:` — operators running
remote Postgres often manage DB backups at the database tier and
don't want the postgresql client tools installed locally.

### What the tarball contains

| Member | Source |
| --- | --- |
| `manifest.json` | `{app_version, timestamp, components, pg_dump_format, schema_revision}`. Restore reads this first; refuses to proceed across a major-version skew without `--force`. `schema_revision` is the most recent `migration_name` from `_prisma_migrations` — informational for operators inspecting old backups. |
| `db.sql.custom` | `pg_dump --format=custom --no-owner --no-privileges` of `$DATABASE_URL`. Replayable by `pg_restore --clean --if-exists` regardless of role/owner assumptions on the restore host. |
| `storage.tar` | Tar of `$STORAGE_PATH`, **only included when the env is set**. turf-tracker has no image-upload pipeline yet; the component is in place for the day uploads land. Operators backing up a host without `STORAGE_PATH` configured get a smaller tarball with `components: ["db", "sysconfig"]`. |
| `sysconfig.env` | Copy of `/etc/sysconfig/turf-tracker`. Included by default — preserving `AUTH_PASSWORD_PEPPER` on restore avoids forced password resets for every user. Skip with `--no-sysconfig` if you segregate secret material from backup files. |

### `turf backup`

```bash
sudo turf backup                              # → /var/backups/turf-tracker/turf-tracker-<ISO>.tar.gz
sudo turf backup --output /mnt/nas/turf/      # custom directory or full path
sudo turf backup --preserve                   # → /var/backups/turf-tracker/preserve/...  (retention-safe)
sudo turf backup --no-sysconfig               # exclude /etc/sysconfig from the tarball
```

Pre-flight before any work runs:

- **`pg_dump` available.** Missing → `"Install with: sudo dnf install postgresql"`.
- **`pg_dump` major ≥ server major.** Older clients refuse newer servers; the check surfaces the exact mismatch + the install hint.
- **Free disk ≥ estimated size × 1.2.** `pg_database_size(current_database())` + `du`-equivalent on `$STORAGE_PATH` (skipped when unset), statvfs the output dir. Fails early with: `"Insufficient disk space at <dir>: <free> free, ~<needed> needed. Free up space or pass --output to a different volume."` Catches the disk-full failure mode at second 0 rather than mid-pg_dump.

Concurrency: `flock`-style lock at `/run/turf-tracker/backup.lock` shared between backup and restore. Stale locks (holder PID dead, `kill(pid, 0)` returns ESRCH) are reclaimed; live holders abort with the holder's PID.

### `turf restore <backup-path>`

```bash
sudo turf restore /var/backups/turf-tracker/turf-tracker-2026-05-11T19-30-45.tar.gz
sudo turf restore <path> --no-sysconfig       # keep current operator env values
sudo turf restore <path> --force              # cross major version (schema may be irreconcilable)
sudo turf restore <path> --yes                # bypass the type-the-filename confirmation (automation)
```

Restore is **destructive**: wipes the database (`pg_restore --clean`), wipes-and-replaces `$STORAGE_PATH` (only when `STORAGE_PATH` is set AND the tarball carries a storage component), overwrites `/etc/sysconfig/turf-tracker` (unless `--no-sysconfig`). The interactive flow is:

1. Extract the tarball to a tmpdir; read `manifest.json` before touching anything.
2. Check `manifest.app_version` major against the installed package. If different, refuse unless `--force`.
3. Print the manifest + the destructive plan.
4. Prompt: `Type the backup filename to confirm:` — operator must type the exact basename of the tarball. Wrong input → abort, no changes.
5. Stop `turf-tracker.service` (if active).
6. `pg_restore --clean --if-exists`.
7. Wipe + extract `storage.tar` into `$STORAGE_PATH` (skipped when no `STORAGE_PATH` is set on the restore host, or when the backup doesn't carry one).
8. Copy `sysconfig.env` back to `/etc/sysconfig/turf-tracker` (unless `--no-sysconfig`).
9. Start `turf-tracker.service` (only if it was active before restore).

`--yes` bypasses step 4 for automation. If a step downstream of the wipe fails, the operator restores from an older backup — rollback-of-rollback is out of scope.

### Pre-upgrade backup hook

```bash
sudo turf upgrade --backup-first
```

Runs `turf backup` in-process before the migrate/seed/restart chain. Same Prisma connection, errors propagate naturally — a failed backup aborts the upgrade before any schema work. Default off: operators with off-host nightly snapshots don't need an inline safety net. Recommended for any upgrade that involves a schema change you're not certain is reversible.

### Preserve / pin convention

`--preserve` writes to `/var/backups/turf-tracker/preserve/` instead of the retention-able root. Intended for pinning a known-good before a risky change (a release with extensive migrations, a major postgres upgrade, etc.).

**Operator-side contract**: any retention policy (cron, `tmpfiles.d` aging, manual purge) MUST exclude the `preserve/` subdir. The package ships no automated retention — the operator's policy is operator-owned.

### Out of scope (operator concerns)

These belong outside `turf backup`. The CLI gives you the artifact; the rest is the operator's deploy environment:

- **Retention policy.** Backups accumulate in `/var/backups/turf-tracker/` until the operator's cron/`tmpfiles.d` aging removes them. The `preserve/` subdir is exempt by convention; the operator's retention rule has to honor it.
- **Off-host shipping.** `rsync` / `rclone` / vendor-managed backup pulls from `/var/backups/turf-tracker/` to wherever the operator's disaster-recovery target is. Run from a separate cron, after `turf backup`'s timer fires.
- **Encryption at rest.** Filesystem-level (`fscrypt`, LUKS) or off-host destination encryption. Out of CLI scope.
- **Point-in-time recovery.** Requires WAL archiving (`pgBackRest`, `Barman` territory). Overkill for solo-prod scale; not addressed here.
- **Verification drills.** "Did this backup actually restore?" is operator discipline — periodic restore-to-a-test-database is the canonical drill. The package ships no automated verifier.

### Scheduling

The package does not ship a backup timer. Operator wires their own — common shape:

```ini
# /etc/systemd/system/turf-tracker-backup.timer  (operator-owned)
[Unit]
Description=Nightly turf-tracker backup

[Timer]
OnCalendar=daily
RandomizedDelaySec=30min
Persistent=true

[Install]
WantedBy=timers.target
```

```ini
# /etc/systemd/system/turf-tracker-backup.service  (operator-owned)
[Unit]
Description=Run turf backup

[Service]
Type=oneshot
ExecStart=/usr/bin/turf backup
```

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
| Bundled CLI commands | `setup`, `upgrade`, `status`, `backup`, `restore`, `users:*`, `secret`, plus domain-specific (attachments, submissions, images, etc.) | `setup`, `upgrade`, `status`, `backup`, `restore`, `users:*` | Same operational floor; turf has no attachments / images / submissions domain yet, so the per-domain subcommands aren't present. |
| Backup storage component | always included from `$STORAGE_PATH` (default `/var/lib/<pkg>/storage`) | only included when `STORAGE_PATH` is set in the env | turf-tracker has no image-upload pipeline yet. The component slot is in place for when uploads land; backups today contain only db + sysconfig. |
| Gate `Validate build` env | `NEXT_PUBLIC_SENTRY_DSN` only | + `BETTER_AUTH_SECRET` placeholder | Better-Auth's library-level default-secret check fires during `next build`. |
