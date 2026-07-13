// lib/deliverable/claims.test.ts
//
// The oracle is not a hypothetical. Every string in the "REAL FALSEHOODS" block below
// was rendered into a real email by a real build on 07/13/2026, and every one of them
// was signed off by an author who had opened the screenshot and looked at it.
//
// If this gate cannot catch these five, it is theatre.

import { describe, expect, it } from "bun:test";
import { auditClaims, compareToSet, settledCount, numeralsIn, CLAIM_PROHIBITION } from "./claims";

describe("the five falsehoods that actually shipped", () => {
  it("catches the INVERTED COMPARISON (market-comps)", () => {
    // $209 is ABOVE $173 and $195. The email told the client it was below them —
    // inverting the entire argument of a price-defense email. Every number was sourced.
    const v = auditClaims(
      "At $209 per square foot, the asking price sits just below the $213 median — and below the two recorded sales, which closed at $173 and $195 per square foot.",
      [],
    );
    expect(v.some((x) => x.kind === "comparative")).toBe(true);
  });

  it("catches the FABRICATED SEQUENCE (under-contract)", () => {
    // We hold a cut AMOUNT. No cut date, no contract date, no ordering.
    const v = auditClaims(
      "The seller had reduced the asking price by $104,975 before a contract was reached.",
      [],
    );
    expect(v.some((x) => x.kind === "sequence")).toBe(true);
  });

  it("catches the TRAJECTORY invented from a single level (sphere-weekly)", () => {
    // Given ONE national LEVEL and no trend. A level is not a direction.
    const v = auditClaims("The gap between the two is widening as the local market cools.", []);
    expect(v.some((x) => x.kind === "trajectory")).toBe(true);
  });

  it("catches the WORD-COUNT the digit lint is blind to (market-pulse)", () => {
    // "five of those six ZIPs" — the true answer was four. No digits, so a digit lint
    // sails straight past. This is the blind spot, by construction.
    const v = auditClaims("Five of those six ZIPs moved lower this month.", []);
    expect(v.some((x) => x.kind === "word-count")).toBe(true);
  });

  it("catches the STREET CLAIM that beat a ban on the word 'street' (market-comps)", () => {
    // The model was banned from saying "street" and wrote "on Shore Dr". Match the
    // SUFFIX, not the noun — this is why a banned-word list is not the defense.
    const v = auditClaims("Two recorded sales on Shore Dr closed well under the ask.", []);
    expect(v.some((x) => x.kind === "spatial")).toBe(true);
  });

  it("catches the invented MOTIVE (price-reduced's ancestor)", () => {
    const v = auditClaims("A $25,000 move on asking says the seller is serious.", []);
    expect(v.some((x) => x.kind === "motive")).toBe(true);
  });
});

describe("code computes the relation; the narrator only restates it", () => {
  it("gets the market-comps comparison RIGHT, where the model got it backwards", () => {
    const claim = compareToSet(209, [173, 195, 213, 266, 231, 210], {
      unit: "usd",
      noun: "asking price per square foot",
    });
    // $209 is above 173/195 and below 213/266/231/210 → inside the range.
    expect(claim!.sentence).toContain("sits inside the range");
    expect(claim!.sentence).toContain("above 2 of 6");
    // And it must NEVER say "below every comparable" — the actual shipped falsehood.
    expect(claim!.sentence).not.toContain("below every");
  });

  it("says 'above every comparable' only when it genuinely is", () => {
    const claim = compareToSet(300, [173, 195, 213], { unit: "usd", noun: "ask" });
    expect(claim!.sentence).toContain("above every comparable");
  });

  it("gets the market-pulse count RIGHT (four, not five)", () => {
    const claim = settledCount(4, 6, { noun: "ZIPs", predicate: "moved lower this month" });
    expect(claim.sentence).toBe("4 of 6 ZIPs moved lower this month.");
  });

  it("an empty or unusable set yields NO claim — never a guess", () => {
    expect(compareToSet(209, [], { unit: "usd", noun: "ask" })).toBeNull();
    expect(compareToSet(0, [1, 2], { unit: "usd", noun: "ask" })).toBeNull();
  });
});

describe("a settled fact may be restated; a NEW relation may not be derived", () => {
  it("lets the narrator restate the sentence code handed it", () => {
    const claim = compareToSet(209, [173, 195], { unit: "usd", noun: "asking price" });
    // The narrator echoing the settled sentence verbatim is its actual job.
    expect(auditClaims(claim!.sentence, [claim!])).toEqual([]);
  });

  it("still refuses a DIFFERENT comparison, even alongside a settled one", () => {
    const claim = settledCount(4, 6, { noun: "ZIPs", predicate: "moved lower" });
    const v = auditClaims(
      `${claim.sentence} The largest of them is clearly outperforming the rest.`,
      [claim],
    );
    expect(v.some((x) => x.kind === "comparative")).toBe(true);
  });

  it("flags a number no settled fact anchors", () => {
    const claim = settledCount(4, 6, { noun: "ZIPs", predicate: "moved lower" });
    const v = auditClaims(`${claim.sentence} Values fell 3.8% across the county.`, [claim]);
    expect(v.some((x) => x.kind === "unanchored-number" && x.match === "3.8")).toBe(true);
  });
});

describe("honest prose survives the gate", () => {
  it("a plain descriptive paragraph with no claims passes clean", () => {
    // The paragraph a listing description SHOULD produce: describes the home, asserts
    // no relation, counts nothing, sequences nothing.
    const v = auditClaims(
      "Direct Gulf access with no bridges, and a heated saltwater pool under a covered lanai. The primary suite sits on the ground floor.",
      [],
    );
    expect(v).toEqual([]);
  });
});

describe("the prompt and the lint stay in lockstep", () => {
  it("the prohibition names every shape the lint enforces", () => {
    for (const shape of ["COMPARISON", "TRAJECTORY", "COUNT", "SEQUENCE", "LOCATION", "MOTIVE"]) {
      expect(CLAIM_PROHIBITION).toContain(shape);
    }
  });

  it("numeralsIn pulls the anchors a paragraph must be checked against", () => {
    expect(numeralsIn("$595,000 at 2,847 sq ft is $209")).toEqual(["595,000", "2,847", "209"]);
  });
});
