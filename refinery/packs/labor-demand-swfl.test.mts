import { test } from "bun:test";
import assert from "node:assert/strict";
import type { RawFragment } from "../types/fragment.mts";
import type { OewsMsaSnapshot } from "../sources/bls-oews-source.mts";
import { CITATION_URL } from "../sources/bls-oews-source.mts";

process.env["REFINERY_SOURCE"] = "fixture";

const { laborDemandSwfl } = await import("./labor-demand-swfl.mts");

const NOW = "2026-05-22T00:00:00Z";

function msa(area_code: string): OewsMsaSnapshot {
  return {
    area_code,
    top_groups: [{ occ_title: "Office and Administrative Support", tot_emp: 42_000 } as never],
    construction_loc_q: 2.17,
    healthcare_employment: 38_000,
    construction_median_wage: 24.5,
  } as OewsMsaSnapshot;
}

function makeFragment(): RawFragment {
  const summary = {
    kind: "bls-oews-swfl-summary",
    ref_year: 2024,
    cape_coral: msa("15980"),
    naples: msa("34940"),
    cape_coral_employment_yoy_pct: 1.8,
    naples_employment_yoy_pct: -0.4,
  };
  return {
    fragment_id: "bls_oews_swfl:summary:test",
    source_id: "bls_oews_swfl",
    source_trust_tier: 1,
    fetched_at: NOW,
    raw: summary,
    normalized: summary,
  } as unknown as RawFragment;
}

// Regression guard: makeSource() reads CITATION_URL, which was an UNIMPORTED symbol
// in labor-demand-swfl.mts — every build of this brain threw ReferenceError at
// runtime, and no test exercised the path (the refinery typecheck that would have
// caught TS2304 is not a CI gate). This test builds the output and asserts the
// citation URL is wired through, so the crash can never silently return.
test("labor-demand-swfl: builds output without throwing and stamps the BLS citation URL", () => {
  laborDemandSwfl.corpusSummary!([makeFragment()]);
  const result = laborDemandSwfl.outputProducer!({} as never);

  assert.ok(result.key_metrics.length > 0, "expected metrics from a full fixture");
  for (const m of result.key_metrics) {
    assert.equal(
      m.source?.url,
      CITATION_URL,
      `metric ${m.metric} should carry the BLS OEWS citation URL`,
    );
  }
});

test("labor-demand-swfl: zero-data path returns neutral with no metrics", () => {
  laborDemandSwfl.corpusSummary!([]);
  const result = laborDemandSwfl.outputProducer!({} as never);
  assert.equal(result.direction, "neutral");
  assert.equal(result.magnitude, 0);
  assert.equal(result.key_metrics.length, 0);
});
