import type { UseFormRegisterReturn } from "react-hook-form";
import type { LookupRow } from "@/lib/lookup-helpers";

/**
 * Lookup-driven select for react-hook-form. The empty option always
 * renders as "—" (single label across required + optional fields so
 * they don't look mismatched side-by-side). Selectability of the
 * empty option tracks `required`:
 *
 *   - required=true  → empty option is `disabled` (placeholder only;
 *     can't be reselected after a real pick).
 *   - required=false → empty option stays selectable so the user can
 *     unset an optional value.
 *
 * Validation comes from the form's Zod schema, not from props. The
 * `error` prop just renders the resulting message.
 */
export function Select({
  label,
  error,
  registration,
  options,
  required,
}: {
  label: string;
  error?: string;
  registration: UseFormRegisterReturn;
  options: LookupRow[];
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <select
        {...registration}
        aria-invalid={error ? "true" : undefined}
        className="w-full rounded border border-neutral-300 bg-white px-2 py-2 text-sm focus:border-neutral-900 focus:outline-none aria-invalid:border-red-400"
      >
        <option value="" disabled={required}>
          —
        </option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </label>
  );
}
