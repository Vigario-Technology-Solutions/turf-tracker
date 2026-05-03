import Link from "next/link";
import prisma from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/server-session";

export const metadata = { title: "Properties — Turf Tracker" };

export default async function PropertiesPage() {
  const user = await requireSessionUser();

  const memberships = await prisma.propertyMember.findMany({
    where: { userId: user.id },
    select: {
      role: true,
      property: {
        select: {
          id: true,
          name: true,
          address: true,
          _count: { select: { areas: true } },
        },
      },
    },
    orderBy: { property: { name: "asc" } },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Properties</h1>
        <Link
          href="/properties/new"
          className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white"
        >
          New property
        </Link>
      </div>

      {memberships.length === 0 ? (
        <p className="text-sm text-neutral-600">
          No properties yet. Create one to start adding areas.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-200 rounded border border-neutral-200">
          {memberships.map(({ role, property }) => (
            <li key={property.id} className="flex items-center justify-between px-3 py-2">
              <div>
                <Link href={`/properties/${property.id}`} className="font-medium hover:underline">
                  {property.name}
                </Link>
                {property.address && (
                  <span className="ml-2 text-sm text-neutral-500">{property.address}</span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-neutral-500">
                <span>
                  {property._count.areas} area{property._count.areas === 1 ? "" : "s"}
                </span>
                <span className="rounded border border-neutral-300 px-1.5 py-0.5 uppercase tracking-wide">
                  {role}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
