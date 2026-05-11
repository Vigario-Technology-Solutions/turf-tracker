/**
 * Dev seed scenario: realistic populated household for exercising the
 * "What's next?" home view + rules engine end-to-end.
 *
 * Idempotent — re-runs delete the seed user's existing properties +
 * products (FK cascades clean up areas / soil tests / applications /
 * irrigation events) and recreate from scratch.
 *
 * Run:   npm run seed:household
 * Sign in as: seed-household@dev.local / Seed-Household-Dev-2026!
 *
 * Scenario shape — each rule fires on at least one area:
 *   - "Main residence" (default property)
 *       Backyard turf  (3,318 sq ft, MP rotators, 240 ppm Na tap)
 *         → leaching_due URGENT (last cycle 60d ago, threshold 45d)
 *         → gypsum_maintenance_due RECOMMENDED (last Ca app 200d ago)
 *         → pgr_cycle_due RECOMMENDED (last PGR 25d ago, cadence 21d)
 *       Front lawn (1,200 sq ft, fixed spray)
 *         → soil_test_stale INFORMATIONAL (test 14 months old)
 *         → leaching_due RECOMMENDED (last cycle 32d ago)
 *       Vegetable bed (200 sq ft, drip)
 *         → all clear
 *       Front oak (314 sq ft canopy, bubbler)
 *         → soil_test_stale RECOMMENDED (never tested)
 *   - "Rental #1"
 *       Backyard turf (2,500 sq ft)
 *         → all clear (recent leaching, recent gypsum, recent PGR)
 *
 * Numbers are plausible-not-precise. The goal is to make every rule
 * branch surface in the UI so the home page is testable.
 */

import {
  AREA_TYPE_BED,
  AREA_TYPE_TREE,
  AREA_TYPE_TURF,
  HEAD_TYPE_BUBBLER,
  HEAD_TYPE_DRIP,
  HEAD_TYPE_MP_ROTATOR,
  HEAD_TYPE_SPRAY,
  IRRIGATION_TAP,
  MFG_RATE_BASIS_SQFT,
  PRODUCT_FORM_GRANULAR_PELLETIZED,
  PRODUCT_FORM_LIQUID_CONCENTRATE,
  ROLE_OWNER,
  TAG_PGR,
  UNIT_FL_OZ,
  UNIT_LB,
} from "../../src/lib/constants";
import { hashPassword } from "../../src/lib/auth/password";
import prisma from "../../src/lib/db";

const SEED_EMAIL = "seed-household@dev.local";
const SEED_PASSWORD = "Seed-Household-Dev-2026!";

// Reference instant — every "X days ago" computed off this. Held
// constant within a single run so dependent timestamps stay coherent.
const NOW = new Date();
const day = (n: number): Date => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

// Na deposition per src/lib/calc/soil.ts:
//   na_lb = inches * (area_sqft / 1000) * water_na_ppm * 0.0052
function naLbDeposited(inches: number, areaSqFt: number, waterNaPpm: number): number {
  return inches * (areaSqFt / 1000) * waterNaPpm * 0.0052;
}

async function main(): Promise<void> {
  // ─────────────────────────────────────────────────────────────────
  // 1. Seed user (find-or-create with credential Account)
  // ─────────────────────────────────────────────────────────────────
  let user = await prisma.user.findUnique({ where: { email: SEED_EMAIL } });
  if (!user) {
    const hash = await hashPassword(SEED_PASSWORD);
    user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          email: SEED_EMAIL,
          name: "Seed Household",
          displayName: "Seed",
          emailVerified: true,
        },
      });
      await tx.account.create({
        data: {
          userId: u.id,
          accountId: SEED_EMAIL,
          providerId: "credential",
          password: hash,
        },
      });
      return u;
    });
    console.log(`✓ Created seed user ${SEED_EMAIL} / ${SEED_PASSWORD}`);
  } else {
    console.log(`✓ Reusing seed user ${SEED_EMAIL}`);
  }

  // ─────────────────────────────────────────────────────────────────
  // 2. Wipe prior seed data (idempotent re-run)
  //    Property delete cascades to Area → SoilTest / Application /
  //    IrrigationEvent. PropertyMember cascades on user delete (we
  //    keep the user). Products owned by the user are deleted in a
  //    second pass — Application.productId is not cascade, but all
  //    applications were just deleted via property cascade.
  // ─────────────────────────────────────────────────────────────────
  await prisma.user.update({ where: { id: user.id }, data: { defaultPropertyId: null } });
  const wipedProps = await prisma.property.deleteMany({ where: { createdByUserId: user.id } });
  const wipedProducts = await prisma.product.deleteMany({ where: { createdByUserId: user.id } });
  console.log(`  wiped ${wipedProps.count} properties (cascade) + ${wipedProducts.count} products`);

  // ─────────────────────────────────────────────────────────────────
  // 3. Lookups — load once, index by code
  // ─────────────────────────────────────────────────────────────────
  const [areaTypes, irrSources, headTypes, productForms, appUnits, mfgBases] = await Promise.all([
    prisma.areaType.findMany(),
    prisma.irrigationSource.findMany(),
    prisma.irrigationHeadType.findMany(),
    prisma.productForm.findMany(),
    prisma.applicationUnit.findMany(),
    prisma.mfgRateBasis.findMany(),
  ]);
  const lookupId = <T extends { code: string; id: number }>(rows: T[], code: string): number => {
    const row = rows.find((r) => r.code === code);
    if (!row) throw new Error(`Lookup miss: ${code}`);
    return row.id;
  };

  const AREA_TURF = lookupId(areaTypes, AREA_TYPE_TURF);
  const AREA_BED = lookupId(areaTypes, AREA_TYPE_BED);
  const AREA_TREE = lookupId(areaTypes, AREA_TYPE_TREE);
  const IRR_TAP = lookupId(irrSources, IRRIGATION_TAP);
  const HEAD_MP = lookupId(headTypes, HEAD_TYPE_MP_ROTATOR);
  const HEAD_FIXED = lookupId(headTypes, HEAD_TYPE_SPRAY);
  const HEAD_DRIP_ID = lookupId(headTypes, HEAD_TYPE_DRIP);
  const HEAD_BUBBLER_ID = lookupId(headTypes, HEAD_TYPE_BUBBLER);
  const FORM_GRANULAR = lookupId(productForms, PRODUCT_FORM_GRANULAR_PELLETIZED);
  const FORM_LIQUID = lookupId(productForms, PRODUCT_FORM_LIQUID_CONCENTRATE);
  const UNIT_LB_ID = lookupId(appUnits, UNIT_LB);
  const UNIT_FL_OZ_ID = lookupId(appUnits, UNIT_FL_OZ);
  const BASIS_SQFT = lookupId(mfgBases, MFG_RATE_BASIS_SQFT);

  // ─────────────────────────────────────────────────────────────────
  // 4. Products — four canonical entries that cover the rule surface
  // ─────────────────────────────────────────────────────────────────
  const fert32 = await prisma.product.create({
    data: {
      createdByUserId: user.id,
      brand: "Yara",
      name: "Premium 32-0-7",
      formId: FORM_GRANULAR,
      nPct: 32,
      k2oPct: 7,
      pkgSizeValue: 50,
      pkgSizeUnitId: UNIT_LB_ID,
      pkgCostUsd: 65,
      mfgRateValue: 4.5,
      mfgRateUnitId: UNIT_LB_ID,
      mfgRatePerValue: 1000,
      mfgRateBasisId: BASIS_SQFT,
      tags: [],
    },
  });

  const gypsum = await prisma.product.create({
    data: {
      createdByUserId: user.id,
      brand: "Pennington",
      name: "Pelletized Gypsum",
      formId: FORM_GRANULAR,
      caPct: 22,
      sPct: 17,
      pkgSizeValue: 40,
      pkgSizeUnitId: UNIT_LB_ID,
      pkgCostUsd: 12,
      mfgRateValue: 25,
      mfgRateUnitId: UNIT_LB_ID,
      mfgRatePerValue: 1000,
      mfgRateBasisId: BASIS_SQFT,
      tags: [],
    },
  });

  const primo = await prisma.product.create({
    data: {
      createdByUserId: user.id,
      brand: "Syngenta",
      name: "Primo Maxx",
      formId: FORM_LIQUID,
      densityLbPerGal: 9.6,
      pkgSizeValue: 1,
      pkgSizeUnitId: lookupId(appUnits, "gal"),
      pkgCostUsd: 220,
      mfgRateValue: 0.4,
      mfgRateUnitId: UNIT_FL_OZ_ID,
      mfgRatePerValue: 1000,
      mfgRateBasisId: BASIS_SQFT,
      tags: [TAG_PGR],
    },
  });

  const kmag = await prisma.product.create({
    data: {
      createdByUserId: user.id,
      brand: "Mosaic",
      name: "K-Mag (Sul-Po-Mag)",
      formId: FORM_GRANULAR,
      k2oPct: 22,
      mgPct: 10.8,
      sPct: 22,
      pkgSizeValue: 50,
      pkgSizeUnitId: UNIT_LB_ID,
      pkgCostUsd: 40,
      mfgRateValue: 5,
      mfgRateUnitId: UNIT_LB_ID,
      mfgRatePerValue: 1000,
      mfgRateBasisId: BASIS_SQFT,
      tags: [],
    },
  });

  console.log(`  created 4 products`);

  // ─────────────────────────────────────────────────────────────────
  // 5. Properties + memberships + areas + soil tests
  // ─────────────────────────────────────────────────────────────────
  const main_ = await prisma.property.create({
    data: {
      name: "Main residence",
      address: "123 Main St, Anytown, CA",
      notes: "Bermuda lawn, mixed beds, one mature oak.",
      createdByUserId: user.id,
    },
  });
  const rental = await prisma.property.create({
    data: {
      name: "Rental #1",
      address: "456 Oak Ave, Anytown, CA",
      notes: "Single backyard turf area; tenant handles mowing.",
      createdByUserId: user.id,
    },
  });

  await prisma.propertyMember.createMany({
    data: [
      { propertyId: main_.id, userId: user.id, role: ROLE_OWNER },
      { propertyId: rental.id, userId: user.id, role: ROLE_OWNER },
    ],
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { defaultPropertyId: main_.id },
  });

  // Areas — capture ids in a typed shape so the rest of the script
  // stays compile-checked against them.
  const backyard = await prisma.area.create({
    data: {
      propertyId: main_.id,
      name: "Backyard turf",
      areaSqFt: 3318,
      areaTypeId: AREA_TURF,
      cropOrSpecies: "Bermuda (common)",
      irrigationSourceId: IRR_TAP,
      waterNaPpm: 240,
      precipRateInPerHr: 0.6,
      headTypeId: HEAD_MP,
    },
  });

  const frontLawn = await prisma.area.create({
    data: {
      propertyId: main_.id,
      name: "Front lawn",
      areaSqFt: 1200,
      areaTypeId: AREA_TURF,
      cropOrSpecies: "Bermuda (common)",
      irrigationSourceId: IRR_TAP,
      waterNaPpm: 240,
      precipRateInPerHr: 1.2,
      headTypeId: HEAD_FIXED,
    },
  });

  const vegBed = await prisma.area.create({
    data: {
      propertyId: main_.id,
      name: "Vegetable bed",
      areaSqFt: 200,
      areaTypeId: AREA_BED,
      cropOrSpecies: "Tomato / pepper rotation",
      irrigationSourceId: IRR_TAP,
      waterNaPpm: 240,
      precipRateInPerHr: 2.0,
      headTypeId: HEAD_DRIP_ID,
    },
  });

  const oakTree = await prisma.area.create({
    data: {
      propertyId: main_.id,
      name: "Front oak (canopy)",
      areaSqFt: 314,
      areaTypeId: AREA_TREE,
      cropOrSpecies: "Quercus agrifolia (~25 ft canopy)",
      irrigationSourceId: IRR_TAP,
      waterNaPpm: 240,
      precipRateInPerHr: 0.5,
      headTypeId: HEAD_BUBBLER_ID,
    },
  });

  const rentalBack = await prisma.area.create({
    data: {
      propertyId: rental.id,
      name: "Backyard turf",
      areaSqFt: 2500,
      areaTypeId: AREA_TURF,
      cropOrSpecies: "Bermuda (common)",
      irrigationSourceId: IRR_TAP,
      waterNaPpm: 240,
      precipRateInPerHr: 0.8,
      headTypeId: HEAD_MP,
    },
  });

  console.log(`  created 2 properties + 5 areas`);

  // ─────────────────────────────────────────────────────────────────
  // 6. Soil tests — mix of fresh / stale / never-tested
  //    Backyard turf: 8 mo old   → ok
  //    Front lawn:    14 mo old  → soil_test_stale informational
  //    Vegetable bed: 3 mo old   → ok
  //    Front oak:     no test    → soil_test_stale recommended
  //    Rental back:   6 mo old   → ok
  //    Soil P intentionally HIGH per CLAUDE.md (P-containing
  //    recommendations are guardrail-blocked).
  // ─────────────────────────────────────────────────────────────────
  const soilFor = (areaId: string, monthsAgo: number) =>
    prisma.soilTest.create({
      data: {
        areaId,
        testDate: day(monthsAgo * 30.4375),
        lab: "WLA Labs",
        pH: 6.4,
        nPpm: 12,
        pPpm: 285, // 7× optimal — triggers P guardrail on any P-containing product
        kPpm: 180,
        sPpm: 35,
        caPpm: 2200,
        mgPpm: 320,
        naPpm: 285,
        cecMeq100g: 15.2,
        omPct: 2.8,
      },
    });

  const backyardSoil = await soilFor(backyard.id, 8);
  const frontLawnSoil = await soilFor(frontLawn.id, 14);
  const vegBedSoil = await soilFor(vegBed.id, 3);
  const rentalSoil = await soilFor(rentalBack.id, 6);

  await prisma.area.update({
    where: { id: backyard.id },
    data: { currentSoilTestId: backyardSoil.id },
  });
  await prisma.area.update({
    where: { id: frontLawn.id },
    data: { currentSoilTestId: frontLawnSoil.id },
  });
  await prisma.area.update({
    where: { id: vegBed.id },
    data: { currentSoilTestId: vegBedSoil.id },
  });
  await prisma.area.update({
    where: { id: rentalBack.id },
    data: { currentSoilTestId: rentalSoil.id },
  });
  // oakTree intentionally left without a soil test.

  console.log(`  created 4 soil tests (oak deliberately untested)`);

  // ─────────────────────────────────────────────────────────────────
  // 7. Applications — built to fire the rules engine deterministically
  // ─────────────────────────────────────────────────────────────────
  type AppArgs = {
    areaId: string;
    areaSqFt: number;
    product: { id: string; name: string };
    daysAgo: number;
    amountValue: number;
    amountUnitId: number;
    deliveredCaLb?: number;
    deliveredNLb?: number;
    deliveredKLb?: number;
    deliveredSLb?: number;
    deliveredMgLb?: number;
    costUsd: number;
    notes?: string;
  };

  const applyApp = (a: AppArgs) =>
    prisma.application.create({
      data: {
        areaId: a.areaId,
        productId: a.product.id,
        appliedAt: day(a.daysAgo),
        appliedByUserId: user.id,
        amountValue: a.amountValue,
        amountUnitId: a.amountUnitId,
        costUsdSnapshot: a.costUsd,
        deliveredCaLb: a.deliveredCaLb ?? 0,
        deliveredNLb: a.deliveredNLb ?? 0,
        deliveredKLb: a.deliveredKLb ?? 0,
        deliveredSLb: a.deliveredSLb ?? 0,
        deliveredMgLb: a.deliveredMgLb ?? 0,
        notes: a.notes,
      },
    });

  // Backyard turf — last Ca app 200 days ago (triggers gypsum cadence),
  // last PGR 25 days ago (triggers pgr cadence). Plus background fert.
  await applyApp({
    areaId: backyard.id,
    areaSqFt: 3318,
    product: gypsum,
    daysAgo: 200,
    amountValue: 83,
    amountUnitId: UNIT_LB_ID,
    deliveredCaLb: 83 * 0.22,
    deliveredSLb: 83 * 0.17,
    costUsd: 25,
    notes: "Defensive Ca maintenance.",
  });
  await applyApp({
    areaId: backyard.id,
    areaSqFt: 3318,
    product: fert32,
    daysAgo: 90,
    amountValue: 15,
    amountUnitId: UNIT_LB_ID,
    deliveredNLb: 15 * 0.32,
    deliveredKLb: 15 * 0.07 * 0.83,
    costUsd: 20,
  });
  await applyApp({
    areaId: backyard.id,
    areaSqFt: 3318,
    product: primo,
    daysAgo: 25,
    amountValue: 1.3,
    amountUnitId: UNIT_FL_OZ_ID,
    costUsd: 14,
    notes: "PGR — Primo Maxx, ~0.4 fl oz/k.",
  });

  // Front lawn — recent gypsum (no gypsum cadence), no PGR (no pgr
  // cadence on this area).
  await applyApp({
    areaId: frontLawn.id,
    areaSqFt: 1200,
    product: gypsum,
    daysAgo: 30,
    amountValue: 30,
    amountUnitId: UNIT_LB_ID,
    deliveredCaLb: 30 * 0.22,
    deliveredSLb: 30 * 0.17,
    costUsd: 9,
  });
  await applyApp({
    areaId: frontLawn.id,
    areaSqFt: 1200,
    product: fert32,
    daysAgo: 60,
    amountValue: 5.4,
    amountUnitId: UNIT_LB_ID,
    deliveredNLb: 5.4 * 0.32,
    deliveredKLb: 5.4 * 0.07 * 0.83,
    costUsd: 7,
  });

  // Vegetable bed — K-Mag for season prep, no Ca → gypsum cadence
  // shows "no Ca on record" (informational only, not pushed).
  await applyApp({
    areaId: vegBed.id,
    areaSqFt: 200,
    product: kmag,
    daysAgo: 45,
    amountValue: 1,
    amountUnitId: UNIT_LB_ID,
    deliveredKLb: 1 * 0.22 * 0.83,
    deliveredMgLb: 1 * 0.108,
    deliveredSLb: 1 * 0.22,
    costUsd: 1,
  });

  // Rental backyard — recent gypsum + recent PGR + recent fert. All clear.
  await applyApp({
    areaId: rentalBack.id,
    areaSqFt: 2500,
    product: gypsum,
    daysAgo: 45,
    amountValue: 63,
    amountUnitId: UNIT_LB_ID,
    deliveredCaLb: 63 * 0.22,
    deliveredSLb: 63 * 0.17,
    costUsd: 19,
  });
  await applyApp({
    areaId: rentalBack.id,
    areaSqFt: 2500,
    product: primo,
    daysAgo: 15,
    amountValue: 1,
    amountUnitId: UNIT_FL_OZ_ID,
    costUsd: 11,
  });

  console.log(`  created 8 applications across 5 areas`);

  // ─────────────────────────────────────────────────────────────────
  // 8. Irrigation events — drive the salt clock + leaching cadence
  //    Backyard: leaching 60d ago → urgent
  //    Front:    leaching 32d ago → recommended
  //    Rental:   leaching 15d ago → ok
  //    Veg bed + oak: no leaching cycles (drip / tree-bubbler — out
  //    of the salt-clock model entirely).
  // ─────────────────────────────────────────────────────────────────
  const leaching = async (
    areaId: string,
    areaSqFt: number,
    daysAgo: number,
    inches: number,
  ): Promise<void> => {
    await prisma.irrigationEvent.create({
      data: {
        areaId,
        eventAt: day(daysAgo),
        runtimeMin: Math.round((inches / 0.6) * 60),
        inchesApplied: inches,
        gallons: inches * (areaSqFt / 1000) * 623.4,
        naLbDeposited: naLbDeposited(inches, areaSqFt, 240),
        isLeachingCycle: true,
        recordedByUserId: user.id,
        notes: "Leaching cycle (1.5× normal volume).",
      },
    });
  };

  await leaching(backyard.id, 3318, 60, 1.8);
  await leaching(frontLawn.id, 1200, 32, 1.5);
  await leaching(rentalBack.id, 2500, 15, 1.6);

  // A few regular waterings too so areas don't look totally bare.
  const watering = async (
    areaId: string,
    areaSqFt: number,
    daysAgo: number,
    inches: number,
  ): Promise<void> => {
    await prisma.irrigationEvent.create({
      data: {
        areaId,
        eventAt: day(daysAgo),
        runtimeMin: Math.round((inches / 0.6) * 60),
        inchesApplied: inches,
        gallons: inches * (areaSqFt / 1000) * 623.4,
        naLbDeposited: naLbDeposited(inches, areaSqFt, 240),
        isLeachingCycle: false,
        recordedByUserId: user.id,
      },
    });
  };

  for (const d of [3, 6, 10, 14, 18, 22]) {
    await watering(backyard.id, 3318, d, 0.8);
  }
  for (const d of [4, 8, 12, 18]) {
    await watering(frontLawn.id, 1200, d, 0.7);
  }
  for (const d of [2, 5, 8, 12, 16, 20]) {
    await watering(rentalBack.id, 2500, d, 0.7);
  }

  console.log(`  created 3 leaching cycles + 16 regular irrigation events`);

  // ─────────────────────────────────────────────────────────────────
  // 9. Summary
  // ─────────────────────────────────────────────────────────────────
  console.log("");
  console.log("✓ Seed household ready.");
  console.log("");
  console.log(`  Sign in:  ${SEED_EMAIL}`);
  console.log(`  Password: ${SEED_PASSWORD}`);
  console.log("");
  console.log("  Expect on /:");
  console.log("    Main residence → Backyard turf (urgent: leaching, gypsum due, PGR due)");
  console.log("    Main residence → Front lawn   (attention: leaching, stale soil test)");
  console.log("    Main residence → Vegetable bed (ok)");
  console.log("    Main residence → Front oak    (attention: never tested)");
  console.log("    Rental #1     → Backyard turf (ok)");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
