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
