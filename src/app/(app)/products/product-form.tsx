"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Field } from "@/components/form/field";
import { Select } from "@/components/form/select";
import { TextArea } from "@/components/form/text-area";
import {
  TAG_CONTAINS_P,
  TAG_CONTAINS_B,
  TAG_CONTAINS_NA,
  TAG_ACIDIFYING,
  TAG_PGR,
  TAG_SURFACTANT,
  TAG_HUMIC,
} from "@/lib/constants";
import {
  productFormSchema,
  type ProductFormInput,
  type ProductFormOutput,
} from "@/lib/forms/product";
import type { LookupRow } from "@/lib/lookup-helpers";
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
  mfgRatePerValue?: number | null;
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
  action: (values: ProductFormOutput) => Promise<ActionResult<unknown>>;
  defaultValues?: DefaultValues;
  submitLabel: string;
  productForms: LookupRow[];
  applicationUnits: LookupRow[];
  mfgRateBases: LookupRow[];
}) {
  const [serverError, setServerError] = useState<string | null>(null);

  const knownTagSet = new Set<string>(KNOWN_TAGS.map((t) => t.value));
  const incomingTags = defaultValues?.tags ?? [];
  const customTagSeed = incomingTags.filter((t) => !knownTagSet.has(t)).join(", ");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormInput, unknown, ProductFormOutput>({
    resolver: zodResolver(productFormSchema),
    mode: "onTouched",
    defaultValues: {
      brand: defaultValues?.brand ?? "",
      name: defaultValues?.name ?? "",
      formId: defaultValues?.formId?.toString() ?? "",

      nPct: defaultValues?.nPct?.toString() ?? "0",
      p2o5Pct: defaultValues?.p2o5Pct?.toString() ?? "0",
      k2oPct: defaultValues?.k2oPct?.toString() ?? "0",
      caPct: defaultValues?.caPct?.toString() ?? "0",
      mgPct: defaultValues?.mgPct?.toString() ?? "0",
      sPct: defaultValues?.sPct?.toString() ?? "0",
      naPct: defaultValues?.naPct?.toString() ?? "0",
      fePct: defaultValues?.fePct?.toString() ?? "0",
      mnPct: defaultValues?.mnPct?.toString() ?? "0",
      znPct: defaultValues?.znPct?.toString() ?? "0",
      cuPct: defaultValues?.cuPct?.toString() ?? "0",
      bPct: defaultValues?.bPct?.toString() ?? "0",

      densityLbPerGal: defaultValues?.densityLbPerGal?.toString() ?? "",

      pkgSizeValue: defaultValues?.pkgSizeValue?.toString() ?? "",
      pkgSizeUnitId: defaultValues?.pkgSizeUnitId?.toString() ?? "",
      pkgCostUsd: defaultValues?.pkgCostUsd?.toString() ?? "0",

      mfgRateValue: defaultValues?.mfgRateValue?.toString() ?? "",
      mfgRateUnitId: defaultValues?.mfgRateUnitId?.toString() ?? "",
      mfgRatePerValue: defaultValues?.mfgRatePerValue?.toString() ?? "",
      mfgRateBasisId: defaultValues?.mfgRateBasisId?.toString() ?? "",

      tags: incomingTags.filter((t) => knownTagSet.has(t)),
      customTags: customTagSeed,
      sharedInHousehold: defaultValues?.sharedInHousehold ?? false,

      notes: defaultValues?.notes ?? "",
    },
  });

  const onSubmit = handleSubmit(async (data) => {
    setServerError(null);
    const result = await action(data);
    if (!result.ok) setServerError(result.error);
  });

  return (
    <form className="space-y-5" onSubmit={(e) => void onSubmit(e)} noValidate>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field
          label="Brand"
          autoFocus
          registration={register("brand")}
          error={errors.brand?.message}
        />
        <Field label="Product name" registration={register("name")} error={errors.name?.message} />
      </div>

      <Select
        label="Form"
        options={productForms}
        required
        registration={register("formId")}
        error={errors.formId?.message}
      />

      <Section title="Guaranteed analysis (label percent)">
        <PctField label="N" name="nPct" register={register} errors={errors} />
        <PctField label="P₂O₅" name="p2o5Pct" register={register} errors={errors} />
        <PctField label="K₂O" name="k2oPct" register={register} errors={errors} />
        <PctField label="Ca" name="caPct" register={register} errors={errors} />
        <PctField label="Mg" name="mgPct" register={register} errors={errors} />
        <PctField label="S" name="sPct" register={register} errors={errors} />
        <PctField label="Na" name="naPct" register={register} errors={errors} />
      </Section>

      <Section title="Micronutrients (percent)">
        <PctField label="Fe" name="fePct" register={register} errors={errors} />
        <PctField label="Mn" name="mnPct" register={register} errors={errors} />
        <PctField label="Zn" name="znPct" register={register} errors={errors} />
        <PctField label="Cu" name="cuPct" register={register} errors={errors} />
        <PctField label="B" name="bPct" register={register} errors={errors} />
      </Section>

      <Field
        label="Density (lb/gal) — required for liquids"
        type="number"
        step="0.01"
        min={0}
        registration={register("densityLbPerGal")}
        error={errors.densityLbPerGal?.message}
      />

      <Section title="Packaging + cost">
        <Field
          label="Package size"
          type="number"
          step="0.01"
          min={0}
          registration={register("pkgSizeValue")}
          error={errors.pkgSizeValue?.message}
        />
        <Select
          label="Unit"
          options={applicationUnits}
          required
          registration={register("pkgSizeUnitId")}
          error={errors.pkgSizeUnitId?.message}
        />
        <Field
          label="Package cost ($)"
          type="number"
          step="0.01"
          min={0}
          registration={register("pkgCostUsd")}
          error={errors.pkgCostUsd?.message}
        />
      </Section>

      <Section title="Manufacturer rate (optional)">
        <Field
          label="Rate value"
          type="number"
          step="0.01"
          min={0}
          placeholder="1"
          registration={register("mfgRateValue")}
          error={errors.mfgRateValue?.message}
        />
        <Select
          label="Rate unit"
          options={applicationUnits}
          registration={register("mfgRateUnitId")}
          error={errors.mfgRateUnitId?.message}
        />
        <Field
          label="Per (qty)"
          type="number"
          step="any"
          min={0}
          placeholder="12800"
          registration={register("mfgRatePerValue")}
          error={errors.mfgRatePerValue?.message}
        />
        <Select
          label="Per (unit)"
          options={mfgRateBases}
          registration={register("mfgRateBasisId")}
          error={errors.mfgRateBasisId?.message}
        />
      </Section>

      <fieldset className="rounded border border-neutral-200 p-3">
        <legend className="px-1 text-xs uppercase tracking-wide text-neutral-500">Tags</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {KNOWN_TAGS.map((t) => (
            <label key={t.value} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                value={t.value}
                {...register("tags")}
                className="h-4 w-4 rounded border-neutral-300"
              />
              {t.label}
            </label>
          ))}
        </div>
        <label className="mt-3 block">
          <span className="mb-1 block text-sm font-medium">Custom tags (comma-separated)</span>
          <input
            {...register("customTags")}
            className="w-full rounded border border-neutral-300 px-2 py-2 text-sm focus:border-neutral-900 focus:outline-none"
          />
        </label>
      </fieldset>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          {...register("sharedInHousehold")}
          className="h-4 w-4 rounded border-neutral-300"
        />
        Share with property contributors
      </label>

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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded border border-neutral-200 p-3">
      <legend className="px-1 text-xs uppercase tracking-wide text-neutral-500">{title}</legend>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">{children}</div>
    </fieldset>
  );
}

/** Convenience wrapper for the dozen percent inputs in the analysis sections. */
function PctField({
  label,
  name,
  register,
  errors,
}: {
  label: string;
  name:
    | "nPct"
    | "p2o5Pct"
    | "k2oPct"
    | "caPct"
    | "mgPct"
    | "sPct"
    | "naPct"
    | "fePct"
    | "mnPct"
    | "znPct"
    | "cuPct"
    | "bPct";
  register: ReturnType<typeof useForm<ProductFormInput, unknown, ProductFormOutput>>["register"];
  errors: ReturnType<
    typeof useForm<ProductFormInput, unknown, ProductFormOutput>
  >["formState"]["errors"];
}) {
  return (
    <Field
      label={label}
      type="number"
      step="0.01"
      min={0}
      max={100}
      registration={register(name)}
      error={errors[name]?.message}
    />
  );
}
