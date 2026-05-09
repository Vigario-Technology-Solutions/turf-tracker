/**
 * Sentry browser/client init. Loaded by Next.js automatically — see
 * https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation-client
 *
 * The DSN comes from `NEXT_PUBLIC_SENTRY_DSN`, inlined at build time.
 * If absent, init is a no-op and the rest of the app runs normally.
 *
 * `tracesSampleRate` is gentle in prod (10%) — performance traces add
 * up volume-wise. Replays are scoped to error sessions only via
 * `replaysOnErrorSampleRate: 1.0` + `replaysSessionSampleRate: 0` —
 * captures the bug context without recording every normal session.
 */

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    // Same string the build plugin registers in next.config.ts
    // (`turf-tracker@${version}`). Matched values are how events
    // tie to source maps and release-context features in the
    // dashboard. Inlined into the client bundle at build time
    // via next.config's `env` block.
    release: process.env.SENTRY_RELEASE,
    sendDefaultPii: true,

    tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

    // Distributed-tracing headers attached to outbound fetches.
    // We're same-origin throughout (no separate API host), so any
    // relative URL (`/^\//`) gets propagation. Made explicit so a
    // future cross-origin API split doesn't silently lose traces.
    tracePropagationTargets: [/^\//],

    // Replay only on errors. Regular sessions are not recorded —
    // privacy + bandwidth-friendly. The "what happened before this
    // crash" context is what we actually need.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,

    // Standard noise filters. Each entry kills a specific class of
    // false-positive that would otherwise burn through the free-
    // tier event quota without any actionable signal.
    ignoreErrors: [
      // Browser layout-engine bookkeeping; benign per spec, but
      // every framework that touches ResizeObserver triggers it.
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      // User navigated away mid-fetch — `cancel()` from the queue
      // surfaces as AbortError; not actionable.
      "AbortError",
      "The user aborted a request",
      // Browser extensions that throw inside content scripts.
      "Extension context invalidated",
      // iOS Safari/iOS PWA quirks.
      "ResizeObserver is not defined",
    ],

    // Drop browser-extension origins entirely. Stack frames whose
    // file URL is a chrome-extension:// or moz-extension:// scheme
    // come from injected scripts (LastPass, ad blockers, dev tools)
    // — never our code, never actionable.
    beforeSend(event) {
      const frames = event.exception?.values?.[0]?.stacktrace?.frames ?? [];
      if (
        frames.some(
          (f) =>
            f.filename?.startsWith("chrome-extension://") ||
            f.filename?.startsWith("moz-extension://") ||
            f.filename?.startsWith("safari-extension://"),
        )
      ) {
        return null;
      }
      return event;
    },

    integrations: [
      Sentry.replayIntegration({
        // Mask user-entered text by default. Re-enable selectively
        // via `data-sentry-unmask` attributes once we know what's
        // safe to record.
        maskAllText: true,
        blockAllMedia: false,
      }),
    ],
  });
}

// Hook App Router transitions for client-side navigation tracing.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
