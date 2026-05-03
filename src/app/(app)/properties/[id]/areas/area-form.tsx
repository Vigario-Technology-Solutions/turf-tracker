"use client";

import { useState, useTransition } from "react";
import type { LookupRow } from "@/lib/lookup-helpers";
import type { ActionResult } from "./_actions";

/**
 * Shared create/edit form for areas. Lookup option lists come from the
 * server (`getSerializedLookups`) so adding a new area type or
 * irrigation source is a seed-row change, never a UI change.
 */
export function AreaForm({
  action,
  defaultValues,
  submitLabel,
  areaTypes,
  irrigationSources,
}: {
  action: (form: FormData) => Promise<ActionResult<unknown>>;
  defaultValues?: {
    name?: string;
    areaSqFt?: number;
    areaTypeId?: number;
    irrigationSourceId?: number;
    cropOrSpecies?: string | null;
    waterNaPpm?: number | null;
    precipRateInPerHr?: number | null;
    headType?: string | null;
    notes?: string | null;
  };
  submitLabel: string;
  areaTypes: LookupRow[];
  irrigationSources: LookupRow[];
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

      <div className="grid grid-cols-2 gap-3">
        <Field
          name="areaSqFt"
          label="Area (sq ft)"
          type="number"
          min={1}
          step={1}
          defaultValue={defaultValues?.areaSqFt?.toString() ?? ""}
          required
        />
        <Select
          name="areaTypeId"
          label="Type"
          defaultValue={defaultValues?.areaTypeId?.toString() ?? ""}
          options={areaTypes}
          required
        />
      </div>

      <Field
        name="cropOrSpecies"
        label="Crop or species"
        defaultValue={defaultValues?.cropOrSpecies ?? ""}
        placeholder="e.g. Bermudagrass — Tifway 419"
      />

      <div className="grid grid-cols-2 gap-3">
        <Select
          name="irrigationSourceId"
          label="Irrigation source"
          defaultValue={defaultValues?.irrigationSourceId?.toString() ?? ""}
          options={irrigationSources}
          required
        />
        <Field
          name="waterNaPpm"
          label="Water Na (ppm)"
          type="number"
          step="0.1"
          min={0}
          defaultValue={defaultValues?.waterNaPpm?.toString() ?? ""}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field
          name="precipRateInPerHr"
          label="Precip rate (in/hr)"
          type="number"
          step="0.01"
          min={0}
          defaultValue={defaultValues?.precipRateInPerHr?.toString() ?? ""}
          placeholder="optional"
        />
        <Field
          name="headType"
          label="Head type"
          defaultValue={defaultValues?.headType ?? ""}
          placeholder="rotor / spray / MP / drip"
        />
      </div>

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
  type = "text",
  placeholder,
  min,
  step,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  required?: boolean;
  autoFocus?: boolean;
  type?: string;
  placeholder?: string;
  min?: number;
  step?: number | string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        autoFocus={autoFocus}
        placeholder={placeholder}
        min={min}
        step={step}
        className="w-full rounded border border-neutral-300 px-2 py-2 text-sm focus:border-neutral-900 focus:outline-none"
      />
    </label>
  );
}

function Select({
  name,
  label,
  defaultValue,
  options,
  required,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  options: LookupRow[];
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue ?? ""}
        required={required}
        className="w-full rounded border border-neutral-300 bg-white px-2 py-2 text-sm focus:border-neutral-900 focus:outline-none"
      >
        <option value="" disabled>
          Choose…
        </option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
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
