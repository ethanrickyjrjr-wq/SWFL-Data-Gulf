import { describe, expect, it } from "bun:test";
import { mapAirportRows, mapAirportTotalWithSmoothed, movingAverage } from "./airport-series";

describe("movingAverage", () => {
  it("returns null for the first (window-1) positions", () => {
    const result = movingAverage([1, 2, 3, 4, 5], 3);
    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
    expect(result[2]).toBe(2); // (1+2+3)/3
    expect(result[3]).toBe(3); // (2+3+4)/3
    expect(result[4]).toBe(4); // (3+4+5)/3
  });

  it("returns null when any window value is null", () => {
    const result = movingAverage([10, null, 30], 2);
    expect(result[1]).toBeNull();
    expect(result[2]).toBeNull();
  });

  it("handles a window of 1 (identity)", () => {
    expect(movingAverage([5, 10, 15], 1)).toEqual([5, 10, 15]);
  });

  it("returns empty array for empty input", () => {
    expect(movingAverage([], 3)).toEqual([]);
  });
});

describe("mapAirportTotalWithSmoothed", () => {
  it("emits passengers on every row; the smoothed mean only after 12 observations", () => {
    const rows = Array.from({ length: 15 }, (_, i) => ({
      report_month: `2025-${String(i + 1).padStart(2, "0")}-01`,
      value: 1000 * (i + 1),
    }));
    const r = mapAirportTotalWithSmoothed(rows);
    expect(r.entries.length).toBe(15);
    // first 11 rows have no smoothed key
    for (let i = 0; i < 11; i++) {
      expect(r.entries[i].smoothed).toBeUndefined();
    }
    // row 12 (index 11) is the first with a smoothed value
    expect(typeof r.entries[11].smoothed).toBe("number");
  });

  it("computes the smoothed mean pre-slice so it is present in short views", () => {
    // Build 14 months and check that the last 2 rows (short view) carry it
    const rows = Array.from({ length: 14 }, (_, i) => ({
      report_month: `2025-${String(i + 1).padStart(2, "0")}-01`,
      value: 500,
    }));
    const r = mapAirportTotalWithSmoothed(rows);
    expect(r.entries[12].smoothed).toBeDefined();
    expect(r.entries[13].smoothed).toBeDefined();
  });

  it("degrades safely on null/empty input", () => {
    expect(mapAirportTotalWithSmoothed(null).entries).toEqual([]);
    expect(mapAirportTotalWithSmoothed([]).asOf).toBeUndefined();
  });
});

describe("a moving average is a SMOOTHER, and must not be called a trend", () => {
  it("carries the smoothed mean under `smoothed`, never `trend`", () => {
    const rows = Array.from({ length: 14 }, (_, i) => ({
      report_month: `2025-${String((i % 12) + 1).padStart(2, "0")}-01`,
      value: 100 + i,
    }));
    const out = mapAirportTotalWithSmoothed(rows);
    const row = out.entries.at(-1)!;
    expect(row).toHaveProperty("smoothed");
    // The old key is GONE — a 12-month mean is not a trend and must not claim to be.
    expect(row).not.toHaveProperty("trend");
  });

  // The rename must not have touched the NUMBERS. Same input, same arithmetic:
  // months 1-12 of a 1000·n ramp average to 6500, and the window slides by 1000.
  it("emits the same values it always did — a rename, not a math change", () => {
    const rows = Array.from({ length: 15 }, (_, i) => ({
      report_month: `2025-${String(i + 1).padStart(2, "0")}-01`,
      value: 1000 * (i + 1),
    }));
    const r = mapAirportTotalWithSmoothed(rows);
    expect(r.entries[11].smoothed).toBe(6500); // mean of 1000..12000
    expect(r.entries[12].smoothed).toBe(7500);
    expect(r.entries[14].smoothed).toBe(9500);
  });
});

// public.rsw_airport_monthly is a single-series monthly feed (RSW enplanements).
// This mapper turns its DATE rows into the same { month, <series> } shape the
// pivoted-view charts use, so one chart component renders both.
describe("mapAirportRows", () => {
  it("maps date rows to { month, passengers }, sorted ascending, asOf = latest", () => {
    const rows = [
      { report_month: "2026-03-01", value: 760820 },
      { report_month: "2026-01-01", value: 539194 },
      { report_month: "2026-02-01", value: 575995 },
    ];

    const r = mapAirportRows(rows);

    expect(r.entries.map((e) => e.month)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(r.entries[2].passengers).toBe(760820);
    expect(r.asOf).toBe("2026-03");
    expect(r.rowCount).toBe(3);
  });

  it("drops a null value but still counts it in rowCount", () => {
    const rows = [
      { report_month: "2026-01-01", value: 539194 },
      { report_month: "2026-02-01", value: null },
    ];

    const r = mapAirportRows(rows);

    expect(r.entries.map((e) => e.month)).toEqual(["2026-01"]);
    expect(r.rowCount).toBe(2);
  });

  it("degrades safely on null/empty input", () => {
    expect(mapAirportRows(null).entries).toEqual([]);
    expect(mapAirportRows([]).asOf).toBeUndefined();
    expect(mapAirportRows([]).rowCount).toBe(0);
  });
});
