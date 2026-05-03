"use client";

import { useState, useTransition } from "react";
import type { LookupRow } from "@/lib/lookup-helpers";
import {
  TAG_CONTAINS_P,
  TAG_CONTAINS_B,
  TAG_CONTAINS_NA,
  TAG_ACIDIFYING,
  TAG_PGR,
  TAG_SURFACTANT,
  TAG_HUMIC,
} from "@/lib/constants";
import type { ActionResult } from "./_actions";

const KNOWN_TAGS = [
  { value: TAG_CONTAINS_P, label: "Contains P" },
  { value: TAG_CONTAINS_B, label: "Contains B" },
  { value: TAG_CONTAINS_NA, label: "Contains Na" },
  { value: TAG_ACIDIFYING, label: "Acidifying" },
  { value: TAG_PGR, label: "PGR" },
  { value: TAG_SURFACTANT, label: "Surfactant" },
  { value: TAG_HUMIC, label: "Humic / fulvic" },
];

interface DefaultValues {
  brand?: string;
  name?: string;
  formId?: number;

  nPct?: number;
  p2o5Pct?: number;
  k2oPct?: number;
  caPct?: number;
  mgPct?: number;
  sPct?: number;
  naPct?: number;
  fePct?: number;
  mnPct?: number;
  znPct?: number;
  cuPct?: number;
  bPct?: number;

  densityLbPerGal?: number | null;

  pkgSizeValue?: number;
  pkgSizeUnitId?: number;
  pkgCostUsd?: number;

  mfgRateValue?: number | null;
  mfgRateUnitId?: number | null;
  mfgRateBasisId?: number | null;

  tags?: string[];
  sharedInHousehold?: boolean;

  notes?: string | null;
}

export function ProductForm({
  action,
  defaultValues,
  submitLabel,
  productForms,
  applicationUnits,
  mfgRateBases,
}: {
  action: (form: FormData) => Promise<ActionResult<unknown>>;
  defaultValues?: DefaultValues;
  submitLabel: string;
  productForms: LookupRow[];
  applicationUnits: LookupRow[];
  mfgRateBases: LookupRow[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const tagSet = new Set(defaultValues?.tags ?? []);
  const customTagSeed = (defaultValues?.tags ?? [])
    .filter((t) => !KNOWN_TAGS.some((k) => k.value === t))
    .join(", ");

  return (
    <form
      className="space-y-5"
      action={(form) => {
        setError(null);
        startTransition(async () => {
          const result = await action(form);
          if (!result.ok) setError(result.error);
        });
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field
          name="brand"
          label="Brand"
          defaultValue={defaultValues?.brand ?? ""}
          required
          autoFocus
        />
        <Field name="name" label="Product name" defaultValue={defaultValues?.name ?? ""} required />
      </div>

      <Select
        name="formId"
        label="Form"
        defaultValue={defaultValues?.formId?.toString() ?? ""}
        options={productForms}
        required
      />

      <Section title="Guaranteed analysis (label percent)">
        <Field
          name="nPct"
          label="N"
          type="number"
          step="0.01"
          min={0}
          max={100}
          defaultValue={fmt(defaultValues?.nPct)}
        />
        <Field
          name="p2o5Pct"
          label="P₂O₅"
          type="number"
          step="0.01"
          min={0}
          max={100}
          defaultValue={fmt(defaultValues?.p2o5Pct)}
        />
        <Field
          name="k2oPct"
          label="K₂O"
          type="number"
          step="0.01"
          min={0}
          max={100}
          defaultValue={fmt(defaultValues?.k2oPct)}
        />
        <Field
          name="caPct"
          label="Ca"
          type="number"
          step="0.01"
          min={0}
          max={100}
          defaultValue={fmt(defaultValues?.caPct)}
        />
        <Field
          name="mgPct"
          label="Mg"
          type="number"
          step="0.01"
          min={0}
          max={100}
          defaultValue={fmt(defaultValues?.mgPct)}
        />
        <Field
          name="sPct"
          label="S"
          type="number"
          step="0.01"
          min={0}
          max={100}
          defaultValue={fmt(defaultValues?.sPct)}
        />
        <Field
          name="naPct"
          label="Na"
          type="number"
          step="0.01"
          min={0}
          max={100}
          defaultValue={fmt(defaultValues?.naPct)}
        />
      </Section>

      <Section title="Micronutrients (percent)">
        <Field
          name="fePct"
          label="Fe"
          type="number"
          step="0.01"
          min={0}
          max={100}
          defaultValue={fmt(defaultValues?.fePct)}
        />
        <Field
          name="mnPct"
          label="Mn"
          type="number"
          step="0.01"
          min={0}
          max={100}
          defaultValue={fmt(defaultValues?.mnPct)}
        />
        <Field
          name="znPct"
          label="Zn"
          type="number"
          step="0.01"
          min={0}
          max={100}
          defaultValue={fmt(defaultValues?.znPct)}
        />
        <Field
          name="cuPct"
          label="Cu"
          type="number"
          step="0.01"
          min={0}
          max={100}
          defaultValue={fmt(defaultValues?.cuPct)}
        />
        <Field
          name="bPct"
          label="B"
          type="number"
          step="0.01"
          min={0}
          max={100}
          defaultValue={fmt(defaultValues?.bPct)}
        />
      </Section>

      <Field
        name="densityLbPerGal"
        label="Density (lb/gal) — required for liquids"
        type="number"
        step="0.01"
        min={0}
        defaultValue={
          defaultValues?.densityLbPerGal != null ? defaultValues.densityLbPerGal.toString() : ""
        }
      />

      <Section title="Packaging + cost">
        <Field
          name="pkgSizeValue"
          label="Package size"
          type="number"
          step="0.01"
          min={0}
          defaultValue={fmt(defaultValues?.pkgSizeValue)}
          required
        />
        <Select
          name="pkgSizeUnitId"
          label="Unit"
          defaultValue={defaultValues?.pkgSizeUnitId?.toString() ?? ""}
          options={applicationUnits}
          required
        />
        <Field
          name="pkgCostUsd"
          label="Package cost ($)"
          type="number"
          step="0.01"
          min={0}
          defaultValue={fmt(defaultValues?.pkgCostUsd)}
        />
      </Section>

      <Section title="Manufacturer rate (optional)">
        <Field
          name="mfgRateValue"
          label="Rate value"
          type="number"
          step="0.01"
          min={0}
          defaultValue={fmt(defaultValues?.mfgRateValue ?? undefined)}
        />
        <Select
          name="mfgRateUnitId"
          label="Rate unit"
          defaultValue={defaultValues?.mfgRateUnitId?.toString() ?? ""}
          options={applicationUnits}
          allowEmpty
        />
        <Select
          name="mfgRateBasisId"
          label="Per"
          defaultValue={defaultValues?.mfgRateBasisId?.toString() ?? ""}
          options={mfgRateBases}
          allowEmpty
        />
      </Section>

      <fieldset className="rounded border border-neutral-200 p-3">
        <legend className="px-1 text-xs uppercase tracking-wide text-neutral-500">Tags</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {KNOWN_TAGS.map((t) => (
            <label key={t.value} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="tags"
                value={t.value}
                defaultChecked={tagSet.has(t.value)}
                className="h-4 w-4 rounded border-neutral-300"
              />
              {t.label}
            </label>
          ))}
        </div>
        <label className="mt-3 block">
          <span className="mb-1 block text-sm font-medium">Custom tags (comma-separated)</span>
          <input
            name="customTags"
            defaultValue={customTagSeed}
            className="w-full rounded border border-neutral-300 px-2 py-2 text-sm focus:border-neutral-900 focus:outline-none"
          />
        </label>
      </fieldset>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="sharedInHousehold"
          defaultChecked={defaultValues?.sharedInHousehold ?? false}
          className="h-4 w-4 rounded border-neutral-300"
        />
        Share with property contributors
      </label>

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

function fmt(v: number | undefined): string {
  if (v == null) return "";
  return v.toString();
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded border border-neutral-200 p-3">
      <legend className="px-1 text-xs uppercase tracking-wide text-neutral-500">{title}</legend>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">{children}</div>
    </fieldset>
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
  max,
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
  max?: number;
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
        max={max}
        step={step}
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

function Select({
  name,
  label,
  defaultValue,
  options,
  required,
  allowEmpty,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  options: LookupRow[];
  required?: boolean;
  /** When true, the empty option stays selectable (renders "—") for optional fields. */
  allowEmpty?: boolean;
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
        <option value="" disabled={!allowEmpty}>
          {allowEmpty ? "—" : "Choose…"}
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
