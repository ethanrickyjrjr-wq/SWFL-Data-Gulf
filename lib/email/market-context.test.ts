import { describe, expect, test } from "bun:test";
import { digestValue, singleSourcePerMetric, type MarketFigure } from "./market-context";

const fig = (key: string, value: string, source: string): MarketFigure => ({
  key,
  label: key,
  value,
  source,
});

describe("digestValue — sales split by county-record status", () => {
  test("no pending: plain sales count, unchanged wording", () => {
    expect(digestValue(0, 0, 0, 9, 0)).toBe("9 sales");
  });

  test("mixed: recorded vs awaiting county record", () => {
    expect(digestValue(0, 0, 0, 9, 0, 2)).toBe("9 sales (7 recorded, 2 awaiting county record)");
  });

  test("all pending: says so without a '0 recorded'", () => {
    expect(digestValue(0, 0, 0, 2, 0, 2)).toBe("2 sales (closing prices awaiting county record)");
    expect(digestValue(0, 0, 0, 1, 0, 1)).toBe("1 sale (closing price awaiting county record)");
  });

  test("pending never exceeds sales (defensive clamp)", () => {
    expect(digestValue(0, 0, 0, 2, 0, 5)).toBe("2 sales (closing prices awaiting county record)");
  });

  test("everything empty → null (no forced line)", () => {
    expect(digestValue(0, 0, 0, 0, 0, 0)).toBeNull();
  });
});

describe("singleSourcePerMetric", () => {
  test("clean figures pass through untouched", () => {
    const figs = [fig("active", "495", "SWFL Data Gulf"), fig("rent", "$2,150", "Zillow ZORI")];
    const r = singleSourcePerMetric(figs);
    expect(r.figures).toEqual(figs);
    expect(r.discrepancies).toEqual([]);
  });

  test("same metric from two sources: first ships, second recorded as discrepancy", () => {
    const r = singleSourcePerMetric([
      fig("active", "495", "SWFL Data Gulf"),
      fig("active", "92", "somewhere else"),
    ]);
    expect(r.figures).toEqual([fig("active", "495", "SWFL Data Gulf")]);
    expect(r.discrepancies).toEqual([
      { key: "active", sources: ["SWFL Data Gulf", "somewhere else"] },
    ]);
  });
});

import { mergeSourcedFigures } from "./market-context";
import type { SourcedFigure } from "@/lib/figures/sourced";

describe("mergeSourcedFigures", () => {
  const held: MarketFigure[] = [
    {
      key: "home_value",
      label: "Median home value",
      value: "$485,000",
      source: "Zillow ZHVI",
      as_of: "06/30/2026",
    },
  ];
  const sourced: SourcedFigure[] = [
    {
      key: "permits_90d",
      label: "New building permits issued in ZIP 33914 (Cape Coral), last 90 days",
      value: "412",
      source: "capecoral.gov",
      source_url: "https://www.capecoral.gov/x",
      as_of: "06/30/2026",
    },
    {
      key: "home_value",
      label: "dupe",
      value: "$999",
      source: "elsewhere",
      source_url: "https://x",
      as_of: undefined,
    },
  ];

  test("a stored figure appears in builder context with citation + as-of", () => {
    const merged = mergeSourcedFigures(held, sourced);
    const found = merged.find((f) => f.key === "permits_90d");
    expect(found).toBeDefined();
    expect(found!.value).toBe("412");
    expect(found!.source).toBe("capecoral.gov");
    expect(found!.as_of).toBe("06/30/2026");
  });

  test("held lake figures win on key collision — sourced never overrides", () => {
    const merged = mergeSourcedFigures(held, sourced);
    const hv = merged.filter((f) => f.key === "home_value");
    expect(hv.length).toBe(1);
    expect(hv[0].value).toBe("$485,000");
  });
});
