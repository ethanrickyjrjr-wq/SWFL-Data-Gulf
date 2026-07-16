// lib/project/group-projects.test.ts
import { describe, expect, test } from "bun:test";
import { groupProjects, kindChipLabel, toCockpitProjects } from "./group-projects";
import type { ProjectItem } from "@/lib/project/items";

const addrItem = (address: string): ProjectItem =>
  ({ kind: "address", address, added_at: "2026-07-01T00:00:00Z" }) as ProjectItem;

const row = (over = {}) => ({
  id: "p1",
  title: "2006 SW 15th Ave, Cape Coral, FL 33991",
  kind: "listing",
  items: [addrItem("2006 SW 15th Ave, Cape Coral, FL 33991")],
  updated_at: "2026-07-15T00:00:00Z",
  ...over,
});

describe("toCockpitProjects", () => {
  test("derives displayTitle, city, zip from items", () => {
    const [p] = toCockpitProjects([row()]);
    expect(p.displayTitle).toBe("2006 SW 15th Ave, Cape Coral");
    expect(p.zip).toBe("33991");
    expect(p.city).toBe("Cape Coral");
  });
  test("unknown kind falls back to general; hasSchedule from scheduledIds", () => {
    const [p] = toCockpitProjects([row({ kind: "bogus" })], {
      scheduledIds: new Set(["p1"]),
    });
    expect(p.kind).toBe("general");
    expect(p.hasSchedule).toBe(true);
  });
});

describe("groupProjects", () => {
  test("sections: listing / showing-prep / general+schedule / general", () => {
    const projects = toCockpitProjects(
      [
        row({ id: "a", kind: "listing" }),
        row({ id: "b", kind: "showing-prep" }),
        row({ id: "c", kind: "general", title: "Newsletter", items: [] }),
        row({ id: "d", kind: "general", title: "Del Prado Test", items: [] }),
      ],
      { scheduledIds: new Set(["c"]) },
    );
    const keys = groupProjects(projects).map((s) => s.key);
    expect(keys).toEqual(["listings", "open-houses", "campaigns", "other"]);
  });
  test("empty sections are omitted", () => {
    const projects = toCockpitProjects([row({ id: "a", kind: "listing" })]);
    expect(groupProjects(projects).map((s) => s.key)).toEqual(["listings"]);
  });
  test("city subgroups alphabetical, null-city last, input order kept in-group", () => {
    const projects = toCockpitProjects([
      row({
        id: "a",
        title: "9 Oak St, Fort Myers, FL 33901",
        items: [addrItem("9 Oak St, Fort Myers, FL 33901")],
      }),
      row({ id: "b" }), // Cape Coral
      row({ id: "c", title: "No scope", items: [] }),
      row({ id: "d" }), // Cape Coral, later row → after b within the subgroup
    ]);
    const [listings] = groupProjects(projects);
    expect(listings.subgroups.map((g) => g.city)).toEqual(["Cape Coral", "Fort Myers", null]);
    expect(listings.subgroups[0].projects.map((p) => p.id)).toEqual(["b", "d"]);
    expect(listings.count).toBe(4);
  });
});

describe("kindChipLabel", () => {
  test("labels", () => {
    const [l, s, c, g] = toCockpitProjects(
      [
        row({ id: "l", kind: "listing" }),
        row({ id: "s", kind: "showing-prep" }),
        row({ id: "c", kind: "general" }),
        row({ id: "g", kind: "general" }),
      ],
      { scheduledIds: new Set(["c"]) },
    );
    expect(kindChipLabel(l)).toBe("Listing");
    expect(kindChipLabel(s)).toBe("Open house");
    expect(kindChipLabel(c)).toBe("Campaign");
    expect(kindChipLabel(g)).toBe("Project");
  });
});
