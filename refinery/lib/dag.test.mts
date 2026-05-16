import { test } from "node:test";
import assert from "node:assert/strict";
import { walkUpstream, walkConsumers } from "./dag.mts";
import type { PackDefinition } from "../types/pack.mts";

// ---------------------------------------------------------------------------
// Test fixtures — minimal PackDefinitions, only `id` + `input_brains` are read
// ---------------------------------------------------------------------------

function mkPack(id: string, input_brains: string[]): PackDefinition {
  return {
    id,
    brain_id: id,
    domain: "real-estate",
    scope: "test",
    ttl_seconds: 86_400,
    sources: [],
    input_brains,
    fitScore: () => 1,
    preferences: [],
    activeProject: "test",
    prompts: { triageContext: "", synthesisContext: "" },
  };
}

function packs(...defs: PackDefinition[]): Record<string, PackDefinition> {
  return Object.fromEntries(defs.map((p) => [p.id, p]));
}

// ---------------------------------------------------------------------------
// walkUpstream
// ---------------------------------------------------------------------------

test("walkUpstream: leaf brain (no inputs) returns empty", () => {
  const PACKS = packs(mkPack("leaf", []));
  assert.deepEqual(walkUpstream("leaf", PACKS), []);
});

test("walkUpstream: single upstream returned", () => {
  const PACKS = packs(mkPack("up", []), mkPack("down", ["up"]));
  assert.deepEqual(walkUpstream("down", PACKS), ["up"]);
});

test("walkUpstream: transitive closure across depth", () => {
  // a -> b -> c -> d (d is the target, a is the deepest ancestor)
  const PACKS = packs(
    mkPack("a", []),
    mkPack("b", ["a"]),
    mkPack("c", ["b"]),
    mkPack("d", ["c"]),
  );
  assert.deepEqual(walkUpstream("d", PACKS), ["a", "b", "c"]);
});

test("walkUpstream: diamond — shared ancestor counted once", () => {
  //     root
  //     /  \
  //    l    r
  //     \  /
  //     target
  const PACKS = packs(
    mkPack("root", []),
    mkPack("l", ["root"]),
    mkPack("r", ["root"]),
    mkPack("target", ["l", "r"]),
  );
  assert.deepEqual(walkUpstream("target", PACKS), ["l", "r", "root"]);
});

test("walkUpstream: result is alphabetically sorted", () => {
  const PACKS = packs(
    mkPack("z", []),
    mkPack("a", []),
    mkPack("m", []),
    mkPack("target", ["z", "a", "m"]),
  );
  assert.deepEqual(walkUpstream("target", PACKS), ["a", "m", "z"]);
});

test("walkUpstream: excludes the root brain itself", () => {
  // Cycle: a depends on b, b depends on a. walkUpstream stays soft (it does
  // not throw — that's resolveBuildOrder's job) and must not include `a`.
  const PACKS = packs(mkPack("a", ["b"]), mkPack("b", ["a"]));
  const result = walkUpstream("a", PACKS);
  assert.deepEqual(result, ["b"]);
  assert.ok(!result.includes("a"), "self is excluded even under a cycle");
});

test("walkUpstream: tolerant of missing pack id (root)", () => {
  const PACKS = packs(mkPack("known", []));
  assert.deepEqual(walkUpstream("does-not-exist", PACKS), []);
});

test("walkUpstream: tolerant of missing upstream id (dangling input_brains)", () => {
  const PACKS = packs(mkPack("target", ["ghost", "real"]), mkPack("real", []));
  // ghost is enumerated (it's a declared input_brain) but its own walk is a no-op
  assert.deepEqual(walkUpstream("target", PACKS), ["ghost", "real"]);
});

test("walkUpstream: cycle deeper in the graph does not loop", () => {
  // target -> a -> b -> a (back-edge)
  const PACKS = packs(
    mkPack("target", ["a"]),
    mkPack("a", ["b"]),
    mkPack("b", ["a"]),
  );
  const result = walkUpstream("target", PACKS);
  assert.deepEqual(result.sort(), ["a", "b"]);
});

// ---------------------------------------------------------------------------
// walkConsumers ↔ walkUpstream adjointness
// ---------------------------------------------------------------------------

test("walkConsumers and walkUpstream are adjoint on the same DAG", () => {
  // up -> mid -> down
  const PACKS = packs(
    mkPack("up", []),
    mkPack("mid", ["up"]),
    mkPack("down", ["mid"]),
  );
  // walkUpstream(down) = ancestors of down
  assert.deepEqual(walkUpstream("down", PACKS), ["mid", "up"]);
  // walkConsumers(up) = direct consumers of up
  assert.deepEqual(walkConsumers("up", PACKS), ["mid"]);
  // walkConsumers is direct (1-hop) by design — symmetry holds with the
  // 1-hop slice of walkUpstream, not the transitive closure.
  assert.deepEqual(walkUpstream("mid", PACKS), ["up"]);
});
