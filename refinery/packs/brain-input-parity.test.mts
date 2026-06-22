import { test } from "bun:test";
import assert from "node:assert/strict";
import { PACKS, brainInputParityError } from "../config/packs.mts";
import { makeBrainInputSource } from "../sources/brain-input-source.mts";
import type { PackDefinition } from "../types/pack.mts";

// Phase-1 build 05 — the DAG resolver (refinery/lib/dag.mts resolveBuildOrder)
// walks ONLY input_brains, so a brain-input:* source with no matching input_brains
// edge is fetched-but-never-built → deterministic master HOLD (672180c; 06-18).
// brainInputParityError() is the predicate the module-load invariant in
// config/packs.mts throws on; these tests pin both the positive and negative cases.

test("every registered pack's brain-input sources are mirrored in input_brains", () => {
  // If the registry ever drifts, importing PACKS throws at module load — but
  // assert per-pack here too so a failure names the offending pack.
  for (const pack of Object.values(PACKS)) {
    assert.equal(brainInputParityError(pack), null, pack.brain_id);
  }
});

test("a brain-input source with no input_brains edge is rejected", () => {
  const orphan = {
    brain_id: "test-pack",
    sources: [makeBrainInputSource("ghost-upstream")],
    input_brains: [],
  } as unknown as PackDefinition;
  const err = brainInputParityError(orphan);
  assert.ok(err, "expected a parity error for the orphaned brain-input source");
  assert.match(err, /ghost-upstream/);
  assert.match(err, /input_brains/);
});

test("a brain-input source WITH a matching input_brains edge passes", () => {
  const ok = {
    brain_id: "test-pack",
    sources: [makeBrainInputSource("real-upstream")],
    input_brains: [{ id: "real-upstream", edge_type: "input" }],
  } as unknown as PackDefinition;
  assert.equal(brainInputParityError(ok), null);
});

test("a non-brain-input (vendor) source with no edge is ignored", () => {
  const vendor = {
    brain_id: "test-pack",
    sources: [
      {
        source_id: "bls-laus",
        trust_tier: 1,
        fetch: async () => [],
        citationMeta: () => ({ source: "", verified: "", expires: "" }),
      },
    ],
    input_brains: [],
  } as unknown as PackDefinition;
  assert.equal(brainInputParityError(vendor), null);
});
