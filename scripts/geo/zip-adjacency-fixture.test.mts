/**
 * Validation gate for the committed adjacency fixture.
 *
 * Distinct from zip-adjacency-lib.test.mts, which unit-tests the derivation
 * against synthetic geometry. These assert facts about the REAL emitted graph —
 * the class of failure a green logic suite cannot catch, per RULE 3.5's scope
 * limit on TDD.
 *
 * Every geographic assertion below was measured against the fixture on
 * 07/22/2026, not recalled.
 */
import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { footprintZips } from "./zip-adjacency-lib.mts";

const fixture = JSON.parse(await readFile("fixtures/swfl-zip-adjacency.json", "utf8")) as {
  polygons_verified_date: string;
  zcta_vintage: string;
  zip_count: number;
  isolated_zips: string[];
  adjacency: Record<string, string[]>;
};
const polygons = JSON.parse(await readFile("fixtures/swfl-zip-polygons.json", "utf8")) as {
  verified_date: string;
};
const county = JSON.parse(await readFile("fixtures/swfl-zip-county.json", "utf8"));
const adj = fixture.adjacency;

describe("swfl-zip-adjacency fixture", () => {
  test("covers all 58 footprint ZIPs", () => {
    expect(Object.keys(adj).sort()).toEqual(footprintZips(county.entries));
  });

  test("adjacency is symmetric", () => {
    // An asymmetric graph breaks any merge that walks it from one side.
    const broken: string[] = [];
    for (const [zip, ns] of Object.entries(adj)) {
      for (const n of ns) if (!adj[n]?.includes(zip)) broken.push(`${zip}->${n}`);
    }
    expect(broken).toEqual([]);
  });

  test("no ZIP is adjacent to itself", () => {
    for (const [zip, ns] of Object.entries(adj)) expect(ns).not.toContain(zip);
  });

  test("every neighbour is itself in the footprint", () => {
    const inSet = new Set(Object.keys(adj));
    for (const ns of Object.values(adj)) for (const n of ns) expect(inSet.has(n)).toBe(true);
  });

  test("finds known-adjacent mainland pairs", () => {
    // Positive controls. Every structural test above stays green if the matcher
    // is too strict and returns an empty graph; only these catch that.
    expect(adj["33901"]).toContain("33916"); // Fort Myers, 107 shared segments
    expect(adj["33901"]).toContain("33907"); // Fort Myers / south Fort Myers
    expect(adj["34102"]).toContain("34103"); // Naples core / Naples north
  });

  test("does not link Boca Grande to the mainland", () => {
    // 33921 is Gasparilla Island. Every neighbour is across water or outside
    // Lee/Collier, so it is legitimately the one isolated ZIP.
    expect(adj["33921"]).toEqual([]);
    expect(fixture.isolated_zips).toEqual(["33921"]);
  });

  test("records the polygons fixture as-of so drift is detectable", () => {
    // Guard #7: regenerate polygons without regenerating adjacency and this fails.
    expect(fixture.polygons_verified_date).toBe(polygons.verified_date);
  });

  test("is 2020 ZCTA vintage, matching the county crosswalk", () => {
    // public/maps/fl_zips.geojson is 2010 and disagrees on real edges
    // (33903~33916). Mixing vintages silently changes the graph.
    expect(fixture.zcta_vintage).toBe("2020");
    expect(county.crosswalk_vintage).toContain("2020");
  });

  test("neighbour lists are sorted and duplicate-free", () => {
    for (const ns of Object.values(adj)) {
      expect(ns).toEqual([...ns].sort());
      expect(new Set(ns).size).toBe(ns.length);
    }
  });

  test("graph is plausibly planar, not degenerate", () => {
    // A matcher bug that links everything to everything would pass symmetry and
    // sortedness. Real ZCTA contiguity sits near 5 neighbours per ZIP.
    const degrees = Object.values(adj).map((n) => n.length);
    const mean = degrees.reduce((a, b) => a + b, 0) / degrees.length;
    expect(mean).toBeGreaterThan(3);
    expect(mean).toBeLessThan(8);
    expect(Math.max(...degrees)).toBeLessThan(20);
  });
});
