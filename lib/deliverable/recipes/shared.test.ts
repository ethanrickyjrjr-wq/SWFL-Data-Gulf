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
mock.module("@/refinery/agents/anthropic.mts", () => ({
  getAnthropic: () => ({
    messages: {
      create: async (args: { system: string }) => {
        capturedSystem = args.system;
        return { content: [{ type: "text", text: "A well-kept three-bedroom home." }] };
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
  await authorListingNarrative({ address: "1 Main St", price: "$500,000", beds: 3 } as never);
  expect(capturedSystem).toContain(policy);
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
