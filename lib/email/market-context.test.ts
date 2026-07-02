import { describe, expect, test } from "bun:test";
import { singleSourcePerMetric, type MarketFigure } from "./market-context";

const fig = (key: string, value: string, source: string): MarketFigure => ({
  key,
  label: key,
  value,
  source,
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
