"use client";

import { memo } from "react";
import { TooltipBox } from "../tooltip/tooltip-box";
import { useHeatmap, useHeatmapInteraction } from "./heatmap-context";
import {
  formatHeatmapContributionLabel,
  formatHeatmapTooltipDate,
  formatHeatmapTooltipWeekday,
} from "./heatmap-utils";
import { useDelayedTooltipData } from "./use-delayed-tooltip-data";

export interface HeatmapTooltipProps {
  /** Custom contribution line (bottom section). Default: `N contribution(s)`. */
  formatLabel?: (count: number, date: Date) => string;
  /** FORK(swfl): custom header title. Default: upstream date formatting. */
  formatTitle?: (date: Date) => string;
  /** FORK(swfl): custom header subtitle; return null to hide the line. Default: upstream weekday. */
  formatSubtitle?: (date: Date) => string | null;
  /** Custom class name */
  className?: string;
  /** Inline styles for the tooltip panel (background, blur, etc.). */
  panelStyle?: React.CSSProperties;
  /**
   * Tooltip panel background color (CSS variable or color value).
   * Default: `var(--chart-tooltip-background)`.
   */
  backgroundColor?: string;
  /**
   * Delay before showing the tooltip on first hover (ms).
   * Moving between cells updates immediately once visible.
   */
  showDelay?: number;
  /**
   * Grace period before hiding when the pointer leaves a cell (ms).
   * Helps avoid flicker when moving quickly between adjacent cells.
   */
  hideDelay?: number;
  /**
   * When true, the tooltip appears and disappears instantly with no motion.
   */
  instant?: boolean;
}

export const HeatmapTooltip = memo(function HeatmapTooltip({
  formatLabel = formatHeatmapContributionLabel,
  formatTitle = formatHeatmapTooltipDate,
  formatSubtitle = formatHeatmapTooltipWeekday,
  className = "",
  panelStyle,
  backgroundColor,
  showDelay = 0,
  hideDelay = 120,
  instant = false,
}: HeatmapTooltipProps) {
  const { containerRef, width, height } = useHeatmap();
  const { tooltipData } = useHeatmapInteraction();
  const displayData = useDelayedTooltipData(tooltipData, showDelay, hideDelay);

  if (!displayData) {
    return null;
  }

  const { count, date } = displayData;

  return (
    <TooltipBox
      animate={false}
      backgroundColor={backgroundColor}
      className={className}
      containerHeight={height}
      containerRef={containerRef}
      containerWidth={width}
      entrance={!instant}
      panelStyle={panelStyle}
      visible
      x={displayData.x}
      y={displayData.y}
    >
      <div className="overflow-hidden">
        <div className="px-3 py-2.5 text-left">
          <div className="font-medium text-chart-tooltip-foreground text-xs">
            {formatTitle(date)}
          </div>
          {formatSubtitle(date) != null && (
            <div className="mt-0.5 text-chart-tooltip-muted text-xs">{formatSubtitle(date)}</div>
          )}
          <div className="my-2 border-chart-tooltip-muted/30 border-t" />
          <div className="text-chart-tooltip-foreground text-sm">{formatLabel(count, date)}</div>
        </div>
      </div>
    </TooltipBox>
  );
});

HeatmapTooltip.displayName = "HeatmapTooltip";

export default HeatmapTooltip;
