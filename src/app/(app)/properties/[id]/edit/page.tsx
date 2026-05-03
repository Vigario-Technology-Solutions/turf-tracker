import Link from "next/link";
import { notFound } from "next/navigation";
import prisma from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/server-session";
import { canAccessProperty } from "@/lib/auth/guards";
import { ROLE_OWNER } from "@/lib/constants";
import { updateProperty } from "../../_actions";
import { PropertyForm } from "../../property-form";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditPropertyPage({ params }: Props) {
  const { id } = await params;
  const user = await requireSessionUser();
  if (!(await canAccessProperty(user.id, id, ROLE_OWNER))) notFound();

  const property = await prisma.property.findUnique({
    where: { id },
    select: { name: true, address: true, notes: true },
  });
  if (!property) notFound();

  const action = updateProperty.bind(null, id);

  return (
    <div className="max-w-md space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Edit property</h1>
      </div>
      <PropertyForm action={action} defaultValues={property} submitLabel="Save changes" />
      <Link href={`/properties/${id}`} className="text-sm text-neutral-600 underline">
        Cancel
      </Link>
    </div>
  );
}
