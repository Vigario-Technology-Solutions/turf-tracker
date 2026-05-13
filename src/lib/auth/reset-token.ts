/**
 * Single-use token helpers for the auth layer.
 *
 * Today: password reset only. The shape is intentionally generic
 * (TokenKind union, identifier prefix) so future flows — invite,
 * email-change — slot in without a schema migration. Each kind gets
 * its own prefix so one row can't be accepted against the wrong
 * flow (a reset token is useless against an invite endpoint and
 * vice versa).
 *
 * Storage shape per row (reuses the Better-Auth `Verification`
 * table that already exists for OTP / email-verification flows):
 *
 *   - identifier: `{KIND}:{userId}`  e.g. "reset:cuid-abc123"
 *   - value:      sha256(token) as hex
 *   - expiresAt:  absolute deadline (lifespan varies by kind)
 *
 * The raw token is never persisted — it's handed to the email
 * delivery path once at creation time and validated later by
 * hashing the inbound URL parameter and comparing against `value`.
 *
 * Shape lifted from vis-daily-tracker's invite-token.ts. Adapted
 * for Better-Auth's string userId (cuid) — vis uses integer IDs;
 * turf parses the id verbatim and validates by lookup, not by
 * Number().
 */

import { hash, randomBytes } from "node:crypto";

export type TokenKind = "reset";

/** Token lifespan in seconds, per kind. */
const TOKEN_TTL_SECONDS: Record<TokenKind, number> = {
  reset: 60 * 60, // 1 hour
};

/** 32 bytes → 64 hex chars. High enough entropy that guessing is not a concern. */
const TOKEN_BYTES = 32;

export function generateRawToken(): string {
  return randomBytes(TOKEN_BYTES).toString("hex");
}

export function hashToken(raw: string): string {
  return hash("sha256", raw, "hex");
}

export function buildIdentifier(kind: TokenKind, userId: string): string {
  return `${kind}:${userId}`;
}

/**
 * Parse a stored identifier back into `{ kind, userId }`. Used by
 * the accept endpoint to know which User row a token belongs to
 * without requiring the raw token itself to carry that info.
 */
export function parseIdentifier(identifier: string): { kind: TokenKind; userId: string } | null {
  const colon = identifier.indexOf(":");
  if (colon < 0) return null;
  const kind = identifier.slice(0, colon);
  const userId = identifier.slice(colon + 1);
  if (kind !== "reset") return null;
  if (!userId) return null;
  return { kind, userId };
}

export function tokenExpiry(kind: TokenKind): Date {
  return new Date(Date.now() + TOKEN_TTL_SECONDS[kind] * 1000);
}
