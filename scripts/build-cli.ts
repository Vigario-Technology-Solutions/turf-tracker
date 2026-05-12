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
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { createProgram } from "../src/cli/program";

const outdir = "bin";
const outfile = `${outdir}/turf.js`;
const manifestPath = `${outdir}/cli-manifest.json`;

// Inline SENTRY_RELEASE at build time so CLI-emitted Sentry events
// carry the right release tag without depending on prod's env file
// to define it. The wrapper (/usr/bin/turf) sources default.env +
// optional /etc/sysconfig but neither one needs to know about the
// release; same approach as scripts/build-server.ts.
const { version } = JSON.parse(await readFile("./package.json", "utf-8")) as { version: string };
const sentryRelease = `turf-tracker@${version}`;

await mkdir(outdir, { recursive: true });

await build({
  entryPoints: ["src/cli/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  outfile,
  // Externals:
  //   - @prisma/* + prisma: native engine binaries + adapter, must
  //     resolve against the RPM's node_modules at runtime.
  //   - @node-rs/argon2: native .node binding.
  //   - @sentry/* + zod: large pure-JS deps already shipped in
  //     node_modules (both in `dependencies`, so the prune step keeps
  //     them). Externalizing sheds ~2.5 MB from the bundle —
  //     metafile-confirmed via scripts/_profile-cli analysis at
  //     commit time. Node's ESM resolver finds them at
  //     /usr/share/turf-tracker/node_modules at runtime. Both come
  //     from the same `npm ci` that produced the bundle, so version
  //     skew between bundle and node_modules is impossible per
  //     release. Divergence from vis-daily-tracker's build-cli.ts
  //     (which bundles inline) is intentional — vis doesn't prune
  //     devDeps either, so for them the savings ratio is much
  //     smaller; for turf it's ~50% of the post-prune CLI bundle.
  external: ["@prisma/*", "prisma", "@node-rs/argon2", "@sentry/*", "zod"],
  define: {
    "process.env.SENTRY_RELEASE": JSON.stringify(sentryRelease),
  },
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
