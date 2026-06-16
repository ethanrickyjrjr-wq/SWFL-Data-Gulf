import { describe, it, expect } from "vitest";
import {
  IN_CHAT_FRAME_ALLOWLIST,
  isInChatFrameAllowed,
  screenInChatChartFrame,
} from "./in-chat-frames";
import { CHART_REGISTRY } from "@/components/charts/registry/registry";

// The in-chat surfaces (/r/* converse dock + welcome/chat analyst) may render
// ONLY the bounded scope-router frames buildChartForIntent emits. The wider
// deliverable/template-build frame registry (composition, z-gauge,
// seasonal-radial, storm-timeline, …) must NEVER reach the chat dock — the
// generic_chart_capability scope fence, enforced fail-closed.
//
// These are NEGATIVE tests by design: a positive-only "the three frames render"
// test does not PROVE the guarantee. The loop is registry-driven so a frame
// added to CHART_REGISTRY tomorrow is covered automatically.

const disallowedRegistryFrames = Object.keys(CHART_REGISTRY).filter(
  (frameId) => !IN_CHAT_FRAME_ALLOWLIST.has(frameId),
);

function forgedSpec(frameId: string): Record<string, unknown> {
  return {
    frameId,
    title: "forged",
    columns: ["a", "b"],
    rows: [["x", 1]],
    chart_type: "bar",
    asOf: "2026-01-01",
    source: { citation: "forged" },
  };
}

describe("in-chat frame allowlist — template-build frames cannot reach the chat dock", () => {
  it("sanity: today's known template-build frames are in the disallowed set", () => {
    for (const f of ["composition", "z-gauge", "seasonal-radial", "storm-timeline"]) {
      expect(disallowedRegistryFrames).toContain(f);
    }
  });

  it("route-level refusal: every non-allowlisted registry frame is rejected", () => {
    expect(disallowedRegistryFrames.length).toBeGreaterThan(0);
    for (const frameId of disallowedRegistryFrames) {
      expect(isInChatFrameAllowed(frameId)).toBe(false);
    }
  });

  it("SSE strip drops a forged spec carrying any non-allowlisted registry frameId", () => {
    for (const frameId of disallowedRegistryFrames) {
      expect(screenInChatChartFrame(forgedSpec(frameId), "test")).toBeNull();
    }
  });

  it("SSE strip is fail-closed: unknown / missing frameId / malformed payload all drop", () => {
    expect(screenInChatChartFrame(forgedSpec("totally-made-up"), "test")).toBeNull();
    expect(screenInChatChartFrame({}, "test")).toBeNull();
    expect(screenInChatChartFrame({ frameId: 42 }, "test")).toBeNull();
    expect(screenInChatChartFrame(null, "test")).toBeNull();
    expect(screenInChatChartFrame("not-an-object", "test")).toBeNull();
  });

  it("logs frameId + source on drop (silent drop is rejected)", () => {
    const orig = console.warn;
    const calls: unknown[][] = [];
    console.warn = (...args: unknown[]) => {
      calls.push(args);
    };
    try {
      screenInChatChartFrame(forgedSpec("z-gauge"), "converse");
    } finally {
      console.warn = orig;
    }
    expect(calls.length).toBeGreaterThan(0);
    const logged = JSON.stringify(calls);
    expect(logged).toContain("z-gauge");
    expect(logged).toContain("converse");
  });

  it("allowlisted frames pass through unchanged", () => {
    for (const frameId of IN_CHAT_FRAME_ALLOWLIST) {
      const spec = forgedSpec(frameId);
      expect(screenInChatChartFrame(spec, "test")).toBe(spec);
      expect(isInChatFrameAllowed(frameId)).toBe(true);
    }
  });

  it("allowlist is exactly the three scope-router frames (no silent drift)", () => {
    expect([...IN_CHAT_FRAME_ALLOWLIST].sort()).toEqual([
      "bar-table",
      "corridor-scatter",
      "zhvi-area",
    ]);
  });
});
