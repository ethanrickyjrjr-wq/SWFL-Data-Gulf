import { describe, expect, test } from "bun:test";
import { parseHoaFeeRange, mapProfile } from "./communities";

/**
 * Pins the fix for communities_swfl_live_verify: `data_lake.community_profiles`
 * only ever stores a text `hoa_fee_range` (e.g. "$400–$700/mo") — there is no
 * `hoa_fee_min`/`hoa_fee_max` column on the live table. Before this fix,
 * mapProfile read `r.hoa_fee_min`/`r.hoa_fee_max` directly, which are always
 * `undefined` on a real row, so `num()` always resolved null and the "HOA
 * fees" line never rendered even though the scraped text value is populated
 * for most communities. `parseHoaFeeRange` recovers min/max from the text
 * that ships in every row today, no new ingest required.
 */
describe("parseHoaFeeRange", () => {
  test("parses a plain dollar range", () => {
    expect(parseHoaFeeRange("$400–$700/mo")).toEqual({ min: 400, max: 700 });
  });

  test("strips comma thousands separators", () => {
    expect(parseHoaFeeRange("$1,200–$1,800/mo")).toEqual({ min: 1200, max: 1800 });
  });

  test("ignores a trailing (est.) annotation", () => {
    expect(parseHoaFeeRange("$2,500–$3,500+/mo (est.)")).toEqual({ min: 2500, max: 3500 });
  });

  test("ignores a trailing non-numeric suffix like '+ equity'", () => {
    expect(parseHoaFeeRange("$1,200–$1,800/mo + equity")).toEqual({ min: 1200, max: 1800 });
  });

  test("single dollar figure (no dash) maps to min === max", () => {
    expect(parseHoaFeeRange("$100/mo")).toEqual({ min: 100, max: 100 });
  });

  test("null/missing text yields both null", () => {
    expect(parseHoaFeeRange(null)).toEqual({ min: null, max: null });
    expect(parseHoaFeeRange(undefined)).toEqual({ min: null, max: null });
  });

  test("unparseable text yields both null", () => {
    expect(parseHoaFeeRange("Call for pricing")).toEqual({ min: null, max: null });
  });
});

describe("mapProfile", () => {
  test("derives hoa_fee_min/max from the live text column, not a nonexistent numeric column", () => {
    const row = {
      community_slug: "fiddlers-creek",
      label: "Fiddlers Creek",
      hoa_fee_range: "$400–$700/mo",
    };
    const profile = mapProfile(row);
    expect(profile.hoa_fee_min).toBe(400);
    expect(profile.hoa_fee_max).toBe(700);
  });

  test("reads the real boating_marina column, not the nonexistent 'boating' key", () => {
    const row = {
      community_slug: "pelican-sound",
      label: "Pelican Sound",
      boating_marina: true,
    };
    const profile = mapProfile(row);
    expect(profile.boating).toBe(true);
  });
});
