"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
import { useForm, useWatch, type Control } from "react-hook-form";
import { Field } from "@/components/form/field";
import { TextArea } from "@/components/form/text-area";
import { sar, esp, caMgRatio } from "@/lib/calc/soil";
import { soilTestFormSchema, type SoilTestFormValues } from "@/lib/forms/soil-test";
import type { ActionResult } from "./_actions";

/**
 * Soil-test entry form. Renders the lab-report fields with a live
 * derived-metrics panel beside them (SAR / ESP / Ca:Mg) so the user
 * can eyeball the math as they type. Live derivation uses RHF's
 * `useWatch` to subscribe to just the cation fields without
 * re-rendering the whole form on every keystroke.
 *
 * The same calc functions back the server-side rules engine, so what
 * the user sees here matches what downstream recommendations use.
 */
export function SoilTestForm({
  action,
  todayIso,
}: {
  action: (values: SoilTestFormValues) => Promise<ActionResult<unknown>>;
  /** ISO date string (YYYY-MM-DD) to default the test date to. */
  todayIso: string;
}) {
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<SoilTestFormValues>({
    resolver: zodResolver(soilTestFormSchema),
    mode: "onTouched",
    defaultValues: {
      testDate: todayIso,
      lab: "",
      labReportId: "",
      pH: "",
      nPpm: "",
      pPpm: "",
      kPpm: "",
      sPpm: "",
      caPpm: "",
      mgPpm: "",
      naPpm: "",
      fePpm: "",
      mnPpm: "",
      znPpm: "",
      cuPpm: "",
      bPpm: "",
      omPct: "",
      cecMeq100g: "",
      notes: "",
    },
  });

  const onSubmit = handleSubmit(async (data) => {
    setServerError(null);
    const result = await action(data);
    if (!result.ok) setServerError(result.error);
  });

  return (
    <form className="space-y-5" onSubmit={(e) => void onSubmit(e)} noValidate>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field
          label="Test date"
          type="date"
          registration={register("testDate")}
          error={errors.testDate?.message}
        />
        <Field
          label="Lab"
          placeholder="MySoil, UC Davis, …"
          registration={register("lab")}
          error={errors.lab?.message}
        />
        <Field
          label="Lab report ID"
          registration={register("labReportId")}
          error={errors.labReportId?.message}
        />
      </div>

      <Section title="Macronutrients">
        <Field
          label="pH"
          type="number"
          step="0.01"
          min={0}
          max={14}
          registration={register("pH")}
          error={errors.pH?.message}
        />
        <Field
          label="OM (%)"
          type="number"
          step="0.01"
          min={0}
          registration={register("omPct")}
          error={errors.omPct?.message}
        />
        <Field
          label="CEC (meq/100g)"
          type="number"
          step="0.01"
          min={0}
          registration={register("cecMeq100g")}
          error={errors.cecMeq100g?.message}
        />
        <Field
          label="N (ppm)"
          type="number"
          step="0.01"
          min={0}
          registration={register("nPpm")}
          error={errors.nPpm?.message}
        />
        <Field
          label="P (ppm)"
          type="number"
          step="0.01"
          min={0}
          registration={register("pPpm")}
          error={errors.pPpm?.message}
        />
        <Field
          label="K (ppm)"
          type="number"
          step="0.01"
          min={0}
          registration={register("kPpm")}
          error={errors.kPpm?.message}
        />
        <Field
          label="S (ppm)"
          type="number"
          step="0.01"
          min={0}
          registration={register("sPpm")}
          error={errors.sPpm?.message}
        />
        <Field
          label="Ca (ppm)"
          type="number"
          step="0.01"
          min={0}
          registration={register("caPpm")}
          error={errors.caPpm?.message}
        />
        <Field
          label="Mg (ppm)"
          type="number"
          step="0.01"
          min={0}
          registration={register("mgPpm")}
          error={errors.mgPpm?.message}
        />
        <Field
          label="Na (ppm)"
          type="number"
          step="0.01"
          min={0}
          registration={register("naPpm")}
          error={errors.naPpm?.message}
        />
      </Section>

      <Section title="Micronutrients (ppm)">
        <Field
          label="Fe"
          type="number"
          step="0.01"
          min={0}
          registration={register("fePpm")}
          error={errors.fePpm?.message}
        />
        <Field
          label="Mn"
          type="number"
          step="0.01"
          min={0}
          registration={register("mnPpm")}
          error={errors.mnPpm?.message}
        />
        <Field
          label="Zn"
          type="number"
          step="0.01"
          min={0}
          registration={register("znPpm")}
          error={errors.znPpm?.message}
        />
        <Field
          label="Cu"
          type="number"
          step="0.01"
          min={0}
          registration={register("cuPpm")}
          error={errors.cuPpm?.message}
        />
        <Field
          label="B"
          type="number"
          step="0.01"
          min={0}
          registration={register("bPpm")}
          error={errors.bPpm?.message}
        />
      </Section>

      <DerivedPanel control={control} />

      <TextArea label="Notes" registration={register("notes")} error={errors.notes?.message} />

      {serverError && <p className="text-sm text-red-700">{serverError}</p>}

      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
      >
        {isSubmitting ? "Saving…" : "Save soil test"}
      </button>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded border border-neutral-200 p-3">
      <legend className="px-1 text-xs uppercase tracking-wide text-neutral-500">{title}</legend>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{children}</div>
    </fieldset>
  );
}

/**
 * Subscribes to the four cation fields via `useWatch` (no whole-form
 * re-render on every keystroke) and recomputes SAR / ESP / Ca:Mg
 * inline. Same calc functions the server-side rules engine uses.
 */
function DerivedPanel({ control }: { control: Control<SoilTestFormValues> }) {
  const [caPpm, mgPpm, naPpm, cecMeq100g] = useWatch({
    control,
    name: ["caPpm", "mgPpm", "naPpm", "cecMeq100g"],
  });

  const derived = useMemo(() => {
    const toNum = (v: string) => (v.length === 0 ? null : Number(v));
    const cations = {
      caPpm: toNum(caPpm),
      mgPpm: toNum(mgPpm),
      naPpm: toNum(naPpm),
      cecMeq100g: toNum(cecMeq100g),
    };
    return {
      sar: sar(cations),
      esp: esp(cations),
      caMg: caMgRatio(cations),
    };
  }, [caPpm, mgPpm, naPpm, cecMeq100g]);

  return (
    <div className="rounded border border-neutral-200 bg-neutral-50 p-3">
      <div className="text-xs uppercase tracking-wide text-neutral-500">
        Derived (live, from Ca / Mg / Na / CEC above)
      </div>
      <div className="mt-2 grid grid-cols-3 gap-3 text-sm">
        <DerivedStat label="SAR" value={fmt(derived.sar)} hint="Sodium adsorption ratio" />
        <DerivedStat label="ESP" value={fmt(derived.esp, "%")} hint="Exchangeable sodium %" />
        <DerivedStat label="Ca:Mg (meq)" value={fmt(derived.caMg)} hint="Cation balance" />
      </div>
    </div>
  );
}

function DerivedStat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-0.5 text-base font-medium">{value}</div>
      <div className="text-xs text-neutral-500">{hint}</div>
    </div>
  );
}

function fmt(v: number | null, suffix = ""): string {
  if (v == null) return "—";
  if (!isFinite(v)) return "—";
  return `${v.toFixed(2)}${suffix}`;
}
