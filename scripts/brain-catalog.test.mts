// scripts/brain-catalog.test.mts
import { test } from "bun:test";
import assert from "node:assert/strict";

const { extractOutputJson, frontmatterValue, parseInputBrains, asOfDate, buildCatalog } =
  await import("./brain-catalog.mts");

// ---------------------------------------------------------------------------
// Each test is named for the failure mode it stops. A catalog that parses
// WRONG is worse than no catalog: it would tell someone "no brain holds this"
// and send them back to a billed raw query — the exact thing it exists to stop.
// ---------------------------------------------------------------------------

test("extractOutputJson: a '}' inside the conclusion prose does not truncate the block", () => {
  // A greedy regex would stop at the first '}' and silently drop every metric.
  const md = [
    "--- OUTPUT ---",
    '{ "brain_id": "x", "conclusion": "a } brace in prose", "key_metrics": [{"metric":"m"}] }',
  ].join("\n");
  const raw = extractOutputJson(md)!;
  const parsed = JSON.parse(raw);
  assert.equal(parsed.conclusion, "a } brace in prose");
  assert.equal(parsed.key_metrics.length, 1);
});

test("extractOutputJson: trailing prose after the block is not swallowed", () => {
  const md = ['--- OUTPUT ---\n{ "a": 1 }', "", "Some closing prose with { braces }."].join("\n");
  assert.equal(JSON.parse(extractOutputJson(md)!).a, 1);
});

test("extractOutputJson: returns null rather than throwing on a brain with no OUTPUT", () => {
  // One malformed brain must degrade to a recorded parse_error, never kill the run.
  assert.equal(extractOutputJson("# just prose, no output block"), null);
});

test("frontmatterValue: CRLF frontmatter parses (this repo has shipped CRLF bugs)", () => {
  const md = "<!-- FRESHNESS -->\r\n---\r\nbrain_id: housing-swfl\r\nversion: 13\r\n---\r\n# body";
  assert.equal(frontmatterValue(md, "brain_id"), "housing-swfl");
  assert.equal(frontmatterValue(md, "version"), "13");
});

test("frontmatterValue: absent key is null, not an empty string", () => {
  assert.equal(frontmatterValue("---\nbrain_id: x\n---\n", "scope"), null);
});

test("parseInputBrains: reads id, edge_type and critical off each edge", () => {
  const src = `
  input_brains: [
    { id: "macro-us", edge_type: "input", critical: true },
    { id: "env-swfl", edge_type: "modifier" },
    { id: "plain-one" },
  ],
  `;
  const edges = parseInputBrains(src);
  assert.equal(edges.length, 3);
  assert.deepEqual(edges[0], { id: "macro-us", edge_type: "input", critical: true });
  assert.equal(edges[1]!.edge_type, "modifier");
  assert.equal(edges[1]!.critical, false);
  // An edge with no explicit edge_type defaults to "input" rather than undefined.
  assert.equal(edges[2]!.edge_type, "input");
});

test("parseInputBrains: an empty input_brains array yields no phantom edges", () => {
  // Leaf brains declare `input_brains: []`. A sloppy regex invents an edge here.
  assert.deepEqual(parseInputBrains("input_brains: [],"), []);
});

test("asOfDate: renders MM/DD/YYYY, never the raw token or ISO", () => {
  assert.equal(asOfDate("2026-07-19T02:29:01Z"), "07/19/2026");
  assert.equal(asOfDate(null), null);
});

test("catalog: the live brains parse, and downstream edges mirror upstream", async () => {
  // Integration over the REAL committed brains — catches a brain whose OUTPUT
  // block drifts out of shape, which unit tests on synthetic strings cannot.
  const brains = await buildCatalog();
  assert.ok(brains.length >= 40, `expected 40+ brains, got ${brains.length}`);

  // test-alpha is a fixture and is excluded from the rendered catalog; every
  // other brain must be readable or the catalog is lying about coverage.
  const broken = brains.filter((b) => b.parse_error && b.brain_id !== "test-alpha");
  assert.deepEqual(
    broken.map((b) => b.brain_id),
    [],
    "these brains have an unparseable OUTPUT block",
  );

  // The catalog's value is the metric index — an empty one means the parse
  // silently produced shells.
  const metrics = brains.reduce((n, b) => n + b.metrics.length, 0);
  assert.ok(metrics > 100, `expected a populated metric index, got ${metrics}`);

  // Every derived downstream edge must have a matching authored upstream edge.
  const byId = new Map(brains.map((b) => [b.brain_id, b]));
  for (const b of brains) {
    for (const down of b.downstreams) {
      const child = byId.get(down)!;
      assert.ok(
        child.upstreams.some((u) => u.id === b.brain_id),
        `${b.brain_id} claims downstream ${down}, but ${down} does not declare it upstream`,
      );
    }
  }

  // Every upstream edge must point at a brain that actually exists on disk —
  // a dangling edge draws a graph node with nothing behind it.
  for (const b of brains) {
    for (const up of b.upstreams) {
      assert.ok(byId.has(up.id), `${b.brain_id} declares upstream "${up.id}" which has no brain`);
    }
  }
});
