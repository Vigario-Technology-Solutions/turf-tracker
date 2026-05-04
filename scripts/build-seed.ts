/**
 * Build the prod-runnable seed bundle.
 *
 * Outputs:
 *   bin/seed.js — single-file ESM bundle of prisma/seed/index.ts
 *
 * Why: `prisma db seed` (per prisma.config.ts) shells out to
 * `npx tsx prisma/seed/index.ts`, which depends on tsx being on PATH.
 * The v2 deploy contract ships only `node` + globally-installed prisma
 * — no tsx — so calling `prisma db seed` on prod fails with "tsx not
 * found". Pre-compiling the seed lets prod invoke it via plain node
 * from MANIFEST.preStartCommands (paired with `prisma migrate deploy`),
 * so reference-table upserts always land in lockstep with the schema
 * change that introduced them.
 *
 * Native deps stay external — resolved at runtime against the
 * standalone bundle's node_modules.
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
