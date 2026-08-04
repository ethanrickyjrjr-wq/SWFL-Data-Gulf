// Gate 14 rules — tested against the REAL 08/03-vs-08/04 collision they would have blocked.
//
// RUNNER: node:test, NOT bun:test — same reason as table-consumer.test.mjs: `bun test`
// does not discover dot-dirs, so ci.yml's `node --test .claude/hooks/lib/*.test.mjs` is
// the only runner that reaches this file, and node's ESM loader rejects `bun:` outright.
// A bun:test file here is a test no runner runs — the same class of failure as the gate.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  derivationKeys,
  objectsCreatedInSql,
  findDerivationCollisions,
} from "./duplicate-root.mjs";

// ── the two real artifacts, reduced to the parts the rules read ────────────────
const EVENTS_VIEW_0804 = `
create or replace view data_lake.steadyapi_listing_events_v as
select r.property_id, e.obj->>'event_name' as event_name
from data_lake.steadyapi_property_history_raw r
cross join lateral jsonb_array_elements(
  coalesce(r.body->'body'->'property_history', '[]'::jsonb)
) with ordinality as e(obj, ord);
`;

const EVENTS_PARSER_0803 = `
_RAW_TABLE = "data_lake.steadyapi_property_history_raw"
_EVENTS_TABLE = "data_lake.steadyapi_listing_events"
PARSE_SQL = f"""
    INSERT INTO {_EVENTS_TABLE} (property_id, event_name)
    SELECT r.property_id, e.obj->>'event_name'
    FROM {_RAW_TABLE} r
    CROSS JOIN LATERAL jsonb_array_elements(r.body->'body'->'property_history') AS e(obj)
"""
`;

const TAX_PARSER_0803 = `
_RAW_TABLE = "data_lake.steadyapi_property_history_raw"
_TAX_TABLE = "data_lake.steadyapi_tax_history"
PARSE_SQL = f"""
    INSERT INTO {_TAX_TABLE} SELECT * FROM {_RAW_TABLE} r,
    jsonb_array_elements(r.body->'body'->'tax_history') AS e(obj)
"""
`;

const INDEX = [
  {
    artifact: "ingest/pipelines/listing_lifecycle/parse_listing_events.py",
    text: EVENTS_PARSER_0803,
  },
  { artifact: "ingest/pipelines/listing_lifecycle/parse_tax_history.py", text: TAX_PARSER_0803 },
];

// ── objectsCreatedInSql — VIEWS count, not just tables (Gate 12 only saw tables) ──

test("objectsCreatedInSql: finds a created-or-replaced VIEW", () => {
  assert.deepEqual(objectsCreatedInSql(EVENTS_VIEW_0804), ["steadyapi_listing_events_v"]);
});

test("objectsCreatedInSql: finds a created TABLE", () => {
  assert.deepEqual(
    objectsCreatedInSql(`create table if not exists data_lake.steadyapi_listing_events (id int);`),
    ["steadyapi_listing_events"],
  );
});

test("objectsCreatedInSql: a relation merely READ is not a relation created", () => {
  assert.deepEqual(
    objectsCreatedInSql(`select * from data_lake.steadyapi_property_history_raw;`),
    [],
  );
});

// ── derivationKeys — the source relation AND the array inside it ──────────────
// Source relation alone is NOT enough: events, tax and permits all legitimately read
// steadyapi_property_history_raw. What distinguishes them is which array they parse.

test("derivationKeys: keys the raw table together with the json array it parses", () => {
  assert.ok(
    derivationKeys(EVENTS_VIEW_0804).includes("steadyapi_property_history_raw::property_history"),
  );
});

test("derivationKeys: reads the same key out of a PYTHON parser's SQL string", () => {
  // The 08/03 table's migration creates an EMPTY table — the source link lives ONLY in the
  // parser. A repo scan reading .sql alone would have found nothing to collide with.
  assert.ok(
    derivationKeys(EVENTS_PARSER_0803).includes("steadyapi_property_history_raw::property_history"),
  );
});

test("derivationKeys: the object being CREATED is never treated as its own source", () => {
  assert.ok(
    !derivationKeys(EVENTS_VIEW_0804).includes("steadyapi_listing_events_v::property_history"),
  );
});

// ── findDerivationCollisions — the actual 08/04 duplicate ─────────────────────

test("findDerivationCollisions: BLOCKS a new view parsing an array an existing artifact already parses", () => {
  const hits = findDerivationCollisions(
    { artifact: "docs/sql/20260804_steadyapi_listing_events_v.sql", text: EVENTS_VIEW_0804 },
    INDEX,
  );
  assert.equal(hits.length, 1);
  assert.equal(hits[0].key, "steadyapi_property_history_raw::property_history");
  assert.ok(hits[0].existingArtifact.includes("parse_listing_events.py"));
  assert.equal(hits[0].newObject, "steadyapi_listing_events_v");
});

test("findDerivationCollisions: ALLOWS a different array off the SAME raw table", () => {
  // The false positive that would get this gate disabled inside a week. Three families
  // reading one raw table is the DESIGN, not a duplicate.
  const permitsView = `
    create or replace view data_lake.steadyapi_property_permits_v as
    select r.property_id from data_lake.steadyapi_property_history_raw r
    cross join lateral jsonb_array_elements(r.body->'body'->'building_permits') as e(obj);`;
  assert.equal(
    findDerivationCollisions(
      { artifact: "docs/sql/20260804_steadyapi_property_permits_v.sql", text: permitsView },
      INDEX,
    ).length,
    0,
  );
});

test("findDerivationCollisions: an artifact never collides with ITSELF on a re-push", () => {
  const self = {
    artifact: "docs/sql/20260804_steadyapi_listing_events_v.sql",
    text: EVENTS_VIEW_0804,
  };
  assert.equal(findDerivationCollisions(self, [self]).length, 0);
});

test("findDerivationCollisions: no source relation yields no collision rather than a crash", () => {
  assert.equal(
    findDerivationCollisions(
      { artifact: "docs/sql/x.sql", text: "create view data_lake.foo_v as select 1;" },
      INDEX,
    ).length,
    0,
  );
});

test("findDerivationCollisions: a file that creates NOTHING is not a candidate", () => {
  assert.equal(
    findDerivationCollisions(
      {
        artifact: "docs/sql/probe.sql",
        text: "select * from data_lake.steadyapi_property_history_raw r, jsonb_array_elements(r.body->'body'->'property_history');",
      },
      INDEX,
    ).length,
    0,
  );
});
