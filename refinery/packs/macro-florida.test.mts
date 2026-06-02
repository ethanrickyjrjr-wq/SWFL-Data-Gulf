import { test } from "bun:test";
import assert from "node:assert/strict";
import type { RawFragment } from "../types/fragment.mts";
import { macroFlorida } from "./macro-florida.mts";

function cbpFrag(
  naics_code: string,
  naics_label: string,
  fl_establishments: number,
): RawFragment {
  return {
    fragment_id: `census_cbp_fl:${naics_code}-2022`,
    source_id: "census_cbp_fl",
    source_trust_tier: 1,
    fetched_at: "2026-06-02T00:00:00Z",
    raw: {},
    normalized: {
      kind: "fl-cbp-aggregate",
      naics_code,
      naics_label,
      fl_establishments,
      fl_employment: 0,
      fl_annual_payroll: 0,
      year: 2022,
    },
  } as unknown as RawFragment;
}

function indicatorFrag(): RawFragment {
  return {
    fragment_id: "fred_macro_florida:FLUR",
    source_id: "fred_macro_florida",
    source_trust_tier: 1,
    fetched_at: "2026-06-02T00:00:00Z",
    raw: {},
    normalized: {
      kind: "macro-indicator",
      series_id: "FLUR",
      label: "Florida Unemployment Rate",
      value: 4.8,
      unit: "percent",
      period: "2026-04-01",
      direction: "rising",
      context: "",
      source_url: "https://example.test/flur",
    },
  } as unknown as RawFragment;
}

test("CBP top-sectors fact excludes the total-all-sectors row and subsectors, and ranks tracked sectors by establishment count", () => {
  // Scrambled order on purpose: a correct fix must sort by count, not trust input order.
  const fragments: RawFragment[] = [
    indicatorFrag(),
    cbpFrag("44-45", "Retail Trade", 75_729),
    cbpFrag("00", "Total for all sectors", 631_745),
    cbpFrag("23", "Construction", 65_227),
    cbpFrag("54", "Professional, scientific, and technical services", 92_082),
    cbpFrag("72", "Accommodation and Food Services", 47_652),
    cbpFrag("541", "Professional, scientific, and technical services", 92_082),
    cbpFrag("62", "Health Care and Social Assistance", 71_553),
  ];

  const facts = macroFlorida.corpusSummary!(fragments);
  const snapshot = facts.find((f) => f.topic === "fl_cbp_sector_snapshot");
  assert.ok(snapshot, "expected an fl_cbp_sector_snapshot fact");
  const value = snapshot!.value;

  // Bug #1: the "00" total-all-sectors row must not appear.
  assert.ok(
    !value.includes("631,745") && !value.includes("Total for all sectors"),
    `top3 leaked the total-all-sectors row: ${value}`,
  );

  // Bug #2: "541" duplicates "54"; Professional (92,082) must appear exactly once.
  assert.equal(
    value.split("92,082").length - 1,
    1,
    `Professional (92,082) should appear exactly once: ${value}`,
  );

  // Correct top 3 BY COUNT among tracked sectors: Professional > Retail > Healthcare.
  assert.ok(value.includes("75,729"), `Retail missing from top3: ${value}`);
  assert.ok(value.includes("71,553"), `Healthcare missing from top3: ${value}`);
  // Construction (65,227) and Accommodation (47,652) are 4th/5th — excluded.
  assert.ok(
    !value.includes("65,227"),
    `Construction should not be in top3: ${value}`,
  );
  assert.ok(
    !value.includes("47,652"),
    `Accommodation should not be in top3: ${value}`,
  );

  // Ordering is by descending count.
  assert.ok(
    value.indexOf("92,082") < value.indexOf("75,729") &&
      value.indexOf("75,729") < value.indexOf("71,553"),
    `top3 not ordered by establishment count: ${value}`,
  );
});
