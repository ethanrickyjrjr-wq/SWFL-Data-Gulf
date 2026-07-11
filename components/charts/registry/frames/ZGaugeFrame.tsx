"use client";

import type { ChartSpec } from "../chart-spec";
import { zGaugeSvg, extractGaugeData } from "@/lib/charts/svg/z-gauge";
import { friendlyAsOf } from "@/lib/project/as-of";

/**
 * ZGaugeFrame — the React wrapper for the single-value-vs-bound gauge shape.
 * Renders the SAME pure SVG string the email PNG path rasterizes
 * (`lib/charts/svg/z-gauge.ts`). One renderer, two surfaces.
 */
export function ZGaugeFrame({ spec }: { spec: ChartSpec }) {
  const gauge = extractGaugeData(spec.options);

  if (!gauge) {
    return (
      <div className="rounded-xl bg-slate-800 p-5 text-slate-300">
        <p className="text-sm font-medium mb-2">{spec.title}</p>
        <p className="text-xs text-slate-500">Gauge data unavailable.</p>
        <p className="mt-3 text-xs text-slate-400 text-center">
          As of {friendlyAsOf(spec.asOf)}
          {spec.source?.citation ? ` · ${spec.source.citation}` : ""}
        </p>
      </div>
    );
  }

  const svg = zGaugeSvg(gauge, {
    title: spec.title,
    source: spec.source?.citation,
    asOf: spec.asOf,
  });

  return <div className="rounded-xl overflow-hidden" dangerouslySetInnerHTML={{ __html: svg }} />;
}
