// Positive controls for Gate 11 — each violation class MUST trip (a gate that
// can't fail is not a gate; playbook addendum B rule, applied to the gate itself).
import { describe, test, expect } from "bun:test";
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

describe("computeGaps", () => {
  test("complete entry produces no gap", () => {
    expect(computeGaps(COMPLETE)).toEqual({});
  });

  test("missing keys are named per entry; jobs: section is ignored", () => {
    const gaps = computeGaps(INCOMPLETE);
    expect(gaps).toEqual({ bad_pipeline: ["source_ceiling", "raw_landing_class"] });
    expect(Object.keys(gaps)).not.toContain("some_job"); // jobs never require scope blocks
  });

  test("POSITIVE CONTROL: a brand-new entry with nothing declared trips all three", () => {
    const gaps = computeGaps(`pipelines:\n  - name: fresh_one\n    workflow: f.yml\n`);
    expect(gaps.fresh_one).toEqual(["source_scope", "source_ceiling", "raw_landing_class"]);
  });
});

describe("invalidClasses", () => {
  test("allowed classes pass, junk value is caught", () => {
    expect(invalidClasses(COMPLETE)).toEqual([]);
    const bad = invalidClasses(
      `pipelines:\n  - name: x\n    raw_landing_class: keep_everything_forever\n`,
    );
    expect(bad).toEqual([{ name: "x", value: "keep_everything_forever" }]);
  });
});

describe("ratchetVerdict", () => {
  const grandfathered = { old_pipe: ["source_ceiling"] };

  test("computed == baseline, no growth → ok", () => {
    const v = ratchetVerdict({
      computed: grandfathered,
      baselineHead: grandfathered,
      baselineBase: grandfathered,
    });
    expect(v.ok).toBe(true);
  });

  test("POSITIVE CONTROL — DRIFT: new incomplete entry not in baseline blocks", () => {
    const v = ratchetVerdict({
      computed: { ...grandfathered, new_pipe: ["source_scope"] },
      baselineHead: grandfathered,
      baselineBase: grandfathered,
    });
    expect(v.ok).toBe(false);
    expect(v.drift.join("\n")).toContain("new_pipe::source_scope");
  });

  test("POSITIVE CONTROL — DRIFT: fixed gap without shrinking baseline blocks", () => {
    const v = ratchetVerdict({
      computed: {},
      baselineHead: grandfathered,
      baselineBase: grandfathered,
    });
    expect(v.ok).toBe(false);
    expect(v.drift.join("\n")).toContain("shrink the baseline");
  });

  test("POSITIVE CONTROL — NEW DEBT: adding your gap to the baseline blocks", () => {
    const v = ratchetVerdict({
      computed: { ...grandfathered, sneaky: ["raw_landing_class"] },
      baselineHead: { ...grandfathered, sneaky: ["raw_landing_class"] },
      baselineBase: grandfathered,
    });
    expect(v.ok).toBe(false);
    expect(v.newDebt).toEqual(["sneaky::raw_landing_class"]);
  });

  test("first introduction (no baseline at push base) waives the ratchet rule only", () => {
    const v = ratchetVerdict({
      computed: grandfathered,
      baselineHead: grandfathered,
      baselineBase: null,
    });
    expect(v.ok).toBe(true);
  });
});

describe("baselineJson", () => {
  test("stable sorted output ends with newline", () => {
    const out = baselineJson({ b: ["z", "a"], a: ["k"] });
    expect(out.indexOf('"a"')).toBeLessThan(out.indexOf('"b"'));
    expect(out.endsWith("\n")).toBe(true);
    expect(JSON.parse(out)).toEqual({ a: ["k"], b: ["a", "z"] });
  });
});
