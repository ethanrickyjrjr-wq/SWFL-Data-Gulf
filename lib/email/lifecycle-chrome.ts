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

import { createBlock, DEFAULT_GLOBAL_STYLE } from "./doc/default-docs";
import { finalizeDoc } from "./doc/finalize-doc";
import type { PlanEntry } from "./doc/finalize-doc";
import { GRID_COLS } from "./grid-schema";
import { heroPhotoBlock } from "./inject-photo";
import type { EmailBlock, EmailDoc, FontFamily, StatItem } from "./doc/types";

/** A block a recipe contributes to its own MIDDLE or TAIL, plus the row height it wants.
 *  A recipe says WHAT and HOW TALL. It does not say WHERE — `finalizeDoc` owns x/y, and
 *  this type is why a recipe can no longer smuggle a position in a fake `layout` literal. */
export interface ChromeBlock {
  block: Omit<EmailBlock, "layout">;
  /** Row height, 1–6. Omitted → the chrome's default for that slot. */
  height?: number;
}

/** Editorial fallback palette — applied ONLY when the incoming brand is still the house
 *  default (a blank brand). A REAL USER BRAND CARRIES THROUGH UNTOUCHED. */
const EDITORIAL_STYLE = {
  primaryColor: "#0A2A2C",
  accentColor: "#B98F45",
  fontFamily: "BOOK_SERIF" as FontFamily,
  displayFontFamily: "PLAYFAIR_SERIF" as FontFamily,
  textColor: "#23302F",
  backdropColor: "#EFE9DD",
};

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
  // BRAND-OR-OURS: keep a real user brand; fall back to the editorial palette only when the
  // incoming style is still the house default (a blank brand).
  const brandIsHouse = current.globalStyle.accentColor === DEFAULT_GLOBAL_STYLE.accentColor;
  const globalStyle = brandIsHouse
    ? { ...current.globalStyle, ...EDITORIAL_STYLE }
    : { ...current.globalStyle };

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
  entries.push(cell(keepOrDefault(current, "agent-card"), 4, 7, true));
  entries.push(
    cell(
      {
        id: createBlock("button").id,
        type: "button",
        props: { label: chrome.ctaLabel, ...(chrome.ctaUrl ? { url: chrome.ctaUrl } : {}) },
      },
      2,
      5,
      false, // ← THE LEVER. Not the span: this is what puts it BESIDE the agent card.
    ),
  );

  // 10. THE FOOTER — sticky, CAN-SPAM, locked so a drag can't move the unsubscribe.
  entries.push(row(keepOrDefault(current, "footer"), 3, true));

  // THE SEAM. The chrome named the blocks and their heights; the layout root alone decides
  // where they land. This function cannot write an x or a y, and that is the point.
  return finalizeDoc({ globalStyle, entries });
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
