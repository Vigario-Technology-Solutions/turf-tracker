import Link from "next/link";
import { SignUpForm } from "./sign-up-form";

export const metadata = { title: "Create account — Turf Tracker" };

export default function SignUpPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Create account</h1>
        <p className="mt-1 text-sm text-neutral-600">
          12+ characters with upper, lower, digit, and symbol.
        </p>
      </div>
      <SignUpForm />
      <p className="text-sm text-neutral-600">
        Already have one?{" "}
        <Link href="/sign-in" className="font-medium underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
