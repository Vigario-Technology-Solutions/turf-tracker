"use client";

import { useMemo, useState, useTransition } from "react";
import { sar, esp, caMgRatio, type SoilCations } from "@/lib/calc/soil";
import type { ActionResult } from "./_actions";

/**
 * Soil-test entry form. Renders the lab-report fields with a live
 * derived-metrics panel beside it (SAR / ESP / Ca:Mg) so the user can
 * eyeball the math as they type. The same calc functions back the
 * server-side rules engine, so what the user sees here matches what
 * downstream recommendations use.
 */
export function SoilTestForm({
  action,
  todayIso,
}: {
  action: (form: FormData) => Promise<ActionResult<unknown>>;
  /** ISO date string (YYYY-MM-DD) to default the test date to. */
  todayIso: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [cations, setCations] = useState<SoilCations & { cecMeq100g?: number | null }>({
    caPpm: null,
    mgPpm: null,
    naPpm: null,
    cecMeq100g: null,
  });

  const derived = useMemo(() => {
    return {
      sar: sar(cations),
      esp: esp(cations),
      caMg: caMgRatio(cations),
    };
  }, [cations]);

  const updateCation = (key: "caPpm" | "mgPpm" | "naPpm" | "cecMeq100g", v: string) => {
    setCations((prev) => ({ ...prev, [key]: v.trim().length === 0 ? null : Number(v) }));
  };

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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field name="testDate" label="Test date" type="date" defaultValue={todayIso} required />
        <Field name="lab" label="Lab" placeholder="MySoil, UC Davis, …" />
        <Field name="labReportId" label="Lab report ID" />
      </div>

      <Section title="Macronutrients">
        <Field name="pH" label="pH" type="number" step="0.01" min={0} max={14} />
        <Field name="omPct" label="OM (%)" type="number" step="0.01" min={0} />
        <Field
          name="cecMeq100g"
          label="CEC (meq/100g)"
          type="number"
          step="0.01"
          min={0}
          onChangeValue={(v) => updateCation("cecMeq100g", v)}
        />
        <Field name="nPpm" label="N (ppm)" type="number" step="0.01" min={0} />
        <Field name="pPpm" label="P (ppm)" type="number" step="0.01" min={0} />
        <Field name="kPpm" label="K (ppm)" type="number" step="0.01" min={0} />
        <Field name="sPpm" label="S (ppm)" type="number" step="0.01" min={0} />
        <Field
          name="caPpm"
          label="Ca (ppm)"
          type="number"
          step="0.01"
          min={0}
          onChangeValue={(v) => updateCation("caPpm", v)}
        />
        <Field
          name="mgPpm"
          label="Mg (ppm)"
          type="number"
          step="0.01"
          min={0}
          onChangeValue={(v) => updateCation("mgPpm", v)}
        />
        <Field
          name="naPpm"
          label="Na (ppm)"
          type="number"
          step="0.01"
          min={0}
          onChangeValue={(v) => updateCation("naPpm", v)}
        />
      </Section>

      <Section title="Micronutrients (ppm)">
        <Field name="fePpm" label="Fe" type="number" step="0.01" min={0} />
        <Field name="mnPpm" label="Mn" type="number" step="0.01" min={0} />
        <Field name="znPpm" label="Zn" type="number" step="0.01" min={0} />
        <Field name="cuPpm" label="Cu" type="number" step="0.01" min={0} />
        <Field name="bPpm" label="B" type="number" step="0.01" min={0} />
      </Section>

      <DerivedPanel sar={derived.sar} esp={derived.esp} caMg={derived.caMg} />

      <TextArea name="notes" label="Notes" />

      {error && <p className="text-sm text-red-700">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save soil test"}
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

function DerivedPanel({
  sar,
  esp,
  caMg,
}: {
  sar: number | null;
  esp: number | null;
  caMg: number | null;
}) {
  return (
    <div className="rounded border border-neutral-200 bg-neutral-50 p-3">
      <div className="text-xs uppercase tracking-wide text-neutral-500">
        Derived (live, from Ca / Mg / Na / CEC above)
      </div>
      <div className="mt-2 grid grid-cols-3 gap-3 text-sm">
        <DerivedStat label="SAR" value={fmt(sar)} hint="Sodium adsorption ratio" />
        <DerivedStat label="ESP" value={fmt(esp, "%")} hint="Exchangeable sodium %" />
        <DerivedStat label="Ca:Mg (meq)" value={fmt(caMg)} hint="Cation balance" />
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

function Field({
  name,
  label,
  defaultValue,
  required,
  type = "text",
  placeholder,
  min,
  max,
  step,
  onChangeValue,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  required?: boolean;
  type?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number | string;
  onChangeValue?: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        onChange={onChangeValue ? (e) => onChangeValue(e.currentTarget.value) : undefined}
        className="w-full rounded border border-neutral-300 px-2 py-2 text-sm focus:border-neutral-900 focus:outline-none"
      />
    </label>
  );
}

function TextArea({ name, label }: { name: string; label: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <textarea
        name={name}
        rows={3}
        className="w-full rounded border border-neutral-300 px-2 py-2 text-sm focus:border-neutral-900 focus:outline-none"
      />
    </label>
  );
}
