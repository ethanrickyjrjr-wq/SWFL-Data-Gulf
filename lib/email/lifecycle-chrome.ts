// lib/email/lifecycle-chrome.ts
//
// THE ONE LOOK OF A LISTING CAMPAIGN.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
// Operator, 07/13/2026: *"This one is a 6 or 7 email campaign that a user can start from
// the first one and … have the campaign run on scheduled email deliveries releasing each
// new email at different points in the sales process. So, each email would have the same
// look, just different information. I want to make sure that is the case."*
//
// It was not the case. Seven lifecycle emails, SEVEN DIFFERENT LAYOUTS:
//
//   new-listing     header · RIBBON · photo · hero(center) · ONE 6-cell STRIP · text · …
//   coming-soon     header · photo · hero(LEFT) · stats[3] · stats[3] · text · …
//   market-comps    header · hero(LEFT) · photo · stats[3] · stats[2] · chart · list · …
//   under-contract  header · photo · hero(LEFT) · stats[3] · stats[3] · stats[3] · stats[1]
//   just-sold       header · photo · hero(LEFT) · stats[3] · stats[3] · text · list · …
//   open-house      header · photo · hero(LEFT) · stats[2] · stats[3] · text · cta · card · …
//   price-reduced   header · hero(LEFT) · stats[2] · photo · stats[3] · stats[3] · NO card
//
// Each was built by a different worker, in a different file, with its own idea of a layout —
// because there was nothing to build ONTO. A subscriber walking the campaign from Coming
// Soon to Sold would have received seven emails that looked like seven different companies.
// That is not a campaign. It is a pile.
//
// ── THE CONTRACT ────────────────────────────────────────────────────────────
//
// EVERY listing-lifecycle email is THIS, in THIS order:
//
//   header · RIBBON · photo · hero(centred, address over price) · spec strip
//          · [the recipe's own middle] · narrative · [agent card | CTA] · footer
//
// A recipe may change: the RIBBON WORD, the hero numbers, which spec cells, its own MIDDLE
// blocks (a comps chart, a scarcity funnel, a sold-comps list), and the CTA. **It may not
// change the chrome.** That is the point — the chrome is what makes six emails read as one
// campaign from one agent.
//
// ── THE ONE MULTI-COLUMN ROW (Phase 4, 07/14/2026) ──────────────────────────
//
// The agent card and the CTA share a row — `{7,5}`. Everything else is full-bleed, and
// that is a DECISION, not an oversight. Two rows were rejected on the evidence:
//
//   photo + hero `{7,5}` — a listing flyer's grammar on PAPER, which is 8.5in wide. At 600px
//   it drops the photo to ~350px (the photo IS the product) and wraps "326 Shore Dr, Fort
//   Myers Beach, FL 33931" over four lines in a ~250px column, so the price stops reading as
//   a headline. The flat full-bleed photo wins at this width.
//
// Adding a column here is one line — `newRow: false`. That is deliberately easy and
// deliberately load-bearing: see `lifecycle-chrome.test.ts`, which pins this row's shape AND
// pins the photo/hero as full-bleed, so a future session re-litigates the design in the open
// instead of drifting into it.
//
// BRAND IS STICKY AND UNTOUCHED. globalStyle, the header, the agent card and the footer are
// lifted from whatever is on the canvas, so a user's colours and identity ride through every
// email in the campaign automatically. The chrome is the SHAPE; the brand is the SKIN.
//
// Enforced by lifecycle-chrome.test.ts — a recipe that drifts fails the suite.

import { stripBannedCells } from "@/lib/deliverable/cell-policy";
import { createBlock } from "./doc/default-docs";
import { finalizeDoc } from "./doc/finalize-doc";
import type { PlanEntry } from "./doc/finalize-doc";
import { GRID_COLS } from "./grid-schema";
import { heroPhotoBlock } from "./inject-photo";
import type { EmailBlock, EmailDoc, StatItem } from "./doc/types";

/** A block a recipe contributes to its own MIDDLE or TAIL, plus the row height it wants.
 *  A recipe says WHAT and HOW TALL. It does not say WHERE — `finalizeDoc` owns x/y, and
 *  this type is why a recipe can no longer smuggle a position in a fake `layout` literal. */
export interface ChromeBlock {
  block: Omit<EmailBlock, "layout">;
  /** Row height, 1–6. Omitted → the chrome's default for that slot. */
  height?: number;
}

// ── THE EDITORIAL PALETTE IS DELETED. DO NOT BRING IT BACK. ──────────────────
//
// It was `{ primaryColor: "#0A2A2C", accentColor: "#B98F45", fontFamily: BOOK_SERIF,
// displayFontFamily: PLAYFAIR_SERIF, textColor: "#23302F", backdropColor: "#EFE9DD" }`,
// applied whenever the incoming doc was judged "a blank brand" — and the SWFL house brand
// counted as blank, so it stomped OUR OWN LOOK on every listing email.
//
// **Measured in a real rendered email, 08/05/2026: our teal `#3DC9C0` appeared ZERO times.
// The editorial gold appeared 7 times, `#0A2A2C` 11 times, and every single font declaration
// was Georgia/Times serif.** Operator, twice now — 08/03: *"fonts suck not our brand
// colors"*; 08/05: *"where the fuck are our fucking brand color... is this the right font?"*
// The 08/03 fix only protected a USER brand that happened to share our teal; ours still lost.
//
// It never should have existed. `DEFAULT_GLOBAL_STYLE` IS the brand — `#0f1d24` (gulf-deep),
// `#3DC9C0` (gulf-teal), MODERN_SANS — the exact values in `app/_design/05-color-and-type.md`.
// And our own design research (07/01/2026, `_RESEARCH/deliverable-and-design/`) already
// prescribed the rule this violated: hardcode the STRUCTURE, then apply the brand hue WITHIN
// it. Replacing a palette wholesale is the failure mode that research names.
//
// A blank brand is not an invitation to invent one. It renders in ours.

export interface LifecycleChrome {
  /** The ACCENT RIBBON word — the one thing that tells a reader which email this is.
   *  "Coming Soon" · "New Listing" · "Open House" · "Price Improved" · "Under Contract" ·
   *  "Just Sold" · "Market Comps". */
  ribbon: string;

  /** The photo. `null` = an OPEN SLOT (a dropzone on the canvas, absent from the email).
   *  Never a stock image, never a refusal. */
  photo: { url: string; alt: string; linkUrl?: string } | null;

  /** The hero. The ADDRESS leads and the PRICE is the headline number under it — that is
   *  how a listing flyer reads. An empty value is an open slot, never a zero. */
  heroValue: string;
  heroLabel: string;
  /** A small accent line ABOVE the price, in the accent colour — price-reduced's
   *  "PRICE CUT $104,975" (operator ruling). Absent on every other recipe. */
  heroKicker?: string;

  /** The spec strip — ONE hairline row, in reading order. Mark the cell that WINS THE
   *  ARGUMENT `emphasis: "primary"` and the context cell `"muted"`. */
  specs: StatItem[];
  specFootnote?: string;

  /** THE PROPERTY'S OWN MARKETING DESCRIPTION, VERBATIM — the seller's or listing agent's
   *  words about the house, NOT anything we wrote.
   *
   *  *** THIS IS A DIFFERENT SLOT FROM `narrative` AND THAT IS THE WHOLE POINT. ***
   *  It is emitted with `descriptionSlot: true`, which is the marker `clearNarrativeSlots`
   *  and `fillNarrative` (recipes/shared.ts) BOTH check — so the authored paragraph can
   *  never blank it and can never be written into it. Before this existed the chrome passed
   *  the raw remarks in as `narrative`, and the recipe then cleared that very slot and wrote
   *  the model's paragraph over it: the description — the biggest copy-quality lever in a
   *  listing email, and the one thing §1.9 gives a word-budget carve-out to — never reached
   *  a reader at all. The recipe kept the remarks only as the narrator's SOURCE.
   *
   *  Undefined or "" = no description held → the slot is not emitted at all (never an
   *  empty box, never a placeholder pretending to be the seller's words). */
  description?: string;

  /** THE RECIPE'S OWN CONTENT — a comps chart, a scarcity funnel, a sold-comps list.
   *  This is where the emails legitimately differ. Rides between the strip and the prose. */
  middle?: ChromeBlock[];

  /** The narrative slot's body. "" = an open slot (canvas placeholder, absent from email).
   *  The narrator writes here, and only when it has a real source. */
  narrative?: string;

  /** The CTA. It must ask for the NEXT ACTION — never point at what the reader is already
   *  looking at ("See the New Price" on an email whose whole job is the new price). */
  ctaLabel: string;
  ctaUrl?: string;

  /** Blocks that ride after the narrative — a sources list. NOTE: `sources` is a CLOSE-zone
   *  block, so the seam's zone fence lands it just above the footer (where the design system
   *  says sources go, and where the AI author has always put them) rather than mid-email. */
  tail?: ChromeBlock[];
}

/** Reuse the current doc's block of a type (identity/brand is STICKY), else a fresh one. */
function keepOrDefault(current: EmailDoc, type: EmailBlock["type"]): EmailBlock {
  return current.blocks.find((b) => b.type === type) ?? createBlock(type);
}

// `docIsBlankBrand` is DELETED along with the palette it gated. It answered "may I replace
// this brand?" and the answer is now always NO, so the question no longer needs asking.
// A doc arrives with a brand — the user's, or ours — and that brand is what renders.

/** One thing the chrome says: WHAT, HOW TALL, HOW WIDE, and whether it opens a new row.
 *  It still cannot write an x or a y — `finalizeDoc` alone decides WHERE. `newRow: false`
 *  is the entire vocabulary for "put me beside the last block"; `groupIntoRows` breaks on
 *  it, and the seam snaps the resulting pair onto a blessed multiset. */
function cell(
  block: Omit<EmailBlock, "layout">,
  height: number,
  span: number,
  newRow: boolean,
  isStatic?: true,
): PlanEntry {
  return {
    id: block.id,
    type: block.type,
    props: block.props as Record<string, unknown>,
    span,
    newRow,
    height,
    ...(isStatic ? { isStatic: true } : {}),
  };
}

/** A full-bleed row — the chrome's default, and still what most of it is. */
function row(block: Omit<EmailBlock, "layout">, height: number, isStatic?: true): PlanEntry {
  return cell(block, height, GRID_COLS, true, isStatic);
}

/**
 * THE ONE LAYOUT. Every listing-lifecycle email is built by this function, so six emails
 * arriving over six weeks read as one campaign from one agent.
 *
 * Never refuses (RULE 0.7): a missing photo is a dropzone, a missing cell is an open slot,
 * a missing narrative is an instruction. Never a zero, never invented.
 */
export function buildLifecycleEmail(current: EmailDoc, chrome: LifecycleChrome): EmailDoc {
  // THE BRAND ON THE DOC IS THE BRAND THAT RENDERS. No exceptions, no substitution, no
  // "blank enough to overwrite" test. A user's brand is theirs; an unset one is OURS
  // (`DEFAULT_GLOBAL_STYLE` = gulf-deep `#0f1d24`, gulf-teal `#3DC9C0`, MODERN_SANS).
  // See the deleted-palette note at the top of this file for what this replaced and why.
  const globalStyle = { ...current.globalStyle };

  const entries: PlanEntry[] = [];

  // 1. HEADER — the agent's own, sticky.
  entries.push(row(keepOrDefault(current, "header"), 2));

  // 2. THE RIBBON — a full-width accent band. This is the campaign's spine: the ONE element
  //    that is identical in shape and different in word across all seven emails.
  entries.push(
    row(
      { id: createBlock("hero").id, type: "hero", props: { kicker: chrome.ribbon, ribbon: true } },
      1,
    ),
  );

  // 3. THE PHOTO — the real one, else an open slot (a canvas dropzone, absent from the email).
  entries.push(
    row(
      chrome.photo
        ? heroPhotoBlock(chrome.photo)
        : {
            id: createBlock("image").id,
            type: "image",
            props: { url: "", kind: "photo", alt: chrome.heroLabel || "Featured property" },
          },
      6,
    ),
  );

  // 4. THE HERO — centred, ADDRESS over PRICE, the price in the accent colour.
  entries.push(
    row(
      {
        id: createBlock("hero").id,
        type: "hero",
        props: {
          align: "center",
          order: "label-first",
          value: chrome.heroValue,
          label: chrome.heroLabel,
          ...(chrome.heroKicker ? { kicker: chrome.heroKicker } : {}),
        },
      },
      4,
    ),
  );

  // 5. THE SPEC STRIP — one hairline row. Emphasis says which number matters.
  if (chrome.specs.length > 0) {
    entries.push(
      row(
        {
          id: createBlock("stats").id,
          type: "stats",
          props: {
            stats: chrome.specs,
            variant: "strip",
            ...(chrome.specFootnote ? { footnote: chrome.specFootnote } : {}),
          },
        },
        3,
      ),
    );
  }

  // 5b. THE PROPERTY'S OWN DESCRIPTION — the seller's words, verbatim, in their own block,
  //     directly under the specs where a reader looks after the photo and the price.
  //
  //     Emitted ONLY when we actually hold one. An absent description is not an open slot
  //     here: an empty box captioned "About this home" is a promise we did not keep, and
  //     unlike a spec cell there is nothing a user could type into it that would be the
  //     SELLER'S words. Absent → no block at all.
  //
  //     `descriptionSlot: true` is load-bearing, not decorative — it is the exact flag
  //     `clearNarrativeSlots` skips and `fillNarrative` refuses to write into, which is what
  //     lets this coexist with the authored paragraph two blocks below instead of being
  //     overwritten by it.
  const description = chrome.description?.trim();
  if (description) {
    entries.push(
      row(
        {
          id: createBlock("text").id,
          type: "text",
          props: { body: description, align: "left", descriptionSlot: true },
        },
        5,
      ),
    );
  }

  // 6. THE RECIPE'S OWN CONTENT — the only place the emails legitimately diverge.
  for (const m of chrome.middle ?? []) entries.push(row(m.block, m.height ?? 5));

  // 7. THE NARRATIVE — "" is an OPEN SLOT: an instruction on the canvas, absent from the
  //    sent email. The narrator writes here only when it has a real source.
  entries.push(
    row(
      {
        id: createBlock("text").id,
        type: "text",
        props: { body: chrome.narrative ?? "", align: "left" },
      },
      4,
    ),
  );

  // The tail is a sources list — a CLOSE-zone block. The seam sorts it above the footer.
  for (const t of chrome.tail ?? []) entries.push(row(t.block, t.height ?? 3));

  // 8+9. THE AGENT AND THE ASK — ONE ROW, NOT TWO.
  //
  // These were two stacked full-width cards carrying ONE idea: "here's me, here's the ask."
  // `{7,5}` is a blessed pair (BLESSED_ROW_SPANS[2]), so the seam honours it exactly rather
  // than snapping it.
  //
  // WHY {7,5} AND NOT {8,4} — this was settled by RENDERING it, not by taste. At {8,4} the CTA
  // column is 200px, and the button is shrink-to-fit inside it: "RSVP for the Open House" broke
  // over THREE lines while the agent card sat in empty space. A cramped three-line button is
  // worse than the full-width button it replaced — the CTA is the most important click in the
  // email. At {7,5} (350/250) the worst label in the campaign is two clean lines. If you add a
  // recipe with a longer CTA, RENDER IT AND LOOK before you ship it.
  //
  // WHY THIS IS SAFE AT EVERY WIDTH — the hybrid columns the compiler emits stack in SOURCE
  // ORDER on a phone (cerberusemail.com/hybrid-responsive, re-verified in-session 07/14/2026).
  // So the agent card leads and the CTA follows: the exact order a phone shows TODAY. The CTA
  // must therefore stay SECOND — reversing these two lines would put the ask above the agent on
  // every phone.
  //
  // MEASURED ON A PHONE, not assumed (392px viewport, 07/14/2026): the stacked CTA column is
  // capped at its 250px `max-width` — it does NOT go full-bleed — and the button inside renders
  // 202×70px, centred. That is well clear of the 44px minimum tap target, and it is a LARGER
  // target than the single-line button it replaced, because the label wraps to two lines. Good,
  // but not free: if you ever narrow this column, you are shrinking the most important click in
  // the email on the device where most email is opened. Re-measure, don't assume.
  //
  // THE BUTTON IS ALWAYS EMITTED; ITS DESTINATION IS NOT.
  //
  // §1.8 — "a listing button may never fall back to the homepage; no real link means no
  // button" — is enforced by the DESTINATION, not by deleting the block. The block has to
  // survive because this same grid is the canvas the user edits and the frozen seed card
  // (`SEED_DOCS`, pinned by `seed-recipe-parity.test.ts`) is "this flyer unfilled" — a
  // starter template with no CTA to edit is a worse product than one with an empty one.
  //
  // What changed 08/05/2026 is the value, and that was the actual defect: the flyer used to
  // pass `facts.sourceUrl` here, which `resolve-subject.ts` hardcodes to swfldatagulf.com, so
  // every address-resolved listing email shipped "View the Full Listing" pointing at our HOME
  // PAGE. It now passes a REAL listing url or NOTHING, and `role: "listing"` (whose
  // `usesWebsiteDefault` and `usesHouseFallback` are both false) is what guarantees an
  // unresolved slot is never quietly backfilled with our site.
  entries.push(cell(keepOrDefault(current, "agent-card"), 4, 7, true));
  entries.push(
    cell(
      {
        id: createBlock("button").id,
        type: "button",
        // role `listing`. THE HIGHEST-TRAFFIC BUTTON EMITTER IN THE REPO — all 7
        // listing lifecycle recipes ship their ask through this one cell, and the
        // button-links handoff missed it entirely (it enumerated 6 emitters under
        // lib/deliverable/recipes/ and never looked here). A lifecycle flyer is about
        // ONE house, so its ask must never silently degrade to a homepage or to our
        // own page: role `listing` sets usesWebsiteDefault AND usesHouseFallback
        // false, and an unresolved slot keeps whatever the chrome set — never blanked.
        props: {
          role: "listing",
          label: chrome.ctaLabel,
          ...(chrome.ctaUrl ? { url: chrome.ctaUrl } : {}),
        },
      },
      2,
      5,
      false, // ← THE LEVER. Not the span: this is what puts it BESIDE the agent card.
    ),
  );

  // NO SEPARATE SOCIAL BLOCK HERE — THE FOOTER ALREADY OWNS THE LINKS.
  //
  // Operator 08/05/2026 asked for "contact info, social links, the whole look" at the bottom,
  // and the first cut added a `social-icons` row to this spine. That was a SECOND root for a
  // thing we already have: `FooterBlock` renders company, address, phone, email, the
  // unsubscribe AND the registry-mapped socials (icon + text, ordered by `socialOrder`), all
  // off `lib/email/social/platforms.ts` — the ONE platform root. Adding a block would have
  // duplicated the links on every listing email and split the root in two.
  //
  // The bottom looked bare in the 08/05 preview for a different reason: it was rendered
  // against an EMPTY brand, so the agent card had no photo and no phone and the footer had no
  // social URLs to render. Those are brand-profile values (`AgentCardProps` has carried
  // `photoUrl` and `phone` all along). The fix is filling the brand, not adding a block.

  // 10. THE FOOTER — sticky, CAN-SPAM, locked so a drag can't move the unsubscribe.
  entries.push(row(keepOrDefault(current, "footer"), 3, true));

  // THE CELL-POLICY BACKSTOP (operator decree 08/18/2026 — no cost cell on any
  // buyer-facing email). Every stats block the chrome assembled — the spec strip AND
  // anything a recipe rode in through `middle`/`tail` — passes through the ONE registry
  // (lib/deliverable/cell-policy.ts) before layout. A banned cell cannot render on a
  // lifecycle email, whichever recipe emitted it, including recipes written after this
  // line. A block the policy empties is dropped whole — never an empty box. Recipes
  // should still not EMIT banned cells (the fleet test in cell-policy.test.ts enforces
  // that at authoring level); this is the render-time guarantee that survives a recipe
  // nobody walked.
  const swept: PlanEntry[] = [];
  for (const e of entries) {
    if (e.type !== "stats") {
      swept.push(e);
      continue;
    }
    const stats = stripBannedCells((e.props.stats as StatItem[] | undefined) ?? []);
    if (stats.length === 0) continue;
    swept.push({ ...e, props: { ...e.props, stats } });
  }

  // THE SEAM. The chrome named the blocks and their heights; the layout root alone decides
  // where they land. This function cannot write an x or a y, and that is the point.
  return finalizeDoc({ globalStyle, entries: swept });
}

/** The chrome's block sequence, for the coherence test. A lifecycle email that does not
 *  match this — in this order — is not part of the campaign, however good it looks alone. */
export const LIFECYCLE_SPINE = [
  "header",
  "hero:ribbon",
  "image:photo",
  "hero:subject",
  "stats:strip",
  // …the recipe's own middle blocks may appear here…
  "text",
  // …the agent card and the CTA share ONE row — agent-card `{7}` then button `{5}`. They are
  // listed in source order, which is also the order a phone stacks them in.
  "agent-card",
  "button",
  // …and its tail (a sources list) lands HERE — the seam's zone fence sorts CLOSE-zone
  // blocks below the body, so sources sit just above the footer. Same place the AI author
  // has always put them. One rule, both paths.
  "footer",
] as const;
