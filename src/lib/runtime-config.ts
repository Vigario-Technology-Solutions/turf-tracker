/**
 * Runtime config validation.
 *
 * Called once at server startup via `src/instrumentation.ts`. Throws
 * if any required env var is missing or malformed — failing the
 * server before it serves a single request.
 *
 * Single source for the required-var names: `./required-env.json`.
 * docs/deployment.md's "Runtime required" list is the same JSON, so
 * the contract advertised to prod stays aligned with what this module
 * enforces. Adding a required var = add to the JSON, add a format
 * validator below.
 *
 * Branding consts: operator-controlled identity that disjoins
 * codebase identity from per-deployment branding. See
 * docs/platform/branding.md.
 *
 *   APP_NAME        — full product name (browser title via the root
 *                     layout's title.template, nav heading, emails,
 *                     manifest `name`)
 *   APP_SHORT_NAME  — constrained-space variant (manifest `short_name`,
 *                     iOS home-screen pin title)
 *   APP_OWNER       — entity providing the service (auth-page
 *                     subtitle). Null when unset — no subtitle.
 *   BRANDING_DIR    — operator-managed asset directory. When set,
 *                     `/branding/<file>` serves from there first,
 *                     falls back to bundled `public/branding/`.
 *                     Null when unset = always-bundled.
 *
 * `||` (not `??`) on APP_OWNER + BRANDING_DIR so an explicitly empty
 * string in sysconfig reads as unset — the standard env-file
 * convention. APP_SHORT_NAME reads the `APP_NAME` const (not
 * process.env a second time) so the fallback is deterministic
 * regardless of variable evaluation order.
 *
 * The explicit `string` annotation prevents TS from narrowing to a
 * literal type and breaking interpolation typing downstream.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import REQUIRED_ENV from "./required-env.json";

export const APP_NAME: string = process.env.APP_NAME ?? "Turf Tracker";
export const APP_SHORT_NAME: string = process.env.APP_SHORT_NAME ?? APP_NAME;
export const APP_OWNER: string | null = process.env.APP_OWNER || null;
export const BRANDING_DIR: string | null = process.env.BRANDING_DIR || null;

/**
 * URL the auth chrome renders for the brand image. The "logo" is a
 * separate brand asset from the PWA icon set — operators with a
 * distinct logo drop it at `${BRANDING_DIR}/logo.svg` (or .png);
 * deploys without one fall back to the bundled icon so the chrome
 * still renders something sensible. Frozen at startup; operators who
 * add a logo file post-boot need a service restart.
 *
 * The codebase ships NO bundled `logo.*` — the chrome logo is
 * operator-supplied (or implicit via the icon fallback).
 */
export const CHROME_LOGO_SRC: string = ((): string => {
  if (BRANDING_DIR) {
    for (const ext of ["svg", "png"] as const) {
      if (existsSync(path.join(BRANDING_DIR, `logo.${ext}`))) {
        return `/branding/logo.${ext}`;
      }
    }
  }
  return "/branding/icon.svg";
})();

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
