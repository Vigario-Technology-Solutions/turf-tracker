/**
 * Lookup row identifiers.
 *
 * Seeded by prisma/seed/index.ts via idempotent upsert by `code`.
 * Use these constants instead of raw integer IDs anywhere in app code.
 *
 * To add a new lookup row: add to prisma/seed/, run `npm run db:seed`,
 * then add the named constant here. Never hardcode raw IDs.
 */

// ─────────────────────────────────────────────────────────────────────
// AreaType codes
// ─────────────────────────────────────────────────────────────────────
export const AREA_TYPE_TURF = "turf" as const;
export const AREA_TYPE_BED = "bed" as const;
export const AREA_TYPE_TREE = "tree" as const;
export const AREA_TYPE_ORNAMENTAL = "ornamental" as const;
export const AREA_TYPE_MIXED = "mixed" as const;

// ─────────────────────────────────────────────────────────────────────
// IrrigationSource codes
// ─────────────────────────────────────────────────────────────────────
export const IRRIGATION_TAP = "tap" as const;
export const IRRIGATION_WELL = "well" as const;
export const IRRIGATION_MIXED = "mixed" as const;
export const IRRIGATION_RAIN = "rain" as const;
export const IRRIGATION_DRIP = "drip" as const;
export const IRRIGATION_NONE = "none" as const;

// ─────────────────────────────────────────────────────────────────────
// ProductForm codes
// ─────────────────────────────────────────────────────────────────────
export const PRODUCT_FORM_GRANULAR_PELLETIZED = "granular_pelletized" as const;
export const PRODUCT_FORM_GRANULAR_POWDER = "granular_powder" as const;
export const PRODUCT_FORM_LIQUID_CONCENTRATE = "liquid_concentrate" as const;
export const PRODUCT_FORM_LIQUID_RTU = "liquid_rtu" as const;
export const PRODUCT_FORM_WATER_SOLUBLE_POWDER = "water_soluble_powder" as const;

// ─────────────────────────────────────────────────────────────────────
// ApplicationUnit codes
// ─────────────────────────────────────────────────────────────────────
export const UNIT_LB = "lb" as const;
export const UNIT_OZ_WT = "oz_wt" as const;
export const UNIT_FL_OZ = "fl_oz" as const;
export const UNIT_GAL = "gal" as const;

// ─────────────────────────────────────────────────────────────────────
// MfgRateBasis codes — the per-X half of "0.5 fl oz per 1,000 sq ft"
// ─────────────────────────────────────────────────────────────────────
export const MFG_RATE_BASIS_1000_SQFT = "1000_sqft" as const;
export const MFG_RATE_BASIS_ACRE = "acre" as const;
export const MFG_RATE_BASIS_GAL_CARRIER = "gal_carrier" as const;

// ─────────────────────────────────────────────────────────────────────
// IrrigationHeadType codes
// ─────────────────────────────────────────────────────────────────────
export const HEAD_TYPE_ROTOR = "rotor" as const;
export const HEAD_TYPE_SPRAY = "spray" as const;
export const HEAD_TYPE_MP_ROTATOR = "mp_rotator" as const;
export const HEAD_TYPE_DRIP = "drip" as const;
export const HEAD_TYPE_BUBBLER = "bubbler" as const;

// ─────────────────────────────────────────────────────────────────────
// Product tag literals (stored in Product.tags string[])
// ─────────────────────────────────────────────────────────────────────
export const TAG_CONTAINS_P = "contains_p" as const;
export const TAG_CONTAINS_B = "contains_b" as const;
export const TAG_CONTAINS_NA = "contains_na" as const;
export const TAG_ACIDIFYING = "acidifying" as const;
export const TAG_PGR = "pgr" as const;
export const TAG_SURFACTANT = "surfactant" as const;
export const TAG_HUMIC = "humic" as const;

// ─────────────────────────────────────────────────────────────────────
// PropertyMember roles
// ─────────────────────────────────────────────────────────────────────
export const ROLE_OWNER = "owner" as const;
export const ROLE_CONTRIBUTOR = "contributor" as const;
export const ROLE_VIEWER = "viewer" as const;

// ─────────────────────────────────────────────────────────────────────
// Recommendation kinds (DiagnosticKind discriminated union values)
// Mirror in src/lib/rules/ when adding new rules.
// ─────────────────────────────────────────────────────────────────────
export const RULE_LEACHING_DUE = "leaching_due" as const;
export const RULE_NUTRIENT_BELOW_TARGET = "nutrient_below_target" as const;
export const RULE_GYPSUM_MAINTENANCE_DUE = "gypsum_maintenance_due" as const;
export const RULE_PGR_CYCLE_DUE = "pgr_cycle_due" as const;
export const RULE_SOIL_TEST_STALE = "soil_test_stale" as const;
export const RULE_SALT_BALANCE_NEGATIVE = "salt_balance_negative" as const;
export const RULE_APPLICATION_OVERLAP = "application_overlap" as const;

// ─────────────────────────────────────────────────────────────────────
// Recommendation priorities
// ─────────────────────────────────────────────────────────────────────
export const PRIORITY_URGENT = "urgent" as const;
export const PRIORITY_RECOMMENDED = "recommended" as const;
export const PRIORITY_INFORMATIONAL = "informational" as const;
