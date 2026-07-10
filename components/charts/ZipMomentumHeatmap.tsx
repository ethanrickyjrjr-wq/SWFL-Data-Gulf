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
import { TooltipBox } from "./vendor/bklit/tooltip";
import { YOY_BUCKET_COLORS, type ZipHeatmapData } from "@/lib/charts/zip-heatmap-series";
import { formatAsOfDate } from "@/lib/charts/format";

export interface ZipMomentumHeatmapProps {
  grid: ZipHeatmapData;
  className?: string;
}

const BUCKET_LABELS = ["≤ −10%", "−10 to −5%", "−5 to 0%", "0 to 5%", "≥ 5%"];

// Cells color through levelStyles (bin.count IS the bucket level 0–4 — see
// zip-heatmap-series.ts); the default styles read undefined --chart-scale-N
// vars in this app and paint black.
const LEVEL_STYLES = YOY_BUCKET_COLORS.map((color) => ({
  color,
  fillMode: "solid",
  pattern: "none",
})) as unknown as HeatmapLevelStyles;

const TOOLTIP_MONTH = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * Cell readout naming the ZIP + month + real YoY %. The stock HeatmapTooltip
 * only sees (count, date) and can't name the column, so this child reads the
 * exported interaction context instead (no vendor fork). Must render INSIDE
 * HeatmapChart (needs the heatmap context for positioning).
 */
function ZipCellTooltip({ zipLabels, values }: { zipLabels: string[]; values: number[][] }) {
  const { containerRef, width, height } = useHeatmap();
  const { tooltipData } = useHeatmapInteraction();
  if (!tooltipData) return null;
  const { column, row, date, x, y } = tooltipData;
  const yoy = values[column]?.[row];
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
          ZIP {zipLabels[column] ?? "—"}
        </div>
        <div className="mt-0.5 text-chart-tooltip-muted text-xs">{TOOLTIP_MONTH.format(date)}</div>
        <div className="my-2 border-chart-tooltip-muted/30 border-t" />
        <div className="text-chart-tooltip-foreground text-sm">
          {typeof yoy === "number"
            ? `${yoy >= 0 ? "+" : ""}${yoy.toFixed(1)}% year over year`
            : "no data"}
        </div>
      </div>
    </TooltipBox>
  );
}

/**
 * ZIP×month home-value momentum grid: each cell is that ZIP's REAL YoY %
 * (carried as the bin count), colored by VALUE through 5 fixed diverging
 * buckets — never the upstream contribution quantization, so two months are
 * comparable. ZIPs run across (sorted by latest YoY), months run down. The
 * chart sizes itself via aspectRatio (cols/rows) with zero margins — upstream
 * axes are weekday-hardwired, so the wrapper renders its own labels and a
 * threshold legend (identity never color-alone).
 */
export function ZipMomentumHeatmap({ grid, className = "" }: ZipMomentumHeatmapProps) {
  const cols = grid.zipLabels.length;
  const rowsN = grid.monthLabels.length;

  return (
    <div
      className={`p-4 sm:p-6 rounded-2xl bg-[#0f1d24] border border-[#22414f] text-[#f0ede6] shadow-xl select-none ${className}`}
    >
      <p className="text-xs uppercase tracking-wider text-gray-400">Southwest Florida</p>
      <h3 className="mt-1 text-lg font-semibold">Where Home Values Are Moving, ZIP by ZIP</h3>
      <p className="text-sm text-gray-500">
        Year-over-year home-value change — the {cols / 2} ZIP codes holding value best (left) and
        the {cols / 2} falling hardest (right), trailing {rowsN} months top to bottom
      </p>
      <HeatmapInteractionProvider>
        <HeatmapInteractionBoundary>
          <div className="mt-4 grid grid-cols-[auto_1fr] gap-x-2">
            <div
              className="grid text-right text-[10px] leading-none font-mono text-gray-500"
              style={{ gridTemplateRows: `repeat(${rowsN}, 1fr)` }}
              aria-hidden
            >
              {grid.monthLabels.map((m) => (
                <span key={m} className="self-center">
                  {m}
                </span>
              ))}
            </div>
            <div className="min-w-0">
              <HeatmapChart
                data={grid.columns}
                layout="fluid"
                levelStyles={LEVEL_STYLES}
                aspectRatio={`${cols} / ${rowsN}`}
                margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
              >
                <HeatmapCells inactiveOpacity={1} inactiveScale={1} />
                <ZipCellTooltip zipLabels={grid.zipLabels} values={grid.values} />
              </HeatmapChart>
            </div>
            <div
              className="col-start-2 mt-1 flex justify-between font-mono text-gray-500"
              aria-hidden
            >
              {grid.zipLabels.map((z) => (
                <span key={z} className="text-[9px] [writing-mode:vertical-rl]">
                  {z}
                </span>
              ))}
            </div>
          </div>
        </HeatmapInteractionBoundary>
      </HeatmapInteractionProvider>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] font-mono text-gray-500">
        <span>YoY change:</span>
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
      <p className="mt-3 text-xs text-gray-500 font-mono">
        as of {formatAsOfDate(grid.asOf)} · Zillow Home Value Index (ZHVI)
      </p>
    </div>
  );
}
