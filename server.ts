/**
 * Custom entrypoint for the standalone Next.js server.
 *
 * Compiled by scripts/build-server.ts via esbuild → bin/server.mjs,
 * then copied to .next/standalone/server.mjs by scripts/postbuild.ts
 * (the tarball-root path that MANIFEST.startCommand targets).
 *
 * Replaces direct invocation of the auto-generated `server.js` to give
 * us SIGTERM/SIGINT graceful shutdown — drains in-flight requests,
 * disconnects Prisma, flushes Sentry, exits 0 instead of dying 143
 * mid-response (which made every deploy trip systemd's failure
 * notifier). See docs/SPEC.md §8.4.
 *
 * Compiled-from-TypeScript so it can share `@/lib/...` imports with
 * the Next app at compile time without a parallel implementation.
 * Same pattern as bin/seed.js / bin/turf.js.
 */

import { createServer, type Server } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import next from "next";
import * as Sentry from "@sentry/nextjs";

// --check escape hatch — used by scripts/build-server.ts (source-tree
// smoke) and scripts/postbuild.ts (standalone-tree smoke) to verify
// module-level imports resolve without starting the server. Must come
// after imports (ESM hoisting) but before any side-effecting setup.
//
// The standalone-tree --check is the load-bearing one: it catches the
// failure class where outputFileTracingIncludes silently drops a
// transitive dep's package.json. Source-tree --check can't see that
// because the source repo's node_modules is always complete.
if (process.argv.includes("--check")) {
  process.exit(0);
}

const DRAIN_TIMEOUT_MS = 30_000;
const SENTRY_FLUSH_TIMEOUT_MS = 2_000;

const log = (msg: string): void => {
  console.error(`[shutdown] ${msg}`);
};

let httpServer: Server | null = null;
let listening = false;
let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) {
    log(`${signal} arrived during shutdown; ignoring`);
    return;
  }
  shuttingDown = true;
  log(`${signal} received: drain → prisma → sentry → exit`);

  if (httpServer && listening) {
    const server = httpServer;
    server.closeIdleConnections();
    log("closed idle keep-alive connections");

    await new Promise<void>((resolve) => {
      const cap = setTimeout(() => {
        log(`drain hit ${DRAIN_TIMEOUT_MS / 1000}s cap; force-closing in-flight connections`);
        server.closeAllConnections();
        resolve();
      }, DRAIN_TIMEOUT_MS);
      cap.unref();

      server.close((err) => {
        clearTimeout(cap);
        if (err) log(`server.close error: ${err.message}`);
        else log("in-flight requests drained");
        resolve();
      });
    });
  } else {
    log("http server not yet listening; skip drain");
  }

  try {
    // src/lib/db.ts unconditionally registers the singleton on globalThis
    // (no NODE_ENV guard, unlike the typical Next+Prisma dev-only pattern),
    // so this lookup hits a real prod client once any DB-touching route ran.
    const g = globalThis as { prisma?: { $disconnect: () => Promise<void> } };
    const prisma = g.prisma;
    if (prisma && typeof prisma.$disconnect === "function") {
      await prisma.$disconnect();
      log("prisma disconnected");
    } else {
      log("no prisma client in globalThis; skip");
    }
  } catch (err) {
    log(`prisma.$disconnect error: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    await Sentry.close(SENTRY_FLUSH_TIMEOUT_MS);
    log("sentry flushed");
  } catch (err) {
    log(`Sentry.close error: ${err instanceof Error ? err.message : String(err)}`);
  }

  log("exit 0");
  process.exit(0);
}

process.on("SIGTERM", () => {
  shutdown("SIGTERM").catch((err) => {
    console.error("[shutdown] uncaught", err);
  });
});
process.on("SIGINT", () => {
  shutdown("SIGINT").catch((err) => {
    console.error("[shutdown] uncaught", err);
  });
});

const dir = path.dirname(fileURLToPath(import.meta.url));
process.chdir(dir);
// Mirrors the defensive set in the auto-generated standalone server.js.
// process.env.NODE_ENV is typed readonly by Next's ambient declarations,
// hence the cast.
(process.env as Record<string, string | undefined>).NODE_ENV = "production";

const port = parseInt(process.env.PORT ?? "", 10) || 3000;
const hostname = process.env.HOSTNAME ?? "0.0.0.0";

const app = next({ dev: false, dir, hostname, port });
const handle = app.getRequestHandler();
await app.prepare();

httpServer = createServer((req, res) => {
  void handle(req, res);
});
httpServer.on("error", (err) => {
  console.error("[server] listen/runtime error:", err);
  process.exit(1);
});
httpServer.listen(port, hostname, () => {
  listening = true;
  console.log(`> Ready on http://${hostname}:${port}`);
});
