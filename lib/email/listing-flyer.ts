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

import { withCommas } from "@/lib/format-number";
import { buildLifecycleEmail } from "./lifecycle-chrome";
import { listingButtonUrl } from "@/lib/listings/listing-url";
import type { ChromeBlock } from "./lifecycle-chrome";
import type { EmailDoc, StatItem } from "./doc/types";
import type { ListingFacts } from "./listing-scrape";

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
export function listingSpecs(
  facts: ListingFacts,
  daysOnMarket?: number | null,
  /** Does `$/Sq Ft` carry the emphasis? DEFAULT YES, because on `price-reduced` and
   *  `just-sold` that cell genuinely IS the argument the email is making. NEW LISTING passes
   *  false — see the note in `buildListingFlyer`. */
  opts: { emphasizePerSqft?: boolean } = {},
): StatItem[] {
  const perSqftEmphasis = opts.emphasizePerSqft === false ? undefined : ("primary" as const);
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

  // THE STRIP READS EVEN. Every cell at the same size, because that is what a strip IS.
  //
  // `$/Sq Ft` used to carry `emphasis: "primary"`, on the reasoning that price-per-foot wins
  // the argument. Measured in a real rendered email 08/05/2026: **`$231` came out at 28px
  // while every other value in the row came out at 16px** — a 1.75x jump on one cell in a
  // six-cell hairline row. Operator: *"why the fuck is sq ft number bigger than everything
  // else?"*
  //
  // And on this email the reasoning was wrong anyway: the ASKING PRICE is the argument, and
  // it is already the hero at 44px directly above. A second number shouting underneath it
  // competes with the headline instead of supporting it. Emphasis is for a cell that carries
  // the whole point of ITS email — price-reduced's cut, just-sold's sale price — not for
  // every listing email by default.
  return [
    spec(facts.beds, "Beds"),
    spec(facts.baths, "Baths"),
    spec(withCommas(facts.sqft), "Sq Ft"),
    spec(facts.lotSize, "Lot"),
    spec(pricePerSqft(facts.price, facts.sqft), "$/Sq Ft", perSqftEmphasis),
    // TYPE YIELDS ITS SLOT. The strip holds six, and `price-reduced` already drops this exact
    // cell — "the one cell a reader will never use." "Residential" loses to a DOM of 1.
    // No days held (vendor miss) → Type keeps the slot, so nothing is ever left blank.
    // No `muted` here either: see above — one shrunken cell in an even row is not de-emphasis,
    // it is a ragged row. Rank is carried by ORDER, which is why Type is last.
    dom ??
      spec(
        shortType(facts.propertyType) || undefined,
        "Type",
        perSqftEmphasis ? "muted" : undefined,
      ),
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

/** The address line a listing hero leads with — composed from the record's STRUCTURED
 *  fields, not the vendor's pre-formatted string.
 *
 *  The vendor's `formattedAddress` comes back "326 Shore Dr, Fort Myers, FL, 33905" — a
 *  stray comma before the ZIP (seen live 07/13/2026, and again 08/06/2026 on
 *  "13501 Brown Bear Run, Fort Myers, FL, 33928"). city/state/zip are the same record's own
 *  fields and compose cleanly. Nothing is invented — only re-punctuated.
 *
 *  LIFTED HERE 08/06/2026. `price-reduced.ts` and `back-on-market.ts` each carried a private
 *  copy of this composition, and price-reduced's own comment named the debt in as many words:
 *  *"REPORTED, NOT FIXED: `addressLineOf` … returns `facts.address` RAW, so the rest of the
 *  campaign still ships the stray comma. This helper should be lifted into that root — one
 *  authority per shared concept — but that file is not mine to edit."* It is lifted now, so
 *  all seven lifecycle emails read ONE authority instead of two-of-seven getting it right by
 *  hand (T1: never a second resolver for a shared fact).
 *
 *  The raw address stays the fallback for a subject the vendor never matched (the typed
 *  address is all we have, and it is still real); city/state is the last resort. */
export function addressLineOf(facts: ListingFacts): string {
  const full = (facts.address ?? "").trim();
  const comma = full.indexOf(",");
  const street = comma > 0 ? full.slice(0, comma).trim() : full;
  const locality = [facts.city, [facts.state, facts.zip].filter(Boolean).join(" ").trim()]
    .filter(Boolean)
    .join(", ");
  if (!street) return locality;
  return locality ? `${street}, ${locality}` : full;
}

/**
 * THE LISTING'S OWN DESCRIPTION, trimmed to a block a reader will actually finish.
 *
 * It ships VERBATIM — the seller's words, never rewritten into a claim, and §1.9 exempts it
 * from the 50–125-word budget precisely so it can be this long. Measured live 08/05/2026
 * across the paid rows we hold: **368 to 2,983 characters**, so most descriptions pass
 * through untouched and only the longest are cut.
 *
 * A cut lands on a SENTENCE boundary, never mid-word: a description that stops at "the lanai
 * over" reads as a bug, and a trailing "…" on someone else's marketing copy reads as if we
 * edited it. If no sentence ends inside the window we fall back to a word boundary.
 */
export function listingDescription(remarks?: string): string | undefined {
  const raw = remarks?.trim();
  if (!raw) return undefined;
  if (raw.length <= DESCRIPTION_MAX_CHARS) return raw;
  const window = raw.slice(0, DESCRIPTION_MAX_CHARS);
  const lastStop = Math.max(window.lastIndexOf(". "), window.lastIndexOf("! "));
  if (lastStop > DESCRIPTION_MIN_CHARS) return window.slice(0, lastStop + 1).trim();
  const lastSpace = window.lastIndexOf(" ");
  return (lastSpace > DESCRIPTION_MIN_CHARS ? window.slice(0, lastSpace) : window).trim();
}

/** Long enough that the description is still the seller's pitch, short enough that the
 *  email is not a wall. Sits well inside Gmail's ~102KB clip (§1.12). */
const DESCRIPTION_MAX_CHARS = 900;
/** Below this a "clean" cut has thrown away most of the description — take the window. */
const DESCRIPTION_MIN_CHARS = 300;

/**
 * THE TWO DIALS A SIBLING LIFECYCLE EMAIL MAY TURN — and there are only two.
 *
 * Added 08/06/2026 for Back on the Market. Operator, on that email: *"it's basically a new
 * fucking listing, how can you fuck it up?"* — and he was right: a relisted house is a house
 * for sale. Everything a reader wants (the photo, the price, the specs, the seller's own
 * description, one paragraph) is IDENTICAL; what differs is the word on the ribbon and the
 * ask under it.
 *
 * The alternative was for the sibling to hand `buildLifecycleEmail` the same field set by
 * hand — which is a SECOND COPY of the strip/description/hero/CTA decisions, and this file's
 * own header is the receipt for where that ends ("seven files, seven layouts"). The 08/05
 * `$/Sq Ft` emphasis fix would have had to be made twice. If two emails are "basically the
 * same," they must not be ABLE to drift.
 *
 * Deliberately NOT a dial: the specs, the description, the hero, the photo rules, the link
 * ladder. A recipe that needs a different strip is not a new-listing flyer and should call
 * `buildLifecycleEmail` directly, the way price-reduced and just-sold already do.
 */
export interface FlyerVariant {
  /** The ribbon word. Default "New Listing". */
  ribbon?: string;
  /** The single CTA's label. Default "View the Full Listing". */
  ctaLabel?: string;
}

export function buildListingFlyer(
  facts: ListingFacts,
  current: EmailDoc,
  /** ACTIVE listings only — `today − the vendor's list_date`. See `listingSpecs`. Omitted or
   *  null (a vendor miss) → the Type cell keeps its slot, never a blank. */
  daysOnMarket?: number | null,
  /** The recipe's own blocks, riding between the spec strip and the description. */
  middle?: ChromeBlock[],
  /** The ribbon word and the CTA label. Everything else is the same flyer. */
  variant: FlyerVariant = {},
): EmailDoc {
  // THE ONE LINK. `null` = we hold no real listing page for this house, and that means NO
  // BUTTON and no photo link — never our homepage. Until 08/05/2026 both of these read
  // `facts.sourceUrl`, which `resolve-subject.ts` hardcodes to swfldatagulf.com, so every
  // address-resolved listing email shipped "View the Full Listing" pointing at our home
  // page. That is the deliverability violation §1.8 names in as many words.
  const listingUrl = listingButtonUrl(facts);

  return buildLifecycleEmail(current, {
    ribbon: variant.ribbon ?? "New Listing",
    photo: facts.photos[0]
      ? {
          url: facts.photos[0],
          alt: facts.address ?? "Featured property",
          ...(listingUrl ? { linkUrl: listingUrl } : {}),
        }
      : null,
    heroValue: facts.price ?? "",
    heroLabel: addressLineOf(facts),
    // THE STRIP READS EVEN ON THIS EMAIL. Measured in a real render 08/05/2026: `$231` came
    // out at 28px against 16px for every other cell in the same six-cell row. Operator: "why
    // the fuck is sq ft number bigger than everything else?" On a NEW listing the asking
    // price is the argument and it is already the hero at 44px directly above; a second
    // number shouting under it competes with the headline. The other lifecycle emails KEEP
    // the emphasis, because there the cell really is their point — price-reduced's cut,
    // just-sold's sale price. Rank here is carried by ORDER, not by size.
    specs: listingSpecs(facts, daysOnMarket, { emphasizePerSqft: false }),
    specFootnote: specFootnote(facts),
    ...(middle?.length ? { middle } : {}),
    // THE SELLER'S OWN WORDS, in their own reserved block (marked `descriptionSlot`, which
    // the narrative passes both skip). They are ALSO handed to the narrator as its source —
    // the same text doing two different jobs, which is why it must not live in `narrative`.
    description: listingDescription(facts.remarks),
    // The narrator's slot, left OPEN. `buildNewListing` authors into it after this returns.
    narrative: "",
    ctaLabel: variant.ctaLabel ?? "View the Full Listing",
    ...(listingUrl ? { ctaUrl: listingUrl } : {}),
  });
}
