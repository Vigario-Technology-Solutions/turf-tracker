"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Field } from "@/components/form/field";
import { signIn } from "@/lib/auth/client";

/**
 * Sign-in is intentionally lighter on validation than sign-up — we
 * only check that the email looks like an email and that the password
 * field isn't empty. The real strength check ran at signup time, and
 * re-running it on every login would lock users out when the policy
 * tightens.
 */

const signInSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type SignInInput = z.input<typeof signInSchema>;
type SignInOutput = z.output<typeof signInSchema>;

export function SignInForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInInput, unknown, SignInOutput>({
    resolver: zodResolver(signInSchema),
    mode: "onTouched",
  });

  const onSubmit = handleSubmit(async (data) => {
    setServerError(null);
    const result = await signIn.email({ email: data.email, password: data.password });
    if (result.error) {
      setServerError(result.error.message ?? "Sign-in failed");
      return;
    }
    router.replace("/");
    router.refresh();
  });

  return (
    <form className="space-y-3" onSubmit={(e) => void onSubmit(e)} noValidate>
      <Field
        label="Email"
        type="email"
        autoComplete="email"
        registration={register("email")}
        error={errors.email?.message}
      />
      <Field
        label="Password"
        type="password"
        autoComplete="current-password"
        registration={register("password")}
        error={errors.password?.message}
      />
      {serverError && <p className="text-sm text-red-700">{serverError}</p>}
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded bg-neutral-900 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {isSubmitting ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
