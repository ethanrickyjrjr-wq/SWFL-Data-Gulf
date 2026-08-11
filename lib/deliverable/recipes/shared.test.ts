// lib/deliverable/recipes/shared.test.ts
import { test, expect, mock, afterAll } from "bun:test";

const realResolveSubject = await import("@/lib/listings/resolve-subject");
const realCommunityLookup = await import("@/lib/listings/community-lookup");
const realAnthropic = await import("@/refinery/agents/anthropic.mts");
const anthropicOrig2 = { ...realAnthropic };

afterAll(() => {
  mock.module("@/lib/listings/resolve-subject", () => realResolveSubject);
  mock.module("@/lib/listings/community-lookup", () => realCommunityLookup);
  mock.module("@/refinery/agents/anthropic.mts", () => anthropicOrig2);
});

let communityResult: unknown = { matched: false, reason: "no_parcel_at_address" };

mock.module("@/lib/listings/resolve-subject", () => ({
  ...realResolveSubject,
  resolveSubjectListing: async () => null,
}));
mock.module("@/lib/listings/community-lookup", () => ({
  ...realCommunityLookup,
  resolveCommunityForListing: async () => communityResult,
}));

// Capture the system prompt handed to the model so the test can assert the framing
// block is pasted in verbatim. mock.module is process-global — set up BEFORE ./shared
// is imported (the same ordering the two mocks above rely on), restored in afterAll.
let capturedSystem = "";
// FIX (final-review, 07/16/2026): this mock.module call replaced the WHOLE module for
// every importer in the test process without spreading the real one (playbook Part 9) —
// silently stripping every OTHER named export of @/refinery/agents/anthropic.mts (e.g.
// model-id constants) for the duration of this file's mock window. Spread anthropicOrig2
// (captured above, before any mock ran) so only getAnthropic is actually overridden.
// What the mocked model "writes" — tests that exercise the delete-only sentence
// filters (cost talk, negativity) set this, then assert on what survives.
let nextModelText = "A well-kept three-bedroom home.";
mock.module("@/refinery/agents/anthropic.mts", () => ({
  ...anthropicOrig2,
  getAnthropic: () => ({
    messages: {
      create: async (args: { system: string }) => {
        capturedSystem = args.system;
        return { content: [{ type: "text", text: nextModelText }] };
      },
    },
  }),
}));

const { resolveSubject, FAVORABLE_FRAMING_POLICY } = await import("./shared");

test("resolveSubject attaches communityStats when the address resolves to a neighborhood", async () => {
  communityResult = {
    matched: true,
    county: "collier",
    subdivisionName: "Heritage Bay",
    homeCount: 1900,
    medianJustValue: 612000,
    countByType: { "single-family": 1200, condominium: 700 },
    sourceUrl: "https://www.swfldatagulf.com/r/source/neighborhood_stats",
    asOf: "2026-07-14",
  };
  const { facts } = await resolveSubject("123 Main St, Naples, FL 34102", "");
  expect(facts.communityStats).toEqual({
    subdivisionName: "Heritage Bay",
    homeCount: 1900,
    medianJustValue: 612000,
    countByType: { "single-family": 1200, condominium: 700 },
    sourceUrl: "https://www.swfldatagulf.com/r/source/neighborhood_stats",
    asOf: "2026-07-14",
  });
});

test("resolveSubject leaves communityStats undefined when the address does not resolve", async () => {
  communityResult = { matched: false, reason: "no_parcel_at_address" };
  const { facts } = await resolveSubject("123 Main St, Naples, FL 34102", "");
  expect(facts.communityStats).toBeUndefined();
});

test("resolveSubject leaves communityStats undefined when the address string carries no ZIP", async () => {
  communityResult = {
    matched: true,
    county: "collier",
    subdivisionName: "Heritage Bay",
    homeCount: 1900,
    medianJustValue: 612000,
    countByType: null,
    sourceUrl: "x",
    asOf: "2026-07-14",
  };
  const { facts } = await resolveSubject("123 Main St", "");
  // No comma segment carrying a 5-digit ZIP -> the community lookup is never called
  // (short-circuits to Promise.resolve(null)), regardless of what the mock above returns.
  expect(facts.communityStats).toBeUndefined();
});

// ── LANE 3b — the live by-address buy (storefront decree 08/10/2026) ──────────
// resolveSubjectListing is mocked to null above, so every resolve here is a free-
// spine MISS; the injected lookup seam stands in for the guarded live runner.

test("a free+cache miss reaches the by-address lookup and the fresh row fills price and specs", async () => {
  communityResult = { matched: false, reason: "no_parcel_at_address" };
  const calls: string[] = [];
  const { facts, resolved } = await resolveSubject("2255 Brixton Rd, Columbus, OH 43221", "", {
    lookupPaidRecord: async (addr) => {
      calls.push(String(addr));
      return {
        address_key: "2255 brixton rd columbus",
        street: "2255 Brixton Rd",
        city: "Columbus",
        state: "OH",
        zip_code: "43221",
        status: "for_sale",
        list_price: 1000000,
        beds: 4,
        sqft: 2600,
        year_built: 1995,
        description: "A brick colonial on a quiet street.",
        alt_photos: [],
        raw: { property_type: "single_family" },
      } as never;
    },
  });
  expect(calls).toEqual(["2255 Brixton Rd, Columbus, OH 43221"]);
  expect(resolved).toBe(true); // a fresh fill is a resolve, not an address-only skeleton
  expect(facts.price).toBe("$1,000,000");
  expect(facts.beds).toBe("4");
  expect(facts.remarks).toContain("brick colonial");
  expect(facts.propertyType).toBe("single_family");
});

test("FAILURE: the lookup returning null keeps the honest open-slot skeleton (build never refused)", async () => {
  communityResult = { matched: false, reason: "no_parcel_at_address" };
  const { facts, resolved } = await resolveSubject("2255 Brixton Rd, Columbus, OH 43221", "", {
    lookupPaidRecord: async () => null,
  });
  expect(resolved).toBe(false);
  expect(facts.price).toBeUndefined();
  // The typed-text seed still ran, so a later cached row CAN join (one pull per address).
  expect(facts.city).toBe("Columbus");
});

test("FAILURE: a throwing lookup must not fail the build (RULE 0.7)", async () => {
  communityResult = { matched: false, reason: "no_parcel_at_address" };
  const { facts } = await resolveSubject("2255 Brixton Rd, Columbus, OH 43221", "", {
    lookupPaidRecord: async () => {
      throw new Error("vendor down");
    },
  });
  expect(facts.address).toContain("Brixton");
});

test("FAVORABLE_FRAMING_POLICY states the priority sentence first", () => {
  const bodyAfterTag = FAVORABLE_FRAMING_POLICY.split("<favorable_framing_policy>")[1] ?? "";
  const priorityIdx = bodyAfterTag.indexOf("cited facts");
  expect(priorityIdx).toBeGreaterThan(-1);
  expect(priorityIdx).toBeLessThan(120); // near the very start of the block, not buried
});

test("FAVORABLE_FRAMING_POLICY never removes a fact, only orders it", () => {
  expect(FAVORABLE_FRAMING_POLICY).toContain(
    "governs the EMPHASIS AND ORDERING of true facts. It never governs which facts appear.",
  );
});

test("FAVORABLE_FRAMING_POLICY carries the magnitude permission, direction-symmetric", () => {
  expect(FAVORABLE_FRAMING_POLICY).toContain("Numbers beat adjectives, categorically");
  expect(FAVORABLE_FRAMING_POLICY).toContain("whichever direction the number points");
});

test("FAVORABLE_FRAMING_POLICY includes a counter-example boundary", () => {
  expect(FAVORABLE_FRAMING_POLICY).toContain("COUNTER-EXAMPLE");
});

test("authorListingNarrative's system prompt includes FAVORABLE_FRAMING_POLICY verbatim", async () => {
  const { authorListingNarrative, FAVORABLE_FRAMING_POLICY: policy } = await import("./shared");
  nextModelText = "A well-kept three-bedroom home.";
  await authorListingNarrative({ address: "1 Main St", price: "$500,000", beds: 3 } as never);
  expect(capturedSystem).toContain(policy);
});

// ── The 08/10/2026 polish decree: no cost talk, no negativity, human voice ──────────
// Operator: "LET'S NOT TALK ABOUT MORE COSTS LIKE HOW MUCH THE HOA IS … LET'S JUST TALK
// ABOUT THE GOOD THINGS THAT ARE THERE … TALKS NEGETIVE ABOUT BEING INLAND AND TALKS
// LIKE AI." Each rule below is enforced in CODE (delete-only sentence filter), not just
// in the prompt — a rule only in a prompt is a rule the model can miss.

test("a sentence reciting the HOA cost is deleted, the rest of the paragraph survives", async () => {
  const { authorListingNarrative } = await import("./shared");
  nextModelText = "The home just came to market. At $225 a month the HOA covers the grounds.";
  const out = await authorListingNarrative({
    address: "1 Main St",
    price: "$500,000",
    beds: 3,
  } as never);
  expect(out).toBe("The home just came to market.");
});

test("a sentence framing the location as a trade-off is deleted, the rest survives", async () => {
  const { authorListingNarrative } = await import("./shared");
  nextModelText =
    "Groceries and restaurants are about half a mile away. That softens the inland trade-off of this location.";
  const out = await authorListingNarrative({
    address: "1 Main St",
    price: "$500,000",
    beds: 3,
  } as never);
  expect(out).toBe("Groceries and restaurants are about half a mile away.");
});

test("a concessive ('even though') sentence is deleted — a concession is a drawback in disguise", async () => {
  const { authorListingNarrative } = await import("./shared");
  nextModelText =
    "The home just came to market. Errands stay easy even though the home sits inland.";
  const out = await authorListingNarrative({
    address: "1 Main St",
    price: "$500,000",
    beds: 3,
  } as never);
  expect(out).toBe("The home just came to market.");
});

test("a monthly-fee phrasing without the word HOA is still caught", async () => {
  const { authorListingNarrative } = await import("./shared");
  nextModelText =
    "The clubhouse anchors the neighborhood. Monthly dues take care of the grounds and the gate.";
  const out = await authorListingNarrative({
    address: "1 Main St",
    price: "$500,000",
    beds: 3,
  } as never);
  expect(out).toBe("The clubhouse anchors the neighborhood.");
});

test("the system prompt forbids cost talk and negative framing, and drops the old cost assignment", async () => {
  const { authorListingNarrative } = await import("./shared");
  nextModelText = "A well-kept three-bedroom home.";
  await authorListingNarrative({ address: "1 Main St", price: "$500,000", beds: 3 } as never);
  expect(capturedSystem).toContain("NEVER TALK ABOUT COSTS");
  expect(capturedSystem).toContain("NEVER A NEGATIVE");
  // The old assignment handed the narrator "the monthly HOA" and "$ per square foot"
  // as things to write ABOUT — that is exactly the cost talk the decree kills.
  expect(capturedSystem).not.toContain("the monthly HOA, what the price works out to");
});

import { isComparableHome, perSqft, median } from "./shared";

test("isComparableHome requires beds, sqft, and price all present and positive", () => {
  expect(isComparableHome({ beds: 3, sqft: 2000, price: 400000 } as never)).toBe(true);
  expect(isComparableHome({ beds: null, sqft: 2000, price: 400000 } as never)).toBe(false);
  expect(isComparableHome({ beds: 3, sqft: 0, price: 400000 } as never)).toBe(false);
});

test("perSqft divides and rounds; null unless both parts are real", () => {
  expect(perSqft(400000, 2000)).toBe(200);
  expect(perSqft(null, 2000)).toBeNull();
  expect(perSqft(400000, 0)).toBeNull();
});

test("median: odd count returns the middle, even count averages the two middle", () => {
  expect(median([1, 3, 2])).toBe(2);
  expect(median([1, 2, 3, 4])).toBe(3); // (2+3)/2 rounded
  expect(median([])).toBeNull();
});
