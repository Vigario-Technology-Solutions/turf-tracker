import { spawn } from "node:child_process";
import fs from "fs/promises";
import { existsSync, statfsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import type { Command } from "commander";
import prisma from "@/lib/db";
import { acquireFileLock } from "../../shared/flock";
import {
  checkClientNewerOrEqual,
  pgDump,
  pgDumpAvailable,
  pgVersions,
} from "../../shared/postgres-tools";

/**
 * `turf backup` — opinionated single-tarball backup.
 *
 * Bundles into one .tar.gz:
 *
 *   1. db.sql.custom    — pg_dump --format=custom of $DATABASE_URL
 *   2. storage.tar      — tar of $STORAGE_PATH, ONLY if STORAGE_PATH
 *                          is set in the env (turf-tracker has no
 *                          image-upload pipeline yet; the component is
 *                          there for the day it lands).
 *   3. sysconfig.env    — copy of /etc/sysconfig/turf-tracker (omit
 *                          with --no-sysconfig if the operator
 *                          segregates secrets from backup tarballs)
 *
 * Plus a manifest.json at the tarball root capturing app version,
 * timestamp, components, pg_dump format, and the latest applied
 * Prisma migration so `turf restore` can detect schema skew.
 *
 * Default output: $BACKUP_PATH/turf-tracker-<ISO>.tar.gz where
 * BACKUP_PATH defaults to /var/backups/turf-tracker (FHS-canonical,
 * pre-created by the RPM's tmpfiles.d entry). Operators who want a
 * different destination (e.g., a ZFS dataset under
 * /mnt/storage/backups/turf-tracker, an NFS mount, an EBS-attached
 * volume) override $BACKUP_PATH in /etc/sysconfig/turf-tracker AND
 * ensure the override path exists + is turf-tracker-writable.
 * --preserve writes to the preserve/ subdir of whichever root
 * resolved, intended as retention-safe (operator's retention policy
 * MUST exclude preserve/). --output PATH overrides both defaults.
 *
 * Concurrency: flock on /run/turf-tracker/backup.lock prevents a
 * restore mid-backup from leaving an inconsistent tarball, and
 * prevents two backups racing.
 *
 * Out of scope: retention, off-host shipping, encryption-at-rest,
 * verification drills, point-in-time recovery. Documented as operator
 * concerns in docs/deployment.md.
 */

// $BACKUP_PATH is operator-configurable in /etc/sysconfig/turf-tracker.
// /var/backups/turf-tracker is the FHS-canonical default and the path
// the RPM's tmpfiles.d entry pre-creates.
const BACKUP_ROOT = process.env.BACKUP_PATH || "/var/backups/turf-tracker";
const PRESERVE_DIR = `${BACKUP_ROOT}/preserve`;
const LOCK_PATH = "/run/turf-tracker/backup.lock";
const SYSCONFIG_PATH = "/etc/sysconfig/turf-tracker";

interface BackupOpts {
  output?: string;
  preserve?: boolean;
  sysconfig?: boolean; // commander --no-sysconfig sets this to false
}

export interface BackupManifest {
  app_version: string;
  timestamp: string;
  components: string[];
  pg_dump_format: "custom";
  schema_revision: string;
}

export function register(program: Command): void {
  program
    .command("backup")
    .description("Backup database (+ storage path, + sysconfig) to a single .tar.gz")
    .option("--output <path>", "write the backup to this path instead of the auto-detected default")
    .option("--preserve", `write to ${PRESERVE_DIR}/ instead of the retention-able root`)
    .option(
      "--no-sysconfig",
      "exclude /etc/sysconfig/turf-tracker from the backup (operator manages secrets separately)",
    )
    .action(async (opts: BackupOpts) => {
      try {
        await runBackup(opts);
      } finally {
        await prisma.$disconnect();
      }
    });
}

/**
 * Run a backup. Exported so `turf upgrade --backup-first` can invoke
 * it directly without spawning a child process.
 */
export async function runBackup(opts: BackupOpts): Promise<string> {
  const lock = await acquireFileLock(LOCK_PATH, "backup/restore");
  try {
    if (!(await pgDumpAvailable())) {
      throw new Error(
        "pg_dump not found. Install the postgresql client tools: sudo dnf install postgresql",
      );
    }
    const versions = await pgVersions();
    const versionCheck = checkClientNewerOrEqual(versions);
    if (!versionCheck.ok) {
      throw new Error(versionCheck.reason);
    }
    process.stderr.write(`pg_dump ${versions.client} ↔ server ${versions.server} — OK\n`);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").replace(/Z$/, "");
    const defaultFilename = `turf-tracker-${timestamp}.tar.gz`;
    const outDir = opts.output
      ? path.dirname(path.resolve(opts.output))
      : opts.preserve
        ? PRESERVE_DIR
        : BACKUP_ROOT;
    const outPath = opts.output ? path.resolve(opts.output) : path.join(outDir, defaultFilename);

    await fs.mkdir(outDir, { recursive: true });

    // Pre-flight disk space check — free space >= estimated size × 1.2.
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL not set in environment.");
    const dbSizeRows = await prisma.$queryRaw<
      { size: bigint }[]
    >`SELECT pg_database_size(current_database())::bigint AS size`;
    const dbBytes = Number(dbSizeRows[0]?.size ?? 0);
    // STORAGE_PATH is optional for turf-tracker — no image-upload
    // pipeline yet. Backup only includes storage when the env is set
    // AND the path exists.
    const storagePath = process.env.STORAGE_PATH;
    const storageBytes = storagePath ? await dirSize(storagePath) : 0;
    const estBytes = Math.ceil((dbBytes + storageBytes) * 1.2);
    const stats = statfsSync(outDir);
    const freeBytes = Number(stats.bavail) * Number(stats.bsize);
    if (freeBytes < estBytes) {
      throw new Error(
        `Insufficient disk space at ${outDir}: ${formatBytes(freeBytes)} free, ` +
          `~${formatBytes(estBytes)} needed (DB ${formatBytes(dbBytes)} + storage ${formatBytes(storageBytes)}, +20% margin). ` +
          `Free up space or pass --output to a different volume.`,
      );
    }

    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "turf-backup-"));
    try {
      process.stderr.write(`Dumping database…\n`);
      const dbDumpPath = path.join(workDir, "db.sql.custom");
      await pgDump({ databaseUrl, outPath: dbDumpPath });

      const components: string[] = ["db"];
      if (storagePath && existsSync(storagePath)) {
        process.stderr.write(`Tarring storage path ${storagePath}…\n`);
        const storageTarPath = path.join(workDir, "storage.tar");
        await runTar(["-cf", storageTarPath, "-C", storagePath, "."]);
        components.push("storage");
      }
      if (opts.sysconfig !== false) {
        if (existsSync(SYSCONFIG_PATH)) {
          await fs.copyFile(SYSCONFIG_PATH, path.join(workDir, "sysconfig.env"));
          components.push("sysconfig");
        } else {
          process.stderr.write(`(sysconfig file not found at ${SYSCONFIG_PATH} — skipping)\n`);
        }
      }

      const migRows = await prisma.$queryRaw<
        { migration_name: string }[]
      >`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1`;
      const schemaRevision = migRows[0]?.migration_name ?? "(none applied)";

      const manifest: BackupManifest = {
        app_version: process.env.APP_VERSION ?? "0.0.0",
        timestamp: new Date().toISOString(),
        components,
        pg_dump_format: "custom",
        schema_revision: schemaRevision,
      };
      await fs.writeFile(path.join(workDir, "manifest.json"), JSON.stringify(manifest, null, 2));

      process.stderr.write(`Bundling tarball…\n`);
      await runTar(["-czf", outPath, "-C", workDir, "."]);

      const finalStats = await fs.stat(outPath);
      process.stderr.write(`\n✓ Wrote ${outPath}\n`);
      process.stderr.write(`  Size:       ${formatBytes(finalStats.size)}\n`);
      process.stderr.write(`  Components: ${components.join(", ")}\n`);
      process.stderr.write(`  Schema:     ${schemaRevision}\n`);
      return outPath;
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

async function dirSize(p: string): Promise<number> {
  if (!existsSync(p)) return 0;
  let total = 0;
  for (const entry of await fs.readdir(p, { withFileTypes: true })) {
    const sub = path.join(p, entry.name);
    if (entry.isDirectory()) total += await dirSize(sub);
    else if (entry.isFile()) {
      const stat = await fs.stat(sub);
      total += stat.size;
    }
  }
  return total;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KiB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MiB`;
  return `${(n / 1024 ** 3).toFixed(2)} GiB`;
}
