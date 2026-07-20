// lib/email/listing-flyer.ts
//
// THE NEW-LISTING FLYER — now just a THIN CHROME CALL.
//
// This file used to own its own grid. So did coming-soon, market-comps, under-contract,
// just-sold, open-house and price-reduced — seven files, seven layouts, one "campaign" that
// looked like seven different companies (see lib/email/lifecycle-chrome.ts for the receipts).
//
// The layout now lives in ONE place: `buildLifecycleEmail`. A recipe supplies the RIBBON
// WORD, the numbers, its own middle content and a CTA. It does not get to invent a shape.
// That is what makes six emails arriving over six weeks read as one campaign from one agent.
//
// This file is the REFERENCE for the other six: copy this shape, change the chrome fields.
//
// Never refuses (RULE 0.7): no photo → a canvas dropzone; no spec → an open slot the user
// fills; no remarks → an instruction. Never a zero, never invented.

import { buildLifecycleEmail } from "./lifecycle-chrome";
import type { EmailDoc, StatItem } from "./doc/types";
import type { ListingFacts } from "./listing-scrape";

/** "7453" → "7,453"; strips any non-digits first. Undefined in → undefined. */
function withCommas(n?: string): string | undefined {
  if (!n) return undefined;
  const digits = n.replace(/[^\d]/g, "");
  if (!digits) return undefined;
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** List price ÷ listed square footage → "$1,914". Both must parse to a positive number;
 *  anything missing → undefined (an open slot, never a fabricated value). */
export function pricePerSqft(price?: string, sqft?: string): string | undefined {
  const p = Number((price ?? "").replace(/[^\d.]/g, ""));
  const s = Number((sqft ?? "").replace(/[^\d.]/g, ""));
  if (!p || !s || !Number.isFinite(p) || !Number.isFinite(s)) return undefined;
  return "$" + Math.round(p / s).toLocaleString("en-US");
}

/** A short, cell-sized property-type label. The scrape lane hands long strings
 *  ("Residential - Single Family"); the stat cell caps at 24 chars. */
/** The lake's own `property_type` vocabulary (data_lake.listing_dom), which is
 *  snake_case machine values — NOT display text. Shipped verbatim to a reader once:
 *  the Type cell of a real listing email read "single_family" (operator, 07/20/2026,
 *  reading it in his inbox). Mapped at the RENDER EDGE only; the lake value is the
 *  authority and is never rewritten. An unmapped value falls through to the generic
 *  snake-case → Title Case pass below, so a new vendor enum degrades to something
 *  readable instead of leaking an identifier. */
const PROPERTY_TYPE_LABEL: Record<string, string> = {
  single_family: "Single Family",
  multi_family: "Multi-Family",
  condo: "Condo",
  condos: "Condo",
  townhouse: "Townhouse",
  townhomes: "Townhouse",
  duplex: "Duplex",
  triplex: "Triplex",
  fourplex: "Fourplex",
  apartment: "Apartment",
  mobile: "Mobile Home",
  manufactured: "Manufactured",
  farm: "Farm",
  land: "Land",
  lot: "Lot",
  other: "",
};

export function shortType(t?: string): string {
  if (!t) return "";
  const raw = t.trim();
  // Machine enum first — an exact lake/vendor value never reaches a reader as-is.
  const mapped = PROPERTY_TYPE_LABEL[raw.toLowerCase()];
  if (mapped !== undefined) return mapped;
  // Vendor prose ("Residential - Single Family") keeps its existing tail-segment rule.
  const seg =
    raw
      .split(/\s[-–—]\s/)
      .pop()
      ?.trim() || raw;
  // Anything still carrying underscores is an identifier, not a phrase — title-case it
  // rather than print it raw. "single_family" would already be mapped; this catches the
  // enum we have not seen yet.
  const humane = seg.includes("_")
    ? seg
        .split("_")
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ")
    : seg;
  return humane.slice(0, 24);
}

/** A spec cell. An unsourced value is "" — an OPEN SLOT on the canvas (the LABEL is the
 *  instruction: "Baths" tells the user what to type) and ABSENT from the sent email.
 *  Never a zero, never a guess. Shared by every lifecycle recipe. */
export function spec(
  value: string | undefined,
  label: string,
  emphasis?: StatItem["emphasis"],
): StatItem {
  return {
    value: value && value.trim() ? value.trim().slice(0, 24) : "",
    label,
    ...(emphasis ? { emphasis } : {}),
  };
}

/**
 * THE SPEC STRIP every listing email wears — one hairline row, in reading order.
 *
 * `$/Sq Ft` is emphasised BECAUSE IT WINS THE ARGUMENT; `Type` is muted because it is
 * context. Before StatItem carried `emphasis`, a recipe had NO WAY TO SAY THAT, so $209
 * rendered at exactly the same weight as "Residential" and the whole strip read as a wall.
 */
export function listingSpecs(facts: ListingFacts, daysOnMarket?: number | null): StatItem[] {
  // DAYS ON MARKET — and it is the REAL one, on an ACTIVE listing.
  //
  // `today − list_date`, where `list_date` is the VENDOR's listing date
  // (`/property-tax-history` → `property_history[].listing.list_date`, via
  // `resolveSubjectListDate`). Not a date we invented, and NOT "when we first crawled it".
  //
  // On a home that is STILL FOR SALE the MLS clock is still running, so `today − list_date`
  // IS days on market — the caveat that forces `under-contract` to say "Days Since Listed"
  // instead (its clock stopped at a pending date we do not hold) simply does not apply here.
  // So this cell is for ACTIVE listings ONLY. Never pass it on under-contract or just-sold.
  //
  // And a fresh listing reads ONE, not zero — "1" here is the most persuasive number on a
  // new-listing email, not a dead cell.
  //
  // THE LABEL IS "DOM" (operator, 07/14/2026). A cell is 94px (568 ÷ 6); "Days on Market"
  // wrapped to three lines and left "MEDIAN"/"DAYS ON"/"MARKET" reading as separate things.
  // Short label, whole number, no wrap — and it needs no singular/plural branch, because DOM
  // is DOM at 1 and at 83.
  const dom =
    daysOnMarket != null && daysOnMarket >= 0 ? spec(String(daysOnMarket), "DOM") : undefined;

  return [
    spec(facts.beds, "Beds"),
    spec(facts.baths, "Baths"),
    spec(withCommas(facts.sqft), "Sq Ft"),
    spec(facts.lotSize, "Lot"),
    spec(pricePerSqft(facts.price, facts.sqft), "$/Sq Ft", "primary"),
    // TYPE YIELDS ITS SLOT. The strip holds six, and `price-reduced` already drops this exact
    // cell — "the one cell a reader will never use." "Residential" loses to a DOM of 1.
    // No days held (vendor miss) → Type keeps the slot, so nothing is ever left blank.
    dom ?? spec(shortType(facts.propertyType) || undefined, "Type", "muted"),
  ];
}

/**
 * NO FOOTNOTE ON $/SQ FT (operator, 07/20/2026, on reading it in a real inbox).
 *
 * This used to emit "*Computed from list price ÷ listed square footage." under the spec
 * strip of every lifecycle email. Provenance on a derived cell is right in principle —
 * a reader must be able to check our arithmetic — but this particular derivation is the
 * most self-evident number in residential real estate. Every agent and every buyer
 * already knows $/sq ft is price over square footage, and BOTH OPERANDS ARE IN THE SAME
 * STRIP, two cells away. Explaining it is a developer narrating a formula, not an agent
 * talking to a buyer, and it made the email read like a spreadsheet export.
 *
 * The rule this leaves behind: a derived cell earns a note when the derivation is NOT
 * obvious or could be MISREAD. price-reduced's "previous price = this asking price plus
 * the reduction on record" earns one (the reader cannot otherwise check that number).
 * just-sold's "$/Sq Ft is the SALE price ÷ sq ft" earns one (it distinguishes the figure
 * from the list-price version a reader would otherwise assume). Restating grade-school
 * division does not.
 *
 * Kept as a function rather than deleted at its call sites: the strip may yet carry a
 * derived cell that genuinely needs a note, and this is where that belongs.
 */
export function specFootnote(_facts: ListingFacts): string | undefined {
  return undefined;
}

/** The address line a listing hero leads with. */
export function addressLineOf(facts: ListingFacts): string {
  return facts.address ?? [facts.city, facts.state].filter(Boolean).join(", ");
}

export function buildListingFlyer(
  facts: ListingFacts,
  current: EmailDoc,
  /** ACTIVE listings only — `today − the vendor's list_date`. See `listingSpecs`. Omitted or
   *  null (a vendor miss) → the Type cell keeps its slot, never a blank. */
  daysOnMarket?: number | null,
): EmailDoc {
  return buildLifecycleEmail(current, {
    ribbon: "New Listing",
    photo: facts.photos[0]
      ? {
          url: facts.photos[0],
          alt: facts.address ?? "Featured property",
          linkUrl: facts.sourceUrl,
        }
      : null,
    heroValue: facts.price ?? "",
    heroLabel: addressLineOf(facts),
    specs: listingSpecs(facts, daysOnMarket),
    specFootnote: specFootnote(facts),
    // The narrator's SOURCE, not the body — build-doc clears this slot then authors into it
    // (fillNarrative SKIPS a text block that already has content, so leaving raw remarks
    // here ships 2,000 characters of MLS copy instead of prose).
    narrative: facts.remarks ? facts.remarks.slice(0, 2000) : "",
    ctaLabel: "View the Full Listing",
    ctaUrl: facts.sourceUrl,
  });
}
