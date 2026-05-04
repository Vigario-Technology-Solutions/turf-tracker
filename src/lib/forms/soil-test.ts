import { z } from "zod";

/**
 * Soil-test entry form schema. Per SPEC §5.5 every nutrient field is
 * nullable — different labs report different sets — so all numeric
 * fields are optional strings the action coerces to nullable numbers
 * at write time. Only `testDate` is required.
 *
 * Form keeps strings end-to-end (input === output) so the server's
 * `safeParse(values)` round-trips against the same shape RHF emits.
 */

const optionalNonNegativeString = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d+(\.\d+)?$/.test(v), "Must be a number")
  .refine((v) => v === "" || Number(v) >= 0, "Must be ≥ 0");

const optionalString = z.string().trim().max(200, "Max 200 characters");

export const soilTestFormSchema = z.object({
  testDate: z
    .string()
    .min(1, "Test date is required")
    .refine((v) => !isNaN(new Date(v).getTime()), "Invalid date"),
  lab: optionalString,
  labReportId: optionalString,

  pH: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d+(\.\d+)?$/.test(v), "Must be a number")
    .refine((v) => v === "" || (Number(v) >= 0 && Number(v) <= 14), "pH must be between 0 and 14"),

  nPpm: optionalNonNegativeString,
  pPpm: optionalNonNegativeString,
  kPpm: optionalNonNegativeString,
  sPpm: optionalNonNegativeString,
  caPpm: optionalNonNegativeString,
  mgPpm: optionalNonNegativeString,
  naPpm: optionalNonNegativeString,
  fePpm: optionalNonNegativeString,
  mnPpm: optionalNonNegativeString,
  znPpm: optionalNonNegativeString,
  cuPpm: optionalNonNegativeString,
  bPpm: optionalNonNegativeString,

  omPct: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d+(\.\d+)?$/.test(v), "Must be a number")
    .refine((v) => v === "" || (Number(v) >= 0 && Number(v) <= 100), "0–100%"),

  cecMeq100g: optionalNonNegativeString,

  notes: z.string().trim().max(2000, "Max 2,000 characters"),
});

export type SoilTestFormValues = z.infer<typeof soilTestFormSchema>;
