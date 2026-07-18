import { test } from "bun:test";
import assert from "node:assert/strict";
import {
  canonicalSubmarkets,
  countyForSubmarket,
  CANONICAL_SUBMARKETS,
} from "./cre-submarket-crosswalk.mts";
import { isCoreCounty } from "./core-scope.mts";

test("exact fine-grain match resolves to itself (single canonical)", () => {
  assert.deepEqual(canonicalSubmarkets("cw_marketbeat", "Cape Coral"), ["Cape Coral"]);
  assert.deepEqual(canonicalSubmarkets("mhs_databook", "Naples"), ["Naples"]);
});

test("Lee 'Fort Myers' resolves (Lee reports one whole-city submarket)", () => {
  assert.deepEqual(canonicalSubmarkets("lee_associates", "Fort Myers"), ["Fort Myers"]);
});

test("Colliers composite fans OUT to its constituents (Bonita and Estero are different)", () => {
  // Colliers lumps Bonita/Estero; C&W + MHS report them separately, so the composite
  // splits onto both canonical submarkets — corroboration compares like-for-like.
  assert.deepEqual(canonicalSubmarkets("colliers_industrial", "Bonita/Estero"), [
    "Bonita Springs",
    "Estero",
  ]);
  assert.deepEqual(canonicalSubmarkets("colliers_industrial", "Cape Coral/N. Fort Myers"), [
    "Cape Coral",
    "North Fort Myers",
  ]);
});

test("firm name variants normalize to the canonical fine name", () => {
  // Colliers/MHS say "Lehigh"; C&W industrial says "Lehigh Acres" — same submarket.
  assert.deepEqual(canonicalSubmarkets("colliers_industrial", "Lehigh"), ["Lehigh Acres"]);
  // MHS ships a raw slug for San Carlos Park.
  assert.deepEqual(canonicalSubmarkets("mhs_databook", "sfm-san-carlos"), ["San Carlos Park"]);
});

test("C&W's split-out Fort Myers submarkets stay distinct (not collapsed to Fort Myers)", () => {
  assert.deepEqual(canonicalSubmarkets("cw_marketbeat", "City of Fort Myers"), [
    "City of Fort Myers",
  ]);
  assert.deepEqual(canonicalSubmarkets("cw_marketbeat", "South Fort Myers"), ["South Fort Myers"]);
});

test("OUT-OF-SCOPE: Charlotte County + Punta Gorda resolve to [] — never enter the layer", () => {
  assert.deepEqual(canonicalSubmarkets("colliers_industrial", "Charlotte County"), []);
  assert.deepEqual(canonicalSubmarkets("cw_marketbeat", "Punta Gorda"), []);
  assert.ok(!CANONICAL_SUBMARKETS.includes("Charlotte County"));
  assert.ok(!CANONICAL_SUBMARKETS.includes("Punta Gorda"));
});

test("in-core but unmapped submarket is KEPT as single-source, never dropped (operator 07/18)", () => {
  // Sanibel is a real Lee place the broker feeds don't currently name; a sourced figure
  // there must still enter (single-source), not vanish. Only out-of-core is dropped.
  assert.deepEqual(canonicalSubmarkets("cw_marketbeat", "Sanibel"), ["Sanibel"]);
});

test("a genuinely non-SWFL label resolves to [] (no force-fit, no leak)", () => {
  assert.deepEqual(canonicalSubmarkets("cw_marketbeat", "Atlanta"), []);
});

test("countyForSubmarket returns the COUNTY, not the place name", () => {
  assert.equal(countyForSubmarket("Fort Myers"), "Lee");
  assert.equal(countyForSubmarket("Naples"), "Collier");
  assert.equal(countyForSubmarket("South Fort Myers"), "Lee");
  assert.equal(countyForSubmarket("Charlotte County"), "Charlotte County"); // county-meta passthrough
  assert.ok(!isCoreCounty(countyForSubmarket("Charlotte County")));
});

test("every canonical submarket resolves to a CORE county (Lee/Collier)", () => {
  for (const c of CANONICAL_SUBMARKETS) {
    assert.ok(isCoreCounty(countyForSubmarket(c)), `canonical '${c}' is not in Lee/Collier`);
  }
});
