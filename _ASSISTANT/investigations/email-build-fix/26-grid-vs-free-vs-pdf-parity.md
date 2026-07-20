# Lane: Grid vs Free vs PDF Parity Investigation
Seed doc under test: new-listing (lib/email/doc/default-docs.ts)
Blocks: header, hero(ribbon), image(photo/ratio), hero(price/address, order:label-first), stats(variant:strip, footnote, emphasis), text, agent-card, button, footer

## Log


## Confirmed structural fact
Free-tier (EmailDocRenderer.tsx) and grid-tier (compile-grid.ts) BOTH call the SAME
`BlockRenderer.tsx` switch for every block's inner content (compile-grid.ts:90,146 —
`createElement(BlockRenderer, ...)`). So free vs grid are field-identical by construction;
they only differ in row/column wrapping and `colPx` (stats-only, and only when a block sits
in a multi-col row — a single full-bleed row passes no colPx on either engine, so new-listing's
blocks are byte-identical between free and grid). The 06/29 empty-<Head> web-font gap between
free/grid is CLOSED (shared email-head.ts, per docs/standards/emails.md).

PDF is the ONLY divergent engine: lib/pdf/email-doc-pdf.tsx has its OWN `PdfBlock` switch,
independently hand-authored per block type, that does NOT reuse HeroBlock/StatsBlock/ImageBlock.
The file's own header comment claims a "FIDELITY CONTRACT: every block type ... must render
here too, with every field" and cites an audit test — I read that test
(lib/pdf/__tests__/email-doc-pdf.test.ts) and confirmed via grep it only proves each block
TYPE renders (doesn't return null) — it never asserts individual FIELDS (ribbon/order/variant/
footnote/emphasis/overlay*) survive. The claim is false at the field level.

## Traced seed: new-listing (subject: address — the exact seed implicated in tonight's bug)
Blocks: header, hero(ribbon), image(photo,ratio), hero(price/address label-first), 
stats(strip,footnote,emphasis), text, agent-card, button, footer.

### hero block — PdfBlock "hero" case (email-doc-pdf.tsx:126-177)
Only reads: kicker, value, label, prose. Does NOT read: `ribbon`, `order`, `align`, `sectionBg`,
`linkUrl`.
- HeroBlock.tsx (free+grid) special-cases `ribbon:true` as a colored accent BANNER
  (HeroBlock.tsx:41-57) and, when there's no value/label/prose, renders RIBBON-ONLY
  (line 190 `ribbonOnly`) — that's new-listing's FIRST hero block (kicker:"New Listing",
  ribbon:true, nothing else). In the PDF this renders as a small plain caption line inside
  a normal section — no banner treatment at all. Not a crash, but a real visual divergence.
- new-listing's SECOND hero block sets `order:"label-first"` (address leads, price is styled
  as the accent number underneath — HeroBlock.tsx:61-138, "ADDRESS ABOVE PRICE" block comment)
  and `align:"center"`. PdfBlock's hero case has NO branch on `order` at all — it always prints
  in the fixed sequence kicker → value → label → prose, left-aligned. So in the PDF the ADDRESS
  (`label`) prints BELOW the price as a small muted caption, never above it as the display
  headline — the exact "address leads, price is the styled accent" layout the seed and the
  New Listing button (`buildListingFlyer`) were built to produce is INVERTED in the PDF. This
  is a real content-hierarchy bug in the PDF path, not merely a style nuance: the reader gets
  price-first / address-as-footnote, backwards from every other engine and from what
  `seed-recipe-parity.test.ts` pins for the seed vs button parity (that test doesn't touch PDF).

### stats block — PdfBlock "stats" case (email-doc-pdf.tsx:179-214)
Reads only `value`/`label` per cell, all cells same size/color, flex:1 row.
Does NOT read: `variant` ("strip" hairline spec-line styling), `footnote`, or `emphasis`
("primary"/"muted" — StatsBlock.tsx's whole "WHICH NUMBER MATTERS" mechanism, statRole()).
new-listing's stats block sets `footnote: "*Computed from list price ÷ listed square footage."`
and emphasizes `$/Sq Ft` (primary) + `Type` (muted). In the PDF: the footnote is SILENTLY
DROPPED (never printed anywhere) and every cell renders at identical size/color — the $/Sq Ft
figure that's supposed to visually "win the argument" (scale.ts / operator ruling 07/13) looks
exactly like the muted Type cell. Provenance text (the footnote, which states how a number was
derived) disappearing in the PDF is the same class of bug as `docs/standards/emails.md` §7's
07/19 entries — a fact that should always be visible silently vanishes in one specific engine.

### image block — PdfBlock "image" case (email-doc-pdf.tsx:290-314)
Reads only `url`/`caption`. Does NOT read: `kind`, `ratio` (ImageBlock.tsx's aspect-ratio crop,
lines 124-127), `overlayTitle`/`overlayBody`/`overlayTextColor`/`overlayBg`/`overlayAlign`
(ImageBlock.tsx:47-114, the whole magazine-issue-style text-over-photo mode), or `linkUrl`.
- new-listing's photo block sets `kind:"photo", ratio:"3:2"` — email/grid center-crop it to
  3:2; the PDF prints it "width:100%" with NO ratio constraint (uncropped, whatever aspect the
  source file is).
- Not exercised by new-listing, but the SAME PdfBlock case handles ALL seeds, including
  `magazine-issue` (image block with `overlayTitle:"The Issue"`, `overlayBody:"..."`) — that
  seed's masthead has NO overlay text at all in the PDF; if `url` is empty the PDF image case
  returns null outright (line 294) even though ImageBlock.tsx's `hasOverlay` branch (lines 24-29)
  deliberately KEEPS a URL-less overlay because it's "a DELIBERATE colored panel — it carries
  content, so it ships." The PDF drops that whole block.

## What this lane rules OUT
- Free-tier vs grid-tier parity: NOT a gap. Same BlockRenderer, same props, same fields,
  differing only in row/column HTML wrapping (compile-grid.ts) which is layout-only.
- The confirmed live bug in the task brief (no hero photo, no price/specs, generic ZIP email,
  mid-word cutoffs, chart-behind-headline garbling, mismatched ZIP) is NOT explained by
  anything in this lane — none of it is a free/grid/PDF rendering divergence. Those symptoms
  point upstream, at subject resolution / recipe dispatch / build-doc.ts (someone else's lane,
  per the task brief's file list) — the render engines never got real data to disagree over.
  This lane's finding is a REAL, separate, confirmed defect (PDF fidelity), not the reported bug.

## Root cause (for the finding)
lib/pdf/email-doc-pdf.tsx's PdfBlock switch is a hand-duplicated re-implementation of
HeroBlock/StatsBlock/ImageBlock instead of reusing them (as compile-grid.ts correctly does for
the grid tier) or at minimum reading the same discriminating props. Every time HeroBlock/
StatsBlock/ImageBlock gained a new field (ribbon, order, variant, footnote, emphasis, overlay*,
kind, ratio) the PDF's independent switch was never updated to match — and the audit test only
guards block-TYPE coverage, not field coverage, so nothing red-flags the drift.
