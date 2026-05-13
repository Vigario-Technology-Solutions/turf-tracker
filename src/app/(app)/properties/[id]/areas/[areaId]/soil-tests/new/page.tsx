import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSessionUser } from "@/lib/auth/server-session";
import { canAccessArea } from "@/lib/auth/guards";
import { ROLE_CONTRIBUTOR } from "@/lib/constants";
import { createSoilTest } from "../_actions";
import { SoilTestForm } from "../soil-test-form";

export const metadata = { title: "New soil test" };

interface Props {
  params: Promise<{ id: string; areaId: string }>;
}

export default async function NewSoilTestPage({ params }: Props) {
  const { id: propertyId, areaId } = await params;
  const user = await requireSessionUser();
  if (!(await canAccessArea(user.id, areaId, ROLE_CONTRIBUTOR))) notFound();

  const action = createSoilTest.bind(null, propertyId, areaId);
  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">New soil test</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Leave anything the lab didn&apos;t report blank. Saving makes this the area&apos;s current
          test.
        </p>
      </div>
      <SoilTestForm action={action} todayIso={todayIso} />
      <Link
        href={`/properties/${propertyId}/areas/${areaId}`}
        className="text-sm text-neutral-600 underline"
      >
        Cancel
      </Link>
    </div>
  );
}
