import { test } from "bun:test";
import assert from "node:assert/strict";
import { formatWeakestContributorCaveat } from "./4-output.mts";
import type { AttributionEntry } from "../lib/confidence.mts";

test("formatWeakestContributorCaveat: matches the spec format verbatim", () => {
  const weakest: AttributionEntry = {
    source_id: "sba_loans_franchise_outcomes",
    trust_tier_score: 0.4,
    error_contribution: 1.25,
  };
  const caveat = formatWeakestContributorCaveat(weakest);
  assert.equal(
    caveat,
    "Weakest contributor: source 'sba_loans_franchise_outcomes' (trust 0.40, contribution 1.25).",
  );
});

test("formatWeakestContributorCaveat: rounds to two decimals on both numbers", () => {
  const weakest: AttributionEntry = {
    source_id: "x",
    trust_tier_score: 0.666_666,
    error_contribution: 0.999_999,
  };
  const caveat = formatWeakestContributorCaveat(weakest);
  assert.match(caveat, /trust 0\.67/);
  assert.match(caveat, /contribution 1\.00/);
});
