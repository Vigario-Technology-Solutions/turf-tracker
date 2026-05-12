/**
 * Filter the pg@8 → pg@9 transition warning that fires from inside
 * `@prisma/adapter-pg` during `prisma.$transaction`. Test code uses
 * sequential `await`s; a standalone repro on plain `pg.Client` doesn't
 * reproduce it. The warning is noise here and will go away when PrismaPg
 * upgrades for pg@9.
 *
 * Loaded as a vitest `setupFiles` so it runs in every worker.
 *
 * We override `process.emit('warning', ...)` rather than adding a
 * `warning` listener, because Node's built-in handler (which prints the
 * warning to stderr) is hard-attached and can't be removed cleanly. The
 * emit override sits in front of every listener, including the default.
 */

const SUPPRESSED = "Calling client.query() when the client is already executing a query";

const originalEmit = process.emit.bind(process);

process.emit = function (this: typeof process, name: string | symbol, ...args: unknown[]): boolean {
  if (name === "warning") {
    const warning = args[0] as { name?: string; message?: string } | undefined;
    if (warning?.name === "DeprecationWarning" && warning.message?.startsWith(SUPPRESSED)) {
      return false;
    }
  }
  return (originalEmit as (n: string | symbol, ...a: unknown[]) => boolean)(name, ...args);
} as typeof process.emit;
