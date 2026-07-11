import { ReportHighlightBridge } from "@/components/highlighter/ReportHighlightBridge";
import { buildReportId } from "@/lib/highlighter/report-surface";
import type { MetricSuggestion } from "@/lib/highlighter/report-context-store";
import type { DeskDatum } from "@/lib/desk/types";

/**
 * The desk's filing bridge — maps each zone datum's REAL provenance
 * (label / value / sourceLabel / as-of) into the metric suggestions the
 * root highlighter reads, then publishes through the one shared
 * `ReportHighlightBridge` (one authority for the publish/clear mechanics —
 * this file only owns the desk→suggestion mapping). With this mounted,
 * "File this figure" on a desk number captures its named source and as-of
 * instead of an empty token, and the AI pill grounds on the synthesizer
 * report (`master` — a real brain surface, so the dock can never 404).
 */
export function DeskHighlightBridge({ data, pageAsOf }: { data: DeskDatum[]; pageAsOf?: string }) {
  const metricSuggestions: MetricSuggestion[] = data.map((d) => ({
    label: d.label,
    suggestions: [
      `What's driving ${d.label.toLowerCase()} in Southwest Florida right now?`,
      `How does ${d.label.toLowerCase()} compare across Lee and Collier?`,
    ],
    value: d.display,
    sourceLabel: d.sourceLabel,
    freshnessToken: d.asOf ?? pageAsOf,
  }));
  return (
    <ReportHighlightBridge
      reportId={buildReportId("brain", "master")}
      freshnessToken={pageAsOf}
      metricSuggestions={metricSuggestions}
    />
  );
}
