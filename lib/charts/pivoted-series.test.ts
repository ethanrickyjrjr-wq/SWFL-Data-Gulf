import { describe, expect, it } from "bun:test";
import { mapPivotedCityRows } from "./pivoted-series";

// The /charts page reads data_lake.{zhvi,zori}_pivoted — wide rows of
// { month, cape_coral, fort_myers, naples } where a city can be NULL for a
// month it doesn't cover. This pure mapper is the single place that turns
// those raw view rows into chart-ready entries, shared by every pivoted-view
// chart section so they all filter/anchor identically.
describe("mapPivotedCityRows", () => {
  it("maps complete rows to entries sorted ascending, asOf = latest month", () => {
    const rows = [
      { month: "2025-03", cape_coral: 410000, fort_myers: 380000, naples: 720000 },
      { month: "2025-01", cape_coral: 400000, fort_myers: 370000, naples: 700000 },
      { month: "2025-02", cape_coral: 405000, fort_myers: 375000, naples: 710000 },
    ];

    const result = mapPivotedCityRows(rows);

    expect(result.entries.map((e) => e.month)).toEqual(["2025-01", "2025-02", "2025-03"]);
    expect(result.asOf).toBe("2025-03");
    expect(result.rowCount).toBe(3);
  });

  it("drops a month missing any city, but still counts it in rowCount", () => {
    const rows = [
      { month: "2025-01", cape_coral: 400000, fort_myers: 370000, naples: 700000 },
      { month: "2025-02", cape_coral: 405000, fort_myers: null, naples: 710000 },
    ];

    const result = mapPivotedCityRows(rows);

    expect(result.entries.map((e) => e.month)).toEqual(["2025-01"]);
    expect(result.asOf).toBe("2025-01");
    expect(result.rowCount).toBe(2); // view returned 2 rows; only 1 is complete/rendered
  });

  it("returns empty entries and undefined asOf for an empty view", () => {
    const result = mapPivotedCityRows([]);

    expect(result.entries).toEqual([]);
    expect(result.asOf).toBeUndefined();
    expect(result.rowCount).toBe(0);
  });

  it("treats null input as empty (degrades safely on a failed read)", () => {
    const result = mapPivotedCityRows(null);

    expect(result.entries).toEqual([]);
    expect(result.asOf).toBeUndefined();
    expect(result.rowCount).toBe(0);
  });
});
