// lib/email/doc/blank-canvas.ts
//
// THE ONE "first land is blank" doc (operator decree 08/11/2026, verbatim: *"we
// also can't have builds starting out on prefilled canvases!!! again, this moves
// parts of the build!!! every first land at email labs needs to be fucking
// blank!!!"*).
//
// What was on screen before this: `skeleton-clean-white` — header, photo slot,
// kicker/stat hero, a 3-up stat row, a text block, a button, a footer. The code
// called that "the blank skeleton" and the tests agreed; the operator, looking at
// it, did not, and he is right — seven placeholder blocks are a prefilled canvas.
// Worse, an arrival build lands its own blocks alongside those, which is the "this
// moves parts of the build" he is describing: the layout he ends up looking at is
// not the layout the builder composed.
//
// DO NOT "fix" this by emptying the skeleton seed. `skeleton-clean-white` has three
// other jobs — the server-side seat in build-doc.ts's terminal fallback lane, the
// declared `skeleton:` of the default-grid recipe, and a gallery template — and its
// style is pinned by default-docs.style.test.ts. This is a LANDING doc only, and the
// build engine seats its own skeleton server-side regardless of what the canvas held.
//
// It keeps the skeleton's globalStyle and drops only the blocks, because the build
// engine takes `globalStyle` from the canvas doc it is handed ("the brand on the doc
// is the brand that renders" — build-doc.ts:1426). A bare style object here would
// ship the wrong backdrop and the wrong type into every arrival build.
import { seedById, SEED_DOCS } from "./default-docs";
import type { EmailDoc } from "./types";

/** The canvas every first land opens on: the house style, and nothing in it. */
export function blankCanvasDoc(): EmailDoc {
  const styled = (seedById("skeleton-clean-white") ?? SEED_DOCS[0]).build();
  return { ...styled, blocks: [] };
}

/**
 * THE SEAT A BUILD IS HANDED — blank on screen must not mean blank to the builder.
 *
 * Recipe builders READ the canvas: `keep(currentDoc, "footer")`, `keepOrDefault(
 * currentDoc, "header")`, `brandWebsiteUrl(currentDoc)`, `replyMailtoFrom(
 * currentDoc)`, `brandAgentCard(currentDoc)`. That is how the account brand reaches
 * a build — applyBrand fills the canvas's header/footer, and the builder lifts the
 * values back off them. Hand a builder an EMPTY canvas and those reads all miss:
 * the CTA falls back to the house site instead of the agent's, the reply-to falls
 * back, and the email goes out less signed than the account can sign it.
 *
 * So the emptiness is a LANDING property, not a payload property. The canvas the
 * operator looks at holds nothing; the doc we POST holds the skeleton, carrying the
 * canvas's own globalStyle. Callers apply brand to the result (they already do).
 */
export function seatForBuild(doc: EmailDoc): EmailDoc {
  if (doc.blocks.length > 0) return doc;
  const skeleton = (seedById("skeleton-clean-white") ?? SEED_DOCS[0]).build();
  return { ...skeleton, globalStyle: doc.globalStyle };
}
