import type { ValueFormat } from "@/lib/charts/format";
import { dotPlotSvg, type DotPlotItem } from "@/lib/charts/svg/dot-plot";
import type { ChartSpec } from "../chart-spec";

/**
 * DotPlotFrame — the React wrapper for the dot-plot / comparison shape ("this
 * place vs a reference", two dots on a line per row). It does NOT re-draw the
 * chart: it pulls the rows from `spec.options`, the accent from `spec.theme`, and
 * renders the SAME pure SVG string the email PNG path rasterizes
 * (`lib/charts/svg/dot-plot.ts`). One renderer, two surfaces — never forked.
 *
 * spec.options shape:
 *   data: Array<{ label: string; value: number; reference?: number }>
 *   valueFormat?: ValueFormat   — "usd" | "rent" | "count" | "pct" | "index"
 *   referenceLabel?: string     — legend name for the grey dot (default "reference")
 */

/** Pure data-adapter — exported so tests can import it without a DOM. */
export function extractDotPlotData(options: Record<string, unknown> | undefined): {
  data: DotPlotItem[];
  valueFormat: ValueFormat | undefined;
  referenceLabel: string | undefined;
} {
  const raw = options?.data;
  const data: DotPlotItem[] = Array.isArray(raw)
    ? raw
        .filter(
          (r): r is Record<string, unknown> =>
            r !== null && typeof r === "object" && !Array.isArray(r),
        )
        .map((r) => ({
          label: typeof r.label === "string" ? r.label : "",
          value: typeof r.value === "number" ? r.value : 0,
          reference: typeof r.reference === "number" ? r.reference : undefined,
        }))
    : [];
  const valueFormat =
    typeof options?.valueFormat === "string" ? (options.valueFormat as ValueFormat) : undefined;
  const referenceLabel =
    typeof options?.referenceLabel === "string" ? options.referenceLabel : undefined;
  return { data, valueFormat, referenceLabel };
}

export function DotPlotFrame({ spec }: { spec: ChartSpec }) {
  const { data, valueFormat, referenceLabel } = extractDotPlotData(spec.options);
  const accent = spec.theme?.accent ?? "#e05c2e";

  const svg = dotPlotSvg(data, {
    title: spec.title,
    accent,
    valueFormat,
    referenceLabel,
    source: spec.source?.citation,
    asOf: spec.asOf,
  });

  // The wrapper just mounts the pure SVG string; the email path rasterizes the
  // identical string. SVG is builder-escaped + email-safe (no script/style/canvas).
  return (
    <div
      className="flex h-full w-full items-center justify-center bg-white"
       
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
