import { test } from "bun:test";
import assert from "node:assert/strict";
import type { RawFragment } from "../types/fragment.mts";
import type { DbprLicenseSummary } from "../sources/fl-dbpr-licenses-source.mts";

process.env["REFINERY_SOURCE"] = "fixture";

const { licensesSwfl } = await import("./licenses-swfl.mts");
const { flDbprLicensesSource } =
  await import("../sources/fl-dbpr-licenses-source.mts");

const NOW = "2026-06-01T10:00:00Z";

function makeSummaryFragment(
  over: Partial<DbprLicenseSummary> = {},
): RawFragment<DbprLicenseSummary> {
  const base: DbprLicenseSummary = {
    kind: "dbpr-license-summary",
    licenses_active_lee: 500,
    licenses_active_collier: 350,
    licenses_new_12m_swfl: 80,
    licenses_lapsed_swfl: 60,
    licenses_total_swfl: 960,
    licenses_total_active_swfl: 850,
    licenses_cbc_count_swfl: 120,
    applicants_swfl: 15,
    fetched_at: NOW,
    ...over,
  };
  return {
    fragment_id: "fl_dbpr_licenses::summary",
    source_id: "fl_dbpr_licenses",
    source_trust_tier: 1,
    fetched_at: NOW,
    raw: {},
    normalized: base,
  };
}

// ── Test 1: fixture source returns exactly 1 fragment ─────────────────────────

test("licenses-swfl: fixture source returns exactly 1 fragment", async () => {
  const fragments = await flDbprLicensesSource.fetch();
  assert.equal(fragments.length, 1, "expected exactly 1 summary fragment");
  assert.equal(fragments[0].source_id, "fl_dbpr_licenses");
  const norm = fragments[0].normalized as DbprLicenseSummary;
  assert.equal(norm.kind, "dbpr-license-summary");
  assert.ok(
    typeof norm.licenses_active_lee === "number",
    "licenses_active_lee should be a number",
  );
});

// ── Test 2: deterministic flags ───────────────────────────────────────────────

test("licenses-swfl: deterministic pack flags", () => {
  assert.equal(licensesSwfl.skipSynthesisAgent, true);
  assert.equal(licensesSwfl.skipTriageAgent, true);
  assert.equal(licensesSwfl.input_brains.length, 0);
});

// ── Test 3: corpusSummary populates from fixture ──────────────────────────────

test("licenses-swfl: corpusSummary returns dbpr_licenses_snapshot fact", async () => {
  const fragments = await flDbprLicensesSource.fetch();
  const facts = licensesSwfl.corpusSummary!(fragments);
  assert.ok(facts.length > 0, "corpusSummary should return at least one fact");
  const fact = facts[0];
  assert.equal(fact.topic, "dbpr_licenses_snapshot");
  assert.ok(fact.value, "fact should have a value string");
  assert.ok(
    Array.isArray(fact.source_fragment_ids),
    "source_fragment_ids should be an array",
  );
});

// ── Test 4: outputProducer returns all 6 slugs ────────────────────────────────

test("licenses-swfl: outputProducer returns all 6 key_metrics slugs", async () => {
  const fragments = await flDbprLicensesSource.fetch();
  licensesSwfl.corpusSummary!(fragments);
  const result = licensesSwfl.outputProducer!(
    {} as Parameters<typeof licensesSwfl.outputProducer>[0],
  );

  const expectedSlugs = [
    "licenses_active_lee",
    "licenses_active_collier",
    "licenses_new_12m_swfl",
    "licenses_lapse_rate_swfl",
    "licenses_cbc_share_swfl",
    "licenses_applicants_swfl",
  ];
  const actualSlugs = result.key_metrics.map((m) => m.metric);
  for (const slug of expectedSlugs) {
    assert.ok(actualSlugs.includes(slug), `missing expected slug: ${slug}`);
  }
  assert.ok(result.conclusion.length > 0, "conclusion should be non-empty");
});

// ── Test 5a: bearish from high lapse rate ────────────────────────────────────

test("licenses-swfl: bearish direction from high lapse rate (>10%)", () => {
  // 150 lapsed out of 1000 total = 15%
  const frag = makeSummaryFragment({
    licenses_lapsed_swfl: 150,
    licenses_total_swfl: 1000,
    licenses_total_active_swfl: 850,
    licenses_active_lee: 500,
    licenses_active_collier: 350,
  });
  licensesSwfl.corpusSummary!([frag]);
  const result = licensesSwfl.outputProducer!(
    {} as Parameters<typeof licensesSwfl.outputProducer>[0],
  );
  assert.equal(
    result.direction,
    "bearish",
    `15% lapse rate should yield "bearish", got "${result.direction}"`,
  );
});

// ── Test 5b: bullish from low lapse rate ─────────────────────────────────────

test("licenses-swfl: bullish direction from low lapse rate (<5%)", () => {
  // 30 lapsed out of 1000 total = 3%
  const frag = makeSummaryFragment({
    licenses_lapsed_swfl: 30,
    licenses_total_swfl: 1000,
    licenses_total_active_swfl: 970,
    licenses_active_lee: 600,
    licenses_active_collier: 370,
  });
  licensesSwfl.corpusSummary!([frag]);
  const result = licensesSwfl.outputProducer!(
    {} as Parameters<typeof licensesSwfl.outputProducer>[0],
  );
  assert.equal(
    result.direction,
    "bullish",
    `3% lapse rate should yield "bullish", got "${result.direction}"`,
  );
});

// ── Test 5c: neutral from mid lapse rate ─────────────────────────────────────

test("licenses-swfl: neutral direction from mid lapse rate (5–10%)", () => {
  // 80 lapsed out of 1000 total = 8%
  const frag = makeSummaryFragment({
    licenses_lapsed_swfl: 80,
    licenses_total_swfl: 1000,
    licenses_total_active_swfl: 920,
    licenses_active_lee: 550,
    licenses_active_collier: 370,
  });
  licensesSwfl.corpusSummary!([frag]);
  const result = licensesSwfl.outputProducer!(
    {} as Parameters<typeof licensesSwfl.outputProducer>[0],
  );
  assert.equal(
    result.direction,
    "neutral",
    `8% lapse rate should yield "neutral", got "${result.direction}"`,
  );
});

// ── Test 6: empty fragments returns neutral ───────────────────────────────────

test("licenses-swfl: empty fragments returns neutral direction", () => {
  licensesSwfl.corpusSummary!([]);
  const result = licensesSwfl.outputProducer!(
    {} as Parameters<typeof licensesSwfl.outputProducer>[0],
  );
  assert.equal(result.direction, "neutral");
  assert.equal(result.magnitude, 0);
  assert.equal(result.key_metrics.length, 0);
});
