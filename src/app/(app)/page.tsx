import Link from "next/link";
import prisma from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/server-session";
import { computeAreasStatus } from "@/lib/rules";
import { AreaStatusCard } from "./area-status-card";

export const metadata = { title: "What's next?" };

/**
 * Home view — the "What's next?" surface. Per SPEC §0 / §6.7: every
 * area for which the user has a property membership, ranked by verdict
 * (urgent → attention → ok), with the top diagnostics inline so the
 * user knows what to act on without drilling into the area page first.
 *
 * Empty states cascade: no properties → invite to create one; properties
 * but no areas → invite to add areas. Anything else → render the cards.
 *
 * The user's `defaultPropertyId` (set on /profile) is honored as a
 * sort key — that property floats to the top of the grouping. Other
 * properties stay in name order beneath.
 */
export default async function Home() {
  const user = await requireSessionUser();
  const now = new Date();

  const memberships = await prisma.propertyMember.findMany({
    where: { userId: user.id },
    select: {
      property: {
        select: {
          id: true,
          name: true,
          areas: {
            select: { id: true, name: true, areaSqFt: true },
            orderBy: { name: "asc" },
          },
        },
      },
    },
    orderBy: { property: { name: "asc" } },
  });

  if (memberships.length === 0) {
    return <EmptyHome variant="no-properties" />;
  }

  const totalAreas = memberships.reduce((acc, m) => acc + m.property.areas.length, 0);
  if (totalAreas === 0) {
    return <EmptyHome variant="no-areas" />;
  }

  const properties = memberships.map((m) => m.property);
  const sorted = sortByDefault(properties, user.defaultPropertyId ?? null);

  const allAreaIds = sorted.flatMap((p) => p.areas.map((a) => a.id));
  const statusByArea = await computeAreasStatus(allAreaIds, now);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">What&apos;s next?</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Areas with action sit at the top. Tap a card to go log or apply.
        </p>
      </div>

      {sorted.map((property) =>
        property.areas.length === 0 ? null : (
          <section key={property.id} className="space-y-2">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">
                {property.name}
              </h2>
              <Link
                href={`/properties/${property.id}`}
                className="text-xs text-neutral-500 hover:text-neutral-900"
              >
                View property →
              </Link>
            </div>
            <ul className="grid gap-2 sm:grid-cols-2">
              {sortAreasByVerdict(property.areas, statusByArea).map((a) => {
                const status = statusByArea.get(a.id);
                if (!status) return null;
                return (
                  <li key={a.id}>
                    <AreaStatusCard
                      href={`/properties/${property.id}/areas/${a.id}`}
                      name={a.name}
                      areaSqFt={a.areaSqFt}
                      status={status}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        ),
      )}
    </div>
  );
}

function sortByDefault<T extends { id: string }>(items: T[], defaultId: string | null): T[] {
  if (!defaultId) return items;
  const idx = items.findIndex((p) => p.id === defaultId);
  if (idx < 0) return items;
  return [items[idx], ...items.slice(0, idx), ...items.slice(idx + 1)];
}

const VERDICT_RANK = { urgent: 3, attention: 2, ok: 1 } as const;

function sortAreasByVerdict<T extends { id: string; name: string }>(
  areas: T[],
  statusByArea: Map<string, { status: keyof typeof VERDICT_RANK }>,
): T[] {
  return [...areas].sort((a, b) => {
    const ra = VERDICT_RANK[statusByArea.get(a.id)?.status ?? "ok"];
    const rb = VERDICT_RANK[statusByArea.get(b.id)?.status ?? "ok"];
    if (ra !== rb) return rb - ra;
    return a.name.localeCompare(b.name);
  });
}

function EmptyHome({ variant }: { variant: "no-properties" | "no-areas" }) {
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold">What&apos;s next?</h1>
      {variant === "no-properties" ? (
        <p className="text-sm text-neutral-600">
          No properties yet.{" "}
          <Link href="/properties/new" className="font-medium underline">
            Create one
          </Link>{" "}
          to start tracking areas.
        </p>
      ) : (
        <p className="text-sm text-neutral-600">
          You have a property but no areas yet.{" "}
          <Link href="/properties" className="font-medium underline">
            Pick a property
          </Link>{" "}
          and add an area to get started.
        </p>
      )}
    </div>
  );
}
