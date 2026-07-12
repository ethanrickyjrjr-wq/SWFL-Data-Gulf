import { describe, it, expect } from "bun:test";
import { parseIndex, paramsComplete, cleanParams, placeLoadedBlocks } from "./dataset-browser-core";
import type { EmailBlock } from "@/lib/email/doc/types";

const ENTRY = {
  id: "asking-price-trend",
  label: "Asking price trend",
  description: "Daily median asking price for a city.",
  category: "Residential",
  tags: ["asking price"],
  params: [{ key: "area", required: true, options: ["cape_coral", "fort_myers", "naples"] }],
};

describe("parseIndex", () => {
  it("parses a well-formed index and drops junk entries", () => {
    const parsed = parseIndex({ datasets: [ENTRY, { nope: true }, null] });
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe("asking-price-trend");
    expect(parsed[0].params[0].options).toContain("naples");
  });
  it("non-array payload → empty, never a throw", () => {
    expect(parseIndex(null)).toEqual([]);
    expect(parseIndex({ datasets: "x" })).toEqual([]);
  });
});

describe("paramsComplete + cleanParams", () => {
  it("required param empty → incomplete; set → complete", () => {
    expect(paramsComplete(ENTRY, {})).toBe(false);
    expect(paramsComplete(ENTRY, { area: "" })).toBe(false);
    expect(paramsComplete(ENTRY, { area: "naples" })).toBe(true);
  });
  it("optional params never block", () => {
    const e = { ...ENTRY, params: [{ key: "county", required: false }] };
    expect(paramsComplete(e, {})).toBe(true);
  });
  it("cleanParams drops empties", () => {
    expect(cleanParams({ a: "x", b: "", c: "  " })).toEqual({ a: "x" });
  });
});

describe("shouldAutoRefresh", () => {
  it("fires only when the dial is on, nothing ran yet, and something is stale", async () => {
    const { shouldAutoRefresh } = await import("./dataset-browser-core");
    expect(shouldAutoRefresh({ alwaysFresh: true, alreadyRan: false, anyStale: true })).toBe(true);
    expect(shouldAutoRefresh({ alwaysFresh: false, alreadyRan: false, anyStale: true })).toBe(
      false,
    );
    expect(shouldAutoRefresh({ alwaysFresh: true, alreadyRan: true, anyStale: true })).toBe(false);
    expect(shouldAutoRefresh({ alwaysFresh: true, alreadyRan: false, anyStale: false })).toBe(
      false,
    );
  });
});

describe("placeLoadedBlocks", () => {
  const existing = [
    { id: "e1", type: "text", props: {}, layout: { x: 0, y: 0, w: 12, h: 3 } },
    { id: "e2", type: "text", props: {}, layout: { x: 0, y: 3, w: 12, h: 5 } },
  ] as EmailBlock[];
  const loaded = [
    { id: "conc-x-0", type: "hero", props: {}, layout: { x: 0, y: 0, w: 12, h: 3 } },
    { id: "conc-x-1", type: "stats", props: {}, layout: { x: 0, y: 3, w: 12, h: 3 } },
  ] as EmailBlock[];

  it("shifts below the canvas bottom, preserving relative offsets", () => {
    const placed = placeLoadedBlocks(existing, loaded);
    expect(placed[0].layout!.y).toBe(8);
    expect(placed[1].layout!.y).toBe(11);
    expect(placed[0].id).toBe("conc-x-0");
  });
  it("re-mints colliding ids deterministically (same dataset loaded twice)", () => {
    const once = placeLoadedBlocks(existing, loaded);
    const twice = placeLoadedBlocks([...existing, ...once], loaded);
    expect(twice.map((b) => b.id)).toEqual(["conc-x-0-2", "conc-x-1-2"]);
  });
  it("empty canvas → blocks land at their own ys", () => {
    const placed = placeLoadedBlocks([], loaded);
    expect(placed[0].layout!.y).toBe(0);
  });
});
