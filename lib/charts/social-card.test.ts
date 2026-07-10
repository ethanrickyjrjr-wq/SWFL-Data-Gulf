// lib/charts/social-card.test.ts
// String-only assertions (pure, no resvg round-trip committed) — same posture
// as lib/charts/svg/donut-share.test.ts.
import { describe, expect, it } from "bun:test";
import { chartBlockToCardSvg } from "./social-card";
import type { ChartBlock } from "@/refinery/validate/chart-block-lint.mts";

const barBlock: ChartBlock = {
  title: "Median home value by city",
  columns: ["City", "Value"],
  rows: [
    ["Cape Coral", 389000],
    ["Fort Myers", 355000],
    ["Naples", 612000],
  ],
  chart_type: "bar",
  value_format: "usd",
  asOf: "2026-06-30",
  source: { citation: "SWFL Data Gulf home-value desk" },
};

describe("chartBlockToCardSvg", () => {
  it("renders a 1200x630 card with wordmark, title, bars, and provenance footer", () => {
    const svg = chartBlockToCardSvg(barBlock);
    expect(svg).toContain('width="1200"');
    expect(svg).toContain('height="630"');
    expect(svg).toContain("SWFL Data Gulf"); // wordmark
    expect(svg).toContain("Median home value by city"); // card title
    expect(svg).toContain("Cape Coral"); // bar labels made it through
    expect(svg).toContain("SWFL Data Gulf home-value desk · as of 06/30/2026");
    expect(svg).toContain("swfldatagulf.com");
  });

  it("renders an area block as a trend line (polyline present)", () => {
    const svg = chartBlockToCardSvg({
      ...barBlock,
      title: "Asking rent — Fort Myers",
      chart_type: "area",
      value_format: "currency",
      rows: [
        ["2025-01", 1850],
        ["2025-02", 1870],
        ["2025-03", 1905],
      ],
    });
    expect(svg).toContain("<polyline");
    expect(svg).toContain("Asking rent — Fort Myers");
  });

  it("falls back to big-stat layout for table blocks", () => {
    const svg = chartBlockToCardSvg({
      ...barBlock,
      title: "Quarter at a glance",
      chart_type: "table",
    });
    // no bar chart body, but the numeric values render as big stats
    // ($389k — formatAxisTick's real output; the formatter is the ONE value root)
    expect(svg).toContain("$389k");
    expect(svg).toContain("Cape Coral");
  });

  it("renders a title-only card when no cell is numeric", () => {
    const svg = chartBlockToCardSvg({
      ...barBlock,
      title: "Sources overview",
      chart_type: "table",
      rows: [["a", "b"]],
    });
    expect(svg).toContain("Sources overview");
    expect(svg).toContain('width="1200"');
  });

  it("area block with fewer than 2 points falls back instead of crashing", () => {
    const svg = chartBlockToCardSvg({
      ...barBlock,
      chart_type: "area",
      rows: [["2025-01", 1850]],
    });
    expect(svg).toContain('width="1200"');
  });

  it("omits the as-of clause when a legacy block has no asOf", () => {
    const { asOf: _drop, ...rest } = barBlock;
    const svg = chartBlockToCardSvg({ ...rest, asOf: undefined as unknown as string });
    expect(svg).not.toContain("as of");
  });

  it("throws on a malformed block", () => {
    expect(() => chartBlockToCardSvg({ title: 42 } as unknown as ChartBlock)).toThrow(
      "social-card: malformed chart block",
    );
  });
});
