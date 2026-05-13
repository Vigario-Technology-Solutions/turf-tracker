import Link from "next/link";
import { ForgotForm } from "./forgot-form";

export const metadata = { title: "Forgot password" };

interface Props {
  // Next 16 server-page searchParams arrive as a Promise. `?expired=1`
  // bounces here from /reset/[token] when the token is missing,
  // malformed, or past TTL — banner above the form tells the user
  // why they ended up here instead of the reset chrome they clicked
  // toward.
  searchParams: Promise<{ expired?: string }>;
}

export default async function ForgotPage({ searchParams }: Props) {
  const { expired } = await searchParams;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Forgot password</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Enter your email and we&apos;ll send you a link to set a new password.
        </p>
      </div>
      {expired === "1" && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          That reset link is no longer valid. Request a new one below — links expire 1 hour after
          they&apos;re sent.
        </div>
      )}
      <ForgotForm />
      <p className="text-sm text-neutral-600">
        Remembered it?{" "}
        <Link href="/sign-in" className="font-medium underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
