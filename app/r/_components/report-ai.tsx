import { ReportHighlightBridge } from "../../../components/highlighter/ReportHighlightBridge";
import { buildReportId, type ReportSurfaceKind } from "../../../lib/highlighter/report-surface";
import { highlighterUiEnabled } from "../../../lib/highlighter/flag";
import { suggestionsForMetric } from "../../../lib/highlighter/suggestions";
import type { MetricSuggestion } from "../../../lib/highlighter/report-context-store";

/**
 * ONE root for every /r/ page's AI wiring (spec 2026-07-09-zip-page-destination
 * §One root #1). Owns the highlighter flag gate, the buildReportId encoding
 * (the 404-class contract), and MetricSuggestion normalization — pages pass
 * plain data and mount this; none of them touch ReportHighlightBridge or
 * buildReportId directly (report-surface.test.ts enforces it).
 */
export interface ReportAiMetric {
  label: string;
  value: string | number;
  /** Precomputed chips (DisplayBrain metrics carry them) — win when present. */
  suggestions?: string[];
  /** When set and `suggestions` is absent, chips are computed via
   *  suggestionsForMetric against this pack id (the zip-page pattern). */
  packId?: string;
  /** Metric key handed to suggestionsForMetric; defaults to label.toLowerCase(). */
  metricKey?: string;
  sourceUrl?: string;
  sourceLabel?: string;
  /** Per-metric freshness override; defaults to the page-level token. */
  freshnessToken?: string;
}

export function ReportAi({
  surface,
  surfaceKey,
  conclusion,
  freshnessToken,
  metrics = [],
}: {
  surface: ReportSurfaceKind;
  surfaceKey: string;
  conclusion?: string;
  freshnessToken?: string;
  metrics?: ReportAiMetric[];
}) {
  if (!highlighterUiEnabled()) return null;
  const metricSuggestions: MetricSuggestion[] = metrics.map((m) => {
    const value = typeof m.value === "string" ? m.value : String(m.value);
    return {
      label: m.label,
      value,
      suggestions:
        m.suggestions ??
        (m.packId
          ? suggestionsForMetric({ metric: m.metricKey ?? m.label.toLowerCase(), value }, m.packId)
          : []),
      sourceUrl: m.sourceUrl,
      sourceLabel: m.sourceLabel,
      freshnessToken: m.freshnessToken ?? freshnessToken,
    };
  });
  return (
    <ReportHighlightBridge
      reportId={buildReportId(surface, surfaceKey)}
      conclusion={conclusion}
      freshnessToken={freshnessToken}
      metricSuggestions={metricSuggestions}
    />
  );
}
