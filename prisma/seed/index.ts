/**
 * Seed runner — idempotent upserts for all lookup tables.
 *
 * Schema migrations are schema-only; this script populates the
 * `{ id, code, name, sortOrder, active }` rows that app code
 * references via constants in src/lib/constants.ts.
 *
 * Required in every environment (dev + prod). Runs as a
 * preStartCommand in prod via `prisma db seed` (per prisma.config.ts)
 * which shells to `npx tsx prisma/seed/index.ts`. In the prod
 * artifact context this is pre-compiled to bin/seed.js by
 * scripts/build-seed.ts so it can run via plain `node` without tsx
 * being installed.
 *
 * Adding a new lookup row = add to the relevant array below + add a
 * named constant in src/lib/constants.ts. Never write raw INSERTs in
 * migration SQL.
 */

import { PrismaClient } from "@generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString:
    process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/turf_tracker",
});
const prisma = new PrismaClient({ adapter });

const AREA_TYPES = [
  { code: "turf", name: "Turf", sortOrder: 10 },
  { code: "bed", name: "Garden bed", sortOrder: 20 },
  { code: "tree", name: "Tree", sortOrder: 30 },
  { code: "ornamental", name: "Ornamental", sortOrder: 40 },
  { code: "mixed", name: "Mixed", sortOrder: 50 },
];

const IRRIGATION_SOURCES = [
  { code: "tap", name: "Tap (municipal)", sortOrder: 10 },
  { code: "well", name: "Well", sortOrder: 20 },
  { code: "mixed", name: "Mixed source", sortOrder: 30 },
  { code: "rain", name: "Rainwater", sortOrder: 40 },
  { code: "drip", name: "Drip", sortOrder: 50 },
  { code: "none", name: "None / unirrigated", sortOrder: 60 },
];

const PRODUCT_FORMS = [
  { code: "granular_pelletized", name: "Granular (pelletized)", sortOrder: 10 },
  { code: "granular_powder", name: "Granular (powder)", sortOrder: 20 },
  { code: "liquid_concentrate", name: "Liquid (concentrate)", sortOrder: 30 },
  { code: "liquid_rtu", name: "Liquid (ready-to-use)", sortOrder: 40 },
  { code: "water_soluble_powder", name: "Water-soluble powder", sortOrder: 50 },
];

const APPLICATION_UNITS = [
  { code: "lb", name: "Pounds", sortOrder: 10 },
  { code: "oz_wt", name: "Ounces (weight)", sortOrder: 20 },
  { code: "fl_oz", name: "Fluid ounces", sortOrder: 30 },
  { code: "gal", name: "Gallons", sortOrder: 40 },
];

async function main() {
  for (const row of AREA_TYPES) {
    await prisma.areaType.upsert({ where: { code: row.code }, create: row, update: row });
  }
  for (const row of IRRIGATION_SOURCES) {
    await prisma.irrigationSource.upsert({ where: { code: row.code }, create: row, update: row });
  }
  for (const row of PRODUCT_FORMS) {
    await prisma.productForm.upsert({ where: { code: row.code }, create: row, update: row });
  }
  for (const row of APPLICATION_UNITS) {
    await prisma.applicationUnit.upsert({ where: { code: row.code }, create: row, update: row });
  }

  console.log("✓ Seed complete");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
