import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSessionUser } from "@/lib/auth/server-session";
import { canAccessProperty } from "@/lib/auth/guards";
import { ROLE_CONTRIBUTOR } from "@/lib/constants";
import { getSerializedLookups } from "@/lib/lookups";
import { createArea } from "../_actions";
import { AreaForm } from "../area-form";

export const metadata = { title: "New area — Turf Tracker" };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function NewAreaPage({ params }: Props) {
  const { id: propertyId } = await params;
  const user = await requireSessionUser();
  if (!(await canAccessProperty(user.id, propertyId, ROLE_CONTRIBUTOR))) notFound();

  const lookups = await getSerializedLookups();
  const action = createArea.bind(null, propertyId);

  return (
    <div className="max-w-xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">New area</h1>
        <p className="mt-1 text-sm text-neutral-600">
          The square footage is the one number you should never have to retype.
        </p>
      </div>
      <AreaForm
        action={action}
        submitLabel="Create area"
        areaTypes={lookups.areaType}
        irrigationSources={lookups.irrigationSource}
      />
      <Link href={`/properties/${propertyId}`} className="text-sm text-neutral-600 underline">
        Cancel
      </Link>
    </div>
  );
}
