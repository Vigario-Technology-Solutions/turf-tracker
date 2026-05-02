import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";

/**
 * Argon2id hashing with a server-side pepper fed through the native
 * `secret` option (NOT string concatenation). The pepper is an input to
 * the argon2 computation but never appears in the stored hash, so a DB
 * dump without the application env can't be offline-cracked.
 *
 * Pattern inherited from vis-daily-tracker. AUTH_PASSWORD_PEPPER is
 * validated at startup by src/lib/runtime-config.ts.
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

export interface PasswordValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Set-time policy check. Never called on login — re-validating stored
 * passwords on every login would lock users out when the policy tightens.
 *
 * Policy: 12+ chars with upper, lower, digit, special.
 */
export function validatePassword(password: string): PasswordValidationResult {
  if (password.length < 12) {
    return { valid: false, error: "Password must be at least 12 characters" };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: "Password must contain at least one uppercase letter" };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: "Password must contain at least one lowercase letter" };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: "Password must contain at least one number" };
  }
  if (!/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)) {
    return {
      valid: false,
      error: "Password must contain at least one special character (!@#$%^&* etc.)",
    };
  }
  return { valid: true };
}

export async function hashPassword(password: string): Promise<string> {
  return argonHash(password, { secret: pepperOrThrow() });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return argonVerify(hash, password, { secret: pepperOrThrow() });
}
