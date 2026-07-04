import { describe, expect, it } from "bun:test";
import { compileGrid } from "./compile-grid";
import { isGridDoc } from "./grid-schema";
import type { EmailDoc } from "./doc/types";

// A doc shaped like the ZIP seed: a shape+identity row and metric-card rows two-up.
// It must be recognized as a grid doc and compile without throwing.
const DOC: EmailDoc = {
  globalStyle: {
    primaryColor: "#1F2937",
    accentColor: "#64748B",
    fontFamily: "MODERN_SANS",
    textColor: "#1F2937",
    backdropColor: "#F8FAFC",
  },
  blocks: [
    { id: "h", type: "header", props: { companyName: "X" }, layout: { x: 0, y: 0, w: 12, h: 2 } },
    {
      id: "img",
      type: "image",
      props: { url: "https://x/s.png", alt: "cutout" },
      layout: { x: 0, y: 2, w: 4, h: 4 },
    },
    {
      id: "id",
      type: "hero",
      props: { value: "Cape Coral", label: "ZIP 33914" },
      layout: { x: 4, y: 2, w: 8, h: 4 },
    },
    {
      id: "m1",
      type: "metric-card",
      props: {
        metricValue: "$4.2K",
        metricLabel: "Annual Flood Loss",
        barPct: 96,
        rankText: "#3 of 57 SWFL ZIPs",
      },
      layout: { x: 0, y: 6, w: 6, h: 4 },
    },
    {
      id: "m2",
      type: "metric-card",
      props: {
        metricValue: "$421K",
        metricLabel: "Median Home Value",
        barPct: 62,
        movementText: "↓ 2.1% YoY",
      },
      layout: { x: 6, y: 6, w: 6, h: 4 },
    },
    {
      id: "m3",
      type: "metric-card",
      props: { metricValue: "18", metricLabel: "New Permits (90 Days)" },
      layout: { x: 0, y: 10, w: 6, h: 4 },
    },
    { id: "f", type: "footer", props: {}, layout: { x: 0, y: 14, w: 12, h: 3, static: true } },
  ],
};

describe("compileGrid with metric-card rows", () => {
  it("isGridDoc recognizes the positioned seed doc", () => {
    expect(isGridDoc(DOC.blocks)).toBe(true);
  });

  it("compiles to email HTML without throwing, with the held values present", async () => {
    const html = await compileGrid(DOC);
    expect(typeof html).toBe("string");
    expect(html).toMatch(/<html/i);
    expect(html).toContain("$4.2K");
    expect(html).toContain("Annual Flood Loss");
    expect(html).toContain("#3 of 57 SWFL ZIPs");
    expect(html).toContain("$421K");
    // the header sits at the top (y:0), footer at the bottom (y:14) — not pooled
    expect(html.indexOf("$4.2K")).toBeLessThan(html.indexOf("$421K"));
  });
});
