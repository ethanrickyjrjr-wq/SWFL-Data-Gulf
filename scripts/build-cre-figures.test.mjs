import { test } from "bun:test";
import assert from "node:assert/strict";
import { buildFigures } from "./build-cre-figures.mjs";

const CITE = "https://www.swfldatagulf.com/r/source/marketbeat_swfl?source=SWFL+Data+Gulf";

function row(over) {
  return {
    source_name: "cw_marketbeat",
    sector: "industrial",
    submarket: "North Fort Myers",
    quarter: "2026-Q1",
    vacancy_rate: null,
    asking_rent_nnn: null,
    asking_rent_full_service: null,
    absorption_sqft: null,
    cap_rate: null,
    sale_price_psf: null,
    source_url: null,
    verified: false,
    ...over,
  };
}

test("buildFigures: Cushman (no firm url) enters cited to SWFL Data Gulf; out-of-core dropped", () => {
  const rows = [
    row({ source_name: "cw_marketbeat", vacancy_rate: 2.8, verified: true }),
    row({
      source_name: "mhs_databook",
      vacancy_rate: 3.4,
      source_url: "https://mhs-re.com/x",
      verified: true,
    }),
    row({ source_name: "colliers_industrial", submarket: "Charlotte County", vacancy_rate: 9.9 }), // out-of-core
    row({
      source_name: "lee_associates",
      submarket: "Fort Myers",
      cap_rate: 8.36,
      source_url: "https://lee/x.pdf",
    }),
  ];
  const { figures, confidence } = buildFigures(rows, CITE);

  // Cushman is in, cited to the SWFL Data Gulf citation (no firm URL in the raw table).
  const cw = figures.find((f) => f.source_firm === "cw_marketbeat");
  assert.ok(cw, "Cushman must enter");
  assert.equal(cw.source_url, CITE);
  // Lee keeps its own firm URL.
  assert.equal(
    figures.find((f) => f.source_firm === "lee_associates").source_url,
    "https://lee/x.pdf",
  );
  // Charlotte County never enters.
  assert.ok(!figures.some((f) => f.canonical_submarket === "Charlotte County"));

  // Cushman + MHS agree on North Fort Myers vacancy → corroborated.
  const cell = confidence.find(
    (c) => c.canonical_submarket === "North Fort Myers" && c.metric === "vacancy_rate",
  );
  assert.equal(cell.tier, "corroborated");
  assert.deepEqual(cell.contributing_firms.sort(), ["cw_marketbeat", "mhs_databook"]);

  // Lee's cap rate is single-source (only Lee reports cap_rate).
  const cap = confidence.find((c) => c.metric === "cap_rate");
  assert.equal(cap.tier, "single_source");
  assert.equal(cap.reported_value, 8.36);
});
