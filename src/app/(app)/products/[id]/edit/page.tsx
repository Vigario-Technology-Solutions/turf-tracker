import Link from "next/link";
import { notFound } from "next/navigation";
import prisma from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/server-session";
import { getSerializedLookups } from "@/lib/lookups";
import { updateProduct } from "../../_actions";
import { ProductForm } from "../../product-form";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditProductPage({ params }: Props) {
  const { id } = await params;
  const user = await requireSessionUser();
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product || product.createdByUserId !== user.id) notFound();

  const lookups = await getSerializedLookups();
  const action = updateProduct.bind(null, id);

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Edit product</h1>
      </div>
      <ProductForm
        action={action}
        defaultValues={product}
        submitLabel="Save changes"
        productForms={lookups.productForm}
      />
      <Link href={`/products/${id}`} className="text-sm text-neutral-600 underline">
        Cancel
      </Link>
    </div>
  );
}
