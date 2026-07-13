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
export function shortType(t?: string): string {
  if (!t) return "";
  const seg =
    t
      .split(/\s[-–—]\s/)
      .pop()
      ?.trim() || t.trim();
  return seg.slice(0, 24);
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
export function listingSpecs(facts: ListingFacts): StatItem[] {
  return [
    spec(facts.beds, "Beds"),
    spec(facts.baths, "Baths"),
    spec(withCommas(facts.sqft), "Sq Ft"),
    spec(facts.lotSize, "Lot"),
    spec(pricePerSqft(facts.price, facts.sqft), "$/Sq Ft", "primary"),
    spec(shortType(facts.propertyType) || undefined, "Type", "muted"),
  ];
}

/** The footnote for the one DERIVED cell — provenance, stated where the reader can see it. */
export function specFootnote(facts: ListingFacts): string | undefined {
  return pricePerSqft(facts.price, facts.sqft)
    ? "*Computed from list price ÷ listed square footage."
    : undefined;
}

/** The address line a listing hero leads with. */
export function addressLineOf(facts: ListingFacts): string {
  return facts.address ?? [facts.city, facts.state].filter(Boolean).join(", ");
}

export function buildListingFlyer(facts: ListingFacts, current: EmailDoc): EmailDoc {
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
    specs: listingSpecs(facts),
    specFootnote: specFootnote(facts),
    // The narrator's SOURCE, not the body — build-doc clears this slot then authors into it
    // (fillNarrative SKIPS a text block that already has content, so leaving raw remarks
    // here ships 2,000 characters of MLS copy instead of prose).
    narrative: facts.remarks ? facts.remarks.slice(0, 2000) : "",
    ctaLabel: "View the Full Listing",
    ctaUrl: facts.sourceUrl,
  });
}
