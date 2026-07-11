import { test } from "bun:test";
import assert from "node:assert/strict";
import type { RawFragment } from "../types/fragment.mts";
import type { ActiveRentalsSummary, RentalStatRow } from "../sources/active-rentals-source.mts";

process.env["REFINERY_SOURCE"] = "fixture";

const { activeRentalsSwfl } = await import("./active-rentals-swfl.mts");
const { summarize } = await import("../sources/active-rentals-source.mts");

const NOW = "2026-07-01T07:00:00Z";

const ROWS: RentalStatRow[] = [
  {
    county: null,
    zip_code: null,
    rental_listing_count: 9393,
    observed_price_min: 485,
    observed_price_max: 12500,
    captured_date: "2026-07-01",
  },
  {
    county: "Lee",
    zip_code: null,
    rental_listing_count: 5211,
    observed_price_min: 550,
    observed_price_max: 9800,
    captured_date: "2026-07-01",
  },
  {
    county: "Collier",
    zip_code: null,
    rental_listing_count: 4182,
    observed_price_min: 485,
    observed_price_max: 12500,
    captured_date: "2026-07-01",
  },
  {
    county: "Lee",
    zip_code: "33901",
    rental_listing_count: 612,
    observed_price_min: 900,
    observed_price_max: 4200,
    captured_date: "2026-07-01",
  },
  {
    county: "Collier",
    zip_code: "34102",
    rental_listing_count: 415,
    observed_price_min: 1200,
    observed_price_max: 12500,
    captured_date: "2026-07-01",
  },
  {
    county: "Lee",
    zip_code: "33914",
    rental_listing_count: 388,
    observed_price_min: 1050,
    observed_price_max: 8900,
    captured_date: "2026-07-01",
  },
  // Non-core (33946 = Charlotte county, FIPS 12015 — verified real ZIP, outside Lee/Collier).
  // Present in the source's by_zip; the pack's core-scope filter must drop it before the detail
  // table. summarize() itself does NOT filter, so it still counts this row.
  {
    county: "Charlotte",
    zip_code: "33946",
    rental_listing_count: 77,
    observed_price_min: 1400,
    observed_price_max: 5200,
    captured_date: "2026-07-01",
  },
];

function makeFragment(rows: RentalStatRow[]): RawFragment {
  const summary: ActiveRentalsSummary = summarize(rows, "fixture://active-rentals");
  return {
    fragment_id: "active_rentals_swfl:summary:test",
    source_id: "active_rentals_swfl",
    source_trust_tier: 2,
    fetched_at: NOW,
    raw: summary,
    normalized: summary,
  } as unknown as RawFragment;
}

test("summarize: splits GROUPING SETS rows into region/county/zip by null-ness", () => {
  const s = summarize(ROWS, "u");
  assert.equal(s.region?.rental_listing_count, 9393);
  assert.equal(s.by_county.length, 2);
  // summarize() does NOT apply core scope — it counts every ZIP row (3 core + 1 non-core).
  assert.equal(s.by_zip.length, 4);
});

test("active-rentals-swfl: ONLY the count headlines (no invented median rent)", () => {
  activeRentalsSwfl.corpusSummary!([makeFragment(ROWS)]);
  const result = activeRentalsSwfl.outputProducer!({} as never);

  const slugs = result.key_metrics.map((m) => m.metric);
  assert.deepEqual(slugs, ["active_rental_listings_count_swfl"]);
  const m = result.key_metrics[0]!;
  assert.equal(m.value, 9393);
  assert.ok(m.source?.url && m.source?.citation, "headline must carry source url + citation");
  // No median/average rent metric — that would blend price.min/price.max into an invented number.
  for (const bad of ["median_rent", "average_rent", "avg_rent"]) {
    assert.ok(!slugs.some((s) => s.includes(bad)), `${bad} must not be a headline metric`);
  }
});

test("active-rentals-swfl: county + ZIP detail tables carry count and observed price range", () => {
  activeRentalsSwfl.corpusSummary!([makeFragment(ROWS)]);
  const result = activeRentalsSwfl.outputProducer!({} as never);

  const byCounty = result.detail_tables?.find((t) => t.id === "active_rentals_by_county");
  assert.ok(byCounty && byCounty.rows.length === 2);
  const lee = byCounty!.rows.find((r) => r.key === "Lee");
  assert.equal(lee?.cells.rental_listing_count, 5211);
  assert.equal(lee?.cells.observed_price_min, 550);
  assert.equal(lee?.cells.observed_price_max, 9800);

  // Core scope filter: 3 core ZIPs survive (33901, 34102, 33914); non-core 33946 (Charlotte) dropped.
  const byZip = result.detail_tables?.find((t) => t.id === "active_rentals_by_zip");
  assert.ok(
    byZip && byZip.rows.length === 3,
    `expected 3 core ZIP rows, got ${byZip?.rows.length}`,
  );
  const zipKeys = new Set(byZip!.rows.map((r) => r.key));
  assert.ok(zipKeys.has("33901") && zipKeys.has("34102") && zipKeys.has("33914"));
  assert.ok(!zipKeys.has("33946"), "non-core ZIP 33946 must be filtered from the detail table");
});

test("active-rentals-swfl: zero-data path returns neutral with no metrics", () => {
  activeRentalsSwfl.corpusSummary!([]);
  const result = activeRentalsSwfl.outputProducer!({} as never);
  assert.equal(result.direction, "neutral");
  assert.equal(result.key_metrics.length, 0);
});
