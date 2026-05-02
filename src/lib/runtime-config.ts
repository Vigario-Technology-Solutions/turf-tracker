/**
 * Runtime config validation.
 *
 * Called once at server startup via `src/instrumentation.ts`. Throws
 * if any required env var is missing or malformed — failing the
 * server before it serves a single request.
 *
 * Single source for the required-var names: `./required-env.json`.
 * The release workflow's `MANIFEST.requiredEnv` reads from the same
 * file so the contract emitted to prod stays aligned with what this
 * module enforces. Adding a required var = add to the JSON, add a
 * format validator below.
 */

import REQUIRED_ENV from "./required-env.json";

const FORMAT_CHECKS: Record<string, (v: string) => void> = {
  DATABASE_URL: validateDatabaseUrl,
  BETTER_AUTH_SECRET: validateBetterAuthSecret,
  BETTER_AUTH_URL: validateBetterAuthUrl,
  AUTH_PASSWORD_PEPPER: validateAuthPasswordPepper,
};

export function validateRuntimeConfig(): void {
  const errors: string[] = [];
  for (const name of REQUIRED_ENV) {
    const v = process.env[name];
    if (!v) {
      errors.push(`${name} is not set.`);
      continue;
    }
    const check = FORMAT_CHECKS[name];
    if (check) {
      try {
        check(v);
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }
  }
  if (errors.length > 0) {
    throw new Error(
      `Runtime config validation failed:\n  - ${errors.join("\n  - ")}\nSee .env.example.`,
    );
  }
}

function validateDatabaseUrl(v: string): void {
  if (!/^postgres(ql)?:\/\//.test(v)) {
    throw new Error(`DATABASE_URL must be a postgresql:// URL (got "${redact(v)}").`);
  }
}

function validateBetterAuthSecret(v: string): void {
  if (v.length < 32) {
    throw new Error(
      `BETTER_AUTH_SECRET is too short (${v.length} chars). Generate with: openssl rand -base64 32`,
    );
  }
}

function validateBetterAuthUrl(v: string): void {
  try {
    new URL(v);
  } catch {
    throw new Error(`BETTER_AUTH_URL is not a valid URL (got "${v}").`);
  }
}

function validateAuthPasswordPepper(v: string): void {
  if (v.length < 32) {
    throw new Error(
      `AUTH_PASSWORD_PEPPER is too short (${v.length} chars). Generate with: openssl rand -base64 32`,
    );
  }
}

function redact(value: string): string {
  return value.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:***@");
}
