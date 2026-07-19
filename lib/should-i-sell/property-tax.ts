// lib/should-i-sell/property-tax.ts
//
// County property-tax fetch CONTRACT for the sell-now-vs-wait spread. The starting
// tax figure must be a NAMED, CITED, live-fetched county number, or the user's real
// bill — NEVER an invented or back-solved number.
//
// STATUS (2026-07-19): PROBED — no fetchable per-parcel bill exists. Both counties run
// Grant Street TaxSys (Lee: county-taxes.net/fl-lee/property-tax; Collier:
// collier.county-taxes.com/public); Collier sits behind Cloudflare bot verification and
// Lee is a client-rendered app — neither is a dependable server-fetch at request time.
// Back-solving a bill from taxable_value × an assumed millage stays banned as
// derivable-but-invented (a locked no-invention rule). Resolution shipped with the SOH
// build: the spread's tax field stays user-entry and renders a cited per-county
// link-out (TAX_LOOKUP in app/r/should-i-sell/[zip]/page.tsx). Future upgrade lane:
// TaxSys /public/reports bulk files (check taxsys_bulk_reports_probe). This module
// stays a null-returning contract wired through `deps.fetchAnnualTax`.

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
