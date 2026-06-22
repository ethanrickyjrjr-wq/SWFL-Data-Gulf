import { describe, expect, it } from "bun:test";
import { wantsCustomChart, pairsAreFaithful } from "./compose-chart";

describe("wantsCustomChart", () => {
  it("fires on explicit chart verbs", () => {
    expect(wantsCustomChart("Chart vacancy across the corridors")).toBe(true);
    expect(wantsCustomChart("plot median price for these ZIPs")).toBe(true);
    expect(wantsCustomChart("graph permits by month")).toBe(true);
    expect(wantsCustomChart("visualize the rent trend")).toBe(true);
  });
  it("stays off for ordinary analytical questions (no LLM cost)", () => {
    expect(wantsCustomChart("What's the bottom line on SWFL real estate?")).toBe(false);
    expect(wantsCustomChart("How are home values in Naples?")).toBe(false);
    expect(wantsCustomChart("")).toBe(false);
  });
});

describe("pairsAreFaithful — the attribution half of the moat gate", () => {
  // Real source pairs: each corridor's real vacancy value.
  const pairs = [
    { label: "Estero", value: 0.4 },
    { label: "Cape Coral", value: 2.2 },
    { label: "North Fort Myers", value: 2.6 },
  ];

  it("accepts a block whose every (label, value) traces to a real pair", () => {
    const block = {
      rows: [
        ["Estero", 0.4],
        ["Cape Coral", 2.2],
        ["North Fort Myers", 2.6],
      ] as (string | number | null)[][],
    };
    expect(pairsAreFaithful(block, pairs)).toBe(true);
  });

  it("REJECTS a real number plotted under the WRONG label (misattribution)", () => {
    // 2.6 is real (North Fort Myers') but here it's pinned to Estero — the exact
    // failure the number-only provenance check can't catch.
    const block = { rows: [["Estero", 2.6]] as (string | number | null)[][] };
    expect(pairsAreFaithful(block, pairs)).toBe(false);
  });

  it("REJECTS a label that matches no real source entity", () => {
    const block = { rows: [["Atlantis", 1.0]] as (string | number | null)[][] };
    expect(pairsAreFaithful(block, pairs)).toBe(false);
  });

  it("tolerates label rewording (substring match)", () => {
    // "Estero / Bonita line" contains "estero" → matches the source "Estero".
    const block = { rows: [["Estero / Bonita line", 0.4]] as (string | number | null)[][] };
    expect(pairsAreFaithful(block, pairs)).toBe(true);
  });

  it("accepts within the 5% / 0.05 anchor tolerance", () => {
    const block = { rows: [["Cape Coral", 2.21]] as (string | number | null)[][] };
    expect(pairsAreFaithful(block, pairs)).toBe(true);
  });
});
