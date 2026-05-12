/**
 * Helpers for invoking the postgresql client tools (pg_dump,
 * pg_restore) and reasoning about version skew. Used by
 * `turf backup` and `turf restore`.
 *
 * The package isn't declared as a hard `Requires:` in the spec
 * because operators running remote Postgres often manage backup at
 * the database-host tier (pgBackRest, pg_basebackup, vendor
 * snapshots) and don't want ~30MB of unused client tools. The
 * runtime check + clear install hint puts the friction only on
 * operators who actually try to use `turf backup` for the DB
 * portion.
 */

import { spawn } from "node:child_process";
import prisma from "@/lib/db";

export interface PgVersions {
  client: string;
  server: string;
}

/** True when `pg_dump --version` runs cleanly. */
export async function pgDumpAvailable(): Promise<boolean> {
  try {
    await runCapture("pg_dump", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

/** Resolve client (from `pg_dump --version`) and server (from `SELECT version()`) majors+minors. */
export async function pgVersions(): Promise<PgVersions> {
  const clientOut = await runCapture("pg_dump", ["--version"]);
  // pg_dump (PostgreSQL) 17.2 → "17.2"
  const clientMatch = /pg_dump.*?(\d+)\.(\d+)/.exec(clientOut);
  const client = clientMatch ? `${clientMatch[1]}.${clientMatch[2]}` : clientOut.trim();

  const rows = await prisma.$queryRaw<{ version: string }[]>`SELECT version()`;
  const serverFull = rows[0]?.version ?? "";
  // PostgreSQL 18.0 on x86_64-pc-linux-gnu, compiled by gcc ... → "18.0"
  const serverMatch = /PostgreSQL (\d+)\.(\d+)/.exec(serverFull);
  const server = serverMatch ? `${serverMatch[1]}.${serverMatch[2]}` : serverFull;

  return { client, server };
}

/**
 * pg_dump's major version must be >= server's. Older clients refuse
 * to dump newer servers. Returns { ok: true } when compatible.
 */
export function checkClientNewerOrEqual(versions: PgVersions): {
  ok: boolean;
  reason?: string;
} {
  const clientMajor = parseInt(versions.client.split(".")[0], 10);
  const serverMajor = parseInt(versions.server.split(".")[0], 10);
  if (!Number.isFinite(clientMajor) || !Number.isFinite(serverMajor)) {
    return {
      ok: false,
      reason: `Could not parse versions (client=${versions.client}, server=${versions.server}).`,
    };
  }
  if (clientMajor < serverMajor) {
    return {
      ok: false,
      reason:
        `pg_dump ${versions.client} is older than server ${versions.server}. ` +
        `pg_dump must be >= server major. Upgrade the postgresql package on this host.`,
    };
  }
  return { ok: true };
}

export interface PgDumpOpts {
  databaseUrl: string;
  outPath: string;
}

/**
 * pg_dump --format=custom --no-owner --no-privileges. The custom
 * format is pg_restore-compatible and supports --clean / --if-exists
 * on the restore side. --no-owner / --no-privileges strips the ALTER
 * OWNER / GRANT statements that would otherwise replay role
 * assumptions that may not exist on the restore host.
 */
export function pgDump(opts: PgDumpOpts): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "pg_dump",
      ["--format=custom", "--no-owner", "--no-privileges", "-f", opts.outPath, opts.databaseUrl],
      { stdio: "inherit" },
    );
    proc.on("error", reject);
    proc.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`pg_dump exited with code ${code}`));
    });
  });
}

export interface PgRestoreOpts {
  databaseUrl: string;
  inPath: string;
}

/**
 * pg_restore --clean --if-exists --no-owner --no-privileges. --clean
 * + --if-exists wipes the existing schema/data and replays from
 * scratch, suppressing the "object does not exist" warnings for DROP
 * statements that don't apply.
 */
export function pgRestore(opts: PgRestoreOpts): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "pg_restore",
      [
        "--clean",
        "--if-exists",
        "--no-owner",
        "--no-privileges",
        "-d",
        opts.databaseUrl,
        opts.inPath,
      ],
      { stdio: "inherit" },
    );
    proc.on("error", reject);
    proc.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`pg_restore exited with code ${code}`));
    });
  });
}

function runCapture(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on("error", reject);
    proc.on("exit", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${cmd} exited ${code}: ${stderr}`));
    });
  });
}
