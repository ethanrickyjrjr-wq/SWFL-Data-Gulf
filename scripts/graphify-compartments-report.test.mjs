// Tests the pure metric computation behind scripts/graphify-compartments-report.mjs.
//
// The metric DEFINITIONS are load-bearing: these are the exact formulas that
// produced the numbers in docs/handoff/2026-08-12-graph-compartments-step2-negative-result.md
// §3 and §4b. If a future change makes these tests fail, the report is no longer
// comparable to that handoff and the handoff's tables must be re-measured, not
// silently reinterpreted.
//
//   singleton  = a community whose size is exactly 1 node
//   cross%     = share of edges whose two endpoints sit in DIFFERENT communities
//   code plane = nodes that carry a `community` field (graphify's Leiden output)
//   app plane  = nodes merged in by scripts/graphify-app-nodes.mjs AFTER clustering,
//                which therefore carry NO community field
//
// Run: node --test scripts/graphify-compartments-report.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { computeCompartmentMetrics } from "./graphify-compartments-report.mjs";

// A hand-built graph small enough to count by eye.
//
//   community 1 : a, b, c        (size 3)
//   community 2 : d, e           (size 2)
//   community 3 : f              (size 1 -> the only singleton)
//   app plane   : app1           (no community field)
//
//   links (code plane, 5): a-b, b-c, d-e  same-community
//                          c-d, e-f       cross-community  -> 2/5 = 40%
//   edges (merged, 7)    : the 5 links, PLUS a-f (both endpoints carry a
//                          community, and they differ -> a 3rd cross edge),
//                          PLUS app1-a, which has no community on one end and
//                          must be EXCLUDED from the cross% denominator rather
//                          than counted as a cross edge.
//                          -> merged cross% = 3/6 = 50%, deliberately different
//                          from the code-plane 40% so a report that reads the
//                          wrong array cannot pass these tests.
function fixture() {
  return {
    nodes: [
      { id: "a", community: 1, source_file: "lib/email/one.ts" },
      { id: "b", community: 1, source_file: "lib/email/two.ts" },
      { id: "c", community: 1, source_file: "lib/email/three.ts" },
      { id: "d", community: 2, source_file: "ingest/pipe.py" },
      { id: "e", community: 2, source_file: "ingest/pipe.py" },
      { id: "f", community: 3, source_file: "docs/sql/tables.sql" },
      { id: "app1", type: "page", source_file: "app/page.tsx" },
    ],
    links: [
      { source: "a", target: "b" },
      { source: "b", target: "c" },
      { source: "d", target: "e" },
      { source: "c", target: "d" },
      { source: "e", target: "f" },
    ],
    edges: [
      { source: "a", target: "b" },
      { source: "b", target: "c" },
      { source: "d", target: "e" },
      { source: "c", target: "d" },
      { source: "e", target: "f" },
      { source: "a", target: "f" },
      { source: "app1", target: "a" },
    ],
  };
}

test("counts communities and singletons off the code plane", () => {
  const m = computeCompartmentMetrics(fixture());

  assert.equal(m.communities, 3);
  assert.equal(m.singletons, 1);
});

test("cross% counts edges whose endpoints sit in different communities", () => {
  const m = computeCompartmentMetrics(fixture());

  // c-d and e-f cross; a-b, b-c, d-e do not. 2 of 5.
  assert.equal(m.crossPct, 40);
});

test("cross% is measured on the code plane (links), not the merged plane (edges)", () => {
  // graph.json really does carry BOTH arrays at different lengths (measured
  // 08/12/2026: links 70,721 vs edges 73,490 -> 16.7% vs 19.5%). The handoff's
  // §3/§4b cross% figures came from `links`. Reading `edges` instead silently
  // reproduces a different number under the same label.
  const m = computeCompartmentMetrics(fixture());

  assert.equal(m.crossPct, 40, "code-plane cross% must come from links");
  assert.equal(m.crossPctMerged, 50, "merged cross% must come from edges");
});

test("reports node and edge counts per plane so the two can never be conflated", () => {
  const m = computeCompartmentMetrics(fixture());

  assert.equal(m.nodes, 7);
  assert.equal(m.codePlaneNodes, 6);
  assert.equal(m.appPlaneNodes, 1);
  assert.equal(m.links, 5);
  assert.equal(m.edges, 7);
});

// §4b's by-extension singleton breakdown is the analysis that identified the
// SQL-to-code edge lever (171 of 1,434 singletons were .sql). Its own fixture:
// four singletons across three extensions, plus a non-singleton that must not
// appear in the breakdown, plus an extensionless file.
test("breaks singletons down by source-file extension, largest first", () => {
  const m = computeCompartmentMetrics({
    nodes: [
      { id: "s1", community: 10, source_file: "docs/sql/a.sql" },
      { id: "s2", community: 11, source_file: "docs/sql/b.sql" },
      { id: "s3", community: 12, source_file: "lib/x.ts" },
      { id: "s4", community: 13, source_file: "scripts/Makefile" },
      // community 14 has two members -> not a singleton, must be excluded
      { id: "p1", community: 14, source_file: "lib/pair.ts" },
      { id: "p2", community: 14, source_file: "lib/pair.ts" },
    ],
    links: [{ source: "p1", target: "p2" }],
    edges: [{ source: "p1", target: "p2" }],
  });

  assert.equal(m.singletons, 4);
  assert.deepEqual(m.singletonsByExtension, [
    [".sql", 2],
    [".ts", 1],
    ["(none)", 1],
  ]);
});
