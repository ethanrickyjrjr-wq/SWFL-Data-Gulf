import { test } from "bun:test";
import assert from "node:assert/strict";

process.env["REFINERY_SOURCE"] = "fixture";

const { fdicDepositsSource, countyDeposits } = await import("./fdic-deposits-source.mts");
type Summary = import("./fdic-deposits-source.mts").FdicDepositsSwflSummary;

test("fixture mode returns exactly one summary fragment of the right kind", async () => {
  const fragments = await fdicDepositsSource.fetch();
  assert.equal(fragments.length, 1);
  assert.equal((fragments[0].normalized as { kind: string }).kind, "fdic-deposits-swfl-summary");
});

test("deposits are served in whole USD with YoY against the prior year", async () => {
  const [f] = await fdicDepositsSource.fetch();
  const s = f.normalized as Summary;
  assert.equal(s.lee?.year, 2026);
  assert.equal(s.lee?.deposits_usd, 21_115_545_000);
  // (21,115,545 - 22,291,867) / 22,291,867 = -5.28%
  assert.equal(s.lee?.deposits_yoy_pct, -5.28);
  assert.equal(s.lee?.partial_year, null);
});

test("a thin newest year is skipped and named, the prior complete year is served", async () => {
  const [f] = await fdicDepositsSource.fetch();
  const s = f.normalized as Summary;
  assert.equal(s.hendry?.year, 2025);
  assert.equal(s.hendry?.partial_year, 2026);
  assert.equal(s.hendry?.deposits_yoy_pct, 4);
});

test("a county with no rows is null, never an invented zero", () => {
  assert.equal(countyDeposits([], "12071"), null);
});

test("a single year has no YoY and no partial year", () => {
  const d = countyDeposits(
    [{ county_fips: "12071", year: 2026, branches: 5, banks: 2, deposits_thousands_usd: 100 }],
    "12071",
  );
  assert.equal(d?.year, 2026);
  assert.equal(d?.deposits_yoy_pct, null);
  assert.equal(d?.partial_year, null);
});
