import Link from "next/link";
import { notFound } from "next/navigation";
import prisma from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/server-session";
import { getPropertyRole } from "@/lib/auth/guards";
import { ROLE_OWNER } from "@/lib/constants";
import { DeletePropertyButton } from "./delete-button";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PropertyDetailPage({ params }: Props) {
  const { id } = await params;
  const user = await requireSessionUser();
  const role = await getPropertyRole(user.id, id);
  if (!role) notFound(); // not a member → indistinguishable from non-existent

  const property = await prisma.property.findUnique({
    where: { id },
    include: {
      areas: { select: { id: true, name: true, areaSqFt: true }, orderBy: { name: "asc" } },
      members: {
        include: { user: { select: { email: true, displayName: true, name: true } } },
      },
    },
  });
  if (!property) notFound();

  const canEdit = role === ROLE_OWNER;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{property.name}</h1>
          {property.address && <p className="mt-1 text-sm text-neutral-600">{property.address}</p>}
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <Link
              href={`/properties/${id}/edit`}
              className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
            >
              Edit
            </Link>
            <DeletePropertyButton id={id} name={property.name} />
          </div>
        )}
      </div>

      {property.notes && (
        <section>
          <h2 className="text-sm font-medium text-neutral-500">Notes</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm">{property.notes}</p>
        </section>
      )}

      <section>
        <h2 className="text-sm font-medium text-neutral-500">Areas ({property.areas.length})</h2>
        {property.areas.length === 0 ? (
          <p className="mt-1 text-sm text-neutral-600">No areas yet.</p>
        ) : (
          <ul className="mt-1 divide-y divide-neutral-200 rounded border border-neutral-200">
            {property.areas.map((a) => (
              <li key={a.id} className="flex justify-between px-3 py-2 text-sm">
                <span>{a.name}</span>
                <span className="text-neutral-500">{a.areaSqFt.toLocaleString()} sq ft</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-sm font-medium text-neutral-500">
          Members ({property.members.length})
        </h2>
        <ul className="mt-1 divide-y divide-neutral-200 rounded border border-neutral-200">
          {property.members.map((m) => (
            <li key={m.userId} className="flex justify-between px-3 py-2 text-sm">
              <span>{m.user.displayName ?? m.user.name ?? m.user.email}</span>
              <span className="text-xs uppercase tracking-wide text-neutral-500">{m.role}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
