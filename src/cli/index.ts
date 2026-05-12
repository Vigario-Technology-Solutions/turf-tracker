#!/usr/bin/env node
import * as Sentry from "@sentry/node";
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
 * import would crash on cold start. Caught here rather than registered
 * as a Commander option so it never lands in `--help`.
 *
 * Sentry init lives here (not in Next's instrumentation.ts) because
 * the CLI runtime is outside the next-server boot path entirely.
 * `turf upgrade`, `turf backup`, `turf restore`, etc. run as standalone
 * Node processes via /usr/bin/turf (the wrapper) → bin/turf.js. Without
 * the init below, CLI crashes land in the operator's stderr but never
 * reach Sentry — operationally invisible on cron-fired or background
 * invocations. Using @sentry/node directly (not the @sentry/nextjs
 * re-export) avoids loading any Next-specific code in the CLI context.
 * Same DSN + release as the Next runtime so events from both tie to
 * the same release in the Sentry dashboard. tracesSampleRate is lower
 * than the main service — CLI fires fewer ops than every API request.
 */

const sentryDsn = process.env.SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: process.env.NODE_ENV,
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: 0.1,
  });
}

if (process.argv.includes("--check")) {
  process.stdout.write("turf bundle: imports + init OK\n");
  process.exit(0);
}

try {
  await createProgram().parseAsync();
} catch (err) {
  // Capture before re-throwing so cron-fired CLI errors land in
  // Sentry. `flush(2000)` waits up to 2s for the envelope to upload —
  // without it the process exits before the network request completes
  // and the event is lost. The flush is a best-effort wait, not a
  // hard guarantee, but caps the worst-case shutdown delay at 2s.
  if (sentryDsn) {
    Sentry.captureException(err);
    await Sentry.flush(2000);
  }
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`error: ${message}\n`);
  process.exit(1);
}
