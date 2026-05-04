import type { UseFormRegisterReturn } from "react-hook-form";

/**
 * Multi-line input primitive for react-hook-form. Same shape as
 * <Field> — `registration` carries the RHF wiring; `error` triggers
 * the inline message + red border.
 */
export function TextArea({
  label,
  error,
  registration,
  rows = 3,
  placeholder,
}: {
  label: string;
  error?: string;
  registration: UseFormRegisterReturn;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <textarea
        rows={rows}
        placeholder={placeholder}
        {...registration}
        aria-invalid={error ? "true" : undefined}
        className="w-full rounded border border-neutral-300 px-2 py-2 text-sm focus:border-neutral-900 focus:outline-none aria-invalid:border-red-400"
      />
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </label>
  );
}
