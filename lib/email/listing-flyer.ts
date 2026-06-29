// lib/email/listing-flyer.ts
//
// Turn scraped ListingFacts into a property FLYER EmailDoc — the layout the old
// builder couldn't produce because it was forbidden to restructure blocks. The
// flyer LEADS with the property (photo → price + address → beds/baths/sqft →
// real description → CTA) but PRESERVES the user's brand + identity (globalStyle,
// the header's company/logo, the footer's CAN-SPAM + socials, the agent card) —
// those are sticky and lifted from the doc currently on the canvas. Pure: returns
// a NEW doc, mutates nothing, invents nothing (a missing spec is simply omitted).

import { createBlock } from "./doc/default-docs";
import { heroPhotoBlock } from "./inject-photo";
import type { EmailBlock, EmailDoc, StatItem } from "./doc/types";
import type { ListingFacts } from "./listing-scrape";

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

export function buildListingFlyer(facts: ListingFacts, current: EmailDoc): EmailDoc {
  const blocks: EmailBlock[] = [];

  // 1. Header — keep the agent's branded header (company, logo, colors).
  blocks.push(keepOrDefault(current, "header"));

  // 2. Hero PHOTO — the real first listing photo, clickable back to the listing.
  if (facts.photos[0]) {
    blocks.push(
      heroPhotoBlock({
        url: facts.photos[0],
        alt: facts.address ?? "Featured property",
        linkUrl: facts.sourceUrl,
      }),
    );
  }

  // 3. Hero — price + address lead the email.
  const addressLine =
    facts.address ?? ([facts.city, facts.state].filter(Boolean).join(", ") || undefined);
  blocks.push({
    id: createBlock("hero").id,
    type: "hero",
    props: {
      kicker: "New Listing",
      ...(facts.price ? { value: facts.price } : {}),
      ...(addressLine ? { label: addressLine } : {}),
    },
  });

  // 4. Stats — beds / baths / sqft. Only the cells we actually have; never a 0.
  const cells: StatItem[] = [];
  if (facts.beds) cells.push({ value: facts.beds, label: "Beds" });
  if (facts.baths) cells.push({ value: facts.baths, label: "Baths" });
  const sqft = withCommas(facts.sqft);
  if (sqft) cells.push({ value: sqft, label: "Sq Ft" });
  if (cells.length) {
    blocks.push({ id: createBlock("stats").id, type: "stats", props: { stats: cells } });
  }

  // 5. Description — the REAL marketing remarks (clamped to the text cap).
  if (facts.remarks) {
    blocks.push({
      id: createBlock("text").id,
      type: "text",
      props: { body: facts.remarks.slice(0, 2000), align: "left" },
    });
  }

  // 6. Agent card — keep the agent's own card if the canvas had one.
  blocks.push(keepOrDefault(current, "agent-card"));

  // 7. CTA → the listing page.
  blocks.push({
    id: createBlock("button").id,
    type: "button",
    props: { label: "See the Listing", url: facts.sourceUrl },
  });

  // 8. Footer — keep the agent's CAN-SPAM footer (address, socials, unsubscribe).
  blocks.push(keepOrDefault(current, "footer"));

  return { globalStyle: { ...current.globalStyle }, blocks };
}
