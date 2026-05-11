/**
 * Compile server.ts → server.mjs at the repo root.
 *
 * server.mjs is what `npm start` (= `node server.mjs`) invokes.
 * Bundles app code (server.ts + everything it imports from `@/lib`)
 * into a single ESM file; leaves third-party deps external for
 * runtime resolution against the artifact's full node_modules/
 * (build-on-prod model — see docs/SPEC.md §8.4 / vis-daily-tracker
 * docs/deployment.md).
 *
 * No NFT trace step — under build-on-prod the artifact ships every
 * dep `npm ci --omit=dev` installs, so there's no minimized tree
 * that needs runtime-deps manifests folded back into Next's
 * standalone tracer. The earlier `output: "standalone"` contract
 * needed bin/server.trace.json; build-on-prod doesn't.
 *
 * Build-time --check smoke validates module-level imports (cheap
 * pre-check). Real-boot smoke runs in scripts/postbuild.ts against
 * the just-built server.mjs and catches everything --check doesn't,
 * including the shutdown-handler-bug class.
 */
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const outfile = "server.mjs";

// Inline SENTRY_RELEASE at build time so events from the server
// runtime carry the right release tag even when prod's env file
// doesn't define it. Same approach in scripts/build-cli.ts.
const { version } = JSON.parse(await readFile("./package.json", "utf-8")) as { version: string };
const sentryRelease = `turf-tracker@${version}`;

await build({
  entryPoints: ["server.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  outfile,
  // Native + WASM packages stay external. `next` and `@sentry/*` are
  // external too — the artifact's node_modules ships them and there's
  // no reason to inline them and double the bundle size.
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

// --check smoke: catches ERR_MODULE_NOT_FOUND at build time. The
// real-boot smoke in postbuild.ts catches the rest (boot path,
// listen, shutdown).
const probe = spawnSync(process.execPath, [outfile, "--check"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: "", SENTRY_DSN: "" },
});
if (probe.status !== 0) {
  console.error(`[build-server] --check failed (exit ${probe.status})`);
  process.exit(1);
}
