import "server-only";
import { unstable_cache } from "next/cache";
import prisma from "./db";
import type { LookupRow } from "./lookup-helpers";

export type { LookupRow } from "./lookup-helpers";
export { lookupId, lookupName, lookupCode } from "./lookup-helpers";

/**
 * Lookup-table resolver — loads every `{ id, code, name, sortOrder,
 * active }` table the app references and exposes id ↔ code ↔ display
 * mappings.
 *
 * Usage:
 *   const lookups = await getLookups();
 *   const turfId = lookups.areaType.id("turf");        // by code
 *   const display = lookups.areaType.displayName(idx); // for UI
 *
 * For prop-passing into client components prefer `getSerializedLookups()`,
 * which returns plain arrays.
 */

export interface LookupMap {
  /** Get ID by code. Throws if not found. */
  id: (code: string) => number;
  /** Get code by ID. Returns "" if not found. */
  code: (id: number | null | undefined) => string;
  /** Get display name by ID. Returns "" if not found. */
  displayName: (id: number | null | undefined) => string;
  /** All rows in sortOrder + id order */
  all: LookupRow[];
  /** Active rows only */
  active: LookupRow[];
}

function buildLookup(rows: LookupRow[]): LookupMap {
  const byCode = new Map(rows.map((r) => [r.code, r.id]));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return {
    id: (code) => {
      const val = byCode.get(code);
      if (val === undefined) throw new Error(`Unknown lookup code: "${code}"`);
      return val;
    },
    code: (id) => (id == null ? "" : (byId.get(id)?.code ?? "")),
    displayName: (id) => (id == null ? "" : (byId.get(id)?.name ?? "")),
    all: rows,
    active: rows.filter((r) => r.active),
  };
}

export interface Lookups {
  areaType: LookupMap;
  irrigationSource: LookupMap;
  productForm: LookupMap;
  applicationUnit: LookupMap;
}

const lookupSelect = {
  id: true,
  code: true,
  name: true,
  sortOrder: true,
  active: true,
} as const;

const lookupOrderBy = [{ sortOrder: "asc" as const }, { id: "asc" as const }];

async function loadLookups(): Promise<Lookups> {
  const [areaTypes, irrigationSources, productForms, applicationUnits] = await Promise.all([
    prisma.areaType.findMany({ select: lookupSelect, orderBy: lookupOrderBy }),
    prisma.irrigationSource.findMany({ select: lookupSelect, orderBy: lookupOrderBy }),
    prisma.productForm.findMany({ select: lookupSelect, orderBy: lookupOrderBy }),
    prisma.applicationUnit.findMany({ select: lookupSelect, orderBy: lookupOrderBy }),
  ]);
  return {
    areaType: buildLookup(areaTypes),
    irrigationSource: buildLookup(irrigationSources),
    productForm: buildLookup(productForms),
    applicationUnit: buildLookup(applicationUnits),
  };
}

/** Cached resolver — revalidates every 60s; invalidate via the "lookups" tag. */
export const getLookups = unstable_cache(loadLookups, ["lookups"], {
  revalidate: 60,
  tags: ["lookups"],
});

export interface SerializedLookups {
  areaType: LookupRow[];
  irrigationSource: LookupRow[];
  productForm: LookupRow[];
  applicationUnit: LookupRow[];
}

/** Plain-array shape suitable for passing as props to client components. */
export async function getSerializedLookups(): Promise<SerializedLookups> {
  const lookups = await getLookups();
  return {
    areaType: lookups.areaType.all,
    irrigationSource: lookups.irrigationSource.all,
    productForm: lookups.productForm.all,
    applicationUnit: lookups.applicationUnit.all,
  };
}
