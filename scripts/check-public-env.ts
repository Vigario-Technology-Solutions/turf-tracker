// Fails `next build` if any NEXT_PUBLIC_* env var referenced in
// src/ is missing from the build-time environment. Next inlines
// NEXT_PUBLIC_* values into client chunks at build; an absent var
// becomes literal `undefined` in the bundle, which — combined with
// a `?? ""` fallback at the call site — fails silently at runtime
// with no CI signal. This check surfaces the mismatch before the
// artifact ships.
//
// Run via `tsx --env-file-if-exists=.env` so a local `.env` is
// loaded when present (dev) but missing-file is non-fatal (CI sets
// vars via workflow env directly).

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = "src";
const REF = /process\.env\.(NEXT_PUBLIC_[A-Z0-9_]+)/g;

/**
 * Vars that are intentionally optional at build time. Their callers
 * are written to handle the absent-and-undefined case explicitly
 * (no silent `?? ""` fallback into a runtime-broken feature). When
 * unset, the corresponding feature is a no-op rather than broken.
 *
 * NEXT_PUBLIC_SENTRY_DSN: instrumentation-client.ts gates the entire
 * `Sentry.init` on its presence — absent DSN → SDK is a no-op →
 * app runs normally without observability. That's by design so
 * developers don't need a Sentry account to build locally.
 */
const OPTIONAL = new Set<string>(["NEXT_PUBLIC_SENTRY_DSN"]);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(name)) out.push(path);
  }
  return out;
}

const referenced = new Set<string>();
for (const file of walk(SRC)) {
  const src = readFileSync(file, "utf8");
  for (const [, name] of src.matchAll(REF)) referenced.add(name);
}

const missing = [...referenced].filter((name) => !OPTIONAL.has(name) && !process.env[name]);
const missingOptional = [...referenced].filter((name) => OPTIONAL.has(name) && !process.env[name]);

if (missing.length > 0) {
  console.error(
    `✗ Missing build-time NEXT_PUBLIC_* var(s):\n  ${missing.join("\n  ")}\n\n` +
      `These are referenced in src/ but not set in the build environment. ` +
      `Next inlines NEXT_PUBLIC_* at build time — absent vars become ` +
      `\`undefined\` in the client bundle, silently breaking features at ` +
      `runtime. Set them before \`next build\`.`,
  );
  process.exit(1);
}

if (missingOptional.length > 0) {
  console.warn(
    `⚠ Optional NEXT_PUBLIC_* var(s) absent — feature(s) will no-op:\n  ${missingOptional.join("\n  ")}`,
  );
}

console.log(
  `✓ ${referenced.size - missingOptional.length}/${referenced.size} NEXT_PUBLIC_* var(s) present at build time`,
);
