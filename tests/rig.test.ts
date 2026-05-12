/**
 * Rig health check. Confirms globalSetup bootstrapped `turf_tracker_test`
 * and the `test()` wrapper rolls back mutations at the test boundary.
 * Serves as the canary for "the test infrastructure itself is broken"
 * vs "the test logic is broken." Without this file, the gate's Postgres
 * service block + globalSetup + transaction-rolling harness would only
 * be exercised when some other DB-backed test happened to run — and the
 * first such test author would have to debug both their test and any
 * harness drift simultaneously.
 *
 * Asserts:
 *   1. db push synced the schema (otherwise lookup tables wouldn't exist).
 *   2. db seed populated the lookup tables (otherwise the rule engine
 *      would have nothing to reference at runtime).
 *   3. The transaction wrapper actually rolls back (otherwise tests
 *      would silently leak state into each other).
 */

import { test as vitestTest, expect } from "vitest";
import prisma from "@/lib/db";
import { test } from "./helpers/db";

vitestTest("rig boots: lookup tables are seeded", async () => {
  const areaTypeCount = await prisma.areaType.count();
  const irrigationSourceCount = await prisma.irrigationSource.count();

  expect(areaTypeCount).toBeGreaterThan(0);
  expect(irrigationSourceCount).toBeGreaterThan(0);
});

test("rig rolls back: mutations inside test() do not persist", async (tx) => {
  const before = await tx.user.count();

  await tx.user.create({
    data: {
      email: `rollback-canary-${Date.now()}@turf-tracker.invalid`,
      name: "Rollback Canary",
      displayName: "Rollback Canary",
      emailVerified: true,
    },
  });

  const inside = await tx.user.count();
  expect(inside).toBe(before + 1);

  // After this test exits, the sentinel rollback fires. The next
  // assertion runs in a follow-up test below to confirm the row didn't
  // survive.
});

vitestTest("rig rolls back: confirm previous mutation vanished", async () => {
  const matching = await prisma.user.count({
    where: { email: { startsWith: "rollback-canary-" } },
  });
  expect(matching).toBe(0);
});
