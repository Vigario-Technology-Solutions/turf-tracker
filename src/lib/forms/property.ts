import { z } from "zod";

/**
 * Shared validation schema for the property create + edit form. Used by:
 *   - the client form (`PropertyForm`) via `zodResolver` for inline,
 *     per-field error messages.
 *   - the server action (`createProperty`/`updateProperty`) for the
 *     authoritative re-validation — never trust the client's parse.
 *
 * No `.transform()` calls here so input and output shapes match. RHF's
 * `handleSubmit` hands the resolver's OUTPUT to our action, and the
 * action re-runs `safeParse` against the same schema; a transform
 * would mean the round-trip parses against the wrong shape. Empty-
 * string ⇒ null collapsing for nullable DB columns happens in the
 * action right before the write.
 */
export const propertyFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80, "Max 80 characters"),
  address: z.string().trim().max(200, "Max 200 characters"),
  notes: z.string().trim().max(2000, "Max 2,000 characters"),
});

export type PropertyFormValues = z.infer<typeof propertyFormSchema>;
