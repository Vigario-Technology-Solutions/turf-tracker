"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "./_actions";

/**
 * Shared create/edit form. Caller injects the action — both
 * createProperty and updateProperty(id, ...) match the same shape via
 * a thin wrapper. Renders inline error returned by the action; on
 * success the action redirects (we never see the success branch here).
 */
export function PropertyForm({
  action,
  defaultValues,
  submitLabel,
}: {
  action: (form: FormData) => Promise<ActionResult<unknown>>;
  defaultValues?: { name?: string; address?: string | null; notes?: string | null };
  submitLabel: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-3"
      action={(form) => {
        setError(null);
        startTransition(async () => {
          const result = await action(form);
          if (!result.ok) setError(result.error);
        });
      }}
    >
      <Field name="name" label="Name" defaultValue={defaultValues?.name ?? ""} required autoFocus />
      <Field name="address" label="Address" defaultValue={defaultValues?.address ?? ""} />
      <TextArea name="notes" label="Notes" defaultValue={defaultValues?.notes ?? ""} />

      {error && <p className="text-sm text-red-700">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

function Field({
  name,
  label,
  defaultValue,
  required,
  autoFocus,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  required?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <input
        name={name}
        defaultValue={defaultValue}
        required={required}
        autoFocus={autoFocus}
        className="w-full rounded border border-neutral-300 px-2 py-2 text-sm focus:border-neutral-900 focus:outline-none"
      />
    </label>
  );
}

function TextArea({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <textarea
        name={name}
        defaultValue={defaultValue}
        rows={3}
        className="w-full rounded border border-neutral-300 px-2 py-2 text-sm focus:border-neutral-900 focus:outline-none"
      />
    </label>
  );
}
