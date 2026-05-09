/**
 * Build the prod CLI bundle + emit its companion manifests.
 *
 * Outputs:
 *   bin/turf.js            — single-file ESM bundle of src/cli/index.ts.
 *                            Shebang + +x. Runs on plain `node` from the
 *                            standalone tar — no tsx, no source tree.
 *   bin/cli-manifest.json  — { binary, subcommands } introspected from
 *                            `createProgram()`. release.yml folds this
 *                            into MANIFEST.cli so the deployed tar
 *                            advertises the subcommand surface the
 *                            binary actually registers (no manual list
 *                            to drift).
 *   bin/turf.trace.json    — JSON array of node_modules paths the bundle
 *                            needs at runtime, derived by walking
 *                            turf.js's import graph with @vercel/nft.
 *                            Read by next.config.ts and fed into
 *                            outputFileTracingIncludes so the standalone
 *                            tar carries the runtime deps. Same shape
 *                            as build-seed.ts / build-server.ts.
 *
 * Native deps stay external — Node resolves them at runtime against
 * the standalone tar's node_modules. Same external list as
 * scripts/build-seed.ts so the two bundles share a single contract.
 *
 * The `createRequire` banner exists because the ESM output target
 * needs a way to satisfy any bundled CJS deps that still call
 * `require()` at runtime.
 */
import { build } from "esbuild";
import { nodeFileTrace } from "@vercel/nft";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { createProgram } from "../src/cli/program";

const outdir = "bin";
const outfile = `${outdir}/turf.js`;
const manifestPath = `${outdir}/cli-manifest.json`;
const tracefile = `${outdir}/turf.trace.json`;

await mkdir(outdir, { recursive: true });

await build({
  entryPoints: ["src/cli/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  outfile,
  external: ["@prisma/*", "prisma", "@node-rs/argon2"],
  // Shebang lives in src/cli/index.ts; esbuild preserves it.
  banner: {
    js: [
      `import { createRequire } from "module";`,
      `const require = createRequire(import.meta.url);`,
    ].join("\n"),
  },
  logLevel: "info",
});

await chmod(outfile, 0o755);

// Introspect the program once — single source of truth for the
// subcommand list. release.yml's MANIFEST.cli reads from here so
// what the tar advertises is exactly what the binary registers.
const program = createProgram();
const subcommands = program.commands.map((c) => c.name()).sort();
const manifest = {
  binary: outfile,
  subcommands,
};
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
process.stdout.write(
  `  ${manifestPath} (${subcommands.length} subcommand${subcommands.length === 1 ? "" : "s"})\n`,
);

// Trace turf.js's runtime deps and emit the manifest. Same pattern as
// build-seed.ts / build-server.ts. The CLI's graph is a superset of
// the seed's — it pulls in everything in src/cli/commands/** plus the
// shared @/lib/auth + @/lib/db imports — so its trace is the larger
// of the two.
const { fileList, warnings } = await nodeFileTrace([outfile]);
const traceManifest = [...fileList]
  .map((p) => p.replace(/\\/g, "/"))
  .filter((p) => p.startsWith("node_modules/"))
  .sort();

if (warnings.size > 0) {
  console.warn(`[build-cli] nft warnings (${warnings.size}):`);
  for (const w of warnings) console.warn(`  ${w.message}`);
}

await writeFile(tracefile, JSON.stringify(traceManifest, null, 2) + "\n");
process.stdout.write(`  ${tracefile} (${traceManifest.length} runtime deps)\n`);

// Smoke test: invoke the bundle with `--check`. The entry point exits
// 0 after module-level imports resolve, before Commander touches argv
// or the action handlers touch the DB. Any ERR_MODULE_NOT_FOUND on
// cold start surfaces here as a non-zero exit and fails the build —
// catches the class of failure where a CLI command's transitive
// import crashes on the prod runtime.
const probe = spawnSync(process.execPath, [outfile, "--check"], {
  stdio: "inherit",
  // Strip env that would trigger live behavior (DB connect on import).
  // `--check` exits before any of these get touched; clearing them is
  // belt-and-suspenders against a regression that moves IO earlier.
  env: { ...process.env, DATABASE_URL: "" },
});
if (probe.status !== 0) {
  process.stderr.write(`[build-cli] smoke test failed (exit ${probe.status})\n`);
  process.exit(1);
}
