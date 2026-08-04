// lib/listings/property-tax-history.ts
//
// PER-PROPERTY TAX + VALUATION HISTORY — consumer of `data_lake.steadyapi_tax_history_v`.
// View: docs/sql/20260804_steadyapi_tax_history_v.sql
// Playbook: docs/superpowers/plans/2026-08-02-steadyapi-raw-landing-playbook.md STEP 3, family B.
//
// 273,051 year-rows across 16,514 properties, 2007-2025, averaging 16.5 years of history
// each — all of it parsed from vendor bodies we already bought. Zero paid calls.
//
// ── WHAT THIS IS NOT ─────────────────────────────────────────────────────────
// NOT the valuation authority for either county. Full-book assessed/market value stays
// `leepa_parcels` (Lee) and `collier_parcels` (Collier — that IS the FDOR pull, so Collier
// is already covered; the earlier "covers Collier where LEEPA doesn't" shorthand was wrong).
// This is LISTING-SCOPED — a row exists only for a property we probed because it was listed
// or sold — so it is per-property depth and cross-source validation, never an area figure.
//
// ── THE SPARSITY TRAP (measured, not assumed) ────────────────────────────────
// Every key exists on every source row, but the VALUES are uneven:
//   assessment_total 99.99% · assessment_building 22.0% · assessment_land 19.0%
//   market_value_total 99.9% · market_value_building 77.7% · market_value_land 67.3%
// Key presence is not value presence. An absent split stays NULL and a renderer must
// omit it — printing "$0" for a land value the vendor never sent is a fabricated figure.

/** One row of `data_lake.steadyapi_tax_history_v`. */
export interface TaxHistoryRow {
  property_id: string;
  tax_year: number;
  tax_amount: number | null;
  assessment_total: number | null;
  assessment_building: number | null;
  assessment_land: number | null;
  market_value_total: number | null;
  market_value_building: number | null;
  market_value_land: number | null;
}

export interface TaxYear {
  year: number;
  /** A real 0 is preserved — 4 source rows carry 0 on genuinely tiny parcels
   *  (assessment total $100-$103). Zero is a figure; only absence is null. */
  taxAmount: number | null;
  assessmentTotal: number | null;
  assessmentBuilding: number | null;
  assessmentLand: number | null;
  marketValueTotal: number | null;
  marketValueBuilding: number | null;
  marketValueLand: number | null;
}

export interface TaxTrend {
  direction: "rising" | "falling" | "flat";
  fromYear: number;
  toYear: number;
  from: number;
  to: number;
}

export interface TaxHistorySummary {
  years: TaxYear[];
  yearCount: number;
  trend: TaxTrend | null;
  scopeNote: string;
  taxAmountCaveat: string;
}

/**
 * THE SERVING GATE, in code.
 *
 * The playbook requires `tax_amount` be validated against a known county tax bill before
 * it reaches a user, and that we state a vendor annual-tax figure is not the county bill.
 * That validation has NOT run (check `steadyapi_tax_amount_validation_owed`), so the
 * caveat travels on every summary — a caller cannot obtain the number without it.
 */
export const TAX_AMOUNT_NOT_CLEARED_FOR_SERVING =
  "Annual tax figures come from the property record and have not been checked against a real county tax bill — this is not the county bill amount.";

const SCOPE_NOTE =
  "Tax and valuation history for this property only, from records tied to its listing or sale — not an average for the area.";

/** A real, usable figure. `0` is real; `null`/`NaN` are not. */
function isFigure(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/**
 * PURE. Direction of annual tax across the property's real endpoints.
 *
 * Returns null unless BOTH endpoints carry a real figure — one source row has a null
 * `tax_amount`, and anchoring a trend on it would compute a change against nothing.
 * A single year is likewise not a direction, only a value.
 */
export function taxTrend(rows: readonly TaxHistoryRow[]): TaxTrend | null {
  const dated = rows
    .filter((r) => Number.isFinite(r.tax_year) && isFigure(r.tax_amount))
    .sort((a, b) => a.tax_year - b.tax_year);
  if (dated.length < 2) return null;

  const first = dated[0];
  const last = dated[dated.length - 1];
  if (first.tax_year === last.tax_year) return null;

  const from = first.tax_amount as number;
  const to = last.tax_amount as number;
  return {
    direction: to > from ? "rising" : to < from ? "falling" : "flat",
    fromYear: first.tax_year,
    toYear: last.tax_year,
    from,
    to,
  };
}

/**
 * PURE. Rows for ONE property -> a reader-facing tax + valuation history, newest first.
 *
 * Empty in, empty out. Never throws. Absent splits stay null so a renderer omits them
 * rather than printing a zero the vendor never sent.
 */
export function summarizeTaxHistory(rows: readonly TaxHistoryRow[]): TaxHistorySummary {
  const years: TaxYear[] = [...rows]
    .filter((r) => Number.isFinite(r.tax_year))
    .sort((a, b) => b.tax_year - a.tax_year)
    .map((r) => ({
      year: r.tax_year,
      taxAmount: isFigure(r.tax_amount) ? r.tax_amount : null,
      assessmentTotal: isFigure(r.assessment_total) ? r.assessment_total : null,
      assessmentBuilding: isFigure(r.assessment_building) ? r.assessment_building : null,
      assessmentLand: isFigure(r.assessment_land) ? r.assessment_land : null,
      marketValueTotal: isFigure(r.market_value_total) ? r.market_value_total : null,
      marketValueBuilding: isFigure(r.market_value_building) ? r.market_value_building : null,
      marketValueLand: isFigure(r.market_value_land) ? r.market_value_land : null,
    }));

  return {
    years,
    yearCount: years.length,
    trend: taxTrend(rows),
    scopeNote: SCOPE_NOTE,
    taxAmountCaveat: TAX_AMOUNT_NOT_CLEARED_FOR_SERVING,
  };
}

export const TAX_HISTORY_VIEW = "steadyapi_tax_history_v";
export const TAX_HISTORY_COLUMNS =
  "property_id, tax_year, tax_amount, assessment_total, assessment_building, assessment_land, market_value_total, market_value_building, market_value_land";

/** Per-property cap. Max observed history is 19 years; 50 is far above any honest
 *  series and stops a bad property_id from scanning the view. */
const ROW_CAP = 50;

export interface TaxHistoryDeps {
  fetchRows?: (propertyId: string) => Promise<TaxHistoryRow[]>;
}

/**
 * Fetch one property's tax history.
 *
 * EMPTY-TOLERANT BY CONTRACT: no creds, no rows, or any query error yields an empty
 * summary and never throws. 7.6% of landed bodies carry no tax history at all (16,514 of
 * 17,875), so "none" is ordinary — and it means "we hold no tax records for this
 * property", never "this property paid no tax".
 */
export async function fetchTaxHistory(
  propertyId: string,
  deps: TaxHistoryDeps = {},
): Promise<TaxHistorySummary> {
  const id = propertyId?.trim();
  if (!id) return summarizeTaxHistory([]);

  const fetchRows =
    deps.fetchRows ??
    (async (pid: string): Promise<TaxHistoryRow[]> => {
      // KNOWN-DEBT(data_lake: the typed Supabase client intentionally does not cover
      // this schema — see utils/supabase/service-role.ts):
      const { createServiceRoleClientUntyped } = await import("@/utils/supabase/service-role");
      const db = createServiceRoleClientUntyped();
      const { data } = await db
        .schema("data_lake")
        .from(TAX_HISTORY_VIEW)
        .select(TAX_HISTORY_COLUMNS)
        .eq("property_id", pid)
        .order("tax_year", { ascending: false })
        .limit(ROW_CAP);
      return Array.isArray(data) ? (data as unknown as TaxHistoryRow[]) : [];
    });

  try {
    return summarizeTaxHistory(await fetchRows(id));
  } catch {
    return summarizeTaxHistory([]);
  }
}
