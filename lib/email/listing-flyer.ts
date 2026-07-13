// lib/email/listing-flyer.ts
//
// Turn scraped/resolved ListingFacts into a property FLYER EmailDoc — the fixed,
// gridded "coded skeleton" the lab AI only fills the BLANKS of. The layout, the
// grid positions, the palette, and the block order are code; the real photo,
// price, specs, and one commentary paragraph are the fill. The flyer LEADS with
// the property (photo → price + address → specs → commentary → chart → CTA) but
// PRESERVES the user's brand + identity (globalStyle, the header's company/logo,
// the footer's CAN-SPAM + socials, the agent card) — those are sticky and lifted
// from the doc currently on the canvas. Pure: returns a NEW doc, mutates nothing,
// invents nothing (a missing spec becomes an EMPTY cell to fill, never a fake 0).
//
// Never refuses: with no photo it emits an empty photo block (the canvas renders a
// drag-drop upload); with no specs it emits empty cells (the user types them in).

import { createBlock, DEFAULT_GLOBAL_STYLE } from "./doc/default-docs";
import { heroPhotoBlock } from "./inject-photo";
import type { BlockLayout, EmailBlock, EmailDoc, FontFamily, StatItem } from "./doc/types";
import type { ListingFacts } from "./listing-scrape";

/** Editorial fallback palette — applied ONLY when the incoming brand is still the
 *  house default (a blank brand). A real user brand carries through untouched. */
const EDITORIAL_STYLE = {
  primaryColor: "#0A2A2C",
  accentColor: "#B98F45",
  fontFamily: "BOOK_SERIF" as FontFamily,
  displayFontFamily: "PLAYFAIR_SERIF" as FontFamily,
  textColor: "#23302F",
  backdropColor: "#EFE9DD",
};

/** Reuse the current doc's block of a type (identity/brand is sticky), else a
 *  fresh default block of that type. */
function keepOrDefault(current: EmailDoc, type: EmailBlock["type"]): EmailBlock {
  const found = current.blocks.find((b) => b.type === type);
  return found ?? createBlock(type);
}

/** "7453" → "7,453"; strips any non-digits first. Undefined in → undefined. */
function withCommas(n?: string): string | undefined {
  if (!n) return undefined;
  const digits = n.replace(/[^\d]/g, "");
  if (!digits) return undefined;
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** List price ÷ listed square footage → "$1,914". Both must parse to a positive
 *  number; anything missing → undefined (an empty cell, never a fabricated value). */
function pricePerSqft(price?: string, sqft?: string): string | undefined {
  const p = Number((price ?? "").replace(/[^\d.]/g, ""));
  const s = Number((sqft ?? "").replace(/[^\d.]/g, ""));
  if (!p || !s || !Number.isFinite(p) || !Number.isFinite(s)) return undefined;
  return "$" + Math.round(p / s).toLocaleString("en-US");
}

/** A short, cell-sized property-type label. The scrape lane hands long strings
 *  ("Residential - Single Family"); the stat cell caps at 24 chars, so take the
 *  most specific segment and clamp. The resolver's "Residential"/"Land" pass
 *  through unchanged. */
function shortType(t?: string): string {
  if (!t) return "";
  const seg =
    t
      .split(/\s[-–—]\s/)
      .pop()
      ?.trim() || t.trim();
  return seg.slice(0, 24);
}

/** Attach a 12-col grid layout to a block (so it renders on the real 2D canvas
 *  instead of stacking). Height is additive by the caller's running `y`. */
function at<T extends EmailBlock>(block: T, y: number, h: number, opts?: Partial<BlockLayout>): T {
  return { ...block, layout: { x: 0, y, w: 12, h, ...opts } };
}

export function buildListingFlyer(facts: ListingFacts, current: EmailDoc): EmailDoc {
  // Brand-or-ours: keep a real user brand; fall back to the editorial palette only
  // when the incoming style is still the house default (blank brand).
  const brandIsHouse = current.globalStyle.accentColor === DEFAULT_GLOBAL_STYLE.accentColor;
  const globalStyle = brandIsHouse
    ? { ...current.globalStyle, ...EDITORIAL_STYLE }
    : { ...current.globalStyle };

  const addressLine =
    facts.address ?? ([facts.city, facts.state].filter(Boolean).join(", ") || undefined);

  const blocks: EmailBlock[] = [];
  let y = 0;
  const push = (block: EmailBlock, h: number, opts?: Partial<BlockLayout>) => {
    blocks.push(at(block, y, h, opts));
    y += h;
  };

  // 1. Header — keep the agent's branded header (company, logo, colors).
  push(keepOrDefault(current, "header"), 2);

  // 2. Hero PHOTO — the real first listing photo, else an EMPTY photo block the
  //    canvas renders as a drag-drop upload (never refuse, never a stock image).
  push(
    facts.photos[0]
      ? heroPhotoBlock({
          url: facts.photos[0],
          alt: facts.address ?? "Featured property",
          linkUrl: facts.sourceUrl,
        })
      : {
          id: createBlock("image").id,
          type: "image",
          props: { url: "", kind: "photo", alt: facts.address ?? "Featured property" },
        },
    6,
  );

  // 3. Hero — "New Listing" ribbon kicker + price + address lead the email.
  push(
    {
      id: createBlock("hero").id,
      type: "hero",
      props: {
        kicker: "New Listing",
        value: facts.price ?? "",
        label: addressLine ?? "",
      },
    },
    3,
  );

  // 4. Spec strip — two rows of fixed labels. Real values fill in; a spec we don't
  //    hold stays an EMPTY cell (never a 0, never invented). Row A is always the
  //    beds/baths/sqft the record carries; row B is computed/enrichment.
  // A cell we can't source DOES NOT EXIST. The old code emitted every label with an
  // empty value, so a listing with no bath count shipped a naked "Baths" heading with
  // nothing under it — which reads as broken, not as honest. The rule is now
  // structural: a spec with a real value becomes a cell; a spec without one is gone.
  // (Still never a 0, still never invented — absent means absent.)
  const spec = (value: string | undefined, label: string): StatItem[] =>
    value && value.trim() ? [{ value: value.trim().slice(0, 24), label }] : [];
  const specs: StatItem[] = [
    ...spec(facts.beds, "Beds"),
    ...spec(facts.baths, "Baths"),
    ...spec(withCommas(facts.sqft), "Sq Ft"),
    ...spec(pricePerSqft(facts.price, facts.sqft), "$/Sq Ft"),
    ...spec(facts.lotSize, "Lot"),
    ...spec(shortType(facts.propertyType) || undefined, "Type"),
    ...spec(facts.yearBuilt, "Built"),
  ];
  // Lay them out three-to-a-row, so a row is only emitted if it has real cells.
  for (let i = 0; i < specs.length; i += 3) {
    const row = specs.slice(i, i + 3);
    push({ id: createBlock("stats").id, type: "stats", props: { stats: row } }, 2);
  }

  // 5. Commentary — the real MLS remarks if we have them, else an EMPTY slot the
  //    AI fills with one honest paragraph (numbers stay in the cells above).
  push(
    {
      id: createBlock("text").id,
      type: "text",
      props: { body: facts.remarks ? facts.remarks.slice(0, 2000) : "", align: "left" },
    },
    4,
  );

  // 6. Chart slot — the ZIP home-value trend. Empty here; the build fills its url
  //    in place (preserving this layout) or drops it if no chart resolves.
  push(
    {
      id: createBlock("image").id,
      type: "image",
      props: { url: "", kind: "chart", alt: "ZIP home-value trend", caption: "" },
    },
    5,
  );

  // 7. Agent card — keep the agent's own card if the canvas had one.
  push(keepOrDefault(current, "agent-card"), 4);

  // 8. CTA → the listing page.
  push(
    {
      id: createBlock("button").id,
      type: "button",
      props: { label: "View the Full Listing", url: facts.sourceUrl },
    },
    2,
  );

  // 9. Footer — keep the agent's CAN-SPAM footer (address, socials, unsubscribe).
  push(keepOrDefault(current, "footer"), 3, { static: true });

  return { globalStyle, blocks };
}
