// lib/email/doc/saved-layout.ts
//
// THE PERSONAL LAYOUT — "build 12345 Street the same way I built 123 Street."
//
// Operator, 07/13/2026: *"WHATEVER THEY MAKE, THAT IS HOW IT SAVES… IF IT IS 123
// STREET, WE BUILD 12345 STREET THE SAME WAY WITH EVERY GRID THE SAME — BUT WITH
// DATA AND COMMENTARY FOR 12345 STREET."*
//
// WHY THIS FILE EXISTS. A recipe's grid is BUILT IN CODE every time
// (`buildListingFlyer` → `buildLifecycleEmail`), and that coded builder is what
// guarantees the real photo, the sourced cells and the no-invention gate. Nothing
// ever persisted the user's own version of that grid, so every build started over.
// This module does NOT replace the builder — it reshapes the builder's fresh,
// data-correct output into the shape the user already chose.
//
// ── THE ONE RULE: SHAPE IS YOURS, CONTENT IS ALWAYS FRESH OR EMPTY ────────────
//
// A saved layout contributes ONLY shape: which blocks, in what order, at what grid
// spans, in what style. It contributes NO content — not one figure, not one
// sentence, not one photo. Content on a reshaped block comes from the fresh build
// (which sourced it for the NEW subject) or it is left EMPTY (an open slot, the
// canvas affordance this codebase already uses everywhere for "unsourced").
//
// That rule is what makes "NOT WITH THE SAME INFORMATION" a structural guarantee
// instead of a promise: `CONTENT_KEYS` are never copied from the saved doc, so no
// value from the old house can physically survive into the new email. The leak test
// (`saved-layout.test.ts`) asserts it over a doc whose every content field is
// poisoned with the old listing's data.
//
// ── MATCHING: BY ROLE, NOT BY ID ─────────────────────────────────────────────
// Block ids are minted RANDOM per build (`mintBlockId`), so a saved block and its
// counterpart in a fresh build never share one. The stable key is the block's ROLE:
// its type plus its ordinal among blocks of that type ("the 2nd hero" = the
// price/address hero; "the 1st hero" = the ribbon). Same builder → same role
// sequence → a reliable match.

import type { EmailBlock, EmailDoc } from "./types";

/**
 * Every prop that carries CONTENT — the stuff that is ABOUT the subject and must
 * therefore be re-sourced for each new one. Never carried across a build.
 *
 * Union of the two field sets build-doc.ts already governs:
 *   • TEXT_KEYS       — what the AI writes (kicker, value, label, prose, body…)
 *   • HELD_FIGURE_KEYS — the sourced figures it may read but never write
 *                        (price, beds, baths, sqft, address, metricValue…)
 * …plus the media/link/array fields that are equally subject-bound: a photo `url`
 * of the old house, a button `url` deep-linking the old listing, the `stats` cells,
 * a `list`'s rows, a `multi-column`'s cards, and the `sources` citations (which cite
 * the OLD build's figures — carrying them would attach real sources to absent numbers).
 *
 * Anything NOT in this set is SHAPE and carries: colors, bands, padding, ratios,
 * variants, the header/footer brand, `kind`, `emphasis`, `ribbon`, `static`.
 */
export const CONTENT_KEYS = [
  // TEXT_KEYS (build-doc.ts:348)
  "kicker",
  "value",
  "label",
  "prose",
  "title",
  "body",
  "caption",
  "alt",
  "tagline",
  // HELD_FIGURE_KEYS (build-doc.ts:367)
  "metricValue",
  "metricLabel",
  "sub",
  "rankText",
  "movementText",
  "price",
  "beds",
  "baths",
  "sqft",
  "address",
  "badge",
  // Media, links and array-shaped content — subject-bound all the same.
  "url",
  "linkUrl",
  "photos",
  "stats",
  "items",
  "columns",
  "citations",
] as const;

const CONTENT_SET: ReadonlySet<string> = new Set(CONTENT_KEYS);

/**
 * BRAND CHROME — blocks that are about the AGENT, never about the subject. Their
 * props carry WHOLESALE (no content/shape split), because the split would maim them:
 *
 *   • `footer.address` is the CAN-SPAM business postal address — the same key name
 *     the hero uses for the LISTING's street address. Treating it as content deletes
 *     a legally required field from every commercial email (lib/email/CLAUDE.md:
 *     four actual CAN-SPAM requirements).
 *   • `agent-card.tagline` / the header's company name are the user's own words about
 *     themselves. Re-authoring those per listing is not "fresh content", it is
 *     wiping their identity.
 *
 * These are the same blocks every recipe builder already treats as STICKY (lifted
 * from `currentDoc`, never authored). This list keeps that doctrine intact here.
 */
const BRAND_BLOCK_TYPES: ReadonlySet<string> = new Set([
  "header",
  "footer",
  "agent-card",
  "agent-hero",
  "social-icons",
]);

/** A block's stable identity across builds: type + ordinal among its own type. */
export function roleKey(type: string, ordinal: number): string {
  return `${type}#${ordinal}`;
}

/** Index a doc's blocks by role ("hero#0", "hero#1", "image#0"…). */
export function blocksByRole(doc: EmailDoc): Map<string, EmailBlock> {
  const seen = new Map<string, number>();
  const out = new Map<string, EmailBlock>();
  for (const b of doc.blocks) {
    const n = seen.get(b.type) ?? 0;
    seen.set(b.type, n + 1);
    out.set(roleKey(b.type, n), b);
  }
  return out;
}

/** The shape half of a block's props — every content field removed. */
function shapeProps(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) if (!CONTENT_SET.has(k)) out[k] = v;
  return out;
}

/** The content half of a block's props — only content fields. */
function contentProps(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) if (CONTENT_SET.has(k)) out[k] = v;
  return out;
}

interface StatCell {
  value?: string;
  label?: string;
  emphasis?: string;
}

/**
 * A stats block is the one place where CONTENT and SHAPE live in the same array.
 * `stats: [{value:"3", label:"Beds"}, …]` — the VALUES are the listing's (fresh every
 * time), but WHICH CELLS EXIST, in what order, at what emphasis, is grid setup: if a
 * user deletes the "$/Sq Ft" cell and puts "Lot" first, that is exactly the thing they
 * are asking us to remember. Replacing the array wholesale would hand their cells back
 * every build.
 *
 * So: the user's cell SET and ORDER, each cell's value re-sourced from the fresh build
 * BY LABEL. A cell whose label the new build has no figure for becomes an OPEN SLOT
 * (empty value) — never carried over, never invented.
 */
function reconcileStats(savedStats: unknown, freshStats: unknown): StatCell[] | undefined {
  if (!Array.isArray(savedStats))
    return Array.isArray(freshStats) ? (freshStats as StatCell[]) : undefined;
  const fresh = (Array.isArray(freshStats) ? freshStats : []) as StatCell[];
  const norm = (s?: string) => (s ?? "").trim().toLowerCase();

  return (savedStats as StatCell[]).map((cell) => {
    const match = fresh.find((f) => norm(f.label) === norm(cell.label));
    return {
      ...cell, // their label, their emphasis, their position
      value: match?.value ?? "", // the NEW listing's figure, or an open slot
    };
  });
}

/**
 * STRIP A DOC TO A LAYOUT. What gets persisted when a user saves their build as
 * their default: the grid they made, with every trace of the listing it was made
 * for removed at the moment of saving.
 *
 * Stripping at SAVE time (as well as never copying content at APPLY time) is
 * belt-and-suspenders on purpose: the row in the database should not hold the old
 * house's price even briefly, because a stored figure is one careless `...spread`
 * away from being rendered.
 */
export function stripToLayout(doc: EmailDoc): EmailDoc {
  return {
    ...doc,
    subjectVariants: undefined,
    ctaVariants: undefined,
    blocks: doc.blocks.map((b) => {
      if (BRAND_BLOCK_TYPES.has(b.type)) return b;
      const props = b.props as Record<string, unknown>;
      const shape = shapeProps(props);
      // A stats block's CELLS are shape (which cells, in what order, at what emphasis)
      // while their VALUES are the listing's. Keep the cells, blank the figures — or a
      // stripped layout would forget the cell set the user built and hand them the
      // builder's cells back on the next build.
      if (b.type === "stats" && Array.isArray(props.stats)) {
        shape.stats = (props.stats as StatCell[]).map((c) => ({ ...c, value: "" }));
      }
      return { ...b, props: shape } as EmailBlock;
    }),
  };
}

/**
 * THE RESHAPE. `fresh` is the coded builder's output for the NEW subject — correct
 * photo, sourced cells, authored commentary, chart policy honored. `layout` is the
 * user's saved shape. Returns the fresh build wearing the user's grid.
 *
 * Per block in the SAVED order:
 *   • a fresh counterpart exists (same role) → the user's shape + the FRESH content.
 *     This is the 90% case: they reordered, resized, restyled, recolored.
 *   • no counterpart (a block the user ADDED) → their block, content cleared. An
 *     OPEN SLOT — the canvas affordance for "unsourced", never a zero, never the
 *     last house's sentence.
 *   • a fresh block with no saved counterpart (one the user DELETED) → stays deleted.
 *     They took it out; "every grid the same way" means it does not come back.
 *
 * `globalStyle` is the user's. Ids are the user's (unique within their doc, and the
 * fresh ids were random anyway).
 *
 * Pure. No I/O, no model call, invents nothing.
 */
export function applySavedLayout(fresh: EmailDoc, layout: EmailDoc): EmailDoc {
  const freshByRole = blocksByRole(fresh);
  const seen = new Map<string, number>();

  const blocks = layout.blocks.map((saved) => {
    const n = seen.get(saved.type) ?? 0;
    seen.set(saved.type, n + 1);
    const counterpart = freshByRole.get(roleKey(saved.type, n));

    // Brand chrome carries whole — and prefers the FRESH copy when one exists,
    // because the builder lifted that from the live canvas (their brand as it is
    // TODAY), which beats a brand frozen into a layout saved weeks ago. No
    // counterpart → their saved chrome stands; never cleared (a footer with no
    // postal address is a CAN-SPAM violation, not an open slot).
    if (BRAND_BLOCK_TYPES.has(saved.type)) {
      return {
        ...saved,
        props: counterpart ? counterpart.props : saved.props,
        ...(saved.layout ? { layout: saved.layout } : {}),
      } as EmailBlock;
    }

    // The user's shape, always. The fresh build's content, or none at all — a
    // content key is NEVER read off `saved`, which is what makes the no-leak
    // guarantee structural rather than a promise.
    const savedProps = saved.props as Record<string, unknown>;
    const shape = shapeProps(savedProps);
    const content = counterpart ? contentProps(counterpart.props as Record<string, unknown>) : {};

    // The one array where shape and content are interleaved — their cells, the new
    // listing's figures. See reconcileStats.
    if (saved.type === "stats") {
      const stats = reconcileStats(
        savedProps.stats,
        counterpart ? (counterpart.props as Record<string, unknown>).stats : undefined,
      );
      return {
        ...saved,
        props: { ...shape, ...content, ...(stats ? { stats } : {}) },
        ...(saved.layout ? { layout: saved.layout } : {}),
      } as EmailBlock;
    }

    return {
      ...saved,
      props: { ...shape, ...content },
      ...(saved.layout ? { layout: saved.layout } : {}),
    } as EmailBlock;
  });

  return {
    ...fresh,
    globalStyle: layout.globalStyle,
    blocks,
    // Subject/CTA variants were authored for the OLD subject. Drop them; the fresh
    // build's own (if any) ride on `fresh` and are re-authored per subject.
    subjectVariants: fresh.subjectVariants,
    ctaVariants: fresh.ctaVariants,
  };
}
