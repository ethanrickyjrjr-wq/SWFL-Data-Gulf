import { describe, it, expect } from "bun:test";
import { CHART_REGISTRY, getFrame, type FrameDef } from "./registry";
import type { ChartSpec, DataShape } from "./chart-spec";

/**
 * Phase 2a — ChartSpec registry scaffold.
 *
 * This repo has NO DOM test environment by design — every test is bun:test +
 * pure (see lib/highlighter/context.test.tsx for the precedent). So the plan's
 * "FrameRenderer renders each pre-registered frame from a fixture spec"
 * acceptance is verified here at the RESOLUTION level: for every registered
 * frame, a fixture `ChartSpec` resolves through `getFrame` to a real component.
 * Actual DOM paint of echarts/gsap/recharts is left to the live `/r/` + `/p/`
 * smoke (the underlying viz components are already shipped + browser-verified).
 */

function fixtureSpec(frameId: string): ChartSpec {
  return {
    frameId,
    title: "Fixture",
    columns: ["Label", "Value"],
    rows: [
      ["A", 1],
      ["B", 2],
    ],
    asOf: "2026-06-30",
  };
}

describe("CHART_REGISTRY", () => {
  it("is non-empty", () => {
    expect(Object.keys(CHART_REGISTRY).length).toBeGreaterThan(0);
  });

  it("every frame resolves to a component with non-empty accepts + label", () => {
    for (const [frameId, def] of Object.entries(CHART_REGISTRY)) {
      const d = def as FrameDef;
      expect(typeof d.component, `${frameId}.component`).toBe("function");
      expect(d.accepts.length, `${frameId}.accepts`).toBeGreaterThan(0);
      expect(d.label.length, `${frameId}.label`).toBeGreaterThan(0);
    }
  });

  it("registers the three already-built frames", () => {
    // Bar/table (generic), ZHVI area (time-series), corridor scatter (relationship).
    expect(CHART_REGISTRY["bar-table"]).toBeDefined();
    expect(CHART_REGISTRY["zhvi-area"]).toBeDefined();
    expect(CHART_REGISTRY["corridor-scatter"]).toBeDefined();

    const shapes: Record<string, DataShape> = {
      "bar-table": "ranked-categories",
      "zhvi-area": "time-series",
      "corridor-scatter": "relationship",
    };
    for (const [frameId, shape] of Object.entries(shapes)) {
      expect(CHART_REGISTRY[frameId].accepts, `${frameId} accepts ${shape}`).toContain(shape);
    }
  });
});

describe("getFrame", () => {
  it("resolves every registered frame from a fixture spec", () => {
    for (const frameId of Object.keys(CHART_REGISTRY)) {
      const spec = fixtureSpec(frameId);
      const frame = getFrame(spec.frameId);
      expect(frame, `getFrame(${frameId})`).toBeDefined();
      expect(typeof frame!.component).toBe("function");
    }
  });

  it("returns undefined for an unknown frameId", () => {
    expect(getFrame("does-not-exist")).toBeUndefined();
  });
});
