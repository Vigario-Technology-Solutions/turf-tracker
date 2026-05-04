import type { UseFormRegisterReturn } from "react-hook-form";

/**
 * Text-input primitive for react-hook-form. Pass the result of
 * `register("fieldName")` as `registration`; pass
 * `errors.fieldName?.message` as `error`. Renders a red border + small
 * inline message when error is set.
 *
 * Plain-string registration field name doesn't work — RHF's register
 * call returns `name` + `ref` + `onChange` + `onBlur` packaged so the
 * input is properly tracked. Spread `{...registration}` on the input.
 */
export function Field({
  label,
  hint,
  error,
  registration,
  type = "text",
  placeholder,
  autoComplete,
  autoFocus,
  min,
  max,
  step,
}: {
  label: string;
  /** Optional helper text shown below the label, above any error. */
  hint?: string;
  error?: string;
  registration: UseFormRegisterReturn;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  autoFocus?: boolean;
  min?: number;
  max?: number;
  step?: number | string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <input
        type={type}
        placeholder={placeholder}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        min={min}
        max={max}
        step={step}
        {...registration}
        aria-invalid={error ? "true" : undefined}
        className="w-full rounded border border-neutral-300 px-2 py-2 text-sm focus:border-neutral-900 focus:outline-none aria-invalid:border-red-400"
      />
      {hint && !error && <p className="mt-1 text-xs text-neutral-500">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </label>
  );
}
