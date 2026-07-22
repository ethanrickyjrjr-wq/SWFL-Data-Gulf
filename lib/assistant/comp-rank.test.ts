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

describe("feed-shape — the lake feed has sq ft but NO beds/baths", () => {
  test("a comp with real sq ft and NULL beds/baths is still rankable", () => {
    // data_lake.lee_parcels (FDOR, 104 cols) has living_area_sqft and
    // actual_year_built but NO bedroom or bathroom columns (probed 07/22/2026).
    // Requiring beds would reject EVERY lake comp. Living area is the home test —
    // land has none — so sq ft + a dated sale is the real floor.
    const result = rankComps(
      SUBJECT,
      [
        comp({ addressLine: "lake A", beds: null, baths: null }),
        comp({ addressLine: "lake B", beds: null, baths: null }),
        comp({ addressLine: "lake C", beds: null, baths: null }),
      ],
      NOW,
    );

    expect(result.comps).toHaveLength(3);
    expect(result.standardMet).toBe(true);
  });

  test("zero or null sq ft is NOT a home and never ranks", () => {
    const result = rankComps(
      SUBJECT,
      [comp({ sqft: null, beds: null }), comp({ sqft: 0, beds: null })],
      NOW,
    );
    expect(result.comps).toHaveLength(0);
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

  test("F8 — a MONTH-grain sale date never renders a fabricated day", () => {
    // leepa_parcels.last_sale_date is month grain stored as a date: ALL 31,632 rows
    // in the last 12 months are day-of-month 1 (queried live 07/22/2026). Printing
    // "sold 05/01/2026" would assert a precision the source does not have — an
    // invented figure, same family as an invented number.
    const result = rankComps(SUBJECT, [comp({ priceDate: "2026-05-01", dateGrain: "month" })], NOW);

    expect(result.comps[0].why).toContain("May 2026");
    expect(result.comps[0].why).not.toContain("05/01/2026");
  });

  test("a DAY-grain sale date still renders the exact date", () => {
    const result = rankComps(SUBJECT, [comp({ priceDate: "2026-05-14", dateGrain: "day" })], NOW);
    expect(result.comps[0].why).toContain("05/14/2026");
  });

  test("an absent grain defaults to DAY — vendor sold dates are exact", () => {
    const result = rankComps(SUBJECT, [comp({ priceDate: "2026-05-14" })], NOW);
    expect(result.comps[0].why).toContain("05/14/2026");
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

// ── F9 — the DATELESS VENDOR FEED ────────────────────────────────────────────
// The blocker found on wiring 07/22/2026, before a line of wiring shipped.
//
// `compsForAddress` ranks the /nearby-home-values response, and `NearbyComp` has NO
// sale-date field — only `estimateValue`/`estimateDate`, which the vendor module's own
// comment labels "not a sale." Real sale dates arrive ONLY from the ≤2-call enrichment
// that runs AFTER selection. So at ranking time every vendor candidate is dateless.
//
// That left exactly two wrong moves and one right one:
//   WRONG — map `priceDate: null` and rank as-is: the window rejects all 25 candidates
//           and EVERY Lee/Collier address returns "no comps." A blank product.
//   WRONG — map `estimateDate` into `priceDate` to survive the window: that launders an
//           AVM valuation date into a sale date. An invented fact — RULE 1, the one hard
//           block, and precisely what the lake feed was built to avoid.
//   RIGHT — rank the vendor feed on BAND + SHAPE and say plainly that recency is not
//           verified from this source. That is what closes comps_no_size_band_guard;
//           the 6-month window is the lake feed's job, because only it has real dates.
describe("F9 — the vendor feed carries no sale dates and must not fake them", () => {
  test("dateless comps still DROP the 460 and 684 sq ft rows from the defect", () => {
    // The whole point of Phase 1: the size-band guard cannot depend on dates the
    // vendor never sends, or it protects nothing on the path that actually runs.
    const result = rankComps(
      SUBJECT,
      [
        comp({ addressLine: "460 sq ft row", sqft: 460, priceDate: null }),
        comp({ addressLine: "684 sq ft row", sqft: 684, priceDate: null }),
        comp({ addressLine: "in band A", sqft: 1900, priceDate: null }),
        comp({ addressLine: "in band B", sqft: 2050, priceDate: null }),
        comp({ addressLine: "in band C", sqft: 1800, priceDate: null }),
      ],
      NOW,
      { requireSaleDate: false },
    );

    const addresses = result.comps.map((c) => c.addressLine);
    expect(addresses).not.toContain("460 sq ft row");
    expect(addresses).not.toContain("684 sq ft row");
    expect(result.comps).toHaveLength(3);
    expect(result.standardMet).toBe(true);
  });

  test("the escape hatch is DECLARED, never silent — recencyVerified is false", () => {
    // A caller must be able to tell a band-only set from a real 6-month set. If this
    // were implicit, prose could claim a recency nobody checked.
    const dateless = rankComps(SUBJECT, [comp({ priceDate: null })], NOW, {
      requireSaleDate: false,
    });
    expect(dateless.recencyVerified).toBe(false);

    const dated = rankComps(SUBJECT, [comp()], NOW);
    expect(dated.recencyVerified).toBe(true);
  });

  test("requireSaleDate:false does NOT become a back door around the 6-month window", () => {
    // F2's guard, re-asserted against the new flag. Dropping the date REQUIREMENT must
    // never mean accepting a sale we CAN date and know is stale — otherwise the operator
    // decree dies by flag instead of by fallback.
    const result = rankComps(
      SUBJECT,
      [
        comp({ addressLine: "stale but dated", priceDate: "2025-10-14" }),
        comp({ addressLine: "undated", priceDate: null }),
      ],
      NOW,
      { requireSaleDate: false },
    );

    const addresses = result.comps.map((c) => c.addressLine);
    expect(addresses).toContain("undated");
    expect(addresses).not.toContain("stale but dated");
  });

  test("a dateless comp never prints a sold date in its why-line", () => {
    // No date in, no date out — not "sold recently", not today's date.
    const result = rankComps(SUBJECT, [comp({ priceDate: null })], NOW, {
      requireSaleDate: false,
    });
    expect(result.comps[0].why).not.toMatch(/sold/i);
    expect(result.comps[0].why).toContain("sq ft vs your");
  });

  test("a window-free run NEVER claims a window in its note", () => {
    // The note is user-facing prose, and the not-met branch hardcoded "in the last N
    // months." On the vendor path no window was applied at all, so that sentence asserts
    // a recency nobody checked — the same invented fact `recencyVerified` exists to deny,
    // contradicting it in the same result object.
    const result = rankComps(
      SUBJECT,
      [
        comp({ addressLine: "in band A", sqft: 1900, priceDate: null }),
        comp({ addressLine: "in band B", sqft: 2050, priceDate: null }),
      ],
      NOW,
      { requireSaleDate: false },
    );

    expect(result.standardMet).toBe(false);
    expect(result.recencyVerified).toBe(false);
    expect(result.note).not.toMatch(/last \d+ months/);
    expect(result.note).toMatch(/fewer than the three/);
  });

  test("a window-free run with ZERO survivors also claims no window", () => {
    const result = rankComps(SUBJECT, [comp({ sqft: 460, priceDate: null })], NOW, {
      requireSaleDate: false,
    });
    expect(result.comps).toHaveLength(0);
    expect(result.note).not.toMatch(/last \d+ months/);
  });

  test("a DATED run still states the window — the claim is true there", () => {
    // The fix must not strip an accurate claim: when dates were required, every comp
    // considered really was inside the window, and saying so is the commentary Fannie
    // asks for.
    const result = rankComps(SUBJECT, [comp({ addressLine: "only one" })], NOW);
    expect(result.note).toMatch(/last 6 months/);
  });

  test("the DEFAULT still requires a sale date — the lake path cannot drift", () => {
    // Omitting the flag must keep the strict behavior, so wiring a new feed without
    // thinking about dates fails loudly rather than silently ranking undated rows.
    const result = rankComps(SUBJECT, [comp({ priceDate: null })], NOW);
    expect(result.comps).toHaveLength(0);
    expect(result.recencyVerified).toBe(true);
  });
});
