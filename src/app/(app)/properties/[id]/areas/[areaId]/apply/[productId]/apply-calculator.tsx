"use client";

import { useMemo, useState, useTransition } from "react";
import {
  evaluateWarnings,
  hasHardWarning,
  planGranular,
  planLiquid,
  productElementalAnalysis,
  type Nutrient,
  type ProductLabel,
} from "@/lib/calc";
import type { ActionResult } from "../_actions";

const NUTRIENT_OPTIONS: Nutrient[] = ["N", "P", "K", "Ca", "Mg", "S", "Fe", "Mn", "Zn", "Cu", "B"];

interface AreaShape {
  id: string;
  name: string;
  areaSqFt: number;
}

interface ProductShape extends ProductLabel {
  id: string;
  brand: string;
  name: string;
  tags: readonly string[];
  pkgSizeUnit: string;
  pkgSizeValue: number;
  pkgCostUsd: number;
}

interface SoilShape {
  pH: number | null;
  pPpm: number | null;
  bPpm: number | null;
}

/**
 * The killer screen. Three steps that fold into one form:
 *   1. Pick target nutrient + rate (lb/1k). Liquid mode adds a carrier
 *      gallon input.
 *   2. Live recompute every plan field as the user types — dosage,
 *      delivered breakdown, cost, side-effect warnings.
 *   3. Confirm + log. Hard warnings demand an explicit override
 *      checkbox (state + server both enforce).
 *
 * The same `planGranular` / `planLiquid` / `evaluateWarnings` functions
 * back the server action, so what the user sees here is what gets
 * persisted — no drift between preview and reality.
 */
export function ApplyCalculator({
  action,
  area,
  product,
  soilTest,
  isGranular,
}: {
  action: (form: FormData) => Promise<ActionResult<unknown>>;
  area: AreaShape;
  product: ProductShape;
  soilTest: SoilShape | null;
  isGranular: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Pick a sensible default nutrient: first one with > 0 elemental.
  const elemental = useMemo(() => productElementalAnalysis(product), [product]);
  const defaultNutrient = useMemo(() => {
    const firstNonZero = NUTRIENT_OPTIONS.find((n) => elemental[n] > 0);
    return firstNonZero ?? "N";
  }, [elemental]);

  const [targetNutrient, setTargetNutrient] = useState<Nutrient>(defaultNutrient);
  const [targetLbPer1k, setTargetLbPer1k] = useState<string>("0.4");
  const [carrierTotalGal, setCarrierTotalGal] = useState<string>("2");
  const [acceptedHardWarnings, setAcceptedHardWarnings] = useState(false);

  const computation = useMemo(() => {
    const target = Number(targetLbPer1k);
    if (!isFinite(target) || target <= 0) return null;
    if (elemental[targetNutrient] <= 0) {
      return { ok: false as const, error: `Product contains 0% ${targetNutrient}.` };
    }
    try {
      if (isGranular) {
        const plan = planGranular({
          product,
          targetNutrient,
          targetLbPer1k: target,
          areaSqFt: area.areaSqFt,
        });
        return { ok: true as const, mode: "granular" as const, plan };
      }
      const carrier = Number(carrierTotalGal);
      if (!isFinite(carrier) || carrier <= 0) {
        return { ok: false as const, error: "Carrier volume must be greater than 0." };
      }
      const plan = planLiquid({
        product,
        targetNutrient,
        targetLbPer1k: target,
        areaSqFt: area.areaSqFt,
        carrierTotalGal: carrier,
      });
      return { ok: true as const, mode: "liquid" as const, plan };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Calculation failed" };
    }
  }, [
    area.areaSqFt,
    carrierTotalGal,
    elemental,
    isGranular,
    product,
    targetLbPer1k,
    targetNutrient,
  ]);

  const warnings = useMemo(() => evaluateWarnings({ product, soilTest }), [product, soilTest]);
  const blocked = hasHardWarning(warnings) && !acceptedHardWarnings;

  // Approximate cost — same approximation the server uses.
  const cost = useMemo(() => {
    if (!computation?.ok) return null;
    const lb = approxPkgSizeLb(product.pkgSizeUnit, product.pkgSizeValue, product.densityLbPerGal);
    if (lb <= 0) return null;
    return (product.pkgCostUsd / lb) * computation.plan.totalProductLb;
  }, [
    computation,
    product.densityLbPerGal,
    product.pkgCostUsd,
    product.pkgSizeUnit,
    product.pkgSizeValue,
  ]);

  return (
    <form
      className="space-y-4"
      action={(form) => {
        setError(null);
        startTransition(async () => {
          const result = await action(form);
          if (!result.ok) setError(result.error);
        });
      }}
    >
      <input type="hidden" name="productId" value={product.id} />
      <input type="hidden" name="mode" value={isGranular ? "granular" : "liquid"} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Target rate (lb/1k)</span>
          <input
            name="targetLbPer1k"
            type="number"
            step="0.01"
            min={0}
            value={targetLbPer1k}
            onChange={(e) => setTargetLbPer1k(e.currentTarget.value)}
            required
            className="w-full rounded border border-neutral-300 px-2 py-2 text-sm focus:border-neutral-900 focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Of nutrient</span>
          <select
            name="targetNutrient"
            value={targetNutrient}
            onChange={(e) => setTargetNutrient(e.currentTarget.value as Nutrient)}
            className="w-full rounded border border-neutral-300 bg-white px-2 py-2 text-sm focus:border-neutral-900 focus:outline-none"
          >
            {NUTRIENT_OPTIONS.map((n) => (
              <option key={n} value={n} disabled={elemental[n] <= 0}>
                {n} ({elemental[n].toFixed(2)}%)
              </option>
            ))}
          </select>
        </label>
        {!isGranular && (
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Carrier (gal)</span>
            <input
              name="carrierTotalGal"
              type="number"
              step="0.1"
              min={0}
              value={carrierTotalGal}
              onChange={(e) => setCarrierTotalGal(e.currentTarget.value)}
              required
              className="w-full rounded border border-neutral-300 px-2 py-2 text-sm focus:border-neutral-900 focus:outline-none"
            />
          </label>
        )}
      </div>

      <ResultPanel computation={computation} isGranular={isGranular} cost={cost} />

      {warnings.length > 0 && (
        <div className="space-y-2">
          {warnings.map((w) => (
            <div
              key={w.code}
              className={
                w.severity === "hard"
                  ? "rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800"
                  : "rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800"
              }
            >
              <span className="font-semibold uppercase tracking-wide">
                {w.severity === "hard" ? "🚫 Hard" : "⚠ Soft"}
              </span>{" "}
              {w.message}
            </div>
          ))}

          {hasHardWarning(warnings) && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="acceptedHardWarnings"
                checked={acceptedHardWarnings}
                onChange={(e) => setAcceptedHardWarnings(e.currentTarget.checked)}
                className="h-4 w-4 rounded border-neutral-300"
              />
              I know — apply anyway.
            </label>
          )}
        </div>
      )}

      <details className="rounded border border-neutral-200 p-3 text-sm">
        <summary className="cursor-pointer font-medium">Optional: weather + notes</summary>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Temp (°F)</span>
            <input
              name="weatherTempF"
              type="number"
              step="0.1"
              className="w-full rounded border border-neutral-300 px-2 py-2 text-sm focus:border-neutral-900 focus:outline-none"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-sm font-medium">Weather notes</span>
            <input
              name="weatherNotes"
              className="w-full rounded border border-neutral-300 px-2 py-2 text-sm focus:border-neutral-900 focus:outline-none"
            />
          </label>
          <label className="block sm:col-span-3">
            <span className="mb-1 block text-sm font-medium">Notes</span>
            <textarea
              name="notes"
              rows={2}
              className="w-full rounded border border-neutral-300 px-2 py-2 text-sm focus:border-neutral-900 focus:outline-none"
            />
          </label>
        </div>
      </details>

      {error && <p className="text-sm text-red-700">{error}</p>}

      <button
        type="submit"
        disabled={pending || blocked || !computation?.ok}
        className="w-full rounded bg-neutral-900 py-3 text-sm font-medium text-white disabled:opacity-60 sm:w-auto sm:px-6"
      >
        {pending ? "Logging…" : blocked ? "Override required" : "Confirm + log"}
      </button>
    </form>
  );
}

function ResultPanel({
  computation,
  isGranular,
  cost,
}: {
  computation:
    | { ok: true; mode: "granular"; plan: ReturnType<typeof planGranular> }
    | { ok: true; mode: "liquid"; plan: ReturnType<typeof planLiquid> }
    | { ok: false; error: string }
    | null;
  isGranular: boolean;
  cost: number | null;
}) {
  if (!computation) {
    return (
      <div className="rounded border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-500">
        Enter a target rate to see the plan.
      </div>
    );
  }
  if (!computation.ok) {
    return (
      <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
        {computation.error}
      </div>
    );
  }

  const plan = computation.plan;

  return (
    <div className="space-y-2 rounded border border-neutral-300 bg-white p-3 text-sm">
      {isGranular && "productLbPer1k" in plan ? (
        <div className="text-base font-medium">
          Apply <strong>{plan.totalProductLb.toFixed(2)} lb</strong> of product (
          {plan.productLbPer1k.toFixed(2)} lb / 1k).
        </div>
      ) : "totalProductFlOz" in plan ? (
        <div className="text-base font-medium">
          Mix <strong>{plan.totalProductFlOz.toFixed(2)} fl oz</strong> of product
          {" — "}
          {plan.productFlOzPerGalCarrier.toFixed(2)} fl oz / gal carrier.
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 pt-1 text-xs sm:grid-cols-4">
        {(["N", "P", "K", "Ca", "Mg", "S", "Fe", "Mn", "Zn", "Cu", "B", "Na"] as const)
          .filter((n) => plan.delivered[n] > 0)
          .map((n) => (
            <div key={n} className="flex justify-between">
              <span className="text-neutral-500">{n}</span>
              <span className="tabular-nums">{plan.delivered[n].toFixed(3)} lb</span>
            </div>
          ))}
      </div>

      {!isGranular && "belowFoliarMinimum" in plan && plan.belowFoliarMinimum && (
        <div className="text-xs text-amber-700">
          Carrier is below 1 gal / 1k sq ft — most foliars want at least that. Consider doubling.
        </div>
      )}

      {cost != null && (
        <div className="border-t border-neutral-200 pt-2 text-sm">
          Cost: <strong>${cost.toFixed(2)}</strong>
        </div>
      )}
    </div>
  );
}

function approxPkgSizeLb(unit: string, value: number, density: number | null | undefined): number {
  switch (unit) {
    case "lb":
      return value;
    case "oz_wt":
      return value / 16;
    case "gal":
      return density != null ? value * density : 0;
    case "fl_oz":
      return density != null ? (value / 128) * density : 0;
    default:
      return 0;
  }
}
