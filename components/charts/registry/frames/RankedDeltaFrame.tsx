"use client";

import type { ChartSpec } from "../chart-spec";
import type { ValueFormat } from "@/lib/charts/format";
import { rankedDeltaSvg, type RankedDeltaItem } from "@/lib/charts/svg/ranked-delta";

/**
 * RankedDeltaFrame — the RANKED-WITH-DELTA scorecard ("ranked-delta").
 *
 * The frame is a THIN wrapper: it pulls the data from `spec.options`, resolves
 * the brand accent from `spec.theme`, and renders the SAME pure SVG string the
 * email PNG path rasterizes (`rankedDeltaSvg`). One renderer, two surfaces — the
 * web frame and the email image never fork.
 *
 * spec.options shape:
 *   items: Array<{ label: string; value: number; delta?: number }>
 *   value_format?: ValueFormat   (also read from spec.value_format)
 *   accent?: string              (overrides spec.theme.accent)
 */

const VALUE_FORMATS: ReadonlySet<string> = new Set(["usd", "rent", "count", "pct", "index"]);

export interface RankedDeltaData {
  items: RankedDeltaItem[];
  valueFormat: ValueFormat | undefined;
  deltaFormat: ValueFormat | undefined;
  accent: string | undefined;
}

/** Pure data-adapter — exported so tests can exercise it without a DOM. */
export function extractRankedDeltaData(spec: ChartSpec): RankedDeltaData {
  const options = spec.options ?? {};
  const raw = Array.isArray(options.items) ? options.items : [];

  const items: RankedDeltaItem[] = raw
    .filter(
      (r): r is Record<string, unknown> => r !== null && typeof r === "object" && !Array.isArray(r),
    )
    .map((r) => ({
      label: typeof r.label === "string" ? r.label : "",
      value: typeof r.value === "number" ? r.value : 0,
      delta: typeof r.delta === "number" ? r.delta : undefined,
    }));

  const vfCandidate =
    typeof options.value_format === "string"
      ? options.value_format
      : typeof spec.value_format === "string"
        ? spec.value_format
        : undefined;
  const valueFormat =
    vfCandidate && VALUE_FORMATS.has(vfCandidate) ? (vfCandidate as ValueFormat) : undefined;

  const deltaFormat =
    typeof options.delta_format === "string" && VALUE_FORMATS.has(options.delta_format)
      ? (options.delta_format as ValueFormat)
      : undefined;

  const accent =
    typeof options.accent === "string" ? options.accent : (spec.theme?.accent ?? undefined);

  return { items, valueFormat, deltaFormat, accent };
}

export function RankedDeltaFrame({ spec }: { spec: ChartSpec }) {
  const { items, valueFormat, deltaFormat, accent } = extractRankedDeltaData(spec);

  if (items.length === 0) {
    return (
      <div style={{ padding: "1.5rem", textAlign: "center", color: "#6b7280", fontSize: 13 }}>
        No ranked items to display.
      </div>
    );
  }

  const svg = rankedDeltaSvg(items, {
    title: spec.title ?? "",
    accent: accent ?? "#e05c2e",
    valueFormat,
    deltaFormat,
    source: spec.source?.citation ?? undefined,
    asOf: spec.asOf ?? undefined,
  });

  // The builder emits a self-contained, sanitized SVG string (every data label
  // escaped via esc(); no <script>/<style>). Rendering it inline keeps the web
  // frame pixel-identical to the rasterized email PNG — one renderer, two surfaces.
  return <div style={{ width: "100%", maxWidth: 600 }} dangerouslySetInnerHTML={{ __html: svg }} />;
}
