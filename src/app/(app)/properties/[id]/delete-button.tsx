"use client";

import { useState, useTransition } from "react";
import { deleteProperty } from "../_actions";

export function DeletePropertyButton({ id, name }: { id: string; name: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm(`Delete "${name}"? This removes all areas, applications, and history.`))
            return;
          setError(null);
          startTransition(async () => {
            const result = await deleteProperty(id);
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
