import { test, expect } from "bun:test";
import {
  resolveCommunityIdentity,
  communityIdentitySourceLine,
  type CommunityIdentity,
} from "./community-identity";

// All tests inject readAssignments — fully offline, no database (same deps pattern
// as community-inside-the-gate.ts).

const ROW = {
  parcel_id: "10-45-24-01-00001.0010",
  community_name_normalized: "West Bay Club",
  case_name_raw: "West Bay Club RPD",
  zoning_category: "RPD",
  input_method: "Legal",
  acres: 806.9,
  ambiguous: false,
  assigned_at: "2026-08-28T12:00:00+00:00",
};

const read = (rows: Record<string, unknown>[]) => async () => rows;

test("resolves identity when every assigned parcel agrees on one community", async () => {
  const id = await resolveCommunityIdentity(["p1", "p2"], {
    readAssignments: read([ROW, { ...ROW, parcel_id: "p2" }]),
  });
  expect(id?.communityName).toBe("West Bay Club");
  expect(id?.inputMethod).toBe("Legal");
});

test("null on zero assignments — a miss is the NORMAL case and stays silent", async () => {
  expect(await resolveCommunityIdentity(["p1"], { readAssignments: read([]) })).toBeNull();
  expect(await resolveCommunityIdentity([], { readAssignments: read([ROW]) })).toBeNull();
});

test("null when assigned parcels disagree on community — fan-out rule, never a guess", async () => {
  const id = await resolveCommunityIdentity(["p1", "p2"], {
    readAssignments: read([
      ROW,
      { ...ROW, parcel_id: "p2", community_name_normalized: "Shadow Wood Preserve" },
    ]),
  });
  expect(id).toBeNull();
});

// failure mode 6: hand-drawn / self-declared-bad boundaries — consumer stays SILENT.

test("null for a Sketched boundary — a silent miss beats a wrong community as stated fact", async () => {
  const id = await resolveCommunityIdentity(["p1"], {
    readAssignments: read([{ ...ROW, input_method: "Sketched" }]),
  });
  expect(id).toBeNull();
});

test("null for a Bad Legal boundary", async () => {
  const id = await resolveCommunityIdentity(["p1"], {
    readAssignments: read([{ ...ROW, input_method: "Bad Legal" }]),
  });
  expect(id).toBeNull();
});

test("null when ANY row is low-trust — the check is over all rows, never rows[0] only", async () => {
  // PostgREST guarantees no row order without .order(); a Sketched row hiding at
  // index 1 must silence the identity exactly as it would at index 0.
  const rows = [ROW, { ...ROW, parcel_id: "p2", input_method: "Sketched" }];
  const idForward = await resolveCommunityIdentity(["p1", "p2"], {
    readAssignments: read(rows),
  });
  const idReversed = await resolveCommunityIdentity(["p1", "p2"], {
    readAssignments: read([...rows].reverse()),
  });
  expect(idForward).toBeNull();
  expect(idReversed).toBeNull();
});

test("resolved identity is order-independent — same result whatever order rows arrive", async () => {
  const rows = [
    { ...ROW, parcel_id: "p2", acres: 40.0, case_name_raw: "West Bay Club Ph 2 RPD" },
    ROW,
  ];
  const a = await resolveCommunityIdentity(["p1", "p2"], { readAssignments: read(rows) });
  const b = await resolveCommunityIdentity(["p1", "p2"], {
    readAssignments: read([...rows].reverse()),
  });
  expect(a).toEqual(b);
});

test("null for an ambiguous assignment — flagged upstream, never shipped as identity", async () => {
  const id = await resolveCommunityIdentity(["p1"], {
    readAssignments: read([{ ...ROW, ambiguous: true }]),
  });
  expect(id).toBeNull();
});

test("never throws — a dead read degrades to null (RULE 0.7: no lookup may sink a build)", async () => {
  const id = await resolveCommunityIdentity(["p1"], {
    readAssignments: async () => {
      throw new Error("connection refused");
    },
  });
  expect(id).toBeNull();
});

// failure mode 7: the source line may never overclaim coverage — wording test-enforced,
// the same way neighborhoodAmenitiesSourceLine's wording is.

test("source line states unincorporated-Lee scope and stays identity-only", () => {
  const identity: CommunityIdentity = {
    communityName: "West Bay Club",
    caseNameRaw: "West Bay Club RPD",
    inputMethod: "Legal",
    acres: 806.9,
    assignedAt: "2026-08-28T12:00:00+00:00",
  };
  const line = communityIdentitySourceLine(identity);
  expect(line).toContain("West Bay Club");
  expect(line).toContain("unincorporated Lee County");
  expect(line).toContain("https://www.leegov.com/dcd/zoning/pd");
  // Identity ONLY — this line must forbid, not enable, amenity claims.
  expect(line).toContain("nothing about");
  // As-of in MM/DD/YYYY (FOCUS rule 2), never the raw ISO timestamp.
  expect(line).toContain("08/28/2026");
  expect(line).not.toContain("2026-08-28T");
});

test("source line is null on a null identity — silence, never a placeholder", () => {
  expect(communityIdentitySourceLine(null)).toBeNull();
  expect(communityIdentitySourceLine(undefined)).toBeNull();
});
