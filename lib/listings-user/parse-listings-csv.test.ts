// lib/listings-user/parse-listings-csv.test.ts
// Guards: failure mode 1 (caps), 10 (row-grain failure: bad rows degrade counts,
// good rows land), and lenient number parsing ($ and commas are user reality).
import { describe, expect, test } from "bun:test";
import { parseListingsCsv } from "./parse-listings-csv";

describe("parseListingsCsv", () => {
  test("happy row: typed fields parsed, unknown headers land in attribs", () => {
    const csv = [
      "Address,Price,Beds,Baths,SqFt,Status,URL,My Notes",
      '"12 Main Street, Fort Myers, FL 33901","$450,000",3,2.5,"1,978",Active,https://x.com/l/1,pool home',
    ].join("\n");
    const { rows, skippedCount } = parseListingsCsv(csv);
    expect(skippedCount).toBe(0);
    expect(rows).toHaveLength(1);
    expect(rows[0].address).toBe("12 Main Street, Fort Myers, FL 33901");
    expect(rows[0].address_key).toBe("12 main st fort myers fl 33901");
    expect(rows[0].price).toBe(450000);
    expect(rows[0].beds).toBe(3);
    expect(rows[0].baths).toBe(2.5);
    expect(rows[0].sqft).toBe(1978);
    expect(rows[0].status).toBe("Active");
    expect(rows[0].url).toBe("https://x.com/l/1");
    expect(rows[0].attribs).toEqual({ "my notes": "pool home" });
  });
  test("row without an address is skipped WITH a reason; good rows still land", () => {
    const csv = ["address,price", ",100000", '"5 Palm Ave",200000'].join("\n");
    const { rows, skippedCount, skipReasons } = parseListingsCsv(csv);
    expect(rows).toHaveLength(1);
    expect(skippedCount).toBe(1);
    expect(skipReasons.join(" ")).toContain("address");
  });
  test("header aliases: street address / list price / square feet / link", () => {
    const csv = [
      "Street Address,List Price,Square Feet,Link",
      '"7 Bay Ln",300000,1200,https://y.com',
    ].join("\n");
    const { rows } = parseListingsCsv(csv);
    expect(rows[0].address).toBe("7 Bay Ln");
    expect(rows[0].price).toBe(300000);
    expect(rows[0].sqft).toBe(1200);
    expect(rows[0].url).toBe("https://y.com");
  });
  test("no address column at all → zero rows, reason says so", () => {
    const { rows, skipReasons } = parseListingsCsv("price,beds\n100,2");
    expect(rows).toHaveLength(0);
    expect(skipReasons.join(" ")).toContain("no address column");
  });
  test("unparseable number degrades to null, row still lands (row-grain, never throws)", () => {
    const { rows } = parseListingsCsv('address,price\n"9 Isle Cir",call for price');
    expect(rows[0].price).toBeNull();
    expect(rows[0].address).toBe("9 Isle Cir");
  });
  test("attribs capped at 50 unknown columns", () => {
    const extras = Array.from({ length: 60 }, (_, i) => `x${i}`);
    const header = ["address", ...extras].join(",");
    const row = ['"1 A St"', ...extras.map((_, i) => `v${i}`)].join(",");
    const { rows } = parseListingsCsv(`${header}\n${row}`);
    expect(Object.keys(rows[0].attribs).length).toBeLessThanOrEqual(50);
  });
});
