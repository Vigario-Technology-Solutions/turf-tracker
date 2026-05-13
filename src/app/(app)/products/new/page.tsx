import Link from "next/link";
import { requireSessionUser } from "@/lib/auth/server-session";
import { getSerializedLookups } from "@/lib/lookups";
import { createProduct } from "../_actions";
import { ProductForm } from "../product-form";

export const metadata = { title: "New product" };

export default async function NewProductPage() {
  await requireSessionUser();
  const lookups = await getSerializedLookups();

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">New product</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Use the label values exactly. P and K stay as P₂O₅ / K₂O — the apply flow converts to
          elemental for the math.
        </p>
      </div>
      <ProductForm
        action={createProduct}
        submitLabel="Create product"
        productForms={lookups.productForm}
        applicationUnits={lookups.applicationUnit}
        mfgRateBases={lookups.mfgRateBasis}
      />
      <Link href="/products" className="text-sm text-neutral-600 underline">
        Cancel
      </Link>
    </div>
  );
}
