import { z } from "zod";

/**
 * Area create + edit form schema. Used by both the client form (RHF +
 * zodResolver) and the server action (re-validation).
 *
 * Numeric fields use `z.coerce.number()` so the schema works on either
 * the raw HTML string a form input produces OR a real number — handy
 * because the server re-runs `safeParse` against the resolver's
 * already-typed output and Number(<number>) is a no-op.
 *
 * Optional numeric fields (waterNaPpm, precipRateInPerHr, headTypeId)
 * accept blank input to mean "no value" — handled in the action by
 * coercing 0 / empty string into null at write time.
 */
export const areaFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80, "Max 80 characters"),
  areaSqFt: z.coerce
    .number({ message: "Required" })
    .int("Whole number")
    .positive("Must be greater than 0")
    .max(10_000_000),
  areaTypeId: z.coerce.number({ message: "Type is required" }).int().positive("Type is required"),
  irrigationSourceId: z.coerce
    .number({ message: "Irrigation source is required" })
    .int()
    .positive("Irrigation source is required"),
  cropOrSpecies: z.string().trim().max(120, "Max 120 characters"),
  waterNaPpm: optionalNonNegativeString(),
  precipRateInPerHr: optionalNonNegativeString(),
  headTypeId: z.string(),
  notes: z.string().trim().max(2000, "Max 2,000 characters"),
});

/** Pre-validation shape — what the form fields hold (strings everywhere). */
export type AreaFormInput = z.input<typeof areaFormSchema>;
/** Post-validation shape — what the action receives (numerics coerced). */
export type AreaFormOutput = z.output<typeof areaFormSchema>;

/**
 * Empty-or-non-negative-numeric string. Used for optional numeric
 * inputs — the form passes "" when blank, otherwise a parseable
 * number. The action turns "" into null at write time.
 */
function optionalNonNegativeString() {
  return z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d+(\.\d+)?$/.test(v), "Must be a number")
    .refine((v) => v === "" || Number(v) >= 0, "Must be ≥ 0");
}
