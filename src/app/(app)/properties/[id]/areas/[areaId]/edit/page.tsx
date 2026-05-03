import Link from "next/link";
import { notFound } from "next/navigation";
import prisma from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/server-session";
import { canAccessArea } from "@/lib/auth/guards";
import { ROLE_CONTRIBUTOR } from "@/lib/constants";
import { getSerializedLookups } from "@/lib/lookups";
import { updateArea } from "../../_actions";
import { AreaForm } from "../../area-form";

interface Props {
  params: Promise<{ id: string; areaId: string }>;
}

export default async function EditAreaPage({ params }: Props) {
  const { id: propertyId, areaId } = await params;
  const user = await requireSessionUser();
  if (!(await canAccessArea(user.id, areaId, ROLE_CONTRIBUTOR))) notFound();

  const [area, lookups] = await Promise.all([
    prisma.area.findFirst({ where: { id: areaId, propertyId } }),
    getSerializedLookups(),
  ]);
  if (!area) notFound();

  const action = updateArea.bind(null, propertyId, areaId);

  return (
    <div className="max-w-xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Edit area</h1>
      </div>
      <AreaForm
        action={action}
        defaultValues={area}
        submitLabel="Save changes"
        areaTypes={lookups.areaType}
        irrigationSources={lookups.irrigationSource}
      />
      <Link
        href={`/properties/${propertyId}/areas/${areaId}`}
        className="text-sm text-neutral-600 underline"
      >
        Cancel
      </Link>
    </div>
  );
}
