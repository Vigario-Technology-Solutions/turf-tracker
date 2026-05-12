import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/turf_tracker_test";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      "@generated": resolve(__dirname, "./generated"),
      // Tests run in a node env, not a Next.js client/server context, so
      // the `server-only` runtime guard would throw. Alias it to an
      // empty stub.
      "server-only": resolve(__dirname, "./tests/helpers/server-only-stub.ts"),
    },
  },
  test: {
    // Drops + recreates turf_tracker_test, db push schema.prisma, seed
    // lookups. Runs once before any test file loads. See
    // tests/helpers/setup.ts.
    globalSetup: ["./tests/helpers/setup.ts"],
    // Per-worker setup. Loaded into every test file's module scope
    // before tests run. Currently only filters a pg@8 deprecation
    // warning emitted from inside @prisma/adapter-pg during
    // $transaction calls.
    setupFiles: ["./tests/helpers/suppress-pg-warning.ts"],
    env: {
      // Tests use a dedicated DB so concurrent dev work + the test run
      // don't trample each other. The wrapper imports `prisma` from
      // @/lib/db which reads DATABASE_URL at module load — vitest sets
      // it here BEFORE any test module loads.
      DATABASE_URL: TEST_DATABASE_URL,
    },
    // Pure-logic tests live next to source under src/**; integration
    // tests that exercise the DB live under tests/**. Both run by
    // default. exclude keeps build outputs and the generated Prisma
    // tree from getting picked up.
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    exclude: ["node_modules", ".next", "generated"],
    // Bumped from vitest's 5s default. Transaction-wrapped tests
    // (tests/helpers/db.ts) pass `timeout: 30_000` to $transaction;
    // hookTimeout covers globalSetup which does db push + seed and
    // can run ~10s on a cold cache.
    testTimeout: 15000,
    hookTimeout: 30000,
  },
});
