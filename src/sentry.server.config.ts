/**
 * Sentry init for the Node.js server runtime. Loaded by
 * `src/instrumentation.ts` when `NEXT_RUNTIME === "nodejs"`.
 *
 * Server-side captures:
 *  - Unhandled errors in API routes / server actions / server
 *    components (via `onRequestError` in instrumentation.ts).
 *  - HTTP request traces with timing.
 *  - Local variable values attached to server stack frames
 *    (`includeLocalVariables: true`) — invaluable for "why did
 *    this if branch take that path" investigations.
 */

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    // Same string the build plugin registers in next.config.ts
    // (`turf-tracker@${version}`). Matched values are how events
    // tie to source maps + release-context features in the
    // dashboard. Set in next.config's `env` block so it's
    // available at server runtime without prod's env file
    // needing to know about it.
    release: process.env.SENTRY_RELEASE,
    sendDefaultPii: true,

    tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
    includeLocalVariables: true,

    // Same-origin only — we don't proxy out to other services.
    // Made explicit so distributed-trace coverage is documented.
    tracePropagationTargets: [/^\//],

    // Server-side noise filter. Better-Auth fetch path on logout/
    // expired session sometimes surfaces as a 401 wrapped in a
    // thrown Error; already handled by the auth flow, no action
    // needed.
    ignoreErrors: ["Unauthorized"],
  });
}
