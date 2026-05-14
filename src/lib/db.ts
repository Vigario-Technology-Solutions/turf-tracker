import { PrismaClient } from "@generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Defer the missing-DATABASE_URL throw to first prisma access.
//
// Prior shape: `process.env.DATABASE_URL ?? "postgresql://postgres:postgres@
// localhost:5432/turf_tracker"`. Silent fallback masked misconfiguration —
// runtime-config.ts validates DATABASE_URL at server startup via
// instrumentation.ts, but any code path that imports prisma OUTSIDE the
// server-boot path (CLI subcommands, ad-hoc scripts, vitest projects
// without env) bypassed that check and silently connected to a
// localhost dev DB instead of erroring.
//
// Why not throw at module init: scripts/build-cli.ts runs a smoke test
// that spawns the bundle with `--check` AND `DATABASE_URL: ""` to
// verify imports resolve on cold start. That's a legitimate gate —
// "does the bundle load without crashing" is independent of "is there
// a DB". A module-init throw conflates the two and breaks the gate.
//
// Proxy approach preserves the fail-loud message: first property
// access on `prisma` triggers `buildPrisma()`, which throws with the
// operator-facing instructions when DATABASE_URL is unset. Code paths
// that don't touch prisma (smoke tests, --help, --version) never
// trigger the construct and load cleanly.

const connectionString = process.env.DATABASE_URL;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function buildPrisma(): PrismaClient {
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Set it in your environment, or invoke this " +
        "through `turf` (which sources /etc/sysconfig/turf-tracker).",
    );
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

// First .get on the proxy lazily constructs the client, caches on
// globalForPrisma (dev hot-reload friendly), and forwards every
// subsequent access. Function values are .bind()'d so $queryRaw,
// $transaction, $disconnect etc. preserve `this`. Property values
// (the per-model delegates like `prisma.user`) come through
// unbound — Prisma's generated delegates carry their own `this`
// via internal symbol keys, so forwarding the bare reference works.
const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver): unknown {
    if (!globalForPrisma.prisma) {
      globalForPrisma.prisma = buildPrisma();
    }
    const client = globalForPrisma.prisma;
    const value: unknown = Reflect.get(client, prop, receiver);
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(client)
      : value;
  },
});

export { prisma };
export default prisma;
