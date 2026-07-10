import { describe, expect, it } from "vitest";
import { mapMarketTemperature } from "./market-temperature-series";
import { formatAsOfDate } from "./format";

const rows = (n: number, base = 50) =>
  Array.from({ length: n }, (_, i) => ({
    local_hotness_score: base + i,
    captured_date: "2026-07-04",
  }));

describe("mapMarketTemperature", () => {
  it("median hotness across ZIPs, zip count, iso asOf", () => {
    const g = mapMarketTemperature(rows(11, 40));
    expect(g).not.toBeNull();
    expect(g!.medianHotness).toBe(45); // 40..50 → median 45
    expect(g!.zipCount).toBe(11);
    expect(g!.asOf).toBe("2026-07-04");
  });

  it("null-score rows excluded from median and count", () => {
    const g = mapMarketTemperature([
      ...rows(11, 40),
      { local_hotness_score: null, captured_date: "2026-07-04" },
    ]);
    expect(g!.zipCount).toBe(11);
    expect(g!.medianHotness).toBe(45);
  });

  it("asOf is the NEWEST captured_date across rows", () => {
    const g = mapMarketTemperature([
      ...rows(10, 40),
      { local_hotness_score: 50, captured_date: "2026-07-06" },
    ]);
    expect(g!.asOf).toBe("2026-07-06");
  });

  it("thin data (<10 scored ZIPs) hides the panel", () => {
    expect(mapMarketTemperature(rows(9))).toBeNull();
    expect(mapMarketTemperature([])).toBeNull();
    expect(mapMarketTemperature(null)).toBeNull();
  });
});

describe("formatAsOfDate", () => {
  it("ISO date → MM/DD/YYYY", () => {
    expect(formatAsOfDate("2026-07-04")).toBe("07/04/2026");
  });
  it("tolerates timestamps and undefined", () => {
    expect(formatAsOfDate("2026-07-04T12:00:00Z")).toBe("07/04/2026");
    expect(formatAsOfDate(undefined)).toBeUndefined();
  });
});
