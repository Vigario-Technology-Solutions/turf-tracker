/**
 * Unit tests for pgConnString — the DATABASE_URL normalizer that
 * strips Prisma-only query params before handing the URL to
 * pg_dump / pg_restore.
 *
 * Failure mode it prevents: prod's DATABASE_URL carries Prisma pool
 * tuning (`?connection_limit=15&pool_timeout=10`); libpq's strict
 * parser aborts with "invalid URI query parameter" before connecting.
 * The normalizer is an allowlist (not denylist) because Prisma's
 * parameter set isn't versioned-stable.
 */
import { describe, expect, it } from "vitest";
import { pgConnString } from "@/cli/shared/postgres-tools";

describe("pgConnString", () => {
  it("strips Prisma pool params (connection_limit + pool_timeout)", () => {
    expect(pgConnString("postgres://u:p@h/db?connection_limit=15&pool_timeout=10")).toBe(
      "postgres://u:p@h/db",
    );
  });

  it("preserves libpq params (sslmode) while stripping Prisma ones", () => {
    expect(pgConnString("postgres://u:p@h/db?sslmode=require&connection_limit=15")).toBe(
      "postgres://u:p@h/db?sslmode=require",
    );
  });

  it("preserves libpq host param while stripping Prisma params", () => {
    expect(pgConnString("postgres://u:p@h/db?connection_limit=15&host=primary.local")).toBe(
      "postgres://u:p@h/db?host=primary.local",
    );
  });

  it("is a no-op on a URL with no query params", () => {
    expect(pgConnString("postgres://u:p@h/db")).toBe("postgres://u:p@h/db");
  });

  it("returns a bare URL when only Prisma params are present", () => {
    expect(
      pgConnString("postgres://u:p@h/db?connection_limit=15&schema=public&pgbouncer=true"),
    ).toBe("postgres://u:p@h/db");
  });

  it("preserves multiple libpq params unchanged", () => {
    const url = "postgres://u:p@h/db?sslmode=require&connect_timeout=10";
    expect(pgConnString(url)).toBe(url);
  });
});
