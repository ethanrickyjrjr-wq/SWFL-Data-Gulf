/**
 * Tests for the ZIP shared-boundary adjacency derivation.
 *
 * Every test is named for the failure it prevents. The synthetic-geometry cases
 * exist because the real fixture cannot exercise a corner-touch or a dropped
 * MultiPolygon part on demand — those are the two silent-wrongness modes, and a
 * real-data test would only catch them by luck.
 *
 * Note the positive controls ("finds a real neighbour..."). Every structural
 * assertion here — symmetric, no-self, separated-not-adjacent — stays green when
 * the matcher is too strict and returns nothing at all. Only a positive control
 * catches a missed real neighbour.
 */
import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { buildAdjacency, footprintZips, type Ring, type ZipFeature } from "./zip-adjacency-lib.mts";

/** Closed ring for the unit square with its lower-left corner at (x, y). */
function ring(x: number, y: number): Ring {
  return [
    [x, y],
    [x + 1, y],
    [x + 1, y + 1],
    [x, y + 1],
    [x, y],
  ];
}

const poly = (x: number, y: number): ZipFeature["geometry"] => ({
  type: "Polygon",
  coordinates: [ring(x, y)],
});

describe("buildAdjacency", () => {
  test("finds a real neighbour sharing a full edge", () => {
    // A and B share the segment (1,0)-(1,1). Positive control: a too-strict
    // matcher returns nothing here and still passes every structural test below.
    const adj = buildAdjacency([
      { zip: "A", geometry: poly(0, 0) },
      { zip: "B", geometry: poly(1, 0) },
    ]);
    expect(adj.A).toEqual(["B"]);
    expect(adj.B).toEqual(["A"]);
  });

  test("does not treat a shared corner as adjacency", () => {
    // A touches D at exactly one point, (1,1). A vertex is not a boundary.
    const adj = buildAdjacency([
      { zip: "A", geometry: poly(0, 0) },
      { zip: "D", geometry: poly(1, 1) },
    ]);
    expect(adj.A).toEqual([]);
    expect(adj.D).toEqual([]);
  });

  test("handles MultiPolygon parts", () => {
    // 34102 (Naples) is a real MultiPolygon. A reader that only walks the first
    // part drops the rest of that ZIP's boundary and under-reports its neighbours.
    const multi: ZipFeature["geometry"] = {
      type: "MultiPolygon",
      coordinates: [
        [ring(50, 50)], // far-away first part
        [ring(1, 0)], // second part shares an edge with A
      ],
    };
    const adj = buildAdjacency([
      { zip: "A", geometry: poly(0, 0) },
      { zip: "M", geometry: multi },
    ]);
    expect(adj.A).toEqual(["M"]);
    expect(adj.M).toEqual(["A"]);
  });

  test("adjacency is symmetric", () => {
    const adj = buildAdjacency([
      { zip: "A", geometry: poly(0, 0) },
      { zip: "B", geometry: poly(1, 0) },
      { zip: "C", geometry: poly(2, 0) },
    ]);
    for (const [zip, neighbours] of Object.entries(adj)) {
      for (const n of neighbours) expect(adj[n]).toContain(zip);
    }
  });

  test("no ZIP is adjacent to itself", () => {
    const adj = buildAdjacency([
      { zip: "A", geometry: poly(0, 0) },
      { zip: "B", geometry: poly(1, 0) },
    ]);
    for (const [zip, neighbours] of Object.entries(adj)) {
      expect(neighbours).not.toContain(zip);
    }
  });

  test("separated polygons are not adjacent", () => {
    // The across-water case in miniature: no shared boundary, no link.
    const adj = buildAdjacency([
      { zip: "A", geometry: poly(0, 0) },
      { zip: "FAR", geometry: poly(10, 10) },
    ]);
    expect(adj.A).toEqual([]);
    expect(adj.FAR).toEqual([]);
  });

  test("output is deterministic and neighbour lists are sorted", () => {
    // Fixture diffs must be intentional; input order must not reorder output.
    const forward = buildAdjacency([
      { zip: "B", geometry: poly(1, 0) },
      { zip: "A", geometry: poly(0, 0) },
      { zip: "C", geometry: poly(2, 0) },
    ]);
    const reverse = buildAdjacency([
      { zip: "C", geometry: poly(2, 0) },
      { zip: "A", geometry: poly(0, 0) },
      { zip: "B", geometry: poly(1, 0) },
    ]);
    expect(JSON.stringify(forward)).toBe(JSON.stringify(reverse));
    expect(forward.B).toEqual(["A", "C"]);
  });

  test("every ZIP appears in the output even with no neighbours", () => {
    // A missing key is indistinguishable from "not computed" downstream.
    const adj = buildAdjacency([{ zip: "LONE", geometry: poly(0, 0) }]);
    expect(Object.keys(adj)).toEqual(["LONE"]);
    expect(adj.LONE).toEqual([]);
  });
});

describe("footprintZips", () => {
  async function entries() {
    return JSON.parse(await readFile("fixtures/swfl-zip-county.json", "utf8")).entries;
  }

  test("derives the operator-ruled 58 from the county crosswalk", async () => {
    expect(footprintZips(await entries())).toHaveLength(58);
  });

  test("includes the 33955 Burnt Store straddle", async () => {
    // Primary county is Charlotte; it is in footprint via its Lee membership.
    // A primary_county-only rule (parcel-zip-scope.ts) wrongly drops it.
    expect(footprintZips(await entries())).toContain("33955");
  });

  test("excludes a Hendry-only ZIP", async () => {
    expect(footprintZips(await entries())).not.toContain("33440");
  });

  test("is sorted and free of duplicates", async () => {
    const zips = footprintZips(await entries());
    expect(zips).toEqual([...zips].sort());
    expect(new Set(zips).size).toBe(zips.length);
  });
});
