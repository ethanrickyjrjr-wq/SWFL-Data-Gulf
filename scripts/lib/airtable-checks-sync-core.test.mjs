// scripts/lib/airtable-checks-sync-core.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BATCH_SIZE,
  chunk,
  toAirtableFields,
  buildUpsertBody,
  buildDeleteUrl,
} from "./airtable-checks-sync-core.mjs";

test("BATCH_SIZE is 10", () => {
  assert.equal(BATCH_SIZE, 10);
});

test("chunk splits into groups of at most `size`", () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});

test("chunk returns [] for an empty array", () => {
  assert.deepEqual(chunk([], 10), []);
});

test("chunk returns one group when items fit in one batch", () => {
  assert.deepEqual(chunk([1, 2, 3], 10), [[1, 2, 3]]);
});

test("toAirtableFields picks the mirrored columns and drops null/undefined", () => {
  const row = {
    check_key: "surface_parent_links",
    project: "brain-platform",
    label: "Wire corridor links",
    detail: null,
    priority: 0,
    due_at: undefined,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-05T00:00:00Z",
    id: "should-not-appear",
    state: "should-not-appear",
  };
  assert.deepEqual(toAirtableFields(row), {
    check_key: "surface_parent_links",
    project: "brain-platform",
    label: "Wire corridor links",
    priority: 0,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-05T00:00:00Z",
  });
});

test("buildUpsertBody wraps rows with performUpsert on check_key and typecast", () => {
  const body = buildUpsertBody([
    { check_key: "a", label: "A" },
    { check_key: "b", label: "B" },
  ]);
  assert.deepEqual(body.performUpsert, { fieldsToMergeOn: ["check_key"] });
  assert.equal(body.typecast, true);
  assert.deepEqual(body.records, [
    { fields: { check_key: "a", label: "A" } },
    { fields: { check_key: "b", label: "B" } },
  ]);
});

test("buildDeleteUrl builds a records[]= query string, URL-encoding ids", () => {
  const url = buildDeleteUrl({ baseId: "appXXX", tableId: "tblYYY" }, ["rec1", "rec 2"]);
  assert.equal(url, "https://api.airtable.com/v0/appXXX/tblYYY?records[]=rec1&records[]=rec%202");
});
