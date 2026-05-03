/**
 * Password set-time validation policy. Lives in its own module (no
 * native imports) so client components can call it without dragging
 * @node-rs/argon2 into the browser bundle.
 *
 * Policy: 12+ chars with upper, lower, digit, and a special character.
 */

export interface PasswordValidationResult {
  valid: boolean;
  error?: string;
}

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
