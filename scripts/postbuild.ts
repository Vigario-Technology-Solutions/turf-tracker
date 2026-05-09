/**
 * Post-`next build` finalization for the standalone tree.
 *
 *   1. Copy bin/server.mjs into .next/standalone/server.mjs (the path
 *      MANIFEST.startCommand targets).
 *   2. Smoke-test the COPIED bundle in-place: `node server.mjs --check`
 *      with cwd .next/standalone, so module resolution runs against
 *      .next/standalone/node_modules/ — the exact tree prod executes.
 *
 * Why this exists separately from build-server.ts: that script's own
 * `--check` runs against the source repo's node_modules where every
 * dep resolves trivially. It can't catch the failure class where
 * outputFileTracingIncludes silently drops files from a traced
 * external (e.g. a transitive's package.json), which is what tipped
 * over vis-daily-tracker v2.80.0 — server.mjs imported @sentry/nextjs,
 * the standalone tar got the build/ subtree but not package.json, and
 * prod failed with ERR_MODULE_NOT_FOUND at startup. Build was green;
 * deploy aborted. Running the bundle against the standalone tree at
 * build time closes that loop: if the artifact can't load its imports,
 * the build fails before the tarball is published.
 *
 * NOT a substitute for the deploy-side health check + rollback. A
 * source-side smoke catches the build's contribution to the failure;
 * the deploy contract still has to refuse to swap an artifact that
 * doesn't answer /api/health.
 */
import { copyFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const src = "bin/server.mjs";
const dest = ".next/standalone/server.mjs";

await copyFile(src, dest);
console.log(`  ${src} -> ${dest}`);

const probe = spawnSync(process.execPath, ["server.mjs", "--check"], {
  stdio: "inherit",
  cwd: ".next/standalone",
  // Same rationale as build-server.ts: --check exits before any side
  // effect, but stripping these is belt-and-suspenders against any
  // module that validates env at import time.
  env: { ...process.env, DATABASE_URL: "", SENTRY_DSN: "" },
});
if (probe.status !== 0) {
  console.error(`[postbuild] standalone smoke test failed (exit ${probe.status})`);
  process.exit(1);
}
console.log("  standalone smoke test ok");
