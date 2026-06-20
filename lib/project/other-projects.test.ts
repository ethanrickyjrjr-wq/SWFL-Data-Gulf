import { describe, it, expect } from "bun:test";
import {
  otherProjectEntries,
  renderOtherProjectsBlock,
  buildOtherProjectsContext,
  type OtherProjectRow,
} from "./other-projects";
import { buildCrossProjectIndex, findOverlap } from "./cross-project-index";
import type { ProjectItem } from "./items";

const base = { added_at: "2026-06-10T08:00:00Z", origin: "web" as const };

let n = 0;
function metric(label: string, reportId: string, token = "SWFL-7421-v5-20260610"): ProjectItem {
  return {
    ...base,
    id: `m${n++}`,
    kind: "metric",
    report_id: reportId,
    label,
    value: "1",
    freshness_token: token,
  };
}
function note(text: string): ProjectItem {
  return { ...base, id: `n${n++}`, kind: "note", text };
}
function qa(question: string, reportId: string): ProjectItem {
  return { ...base, id: `q${n++}`, kind: "qa", report_id: reportId, question, answer: "a" };
}

function row(
  projectId: string,
  title: string,
  items: ProjectItem[],
  updatedAt?: string,
): OtherProjectRow {
  return { projectId, title, items, updatedAt };
}

describe("otherProjectEntries", () => {
  it("excludes the current project", () => {
    const entries = otherProjectEntries(
      [
        row("cur", "Current", [metric("Annual flood loss", "33931")]),
        row("p2", "Other", [metric("Median rent", "34104")]),
      ],
      "cur",
    );
    expect(entries.map((e) => e.projectId)).toEqual(["p2"]);
  });

  it("orders newest-first by updatedAt and caps the count", () => {
    const rows = [
      row("a", "A", [note("x")], "2026-06-01T00:00:00Z"),
      row("b", "B", [note("x")], "2026-06-03T00:00:00Z"),
      row("c", "C", [note("x")], "2026-06-02T00:00:00Z"),
    ];
    const entries = otherProjectEntries(rows, "cur", 2);
    expect(entries.map((e) => e.projectId)).toEqual(["b", "c"]);
  });

  it("derives scope, itemCount, kindCounts, and frozenAsOf from the project's items", () => {
    const [e] = otherProjectEntries(
      [row("p", "FMB 33931", [metric("Annual flood loss", "33931"), qa("rent?", "33931")])],
      "cur",
    );
    expect(e.scope).toMatchObject({ zip: "33931", place: "Fort Myers Beach" });
    expect(e.itemCount).toBe(2);
    expect(e.kindCounts).toMatchObject({ metric: 1, qa: 1 });
    expect(e.frozenAsOf).toBe("06/10/2026"); // from the metric's freshness_token
  });

  it("frozenAsOf is null for a project whose items carry no freshness token", () => {
    const [e] = otherProjectEntries([row("p", "Notes only", [note("Cape Coral comps")])], "cur");
    expect(e.frozenAsOf).toBeNull();
  });
});

describe("renderOtherProjectsBlock", () => {
  it("returns an empty string when there are no other projects", () => {
    expect(renderOtherProjectsBlock([])).toBe("");
  });

  it("renders a header, the advisory contract, and one line per project with its frozen-as-of", () => {
    const entries = otherProjectEntries(
      [row("p1", "Cape Coral 33904", [metric("Median rent", "33904"), qa("flood?", "33904")])],
      "cur",
    );
    const block = renderOtherProjectsBlock(entries);
    expect(block).toContain("YOUR OTHER PROJECTS");
    expect(block).toContain("read-only");
    expect(block).toContain("advisory"); // the anti-mess-up contract is present
    expect(block).toContain("never"); // never judge/correct/contradict
    expect(block).toContain("Cape Coral 33904");
    expect(block).toContain("2 filed items");
    expect(block).toContain("frozen as of 06/10/2026");
  });

  it("shows 'no dated data' for a note-only project instead of a synthesized vintage", () => {
    const entries = otherProjectEntries([row("p", "Scratch notes", [note("ideas")])], "cur");
    const block = renderOtherProjectsBlock(entries);
    expect(block).toContain("no dated data");
    expect(block).not.toContain("frozen as of "); // never invent an as-of
  });

  it("renders confirmed-overlap offer lines carrying the matched value + source + as-of", () => {
    // p1 (current) and p2 share ZIP 33931; p2 has Median rent that p1 lacks → a reuse hit.
    const idxRows = [
      { projectId: "p1", title: "FMB 33931", items: [metric("Annual flood loss", "33931")] },
      {
        projectId: "p2",
        title: "Luxury 33931",
        items: [metric("Annual flood loss", "33931"), metric("Median rent", "33931")],
      },
    ];
    const overlap = findOverlap("p1", buildCrossProjectIndex(idxRows));
    const entries = otherProjectEntries(
      idxRows.map((r) => row(r.projectId, r.title, r.items)),
      "p1",
    );
    const block = renderOtherProjectsBlock(entries, overlap);
    expect(block).toContain("Median rent: 1"); // the matched item's value, via summarizeItem
    expect(block).toContain("Luxury 33931"); // the source project
    expect(block).toContain("as of 06/10/2026"); // stamped from the source project's vintage
    expect(block.toLowerCase()).toContain("offer"); // framed as an offer, not an auto-add
  });

  it("omits the overlap section when there are no reuse hits", () => {
    const entries = otherProjectEntries(
      [row("p", "Solo", [metric("Median rent", "34104")])],
      "cur",
    );
    const block = renderOtherProjectsBlock(entries, { reuse: [], gap: [], pairing: [] });
    expect(block.toLowerCase()).not.toContain("offer to bring in");
  });

  it("never offers a free-text note as a filed fact — grounded (token-bearing) items only", () => {
    // p1 (current) and p2 share ZIP 33931; p2 holds a NOTE p1 lacks → a reuse hit, but a
    // note carries no freshness token, so it must NOT render as a value-bearing offer.
    const idxRows = [
      { projectId: "p1", title: "FMB A", items: [metric("Annual flood loss", "33931")] },
      {
        projectId: "p2",
        title: "FMB B",
        items: [metric("Annual flood loss", "33931"), note("Fort Myers Beach is overbuilt, avoid")],
      },
    ];
    const overlap = findOverlap("p1", buildCrossProjectIndex(idxRows));
    const entries = otherProjectEntries(
      idxRows.map((r) => row(r.projectId, r.title, r.items)),
      "p1",
    );
    const block = renderOtherProjectsBlock(entries, overlap);
    expect(block).not.toContain("overbuilt"); // the note's free text must never surface
  });

  it("stamps the offer with the matched ITEM's own vintage, not the project's newest", () => {
    const older = "SWFL-7421-v5-20260101"; // 01/01/2026
    const newer = "SWFL-7421-v6-20260615"; // 06/15/2026 — the project's newest item
    const idxRows = [
      { projectId: "p1", title: "A", items: [metric("Annual flood loss", "33931", newer)] },
      {
        projectId: "p2",
        title: "B",
        items: [
          metric("Annual flood loss", "33931", newer),
          metric("Median rent", "33931", older), // the reuse datum — carries the OLDER token
        ],
      },
    ];
    const overlap = findOverlap("p1", buildCrossProjectIndex(idxRows));
    const entries = otherProjectEntries(
      idxRows.map((r) => row(r.projectId, r.title, r.items)),
      "p1",
    );
    const block = renderOtherProjectsBlock(entries, overlap);
    expect(block).toContain("Median rent: 1");
    expect(block).toContain("frozen as of 01/01/2026"); // the rent datum's OWN older vintage
  });

  it("frames the block as data, not instructions (prompt-injection fence)", () => {
    const entries = otherProjectEntries([row("p", "T", [metric("x", "33931")])], "cur");
    const block = renderOtherProjectsBlock(entries);
    expect(block.toLowerCase()).toContain("not instructions");
  });

  it("clips a very long project title (bounded prompt budget)", () => {
    const longTitle = "X".repeat(200);
    const entries = otherProjectEntries([row("p", longTitle, [metric("x", "33931")])], "cur");
    const block = renderOtherProjectsBlock(entries);
    expect(block).not.toContain("X".repeat(200));
    expect(block).toContain("…");
  });
});

describe("buildOtherProjectsContext (the one call the route makes)", () => {
  it("lists other projects (current excluded) and surfaces a confirmed reuse offer", () => {
    const rows = [
      row("p1", "FMB 33931", [metric("Annual flood loss", "33931")]),
      row("p2", "Luxury 33931", [
        metric("Annual flood loss", "33931"),
        metric("Median rent", "33931"),
      ]),
    ];
    const block = buildOtherProjectsContext(rows, "p1");
    expect(block).toContain("Luxury 33931"); // the scope-matched other project, listed
    expect(block).not.toContain("• FMB 33931"); // the current project is NOT listed
    expect(block).toContain("Median rent: 1"); // reuse offer: p2 has it, p1 lacks it
  });

  it("returns '' when the user has only the current project", () => {
    expect(buildOtherProjectsContext([row("p1", "Solo", [metric("x", "33931")])], "p1")).toBe("");
  });

  it("honors a dismissed overlap key (the offer is suppressed)", () => {
    const rows = [
      row("p1", "FMB 33931", [metric("Annual flood loss", "33931")]),
      row("p2", "Luxury 33931", [
        metric("Annual flood loss", "33931"),
        metric("Median rent", "33931"),
      ]),
    ];
    const block = buildOtherProjectsContext(rows, "p1", {
      dismissed: ["reuse:metric:Median rent@33931"],
    });
    expect(block).toContain("Luxury 33931"); // still listed in the shallow index
    expect(block).not.toContain("Median rent: 1"); // but the dismissed offer is gone
  });
});
