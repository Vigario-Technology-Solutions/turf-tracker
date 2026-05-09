/**
 * Sentry init for the Edge runtime (middleware, edge route handlers).
 * Loaded by `src/instrumentation.ts` when `NEXT_RUNTIME === "edge"`.
 *
 * The Edge runtime is V8 isolates without Node APIs — the SDK ships
 * a separate slimmed-down build that targets it. We don't currently
 * use middleware or edge handlers, but the init is here so that if
 * we add one later it's already wired.
 */

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    release: process.env.SENTRY_RELEASE,
    sendDefaultPii: true,

    tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
  });
}
