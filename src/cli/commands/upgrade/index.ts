import type { Command } from "commander";
import { runBackup } from "../backup";
import { systemctlRun } from "../../shared/systemctl";

/**
 * Apply a pending upgrade. The orchestration step that runs migrations,
 * refreshes seed data, and restarts the main service after a `dnf upgrade`
 * has landed new files. The same code path drives two invocation modes:
 *
 *   - **Manual**: operator runs `sudo turf upgrade` whenever they're
 *     ready to apply the on-disk upgrade. Default mode — fits the
 *     canonical Fedora pattern (install lands files; data init is
 *     operator-driven; mirrors `postgresql-setup --initdb` post-install).
 *   - **Auto-orchestrated**: operator enables
 *     `turf-tracker-upgrade.path` once (a systemd Path unit that
 *     watches `/usr/share/turf-tracker/package.json` for changes),
 *     and every subsequent `dnf upgrade` triggers
 *     `turf-tracker-upgrade.service`, which invokes this command.
 *
 * Either mode runs the same four steps:
 *
 *   0. `systemctl daemon-reload` — refresh systemd's view of unit
 *      files. Closes a race against the upgrade.path inotify trigger:
 *      RPM writes /usr/share/turf-tracker/package.json mid-
 *      transaction, the Path unit's PathChanged fires immediately and
 *      starts upgrade.service, but %posttrans (which would otherwise
 *      run daemon-reload) hasn't executed yet. Without this step the
 *      auto-orchestrated run would drive whatever migrate/seed/main
 *      unit-file definitions systemd had cached pre-upgrade — wrong
 *      on any release that changes hardening, env, or ExecStart.
 *      Idempotent and cheap, so it runs in the manual path too.
 *   1. `systemctl start turf-tracker-migrate.service` — applies any
 *      pending Prisma migrations. Type=oneshot, so the start blocks
 *      until ExecStart completes.
 *   2. `systemctl start turf-tracker-seed.service` — idempotent
 *      lookup-data upsert. Also Type=oneshot.
 *   3. `systemctl try-restart turf-tracker.service` — restart the
 *      main service so it picks up the new code. `try-restart` is a
 *      no-op if the service isn't running, which keeps this command
 *      safe to invoke after a manual `systemctl stop` or before a
 *      first `enable --now`.
 *
 * `--no-restart` skips step 3 — useful when an operator wants to apply
 * the schema/seed in a maintenance window without bouncing the service.
 */

interface UpgradeOpts {
  restart?: boolean;
  backupFirst?: boolean;
}

export function register(program: Command): void {
  program
    .command("upgrade")
    .description(
      "Apply pending migrations + refresh seed + restart the service after a dnf transaction",
    )
    .option("--no-restart", "apply schema/seed only; skip the service restart")
    .option(
      "--backup-first",
      "run `turf backup` before applying the upgrade; abort the upgrade if backup fails",
    )
    .action(async (opts: UpgradeOpts) => {
      await run(opts);
    });
}

async function run(opts: UpgradeOpts): Promise<void> {
  if (opts.backupFirst) {
    process.stderr.write(`Backing up before upgrade (--backup-first)…\n`);
    // In-process call rather than spawning a child: same Prisma
    // connection, same node env, errors propagate naturally so a
    // failed backup aborts the upgrade before any migration runs.
    await runBackup({});
    process.stderr.write(`\n`);
  }
  await systemctlRun("daemon-reload");
  await systemctlRun("start", "turf-tracker-migrate.service");
  await systemctlRun("start", "turf-tracker-seed.service");
  if (opts.restart !== false) {
    await systemctlRun("try-restart", "turf-tracker.service");
  }
  process.stderr.write(`\n✓ Upgrade complete.\n`);
}
