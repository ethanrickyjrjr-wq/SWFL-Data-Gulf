// lib/email/segments/filter.test.ts
import { describe, expect, it } from "bun:test";
import { evaluateSegment, requiresPaidTier, type Condition, type SegmentContact } from "./filter";

const alice: SegmentContact = {
  id: "c-alice",
  email: "alice@x.com",
  name: "Alice",
  tags: ["buyer"],
  attribs: { city: "Naples", budget: "450000" },
};
const bob: SegmentContact = {
  id: "c-bob",
  email: "bob@x.com",
  name: "Bob",
  tags: ["seller", "vip"],
  attribs: {},
};
const carol: SegmentContact = {
  id: "c-carol",
  email: "carol@x.com",
  name: "Carol",
  tags: ["buyer", "vip"],
  attribs: { city: "Fort Myers" },
};

describe("evaluateSegment — tags", () => {
  it("has: matches contacts carrying the tag", () => {
    const filter: Condition = { field: "tags", op: "has", value: "buyer" };
    expect(evaluateSegment([alice, bob, carol], [], filter).map((c) => c.id)).toEqual([
      "c-alice",
      "c-carol",
    ]);
  });

  it("not: excludes contacts carrying the tag", () => {
    const filter: Condition = { not: { field: "tags", op: "has", value: "vip" } };
    expect(evaluateSegment([alice, bob, carol], [], filter).map((c) => c.id)).toEqual(["c-alice"]);
  });

  it("and/or: buyer AND NOT vip", () => {
    const filter: Condition = {
      and: [
        { field: "tags", op: "has", value: "buyer" },
        { not: { field: "tags", op: "has", value: "vip" } },
      ],
    };
    expect(evaluateSegment([alice, bob, carol], [], filter).map((c) => c.id)).toEqual(["c-alice"]);
  });
});

describe("evaluateSegment — attribs", () => {
  it("eq matches an exact string value", () => {
    const filter: Condition = { field: "attribs", key: "city", op: "eq", value: "Naples" };
    expect(evaluateSegment([alice, bob, carol], [], filter).map((c) => c.id)).toEqual(["c-alice"]);
  });

  it("gt/lt coerce stored strings to numbers; non-numeric values never match", () => {
    const gt: Condition = { field: "attribs", key: "budget", op: "gt", value: "400000" };
    expect(evaluateSegment([alice, bob, carol], [], gt).map((c) => c.id)).toEqual(["c-alice"]);
    const lt: Condition = { field: "attribs", key: "budget", op: "lt", value: "100" };
    expect(evaluateSegment([alice, bob, carol], [], lt)).toEqual([]);
  });

  it("contains does a case-insensitive substring match", () => {
    const filter: Condition = { field: "attribs", key: "city", op: "contains", value: "fort" };
    expect(evaluateSegment([alice, bob, carol], [], filter).map((c) => c.id)).toEqual(["c-carol"]);
  });

  it("a missing key never matches", () => {
    const filter: Condition = { field: "attribs", key: "nonexistent", op: "eq", value: "x" };
    expect(evaluateSegment([alice, bob, carol], [], filter)).toEqual([]);
  });
});

describe("evaluateSegment — email/name", () => {
  it("matches is a case-insensitive substring on the chosen field", () => {
    const filter: Condition = { field: "email", op: "matches", value: "ALICE" };
    expect(evaluateSegment([alice, bob, carol], [], filter).map((c) => c.id)).toEqual(["c-alice"]);
  });
});

describe("evaluateSegment — engagement", () => {
  const events = [
    { contact_id: "c-alice", event: "opened", did: "d-1" },
    { contact_id: "c-bob", event: "clicked", did: "d-1" },
    { contact_id: "c-alice", event: "opened", did: "d-2" },
  ];

  it("opened: matches only contacts with an opened row for that deliverable", () => {
    const filter: Condition = { field: "engagement", op: "opened", deliverable_id: "d-1" };
    expect(evaluateSegment([alice, bob, carol], events, filter).map((c) => c.id)).toEqual([
      "c-alice",
    ]);
  });

  it("clicked: scoped to the given deliverable only", () => {
    const filter: Condition = { field: "engagement", op: "clicked", deliverable_id: "d-2" };
    expect(evaluateSegment([alice, bob, carol], events, filter)).toEqual([]);
  });

  it("never_opened: matches contacts with no opened row for that deliverable", () => {
    const filter: Condition = { field: "engagement", op: "never_opened", deliverable_id: "d-1" };
    expect(evaluateSegment([alice, bob, carol], events, filter).map((c) => c.id)).toEqual([
      "c-bob",
      "c-carol",
    ]);
  });
});

describe("requiresPaidTier", () => {
  it("false for tag-only and email/name conditions", () => {
    expect(requiresPaidTier({ field: "tags", op: "has", value: "buyer" })).toBe(false);
    expect(
      requiresPaidTier({
        and: [
          { field: "tags", op: "has", value: "buyer" },
          { field: "email", op: "matches", value: "x" },
        ],
      }),
    ).toBe(false);
  });

  it("true when an attribs or engagement condition appears anywhere in the tree", () => {
    expect(requiresPaidTier({ field: "attribs", key: "city", op: "eq", value: "Naples" })).toBe(
      true,
    );
    expect(requiresPaidTier({ field: "engagement", op: "opened", deliverable_id: "d-1" })).toBe(
      true,
    );
    expect(
      requiresPaidTier({
        and: [
          { field: "tags", op: "has", value: "buyer" },
          { not: { field: "engagement", op: "opened", deliverable_id: "d-1" } },
        ],
      }),
    ).toBe(true);
  });
});
