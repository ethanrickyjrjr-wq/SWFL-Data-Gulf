import type { ChartSpec } from "../chart-spec";
import type { ValueFormat } from "@/lib/charts/format";
import { donutShareSvg, type DonutSegment } from "@/lib/charts/svg/donut-share";

/**
 * DonutShareFrame — the React surface for the DONUT/SHARE shape (frameId
 * "donut-share"). It is a THIN wrapper: it pulls the segments from `spec.options`
 * and renders the EXACT SAME `donutShareSvg(...)` string the email PNG path
 * rasterizes. One renderer, two surfaces — the frame never forks the geometry.
 *
 * No hooks, no DOM access (the SVG is injected as a string), so no "use client"
 * — same as CompositionFrame, the parts-of-whole sibling.
 *
 * spec.options shape:
 *   segments: Array<{ label: string; value: number; color?: string }>
 *   total?: number          — center total (defaults to sum of values)
 *   unit?: string           — small label under the center number
 *   valueFormat?: ValueFormat — "usd" | "rent" | "count" | "pct" | "index"
 *
 * Provenance (`asOf`, `source`) is inherited from ChartBlock on `spec`; accent
 * comes from `spec.theme`.
 */

const VALUE_FORMATS = new Set<ValueFormat>(["usd", "rent", "count", "pct", "index"]);

export function extractDonutSegments(options: Record<string, unknown> | undefined): DonutSegment[] {
  const raw = options?.segments;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (s): s is Record<string, unknown> => s !== null && typeof s === "object" && !Array.isArray(s),
    )
    .map((s) => ({
      label: typeof s.label === "string" ? s.label : "",
      value: typeof s.value === "number" ? s.value : 0,
      color: typeof s.color === "string" ? s.color : undefined,
    }));
}

export function DonutShareFrame({ spec }: { spec: ChartSpec }) {
  const options = spec.options ?? {};
  const segments = extractDonutSegments(options);
  const total = typeof options.total === "number" ? options.total : undefined;
  const unit = typeof options.unit === "string" ? options.unit : undefined;
  const valueFormat =
    typeof options.valueFormat === "string" && VALUE_FORMATS.has(options.valueFormat as ValueFormat)
      ? (options.valueFormat as ValueFormat)
      : undefined;
  const accent = spec.theme?.accent ?? spec.theme?.primary ?? "#2563EB";

  const svg = donutShareSvg(segments, {
    title: spec.title,
    accent,
    total,
    unit,
    valueFormat,
    source: spec.source?.citation,
    asOf: spec.asOf,
  });

  return (
    <div
      className="w-full overflow-hidden rounded-lg bg-white"
      // The SVG is built by our own pure builder (no external/user HTML) and is
      // email-safe (no <script>/<style>/<foreignObject>) — safe to inject.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
