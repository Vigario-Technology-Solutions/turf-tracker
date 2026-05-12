/**
 * Build the prod-runnable seed bundle.
 *
 * Outputs:
 *   bin/seed.js — single-file ESM bundle of prisma/seed/index.ts
 *
 * Why: `prisma db seed` (per prisma.config.ts) shells out to
 * `npx tsx prisma/seed/index.ts`, which depends on tsx being on
 * PATH. The RPM ships node_modules but `turf-tracker-seed.service`
 * runs `/usr/bin/node-24 bin/seed.js` directly — no tsx in the
 * command line and no PATH lookup. The bundled form is the
 * production-runnable path; the shelled form is dev-only convenience.
 *
 * Native deps stay external — same list as build-cli.ts /
 * build-server.ts, resolved at runtime against the artifact's
 * node_modules/.
 */
import { build } from "esbuild";
import { chmod, mkdir, readFile } from "node:fs/promises";

const outdir = "bin";
const outfile = `${outdir}/seed.js`;

// Inline SENTRY_RELEASE at build time so seed-emitted Sentry events
// (rare — only on schema/lookup-row breakage) carry the right release
// tag. Same approach as scripts/build-server.ts + scripts/build-cli.ts.
const { version } = JSON.parse(await readFile("./package.json", "utf-8")) as { version: string };
const sentryRelease = `turf-tracker@${version}`;

await mkdir(outdir, { recursive: true });

await build({
  entryPoints: ["prisma/seed/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  outfile,
  // Same external list as scripts/build-cli.ts — @sentry/* and zod
  // also resolve at runtime against /usr/share/turf-tracker/node_modules.
  // The seed bundle imports @sentry/node directly (init + capture/flush
  // wrapper); externalizing keeps it from being inlined and duplicating
  // ~1.5 MB of Sentry+OTel code that's already in node_modules.
  external: ["@prisma/*", "prisma", "@node-rs/argon2", "@sentry/*", "zod"],
  define: {
    "process.env.SENTRY_RELEASE": JSON.stringify(sentryRelease),
  },
  banner: {
    js: [
      `import { createRequire } from "module";`,
      `const require = createRequire(import.meta.url);`,
    ].join("\n"),
  },
  logLevel: "info",
});

await chmod(outfile, 0o755);
