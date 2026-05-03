/**
 * Pure helpers + shared types for lookup data. Safe to import from
 * client components — no Prisma, no server dependencies.
 *
 * Server-side resolvers (`getLookups`, `getSerializedLookups`) live in
 * ./lookups.ts and import this module. Client code should always
 * import from here.
 */

export interface LookupRow {
  id: number;
  code: string;
  name: string;
  sortOrder: number;
  active: boolean;
}

/** Find ID by code from a lookup array. Throws if not found. */
export function lookupId(items: Pick<LookupRow, "id" | "code">[], code: string): number {
  const item = items.find((i) => i.code === code);
  if (!item) throw new Error(`Unknown lookup code: "${code}"`);
  return item.id;
}

/** Find display name by ID from a lookup array. Returns "" if not found. */
export function lookupName(
  items: Pick<LookupRow, "id" | "name">[],
  id: number | null | undefined,
): string {
  if (id === null || id === undefined) return "";
  return items.find((i) => i.id === id)?.name ?? "";
}

/** Find code by ID from a lookup array. Returns "" if not found. */
export function lookupCode(
  items: Pick<LookupRow, "id" | "code">[],
  id: number | null | undefined,
): string {
  if (id === null || id === undefined) return "";
  return items.find((i) => i.id === id)?.code ?? "";
}
