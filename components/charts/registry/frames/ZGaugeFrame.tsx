"use client";

import type { ChartSpec } from "../chart-spec";

// ---------------------------------------------------------------------------
// Data-adapter (exported for pure-function testing — no React dependency)
// ---------------------------------------------------------------------------

export interface GaugeData {
  value: number;
  baseline: number;
  min: number;
  max: number;
  unit: string;
  segments: number;
  /** 0-based index of the segment the value occupies */
  valueSegmentIndex: number;
  /** 0-based index of the segment the baseline occupies */
  baselineSegmentIndex: number;
  /** 0–1 fraction of the full range where the value sits (exposed for tests). */
  valueFraction: number;
}

/**
 * Extract and validate gauge parameters from `spec.options`.
 * Returns `null` when the options are missing or `value` is absent — the
 * frame will render a graceful fallback instead of crashing.
 */
export function extractGaugeData(options: Record<string, unknown> | undefined): GaugeData | null {
  if (!options) return null;

  const value = typeof options.value === "number" ? options.value : null;
  if (value === null) return null;

  const baseline = typeof options.baseline === "number" ? options.baseline : 0;
  const min = typeof options.min === "number" ? options.min : 0;
  const max = typeof options.max === "number" ? options.max : 100;
  const unit = typeof options.unit === "string" ? options.unit : "";
  const segments =
    typeof options.segments === "number" && options.segments > 0 ? Math.round(options.segments) : 9;

  // Clamp value to [min, max] for display purposes
  const range = max - min || 1; // avoid div-by-zero
  const valueFraction = Math.min(1, Math.max(0, (value - min) / range));
  const baselineFraction = Math.min(1, Math.max(0, (baseline - min) / range));

  const valueSegmentIndex = Math.min(segments - 1, Math.floor(valueFraction * segments));
  const baselineSegmentIndex = Math.min(segments - 1, Math.floor(baselineFraction * segments));

  return {
    value,
    baseline,
    min,
    max,
    unit,
    segments,
    valueSegmentIndex,
    baselineSegmentIndex,
    valueFraction,
  };
}

// ---------------------------------------------------------------------------
// Colour helper — below baseline = cool/warning, above = warm/growth
// ---------------------------------------------------------------------------

function segmentColor(segIndex: number, baselineSegmentIndex: number, segments: number): string {
  const distFromBaseline = segIndex - baselineSegmentIndex;

  if (distFromBaseline < 0) {
    // Below baseline: scale from deep-orange (far below) to amber (near baseline)
    const intensity = Math.abs(distFromBaseline) / Math.max(1, baselineSegmentIndex);
    const alpha = 0.35 + intensity * 0.65;
    return `rgba(234, 88, 12, ${alpha.toFixed(2)})`; // orange-600 spectrum
  }
  if (distFromBaseline === 0) {
    // Baseline segment: neutral slate
    return "rgba(100, 116, 139, 0.70)"; // slate-500
  }
  // Above baseline: scale from teal (near) to emerald (far above)
  const maxAbove = segments - 1 - baselineSegmentIndex;
  const intensity = distFromBaseline / Math.max(1, maxAbove);
  const alpha = 0.35 + intensity * 0.65;
  return `rgba(5, 150, 105, ${alpha.toFixed(2)})`; // emerald-600 spectrum
}

// ---------------------------------------------------------------------------
// ZGaugeFrame component
// ---------------------------------------------------------------------------

export function ZGaugeFrame({ spec }: { spec: ChartSpec }) {
  const gauge = extractGaugeData(spec.options);

  // Caption shared by both the main render and the fallback
  const caption = (
    <p className="mt-3 text-xs text-slate-400 text-center">
      As of {spec.asOf}
      {spec.source?.citation ? ` · ${spec.source.citation}` : ""}
    </p>
  );

  if (!gauge) {
    return (
      <div className="rounded-xl bg-slate-800 p-5 text-slate-300">
        <p className="text-sm font-medium mb-2">{spec.title}</p>
        <p className="text-xs text-slate-500">Gauge data unavailable.</p>
        {caption}
      </div>
    );
  }

  const { value, baseline, min, max, unit, segments, valueSegmentIndex, baselineSegmentIndex } =
    gauge;

  // Format displayed number — round to 1 decimal
  const displayValue = value % 1 === 0 ? value.toFixed(0) : value.toFixed(1);
  const displayBaseline = baseline % 1 === 0 ? baseline.toFixed(0) : baseline.toFixed(1);

  return (
    <div className="rounded-xl bg-slate-800 p-5">
      {/* Title */}
      <p className="text-sm font-semibold text-slate-200 mb-4">{spec.title}</p>

      {/* Prominent value label */}
      <div className="flex items-baseline gap-2 mb-4">
        <span className="text-4xl font-bold text-white">{displayValue}</span>
        {unit && <span className="text-xs text-slate-400 leading-none">{unit}</span>}
      </div>

      {/* Segmented gauge bar */}
      <div className="relative mb-1">
        <div className="flex gap-0.5 h-6 w-full rounded overflow-hidden">
          {Array.from({ length: segments }, (_, i) => {
            const isActive = i === valueSegmentIndex;
            const color = segmentColor(i, baselineSegmentIndex, segments);
            return (
              <div
                key={i}
                className="flex-1 transition-all duration-300 relative"
                style={{
                  backgroundColor: color,
                  // Active segment gets a bright top border to mark the needle
                  outline: isActive ? "2px solid white" : "none",
                  outlineOffset: "-1px",
                }}
              />
            );
          })}
        </div>

        {/* Baseline marker — vertical tick below the gauge */}
        <div
          className="absolute -bottom-3 flex flex-col items-center"
          style={{
            left: `${(baselineSegmentIndex / segments) * 100 + 100 / segments / 2}%`,
            transform: "translateX(-50%)",
          }}
        >
          <div className="w-px h-2 bg-slate-400" />
          <span className="text-[9px] text-slate-400 whitespace-nowrap mt-0.5">
            base {displayBaseline}
          </span>
        </div>
      </div>

      {/* Min / max scale labels */}
      <div className="flex justify-between mt-6 text-[10px] text-slate-500">
        <span>{min}</span>
        <span>{max}</span>
      </div>

      {/* Value-vs-baseline delta pill */}
      {(() => {
        const delta = value - baseline;
        const sign = delta >= 0 ? "+" : "";
        const color =
          delta > 0
            ? "bg-emerald-900/60 text-emerald-300"
            : delta < 0
              ? "bg-orange-900/60 text-orange-300"
              : "bg-slate-700 text-slate-400";
        return (
          <div className="mt-3 flex justify-center">
            <span className={`text-xs px-2 py-0.5 rounded-full ${color}`}>
              {sign}
              {delta.toFixed(1)} vs baseline {displayBaseline}
            </span>
          </div>
        );
      })()}

      {caption}
    </div>
  );
}
