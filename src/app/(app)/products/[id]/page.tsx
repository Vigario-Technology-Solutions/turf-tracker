import Link from "next/link";
import { notFound } from "next/navigation";
import prisma from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/server-session";
import { getLookups } from "@/lib/lookups";
import { p2o5ToP, k2oToK } from "@/lib/calc/conversions";
import { DeleteProductButton } from "./delete-button";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProductDetailPage({ params }: Props) {
  const { id } = await params;
  const user = await requireSessionUser();

  const [product, lookups] = await Promise.all([
    prisma.product.findUnique({
      where: { id },
      include: { _count: { select: { applications: true } } },
    }),
    getLookups(),
  ]);
  // Either non-existent or another user's private product → 404 either way.
  if (!product) notFound();
  const owned = product.createdByUserId === user.id;
  if (!owned && !product.sharedInHousehold) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            {product.brand} — {product.name}
          </h1>
          <p className="mt-1 text-sm text-neutral-600">
            {lookups.productForm.displayName(product.formId)} · {product.pkgSizeValue}{" "}
            {lookups.applicationUnit.code(product.pkgSizeUnitId)} · ${product.pkgCostUsd.toFixed(2)}
          </p>
        </div>
        {owned && (
          <div className="flex items-center gap-2">
            <Link
              href={`/products/${id}/edit`}
              className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
            >
              Edit
            </Link>
            <DeleteProductButton id={id} name={`${product.brand} — ${product.name}`} />
          </div>
        )}
      </div>

      <section>
        <h2 className="text-sm font-medium text-neutral-500">Guaranteed analysis</h2>
        <div className="mt-1 grid grid-cols-3 gap-3 rounded border border-neutral-200 p-3 text-sm sm:grid-cols-4">
          <Stat label="N" value={`${product.nPct}%`} />
          <Stat
            label="P₂O₅"
            value={`${product.p2o5Pct}%`}
            hint={`P = ${p2o5ToP(product.p2o5Pct).toFixed(2)}%`}
          />
          <Stat
            label="K₂O"
            value={`${product.k2oPct}%`}
            hint={`K = ${k2oToK(product.k2oPct).toFixed(2)}%`}
          />
          <Stat label="Ca" value={`${product.caPct}%`} />
          <Stat label="Mg" value={`${product.mgPct}%`} />
          <Stat label="S" value={`${product.sPct}%`} />
          <Stat label="Na" value={`${product.naPct}%`} />
          <Stat label="Fe" value={`${product.fePct}%`} />
          <Stat label="Mn" value={`${product.mnPct}%`} />
          <Stat label="Zn" value={`${product.znPct}%`} />
          <Stat label="Cu" value={`${product.cuPct}%`} />
          <Stat label="B" value={`${product.bPct}%`} />
        </div>
      </section>

      {product.densityLbPerGal != null && (
        <section className="text-sm">
          <span className="text-xs uppercase tracking-wide text-neutral-500">Density</span>{" "}
          {product.densityLbPerGal} lb/gal
        </section>
      )}

      {product.mfgRateValue != null && (
        <section className="text-sm">
          <span className="text-xs uppercase tracking-wide text-neutral-500">
            Manufacturer rate
          </span>{" "}
          {product.mfgRateValue} {lookups.applicationUnit.displayName(product.mfgRateUnitId)} per{" "}
          {product.mfgRatePerValue != null && product.mfgRatePerValue !== 1
            ? `${product.mfgRatePerValue.toLocaleString()} `
            : ""}
          {lookups.mfgRateBasis.displayName(product.mfgRateBasisId)}
        </section>
      )}

      {product.tags.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-neutral-500">Tags</h2>
          <div className="mt-1 flex flex-wrap gap-1">
            {product.tags.map((t) => (
              <span
                key={t}
                className="rounded border border-neutral-300 px-1.5 py-0.5 text-xs uppercase tracking-wide text-neutral-600"
              >
                {t}
              </span>
            ))}
          </div>
        </section>
      )}

      {product.notes && (
        <section>
          <h2 className="text-sm font-medium text-neutral-500">Notes</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm">{product.notes}</p>
        </section>
      )}

      <section className="text-xs text-neutral-500">
        Used in {product._count.applications} application
        {product._count.applications === 1 ? "" : "s"}.
      </section>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-0.5">{value}</div>
      {hint && <div className="text-xs text-neutral-500">{hint}</div>}
    </div>
  );
}
