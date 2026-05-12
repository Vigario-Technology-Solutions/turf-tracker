/**
 * Per-test transaction wrapper.
 *
 * Wraps each test body in `prisma.$transaction(...)` and forces a
 * rollback at the end. Tests receive a `tx` argument and use it as
 * their Prisma client. Mutations vanish at the test boundary, so the
 * shared `turf_tracker_test` schema stays clean across the run
 * regardless of test order or parallelism.
 *
 * Usage:
 *
 *   import { test } from "@/tests/helpers/db";
 *
 *   test("rule fires when soil-test is stale", async (tx) => {
 *     const area = await tx.area.create({ ... });
 *     // ...assertions
 *     // tx is rolled back on test exit, no cleanup needed
 *   });
 *
 * Rollback is achieved by throwing a sentinel error inside the
 * transaction. Prisma rolls back on any throw; the wrapper catches
 * and swallows the sentinel. Real test failures still propagate.
 */

import { test as vitestTest } from "vitest";
import type { PrismaClient } from "@generated/prisma/client";
import prisma from "@/lib/db";

export type PrismaTx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

class RollbackSentinel extends Error {
  constructor() {
    super("test rollback");
    this.name = "RollbackSentinel";
  }
}

export function test(name: string, fn: (tx: PrismaTx) => Promise<void>, timeout?: number): void {
  vitestTest(
    name,
    async () => {
      try {
        await prisma.$transaction(
          async (tx) => {
            await fn(tx);
            throw new RollbackSentinel();
          },
          { timeout: 30_000 },
        );
      } catch (e) {
        if (!(e instanceof RollbackSentinel)) throw e;
      }
    },
    timeout,
  );
}
