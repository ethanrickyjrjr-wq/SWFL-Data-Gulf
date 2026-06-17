import { describe, it, expect } from "bun:test";
import { buildCrossProjectIndex, findOverlap, type ProjectItemsRow } from "./cross-project-index";
import { identityKeyForItem } from "./identity-key";
import type { ProjectItem } from "./items";

const base = { id: "x", added_at: "2026-06-10T08:00:00Z", origin: "web" as const };

let n = 0;
function metric(label: string, reportId: string): ProjectItem {
  return {
    ...base,
    id: `m${n++}`,
    kind: "metric",
    report_id: reportId,
    label,
    value: "1",
    freshness_token: "SWFL-7421-v5-20260610",
  };
}

function proj(projectId: string, title: string, items: ProjectItem[]): ProjectItemsRow {
  return { projectId, title, items };
}

describe("buildCrossProjectIndex", () => {
  it("indexes scope, identity keys, and a human label per key", () => {
    const idx = buildCrossProjectIndex([
      proj("p1", "FMB 33931", [metric("Annual flood loss", "33931")]),
    ]);
    const p = idx.projects[0];
    expect(p.scope).toEqual({ zip: "33931", place: "Fort Myers Beach", topic: "Flood" });
    expect(p.keys.has("metric:Annual flood loss@33931")).toBe(true);
    expect(p.labelByKey.get("metric:Annual flood loss@33931")).toBe("Annual flood loss: 1");
  });
});

describe("findOverlap", () => {
  // p1 (open) and p2 share ZIP 33931; p3 is a different ZIP.
  const projects = [
    proj("p1", "FMB 33931", [
      metric("Annual flood loss", "33931"),
      metric("Permit count", "33931"),
    ]),
    proj("p2", "Luxury 33931", [
      metric("Annual flood loss", "33931"),
      metric("Median rent", "33931"),
    ]),
    proj("p3", "Naples 34104", [metric("Annual flood loss", "34104")]),
  ];
  const index = buildCrossProjectIndex(projects);

  it("REUSE: surfaces data a scope-matched other has that the open project lacks", () => {
    const { reuse } = findOverlap("p1", index);
    expect(reuse.map((h) => h.identityKey)).toEqual(["metric:Median rent@33931"]);
    expect(reuse[0]).toMatchObject({
      type: "reuse",
      otherProjectId: "p2",
      otherProjectTitle: "Luxury 33931",
      label: "Median rent: 1",
      dedupeKey: "reuse:metric:Median rent@33931",
    });
  });

  it("GAP: surfaces data the open project has that a scope-matched other lacks", () => {
    const { gap } = findOverlap("p1", index);
    // p1 has flood (shared with p2 → not a gap) + permits (p2 lacks → gap targeting p2).
    expect(gap.map((h) => h.identityKey)).toEqual(["metric:Permit count@33931"]);
    expect(gap[0]).toMatchObject({
      otherProjectId: "p2",
      dedupeKey: "gap:metric:Permit count@33931:p2",
    });
  });

  it("does NOT match across different ZIPs (p3 contributes nothing)", () => {
    const { reuse, gap } = findOverlap("p1", index);
    expect([...reuse, ...gap].some((h) => h.otherProjectId === "p3")).toBe(false);
  });

  it("matches on a shared PLACE when one side has no ZIP", () => {
    const idx = buildCrossProjectIndex([
      proj("a", "A", [metric("Annual flood loss", "33931")]), // zip 33931 → place FMB
      proj("b", "B", [{ ...base, id: "n1", kind: "note", text: "Fort Myers Beach rent comps" }]), // place only
    ]);
    // b has a note keyed differently; a should see b as scope-matched (shared place) and
    // b's note as a reuse candidate.
    const { reuse } = findOverlap("a", idx);
    expect(reuse.some((h) => h.otherProjectId === "b")).toBe(true);
  });

  it("topic alone does NOT anchor a match (avoids nagging)", () => {
    const idx = buildCrossProjectIndex([
      proj("a", "A", [metric("Annual flood loss", "33931")]), // zip 33931 + Flood
      proj("b", "B", [metric("Annual flood loss", "34104")]), // zip 34104 + Flood (same topic, diff zip)
    ]);
    const { reuse, gap } = findOverlap("a", idx);
    expect(reuse).toHaveLength(0);
    expect(gap).toHaveLength(0);
  });

  it("suppresses dismissed overlap keys", () => {
    const all = findOverlap("p1", index);
    const dismissed = [all.reuse[0].dedupeKey, all.gap[0].dedupeKey];
    const after = findOverlap("p1", index, { dismissed });
    expect(after.reuse).toHaveLength(0);
    expect(after.gap).toHaveLength(0);
  });

  it("returns empty when the project is not in the index", () => {
    expect(findOverlap("missing", index)).toEqual({ reuse: [], gap: [], pairing: [] });
  });
});

describe("identity keys (absent optional fields don't collide)", () => {
  it("two auto-picked frames on one brain with different titles get distinct keys", () => {
    const f1: ProjectItem = {
      ...base,
      id: "f1",
      kind: "frame",
      brain_id: "env-swfl",
      title: "Flood by ZIP",
    };
    const f2: ProjectItem = {
      ...base,
      id: "f2",
      kind: "frame",
      brain_id: "env-swfl",
      title: "Surge risk",
    };
    expect(identityKeyForItem(f1)).not.toBe(identityKeyForItem(f2));
  });
  it("a metric without a metric_slug keys on its label", () => {
    expect(identityKeyForItem(metric("Median rent", "33931"))).toBe("metric:Median rent@33931");
  });
  it("metric_keys order does not change a frame's identity", () => {
    const a: ProjectItem = {
      ...base,
      id: "a",
      kind: "frame",
      brain_id: "b",
      frame_id: "f",
      metric_keys: ["x", "y"],
      title: "t",
    };
    const z: ProjectItem = {
      ...base,
      id: "z",
      kind: "frame",
      brain_id: "b",
      frame_id: "f",
      metric_keys: ["y", "x"],
      title: "t",
    };
    expect(identityKeyForItem(a)).toBe(identityKeyForItem(z));
  });
});
