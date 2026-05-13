import Link from "next/link";
import { createProperty } from "../_actions";
import { PropertyForm } from "../property-form";

export const metadata = { title: "New property" };

export default function NewPropertyPage() {
  return (
    <div className="max-w-md space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">New property</h1>
        <p className="mt-1 text-sm text-neutral-600">
          You&apos;ll be added as the owner. Add areas after creating it.
        </p>
      </div>
      <PropertyForm action={createProperty} submitLabel="Create property" />
      <Link href="/properties" className="text-sm text-neutral-600 underline">
        Cancel
      </Link>
    </div>
  );
}
