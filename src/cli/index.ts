#!/usr/bin/env node
import { createProgram } from "./program";

/**
 * Top-level wrap so action-handler errors render as a single
 * "error: <message>" line instead of a raw Node stack trace.
 * Commander handles its own errors (--help, unknown subcommand)
 * internally and exits without throwing — those bypass this catch.
 *
 * Env loading: invoked via `tsx --env-file=.env src/cli/index.ts`
 * in dev (see package.json `turf` script). In prod the bundled
 * binary inherits env from systemd / shell.
 */
try {
  await createProgram().parseAsync();
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`error: ${message}\n`);
  process.exit(1);
}
