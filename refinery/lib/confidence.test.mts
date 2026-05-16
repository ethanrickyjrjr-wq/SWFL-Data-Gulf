import { test } from "node:test";
import assert from "node:assert/strict";
import {
  attributeError,
  tierToScore,
  computeConfidence,
  type WeightedSource,
} from "./confidence.mts";
import type { SourceConnector } from "../types/pack.mts";

// ---------------------------------------------------------------------------
// tierToScore — the mapping that seeds source_connectors.trust_tier_score
// ---------------------------------------------------------------------------

test("tierToScore: tier 1 → 1.0, tier 2 → 0.8, tier 3 → 0.6, tier 4 → 0.4", () => {
  assert.equal(tierToScore(1), 1.0);
  assert.equal(tierToScore(2), 0.8);
  assert.equal(tierToScore(3), 0.6);
  assert.equal(tierToScore(4), 0.4);
});

// ---------------------------------------------------------------------------
// attributeError — formula + sort order + edge cases
// ---------------------------------------------------------------------------

test("attributeError: error_contribution = outputConfidence / trust_tier_score", () => {
  const sources: WeightedSource[] = [
    { source_id: "primary", trust_tier_score: 1.0 },
    { source_id: "weak", trust_tier_score: 0.4 },
  ];
  const result = attributeError(0.5, sources);
  // 0.5 / 1.0 = 0.5; 0.5 / 0.4 = 1.25 — weak comes first
  const weak = result[0];
  const primary = result[1];
  assert.equal(weak.source_id, "weak");
  assert.equal(weak.error_contribution, 1.25);
  assert.equal(primary.source_id, "primary");
  assert.equal(primary.error_contribution, 0.5);
});

test("attributeError: sorted by error_contribution descending", () => {
  const sources: WeightedSource[] = [
    { source_id: "a", trust_tier_score: 1.0 }, // 0.6 / 1.0 = 0.6
    { source_id: "b", trust_tier_score: 0.6 }, // 0.6 / 0.6 = 1.0
    { source_id: "c", trust_tier_score: 0.4 }, // 0.6 / 0.4 = 1.5
    { source_id: "d", trust_tier_score: 0.8 }, // 0.6 / 0.8 = 0.75
  ];
  const ids = attributeError(0.6, sources).map((r) => r.source_id);
  assert.deepEqual(ids, ["c", "b", "d", "a"]);
});

test("attributeError: empty sources → empty result", () => {
  assert.deepEqual(attributeError(0.5, []), []);
});

test("attributeError: trust_tier_score = 0 is floored (no Infinity)", () => {
  const sources: WeightedSource[] = [
    { source_id: "broken", trust_tier_score: 0 },
    { source_id: "ok", trust_tier_score: 1 },
  ];
  const result = attributeError(0.5, sources);
  const broken = result.find((r) => r.source_id === "broken")!;
  // Score 0 clamps to 0.01 floor → 0.5 / 0.01 = 50, finite + first
  assert.ok(Number.isFinite(broken.error_contribution));
  assert.equal(broken.error_contribution, 50);
  assert.equal(result[0].source_id, "broken", "broken stays the weakest");
  // The reported trust_tier_score preserves the raw 0 so callers see reality
  assert.equal(broken.trust_tier_score, 0);
});

test("attributeError: preserves raw trust_tier_score in the result", () => {
  const sources: WeightedSource[] = [{ source_id: "a", trust_tier_score: 0.4 }];
  const [entry] = attributeError(0.5, sources);
  assert.equal(entry.trust_tier_score, 0.4);
});

test("attributeError: outputConfidence = 0 → all contributions = 0", () => {
  const sources: WeightedSource[] = [
    { source_id: "a", trust_tier_score: 1.0 },
    { source_id: "b", trust_tier_score: 0.4 },
  ];
  const result = attributeError(0, sources);
  assert.equal(result[0].error_contribution, 0);
  assert.equal(result[1].error_contribution, 0);
});

// ---------------------------------------------------------------------------
// Integration: tier-derived weighted sources match the formula
// ---------------------------------------------------------------------------

test("attributeError: tier-derived scores agree with tierToScore", () => {
  // Stage 4 builds WeightedSource from SourceConnector.trust_tier via
  // tierToScore. Pin the behavior so a future swap of TIER_SCORE values
  // forces a deliberate update here too.
  const sources: WeightedSource[] = [
    { source_id: "fed", trust_tier_score: tierToScore(1) },
    { source_id: "aggregator", trust_tier_score: tierToScore(3) },
  ];
  const result = attributeError(0.45, sources);
  assert.equal(result[0].source_id, "aggregator"); // tier 3 = 0.6 → 0.75
  assert.equal(result[1].source_id, "fed"); // tier 1 = 1.0 → 0.45
});

// ---------------------------------------------------------------------------
// computeConfidence — pin existing behavior so we don't regress it
// ---------------------------------------------------------------------------

function mockSource(id: string, tier: 1 | 2 | 3 | 4): SourceConnector {
  return {
    source_id: id,
    trust_tier: tier,
    fetch: async () => [],
    citationMeta: () => ({
      source: id,
      verified: "2026-05-16",
      expires: "2026-06-16",
    }),
  };
}

test("computeConfidence: tier 2 source, fresh, no upstreams → 0.8", () => {
  const c = computeConfidence({
    sources: [mockSource("s", 2)],
    refined_at: "2026-05-16T00:00:00.000Z",
    ttl_seconds: 86_400,
  });
  assert.equal(c, 0.8);
});

test("computeConfidence: tier 1 source × 0.5 upstream → 0.5", () => {
  const c = computeConfidence({
    sources: [mockSource("s", 1)],
    refined_at: "2026-05-16T00:00:00.000Z",
    ttl_seconds: 86_400,
    upstream_confidences: [0.5],
  });
  assert.equal(c, 0.5);
});
