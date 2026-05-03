import Link from "next/link";
import { notFound } from "next/navigation";
import prisma from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/server-session";
import { canAccessArea } from "@/lib/auth/guards";
import {
  ROLE_CONTRIBUTOR,
  PRODUCT_FORM_GRANULAR_PELLETIZED,
  PRODUCT_FORM_GRANULAR_POWDER,
} from "@/lib/constants";
import { getLookups } from "@/lib/lookups";
import { getCachedWeather, summarizeForNotes } from "@/lib/weather";
import { logApplication } from "../_actions";
import { ApplyCalculator } from "./apply-calculator";

interface Props {
  params: Promise<{ id: string; areaId: string; productId: string }>;
}

/**
 * The killer screen. Server side: load the area + product + current
 * soil test (to feed warnings) and check permission. Client side: the
 * `ApplyCalculator` component runs the math live as the user types,
 * shows side-effect warnings, and posts the confirmed plan to
 * `logApplication` for canonical re-validation + persistence.
 */
export default async function ApplyCalculatorPage({ params }: Props) {
  const { id: propertyId, areaId, productId } = await params;
  const user = await requireSessionUser();
  if (!(await canAccessArea(user.id, areaId, ROLE_CONTRIBUTOR))) notFound();

  const [area, product, lookups] = await Promise.all([
    prisma.area.findFirst({
      where: { id: areaId, propertyId },
      include: {
        soilTests: { orderBy: { testDate: "desc" } },
        property: { select: { lat: true, lon: true, address: true } },
      },
    }),
    prisma.product.findUnique({ where: { id: productId } }),
    getLookups(),
  ]);
  if (!area || !product) notFound();
  // Block applying products the caller can't see.
  if (product.createdByUserId !== user.id && !product.sharedInHousehold) notFound();

  const currentSoilTest = area.soilTests.find((t) => t.id === area.currentSoilTestId) ?? null;
  const formCode = lookups.productForm.code(product.formId);
  const isGranular =
    formCode === PRODUCT_FORM_GRANULAR_PELLETIZED || formCode === PRODUCT_FORM_GRANULAR_POWDER;

  // Weather autofill: only when the property has been geocoded. Falls
  // back to manual entry if the NWS lookup fails or returns nothing.
  const weather =
    area.property.lat != null && area.property.lon != null
      ? await getCachedWeather(area.property.lat, area.property.lon)
      : null;
  const weatherDefaults = weather
    ? { tempF: weather.tempF, notes: summarizeForNotes(weather) }
    : null;

  const action = logApplication.bind(null, propertyId, areaId);

  return (
    <div className="space-y-4">
      <div>
        <Link
          href={`/properties/${propertyId}/areas/${areaId}/apply`}
          className="text-sm text-neutral-600 hover:underline"
        >
          ← Pick a different product
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">
          Apply: {product.brand} — {product.name}
        </h1>
        <p className="mt-1 text-sm text-neutral-600">
          to {area.name} ({area.areaSqFt.toLocaleString()} sq ft) ·{" "}
          {lookups.productForm.displayName(product.formId)}
        </p>
      </div>

      <ApplyCalculator
        action={action}
        area={{ id: area.id, name: area.name, areaSqFt: area.areaSqFt }}
        weather={weather}
        weatherDefaults={weatherDefaults}
        propertyHasCoords={area.property.lat != null && area.property.lon != null}
        product={{
          id: product.id,
          brand: product.brand,
          name: product.name,
          tags: product.tags,
          nPct: product.nPct,
          p2o5Pct: product.p2o5Pct,
          k2oPct: product.k2oPct,
          caPct: product.caPct,
          mgPct: product.mgPct,
          sPct: product.sPct,
          naPct: product.naPct,
          fePct: product.fePct,
          mnPct: product.mnPct,
          znPct: product.znPct,
          cuPct: product.cuPct,
          bPct: product.bPct,
          densityLbPerGal: product.densityLbPerGal,
          pkgSizeUnit: product.pkgSizeUnit,
          pkgSizeValue: product.pkgSizeValue,
          pkgCostUsd: product.pkgCostUsd,
        }}
        soilTest={
          currentSoilTest && {
            pH: currentSoilTest.pH,
            pPpm: currentSoilTest.pPpm,
            bPpm: currentSoilTest.bPpm,
          }
        }
        isGranular={isGranular}
      />
    </div>
  );
}
