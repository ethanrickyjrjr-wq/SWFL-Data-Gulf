import { test, expect } from "bun:test";
import { seasonalRadialSvg } from "./seasonal-radial";

const DATA = [
  { corridor: "US 41 - Downtown Fort Myers", seasonal_index: 0.85 },
  { corridor: "Cape Coral SW", seasonal_index: 0.64 },
  { corridor: "Bonita Springs / Estero", seasonal_index: 0.42 },
  { corridor: "Naples 5th Ave", seasonal_index: 0.77 },
  { corridor: "Lehigh Acres Industrial", seasonal_index: 0.18 },
];

test("seasonalRadialSvg emits a self-contained SVG with the title + legend", () => {
  const svg = seasonalRadialSvg(DATA, { title: "Corridor Seasonality Index" });
  expect(svg).toContain("<svg");
  expect(svg).toContain("</svg>");
  expect(svg).toContain("CORRIDOR SEASONALITY INDEX");
  // Legend re-states each REAL value (no invented number) as a percent.
  expect(svg).toContain("85%");
  expect(svg).toContain("18%");
});

test("value → seasonal_index × 100, rounded (0.85 → 85)", () => {
  const svg = seasonalRadialSvg([{ corridor: "A", seasonal_index: 0.85 }], {});
  expect(svg).toContain("85%");
});

test("the leading corridor prefix is trimmed for the legend (US 41 - X → X)", () => {
  const svg = seasonalRadialSvg(DATA, {});
  expect(svg).toContain("Downtown Fort Myers");
  expect(svg).not.toContain("US 41 - Downtown Fort Myers");
});

test("domain is [0, dataMax] — VERIFIED recharts skips nice-widening on the angleAxis", () => {
  // The value axis is NOT nice-widened (see the seasonal-radial.ts domainMax
  // comment citing the recharts source): the max-value ring sweeps the full circle.
  // A single-datum chart is therefore its own max → a full-sweep value arc, which
  // annularSector renders as TWO sub-arcs (split to avoid a degenerate 360° arc).
  const svg = seasonalRadialSvg([{ corridor: "Max", seasonal_index: 0.85 }], {});
  // One ring = 1 background track path + 1 value-arc path (each a full circle,
  // internally split into two sub-arcs within a single <path> d attribute).
  const pathCount = (svg.match(/<path /g) ?? []).length;
  expect(pathCount).toBe(2);
  expect(svg).toContain("85%");
});

test("as-of renders MM/DD/YYYY, never the raw ISO (Rule 2)", () => {
  const svg = seasonalRadialSvg(DATA, { asOf: "2026-06-30", source: "cre-swfl" });
  expect(svg).toContain("06/30/2026");
  expect(svg).not.toContain("2026-06-30");
  expect(svg).toContain("cre-swfl");
});

test("empty input returns a graceful (data-less) SVG, never throws", () => {
  const svg = seasonalRadialSvg([], { title: "Corridor Seasonality Index" });
  expect(svg).toContain("<svg");
  expect(svg).toContain("No seasonality data available.");
});
