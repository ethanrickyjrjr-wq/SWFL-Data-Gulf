import { test } from "bun:test";
import assert from "node:assert/strict";
import { normalizeMarketbeat, type MarketbeatRow } from "./cre-figures.mts";

const CITE = "https://www.swfldatagulf.com/r/source/marketbeat_swfl?source=SWFL+Data+Gulf";

const lee: MarketbeatRow = {
  source_name: "lee_associates",
  sector: "industrial",
  submarket: "Fort Myers",
  quarter: "2026-Q1",
  vacancy_rate: 9.01,
  asking_rent_nnn: 12.2,
  asking_rent_full_service: null,
  absorption_sqft: null,
  cap_rate: 8.36,
  sale_price_psf: 146,
  source_url: "https://www.lee-associates.com/x.pdf",
  verified: false,
};

// Cushman carries NO firm source_url in the live table (173 rows, 0 URLs, 113 verified).
const cw: MarketbeatRow = {
  source_name: "cw_marketbeat",
  sector: "industrial",
  submarket: "North Fort Myers",
  quarter: "2026-Q1",
  vacancy_rate: 2.8,
  asking_rent_nnn: 11.0,
  asking_rent_full_service: null,
  absorption_sqft: 1000,
  cap_rate: null,
  sale_price_psf: null,
  source_url: null,
  verified: true,
};

test("Cushman row with NO firm URL still enters, cited to SWFL Data Gulf (operator 07/18)", () => {
  const out = normalizeMarketbeat([cw], CITE);
  assert.ok(out.length > 0, "Cushman must not be dropped for lack of a firm URL");
  assert.ok(
    out.every((r) => r.source_url === CITE),
    "url falls back to the SWFL Data Gulf citation",
  );
  assert.ok(out.every((r) => r.source_firm === "cw_marketbeat"));
  assert.ok(out.every((r) => r.canonical_submarket === "North Fort Myers"));
});

test("Lee row keeps its own firm PDF URL and emits one row per populated metric", () => {
  const out = normalizeMarketbeat([lee], CITE);
  const metrics = out.map((r) => r.metric).sort();
  assert.deepEqual(metrics, ["asking_rent_nnn", "cap_rate", "sale_price_psf", "vacancy_rate"]);
  assert.ok(out.every((r) => r.source_url === "https://www.lee-associates.com/x.pdf"));
  const cap = out.find((r) => r.metric === "cap_rate");
  assert.equal(cap!.value, 8.36);
  assert.equal(cap!.canonical_submarket, "Fort Myers");
  assert.equal(cap!.as_of, "2026-03-31"); // quarter-end
});

test("Colliers composite fans OUT — same value lands on BOTH constituents", () => {
  const composite: MarketbeatRow = {
    source_name: "colliers_industrial",
    sector: "industrial",
    submarket: "Bonita/Estero",
    quarter: "2025-Q4",
    vacancy_rate: 9.9,
    asking_rent_nnn: 12.0,
    asking_rent_full_service: null,
    absorption_sqft: -1000,
    cap_rate: null,
    sale_price_psf: null,
    source_url: null,
    verified: false,
  };
  const out = normalizeMarketbeat([composite], CITE);
  const submarkets = [...new Set(out.map((r) => r.canonical_submarket))].sort();
  assert.deepEqual(submarkets, ["Bonita Springs", "Estero"]);
  const bonitaVac = out.find(
    (r) => r.canonical_submarket === "Bonita Springs" && r.metric === "vacancy_rate",
  );
  const esteroVac = out.find(
    (r) => r.canonical_submarket === "Estero" && r.metric === "vacancy_rate",
  );
  assert.equal(bonitaVac!.value, 9.9);
  assert.equal(esteroVac!.value, 9.9);
  assert.ok(
    out.every((r) => r.fanned === true),
    "fanned rows must be marked",
  );
});

test("a non-fanned (exact) row is NOT marked fanned", () => {
  assert.ok(normalizeMarketbeat([lee], CITE).every((r) => r.fanned === false));
});

test("medical_office rent is read from asking_rent_full_service (NOT asking_rent_nnn)", () => {
  const medical: MarketbeatRow = {
    source_name: "cw_marketbeat",
    sector: "medical_office",
    submarket: "Naples",
    quarter: "2026-Q1",
    vacancy_rate: 6.1,
    asking_rent_nnn: null,
    asking_rent_full_service: 38.46,
    absorption_sqft: -12000,
    cap_rate: null,
    sale_price_psf: null,
    source_url: null,
    verified: true,
  };
  const out = normalizeMarketbeat([medical], CITE);
  const rent = out.find((r) => r.metric === "asking_rent_full_service");
  assert.ok(rent, "medical_office rent must surface as asking_rent_full_service");
  assert.equal(rent!.value, 38.46);
  assert.ok(!out.some((r) => r.metric === "asking_rent_nnn"), "no NNN rent for medical_office");
});

test("SCOPE: an out-of-core Charlotte County row is dropped even though it would get a citation", () => {
  const charlotte: MarketbeatRow = { ...cw, submarket: "Charlotte County", vacancy_rate: 16.9 };
  assert.equal(normalizeMarketbeat([charlotte], CITE).length, 0);
});
