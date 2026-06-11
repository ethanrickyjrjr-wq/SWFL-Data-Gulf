import { describe, it, expect } from "bun:test";
import { vintageSet, isUniformVintage, assertUniformVintage } from "./print-vintage";
import type { SnapshotItem } from "./templates";
import type { ChartSpec } from "../../components/charts/registry/chart-spec";
import type { ChartBlock } from "../../refinery/validate/chart-block-lint.mts";

// ---------------------------------------------------------------------------
// Minimal fixture builders — only the fields print-vintage.ts reads
// ---------------------------------------------------------------------------

function frameItem(asOf: string, id = "f1"): SnapshotItem {
  const spec: Pick<ChartSpec, "asOf" | "title" | "columns" | "rows" | "frameId"> = {
    frameId: "bar-table",
    title: "Test",
    columns: ["label", "value"],
    rows: [],
    asOf,
  };
  return {
    kind: "frame",
    id,
    added_at: "2026-06-11T00:00:00Z",
    origin: "web",
    brain_id: "test-brain",
    title: "Test Frame",
    chart_spec: spec as ChartSpec,
    freshness_token: `SWFL-test-v1-${asOf.replace(/-/g, "")}`,
  } satisfies SnapshotItem;
}

function chartItem(asOf: string, id = "c1"): SnapshotItem {
  const block: Pick<ChartBlock, "title" | "columns" | "rows" | "asOf"> = {
    title: "Test Chart",
    columns: ["label", "value"],
    rows: [],
    asOf,
  };
  return {
    kind: "chart",
    id,
    added_at: "2026-06-11T00:00:00Z",
    origin: "web",
    chart_id: "saved-123",
    title: "Test Chart",
    chart_block: block as ChartBlock,
    freshness_token: `SWFL-test-v1-${asOf.replace(/-/g, "")}`,
  } satisfies SnapshotItem;
}

/** Non-visual item — should be invisible to the vintage check */
function metricItem(id = "m1"): SnapshotItem {
  return {
    kind: "metric",
    id,
    added_at: "2026-06-11T00:00:00Z",
    origin: "web",
    label: "Some Metric",
    value: "$100k",
  } satisfies SnapshotItem;
}

// ---------------------------------------------------------------------------
// vintageSet
// ---------------------------------------------------------------------------

describe("vintageSet", () => {
  it("returns empty set for no items", () => {
    expect(vintageSet([])).toEqual(new Set());
  });

  it("returns empty set when only non-visual items present", () => {
    expect(vintageSet([metricItem()])).toEqual(new Set());
  });

  it("returns one date for a single frame", () => {
    expect(vintageSet([frameItem("2026-03-31")])).toEqual(new Set(["2026-03-31"]));
  });

  it("returns one date when all frames share a vintage", () => {
    const items = [frameItem("2026-03-31", "f1"), frameItem("2026-03-31", "f2")];
    expect(vintageSet(items)).toEqual(new Set(["2026-03-31"]));
  });

  it("returns two dates for mixed-vintage frames", () => {
    const items = [frameItem("2026-03-31", "f1"), frameItem("2026-05-31", "f2")];
    expect(vintageSet(items)).toEqual(new Set(["2026-03-31", "2026-05-31"]));
  });

  it("collects dates from both frame and chart items", () => {
    const items = [frameItem("2026-03-31", "f1"), chartItem("2026-05-31", "c1")];
    expect(vintageSet(items)).toEqual(new Set(["2026-03-31", "2026-05-31"]));
  });

  it("ignores non-visual items in a mixed snapshot", () => {
    const items = [frameItem("2026-03-31"), metricItem()];
    expect(vintageSet(items)).toEqual(new Set(["2026-03-31"]));
  });
});

// ---------------------------------------------------------------------------
// isUniformVintage
// ---------------------------------------------------------------------------

describe("isUniformVintage", () => {
  it("returns true for empty snapshot", () => {
    expect(isUniformVintage([])).toBe(true);
  });

  it("returns true when only non-visual items present", () => {
    expect(isUniformVintage([metricItem()])).toBe(true);
  });

  it("returns true for a single frame", () => {
    expect(isUniformVintage([frameItem("2026-03-31")])).toBe(true);
  });

  it("returns true for uniform-vintage frames", () => {
    const items = [
      frameItem("2026-03-31", "f1"),
      frameItem("2026-03-31", "f2"),
      chartItem("2026-03-31", "c1"),
    ];
    expect(isUniformVintage(items)).toBe(true);
  });

  it("returns false for mixed-vintage frames", () => {
    const items = [
      frameItem("2026-03-31", "f1"), // ZHVI vintage
      frameItem("2026-05-31", "f2"), // Flood AAL vintage
    ];
    expect(isUniformVintage(items)).toBe(false);
  });

  it("returns false when frame + chart span different vintages", () => {
    const items = [frameItem("2026-03-31", "f1"), chartItem("2026-01-31", "c1")];
    expect(isUniformVintage(items)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// assertUniformVintage
// ---------------------------------------------------------------------------

describe("assertUniformVintage", () => {
  it("does not throw for empty snapshot", () => {
    expect(() => assertUniformVintage([])).not.toThrow();
  });

  it("does not throw for a single-vintage snapshot", () => {
    const items = [frameItem("2026-03-31", "f1"), frameItem("2026-03-31", "f2")];
    expect(() => assertUniformVintage(items)).not.toThrow();
  });

  it("does not throw when only non-visual items are present", () => {
    expect(() => assertUniformVintage([metricItem()])).not.toThrow();
  });

  it("THROWS for a mixed-vintage snapshot — cover stamp would lie", () => {
    const items = [
      frameItem("2026-03-31", "f1"), // ZHVI vintage
      frameItem("2026-05-31", "f2"), // Flood AAL vintage
    ];
    expect(() => assertUniformVintage(items)).toThrow(/Mixed vintage/);
  });

  it("error message includes the differing vintages", () => {
    const items = [
      frameItem("2026-01-31", "f1"),
      frameItem("2026-05-31", "f2"),
      chartItem("2026-03-15", "c1"),
    ];
    let message = "";
    try {
      assertUniformVintage(items);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("2026-01-31");
    expect(message).toContain("2026-03-15");
    expect(message).toContain("2026-05-31");
  });

  it("cover stamp is ALLOWED on a uniform-vintage deliverable", () => {
    const items = [
      frameItem("2026-03-31", "f1"),
      frameItem("2026-03-31", "f2"),
      chartItem("2026-03-31", "c1"),
      metricItem("m1"),
    ];
    // assertUniformVintage passes → a cover stamp at "2026-03-31" is legal
    expect(() => assertUniformVintage(items)).not.toThrow();
  });
});
