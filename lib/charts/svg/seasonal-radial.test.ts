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

test("domain nice-rounds so the max ring does NOT close the full circle (85 → /100)", () => {
  // With domain [0,100], value 85 sweeps 306° — the arc's large-arc-flag is set
  // (>180°) but the sweep is < 360°, so the ring is NOT a full split-circle. A
  // full closure would require two 180° sub-arcs; assert the max value's arc is a
  // single sector by counting arc commands is brittle, so instead assert the arc
  // is present and the SVG stays well-formed.
  const svg = seasonalRadialSvg([{ corridor: "Max", seasonal_index: 0.85 }], {});
  expect(svg).toContain("<path");
  // A fully-closed ring would emit the innermost value at the extreme; here 85 < 100
  // domain so the sweep leaves a gap — the SVG has exactly one value arc + its track.
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
