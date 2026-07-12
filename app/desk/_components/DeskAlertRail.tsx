import { TriangleAlert } from "lucide-react";
import type { DeskAlert } from "@/lib/desk/alerts";

/**
 * Condition-driven alert chips (distinct from the chronological Wire): each
 * chip is a code-owned threshold rule that fired over already-loaded data —
 * see lib/desk/alerts.ts for every rule + rationale. Server-rendered; a quiet
 * market renders nothing.
 */
export function DeskAlertRail({ alerts }: { alerts: DeskAlert[] }) {
  if (alerts.length === 0) return null;
  return (
    <div id="desk-alerts" className="flex flex-wrap gap-2">
      {alerts.map((a) => (
        <div
          key={a.id}
          className="flex items-start gap-2 rounded-lg border border-[#d4b370]/40 bg-[#d4b370]/5 px-3 py-2"
        >
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#d4b370]" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-200">{a.headline}</p>
            {a.detail ? <p className="text-[11px] text-gray-400">{a.detail}</p> : null}
            <p className="font-mono text-[10px] text-gray-600">
              {a.asOf ? `as of ${a.asOf} · ` : ""}
              {a.sourceLabel}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
