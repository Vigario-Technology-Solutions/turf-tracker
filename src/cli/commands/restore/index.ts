import { spawn, spawnSync } from "node:child_process";
import fs from "fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import type { Command } from "commander";
import prisma from "@/lib/db";
import { acquireFileLock } from "../../shared/flock";
import { text } from "../../shared/prompts";
import {
  checkClientNewerOrEqual,
  pgDumpAvailable,
  pgRestore,
  pgVersions,
} from "../../shared/postgres-tools";
import { systemctlIsActive, systemctlRun } from "../../shared/systemctl";
import type { BackupManifest } from "../backup";

/**
 * `turf restore <backup-path>` — destructive restore from a `turf
 * backup` tarball.
 *
 * Steps, all wrapped in flock against the same backup lock:
 *
 *   1. Verify pg_restore is available + client major >= server major.
 *   2. Extract the tarball to a tmpdir; read manifest.json before
 *      touching anything else.
 *   3. Check manifest.app_version major against installed major; if
 *      they differ, refuse unless --force.
 *   4. Print the manifest + the destructive plan; prompt the operator
 *      to type the backup filename to confirm (--yes bypasses for
 *      automation).
 *   5. Stop turf-tracker.service if active.
 *   6. pg_restore --clean --if-exists against $DATABASE_URL.
 *   7. Wipe + repopulate $STORAGE_PATH from storage.tar (only when
 *      STORAGE_PATH is set AND the backup carries a storage
 *      component).
 *   8. Copy sysconfig.env back to /etc/sysconfig/turf-tracker (unless
 *      --no-sysconfig).
 *   9. Start turf-tracker.service (only if it was active before).
 *
 * If the restore corrupts something downstream of the wipe (e.g.,
 * pg_restore fails mid-stream), the operator restores from an older
 * backup. Rollback-of-rollback is operator territory.
 */

const LOCK_PATH = "/run/turf-tracker/backup.lock";
const SYSCONFIG_PATH = "/etc/sysconfig/turf-tracker";

/**
 * Paths the restore command refuses to wipe even if STORAGE_PATH is
 * misconfigured to one of them. fs.rm(..., recursive: true, force:
 * true) on `/` or `/var/lib` would be catastrophic; the storage
 * subdir is meant to live INSIDE one of these, not BE one of them.
 */
const DANGEROUS_STORAGE_PATHS = new Set([
  "/",
  "/bin",
  "/boot",
  "/dev",
  "/etc",
  "/home",
  "/lib",
  "/lib64",
  "/mnt",
  "/opt",
  "/proc",
  "/root",
  "/run",
  "/sbin",
  "/srv",
  "/sys",
  "/tmp",
  "/usr",
  "/var",
  "/var/cache",
  "/var/lib",
  "/var/lib/turf-tracker",
  "/var/log",
  "/var/run",
]);

function assertSafeStoragePath(p: string): void {
  const resolved = path.resolve(p);
  if (!resolved || resolved === "/") {
    throw new Error(`STORAGE_PATH=${p} resolves to root filesystem — refusing to wipe.`);
  }
  if (DANGEROUS_STORAGE_PATHS.has(resolved)) {
    throw new Error(
      `STORAGE_PATH=${p} resolves to system path ${resolved} — refusing to wipe. ` +
        `Storage should live in a dedicated subdir.`,
    );
  }
  if (!existsSync(resolved)) {
    throw new Error(
      `STORAGE_PATH=${p} does not exist — refusing to extract into a non-existent path. ` +
        `Operator should mkdir the path or fix STORAGE_PATH before retrying.`,
    );
  }
}

interface RestoreOpts {
  sysconfig?: boolean; // commander --no-sysconfig sets this to false
  force?: boolean;
  yes?: boolean;
}

export function register(program: Command): void {
  program
    .command("restore <backup-path>")
    .description("Restore from a backup tarball (DESTRUCTIVE — wipes current DB + storage)")
    .option(
      "--no-sysconfig",
      "skip restoring /etc/sysconfig/turf-tracker (keep current operator values)",
    )
    .option("--force", "proceed even if the backup's app major version differs from installed")
    .option("--yes", "skip the type-the-filename confirmation prompt (for automation)")
    .action(async (backupPath: string, opts: RestoreOpts) => {
      try {
        await runRestore(backupPath, opts);
      } finally {
        await prisma.$disconnect();
      }
    });
}

async function runRestore(backupPath: string, opts: RestoreOpts): Promise<void> {
  const resolved = path.resolve(backupPath);
  if (!existsSync(resolved)) {
    throw new Error(`Backup file not found: ${resolved}`);
  }
  const filename = path.basename(resolved);

  const lock = await acquireFileLock(LOCK_PATH, "backup/restore");
  try {
    if (!(await pgDumpAvailable())) {
      throw new Error(
        "pg_restore not found (ships with pg_dump). Install: sudo dnf install postgresql",
      );
    }
    const versions = await pgVersions();
    const versionCheck = checkClientNewerOrEqual(versions);
    if (!versionCheck.ok) {
      throw new Error(versionCheck.reason);
    }

    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "turf-restore-"));
    try {
      process.stderr.write(`Extracting ${resolved}…\n`);
      await runTar(["-xzf", resolved, "-C", workDir]);

      const manifestPath = path.join(workDir, "manifest.json");
      if (!existsSync(manifestPath)) {
        throw new Error(`Backup is missing manifest.json — not a turf-tracker backup, or corrupt.`);
      }
      const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as BackupManifest;

      const installedVersion = process.env.APP_VERSION ?? "0.0.0";
      const backupMajor = parseInt(manifest.app_version.split(".")[0], 10);
      const installedMajor = parseInt(installedVersion.split(".")[0], 10);
      if (
        Number.isFinite(backupMajor) &&
        Number.isFinite(installedMajor) &&
        backupMajor !== installedMajor
      ) {
        const message = `Backup is from v${manifest.app_version}, installed is v${installedVersion} (major version differs).`;
        if (!opts.force) {
          throw new Error(
            `${message} Refusing to restore — schema may be irreconcilable. Pass --force to override.`,
          );
        }
        process.stderr.write(`⚠ ${message} Proceeding due to --force.\n`);
      }

      // STORAGE_PATH may not be set on turf-tracker (no image-upload
      // pipeline yet). Only act on the storage component when both
      // the env var is set AND the backup carries one.
      const storagePath = process.env.STORAGE_PATH;
      const willRestoreStorage = !!storagePath && manifest.components.includes("storage");
      const willRestoreSysconfig =
        opts.sysconfig !== false && manifest.components.includes("sysconfig");

      process.stderr.write(`\nRestore plan:\n`);
      process.stderr.write(`  Backup:     ${filename}\n`);
      process.stderr.write(`  Created:    ${manifest.timestamp}\n`);
      process.stderr.write(`  App ver:    ${manifest.app_version}\n`);
      process.stderr.write(`  Schema:     ${manifest.schema_revision}\n`);
      process.stderr.write(`  Components: ${manifest.components.join(", ")}\n`);
      if (manifest.components.includes("storage") && !storagePath) {
        process.stderr.write(
          `  (backup has storage but STORAGE_PATH is not set — storage will be skipped)\n`,
        );
      }
      if (manifest.components.includes("sysconfig") && opts.sysconfig === false) {
        process.stderr.write(
          `  (--no-sysconfig: backup has sysconfig but it will not be restored)\n`,
        );
      }
      process.stderr.write(`\nThis will:\n`);
      let step = 1;
      process.stderr.write(`  ${step++}. Stop turf-tracker.service\n`);
      process.stderr.write(`  ${step++}. Wipe-and-replace the database (pg_restore --clean)\n`);
      if (willRestoreStorage) {
        process.stderr.write(`  ${step++}. Replace ${storagePath}\n`);
      }
      if (willRestoreSysconfig) {
        process.stderr.write(`  ${step++}. Replace /etc/sysconfig/turf-tracker\n`);
      }
      process.stderr.write(`  ${step++}. Start turf-tracker.service\n\n`);

      if (!opts.yes) {
        await text(`Type the backup filename to confirm`, {
          validate: (v) => (v === filename ? null : `Doesn't match "${filename}". Aborting.`),
        });
      }

      const wasActive = await systemctlIsActive("turf-tracker.service");
      if (wasActive) {
        await systemctlRun("stop", "turf-tracker.service");
      }

      const dbDumpPath = path.join(workDir, "db.sql.custom");
      if (manifest.components.includes("db") && existsSync(dbDumpPath)) {
        process.stderr.write(`Restoring database…\n`);
        const databaseUrl = process.env.DATABASE_URL;
        if (!databaseUrl) throw new Error("DATABASE_URL not set in environment.");
        await pgRestore({ databaseUrl, inPath: dbDumpPath });
      }

      const storageTarPath = path.join(workDir, "storage.tar");
      if (willRestoreStorage && existsSync(storageTarPath)) {
        // Foot-gun guard: misconfigured STORAGE_PATH (e.g., env override
        // pointing at /var/lib or /) would have fs.rm wipe far more
        // than the user data subdir. Refuse system paths up front.
        assertSafeStoragePath(storagePath);
        process.stderr.write(`Restoring storage path ${storagePath}…\n`);
        await fs.rm(storagePath, { recursive: true, force: true });
        await fs.mkdir(storagePath, { recursive: true });
        await runTar(["-xf", storageTarPath, "-C", storagePath]);
      }

      const sysconfigSrc = path.join(workDir, "sysconfig.env");
      if (willRestoreSysconfig && existsSync(sysconfigSrc)) {
        process.stderr.write(`Restoring sysconfig…\n`);
        await fs.copyFile(sysconfigSrc, SYSCONFIG_PATH);
        // Match `turf setup`'s canonical 0o640 root:turf-tracker —
        // service-secrets pattern (group readable by the service uid,
        // not world). Systemd-invoked unit paths and the CLI wrapper
        // both read this file as the turf-tracker user via group
        // membership; restoring at 0o600 root:root would re-break the
        // exact failure mode the setup-side fix addresses.
        await fs.chmod(SYSCONFIG_PATH, 0o640);
        const chown = spawnSync("chown", ["root:turf-tracker", SYSCONFIG_PATH]);
        if (chown.status !== 0) {
          process.stderr.write(
            `  Note: chown root:turf-tracker ${SYSCONFIG_PATH} failed — the service user won't be able to read this file via group membership. Fix: \`sudo chown root:turf-tracker ${SYSCONFIG_PATH}\`.\n`,
          );
        }
      }

      if (wasActive) {
        await systemctlRun("start", "turf-tracker.service");
      } else {
        process.stderr.write(
          `(turf-tracker.service was not active before restore — leaving stopped)\n`,
        );
      }

      process.stderr.write(`\n✓ Restore complete.\n`);
    } finally {
      await fs.rm(workDir, { recursive: true, force: true });
    }
  } finally {
    await lock.release();
  }
}

function runTar(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("tar", args, { stdio: "inherit" });
    proc.on("error", reject);
    proc.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`tar exited ${code}`));
    });
  });
}
