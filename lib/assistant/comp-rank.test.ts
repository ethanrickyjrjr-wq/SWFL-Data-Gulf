// lib/assistant/comp-rank.test.ts
//
// Every test is NAMED FOR THE FAILURE MODE it prevents
// (spec: docs/superpowers/specs/2026-07-22-comp-distance-ranker-design.md).
// Phase 1 = vendor feed, which carries NO property type, NO lat/lon, NO year built —
// so F4 (class match), miles and age are deliberately absent here, not forgotten.

import { describe, expect, test } from "bun:test";
import { rankComps, type CompCandidate, type CompSubject } from "./comp-rank";

const NOW = new Date("2026-07-22T00:00:00Z");

const SUBJECT: CompSubject = { sqft: 1978, beds: 3, baths: 2, zip: "33991" };

/** A qualifying comp; override to make it fail one specific filter. */
function comp(over: Partial<CompCandidate> = {}): CompCandidate {
  return {
    addressLine: "123 Test St",
    city: "Cape Coral",
    zip: "33991",
    beds: 3,
    baths: 2,
    sqft: 1950,
    price: 425_000,
    priceDate: "2026-05-14", // ~2 months old
    ...over,
  };
}

describe("size band — the comps_no_size_band_guard defect (due Jul 26)", () => {
  test("DISQUALIFIES the 460 and 684 sq ft rows named in the defect", () => {
    const result = rankComps(
      SUBJECT,
      [
        comp({ addressLine: "460 sq ft row", sqft: 460 }),
        comp({ addressLine: "684 sq ft row", sqft: 684 }),
        comp({ addressLine: "in band A", sqft: 1900 }),
        comp({ addressLine: "in band B", sqft: 2050 }),
        comp({ addressLine: "in band C", sqft: 1800 }),
      ],
      NOW,
    );

    const addresses = result.comps.map((c) => c.addressLine);
    expect(addresses).not.toContain("460 sq ft row");
    expect(addresses).not.toContain("684 sq ft row");
    expect(result.comps).toHaveLength(3);
  });

  test("a disqualified comp is REMOVED, not merely ranked last", () => {
    // Only out-of-band candidates exist -> the honest answer is zero, not "here are
    // the least-bad wrong-sized ones."
    const result = rankComps(SUBJECT, [comp({ sqft: 460 }), comp({ sqft: 684 })], NOW);
    expect(result.comps).toHaveLength(0);
    expect(result.standardMet).toBe(false);
  });
});

describe("F1 — unscaled features let sq ft drown every other signal", () => {
  test("a same-size/wrong-shape comp does NOT outrank a near-identical home", () => {
    // Unscaled, raw-difference scoring makes `sqft` (~2,000) dominate beds (~3):
    // the 1,978 sq ft / 6-bed / 1-bath oddity would win on a 0 sqft delta alone.
    // Scaled, the near-identical 1,950 / 3 / 2 home must win.
    const result = rankComps(
      SUBJECT,
      [
        comp({ addressLine: "exact sqft, wrong shape", sqft: 1978, beds: 6, baths: 1 }),
        comp({ addressLine: "near-identical", sqft: 1950, beds: 3, baths: 2 }),
      ],
      NOW,
    );

    expect(result.comps[0].addressLine).toBe("near-identical");
  });
});

describe("F2 — the 6-month window must never silently widen", () => {
  test("a 9-month-old sale is excluded even when it is the ONLY candidate", () => {
    // The tempting failure: a thin market, so relax to Fannie's 12 months and
    // quietly overturn the operator's decree. The window expands on nothing.
    const result = rankComps(SUBJECT, [comp({ priceDate: "2025-10-14" })], NOW);

    expect(result.comps).toHaveLength(0);
    expect(result.standardMet).toBe(false);
  });

  test("no returned comp is ever older than the window, at ANY tier", () => {
    // Force the widest tier (nothing in-ZIP) and assert the time window still holds.
    const result = rankComps(
      SUBJECT,
      [
        comp({ zip: "34104", priceDate: "2025-01-02" }),
        comp({ zip: "34104", priceDate: "2024-06-30" }),
        comp({ zip: "34104", priceDate: "2026-06-01" }),
      ],
      NOW,
    );

    for (const c of result.comps) {
      expect(new Date(c.priceDate!).getTime()).toBeGreaterThan(
        new Date("2026-01-22T00:00:00Z").getTime(),
      );
    }
  });

  test("a comp with no sale date cannot satisfy the window", () => {
    const result = rankComps(SUBJECT, [comp({ priceDate: null })], NOW);
    expect(result.comps).toHaveLength(0);
  });
});

describe("F3 — never pad a thin comp set to look complete", () => {
  test("2 qualifying comps return exactly 2 and flag the standard unmet", () => {
    const result = rankComps(
      SUBJECT,
      [
        comp({ addressLine: "good A" }),
        comp({ addressLine: "good B" }),
        comp({ addressLine: "too small", sqft: 500 }),
        comp({ addressLine: "too old", priceDate: "2024-01-01" }),
      ],
      NOW,
    );

    expect(result.comps).toHaveLength(2);
    expect(result.standardMet).toBe(false);
    expect(result.note).toBeTruthy(); // must SAY the standard wasn't met
  });

  test("3 qualifying comps meet the Fannie minimum", () => {
    const result = rankComps(
      SUBJECT,
      [comp({ addressLine: "A" }), comp({ addressLine: "B" }), comp({ addressLine: "C" })],
      NOW,
    );

    expect(result.comps).toHaveLength(3);
    expect(result.standardMet).toBe(true);
  });

  test("caps at 6 even when many qualify", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      comp({ addressLine: `home ${i}`, sqft: 1900 + i * 10 }),
    );
    const result = rankComps(SUBJECT, many, NOW);
    expect(result.comps).toHaveLength(6);
  });
});

describe("F5 — an empty source must not be dressed up as a market fact", () => {
  test("zero candidates returns zero comps and an unmet standard", () => {
    const result = rankComps(SUBJECT, [], NOW);
    expect(result.comps).toHaveLength(0);
    expect(result.standardMet).toBe(false);
  });
});

describe("locality — Phase 1's only geographic signal is ZIP", () => {
  test("a same-ZIP comp outranks an equally-similar different-ZIP comp", () => {
    const result = rankComps(
      SUBJECT,
      [
        comp({ addressLine: "other zip", zip: "34104" }),
        comp({ addressLine: "same zip", zip: "33991" }),
      ],
      NOW,
    );

    expect(result.comps[0].addressLine).toBe("same zip");
  });
});

describe("output — every comp explains itself, and never invents a distance", () => {
  test("each comp carries a why-line naming its own real facts", () => {
    const result = rankComps(SUBJECT, [comp({ sqft: 1840, beds: 3, baths: 2 })], NOW);
    const why = result.comps[0].why;

    expect(why).toContain("1,840");
    expect(why).toContain("1,978"); // the subject, for comparison
  });

  test("NEVER prints miles or a direction — we hold no coordinates in Phase 1", () => {
    // Stating "1.2 miles NW" without coordinates would be an invented number.
    const result = rankComps(SUBJECT, [comp(), comp({ addressLine: "B" })], NOW);
    for (const c of result.comps) {
      expect(c.why).not.toMatch(/\bmiles?\b/i);
      expect(c.why).not.toMatch(/\b(NE|NW|SE|SW)\b/);
    }
  });
});
