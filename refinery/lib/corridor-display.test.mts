import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { displayNameFor, corridorKey } from "./corridor-display.mts";

const FIXTURES_DIR = path.resolve(import.meta.dirname, "..", "..", "fixtures");

interface CentroidRow {
  corridor_id: string;
  corridor_label: string;
  display_name?: string;
}

const centroids: CentroidRow[] = JSON.parse(
  readFileSync(path.join(FIXTURES_DIR, "corridor-centroids.json"), "utf-8"),
);

describe("corridor display names", () => {
  it("every centroid carries a non-empty display_name", () => {
    const missing = centroids
      .filter((c) => !c.display_name || c.display_name.trim() === "")
      .map((c) => c.corridor_id);
    expect(missing).toEqual([]);
  });

  it("every display_name is plain ASCII (no en-dashes / special glyphs)", () => {
    const ascii = /^[\x20-\x7E]+$/;
    const offenders = centroids
      .filter((c) => c.display_name && !ascii.test(c.display_name))
      .map((c) => `${c.corridor_id}: ${c.display_name}`);
    expect(offenders).toEqual([]);
  });

  it("resolves by corridor_id slug", () => {
    expect(displayNameFor("vanderbilt-beach-rd-mercato")).toBe("Vanderbilt");
    expect(displayNameFor("immokalee-rd-north-naples")).toBe(
      "North Naples (Immokalee Rd)",
    );
  });

  it("resolves by the over-specific corridor_label (en-dash and slashes)", () => {
    expect(displayNameFor("Vanderbilt Beach Rd / Mercato")).toBe("Vanderbilt");
    expect(displayNameFor("Immokalee Rd – North Naples")).toBe(
      "North Naples (Immokalee Rd)",
    );
  });

  it("resolves by a DB corridor_name spelling that drops the en-dash", () => {
    // corridor_profiles.corridor_name is "Immokalee Rd North Naples" (plain)
    expect(displayNameFor("Immokalee Rd North Naples")).toBe(
      "North Naples (Immokalee Rd)",
    );
  });

  it("falls back to the input unchanged for an unknown corridor", () => {
    expect(displayNameFor("Some Brand New Plaza")).toBe("Some Brand New Plaza");
    expect(displayNameFor("")).toBe("");
  });

  it("corridorKey collapses punctuation variants to one key", () => {
    expect(corridorKey("Vanderbilt Beach Rd / Mercato")).toBe(
      "vanderbilt-beach-rd-mercato",
    );
    expect(corridorKey("Vanderbilt Beach Rd – Mercato")).toBe(
      "vanderbilt-beach-rd-mercato",
    );
  });
});
