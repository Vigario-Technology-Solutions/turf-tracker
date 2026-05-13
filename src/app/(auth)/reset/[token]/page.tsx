import Link from "next/link";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { hashToken } from "@/lib/auth/reset-token";
import { ResetForm } from "./reset-form";

export const metadata = { title: "Set new password" };

interface Props {
  params: Promise<{ token: string }>;
}

/**
 * Server-side token validation BEFORE rendering the form. If the
 * token is missing, malformed, or expired we redirect to
 * `/forgot?expired=1` which renders an "your reset link has expired"
 * banner above the request form. Without this check the user types
 * a new password into a form backed by a dead token and only finds
 * out after submitting.
 *
 * This is a TOCTOU pre-check — the token could expire between page
 * load and form submit. The accept endpoint validates again and
 * returns the same generic INVALID_TOKEN_MSG, so the worst case is
 * a same-message error on the form. Acceptable.
 *
 * NOTE: avoid leaking validity through differential timing here —
 * the redirect path and the success path both involve a DB lookup,
 * so an external observer can't time-distinguish "valid token"
 * from "wholly fake token" via response shape (both redirect when
 * invalid, both render when valid).
 */
export default async function ResetPage({ params }: Props) {
  const { token } = await params;

  const row = await prisma.verification.findFirst({
    where: { value: hashToken(token), identifier: { startsWith: "reset:" } },
    select: { id: true, expiresAt: true },
  });

  if (!row || row.expiresAt < new Date()) {
    redirect("/forgot?expired=1");
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Set a new password</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Choose something at least 12 characters long. You&apos;ll be signed out of any other
          devices.
        </p>
      </div>
      <ResetForm token={token} />
      <p className="text-sm text-neutral-600">
        Having trouble?{" "}
        <Link href="/forgot" className="font-medium underline">
          Request a new link
        </Link>
      </p>
    </div>
  );
}
