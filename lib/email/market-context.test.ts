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
