import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseListingDetail, emptyDetailFacts } from "./listing-detail";

// The real page, saved 07/14/2026: 8665 Bay Colony Dr Unit PH 2003, Naples FL 34108.
// A condo in a golf+gated community — the case that motivated this module.
const FIXTURE = readFileSync(
  path.join(import.meta.dir, "__fixtures__", "johnrwood-detail-condo.html"),
  "utf-8",
);
const URL_ = "https://www.johnrwood.com/listing/225082845/8665-bay-colony-drive-naples-fl-34108/";

describe("parseListingDetail — the community facts the index scrape never had", () => {
  const f = parseListingDetail(FIXTURE, URL_);

  it("reads the community feature list verbatim", () => {
    expect(f.ok).toBe(true);
    expect(f.communityFeatures).toEqual(["Golf", "Gated", "Tennis Court(s)", "Street Lights"]);
  });

  it("answers the question that started this: golf, pool, gated", () => {
    expect(f.hasGolf).toBe(true);
    expect(f.hasPool).toBe(true);
    expect(f.isGated).toBe(true);
  });

  it("captures the amenity list including the pool and clubhouse", () => {
    expect(f.amenities).toContain("Pool");
    expect(f.amenities).toContain("Clubhouse");
    expect(f.amenities).toContain("Fitness Center");
    // "See Remarks" is a source placeholder, not an amenity — it must not reach a reader.
    expect(f.amenities).not.toContain("See Remarks");
  });

  it("captures the real property grain the listing rows collapse to 'residential'", () => {
    expect(f.propertySubType).toBe("Condominium");
  });

  it("carries provenance for the citation", () => {
    expect(f.sourceUrl).toBe(URL_);
  });
});

describe("a failed fetch yields NO facts — never invented ones", () => {
  // This is the whole safety property. The narrator may only say "golf" when a fact says golf.
  // If the page is gone or relaid-out and we returned a partial/optimistic object, the model
  // would be handed silence and fill it — which is exactly the hallucination the word-bans exist
  // to stop. Empty must mean empty.
  it("empty html → no claims, ok=false", () => {
    const f = parseListingDetail("", URL_);
    expect(f.ok).toBe(false);
    expect(f.hasGolf).toBeNull();
    expect(f.hasPool).toBeNull();
    expect(f.isGated).toBeNull();
  });

  it("a page with no field markup → no claims", () => {
    const f = parseListingDetail("<html><body><h1>Page not found</h1></body></html>", URL_);
    expect(f.ok).toBe(false);
    expect(f.hasGolf).toBeNull();
    expect(f.communityFeatures).toEqual([]);
  });

  it("emptyDetailFacts asserts nothing", () => {
    const f = emptyDetailFacts(URL_);
    expect(f.hasGolf).toBeNull();
    expect(f.hasPool).toBeNull();
    expect(f.ok).toBe(false);
  });
});

describe("absence is not denial", () => {
  // A community that states features but omits golf is genuinely "no golf" (false).
  // A community that states NO features at all is "unknown" (null). Collapsing these two
  // would let a build print "no golf course" about a golf community whose page we failed to read.
  it("features stated but golf absent → false, not null", () => {
    const html = `<span class="field-name">Community Features: </span><span class="field-value">Street Lights, Sidewalks</span>`;
    const f = parseListingDetail(html, URL_);
    expect(f.hasGolf).toBe(false);
    expect(f.hasPool).toBe(false);
  });

  it("no feature list at all → null, not false", () => {
    const html = `<span class="field-name">Year Built: </span><span class="field-value">1998</span>`;
    const f = parseListingDetail(html, URL_);
    expect(f.yearBuilt).toBe(1998);
    expect(f.hasGolf).toBeNull();
    expect(f.hasPool).toBeNull();
  });

  it("'Non-Gated' is not gated", () => {
    const html = `<span class="field-name">Community Features: </span><span class="field-value">Non-Gated</span>`;
    const f = parseListingDetail(html, URL_);
    expect(f.isGated).toBe(false);
  });

  it("a mangled year is dropped, not fabricated", () => {
    const html = `<span class="field-name">Year Built: </span><span class="field-value">n/a</span>`;
    expect(parseListingDetail(html, URL_).yearBuilt).toBeNull();
  });
});
