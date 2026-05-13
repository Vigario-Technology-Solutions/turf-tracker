import Link from "next/link";
import prisma from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/server-session";
import { getLookups } from "@/lib/lookups";

export const metadata = { title: "Products" };

export default async function ProductsPage() {
  const user = await requireSessionUser();

  const [products, lookups] = await Promise.all([
    prisma.product.findMany({
      where: { createdByUserId: user.id },
      orderBy: [{ brand: "asc" }, { name: "asc" }],
      select: {
        id: true,
        brand: true,
        name: true,
        formId: true,
        nPct: true,
        p2o5Pct: true,
        k2oPct: true,
        pkgSizeUnitId: true,
        sharedInHousehold: true,
        tags: true,
      },
    }),
    getLookups(),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Products</h1>
        <Link
          href="/products/new"
          className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white"
        >
          New product
        </Link>
      </div>

      {products.length === 0 ? (
        <p className="text-sm text-neutral-600">
          No products yet. Add your fertilizers and amendments to use them in the apply flow.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-200 rounded border border-neutral-200">
          {products.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <div className="min-w-0">
                <Link href={`/products/${p.id}`} className="font-medium hover:underline">
                  {p.brand} — {p.name}
                </Link>
                <div className="mt-0.5 text-xs text-neutral-500">
                  {p.nPct}-{p.p2o5Pct}-{p.k2oPct} · {lookups.productForm.displayName(p.formId)}
                  {p.sharedInHousehold && " · shared"}
                </div>
              </div>
              {p.tags.length > 0 && (
                <div className="flex flex-wrap justify-end gap-1">
                  {p.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded border border-neutral-300 px-1.5 py-0.5 text-xs uppercase tracking-wide text-neutral-600"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
