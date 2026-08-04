// Positive controls for Gate 11 — each violation class MUST trip (a gate that
// can't fail is not a gate; playbook addendum B rule, applied to the gate itself).
//
// RUNNER: node:test, converted from bun:test 08/04/2026. It had to change because
// NOTHING RAN THIS FILE. `bun test` (ci.yml "Test" step) does not discover dot-dirs,
// and the one step that globs it — `node --test ... .claude/hooks/lib/*.test.mjs` —
// cannot load the `bun:` URL scheme at all (ERR_UNSUPPORTED_ESM_URL_SCHEME, verified
// live). So Gate 11's positive controls were green-by-assumption from the day they
// were written, exactly the failure the ci.yml comment above that glob describes for
// its predecessors. Keep these imports on node:test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeGaps, invalidClasses, ratchetVerdict, baselineJson } from "./coverage-ratchet.mjs";

const COMPLETE = `pipelines:
  - name: good_pipeline
    workflow: good.yml
    source_scope:
      confirmed_total:
        summary: "everything"
    source_ceiling:
      summary: "nothing unpulled"
    raw_landing_class: free_refetchable
`;

const INCOMPLETE = `pipelines:
  - name: good_pipeline
    source_scope:
      confirmed_total: {}
    source_ceiling: {}
    raw_landing_class: paid_landed
  - name: bad_pipeline
    workflow: bad.yml
    source_scope:
      confirmed_total: {}
jobs:
  - name: some_job
    workflow: job.yml
`;

// ── computeGaps ────────────────────────────────────────────────────────────────

test("computeGaps: complete entry produces no gap", () => {
  assert.deepStrictEqual(computeGaps(COMPLETE), {});
});

test("computeGaps: missing keys are named per entry; jobs: section is ignored", () => {
  const gaps = computeGaps(INCOMPLETE);
  assert.deepStrictEqual(gaps, { bad_pipeline: ["source_ceiling", "raw_landing_class"] });
  assert.ok(!Object.keys(gaps).includes("some_job")); // jobs never require scope blocks
});

test("computeGaps: POSITIVE CONTROL — a brand-new entry with nothing declared trips all three", () => {
  const gaps = computeGaps(`pipelines:\n  - name: fresh_one\n    workflow: f.yml\n`);
  assert.deepStrictEqual(gaps.fresh_one, ["source_scope", "source_ceiling", "raw_landing_class"]);
});

// ── invalidClasses ─────────────────────────────────────────────────────────────

test("invalidClasses: allowed classes pass, junk value is caught", () => {
  assert.deepStrictEqual(invalidClasses(COMPLETE), []);
  const bad = invalidClasses(
    `pipelines:\n  - name: x\n    raw_landing_class: keep_everything_forever\n`,
  );
  assert.deepStrictEqual(bad, [{ name: "x", value: "keep_everything_forever" }]);
});

// ── ratchetVerdict ─────────────────────────────────────────────────────────────

const grandfathered = { old_pipe: ["source_ceiling"] };

test("ratchetVerdict: computed == baseline, no growth → ok", () => {
  const v = ratchetVerdict({
    computed: grandfathered,
    baselineHead: grandfathered,
    baselineBase: grandfathered,
  });
  assert.strictEqual(v.ok, true);
});

test("ratchetVerdict: POSITIVE CONTROL — DRIFT: new incomplete entry not in baseline blocks", () => {
  const v = ratchetVerdict({
    computed: { ...grandfathered, new_pipe: ["source_scope"] },
    baselineHead: grandfathered,
    baselineBase: grandfathered,
  });
  assert.strictEqual(v.ok, false);
  assert.ok(v.drift.join("\n").includes("new_pipe::source_scope"));
});

test("ratchetVerdict: POSITIVE CONTROL — DRIFT: fixed gap without shrinking baseline blocks", () => {
  const v = ratchetVerdict({
    computed: {},
    baselineHead: grandfathered,
    baselineBase: grandfathered,
  });
  assert.strictEqual(v.ok, false);
  assert.ok(v.drift.join("\n").includes("shrink the baseline"));
});

test("ratchetVerdict: POSITIVE CONTROL — NEW DEBT: adding your gap to the baseline blocks", () => {
  const v = ratchetVerdict({
    computed: { ...grandfathered, sneaky: ["raw_landing_class"] },
    baselineHead: { ...grandfathered, sneaky: ["raw_landing_class"] },
    baselineBase: grandfathered,
  });
  assert.strictEqual(v.ok, false);
  assert.deepStrictEqual(v.newDebt, ["sneaky::raw_landing_class"]);
});

test("ratchetVerdict: first introduction (no baseline at push base) waives the ratchet rule only", () => {
  const v = ratchetVerdict({
    computed: grandfathered,
    baselineHead: grandfathered,
    baselineBase: null,
  });
  assert.strictEqual(v.ok, true);
});

// ── baselineJson ───────────────────────────────────────────────────────────────

test("baselineJson: stable sorted output ends with newline", () => {
  const out = baselineJson({ b: ["z", "a"], a: ["k"] });
  assert.ok(out.indexOf('"a"') < out.indexOf('"b"'));
  assert.ok(out.endsWith("\n"));
  assert.deepStrictEqual(JSON.parse(out), { a: ["k"], b: ["a", "z"] });
});
