import Link from "next/link";
import { SignInForm } from "./sign-in-form";

export const metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Sign in</h1>
        <p className="mt-1 text-sm text-neutral-600">Welcome back.</p>
      </div>
      <SignInForm />
      <p className="text-sm text-neutral-600">
        No account?{" "}
        <Link href="/sign-up" className="font-medium underline">
          Create one
        </Link>
      </p>
    </div>
  );
}
