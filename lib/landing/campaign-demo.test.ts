import { describe, it, expect } from "bun:test";
import { buildCampaignDemo, naturalPlace } from "./campaign-demo";

/** Synthetic fixtures — test-only values, never rendered anywhere. */
const placeNames = { "33914": "Cape Coral", "34102": "Naples" };

describe("buildCampaignDemo", () => {
  it("picks the busiest live market and stamps every figure with its source + date", () => {
    const demo = buildCampaignDemo({
      value: { data: { "33914": 390000, "34102": 2100000 }, asOf: "05/01/2026" },
      activity: { data: { "33914": 812, "34102": 300 }, asOf: "07/11/2026" },
      dom: { data: { "33914": 74.4 }, asOf: "07/10/2026" },
      placeNames,
    });
    expect(demo).not.toBeNull();
    expect(demo!.zip).toBe("33914"); // busiest, NOT highest-value
    expect(demo!.typed).toBe("Cape Coral, FL");
    expect(demo!.subject).toBe("This week in Cape Coral (33914)");
    expect(demo!.figures).toEqual([
      { label: "Median home value", value: "$390,000", source: "Zillow ZHVI · 05/01/2026" },
      { label: "Active listings", value: "812", source: "SWFL Data Gulf · 07/11/2026" },
      { label: "Days on market", value: "74 days", source: "realtor.com · 07/10/2026" },
    ]);
  });

  it("falls back to the top-value ZIP when there is no live activity metric", () => {
    const demo = buildCampaignDemo({
      value: { data: { "33914": 390000, "34102": 2100000 }, asOf: "05/01/2026" },
      placeNames,
    });
    expect(demo!.zip).toBe("34102");
    expect(demo!.figures).toHaveLength(1); // value only — nothing else gets invented
  });

  it("skips a busiest ZIP that holds no value figure (the anchor row is required)", () => {
    const demo = buildCampaignDemo({
      value: { data: { "34102": 2100000 } },
      activity: { data: { "33914": 812 } },
      placeNames,
    });
    expect(demo!.zip).toBe("34102");
  });

  it("returns null on sample data or an empty value metric — the section hides", () => {
    expect(
      buildCampaignDemo({
        value: { data: { "33914": 390000 }, sample: true },
        placeNames,
      }),
    ).toBeNull();
    expect(buildCampaignDemo({ value: { data: {} }, placeNames })).toBeNull();
    expect(buildCampaignDemo({ placeNames })).toBeNull();
  });

  it("speaks like a person: rail disambiguation labels become the real place name", () => {
    // "Cape Coral NW really isn't a place" — operator, 07/11/2026.
    expect(naturalPlace("Cape Coral NW")).toBe("Cape Coral");
    expect(naturalPlace("Naples (Downtown)")).toBe("Naples");
    expect(naturalPlace("Naples Park Shore")).toBe("Naples Park Shore"); // real neighborhood, untouched
    expect(naturalPlace("Captiva Island")).toBe("Captiva Island");
    const demo = buildCampaignDemo({
      value: { data: { "33993": 328186 }, asOf: "05/31/2026" },
      placeNames: { "33993": "Cape Coral NW" },
    });
    expect(demo!.typed).toBe("Cape Coral, FL");
    expect(demo!.subject).toBe("This week in Cape Coral (33993)");
  });

  it("degrades to the bare ZIP when no place name is held (never invents one)", () => {
    const demo = buildCampaignDemo({
      value: { data: { "33999": 250000 } },
      placeNames: {},
    });
    expect(demo!.typed).toBe("33999");
    expect(demo!.subject).toBe("This week in 33999");
  });
});
