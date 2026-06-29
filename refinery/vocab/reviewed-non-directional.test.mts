/**
 * reviewed-display bucket — a moat-fuel concept with grade.reviewed_non_directional
 * is deliberately non-directional. It must (a) bucket as "reviewed-display", not
 * "moat-fuel", and (b) still resolve gradeable:false (polarity none) so the §3 pin
 * stays green. Tested against assignBucket(gateVector(...)) with a synthetic vector
 * so it does not depend on a live marked concept existing in the corpus yet.
 */
import { test } from "bun:test";
import assert from "node:assert/strict";
import { assignBucket, type Bucket } from "../tools/grade-config-sweep.mts";
import { type GateVector } from "./loader.mts";

function vec(over: Partial<GateVector>): GateVector {
  return {
    slug: "x",
    concept_id: "x",
    registered: true,
    polarity_state: "none",
    window_ok: true,
    numeric_ok: true,
    raw_polarity: null,
    category: "macro",
    value_type: "count",
    window_days: 90,
    reviewed_non_directional: false,
    ...over,
  };
}

test("marked, numeric, polarity-none concept buckets reviewed-display (not moat-fuel)", () => {
  const bucket: Bucket = assignBucket(vec({ reviewed_non_directional: true }));
  assert.equal(bucket, "reviewed-display");
});

test("unmarked numeric polarity-none concept still buckets moat-fuel", () => {
  assert.equal(assignBucket(vec({ reviewed_non_directional: false })), "moat-fuel");
});

test("marker does not promote a directional concept", () => {
  // valid_directional + window_ok is gradeable regardless of the marker
  assert.equal(
    assignBucket(vec({ polarity_state: "valid_directional", reviewed_non_directional: true })),
    "gradeable",
  );
});
