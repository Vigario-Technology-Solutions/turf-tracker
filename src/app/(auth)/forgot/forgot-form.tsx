"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Field } from "@/components/form/field";

const forgotSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
});

type ForgotInput = z.input<typeof forgotSchema>;
type ForgotOutput = z.output<typeof forgotSchema>;

/**
 * The submitted-state view intentionally echoes the same "if that
 * account exists" wording the API returns. The UI mirrors the API's
 * privacy stance — never reveal whether the email matched a real
 * row, regardless of the path the user took to get here.
 */
export function ForgotForm() {
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotInput, unknown, ForgotOutput>({
    resolver: zodResolver(forgotSchema),
    mode: "onTouched",
  });

  const onSubmit = handleSubmit(async (data) => {
    setServerError(null);
    try {
      const res = await fetch("/api/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.email }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setServerError(body?.error ?? "Request failed");
        return;
      }
      setSubmitted(true);
    } catch {
      setServerError("Network error — please try again");
    }
  });

  if (submitted) {
    return (
      <div className="rounded border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
        If that account exists, a reset email has been sent. Check your inbox — the link expires in
        1 hour.
      </div>
    );
  }

  return (
    <form className="space-y-3" onSubmit={(e) => void onSubmit(e)} noValidate>
      <Field
        label="Email"
        type="email"
        autoComplete="email"
        registration={register("email")}
        error={errors.email?.message}
      />
      {serverError && <p className="text-sm text-red-700">{serverError}</p>}
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded bg-neutral-900 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {isSubmitting ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}
