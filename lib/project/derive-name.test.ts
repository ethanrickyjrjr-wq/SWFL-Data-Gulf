import { describe, it, expect } from "bun:test";
import { deriveProjectName, inferScopeFromItems, inferScopeFromSubject } from "./derive-name";
import { allZipCityEntries } from "@/lib/swfl-zip-city";
import type { ProjectItem } from "./items";

const base = { id: "x", added_at: "2026-06-17T08:00:00Z", origin: "web" as const };

describe("deriveProjectName", () => {
  it("resolves a ZIP in report_id to its full place name + the ZIP", () => {
    const items: ProjectItem[] = [
      {
        ...base,
        kind: "qa",
        report_id: "33931",
        question: "What is the annual flood loss here?",
        answer: "About $30,074/yr.",
      },
    ];
    // 33931 is Fort Myers Beach (NOT Lehigh Acres) — grounded crosswalk lookup.
    expect(deriveProjectName(items)).toBe("Fort Myers Beach 33931");
  });

  it("extracts a ZIP embedded in a slug like FMB-33931", () => {
    const items: ProjectItem[] = [{ ...base, kind: "report", slug: "FMB-33931" }];
    expect(deriveProjectName(items)).toBe("Fort Myers Beach 33931");
  });

  it("picks the most-frequent ZIP across items", () => {
    const items: ProjectItem[] = [
      { ...base, id: "a", kind: "report", slug: "33901" },
      { ...base, id: "b", kind: "report", slug: "33901" },
      { ...base, id: "c", kind: "report", slug: "33931" },
    ];
    expect(deriveProjectName(items)).toBe("Fort Myers 33901");
  });

  it("falls back to a place NAME + topic when no ZIP is present", () => {
    const items: ProjectItem[] = [{ ...base, kind: "note", text: "Naples rental comps to review" }];
    expect(deriveProjectName(items)).toBe("Naples Rentals");
  });

  it("uses 'SWFL {topic}' when only a topic is detectable", () => {
    const items: ProjectItem[] = [{ ...base, kind: "report", slug: "permits-swfl" }];
    expect(deriveProjectName(items)).toBe("SWFL Permits");
  });

  it("prefers the most specific place name (Fort Myers Beach over Fort Myers)", () => {
    const items: ProjectItem[] = [
      { ...base, kind: "note", text: "Fort Myers Beach waterfront notes" },
    ];
    expect(deriveProjectName(items)).toBe("Fort Myers Beach");
  });

  it("dates the fallback (UTC) when nothing is detectable", () => {
    const items: ProjectItem[] = [{ ...base, kind: "note", text: "misc thoughts" }];
    expect(deriveProjectName(items)).toBe("Project Jun 17, 2026");
  });

  it("returns 'Untitled project' for an empty project", () => {
    expect(deriveProjectName([])).toBe("Untitled project");
  });

  it("does not read a decimal (e.g. cap rate 33901.5) as a ZIP", () => {
    const items: ProjectItem[] = [{ ...base, kind: "note", text: "cap rate 33901.5 here" }];
    // 33901.5 is rejected as a ZIP; the topic (cap rate → CRE) drives the name.
    expect(deriveProjectName(items)).toBe("SWFL CRE");
  });

  it("does not read a bare 5-digit dollar figure (30074) as a ZIP", () => {
    const items: ProjectItem[] = [{ ...base, kind: "note", text: "rent estimate 30074 monthly" }];
    // 30074 resolves to no SWFL place → not counted; "rent" topic wins.
    expect(deriveProjectName(items)).toBe("SWFL Rentals");
  });

  it("does not mistake an ordinary word for a place ('landscape' ≠ Cape Coral)", () => {
    const items: ProjectItem[] = [{ ...base, kind: "note", text: "office landscape redesign" }];
    expect(deriveProjectName(items)).toBe("Project Jun 17, 2026");
  });
});

describe("inferScopeFromItems (the shared scope root)", () => {
  it("resolves a ZIP to {zip, place} and detects the topic", () => {
    const items: ProjectItem[] = [
      {
        ...base,
        kind: "qa",
        report_id: "33931",
        question: "What is the annual flood loss here?",
        answer: "About $30,074/yr.",
      },
    ];
    expect(inferScopeFromItems(items)).toEqual({
      zip: "33931",
      place: "Fort Myers Beach",
      topic: "Flood",
    });
  });

  it("returns a place name without a ZIP when only a place is named", () => {
    const items: ProjectItem[] = [{ ...base, kind: "note", text: "Naples rental comps to review" }];
    expect(inferScopeFromItems(items)).toEqual({ place: "Naples", topic: "Rentals" });
  });

  it("returns only a topic when no place/ZIP is detectable", () => {
    const items: ProjectItem[] = [{ ...base, kind: "report", slug: "permits-swfl" }];
    expect(inferScopeFromItems(items)).toEqual({ place: undefined, topic: "Permits" });
  });

  it("returns an all-undefined scope when nothing is detectable", () => {
    const items: ProjectItem[] = [{ ...base, kind: "note", text: "misc thoughts" }];
    expect(inferScopeFromItems(items)).toEqual({ place: undefined, topic: undefined });
  });

  it("does not read a decimal (cap rate 33901.5) as a ZIP", () => {
    const items: ProjectItem[] = [{ ...base, kind: "note", text: "cap rate 33901.5 here" }];
    expect(inferScopeFromItems(items)).toEqual({ place: undefined, topic: "CRE" });
  });

  it("picks the most-frequent ZIP across items", () => {
    const items: ProjectItem[] = [
      { ...base, id: "a", kind: "report", slug: "33901" },
      { ...base, id: "b", kind: "report", slug: "33901" },
      { ...base, id: "c", kind: "report", slug: "33931" },
    ];
    expect(inferScopeFromItems(items)).toEqual({
      zip: "33901",
      place: "Fort Myers",
      topic: undefined,
    });
  });

  it("reads a PDF file's extracted_text for scope (a PDF upload becomes scope-bearing)", () => {
    const items: ProjectItem[] = [
      {
        ...base,
        kind: "file",
        storage_path: "u/p/abc.pdf",
        mime: "application/pdf",
        size: 1000,
        extracted_text: "Flood insurance study for Fort Myers Beach 33931 — annual loss estimates.",
        extraction_status: "done",
      },
    ];
    expect(inferScopeFromItems(items)).toEqual({
      zip: "33931",
      place: "Fort Myers Beach",
      topic: "Flood",
    });
  });

  it("caps a PDF's extracted_text — scope beyond FILE_TEXT_MAX (1000) is not read", () => {
    // A scope signal within the first 1000 chars IS read; the same signal pushed past the
    // cap is NOT (the cap keeps a long multi-ZIP document from swamping the dominant count
    // and bounds the regex scan). Two files isolate the boundary.
    const within: ProjectItem[] = [
      {
        ...base,
        kind: "file",
        storage_path: "u/p/a.pdf",
        mime: "application/pdf",
        size: 1000,
        extracted_text: "Fort Myers Beach 33931 flood study. " + "a".repeat(1001),
        extraction_status: "done",
      },
    ];
    expect(inferScopeFromItems(within)).toEqual({
      zip: "33931",
      place: "Fort Myers Beach",
      topic: "Flood",
    });

    const beyond: ProjectItem[] = [
      {
        ...base,
        kind: "file",
        storage_path: "u/p/b.pdf",
        mime: "application/pdf",
        size: 1000,
        extracted_text: "a".repeat(1001) + " Fort Myers Beach 33931 flood study.",
        extraction_status: "done",
      },
    ];
    expect(inferScopeFromItems(beyond)).toEqual({ place: undefined, topic: undefined });
  });

  it("an uncaptioned file with no extracted_text still contributes no scope (only its UUID path)", () => {
    const items: ProjectItem[] = [
      { ...base, kind: "file", storage_path: "u/p/2b9f.png", mime: "image/png", size: 500 },
    ];
    expect(inferScopeFromItems(items)).toEqual({ place: undefined, topic: undefined });
  });
});
describe("inferScopeFromSubject (saved listing address / market area -> scope)", () => {
  it("resolves a listing address through its ZIP for ANY covered city", () => {
    expect(inferScopeFromSubject("2006 SW 15th Ave, Cape Coral, FL 33991")).toEqual({
      zip: "33991",
      place: "Cape Coral",
      topic: undefined,
    });
    expect(inferScopeFromSubject("480 5th Ave S, Naples, FL 34102")).toEqual({
      zip: "34102",
      place: "Naples",
      topic: undefined,
    });
    expect(inferScopeFromSubject("27200 Old 41 Rd, Bonita Springs, FL 34135")).toEqual({
      zip: "34135",
      place: "Bonita Springs",
      topic: undefined,
    });
  });

  it("falls back to the whole-word place scan when the address carries no ZIP", () => {
    const s = inferScopeFromSubject("123 Main St, Fort Myers Beach");
    expect(s.place).toBe("Fort Myers Beach");
    expect(s.zip).toBeUndefined();
  });

  it("uses the market area when there is no address", () => {
    expect(inferScopeFromSubject(null, "Cape Coral").place).toBe("Cape Coral");
    expect(inferScopeFromSubject(undefined, "Naples").place).toBe("Naples");
  });

  it("an address outside the crosswalk yields NO scope (never an invented place)", () => {
    // Miami — not in any SWFL crosswalk. (Sarasota/Charlotte/Manatee DO resolve —
    // the geographic crosswalk is deliberately wider than the data scope, and this
    // helper inherits the ONE root's policy rather than inventing its own.)
    const s = inferScopeFromSubject("100 Biscayne Blvd, Miami, FL 33101");
    expect(s.zip).toBeUndefined();
    expect(s.place).toBeUndefined();
  });

  it("blank / missing subject yields an empty scope", () => {
    expect(inferScopeFromSubject()).toEqual({});
    expect(inferScopeFromSubject("  ", "")).toEqual({});
    expect(inferScopeFromSubject(null, null)).toEqual({});
  });
});
describe("inferScopeFromSubject — EXHAUSTIVE: every ZIP in the USPS map resolves (no lucky samples)", () => {
  it("an address carrying any covered ZIP resolves to that ZIP + a named place", () => {
    const failures: string[] = [];
    for (const [zip, city] of allZipCityEntries()) {
      const s = inferScopeFromSubject(`123 Main St, ${city}, FL ${zip}`);
      if (s.zip !== zip || !s.place) failures.push(`${zip} (${city}) -> ${JSON.stringify(s)}`);
    }
    expect(failures).toEqual([]);
  });
});

describe("inferScopeFromSubject — name-only addresses (no ZIP written)", () => {
  it("resolves the Lee communities by name: Fort Myers, North Fort Myers, Lehigh Acres, Estero", () => {
    expect(inferScopeFromSubject("123 Main St, Fort Myers").place).toBe("Fort Myers");
    expect(inferScopeFromSubject("123 Main St, North Fort Myers").place).toBe("North Fort Myers");
    expect(inferScopeFromSubject("123 Oak Ln, Lehigh Acres").place).toBe("Lehigh Acres");
    expect(inferScopeFromSubject("456 Corkscrew Rd, Estero").place).toBe("Estero");
  });

  it("REGRESSION: North Fort Myers must never be mislabeled as Fort Myers", () => {
    // Before the North Fort Myers crosswalk entry, the whole-word scan matched the
    // shorter "fort myers" needle inside "north fort myers".
    expect(inferScopeFromSubject("77 Pine Island Rd, North Fort Myers").place).toBe(
      "North Fort Myers",
    );
    expect(inferScopeFromSubject("77 Pine Island Rd, N Fort Myers").place).toBe("North Fort Myers");
  });
});
