import { NextResponse } from "next/server";
import { z } from "zod";
import * as Sentry from "@sentry/nextjs";
import prisma from "@/lib/db";
import { generateRawToken, hashToken, buildIdentifier, tokenExpiry } from "@/lib/auth/reset-token";
import { callerIp, checkRateLimit, rateLimitHeaders } from "@/lib/auth/rate-limit";
import { sendPasswordResetEmail } from "@/lib/email/mailer";

const requestSchema = z.object({
  email: z.string().email("Enter a valid email address"),
});

/**
 * POST /api/password-reset/request
 *
 * Public endpoint. Accepts an email. If a matching user exists,
 * a reset token is minted and a reset email is sent. Response is
 * always 200 with a generic message regardless of whether the
 * account exists — prevents user enumeration.
 *
 * Timing is also constant: the real work runs fire-and-forget AFTER
 * we return, so the response shape AND latency are identical for
 * "real account" vs "no such account" paths.
 *
 * Rate limiting: relies on the global Better-Auth limiter declared
 * in src/lib/auth/server.ts (`/forget-password` rule at 5/hour). The
 * specific path here is unrelated to Better-Auth's internal name,
 * but the abuse vector is the same — limiting at the IP layer
 * upstream would be cleaner, and is the operator's job.
 */
export async function POST(request: Request): Promise<NextResponse> {
  // Rate-limit before parsing the body. 5 requests/hour/IP — generous
  // enough that a legitimate user retrying after a typo or two won't
  // trip it, tight enough that an attacker can't spam reset emails
  // at arbitrary addresses from one source.
  const rl = checkRateLimit(`reset-request:${callerIp(request.headers)}`, 5, 3600);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many reset requests. Please try again later." },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  const raw: unknown = await request.json().catch(() => null);
  const result = requestSchema.safeParse(raw);
  if (!result.success) {
    return NextResponse.json(
      { ok: false, error: result.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  // Fire-and-forget so response shape + latency don't leak account
  // existence. We don't await — the void + catch sinks unhandled
  // rejection noise AND captures to Sentry so operators see SMTP
  // timeouts, render failures, or DB hiccups in the dispatch path
  // (without it, failures only land in the journal as console.error
  // and never surface in the dashboard).
  void dispatchReset(result.data.email, new URL(request.url).origin).catch((err) => {
    console.error("[PasswordReset] request dispatch failed:", err);
    Sentry.captureException(err, {
      tags: { area: "auth", flow: "password-reset-request" },
    });
  });

  return NextResponse.json({
    ok: true,
    message: "If that account exists, a reset email has been sent.",
  });
}

async function dispatchReset(email: string, origin: string): Promise<void> {
  // Email lookup is case-insensitive — "Tyler@Example.com" hits the
  // same row as "tyler@example.com". Better-Auth normalizes on
  // create/update so most stored rows are lower-case, but
  // case-insensitive matching defends against any that aren't.
  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, email: true, name: true, displayName: true },
  });

  if (!user) return;

  // Invalidate any outstanding reset tokens for this user before
  // minting a new one. Multiple live tokens for one user would mean
  // multiple concurrent reset windows — harmless but messy, and a
  // user who clicks the older link after requesting a second reset
  // would be surprised by the still-valid older URL.
  const rowIdentifier = buildIdentifier("reset", user.id);
  await prisma.verification.deleteMany({ where: { identifier: rowIdentifier } });

  const rawToken = generateRawToken();
  await prisma.verification.create({
    data: {
      identifier: rowIdentifier,
      value: hashToken(rawToken),
      expiresAt: tokenExpiry("reset"),
    },
  });

  // Prefer BETTER_AUTH_URL (canonical public origin) over the request
  // origin so reset emails sent in response to an internal-network
  // request still point at the public URL the user clicks from their
  // inbox. Falls back to request origin in dev where BETTER_AUTH_URL
  // may not be set.
  const baseUrl = process.env.BETTER_AUTH_URL ?? origin;
  const resetUrl = `${baseUrl}/reset/${rawToken}`;

  await sendPasswordResetEmail({
    to: user.email,
    greetingName: pickGreetingName(user),
    resetUrl,
  });
}

/**
 * Pick a non-empty greeting name. The User schema defaults
 * `name: ""`, and Better-Auth's signup writes `""` when the input
 * omits a name — so `displayName ?? name ?? email` returns `""`
 * (not the email) because `??` only coalesces null/undefined.
 * Filter empties explicitly so the email body never reads "Hi ,".
 */
function pickGreetingName(user: {
  displayName: string | null;
  name: string;
  email: string;
}): string {
  for (const candidate of [user.displayName, user.name]) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return user.email;
}
