import { test, expect } from "bun:test";
import { compositionSvg, extractCompositionData, resolveCompositionColors } from "./composition";

test("extractCompositionData reads segments + optional callout", () => {
  const out = extractCompositionData({
    segments: [
      { label: "SFHA (in flood zone)", valuePct: 32 },
      { label: "Outside SFHA", valuePct: 68 },
    ],
    callout: "357× AAL multiplier",
  });
  expect(out.segments).toHaveLength(2);
  expect(out.segments[0]).toEqual({
    label: "SFHA (in flood zone)",
    valuePct: 32,
    color: undefined,
  });
  expect(out.callout).toBe("357× AAL multiplier");
});

test("resolveCompositionColors: explicit segment color wins over the generated palette", () => {
  const colors = resolveCompositionColors([{ color: "#ff0000" }, {}], { accent: "#3dc9c0" });
  expect(colors[0]).toBe("#ff0000");
  expect(colors[1]).not.toBe("#ff0000");
});

test("compositionSvg draws a segmented bar + legend + optional callout", () => {
  const svg = compositionSvg(
    [
      { label: "SFHA", valuePct: 32 },
      { label: "Outside SFHA", valuePct: 68 },
    ],
    ["#e05c2e", "#3dc9c0"],
    {
      title: "Flood exposure composition",
      callout: "357× AAL multiplier",
      source: "env-swfl",
      asOf: "2026-06-30",
    },
  );
  expect(svg).toContain("<svg");
  expect(svg).toContain("Flood exposure composition");
  expect(svg).toContain("357× AAL multiplier");
  expect(svg).toContain("SFHA");
  expect(svg).toContain("32.0%");
  expect(svg).toContain("06/30/2026");
});

test("compositionSvg renders no callout box when callout is absent", () => {
  const svg = compositionSvg([{ label: "A", valuePct: 100 }], ["#e05c2e"], { title: "Share" });
  expect(svg).not.toContain("×");
});
