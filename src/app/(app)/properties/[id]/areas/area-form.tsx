"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Field } from "@/components/form/field";
import { Select } from "@/components/form/select";
import { TextArea } from "@/components/form/text-area";
import type { LookupRow } from "@/lib/lookup-helpers";
import { areaFormSchema, type AreaFormInput, type AreaFormOutput } from "@/lib/forms/area";
import type { ActionResult } from "./_actions";

/**
 * Shared create/edit form for areas. Lookup option lists come from
 * the server (`getSerializedLookups`) so adding a new area type or
 * irrigation source is a seed-row change, never a UI change.
 *
 * Numeric + FK fields hold their raw string form-state internally —
 * RHF registers them as strings and the schema's `z.coerce.number()`
 * does the conversion at validation time. Pre-fill from defaultValues
 * stringifies for the same reason.
 */
export function AreaForm({
  action,
  defaultValues,
  submitLabel,
  areaTypes,
  irrigationSources,
  irrigationHeadTypes,
}: {
  action: (values: AreaFormOutput) => Promise<ActionResult<unknown>>;
  defaultValues?: {
    name?: string;
    areaSqFt?: number;
    areaTypeId?: number;
    irrigationSourceId?: number;
    cropOrSpecies?: string | null;
    waterNaPpm?: number | null;
    precipRateInPerHr?: number | null;
    headTypeId?: number | null;
    notes?: string | null;
  };
  submitLabel: string;
  areaTypes: LookupRow[];
  irrigationSources: LookupRow[];
  irrigationHeadTypes: LookupRow[];
}) {
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AreaFormInput, unknown, AreaFormOutput>({
    resolver: zodResolver(areaFormSchema),
    mode: "onTouched",
    // Form holds strings for every field (HTML inputs always emit
    // strings); the schema's z.coerce.number() flips the FK / sq-ft
    // fields to numbers at validation time, which is what the action
    // sees in `data`.
    defaultValues: {
      name: defaultValues?.name ?? "",
      areaSqFt: defaultValues?.areaSqFt?.toString() ?? "",
      areaTypeId: defaultValues?.areaTypeId?.toString() ?? "",
      irrigationSourceId: defaultValues?.irrigationSourceId?.toString() ?? "",
      cropOrSpecies: defaultValues?.cropOrSpecies ?? "",
      waterNaPpm: defaultValues?.waterNaPpm?.toString() ?? "",
      precipRateInPerHr: defaultValues?.precipRateInPerHr?.toString() ?? "",
      headTypeId: defaultValues?.headTypeId?.toString() ?? "",
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

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Area (sq ft)"
          type="number"
          min={1}
          step={1}
          registration={register("areaSqFt")}
          error={errors.areaSqFt?.message}
        />
        <Select
          label="Type"
          options={areaTypes}
          required
          registration={register("areaTypeId")}
          error={errors.areaTypeId?.message}
        />
      </div>

      <Field
        label="Crop or species"
        placeholder="e.g. Bermudagrass — Tifway 419"
        registration={register("cropOrSpecies")}
        error={errors.cropOrSpecies?.message}
      />

      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Irrigation source"
          options={irrigationSources}
          required
          registration={register("irrigationSourceId")}
          error={errors.irrigationSourceId?.message}
        />
        <Field
          label="Water Na (ppm)"
          type="number"
          step="0.01"
          min={0}
          registration={register("waterNaPpm")}
          error={errors.waterNaPpm?.message}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Precip rate (in/hr)"
          type="number"
          step="0.01"
          min={0}
          placeholder="optional"
          registration={register("precipRateInPerHr")}
          error={errors.precipRateInPerHr?.message}
        />
        <Select
          label="Head type"
          options={irrigationHeadTypes}
          registration={register("headTypeId")}
          error={errors.headTypeId?.message}
        />
      </div>

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
