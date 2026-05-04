/**
 * Password set-time validation policy. Lives in its own module (no
 * native imports) so client components can call it without dragging
 * @node-rs/argon2 into the browser bundle.
 *
 * Policy: 12+ chars with upper, lower, digit, and a special character.
 *
 * Single source of truth for the rules: `passwordSchema`. The
 * imperative `validatePassword` wrapper exists for callers that want
 * the legacy `{valid, error}` shape (server-side checks); RHF +
 * `zodResolver(schema)` consume the schema directly.
 */

import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .refine((v) => /[A-Z]/.test(v), {
    message: "Password must contain at least one uppercase letter",
  })
  .refine((v) => /[a-z]/.test(v), {
    message: "Password must contain at least one lowercase letter",
  })
  .refine((v) => /[0-9]/.test(v), {
    message: "Password must contain at least one number",
  })
  .refine((v) => /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(v), {
    message: "Password must contain at least one special character (!@#$%^&* etc.)",
  });

export interface PasswordValidationResult {
  valid: boolean;
  error?: string;
}

export function validatePassword(password: string): PasswordValidationResult {
  const result = passwordSchema.safeParse(password);
  if (result.success) return { valid: true };
  return { valid: false, error: result.error.issues[0]?.message ?? "Invalid password" };
}
