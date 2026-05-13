import { NextResponse } from "next/server";
import { APIError } from "better-auth/api";
import { z } from "zod";
import * as Sentry from "@sentry/nextjs";
import prisma from "@/lib/db";
import { auth } from "@/lib/auth/server";
import { hashPassword } from "@/lib/auth/password";
import { hashToken, parseIdentifier } from "@/lib/auth/reset-token";
import { callerIp, checkRateLimit, rateLimitHeaders } from "@/lib/auth/rate-limit";

/**
 * Generic error returned for every "this token isn't usable" case —
 * no row, expired row, parse failure, user lookup failure. Unified
 * so an attacker probing /accept with guessed tokens can't tell the
 * difference between "wrong token entirely" and "right token but
 * past TTL." UX cost: the page wrapper validates the token server-
 * side before rendering the form, so the user who landed on
 * /reset/<expired> never reaches this error message in normal flow.
 */
const INVALID_TOKEN_MSG = "Invalid or expired reset link";

const acceptSchema = z.object({
  token: z.string().min(1, "Missing reset token"),
  password: z.string().min(12, "Password must be at least 12 characters"),
});

/**
 * POST /api/password-reset/accept
 *
 * Public endpoint. Consumes a reset token, overwrites the user's
 * password, wipes every existing session for that user, and (best
 * effort) auto-signs in the caller. The reset token IS the
 * authorization — no session required.
 *
 * The auto-sign-in is graceful: if it fails (rare — Better-Auth
 * config drift, transient DB hiccup), the password reset itself
 * still succeeded and the user is redirected to /sign-in to log
 * in with their brand-new password.
 */
export async function POST(request: Request): Promise<NextResponse> {
  // Rate-limit BEFORE parsing the body. Stops a brute-force flood
  // even though 256-bit tokens are unguessable — keeps the journal
  // clean and bounds the cost of every probe to a single map lookup.
  const rl = checkRateLimit(`reset-accept:${callerIp(request.headers)}`, 5, 3600);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many attempts. Please try again later." },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  const raw: unknown = await request.json().catch(() => null);
  const validated = acceptSchema.safeParse(raw);
  if (!validated.success) {
    return NextResponse.json(
      { ok: false, error: validated.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const { token, password } = validated.data;

  // Look up the token row by its hash + reset prefix. Scanning by
  // value is fine at this table's scale (one row per active reset
  // request, deleted on accept or expiry). Every "not usable" case
  // below returns the same INVALID_TOKEN_MSG so an attacker can't
  // distinguish "wrong token" from "right token, expired".
  const tokenHash = hashToken(token);
  const resetRow = await prisma.verification.findFirst({
    where: { value: tokenHash, identifier: { startsWith: "reset:" } },
    select: { id: true, identifier: true, expiresAt: true },
  });

  if (!resetRow) {
    return NextResponse.json({ ok: false, error: INVALID_TOKEN_MSG }, { status: 400 });
  }

  if (resetRow.expiresAt < new Date()) {
    // Prune stale row best-effort; ignore failure (will eventually
    // be cleaned up on the next sweep or on the next request).
    await prisma.verification.delete({ where: { id: resetRow.id } }).catch(() => {});
    return NextResponse.json({ ok: false, error: INVALID_TOKEN_MSG }, { status: 400 });
  }

  // parseIdentifier already returns null for any non-"reset" kind,
  // so checking .kind a second time would be dead code.
  const parsed = parseIdentifier(resetRow.identifier);
  if (!parsed) {
    return NextResponse.json({ ok: false, error: INVALID_TOKEN_MSG }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: parsed.userId },
    select: { id: true, email: true },
  });

  if (!user) {
    return NextResponse.json({ ok: false, error: INVALID_TOKEN_MSG }, { status: 400 });
  }

  let newPasswordHash: string;
  try {
    newPasswordHash = await hashPassword(password);
  } catch (err) {
    console.error("[PasswordReset] hashPassword failed:", err);
    Sentry.captureException(err, {
      tags: { area: "auth", flow: "password-reset-accept", step: "hash" },
    });
    return NextResponse.json({ ok: false, error: "Failed to set password" }, { status: 500 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.account.updateMany({
        where: { userId: user.id, providerId: "credential" },
        data: { password: newPasswordHash },
      });
      // Wipe every session for this user. Any other device that was
      // signed in loses its cookie on next request, forcing a fresh
      // login with the new password.
      await tx.session.deleteMany({ where: { userId: user.id } });
      await tx.verification.delete({ where: { id: resetRow.id } });
    });
  } catch (err) {
    console.error("[PasswordReset] accept transaction failed:", err);
    Sentry.captureException(err, {
      tags: { area: "auth", flow: "password-reset-accept", step: "tx" },
    });
    return NextResponse.json(
      { ok: false, error: "Failed to reset password. Please try again or request a new link." },
      { status: 500 },
    );
  }

  // Auto-sign-in on the current device. Better-Auth's signInEmail
  // returns a Response carrying Set-Cookie headers; we pipe those
  // onto our JSON response so the browser lands on the caller's
  // page with a live session already in place.
  try {
    const signInResponse = await auth.api.signInEmail({
      body: { email: user.email, password },
      headers: request.headers,
      asResponse: true,
    });

    if (!signInResponse.ok) {
      return NextResponse.json({ ok: true, autoSignIn: false });
    }

    const out = NextResponse.json({ ok: true, autoSignIn: true });
    for (const cookie of signInResponse.headers.getSetCookie()) {
      out.headers.append("set-cookie", cookie);
    }
    return out;
  } catch (err) {
    if (err instanceof APIError) {
      console.error("[PasswordReset] Auto-sign-in failed:", err);
    } else {
      console.error("[PasswordReset] Auto-sign-in error:", err);
    }
    Sentry.captureException(err, {
      tags: { area: "auth", flow: "password-reset-accept", step: "auto-sign-in" },
    });
    // Password IS set and old sessions are gone. Gracefully fall
    // back to "bounce to /sign-in" — the user types the brand-new
    // password once and is on their way.
    return NextResponse.json({ ok: true, autoSignIn: false });
  }
}
