"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Field } from "@/components/form/field";

const resetSchema = z
  .object({
    password: z.string().min(12, "Password must be at least 12 characters"),
    confirm: z.string(),
  })
  .refine((data) => data.password === data.confirm, {
    message: "Passwords don't match",
    path: ["confirm"],
  });

type ResetInput = z.input<typeof resetSchema>;
type ResetOutput = z.output<typeof resetSchema>;

interface Props {
  token: string;
}

export function ResetForm({ token }: Props) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetInput, unknown, ResetOutput>({
    resolver: zodResolver(resetSchema),
    mode: "onTouched",
  });

  const onSubmit = handleSubmit(async (data) => {
    setServerError(null);
    try {
      const res = await fetch("/api/password-reset/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: data.password }),
      });
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        autoSignIn?: boolean;
        error?: string;
      } | null;
      if (!res.ok || !body?.ok) {
        setServerError(body?.error ?? "Failed to set password");
        return;
      }
      // Auto-sign-in branch: server set our session cookies, land
      // straight on the home view. Fallback branch: bounce to
      // /sign-in so the user logs in once with the new password.
      if (body.autoSignIn) {
        router.replace("/");
        router.refresh();
      } else {
        router.replace("/sign-in");
      }
    } catch {
      setServerError("Network error — please try again");
    }
  });

  return (
    <form className="space-y-3" onSubmit={(e) => void onSubmit(e)} noValidate>
      <Field
        label="New password"
        type="password"
        autoComplete="new-password"
        registration={register("password")}
        error={errors.password?.message}
      />
      <Field
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        registration={register("confirm")}
        error={errors.confirm?.message}
      />
      {serverError && <p className="text-sm text-red-700">{serverError}</p>}
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded bg-neutral-900 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {isSubmitting ? "Saving…" : "Save new password"}
      </button>
    </form>
  );
}
