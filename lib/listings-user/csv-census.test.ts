// lib/listings-user/csv-census.test.ts
// Guard: failure mode 8 — a shapeless CSV is SEEN (headers + count recorded),
// and shape detection routes CSVs that DO fit to their endpoint.
import { describe, expect, test } from "bun:test";
import { censusCsv } from "./csv-census";

describe("censusCsv", () => {
  test("email header → contacts shape", () => {
    const c = censusCsv("Email,Name\na@x.com,A");
    expect(c.matchedShape).toBe("contacts");
    expect(c.headers).toEqual(["email", "name"]);
    expect(c.rowCount).toBe(1);
  });
  test("address alias header → listings shape", () => {
    expect(censusCsv("Street Address,Price\n1 A St,100").matchedShape).toBe("listings");
  });
  test("neither → none, census still recorded", () => {
    const c = censusCsv("sku,qty,warehouse\nA1,5,FTM\nB2,3,NAP");
    expect(c.matchedShape).toBe("none");
    expect(c.headers).toEqual(["sku", "qty", "warehouse"]);
    expect(c.rowCount).toBe(2);
  });
});
