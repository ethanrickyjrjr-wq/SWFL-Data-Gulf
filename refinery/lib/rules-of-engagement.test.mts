import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RULES_OF_ENGAGEMENT } from "./rules-of-engagement.mts";

// The block rides in every payload's `_meta.rules`. Keep it lean: a rough
// chars/4 token proxy must stay under the ceiling so embedding it per-response
// never blows the consuming Claude's context budget. The cap was 210, then 220
// (rule 5 date-display), then 280 (rules 1/3/7 four-lane provenance), then 300
// when rule 1 added the four-lane CASCADE ORDER + "fill the gap, never refuse the
// build; only an INVENTED number is forbidden" (operator decree 2026-06-22 — the
// generalization of CLAUDE.md RULE 0.7). See the constant's header.
test("RULES_OF_ENGAGEMENT stays under the lean token budget", () => {
  const approxTokens = Math.ceil(RULES_OF_ENGAGEMENT.length / 4);
  expect(approxTokens).toBeLessThanOrEqual(300);
});

test("RULES_OF_ENGAGEMENT carries all seven numbered rules", () => {
  for (const n of ["1.", "2.", "3.", "4.", "5.", "6.", "7."]) {
    expect(RULES_OF_ENGAGEMENT).toContain(n);
  }
  expect(RULES_OF_ENGAGEMENT.startsWith("RULES OF ENGAGEMENT")).toBe(true);
  // Rule 7 is the scope gate — the off-topic / below-grain guard. Assert its
  // load-bearing literal so a future trim can't silently drop it. The Arby's
  // anchor pins the killed regression (a named SWFL place that is an operational
  // question, not a market-data one, must be answered normally — not fetched).
  expect(RULES_OF_ENGAGEMENT).toContain("SCOPE");
  expect(RULES_OF_ENGAGEMENT).toContain("Arby's");
});

// Drift guard: the constant is a verbatim mirror in THREE human-facing files.
// If anyone edits one without updating the constant (or vice versa), this fails
// — the four copies must never diverge. (CLAUDE.md was added here after it
// silently drifted to a stale 5-rule copy that nothing tested.)
const MIRRORS = [["docs", "consumption-contract.md"], ["THE-CONTRACT.md"], ["CLAUDE.md"]];
for (const rel of MIRRORS) {
  test(`RULES_OF_ENGAGEMENT matches the lean block in ${rel.at(-1)}`, () => {
    const doc = readFileSync(join(import.meta.dir, "..", "..", ...rel), "utf-8").replace(
      /\r\n/g,
      "\n",
    );
    expect(doc).toContain(RULES_OF_ENGAGEMENT);
  });
}
