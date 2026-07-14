"use client";

// components/charts/vendor/bklit/fit-glow.tsx
//
// THE BACKLIT FIT, on a live bklit chart. The interactive twin of
// lib/charts/svg/fit-trend.ts — same model, same law, same picture, one painted by a
// browser and one by a rasterizer.
//
// It renders in the UNDERLAY slot: above the grid, BELOW the series. That is not a
// styling preference, it is the argument. The observed line is a fact; the fit is an
// [INFERENCE] about it. Put the two at the same crispness and the straight line wins
// the eye every time — a claim outshining the data it was drawn from. So the fit sits
// behind, wide and soft, and the data stays in front of it.
//
// The glow is a STACK OF STROKES on one path (wide+faint → mid → thin+bright), never an
// SVG <filter> blur — identical reasoning to the SVG builder: geometry cannot be
// unsupported, and a filter that silently drops leaves a chart that looks finished.
//
// THIS COMPONENT DECIDES NOTHING. It takes the layers lib/charts/fit-overlay.ts built
// and paints them. A line means that window's direction is established; a fan means it
// is not, and a fan HAS NO LINE IN IT — not the midline, not the likelier edge. Picking
// a side would read the sign of a slope the engine has ruled unreadable, and it would do
// it in a path element, where no gate is watching.

import { useMemo } from "react";
import { useChartStable, useYScale } from "./chart-context";
import type { FitCurve, FitLayer } from "@/lib/charts/fit-overlay";

/**
 * Same palette as the SVG builder and as the rest of the app: mangrove climbs,
 * sunset-coral slides, and an unreadable direction is NEUTRAL GOLD — never grey. Grey is
 * our colour for missing data. "No direction established" is not missing data; it is a
 * finding, from a series we fitted in full.
 */
const HUE = {
  up: "#5BC97A",
  down: "#E08158",
  none: "#D4B370",
} as const;

interface FitGlowProps {
  layers: FitLayer[];
  yAxisId?: string | number;
}

export function FitGlow({ layers, yAxisId }: FitGlowProps) {
  const { xScale } = useChartStable();
  const yScale = useYScale(yAxisId);

  const paths = useMemo(() => {
    const pt = (c: FitCurve) => {
      const x1 = xScale(c.from.when);
      const x2 = xScale(c.to.when);
      const y1 = yScale(c.from.y);
      const y2 = yScale(c.to.y);
      if ([x1, x2, y1, y2].some((v) => typeof v !== "number" || !Number.isFinite(v))) return null;
      return { x1: x1 as number, x2: x2 as number, y1: y1 as number, y2: y2 as number };
    };

    return layers
      .map((layer, i) => {
        const hue = HUE[layer.direction ?? "none"];

        if (layer.line) {
          const p = pt(layer.line);
          if (!p) return null;
          const d = `M ${p.x1},${p.y1} L ${p.x2},${p.y2}`;
          return (
            <g key={`fit-line-${i}`}>
              <path
                d={d}
                fill="none"
                stroke={hue}
                strokeWidth={12}
                strokeOpacity={0.14}
                strokeLinecap="round"
              />
              <path
                d={d}
                fill="none"
                stroke={hue}
                strokeWidth={6}
                strokeOpacity={0.26}
                strokeLinecap="round"
              />
              <path
                d={d}
                fill="none"
                stroke={hue}
                strokeWidth={2}
                strokeOpacity={0.85}
                strokeLinecap="round"
              />
            </g>
          );
        }

        if (layer.fan) {
          const hi = pt(layer.fan.hi);
          const lo = pt(layer.fan.lo);
          if (!hi || !lo) return null;
          // NO STROKE ON THE EDGES. An edge drawn as a line is a line, and a reader will
          // follow it as one — which is the exact thing this shape exists to refuse.
          //
          // 0.28, not the 0.16 the light-background SVG uses. Neutral-gold at 0.16 over this
          // panel's near-black (#0f1d24) washes out to a flat GREY — and grey is this app's
          // colour for MISSING DATA. "No direction established" is not missing data: it is a
          // finding, from a series we fitted in full. A washed-out fan silently refiles our
          // own answer under "we don't know."
          return (
            <path
              key={`fit-fan-${i}`}
              d={`M ${hi.x1},${hi.y1} L ${hi.x2},${hi.y2} L ${lo.x2},${lo.y2} L ${lo.x1},${lo.y1} Z`}
              fill={hue}
              fillOpacity={0.28}
              stroke="none"
            />
          );
        }

        return null;
      })
      .filter(Boolean);
  }, [layers, xScale, yScale]);

  if (paths.length === 0) return null;
  return <g aria-hidden="true">{paths}</g>;
}

// The name is the contract: time-series-chart-shell.tsx routes children to the underlay
// slot BY DISPLAY NAME (see chart-child-passthrough.ts). Rename this and the fit quietly
// paints on top of the data instead of behind it — same picture, opposite argument.
FitGlow.displayName = "FitGlow";
