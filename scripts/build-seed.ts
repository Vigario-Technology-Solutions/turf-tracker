/**
 * Build the prod-runnable seed bundle + emit its runtime-deps manifest.
 *
 * Outputs:
 *   bin/seed.js          — single-file ESM bundle of prisma/seed/index.ts
 *   bin/seed.trace.json  — JSON array of node_modules paths the bundle
 *                          needs at runtime, derived by walking seed.js's
 *                          import graph with @vercel/nft (the same library
 *                          Next uses for its standalone tracer). Read by
 *                          next.config.ts and fed into
 *                          outputFileTracingIncludes so the standalone
 *                          tar carries seed.js's runtime deps.
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
 * Why the trace step: bin/seed.js is built outside the Next tracer's
 * view — its externals aren't in Next's server import graph, so they
 * don't get copied into the standalone tar by default. Walking
 * seed.js's own graph here puts the bundle in charge of declaring its
 * runtime contract instead of hiding behind Next.
 *
 * Native deps stay external — same list as build-cli.ts, resolved at
 * runtime against the standalone bundle's node_modules.
 */
import { build } from "esbuild";
import { nodeFileTrace } from "@vercel/nft";
import { chmod, mkdir, writeFile } from "node:fs/promises";

const outdir = "bin";
const outfile = `${outdir}/seed.js`;
const tracefile = `${outdir}/seed.trace.json`;

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

// Trace seed.js's runtime deps and emit the manifest. NFT walks the
// bundle's import graph (resolving externals against node_modules)
// and returns every file the runtime will touch. We keep only the
// node_modules subtree — Next's outputFileTracingIncludes copies
// those into .next/standalone/node_modules/ at build time. Sources
// outside node_modules (the bundle itself, the binary's own dir)
// are already in the tar via other means.
const { fileList, warnings } = await nodeFileTrace([outfile]);
// Normalize separators so a local Windows build produces the same
// manifest a Linux CI build would. The standalone tar is consumed on
// Linux either way; outputFileTracingIncludes globs match against
// posix-style paths.
const manifest = [...fileList]
  .map((p) => p.replace(/\\/g, "/"))
  .filter((p) => p.startsWith("node_modules/"))
  .sort();

if (warnings.size > 0) {
  // NFT warns on dynamic requires it can't resolve statically. These
  // are usually safe (optional deps, conditional fallbacks) but worth
  // surfacing so a real missing-import doesn't get silently skipped.
  console.warn(`[build-seed] nft warnings (${warnings.size}):`);
  for (const w of warnings) console.warn(`  ${w.message}`);
}

await writeFile(tracefile, JSON.stringify(manifest, null, 2) + "\n");
console.log(`  ${tracefile} (${manifest.length} runtime deps)`);
