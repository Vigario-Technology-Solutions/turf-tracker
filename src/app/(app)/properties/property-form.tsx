"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Field } from "@/components/form/field";
import { TextArea } from "@/components/form/text-area";
import { propertyFormSchema, type PropertyFormValues } from "@/lib/forms/property";
import type { ActionResult } from "./_actions";

/**
 * Shared create/edit form. Caller injects the action — both
 * createProperty and updateProperty(id, …) match the same shape via
 * the same `propertyFormSchema`. On success the action redirects, so
 * we never see the success branch here; on failure we render an
 * inline server-error message below the fields.
 */
export function PropertyForm({
  action,
  defaultValues,
  submitLabel,
}: {
  action: (values: PropertyFormValues) => Promise<ActionResult<unknown>>;
  defaultValues?: { name?: string; address?: string | null; notes?: string | null };
  submitLabel: string;
}) {
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PropertyFormValues>({
    resolver: zodResolver(propertyFormSchema),
    mode: "onTouched",
    defaultValues: {
      name: defaultValues?.name ?? "",
      address: defaultValues?.address ?? "",
      notes: defaultValues?.notes ?? "",
    },
  });

  const onSubmit = handleSubmit(async (data) => {
    setServerError(null);
    const result = await action(data);
    if (!result.ok) setServerError(result.error);
  });

  return (
    <form className="space-y-3" onSubmit={(e) => void onSubmit(e)} noValidate>
      <Field label="Name" autoFocus registration={register("name")} error={errors.name?.message} />
      <Field
        label="Address"
        autoComplete="street-address"
        registration={register("address")}
        error={errors.address?.message}
      />
      <TextArea label="Notes" registration={register("notes")} error={errors.notes?.message} />

      {serverError && <p className="text-sm text-red-700">{serverError}</p>}

      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
      >
        {isSubmitting ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
