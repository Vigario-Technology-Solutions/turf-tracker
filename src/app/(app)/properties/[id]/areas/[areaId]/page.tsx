import Link from "next/link";
import { notFound } from "next/navigation";
import prisma from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/server-session";
import { getPropertyRole } from "@/lib/auth/guards";
import { ROLE_OWNER, ROLE_CONTRIBUTOR } from "@/lib/constants";
import { getLookups } from "@/lib/lookups";
import { DeleteAreaButton } from "./delete-button";

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
      include: { property: { select: { name: true } } },
    }),
    getLookups(),
  ]);
  if (!area) notFound();

  const canEdit = role === ROLE_OWNER || role === ROLE_CONTRIBUTOR;
  const canDelete = role === ROLE_OWNER;

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
          {canEdit && (
            <div className="flex items-center gap-2">
              <Link
                href={`/properties/${propertyId}/areas/${areaId}/edit`}
                className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
              >
                Edit
              </Link>
              {canDelete && (
                <DeleteAreaButton propertyId={propertyId} areaId={areaId} name={area.name} />
              )}
            </div>
          )}
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
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}
