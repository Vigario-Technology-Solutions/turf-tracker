"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { signUp } from "@/lib/auth/client";
import { passwordSchema } from "@/lib/auth/password-policy";

/**
 * Sign-up form built on react-hook-form + zodResolver. The schema is
 * the single source of truth for validation rules — `passwordSchema`
 * comes from the same module the server-side check uses, so what the
 * client validates and what the server enforces stay in lockstep.
 *
 * RHF earns its keep here over the native form-action pattern because:
 *   - validation surfaces inline per-field (no single error banner)
 *   - the password rules are non-trivial and would have been a manual
 *     `if (!valid) return` chain otherwise
 *   - the submit button can disable on `formState.isValid` without
 *     stitching together multiple useStates
 */

const signUpSchema = z.object({
  name: z.string().trim().min(1, "Display name is required").max(120),
  email: z.string().trim().email("Enter a valid email address"),
  password: passwordSchema,
});

type SignUpInput = z.input<typeof signUpSchema>;
type SignUpOutput = z.output<typeof signUpSchema>;

export function SignUpForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpInput, unknown, SignUpOutput>({
    resolver: zodResolver(signUpSchema),
    mode: "onTouched",
  });

  const onSubmit = handleSubmit(async (data) => {
    setServerError(null);
    const result = await signUp.email({
      email: data.email,
      password: data.password,
      name: data.name,
    });
    if (result.error) {
      setServerError(result.error.message ?? "Sign-up failed");
      return;
    }
    router.replace("/");
    router.refresh();
  });

  return (
    <form className="space-y-3" onSubmit={(e) => void onSubmit(e)} noValidate>
      <Field
        label="Display name"
        autoComplete="name"
        registration={register("name")}
        error={errors.name?.message}
      />
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
        autoComplete="new-password"
        registration={register("password")}
        error={errors.password?.message}
      />
      {serverError && <p className="text-sm text-red-700">{serverError}</p>}
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded bg-neutral-900 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {isSubmitting ? "Creating…" : "Create account"}
      </button>
    </form>
  );
}

function Field({
  label,
  type = "text",
  autoComplete,
  registration,
  error,
}: {
  label: string;
  type?: string;
  autoComplete?: string;
  registration: ReturnType<ReturnType<typeof useForm<SignUpInput>>["register"]>;
  error?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <input
        type={type}
        autoComplete={autoComplete}
        {...registration}
        aria-invalid={error ? "true" : undefined}
        className="w-full rounded border border-neutral-300 px-2 py-2 text-sm focus:border-neutral-900 focus:outline-none aria-invalid:border-red-400"
      />
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </label>
  );
}
