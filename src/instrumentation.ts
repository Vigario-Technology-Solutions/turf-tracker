/**
 * Next.js instrumentation hook.
 *
 * `register()` runs once when the server starts (under `next start`
 * and `next dev`) but NOT during `next build`. Use it to gate
 * runtime-required configuration: anything that would break a
 * request handler if missing should throw here so the server fails
 * fast before serving any traffic.
 *
 * Also runs the per-runtime Sentry init: the SDK ships separate
 * builds for Node and Edge, dispatched by `NEXT_RUNTIME`. The browser
 * init lives in `instrumentation-client.ts` and is loaded by Next
 * directly.
 *
 * See https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
    const { validateRuntimeConfig } = await import("@/lib/runtime-config");
    validateRuntimeConfig();
    return;
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
    return;
  }
}

/**
 * Server-side error capture for App Router errors that escape the
 * page-level `error.tsx` boundary (e.g., errors thrown in route
 * handlers, server actions, layouts). Forwards to Sentry. Requires
 * @sentry/nextjs >= 8.28.0.
 */
export const onRequestError = Sentry.captureRequestError;
