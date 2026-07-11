import { test } from "bun:test";
import assert from "node:assert/strict";

// Set fixture mode before any source import so env.source resolves correctly.
process.env["REFINERY_SOURCE"] = "fixture";

const { leepaSoldMedianSource } = await import("./leepa-sold-median-source.mts");

test("fixture mode returns one summary fragment + one per ZIP row", async () => {
  const fragments = await leepaSoldMedianSource.fetch();
  const summaries = fragments.filter(
    (f) => (f.normalized as { kind: string }).kind === "leepa-sold-median-summary",
  );
  const zipRows = fragments.filter(
    (f) => (f.normalized as { kind: string }).kind === "leepa-sold-median-zip-row",
  );
  assert.equal(summaries.length, 1);
  assert.equal(zipRows.length, 3);
});

test("summary carries the homes-only county median + N", async () => {
  const fragments = await leepaSoldMedianSource.fetch();
  const summary = fragments
    .map((f) => f.normalized)
    .find((n) => (n as { kind: string }).kind === "leepa-sold-median-summary") as {
    county_median: number;
    county_n: number;
    as_of: string;
  };
  assert.equal(summary.county_median, 371298);
  assert.equal(summary.county_n, 55457);
  // as_of is a stated MM/DD-formattable ISO date, never a raw token.
  assert.match(summary.as_of, /^\d{4}-\d{2}-\d{2}$/);
});

test("33972 reads the homes band, not the $35k land-blend", async () => {
  const fragments = await leepaSoldMedianSource.fetch();
  const row = fragments
    .map((f) => f.normalized)
    .find(
      (n) =>
        (n as { kind: string }).kind === "leepa-sold-median-zip-row" &&
        (n as { zip: string }).zip === "33972",
    ) as { median_sale: number };
  assert.ok(row.median_sale > 200000, `expected homes band, got ${row.median_sale}`);
});

test("a county_fallback row carries median_sale === county_median", async () => {
  const fragments = await leepaSoldMedianSource.fetch();
  const normals = fragments.map((f) => f.normalized);
  const summary = normals.find(
    (n) => (n as { kind: string }).kind === "leepa-sold-median-summary",
  ) as { county_median: number };
  const fallback = normals.find(
    (n) =>
      (n as { kind: string }).kind === "leepa-sold-median-zip-row" &&
      (n as { county_fallback: boolean }).county_fallback === true,
  ) as { median_sale: number; zip: string };
  assert.ok(fallback, "expected at least one county_fallback row in the fixture");
  assert.equal(fallback.median_sale, summary.county_median);
});

test("fragment_ids are unique", async () => {
  const fragments = await leepaSoldMedianSource.fetch();
  const ids = fragments.map((f) => f.fragment_id);
  assert.equal(new Set(ids).size, ids.length);
});

test("citationMeta names Lee County Property Appraiser and leaks no placeholder tokens", () => {
  const meta = leepaSoldMedianSource.citationMeta("2026-07-11", 86400);
  assert.ok(meta.source.includes("Lee County Property Appraiser"));
  assert.ok(!meta.source.includes("[config]"));
  assert.ok(!meta.source.includes("§"));
  assert.equal(typeof meta.verified, "string");
  assert.equal(typeof meta.expires, "string");
});
