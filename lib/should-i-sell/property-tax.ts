// lib/should-i-sell/property-tax.ts
//
// County property-tax fetch CONTRACT for the sell-now-vs-wait spread. The starting
// tax figure must be a NAMED, CITED, live-fetched county number, or the user's real
// bill — NEVER an invented or back-solved number.
//
// STATUS (2026-07-17): no confirmed live PER-PARCEL annual-tax-bill endpoint is wired
// in-session. What we hold today:
//   • data_lake.leepa_parcels carries `taxable_value` / `assessed_value` per parcel
//     (LeePA, keyed by folioid) — a VALUE, not the annual tax BILL.
//   • properties-collier-value carries just-value per ZIP + the Save-Our-Homes gap —
//     county/ZIP grain, not a per-parcel bill.
// The annual tax BILL = taxable_value × the parcel's millage rate, and we do NOT hold
// a per-parcel millage / tax-collector bill feed. Back-solving tax from taxable_value ×
// an assumed millage is derivable-but-invented (a locked no-invention rule), so this
// returns null until a real per-parcel county tax endpoint is confirmed. The spread
// section then requires the user's real bill and NEVER shows a guessed tax number.
//
// TODO(should-i-sell B3 — open decision in the design spec): wire a confirmed live
// per-parcel county tax-bill endpoint, verified via crawl4ai (RULE 0.4) at plan time —
// Lee County Tax Collector (leetc.com) parcel bill lookup by folio, and Collier County
// Tax Collector (colliertax.com). Inject it through `deps.fetchAnnualTax`; until then
// this is a null-returning contract, not a number source.

export interface PropertyTaxResult {
  /** The starting annual property-tax figure — a named, cited county number. */
  annual: number;
  source: { label: string; url: string };
  /** MM/DD/YYYY. */
  asOf: string;
}

export interface PropertyTaxArgs {
  address: string;
  zip: string;
  countyFips: string;
}

export interface PropertyTaxDeps {
  /** Injectable real fetch — wired once a confirmed live county endpoint lands. */
  fetchAnnualTax?: (args: PropertyTaxArgs) => Promise<PropertyTaxResult | null>;
}

/**
 * Fetch the starting annual property-tax figure for an address. Returns null when no
 * confirmed live county source is wired (the default today) — the caller then requires
 * the user's real bill and never invents one. Never throws.
 */
export async function fetchPropertyTaxAnnual(
  args: PropertyTaxArgs,
  deps: PropertyTaxDeps = {},
): Promise<PropertyTaxResult | null> {
  if (deps.fetchAnnualTax) {
    try {
      return await deps.fetchAnnualTax(args);
    } catch {
      return null; // a fetch failure never fabricates a number
    }
  }
  return null; // no confirmed live source wired — user enters their real bill
}
