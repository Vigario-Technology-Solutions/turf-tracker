import { z } from "zod";

/**
 * Product create + edit form schema.
 *
 * Numeric percent fields use `z.coerce.number()` — same input/output
 * split pattern as the area form. Optional numerics that can be blank
 * (densityLbPerGal, mfgRateValue, mfgRatePerValue, mfgRateUnitId,
 * mfgRateBasisId) use a permissive string with a refine, then the
 * action coerces empty → null.
 *
 * `tags` is the array of strings the form collects from the checkbox
 * group + the free-text "custom tags" input. We accept it as-is; the
 * form's submit handler is responsible for de-duplicating + splitting
 * the custom-text field before calling the action.
 */

const pct = (label: string) =>
  z.coerce
    .number({ message: `${label} must be a number` })
    .min(0)
    .max(100);

const optionalNumberString = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d+(\.\d+)?$/.test(v), "Must be a number")
  .refine((v) => v === "" || Number(v) >= 0, "Must be ≥ 0");

const optionalLookupString = z.string();

export const productFormSchema = z.object({
  brand: z.string().trim().min(1, "Brand is required").max(120),
  name: z.string().trim().min(1, "Product name is required").max(160),
  formId: z.coerce.number({ message: "Form is required" }).int().positive("Form is required"),

  nPct: pct("N"),
  p2o5Pct: pct("P₂O₅"),
  k2oPct: pct("K₂O"),
  caPct: pct("Ca"),
  mgPct: pct("Mg"),
  sPct: pct("S"),
  naPct: pct("Na"),
  fePct: pct("Fe"),
  mnPct: pct("Mn"),
  znPct: pct("Zn"),
  cuPct: pct("Cu"),
  bPct: pct("B"),

  densityLbPerGal: optionalNumberString,

  pkgSizeValue: z.coerce
    .number({ message: "Package size is required" })
    .positive("Package size must be > 0"),
  pkgSizeUnitId: z.coerce
    .number({ message: "Unit is required" })
    .int()
    .positive("Unit is required"),
  pkgCostUsd: z.coerce.number().nonnegative(),

  mfgRateValue: optionalNumberString,
  mfgRateUnitId: optionalLookupString,
  mfgRatePerValue: optionalNumberString,
  mfgRateBasisId: optionalLookupString,

  tags: z.array(z.string().trim().min(1)).default([]),
  customTags: z.string().default(""),
  sharedInHousehold: z.boolean().default(false),

  notes: z.string().trim().max(2000),
});

export type ProductFormInput = z.input<typeof productFormSchema>;
export type ProductFormOutput = z.output<typeof productFormSchema>;
