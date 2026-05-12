/**
 * Vitest globalSetup — runs once before all test files.
 *
 * Drops + recreates the dedicated test database, syncs the current
 * `schema.prisma` directly via `prisma db push`, and seeds lookups.
 * Tests then run against a freshly bootstrapped schema with lookup
 * tables primed; per-test transaction rollback (see `db.ts`) keeps
 * mutations isolated from each other.
 *
 * Why `db push` instead of `migrate deploy`: tests validate code-vs-
 * schema fidelity. Migration-vs-prod fidelity is a separate concern,
 * validated by restoring a prod backup and running `migrate deploy`
 * against it. Coupling the two means a branch in active dev (where
 * migrations may not yet be generated) can't run tests at all.
 *
 * Connection strings:
 *   ADMIN_URL — admin connection used to DROP/CREATE the test database
 *               (must point at a database OTHER than the test one).
 *   TEST_URL  — connection string handed to Prisma during the run.
 *
 * Both default to localhost:5432 with `postgres/postgres` credentials —
 * matches the dev local Postgres setup. In CI the workflow's gate job
 * sets TEST_ADMIN_DATABASE_URL + TEST_DATABASE_URL pointing at the
 * Postgres-17 service container.
 */

import { execSync } from "node:child_process";
import { Client } from "pg";

const TEST_DB_NAME = "turf_tracker_test";

const ADMIN_URL =
  process.env.TEST_ADMIN_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/postgres";

const TEST_URL =
  process.env.TEST_DATABASE_URL ?? `postgresql://postgres:postgres@localhost:5432/${TEST_DB_NAME}`;

export async function setup(): Promise<void> {
  const admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();

  // Force-disconnect any leftover sessions so DROP can proceed.
  await admin.query(
    `SELECT pg_terminate_backend(pid)
       FROM pg_stat_activity
      WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [TEST_DB_NAME],
  );
  await admin.query(`DROP DATABASE IF EXISTS "${TEST_DB_NAME}"`);
  await admin.query(`CREATE DATABASE "${TEST_DB_NAME}"`);
  await admin.end();

  const childEnv = { ...process.env, DATABASE_URL: TEST_URL };

  execSync("npx prisma db push --accept-data-loss", {
    env: childEnv,
    stdio: "inherit",
  });
  execSync("npx prisma db seed", { env: childEnv, stdio: "inherit" });
}

export async function teardown(): Promise<void> {
  // Intentional no-op: leave turf_tracker_test in place after the run
  // so failures can be inspected with psql. The next run drops it.
}
