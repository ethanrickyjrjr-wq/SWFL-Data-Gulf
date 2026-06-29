import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseJsonLdFacts } from "./listing-scrape";

// SECOND vendor (different platform than the beach-homes island): John R. Wood
// uses standard schema.org JSON-LD (Product + SingleFamilyResidence + Offer).
// Captured via plain Node fetch (the prod path). Proves Tier 2 generalizes.
const html = readFileSync(join(import.meta.dir, "__fixtures__", "listing-johnrwood.html"), "utf8");
const URL_JRW = "https://www.johnrwood.com/listing/225043462/3412-atlantic-circle-naples-fl-34119/";

test("parseJsonLdFacts reads standard schema.org real-estate JSON-LD", () => {
  const f = parseJsonLdFacts(html, URL_JRW);
  expect(f.price).toBe("$1,299,000"); // offers.price 1299000 → formatted
  expect(f.beds).toBe("4"); // numberOfRooms · unitText "Bedrooms"
  expect(f.sqft).toBe("3359"); // floorSize QuantitativeValue
  expect(f.city).toBe("Naples");
  expect(f.state).toBe("FL");
  expect(f.zip).toBe("34119");
  expect(f.address ?? "").toContain("3412 Atlantic");
  expect(f.propertyType ?? "").toMatch(/single family/i);
  expect(f.sourceUrl).toBe(URL_JRW);
});

test("parseJsonLdFacts pulls the real description + photo from JSON-LD", () => {
  const f = parseJsonLdFacts(html, URL_JRW);
  expect(f.remarks ?? "").toMatch(/Riverstone/i);
  expect((f.remarks ?? "").length).toBeGreaterThan(200);
  expect(f.photos.length).toBeGreaterThan(0);
  expect(f.photos[0]).toContain("cloudfront");
  expect(f.photos[0]).toMatch(/\.webp|\.jpe?g/i);
});

test("parseJsonLdFacts invents nothing when there is no real-estate JSON-LD", () => {
  const f = parseJsonLdFacts("<html><body><p>no structured data</p></body></html>", "https://x/y");
  expect(f.price).toBeUndefined();
  expect(f.beds).toBeUndefined();
  expect(f.photos).toEqual([]);
  expect(f.sourceUrl).toBe("https://x/y");
});
