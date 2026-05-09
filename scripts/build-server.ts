/**
 * Build the standalone Next.js server entrypoint.
 *
 * Outputs:
 *   bin/server.mjs         — single-file ESM bundle of server.ts.
 *                            Copied to .next/standalone/server.mjs by
 *                            scripts/postbuild.ts (the tarball-root
 *                            path that MANIFEST.startCommand targets).
 *   bin/server.trace.json  — JSON array of node_modules paths the
 *                            bundle needs at runtime, derived by
 *                            walking server.mjs's import graph with
 *                            @vercel/nft. Read by next.config.ts and
 *                            fed into outputFileTracingIncludes so the
 *                            standalone tar carries the runtime deps.
 *                            Same shape as build-seed.ts / build-cli.ts.
 *
 * Why bundle from TS instead of writing server.mjs by hand: the entry
 * needs to share `@/lib/...` imports with the Next app (auth, prisma,
 * etc.) without a parallel implementation. Same pattern as
 * bin/seed.js / bin/turf.js.
 *
 * Native deps + the Prisma stack stay external. `next` and `@sentry/*`
 * are external too — the standalone tar already ships them, no reason
 * to inline them and double the bundle size.
 */
import { build } from "esbuild";
import { nodeFileTrace } from "@vercel/nft";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const outdir = "bin";
const outfile = `${outdir}/server.mjs`;
const tracefile = `${outdir}/server.trace.json`;

await mkdir(outdir, { recursive: true });

// Inline SENTRY_RELEASE at build time so events from the server
// runtime carry the right release tag even if prod's env file
// doesn't define SENTRY_RELEASE. Mirrors next.config.ts's `env` block.
const { version } = JSON.parse(await readFile("./package.json", "utf-8")) as { version: string };
const sentryRelease = `turf-tracker@${version}`;

await build({
  entryPoints: ["server.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  outfile,
  external: ["next", "next/*", "@sentry/*", "@prisma/*", "prisma", "@node-rs/argon2"],
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

const { fileList, warnings } = await nodeFileTrace([outfile]);
const manifest = [...fileList]
  .map((p) => p.replace(/\\/g, "/"))
  .filter((p) => p.startsWith("node_modules/"))
  .sort();

if (warnings.size > 0) {
  console.warn(`[build-server] nft warnings (${warnings.size}):`);
  for (const w of warnings) console.warn(`  ${w.message}`);
}

await writeFile(tracefile, JSON.stringify(manifest, null, 2) + "\n");
console.log(`  ${tracefile} (${manifest.length} runtime deps)`);

// Source-tree smoke: --check exits 0 right after module-level imports
// finish, before any side-effecting bootstrap (chdir, signal handlers,
// app.prepare, listen). Catches ERR_MODULE_NOT_FOUND against the source
// repo's node_modules. Doesn't catch outputFileTracingIncludes drops —
// scripts/postbuild.ts's standalone-tree smoke covers that.
const probe = spawnSync(process.execPath, [outfile, "--check"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: "", SENTRY_DSN: "" },
});
if (probe.status !== 0) {
  console.error(`[build-server] smoke test failed (exit ${probe.status})`);
  process.exit(1);
}
