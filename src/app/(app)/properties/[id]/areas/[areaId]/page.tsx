import Link from "next/link";
import { notFound } from "next/navigation";
import prisma from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/server-session";
import { getPropertyRole } from "@/lib/auth/guards";
import { ROLE_OWNER, ROLE_CONTRIBUTOR } from "@/lib/constants";
import { getLookups } from "@/lib/lookups";
import { sar, esp, caMgRatio } from "@/lib/calc/soil";
import { DeleteAreaButton } from "./delete-button";
import { SoilTestRowActions } from "./soil-tests/soil-test-row-actions";

interface Props {
  params: Promise<{ id: string; areaId: string }>;
}

export default async function AreaDetailPage({ params }: Props) {
  const { id: propertyId, areaId } = await params;
  const user = await requireSessionUser();
  const role = await getPropertyRole(user.id, propertyId);
  if (!role) notFound();

  const [area, lookups] = await Promise.all([
    prisma.area.findFirst({
      where: { id: areaId, propertyId },
      include: {
        property: { select: { name: true } },
        soilTests: { orderBy: { testDate: "desc" } },
      },
    }),
    getLookups(),
  ]);
  if (!area) notFound();

  const canEdit = role === ROLE_OWNER || role === ROLE_CONTRIBUTOR;
  const canDelete = role === ROLE_OWNER;
  const currentTest = area.soilTests.find((t) => t.id === area.currentSoilTestId);
  const currentDerived = currentTest && {
    sar: sar(currentTest),
    esp: esp(currentTest),
    caMg: caMgRatio(currentTest),
  };

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/properties/${propertyId}`}
          className="text-sm text-neutral-600 hover:underline"
        >
          ← {area.property.name}
        </Link>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{area.name}</h1>
            <p className="mt-1 text-sm text-neutral-600">
              {area.areaSqFt.toLocaleString()} sq ft ·{" "}
              {lookups.areaType.displayName(area.areaTypeId)}
              {area.cropOrSpecies && ` · ${area.cropOrSpecies}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canEdit && (
              <Link
                href={`/properties/${propertyId}/areas/${areaId}/apply`}
                className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white"
              >
                Apply
              </Link>
            )}
            {canEdit && (
              <Link
                href={`/properties/${propertyId}/areas/${areaId}/edit`}
                className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
              >
                Edit
              </Link>
            )}
            {canDelete && (
              <DeleteAreaButton propertyId={propertyId} areaId={areaId} name={area.name} />
            )}
          </div>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-4 rounded border border-neutral-200 p-3 text-sm sm:grid-cols-2">
        <Stat
          label="Irrigation"
          value={lookups.irrigationSource.displayName(area.irrigationSourceId)}
        />
        <Stat label="Water Na (ppm)" value={area.waterNaPpm?.toString() ?? "—"} />
        <Stat label="Precip rate (in/hr)" value={area.precipRateInPerHr?.toString() ?? "—"} />
        <Stat label="Head type" value={area.headType ?? "—"} />
      </section>

      {area.notes && (
        <section>
          <h2 className="text-sm font-medium text-neutral-500">Notes</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm">{area.notes}</p>
        </section>
      )}

      <section>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-sm font-medium text-neutral-500">
            Soil tests ({area.soilTests.length})
          </h2>
          {canEdit && (
            <Link
              href={`/properties/${propertyId}/areas/${areaId}/soil-tests/new`}
              className="text-sm font-medium underline"
            >
              Add soil test
            </Link>
          )}
        </div>

        {currentTest && currentDerived && (
          <div className="mb-2 rounded border border-neutral-200 bg-neutral-50 p-3 text-sm">
            <div className="text-xs uppercase tracking-wide text-neutral-500">
              Current — {currentTest.testDate.toISOString().slice(0, 10)}
              {currentTest.lab && ` · ${currentTest.lab}`}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-3">
              <Stat label="SAR" value={fmtNum(currentDerived.sar)} />
              <Stat label="ESP" value={fmtNum(currentDerived.esp, "%")} />
              <Stat label="Ca:Mg" value={fmtNum(currentDerived.caMg)} />
              <Stat label="pH" value={fmtNum(currentTest.pH)} />
              <Stat label="Na (ppm)" value={fmtNum(currentTest.naPpm)} />
              <Stat label="P (ppm)" value={fmtNum(currentTest.pPpm)} />
            </div>
          </div>
        )}

        {area.soilTests.length === 0 ? (
          <p className="text-sm text-neutral-600">No soil tests yet.</p>
        ) : (
          <ul className="divide-y divide-neutral-200 rounded border border-neutral-200">
            {area.soilTests.map((t) => {
              const isCurrent = t.id === area.currentSoilTestId;
              return (
                <li key={t.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div>
                    <span className="font-medium">{t.testDate.toISOString().slice(0, 10)}</span>
                    {t.lab && <span className="ml-2 text-neutral-500">{t.lab}</span>}
                    {isCurrent && (
                      <span className="ml-2 rounded border border-neutral-300 px-1.5 py-0.5 text-xs uppercase tracking-wide text-neutral-600">
                        current
                      </span>
                    )}
                  </div>
                  {canEdit && (
                    <SoilTestRowActions
                      propertyId={propertyId}
                      areaId={areaId}
                      soilTestId={t.id}
                      isCurrent={isCurrent}
                      canDelete={canDelete}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function fmtNum(v: number | null | undefined, suffix = ""): string {
  if (v == null || !isFinite(v)) return "—";
  return `${v.toFixed(2)}${suffix}`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}
