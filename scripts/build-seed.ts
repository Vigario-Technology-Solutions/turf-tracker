/**
 * Build the prod-runnable seed bundle.
 *
 * Outputs:
 *   bin/seed.js — single-file ESM bundle of prisma/seed/index.ts
 *
 * Why: `prisma db seed` (per prisma.config.ts) shells out to
 * `npx tsx prisma/seed/index.ts`, which depends on tsx being on
 * PATH. Under the build-on-prod contract, prod runs the seed via
 * `node bin/seed.js` after `npm prune --omit=dev` strips tsx. The
 * bundled form is the prune-safe deploy path; the shelled form is
 * dev-only convenience.
 *
 * Native deps stay external — same list as build-cli.ts /
 * build-server.ts, resolved at runtime against the artifact's
 * node_modules/.
 */
import { build } from "esbuild";
import { chmod, mkdir } from "node:fs/promises";

const outdir = "bin";
const outfile = `${outdir}/seed.js`;

await mkdir(outdir, { recursive: true });

await build({
  entryPoints: ["prisma/seed/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  outfile,
  external: ["@prisma/*", "prisma", "@node-rs/argon2"],
  banner: {
    js: [
      `import { createRequire } from "module";`,
      `const require = createRequire(import.meta.url);`,
    ].join("\n"),
  },
  logLevel: "info",
});

await chmod(outfile, 0o755);
