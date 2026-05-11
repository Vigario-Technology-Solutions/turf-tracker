/**
 * Custom server entrypoint.
 *
 * Compiled by scripts/build-server.ts via esbuild → server.js at
 * the repo root. `npm start` (= `node server.js`) is what invokes it.
 *
 * Why a custom entrypoint instead of `next start`:
 * graceful SIGTERM/SIGINT handling — drains in-flight HTTP requests,
 * disconnects Prisma, flushes Sentry, exits 0. systemd's
 * `systemctl stop` gets a clean exit code so
 * `OnFailure=systemd-failure-notify` stays diagnostic-only. See
 * docs/deployment.md "Shutdown contract".
 *
 * Uses the documented Next custom-server API:
 * `next({...}) + app.prepare() + http.createServer(handle)`. Works
 * because the build-on-prod model ships full production deps —
 * `loadConfig`'s dynamic require of `next/dist/compiled/webpack/*`
 * resolves cleanly. The earlier wrap-shape (one-shot
 * http.createServer patch + dynamic import("./server.js")) existed
 * to dodge that path under output:"standalone" and is unnecessary
 * once we're not running standalone — also broken in transpilation
 * (esbuild collapsed the literal dynamic import to a self-reference).
 */

import next from "next";
import http, { type Server } from "node:http";
import Sentry from "@sentry/nextjs";
import prisma from "@/lib/db";

// --check escape hatch: exits before app.prepare() so the build:server
// --check smoke can validate module-level imports without booting Next.
// scripts/postbuild.ts spawns a real boot; build-server.ts's --check is
// the cheap pre-check.
//
// NB: --check exits before any of the code paths that have killed prior
// releases run. The real-boot postbuild smoke is what catches the
// listen/shutdown classes.
if (process.argv.includes("--check")) {
  process.exit(0);
}

const DRAIN_TIMEOUT_MS = 30_000;
const SENTRY_FLUSH_TIMEOUT_MS = 2_000;

// Default to loopback. Production overrides HOSTNAME=0.0.0.0 in its
// env file to expose the service. A deploy that comes up without the
// override is reachable only through the local reverse proxy, never
// the LAN/WAN. See docs/deployment.md.
const port = parseInt(process.env.PORT ?? "", 10) || 3000;
const hostname = process.env.HOSTNAME ?? "127.0.0.1";

const log = (msg: string): void => {
  console.error(`[shutdown] ${msg}`);
};

// ============================================================
// Bootstrap
// ============================================================

const app = next({ dev: false, hostname, port });
const handle = app.getRequestHandler();
await app.prepare();

const httpServer: Server = http.createServer((req, res) => {
  void handle(req, res);
});

httpServer.on("error", (err) => {
  console.error("[server] error:", err);
  process.exit(1);
});

let shuttingDown = false;

// ============================================================
// Shutdown
// ============================================================

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) {
    log(`${signal} arrived during shutdown; ignoring`);
    return;
  }
  shuttingDown = true;
  log(`${signal} received: drain → prisma → sentry → exit`);

  if (httpServer.listening) {
    httpServer.closeIdleConnections();
    log("closed idle keep-alive connections");

    await new Promise<void>((resolve) => {
      const cap = setTimeout(() => {
        log(`drain hit ${DRAIN_TIMEOUT_MS / 1000}s cap; force-closing in-flight connections`);
        httpServer.closeAllConnections();
        resolve();
      }, DRAIN_TIMEOUT_MS);
      cap.unref();

      httpServer.close((err) => {
        clearTimeout(cap);
        if (err) log(`server.close error: ${err.message}`);
        else log("in-flight requests drained");
        resolve();
      });
    });
  } else {
    log("http server not listening; skip drain");
  }

  try {
    await prisma.$disconnect();
    log("prisma disconnected");
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

// ============================================================
// Listen
// ============================================================

httpServer.listen(port, hostname, () => {
  console.log(`> Ready on http://${hostname}:${port}`);
});
