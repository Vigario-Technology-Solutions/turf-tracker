import Link from "next/link";
import { PRIORITY_INFORMATIONAL, PRIORITY_RECOMMENDED, PRIORITY_URGENT } from "@/lib/constants";
import type { AreaDiagnostic, AreaStatus, AreaStatusVerdict } from "@/lib/rules";

/**
 * Card component for the home view's "What's next?" list. Single area
 * per card — verdict + top 3 diagnostics + a tap target into the area
 * page where the user can act on them.
 *
 * Verdict color is the primary at-a-glance signal. Diagnostic priority
 * gets a subtler chip on each line so the relative urgency inside the
 * card is still legible.
 */

const VERDICT_STYLES: Record<AreaStatusVerdict, { wrap: string; chip: string; label: string }> = {
  ok: {
    wrap: "border-neutral-200 bg-white",
    chip: "bg-emerald-50 text-emerald-800 border-emerald-200",
    label: "OK",
  },
  attention: {
    wrap: "border-amber-200 bg-amber-50/40",
    chip: "bg-amber-100 text-amber-900 border-amber-300",
    label: "Attention",
  },
  urgent: {
    wrap: "border-red-300 bg-red-50/40",
    chip: "bg-red-100 text-red-900 border-red-300",
    label: "Urgent",
  },
};

const PRIORITY_DOTS: Record<AreaDiagnostic["priority"], { color: string; label: string }> = {
  [PRIORITY_URGENT]: { color: "bg-red-500", label: "urgent" },
  [PRIORITY_RECOMMENDED]: { color: "bg-amber-500", label: "recommended" },
  [PRIORITY_INFORMATIONAL]: { color: "bg-neutral-400", label: "info" },
};

export function AreaStatusCard({
  href,
  name,
  areaSqFt,
  status,
  topN = 3,
}: {
  href: string;
  name: string;
  areaSqFt: number;
  status: AreaStatus;
  topN?: number;
}) {
  const styles = VERDICT_STYLES[status.status];
  const visible = status.diagnostics.slice(0, topN);
  const overflow = status.diagnostics.length - visible.length;

  return (
    <Link
      href={href}
      className={`block rounded border ${styles.wrap} p-3 transition hover:bg-neutral-50/40`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-medium">{name}</h3>
          <p className="text-xs text-neutral-500">{areaSqFt.toLocaleString()} sq ft</p>
        </div>
        <span
          className={`shrink-0 rounded border px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${styles.chip}`}
        >
          {styles.label}
        </span>
      </div>

      <p className="mt-1 text-xs text-neutral-600">{status.statusDescription}</p>

      {visible.length > 0 && (
        <ul className="mt-2 space-y-1">
          {visible.map((d) => {
            const dot = PRIORITY_DOTS[d.priority];
            return (
              <li key={d.ruleId} className="flex items-start gap-2 text-sm">
                <span
                  className={`mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${dot.color}`}
                  aria-label={dot.label}
                />
                <span className="text-neutral-800">{d.summary}</span>
              </li>
            );
          })}
          {overflow > 0 && <li className="text-xs text-neutral-500">+{overflow} more</li>}
        </ul>
      )}
    </Link>
  );
}
