// lib/deliverable/recipes/shared.test.ts
import { test, expect, mock, afterAll } from "bun:test";

const realResolveSubject = await import("@/lib/listings/resolve-subject");
const realCommunityLookup = await import("@/lib/listings/community-lookup");

afterAll(() => {
  mock.module("@/lib/listings/resolve-subject", () => realResolveSubject);
  mock.module("@/lib/listings/community-lookup", () => realCommunityLookup);
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
