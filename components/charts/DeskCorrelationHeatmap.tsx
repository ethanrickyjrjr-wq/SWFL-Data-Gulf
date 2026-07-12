"use client";

import {
  HeatmapCells,
  HeatmapChart,
  HeatmapInteractionBoundary,
  HeatmapInteractionProvider,
  useHeatmap,
  useHeatmapInteraction,
  type HeatmapLevelStyles,
} from "./vendor/bklit/heatmap";
import type { HeatmapColumn } from "./vendor/bklit/heatmap/heatmap-context";
import { TooltipBox } from "./vendor/bklit/tooltip";
import { YOY_BUCKET_COLORS } from "@/lib/charts/zip-heatmap-series";
import type { CorrelationData } from "@/lib/desk/types";

// Five diverging buckets over r ∈ [−1, 1]; the gulf coral→teal ramp reads
// negative→positive (design language forbids stock red/green). bin.count
// carries the BUCKET LEVEL — the real r rides in `data.matrix` for the tooltip
// (same trick as ZipMomentumHeatmap; the vendored cells quantize counts 0–4).
const BUCKET_LABELS = ["≤ −0.6", "−0.6 to −0.2", "−0.2 to 0.2", "0.2 to 0.6", "≥ 0.6"];

const LEVEL_STYLES = YOY_BUCKET_COLORS.map((color) => ({
  color,
  fillMode: "solid",
  pattern: "none",
})) as unknown as HeatmapLevelStyles;

function bucket(r: number | null): number {
  if (r == null) return 2;
  if (r <= -0.6) return 0;
  if (r < -0.2) return 1;
  if (r < 0.2) return 2;
  if (r < 0.6) return 3;
  return 4;
}

function CorrelationTooltip({ data }: { data: CorrelationData }) {
  const { containerRef, width, height } = useHeatmap();
  const { tooltipData } = useHeatmapInteraction();
  if (!tooltipData) return null;
  const { column, row, x, y } = tooltipData;
  const r = data.matrix[column]?.[row];
  return (
    <TooltipBox
      animate={false}
      entrance={false}
      visible
      x={x}
      y={y}
      containerRef={containerRef}
      containerWidth={width}
      containerHeight={height}
    >
      <div className="px-3 py-2.5 text-left">
        <div className="font-medium text-chart-tooltip-foreground text-xs">
          {data.labels[column] ?? "—"} × {data.labels[row] ?? "—"}
        </div>
        <div className="my-2 border-chart-tooltip-muted/30 border-t" />
        <div className="text-chart-tooltip-foreground text-sm">
          {typeof r === "number" ? `r = ${r >= 0 ? "+" : ""}${r.toFixed(2)}` : "no data"}
        </div>
      </div>
    </TooltipBox>
  );
}

/**
 * Metric×metric Pearson matrix across the core ZIPs (computed deterministically
 * in lib/desk/correlation.ts — never model math). Descriptive, not causal: the
 * zone copy says how signals MOVED together, and states the n. Renders through
 * the vendored bklit heatmap with our own HTML labels — the upstream axes are
 * weekday-calendar-hardwired (same call-site pattern as ZipMomentumHeatmap).
 */
export function DeskCorrelationHeatmap({ data }: { data: CorrelationData }) {
  const k = data.labels.length;
  const columns: HeatmapColumn[] = data.matrix.map((col, ci) => ({
    bin: ci,
    bins: col.map((r, ri) => ({
      bin: ri,
      count: bucket(r),
      date: new Date(Date.UTC(2000, 0, ri + 1)),
    })),
  }));

  return (
    <div>
      <HeatmapInteractionProvider>
        <HeatmapInteractionBoundary>
          <div className="grid max-w-md grid-cols-[auto_1fr] gap-x-2">
            <div
              className="grid text-right text-[10px] leading-none text-gray-500"
              style={{ gridTemplateRows: `repeat(${k}, 1fr)` }}
              aria-hidden
            >
              {data.labels.map((l) => (
                <span key={l} className="self-center">
                  {l}
                </span>
              ))}
            </div>
            <div className="min-w-0">
              <HeatmapChart
                data={columns}
                layout="fluid"
                levelStyles={LEVEL_STYLES}
                aspectRatio={`${k} / ${k}`}
                margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
              >
                <HeatmapCells inactiveOpacity={1} inactiveScale={1} />
                <CorrelationTooltip data={data} />
              </HeatmapChart>
            </div>
            <div
              className="col-start-2 mt-1 grid text-center"
              style={{ gridTemplateColumns: `repeat(${k}, 1fr)` }}
              aria-hidden
            >
              {data.labels.map((l) => (
                <span key={l} className="text-[9px] leading-tight text-gray-500">
                  {l}
                </span>
              ))}
            </div>
          </div>
        </HeatmapInteractionBoundary>
      </HeatmapInteractionProvider>
      <div className="mt-3 flex flex-wrap items-center gap-3 font-mono text-[10px] text-gray-500">
        <span>correlation r:</span>
        {BUCKET_LABELS.map((label, i) => (
          <span key={label} className="flex items-center gap-1">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: YOY_BUCKET_COLORS[i] }}
            />
            {label}
          </span>
        ))}
      </div>
      <p className="mt-3 text-xs text-gray-500">
        How these market signals moved together across {data.zipCount} Lee + Collier ZIP codes —
        descriptive association only, not cause and not a forecast.
      </p>
    </div>
  );
}
