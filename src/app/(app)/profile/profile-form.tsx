"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Field } from "@/components/form/field";
import { profileFormSchema, type ProfileFormValues } from "@/lib/forms/profile";
import { updateProfile } from "./_actions";

/**
 * Identity card. Native `<select>` for default property + unit system —
 * the shared Select primitive in `components/form/` is wired to integer
 * lookup rows, and these two selects are string-keyed (cuid + literal
 * union), so generalizing the primitive isn't worth the churn.
 *
 * Success state shows a transient "Saved" tag and triggers
 * `router.refresh()` so the layout header re-reads the displayName.
 */
export function ProfileForm({
  properties,
  defaultValues,
}: {
  properties: { id: string; name: string }[];
  defaultValues: ProfileFormValues;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    mode: "onTouched",
    defaultValues,
  });

  const onSubmit = handleSubmit(async (data) => {
    setServerError(null);
    setSaved(false);
    const result = await updateProfile(data);
    if (!result.ok) {
      setServerError(result.error);
      return;
    }
    setSaved(true);
    router.refresh();
  });

  return (
    <form className="space-y-3" onSubmit={(e) => void onSubmit(e)} noValidate>
      <Field
        label="Name"
        autoComplete="name"
        registration={register("name")}
        error={errors.name?.message}
      />
      <Field
        label="Display name"
        hint="Shown in the header in place of your name when set."
        registration={register("displayName")}
        error={errors.displayName?.message}
      />

      <label className="block">
        <span className="mb-1 block text-sm font-medium">Default property</span>
        <select
          {...register("defaultPropertyId")}
          aria-invalid={errors.defaultPropertyId ? "true" : undefined}
          className="w-full rounded border border-neutral-300 bg-white px-2 py-2 text-sm focus:border-neutral-900 focus:outline-none aria-invalid:border-red-400"
        >
          <option value="">—</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {errors.defaultPropertyId && (
          <p className="mt-1 text-xs text-red-700">{errors.defaultPropertyId.message}</p>
        )}
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">Units</span>
        <select
          {...register("unitSystem")}
          aria-invalid={errors.unitSystem ? "true" : undefined}
          className="w-full rounded border border-neutral-300 bg-white px-2 py-2 text-sm focus:border-neutral-900 focus:outline-none aria-invalid:border-red-400"
        >
          <option value="imperial">Imperial (ft, lb, gal)</option>
          <option value="metric">Metric (m, kg, L)</option>
        </select>
        {errors.unitSystem && (
          <p className="mt-1 text-xs text-red-700">{errors.unitSystem.message}</p>
        )}
      </label>

      {serverError && <p className="text-sm text-red-700">{serverError}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isSubmitting || !isDirty}
          className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {isSubmitting ? "Saving…" : "Save changes"}
        </button>
        {saved && !isDirty && <span className="text-xs text-green-700">Saved.</span>}
      </div>
    </form>
  );
}
