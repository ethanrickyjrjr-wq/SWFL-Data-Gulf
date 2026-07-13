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

  // 2. THE RIBBON — a full-width accent band, between the header and the photo. This is
  //    the sample's "◆ NEW LISTING ◆" bar, and it is a design element in its own right.
  push(
    { id: createBlock("hero").id, type: "hero", props: { kicker: "New Listing", ribbon: true } },
    1,
  );

  // 3. Hero PHOTO — the real first listing photo, else an EMPTY photo block the
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

  // 4. Hero — THE SAMPLE'S LAYOUT, now expressible.
  //
  // Operator, 07/13/2026: "we just need to be able to build what the example looks like
  // with real data. That is all everything is."
  //
  // The sample reads, centred: the ADDRESS in display serif, then the PRICE large and in
  // the accent colour. Ours read left-aligned, a near-black price, address as an
  // afterthought. The design was not hard to build — it was INEXPRESSIBLE: HeroProps had no
  // align, no ribbon, no order. It does now, so the flyer can finally say what it means.
  push(
    {
      id: createBlock("hero").id,
      type: "hero",
      props: {
        align: "center",
        order: "label-first", // the address IS the subject; the price is the headline under it
        value: facts.price ?? "",
        label: addressLine ?? "",
      },
    },
    4,
  );

  // 4. Spec strip — fixed labels; the record's real values fill them in.
  //
  // THE OPEN-SLOT CONTRACT (operator, 07/13/2026): "for info we don't have, we leave
  // open with instructions for the user to paste or add." A spec we can't source is
  // therefore NOT dropped at build time (07/13's earlier behavior, which fixed the
  // naked-label bug by deleting the invitation with it) and NOT a fake 0. It stays a
  // cell with an EMPTY value: on the canvas that is an editable open slot whose LABEL
  // is the instruction ("Baths" — type it in); on the sendable-HTML paths StatsBlock
  // drops the unfilled cell, and drops the whole row when none survive
  // (`emailRender`, BlockRenderer.tsx). Never a zero, never invented, never a naked
  // label to a recipient — and still an invitation to the user.
  const spec = (
    value: string | undefined,
    label: string,
    emphasis?: StatItem["emphasis"],
  ): StatItem => ({
    value: value && value.trim() ? value.trim().slice(0, 24) : "",
    label,
    ...(emphasis ? { emphasis } : {}),
  });

  // THE SPEC LINE, not a wall of cells. The sample runs ONE delicate hairline-ruled strip
  // under the price — beds · sq ft · lot · $/sq ft · type. Ours ran two chunky rows of
  // three, every cell the same weight, so "$209/Sq Ft" (which wins a listing argument) sat
  // at exactly the same size as "Type: Residential" (which nobody reads).
  //
  // `$/Sq Ft` is emphasised BECAUSE IT IS THE ARGUMENT, and `Type` is muted because it is
  // context. That is the operator's "numbers by importance", finally sayable.
  // ONE strip, six cells — the whole spec line, in reading order. A second row for the
  // leftovers left a lonely "3.5 Baths" floating on its own, which looks like a mistake
  // because it IS one: an orphan row is what you get when the layout has no way to rank
  // its cells and just spills them.
  const specs: StatItem[] = [
    spec(facts.beds, "Beds"),
    spec(facts.baths, "Baths"),
    spec(withCommas(facts.sqft), "Sq Ft"),
    spec(facts.lotSize, "Lot"),
    spec(pricePerSqft(facts.price, facts.sqft), "$/Sq Ft", "primary"),
    spec(shortType(facts.propertyType) || undefined, "Type", "muted"),
  ];
  push(
    {
      id: createBlock("stats").id,
      type: "stats",
      props: {
        stats: specs,
        variant: "strip",
        // The provenance of the one DERIVED cell, stated where the reader can see it.
        ...(pricePerSqft(facts.price, facts.sqft)
          ? { footnote: "*Computed from list price ÷ listed square footage." }
          : {}),
      },
    },
    3,
  );

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
