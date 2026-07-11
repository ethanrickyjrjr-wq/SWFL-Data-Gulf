import type { ChartSpec } from "../chart-spec";
import {
  compositionSvg,
  extractCompositionData,
  resolveCompositionColors,
} from "@/lib/charts/svg/composition";

/**
 * CompositionFrame — the React wrapper for the parts-of-a-whole segmented-bar
 * shape. It does NOT draw the chart: it pulls `segments`/`callout` from
 * `spec.options`, resolves colors from `spec.theme`, and renders the SAME
 * pure SVG string the email PNG path rasterizes (`lib/charts/svg/composition.ts`).
 * One renderer, two surfaces — never forked (mirrors DotPlotFrame.tsx).
 *
 * spec.options shape:
 *   segments: Array<{ label: string; valuePct: number; color?: string }>
 *   callout?: string   — big-bold emphasis text, e.g. "357× AAL multiplier"
 */
export function CompositionFrame({ spec }: { spec: ChartSpec }) {
  const { segments, callout } = extractCompositionData(spec.options ?? {});
  const colors = resolveCompositionColors(segments, spec.theme);

  const svg = compositionSvg(segments, colors, {
    title: spec.title,
    callout,
    source: spec.source?.citation,
    asOf: spec.asOf,
  });

  return <div className="h-full w-full bg-neutral-900" dangerouslySetInnerHTML={{ __html: svg }} />;
}
