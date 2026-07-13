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

  it("catches a count written in DIGITS — the hole that beat the FIRST version of this gate", () => {
    // ROUND 2. The original WORD_COUNT matched only SPELLED numbers, so these three
    // shipped CLEANLY past both gates — verified live against market-comps — because the
    // digits 2/4/6 were already in the anchor allow-set: the settled sentences supply
    // them. An absent control, not a beatable one.
    //
    // Truth for that set: 2 of 6 are recorded sales. Every sentence below is FALSE.
    for (const lie of [
      "All 6 comparable homes are recorded sales.",
      "4 of 6 comparable homes are recorded sales.",
      "The 6 recorded sales support the asking price.",
    ]) {
      const v = auditClaims(lie, []);
      expect(
        v.some((x) => x.kind === "word-count"),
        `did not catch: ${lie}`,
      ).toBe(true);
    }
  });

  it("CORRUPTION-ON-RESTATE: the true settled count passes; the SAME sentence with a swapped digit does not", () => {
    // The real failure mode. The structural rule (no raw set) stops the narrator DERIVING
    // a count — but it is HANDED settled count sentences, and nothing stopped it restating
    // one with a digit swapped. Only prompt-prose did, and this file's own thesis is that
    // prose is not a control.
    const settled = settledCount(2, 6, {
      noun: "comparable homes",
      predicate: "in the set are recorded sales",
    });
    expect(settled.sentence).toBe("2 of 6 comparable homes in the set are recorded sales.");

    // Restated verbatim → legitimate. Code authored this claim.
    expect(auditClaims(settled.sentence, [settled])).toEqual([]);

    // The same shape with the digit swapped → a FALSE claim, and it must not ship.
    const corrupted = "4 of 6 comparable homes in the set are recorded sales.";
    expect(auditClaims(corrupted, [settled]).some((x) => x.kind === "word-count")).toBe(true);

    // …and with the quantifier swapped.
    const alsoCorrupted = "All 6 comparable homes in the set are recorded sales.";
    expect(auditClaims(alsoCorrupted, [settled]).some((x) => x.kind === "word-count")).toBe(true);
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

  it("catches a claim about the EMAIL'S OWN LAYOUT — the narrator has never seen it", () => {
    // price-reduced's narrator wrote "what you see in the grid above" — of a grid it had
    // never been shown. And the layout MOVES underneath it: the open-slot contract omits an
    // empty row, a chart gets dropped. "The chart below" then becomes a visible lie in an
    // email the agent signed.
    for (const lie of [
      "The details are in the grid above.",
      "As you can see below, the market has its own view.",
      "The chart below tells the rest of the story.",
      "Full specs are shown above.",
    ]) {
      const v = auditClaims(lie, []);
      expect(
        v.some((x) => x.kind === "artifact-positional"),
        `did not catch: ${lie}`,
      ).toBe(true);
    }
  });

  it("catches the INVENTED DOCK — a fact about a home is not only a number", () => {
    // The agent's own description (the ONLY descriptive source we hold) said:
    //   "Direct Gulf-access canal home with a five-minute idle to open water."
    // The narrator shipped:
    //   "From the dock, it's a five-minute idle to open water."
    // NO SOURCE HOLDS A DOCK. The model added a physical structure to someone's house, in an
    // email that agent would have signed. Same disease as the model that once guessed
    // "waterfront character" and happened to be right — guessing correctly is luck.
    const facts = {
      sentence:
        "The listing's own description: Direct Gulf-access canal home with a five-minute idle to open water.",
      anchors: [],
    };
    const v = auditClaims("From the dock, it's a five-minute idle to open water.", [facts]);
    expect(v.some((x) => x.kind === "unsourced-feature" && x.match === "dock")).toBe(true);

    // …and a feature the description DOES hold passes clean. The gate must not eat the
    // agent's own words back out of their own email.
    expect(
      auditClaims("A Gulf-access canal home, five minutes at idle to open water.", [facts]).filter(
        (x) => x.kind === "unsourced-feature",
      ),
    ).toEqual([]);
  });

  it("does NOT flag an honest number just because the facts wrote it without a comma", () => {
    // Live bug: the FACTS said "Square feet: 2847" and the correctly-sourced prose said
    // "2,847 sq ft" — and the gate flagged its own true number as unanchored. It failed
    // CLOSED, so it cost prose rather than truth. But a gate that eats honest sentences is a
    // gate nobody keeps.
    const facts = { sentence: "Square feet: 2847", anchors: numeralsIn("Square feet: 2847") };
    const v = auditClaims("The home offers 2,847 square feet.", [facts]);
    expect(v.filter((x) => x.kind === "unanchored-number")).toEqual([]);
  });

  it("does NOT eat an honest settled comparison that happens to contain 'below'", () => {
    // "priced $104,975 below its original ask" is a legitimate, sourced fact — the cut is
    // real. A gate that drops honest prose is a gate nobody keeps, and the deliverable
    // ships with a hole instead of a sentence.
    const settled = {
      sentence: "New construction, priced $104,975 below its original ask.",
      anchors: ["104,975"],
    };
    expect(auditClaims(settled.sentence, [settled])).toEqual([]);
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
  it("a plain descriptive paragraph passes clean — WHEN THE FACTS HOLD ITS FEATURES", () => {
    // The paragraph a listing description SHOULD produce: it describes the home from the
    // agent's own pasted words, asserts no relation, counts nothing, sequences nothing.
    // The pool and the lanai are in the SOURCE, so the narrator may say them.
    const facts = {
      sentence:
        "The listing's own description: Gulf access with no bridges, a heated saltwater pool, a covered lanai, ground-floor primary suite.",
      anchors: [],
    };
    const v = auditClaims(
      "Direct Gulf access with no bridges, and a heated saltwater pool under a covered lanai. The primary suite sits on the ground floor.",
      [facts],
    );
    expect(v).toEqual([]);
  });

  it("…and the SAME paragraph is refused when the facts hold none of it", () => {
    // Handed NO description, the narrator has no source for a pool or a lanai — so it may
    // not write one. This is the whole rule: with no source, it writes NOTHING, and the slot
    // stays open for the agent to fill.
    const v = auditClaims(
      "Direct Gulf access with no bridges, and a heated saltwater pool under a covered lanai.",
      [],
    );
    expect(v.some((x) => x.kind === "unsourced-feature" && x.match === "pool")).toBe(true);
    expect(v.some((x) => x.kind === "unsourced-feature" && x.match === "lanai")).toBe(true);
  });
});

describe("the prompt and the lint stay in lockstep", () => {
  it("the prohibition names every shape the lint enforces", () => {
    for (const shape of ["COMPARISON", "TRAJECTORY", "COUNT", "SEQUENCE", "LOCATION", "MOTIVE"]) {
      expect(CLAIM_PROHIBITION).toContain(shape);
    }
  });

  it("numeralsIn NORMALISES separators, so '2,847' and '2847' are the same anchor", () => {
    // The live bug: facts said "2847", prose said "2,847", and the gate called its own true
    // number invented.
    expect(numeralsIn("$595,000 at 2,847 sq ft is $209")).toEqual(["595000", "2847", "209"]);
    expect(numeralsIn("Square feet: 2847")).toEqual(["2847"]);
  });
});
