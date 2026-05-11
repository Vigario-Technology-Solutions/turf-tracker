/**
 * Build the prod CLI bundle + emit its companion manifest.
 *
 * Outputs:
 *   bin/turf.js            — single-file ESM bundle of src/cli/index.ts.
 *                            Shebang + +x. Prune-safe: `npm prune
 *                            --omit=dev` strips tsx, but the bundle
 *                            invokes via plain `node bin/turf.js
 *                            <subcommand>`. See docs/SPEC.md §8.4.
 *   bin/cli-manifest.json  — { binary, subcommands } introspected from
 *                            `createProgram()`. Operational tooling
 *                            consumes the subcommand list without
 *                            shelling out to `bin/turf.js --help`.
 *
 * Native deps stay external — Node resolves them at runtime against
 * the artifact's node_modules. Same external list as
 * scripts/build-seed.ts so the two bundles share a single contract.
 *
 * The `createRequire` banner exists because the ESM output target
 * needs a way to satisfy any bundled CJS deps that still call
 * `require()` at runtime.
 */
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { createProgram } from "../src/cli/program";

const outdir = "bin";
const outfile = `${outdir}/turf.js`;
const manifestPath = `${outdir}/cli-manifest.json`;

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
// subcommand list. Operational tooling reads from here so what the
// bundle advertises is exactly what the binary registers.
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

// Smoke test: invoke the bundle with `--check`. The entry point exits
// 0 after module-level imports resolve, before Commander touches argv
// or the action handlers touch the DB. Any ERR_MODULE_NOT_FOUND on
// cold start surfaces here as a non-zero exit and fails the build.
const probe = spawnSync(process.execPath, [outfile, "--check"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: "" },
});
if (probe.status !== 0) {
  process.stderr.write(`[build-cli] smoke test failed (exit ${probe.status})\n`);
  process.exit(1);
}
