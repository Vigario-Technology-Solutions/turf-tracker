import Link from "next/link";
import { ForgotForm } from "./forgot-form";

export const metadata = { title: "Forgot password" };

export default function ForgotPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Forgot password</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Enter your email and we&apos;ll send you a link to set a new password.
        </p>
      </div>
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
