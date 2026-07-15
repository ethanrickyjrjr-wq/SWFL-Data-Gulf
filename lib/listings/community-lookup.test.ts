import { test, expect, mock, afterAll } from "bun:test";
import type { ParcelCandidateRow } from "./community-lookup";

// Captures the value passed to `.eq("subdivision_name", ...)` — the ONLY place either query
// filters by that column is resolveCommunityStats' neighborhood_stats lookup (fetchCandidateRows
// filters by zip + ilike phy_addr1, never subdivision_name), so this cleanly isolates the
// join-key line this task fixes. A regression back to the raw name would flip it and redden.
let lastSubdivisionNameEq: string | undefined;

function makeChain(rows: ParcelCandidateRow[]) {
  const chain: Record<string, unknown> = {};
  chain.eq = (col: string, val: unknown) => {
    if (col === "subdivision_name") lastSubdivisionNameEq = val as string;
    return chain;
  };
  chain.ilike = () => chain;
  chain.limit = () => chain;
  chain.then = (resolve: (r: { data: ParcelCandidateRow[]; error: null }) => void) =>
    resolve({ data: rows, error: null });
  return chain;
}

let rowsForNextCall: ParcelCandidateRow[] = [];
const realServiceRole = await import("@/utils/supabase/service-role");
afterAll(() => {
  mock.module("@/utils/supabase/service-role", () => realServiceRole);
});
mock.module("@/utils/supabase/service-role", () => ({
  ...realServiceRole,
  createServiceRoleClientUntyped: () => ({
    schema: () => ({
      from: () => ({
        select: () => makeChain(rowsForNextCall),
      }),
    }),
  }),
}));

const {
  matchSubdivision,
  houseNumberToken,
  resolveCommunityForAddress,
  resolveCommunityForListing,
  canonicalCommunityKey,
  neighborhoodStatsSourceLine,
} = await import("./community-lookup");

// ── matchSubdivision (pure) — fan-out ambiguity FIRST, per the non-negotiable rule ──────────

test("matchSubdivision refuses to guess when a shared address spans 2+ distinct subdivisions", () => {
  const rows: ParcelCandidateRow[] = [
    {
      county: "collier",
      subdivision_name: "TOWER PHASE A",
      zip: "34145",
      phy_addr1: "1085 BALD EAGLE DR",
    },
    {
      county: "collier",
      subdivision_name: "TOWER PHASE B",
      zip: "34145",
      phy_addr1: "1085 BALD EAGLE DR",
    },
    {
      county: "collier",
      subdivision_name: "TOWER PHASE C",
      zip: "34145",
      phy_addr1: "1085 BALD EAGLE DR",
    },
  ];
  const result = matchSubdivision("1085BALDEAGLEDR:34145", rows);
  expect(result.matched).toBe(false);
  if (!result.matched) {
    expect(result.reason).toBe("ambiguous_multiple_subdivisions");
    expect(result.candidateCount).toBe(3);
  }
});

test("matchSubdivision matches when many parcels at one address share the SAME subdivision (a normal condo building)", () => {
  const rows: ParcelCandidateRow[] = [
    {
      county: "collier",
      subdivision_name: "AVALON AT PELICAN BAY",
      zip: "34108",
      phy_addr1: "8405 EXCALIBUR CIR",
    },
    {
      county: "collier",
      subdivision_name: "AVALON AT PELICAN BAY",
      zip: "34108",
      phy_addr1: "8405 EXCALIBUR CIR",
    },
    {
      county: "collier",
      subdivision_name: "AVALON AT PELICAN BAY",
      zip: "34108",
      phy_addr1: "8405 EXCALIBUR CIR",
    },
  ];
  const result = matchSubdivision("8405EXCALIBURCIR:34108", rows);
  expect(result).toEqual({
    matched: true,
    county: "collier",
    subdivisionName: "AVALON AT PELICAN BAY",
  });
});

test("matchSubdivision reports no_parcel_at_address when nothing in the candidate set matches the key", () => {
  const rows: ParcelCandidateRow[] = [
    { county: "lee", subdivision_name: "SOMEWHERE ELSE", zip: "33914", phy_addr1: "99 OTHER ST" },
  ];
  const result = matchSubdivision("123MAINST:33914", rows);
  expect(result).toEqual({ matched: false, reason: "no_parcel_at_address", candidateCount: 0 });
});

test("matchSubdivision groups by (county, subdivision_name) together — same raw name, different county, stays ambiguous", () => {
  // Guards against merging two genuinely distinct communities that happen to share a raw
  // legal-description string across a boundary zip.
  const rows: ParcelCandidateRow[] = [
    { county: "lee", subdivision_name: "RIVER PARK", zip: "33905", phy_addr1: "1 RIVER RD" },
    { county: "collier", subdivision_name: "RIVER PARK", zip: "33905", phy_addr1: "1 RIVER RD" },
  ];
  const result = matchSubdivision("1RIVERRD:33905", rows);
  expect(result.matched).toBe(false);
  if (!result.matched) expect(result.candidateCount).toBe(2);
});

test("matchSubdivision ignores rows missing a required field rather than matching on a hole", () => {
  const rows: ParcelCandidateRow[] = [
    { county: "collier", subdivision_name: null, zip: "34108", phy_addr1: "1 X ST" },
    { county: null, subdivision_name: "X", zip: "34108", phy_addr1: "1 X ST" },
  ];
  const result = matchSubdivision("1XST:34108", rows);
  expect(result).toEqual({ matched: false, reason: "no_parcel_at_address", candidateCount: 0 });
});

// ── houseNumberToken (pure) ───────────────────────────────────────────────────────────────

test("houseNumberToken extracts the leading whitespace-delimited token, uppercased", () => {
  expect(houseNumberToken("123 Main St")).toBe("123");
  expect(houseNumberToken("  8405   Excalibur Cir")).toBe("8405");
  expect(houseNumberToken("123A Main St")).toBe("123A");
  expect(houseNumberToken("")).toBe("");
});

// ── resolveCommunityForAddress (impure orchestrator) ─────────────────────────────────────

test("resolveCommunityForAddress matches through the live query shape end to end", async () => {
  rowsForNextCall = [
    {
      county: "collier",
      subdivision_name: "AVALON AT PELICAN BAY",
      zip: "34108",
      phy_addr1: "8405 EXCALIBUR CIR",
    },
  ];
  const result = await resolveCommunityForAddress("8405 Excalibur Cir", "34108");
  expect(result).toEqual({
    matched: true,
    county: "collier",
    subdivisionName: "AVALON AT PELICAN BAY",
  });
});

test("resolveCommunityForAddress degrades to no_parcel_at_address on empty input — never throws", async () => {
  rowsForNextCall = [];
  const result = await resolveCommunityForAddress("", "");
  expect(result).toEqual({ matched: false, reason: "no_parcel_at_address", candidateCount: 0 });
});

test("resolveCommunityForAddress strips a zip+4 to 5 digits before matching", async () => {
  rowsForNextCall = [
    { county: "lee", subdivision_name: "CAPE CORAL", zip: "33914", phy_addr1: "10 SE 1ST AVE" },
  ];
  const result = await resolveCommunityForAddress("10 SE 1st Ave", "33914-1234");
  expect(result).toEqual({ matched: true, county: "lee", subdivisionName: "CAPE CORAL" });
});

// ── canonicalCommunityKey (pure, reads the REAL shared fixture) ─────────────────────────

test("canonicalCommunityKey rolls a known raw name up to its canonical label", () => {
  expect(canonicalCommunityKey("HERITAGE BAY")).toBe("Heritage Bay");
});

test("canonicalCommunityKey passes an unresolved raw name through unchanged", () => {
  expect(canonicalCommunityKey("SOME UNMAPPED SUBDIVISION")).toBe("SOME UNMAPPED SUBDIVISION");
});

// ── neighborhoodStatsSourceLine (pure) ───────────────────────────────────────────────────

test("neighborhoodStatsSourceLine cites home count and median assessed value", () => {
  const line = neighborhoodStatsSourceLine({
    subdivisionName: "Heritage Bay",
    homeCount: 1900,
    medianJustValue: 612000,
    countByType: null,
    sourceUrl: "https://www.swfldatagulf.com/r/source/neighborhood_stats",
    asOf: "2026-07-14",
  });
  expect(line).toContain("Heritage Bay");
  expect(line).toContain("1,900");
  expect(line).toContain("$612,000");
  expect(line).toContain("07/14/2026");
  expect(line).toMatch(/assessed/i);
});

test("neighborhoodStatsSourceLine is null when stats are absent", () => {
  expect(neighborhoodStatsSourceLine(undefined)).toBeNull();
});

test("neighborhoodStatsSourceLine is null when either figure is missing -- never a partial guess", () => {
  expect(
    neighborhoodStatsSourceLine({
      subdivisionName: "Heritage Bay",
      homeCount: 1900,
      medianJustValue: null,
      countByType: null,
      sourceUrl: "x",
      asOf: "2026-07-14",
    }),
  ).toBeNull();
});

// ── resolveCommunityForListing (impure orchestrator) -- still resolves through the mock ──

test("resolveCommunityForListing returns the canonical label, not the raw name, when matched", async () => {
  rowsForNextCall = [
    { county: "collier", subdivision_name: "HERITAGE BAY", zip: "34119", phy_addr1: "100 BAY LN" },
  ];
  lastSubdivisionNameEq = undefined;
  const result = await resolveCommunityForListing("100 Bay Ln", "34119");
  expect(result.matched).toBe(true);
  if (result.matched) {
    expect(result.subdivisionName).toBe("Heritage Bay");
  }
  // The load-bearing guard: the neighborhood_stats query itself must be keyed by the CANONICAL
  // label, not the raw name -- this is the join-key lockstep bug the task exists to fix. Without
  // the transform applied BEFORE the .eq(), this is "HERITAGE BAY" and every folded row is missed.
  expect(lastSubdivisionNameEq).toBe("Heritage Bay");
});
