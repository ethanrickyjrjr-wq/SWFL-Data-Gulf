import { test } from "bun:test";
import assert from "node:assert/strict";

process.env["REFINERY_SOURCE"] = "fixture";

const { collierOfficialRecordsSwfl } = await import("./collier-official-records-swfl.mts");
const { collierOfficialRecordsSource } =
  await import("../sources/collier-official-records-source.mts");

import type { RawFragment } from "../types/fragment.mts";
import type { CollierRecordsSummary } from "../sources/collier-official-records-source.mts";

function summaryFragment(s: Partial<CollierRecordsSummary>): RawFragment {
  const summary: CollierRecordsSummary = {
    kind: "collier-official-records-summary",
    collier_records_total: 0,
    collier_records_30d: 0,
    collier_deed_30d: 0,
    collier_notice_of_commencement_30d: 0,
    latest_record_date: null,
    earliest_record_date: null,
    fetched_at: "2026-08-12T00:00:00Z",
    ...s,
  };
  return {
    fragment_id: "collier_official_records::summary",
    source_id: "collier_official_records",
    source_trust_tier: 1,
    fetched_at: summary.fetched_at,
    raw: { kind: summary.kind },
    normalized: summary as unknown as Record<string, unknown>,
  };
}

// ── Pack identity ─────────────────────────────────────────────────────────────

test("collier-official-records-swfl: id, domain, leaf, single tier-1 source, deterministic", () => {
  assert.equal(collierOfficialRecordsSwfl.id, "collier-official-records-swfl");
  assert.equal(collierOfficialRecordsSwfl.brain_id, "collier-official-records-swfl");
  assert.equal(collierOfficialRecordsSwfl.domain, "real-estate");
  assert.deepEqual(collierOfficialRecordsSwfl.input_brains, []);
  assert.equal(collierOfficialRecordsSwfl.sources.length, 1);
  assert.equal(collierOfficialRecordsSwfl.sources[0].source_id, "collier_official_records");
  assert.equal(collierOfficialRecordsSwfl.sources[0].trust_tier, 1);
  assert.equal(collierOfficialRecordsSwfl.skipTriageAgent, true);
  assert.equal(collierOfficialRecordsSwfl.skipSynthesisAgent, true);
});

// ── Deterministic metric math ─────────────────────────────────────────────────

test("outputProducer: counts are computed exactly, no invented sale-price field", () => {
  collierOfficialRecordsSwfl.corpusSummary!([
    summaryFragment({
      collier_records_total: 8,
      collier_records_30d: 8,
      collier_deed_30d: 2,
      collier_notice_of_commencement_30d: 3,
      latest_record_date: "2026-08-12",
      earliest_record_date: "2026-08-07",
    }),
  ]);
  const out = collierOfficialRecordsSwfl.outputProducer!({} as never);

  const byMetric = new Map(out.key_metrics.map((m) => [m.metric, m.value]));
  assert.equal(byMetric.get("collier_records_total"), 8);
  assert.equal(byMetric.get("collier_records_30d"), 8);
  assert.equal(byMetric.get("collier_deed_30d"), 2);
  assert.equal(byMetric.get("collier_notice_of_commencement_30d"), 3);
  assert.equal(out.direction, "neutral");
  assert.equal(out.magnitude, 0);
  // No metric named anything price/consideration-shaped — this feed has none.
  for (const m of out.key_metrics) {
    assert.ok(!/price|consideration|sale/i.test(m.metric));
    assert.equal(m.source.tier, 1);
  }
  assert.ok(out.caveats.some((c) => c.includes("NO consideration")));
});

test("outputProducer: empty table -> clean-empty, neutral, no metrics", () => {
  collierOfficialRecordsSwfl.corpusSummary!([]); // no fragment
  const out = collierOfficialRecordsSwfl.outputProducer!({} as never);
  assert.deepEqual(out.key_metrics, []);
  assert.equal(out.direction, "neutral");
  assert.equal(out.magnitude, 0);
  assert.ok(out.caveats.length > 0);
});

// ── Source connector shape ────────────────────────────────────────────────────

test("source connector: id + trust tier are stable", () => {
  assert.equal(collierOfficialRecordsSource.source_id, "collier_official_records");
  assert.equal(collierOfficialRecordsSource.trust_tier, 1);
});

test("source connector: fixture path yields non-empty summary from the sample file", async () => {
  const fragments = await collierOfficialRecordsSource.fetch();
  assert.equal(fragments.length, 1);
  const s = fragments[0].normalized as unknown as CollierRecordsSummary;
  assert.equal(s.kind, "collier-official-records-summary");
  assert.equal(s.collier_records_total, 8); // matches the 8-row fixture file
});
