import { test } from "bun:test";
import assert from "node:assert/strict";
import type { RawFragment } from "../types/fragment.mts";
import type {
  ActiveListingsResidentialSummary,
  ResidentialStatRow,
} from "../sources/active-listings-residential-source.mts";

process.env["REFINERY_SOURCE"] = "fixture";

const { activeListingsSwfl } = await import("./active-listings-swfl.mts");

const NOW = "2026-06-26T07:17:39Z";

function row(
  county: string | null,
  zip: string | null,
  count: number,
  median: number | null,
  dom: number | null,
): ResidentialStatRow {
  return {
    county,
    zip_code: zip,
    listing_count: count,
    median_list_price: median,
    avg_days_on_market: dom,
    avg_list_price: median,
    latest_scraped_at: NOW,
  };
}

// Live shape: data_lake.listing_active_stats returns avg_days_on_market = NULL by design.
// regionDom defaults to null (production reality); pass a number to exercise the future
// list-date DOM lane.
function makeFragment(regionDom: number | null = null): RawFragment {
  const summary: ActiveListingsResidentialSummary = {
    kind: "active-listings-residential-summary",
    region: row(null, null, 10459, 496470, regionDom),
    by_county: [row("Lee", null, 7412, 414900, null), row("Collier", null, 2749, 912000, null)],
    // Two real core ZIPs (33993 Lee, 34120 Collier) + one real non-core SWFL ZIP (33950 Charlotte)
    // to prove the core-scope filter drops non-core rows from the by_zip detail table.
    by_zip: [
      row("Lee", "33993", 722, 399000, null),
      row("Collier", "34120", 464, 715000, null),
      row("Charlotte", "33950", 311, 350000, null),
    ],
    latest_scraped_at: NOW,
    source_url: "fixture://listing-active-stats",
  };
  return {
    fragment_id: "active_listings_residential:summary:test",
    source_id: "active_listings_residential",
    source_trust_tier: 2,
    fetched_at: NOW,
    raw: summary,
    normalized: summary,
  } as unknown as RawFragment;
}

test("active-listings-swfl: DOM null -> 2 region key_metrics, avg_days_on_market_swfl suppressed (never faked)", () => {
  activeListingsSwfl.corpusSummary!([makeFragment(null)]);
  const result = activeListingsSwfl.outputProducer!({} as never);

  const slugs = result.key_metrics.map((m) => m.metric).sort();
  assert.deepEqual(slugs, ["active_listings_count_swfl", "median_list_price_swfl"]);
  assert.ok(
    !slugs.includes("avg_days_on_market_swfl"),
    "DOM metric must stay suppressed while the view returns null — never fake a value",
  );
  const count = result.key_metrics.find((m) => m.metric === "active_listings_count_swfl");
  assert.equal(count?.value, 10459);
  for (const m of result.key_metrics) {
    assert.ok(m.source?.url, `metric ${m.metric} must carry a source url`);
    assert.ok(m.source?.citation, `metric ${m.metric} must carry a citation`);
  }
});

test("active-listings-swfl: emits avg_days_on_market_swfl ONLY when a real DOM value is present (future list-date lane)", () => {
  activeListingsSwfl.corpusSummary!([makeFragment(118)]);
  const result = activeListingsSwfl.outputProducer!({} as never);

  const slugs = result.key_metrics.map((m) => m.metric).sort();
  assert.deepEqual(slugs, [
    "active_listings_count_swfl",
    "avg_days_on_market_swfl",
    "median_list_price_swfl",
  ]);
  const dom = result.key_metrics.find((m) => m.metric === "avg_days_on_market_swfl");
  assert.equal(dom?.value, 118);
});

test("active-listings-swfl: per-county and per-ZIP rows ride in detail_tables", () => {
  activeListingsSwfl.corpusSummary!([makeFragment()]);
  const result = activeListingsSwfl.outputProducer!({} as never);

  const byCounty = result.detail_tables?.find((t) => t.id === "active_listings_by_county");
  const byZip = result.detail_tables?.find((t) => t.id === "active_listings_by_zip");
  assert.ok(byCounty && byCounty.rows.length === 2, "expected a 2-row by-county table");
  // 3 by_zip rows in, but 33950 (Charlotte) is non-core and filtered → 2 core rows remain.
  assert.ok(byZip && byZip.rows.length === 2, "expected a 2-row by-ZIP table (non-core dropped)");
  assert.equal(byZip!.grain, "zip");
  assert.ok(
    !byZip!.rows.some((r) => r.key === "33950"),
    "non-core ZIP 33950 (Charlotte) must be filtered out of the by-ZIP detail table",
  );
  const zip33993 = byZip!.rows.find((r) => r.key === "33993");
  assert.equal(zip33993?.cells.listing_count, 722);
});

test("active-listings-swfl: dual-CORE-county ZIP (34134 Lee/Collier) collapses to ONE by-ZIP row, keeping the higher-count row with the canonical county label", () => {
  // active_listings_zip_county_contamination: 34134 straddles Lee(primary)/Collier — BOTH core
  // counties, so the 07/11 btrim(county) IN ('Lee','Collier') core-scope filter can't dedupe it.
  // This reproduces LIVE in brains/active-listings-swfl.md today as "34134 (Lee)" 394 listings
  // AND "34134 (Collier)" 87 listings, two separate rows for the same ZIP. The pack must
  // collapse that to ONE row (the same "keepFattest" rule lib/desk/loaders.ts already applies to
  // this identical view for its own /desk consumer).
  const summary: ActiveListingsResidentialSummary = {
    kind: "active-listings-residential-summary",
    region: row(null, null, 10459, 496470, null),
    by_county: [row("Lee", null, 7412, 414900, null), row("Collier", null, 2749, 912000, null)],
    by_zip: [row("Lee", "34134", 394, 799000, null), row("Collier", "34134", 87, 1950000, null)],
    latest_scraped_at: NOW,
    source_url: "fixture://listing-active-stats",
  };
  const fragment = {
    fragment_id: "active_listings_residential:summary:test-dual-county",
    source_id: "active_listings_residential",
    source_trust_tier: 2,
    fetched_at: NOW,
    raw: summary,
    normalized: summary,
  } as unknown as RawFragment;

  activeListingsSwfl.corpusSummary!([fragment]);
  const result = activeListingsSwfl.outputProducer!({} as never);
  const byZip = result.detail_tables?.find((t) => t.id === "active_listings_by_zip");
  const zip34134Rows = byZip!.rows.filter((r) => r.key === "34134");
  assert.equal(zip34134Rows.length, 1, "34134 must appear exactly once in the by-ZIP table");
  assert.equal(zip34134Rows[0].label, "34134 (Lee)");
  assert.equal(zip34134Rows[0].cells.listing_count, 394);
});

test("active-listings-swfl: zero-data path returns neutral with no metrics", () => {
  activeListingsSwfl.corpusSummary!([]);
  const result = activeListingsSwfl.outputProducer!({} as never);
  assert.equal(result.direction, "neutral");
  assert.equal(result.key_metrics.length, 0);
});
