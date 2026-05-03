import type { LookupRow } from "@/lib/lookup-helpers";

/**
 * Canonical lookup-driven select. The empty option always renders as
 * "—" — single label across required + optional fields so they don't
 * look mismatched side-by-side. The selectability of the empty option
 * is tied to `required`:
 *
 *   - required=true  → empty option is `disabled` (acts as a
 *     placeholder; can't be reselected after a real pick).
 *   - required=false → empty option stays selectable so the user can
 *     unset an optional value.
 */
export function Select({
  name,
  label,
  defaultValue,
  options,
  required,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  options: LookupRow[];
  required?: boolean;
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
        <option value="" disabled={required}>
          —
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
