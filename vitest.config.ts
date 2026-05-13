import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/turf_tracker_test";

// Two-project layout — pure tests that run anywhere on one side,
// DB-touching tests that need a live Postgres on the other.
//
//   src/**/*.test.ts          — pure logic (calc/, rules/), co-located
//                               with source. Unit project.
//   tests/unit/**/*.test.ts   — pure tests under tests/ for things
//                               that aren't a natural src/ neighbour
//                               (required-env, postgres-tools).
//   tests/integration/**/*    — uses the transaction-rollback rig in
//                               tests/helpers/db.ts, which connects
//                               to turf_tracker_test on the local
//                               Postgres. Pre-commit doesn't run
//                               these; CI runs both.
//
// Package scripts (see package.json):
//   npm test                 — both projects (CI default)
//   npm run test:unit        — unit project only (pre-commit gate)
//   npm run test:integration — integration project only

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      "@generated": resolve(__dirname, "./generated"),
      // Tests run in a node env, not a Next.js client/server context,
      // so the `server-only` runtime guard would throw. Alias it to
      // an empty stub.
      "server-only": resolve(__dirname, "./tests/helpers/server-only-stub.ts"),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts", "tests/unit/**/*.test.ts"],
          exclude: ["node_modules", ".next", "generated"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          exclude: ["node_modules", ".next", "generated"],
          // Drops + recreates turf_tracker_test, db push schema.prisma,
          // seed lookups. Runs once before any integration test file
          // loads. See tests/helpers/setup.ts.
          globalSetup: ["./tests/helpers/setup.ts"],
          // Per-worker setup. Loaded into every test file's module
          // scope before tests run. Currently only filters a pg@8
          // deprecation warning emitted from inside @prisma/adapter-pg
          // during $transaction calls.
          setupFiles: ["./tests/helpers/suppress-pg-warning.ts"],
          env: {
            // Integration tests use a dedicated DB so concurrent dev
            // work + the test run don't trample each other. The
            // wrapper imports `prisma` from @/lib/db which reads
            // DATABASE_URL at module load — vitest sets it here
            // BEFORE any test module loads.
            DATABASE_URL: TEST_DATABASE_URL,
          },
          // Bumped from vitest's 5s default. Transaction-wrapped tests
          // (tests/helpers/db.ts) pass `timeout: 30_000` to
          // $transaction; hookTimeout covers globalSetup which does
          // db push + seed and can run ~10s on a cold cache.
          testTimeout: 15000,
          hookTimeout: 30000,
        },
      },
    ],
  },
});
