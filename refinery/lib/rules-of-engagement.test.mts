import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RULES_OF_ENGAGEMENT } from "./rules-of-engagement.mts";

// The block rides in every payload's `_meta.rules`. Keep it lean: a rough
// chars/4 token proxy must stay under the 350-token ceiling so embedding it
// per-response never blows the consuming Claude's context budget. Ceiling moved
// 250 → 320 → 350 as rule 7 (STAY IN SCOPE) landed and then spelled out the
// ZIP/named-place grain floor (Fort Myers Beach = 33931 IS in grain) so the
// scope gate can't suppress the flagship ZIP query — see the constant's header.
test("RULES_OF_ENGAGEMENT stays under the lean token budget", () => {
  const approxTokens = Math.ceil(RULES_OF_ENGAGEMENT.length / 4);
  expect(approxTokens).toBeLessThanOrEqual(350);
});

test("RULES_OF_ENGAGEMENT carries all seven numbered rules", () => {
  for (const n of ["1.", "2.", "3.", "4.", "5.", "6.", "7."]) {
    expect(RULES_OF_ENGAGEMENT).toContain(n);
  }
  expect(RULES_OF_ENGAGEMENT.startsWith("RULES OF ENGAGEMENT")).toBe(true);
  // Rule 7 is the scope gate — the off-topic / below-grain guard. Assert its
  // load-bearing literal so a future trim can't silently drop it.
  expect(RULES_OF_ENGAGEMENT).toContain("STAY IN SCOPE");
});

// Drift guard: the constant is a verbatim mirror of the lean block in the doc.
// If someone edits the doc block without updating the constant (or vice versa),
// this fails — the two copies must never diverge.
test("RULES_OF_ENGAGEMENT matches the lean block in consumption-contract.md", () => {
  const doc = readFileSync(
    join(import.meta.dir, "..", "..", "docs", "consumption-contract.md"),
    "utf-8",
  ).replace(/\r\n/g, "\n");
  expect(doc).toContain(RULES_OF_ENGAGEMENT);
});
