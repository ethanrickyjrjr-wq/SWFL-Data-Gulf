// lib/email/listing-description-block.ts
//
// THE HOME'S OWN DESCRIPTION — the real MLS remarks, printed verbatim.
//
// Operator ask (handoff §1, item 3): "then description of the home." This is the
// one part of a comps email that is NOT ours to write. It is the listing agent's
// own copy about a house we have never seen, and it ships as-is or not at all.
//
// ── THREE RULES, EACH ONE A GUARD ────────────────────────────────────────────
//
// 1. VENDOR-VERBATIM. The model never touches this text and never SEES it — it is
//    deliberately absent from `narratorClaims`, so there is no path by which the
//    narrator can paraphrase a description into a claim the claim-gate would then
//    have to catch. Truncation is the only transformation applied.
//
// 2. IT IS NOT A NARRATIVE SLOT. `clearNarrativeSlots` blanks the body of EVERY
//    `text` block and `fillNarrative` writes into the first empty one — so a naive
//    description block is wiped and then overwritten by the narrator. That is the
//    same landmine that shipped 2,000 characters of raw MLS copy on 07/13, pointing
//    the other way. `isDescriptionBlock` makes it identifiable and the recipe
//    inserts it AFTER the narrative pass; the test is the guard that keeps it so.
//
// 3. THE VIRTUAL-STAGING DISCLOSURE RIDES ALONG (handoff §5, operator decree).
//    `truncateDescription` (lib/listings/apify-comps.ts) owns that; it lives there
//    because that is where the vendor text is parsed.

import { mintBlockId } from "./doc/schema";
import { truncateDescription } from "@/lib/listings/apify-comps";
import type { BlockOf, EmailDoc } from "./doc/types";

/** `TextProps` carries no title, so the description cannot be keyed on a reserved
 *  title the way `soldCompsListBlock` is. `descriptionSlot` is that key — declared
 *  on TextProps/TextPropsSchema and deliberately OUTSIDE the AI content-patch
 *  allowlist, so the model can neither set it nor clear it. */
export function isDescriptionBlock(b: EmailDoc["blocks"][number]): b is BlockOf<"text"> {
  return b.type === "text" && (b.props as { descriptionSlot?: boolean }).descriptionSlot === true;
}

/** The EMPTY description slot, reserved in a recipe's chrome so the layout seam mints
 *  its coordinates. A recipe that wants the listing's own copy under the property facts
 *  puts this at the head of its middle; `upsertDescriptionBlock` then fills it IN PLACE.
 *  Spliced-in blocks carry no layout and sink to the bottom of the email — that is the
 *  08/04/2026 defect this exists to make unreachable. */
export function emptyDescriptionSlot(): BlockOf<"text"> {
  return {
    id: `desc-${Math.random().toString(36).slice(2, 10)}`,
    type: "text",
    props: { body: "", align: "left", descriptionSlot: true },
  } as BlockOf<"text">;
}

/** Reserved but never filled → REMOVE it. An empty box is not an open slot, and the
 *  reader must never see a blank panel where a description would have been. */
export function dropEmptyDescriptionSlot(doc: EmailDoc): EmailDoc {
  return {
    ...doc,
    blocks: doc.blocks.filter((b) => !(isDescriptionBlock(b) && !(b.props.body ?? "").trim())),
  };
}

/**
 * The home's own words, cut to fit the render budget.
 *
 * Returns null when there is no real description — including the vendor's literal
 * `<NA>` sentinel, which is what a SOLD record returns in the bulk call. Null means
 * NO BLOCK: an empty description shell is not an open slot, it is a lie about
 * having something to say.
 */
export function buildDescriptionBlock(
  raw: string | null | undefined,
  propertyUrl: string | null | undefined,
): BlockOf<"text"> | null {
  const body = truncateDescription(raw);
  if (!body) return null;
  return {
    id: mintBlockId(),
    type: "text",
    props: {
      body,
      align: "left",
      // Never a fabricated href — an unlinked description is fine, an invented
      // link is the failure the url-lint tripwire exists to catch.
      ...(propertyUrl && /^https?:\/\//i.test(propertyUrl) ? { linkUrl: propertyUrl } : {}),
      descriptionSlot: true,
    },
  } as BlockOf<"text">;
}

/**
 * Fill the RESERVED description slot, or — failing that — insert the block.
 *
 * Keyed on its own marker so a scheduled rebuild can never stack two of them (the same
 * discipline `upsertSoldCompsBlock` uses for the comps list).
 */
export function upsertDescriptionBlock(doc: EmailDoc, block: BlockOf<"text">): EmailDoc {
  // ── THE PATH THAT MATTERS: fill the slot the recipe reserved, IN PLACE.
  // The slot was minted by the layout seam next to the property facts, so filling it
  // keeps those coordinates and the description renders where it was planned to.
  const idx = doc.blocks.findIndex(isDescriptionBlock);
  if (idx !== -1) {
    return {
      ...doc,
      blocks: doc.blocks.map((b, i) =>
        i === idx
          ? ({
              id: b.id,
              type: "text",
              props: block.props,
              ...("layout" in b ? { layout: (b as { layout: unknown }).layout } : {}),
            } as BlockOf<"text">)
          : b,
      ),
    };
  }

  // ── LAST RESORT: the doc reserved no slot.
  //
  // *** ARRAY POSITION IS NOT DOCUMENT POSITION — `layout.y` IS. ***
  // `finalize-doc.ts` is explicit about what an array index is worth here: "a hand-written
  // block with no `layout` sinks to y = 1_000_000 ... the bottom of the content, just above
  // the footer." That is exactly how the listing's own copy shipped BELOW the "Find Out
  // More" button and below "Sources (2)" on 08/04/2026 — the operator read it on his phone
  // and asked why the description was under the footer.
  //
  // So this branch cannot actually place anything, and it does not pretend to. If you are
  // landing here for a real email, reserve the slot in that recipe's chrome with
  // `emptyDescriptionSlot()` instead — that is the fix, not a better index.
  const beforeChrome = doc.blocks.findIndex(
    (b) => b.type === "agent-card" || b.type === "button" || b.type === "footer",
  );
  const blocks = [...doc.blocks];
  blocks.splice(beforeChrome === -1 ? blocks.length : beforeChrome, 0, block);
  return { ...doc, blocks };
}
