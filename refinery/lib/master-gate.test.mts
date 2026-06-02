// refinery/lib/master-gate.test.mts
import { test } from "bun:test";
import assert from "node:assert/strict";
import {
  evaluateMasterGate,
  computeDegradedCriticalIds,
  type MasterGateInput,
} from "./master-gate.mts";

/** Build a PUBLISH-by-default gate input; override per test to trip a rule. */
function gateInput(overrides: Partial<MasterGateInput> = {}): MasterGateInput {
  return {
    rendered: { confidence: 0.8, upstream_count: 5 },
    priorMasterExists: true,
    criticalHoleIds: new Set<string>(),
    criticalUpstreamIds: new Set<string>(),
    degradedCriticalIds: new Set<string>(),
    ...overrides,
  };
}

// Rule 1 — a critical upstream re-darkened (had a last-good, eligibility expired).
test("HOLD: re-darkened critical hole", () => {
  const decision = evaluateMasterGate(
    gateInput({
      criticalHoleIds: new Set(["env-swfl"]),
      criticalUpstreamIds: new Set(["env-swfl"]),
    }),
  );
  assert.equal(decision, "HOLD");
});

// not-yet-online — a never-built critical upstream is non-blocking (no hole).
test("PUBLISH: never-built critical (not-yet-online)", () => {
  const decision = evaluateMasterGate(
    gateInput({
      criticalHoleIds: new Set<string>(),
      degradedCriticalIds: new Set<string>(),
      criticalUpstreamIds: new Set(["env-swfl"]),
    }),
  );
  assert.equal(decision, "PUBLISH");
});

// Rule 2 — hollow output (no upstreams passed) must not clobber a serving master.
test("HOLD: hollow overwrite with prior master", () => {
  const decision = evaluateMasterGate(
    gateInput({
      rendered: { confidence: 0.8, upstream_count: 0 },
      priorMasterExists: true,
    }),
  );
  assert.equal(decision, "HOLD");
});

// Rule 2 carve-out — a hollow cold start (no prior master) is allowed to write.
test("PUBLISH: hollow but cold start (no prior master)", () => {
  const decision = evaluateMasterGate(
    gateInput({
      rendered: { confidence: 0.8, upstream_count: 0 },
      priorMasterExists: false,
    }),
  );
  assert.equal(decision, "PUBLISH");
});

// Rule 3 — confidence floor knob (default OFF) trips when tuned above the value.
test("HOLD: confidence knob triggered", () => {
  const decision = evaluateMasterGate(
    gateInput({
      rendered: { confidence: 0.5, upstream_count: 5 },
      knobs: { minPublishConfidence: 0.9 },
    }),
  );
  assert.equal(decision, "HOLD");
});

// Rule 4 — degraded fraction ceiling knob (default OFF) trips when tuned below.
// 1 critical upstream, 1 degraded-critical → fraction 1.0 > 0.4 → HOLD.
test("HOLD: degraded fraction ceiling knob triggered", () => {
  const decision = evaluateMasterGate(
    gateInput({
      criticalUpstreamIds: new Set(["env-swfl"]),
      degradedCriticalIds: new Set(["env-swfl"]),
      knobs: { maxDegradedFraction: 0.4 },
    }),
  );
  assert.equal(decision, "HOLD");
});

// A non-critical degraded upstream never blocks under default knobs.
test("PUBLISH: non-critical hole", () => {
  const decision = evaluateMasterGate(
    gateInput({
      criticalHoleIds: new Set<string>(),
      criticalUpstreamIds: new Set<string>(),
      degradedCriticalIds: new Set(["safety-swfl"]),
    }),
  );
  assert.equal(decision, "PUBLISH");
});

// ── computeDegradedCriticalIds — the gate's Rule-4 numerator construction ──
// (issue #6) One test per filter clause. The INCLUDE case is first and load-bearing:
// without it, a `return new Set()` stub would pass every exclusion case below.
const sorted = (s: ReadonlySet<string>) => [...s].sort();

test("numerator INCLUDE: critical+degraded, no holes/never-built → non-empty", () => {
  const result = computeDegradedCriticalIds({
    allDegraded: new Set(["A", "B"]),
    criticalUpstreamIds: new Set(["A", "B"]),
    holes: new Set<string>(),
    neverBuilt: new Set<string>(),
  });
  assert.deepEqual(sorted(result), ["A", "B"]);
});

test("numerator EXCLUDE never-built (issue #6 fix)", () => {
  const result = computeDegradedCriticalIds({
    allDegraded: new Set(["A"]),
    criticalUpstreamIds: new Set(["A"]),
    holes: new Set<string>(),
    neverBuilt: new Set(["A"]),
  });
  assert.deepEqual(sorted(result), []);
});

test("numerator LEAK reproduced without the never-built guard (regression)", () => {
  // Same inputs as the fix case but neverBuilt empty — proves the exclusion is what
  // keeps A out, not some other clause.
  const result = computeDegradedCriticalIds({
    allDegraded: new Set(["A"]),
    criticalUpstreamIds: new Set(["A"]),
    holes: new Set<string>(),
    neverBuilt: new Set<string>(),
  });
  assert.deepEqual(sorted(result), ["A"]);
});

test("numerator EXCLUDE holes and never-built together", () => {
  const result = computeDegradedCriticalIds({
    allDegraded: new Set(["A", "B"]),
    criticalUpstreamIds: new Set(["A", "B"]),
    holes: new Set(["A"]),
    neverBuilt: new Set(["B"]),
  });
  assert.deepEqual(sorted(result), []);
});

test("numerator EXCLUDE non-critical degraded", () => {
  const result = computeDegradedCriticalIds({
    allDegraded: new Set(["C"]),
    criticalUpstreamIds: new Set(["A"]),
    holes: new Set<string>(),
    neverBuilt: new Set<string>(),
  });
  assert.deepEqual(sorted(result), []);
});
