"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Field } from "@/components/form/field";
import { passwordChangeFormSchema, type PasswordChangeFormValues } from "@/lib/forms/profile";
import { changePassword } from "./_actions";

/**
 * Password-change card. The schema's `.refine` puts the mismatch error
 * on `confirmPassword`, so RHF surfaces it under that field rather than
 * as a top-level form error.
 *
 * Server-side, `changePassword` revokes other sessions on success — no
 * extra UI state needed; the user stays signed in here on the device
 * they just changed it from.
 */
export function PasswordForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PasswordChangeFormValues>({
    resolver: zodResolver(passwordChangeFormSchema),
    mode: "onTouched",
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const onSubmit = handleSubmit(async (data) => {
    setServerError(null);
    setSaved(false);
    const result = await changePassword(data);
    if (!result.ok) {
      setServerError(result.error);
      return;
    }
    setSaved(true);
    reset({ currentPassword: "", newPassword: "", confirmPassword: "" });
  });

  return (
    <form className="space-y-3" onSubmit={(e) => void onSubmit(e)} noValidate>
      <Field
        label="Current password"
        type="password"
        autoComplete="current-password"
        registration={register("currentPassword")}
        error={errors.currentPassword?.message}
      />
      <Field
        label="New password"
        type="password"
        autoComplete="new-password"
        registration={register("newPassword")}
        error={errors.newPassword?.message}
      />
      <Field
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        registration={register("confirmPassword")}
        error={errors.confirmPassword?.message}
      />

      {serverError && <p className="text-sm text-red-700">{serverError}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {isSubmitting ? "Updating…" : "Change password"}
        </button>
        {saved && <span className="text-xs text-green-700">Password updated.</span>}
      </div>
    </form>
  );
}
