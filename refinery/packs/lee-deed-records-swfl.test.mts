import { test } from "bun:test";
import assert from "node:assert/strict";

process.env["REFINERY_SOURCE"] = "fixture";

const { leeDeedRecordsSwfl } = await import("./lee-deed-records-swfl.mts");
const { leeDeedRecordsSource } = await import("../sources/lee-deed-records-source.mts");

import type { RawFragment } from "../types/fragment.mts";
import type { DeedRecordsSummary } from "../sources/lee-deed-records-source.mts";

function summaryFragment(s: Partial<DeedRecordsSummary>): RawFragment {
  const summary: DeedRecordsSummary = {
    kind: "lee-deed-records-summary",
    deed_records_total_lee: 0,
    deed_records_30d_lee: 0,
    deed_arms_length_30d_lee: 0,
    deed_nominal_30d_lee: 0,
    latest_record_date_lee: null,
    earliest_record_date_lee: null,
    deed_financing_financed_lee: 0,
    deed_financing_no_recorded_lee: 0,
    deed_financing_unclassifiable_lee: 0,
    fetched_at: "2026-07-20T00:00:00Z",
    ...s,
  };
  return {
    fragment_id: "lee_deed_official_records::summary",
    source_id: "lee_deed_official_records",
    source_trust_tier: 1,
    fetched_at: summary.fetched_at,
    raw: { kind: summary.kind },
    normalized: summary as unknown as Record<string, unknown>,
  };
}

// ── Pack identity ─────────────────────────────────────────────────────────────

test("lee-deed-records-swfl: id, domain, leaf, single tier-1 source, deterministic", () => {
  assert.equal(leeDeedRecordsSwfl.id, "lee-deed-records-swfl");
  assert.equal(leeDeedRecordsSwfl.brain_id, "lee-deed-records-swfl");
  assert.equal(leeDeedRecordsSwfl.domain, "real-estate");
  assert.deepEqual(leeDeedRecordsSwfl.input_brains, []);
  assert.equal(leeDeedRecordsSwfl.sources.length, 1);
  assert.equal(leeDeedRecordsSwfl.sources[0].source_id, "lee_deed_official_records");
  assert.equal(leeDeedRecordsSwfl.sources[0].trust_tier, 1);
  assert.equal(leeDeedRecordsSwfl.skipTriageAgent, true);
  assert.equal(leeDeedRecordsSwfl.skipSynthesisAgent, true);
});

// ── Deterministic metric math ─────────────────────────────────────────────────

test("outputProducer: counts + nominal-transfer share are computed exactly", () => {
  leeDeedRecordsSwfl.corpusSummary!([
    summaryFragment({
      deed_records_total_lee: 191,
      deed_records_30d_lee: 191,
      deed_arms_length_30d_lee: 109,
      deed_nominal_30d_lee: 82,
      latest_record_date_lee: "2026-07-16",
      earliest_record_date_lee: "2026-07-16",
    }),
  ]);
  const out = leeDeedRecordsSwfl.outputProducer!({} as never);

  const byMetric = new Map(out.key_metrics.map((m) => [m.metric, m.value]));
  assert.equal(byMetric.get("deed_records_total_lee"), 191);
  assert.equal(byMetric.get("deed_records_30d_lee"), 191);
  assert.equal(byMetric.get("deed_arms_length_30d_lee"), 109);
  // 82 / (109 + 82) = 0.4293...
  assert.equal(byMetric.get("deed_nominal_transfer_share_lee"), 0.4293);
  assert.equal(out.direction, "neutral");
  assert.equal(out.magnitude, 0);
  // Reporter tier: every metric carries a tier-1 citation.
  for (const m of out.key_metrics) {
    assert.equal(m.source.tier, 1);
    assert.ok(m.source.citation.length > 0);
  }
});

test("outputProducer: cash-vs-financed metrics are computed exactly", () => {
  leeDeedRecordsSwfl.corpusSummary!([
    summaryFragment({
      deed_records_total_lee: 28186,
      deed_records_30d_lee: 500,
      deed_arms_length_30d_lee: 300,
      deed_nominal_30d_lee: 200,
      latest_record_date_lee: "2026-08-11",
      earliest_record_date_lee: "2026-07-13",
      deed_financing_financed_lee: 1179,
      deed_financing_no_recorded_lee: 1852,
      deed_financing_unclassifiable_lee: 180,
    }),
  ]);
  const out = leeDeedRecordsSwfl.outputProducer!({} as never);
  const byMetric = new Map(out.key_metrics.map((m) => [m.metric, m.value]));

  assert.equal(byMetric.get("deed_arms_length_paired_mortgage_lee"), 1179);
  // 1852 / (1179 + 1852) = 1852 / 3031 = 0.61102... -> rounds to 0.611
  assert.equal(byMetric.get("deed_no_recorded_financing_share_lee"), 0.611);
  assert.ok(out.caveats.some((c) => c.includes("2026-07-13 to 2026-08-11")));
});

test("outputProducer: cash-vs-financed share suppresses over the 15% unclassifiable floor", () => {
  leeDeedRecordsSwfl.corpusSummary!([
    summaryFragment({
      deed_records_total_lee: 100,
      deed_records_30d_lee: 100,
      deed_arms_length_30d_lee: 80,
      deed_nominal_30d_lee: 20,
      latest_record_date_lee: "2026-08-11",
      earliest_record_date_lee: "2026-07-13",
      deed_financing_financed_lee: 40,
      deed_financing_no_recorded_lee: 40,
      deed_financing_unclassifiable_lee: 20, // 20 / 100 = 20% > 15% floor
    }),
  ]);
  const out = leeDeedRecordsSwfl.outputProducer!({} as never);
  const byMetric = new Map(out.key_metrics.map((m) => [m.metric, m.value]));

  assert.equal(byMetric.has("deed_no_recorded_financing_share_lee"), false);
  // The count metric is still safe to publish — it isn't a biased ratio.
  assert.equal(byMetric.get("deed_arms_length_paired_mortgage_lee"), 40);
  assert.ok(out.caveats.some((c) => c.includes("suppressed")));
});

test("outputProducer: empty table -> clean-empty, neutral, no metrics", () => {
  leeDeedRecordsSwfl.corpusSummary!([]); // no fragment
  const out = leeDeedRecordsSwfl.outputProducer!({} as never);
  assert.deepEqual(out.key_metrics, []);
  assert.equal(out.direction, "neutral");
  assert.equal(out.magnitude, 0);
  assert.ok(out.caveats.length > 0);
});

// ── Source connector shape ────────────────────────────────────────────────────

test("source connector: id + trust tier are stable", () => {
  assert.equal(leeDeedRecordsSource.source_id, "lee_deed_official_records");
  assert.equal(leeDeedRecordsSource.trust_tier, 1);
});
