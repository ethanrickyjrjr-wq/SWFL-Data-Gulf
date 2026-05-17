import { test } from "node:test";
import assert from "node:assert/strict";

// Set fixture mode before any source import so env.source resolves correctly.
process.env["REFINERY_SOURCE"] = "fixture";

const { macroFloridaCbpSource } =
  await import("./macro-florida-cbp-source.mts");

test("fixture mode returns at least one fragment", async () => {
  const fragments = await macroFloridaCbpSource.fetch();
  assert.ok(fragments.length > 0);
});

test("every fragment has kind = fl-cbp-aggregate", async () => {
  const fragments = await macroFloridaCbpSource.fetch();
  for (const f of fragments) {
    const n = f.normalized as { kind: string };
    assert.equal(n.kind, "fl-cbp-aggregate");
  }
});

test("every fragment has required CBP fields with correct types", async () => {
  const fragments = await macroFloridaCbpSource.fetch();
  for (const f of fragments) {
    const n = f.normalized as Record<string, unknown>;
    assert.equal(typeof n["naics_code"], "string");
    assert.equal(typeof n["naics_label"], "string");
    assert.equal(typeof n["fl_establishments"], "number");
    assert.equal(typeof n["fl_employment"], "number");
    assert.equal(typeof n["fl_annual_payroll"], "number");
    assert.equal(typeof n["year"], "number");
  }
});

test("fragment_ids are unique", async () => {
  const fragments = await macroFloridaCbpSource.fetch();
  const ids = fragments.map((f) => f.fragment_id);
  assert.equal(new Set(ids).size, ids.length);
});

test("citationMeta returns source containing census_cbp", () => {
  const meta = macroFloridaCbpSource.citationMeta("2026-05-17", 86400);
  assert.ok(meta.source.includes("census_cbp"));
  assert.equal(typeof meta.verified, "string");
  assert.equal(typeof meta.expires, "string");
});
