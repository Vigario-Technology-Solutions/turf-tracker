#!/usr/bin/env node
import { createProgram } from "./program";

/**
 * Top-level wrap so action-handler errors render as a single
 * "error: <message>" line instead of a raw Node stack trace.
 * Commander handles its own errors (--help, unknown subcommand)
 * internally and exits without throwing — those bypass this catch.
 *
 * Env loading:
 *   - dev:  `npm run turf -- ...`           → tsx --env-file=.env
 *   - prod: `node --env-file=.env bin/turf.js ...`
 *           or systemd EnvironmentFile=     (env inherited)
 *
 * Build-time smoke flag — `--check` exits 0 after module-level imports
 * resolve, before Commander parses argv. scripts/build-cli.ts spawns
 * the bundle with `--check` so the build fails fast if a transitive
 * import would crash on cold start in prod (e.g. a top-level require
 * that node can't satisfy in the standalone tar). Caught here rather
 * than registered as a Commander option so it never lands in `--help`.
 */

if (process.argv.includes("--check")) {
  process.stdout.write("turf bundle: imports + init OK\n");
  process.exit(0);
}

try {
  await createProgram().parseAsync();
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`error: ${message}\n`);
  process.exit(1);
}
