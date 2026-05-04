// No `import "server-only"` — the CLI imports this directly to hash
// passwords for `users:create`, and `server-only` throws at module
// load time outside a Next.js runtime. The real "server-only" guard
// is `@node-rs/argon2`: it ships platform-specific .node binaries
// that the browser bundler can't load, so any client-side import
// fails at build time anyway.
import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";

/**
 * Argon2id hashing with a server-side pepper fed through the native
 * `secret` option (NOT string concatenation). The pepper is an input to
 * the argon2 computation but never appears in the stored hash, so a DB
 * dump without the application env can't be offline-cracked.
 *
 * Pattern inherited from vis-daily-tracker. AUTH_PASSWORD_PEPPER is
 * validated at startup by src/lib/runtime-config.ts.
 *
 * Set-time policy lives in ./password-policy.ts (no native deps) so
 * client components can validate before submit without dragging
 * @node-rs/argon2 into the browser bundle.
 */

const PEPPER = Buffer.from(process.env.AUTH_PASSWORD_PEPPER ?? "", "utf8");

function pepperOrThrow(): Buffer {
  if (PEPPER.length === 0) {
    throw new Error(
      "AUTH_PASSWORD_PEPPER env var is required for password hashing. See .env.example.",
    );
  }
  return PEPPER;
}

export async function hashPassword(password: string): Promise<string> {
  return argonHash(password, { secret: pepperOrThrow() });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return argonVerify(hash, password, { secret: pepperOrThrow() });
}
