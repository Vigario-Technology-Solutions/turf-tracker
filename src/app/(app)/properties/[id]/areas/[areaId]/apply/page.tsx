import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import prisma from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/server-session";
import { canAccessArea } from "@/lib/auth/guards";
import { ROLE_CONTRIBUTOR } from "@/lib/constants";
import { getLookups } from "@/lib/lookups";

export const metadata = { title: "Apply" };

interface Props {
  params: Promise<{ id: string; areaId: string }>;
  searchParams: Promise<{ productId?: string }>;
}

/**
 * Apply-flow entry point. Without a productId in the URL, shows a
 * picker over the user's library + any household-shared products. Once
 * a product is picked, the URL gets `?productId=…` and the calculator
 * page (sibling route) takes over. This split keeps the picker stateless
 * and the calculator client-side / state-heavy.
 */
export default async function ApplyPickerPage({ params, searchParams }: Props) {
  const { id: propertyId, areaId } = await params;
  const { productId } = await searchParams;
  const user = await requireSessionUser();
  if (!(await canAccessArea(user.id, areaId, ROLE_CONTRIBUTOR))) notFound();

  // Pre-selected product → bounce straight into the calculator.
  if (productId) {
    redirect(`/properties/${propertyId}/areas/${areaId}/apply/${productId}`);
  }

  const [area, products, lookups] = await Promise.all([
    prisma.area.findFirst({
      where: { id: areaId, propertyId },
      select: { id: true, name: true, areaSqFt: true },
    }),
    prisma.product.findMany({
      where: { OR: [{ createdByUserId: user.id }, { sharedInHousehold: true }] },
      orderBy: [{ brand: "asc" }, { name: "asc" }],
      select: {
        id: true,
        brand: true,
        name: true,
        formId: true,
        nPct: true,
        p2o5Pct: true,
        k2oPct: true,
      },
    }),
    getLookups(),
  ]);
  if (!area) notFound();

  return (
    <div className="space-y-4">
      <div>
        <Link
          href={`/properties/${propertyId}/areas/${areaId}`}
          className="text-sm text-neutral-600 hover:underline"
        >
          ← {area.name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Pick a product</h1>
        <p className="mt-1 text-sm text-neutral-600">
          {area.areaSqFt.toLocaleString()} sq ft. Your library + anything shared in the household.
        </p>
      </div>

      {products.length === 0 ? (
        <p className="text-sm text-neutral-600">
          No products yet —{" "}
          <Link href="/products/new" className="font-medium underline">
            create one
          </Link>{" "}
          first.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-200 rounded border border-neutral-200">
          {products.map((p) => (
            <li key={p.id}>
              <Link
                href={`/properties/${propertyId}/areas/${areaId}/apply/${p.id}`}
                className="flex items-center justify-between px-3 py-2 text-sm hover:bg-neutral-50"
              >
                <span className="font-medium">
                  {p.brand} — {p.name}
                </span>
                <span className="text-xs text-neutral-500">
                  {p.nPct}-{p.p2o5Pct}-{p.k2oPct} · {lookups.productForm.displayName(p.formId)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
