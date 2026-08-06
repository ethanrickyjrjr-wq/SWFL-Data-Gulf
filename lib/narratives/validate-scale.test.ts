import { test, expect } from "bun:test";
import { validateNarrative, buildNumberWhitelist } from "./validate";
import type { BakeInputs, NarrativeSectionsData } from "./types";

// Named for the failure modes they target (RULE 3.5). Measured 08/06/2026 from the
// last real bake (run 29962120766, 07/22/2026) — all 11 validation failures fell into
// three classes. Class A is a VALIDATOR bug (the value is present, only its notation
// differs); classes B and C are real model defects that MUST keep failing. The whole
// point of this fix is to remove A's noise WITHOUT weakening the gate on B and C.
// Diagnosis: docs/superpowers/plans/2026-08-06-precomputed-commentary-plan.md §Phase 0.

function inputs(facts: { label: string; display: string }[]): BakeInputs {
  return {
    surface: "test",
    key: "k",
    place: "Testville",
    county: "Lee",
    asOf: "08/06/2026",
    facts: facts.map((f) => ({ ...f, sub: null, why: null, source: "test source" })),
    context: [],
    sources: [],
  };
}

function narrative(narration: string): NarrativeSectionsData {
  // Padded to clear the 300-char floor so length never masks the number gate.
  return { narration: narration.padEnd(320, " ") + "x".repeat(20), outlook: [] };
}

// ── Class A — notation drift. These are the FALSE POSITIVES being fixed. ──────

test("A1: trailing decimal zero is the same number — '3.0' against an input of '3'", () => {
  const errs = validateNarrative(
    narrative("Months of supply sit at 3.0 right now."),
    inputs([{ label: "Months of Supply", display: "3" }]),
  );
  expect(errs.filter((e) => e.includes("3.0"))).toEqual([]);
});

test("A2: a $300K bucket label licenses '$300,000' — K expansion, only when K is in the source", () => {
  const errs = validateNarrative(
    narrative("The biggest band starts at $300,000 for buyers."),
    inputs([{ label: "Largest price band", display: "$300K–$400K" }]),
  );
  expect(errs.filter((e) => e.includes("300000"))).toEqual([]);
});

test("A2b: K expansion does NOT fire when no K/M suffix is present in the source", () => {
  // Input holds a bare count of 300. Writing 300,000 is an invention, not a restatement.
  const errs = validateNarrative(
    narrative("There were 300,000 homes sold here last year."),
    inputs([{ label: "Homes sold", display: "300" }]),
  );
  expect(errs.some((e) => e.includes("300000"))).toBe(true);
});

// ── Class B — rounding. These MUST STILL FAIL. ───────────────────────────────

test("B1: rounding 93.7% to 93 stays a violation", () => {
  const errs = validateNarrative(
    narrative("Homes sell at about 93 percent of asking here."),
    inputs([{ label: "Sale-to-List Ratio", display: "93.7%" }]),
  );
  expect(errs.some((e) => e.includes('"93"'))).toBe(true);
});

test("B2: rounding $399,900 up to $400,000 stays a violation", () => {
  const errs = validateNarrative(
    narrative("The median ask is right around $400,000 today."),
    inputs([{ label: "Cape Coral median asking price", display: "$399,900" }]),
  );
  expect(errs.some((e) => e.includes("400000"))).toBe(true);
});

test("B3: rounding 1.04 to 1.0 stays a violation — a trailing zero must not launder a round", () => {
  // Guards the A1 fix against over-reach: 1.0 is legitimate for an input of 1,
  // but NOT for an input of 1.04.
  const errs = validateNarrative(
    narrative("The seasonal position reads 1.0 against its mean."),
    inputs([{ label: "Seasonal position vs mean", display: "1.04" }]),
  );
  expect(errs.some((e) => e.includes("1.0"))).toBe(true);
});

// ── Class C — computed across two figures. MUST STILL FAIL. ──────────────────

test("C1: arithmetic across two provided figures stays a violation", () => {
  // $400,000 - $325,000 = $75,000. Both operands are provided; the result is not.
  const errs = validateNarrative(
    narrative("Naples asks run $75,000 above Fort Myers on the median."),
    inputs([
      { label: "Naples median asking price", display: "$400,000" },
      { label: "Fort Myers median asking price", display: "$325,000" },
    ]),
  );
  expect(errs.some((e) => e.includes("75000"))).toBe(true);
});

test("C2: a derived percentage from a zero base stays a violation", () => {
  const errs = validateNarrative(
    narrative("Announcements are up 100 percent over the prior window."),
    inputs([
      { label: "Announcements (last 90 days)", display: "1" },
      { label: "Announcements (prior 90 days)", display: "0" },
    ]),
  );
  expect(errs.some((e) => e.includes("100"))).toBe(true);
});

// ── The whitelist itself ─────────────────────────────────────────────────────

test("whitelist expands K and M only from a suffixed source token", () => {
  const allow = buildNumberWhitelist(
    inputs([
      { label: "Home value", display: "$637K" },
      { label: "Total collections", display: "$89M" },
      { label: "Bare count", display: "42" },
    ]),
  );
  expect(allow.has("637000")).toBe(true);
  expect(allow.has("89000000")).toBe(true);
  expect(allow.has("42000")).toBe(false); // no suffix → no expansion
});
