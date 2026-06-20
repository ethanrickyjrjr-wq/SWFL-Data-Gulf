import { describe, expect, it } from "bun:test";
import { buildZipChoropleth, type ZipRow } from "./zip-choropleth-data";

const rows: ZipRow[] = [
  { key: "33901", cells: { median_sale_price: 300000 } },
  { key: "33931", cells: { median_sale_price: 900000 } },
  { key: "34102", cells: { median_sale_price: 600000 } },
  { key: "BADKEY", cells: { median_sale_price: 999 } }, // not a zip → skipped
  { key: "34119", cells: { median_sale_price: null } }, // non-finite → skipped
];

describe("buildZipChoropleth", () => {
  it("normalizes finite per-ZIP values to 0–1 and formats labels", () => {
    const { data, count, min, max } = buildZipChoropleth(rows, "median_sale_price");
    expect(count).toBe(3);
    expect(min).toBe(300000);
    expect(max).toBe(900000);
    expect(data["33901"].value).toBe(0); // min → 0
    expect(data["33931"].value).toBe(1); // max → 1
    expect(data["34102"].value).toBeCloseTo(0.5, 5); // midpoint
    expect(data["33931"].label).toBe("$900,000");
    expect(data["BADKEY"]).toBeUndefined();
    expect(data["34119"]).toBeUndefined();
  });

  it("returns empty (count 0) when no ZIP has a finite value", () => {
    const { data, count } = buildZipChoropleth(
      [{ key: "33901", cells: { median_sale_price: null } }],
      "median_sale_price",
    );
    expect(count).toBe(0);
    expect(data).toEqual({});
  });

  it("flattens to 0.5 when every value is equal (no NaN)", () => {
    const { data } = buildZipChoropleth(
      [
        { key: "33901", cells: { x: 5 } },
        { key: "33931", cells: { x: 5 } },
      ],
      "x",
      { format: (v) => `${v}` },
    );
    expect(data["33901"].value).toBe(0.5);
    expect(data["33931"].value).toBe(0.5);
    expect(data["33901"].label).toBe("5");
  });

  it("coerces numeric strings", () => {
    const { data, count } = buildZipChoropleth(
      [
        { key: "33901", cells: { p: "100" } },
        { key: "33931", cells: { p: "200" } },
      ],
      "p",
      { format: (v) => `${v}` },
    );
    expect(count).toBe(2);
    expect(data["33931"].value).toBe(1);
  });
});
