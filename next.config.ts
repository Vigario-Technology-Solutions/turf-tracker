import type { NextConfig } from "next";
import { readFileSync } from "fs";
import { withSentryConfig } from "@sentry/nextjs";

const { version } = JSON.parse(readFileSync("./package.json", "utf-8")) as { version: string };

// Sentry release identifier. The `service-name@version` shape is
// Sentry's recommended convention (vs bare version strings or
// commit SHAs) — keeps releases unique across projects sharing
// the same Sentry org and is human-readable in the dashboard.
// Set in next.config's `env` block below so the same value is
// available to both server and client (inlined into the client
// bundle at build time, available via process.env on the server)
// and matches what `withSentryConfig` registers for source-map
// upload — same string everywhere or events don't tie to maps.
const sentryRelease = `turf-tracker@${version}`;

// `'unsafe-eval'` is required by React's dev runtime for reconstructing
// server-side error stacks in the browser (per next.js content-security-
// policy docs); it's NOT required in production — neither React nor Next
// use eval in prod by default. Gating the directive on NODE_ENV closes
// the eval-injection attack surface for prod traffic without breaking
// `next dev`. `next build` and `next dev` both set NODE_ENV themselves
// before loading this config, so the right value is captured at config
// load time.
const isDev = process.env.NODE_ENV === "development";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self), interest-cohort=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // 'unsafe-inline' stays because Next emits inline hydration
      // markers + chunk-bootstrap scripts; dropping it requires the
      // proxy.ts nonce middleware, which in turn disables static
      // rendering / ISR / CDN caching / PPR. Not worth the rendering-
      // cost trade for turf's threat model. 'unsafe-eval' is dev-only
      // (see comment on isDev above).
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
      "worker-src 'self' blob:",
      // 'unsafe-inline' on style-src for the FOUC-prevention inline
      // <style> that Next emits + Tailwind's runtime-injected styles.
      // Same trade as script-src — nonce-based hardening here would
      // also force dynamic rendering.
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      // Sentry events tunnel through /monitoring (same-origin) — no
      // external connect-src exception needed for sentry.io.
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      // Force HTTP→HTTPS upgrade for any embedded resource refs the
      // app emits (defends against mixed-content downgrade if a stray
      // http:// URL slips into source or user-generated content).
      "upgrade-insecure-requests",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  env: { APP_VERSION: version, SENTRY_RELEASE: sentryRelease },

  // Native packages can't be webpacked — declaring them external
  // keeps Next from trying to bundle them. They're imported server-side
  // by app code and resolve at runtime against the artifact's full
  // node_modules/ tree (the RPM ships /usr/share/turf-tracker/node_modules
  // intact; the spec's %build runs `npm ci` on a Fedora-43 self-hosted
  // runner so native bindings match prod glibc exactly).
  //
  // The OpenTelemetry instrumentation chain (require-in-the-middle,
  // import-in-the-middle, @opentelemetry/instrumentation) sidesteps a
  // Turbopack bug: the bundler emits `require("<pkg>-<contenthash>")`
  // for externals, and the hashed name doesn't resolve at runtime —
  // crashes the instrumentation-hook load path on server boot.
  // Excluding these from bundling means no synthetic name is generated
  // and the OpenTelemetry/Sentry monkey-patch path stays loadable.
  // Tracked upstream as vercel/next.js issue 87737. Sentry's own
  // Next.js troubleshooting page recommends this externalization.
  serverExternalPackages: [
    "@prisma/client",
    "@prisma/adapter-pg",
    "@node-rs/argon2",
    "require-in-the-middle",
    "import-in-the-middle",
    "@opentelemetry/instrumentation",
  ],

  headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          {
            key: "Content-Security-Policy",
            value: ["default-src 'self'", "script-src 'self'", "connect-src 'self'"].join("; "),
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Upload a wider net of client source files so production stack
  // traces resolve back to readable TS — non-negotiable for prod
  // debug ergonomics.
  widenClientFileUpload: true,

  sourcemaps: {
    // Delete every .map file from .next/ after the Sentry plugin has
    // uploaded it. Maps live on Sentry's servers for symbolication;
    // the duplicate copies in .next/server/ + .next/static/ otherwise
    // add ~30 MB of dead weight to the RPM and leak readable source
    // to anyone who can read the app tree on prod.
    //
    // Why this explicit pattern instead of `deleteSourcemapsAfterUpload:
    // true`: the plugin's built-in delete-after-upload defaults to
    // skipping server builds (webpack-nodejs / webpack-edge) because
    // Vercel's serverless runtime needed them at request time
    // (getsentry/sentry-javascript#13099). We're on systemd + RPM —
    // Next runs as a long-lived node process, never re-reads .map
    // files after build. The Vercel guard doesn't apply, so we
    // override with an explicit glob that covers both server and
    // client maps.
    filesToDeleteAfterUpload: ["./.next/**/*.map"],
  },

  // Same-origin tunnel for events. Two reasons:
  //   1. Bypasses ad-blockers that block requests to *.sentry.io.
  //   2. Our CSP `connect-src 'self'` doesn't allow sentry.io
  //      directly; the tunnel keeps event traffic on the same
  //      origin so the CSP doesn't need to know about Sentry.
  tunnelRoute: "/monitoring",

  // Release tracking. The plugin will:
  //   1. Create the release in Sentry (`name`)
  //   2. Associate this build's commits via auto-detection (git
  //      log walks back from HEAD to the previous release tag).
  //      `ignoreMissing` keeps a build green when Sentry's GitHub
  //      integration isn't configured yet — auto-commit-association
  //      requires the org-level GitHub link.
  //   3. Mark the release as deployed to "production".
  //   4. Finalize (default `true`) — caps off the release window.
  // SDK init in instrumentation-client.ts + sentry.server.config.ts
  // tags events with the SAME `name` via process.env.SENTRY_RELEASE
  // so events tie back to the release the plugin registered, which
  // is what makes source-map resolution work.
  release: {
    name: sentryRelease,
    setCommits: { auto: true, ignoreMissing: true },
    // Only mark a deploy when running in CI. Plain `next build`
    // locally also has NODE_ENV=production (Next sets it itself),
    // and we don't want a developer's local validation build to
    // register a phantom production deploy event in Sentry.
    ...(process.env.CI ? { deploy: { env: "production" } } : {}),
  },

  // Suppress the wall of build-output unless we're in CI. Local
  // builds stay quiet; CI gets the full source-map upload log.
  silent: !process.env.CI,
});
