# turf-tracker.spec
#
# Mobile-first PWA for area-based plant nutrition tracking. Next.js 16
# (App Router) with a custom server entrypoint (server.ts compiled to
# server.js by scripts/build-server.ts), Prisma 7 on Postgres,
# Better-Auth, native @node-rs/argon2 for password hashing.
#
# Build model: rpmbuild itself drives the Next build inside %%build. CI
# invokes `rpmbuild -ba` on a self-hosted runner on the prod host so
# every native binding (@node-rs/argon2, prisma engines) matches the
# prod runtime's glibc exactly. The spec IS the build definition — no
# pre-built tarball.

%global         webuser   turf-tracker
%global         webgroup  turf-tracker

# Disable brp-mangle-shebangs. node_modules ships scripts with various
# shebangs (#!/usr/bin/env node, etc.) that are not our concern to police.
%global         __brp_mangle_shebangs %{nil}

# Skip Python bytecompilation BRP. node_modules occasionally ships .py
# helpers (gyp, etc.) that aren't intended for Fedora's pyc-compile pass.
%global         __brp_python_bytecompile %{nil}

# Disable debuginfo extraction. find-debuginfo iterates over every
# ELF in the buildroot and dies on:
#   * @sentry/cli-linux-x64/bin/sentry-cli (no GNU build-id note —
#     stripped Rust binary from upstream),
#   * @node-rs/argon2's argon2.linux-x64-gnu.node (no DWARF info in
#     the upstream prebuild),
#   * @prisma/engines/* (downloaded prebuilds, no debug info shipped).
# We don't own those binaries; nothing to debug-package. Skipping the
# whole debuginfo subpackage concept fits a JS app that vendors
# third-party prebuilds.
%global         debug_package %{nil}

# Skip the strip BRP for the same reason: we don't build native
# binaries locally, only vendor prebuilt ones. Stripping is a no-op
# on stripped-upstream files and would just churn timestamps.
%global         __strip /bin/true

Name:           turf-tracker
Version:        %{?_version}%{!?_version:0.0.0}
Release:        1%{?dist}
Summary:        Mobile-first PWA for area-based plant nutrition tracking

License:        AGPL-3.0-or-later
URL:            https://github.com/Vigario-Technology-Solutions/turf-tracker
Source0:        %{name}-%{version}.tar.gz
# Source1 is the sysusers.d snippet, copied into rpmbuild/SOURCES/ by
# the workflow alongside the source tarball. The sysusers_create_package
# macro (called in pre below) reads it at build time and inlines the
# content into the pre scriptlet.
Source1:        %{name}.sysusers

# Arch-dependent: @node-rs/argon2 ships a native .node binding and
# @prisma/engines downloads platform-specific engine binaries during
# postinstall. The Linux x86_64 build is the only supported runtime
# (Fedora 43 + Node 24); other arches would need a parallel build
# pipeline. Declaring x86_64 (rather than noarch) makes the RPM honest
# about what it can run on and lets rpmbuild's BRP checks pass.
BuildArch:      x86_64

# Build deps. Node 24 + npm to run npm ci + next build.
# systemd-rpm-macros provides the systemd_post / preun / postun
# scriptlet helpers expanded below. (Comments here avoid leading
# `%` on macro names because rpm's macro engine expands % even
# inside comments unless escaped with %%.)
BuildRequires:  nodejs24
BuildRequires:  nodejs24-npm
BuildRequires:  systemd-rpm-macros

# Runtime — pin the Fedora parallel-install nodejs24 package by exact
# name. The unversioned `nodejs` package on F43 is v22; a soft
# `nodejs >= 24` Requires would resolve in surprising ways. The
# service unit's ExecStart hardcodes /usr/bin/node-24 to match.
Requires:       nodejs24
# sysusers_create_package in pre calls systemd-sysusers, which lives
# in the systemd package. The other scriptlets use systemd_* macros
# (post/preun/postun) and posttrans uses systemctl directly for the
# migrate/seed/restart orchestration — declare systemd for every
# phase that touches it.
Requires(pre):  systemd
Requires(post): systemd
Requires(preun): systemd
Requires(postun): systemd
Requires(posttrans): systemd
# Apache (or any reverse proxy) and TLS are operator concerns —
# the package ships an Apache snippet at /usr/share/<pkg>/ that
# operators can Include from their own vhost, but doesn't dictate
# that Apache is the proxy. shadow-utils similarly: the sysusers.d
# snippet means systemd-sysusers creates the user, no useradd needed.
# postgresql-server omitted because Postgres may run remote;
# Requires-ing it would install it locally even when not wanted.

%description
Mobile-first PWA that answers "what should I do right now in this
area?" for any cultivated piece of ground — lawn, bed, tree, garden.
Computes exact application rates from soil tests + product specs at
the moment of decision; logging is a side-effect of using the field
tool, not the primary mode.

Built on Next.js 16 (App Router) with a custom server entrypoint,
Prisma 7 on Postgres, Better-Auth (email/password, argon2id-hashed
with server-side pepper), Tailwind v4, Serwist for the service
worker, and Sentry for error + performance monitoring.

Ships:
  - Pre-built Next.js tree at /usr/share/turf-tracker/
  - Custom server entrypoint (server.js), pre-compiled seed runner
    (bin/seed.js), and operational CLI core (bin/turf.js)
  - CLI wrapper at /usr/bin/turf — sources the two-layer env and
    execs node-24 against the CLI core
  - Prisma schema + migrations for runtime apply via migrate oneshot
  - systemd service unit + migration oneshot + seed oneshot
  - Opt-in upgrade path/service pair: turf-tracker-upgrade.path
    watches package.json for changes and triggers
    turf-tracker-upgrade.service (which runs `turf upgrade`) when an
    RPM upgrade lands. Enable with
    `sudo systemctl enable --now turf-tracker-upgrade.path`.
  - First-install bootstrap via `turf setup` — auto-generates secret
    keys, prompts for required URLs/DB, writes
    /etc/sysconfig/turf-tracker at 0600, offers to enable+start the
    service, and offers to create the first user.
  - `turf backup` / `turf restore` — single-tarball backup tool;
    bundles pg_dump custom-format dump + (when STORAGE_PATH is set)
    a storage tar + sysconfig.env into one .tar.gz under
    /var/backups/turf-tracker/. flock'd against concurrent
    backup/restore.
  - `turf status` — composite health check (env, DB, services,
    Path-unit opt-in state, /api/health).
  - tmpfiles.d snippet for the /var/lib + /var/cache + /var/backups
    + /run state dirs
  - sysusers.d snippet declaring the 'turf-tracker' system user
  - Canonical default env at /usr/lib/turf-tracker/default.env
  - Apache reverse-proxy snippet at /usr/share/turf-tracker/
    apache-snippet.conf (operator Include's it from their own vhost)

Operator-owned, NOT shipped here:
  - The Apache vhost itself (TLS, ServerName, log paths — all host-
    specific)
  - The env override file at /etc/sysconfig/turf-tracker (optional
    drop-in over the canonical default; carries real secrets)
  - The Postgres database itself (DATABASE_URL points at it)
  - Optional OnFailure drop-in at /etc/systemd/system/
    turf-tracker.service.d/notify.conf for failure-email


%prep
%setup -q


%build
# Run the app's own build pipeline.
#
# Do NOT export NODE_ENV=production before `npm ci`. npm treats
# NODE_ENV=production as implicit --omit=dev, which strips
# husky/tsx/eslint/typescript/etc. — but the package's `prepare`
# script unconditionally invokes `husky`, so the install dies with
# "husky: command not found" before the build ever starts. Next.js
# sets NODE_ENV=production itself for `next build`; the spec
# doesn't need to pre-set it.
#
# HUSKY=0 is the canonical husky-in-CI pattern (per husky's own
# README): the husky binary detects the env var, prints a notice,
# exits 0. The prepare script becomes a no-op without us having to
# patch package.json.
#
# NEXT_PUBLIC_SENTRY_DSN must be present at build time even if
# empty, otherwise scripts/check-public-env.ts fails the build.
# It's deliberately empty here — the build artifact ships with no
# baked-in Sentry DSN; the server-side DSN is set per-host via
# /etc/sysconfig/turf-tracker.
#
# postinstall runs `prisma generate` which populates generated/prisma/
# from prisma/schema.prisma. The bundled server.js then resolves
# `@generated/prisma/client` (per tsconfig paths) at runtime through
# the build-time directory. Both prisma/ AND generated/ ship in
# %%files for this reason.
export CI=true
export HUSKY=0
export NEXT_PUBLIC_SENTRY_DSN=

npm ci --prefer-offline --no-audit --no-fund
npm run build

# Strip devDependencies after the build completes. The build pipeline
# consumes tsx / typescript / esbuild / eslint / @serwist/cli /
# tailwindcss / @tailwindcss/postcss / @types/* / vitest / etc.; none
# of them are needed at runtime. server.js / bin/turf.js / bin/seed.js
# are esbuild-bundled and self-contained, and the migrate oneshot's
# /usr/bin/node-24 node_modules/.bin/prisma migrate deploy survives
# the prune because prisma lives in `dependencies` (not devDeps).
# Sheds ~100-200 MB from /usr/share/turf-tracker/node_modules in the
# resulting RPM. --omit=dev is the canonical flag (npm@8+); --no-audit
# / --no-fund match the npm ci flags above.
npm prune --omit=dev --no-audit --no-fund


%install
# App tree — everything the runtime needs lives under /usr/share/<pkg>/.
install -d %{buildroot}%{_datadir}/%{name}
cp -a server.js .next public node_modules package.json package-lock.json \
    %{buildroot}%{_datadir}/%{name}/

# Bundled CLIs and prisma client tree. seed.js + turf.js are bundled
# during prebuild (esbuild) so they run on plain node after any
# prune step. prisma/ + prisma.config.ts ship so the turf-tracker-
# migrate.service oneshot has its schema + migration SQL in cwd at
# %%posttrans time. generated/ carries the generated prisma client
# (output target in schema.prisma is `../generated/prisma`); server.js
# imports it via tsconfig paths.
cp -a bin prisma prisma.config.ts generated \
    %{buildroot}%{_datadir}/%{name}/

# Strip build-time cache and replace with a symlink into /var/cache.
# Next's incremental cache (ISR, image opt, fetch cache) writes to
# `.next/cache/` relative to the running app's cwd at runtime. The
# app tree under /usr/share is read-only at runtime (systemd
# ProtectSystem=strict). Without this symlink Next would try to
# write into a RO directory and silently degrade cache behavior.
# CacheDirectory= in the service unit creates /var/cache/<pkg> at
# 0750 turf-tracker:turf-tracker on activation, so the symlink target
# exists and is writable for the service user.
rm -rf %{buildroot}%{_datadir}/%{name}/.next/cache
ln -s /var/cache/%{name} %{buildroot}%{_datadir}/%{name}/.next/cache

# systemd units — main service + migrate oneshot + seed oneshot +
# the opt-in upgrade path/service pair.
install -D -m 0644 packaging/%{name}.service \
    %{buildroot}%{_unitdir}/%{name}.service
install -D -m 0644 packaging/%{name}-migrate.service \
    %{buildroot}%{_unitdir}/%{name}-migrate.service
install -D -m 0644 packaging/%{name}-seed.service \
    %{buildroot}%{_unitdir}/%{name}-seed.service
install -D -m 0644 packaging/%{name}-upgrade.path \
    %{buildroot}%{_unitdir}/%{name}-upgrade.path
install -D -m 0644 packaging/%{name}-upgrade.service \
    %{buildroot}%{_unitdir}/%{name}-upgrade.service

# tmpfiles.d
install -D -m 0644 packaging/%{name}.tmpfiles.conf \
    %{buildroot}%{_tmpfilesdir}/%{name}.conf

# sysusers.d snippet (declarative system-user creation)
install -D -m 0644 %{SOURCE1} \
    %{buildroot}%{_sysusersdir}/%{name}.conf

# Apache reverse-proxy snippet — read-only, NOT in /etc/httpd/conf.d/.
# Operator Include's it from their own vhost (which owns TLS, domain,
# log paths). Lives in /usr/share/<pkg>/ next to other arch-indep app
# data the operator may reference.
install -D -m 0644 packaging/apache-snippet.conf \
    %{buildroot}%{_datadir}/%{name}/apache-snippet.conf

# Canonical default env — read-only, RPM-owned. The systemd unit
# loads this first, then optionally /etc/sysconfig/%%{name} for
# operator overrides (which the RPM does not ship).
install -D -m 0644 packaging/default.env \
    %{buildroot}%{_prefix}/lib/%{name}/default.env

# CLI wrapper at /usr/bin/turf. Small bash script that sources the
# two-layer env and execs node-24 against the bundled CLI core at
# /usr/share/<pkg>/bin/turf.js.
install -D -m 0755 packaging/turf \
    %{buildroot}%{_bindir}/turf


%pre
# Declarative user creation via systemd-sysusers. The macro reads
# the sysusers.d snippet at BUILD time and inlines its content into
# this scriptlet as a heredoc fed to `systemd-sysusers --replace=...`.
# At install time, no separate file lookup is needed — the spec is
# self-contained in the RPM's %%pre.
%sysusers_create_package %{name} %{SOURCE1}


%post
# Apply tmpfiles.d immediately — don't wait for next boot.
systemd-tmpfiles --create %{_tmpfilesdir}/%{name}.conf || :

# No SELinux fcontext rules: Apache reverse-proxies to :3000 over
# TCP (governed by the httpd_can_network_connect boolean, not file
# labels), Node accesses the app tree + state in its default service
# domain, and the default labels (usr_t, var_lib_t, var_cache_t,
# etc_t) already permit those accesses. Custom httpd_sys_*_t rules
# would imply Apache reads the file tree directly — it doesn't.

%systemd_post %{name}.service


%preun
%systemd_preun %{name}.service


%postun
# Use the non-restart variant. dnf upgrade / removal of this
# package doesn't restart the running service from rpm scriptlets.
# Restart is driven by `turf upgrade` — either operator-invoked or
# auto-triggered by %%{name}-upgrade.path when the operator has
# enabled that opt-in. Restart-via-rpm-macro would bypass the
# migrate/seed ordering the upgrade command guarantees.
%systemd_postun %{name}.service


%posttrans
# Canonical Fedora pattern: install lands files; data init and
# orchestration are operator-driven. dnf install / upgrade does NOT
# run migrations, refresh seed data, or restart the service from
# this scriptlet. Operator drives the post-transaction step either
# manually (`sudo turf upgrade`) or by opting into auto-
# orchestration once (`sudo systemctl enable --now
# %%{name}-upgrade.path` — fires on PathChanged of the package.json
# this RPM ships, triggers %%{name}-upgrade.service, which invokes
# `turf upgrade`).
#
# The only work posttrans does here is `systemctl daemon-reload`
# so the new unit files are visible, plus a friendly next-step
# message branched by first-install vs upgrade.
if [ -d /run/systemd/system ]; then
    systemctl daemon-reload
    if [ "$1" -eq 1 ]; then
        cat <<'MSG'
First install of %{name}. Next step:

  sudo turf setup

This writes /etc/sysconfig/%{name} with auto-generated secrets,
prompts for required values, runs migrations + seed, enables the
service, and offers to create the first user — all in one flow.
Run `turf setup --help` for options.
MSG
    elif systemctl is-enabled --quiet %{name}-upgrade.path 2>/dev/null; then
        echo "Upgrade detected. %{name}-upgrade.path will trigger 'turf upgrade' shortly."
    else
        cat <<'MSG'
Upgrade detected. Apply when ready:

  sudo turf upgrade

This runs pending migrations, refreshes seed data, and restarts the
service. To auto-run on future upgrades, enable the path unit once:

  sudo systemctl enable --now %{name}-upgrade.path
MSG
    fi
fi


%files
%doc README.md
%dir %{_datadir}/%{name}
%{_datadir}/%{name}/server.js
%{_datadir}/%{name}/.next
%{_datadir}/%{name}/public
%{_datadir}/%{name}/node_modules
%{_datadir}/%{name}/bin
%{_datadir}/%{name}/prisma
%{_datadir}/%{name}/prisma.config.ts
%{_datadir}/%{name}/generated
%{_datadir}/%{name}/package.json
%{_datadir}/%{name}/package-lock.json
%{_datadir}/%{name}/apache-snippet.conf
%{_unitdir}/%{name}.service
%{_unitdir}/%{name}-migrate.service
%{_unitdir}/%{name}-seed.service
%{_unitdir}/%{name}-upgrade.path
%{_unitdir}/%{name}-upgrade.service
%{_tmpfilesdir}/%{name}.conf
%{_sysusersdir}/%{name}.conf
%dir %{_prefix}/lib/%{name}
%{_prefix}/lib/%{name}/default.env
%{_bindir}/turf


%changelog
* Mon May 11 2026 Tyler Vigario <admin@tylervigario.com> - 0.0.0-1
- Initial package. RPM-as-artifact deploy model — build runs on a
  self-hosted GitHub Actions runner on the prod host, native
  bindings (@node-rs/argon2, prisma engines) match the production
  runtime's glibc exactly. Deploy is `sudo dnf --refresh upgrade
  %%{name}` followed by `sudo turf upgrade` (or opt into auto-
  orchestration once via `sudo systemctl enable --now
  %%{name}-upgrade.path`). Separate migrate + seed oneshots,
  decoupled from boot — invoked only by `turf upgrade`.
