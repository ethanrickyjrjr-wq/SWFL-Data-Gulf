import { Card } from "@/components/ui/card";
import { formatMetric, type WelcomeMetric } from "@/lib/welcome/frames";

import { CitationChip } from "./CitationChip";

const ARROW = { rising: "↑", falling: "↓", stable: "→" } as const;

/**
 * One hero metric. Structurally no-invention: it renders ONLY from a
 * WelcomeMetric, whose type guarantees a `source` — there is no path here that
 * prints a number without its citation chip. The arrow shows movement direction
 * only (no good/bad color judgment — rising AAL ≠ rising value).
 */
export function MetricCard({ metric }: { metric: WelcomeMetric }) {
  return (
    <Card className="gap-3 p-4">
      <div className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
        {metric.label}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="metric-value text-2xl font-semibold tabular-nums text-text-primary">
          {formatMetric(metric.value, metric.display_format, metric.units)}
        </span>
        {metric.direction ? (
          <span className="text-sm text-text-tertiary" aria-hidden>
            {ARROW[metric.direction]}
          </span>
        ) : null}
      </div>
      {/* MOAT guard: a coarser aggregate is gold-flagged as covering the ZIP, so it
          can never read as a ZIP-specific fact; a true per-ZIP value is muted. */}
      <div
        className={
          metric.is_true_zip
            ? "text-[11px] text-text-tertiary"
            : "text-[11px] font-medium text-neutral-gold"
        }
      >
        {metric.coverage_label}
      </div>
      <CitationChip source={metric.source} />
    </Card>
  );
}
