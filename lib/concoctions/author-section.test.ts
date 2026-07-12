import { describe, it, expect } from "bun:test";
import { datasetsSection, resolveConcoction, paramsFromScope } from "./author-section";
import { concoctionIndex } from "./registry";

describe("datasetsSection", () => {
  it("names every registry label and carries ZERO digits", () => {
    const s = datasetsSection();
    for (const e of concoctionIndex()) expect(s).toContain(e.label);
    expect(s).not.toMatch(/\d/);
  });
});

describe("resolveConcoction", () => {
  it("explicit valid id wins", () => {
    expect(resolveConcoction("corridor-profiles", "anything at all")).toBe("corridor-profiles");
  });
  it("unknown explicit falls through to detection", () => {
    expect(resolveConcoction("nope", "email about commercial corridor rents in Naples")).toBe(
      "corridor-profiles",
    );
  });
  it("keyword detection routes each dataset", () => {
    expect(resolveConcoction(null, "an update on flood claims after the storm")).toBe(
      "nfip-storm-years",
    );
    expect(resolveConcoction(null, "how many new listings and price cuts this month")).toBe(
      "zip-listing-activity",
    );
    expect(resolveConcoction(null, "median asking price lately in Cape Coral")).toBe(
      "asking-price-trend",
    );
  });
  it("no match → null (build byte-identical)", () => {
    expect(resolveConcoction(null, "happy birthday to my sphere")).toBeNull();
  });
});

describe("paramsFromScope", () => {
  it("asking-price-trend needs a known city — else null (skip, never guess)", () => {
    expect(paramsFromScope("asking-price-trend", { kind: "place", value: "Cape Coral" })).toEqual({
      area: "cape_coral",
    });
    expect(paramsFromScope("asking-price-trend", { kind: "place", value: "Bonita" })).toBeNull();
    expect(paramsFromScope("asking-price-trend", null)).toBeNull();
  });
  it("zip-listing-activity: county scope narrows, anything else defaults wide", () => {
    expect(paramsFromScope("zip-listing-activity", { kind: "county", value: "Lee" })).toEqual({
      county: "Lee",
    });
    expect(paramsFromScope("zip-listing-activity", { kind: "zip", value: "33914" })).toEqual({});
  });
  it("corridors need nothing", () => {
    expect(paramsFromScope("corridor-profiles", null)).toEqual({});
  });
});
