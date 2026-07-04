import { describe, expect, it } from "bun:test";
import { render } from "@react-email/render";
import { createElement } from "react";
import { MetricCardBlock } from "./MetricCardBlock";
import type { EmailGlobalStyle, MetricCardProps } from "../doc/types";

const GS: EmailGlobalStyle = {
  primaryColor: "#1F2937",
  accentColor: "#64748B",
  fontFamily: "MODERN_SANS",
  textColor: "#1F2937",
  backdropColor: "#F8FAFC",
};

const html = (props: MetricCardProps) =>
  render(createElement(MetricCardBlock, { props, globalStyle: GS }));

describe("MetricCardBlock", () => {
  it("renders value, label, sub, rank + movement captions", async () => {
    const out = await html({
      metricValue: "$421K",
      metricLabel: "Median Home Value",
      sub: "90-day median sale price",
      rankText: "#12 of 57 SWFL ZIPs",
      movementText: "↓ 2.1% YoY",
      barPct: 62,
    });
    expect(out).toContain("$421K");
    expect(out).toContain("Median Home Value");
    expect(out).toContain("90-day median sale price");
    expect(out).toContain("#12 of 57 SWFL ZIPs");
    expect(out).toContain("↓ 2.1% YoY");
  });

  it("draws the percentile bar at the held width", async () => {
    const out = await html({ metricValue: "$1", barPct: 62 });
    expect(out).toContain("width:62%");
  });

  it("clamps an out-of-range barPct rather than overflowing the cell", async () => {
    expect(await html({ metricValue: "$1", barPct: 140 })).toContain("width:100%");
    expect(await html({ metricValue: "$1", barPct: -10 })).toContain("width:0%");
  });

  it("renders NO bar when barPct is undefined (never a fabricated width)", async () => {
    const out = await html({ metricValue: "$1", metricLabel: "Permits" });
    expect(out).not.toContain("height:6px");
    expect(out).not.toMatch(/width:\d+%/);
  });
});
