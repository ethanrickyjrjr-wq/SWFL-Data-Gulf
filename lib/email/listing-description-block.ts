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
 * Insert or REPLACE the description, keyed on its own marker so a scheduled
 * rebuild can never stack two of them (the same discipline `upsertSoldCompsBlock`
 * uses for the comps list).
 *
 * Placement: before the first agent-card / button / footer, so the home's own
 * words sit with the content and never after the sign-off.
 */
export function upsertDescriptionBlock(doc: EmailDoc, block: BlockOf<"text">): EmailDoc {
  const idx = doc.blocks.findIndex(isDescriptionBlock);
  if (idx !== -1) {
    return {
      ...doc,
      blocks: doc.blocks.map((b, i) =>
        i === idx ? ({ id: b.id, type: "text", props: block.props } as BlockOf<"text">) : b,
      ),
    };
  }
  const anchor = doc.blocks.findIndex(
    (b) => b.type === "agent-card" || b.type === "button" || b.type === "footer",
  );
  const blocks = [...doc.blocks];
  blocks.splice(anchor === -1 ? blocks.length : anchor, 0, block);
  return { ...doc, blocks };
}
