import { z } from "zod";
import { passwordSchema } from "@/lib/auth/password-policy";

/**
 * Shared validation schemas for the profile page. Used by both the
 * client RHF resolver and the server action's authoritative re-parse.
 *
 * Kept side-by-side rather than split because the profile page mounts
 * both forms (identity + password) and they're conceptually one screen.
 *
 * `defaultPropertyId` is an empty string when the user wants no default;
 * the action collapses it to null at the write boundary. `unitSystem` is
 * a closed set — narrowing to a literal union keeps the select honest.
 */

export const UNIT_SYSTEM_VALUES = ["imperial", "metric"] as const;
export type UnitSystem = (typeof UNIT_SYSTEM_VALUES)[number];

export const profileFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120, "Max 120 characters"),
  displayName: z.string().trim().max(120, "Max 120 characters"),
  defaultPropertyId: z.string().trim().max(64, "Invalid property"),
  unitSystem: z.enum(UNIT_SYSTEM_VALUES),
});

export type ProfileFormValues = z.infer<typeof profileFormSchema>;

/**
 * Confirm-field check runs as a `.refine` on the object so RHF can
 * surface it on the `confirmPassword` field rather than at the form
 * root. The current-password value is opaque here — Better-Auth's
 * `changePassword` endpoint verifies it server-side.
 */
export const passwordChangeFormSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords don't match",
  });

export type PasswordChangeFormValues = z.infer<typeof passwordChangeFormSchema>;
