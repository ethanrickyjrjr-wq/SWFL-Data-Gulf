// lib/deliverable/recipes/cell-catalog.ts
//
// THE ONE CELL CATALOG (recipes-as-config, spec 2026-08-18).
//
// Each key owns its LABEL, its source field, and its formatter — so a content ruling
// ("no HOA cell", the incident that sat implemented on under-contract since July while
// new-listing rendered the fee) or a label fix is a one-line change HERE, walked to
// every configured recipe automatically. Labels are checked clean against cell-policy
// at TEST time (cell-catalog.test.ts), so a banned-family cell cannot even be authored
// into the catalog; the chrome's render-time `stripBannedCells` backstop stays as the
// second line, exactly as before.
//
// THE UNIT IS ALREADY IN THE VALUE (under-contract lesson, rendered-and-looked
// 08/06/2026 — "0.19 ac ac"): resolve-subject.ts formats the lake's lot_acres as
// "0.19 ac" before a recipe ever sees it. Formatters here NEVER append a unit the
// spine already printed.
//
// ADDING A CELL: one entry. The label is reader-facing; the value returns undefined
// for "not held" — spec() turns that into an OPEN SLOT (RULE 0.7), never a zero.
import { withCommas } from "@/lib/format-number";
import { pricePerSqft, shortType, spec } from "@/lib/email/listing-flyer";
import type { StatItem } from "@/lib/email/doc/types";
import type { ListingFacts } from "@/lib/email/listing-scrape";

export interface CellDef {
  /** The reader-facing label — checked clean against cell-policy by the fleet test. */
  label: string;
  /** The reader-facing value, or undefined = OPEN SLOT (never a zero, never a guess). */
  value: (facts: ListingFacts) => string | undefined;
}

export const CELL_CATALOG = {
  beds: { label: "Beds", value: (f) => f.beds },
  baths: { label: "Baths", value: (f) => f.baths },
  sqft: { label: "Sq Ft", value: (f) => withCommas(f.sqft) },
  "price-per-sqft": { label: "$/Sq Ft", value: (f) => pricePerSqft(f.price, f.sqft) },
  lot: { label: "Lot", value: (f) => f.lotSize },
  type: { label: "Type", value: (f) => shortType(f.propertyType) || undefined },
} as const satisfies Record<string, CellDef>;

export type CellKey = keyof typeof CELL_CATALOG;

/** Keys → StatItems, in order, through the shared spec() (open-slot semantics live
 *  there — ONE WEIGHT ACROSS THE ROW: no emphasis is passed, per the playbook's
 *  defect-5 rule that a mixed-weight strip reads broken). Total: a runtime-unknown
 *  key is skipped — the fleet test makes that unreachable from a committed config. */
export function resolveCells(keys: readonly CellKey[], facts: ListingFacts): StatItem[] {
  return keys
    .filter((k) => CELL_CATALOG[k] !== undefined)
    .map((k) => spec(CELL_CATALOG[k].value(facts), CELL_CATALOG[k].label));
}
