import { describe, expect, test } from "bun:test";
import { inputsHash, stableStringify } from "./hash";
import { shouldRunToday } from "./cadence";
import { buildNumberWhitelist, numericTokens, validateNarrative } from "./validate";
import type { BakeInputs, NarrativeSectionsData } from "./types";

const INPUTS: BakeInputs = {
  surface: "zip",
  key: "33920",
  place: "Alva",
  county: "Lee",
  asOf: "07/09/2026",
  facts: [
    {
      label: "Days on market",
      display: "85 days",
      sub: "90-day median",
      why: "#33 of 123 SWFL ZIPs",
      source: "SWFL Data Gulf",
    },
    {
      label: "Months of supply",
      display: "5.6 mo",
      sub: "at the current sales pace",
      why: "#24 of 108 SWFL ZIPs",
      source: "realtor.com",
    },
  ],
  context: ["Lee County single-family permits ran 1,204 over the trailing year."],
  sources: [{ label: "realtor.com", url: "https://www.realtor.com/research/data/" }],
};

const pad = (s: string) => s + " More plain context for the local reader here.".repeat(8);

function good(): NarrativeSectionsData {
  return {
    narration: pad(
      "As of 07/09/2026, homes here take about 85 days to sell — #33 of 123 Southwest Florida ZIP codes — while 5.6 mo of supply sits on the market.",
    ),
    outlook: [
      {
        text: "[INFERENCE] If supply holds near 5.6 mo, sellers could keep facing longer waits into season.",
        base: "5.6 mo months of supply",
        falsifier: "Supply dropping below 5.6 mo for two consecutive readings.",
      },
    ],
  };
}

describe("hash", () => {
  test("stable across key order", () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(
      stableStringify({ a: { c: 3, d: 2 }, b: 1 }),
    );
  });
  test("moves when a fact moves, not when context moves", () => {
    const h = inputsHash(INPUTS);
    const factMoved = {
      ...INPUTS,
      facts: [{ ...INPUTS.facts[0], display: "80 days" }, INPUTS.facts[1]],
    };
    const contextMoved = { ...INPUTS, context: ["different prose"] };
    expect(inputsHash(factMoved)).not.toBe(h);
    expect(inputsHash(contextMoved)).toBe(h);
  });
});

describe("cadence", () => {
  const monday = new Date("2026-07-06T10:40:00Z"); // Monday UTC
  const thursday = new Date("2026-07-09T10:40:00Z");
  test("weekly default runs Mondays only", () => {
    expect(shouldRunToday(undefined, monday).run).toBe(true);
    expect(shouldRunToday(undefined, thursday).run).toBe(false);
    expect(shouldRunToday("weekly", thursday).run).toBe(false);
  });
  test("daily runs every day; junk values fall back to weekly", () => {
    expect(shouldRunToday("daily", thursday).run).toBe(true);
    expect(shouldRunToday("DAILY", thursday).run).toBe(true);
    expect(shouldRunToday("hourly", thursday).run).toBe(false);
  });
});

describe("validate", () => {
  test("numeric tokens normalize commas", () => {
    expect(numericTokens("1,204 homes at $485.5K")).toEqual(["1204", "485.5"]);
  });
  test("whitelist covers facts, context, as-of, key", () => {
    const allow = buildNumberWhitelist(INPUTS);
    for (const t of ["85", "90", "33", "123", "5.6", "1204", "07", "09", "2026", "33920"]) {
      expect(allow.has(t)).toBe(true);
    }
  });
  test("clean narrative passes", () => {
    expect(validateNarrative(good(), INPUTS)).toEqual([]);
  });
  test("invented number is caught", () => {
    const bad = good();
    bad.narration = bad.narration.replace("85 days", "77 days");
    expect(validateNarrative(bad, INPUTS).some((e) => e.includes('"77"'))).toBe(true);
  });
  test("missing as-of, [INFERENCE], hedge, falsifier are caught", () => {
    const bad = good();
    bad.narration = bad.narration.replace("As of 07/09/2026, ", "");
    bad.outlook = [{ text: "Prices will rise.", base: "", falsifier: "short" }];
    const errors = validateNarrative(bad, INPUTS);
    expect(errors.some((e) => e.includes("as-of"))).toBe(true);
    expect(errors.some((e) => e.includes("[INFERENCE]"))).toBe(true);
    expect(errors.some((e) => e.includes("hedge"))).toBe(true);
    expect(errors.some((e) => e.includes("falsifier"))).toBe(true);
    expect(errors.some((e) => e.includes("base"))).toBe(true);
  });
  test("internal jargon is caught", () => {
    const bad = good();
    bad.narration = bad.narration.replace("on the market.", "on the market per the housing pack.");
    expect(validateNarrative(bad, INPUTS).some((e) => e.includes("jargon"))).toBe(true);
  });
});
