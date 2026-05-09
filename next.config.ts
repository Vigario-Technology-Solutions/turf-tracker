import type { NextConfig } from "next";
import { existsSync, readFileSync } from "fs";
import { withSentryConfig } from "@sentry/nextjs";

const { version } = JSON.parse(readFileSync("./package.json", "utf-8")) as { version: string };

/**
 * Read a runtime-deps manifest produced by one of our esbuild bundles
 * (bin/seed.js, bin/turf.js, bin/server.mjs). Each script runs
 * @vercel/nft on its bundle and writes the resulting node_modules
 * path list to a `<bin>.trace.json`. We fold the union into
 * outputFileTracingIncludes below so the standalone tar carries the
 * runtime deps the off-tree bundles need.
 *
 * Missing manifests are non-fatal: a developer running `next build`
 * without first running `build:seed` / `build:cli` / `build:server`
 * (e.g. for local Next-only validation) gets a warning, not a
 * failure. The package.json `prebuild` hook chains all three before
 * `next build` so production builds always have every manifest on
 * disk before this config evaluates.
 */
function readBundleTrace(path: string): string[] {
  if (!existsSync(path)) {
    console.warn(
      `[next.config] ${path} missing — its bundle's runtime deps won't ship in the standalone tar. Run \`npm run build:seed\` / \`build:cli\` / \`build:server\` to generate.`,
    );
    return [];
  }
  return JSON.parse(readFileSync(path, "utf-8")) as string[];
}

// All off-tree esbuild bundles (seed, CLI, server entrypoint) share
// most of their runtime graph (Sentry, Prisma, Next, etc.). Dedupe the
// union before handing to Next.
const bundleTraceIncludes = [
  ...new Set([
    ...readBundleTrace("./bin/seed.trace.json"),
    ...readBundleTrace("./bin/turf.trace.json"),
    ...readBundleTrace("./bin/server.trace.json"),
  ]),
];

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
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "worker-src 'self' blob:",
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
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  env: { APP_VERSION: version, SENTRY_RELEASE: sentryRelease },

  // Native packages can't be webpacked — declare external so the standalone
  // tracer picks them up at runtime instead. Prisma CLI is intentionally
  // NOT here — it's not bundled in the artifact at all under the v2 deploy
  // contract; prod runs migrations via its own globally installed prisma.
  // See docs/SPEC.md §8.4 / vis-daily-tracker docs/deployment.md.
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "@node-rs/argon2"],

  // Fold the off-tree esbuild bundles' runtime deps into the standalone
  // tar. bin/seed.js, bin/turf.js, and bin/server.mjs are built OUTSIDE
  // Next's server import graph, so the standalone tracer never sees their
  // externals (`@sentry/nextjs`, `@prisma/client`, etc.). Each build
  // script runs @vercel/nft against its bundle and writes a
  // runtime-deps manifest. We read those here.
  //
  // Why this matters: hand-written entries that import server-side deps
  // and get postbuild-copied into .next/standalone/ are invisible to
  // Next's tracer. The vis-daily-tracker May 9 incident hit this exact
  // shape — server.mjs imported @sentry/nextjs, the standalone tracer
  // partial-populated the package without copying its package.json,
  // ESM resolution failed at prod startup with ERR_MODULE_NOT_FOUND.
  // Folding NFT's trace here lets the bundle declare its runtime
  // contract instead of hoping Next's tracer covers it.
  outputFileTracingIncludes: {
    "*": bundleTraceIncludes,
  },

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
