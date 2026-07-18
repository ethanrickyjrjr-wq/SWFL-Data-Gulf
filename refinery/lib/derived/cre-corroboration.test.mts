import { test } from "bun:test";
import assert from "node:assert/strict";
import { corroborate } from "./cre-corroboration.mts";
import type { CreFigureRow } from "./cre-figures.mts";

const base = {
  sector: "industrial",
  quarter: "2026-Q1",
  metric: "vacancy_rate",
  units: "percent",
  source_url: "u",
  source_verified: false,
  as_of: null,
  canonical_submarket: "North Fort Myers",
  fanned: false,
};

test("two firms within tolerance → corroborated, value = median of agreeing firms", () => {
  const rows: CreFigureRow[] = [
    { ...base, value: 2.8, source_firm: "cw_marketbeat" },
    { ...base, value: 3.4, source_firm: "mhs_databook" }, // spread 0.6 < 2.0 pts
  ];
  const [c] = corroborate(rows);
  assert.equal(c.tier, "corroborated");
  assert.equal(c.reported_value, 3.1);
  assert.deepEqual(c.contributing_firms.sort(), ["cw_marketbeat", "mhs_databook"]);
});

test("two firms over tolerance → flagged, never averaged (7-pt gap, in-scope cell)", () => {
  const rows: CreFigureRow[] = [
    { ...base, canonical_submarket: "Fort Myers", value: 2.4, source_firm: "cw_marketbeat" },
    {
      ...base,
      canonical_submarket: "Fort Myers",
      value: 9.4,
      source_firm: "mhs_databook",
      source_verified: true,
    },
  ];
  const [c] = corroborate(rows);
  assert.equal(c.tier, "flagged");
  assert.equal(c.spread, 7);
  assert.equal(c.reported_firm, "mhs_databook"); // prefer verified
  assert.equal(c.reported_value, 9.4);
});

test("one firm → single_source, spread null", () => {
  const [c] = corroborate([{ ...base, value: 9.01, source_firm: "lee_associates" }]);
  assert.equal(c.tier, "single_source");
  assert.equal(c.spread, null);
  assert.deepEqual(c.contributing_firms, ["lee_associates"]);
});

test("tolerance boundary: exactly 2.0 pts is corroborated (inclusive)", () => {
  const rows: CreFigureRow[] = [
    { ...base, value: 3.0, source_firm: "cw_marketbeat" },
    { ...base, value: 5.0, source_firm: "colliers_industrial" },
  ];
  assert.equal(corroborate(rows)[0].tier, "corroborated");
});

test("relative tolerance: full-service rent within 15% is corroborated, not blended", () => {
  const rows: CreFigureRow[] = [
    {
      ...base,
      metric: "asking_rent_full_service",
      units: "USD/sqft gross",
      value: 38.0,
      source_firm: "cw_marketbeat",
    },
    {
      ...base,
      metric: "asking_rent_full_service",
      units: "USD/sqft gross",
      value: 40.0,
      source_firm: "mhs_databook",
    }, // 2/39 ≈ 5%
  ];
  assert.equal(corroborate(rows)[0].tier, "corroborated");
});

test("a fanned contributor flags the cell (grain-mismatch marker, not a firm conflict)", () => {
  const rows: CreFigureRow[] = [
    {
      ...base,
      canonical_submarket: "Bonita Springs",
      value: 9.9,
      source_firm: "colliers_industrial",
      fanned: true,
    },
    {
      ...base,
      canonical_submarket: "Bonita Springs",
      value: 5.0,
      source_firm: "cw_marketbeat",
      fanned: false,
    },
  ];
  const [c] = corroborate(rows);
  assert.equal(c.has_fanned_contributor, true);
});

test("a cell with no fanned contributor is not flagged as such", () => {
  const rows: CreFigureRow[] = [
    { ...base, value: 2.8, source_firm: "cw_marketbeat" },
    { ...base, value: 3.4, source_firm: "mhs_databook" },
  ];
  assert.equal(corroborate(rows)[0].has_fanned_contributor, false);
});

test("sectors never blend: same submarket/quarter/metric, different sector → two cells", () => {
  const rows: CreFigureRow[] = [
    { ...base, sector: "industrial", value: 3.1, source_firm: "cw_marketbeat" },
    { ...base, sector: "office", value: 11.7, source_firm: "cw_marketbeat" },
  ];
  const out = corroborate(rows);
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((r) => r.sector).sort(), ["industrial", "office"]);
});
