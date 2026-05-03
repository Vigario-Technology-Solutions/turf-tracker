"use client";

import { useState, useTransition } from "react";
import { setCurrentSoilTest, deleteSoilTest } from "./_actions";

export function SoilTestRowActions({
  propertyId,
  areaId,
  soilTestId,
  isCurrent,
  canDelete,
}: {
  propertyId: string;
  areaId: string;
  soilTestId: string;
  isCurrent: boolean;
  canDelete: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex items-center gap-2">
      {!isCurrent && (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await setCurrentSoilTest(propertyId, areaId, soilTestId);
              if (!result.ok) setError(result.error);
            });
          }}
          className="rounded border border-neutral-300 px-2 py-0.5 text-xs hover:bg-neutral-50 disabled:opacity-60"
        >
          Set as current
        </button>
      )}
      {canDelete && (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!confirm("Delete this soil test?")) return;
            setError(null);
            startTransition(async () => {
              const result = await deleteSoilTest(propertyId, areaId, soilTestId);
              if (!result.ok) setError(result.error);
            });
          }}
          className="rounded border border-red-300 px-2 py-0.5 text-xs text-red-700 hover:bg-red-50 disabled:opacity-60"
        >
          Delete
        </button>
      )}
      {error && <span className="text-xs text-red-700">{error}</span>}
    </span>
  );
}
