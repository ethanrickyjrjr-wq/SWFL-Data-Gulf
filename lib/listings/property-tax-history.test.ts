// lib/listings/property-tax-history.test.ts
//
// Every test is NAMED FOR THE FAILURE MODE it prevents.
// Source reality measured live 08/04/2026 on data_lake.steadyapi_tax_history_v:
// 273,051 year-rows · 16,514 properties · 2007-2025 · avg 16.5 years per property.
// VALUE SPARSITY: assessment_total 99.99% but assessment_building 22.0% / land 19.0%;
// market_value_total 99.9%, building 77.7%, land 67.3%.

import { describe, expect, test } from "bun:test";
import {
  TAX_AMOUNT_NOT_CLEARED_FOR_SERVING,
  summarizeTaxHistory,
  taxTrend,
  type TaxHistoryRow,
} from "./property-tax-history";

function yr(over: Partial<TaxHistoryRow> = {}): TaxHistoryRow {
  return {
    property_id: "5200800427",
    tax_year: 2025,
    tax_amount: 5045,
    assessment_total: 542439,
    assessment_building: null,
    assessment_land: null,
    market_value_total: 728800,
    market_value_building: 393825,
    market_value_land: 334975,
    ...over,
  };
}

describe("SPARSITY — key presence is not value presence (building 22%, land 19%)", () => {
  test("an absent split is NULL in the output, never rendered as $0", () => {
    // The failure: 'Land value: $0' on a home whose land value the vendor simply
    // did not send. 81% of assessment_land is absent.
    const out = summarizeTaxHistory([yr({ assessment_land: null, assessment_building: null })]);
    expect(out.years[0].assessmentLand).toBeNull();
    expect(out.years[0].assessmentBuilding).toBeNull();
    expect(JSON.stringify(out)).not.toContain('"assessmentLand":0');
  });

  test("a real ZERO is kept — 4 rows genuinely carry tax_amount 0 on $100 parcels", () => {
    // Zero is a figure, not a sentinel. Collapsing it to null would delete a fact.
    const out = summarizeTaxHistory([yr({ tax_amount: 0, assessment_total: 103 })]);
    expect(out.years[0].taxAmount).toBe(0);
  });
});

describe("SERVING GATE — tax_amount is not cleared for user-facing use", () => {
  test("the summary carries the not-yet-validated caveat, in words", () => {
    // The playbook requires validation against a real county tax bill before this
    // number reaches a reader, and that a vendor annual tax figure is not the bill.
    const out = summarizeTaxHistory([yr()]);
    expect(out.taxAmountCaveat).toBe(TAX_AMOUNT_NOT_CLEARED_FOR_SERVING);
    expect(out.taxAmountCaveat.toLowerCase()).toContain("not the county");
  });
});

describe("SCOPE LAW — listing-scoped, never a county statistic", () => {
  test("the summary says this is one property, so no caller can serve it as area-wide", () => {
    const out = summarizeTaxHistory([yr()]);
    expect(out.scopeNote.toLowerCase()).toContain("this property");
  });
});

describe("ORDER + TREND", () => {
  test("years come back newest first", () => {
    const out = summarizeTaxHistory([
      yr({ tax_year: 2023 }),
      yr({ tax_year: 2025 }),
      yr({ tax_year: 2024 }),
    ]);
    expect(out.years.map((y) => y.year)).toEqual([2025, 2024, 2023]);
  });

  test("trend needs TWO real figures — one year alone is not a direction", () => {
    expect(taxTrend([yr({ tax_year: 2025, tax_amount: 5045 })])).toBeNull();
  });

  test("trend reads rising/falling/flat off the real endpoints", () => {
    const rows = [
      yr({ tax_year: 2023, tax_amount: 4887 }),
      yr({ tax_year: 2025, tax_amount: 5045 }),
    ];
    const t = taxTrend(rows);
    expect(t!.direction).toBe("rising");
    expect(t!.fromYear).toBe(2023);
    expect(t!.toYear).toBe(2025);
    expect(t!.from).toBe(4887);
    expect(t!.to).toBe(5045);
  });

  test("a year with a NULL tax amount cannot anchor a trend", () => {
    // 1 row in the source has tax_amount JSON null. Using it as an endpoint would
    // compute a change against nothing.
    const t = taxTrend([
      yr({ tax_year: 2012, tax_amount: null }),
      yr({ tax_year: 2025, tax_amount: 5045 }),
    ]);
    expect(t).toBeNull();
  });
});

describe("EMPTY", () => {
  test("empty in, empty out — never throws, never invents", () => {
    const out = summarizeTaxHistory([]);
    expect(out.years).toEqual([]);
    expect(out.yearCount).toBe(0);
    expect(out.trend).toBeNull();
  });
});
