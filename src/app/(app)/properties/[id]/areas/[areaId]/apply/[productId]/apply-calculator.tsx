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
import { compassFromDeg, type WeatherSummary } from "@/lib/weather";
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
  /** Resolved code (e.g. "lb"), not the FK id — keeps the client free of the lookup table. */
  pkgSizeUnitCode: string;
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
  weather,
  weatherDefaults,
  propertyHasCoords,
}: {
  action: (form: FormData) => Promise<ActionResult<unknown>>;
  area: AreaShape;
  product: ProductShape;
  soilTest: SoilShape | null;
  isGranular: boolean;
  weather: WeatherSummary | null;
  weatherDefaults: { tempF: number | null; notes: string } | null;
  propertyHasCoords: boolean;
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
    const lb = approxPkgSizeLb(
      product.pkgSizeUnitCode,
      product.pkgSizeValue,
      product.densityLbPerGal,
    );
    if (lb <= 0) return null;
    return (product.pkgCostUsd / lb) * computation.plan.totalProductLb;
  }, [
    computation,
    product.densityLbPerGal,
    product.pkgCostUsd,
    product.pkgSizeUnitCode,
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

      <WeatherPanel
        weather={weather}
        weatherDefaults={weatherDefaults}
        propertyHasCoords={propertyHasCoords}
      />

      <label className="block">
        <span className="mb-1 block text-sm font-medium">Notes (optional)</span>
        <textarea
          name="notes"
          rows={2}
          className="w-full rounded border border-neutral-300 px-2 py-2 text-sm focus:border-neutral-900 focus:outline-none"
        />
      </label>

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

/**
 * Weather panel: shows the auto-fetched current conditions + today's
 * forecast outline. The actual posted form values come from `weatherTempF`
 * + `weatherNotes` inputs (prefilled from the auto-fetch); manual edits
 * win. When the property has no coordinates, the panel falls back to
 * the bare manual inputs with a one-line "add address to enable" hint.
 */
function WeatherPanel({
  weather,
  weatherDefaults,
  propertyHasCoords,
}: {
  weather: WeatherSummary | null;
  weatherDefaults: { tempF: number | null; notes: string } | null;
  propertyHasCoords: boolean;
}) {
  // Show the observation's wall time rather than "X min ago" — `Date.now()`
  // in render is flagged impure (and would drift between server + client
  // hydration anyway). The user sees "observed 14:42 PT" and can judge
  // freshness against the local clock.
  const observedLabel = weather?.observedAt
    ? new Date(weather.observedAt).toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      })
    : null;

  return (
    <fieldset className="rounded border border-neutral-200 p-3">
      <legend className="px-1 text-xs uppercase tracking-wide text-neutral-500">Weather</legend>

      {weather ? (
        <div className="space-y-2 text-sm">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
            <Stat label="Temp" value={weather.tempF != null ? `${weather.tempF}°F` : "—"} />
            <Stat
              label="Humidity"
              value={weather.humidityPct != null ? `${weather.humidityPct}%` : "—"}
            />
            <Stat
              label="Wind"
              value={
                weather.windMph != null
                  ? `${weather.windMph} mph${compassFromDeg(weather.windDirDeg) ? " " + compassFromDeg(weather.windDirDeg) : ""}`
                  : "—"
              }
            />
            <Stat label="Conditions" value={weather.conditions ?? "—"} />
            <Stat
              label="Today H/L"
              value={
                weather.todayHighF != null || weather.todayLowF != null
                  ? `${weather.todayHighF ?? "—"}° / ${weather.todayLowF ?? "—"}°`
                  : "—"
              }
            />
            <Stat
              label="Precip prob (next)"
              value={weather.precipProbNext6hPct != null ? `${weather.precipProbNext6hPct}%` : "—"}
            />
            <Stat
              label="Dewpoint"
              value={weather.dewpointF != null ? `${weather.dewpointF}°F` : "—"}
            />
            <Stat label="Station" value={weather.stationId ?? "—"} />
          </div>
          <div className="text-xs text-neutral-500">
            via NWS{observedLabel && ` · observed ${observedLabel}`}
          </div>
        </div>
      ) : propertyHasCoords ? (
        <p className="text-sm text-neutral-600">Couldn&apos;t reach NWS — fill in manually.</p>
      ) : (
        <p className="text-sm text-neutral-600">
          Add an address to this property to enable weather autofill.
        </p>
      )}

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Temp at application (°F)</span>
          <input
            name="weatherTempF"
            type="number"
            step="0.1"
            defaultValue={weatherDefaults?.tempF != null ? weatherDefaults.tempF.toString() : ""}
            className="w-full rounded border border-neutral-300 px-2 py-2 text-sm focus:border-neutral-900 focus:outline-none"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm font-medium">Weather notes</span>
          <input
            name="weatherNotes"
            defaultValue={weatherDefaults?.notes ?? ""}
            className="w-full rounded border border-neutral-300 px-2 py-2 text-sm focus:border-neutral-900 focus:outline-none"
          />
        </label>
      </div>
    </fieldset>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-0.5">{value}</div>
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
