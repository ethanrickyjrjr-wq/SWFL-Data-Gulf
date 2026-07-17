// lib/should-i-sell/no-invention.test.ts
//
// Structural guards for the Should I Sell surface (the design's "no-invention lint
// extension"). Comments are stripped first — these rules are about RENDERED strings and
// the sourcing contract, not the code that explains them.
//   1. No rendered component string leaks a system noun / brain id / § / "ZIP-level".
//   2. The projection always carries the [INFERENCE] tag + a falsifier (spread-calc).
//   3. The spread NEVER defaults insurance or tax to a number — insurance is required,
//      tax is user-entered/cited, both start empty in the UI.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  PROJECTION_TAG,
  PROJECTION_FALSIFIER,
  PROJECTION_BASIS,
  computeSpread,
} from "./spread-calc";

const COMPONENTS = [
  "components/should-i-sell/SellerStressRead.tsx",
  "components/should-i-sell/MarketSnapshot.tsx",
  "components/should-i-sell/SellNowVsWait.tsx",
];

/** File text with block + full-line comments removed. */
function code(f: string): string {
  return readFileSync(f, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
}

const BRAIN_SLUGS = [
  "seller-stress-swfl",
  "housing-swfl",
  "listing-momentum-swfl",
  "condo-sirs-swfl",
];

test("no rendered component string leaks a brain id / § / 'ZIP-level'", () => {
  for (const f of COMPONENTS) {
    const src = code(f);
    for (const slug of BRAIN_SLUGS) {
      expect(src).not.toContain(slug);
    }
    expect(src).not.toContain("§");
    expect(src.toLowerCase()).not.toContain("zip-level");
  }
});

test("the projection tag + falsifier + basis are non-empty and cite the source by name", () => {
  expect(PROJECTION_TAG).toBe("[INFERENCE]");
  expect(PROJECTION_FALSIFIER.length).toBeGreaterThan(0);
  expect(PROJECTION_BASIS).toContain("Redfin");
  // and they actually reach a rendered result
  const r = computeSpread({
    v0: 400_000,
    yoyFraction: 0.05,
    months: 12,
    propertyTaxAnnual: null,
    insuranceAnnual: null,
    mortgageInterestAnnual: null,
  });
  expect(r.projectionTag).toBe("[INFERENCE]");
  expect(r.falsifier).toBe(PROJECTION_FALSIFIER);
});

test("the spread UI never defaults insurance or tax to a number (no invented default)", () => {
  const src = code("components/should-i-sell/SellNowVsWait.tsx");
  // insurance + tax inputs start EMPTY — never seeded with a numeric literal
  expect(src).toContain('const [insurance, setInsurance] = useState("")');
  expect(src).toContain('const [taxOverride, setTaxOverride] = useState("")');
  // the required-insurance / no-default contract is stated to the user
  expect(src).toContain("No default");
  expect(src).toMatch(/insurance not included|Add your real premium|add your.*premium/i);
});

test("computeSpread with no insurance is explicitly incomplete, never a $0 insurance stand-in", () => {
  const r = computeSpread({
    v0: 400_000,
    yoyFraction: 0.05,
    months: 12,
    propertyTaxAnnual: 5_000,
    insuranceAnnual: null,
    mortgageInterestAnnual: null,
  });
  const ins = r.lines.find((l) => l.key === "insurance")!;
  expect(ins.amount).toBeNull(); // NOT 0
  expect(r.complete).toBe(false);
});
