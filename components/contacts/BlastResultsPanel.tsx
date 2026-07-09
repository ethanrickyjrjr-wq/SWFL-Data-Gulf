"use client";
import { useEffect, useState } from "react";

interface VariantStat {
  variant: number;
  label: string;
  sent: number;
  opened: number;
  clicked: number;
  openRate: number;
  clickRate: number;
}
interface Results {
  cohorts: VariantStat[];
  readyToCallWinner: boolean;
  minSample: number;
  winner: { variant: number; liftPct: number; zScore: number } | null;
}

export function BlastResultsPanel({ deliverableId }: { deliverableId: string }) {
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/deliverables/${deliverableId}/blast-results`)
      .then((r) => (r.ok ? r.json() : { hasSplitTest: false }))
      .then((data) => {
        if (!cancelled) setResults(data.hasSplitTest ? data.results : null);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [deliverableId]);

  if (loading || !results) return null;

  return (
    <div className="mt-4 w-full rounded-xl border border-white/10 bg-white/5 p-4 text-left">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
        Split test results
      </p>
      <div className="space-y-2">
        {results.cohorts.map((c) => (
          <div key={c.variant} className="flex items-center justify-between text-sm">
            <span className="truncate text-gray-300" title={c.label}>
              {results.winner?.variant === c.variant ? "★ " : ""}
              {c.label.length > 36 ? `${c.label.slice(0, 36)}…` : c.label}
            </span>
            <span className="shrink-0 text-gray-400">
              {c.sent} sent · {(c.clickRate * 100).toFixed(1)}% clicked
            </span>
          </div>
        ))}
      </div>
      {results.winner ? (
        <p className="mt-3 text-xs text-gulf-teal">
          Variant {results.winner.variant + 1} is leading — {results.winner.liftPct.toFixed(0)}%
          lift, statistically significant at 95% confidence.
        </p>
      ) : (
        <p className="mt-3 text-xs text-gray-500">
          {results.readyToCallWinner
            ? "No statistically significant leader yet."
            : `Not enough sends yet to call a winner (need ${results.minSample}/cohort).`}
        </p>
      )}
    </div>
  );
}
