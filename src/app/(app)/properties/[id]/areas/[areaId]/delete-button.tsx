"use client";

import { useState, useTransition } from "react";
import { deleteArea } from "../_actions";

export function DeleteAreaButton({
  propertyId,
  areaId,
  name,
}: {
  propertyId: string;
  areaId: string;
  name: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (
            !confirm(
              `Delete "${name}"? Application history and irrigation events for this area will also be deleted.`,
            )
          )
            return;
          setError(null);
          startTransition(async () => {
            const result = await deleteArea(propertyId, areaId);
            if (!result.ok) setError(result.error);
          });
        }}
        className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-60"
      >
        {pending ? "Deleting…" : "Delete"}
      </button>
      {error && <span className="mt-1 text-xs text-red-700">{error}</span>}
    </span>
  );
}
