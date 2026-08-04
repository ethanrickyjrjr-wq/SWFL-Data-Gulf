// Gate 12 rules — tested against the REAL 08/03/2026 artifacts that slipped through.
//
// The point of the positive controls below: this gate is not a hypothetical. It is
// anchored to the exact migration and pipeline that landed three populated data_lake
// tables with zero readers. If someone rewrites those files in a shape the parser
// misses, these tests go red rather than the gate silently passing everything.
//
// RUNNER: node:test, NOT bun:test — deliberate. `bun test` does not discover dot-dirs,
// so the ONLY runner that reaches this file is ci.yml's `node --test ... .claude/hooks/
// lib/*.test.mjs` step, and node's ESM loader rejects the `bun:` scheme outright
// (ERR_UNSUPPORTED_ESM_URL_SCHEME, verified live 08/04/2026). A bun:test file here is a
// test no runner executes — which is the same class of failure as the gate this module
// implements. Do not "modernize" these imports.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  isConsumerPath,
  orphanTables,
  tablesCreatedInSql,
  tablesDeclaredInPipeline,
} from "./table-consumer.mjs";

// ── tablesCreatedInSql ──────────────────────────────────────────────────────────

// POSITIVE CONTROL — the real migration from the incident.
test("finds all three tables in the real 20260803_steadyapi_neighborhoods.sql", () => {
  const sql = readFileSync("migrations/20260803_steadyapi_neighborhoods.sql", "utf8");
  const tables = tablesCreatedInSql(sql);
  assert.ok(tables.includes("steadyapi_neighborhoods"), "steadyapi_neighborhoods");
  assert.ok(tables.includes("steadyapi_neighborhood_amenities"), "amenities");
  assert.ok(tables.includes("steadyapi_property_neighborhood"), "pairing edge");
});

test("sql parse tolerates IF NOT EXISTS, quoting, whitespace, lowercase ddl", () => {
  assert.deepStrictEqual(tablesCreatedInSql(`create table data_lake.foo (a int);`), ["foo"]);
  assert.deepStrictEqual(
    tablesCreatedInSql(`CREATE TABLE IF NOT EXISTS "data_lake"."bar" (a int);`),
    ["bar"],
  );
  assert.deepStrictEqual(tablesCreatedInSql(`CREATE  TABLE\n  data_lake . baz (a int);`), ["baz"]);
});

test("sql parse ignores other schemas, plain SELECTs, and views", () => {
  assert.deepStrictEqual(tablesCreatedInSql(`CREATE TABLE public.contacts (a int);`), []);
  assert.deepStrictEqual(tablesCreatedInSql(`SELECT * FROM data_lake.already_existing;`), []);
  assert.deepStrictEqual(tablesCreatedInSql(`CREATE VIEW data_lake.some_view AS SELECT 1;`), []);
});

test("sql parse returns [] for empty/absent input rather than throwing", () => {
  assert.deepStrictEqual(tablesCreatedInSql(""), []);
  assert.deepStrictEqual(tablesCreatedInSql(null), []);
});

// ── tablesDeclaredInPipeline ────────────────────────────────────────────────────

// POSITIVE CONTROL — the real pipeline from the incident.
test("finds the three *_TABLE constants in the real neighborhood_amenities pipeline", () => {
  const py = readFileSync("ingest/pipelines/neighborhood_amenities/pipeline.py", "utf8");
  const tables = tablesDeclaredInPipeline(py);
  assert.ok(tables.includes("steadyapi_neighborhoods"));
  assert.ok(tables.includes("steadyapi_neighborhood_amenities"));
  assert.ok(tables.includes("steadyapi_property_neighborhood"));
});

test("pipeline parse normalizes a schema-qualified constant to the bare name", () => {
  assert.deepStrictEqual(tablesDeclaredInPipeline(`MY_TABLE = "data_lake.widgets"`), ["widgets"]);
});

test("pipeline parse does not mistake a SCHEMA constant for a table", () => {
  assert.deepStrictEqual(
    tablesDeclaredInPipeline(`SCHEMA = "data_lake"\nTABLE_SCHEMA = "data_lake"`),
    [],
  );
});

test("pipeline parse ignores lowercase locals and indented assignments", () => {
  assert.deepStrictEqual(
    tablesDeclaredInPipeline(`my_table = "sneaky"\n    OTHER_TABLE = "indented"`),
    [],
  );
});

// ── isConsumerPath ─────────────────────────────────────────────────────────────

test("accepts real product readers", () => {
  assert.ok(isConsumerPath("lib/listings/neighborhood-amenities.ts"));
  assert.ok(isConsumerPath("refinery/sources/market-temperature-source.mts"));
  assert.ok(isConsumerPath("app/api/mcp/server.ts"));
  assert.ok(isConsumerPath("components/email-lab/Foo.tsx"));
});

// The writer cannot satisfy the gate on its own behalf — else it always passes.
test("rejects the writers (ingest, migrations)", () => {
  assert.ok(!isConsumerPath("ingest/pipelines/neighborhood_amenities/pipeline.py"));
  assert.ok(!isConsumerPath("migrations/20260803_steadyapi_neighborhoods.sql"));
});

// THE documented failure: catalogued is not consumed.
test("rejects prose — docs, research, scratchpad, the registry", () => {
  assert.ok(!isConsumerPath("docs/standards/data-roots.md"));
  assert.ok(!isConsumerPath("docs/standards/repo-inventory-audit.md"));
  assert.ok(!isConsumerPath("_RESEARCH/data-and-ingest/2026-08-03-probe.md"));
  assert.ok(!isConsumerPath("_ASSISTANT/SCRATCHPAD.md"));
  assert.ok(!isConsumerPath("ingest/cadence_registry.yaml"));
});

// A test that is the ONLY reader means the product reads nothing.
test("rejects tests and fixtures", () => {
  assert.ok(!isConsumerPath("lib/listings/neighborhood-amenities.test.ts"));
  assert.ok(!isConsumerPath("ingest/pipelines/neighborhood_amenities/test_pipeline.py"));
  assert.ok(!isConsumerPath("fixtures/community-aliases.json"));
});

test("rejects junk input", () => {
  assert.ok(!isConsumerPath(""));
  assert.ok(!isConsumerPath(null));
});

test("normalizes Windows separators", () => {
  assert.ok(isConsumerPath("lib\\listings\\neighborhood-amenities.ts"));
  assert.ok(!isConsumerPath("ingest\\pipelines\\x\\pipeline.py"));
});

// ── orphanTables ───────────────────────────────────────────────────────────────

// THE REGRESSION: exactly the 08/03/2026 state — tables mentioned only by their
// writer, the registry, and the docs. This must be an orphan set, i.e. a blocked push.
test("flags the 08/03 state, where only the writer and the docs mentioned the tables", () => {
  const mentions = {
    steadyapi_property_neighborhood: [
      "ingest/pipelines/neighborhood_amenities/pipeline.py",
      "migrations/20260803_steadyapi_neighborhoods.sql",
      "ingest/cadence_registry.yaml",
      "docs/standards/data-roots.md",
      "_ASSISTANT/SCRATCHPAD.md",
    ],
  };
  assert.deepStrictEqual(orphanTables(["steadyapi_property_neighborhood"], mentions), [
    "steadyapi_property_neighborhood",
  ]);
});

// And the fix state: one real reader is enough to clear it.
test("clears a table once a product file reads it", () => {
  const mentions = {
    steadyapi_property_neighborhood: [
      "ingest/pipelines/neighborhood_amenities/pipeline.py",
      "lib/listings/neighborhood-amenities.ts",
    ],
  };
  assert.deepStrictEqual(orphanTables(["steadyapi_property_neighborhood"], mentions), []);
});

test("flags a table nothing mentions at all", () => {
  assert.deepStrictEqual(orphanTables(["ghost_table"], {}), ["ghost_table"]);
});

test("reports each orphan independently in a multi-table migration", () => {
  const mentions = { wired: ["lib/x.ts"], unwired: ["ingest/p.py"] };
  assert.deepStrictEqual(orphanTables(["wired", "unwired"], mentions), ["unwired"]);
});

test("is empty for no tables", () => {
  assert.deepStrictEqual(orphanTables([], {}), []);
});
