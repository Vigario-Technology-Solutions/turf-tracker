import type { NextConfig } from "next";
import { readFileSync } from "fs";

const { version } = JSON.parse(readFileSync("./package.json", "utf-8")) as { version: string };

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
  env: { APP_VERSION: version },

  // Native packages can't be webpacked — declare external so the standalone
  // tracer picks them up at runtime instead. Prisma CLI is intentionally
  // NOT here — it's not bundled in the artifact at all under the v2 deploy
  // contract; prod runs migrations via its own globally installed prisma.
  // See docs/SPEC.md §8.4 / vis-daily-tracker docs/deployment.md.
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "@node-rs/argon2"],

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

export default nextConfig;
