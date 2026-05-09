/**
 * Custom entrypoint for the standalone Next.js server.
 *
 * Replaces direct invocation of the auto-generated `server.js` so we
 * can drain in-flight requests, disconnect Prisma, flush queued Sentry
 * envelopes, and exit 0 on SIGTERM/SIGINT instead of dying 143
 * mid-response (which made `OnFailure=systemd-failure-notify` fire on
 * every deploy). See docs/deployment.md "Shutdown contract".
 */

import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import next from "next";
import * as Sentry from "@sentry/nextjs";

const DRAIN_TIMEOUT_MS = 30_000;
const SENTRY_FLUSH_TIMEOUT_MS = 2_000;

/** @param {string} msg */
const log = (msg) => console.error(`[shutdown] ${msg}`);

/** @type {import("node:http").Server | null} */
let httpServer = null;
let listening = false;
let shuttingDown = false;

/** @param {NodeJS.Signals} signal */
async function shutdown(signal) {
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

    await new Promise((resolve) => {
      const cap = setTimeout(() => {
        log(`drain hit ${DRAIN_TIMEOUT_MS / 1000}s cap; force-closing in-flight connections`);
        server.closeAllConnections();
        resolve(undefined);
      }, DRAIN_TIMEOUT_MS);
      cap.unref();

      server.close((err) => {
        clearTimeout(cap);
        if (err) log(`server.close error: ${err.message}`);
        else log("in-flight requests drained");
        resolve(undefined);
      });
    });
  } else {
    log("http server not yet listening; skip drain");
  }

  try {
    // src/lib/db.ts unconditionally registers the singleton on globalThis
    // (no NODE_ENV guard, unlike the typical Next+Prisma dev-only pattern),
    // so this lookup hits a real prod client once any DB-touching route ran.
    const g = /** @type {{ prisma?: { $disconnect: () => Promise<void> } }} */ (globalThis);
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
  shutdown("SIGTERM").catch((err) => console.error("[shutdown] uncaught", err));
});
process.on("SIGINT", () => {
  shutdown("SIGINT").catch((err) => console.error("[shutdown] uncaught", err));
});

const dir = path.dirname(fileURLToPath(import.meta.url));
process.chdir(dir);
process.env.NODE_ENV = "production";

const port = parseInt(process.env.PORT ?? "", 10) || 3000;
const hostname = process.env.HOSTNAME || "0.0.0.0";

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
