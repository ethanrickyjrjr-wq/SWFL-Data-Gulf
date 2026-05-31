import { test } from "bun:test";
import assert from "node:assert/strict";
import {
  readRegistry,
  resolveAll,
  type ParsedRegistry,
} from "../../scripts/gen-coverage-registry.mts";
import { REGISTRY_ENTRIES } from "./_registry.generated";
import { SUPPLEMENT } from "./_coverage";

const registry: ParsedRegistry = readRegistry();
const activeNames = (registry.pipelines ?? []).map((p) => p.name);
const parkedNames = (registry.not_yet_running ?? []).map((p) => p.name);
const allNames = new Set([...activeNames, ...parkedNames]);

test("generated snapshot is current (run `npm run gen:coverage` if this fails)", () => {
  // Semantic compare (not byte-exact) so the auto-formatter can't cause a false
  // failure — but any real registry change still trips this.
  assert.deepEqual(REGISTRY_ENTRIES, resolveAll(registry));
});

test("every ACTIVE pipeline has a /data-coverage supplement entry", () => {
  const missing = activeNames.filter((n) => SUPPLEMENT[n] === undefined);
  assert.deepEqual(
    missing,
    [],
    `Active in cadence_registry but absent from app/data-coverage/_coverage.ts: ${missing.join(", ")}`,
  );
});

test("not_yet_running pipelines are exempt (no supplement required)", () => {
  // Nothing to assert beyond documenting the rule: parked pipelines MAY have a
  // supplement entry (bls_oews, fdle do) but are not required to.
  assert.ok(parkedNames.length >= 0);
});

test("no supplement entry points at a pipeline the registry doesn't have", () => {
  const orphans = Object.keys(SUPPLEMENT).filter((n) => !allNames.has(n));
  assert.deepEqual(
    orphans,
    [],
    `Supplement keys with no registry entry (typo/rename?): ${orphans.join(", ")}`,
  );
});

test("every tier-2 snapshot entry resolves to a schema.table", () => {
  const unresolved = REGISTRY_ENTRIES.filter(
    (e) => e.lane === "tier-2" && (!e.schema || !e.table),
  ).map((e) => e.name);
  assert.deepEqual(
    unresolved,
    [],
    `tier-2 entries with no resolved table: ${unresolved.join(", ")}`,
  );
});

test("the 26 active pipelines are all present (guards accidental list shrink)", () => {
  assert.equal(activeNames.length, 26);
});
