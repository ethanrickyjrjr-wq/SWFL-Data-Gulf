import { test } from "node:test";
import assert from "node:assert/strict";

// Force fixture mode BEFORE importing — env.mts reads process.env at module init.
process.env["REFINERY_SOURCE"] = "fixture";

const { stormHistorySource, parseDamageString, parseNoaaDate } =
  await import("./storm-history-source.mts");

test("parseDamageString handles K/M/B suffixes, plain numbers, and unparseable input", () => {
  assert.equal(parseDamageString("0"), 0);
  assert.equal(parseDamageString("10K"), 10_000);
  assert.equal(parseDamageString("1.5M"), 1_500_000);
  assert.equal(parseDamageString("2B"), 2_000_000_000);
  assert.equal(parseDamageString("112B"), 112_000_000_000);
  assert.equal(parseDamageString("500"), 500);
  assert.equal(parseDamageString("  10K  "), 10_000);
  assert.equal(parseDamageString(""), null);
  assert.equal(parseDamageString(null), null);
  assert.equal(parseDamageString("???"), null);
});

test("parseNoaaDate handles DD-MON-YY and MM/DD/YYYY", () => {
  assert.equal(parseNoaaDate("28-SEP-22 16:35:00"), "2022-09-28");
  assert.equal(parseNoaaDate("01-JAN-96 00:00:00"), "1996-01-01");
  assert.equal(parseNoaaDate("09/28/2022 16:35:00"), "2022-09-28");
  assert.equal(parseNoaaDate(""), null);
  assert.equal(parseNoaaDate(null), null);
});

test("fixture mode returns one fragment per SWFL county + one corpus fragment", async () => {
  const fragments = await stormHistorySource.fetch();
  const perCounty = fragments.filter(
    (f) => (f.normalized as { kind: string }).kind === "storm-per-county",
  );
  const corpus = fragments.filter(
    (f) => (f.normalized as { kind: string }).kind === "storm-corpus-summary",
  );
  assert.equal(perCounty.length, 3, "expected one fragment per SWFL county");
  assert.equal(
    corpus.length,
    1,
    "expected exactly one corpus-summary fragment",
  );
});

test("per-county fragments cover LEE, COLLIER, CHARLOTTE with non-zero counts and numeric (not BigInt) fields", async () => {
  const fragments = await stormHistorySource.fetch();
  const perCounty = fragments
    .map((f) => f.normalized as Record<string, unknown>)
    .filter((n) => n["kind"] === "storm-per-county");

  const counties = perCounty.map((n) => n["county"] as string).sort();
  assert.deepEqual(counties, ["CHARLOTTE", "COLLIER", "LEE"]);

  for (const n of perCounty) {
    assert.equal(typeof n["county"], "string");
    assert.equal(typeof n["total_storm_count"], "number");
    assert.equal(typeof n["property_damage_event_count"], "number");
    assert.equal(typeof n["extreme_wind_event_count"], "number");
    assert.equal(typeof n["major_storm_count"], "number");
    // Each county has >= 1 event in the 2022-2024 fixture window.
    assert.ok(
      (n["total_storm_count"] as number) > 0,
      `expected non-zero total_storm_count for ${n["county"]}`,
    );
  }
});

test("corpus fragment populates required fields and covers all 3 SWFL counties", async () => {
  const fragments = await stormHistorySource.fetch();
  const corpus = fragments.find(
    (f) => (f.normalized as { kind: string }).kind === "storm-corpus-summary",
  );
  assert.ok(corpus, "expected a corpus-summary fragment");
  const n = corpus!.normalized as Record<string, unknown>;
  // Fixture (2022-2024) intentionally does NOT contain a billion-dollar event —
  // Hurricane Ian is in the LIVE Parquet only. Fixture validates the field is
  // null + correctly typed; live validation runs at refinery-render time.
  assert.ok(
    n["last_billion_dollar_event_date"] === null ||
      typeof n["last_billion_dollar_event_date"] === "string",
  );
  assert.deepEqual(n["counties_covered"], ["CHARLOTTE", "COLLIER", "LEE"]);
  assert.equal(typeof n["total_storm_count"], "number");
  assert.ok((n["total_storm_count"] as number) > 0);
  assert.equal(typeof n["vintage_start_year"], "number");
  assert.equal(typeof n["vintage_end_year"], "number");
  assert.equal(typeof n["unparseable_damage_count"], "number");
  assert.equal(typeof n["major_event_type_counts"], "object");
});

test("fragment_ids are unique", async () => {
  const fragments = await stormHistorySource.fetch();
  const ids = fragments.map((f) => f.fragment_id);
  assert.equal(new Set(ids).size, ids.length);
});

test("citationMeta points at NOAA / data_lake._tier1_inventory in either mode", () => {
  const meta = stormHistorySource.citationMeta("2026-05-19", 31536000);
  assert.match(meta.source, /NOAA Storm Events/);
  assert.equal(typeof meta.verified, "string");
  assert.equal(typeof meta.expires, "string");
});
